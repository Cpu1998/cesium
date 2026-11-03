// ═══ 【导读】Cesium3DTileContentFactory.js —— 内容类型分派表（magic → 内容类） ═══
// 【导读】由 Cesium3DTile.js 的 makeContent 调用：预处理器按二进制头 magic / JSON 类型查本表：
// 【导读】b3dm/pnts/i3dm/glb/gltf/geoJson→Model3DTileContent（都统一进引擎 Model，见 Model/Model.js）；
// 【导读】cmpt→Composite3DTileContent（内含多内容递归）；externalTileset→Tileset3DTileContent（嵌套瓦片集）；
// 【导读】geom/vctr→Geometry/Vector 内容；subt/subtreeJson→Implicit3DTileContent（隐式平铺子树）；
// 【导读】glb/gltf 前置高斯泼溅/矢量网格扩展检查。各内容职责详见 study/04-3DTiles加载与LOD.md §6。
import Composite3DTileContent from "./Composite3DTileContent.js";
import Geometry3DTileContent from "./Geometry3DTileContent.js";
import Implicit3DTileContent from "./Implicit3DTileContent.js";
import Model3DTileContent from "./Model/Model3DTileContent.js";
import Tileset3DTileContent from "./Tileset3DTileContent.js";
import Vector3DTileContent from "./Vector3DTileContent.js";
import VectorGltf3DTileContent from "./VectorGltf3DTileContent.js";
import GaussianSplat3DTileContent from "./GaussianSplat3DTileContent.js";
import RuntimeError from "../Core/RuntimeError.js";

/**
 * Maps a tile's magic field in its header to a new content object for the tile's payload.
 *
 * @private
 */
const Cesium3DTileContentFactory = {
  b3dm: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    return Model3DTileContent.fromB3dm(
      tileset,
      tile,
      resource,
      arrayBuffer,
      byteOffset,
    );
  },
  pnts: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    return Model3DTileContent.fromPnts(
      tileset,
      tile,
      resource,
      arrayBuffer,
      byteOffset,
    );
  },
  i3dm: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    return Model3DTileContent.fromI3dm(
      tileset,
      tile,
      resource,
      arrayBuffer,
      byteOffset,
    );
  },
  cmpt: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    // Send in the factory in order to avoid a cyclical dependency
    return Composite3DTileContent.fromTileType(
      tileset,
      tile,
      resource,
      arrayBuffer,
      byteOffset,
      Cesium3DTileContentFactory,
    );
  },
  externalTileset: function (tileset, tile, resource, json) {
    return Tileset3DTileContent.fromJson(tileset, tile, resource, json);
  },
  geom: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    return new Geometry3DTileContent(
      tileset,
      tile,
      resource,
      arrayBuffer,
      byteOffset,
    );
  },
  vctr: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    return new Vector3DTileContent(
      tileset,
      tile,
      resource,
      arrayBuffer,
      byteOffset,
    );
  },
  subt: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    return Implicit3DTileContent.fromSubtreeJson(
      tileset,
      tile,
      resource,
      undefined,
      arrayBuffer,
      byteOffset,
    );
  },
  subtreeJson: function (tileset, tile, resource, json) {
    return Implicit3DTileContent.fromSubtreeJson(tileset, tile, resource, json);
  },
  glb: function (tileset, tile, resource, arrayBuffer, byteOffset) {
    const arrayBufferByteLength = arrayBuffer.byteLength;
    if (arrayBufferByteLength < 12) {
      throw new RuntimeError("Invalid glb content");
    }
    const dataView = new DataView(arrayBuffer, byteOffset);
    const byteLength = dataView.getUint32(8, true);
    const glb = new Uint8Array(arrayBuffer, byteOffset, byteLength);

    if (
      GaussianSplat3DTileContent.tilesetRequiresGaussianSplattingExt(tileset)
    ) {
      return GaussianSplat3DTileContent.fromGltf(tileset, tile, resource, glb);
    }

    // @deprecated CESIUM_mesh_vector to be removed after v1.142 release.
    if (
      tileset.hasExtension("3DTILES_content_gltf_vector") ||
      tileset.isGltfExtensionUsed("CESIUM_mesh_vector")
    ) {
      return VectorGltf3DTileContent.fromGltf(tileset, tile, resource, glb);
    }

    return Model3DTileContent.fromGltf(tileset, tile, resource, glb);
  },
  gltf: function (tileset, tile, resource, json) {
    if (
      GaussianSplat3DTileContent.tilesetRequiresGaussianSplattingExt(tileset)
    ) {
      return GaussianSplat3DTileContent.fromGltf(tileset, tile, resource, json);
    }

    // @deprecated CESIUM_mesh_vector to be removed after v1.142 release.
    if (
      tileset.hasExtension("3DTILES_content_gltf_vector") ||
      tileset.isGltfExtensionUsed("CESIUM_mesh_vector")
    ) {
      return VectorGltf3DTileContent.fromGltf(tileset, tile, resource, json);
    }

    return Model3DTileContent.fromGltf(tileset, tile, resource, json);
  },
  geoJson: function (tileset, tile, resource, json) {
    return Model3DTileContent.fromGeoJson(tileset, tile, resource, json);
  },
};
export default Cesium3DTileContentFactory;
