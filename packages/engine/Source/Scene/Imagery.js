// ═══ 【导读】Imagery.js —— 「一个影像瓦片」的状态机（私有类）═══
// 【导读】字段：x/y/level（金字塔坐标）、parent（父级瓦片，加载期父图替代的关键）、
// 【导读】state（ImageryState：UNLOADED→TRANSITIONING→RECEIVED→TEXTURE_LOADED→READY；失败 FAILED/INVALID）、
// 【导读】texture（地理投影版）/textureWebMercator（墨卡托原版）双纹理、referenceCount（共享引用计数）。
// 【导读】processStateMachine 每帧被 TileImagery 驱动一步：请求→建纹理→重投影，均为「转 TRANSITIONING+调
// 【导读】ImageryLayer 对应方法」的异步推进。完整生命周期图见 study/02-底图与影像体系.md §3。
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import ImageryState from "./ImageryState.js";

/**
 * Stores details about a tile of imagery.
 *
 * @alias Imagery
 * @private
 */
function Imagery(imageryLayer, x, y, level, rectangle) {
  // 【导读】构造即链父：level>0 时自动 getImageryFromCache 取父瓦片并计数，父图替代、失败回退都沿这条 parent 链上溯。
  this.imageryLayer = imageryLayer;
  this.x = x;
  this.y = y;
  this.level = level;
  this.request = undefined;

  if (level !== 0) {
    const parentX = (x / 2) | 0;
    const parentY = (y / 2) | 0;
    const parentLevel = level - 1;
    this.parent = imageryLayer.getImageryFromCache(
      parentX,
      parentY,
      parentLevel,
    );
  }

  this.state = ImageryState.UNLOADED;
  this.imageUrl = undefined;
  this.image = undefined;
  this.texture = undefined;
  this.textureWebMercator = undefined;
  this.credits = undefined;
  this.referenceCount = 0;

  if (!defined(rectangle) && imageryLayer.ready) {
    const tilingScheme = imageryLayer.imageryProvider.tilingScheme;
    rectangle = tilingScheme.tileXYToRectangle(x, y, level);
  }

  this.rectangle = rectangle;
}
Imagery.createPlaceholder = function (imageryLayer) {
  const result = new Imagery(imageryLayer, 0, 0, 0);
  result.addReference();
  result.state = ImageryState.PLACEHOLDER;
  return result;
};

Imagery.prototype.addReference = function () {
  ++this.referenceCount;
};

Imagery.prototype.releaseReference = function () {
  // 【导读】引用计数归零才真释放：从层缓存移除、递减 parent 计数、销毁 image/纹理（墨卡托与地理双份）。
  --this.referenceCount;

  if (this.referenceCount === 0) {
    this.imageryLayer.removeImageryFromCache(this);

    if (defined(this.parent)) {
      this.parent.releaseReference();
    }

    if (defined(this.image) && defined(this.image.destroy)) {
      this.image.destroy();
    }

    if (defined(this.texture)) {
      this.texture.destroy();
    }

    if (
      defined(this.textureWebMercator) &&
      this.texture !== this.textureWebMercator
    ) {
      this.textureWebMercator.destroy();
    }

    destroyObject(this);

    return 0;
  }

  return this.referenceCount;
};

Imagery.prototype.processStateMachine = function (
  // 【导读】每帧推进一步状态：UNLOADED→发请求(_requestImagery)；RECEIVED→建纹理(_createTexture)；
  // 【导读】TEXTURE_LOADED→重投影(_reprojectTexture)。已 READY 但缺地理版纹理时（如瓦片被极地瓦片共享）会再补一次重投影。
  frameState,
  needGeographicProjection,
  skipLoading,
) {
  if (this.state === ImageryState.UNLOADED && !skipLoading) {
    this.state = ImageryState.TRANSITIONING;
    this.imageryLayer._requestImagery(this);
  }

  if (this.state === ImageryState.RECEIVED) {
    this.state = ImageryState.TRANSITIONING;
    this.imageryLayer._createTexture(frameState.context, this);
  }

  // If the imagery is already ready, but we need a geographic version and don't have it yet,
  // we still need to do the reprojection step. This can happen if the Web Mercator version
  // is fine initially, but the geographic one is needed later.
  const needsReprojection =
    this.state === ImageryState.READY &&
    needGeographicProjection &&
    !this.texture;

  if (this.state === ImageryState.TEXTURE_LOADED || needsReprojection) {
    this.state = ImageryState.TRANSITIONING;
    this.imageryLayer._reprojectTexture(
      frameState,
      this,
      needGeographicProjection,
    );
  }
};
export default Imagery;
