// ═══ 【导读】DataSourceDisplay.js —— Entity 体系的「每帧同步引擎」═══
// 【导读】职责：监听 DataSourceCollection 的增删移事件，为每个数据源创建一套 Visualizer；
// 【导读】每帧被 CesiumWidget._onTick 调用 update(time)，逐数据源逐 visualizer 分发更新，
// 【导读】把「Entity 声明」同步成「Primitive/BillboardCollection」的可渲染状态。
// 【导读】架构分层：DataSourceCollection（管有哪些源）→ DataSource（管一批 Entity）→
// 【导读】→ Visualizer（管一类图形：billboard/label/point/geometry/...）→ Primitive（真正渲染）。
// 【导读】另有一个不入列的 defaultDataSource（viewer.entities 背后就是它）。
// 【导读】详见 study/03-Entity数据体系.md §4/§5。
import ApproximateTerrainHeights from "../Core/ApproximateTerrainHeights.js";
import BoundingSphere from "../Core/BoundingSphere.js";
import Check from "../Core/Check.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import EventHelper from "../Core/EventHelper.js";
import GroundPolylinePrimitive from "../Scene/GroundPolylinePrimitive.js";
import GroundPrimitive from "../Scene/GroundPrimitive.js";
import OrderedGroundPrimitiveCollection from "../Scene/OrderedGroundPrimitiveCollection.js";
import PrimitiveCollection from "../Scene/PrimitiveCollection.js";
import BillboardVisualizer from "./BillboardVisualizer.js";
import BoundingSphereState from "./BoundingSphereState.js";
import CustomDataSource from "./CustomDataSource.js";
import GeometryVisualizer from "./GeometryVisualizer.js";
import LabelVisualizer from "./LabelVisualizer.js";
import ModelVisualizer from "./ModelVisualizer.js";
import Cesium3DTilesetVisualizer from "./Cesium3DTilesetVisualizer.js";
import PathVisualizer from "./PathVisualizer.js";
import PointVisualizer from "./PointVisualizer.js";
import PolylineVisualizer from "./PolylineVisualizer.js";

/**
 * Visualizes a collection of {@link DataSource} instances.
 * @alias DataSourceDisplay
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {Scene} options.scene The scene in which to display the data.
 * @param {DataSourceCollection} options.dataSourceCollection The data sources to display.
 * @param {DataSourceDisplay.VisualizersCallback} [options.visualizersCallback=DataSourceDisplay.defaultVisualizersCallback]
 *        A function which creates an array of visualizers used for visualization.
 *        If undefined, all standard visualizers are used.
 */
function DataSourceDisplay(options) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("options", options);
  Check.typeOf.object("options.scene", options.scene);
  Check.typeOf.object(
    "options.dataSourceCollection",
    options.dataSourceCollection,
  );
  //>>includeEnd('debug');

  // 【导读】贴地 Entity 需要的近似地形高度表提前初始化（异步加载；update 里会检查其完成状态）。
  GroundPrimitive.initializeTerrainHeights();
  GroundPolylinePrimitive.initializeTerrainHeights();

  const scene = options.scene;
  const dataSourceCollection = options.dataSourceCollection;

  // 【导读】订阅集合三大事件 + scene.postRender（帧尾加版权）：数据源的增删移全部反应式处理。
  this._eventHelper = new EventHelper();
  this._eventHelper.add(
    dataSourceCollection.dataSourceAdded,
    this._onDataSourceAdded,
    this,
  );
  this._eventHelper.add(
    dataSourceCollection.dataSourceRemoved,
    this._onDataSourceRemoved,
    this,
  );
  this._eventHelper.add(
    dataSourceCollection.dataSourceMoved,
    this._onDataSourceMoved,
    this,
  );
  this._eventHelper.add(scene.postRender, this._postRender, this);

  this._dataSourceCollection = dataSourceCollection;
  this._scene = scene;
  this._visualizersCallback =
    options.visualizersCallback ?? DataSourceDisplay.defaultVisualizersCallback;

  let primitivesAdded = false;
  // 【导读】本 display 持有两棵集合树：普通 Primitive（相对地形）与 GroundPrimitive（贴地），
  // 【导读】每个数据源在树里各有自己的子 PrimitiveCollection（见 _onDataSourceAdded）。
  const primitives = new PrimitiveCollection();
  const groundPrimitives = new PrimitiveCollection();

  if (dataSourceCollection.length > 0) {
    scene.primitives.add(primitives);
    scene.groundPrimitives.add(groundPrimitives);
    primitivesAdded = true;
  }

  this._primitives = primitives;
  this._groundPrimitives = groundPrimitives;

  // 【导读】为「构造时已在集合里」的数据源补建 visualizers（事件只覆盖构造之后的增删）。
  for (let i = 0, len = dataSourceCollection.length; i < len; i++) {
    this._onDataSourceAdded(dataSourceCollection, dataSourceCollection.get(i));
  }

  // 【导读】defaultDataSource：viewer.entities 的真身。挂在 display 而不是集合里，
  // 【导读】所以 viewer.dataSources 里看不到它、removeAll 也不会误伤；销毁时单独处理。
  const defaultDataSource = new CustomDataSource();
  this._onDataSourceAdded(undefined, defaultDataSource);
  this._defaultDataSource = defaultDataSource;

  // 【导读】懒挂树：构造时两棵集合树还没加进 scene（避免空树白渲染），
  // 【导读】等到「defaultDataSource 首个实体」或「首个数据源」入列才真正 addPrimitives。
  let removeDefaultDataSourceListener;
  let removeDataSourceCollectionListener;
  if (!primitivesAdded) {
    const that = this;
    const addPrimitives = function () {
      scene.primitives.add(primitives);
      scene.groundPrimitives.add(groundPrimitives);
      removeDefaultDataSourceListener();
      removeDataSourceCollectionListener();
      that._removeDefaultDataSourceListener = undefined;
      that._removeDataSourceCollectionListener = undefined;
    };
    removeDefaultDataSourceListener =
      defaultDataSource.entities.collectionChanged.addEventListener(
        addPrimitives,
      );
    removeDataSourceCollectionListener =
      dataSourceCollection.dataSourceAdded.addEventListener(addPrimitives);
  }

  this._removeDefaultDataSourceListener = removeDefaultDataSourceListener;
  this._removeDataSourceCollectionListener = removeDataSourceCollectionListener;

  this._ready = false;
}

const ExtraVisualizers = [];
/**
 * Add the provided Visualizer to the default visualizers callback if not already included
 * @private
 * @param {Visualizer} visualizer Visualizer class to add
 */
DataSourceDisplay.registerVisualizer = function (visualizer) {
  if (!ExtraVisualizers.includes(visualizer)) {
    ExtraVisualizers.push(visualizer);
  }
};

/**
 * Remove the provided Visualizer from the default visualizers callback if it's already included
 * @private
 * @param {Visualizer} visualizer Visualizer class to remove
 */
DataSourceDisplay.unregisterVisualizer = function (visualizer) {
  if (ExtraVisualizers.includes(visualizer)) {
    const index = ExtraVisualizers.indexOf(visualizer);
    ExtraVisualizers.splice(index, 1);
  }
};

/**
 * Gets or sets the default function which creates an array of visualizers used for visualization.
 * By default, this function uses all standard visualizers.
 *
 * @type {DataSourceDisplay.VisualizersCallback}
 */
// 【导读】默认 visualizer 清单：每种「图形类型」一个（billboard/geometry/label/model/tileset/point/path/polyline）。
// 【导读】同源的 Entity 都会流经这 8 个 visualizer——各自只认自己关心的 *Graphics 属性。
DataSourceDisplay.defaultVisualizersCallback = function (
  scene,
  entityCluster,
  dataSource,
) {
  const entities = dataSource.entities;
  return [
    new BillboardVisualizer(entityCluster, entities),
    new GeometryVisualizer(
      scene,
      entities,
      dataSource._primitives,
      dataSource._groundPrimitives,
    ),
    new LabelVisualizer(entityCluster, entities),
    new ModelVisualizer(scene, entities),
    new Cesium3DTilesetVisualizer(scene, entities),
    new PointVisualizer(entityCluster, entities),
    new PathVisualizer(scene, entities),
    new PolylineVisualizer(
      scene,
      entities,
      dataSource._primitives,
      dataSource._groundPrimitives,
    ),
    ...ExtraVisualizers.map(
      (VisualizerClass) => new VisualizerClass(scene, entities),
    ),
  ];
};

Object.defineProperties(DataSourceDisplay.prototype, {
  /**
   * Gets the scene associated with this display.
   * @memberof DataSourceDisplay.prototype
   * @type {Scene}
   */
  scene: {
    get: function () {
      return this._scene;
    },
  },
  /**
   * Gets the collection of data sources to display.
   * @memberof DataSourceDisplay.prototype
   * @type {DataSourceCollection}
   */
  dataSources: {
    get: function () {
      return this._dataSourceCollection;
    },
  },
  /**
   * Gets the default data source instance which can be used to
   * manually create and visualize entities not tied to
   * a specific data source. This instance is always available
   * and does not appear in the list dataSources collection.
   * @memberof DataSourceDisplay.prototype
   * @type {CustomDataSource}
   */
  defaultDataSource: {
    get: function () {
      return this._defaultDataSource;
    },
  },

  /**
   * Gets a value indicating whether or not all entities in the data source are ready
   * @memberof DataSourceDisplay.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
});

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {boolean} True if this object was destroyed; otherwise, false.
 *
 * @see DataSourceDisplay#destroy
 */
DataSourceDisplay.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
 * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
 * <br /><br />
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 *
 * @example
 * dataSourceDisplay = dataSourceDisplay.destroy();
 *
 * @see DataSourceDisplay#isDestroyed
 */
DataSourceDisplay.prototype.destroy = function () {
  this._eventHelper.removeAll();

  const dataSourceCollection = this._dataSourceCollection;
  for (let i = 0, length = dataSourceCollection.length; i < length; ++i) {
    this._onDataSourceRemoved(
      this._dataSourceCollection,
      dataSourceCollection.get(i),
    );
  }
  this._onDataSourceRemoved(undefined, this._defaultDataSource);

  if (defined(this._removeDefaultDataSourceListener)) {
    this._removeDefaultDataSourceListener();
    this._removeDataSourceCollectionListener();
  } else {
    this._scene.primitives.remove(this._primitives);
    this._scene.groundPrimitives.remove(this._groundPrimitives);
  }

  return destroyObject(this);
};

/**
 * Updates the display to the provided time.
 *
 * @param {JulianDate} time The simulation time.
 * @returns {boolean} True if all data sources are ready to be displayed, false otherwise.
 */
  // 【导读】update：每帧一次的同步心跳（被 CesiumWidget._onTick 在 clock.tick 后调用）。
  // 【导读】三层循环：①先调数据源自身 update（如 Czml 按时间取数据）；②逐 visualizer.update(time)
  // 【导读】（差量同步 Entity→Primitive，见各 Visualizer）；③defaultDataSource 同样待遇。
  // 【导读】返回值=「全部就绪」：一旦 true 则永久 true（_ready 只升不降），首次就绪时 requestRender 补一帧。
DataSourceDisplay.prototype.update = function (time) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("time", time);
  //>>includeEnd('debug');

  if (!ApproximateTerrainHeights.initialized) {
    this._ready = false;
    return false;
  }

  let result = true;

  let i;
  let x;
  let visualizers;
  let vLength;
  const dataSources = this._dataSourceCollection;
  const length = dataSources.length;
  for (i = 0; i < length; i++) {
    const dataSource = dataSources.get(i);
    if (defined(dataSource.update)) {
      result = dataSource.update(time) && result;
    }

    visualizers = dataSource._visualizers;
    vLength = visualizers.length;
    for (x = 0; x < vLength; x++) {
      result = visualizers[x].update(time) && result;
    }
  }

  visualizers = this._defaultDataSource._visualizers;
  vLength = visualizers.length;
  for (x = 0; x < vLength; x++) {
    result = visualizers[x].update(time) && result;
  }

  // Request a rendering of the scene when the data source
  // becomes 'ready' for the first time
  if (!this._ready && result) {
    this._scene.requestRender();
  }

  // once the DataSourceDisplay is ready it should stay ready to prevent
  // entities from breaking updates when they become "un-ready"
  this._ready = this._ready || result;

  return result;
};

DataSourceDisplay.prototype._postRender = function () {
  // 【导读】帧尾把各数据源的版权（credit）累加到下一帧展示——Entity 世界的版权不占 update 热路径。
  // Adds credits for all datasources
  const frameState = this._scene.frameState;
  const dataSources = this._dataSourceCollection;
  const length = dataSources.length;
  for (let i = 0; i < length; i++) {
    const dataSource = dataSources.get(i);

    const credit = dataSource.credit;
    if (defined(credit)) {
      frameState.creditDisplay.addCreditToNextFrame(credit);
    }

    // Credits from the resource that the user can't remove
    const credits = dataSource._resourceCredits;
    if (defined(credits)) {
      const creditCount = credits.length;
      for (let c = 0; c < creditCount; c++) {
        frameState.creditDisplay.addCreditToNextFrame(credits[c]);
      }
    }
  }
};

const getBoundingSphereArrayScratch = [];
const getBoundingSphereBoundingSphereScratch = new BoundingSphere();

/**
 * Computes a bounding sphere which encloses the visualization produced for the specified entity.
 * The bounding sphere is in the fixed frame of the scene's globe.
 *
 * @param {Entity} entity The entity whose bounding sphere to compute.
 * @param {boolean} allowPartial If true, pending bounding spheres are ignored and an answer will be returned from the currently available data.
 *                               If false, the the function will halt and return pending if any of the bounding spheres are pending.
 * @param {BoundingSphere} result The bounding sphere onto which to store the result.
 * @returns {BoundingSphereState} BoundingSphereState.DONE if the result contains the bounding sphere,
 *                       BoundingSphereState.PENDING if the result is still being computed, or
 *                       BoundingSphereState.FAILED if the entity has no visualization in the current scene.
 * @private
 */
  // 【导读】getBoundingSphere：viewer.zoomTo/flyTo 与 trackedEntity 相机的包围球来源。
  // 【导读】先找到 Entity 所在数据源，再汇总该源各 visualizer 的包围球成一个（PENDING 则等待，
  // 【导读】与 CesiumWidget._postRender 的延迟 zoom 链路衔接，见 CesiumWidget.js 的 zoomToOrFly）。
DataSourceDisplay.prototype.getBoundingSphere = function (
  entity,
  allowPartial,
  result,
) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("entity", entity);
  Check.typeOf.bool("allowPartial", allowPartial);
  Check.defined("result", result);
  //>>includeEnd('debug');

  if (!this._ready) {
    return BoundingSphereState.PENDING;
  }

  let i;
  let length;
  let dataSource = this._defaultDataSource;
  if (!dataSource.entities.contains(entity)) {
    dataSource = undefined;

    const dataSources = this._dataSourceCollection;
    length = dataSources.length;
    for (i = 0; i < length; i++) {
      const d = dataSources.get(i);
      if (d.entities.contains(entity)) {
        dataSource = d;
        break;
      }
    }
  }

  if (!defined(dataSource)) {
    return BoundingSphereState.FAILED;
  }

  const boundingSpheres = getBoundingSphereArrayScratch;
  const tmp = getBoundingSphereBoundingSphereScratch;

  let count = 0;
  let state;
  const visualizers = dataSource._visualizers;
  const visualizersLength = visualizers.length;

  for (i = 0; i < visualizersLength; i++) {
    const visualizer = visualizers[i];
    if (defined(visualizer.getBoundingSphere)) {
      state = visualizers[i].getBoundingSphere(entity, tmp);
      if (!allowPartial && state === BoundingSphereState.PENDING) {
        return BoundingSphereState.PENDING;
      } else if (state === BoundingSphereState.DONE) {
        boundingSpheres[count] = BoundingSphere.clone(
          tmp,
          boundingSpheres[count],
        );
        count++;
      }
    }
  }

  if (count === 0) {
    return BoundingSphereState.FAILED;
  }

  boundingSpheres.length = count;
  BoundingSphere.fromBoundingSpheres(boundingSpheres, result);
  return BoundingSphereState.DONE;
};

  // 【导读】新数据源入列：①在两棵集合树里各建子集合（渲染顺序与 dataSources 列表顺序一致）；
  // 【导读】②初始化点聚合 EntityCluster；③用 visualizersCallback 建全套 visualizer 挂到 _visualizers。
DataSourceDisplay.prototype._onDataSourceAdded = function (
  dataSourceCollection,
  dataSource,
) {
  const scene = this._scene;

  const displayPrimitives = this._primitives;
  const displayGroundPrimitives = this._groundPrimitives;

  const primitives = displayPrimitives.add(new PrimitiveCollection());
  const groundPrimitives = displayGroundPrimitives.add(
    new OrderedGroundPrimitiveCollection(),
  );

  dataSource._primitives = primitives;
  dataSource._groundPrimitives = groundPrimitives;

  const entityCluster = dataSource.clustering;
  entityCluster._initialize(scene);

  primitives.add(entityCluster);

  dataSource._visualizers = this._visualizersCallback(
    scene,
    entityCluster,
    dataSource,
  );
};

  // 【导读】移除：销毁全部 visualizer、从两棵树摘除子集合（PrimitiveCollection.remove 会级联销毁 Primitive）。
DataSourceDisplay.prototype._onDataSourceRemoved = function (
  dataSourceCollection,
  dataSource,
) {
  const displayPrimitives = this._primitives;
  const displayGroundPrimitives = this._groundPrimitives;

  const primitives = dataSource._primitives;
  const groundPrimitives = dataSource._groundPrimitives;

  const entityCluster = dataSource.clustering;
  primitives.remove(entityCluster);

  const visualizers = dataSource._visualizers;
  const length = visualizers.length;
  for (let i = 0; i < length; i++) {
    visualizers[i].destroy();
  }

  displayPrimitives.remove(primitives);
  displayGroundPrimitives.remove(groundPrimitives);

  dataSource._visualizers = undefined;
};

  // 【导读】调序：数据源在集合里上/下移时，对应的子 PrimitiveCollection 也同步 raise/lower，
// 【导读】保证后加的源画在上面；索引 0 的特判是不让 defaultDataSource 被压到底。
DataSourceDisplay.prototype._onDataSourceMoved = function (
  dataSource,
  newIndex,
  oldIndex,
) {
  const displayPrimitives = this._primitives;
  const displayGroundPrimitives = this._groundPrimitives;

  const primitives = dataSource._primitives;
  const groundPrimitives = dataSource._groundPrimitives;

  if (newIndex === oldIndex + 1) {
    displayPrimitives.raise(primitives);
    displayGroundPrimitives.raise(groundPrimitives);
  } else if (newIndex === oldIndex - 1) {
    displayPrimitives.lower(primitives);
    displayGroundPrimitives.lower(groundPrimitives);
  } else if (newIndex === 0) {
    displayPrimitives.lowerToBottom(primitives);
    displayGroundPrimitives.lowerToBottom(groundPrimitives);
    displayPrimitives.raise(primitives); // keep defaultDataSource primitives at index 0 since it's not in the collection
    displayGroundPrimitives.raise(groundPrimitives);
  } else {
    displayPrimitives.raiseToTop(primitives);
    displayGroundPrimitives.raiseToTop(groundPrimitives);
  }
};

/**
 * A function which creates an array of visualizers used for visualization.
 * @callback DataSourceDisplay.VisualizersCallback
 *
 * @param {Scene} scene The scene to create visualizers for.
 * @param {EntityCluster} entityCluster The entity cluster to create visualizers for.
 * @param {DataSource} dataSource The data source to create visualizers for.
 * @returns {Visualizer[]} An array of visualizers used for visualization.
 *
 * @example
 * function createVisualizers(scene, entityCluster, dataSource) {
 *     return [new Cesium.BillboardVisualizer(entityCluster, dataSource.entities)];
 * }
 */
export default DataSourceDisplay;
