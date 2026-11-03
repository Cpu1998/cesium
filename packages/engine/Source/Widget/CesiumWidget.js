// ═══ 【导读】CesiumWidget.js —— 引擎层三维组件（engine 包）═══
// 【导读】CesiumWidget 是"能独立使用的最小三维地球"：创建 canvas/WebGL 上下文/Scene，
// 【导读】自带默认底图（ion 世界影像）、星空/大气/太阳/月亮、时钟与渲染循环，但不含任何 UI 部件。
// 【导读】Viewer（widgets 包）就是在它之上组装工具栏/时间轴等 UI。
// 【导读】主链路：function CesiumWidget() 构造 → new Scene()（真正建 WebGL）→ Globe/SkyBox/底图 →
// 【导读】→ DataSourceDisplay（Entity 可视化）→ startRenderLoop（requestAnimationFrame 帧循环）。
// 【导读】每帧骨架（CesiumWidget.prototype.render）：scene.initializeFrame → clock.tick → scene.render。
// 【导读】requestRenderMode 按需渲染的开关在 Scene 构造参数里（Scene.js 内部判断是否真的画帧）。
// 【导读】帧循环内部、Scene.render 的多 Pass 细节由第 5 棒深挖；Entity 体系由第 3 棒深挖。
// 【导读】深入解读见 study/01-Viewer创建与场景初始化.md；架构总览见 study/00-总览-架构与目录地图.md。
import BoundingSphere from "../Core/BoundingSphere.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Cartographic from "../Core/Cartographic.js";
import Clock from "../Core/Clock.js";
import Frozen from "../Core/Frozen.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import DeveloperError from "../Core/DeveloperError.js";
import Ellipsoid from "../Core/Ellipsoid.js";
import Event from "../Core/Event.js";
import EventHelper from "../Core/EventHelper.js";
import FeatureDetection from "../Core/FeatureDetection.js";
import formatError from "../Core/formatError.js";
import HeadingPitchRange from "../Core/HeadingPitchRange.js";
import Matrix4 from "../Core/Matrix4.js";
import BoundingSphereState from "../DataSources/BoundingSphereState.js";
import DataSourceCollection from "../DataSources/DataSourceCollection.js";
import DataSourceDisplay from "../DataSources/DataSourceDisplay.js";
import EntityView from "../DataSources/EntityView.js";
import getElement from "../DataSources/getElement.js";
import Property from "../DataSources/Property.js";
import Cesium3DTileset from "../Scene/Cesium3DTileset.js";
import computeFlyToLocationForRectangle from "../Scene/computeFlyToLocationForRectangle.js";
import Globe from "../Scene/Globe.js";
import ImageryLayer from "../Scene/ImageryLayer.js";
import Moon from "../Scene/Moon.js";
import Scene from "../Scene/Scene.js";
import SceneMode from "../Scene/SceneMode.js";
import ScreenSpaceEventHandler from "../Core/ScreenSpaceEventHandler.js";
import ShadowMode from "../Scene/ShadowMode.js";
import SkyAtmosphere from "../Scene/SkyAtmosphere.js";
import SkyBox from "../Scene/SkyBox.js";
import Sun from "../Scene/Sun.js";
import TimeDynamicPointCloud from "../Scene/TimeDynamicPointCloud.js";
import VoxelPrimitive from "../Scene/VoxelPrimitive.js";
import BufferPrimitiveCollection from "../Scene/BufferPrimitiveCollection.js";

// 【导读】把数据源自带的时钟（起止/倍速/当前时刻）拷贝进全局共享 clock。
function trackDataSourceClock(clock, dataSource) {
  if (defined(dataSource)) {
    const dataSourceClock = dataSource.clock;
    if (defined(dataSourceClock)) {
      dataSourceClock.getValue(clock);
    }
  }
}

// 【导读】渲染循环启动器：requestAnimationFrame 自循环；每帧 = resize + render。
// 【导读】targetFrameRate 未设时跟随浏览器刷新率；设了则按间隔丢帧节流。
// 【导读】渲染抛错时停循环（useDefaultRenderLoop=false）并弹错误面板。循环内部细节第 5 棒深挖。
function startRenderLoop(widget) {
  widget._renderLoopRunning = true;

  let lastFrameTime = 0;
  function render(frameTime) {
    // 【导读】widget 已销毁则直接遇出（requestAnimationFrame 回调还在队列里也会安全终止）。
    if (widget.isDestroyed()) {
      return;
    }

    if (widget._useDefaultRenderLoop) {
      try {
        const targetFrameRate = widget._targetFrameRate;
        if (!defined(targetFrameRate)) {
          widget.resize();
          widget.render();
          requestAnimationFrame(render);
        } else {
          const interval = 1000.0 / targetFrameRate;
          const delta = frameTime - lastFrameTime;

          if (delta > interval) {
            widget.resize();
            widget.render();
            lastFrameTime = frameTime - (delta % interval);
          }
          requestAnimationFrame(render);
        }
      } catch (error) {
        widget._useDefaultRenderLoop = false;
        widget._renderLoopRunning = false;
        if (widget._showRenderLoopErrors) {
          const title =
            "An error occurred while rendering.  Rendering has stopped.";
          widget.showErrorPanel(title, undefined, error);
        }
      }
    } else {
      widget._renderLoopRunning = false;
    }
  }

  requestAnimationFrame(render);
}

// 【导读】像素比策略：useBrowserRecommendedResolution=true 时忽略 devicePixelRatio（省电省 GPU），再乘 resolutionScale。
function configurePixelRatio(widget) {
  let pixelRatio = widget._useBrowserRecommendedResolution
    ? 1.0
    : window.devicePixelRatio;
  pixelRatio *= widget._resolutionScale;
  if (defined(widget._scene)) {
    widget._scene.pixelRatio = pixelRatio;
  }

  return pixelRatio;
}

// 【导读】按容器 CSS 尺寸×像素比设置 canvas 缓冲区大小；宽高为 0 时置 _canRender=false 阻止渲染。
function configureCanvasSize(widget) {
  const canvas = widget._canvas;
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  const pixelRatio = configurePixelRatio(widget);

  widget._canvasClientWidth = width;
  widget._canvasClientHeight = height;

  width *= pixelRatio;
  height *= pixelRatio;

  canvas.width = width;
  canvas.height = height;

  widget._canRender = width !== 0 && height !== 0;
  widget._lastDevicePixelRatio = window.devicePixelRatio;
}

// 【导读】同步相机视锥宽高比：透视相机改 frustum.aspectRatio，正交相机（2D）改 top/bottom。
function configureCameraFrustum(widget) {
  const canvas = widget._canvas;
  const width = canvas.width;
  const height = canvas.height;
  if (width !== 0 && height !== 0) {
    const frustum = widget._scene.camera.frustum;
    if (defined(frustum.aspectRatio)) {
      frustum.aspectRatio = width / height;
    } else {
      frustum.top = frustum.right * (height / width);
      frustum.bottom = -frustum.top;
    }
  }
}

/**
 * A widget containing a Cesium scene.
 *
 * @alias CesiumWidget
 * @constructor
 *
 * @param {Element|string} container The DOM element or ID that will contain the widget.
 * @param {object} [options] Object with the following properties:
 * @param {Clock} [options.clock=new Clock()] The clock to use to control current time.
 * @param {boolean} [options.shouldAnimate=false] <code>true</code> if the clock should attempt to advance simulation time by default, <code>false</code> otherwise.
 * @param {Ellipsoid} [options.ellipsoid=Ellipsoid.default] The default ellipsoid.
 * @param {ImageryLayer|false} [options.baseLayer=ImageryLayer.fromWorldImagery()] The bottommost imagery layer applied to the globe. If set to <code>false</code>, no imagery provider will be added.
 * @param {TerrainProvider} [options.terrainProvider=new EllipsoidTerrainProvider(options.ellipsoid)] The terrain provider.
 * @param {Terrain} [options.terrain] A terrain object which handles asynchronous terrain provider. Can only specify if options.terrainProvider is undefined.
 * @param {SkyBox| false} [options.skyBox] The skybox used to render the stars. When <code>undefined</code> and the WGS84 ellipsoid used, the default stars are used. If set to <code>false</code>, no skyBox, Sun, or Moon will be added.
 * @param {SkyAtmosphere | false} [options.skyAtmosphere] Blue sky, and the glow around the Earth's limb. Enabled when the default ellipsoid used. Set to <code>false</code> to turn it off.
 * @param {SceneMode} [options.sceneMode=SceneMode.SCENE3D] The initial scene mode.
 * @param {boolean} [options.scene3DOnly=false] When <code>true</code>, each geometry instance will only be rendered in 3D to save GPU memory.
 * @param {boolean} [options.orderIndependentTranslucency=true] If true and the configuration supports it, use order independent translucency.
 * @param {MapProjection} [options.mapProjection=new GeographicProjection(options.ellipsoid)] The map projection to use in 2D and Columbus View modes.
 * @param {Globe | false} [options.globe=new Globe(options.ellipsoid)] The globe to use in the scene.  If set to <code>false</code>, no globe will be added and the sky atmosphere will be hidden by default.
 * @param {boolean} [options.useDefaultRenderLoop=true] True if this widget should control the render loop, false otherwise.
 * @param {boolean} [options.useBrowserRecommendedResolution=true] If true, render at the browser's recommended resolution and ignore <code>window.devicePixelRatio</code>.
 * @param {number} [options.targetFrameRate] The target frame rate when using the default render loop.
 * @param {boolean} [options.showRenderLoopErrors=true] If true, this widget will automatically display an HTML panel to the user containing the error, if a render loop error occurs.
 * @param {boolean} [options.automaticallyTrackDataSourceClocks=true] If true, this widget will automatically track the clock settings of newly added DataSources, updating if the DataSource's clock changes.  Set this to false if you want to configure the clock independently.
 * @param {ContextOptions} [options.contextOptions] Context and WebGL creation properties passed to {@link Scene}.
 * @param {Element|string} [options.creditContainer] The DOM element or ID that will contain the {@link CreditDisplay}.  If not specified, the credits are added
 *        to the bottom of the widget itself.
 * @param {Element|string} [options.creditViewport] The DOM element or ID that will contain the credit pop up created by the {@link CreditDisplay}.  If not specified, it will appear over the widget itself.
 * @param {DataSourceCollection} [options.dataSources=new DataSourceCollection()] The collection of data sources visualized by the widget.  If this parameter is provided,
 *                               the instance is assumed to be owned by the caller and will not be destroyed when the widget is destroyed.
 * @param {boolean} [options.shadows=false] Determines if shadows are cast by light sources.
 * @param {ShadowMode} [options.terrainShadows=ShadowMode.RECEIVE_ONLY] Determines if the terrain casts or receives shadows from light sources.
 * @param {MapMode2D} [options.mapMode2D=MapMode2D.INFINITE_SCROLL] Determines if the 2D map is rotatable or can be scrolled infinitely in the horizontal direction.
 * @param {boolean} [options.blurActiveElementOnCanvasFocus=true] If true, the active element will blur when the widget's canvas is clicked. Setting this to false is useful for cases when the canvas is clicked only for retrieving position or an entity data without actually meaning to set the canvas to be the active element.
 * @param {boolean} [options.requestRenderMode=false] If true, rendering a frame will only occur when needed as determined by changes within the scene. Enabling improves performance of the application, but requires using {@link Scene#requestRender} to render a new frame explicitly in this mode. This will be necessary in many cases after making changes to the scene in other parts of the API. See {@link https://cesium.com/blog/2018/01/24/cesium-scene-rendering-performance/|Improving Performance with Explicit Rendering}.
 * @param {number} [options.maximumRenderTimeChange=0.0] If requestRenderMode is true, this value defines the maximum change in simulation time allowed before a render is requested. See {@link https://cesium.com/blog/2018/01/24/cesium-scene-rendering-performance/|Improving Performance with Explicit Rendering}.
 * @param {number} [options.msaaSamples=4] If provided, this value controls the rate of multisample antialiasing. Typical multisampling rates are 2, 4, and sometimes 8 samples per pixel. Higher sampling rates of MSAA may impact performance in exchange for improved visual quality. This value only applies to WebGL2 contexts that support multisample render targets. Set to 1 to disable MSAA.
 *
 * @exception {DeveloperError} Element with id "container" does not exist in the document.
 *
 * @demo {@link https://sandcastle.cesium.com/index.html?id=cesium-widget|Cesium Sandcastle Cesium Widget Demo}
 *
 * @example
 * // For each example, include a link to CesiumWidget.css stylesheet in HTML head,
 * // and in the body, include: <div id="cesiumContainer"></div>
 *
 * // Widget with no terrain and default Bing Maps imagery provider.
 * const widget = new Cesium.CesiumWidget("cesiumContainer");
 *
 * // Widget with ion imagery and Cesium World Terrain.
 * const widget2 = new Cesium.CesiumWidget("cesiumContainer", {
 *     baseLayer: Cesium.ImageryLayer.fromWorldTerrain(),
 *     terrain: Cesium.Terrain.fromWorldTerrain()
 *     skyBox: new Cesium.SkyBox({
 *       sources: {
 *         positiveX: "stars/TychoSkymapII.t3_08192x04096_80_px.jpg",
 *         negativeX: "stars/TychoSkymapII.t3_08192x04096_80_mx.jpg",
 *         positiveY: "stars/TychoSkymapII.t3_08192x04096_80_py.jpg",
 *         negativeY: "stars/TychoSkymapII.t3_08192x04096_80_my.jpg",
 *         positiveZ: "stars/TychoSkymapII.t3_08192x04096_80_pz.jpg",
 *         negativeZ: "stars/TychoSkymapII.t3_08192x04096_80_mz.jpg"
 *       }
 *     }),
 *     // Show Columbus View map with Web Mercator projection
 *     sceneMode: Cesium.SceneMode.COLUMBUS_VIEW,
 *     mapProjection: new Cesium.WebMercatorProjection()
 * });
 */
// 【导读】CesiumWidget 构造全流程（逐段注释）：DOM/canvas → 字段初始化 → 时钟 → canvas 尺寸 →
// 【导读】new Scene（WebGL 上下文在这里诞生）→ Globe/星空/大气/默认底图/地形 → 输入处理 →
// 【导读】启动渲染循环 → DataSourceDisplay/事件接线。构造失败（如 WebGL 不可用）弹面板并重抛异常。
function CesiumWidget(container, options) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(container)) {
    throw new DeveloperError("container is required.");
  }
  //>>includeEnd('debug');

  container = getElement(container);

  options = options ?? Frozen.EMPTY_OBJECT;

  //Configure the widget DOM elements
  // 【导读】DOM 两层：cesium-widget(根 div) + 内部 canvas；版权条默认也挂在根 div 下（可由 creditContainer 重定向）。
  const element = document.createElement("div");
  element.className = "cesium-widget";
  container.appendChild(element);

  // 【导读】创建渲染主画布：禁右键菜单/禁选中；支持 image-rendering:pixelated 优化低分辨率放大。
  const canvas = document.createElement("canvas");
  const supportsImageRenderingPixelated =
    FeatureDetection.supportsImageRenderingPixelated();
  this._supportsImageRenderingPixelated = supportsImageRenderingPixelated;
  if (supportsImageRenderingPixelated) {
    canvas.style.imageRendering = FeatureDetection.imageRenderingValue();
  }

  canvas.oncontextmenu = function () {
    return false;
  };
  canvas.onselectstart = function () {
    return false;
  };

  // Interacting with a canvas does not automatically blur the previously focused element.
  // This leads to unexpected interaction if the last element was an input field.
  // For example, clicking the mouse wheel could lead to the value in  the field changing
  // unexpectedly. The solution is to blur whatever has focus as soon as canvas interaction begins.
  // Although in some cases the active element needs to stay active even after interacting with the canvas,
  // for example when clicking on it only for getting the data of a clicked position or an entity.
  // For this case, the `blurActiveElementOnCanvasFocus` can be passed with false to avoid blurring
  // the active element after interacting with the canvas.
  function blurActiveElement() {
    if (canvas !== canvas.ownerDocument.activeElement) {
      canvas.ownerDocument.activeElement.blur();
    }
  }

  const blurActiveElementOnCanvasFocus =
    options.blurActiveElementOnCanvasFocus ?? true;

  if (blurActiveElementOnCanvasFocus) {
    canvas.addEventListener("mousedown", blurActiveElement);
    canvas.addEventListener("pointerdown", blurActiveElement);
  }

  element.appendChild(canvas);

  const innerCreditContainer = document.createElement("div");
  innerCreditContainer.className = "cesium-widget-credits";

  const creditContainer = defined(options.creditContainer)
    ? getElement(options.creditContainer)
    : element;
  creditContainer.appendChild(innerCreditContainer);

  const creditViewport = defined(options.creditViewport)
    ? getElement(options.creditViewport)
    : element;

  const showRenderLoopErrors = options.showRenderLoopErrors ?? true;

  const useBrowserRecommendedResolution =
    options.useBrowserRecommendedResolution ?? true;

  // 【导读】实例字段初始化：缩放/跟踪/zoom 状态机（_zoomTarget/_zoomPromise 延迟到 postRender 完成）。
  this._element = element;
  this._container = container;
  this._canvas = canvas;
  this._canvasClientWidth = 0;
  this._canvasClientHeight = 0;
  this._lastDevicePixelRatio = 0;
  this._creditViewport = creditViewport;
  this._creditContainer = creditContainer;
  this._innerCreditContainer = innerCreditContainer;
  this._canRender = false;
  this._renderLoopRunning = false;
  this._showRenderLoopErrors = showRenderLoopErrors;
  this._resolutionScale = 1.0;
  this._useBrowserRecommendedResolution = useBrowserRecommendedResolution;
  this._forceResize = false;
  this._entityView = undefined;
  this._clockTrackedDataSource = undefined;
  this._trackedEntity = undefined;
  this._needTrackedEntityUpdate = false;
  this._zoomIsFlight = false;
  this._zoomTarget = undefined;
  this._zoomPromise = undefined;
  this._zoomOptions = undefined;
  this._trackedEntityChanged = new Event();
  this._allowDataSourcesToSuspendAnimation = true;

  // 【导读】时钟：Viewer 会把它的 clock 传进来共享；shouldAnimate 决定时间是否自动流逝（动画总开关）。
  this._clock = defined(options.clock) ? options.clock : new Clock();

  if (defined(options.shouldAnimate)) {
    this._clock.shouldAnimate = options.shouldAnimate;
  }

  // 【导读】先按容器尺寸初始化 canvas 缓冲区（注意：必须在创建 Scene 前完成，否则首帧尺寸不对）。
  configureCanvasSize(this);

  try {
    // 【导读】创建 Scene：Cesium 渲染世界的根对象，WebGL 上下文在 Scene 构造里创建；
    // 【导读】requestRenderMode/msaaSamples/shadows 等渲染参数都透传给 Scene。
    const ellipsoid = options.ellipsoid ?? Ellipsoid.default;

    const scene = new Scene({
      canvas: canvas,
      contextOptions: options.contextOptions,
      creditContainer: innerCreditContainer,
      creditViewport: creditViewport,
      ellipsoid: ellipsoid,
      mapProjection: options.mapProjection,
      orderIndependentTranslucency: options.orderIndependentTranslucency,
      scene3DOnly: options.scene3DOnly ?? false,
      shadows: options.shadows,
      mapMode2D: options.mapMode2D,
      requestRenderMode: options.requestRenderMode,
      maximumRenderTimeChange: options.maximumRenderTimeChange,
      depthPlaneEllipsoidOffset: options.depthPlaneEllipsoidOffset,
      msaaSamples: options.msaaSamples,
    });
    this._scene = scene;

    // 【导读】限制相机不能绕 Z 轴任意滚转（保持"北上"习惯）；随后同步像素比与视锥宽高比。
    scene.camera.constrainedAxis = Cartesian3.UNIT_Z;

    configurePixelRatio(this);
    configureCameraFrustum(this);

    let globe = options.globe;
    // 【导读】地球本体：默认 new Globe(ellipsoid)；传 false 则无地球（此时也不加底图/大气）；
    // 【导读】terrainShadows 控制地形接收/投射阴影。地形加载调度在 Globe/地形体系（第 2 棒涉及）。
    if (!defined(globe)) {
      globe = new Globe(ellipsoid);
    }
    if (globe !== false) {
      scene.globe = globe;
      scene.globe.shadows = options.terrainShadows ?? ShadowMode.RECEIVE_ONLY;
    }

    let skyBox = options.skyBox;
    // 【导读】天空盒：仅在默认 WGS84 椭球下自动建星空+太阳+月亮；传 false 全关（纯净模式）。
    if (!defined(skyBox) && Ellipsoid.WGS84.equals(ellipsoid)) {
      skyBox = SkyBox.createEarthSkyBox();
    }
    if (skyBox !== false) {
      scene.skyBox = skyBox;
      scene.sun = new Sun();

      if (Ellipsoid.WGS84.equals(ellipsoid)) {
        scene.moon = new Moon();
      }
    }

    // Blue sky, and the glow around the Earth's limb.
    // 【导读】大气层辉光：同样仅 WGS84 下默认开启；globe 关闭时 show=false（没地球就没大气）。
    let skyAtmosphere = options.skyAtmosphere;
    if (!defined(skyAtmosphere) && Ellipsoid.WGS84.equals(ellipsoid)) {
      skyAtmosphere = new SkyAtmosphere(ellipsoid);
      skyAtmosphere.show = options.globe !== false && globe.show;
    }
    if (skyAtmosphere !== false) {
      scene.skyAtmosphere = skyAtmosphere;
    }

    // Set the base imagery layer
    // 【导读】默认底图：未传 baseLayer 时用 ImageryLayer.fromWorldImagery()（ion 在线世界影像）；
    // 【导读】底图作为一个普通 ImageryLayer 加进 scene.imageryLayers 最底层（影像管线第 2 棒深挖）。
    // 【导读】链路去向（第 2 棒已注）：ImageryLayerCollection.add→_update 标记基底层→
    // 【导读】GlobeSurfaceTileProvider._onLayerAdded 为全部地形瓦片建 TileImagery 骨架→_requestImagery 拉瓦片→上屏。
    // 【导读】详见 study/02-底图与影像体系.md §1/§3。
    let baseLayer = options.baseLayer;
    if (options.globe !== false && baseLayer !== false) {
      if (!defined(baseLayer)) {
        baseLayer = ImageryLayer.fromWorldImagery();
      }
      scene.imageryLayers.add(baseLayer);
    }

    // Set the terrain provider if one is provided.
    // 【导读】同步式地形：直接赋 scene.terrainProvider；异步 Terrain 对象则走 scene.setTerrain（与 Viewer 同名分支互斥）。
    if (defined(options.terrainProvider) && options.globe !== false) {
      scene.terrainProvider = options.terrainProvider;
    }

    if (defined(options.terrain) && options.globe !== false) {
      //>>includeStart('debug', pragmas.debug);
      if (defined(options.terrainProvider)) {
        throw new DeveloperError(
          "Specify either options.terrainProvider or options.terrain.",
        );
      }
      //>>includeEnd('debug');

      scene.setTerrain(options.terrain);
    }

    // 【导读】屏幕输入处理器：鼠标/触摸事件规范化（后续相机控制与拾取都基于它）。
    this._screenSpaceEventHandler = new ScreenSpaceEventHandler(canvas);

    if (defined(options.sceneMode)) {
      if (options.sceneMode === SceneMode.SCENE2D) {
        this._scene.morphTo2D(0);
      }
      if (options.sceneMode === SceneMode.COLUMBUS_VIEW) {
        this._scene.morphToColumbusView(0);
      }
    }

    // 【导读】启动渲染循环：先置 undefined 再赋值，确保一定经过 setter→startRenderLoop（默认 true）。
    // 【导读】这是构造函数里"第一帧开始动起来"的时刻点。
    this._useDefaultRenderLoop = undefined;
    this.useDefaultRenderLoop = options.useDefaultRenderLoop ?? true;

    this._targetFrameRate = undefined;
    this.targetFrameRate = options.targetFrameRate;

    // 【导读】渲染错误兜底：Scene.render 抛错时停循环并弹错误面板（showRenderLoopErrors 可关）。
    const that = this;
    this._onRenderError = function (scene, error) {
      that._useDefaultRenderLoop = false;
      that._renderLoopRunning = false;
      if (that._showRenderLoopErrors) {
        const title =
          "An error occurred while rendering.  Rendering has stopped.";
        that.showErrorPanel(title, undefined, error);
      }
    };
    scene.renderError.addEventListener(this._onRenderError);

    // 【导读】外部可注入共享的 DataSourceCollection（此时销毁 widget 不负责销毁它）。
    let dataSourceCollection = options.dataSources;
    let destroyDataSourceCollection = false;
    if (!defined(dataSourceCollection)) {
      dataSourceCollection = new DataSourceCollection();
      destroyDataSourceCollection = true;
    }

    // 【导读】DataSourceDisplay：把 Entity（声明式数据）变成可视化 Primitive（可渲染对象）的中枢（第 3 棒深挖）。
    const dataSourceDisplay = new DataSourceDisplay({
      scene: scene,
      dataSourceCollection: dataSourceCollection,
    });

    const eventHelper = new EventHelper();
    this._dataSourceChangedListeners = {};
    this._automaticallyTrackDataSourceClocks =
      options.automaticallyTrackDataSourceClocks ?? true;

    this._dataSourceCollection = dataSourceCollection;
    this._destroyDataSourceCollection = destroyDataSourceCollection;
    this._dataSourceDisplay = dataSourceDisplay;
    this._eventHelper = eventHelper;
    this._canAnimateUpdateCallback = this._updateCanAnimate;

    eventHelper.add(this._clock.onTick, CesiumWidget.prototype._onTick, this);
    // 【导读】场景形变（3D↔2D↔哥伦布）开始时取消跟踪实体，避免相机约束冲突。
    eventHelper.add(
      scene.morphStart,
      CesiumWidget.prototype._clearTrackedObject,
      this,
    );

    //Listen to data source events in order to track clock changes.
    eventHelper.add(
      dataSourceCollection.dataSourceAdded,
      CesiumWidget.prototype._onDataSourceAdded,
      this,
    );
    eventHelper.add(
      dataSourceCollection.dataSourceRemoved,
      CesiumWidget.prototype._onDataSourceRemoved,
      this,
    );

    // 【导读】每帧渲染完成后回调 _postRender：在这里等包围球就绪并完成 zoomTo/跟踪实体的收尾（延迟到帧尾避免半成品画面）。
    eventHelper.add(scene.postRender, CesiumWidget.prototype._postRender, this);

    // We need to subscribe to the data sources and collections so that we can clear the
    // tracked object when it is removed from the scene.
    // Subscribe to current data sources
    const dataSourceLength = dataSourceCollection.length;
    for (let i = 0; i < dataSourceLength; i++) {
      this._dataSourceAdded(dataSourceCollection, dataSourceCollection.get(i));
    }
    this._dataSourceAdded(undefined, dataSourceDisplay.defaultDataSource);

    // Hook up events so that we can subscribe to future sources.
    eventHelper.add(
      dataSourceCollection.dataSourceAdded,
      CesiumWidget.prototype._dataSourceAdded,
      this,
    );
    eventHelper.add(
      dataSourceCollection.dataSourceRemoved,
      CesiumWidget.prototype._dataSourceRemoved,
      this,
    );
  } catch (error) {
    // 【导读】构造失败（常见：浏览器/显卡不支持 WebGL）时弹错误面板并把异常重抛给调用方。
    if (showRenderLoopErrors) {
      const title = "Error constructing CesiumWidget.";
      const message =
        'Visit <a href="http://get.webgl.org">http://get.webgl.org</a> to verify that your web browser and hardware support WebGL.  Consider trying a different web browser or updating your video drivers.  Detailed error information is below:';
      this.showErrorPanel(title, message, error);
    }
    throw error;
  }
}

// 【导读】属性层：container/canvas/scene/camera/clock 等真实对象全部来自 Scene/DataSourceDisplay；
// 【导读】仅分辨率/帧率/跟踪/缩放等少量状态由 widget 自己持有。
Object.defineProperties(CesiumWidget.prototype, {
  /**
   * Gets the parent container.
   * @memberof CesiumWidget.prototype
   *
   * @type {Element}
   * @readonly
   */
  container: {
    get: function () {
      return this._container;
    },
  },

  /**
   * Gets the canvas.
   * @memberof CesiumWidget.prototype
   *
   * @type {HTMLCanvasElement}
   * @readonly
   */
  canvas: {
    get: function () {
      return this._canvas;
    },
  },

  /**
   * Gets the credit container.
   * @memberof CesiumWidget.prototype
   *
   * @type {Element}
   * @readonly
   */
  creditContainer: {
    get: function () {
      return this._creditContainer;
    },
  },

  /**
   * Gets the credit viewport
   * @memberof CesiumWidget.prototype
   *
   * @type {Element}
   * @readonly
   */
  creditViewport: {
    get: function () {
      return this._creditViewport;
    },
  },

  /**
   * Gets the scene.
   * @memberof CesiumWidget.prototype
   *
   * @type {Scene}
   * @readonly
   */
  scene: {
    get: function () {
      return this._scene;
    },
  },

  /**
   * Gets the collection of image layers that will be rendered on the globe.
   * @memberof CesiumWidget.prototype
   *
   * @type {ImageryLayerCollection}
   * @readonly
   */
  imageryLayers: {
    get: function () {
      return this._scene.imageryLayers;
    },
  },

  /**
   * The terrain provider providing surface geometry for the globe.
   * @memberof CesiumWidget.prototype
   *
   * @type {TerrainProvider}
   */
  terrainProvider: {
    get: function () {
      return this._scene.terrainProvider;
    },
    set: function (terrainProvider) {
      this._scene.terrainProvider = terrainProvider;
    },
  },

  /**
   * Manages the list of credits to display on screen and in the lightbox.
   * @memberof CesiumWidget.prototype
   *
   * @type {CreditDisplay}
   */
  creditDisplay: {
    get: function () {
      return this._scene.frameState.creditDisplay;
    },
  },

  /**
   * Gets the display used for {@link DataSource} visualization.
   * @memberof CesiumWidget.prototype
   * @type {DataSourceDisplay}
   * @readonly
   */
  dataSourceDisplay: {
    get: function () {
      return this._dataSourceDisplay;
    },
  },

  /**
   * Gets the collection of entities not tied to a particular data source.
   * This is a shortcut to [dataSourceDisplay.defaultDataSource.entities]{@link CesiumWidget#dataSourceDisplay}.
   * @memberof CesiumWidget.prototype
   * @type {EntityCollection}
   * @readonly
   */
  entities: {
    get: function () {
      return this._dataSourceDisplay.defaultDataSource.entities;
    },
  },

  /**
   * Gets the set of {@link DataSource} instances to be visualized.
   * @memberof CesiumWidget.prototype
   * @type {DataSourceCollection}
   * @readonly
   */
  dataSources: {
    get: function () {
      return this._dataSourceCollection;
    },
  },

  /**
   * Gets the camera.
   * @memberof CesiumWidget.prototype
   *
   * @type {Camera}
   * @readonly
   */
  camera: {
    get: function () {
      return this._scene.camera;
    },
  },

  /**
   * Gets the default ellipsoid for the scene.
   * @memberof CesiumWidget.prototype
   *
   * @type {Ellipsoid}
   * @readonly
   */
  ellipsoid: {
    get: function () {
      return this._scene.ellipsoid;
    },
  },

  /**
   * Gets the clock.
   * @memberof CesiumWidget.prototype
   *
   * @type {Clock}
   * @readonly
   */
  clock: {
    get: function () {
      return this._clock;
    },
  },

  /**
   * Gets the screen space event handler.
   * @memberof CesiumWidget.prototype
   *
   * @type {ScreenSpaceEventHandler}
   * @readonly
   */
  screenSpaceEventHandler: {
    get: function () {
      return this._screenSpaceEventHandler;
    },
  },

  /**
   * Gets or sets the target frame rate of the widget when <code>useDefaultRenderLoop</code>
   * is true. If undefined, the browser's requestAnimationFrame implementation
   * determines the frame rate.  If defined, this value must be greater than 0.  A value higher
   * than the underlying requestAnimationFrame implementation will have no effect.
   * @memberof CesiumWidget.prototype
   *
   * @type {number}
   */
  targetFrameRate: {
    get: function () {
      return this._targetFrameRate;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      if (value <= 0) {
        throw new DeveloperError(
          "targetFrameRate must be greater than 0, or undefined.",
        );
      }
      //>>includeEnd('debug');
      this._targetFrameRate = value;
    },
  },

  /**
   * Gets or sets whether or not this widget should control the render loop.
   * If true the widget will use requestAnimationFrame to
   * perform rendering and resizing of the widget, as well as drive the
   * simulation clock. If set to false, you must manually call the
   * <code>resize</code>, <code>render</code> methods as part of a custom
   * render loop.  If an error occurs during rendering, {@link Scene}'s
   * <code>renderError</code> event will be raised and this property
   * will be set to false.  It must be set back to true to continue rendering
   * after the error.
   * @memberof CesiumWidget.prototype
   *
   * @type {boolean}
   */
  useDefaultRenderLoop: {
    get: function () {
      return this._useDefaultRenderLoop;
    },
    set: function (value) {
      // 【导读】帧循环总开关 setter：从 false→true 且循环未跑时立即 startRenderLoop（构造时赋默认值也走这里）。
      if (this._useDefaultRenderLoop !== value) {
        this._useDefaultRenderLoop = value;
        if (value && !this._renderLoopRunning) {
          startRenderLoop(this);
        }
      }
    },
  },

  /**
   * Gets or sets a scaling factor for rendering resolution.  Values less than 1.0 can improve
   * performance on less powerful devices while values greater than 1.0 will render at a higher
   * resolution and then scale down, resulting in improved visual fidelity.
   * For example, if the widget is laid out at a size of 640x480, setting this value to 0.5
   * will cause the scene to be rendered at 320x240 and then scaled up while setting
   * it to 2.0 will cause the scene to be rendered at 1280x960 and then scaled down.
   * @memberof CesiumWidget.prototype
   *
   * @type {number}
   * @default 1.0
   */
  resolutionScale: {
    get: function () {
      return this._resolutionScale;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      if (value <= 0) {
        throw new DeveloperError("resolutionScale must be greater than 0.");
      }
      //>>includeEnd('debug');
      if (this._resolutionScale !== value) {
        this._resolutionScale = value;
        this._forceResize = true;
      }
    },
  },

  /**
   * Boolean flag indicating if the browser's recommended resolution is used.
   * If true, the browser's device pixel ratio is ignored and 1.0 is used instead,
   * effectively rendering based on CSS pixels instead of device pixels. This can improve
   * performance on less powerful devices that have high pixel density. When false, rendering
   * will be in device pixels. {@link CesiumWidget#resolutionScale} will still take effect whether
   * this flag is true or false.
   * @memberof CesiumWidget.prototype
   *
   * @type {boolean}
   * @default true
   */
  useBrowserRecommendedResolution: {
    get: function () {
      return this._useBrowserRecommendedResolution;
    },
    set: function (value) {
      if (this._useBrowserRecommendedResolution !== value) {
        this._useBrowserRecommendedResolution = value;
        this._forceResize = true;
      }
    },
  },

  /**
   * Gets or sets whether or not data sources can temporarily pause
   * animation in order to avoid showing an incomplete picture to the user.
   * For example, if asynchronous primitives are being processed in the
   * background, the clock will not advance until the geometry is ready.
   *
   * @memberof CesiumWidget.prototype
   *
   * @type {boolean}
   */
  allowDataSourcesToSuspendAnimation: {
    get: function () {
      return this._allowDataSourcesToSuspendAnimation;
    },
    set: function (value) {
      this._allowDataSourcesToSuspendAnimation = value;
    },
  },

  /**
   * Gets or sets the Entity instance currently being tracked by the camera.
   * @memberof CesiumWidget.prototype
   * @type {Entity | undefined}
   */
  trackedEntity: {
    get: function () {
      return this._trackedEntity;
    },
    set: function (value) {
      // 【导读】跟踪实体 setter：取消在途 zoom；新目标有位置则置延迟标志（等包围球就绪后在 postRender 真正开始跟踪），
      // 【导读】取消跟踪时解锁平移/倾斜限制并复位相机变换矩阵。
      if (this._trackedEntity !== value) {
        this._trackedEntity = value;

        //Cancel any pending zoom
        cancelZoom(this);

        const scene = this.scene;
        const sceneMode = scene.mode;

        //Stop tracking
        if (!defined(value) || !defined(value.position)) {
          this._needTrackedEntityUpdate = false;
          if (
            sceneMode === SceneMode.COLUMBUS_VIEW ||
            sceneMode === SceneMode.SCENE2D
          ) {
            scene.screenSpaceCameraController.enableTranslate = true;
          }

          if (
            sceneMode === SceneMode.COLUMBUS_VIEW ||
            sceneMode === SceneMode.SCENE3D
          ) {
            scene.screenSpaceCameraController.enableTilt = true;
          }

          this._entityView = undefined;
          this.camera.lookAtTransform(Matrix4.IDENTITY);
        } else {
          //We can't start tracking immediately, so we set a flag and start tracking
          //when the bounding sphere is ready (most likely next frame).
          this._needTrackedEntityUpdate = true;
        }

        this._trackedEntityChanged.raiseEvent(value);
        this.scene.requestRender();
      }
    },
  },

  /**
   * Gets the event that is raised when the tracked entity changes.
   * @memberof CesiumWidget.prototype
   * @type {Event}
   * @readonly
   */
  trackedEntityChanged: {
    get: function () {
      return this._trackedEntityChanged;
    },
  },

  /**
   * Gets or sets the data source to track with the widget's clock.
   * @memberof CesiumWidget.prototype
   * @type {DataSource}
   */
  clockTrackedDataSource: {
    get: function () {
      return this._clockTrackedDataSource;
    },
    set: function (value) {
      if (this._clockTrackedDataSource !== value) {
        this._clockTrackedDataSource = value;
        trackDataSourceClock(this.clock, value);
      }
    },
  },
});

/**
 * Show an error panel to the user containing a title and a longer error message,
 * which can be dismissed using an OK button.  This panel is displayed automatically
 * when a render loop error occurs, if showRenderLoopErrors was not false when the
 * widget was constructed.
 *
 * @param {string} title The title to be displayed on the error panel.  This string is interpreted as text.
 * @param {string} [message] A helpful, user-facing message to display prior to the detailed error information.  This string is interpreted as HTML.
 * @param {string} [error] The error to be displayed on the error panel.  This string is formatted using {@link formatError} and then displayed as text.
 */
// 【导读】渲染/构造错误的 HTML 面板（标题+详情+OK），支持展开完整堆栈。
CesiumWidget.prototype.showErrorPanel = function (title, message, error) {
  const element = this._element;
  const overlay = document.createElement("div");
  overlay.className = "cesium-widget-errorPanel";

  const content = document.createElement("div");
  content.className = "cesium-widget-errorPanel-content";
  overlay.appendChild(content);

  const errorHeader = document.createElement("div");
  errorHeader.className = "cesium-widget-errorPanel-header";
  errorHeader.appendChild(document.createTextNode(title));
  content.appendChild(errorHeader);

  const errorPanelScroller = document.createElement("div");
  errorPanelScroller.className = "cesium-widget-errorPanel-scroll";
  content.appendChild(errorPanelScroller);
  function resizeCallback() {
    errorPanelScroller.style.maxHeight = `${Math.max(
      Math.round(element.clientHeight * 0.9 - 100),
      30,
    )}px`;
  }
  resizeCallback();
  if (defined(window.addEventListener)) {
    window.addEventListener("resize", resizeCallback, false);
  }

  const hasMessage = defined(message);
  const hasError = defined(error);

  if (hasMessage || hasError) {
    const errorMessage = document.createElement("div");
    errorMessage.className = "cesium-widget-errorPanel-message";
    errorPanelScroller.appendChild(errorMessage);

    if (hasError) {
      let errorDetails = formatError(error);
      if (!hasMessage) {
        if (typeof error === "string") {
          error = new Error(error);
        }

        message = formatError({
          name: error.name,
          message: error.message,
        });
        errorDetails = error.stack;
      }

      //IE8 does not have a console object unless the dev tools are open.
      if (typeof console !== "undefined") {
        console.error(`${title}\n${message}\n${errorDetails}`);
      }

      const errorMessageDetails = document.createElement("div");
      errorMessageDetails.className =
        "cesium-widget-errorPanel-message-details collapsed";

      const moreDetails = document.createElement("span");
      moreDetails.className = "cesium-widget-errorPanel-more-details";
      moreDetails.appendChild(document.createTextNode("See more..."));
      errorMessageDetails.appendChild(moreDetails);

      errorMessageDetails.onclick = function (e) {
        errorMessageDetails.removeChild(moreDetails);
        errorMessageDetails.appendChild(document.createTextNode(errorDetails));
        errorMessageDetails.className =
          "cesium-widget-errorPanel-message-details";
        content.className = "cesium-widget-errorPanel-content expanded";
        errorMessageDetails.onclick = undefined;
      };

      errorPanelScroller.appendChild(errorMessageDetails);
    }

    errorMessage.innerHTML = `<p>${message}</p>`;
  }

  const buttonPanel = document.createElement("div");
  buttonPanel.className = "cesium-widget-errorPanel-buttonPanel";
  content.appendChild(buttonPanel);

  const okButton = document.createElement("button");
  okButton.setAttribute("type", "button");
  okButton.className = "cesium-button";
  okButton.appendChild(document.createTextNode("OK"));
  okButton.onclick = function () {
    if (defined(resizeCallback) && defined(window.removeEventListener)) {
      window.removeEventListener("resize", resizeCallback, false);
    }
    element.removeChild(overlay);
  };

  buttonPanel.appendChild(okButton);

  element.appendChild(overlay);
};

/**
 * @returns {boolean} true if the object has been destroyed, false otherwise.
 */
CesiumWidget.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the widget.  Should be called if permanently
 * removing the widget from layout.
 */
// 【导读】销毁：逐个解除数据源监听→销毁 DataSourceDisplay/Scene（释放 WebGL 资源）→移除 DOM→EventHelper 解绑。
CesiumWidget.prototype.destroy = function () {
  // Unsubscribe from data sources
  const dataSources = this.dataSources;
  const dataSourceLength = dataSources.length;
  for (let i = 0; i < dataSourceLength; i++) {
    this._dataSourceRemoved(dataSources, dataSources.get(i));
  }
  this._dataSourceRemoved(undefined, this._dataSourceDisplay.defaultDataSource);

  this._dataSourceDisplay = this._dataSourceDisplay.destroy();

  if (defined(this._scene)) {
    this._scene.renderError.removeEventListener(this._onRenderError);
    this._scene = this._scene.destroy();
  }
  this._container.removeChild(this._element);
  this._creditContainer.removeChild(this._innerCreditContainer);

  this._eventHelper.removeAll();

  if (this._destroyDataSourceCollection) {
    this._dataSourceCollection = this._dataSourceCollection.destroy();
  }

  destroyObject(this);
};

/**
 * Updates the canvas size, camera aspect ratio, and viewport size.
 * This function is called automatically as needed unless
 * <code>useDefaultRenderLoop</code> is set to false.
 */
// 【导读】尺寸自适应：容器 CSS 尺寸/设备像素比任一变化时重设 canvas 缓冲区与相机视锥，并 requestRender 一帧。
CesiumWidget.prototype.resize = function () {
  const canvas = this._canvas;
  if (
    !this._forceResize &&
    this._canvasClientWidth === canvas.clientWidth &&
    this._canvasClientHeight === canvas.clientHeight &&
    this._lastDevicePixelRatio === window.devicePixelRatio
  ) {
    return;
  }
  this._forceResize = false;

  configureCanvasSize(this);
  configureCameraFrustum(this);

  this._scene.requestRender();
};

/**
 * Renders the scene.  This function is called automatically
 * unless <code>useDefaultRenderLoop</code> is set to false;
 */
// 【导读】一帧的骨架（第 5 棒深挖 Scene.render 内部）：
// 【导读】① scene.initializeFrame：帧前清理（着色器/纹理缓存、tween、高度回调等）；
// 【导读】② clock.tick：推进仿真时间并广播 onTick（驱动 DataSourceDisplay.update/跟踪相机）；
// 【导读】③ scene.render(time)：更新相机→执行各渲染 Pass→提交 WebGL 命令（requestRenderMode 在此内部判断是否真画）。
CesiumWidget.prototype.render = function () {
  if (this._canRender) {
    this._scene.initializeFrame();
    const currentTime = this._clock.tick();
    this._scene.render(currentTime);
  } else {
    this._clock.tick();
  }
};

/**
 * @private
 */
CesiumWidget.prototype._dataSourceAdded = function (
  dataSourceCollection,
  dataSource,
) {
  const entityCollection = dataSource.entities;
  entityCollection.collectionChanged.addEventListener(
    CesiumWidget.prototype._onEntityCollectionChanged,
    this,
  );
};

/**
 * @private
 */
CesiumWidget.prototype._dataSourceRemoved = function (
  dataSourceCollection,
  dataSource,
) {
  const entityCollection = dataSource.entities;
  entityCollection.collectionChanged.removeEventListener(
    CesiumWidget.prototype._onEntityCollectionChanged,
    this,
  );

  if (defined(this.trackedEntity)) {
    if (
      entityCollection.getById(this.trackedEntity.id) === this.trackedEntity
    ) {
      this.trackedEntity = undefined;
    }
  }
};

/**
 * @private
 */
CesiumWidget.prototype._updateCanAnimate = function (isUpdated) {
  this._clock.canAnimate = isUpdated;
};

const boundingSphereScratch = new BoundingSphere();

/**
 * @private
 */
CesiumWidget.prototype._onTick = function (clock) {
  // 【导读】时钟 tick：先让 DataSourceDisplay 把 Entity 变化同步成 Primitive（isUpdated=false 时可暂停动画），
  // 【导读】再更新跟踪实体的 EntityView 相机（包围球就绪才动）。
  const time = clock.currentTime;

  const isUpdated = this._dataSourceDisplay.update(time);
  if (this._allowDataSourcesToSuspendAnimation) {
    this._canAnimateUpdateCallback(isUpdated);
  }

  const entityView = this._entityView;
  if (defined(entityView)) {
    const trackedEntity = this._trackedEntity;
    const trackedState = this._dataSourceDisplay.getBoundingSphere(
      trackedEntity,
      false,
      entityView.boundingSphere ?? boundingSphereScratch,
    );
    if (trackedState === BoundingSphereState.DONE) {
      entityView.update(time);
    }
  }
};

/**
 * @private
 */
CesiumWidget.prototype._onEntityCollectionChanged = function (
  collection,
  added,
  removed,
) {
  const length = removed.length;
  for (let i = 0; i < length; i++) {
    const removedObject = removed[i];
    if (this.trackedEntity === removedObject) {
      this.trackedEntity = undefined;
    }
  }
};

/**
 * @private
 */
CesiumWidget.prototype._clearTrackedObject = function () {
  this.trackedEntity = undefined;
};

/**
 * @private
 */
CesiumWidget.prototype._onDataSourceChanged = function (dataSource) {
  if (this.clockTrackedDataSource === dataSource) {
    trackDataSourceClock(this.clock, dataSource);
  }
};

/**
 * @private
 */
CesiumWidget.prototype._onDataSourceAdded = function (
  dataSourceCollection,
  dataSource,
) {
  if (this._automaticallyTrackDataSourceClocks) {
    this.clockTrackedDataSource = dataSource;
  }
  const id = dataSource.entities.id;
  const removalFunc = this._eventHelper.add(
    dataSource.changedEvent,
    CesiumWidget.prototype._onDataSourceChanged,
    this,
  );
  this._dataSourceChangedListeners[id] = removalFunc;
};

/**
 * @private
 */
CesiumWidget.prototype._onDataSourceRemoved = function (
  dataSourceCollection,
  dataSource,
) {
  const resetClock = this.clockTrackedDataSource === dataSource;
  const id = dataSource.entities.id;
  this._dataSourceChangedListeners[id]();
  this._dataSourceChangedListeners[id] = undefined;
  if (resetClock) {
    const numDataSources = dataSourceCollection.length;
    if (this._automaticallyTrackDataSourceClocks && numDataSources > 0) {
      this.clockTrackedDataSource = dataSourceCollection.get(
        numDataSources - 1,
      );
    } else {
      this.clockTrackedDataSource = undefined;
    }
  }
};

/**
 * Adds a controller— an implementation of the {@link Controller} interface used to handle input events, camera animations, and other interactions— to the widget's scene.
 * @param {Controller} controller An implementation of the <code>Controller</code> interface.
 * @example
 * widget.scene.screenSpaceCameraController.enableInputs = false;
 * widget.scene.screenSpaceCameraController.enableCollisionDetection = false;
 *
 * const tiltOrbitController = new Cesium.ScreenSpaceTiltOrbitCameraController();
 * widget.addController(tiltOrbitController);
 */
CesiumWidget.prototype.addController = function (controller) {
  return this.scene.controllerHost.registerController(
    controller,
    this.container,
  );
};

/**
 * Removes a controller— an implementation of the {@link Controller}  interface used to handle input events, camera animations, and other interactions— from the widget's scene.
 * @param {Controller} controller An implementation of the <code>Controller</code> interface.
 * @example
 * widget.removeController(tiltOrbitController);
 */
CesiumWidget.prototype.removeController = function (controller) {
  return this.scene.controllerHost.unregisterController(
    controller,
    this.container,
  );
};

/**
 * Asynchronously sets the camera to view the provided entity, entities, or data source.
 * If the data source is still in the process of loading or the visualization is otherwise still loading,
 * this method waits for the data to be ready before performing the zoom.
 *
 * <p>The offset is heading/pitch/range in the local east-north-up reference frame centered at the center of the bounding sphere.
 * The heading and the pitch angles are defined in the local east-north-up reference frame.
 * The heading is the angle from y axis and increasing towards the x axis. Pitch is the rotation from the xy-plane. Positive pitch
 * angles are above the plane. Negative pitch angles are below the plane. The range is the distance from the center. If the range is
 * zero, a range will be computed such that the whole bounding sphere is visible.</p>
 *
 * <p>In 2D, there must be a top down view. The camera will be placed above the target looking down. The height above the
 * target will be the range. The heading will be determined from the offset. If the heading cannot be
 * determined from the offset, the heading will be north.</p>
 *
 * @param {Entity|Entity[]|EntityCollection|DataSource|ImageryLayer|Cesium3DTileset|TimeDynamicPointCloud|Promise<Entity|Entity[]|EntityCollection|DataSource|ImageryLayer|Cesium3DTileset|TimeDynamicPointCloud|VoxelPrimitive|BufferPrimitiveCollection<BufferPrimitive>>} target The entity, array of entities, entity collection, data source, Cesium3DTileset, point cloud, or imagery layer to view. You can also pass a promise that resolves to one of the previously mentioned types.
 * @param {HeadingPitchRange} [offset] The offset from the center of the entity in the local east-north-up reference frame.
 * @returns {Promise<boolean>} A Promise that resolves to true if the zoom was successful or false if the target is not currently visualized in the scene or the zoom was cancelled.
 */
// 【导读】异步定位（无飞行动画），转发 zoomToOrFly。
CesiumWidget.prototype.zoomTo = function (target, offset) {
  const options = {
    offset: offset,
  };
  return zoomToOrFly(this, target, options, false);
};

/**
 * Flies the camera to the provided entity, entities, or data source.
 * If the data source is still in the process of loading or the visualization is otherwise still loading,
 * this method waits for the data to be ready before performing the flight.
 *
 * <p>The offset is heading/pitch/range in the local east-north-up reference frame centered at the center of the bounding sphere.
 * The heading and the pitch angles are defined in the local east-north-up reference frame.
 * The heading is the angle from y axis and increasing towards the x axis. Pitch is the rotation from the xy-plane. Positive pitch
 * angles are above the plane. Negative pitch angles are below the plane. The range is the distance from the center. If the range is
 * zero, a range will be computed such that the whole bounding sphere is visible.</p>
 *
 * <p>In 2D, there must be a top down view. The camera will be placed above the target looking down. The height above the
 * target will be the range. The heading will be determined from the offset. If the heading cannot be
 * determined from the offset, the heading will be north.</p>
 *
 * @param {Entity|Entity[]|EntityCollection|DataSource|ImageryLayer|Cesium3DTileset|TimeDynamicPointCloud|Promise<Entity|Entity[]|EntityCollection|DataSource|ImageryLayer|Cesium3DTileset|TimeDynamicPointCloud|VoxelPrimitive|BufferPrimitiveCollection<BufferPrimitive>>} target The entity, array of entities, entity collection, data source, Cesium3DTileset, point cloud, or imagery layer to view. You can also pass a promise that resolves to one of the previously mentioned types.
 * @param {object} [options] Object with the following properties:
 * @param {number} [options.duration=3.0] The duration of the flight in seconds.
 * @param {number} [options.maximumHeight] The maximum height at the peak of the flight.
 * @param {HeadingPitchRange} [options.offset] The offset from the target in the local east-north-up reference frame centered at the target.
 * @returns {Promise<boolean>} A Promise that resolves to true if the flight was successful or false if the target is not currently visualized in the scene or the flight was cancelled. //TODO: Cleanup entity mentions
 */
// 【导读】带飞行动画定位，转发 zoomToOrFly。
CesiumWidget.prototype.flyTo = function (target, options) {
  return zoomToOrFly(this, target, options, true);
};

// 【导读】zoomTo/flyTo 公共实现：返回 Promise，目标可以是 Entity/数据源/Tileset/影像层/Promise；
// 【导读】解析出目标后存入 _zoomTarget，真正移动相机延迟到 _postRender（等可视化就绪、包围球算完）。
function zoomToOrFly(that, zoomTarget, options, isFlight) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(zoomTarget)) {
    throw new DeveloperError("zoomTarget is required.");
  }
  //>>includeEnd('debug');

  cancelZoom(that);

  //We can't actually perform the zoom until all visualization is ready and
  //bounding spheres have been computed.  Therefore we create and return
  //a deferred which will be resolved as part of the post-render step in the
  //frame that actually performs the zoom.
  const zoomPromise = new Promise((resolve) => {
    that._completeZoom = function (value) {
      resolve(value);
    };
  });
  that._zoomPromise = zoomPromise;
  that._zoomIsFlight = isFlight;
  that._zoomOptions = options;

  Promise.resolve(zoomTarget).then(function (zoomTarget) {
    //Only perform the zoom if it wasn't cancelled before the promise resolved.
    if (that._zoomPromise !== zoomPromise) {
      return;
    }

    //If the zoom target is a rectangular imagery in an ImageLayer
    if (zoomTarget instanceof ImageryLayer) {
      let rectanglePromise;

      if (defined(zoomTarget.imageryProvider)) {
        rectanglePromise = Promise.resolve(zoomTarget.getImageryRectangle());
      } else {
        rectanglePromise = new Promise((resolve) => {
          const removeListener = zoomTarget.readyEvent.addEventListener(() => {
            removeListener();
            resolve(zoomTarget.getImageryRectangle());
          });
        });
      }
      rectanglePromise
        .then(function (rectangle) {
          return computeFlyToLocationForRectangle(rectangle, that.scene);
        })
        .then(function (position) {
          //Only perform the zoom if it wasn't cancelled before the promise was resolved
          if (that._zoomPromise === zoomPromise) {
            that._zoomTarget = position;
          }
        });
      return;
    }

    if (
      zoomTarget instanceof Cesium3DTileset ||
      zoomTarget instanceof TimeDynamicPointCloud ||
      zoomTarget instanceof VoxelPrimitive ||
      zoomTarget instanceof BufferPrimitiveCollection
    ) {
      that._zoomTarget = zoomTarget;
      return;
    }

    //If the zoom target is a data source, and it's in the middle of loading, wait for it to finish loading.
    if (zoomTarget.isLoading && defined(zoomTarget.loadingEvent)) {
      const removeEvent = zoomTarget.loadingEvent.addEventListener(function () {
        removeEvent();

        //Only perform the zoom if it wasn't cancelled before the data source finished.
        if (that._zoomPromise === zoomPromise) {
          that._zoomTarget = zoomTarget.entities.values.slice(0);
        }
      });
      return;
    }

    //Zoom target is already an array, just copy it and return.
    if (Array.isArray(zoomTarget)) {
      that._zoomTarget = zoomTarget.slice(0);
      return;
    }

    //If zoomTarget is an EntityCollection, this will retrieve the array
    zoomTarget = zoomTarget.values ?? zoomTarget;

    //If zoomTarget is a DataSource, this will retrieve the array.
    if (defined(zoomTarget.entities)) {
      zoomTarget = zoomTarget.entities.values;
    }

    //Zoom target is already an array, just copy it and return.
    if (Array.isArray(zoomTarget)) {
      that._zoomTarget = zoomTarget.slice(0);
    } else {
      //Single entity
      that._zoomTarget = [zoomTarget];
    }
  });

  that.scene.requestRender();
  return zoomPromise;
}

function clearZoom(widget) {
  widget._zoomPromise = undefined;
  widget._zoomTarget = undefined;
  widget._zoomOptions = undefined;
}

function cancelZoom(widget) {
  const zoomPromise = widget._zoomPromise;
  if (defined(zoomPromise)) {
    clearZoom(widget);
    widget._completeZoom(false);
  }
}

/**
 * @private
 */
CesiumWidget.prototype._postRender = function () {
  // 【导读】帧尾收尾：更新 zoom 目标（包围球就绪后调 camera.flyToBoundingSphere/viewBoundingSphere）与延迟跟踪。
  updateZoomTarget(this);
  updateTrackedEntity(this);
};

const zoomTargetBoundingSphereScratch = new BoundingSphere();

// 【导读】帧尾执行 zoom：按目标类型取包围球（Entity 组/Tileset/点云/影像矩形），再一次性摆机位或起飞。
function updateZoomTarget(widget) {
  const target = widget._zoomTarget;
  if (!defined(target) || widget.scene.mode === SceneMode.MORPHING) {
    return;
  }

  const scene = widget.scene;
  const camera = scene.camera;
  const zoomOptions = widget._zoomOptions ?? {};
  let options;
  function zoomToBoundingSphere(boundingSphere) {
    // If offset was originally undefined then give it base value instead of empty object
    if (!defined(zoomOptions.offset)) {
      zoomOptions.offset = new HeadingPitchRange(
        0.0,
        -0.5,
        boundingSphere.radius,
      );
    }

    options = {
      offset: zoomOptions.offset,
      duration: zoomOptions.duration,
      maximumHeight: zoomOptions.maximumHeight,
      complete: function () {
        widget._completeZoom(true);
      },
      cancel: function () {
        widget._completeZoom(false);
      },
    };

    if (widget._zoomIsFlight) {
      camera.flyToBoundingSphere(boundingSphere, options);
    } else {
      camera.viewBoundingSphere(boundingSphere, zoomOptions.offset);
      camera.lookAtTransform(Matrix4.IDENTITY);

      // Finish the promise
      widget._completeZoom(true);
    }

    clearZoom(widget);
  }

  if (target instanceof TimeDynamicPointCloud) {
    if (defined(target.boundingSphere)) {
      zoomToBoundingSphere(target.boundingSphere);
      return;
    }

    // Otherwise, the first "frame" needs to have been rendered
    const removeEventListener = target.frameChanged.addEventListener(
      function (timeDynamicPointCloud) {
        zoomToBoundingSphere(timeDynamicPointCloud.boundingSphere);
        removeEventListener();
      },
    );
    return;
  }

  if (target instanceof Cesium3DTileset || target instanceof VoxelPrimitive) {
    zoomToBoundingSphere(target.boundingSphere);
    return;
  }

  if (target instanceof BufferPrimitiveCollection) {
    zoomToBoundingSphere(target.boundingVolume);
    return;
  }

  // If zoomTarget was an ImageryLayer
  if (target instanceof Cartographic) {
    options = {
      destination: scene.ellipsoid.cartographicToCartesian(target),
      duration: zoomOptions.duration,
      maximumHeight: zoomOptions.maximumHeight,
      complete: function () {
        widget._completeZoom(true);
      },
      cancel: function () {
        widget._completeZoom(false);
      },
    };

    if (widget._zoomIsFlight) {
      camera.flyTo(options);
    } else {
      camera.setView(options);
      widget._completeZoom(true);
    }
    clearZoom(widget);
    return;
  }

  const entities = target;

  const boundingSpheres = [];
  for (let i = 0, len = entities.length; i < len; i++) {
    const state = widget._dataSourceDisplay.getBoundingSphere(
      entities[i],
      false,
      zoomTargetBoundingSphereScratch,
    );

    if (state === BoundingSphereState.PENDING) {
      return;
    } else if (state !== BoundingSphereState.FAILED) {
      boundingSpheres.push(
        BoundingSphere.clone(zoomTargetBoundingSphereScratch),
      );
    }
  }

  if (boundingSpheres.length === 0) {
    cancelZoom(widget);
    return;
  }

  // Stop tracking the current entity.
  widget.trackedEntity = undefined;

  const boundingSphere = BoundingSphere.fromBoundingSpheres(boundingSpheres);

  if (!widget._zoomIsFlight) {
    camera.viewBoundingSphere(boundingSphere, zoomOptions.offset);
    camera.lookAtTransform(Matrix4.IDENTITY);
    clearZoom(widget);
    widget._completeZoom(true);
  } else {
    clearZoom(widget);
    camera.flyToBoundingSphere(boundingSphere, {
      duration: zoomOptions.duration,
      maximumHeight: zoomOptions.maximumHeight,
      complete: function () {
        widget._completeZoom(true);
      },
      cancel: function () {
        widget._completeZoom(false);
      },
      offset: zoomOptions.offset,
    });
  }
}

const trackedEntityBoundingSphereScratch = new BoundingSphere();

// 【导读】帧尾启动"跟踪实体"：拿到当前位置与包围球后建 EntityView 锁定相机（并禁平移/倾斜防穿模）。
function updateTrackedEntity(widget) {
  if (!widget._needTrackedEntityUpdate) {
    return;
  }

  const trackedEntity = widget._trackedEntity;
  const currentTime = widget.clock.currentTime;

  //Verify we have a current position at this time. This is only triggered if a position
  //has become undefined after trackedEntity is set but before the boundingSphere has been
  //computed. In this case, we will track the entity once it comes back into existence.
  const currentPosition = Property.getValueOrUndefined(
    trackedEntity.position,
    currentTime,
  );

  if (!defined(currentPosition)) {
    return;
  }

  const scene = widget.scene;

  const state = widget._dataSourceDisplay.getBoundingSphere(
    trackedEntity,
    false,
    trackedEntityBoundingSphereScratch,
  );
  if (state === BoundingSphereState.PENDING) {
    return;
  }

  const sceneMode = scene.mode;
  if (
    sceneMode === SceneMode.COLUMBUS_VIEW ||
    sceneMode === SceneMode.SCENE2D
  ) {
    scene.screenSpaceCameraController.enableTranslate = false;
  }

  if (
    sceneMode === SceneMode.COLUMBUS_VIEW ||
    sceneMode === SceneMode.SCENE3D
  ) {
    scene.screenSpaceCameraController.enableTilt = false;
  }

  const bs =
    state !== BoundingSphereState.FAILED
      ? trackedEntityBoundingSphereScratch
      : undefined;
  widget._entityView = new EntityView(trackedEntity, scene, scene.ellipsoid);
  widget._entityView.update(currentTime, bs);
  widget._needTrackedEntityUpdate = false;
}

export default CesiumWidget;
