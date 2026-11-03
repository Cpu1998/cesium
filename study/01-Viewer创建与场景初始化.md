# 01 · `new Viewer()` 到第一帧：创建与初始化全链路

> 阅读前提：读完 [00-总览](00-总览-架构与目录地图.md) §3 对象树。
> 本文逐阶段拆解 `new Cesium.Viewer(container, options)` 从第一行代码到屏幕出现第一帧的完整时序。
> 源码引用约定：「文件路径 + 函数名」。所有被引用处都已插入 `【导读】` 中文注释，可对照 GitHub 网页阅读。

涉及的两个核心文件：

- `packages/widgets/Source/Viewer/Viewer.js` —— `function Viewer`（组装层）
- `packages/engine/Source/Widget/CesiumWidget.js` —— `function CesiumWidget`（引擎层）

## 0. 全景时序图

```
new Viewer(container, options)
│
├─ ① 参数校验 / createBaseLayerPicker 决策            (Viewer.js: function Viewer 开头)
├─ ② 搭 DOM 骨架（3 个 div）                          (Viewer.js: "DOM 骨架" 注释处)
├─ ③ 建 Clock + ClockViewModel                        (Viewer.js: let clock)
├─ ④ new CesiumWidget(container, {...透传})           ★ 最重的一步，展开如下
│     ├─ 4.1 建 DOM/canvas、版权条容器                 (CesiumWidget.js 构造前段)
│     ├─ 4.2 实例字段初始化 + Clock + configureCanvasSize
│     ├─ 4.3 new Scene({canvas, requestRenderMode…})   ★ WebGL 上下文在此创建
│     ├─ 4.4 new Globe(ellipsoid) → scene.globe        地球本体
│     ├─ 4.5 SkyBox/Sun/Moon + SkyAtmosphere           天空（仅 WGS84 默认开）
│     ├─ 4.6 baseLayer 默认 → ImageryLayer.fromWorldImagery() → imageryLayers.add
│     ├─ 4.7 terrainProvider / scene.setTerrain        地形入口
│     ├─ 4.8 new ScreenSpaceEventHandler(canvas)       输入
│     ├─ 4.9 useDefaultRenderLoop=true → startRenderLoop   ★ 渲染循环启动
│     └─ 4.10 DataSourceCollection + DataSourceDisplay + 事件接线
├─ ⑤ 创建各 UI 部件（选择指示器/信息框/工具栏/时间轴/动画…）(Viewer.js 各 "// Xxx" 段)
├─ ⑥ baseLayer / terrainProvider / terrain 覆盖逻辑     (Viewer.js: options.baseLayer 段)
├─ ⑦ 事件接线（onTick/postUpdate/数据源增删）+ 鼠标拾取行为
└─ 构造返回 ──→ 之后的每一帧：
     requestAnimationFrame → resize → render
     = scene.initializeFrame → clock.tick(广播 onTick) → scene.render(time)
                                                      ↑ 第一帧即由 4.9 启动的循环画出
```

## 1. 阶段①：参数校验与一个关键决策

`function Viewer` 开头（Viewer.js）做三件事：

1. `container` 必填校验（`getElement` 支持传元素或 id 字符串）；
2. `globe:false` 时禁止再传 `baseLayer`（没地球就没处贴图，直接 `DeveloperError`）;
3. 计算 **`createBaseLayerPicker`**：只有「没关 globe 且没关 baseLayerPicker」才为 true。
   这个布尔值决定了后面两处行为：
   - 传给 CesiumWidget 的 `baseLayer` 是否置 `false`（见阶段④-6）；
   - 是否创建 BaseLayerPicker 部件（阶段⑤）。

## 2. 阶段②：DOM 骨架

Viewer 先建三层 div：根 `cesium-viewer`，其下 `cesium-viewer-cesiumWidgetContainer`（放三维）
和 `cesium-viewer-bottom`（放版权条）。后续所有 UI 部件都 append 到根 div 下。
**Viewer 自己不建 canvas**——canvas 属于 CesiumWidget。

## 3. 阶段③：时钟

默认 `new Clock()` + `new ClockViewModel(clock)`；外部传了 `clockViewModel` 就复用。
这个 clock 会传给 CesiumWidget **共享**：时间轴、动画控件、Viewer、CesiumWidget 操作的都是同一个实例。
`shouldAnimate` 此时还没生效，它作为 options 透传，由 CesiumWidget 写回 clock（见阶段④-2）。

## 4. 阶段④：`new CesiumWidget` —— 真正的重头戏

Viewer 把几十个 options 原样透传，唯一改写 `baseLayer`：
**当 `createBaseLayerPicker` 为 true（用底图选择器）或用户传了自己的 `baseLayer`/`imageryProvider`/
`selectedImageryProviderViewModel` 时，给 CesiumWidget 的 `baseLayer` 传 `false`**——
先阻止它默认加载 ion 世界影像，避免和选择器/用户底图重复加载。

### 4.1–4.2 DOM、字段与尺寸

CesiumWidget 建根 div `cesium-widget` + `<canvas>`（禁右键/禁选中；`blurActiveElementOnCanvasFocus`
处理"点击画布先让输入框失焦"的体验细节），随后初始化一批实例字段（缩放/zoom/跟踪状态机），
接住 Viewer 传来的共享 clock（`options.shouldAnimate` 就在这里写进 `clock.shouldAnimate`），
并立刻 `configureCanvasSize`：按容器 CSS 尺寸 × 像素比设定 canvas 缓冲区（必须在建 Scene 前完成）。

### 4.3 `new Scene(...)`：WebGL 上下文的诞生地

try 块内第一件大事。`packages/engine/Source/Scene/Scene.js` 的构造函数里创建
`Renderer/Context.js` 的 `Context`（真正 `canvas.getContext("webgl2"|"webgl")` 的地方），
并初始化相机、primitives 容器、后处理链、frameState、以及 **requestRenderMode** 按需渲染状态。
CesiumWidget 随即设 `scene.camera.constrainedAxis = UNIT_Z`（保持"北在上"的滚转约束）。

### 4.4–4.5 Globe 与天空

- `globe` 未传时默认 `new Globe(ellipsoid)`；传 `false` 则整个地球（连同底图、大气）都不建。
- `skyBox` 未传且椭球是 WGS84 时，自动 `SkyBox.createEarthSkyBox()` + `new Sun()` + `new Moon()`；
- `skyAtmosphere` 同理默认开启（地球大气辉光）。传 `false` 可分别关闭。

### 4.6 默认 baseLayer 如何变成 ImageryLayer（★）

`CesiumWidget.js` 构造函数 "Set the base imagery layer" 段：

```js
let baseLayer = options.baseLayer;
if (options.globe !== false && baseLayer !== false) {
  if (!defined(baseLayer)) {
    baseLayer = ImageryLayer.fromWorldImagery();   // 默认：ion 在线世界影像（Bing 系）
  }
  scene.imageryLayers.add(baseLayer);              // 作为一个普通图层加到最底层
}
```

即：**默认底图并没有特殊通道，就是一个普通 `ImageryLayer`**（内部包装 IonImageryProvider），
`add` 进 `ImageryLayerCollection` 的第 0 层。影像瓦片的按需加载/贴图管线从 Globe 渲染时才真正跑起来（第 2 棒深挖）。

对应地，Viewer 侧阶段⑥（`options.baseLayer` 段）处理用户显式传底图：
先 `baseLayerPicker.viewModel.selectedImagery = undefined`（让选择器不再干预），
再 `scene.imageryLayers.removeAll()` 清掉默认层，最后 `add(options.baseLayer)`。

### 4.7 地形两个入口

- `terrainProvider`（同步旧式）：直接 `scene.terrainProvider = …`；
- `terrain`（异步新式，如 `Terrain.fromWorldTerrain()`）：`scene.setTerrain(options.terrain)`，
  二者互斥（同时传直接抛 `DeveloperError`）。Viewer 侧还有个细节：同时用 BaseLayerPicker 时会
  `globe.depthTestAgainstTerrain = true`，避免贴地模型被地形"吃掉"。

### 4.9 渲染循环启动：第一帧的起点

构造里这两行是"画面动起来"的时刻：

```js
this._useDefaultRenderLoop = undefined;
this.useDefaultRenderLoop = options.useDefaultRenderLoop ?? true;
```

先置 `undefined` 再赋默认 `true`，保证一定经过 `useDefaultRenderLoop` 的 setter：
检测到 `false → true` 且循环未运行时调用 `startRenderLoop(this)`——
`requestAnimationFrame` 自循环，每帧 `widget.resize()` + `widget.render()`
（帧内细节见第 5 棒；`targetFrameRate` 可节流）。渲染抛错时循环自停并弹错误面板。

### 4.10 数据源与事件接线

`new DataSourceCollection()`（或复用外部传入的）+ `new DataSourceDisplay({scene, dataSourceCollection})`
——后者是 Entity→Primitive 的转换中枢（第 3 棒深挖）。随后 EventHelper 集中挂事件：
`clock.onTick → _onTick`（每 tick 更新 Entity 可视化与跟踪相机）、
`scene.postRender → _postRender`（帧尾完成 zoomTo/延迟跟踪）、
数据源增删、`scene.morphStart`（形变时取消跟踪）等。

## 5. 阶段⑤–⑦：回到 Viewer 组装 UI

- **UI 部件**（每个都是独立目录，默认全开、可用同名 option 关闭）：
  SelectionIndicator（选中绿框）、InfoBox（属性面板）、工具栏上的 Geocoder / HomeButton /
  SceneModePicker（scene3DOnly 时静默不建）/ BaseLayerPicker、NavigationHelpButton（首次自动弹引导）、
  左下 Animation（时钟控件）、底部 Timeline、右下 FullscreenButton、可选 VRButton。
- **事件接线**：`clock.onTick → Viewer.prototype._onTick`（刷新选中绿框/信息框）；
  `scene.postUpdate → Viewer.prototype.resize`（容器尺寸变了就重排布局——注意它挂在每帧上，但内部
  先比较宽高无变化即返回，代价极小）；数据源增删时同步监听实体集合，实体被删则清空 selectedEntity。
- **默认鼠标行为**：`ScreenSpaceEventHandler` 上注册——
  左键单击 `pickAndSelectObject`（选中实体→信息框），左键双击 `pickAndTrackObject`
  （有位置→`trackedEntity` 跟踪，无位置→`zoomTo`）。拾取统一走文件内 `pickEntity`：
  `scene.pick` → Entity/3D Tiles 要素，失败再降级 `pickImageryLayerFeature`（异步拾取底图要素）。

## 6. 时钟与 requestRenderMode 对启动的影响

- **shouldAnimate**：写进共享 `clock.shouldAnimate`。false（默认）时 `clock.tick()` 每帧照常触发，
  但 `currentTime` 不前进——**渲染循环与时间解耦**：画面静止不动不等于循环停了。
  反过来开了动画后，即使没操作，每帧时间都在变。
- **requestRenderMode**：透传给 `Scene` 构造。开启后 `Scene.prototype.render` 内部
  （Scene.js 中 `shouldRender` 判断处）只在「显式 `Scene#requestRender()` / 相机变化 /
  形变中 / 超过 `maximumRenderTimeChange` 时间差」时才真正执行昂贵渲染，否则只走空帧——
  省电省 CPU，代价是改场景后常需手动 `scene.requestRender()`。构造期与启动期行为不变：
  第一帧仍由 4.9 的循环立即触发（首轮必然渲染）。

## 7. 关键源码函数对照表

| 阶段 | 文件 | 函数/位置 |
|---|---|---|
| Viewer 组装 | `packages/widgets/Source/Viewer/Viewer.js` | `function Viewer` |
| 时间轴拖动 | 同上 | `onTimelineScrubfunction` |
| 点击拾取 | 同上 | `pickEntity` / `pickImageryLayerFeature` |
| 每 tick 刷 UI | 同上 | `Viewer.prototype._onTick` |
| 布局自适应 | 同上 | `Viewer.prototype.resize` |
| 相机定位入口 | 同上 | `Viewer.prototype.zoomTo` / `flyTo`（转发 CesiumWidget 同名方法） |
| 引擎组件构造 | `packages/engine/Source/Widget/CesiumWidget.js` | `function CesiumWidget` |
| 帧循环 | 同上 | `startRenderLoop` / `CesiumWidget.prototype.render` |
| 尺寸/像素比 | 同上 | `configureCanvasSize` / `configurePixelRatio` / `configureCameraFrustum` |
| 每 tick 更新可视化 | 同上 | `CesiumWidget.prototype._onTick` |
| 帧尾收尾 | 同上 | `CesiumWidget.prototype._postRender` / `updateZoomTarget` / `updateTrackedEntity` |
| 定位公共实现 | 同上 | `zoomToOrFly` |
| WebGL 上下文 | `packages/engine/Source/Scene/Scene.js` | `function Scene`（构造内建 Context） |
| 一帧的编排 | 同上 | `Scene.prototype.render` / `Scene.prototype.initializeFrame` |
| 按需渲染开关 | 同上 | `Scene.prototype.requestRender`（requestRenderMode 判定在 render 内） |
| Entity→Primitive | `packages/engine/Source/DataSources/DataSourceDisplay.js` | `DataSourceDisplay.prototype.update` |

## 8. 常见 options 落点速查

| option | 落到哪段源码（函数名） |
|---|---|
| `baseLayer` | Viewer.js `function Viewer`（baseLayer 覆盖段）→ CesiumWidget.js `function CesiumWidget`（"Set the base imagery layer" 段） |
| `baseLayerPicker` | Viewer.js `createBaseLayerPicker` 决策 + "BaseLayerPicker" 段 |
| `terrain` / `terrainProvider` | CesiumWidget.js 构造 "terrain" 段 → `scene.setTerrain` / `scene.terrainProvider` |
| `shouldAnimate` | CesiumWidget.js 构造（`this._clock.shouldAnimate = …`） |
| `requestRenderMode` / `maximumRenderTimeChange` | 透传 → Scene.js `function Scene`；生效于 `Scene.prototype.render` |
| `sceneMode` | CesiumWidget.js 构造末段（`morphTo2D(0)` / `morphToColumbusView(0)`） |
| `scene3DOnly` | 透传 Scene（省 2D/CV 渲染分支）；Viewer 侧抑制 SceneModePicker |
| `skyBox` / `skyAtmosphere` / `globe` | CesiumWidget.js 构造 "globe/天空" 各段 |
| `useDefaultRenderLoop` / `targetFrameRate` | CesiumWidget.js `useDefaultRenderLoop` setter → `startRenderLoop` |
| `clockViewModel` | Viewer.js `function Viewer`（let clock 段，决定是否复用/负责销毁） |

## 9. 动手实验（建议）

1. `baseLayer: false` + `globe: false` 各传一次，观察 `scene.globe === undefined` 与星空/大气差异；
2. 构造后立刻 `viewer.clock.shouldAnimate = true`，对比 `shouldAnimate: true` 传参——路径殊途同归；
3. `requestRenderMode: true` 下 `viewer.entities.add(...)` 后画面不更新，补一句
   `viewer.scene.requestRender()` 立即显现——直观感受按需渲染语义。
