// ═══ 【导读】GeometryVisualizer.js —— Entity 几何体（polygon/box/…）→ Primitive 的差量同步器 ═══
// 【导读】三层结构：①GeometryUpdater（每个 Entity 每种几何一个，把 Graphics 属性转成几何选项）；
// 【导读】②批量 Batch（静态几何按「阴影模式×开闭体×材质类型×贴地」分桶，合批成一个 Primitive；
// 【导读】动态几何单独 DynamicGeometryBatch 每帧重建）；③Primitive（真正渲染）。
// 【导读】事件驱动收集差量：EntityCollection.collectionChanged → _added/_removed/_changed 三个队列，
// 【导读】在每帧 update() 里集中消费（合并同帧变化），再让各 batch.process 差量重建。
// 【导读】详见 study/03-Entity数据体系.md §5；静态/动态分桶见 _insertUpdaterIntoBatch。
import AssociativeArray from "../Core/AssociativeArray.js";
import BoundingSphere from "../Core/BoundingSphere.js";
import Check from "../Core/Check.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import ClassificationType from "../Scene/ClassificationType.js";
import MaterialAppearance from "../Scene/MaterialAppearance.js";
import PerInstanceColorAppearance from "../Scene/PerInstanceColorAppearance.js";
import ShadowMode from "../Scene/ShadowMode.js";
import BoundingSphereState from "./BoundingSphereState.js";
import ColorMaterialProperty from "./ColorMaterialProperty.js";
import DynamicGeometryBatch from "./DynamicGeometryBatch.js";
import Entity from "./Entity.js";
import GeometryUpdaterSet from "./GeometryUpdaterSet.js";
import StaticGeometryColorBatch from "./StaticGeometryColorBatch.js";
import StaticGeometryPerMaterialBatch from "./StaticGeometryPerMaterialBatch.js";
import StaticGroundGeometryColorBatch from "./StaticGroundGeometryColorBatch.js";
import StaticGroundGeometryPerMaterialBatch from "./StaticGroundGeometryPerMaterialBatch.js";
import StaticOutlineGeometryBatch from "./StaticOutlineGeometryBatch.js";

const emptyArray = [];

/**
 * A general purpose visualizer for geometry represented by {@link Primitive} instances.
 * @alias GeometryVisualizer
 * @constructor
 *
 * @param {Scene} scene The scene the primitives will be rendered in.
 * @param {EntityCollection} entityCollection The entityCollection to visualize.
 * @param {PrimitiveCollection} [primitives=scene.primitives] A collection to add primitives related to the entities
 * @param {PrimitiveCollection} [groundPrimitives=scene.groundPrimitives] A collection to add ground primitives related to the entities
 */
function GeometryVisualizer(
  scene,
  entityCollection,
  primitives,
  groundPrimitives,
) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("scene", scene);
  Check.defined("entityCollection", entityCollection);
  //>>includeEnd('debug');

  primitives = primitives ?? scene.primitives;
  groundPrimitives = groundPrimitives ?? scene.groundPrimitives;

  this._scene = scene;
  this._primitives = primitives;
  this._groundPrimitives = groundPrimitives;
  this._entityCollection = undefined;
  // 【导读】差量三队列：collectionChanged 事件只「记账」，真正处理延迟到每帧 update（避免高频抖动）。
  this._addedObjects = new AssociativeArray();
  this._removedObjects = new AssociativeArray();
  this._changedObjects = new AssociativeArray();

  // 【导读】静态几何分桶表：阴影模式(NUMBER_OF_SHADOW_MODES)×是否地形偏移 再乘「outline/closedColor/
  // 【导读】closedMaterial/openColor/openMaterial」五种渲染形态；桶的存在是为了把多个 Entity
  // 【导读】合成单个 Primitive 的 GeometryInstance 批（性能核心：同批可共用一次 draw call 的外观状态）。
  const numberOfShadowModes = ShadowMode.NUMBER_OF_SHADOW_MODES;
  this._outlineBatches = new Array(numberOfShadowModes * 2);
  this._closedColorBatches = new Array(numberOfShadowModes * 2);
  this._closedMaterialBatches = new Array(numberOfShadowModes * 2);
  this._openColorBatches = new Array(numberOfShadowModes * 2);
  this._openMaterialBatches = new Array(numberOfShadowModes * 2);

  const supportsMaterialsforEntitiesOnTerrain =
    Entity.supportsMaterialsforEntitiesOnTerrain(scene);
  this._supportsMaterialsforEntitiesOnTerrain =
    supportsMaterialsforEntitiesOnTerrain;

  let i;
  for (i = 0; i < numberOfShadowModes; ++i) {
    this._outlineBatches[i] = new StaticOutlineGeometryBatch(
      primitives,
      scene,
      i,
      false,
    );
    this._outlineBatches[numberOfShadowModes + i] =
      new StaticOutlineGeometryBatch(primitives, scene, i, true);

    this._closedColorBatches[i] = new StaticGeometryColorBatch(
      primitives,
      PerInstanceColorAppearance,
      undefined,
      true,
      i,
      true,
    );
    this._closedColorBatches[numberOfShadowModes + i] =
      new StaticGeometryColorBatch(
        primitives,
        PerInstanceColorAppearance,
        undefined,
        true,
        i,
        false,
      );

    this._closedMaterialBatches[i] = new StaticGeometryPerMaterialBatch(
      primitives,
      MaterialAppearance,
      undefined,
      true,
      i,
      true,
    );
    this._closedMaterialBatches[numberOfShadowModes + i] =
      new StaticGeometryPerMaterialBatch(
        primitives,
        MaterialAppearance,
        undefined,
        true,
        i,
        false,
      );

    this._openColorBatches[i] = new StaticGeometryColorBatch(
      primitives,
      PerInstanceColorAppearance,
      undefined,
      false,
      i,
      true,
    );
    this._openColorBatches[numberOfShadowModes + i] =
      new StaticGeometryColorBatch(
        primitives,
        PerInstanceColorAppearance,
        undefined,
        false,
        i,
        false,
      );

    this._openMaterialBatches[i] = new StaticGeometryPerMaterialBatch(
      primitives,
      MaterialAppearance,
      undefined,
      false,
      i,
      true,
    );
    this._openMaterialBatches[numberOfShadowModes + i] =
      new StaticGeometryPerMaterialBatch(
        primitives,
        MaterialAppearance,
        undefined,
        false,
        i,
        false,
      );
  }

  // 【导读】贴地批次：按 ClassificationType（贴地形/贴 3D Tiles/两者）分桶；
  // 【导读】材质批仅在支持材质贴地时创建（Entity.supportsMaterialsforEntitiesOnTerrain）。
  const numberOfClassificationTypes =
    ClassificationType.NUMBER_OF_CLASSIFICATION_TYPES;
  const groundColorBatches = new Array(numberOfClassificationTypes);
  const groundMaterialBatches = [];
  if (supportsMaterialsforEntitiesOnTerrain) {
    for (i = 0; i < numberOfClassificationTypes; ++i) {
      groundMaterialBatches.push(
        new StaticGroundGeometryPerMaterialBatch(
          groundPrimitives,
          i,
          MaterialAppearance,
        ),
      );
      groundColorBatches[i] = new StaticGroundGeometryColorBatch(
        groundPrimitives,
        i,
      );
    }
  } else {
    for (i = 0; i < numberOfClassificationTypes; ++i) {
      groundColorBatches[i] = new StaticGroundGeometryColorBatch(
        groundPrimitives,
        i,
      );
    }
  }

  this._groundColorBatches = groundColorBatches;
  this._groundMaterialBatches = groundMaterialBatches;

  // 【导读】动态几何（属性随时间变化的 Entity）不进合批，单独每帧重建 Primitive。
  this._dynamicBatch = new DynamicGeometryBatch(primitives, groundPrimitives);

  this._batches = this._outlineBatches.concat(
    this._closedColorBatches,
    this._closedMaterialBatches,
    this._openColorBatches,
    this._openMaterialBatches,
    this._groundColorBatches,
    this._groundMaterialBatches,
    this._dynamicBatch,
  );

  this._subscriptions = new AssociativeArray();
  this._updaterSets = new AssociativeArray();

  // 【导读】监听集合变化并立即回放存量实体（构造时把已有 Entity 全部当作 added 记账）。
  this._entityCollection = entityCollection;
  entityCollection.collectionChanged.addEventListener(
    GeometryVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(
    entityCollection,
    entityCollection.values,
    emptyArray,
  );
}

/**
 * Add the provided updater to the default list of updaters if not already included
 * @private
 * @param {GeometryUpdater} updater
 */
GeometryVisualizer.registerUpdater = function (updater) {
  GeometryUpdaterSet.registerUpdater(updater);
};

/**
 * Remove the provided updater from the default list of updaters if included
 * @private
 * @param {GeometryUpdater} updater
 */
GeometryVisualizer.unregisterUpdater = function (updater) {
  GeometryUpdaterSet.unregisterUpdater(updater);
};

/**
 * Updates all of the primitives created by this visualizer to match their
 * Entity counterpart at the given time.
 *
 * @param {JulianDate} time The time to update to.
 * @returns {boolean} True if the visualizer successfully updated to the provided time,
 * false if the visualizer is waiting for asynchronous primitives to be created.
 */
  // 【导读】每帧同步主体，四步：①处理 changed 队列（重插桶）；注意同帧「同 id 删旧加新」的拆分处理；
  // 【导读】②removed：销毁 updaterSet、退订；③added：new GeometryUpdaterSet（每种几何一个 updater）
  // 【导读】并立即插入对应批次桶；④逐批 update 差量重建（返回 false 表示异步 Primitive 还没就绪）。
GeometryVisualizer.prototype.update = function (time) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("time", time);
  //>>includeEnd('debug');

  const addedObjects = this._addedObjects;
  const added = addedObjects.values;
  const removedObjects = this._removedObjects;
  const removed = removedObjects.values;
  const changedObjects = this._changedObjects;
  const changed = changedObjects.values;

  let i;
  let entity;
  let id;
  let updaterSet;
  const that = this;

  for (i = changed.length - 1; i > -1; i--) {
    entity = changed[i];
    id = entity.id;
    updaterSet = this._updaterSets.get(id);

    //If in a single update, an entity gets removed and a new instance
    //re-added with the same id, the updater no longer tracks the
    //correct entity, we need to both remove the old one and
    //add the new one, which is done by pushing the entity
    //onto the removed/added lists.
    //If in a single update, an entity gets removed and a new instance
    //re-added with the same id, the updater no longer tracks the
    //correct entity, we need to both remove the old one and
    //add the new one, which is done by pushing the entity
    //onto the removed/added lists.
    // 【导读】同帧内同 id 实体「删旧+加新」：updaterSet 还挂着旧实体，必须拆成一次 remove+一次 add。
    if (updaterSet.entity === entity) {
      updaterSet.forEach(function (updater) {
        that._removeUpdater(updater);
        that._insertUpdaterIntoBatch(time, updater);
      });
    } else {
      removed.push(entity);
      added.push(entity);
    }
  }

  for (i = removed.length - 1; i > -1; i--) {
    entity = removed[i];
    id = entity.id;
    updaterSet = this._updaterSets.get(id);
    // 【导读】removed 处理：从所有桶拔除（_removeUpdater 不记录在哪个桶，索性挨个试）→销毁 updaterSet→退订。
    updaterSet.forEach(this._removeUpdater.bind(this));
    updaterSet.destroy();
    this._updaterSets.remove(id);
    this._subscriptions.get(id)();
    this._subscriptions.remove(id);
  }

  for (i = added.length - 1; i > -1; i--) {
    entity = added[i];
    id = entity.id;
    // 【导读】added 处理：为实体建 GeometryUpdaterSet（内含 box/Corridor/…全部 10 种 updater，
    // 【导读】见 GeometryUpdaterSet.js），并把启用的 updater 分发进对应批次桶，再订 geometryChanged。
    updaterSet = new GeometryUpdaterSet(entity, this._scene);
    this._updaterSets.set(id, updaterSet);
    updaterSet.forEach(function (updater) {
      that._insertUpdaterIntoBatch(time, updater);
    });
    this._subscriptions.set(
      id,
      updaterSet.geometryChanged.addEventListener(
        GeometryVisualizer._onGeometryChanged,
        this,
      ),
    );
  }

  addedObjects.removeAll();
  removedObjects.removeAll();
  changedObjects.removeAll();

  let isUpdated = true;
  const batches = this._batches;
  const length = batches.length;
  for (i = 0; i < length; i++) {
    isUpdated = batches[i].update(time) && isUpdated;
  }

  return isUpdated;
};

const getBoundingSphereArrayScratch = [];
const getBoundingSphereBoundingSphereScratch = new BoundingSphere();

/**
 * Computes a bounding sphere which encloses the visualization produced for the specified entity.
 * The bounding sphere is in the fixed frame of the scene's globe.
 *
 * @param {Entity} entity The entity whose bounding sphere to compute.
 * @param {BoundingSphere} result The bounding sphere onto which to store the result.
 * @returns {BoundingSphereState} BoundingSphereState.DONE if the result contains the bounding sphere,
 *                       BoundingSphereState.PENDING if the result is still being computed, or
 *                       BoundingSphereState.FAILED if the entity has no visualization in the current scene.
 * @private
 */
GeometryVisualizer.prototype.getBoundingSphere = function (entity, result) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("entity", entity);
  Check.defined("result", result);
  //>>includeEnd('debug');

  const boundingSpheres = getBoundingSphereArrayScratch;
  const tmp = getBoundingSphereBoundingSphereScratch;

  let count = 0;
  let state;
  const batches = this._batches;
  const batchesLength = batches.length;

  const id = entity.id;
  const updaters = this._updaterSets.get(id).updaters;

  for (let j = 0; j < updaters.length; j++) {
    const updater = updaters[j];
    for (let i = 0; i < batchesLength; i++) {
      state = batches[i].getBoundingSphere(updater, tmp);
      if (state === BoundingSphereState.PENDING) {
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

/**
 * Returns true if this object was destroyed; otherwise, false.
 *
 * @returns {boolean} True if this object was destroyed; otherwise, false.
 */
GeometryVisualizer.prototype.isDestroyed = function () {
  return false;
};

/**
 * Removes and destroys all primitives created by this instance.
 */
GeometryVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    GeometryVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._addedObjects.removeAll();
  this._removedObjects.removeAll();

  let i;
  const batches = this._batches;
  let length = batches.length;
  for (i = 0; i < length; i++) {
    batches[i].removeAllPrimitives();
  }

  const subscriptions = this._subscriptions.values;
  length = subscriptions.length;
  for (i = 0; i < length; i++) {
    subscriptions[i]();
  }
  this._subscriptions.removeAll();

  const updaterSets = this._updaterSets.values;
  length = updaterSets.length;
  for (i = 0; i < length; i++) {
    updaterSets[i].destroy();
  }
  this._updaterSets.removeAll();
  return destroyObject(this);
};

/**
 * @private
 */
GeometryVisualizer.prototype._removeUpdater = function (updater) {
  //We don't keep track of which batch an updater is in, so just remove it from all of them.
  const batches = this._batches;
  const length = batches.length;
  for (let i = 0; i < length; i++) {
    batches[i].remove(updater);
  }
};

/**
 * @private
 */
GeometryVisualizer.prototype._insertUpdaterIntoBatch = function (
  time,
  updater,
) {
  if (updater.isDynamic) {
    this._dynamicBatch.add(time, updater);
    return;
  }

  // 【导读】静态/动态分桶路由：updater.isDynamic（几何属性非常量，见各 Updater 的 _isDynamic）
  // 【导读】→动态批；否则按「贴地(onTerrain) / 闭合体(isClosed) / 开放体」×「纯色 ColorMaterial 还是
  // 【导读】任意材质」×「阴影模式」×「有无地形偏移 terrainOffsetProperty」定位到具体静态桶。
  // 【导读】静态桶合批渲染省 draw call，动态桶每帧重建保证正确性——以空间换时间的取舍。
  // 【导读】桶类型速查：_outlineBatches=纯线框；_groundColor/MaterialBatches=贴地；
  // 【导读】_closed*=闭合实体（可遮挡内部）；_open*=面片（不闭合）。
  let shadows;
  if (updater.outlineEnabled || updater.fillEnabled) {
    shadows = updater.shadowsProperty.getValue(time);
  }

  const numberOfShadowModes = ShadowMode.NUMBER_OF_SHADOW_MODES;
  if (updater.outlineEnabled) {
    if (defined(updater.terrainOffsetProperty)) {
      this._outlineBatches[numberOfShadowModes + shadows].add(time, updater);
    } else {
      this._outlineBatches[shadows].add(time, updater);
    }
  }

  if (updater.fillEnabled) {
    if (updater.onTerrain) {
      const classificationType =
        updater.classificationTypeProperty.getValue(time);
      if (updater.fillMaterialProperty instanceof ColorMaterialProperty) {
        this._groundColorBatches[classificationType].add(time, updater);
      } else {
        // If unsupported, updater will not be on terrain.
        this._groundMaterialBatches[classificationType].add(time, updater);
      }
    } else if (updater.isClosed) {
      if (updater.fillMaterialProperty instanceof ColorMaterialProperty) {
        if (defined(updater.terrainOffsetProperty)) {
          this._closedColorBatches[numberOfShadowModes + shadows].add(
            time,
            updater,
          );
        } else {
          this._closedColorBatches[shadows].add(time, updater);
        }
      } else if (defined(updater.terrainOffsetProperty)) {
        this._closedMaterialBatches[numberOfShadowModes + shadows].add(
          time,
          updater,
        );
      } else {
        this._closedMaterialBatches[shadows].add(time, updater);
      }
    } else if (updater.fillMaterialProperty instanceof ColorMaterialProperty) {
      if (defined(updater.terrainOffsetProperty)) {
        this._openColorBatches[numberOfShadowModes + shadows].add(
          time,
          updater,
        );
      } else {
        this._openColorBatches[shadows].add(time, updater);
      }
    } else if (defined(updater.terrainOffsetProperty)) {
      this._openMaterialBatches[numberOfShadowModes + shadows].add(
        time,
        updater,
      );
    } else {
      this._openMaterialBatches[shadows].add(time, updater);
    }
  }
};

/**
 * @private
 */
  // 【导读】updater 的 geometryChanged 触发（如 hierarchy 变了）：记入 changed 队列，下帧 update 重插桶。
GeometryVisualizer._onGeometryChanged = function (updater) {
  const removedObjects = this._removedObjects;
  const changedObjects = this._changedObjects;

  const entity = updater.entity;
  const id = entity.id;

  if (!defined(removedObjects.get(id)) && !defined(changedObjects.get(id))) {
    changedObjects.set(id, entity);
  }
};

/**
 * @private
 */
  // 【导读】collectionChanged 监听：纯记账（不重建几何）——增删改先入三个队列，
  // 【导读】注意「同帧内删除又加回」折算成 changed 的合并逻辑，等每帧 update 统一消费。
GeometryVisualizer.prototype._onCollectionChanged = function (
  entityCollection,
  added,
  removed,
) {
  const addedObjects = this._addedObjects;
  const removedObjects = this._removedObjects;
  const changedObjects = this._changedObjects;

  let i;
  let id;
  let entity;
  for (i = removed.length - 1; i > -1; i--) {
    entity = removed[i];
    id = entity.id;
    if (!addedObjects.remove(id)) {
      removedObjects.set(id, entity);
      changedObjects.remove(id);
    }
  }

  for (i = added.length - 1; i > -1; i--) {
    entity = added[i];
    id = entity.id;
    if (removedObjects.remove(id)) {
      changedObjects.set(id, entity);
    } else {
      addedObjects.set(id, entity);
    }
  }
};
export default GeometryVisualizer;
