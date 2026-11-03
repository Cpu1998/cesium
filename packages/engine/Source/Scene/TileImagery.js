// ═══ 【导读】TileImagery.js —— 「地形瓦片 ↔ 影像瓦片」的粘贴关系（私有类）═══
// 【导读】一个地形瓦片（GlobeSurfaceTile.imagery 数组）里每项 TileImagery 记录：
// 【导读】loadingImagery（正在加载的目标影像瓦片）、readyImagery（当前实际可画的替代图，常是父级瓦片）、
// 【导读】textureCoordinateRectangle（贴图区域百分比，XYZW=西南东北）、textureTranslationAndScale（着色器用平移缩放）。
// 【导读】processStateMachine 是「先推 loading，画不到就沿 parent 链找 ready 祖先」的父图替代核心逻辑。
// 【导读】多个地形瓦片可共享同一 Imagery（靠它引用计数），但各自持有独立 TileImagery（贴图矩形不同）。见 study/02 §3。
import defined from "../Core/defined.js";
import ImageryState from "./ImageryState.js";

/**
 * The assocation between a terrain tile and an imagery tile.
 *
 * @alias TileImagery
 * @private
 *
 * @param {Imagery} imagery The imagery tile.
 * @param {Cartesian4} textureCoordinateRectangle The texture rectangle of the tile that is covered
 *        by the imagery, where X=west, Y=south, Z=east, W=north.
 * @param {boolean} useWebMercatorT true to use the Web Mercator texture coordinates for this imagery tile.
 */
function TileImagery(imagery, textureCoordinateRectangle, useWebMercatorT) {
  this.readyImagery = undefined;
  this.loadingImagery = imagery;
  this.textureCoordinateRectangle = textureCoordinateRectangle;
  this.textureTranslationAndScale = undefined;
  this.useWebMercatorT = useWebMercatorT;
}

/**
 * Frees the resources held by this instance.
 */
TileImagery.prototype.freeResources = function () {
  if (defined(this.readyImagery)) {
    this.readyImagery.releaseReference();
  }

  if (defined(this.loadingImagery)) {
    this.loadingImagery.releaseReference();
  }
};

/**
 * Processes the load state machine for this instance.
 *
 * @param {Tile} tile The tile to which this instance belongs.
 * @param {FrameState} frameState The frameState.
 * @param {boolean} skipLoading True to skip loading, e.g. new requests, creating textures. This function will
 *                  still synchronously process imagery that's already mostly ready to go, e.g. use textures
 *                  already loaded on ancestor tiles.
 * @returns {boolean} True if this instance is done loading; otherwise, false.
 */
TileImagery.prototype.processStateMachine = function (
  // 【导读】父图替代核心：① 先推 loadingImagery 状态机一步；READY 则转正为 readyImagery 并算 UV；
  // 【导读】② 未就绪时沿 parent 链找最近可画祖先（含地理纹理要求），把它设为 readyImagery 先糊上屏；
  // 【导读】③ FAILED/INVALID 时继续推进「最接近未加载祖先」的加载（有些祖先瓦片不直接挂在任何地形瓦片上，只能在这几推）。
  tile,
  frameState,
  skipLoading,
) {
  const loadingImagery = this.loadingImagery;
  const imageryLayer = loadingImagery.imageryLayer;

  loadingImagery.processStateMachine(
    frameState,
    !this.useWebMercatorT,
    skipLoading,
  );

  if (loadingImagery.state === ImageryState.READY) {
    if (defined(this.readyImagery)) {
      this.readyImagery.releaseReference();
    }
    this.readyImagery = this.loadingImagery;
    this.loadingImagery = undefined;
    this.textureTranslationAndScale =
      imageryLayer._calculateTextureTranslationAndScale(tile, this);
    return true; // done loading
  }

  // Find some ancestor imagery we can use while this imagery is still loading.
  let ancestor = loadingImagery.parent;
  let closestAncestorThatNeedsLoading;
  while (
    defined(ancestor) &&
    (ancestor.state !== ImageryState.READY ||
      (!this.useWebMercatorT && !defined(ancestor.texture)))
  ) {
    if (
      ancestor.state !== ImageryState.FAILED &&
      ancestor.state !== ImageryState.INVALID
    ) {
      // ancestor is still loading
      closestAncestorThatNeedsLoading =
        closestAncestorThatNeedsLoading || ancestor;
    }
    ancestor = ancestor.parent;
  }

  if (this.readyImagery !== ancestor) {
    if (defined(this.readyImagery)) {
      this.readyImagery.releaseReference();
    }

    this.readyImagery = ancestor;

    if (defined(ancestor)) {
      ancestor.addReference();
      this.textureTranslationAndScale =
        imageryLayer._calculateTextureTranslationAndScale(tile, this);
    }
  }

  if (
    loadingImagery.state === ImageryState.FAILED ||
    loadingImagery.state === ImageryState.INVALID
  ) {
    // The imagery tile is failed or invalid, so we'd like to use an ancestor instead.
    if (defined(closestAncestorThatNeedsLoading)) {
      // Push the ancestor's load process along a bit.  This is necessary because some ancestor imagery
      // tiles may not be attached directly to a terrain tile.  Such tiles will never load if
      // we don't do it here.
      closestAncestorThatNeedsLoading.processStateMachine(
        frameState,
        !this.useWebMercatorT,
        skipLoading,
      );
      return false; // not done loading
    }
    // This imagery tile is failed or invalid, and we have the "best available" substitute.
    return true; // done loading
  }

  return false; // not done loading
};
export default TileImagery;
