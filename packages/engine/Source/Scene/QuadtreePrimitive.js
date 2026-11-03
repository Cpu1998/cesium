// ═══ 【导读】QuadtreePrimitive.js —— 地球表面瓦片的四叉树调度器（简注）═══
// 【导读】职责：管理 levelZeroTiles 根瓦片，每帧从根开始「可见性→屏幕空间误差(SSE)→细分/渲染」遍历
// 【导读】（selectTilesForRendering→visitIfVisible→visitTile），并把待加载瓦片分三个优先级队列：
// 【导读】High=阻碍细分、Medium=本帧要画/相机所在、Low=预加载的兄弟瓦片；时间片轮转 processTileLoadQueue 逐帧消化，
// 【导读】最终调 tileProvider（即 GlobeSurfaceTileProvider）的 loadTile/showTileThisFrame 等接口。
// 【导读】缓存淘汰靠 TileReplacementQueue（tileCacheSize 控制），纯上采样瓦片不会触发细分。
// 【导读】本文件是「地形+影像共用」的调度骨架；Scene 帧循环、render pass 编排属第 5 棒深挖，此处不展开。
// 【导读】配合阅读 study/02-底图与影像体系.md §3（生命周期）与 §7（与 Viewer API 对照）。
import Cartesian3 from "../Core/Cartesian3.js";
import Cartographic from "../Core/Cartographic.js";
import defined from "../Core/defined.js";
import DeveloperError from "../Core/DeveloperError.js";
import Event from "../Core/Event.js";
import getTimestamp from "../Core/getTimestamp.js";
import CesiumMath from "../Core/Math.js";
import Matrix4 from "../Core/Matrix4.js";
import OrthographicFrustum from "../Core/OrthographicFrustum.js";
import OrthographicOffCenterFrustum from "../Core/OrthographicOffCenterFrustum.js";
import Ray from "../Core/Ray.js";
import Rectangle from "../Core/Rectangle.js";
import Visibility from "../Core/Visibility.js";
import QuadtreeOccluders from "./QuadtreeOccluders.js";
import QuadtreeTile from "./QuadtreeTile.js";
import QuadtreeTileLoadState from "./QuadtreeTileLoadState.js";
import SceneMode from "./SceneMode.js";
import TileReplacementQueue from "./TileReplacementQueue.js";
import TileSelectionResult from "./TileSelectionResult.js";

/**
 * Renders massive sets of data by utilizing level-of-detail and culling.  The globe surface is divided into
 * a quadtree of tiles with large, low-detail tiles at the root and small, high-detail tiles at the leaves.
 * The set of tiles to render is selected by projecting an estimate of the geometric error in a tile onto
 * the screen to estimate screen-space error, in pixels, which must be below a user-specified threshold.
 * The actual content of the tiles is arbitrary and is specified using a {@link QuadtreeTileProvider}.
 *
 * @alias QuadtreePrimitive
 * @constructor
 * @private
 *
 * @param {QuadtreeTileProvider} options.tileProvider The tile provider that loads, renders, and estimates
 *        the distance to individual tiles.
 * @param {number} [options.maximumScreenSpaceError=2] The maximum screen-space error, in pixels, that is allowed.
 *        A higher maximum error will render fewer tiles and improve performance, while a lower
 *        value will improve visual quality.
 * @param {number} [options.tileCacheSize=100] The maximum number of tiles that will be retained in the tile cache.
 *        Note that tiles will never be unloaded if they were used for rendering the last
 *        frame, so the actual number of resident tiles may be higher.  The value of
 *        this property will not affect visual quality.
 */
function QuadtreePrimitive(options) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(options) || !defined(options.tileProvider)) {
    throw new DeveloperError("options.tileProvider is required.");
  }
  if (defined(options.tileProvider.quadtree)) {
    throw new DeveloperError(
      "A QuadtreeTileProvider can only be used with a single QuadtreePrimitive",
    );
  }
  //>>includeEnd('debug');

  this._tileProvider = options.tileProvider;
  this._tileProvider.quadtree = this;

  this._debug = {
    enableDebugOutput: false,

    maxDepth: 0,
    maxDepthVisited: 0,
    tilesVisited: 0,
    tilesCulled: 0,
    tilesRendered: 0,
    tilesWaitingForChildren: 0,

    lastMaxDepth: -1,
    lastMaxDepthVisited: -1,
    lastTilesVisited: -1,
    lastTilesCulled: -1,
    lastTilesRendered: -1,
    lastTilesWaitingForChildren: -1,

    suspendLodUpdate: false,
  };

  const tilingScheme = this._tileProvider.tilingScheme;
  const ellipsoid = tilingScheme.ellipsoid;

  this._tilesRenderedThisFrame = new Set(); // collect all tiles selected to render (useful when multiple render calls are made in a single frame (as in 2D mode))
  this._tilesToRender = [];
  this._tileLoadQueueHigh = []; // high priority tiles are preventing refinement
  // 【导读】三优先级加载队列（High/Medium/Low）+ LRU 淘汰队列（_tileReplacementQueue，tileCacheSize 控制保留瓦片数）。
  // 【导读】maximumScreenSpaceError（默认 2px）是细分门槛：SSE 越小画质越精细、瓦片越多。
  this._tileLoadQueueMedium = []; // medium priority tiles are being rendered
  this._tileLoadQueueLow = []; // low priority tiles were refined past or are non-visible parts of quads.
  this._tileReplacementQueue = new TileReplacementQueue();
  this._levelZeroTiles = undefined;
  this._loadQueueTimeSlice = 5.0;
  this._tilesInvalidated = false;

  this._addHeightCallbacks = [];
  this._removeHeightCallbacks = [];

  this._tileToUpdateHeights = [];
  this._updateHeightsTimeSlice = 2.0;

  // If a culled tile contains _cameraPositionCartographic or _cameraReferenceFrameOriginCartographic, it will be marked
  // TileSelectionResult.CULLED_BUT_NEEDED and added to the list of tiles to update heights,
  // even though it is not rendered.
  // These are updated each frame in `selectTilesForRendering`.
  this._cameraPositionCartographic = undefined;
  this._cameraReferenceFrameOriginCartographic = undefined;

  /**
   * Gets or sets the maximum screen-space error, in pixels, that is allowed.
   * A higher maximum error will render fewer tiles and improve performance, while a lower
   * value will improve visual quality.
   * @type {number}
   * @default 2
   */
  this.maximumScreenSpaceError = options.maximumScreenSpaceError ?? 2;

  /**
   * Gets or sets the maximum number of tiles that will be retained in the tile cache.
   * Note that tiles will never be unloaded if they were used for rendering the last
   * frame, so the actual number of resident tiles may be higher.  The value of
   * this property will not affect visual quality.
   * @type {number}
   * @default 100
   */
  this.tileCacheSize = options.tileCacheSize ?? 100;

  /**
   * Gets or sets the number of loading descendant tiles that is considered "too many".
   * If a tile has too many loading descendants, that tile will be loaded and rendered before any of
   * its descendants are loaded and rendered. This means more feedback for the user that something
   * is happening at the cost of a longer overall load time. Setting this to 0 will cause each
   * tile level to be loaded successively, significantly increasing load time. Setting it to a large
   * number (e.g. 1000) will minimize the number of tiles that are loaded but tend to make
   * detail appear all at once after a long wait.
   * @type {number}
   * @default 20
   */
  this.loadingDescendantLimit = 20;

  /**
   * Gets or sets a value indicating whether the ancestors of rendered tiles should be preloaded.
   * Setting this to true optimizes the zoom-out experience and provides more detail in
   * newly-exposed areas when panning. The down side is that it requires loading more tiles.
   * @type {boolean}
   * @default true
   */
  this.preloadAncestors = true;

  /**
   * Gets or sets a value indicating whether the siblings of rendered tiles should be preloaded.
   * Setting this to true causes tiles with the same parent as a rendered tile to be loaded, even
   * if they are culled. Setting this to true may provide a better panning experience at the
   * cost of loading more tiles.
   * @type {boolean}
   * @default false
   */
  this.preloadSiblings = false;

  this._occluders = new QuadtreeOccluders({
    ellipsoid: ellipsoid,
  });

  this._tileLoadProgressEvent = new Event();
  this._lastTileLoadQueueLength = 0;

  this._lastSelectionFrameNumber = undefined;
}

Object.defineProperties(QuadtreePrimitive.prototype, {
  /**
   * Gets the provider of {@link QuadtreeTile} instances for this quadtree.
   * @type {QuadtreeTile}
   * @memberof QuadtreePrimitive.prototype
   */
  tileProvider: {
    get: function () {
      return this._tileProvider;
    },
  },
  /**
   * Gets an event that's raised when the length of the tile load queue has changed since the last render frame.  When the load queue is empty,
   * all terrain and imagery for the current view have been loaded.  The event passes the new length of the tile load queue.
   *
   * @memberof QuadtreePrimitive.prototype
   * @type {Event}
   */
  tileLoadProgressEvent: {
    get: function () {
      return this._tileLoadProgressEvent;
    },
  },

  occluders: {
    get: function () {
      return this._occluders;
    },
  },
});

/**
 * Invalidates and frees all the tiles in the quadtree.  The tiles must be reloaded
 * before they can be displayed.
 *
 * @memberof QuadtreePrimitive
 */
QuadtreePrimitive.prototype.invalidateAllTiles = function () {
  this._tilesInvalidated = true;
};

function invalidateAllTiles(primitive) {
  // Clear the replacement queue
  const replacementQueue = primitive._tileReplacementQueue;
  replacementQueue.head = undefined;
  replacementQueue.tail = undefined;
  replacementQueue.count = 0;

  clearTileLoadQueue(primitive);

  // Free and recreate the level zero tiles.
  const levelZeroTiles = primitive._levelZeroTiles;
  if (defined(levelZeroTiles)) {
    for (let i = 0; i < levelZeroTiles.length; ++i) {
      const tile = levelZeroTiles[i];
      const customData = tile.customData;

      for (const data of customData) {
        data.level = 0;
        primitive._addHeightCallbacks.push(data);
      }

      levelZeroTiles[i].freeResources();
    }
  }

  primitive._levelZeroTiles = undefined;

  primitive._tileProvider.cancelReprojections();
}

/**
 * Invokes a specified function for each {@link QuadtreeTile} that is partially
 * or completely loaded.
 *
 * @param {Function} tileFunction The function to invoke for each loaded tile.  The
 *        function is passed a reference to the tile as its only parameter.
 */
QuadtreePrimitive.prototype.forEachLoadedTile = function (tileFunction) {
  let tile = this._tileReplacementQueue.head;
  while (defined(tile)) {
    if (tile.state !== QuadtreeTileLoadState.START) {
      tileFunction(tile);
    }
    tile = tile.replacementNext;
  }
};

/**
 * Invokes a specified function for each {@link QuadtreeTile} that was rendered
 * in the most recent frame.
 *
 * @param {Function} tileFunction The function to invoke for each rendered tile.  The
 *        function is passed a reference to the tile as its only parameter.
 */
QuadtreePrimitive.prototype.forEachRenderedTile = function (tileFunction) {
  const tilesRendered = this._tilesRenderedThisFrame;
  for (const tile of tilesRendered) {
    tileFunction(tile);
  }
};

/**
 * Calls the callback when a new tile is rendered that contains the given cartographic. The only parameter
 * is the cartesian position on the tile.
 *
 * @param {Cartographic} cartographic The cartographic position.
 * @param {Function} callback The function to be called when a new tile is loaded containing the updated cartographic.
 * @returns {Function} The function to remove this callback from the quadtree.
 */
QuadtreePrimitive.prototype.updateHeight = function (cartographic, callback) {
  const primitive = this;
  const object = {
    positionOnEllipsoidSurface: undefined,
    positionCartographic: cartographic,
    level: -1,
    callback: callback,
  };

  object.removeFunc = function () {
    const addedCallbacks = primitive._addHeightCallbacks;
    const length = addedCallbacks.length;
    for (let i = 0; i < length; ++i) {
      if (addedCallbacks[i] === object) {
        addedCallbacks.splice(i, 1);
        break;
      }
    }
    primitive._removeHeightCallbacks.push(object);
    if (object.callback) {
      object.callback = undefined;
    }
  };

  primitive._addHeightCallbacks.push(object);
  return object.removeFunc;
};

/**
 * Updates the tile provider imagery and continues to process the tile load queue.
 * @private
 */
QuadtreePrimitive.prototype.update = function (frameState) {
  // 【导读】每帧前置钩子：只透传给 tileProvider.update（GlobeSurfaceTileProvider 用它做集合 _update）。
  if (defined(this._tileProvider.update)) {
    this._tileProvider.update(frameState);
  }
};

function clearTileLoadQueue(primitive) {
  const debug = primitive._debug;
  debug.maxDepth = 0;
  debug.maxDepthVisited = 0;
  debug.tilesVisited = 0;
  debug.tilesCulled = 0;
  debug.tilesRendered = 0;
  debug.tilesWaitingForChildren = 0;

  primitive._tileLoadQueueHigh.length = 0;
  primitive._tileLoadQueueMedium.length = 0;
  primitive._tileLoadQueueLow.length = 0;
}

/**
 * Initializes values for a new render frame and prepare the tile load queue.
 * @private
 */
QuadtreePrimitive.prototype.beginFrame = function (frameState) {
  // 【导读】第 5 棒补注：帧调度三步之一。调用链 Scene.render(scene)→globe.beginFrame→这里（仅 render pass）：
  // 【导读】瓦片失效重建→tileProvider.initialize（影像重投影命令）→清空三队列→LRU 标记帧起点。
  const passes = frameState.passes;
  if (!passes.render) {
    return;
  }

  if (this._tilesInvalidated) {
    invalidateAllTiles(this);
    this._tilesInvalidated = false;
  }

  // Gets commands for any texture re-projections
  this._tileProvider.initialize(frameState);

  clearTileLoadQueue(this);

  if (this._debug.suspendLodUpdate) {
    return;
  }

  this._tileReplacementQueue.markStartOfRenderFrame();
  this._tilesRenderedThisFrame.clear();
};

/**
 * Selects new tiles to load based on the frame state and creates render commands.
 * @private
 */
QuadtreePrimitive.prototype.render = function (frameState) {
  // 【导读】帧调度三步之二。调用链 executeCommandsInViewport→updateAndRenderPrimitives→globe.render→这里：
  // 【导读】selectTilesForRendering（SSE 遍历选瓦片，邻接/可见性判定都在此发生）→createRenderCommandsForSelectedTiles
  // 【导读】→tileProvider.addDrawCommandsForTile 把 DrawCommand 塞进 frameState.commandList 等待剔除分类。
  const passes = frameState.passes;
  const tileProvider = this._tileProvider;

  if (passes.render) {
    tileProvider.beginUpdate(frameState);

    selectTilesForRendering(this, frameState);
    createRenderCommandsForSelectedTiles(this, frameState);

    tileProvider.endUpdate(frameState);
  }

  if (passes.pick && this._tilesToRender.length > 0) {
    tileProvider.updateForPick(frameState);
  }
};

/**
 * Checks if the load queue length has changed since the last time we raised a queue change event - if so, raises
 * a new change event at the end of the render cycle.
 * @private
 */
function updateTileLoadProgress(primitive, frameState) {
  const currentLoadQueueLength =
    primitive._tileLoadQueueHigh.length +
    primitive._tileLoadQueueMedium.length +
    primitive._tileLoadQueueLow.length;

  if (
    currentLoadQueueLength !== primitive._lastTileLoadQueueLength ||
    primitive._tilesInvalidated
  ) {
    const raiseEvent = Event.prototype.raiseEvent.bind(
      primitive._tileLoadProgressEvent,
      currentLoadQueueLength,
    );
    frameState.afterRender.push(() => {
      raiseEvent();
      return true;
    });
    primitive._lastTileLoadQueueLength = currentLoadQueueLength;
  }

  const debug = primitive._debug;
  if (debug.enableDebugOutput && !debug.suspendLodUpdate) {
    debug.maxDepth = primitive._tilesToRender.reduce(function (max, tile) {
      return Math.max(max, tile.level);
    }, -1);
    debug.tilesRendered = primitive._tilesToRender.length;

    if (
      debug.tilesVisited !== debug.lastTilesVisited ||
      debug.tilesRendered !== debug.lastTilesRendered ||
      debug.tilesCulled !== debug.lastTilesCulled ||
      debug.maxDepth !== debug.lastMaxDepth ||
      debug.tilesWaitingForChildren !== debug.lastTilesWaitingForChildren ||
      debug.maxDepthVisited !== debug.lastMaxDepthVisited
    ) {
      console.log(
        `Visited ${debug.tilesVisited}, Rendered: ${debug.tilesRendered}, Culled: ${debug.tilesCulled}, Max Depth Rendered: ${debug.maxDepth}, Max Depth Visited: ${debug.maxDepthVisited}, Waiting for children: ${debug.tilesWaitingForChildren}`,
      );

      debug.lastTilesVisited = debug.tilesVisited;
      debug.lastTilesRendered = debug.tilesRendered;
      debug.lastTilesCulled = debug.tilesCulled;
      debug.lastMaxDepth = debug.maxDepth;
      debug.lastTilesWaitingForChildren = debug.tilesWaitingForChildren;
      debug.lastMaxDepthVisited = debug.maxDepthVisited;
    }
  }
}

/**
 * Updates terrain heights.
 * @private
 */
QuadtreePrimitive.prototype.endFrame = function (frameState) {
  // 【导读】帧调度三步之三。调用链 Scene.render(scene) 末尾→globe.endFrame→这里：
  // 【导读】processTileLoadQueue（时间片加载，经 RequestScheduler 发网络请求）+ updateHeights + 进度事件。
  const passes = frameState.passes;
  if (!passes.render || frameState.mode === SceneMode.MORPHING) {
    // Only process the load queue for a single pass.
    // Don't process the load queue or update heights during the morph flights.
    return;
  }

  // Load/create resources for terrain and imagery. Prepare texture re-projections for the next frame.
  processTileLoadQueue(this, frameState);
  updateHeights(this, frameState);
  updateTileLoadProgress(this, frameState);
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @memberof QuadtreePrimitive
 *
 * @returns {boolean} True if this object was destroyed; otherwise, false.
 *
 * @see QuadtreePrimitive#destroy
 */
QuadtreePrimitive.prototype.isDestroyed = function () {
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
 * @memberof QuadtreePrimitive
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 *
 * @example
 * primitive = primitive && primitive.destroy();
 *
 * @see QuadtreePrimitive#isDestroyed
 */
QuadtreePrimitive.prototype.destroy = function () {
  this._tileProvider = this._tileProvider && this._tileProvider.destroy();
};

let comparisonPoint;
const centerScratch = new Cartographic();
function compareDistanceToPoint(a, b) {
  let center = Rectangle.center(a.rectangle, centerScratch);
  const alon = center.longitude - comparisonPoint.longitude;
  const alat = center.latitude - comparisonPoint.latitude;

  center = Rectangle.center(b.rectangle, centerScratch);
  const blon = center.longitude - comparisonPoint.longitude;
  const blat = center.latitude - comparisonPoint.latitude;

  return alon * alon + alat * alat - (blon * blon + blat * blat);
}

const cameraOriginScratch = new Cartesian3();
let rootTraversalDetails = [];

function selectTilesForRendering(primitive, frameState) {
  // 【导读】每帧选瓦片：首次帧时由 tilingScheme 建 levelZeroTiles（Geographic 2 块/WebMercator 1 块），
  // 【导读】根瓦片按相机距离近→远排序后深度优先 visitIfVisible（远→近排序保证优先级/遮挡判断稳定）。
  const debug = primitive._debug;
  if (debug.suspendLodUpdate) {
    return;
  }

  // Clear the render list.
  const tilesToRender = primitive._tilesToRender;
  tilesToRender.length = 0;

  // We can't render anything before the level zero tiles exist.
  const tileProvider = primitive._tileProvider;
  if (!defined(primitive._levelZeroTiles)) {
    const tilingScheme = tileProvider.tilingScheme;
    if (defined(tilingScheme)) {
      const tilingScheme = tileProvider.tilingScheme;
      primitive._levelZeroTiles =
        QuadtreeTile.createLevelZeroTiles(tilingScheme);
      const numberOfRootTiles = primitive._levelZeroTiles.length;
      if (rootTraversalDetails.length < numberOfRootTiles) {
        rootTraversalDetails = new Array(numberOfRootTiles);
        for (let i = 0; i < numberOfRootTiles; ++i) {
          if (rootTraversalDetails[i] === undefined) {
            rootTraversalDetails[i] = new TraversalDetails();
          }
        }
      }
    } else {
      return;
    }
  }

  primitive._occluders.ellipsoid.cameraPosition = frameState.camera.positionWC;

  const levelZeroTiles = primitive._levelZeroTiles;
  const occluders =
    levelZeroTiles.length > 1 ? primitive._occluders : undefined;

  // Sort the level zero tiles by the distance from the center to the camera.
  // The level zero tiles aren't necessarily a nice neat quad, so we can't use the
  // quadtree ordering we use elsewhere in the tree
  comparisonPoint = frameState.camera.positionCartographic;
  levelZeroTiles.sort(compareDistanceToPoint);

  const customDataAdded = primitive._addHeightCallbacks;
  const customDataRemoved = primitive._removeHeightCallbacks;

  customDataAdded.forEach((data) => {
    const tile = levelZeroTiles.find((tile) =>
      Rectangle.contains(tile.rectangle, data.positionCartographic),
    );
    if (tile) {
      tile._addedCustomData.push(data);
    }
  });

  customDataRemoved.forEach((data) => {
    const tile = levelZeroTiles.find((tile) =>
      Rectangle.contains(tile.rectangle, data.positionCartographic),
    );
    if (tile) {
      tile._removedCustomData.push(data);
    }
  });

  levelZeroTiles.forEach((tile) => tile.updateCustomData());
  customDataAdded.length = 0;
  customDataRemoved.length = 0;

  const camera = frameState.camera;

  primitive._cameraPositionCartographic = camera.positionCartographic;
  const cameraFrameOrigin = Matrix4.getTranslation(
    camera.transform,
    cameraOriginScratch,
  );
  primitive._cameraReferenceFrameOriginCartographic =
    primitive.tileProvider.tilingScheme.ellipsoid.cartesianToCartographic(
      cameraFrameOrigin,
      primitive._cameraReferenceFrameOriginCartographic,
    );

  // Traverse in depth-first, near-to-far order.
  for (let i = 0; i < levelZeroTiles.length; ++i) {
    const tile = levelZeroTiles[i];
    primitive._tileReplacementQueue.markTileRendered(tile);
    if (!tile.renderable) {
      queueTileLoad(primitive, primitive._tileLoadQueueHigh, tile, frameState);
      ++debug.tilesWaitingForChildren;
    } else {
      visitIfVisible(
        primitive,
        tile,
        tileProvider,
        frameState,
        occluders,
        false,
        rootTraversalDetails[i],
      );
    }
  }

  primitive._lastSelectionFrameNumber = frameState.frameNumber;
}

function queueTileLoad(primitive, queue, tile, frameState) {
  if (!tile.needsLoading) {
    return;
  }

  if (primitive.tileProvider.computeTileLoadPriority !== undefined) {
    tile._loadPriority = primitive.tileProvider.computeTileLoadPriority(
      tile,
      frameState,
    );
  }
  queue.push(tile);
}

/**
 * Tracks details of traversing a tile while selecting tiles for rendering.
 * @alias TraversalDetails
 * @constructor
 * @private
 */
function TraversalDetails() {
  /**
   * True if all selected (i.e. not culled or refined) tiles in this tile's subtree
   * are renderable. If the subtree is renderable, we'll render it; no drama.
   */
  this.allAreRenderable = true;

  /**
   * True if any tiles in this tile's subtree were rendered last frame. If any
   * were, we must render the subtree rather than this tile, because rendering
   * this tile would cause detail to vanish that was visible last frame, and
   * that's no good.
   */
  this.anyWereRenderedLastFrame = false;

  /**
   * Counts the number of selected tiles in this tile's subtree that are
   * not yet ready to be rendered because they need more loading. Note that
   * this value will _not_ necessarily be zero when
   * {@link TraversalDetails#allAreRenderable} is true, for subtle reasons.
   * When {@link TraversalDetails#allAreRenderable} and
   * {@link TraversalDetails#anyWereRenderedLastFrame} are both false, we
   * will render this tile instead of any tiles in its subtree and
   * the `allAreRenderable` value for this tile will reflect only whether _this_
   * tile is renderable. The `notYetRenderableCount` value, however, will still
   * reflect the total number of tiles that we are waiting on, including the
   * ones that we're not rendering. `notYetRenderableCount` is only reset
   * when a subtree is removed from the render queue because the
   * `notYetRenderableCount` exceeds the
   * {@link QuadtreePrimitive#loadingDescendantLimit}.
   */
  this.notYetRenderableCount = 0;
}

function TraversalQuadDetails() {
  this.southwest = new TraversalDetails();
  this.southeast = new TraversalDetails();
  this.northwest = new TraversalDetails();
  this.northeast = new TraversalDetails();
}

TraversalQuadDetails.prototype.combine = function (result) {
  const southwest = this.southwest;
  const southeast = this.southeast;
  const northwest = this.northwest;
  const northeast = this.northeast;

  result.allAreRenderable =
    southwest.allAreRenderable &&
    southeast.allAreRenderable &&
    northwest.allAreRenderable &&
    northeast.allAreRenderable;
  result.anyWereRenderedLastFrame =
    southwest.anyWereRenderedLastFrame ||
    southeast.anyWereRenderedLastFrame ||
    northwest.anyWereRenderedLastFrame ||
    northeast.anyWereRenderedLastFrame;
  result.notYetRenderableCount =
    southwest.notYetRenderableCount +
    southeast.notYetRenderableCount +
    northwest.notYetRenderableCount +
    northeast.notYetRenderableCount;
};

const traversalQuadsByLevel = new Array(31); // level 30 tiles are ~2cm wide at the equator, should be good enough.
for (let i = 0; i < traversalQuadsByLevel.length; ++i) {
  traversalQuadsByLevel[i] = new TraversalQuadDetails();
}

/**
 * Visits a tile for possible rendering. When we call this function with a tile:
 *
 *    * the tile has been determined to be visible (possibly based on a bounding volume that is not very tight-fitting)
 *    * its parent tile does _not_ meet the SSE (unless ancestorMeetsSse=true, see comments below)
 *    * the tile may or may not be renderable
 *
 * @private
 *
 * @param {Primitive} primitive The QuadtreePrimitive.
 * @param {FrameState} frameState The frame state.
 * @param {QuadtreeTile} tile The tile to visit
 * @param {boolean} ancestorMeetsSse True if a tile higher in the tile tree already met the SSE and we're refining further only
 *                  to maintain detail while that higher tile loads.
 * @param {TraversalDetails} traveralDetails On return, populated with details of how the traversal of this tile went.
 */
function visitTile(
  primitive,
  frameState,
  tile,
  ancestorMeetsSse,
  traversalDetails,
) {
  const debug = primitive._debug;

  ++debug.tilesVisited;

  primitive._tileReplacementQueue.markTileRendered(tile);
  tile.updateCustomData();

  if (tile.level > debug.maxDepthVisited) {
    debug.maxDepthVisited = tile.level;
  }

  const meetsSse =
    screenSpaceError(primitive, frameState, tile) <
    primitive.maximumScreenSpaceError;

  const southwestChild = tile.southwestChild;
  const southeastChild = tile.southeastChild;
  const northwestChild = tile.northwestChild;
  const northeastChild = tile.northeastChild;

  const lastFrame = primitive._lastSelectionFrameNumber;
  const lastFrameSelectionResult =
    tile._lastSelectionResultFrame === lastFrame
      ? tile._lastSelectionResult
      : TileSelectionResult.NONE;

  const tileProvider = primitive.tileProvider;

  if (meetsSse || ancestorMeetsSse) {
    // This tile (or an ancestor) is the one we want to render this frame, but we'll do different things depending
    // on the state of this tile and on what we did _last_ frame.

    // We can render it if _any_ of the following are true:
    // 1. We rendered it (or kicked it) last frame.
    // 2. This tile was culled last frame, or it wasn't even visited because an ancestor was culled.
    // 3. The tile is completely done loading.
    // 4. a) Terrain is ready, and
    //    b) All necessary imagery is ready. Necessary imagery is imagery that was rendered with this tile
    //       or any descendants last frame. Such imagery is required because rendering this tile without
    //       it would cause detail to disappear.
    //
    // Determining condition 4 is more expensive, so we check the others first.
    //
    // Note that even if we decide to render a tile here, it may later get "kicked" in favor of an ancestor.

    const oneRenderedLastFrame =
      TileSelectionResult.originalResult(lastFrameSelectionResult) ===
      TileSelectionResult.RENDERED;
    const twoCulledOrNotVisited =
      TileSelectionResult.originalResult(lastFrameSelectionResult) ===
        TileSelectionResult.CULLED ||
      lastFrameSelectionResult === TileSelectionResult.NONE;
    const threeCompletelyLoaded = tile.state === QuadtreeTileLoadState.DONE;

    let renderable =
      oneRenderedLastFrame || twoCulledOrNotVisited || threeCompletelyLoaded;

    if (!renderable) {
      // Check the more expensive condition 4 above. This requires details of the thing
      // we're rendering (e.g. the globe surface), so delegate it to the tile provider.
      if (defined(tileProvider.canRenderWithoutLosingDetail)) {
        renderable = tileProvider.canRenderWithoutLosingDetail(tile);
      }
    }

    if (renderable) {
      // Only load this tile if it (not just an ancestor) meets the SSE.
      if (meetsSse) {
        queueTileLoad(
          primitive,
          primitive._tileLoadQueueMedium,
          tile,
          frameState,
        );
      }
      addTileToRenderList(primitive, tile);

      traversalDetails.allAreRenderable = tile.renderable;
      traversalDetails.anyWereRenderedLastFrame =
        lastFrameSelectionResult === TileSelectionResult.RENDERED;
      traversalDetails.notYetRenderableCount = tile.renderable ? 0 : 1;

      tile._lastSelectionResultFrame = frameState.frameNumber;
      tile._lastSelectionResult = TileSelectionResult.RENDERED;

      if (!traversalDetails.anyWereRenderedLastFrame) {
        // Tile is newly-rendered this frame, so update its heights.
        primitive._tileToUpdateHeights.push(tile);
      }

      return;
    }

    // Otherwise, we can't render this tile (or its fill) because doing so would cause detail to disappear
    // that was visible last frame. Instead, keep rendering any still-visible descendants that were rendered
    // last frame and render fills for newly-visible descendants. E.g. if we were rendering level 15 last
    // frame but this frame we want level 14 and the closest renderable level <= 14 is 0, rendering level
    // zero would be pretty jarring so instead we keep rendering level 15 even though its SSE is better
    // than required. So fall through to continue traversal...
    ancestorMeetsSse = true;

    // Load this blocker tile with high priority, but only if this tile (not just an ancestor) meets the SSE.
    if (meetsSse) {
      queueTileLoad(primitive, primitive._tileLoadQueueHigh, tile, frameState);
    }
  }

  if (tileProvider.canRefine(tile)) {
    const allAreUpsampled =
      southwestChild.upsampledFromParent &&
      southeastChild.upsampledFromParent &&
      northwestChild.upsampledFromParent &&
      northeastChild.upsampledFromParent;

    if (allAreUpsampled) {
      // No point in rendering the children because they're all upsampled.  Render this tile instead.
      addTileToRenderList(primitive, tile);

      // Rendered tile that's not waiting on children loads with medium priority.
      queueTileLoad(
        primitive,
        primitive._tileLoadQueueMedium,
        tile,
        frameState,
      );

      // Make sure we don't unload the children and forget they're upsampled.
      primitive._tileReplacementQueue.markTileRendered(southwestChild);
      primitive._tileReplacementQueue.markTileRendered(southeastChild);
      primitive._tileReplacementQueue.markTileRendered(northwestChild);
      primitive._tileReplacementQueue.markTileRendered(northeastChild);

      traversalDetails.allAreRenderable = tile.renderable;
      traversalDetails.anyWereRenderedLastFrame =
        lastFrameSelectionResult === TileSelectionResult.RENDERED;
      traversalDetails.notYetRenderableCount = tile.renderable ? 0 : 1;

      tile._lastSelectionResultFrame = frameState.frameNumber;
      tile._lastSelectionResult = TileSelectionResult.RENDERED;

      if (!traversalDetails.anyWereRenderedLastFrame) {
        // Tile is newly-rendered this frame, so update its heights.
        primitive._tileToUpdateHeights.push(tile);
      }

      return;
    }

    // SSE is not good enough, so refine.
    tile._lastSelectionResultFrame = frameState.frameNumber;
    tile._lastSelectionResult = TileSelectionResult.REFINED;

    const firstRenderedDescendantIndex = primitive._tilesToRender.length;
    const loadIndexLow = primitive._tileLoadQueueLow.length;
    const loadIndexMedium = primitive._tileLoadQueueMedium.length;
    const loadIndexHigh = primitive._tileLoadQueueHigh.length;
    const tilesToUpdateHeightsIndex = primitive._tileToUpdateHeights.length;

    // No need to add the children to the load queue because they'll be added (if necessary) when they're visited.
    visitVisibleChildrenNearToFar(
      primitive,
      southwestChild,
      southeastChild,
      northwestChild,
      northeastChild,
      frameState,
      ancestorMeetsSse,
      traversalDetails,
    );

    // If no descendant tiles were added to the render list by the function above, it means they were all
    // culled even though this tile was deemed visible. That's pretty common.

    if (firstRenderedDescendantIndex !== primitive._tilesToRender.length) {
      // At least one descendant tile was added to the render list.
      // The traversalDetails tell us what happened while visiting the children.

      const allAreRenderable = traversalDetails.allAreRenderable;
      const anyWereRenderedLastFrame =
        traversalDetails.anyWereRenderedLastFrame;
      const notYetRenderableCount = traversalDetails.notYetRenderableCount;
      let queuedForLoad = false;

      if (!allAreRenderable && !anyWereRenderedLastFrame) {
        // Some of our descendants aren't ready to render yet, and none were rendered last frame,
        // so kick them all out of the render list and render this tile instead. Continue to load them though!

        // Mark the rendered descendants and their ancestors - up to this tile - as kicked.
        const renderList = primitive._tilesToRender;
        for (let i = firstRenderedDescendantIndex; i < renderList.length; ++i) {
          let workTile = renderList[i];
          while (
            workTile !== undefined &&
            workTile._lastSelectionResult !== TileSelectionResult.KICKED &&
            workTile !== tile
          ) {
            workTile._lastSelectionResult = TileSelectionResult.kick(
              workTile._lastSelectionResult,
            );
            workTile = workTile.parent;
          }
        }

        // Remove all descendants from the render list and add this tile.
        primitive._tilesToRender.length = firstRenderedDescendantIndex;
        primitive._tileToUpdateHeights.length = tilesToUpdateHeightsIndex;
        addTileToRenderList(primitive, tile);

        tile._lastSelectionResult = TileSelectionResult.RENDERED;

        // If we're waiting on heaps of descendants, the above will take too long. So in that case,
        // load this tile INSTEAD of loading any of the descendants, and tell the up-level we're only waiting
        // on this tile. Keep doing this until we actually manage to render this tile.
        const wasRenderedLastFrame =
          lastFrameSelectionResult === TileSelectionResult.RENDERED;
        if (
          !wasRenderedLastFrame &&
          notYetRenderableCount > primitive.loadingDescendantLimit
        ) {
          // Remove all descendants from the load queues.
          primitive._tileLoadQueueLow.length = loadIndexLow;
          primitive._tileLoadQueueMedium.length = loadIndexMedium;
          primitive._tileLoadQueueHigh.length = loadIndexHigh;
          queueTileLoad(
            primitive,
            primitive._tileLoadQueueMedium,
            tile,
            frameState,
          );
          traversalDetails.notYetRenderableCount = tile.renderable ? 0 : 1;
          queuedForLoad = true;
        }

        traversalDetails.allAreRenderable = tile.renderable;
        traversalDetails.anyWereRenderedLastFrame = wasRenderedLastFrame;

        if (!wasRenderedLastFrame) {
          // Tile is newly-rendered this frame, so update its heights.
          primitive._tileToUpdateHeights.push(tile);
        }

        ++debug.tilesWaitingForChildren;
      }

      if (primitive.preloadAncestors && !queuedForLoad) {
        queueTileLoad(primitive, primitive._tileLoadQueueLow, tile, frameState);
      }
    }

    return;
  }

  tile._lastSelectionResultFrame = frameState.frameNumber;
  tile._lastSelectionResult = TileSelectionResult.RENDERED;

  // We'd like to refine but can't because we have no availability data for this tile's children,
  // so we have no idea if refinining would involve a load or an upsample. We'll have to finish
  // loading this tile first in order to find that out, so load this refinement blocker with
  // high priority.
  addTileToRenderList(primitive, tile);
  queueTileLoad(primitive, primitive._tileLoadQueueHigh, tile, frameState);

  traversalDetails.allAreRenderable = tile.renderable;
  traversalDetails.anyWereRenderedLastFrame =
    lastFrameSelectionResult === TileSelectionResult.RENDERED;
  traversalDetails.notYetRenderableCount = tile.renderable ? 0 : 1;
}

function visitVisibleChildrenNearToFar(
  primitive,
  southwest,
  southeast,
  northwest,
  northeast,
  frameState,
  ancestorMeetsSse,
  traversalDetails,
) {
  const cameraPosition = frameState.camera.positionCartographic;
  const tileProvider = primitive._tileProvider;
  const occluders = primitive._occluders;

  const quadDetails = traversalQuadsByLevel[southwest.level];
  const southwestDetails = quadDetails.southwest;
  const southeastDetails = quadDetails.southeast;
  const northwestDetails = quadDetails.northwest;
  const northeastDetails = quadDetails.northeast;

  if (cameraPosition.longitude < southwest.rectangle.east) {
    if (cameraPosition.latitude < southwest.rectangle.north) {
      // Camera in southwest quadrant
      visitIfVisible(
        primitive,
        southwest,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        southwestDetails,
      );
      visitIfVisible(
        primitive,
        southeast,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        southeastDetails,
      );
      visitIfVisible(
        primitive,
        northwest,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        northwestDetails,
      );
      visitIfVisible(
        primitive,
        northeast,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        northeastDetails,
      );
    } else {
      // Camera in northwest quadrant
      visitIfVisible(
        primitive,
        northwest,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        northwestDetails,
      );
      visitIfVisible(
        primitive,
        southwest,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        southwestDetails,
      );
      visitIfVisible(
        primitive,
        northeast,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        northeastDetails,
      );
      visitIfVisible(
        primitive,
        southeast,
        tileProvider,
        frameState,
        occluders,
        ancestorMeetsSse,
        southeastDetails,
      );
    }
  } else if (cameraPosition.latitude < southwest.rectangle.north) {
    // Camera southeast quadrant
    visitIfVisible(
      primitive,
      southeast,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      southeastDetails,
    );
    visitIfVisible(
      primitive,
      southwest,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      southwestDetails,
    );
    visitIfVisible(
      primitive,
      northeast,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      northeastDetails,
    );
    visitIfVisible(
      primitive,
      northwest,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      northwestDetails,
    );
  } else {
    // Camera in northeast quadrant
    visitIfVisible(
      primitive,
      northeast,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      northeastDetails,
    );
    visitIfVisible(
      primitive,
      northwest,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      northwestDetails,
    );
    visitIfVisible(
      primitive,
      southeast,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      southeastDetails,
    );
    visitIfVisible(
      primitive,
      southwest,
      tileProvider,
      frameState,
      occluders,
      ancestorMeetsSse,
      southwestDetails,
    );
  }

  quadDetails.combine(traversalDetails);
}

function containsNeededPosition(primitive, tile) {
  const rectangle = tile.rectangle;
  return (
    (defined(primitive._cameraPositionCartographic) &&
      Rectangle.contains(rectangle, primitive._cameraPositionCartographic)) ||
    (defined(primitive._cameraReferenceFrameOriginCartographic) &&
      Rectangle.contains(
        rectangle,
        primitive._cameraReferenceFrameOriginCartographic,
      ))
  );
}

function visitIfVisible(
  // 【导读】被剔除但含相机位置的瓦片：仍以 Medium 优先级加载到「有地形」为止（updateHeights 要用高程）；
  // 【导读】preloadSiblings 开启时被剔除的兄弟瓦片进 Low 队列预取。
  primitive,
  tile,
  tileProvider,
  frameState,
  occluders,
  ancestorMeetsSse,
  traversalDetails,
) {
  if (
    tileProvider.computeTileVisibility(tile, frameState, occluders) !==
    Visibility.NONE
  ) {
    return visitTile(
      primitive,
      frameState,
      tile,
      ancestorMeetsSse,
      traversalDetails,
    );
  }

  ++primitive._debug.tilesCulled;
  primitive._tileReplacementQueue.markTileRendered(tile);

  traversalDetails.allAreRenderable = true;
  traversalDetails.anyWereRenderedLastFrame = false;
  traversalDetails.notYetRenderableCount = 0;

  if (containsNeededPosition(primitive, tile)) {
    // Load the tile(s) that contains the camera's position and
    // the origin of its reference frame with medium priority.
    // But we only need to load until the terrain is available, no need to load imagery.
    if (!defined(tile.data) || !defined(tile.data.vertexArray)) {
      queueTileLoad(
        primitive,
        primitive._tileLoadQueueMedium,
        tile,
        frameState,
      );
    }

    const lastFrame = primitive._lastSelectionFrameNumber;
    const lastFrameSelectionResult =
      tile._lastSelectionResultFrame === lastFrame
        ? tile._lastSelectionResult
        : TileSelectionResult.NONE;
    if (
      lastFrameSelectionResult !== TileSelectionResult.CULLED_BUT_NEEDED &&
      lastFrameSelectionResult !== TileSelectionResult.RENDERED
    ) {
      primitive._tileToUpdateHeights.push(tile);
    }

    tile._lastSelectionResult = TileSelectionResult.CULLED_BUT_NEEDED;
  } else if (primitive.preloadSiblings || tile.level === 0) {
    // Load culled level zero tiles with low priority.
    // For all other levels, only load culled tiles if preloadSiblings is enabled.
    queueTileLoad(primitive, primitive._tileLoadQueueLow, tile, frameState);
    tile._lastSelectionResult = TileSelectionResult.CULLED;
  } else {
    tile._lastSelectionResult = TileSelectionResult.CULLED;
  }

  tile._lastSelectionResultFrame = frameState.frameNumber;
}

function screenSpaceError(primitive, frameState, tile) {
  // 【导读】★LOD 核心公式：SSE = 几何误差×屏高 / (距离×frustum.sseDenominator)，再扣雾衰减、除像素比；
  // 【导读】SSE < maximumScreenSpaceError 就不必细分（当前层已够精细）。2D/正交相机走 screenSpaceError2D。
  if (
    frameState.mode === SceneMode.SCENE2D ||
    frameState.camera.frustum instanceof OrthographicFrustum ||
    frameState.camera.frustum instanceof OrthographicOffCenterFrustum
  ) {
    return screenSpaceError2D(primitive, frameState, tile);
  }

  const maxGeometricError =
    primitive._tileProvider.getLevelMaximumGeometricError(tile.level);

  const distance = tile._distance;
  const height = frameState.context.drawingBufferHeight;
  const sseDenominator = frameState.camera.frustum.sseDenominator;

  let error = (maxGeometricError * height) / (distance * sseDenominator);

  if (frameState.fog.enabled) {
    error -=
      CesiumMath.fog(distance, frameState.fog.density) * frameState.fog.sse;
  }

  error /= frameState.pixelRatio;

  return error;
}

function screenSpaceError2D(primitive, frameState, tile) {
  const camera = frameState.camera;
  let frustum = camera.frustum;
  const offCenterFrustum = frustum.offCenterFrustum;
  if (defined(offCenterFrustum)) {
    frustum = offCenterFrustum;
  }

  const context = frameState.context;
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;

  const maxGeometricError =
    primitive._tileProvider.getLevelMaximumGeometricError(tile.level);
  const pixelSize =
    Math.max(frustum.top - frustum.bottom, frustum.right - frustum.left) /
    Math.max(width, height);
  let error = maxGeometricError / pixelSize;

  if (frameState.fog.enabled && frameState.mode !== SceneMode.SCENE2D) {
    error -=
      CesiumMath.fog(tile._distance, frameState.fog.density) *
      frameState.fog.sse;
  }

  error /= frameState.pixelRatio;

  return error;
}

function addTileToRenderList(primitive, tile) {
  primitive._tilesToRender.push(tile);
  primitive._tilesRenderedThisFrame.add(tile);
}

function processTileLoadQueue(primitive, frameState) {
  // 【导读】时间片加载：每帧只花 _loadQueueTimeSlice 毫秒，按 High→Medium→Low 顺序调 tileProvider.loadTile，
  // 【导读】顺带 trimTiles 按缓存上限淘汰闲置瓦片——所以「瓦片加载不卡帧」是靠限时分片而非异步本身。
  const tileLoadQueueHigh = primitive._tileLoadQueueHigh;
  const tileLoadQueueMedium = primitive._tileLoadQueueMedium;
  const tileLoadQueueLow = primitive._tileLoadQueueLow;

  if (
    tileLoadQueueHigh.length === 0 &&
    tileLoadQueueMedium.length === 0 &&
    tileLoadQueueLow.length === 0
  ) {
    return;
  }

  // Remove any tiles that were not used this frame beyond the number
  // we're allowed to keep.
  primitive._tileReplacementQueue.trimTiles(primitive.tileCacheSize);

  const endTime = getTimestamp() + primitive._loadQueueTimeSlice;
  const tileProvider = primitive._tileProvider;

  let didSomeLoading = processSinglePriorityLoadQueue(
    primitive,
    frameState,
    tileProvider,
    endTime,
    tileLoadQueueHigh,
    false,
  );
  didSomeLoading = processSinglePriorityLoadQueue(
    primitive,
    frameState,
    tileProvider,
    endTime,
    tileLoadQueueMedium,
    didSomeLoading,
  );
  processSinglePriorityLoadQueue(
    primitive,
    frameState,
    tileProvider,
    endTime,
    tileLoadQueueLow,
    didSomeLoading,
  );
}

function sortByLoadPriority(a, b) {
  return a._loadPriority - b._loadPriority;
}

function processSinglePriorityLoadQueue(
  primitive,
  frameState,
  tileProvider,
  endTime,
  loadQueue,
  didSomeLoading,
) {
  if (tileProvider.computeTileLoadPriority !== undefined) {
    loadQueue.sort(sortByLoadPriority);
  }

  for (
    let i = 0, len = loadQueue.length;
    i < len && (getTimestamp() < endTime || !didSomeLoading);
    ++i
  ) {
    const tile = loadQueue[i];
    primitive._tileReplacementQueue.markTileRendered(tile);
    tileProvider.loadTile(frameState, tile);
    didSomeLoading = true;
  }

  return didSomeLoading;
}

const scratchRay = new Ray();
const scratchCartographic = new Cartographic();
const scratchPosition = new Cartesian3();
const scratchArray = [];

function updateHeights(primitive, frameState) {
  if (!defined(primitive.tileProvider.tilingScheme)) {
    return;
  }

  const tryNextFrame = scratchArray;
  tryNextFrame.length = 0;
  const tilesToUpdateHeights = primitive._tileToUpdateHeights;

  const startTime = getTimestamp();
  const timeSlice = primitive._updateHeightsTimeSlice;
  const endTime = startTime + timeSlice;

  const mode = frameState.mode;
  const projection = frameState.mapProjection;
  const ellipsoid = primitive.tileProvider.tilingScheme.ellipsoid;
  let i;

  while (tilesToUpdateHeights.length > 0) {
    const tile = tilesToUpdateHeights[0];
    if (!defined(tile.data) || !defined(tile.data.mesh)) {
      // Tile isn't loaded enough yet, so try again next frame if this tile is still
      // being rendered.
      const selectionResult =
        tile._lastSelectionResultFrame === primitive._lastSelectionFrameNumber
          ? tile._lastSelectionResult
          : TileSelectionResult.NONE;
      if (
        selectionResult === TileSelectionResult.RENDERED ||
        selectionResult === TileSelectionResult.CULLED_BUT_NEEDED
      ) {
        tryNextFrame.push(tile);
      }
      // Ensure stale position cache is cleared
      tile.clearPositionCache();
      tilesToUpdateHeights.shift();
      continue;
    }
    const customData = tile.customData;
    if (!defined(tile._customDataIterator)) {
      tile._customDataIterator = customData.values();
    }
    const customDataIterator = tile._customDataIterator;

    let timeSliceMax = false;
    let nextData;
    while (!(nextData = customDataIterator.next()).done) {
      const data = nextData.value;

      // No need to run this code when the tile is upsampled, because the height will be the same as its parent.
      const terrainData = tile.data.terrainData;
      const upsampledGeometryFromParent =
        defined(terrainData) && terrainData.wasCreatedByUpsampling();

      if (tile.level > data.level && !upsampledGeometryFromParent) {
        let position;
        // find cached entry
        const cachedData = tile.getPositionCacheEntry(
          data.positionCartographic,
          primitive.maximumScreenSpaceError,
        );
        if (defined(cachedData)) {
          // cache hit
          position = cachedData;
        } else {
          if (!defined(data.positionOnEllipsoidSurface)) {
            // cartesian has to be on the ellipsoid surface for `ellipsoid.geodeticSurfaceNormal`
            data.positionOnEllipsoidSurface = Cartesian3.fromRadians(
              data.positionCartographic.longitude,
              data.positionCartographic.latitude,
              0.0,
              ellipsoid,
            );
          }

          if (mode === SceneMode.SCENE3D) {
            const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
              data.positionOnEllipsoidSurface,
              scratchRay.direction,
            );

            // compute origin point

            // Try to find the intersection point between the surface normal and z-axis.
            // minimum height (-11500.0) for the terrain set, need to get this information from the terrain provider
            const rayOrigin = ellipsoid.getSurfaceNormalIntersectionWithZAxis(
              data.positionOnEllipsoidSurface,
              11500.0,
              scratchRay.origin,
            );

            // Theoretically, not with Earth datums, the intersection point can be outside the ellipsoid
            if (!defined(rayOrigin)) {
              // intersection point is outside the ellipsoid, try other value
              // minimum height (-11500.0) for the terrain set, need to get this information from the terrain provider
              let minimumHeight = 0.0;
              if (defined(tile.data.tileBoundingRegion)) {
                minimumHeight = tile.data.tileBoundingRegion.minimumHeight;
              }
              const magnitude = Math.min(minimumHeight, -11500.0);

              // multiply by the *positive* value of the magnitude
              const vectorToMinimumPoint = Cartesian3.multiplyByScalar(
                surfaceNormal,
                Math.abs(magnitude) + 1,
                scratchPosition,
              );
              Cartesian3.subtract(
                data.positionOnEllipsoidSurface,
                vectorToMinimumPoint,
                scratchRay.origin,
              );
            }
          } else {
            Cartographic.clone(data.positionCartographic, scratchCartographic);

            // minimum height for the terrain set, need to get this information from the terrain provider
            scratchCartographic.height = -11500.0;
            projection.project(scratchCartographic, scratchPosition);
            Cartesian3.fromElements(
              scratchPosition.z,
              scratchPosition.x,
              scratchPosition.y,
              scratchPosition,
            );
            Cartesian3.clone(scratchPosition, scratchRay.origin);
            Cartesian3.clone(Cartesian3.UNIT_X, scratchRay.direction);
          }

          position = tile.data.pick(
            scratchRay,
            mode,
            projection,
            false,
            scratchPosition,
          );

          if (defined(position)) {
            // `pick` wrote into the module-level `scratchPosition`, so `position`
            // aliases it — clone before caching or the next pick mutates every entry.
            tile.setPositionCacheEntry(
              data.positionCartographic,
              primitive.maximumScreenSpaceError,
              Cartesian3.clone(position),
            );
          }
        }
        if (defined(position)) {
          if (defined(data.callback)) {
            const positionCarto = ellipsoid.cartesianToCartographic(
              position,
              scratchCartographic,
            );
            data.callback(positionCarto);
          }
          data.level = tile.level;
        }
      }

      if (getTimestamp() >= endTime) {
        timeSliceMax = true;
        break;
      }
    }

    if (timeSliceMax) {
      tile._customDataIterator = customDataIterator;
      break;
    } else {
      tile._customDataIterator = undefined;
      tilesToUpdateHeights.shift();
    }
  }
  for (i = 0; i < tryNextFrame.length; i++) {
    tilesToUpdateHeights.push(tryNextFrame[i]);
  }
}

function createRenderCommandsForSelectedTiles(primitive, frameState) {
  const tileProvider = primitive._tileProvider;
  const tilesToRender = primitive._tilesToRender;

  for (let i = 0, len = tilesToRender.length; i < len; ++i) {
    const tile = tilesToRender[i];
    tileProvider.showTileThisFrame(tile, frameState);
  }
}
export default QuadtreePrimitive;
