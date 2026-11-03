// ═══ 【导读】Tileset3DTileContent.js —— 外部/嵌套 tileset 内容：把另一棵瓦片树缝进来 ═══
// 【导读】当瓦片 content 指向另一个 tileset.json（external tileset，分块大场景常用）时由分派表
// 【导读】Cesium3DTileContentFactory.externalTileset 创建。它本身不渲染：fromJson 里回调宿主
// 【导读】tileset 的 loadTileset 把子树挂为本瓦片的 children，遍历器走到这里会下钻到子树根继续选瓦片。
// 【导读】本瓦片自身 ready 恒为 true、无特征无命令（长度全 0），是个「转发节点」。
// 【导读】详见 study/04-3DTiles加载与LOD.md §6。
import destroyObject from "../Core/destroyObject.js";

/**
 * Represents content for a tile in a
 * {@link https://github.com/CesiumGS/3d-tiles/tree/main/specification|3D Tiles} tileset whose
 * content points to another 3D Tiles tileset.
 * <p>
 * Implements the {@link Cesium3DTileContent} interface.
 * </p>
 *
 * @implements Cesium3DTileContent
 * @private
 */
class Tileset3DTileContent {
  constructor(tileset, tile, resource) {
    this._tileset = tileset;
    this._tile = tile;
    this._resource = resource;

    this.featurePropertiesDirty = false;

    this._metadata = undefined;
    this._group = undefined;

    this._ready = false;
  }

  get featuresLength() {
    return 0;
  }

  get pointsLength() {
    return 0;
  }

  get trianglesLength() {
    return 0;
  }

  get geometryByteLength() {
    return 0;
  }

  get texturesByteLength() {
    return 0;
  }

  get batchTableByteLength() {
    return 0;
  }

  get innerContents() {
    return undefined;
  }

  /**
   * Returns true when the tile's content is ready to render; otherwise false
   *
   *
   * @type {boolean}
   * @readonly
   * @private
   */
  get ready() {
    return this._ready;
  }

  get tileset() {
    return this._tileset;
  }

  get tile() {
    return this._tile;
  }

  get url() {
    return this._resource.getUrlComponent(true);
  }

  get batchTable() {
    return undefined;
  }

  get metadata() {
    return this._metadata;
  }

  set metadata(value) {
    this._metadata = value;
  }

  get group() {
    return this._group;
  }

  set group(value) {
    this._group = value;
  }

  /**
   * Creates an instance of Tileset3DTileContent from a parsed JSON object
   * @param {Cesium3DTileset} tileset
   * @param {Cesium3DTile} tile
   * @param {Resource} resource
   * @param {object} json
   * @returns {Tileset3DTileContent}
   */
  static fromJson(tileset, tile, resource, json) {
    // 【导读】关键一针：拿宿主 tileset 的 loadTileset 把子 tileset.json 解析成 Cesium3DTile 子树，
// 【导读】挂在本 tile 的 children 上——嵌套 tileset 对遍历器完全透明（就是普通子树）
    const content = new Tileset3DTileContent(tileset, tile, resource);
    content._tileset.loadTileset(content._resource, json, content._tile);
    content._ready = true;

    return content;
  }

  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Tileset3DTileContent</code>
   * always returns <code>false</code> since a tile of this type does not have any features.
   */
  hasProperty(batchId, name) {
    return false;
  }

  /**
   * Part of the {@link Cesium3DTileContent} interface.  <code>Tileset3DTileContent</code>
   * always returns <code>undefined</code> since a tile of this type does not have any features.
   */
  getFeature(batchId) {
    return undefined;
  }

  applyDebugSettings(enabled, color) {}
  applyStyle(style) {}
  update(tileset, frameState) {}

  pick(ray, frameState, result) {
    return undefined;
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    return destroyObject(this);
  }
}

export default Tileset3DTileContent;
