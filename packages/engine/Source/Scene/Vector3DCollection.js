// @ts-check

import BoundingSphere from "../Core/BoundingSphere.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Color from "../Core/Color.js";
import DeveloperError from "../Core/DeveloperError.js";
import Ellipsoid from "../Core/Ellipsoid.js";
import Frozen from "../Core/Frozen.js";
import Matrix4 from "../Core/Matrix4.js";
import Buffer from "../Renderer/Buffer.js";
import BufferUsage from "../Renderer/BufferUsage.js";
import VertexArray from "../Renderer/VertexArray.js";
import Transforms from "../Core/Transforms.js";
import ComponentDatatype from "../Core/ComponentDatatype.js";
import RenderState from "../Renderer/RenderState.js";
import BlendingState from "./BlendingState.js";
import ShaderSource from "../Renderer/ShaderSource.js";
import ShaderProgram from "../Renderer/ShaderProgram.js";
import DrawCommand from "../Renderer/DrawCommand.js";
import Pass from "../Renderer/Pass.js";
import defined from "../Core/defined.js";
import PrimitiveType from "../Core/PrimitiveType";

/** @import FrameState from "./FrameState"; */

const ERR_NOT_IMPLEMENTED = "Not implemented";
const ERR_INSTANTIATION =
  "This function defines an interface and should not be called directly.";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// VECTOR3D

const Vector3DLayout = {
  BATCH_ID_U32: 0,
  SHOW_U8: 4,
  DESTROYED_U8: 5,
  DIRTY_U8: 6,
  COLOR_U32: 8,

  __BYTE_LENGTH: 12,
};

/**
 * @typedef {object} Vector3DOptions
 * @property {boolean} [show=true]
 * @property {Color} [color=Color.WHITE]
 */

/** @abstract */
class Vector3D {
  /** @type {Vector3DCollection<Vector3D>} */
  _collection = null;

  /** @type {number} */
  _index = -1;

  /** @type {number} */
  _byteOffset = -1;

  /** @type {Color} */
  _color = new Color();

  constructor() {}

  /////////////////////////////////////////////////////////////////////////////
  // LIFECYCLE

  /**
   * @param {unknown} collection
   * @param {number} index
   * @param {Vector3D} result
   * @returns {Vector3D}
   */
  static fromCollection(collection, index, result) {
    result._collection = /** @type {Vector3DCollection<Vector3D>} */ (
      collection
    );
    result._index = index;
    result._byteOffset = index * Vector3DLayout.__BYTE_LENGTH;
    return result;
  }

  destroy() {
    this._destroyed = true;
  }

  /** @returns {boolean} */
  isDestroyed() {
    return this._destroyed;
  }

  /////////////////////////////////////////////////////////////////////////////
  // ACCESSORS

  /** @type {number} */
  get batchId() {
    const byteOffset = this._byteOffset + Vector3DLayout.BATCH_ID_U32;
    return this._collection._batchView.getUint32(byteOffset, true);
  }

  /** @type {boolean} */
  get show() {
    const byteOffset = this._byteOffset + Vector3DLayout.SHOW_U8;
    return this._collection._batchView.getUint8(byteOffset) === 1;
  }

  set show(show) {
    const byteOffset = this._byteOffset + Vector3DLayout.SHOW_U8;
    this._collection._batchView.setUint8(byteOffset, show ? 1 : 0);
  }

  /** @type {boolean} */
  get _dirty() {
    const byteOffset = this._byteOffset + Vector3DLayout.DIRTY_U8;
    return this._collection._batchView.getUint8(byteOffset) === 1;
  }

  set _dirty(dirty) {
    const byteOffset = this._byteOffset + Vector3DLayout.DIRTY_U8;
    this._collection._batchView.setUint8(byteOffset, dirty ? 1 : 0);
  }

  /** @type {boolean} */
  get _destroyed() {
    const byteOffset = this._byteOffset + Vector3DLayout.DESTROYED_U8;
    return this._collection._batchView.getUint8(byteOffset) === 1;
  }

  set _destroyed(destroyed) {
    const byteOffset = this._byteOffset + Vector3DLayout.DESTROYED_U8;
    this._collection._batchView.setUint8(byteOffset, destroyed ? 1 : 0);
  }

  // TODO(donmccurdy): Consider `point.getColor(color)` API instead.
  /** @type {Color} */
  get color() {
    const byteOffset = this._byteOffset + Vector3DLayout.COLOR_U32;
    const rgba = this._collection._batchView.getUint32(byteOffset, true);
    return Color.fromRgba(rgba, this._color);
  }

  set color(color) {
    const byteOffset = this._byteOffset + Vector3DLayout.COLOR_U32;
    this._collection._batchView.setUint32(byteOffset, color.toRgba(), true);
  }
}

/**
 * @abstract
 * @template V extends Vector3D
 */
class Vector3DCollection {
  /**
   * @param {object} options
   * @param {number} [options.maxInstanceCount=1024]
   * @param {number} [options.maxVertexCount=4096]
   * @param {number} [options.maxIndexCount=4096]
   * @param {boolean} [options.show=true] Determines if the collection will be shown.
   * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] The 4x4 transformation matrix that transforms each instance from model to world coordinates.
   * @param {boolean} [options.debugShowBoundingVolume=false]
   */
  constructor(options = Frozen.EMPTY_OBJECT) {
    // Public.

    /** @type {boolean} */
    this.show = options.show ?? true;

    /** @type {Matrix4} */
    this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);

    /** @type {boolean} */
    this.debugShowBoundingVolume = options.debugShowBoundingVolume ?? false;

    // Protected.

    /** @type {number} */
    this._version = 0;

    /** @type {BoundingSphere} */
    this._boundingVolume = new BoundingSphere();

    /** @type {number} */
    this._nextBatchId = 0;

    /** @type {number} */
    this._batchCount = 0;
    /** @type {number} */
    this._batchCapacity = options.maxInstanceCount ?? 1024;
    /** @type {ArrayBuffer} */
    this._batchBuffer = null;
    /** @type {DataView<ArrayBuffer>} */
    this._batchView = null;

    this._allocateBatchBuffer(this._batchCapacity);

    /** @type {number} */
    this._vertexCount = 0;
    /** @type {number} */
    this._vertexCapacity = options.maxVertexCount ?? 4096;
    /** @type {ArrayBuffer} */
    this._vertexBuffer = null;
    /** @type {Float64Array<ArrayBuffer>} */
    this._vertexF64 = null;
    /** @type {Float32Array<ArrayBuffer>} */
    this._vertexF32 = null;
    /** @type {Uint32Array<ArrayBuffer>} */
    this._vertexU32 = null;
    /** @type {Uint8Array<ArrayBuffer>} */
    this._vertexU8 = null;

    this._allocateVertexBuffer(this._vertexCapacity);

    /** @type {number} */
    this._indexCount = 0;
    /** @type {number} */
    this._indexCapacity = options.maxIndexCount ?? 4096;
    /** @type {Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>} */
    this._index = null;

    this._allocateIndexBuffer(this._indexCapacity);
  }

  /**
   * @protected
   * @return {unknown}
   */
  _getVector3DClass() {
    throw new DeveloperError(ERR_INSTANTIATION);
  }

  /**
   * @protected
   * @return {unknown}
   */
  _getBatchLayout() {
    throw new DeveloperError(ERR_INSTANTIATION);
  }

  /////////////////////////////////////////////////////////////////////////////
  // COLLECTION LIFECYCLE

  /** @param {number} capacity */
  _allocateBatchBuffer(capacity) {
    const batchLayout = /** @type {typeof Vector3DLayout} */ (
      this._getBatchLayout()
    );
    const batchBufferByteLength = capacity * batchLayout.__BYTE_LENGTH;

    this._batchBuffer = new ArrayBuffer(batchBufferByteLength);
    this._batchView = new DataView(this._batchBuffer);
    this._batchCapacity = capacity;
  }

  /** @param {number} capacity */
  _allocateVertexBuffer(capacity) {
    const vertexBufferByteLength =
      capacity * 3 * Float64Array.BYTES_PER_ELEMENT;
    this._vertexBuffer = new ArrayBuffer(vertexBufferByteLength);
    this._vertexF64 = new Float64Array(this._vertexBuffer);
    this._vertexF32 = new Float32Array(this._vertexBuffer);
    this._vertexU32 = new Uint32Array(this._vertexBuffer);
    this._vertexU8 = new Uint8Array(this._vertexBuffer);
    this._vertexCapacity = capacity;
  }

  /** @param {number} capacity */
  _allocateIndexBuffer(capacity) {
    const indexBufferByteLength = capacity * Uint32Array.BYTES_PER_ELEMENT;
    this._index = new Uint32Array(indexBufferByteLength);
    this._indexCapacity = capacity;
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    throw new DeveloperError(ERR_NOT_IMPLEMENTED);
  }

  /////////////////////////////////////////////////////////////////////////////
  // INSTANCE LIFECYCLE

  /**
   * @param {Vector3DOptions} options
   * @param {Vector3D} result
   * @returns {Vector3D}
   */
  add(options = Frozen.EMPTY_OBJECT, result) {
    const Vector3DClass = /** @type {typeof Vector3D} */ (
      this._getVector3DClass()
    );
    result = Vector3DClass.fromCollection(this, this._batchCount++, result);
    this._batchView.setUint32(
      result._byteOffset + Vector3DLayout.BATCH_ID_U32,
      this._nextBatchId++,
      true,
    );
    result._destroyed = false;
    result._dirty = true;
    result.show = options.show ?? true;
    result.color = options.color ?? Color.WHITE;
    return result;
  }

  /**
   * @param {number} index
   */
  remove(index) {
    throw new DeveloperError(ERR_NOT_IMPLEMENTED);
  }

  removeAll() {
    throw new DeveloperError(ERR_NOT_IMPLEMENTED);
  }

  /**
   * @param {Function} sortFn
   */
  sort(sortFn) {
    throw new DeveloperError(ERR_NOT_IMPLEMENTED);
  }

  /////////////////////////////////////////////////////////////////////////////
  // RENDER

  /** @param {object} frameState */
  update(frameState) {
    throw new DeveloperError(ERR_NOT_IMPLEMENTED);
  }

  /////////////////////////////////////////////////////////////////////////////
  // ACCESSORS

  /** @type {number} */
  get length() {
    return this._batchCount;
  }
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// POINT3D

const Point3DLayout = {
  ...Vector3DLayout,

  /** Offset in elements, not bytes. */
  VERTEX_OFFSET_U32: Vector3DLayout.__BYTE_LENGTH,

  __BYTE_LENGTH: Vector3DLayout.__BYTE_LENGTH + 4,
};

/**
 * @typedef {object} Point3DOptions
 * @property {boolean} [show=true]
 * @property {Color} [color=Color.WHITE]
 * @property {Cartesian3} [position=Cartesian3.ZERO]
 */

/**
 * TODO(donmccurdy)
 */
class Point3D extends Vector3D {
  /**
   * @param {Point3DCollection} collection
   * @param {number} index
   * @param {Point3D} result
   * @returns {Point3D}
   * @override
   */
  static fromCollection(collection, index, result = new Point3D()) {
    super.fromCollection(collection, index, result);
    result._byteOffset = index * Point3DLayout.__BYTE_LENGTH;
    return result;
  }

  /////////////////////////////////////////////////////////////////////////////
  // GEOMETRY

  /**
   * @param {Cartesian3} result
   * @returns {Cartesian3}
   */
  getPosition(result) {
    const vertexOffset = this._collection._batchView.getUint32(
      this._byteOffset + Point3DLayout.VERTEX_OFFSET_U32,
      true,
    );
    return Cartesian3.fromArray(
      // @ts-expect-error TODO(donmccurdy): Will need to support this.
      this._collection._vertexF64,
      vertexOffset,
      result,
    );
  }

  /** @param {Cartesian3} position */
  setPosition(position) {
    const vertexOffset = this._collection._batchView.getUint32(
      this._byteOffset + Point3DLayout.VERTEX_OFFSET_U32,
      true,
    );
    this._collection._vertexF64[vertexOffset] = position.x;
    this._collection._vertexF64[vertexOffset + 1] = position.y;
    this._collection._vertexF64[vertexOffset + 2] = position.z;
  }
}

/**
 * @extends Vector3DCollection<Point3D>
 */
class Point3DCollection extends Vector3DCollection {
  /** @type {Record<string, unknown>} */
  _renderContext = null;

  _getVector3DClass() {
    return /** @type {unknown} */ (Point3D);
  }

  _getBatchLayout() {
    return Point3DLayout;
  }

  /**
   * @param {Point3DOptions} options
   * @param {Point3D} result
   * @override
   */
  add(options, result = new Point3D()) {
    super.add(options, result);

    this._batchView.setUint32(
      result._byteOffset + Point3DLayout.VERTEX_OFFSET_U32,
      this._vertexCount * 3,
      true,
    );
    this._vertexCount++;
    result.setPosition(options.position ?? Cartesian3.ZERO);

    return result;
  }

  /////////////////////////////////////////////////////////////////////////////
  // RENDER

  /** @param {FrameState} frameState */
  update(frameState) {
    this._renderContext = renderPoints(this, frameState, this._renderContext);
  }
}

const Point3DAttributeLocations = {
  position: 0,
  color: 1,
};

/**
 * @typedef {object} Point3DRenderContext
 * @property {VertexArray} [vertexArray]
 * @property {RenderState} [renderState]
 * @property {ShaderProgram} [shaderProgram]
 * @property {object} [uniformMap]
 * @property {Matrix4} [transform]
 */

/**
 * @param {Point3DCollection} collection
 * @param {FrameState} frameState
 * @param {Point3DRenderContext} [renderContext]
 * @returns {Point3DRenderContext}
 */
function renderPoints(collection, frameState, renderContext) {
  const context = frameState.context;
  renderContext = renderContext || {};

  if (!defined(renderContext.transform)) {
    const globalMin = new Cartesian3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    const globalMax = new Cartesian3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );

    const point = new Point3D();
    const globalCartesian = new Cartesian3();

    for (let i = 0, il = collection.length; i < il; i++) {
      Point3D.fromCollection(collection, i, point).getPosition(globalCartesian);
      Cartesian3.minimumByComponent(globalMin, globalCartesian, globalMin);
      Cartesian3.maximumByComponent(globalMax, globalCartesian, globalMax);
    }

    // Compute the ENU matrix
    const ecefCenter = Cartesian3.midpoint(
      globalMin,
      globalMax,
      new Cartesian3(),
    );

    const toGlobal = Transforms.eastNorthUpToFixedFrame(
      ecefCenter,
      Ellipsoid.WGS84,
      new Matrix4(),
    );

    renderContext.transform = toGlobal;

    // TODO(donmccurdy): Renderer shouldn't be responsible for updating collection.
    BoundingSphere.fromCornerPoints(
      globalMin,
      globalMax,
      collection._boundingVolume,
    );
  }

  if (!defined(renderContext.vertexArray)) {
    const point = new Point3D();
    const globalCartesian = new Cartesian3();
    const localCartesian = new Cartesian3();

    const localMin = new Cartesian3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );

    const localMax = new Cartesian3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );

    const toLocal = Matrix4.inverseTransformation(
      renderContext.transform,
      new Matrix4(),
    );

    const positionTypedArray = new Float32Array(collection._vertexCount * 3);
    const colorTypedArray = new Uint8Array(collection._vertexCount * 4);

    for (let i = 0, il = collection._vertexCount; i < il; i++) {
      Point3D.fromCollection(collection, i, point);

      // Position.
      point.getPosition(globalCartesian);
      Matrix4.multiplyByPoint(toLocal, globalCartesian, localCartesian);
      Cartesian3.minimumByComponent(localMin, localCartesian, localMin);
      Cartesian3.maximumByComponent(localMax, localCartesian, localMax);
      // @ts-expect-error TODO(donmccurdy): Incorrect types.
      Cartesian3.pack(localCartesian, positionTypedArray, i * 3);

      // Color.
      // @ts-expect-error TODO(donmccurdy): Incorrect types.
      Color.pack(point.color, colorTypedArray, i * 4);
    }

    const positionBuffer = Buffer.createVertexBuffer({
      typedArray: positionTypedArray,
      context,
      // @ts-expect-error TODO(donmccurdy): BufferUsage types incorrect.
      usage: BufferUsage.STATIC_DRAW,
    });

    const colorBuffer = Buffer.createVertexBuffer({
      typedArray: colorTypedArray,
      context,
      // @ts-expect-error TODO(donmccurdy): BufferUsage types incorrect.
      usage: BufferUsage.STATIC_DRAW,
    });

    renderContext.vertexArray = new VertexArray({
      context,
      attributes: [
        {
          index: Point3DAttributeLocations.position,
          vertexBuffer: positionBuffer,
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
        },
        {
          index: Point3DAttributeLocations.color,
          vertexBuffer: colorBuffer,
          componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
          componentsPerAttribute: 4,
        },
      ],
    });
  }

  if (!defined(renderContext.renderState)) {
    // @ts-expect-error TODO(donmccurdy): Will need to expose fromCache.
    renderContext.renderState = RenderState.fromCache({
      blending: BlendingState.DISABLED,
      depthMask: false,
      depthTest: { enabled: false }, // TODO(donmccurdy)
      polygonOffset: { enabled: false },
    });
  }

  if (!defined(renderContext.uniformMap)) {
    renderContext.uniformMap = {};
  }

  if (!defined(renderContext.shaderProgram)) {
    const vertexShaderSource = new ShaderSource({
      defines: [],
      sources: [
        `
in vec3 position;
in vec4 color;
void main()
{
  // TODO(donmccurdy): u_modelViewMatrix * position, possibly?
  vec4 positionEC = vec4(position, 1.0);
  gl_Position = czm_projection * positionEC;
}`.trim(),
      ],
    });

    const fragmentShaderSource = new ShaderSource({
      defines: [],
      sources: [
        `
void main()
{
  out_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  czm_writeLogDepth();
}`.trim(),
      ],
    });

    renderContext.shaderProgram = ShaderProgram.fromCache({
      context,
      vertexShaderSource,
      fragmentShaderSource,
      attributeLocations: Point3DAttributeLocations,
    });
  }

  const command = new DrawCommand({
    primitiveType: PrimitiveType.POINTS,
    pass: Pass.OPAQUE,

    vertexArray: renderContext.vertexArray,
    renderState: renderContext.renderState,
    shaderProgram: renderContext.shaderProgram,
    uniformMap: renderContext.uniformMap,

    owner: collection,
    boundingVolume: collection._boundingVolume,
    debugShowBoundingVolume: collection.debugShowBoundingVolume,

    // TODO(donmccurdy): pickId
  });

  frameState.commandList.push(command);

  return renderContext;
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// POLYLINE3D

const Polyline3DLayout = {
  ...Vector3DLayout,

  BOUNDING_SPHERE: Vector3DLayout.__BYTE_LENGTH,
  WIDTH_U8: Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength,

  /** Offset in elements, not bytes. */
  VERTEX_OFFSET_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 4,
  VERTEX_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 8,

  /** Offset in elements, not bytes. */
  INDEX_OFFSET_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 12,
  INDEX_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 16,

  __BYTE_LENGTH:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 20,
};

/**
 * @typedef {object} Polyline3DOptions
 * @property {boolean} [show=true]
 * @property {Color} [color=Color.WHITE]
 */

/**
 * TODO
 */
class Polyline3D extends Vector3D {
  /** @type {BoundingSphere} */
  _boundingSphere = new BoundingSphere();

  /////////////////////////////////////////////////////////////////////////////
  // LIFECYCLE

  /**
   * @param {Polyline3DCollection} collection
   * @param {number} index
   * @param {Polyline3D} result
   * @returns {Polyline3D}
   * @override
   */
  static fromCollection(collection, index, result = new Polyline3D()) {
    super.fromCollection(collection, index, result);
    result._byteOffset = index * Polyline3DLayout.__BYTE_LENGTH;
    return result;
  }

  /////////////////////////////////////////////////////////////////////////////
  // ACCESSORS

  /** @type {number} */
  get width() {
    const byteOffset = this._byteOffset + Polyline3DLayout.WIDTH_U8;
    return this._collection._batchView.getUint8(byteOffset);
  }

  set width(width) {
    const byteOffset = this._byteOffset + Polyline3DLayout.WIDTH_U8;
    this._collection._batchView.setUint8(byteOffset, width);
  }
}

/**
 * @extends Vector3DCollection<Polyline3D>
 */
class Polyline3DCollection extends Vector3DCollection {
  _getVector3DClass() {
    return Polyline3D;
  }

  _getBatchLayout() {
    return Polyline3DLayout;
  }

  /**
   * @param {Polyline3DOptions} options
   * @param {Polyline3D} result
   * @override
   */
  add(options, result = new Polyline3D()) {
    super.add(options, result);

    throw new DeveloperError(ERR_NOT_IMPLEMENTED);

    // eslint-disable-next-line no-unreachable
    return result;
  }
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// POLYGON3D

const Polygon3DLayout = {
  ...Vector3DLayout,

  BOUNDING_SPHERE: Vector3DLayout.__BYTE_LENGTH,

  /** Offset in elements, not bytes. */
  VERTEX_OFFSET_U32: Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength,
  VERTEX_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 4,

  /** Offset in elements, not bytes. */
  INDEX_OFFSET_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 8,
  INDEX_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 12,

  __BYTE_LENGTH:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 16,
};

/**
 * @typedef {object} Polygon3DOptions
 * @property {boolean} [show=true]
 * @property {Color} [color=Color.WHITE]
 */

/**
 * TODO
 */
class Polygon3D extends Vector3D {
  /** @type {BoundingSphere} */
  _boundingSphere = new BoundingSphere();

  /////////////////////////////////////////////////////////////////////////////
  // LIFECYCLE

  /**
   * @param {Polygon3DCollection} collection
   * @param {number} index
   * @param {Polygon3D} result
   * @returns {Polygon3D}
   * @override
   */
  static fromCollection(collection, index, result = new Polygon3D()) {
    super.fromCollection(collection, index, result);
    result._byteOffset = index * Polygon3DLayout.__BYTE_LENGTH;
    return result;
  }
}

/**
 * @extends Vector3DCollection<Polygon3D>
 */
class Polygon3DCollection extends Vector3DCollection {
  _getVector3DClass() {
    return Polygon3D;
  }

  _getBatchLayout() {
    return Polygon3DLayout;
  }

  /**
   * @param {Polygon3DOptions} options
   * @param {Polygon3D} result
   * @override
   */
  add(options, result = new Polygon3D()) {
    super.add(options, result);

    throw new DeveloperError(ERR_NOT_IMPLEMENTED);

    // eslint-disable-next-line no-unreachable
    return result;
  }
}

// TODO(donmccurdy): Split into separate files before merging.
const TODO = {
  Vector3D,
  Vector3DCollection,
  Point3D,
  Point3DCollection,
  Polyline3D,
  Polyline3DCollection,
  Polygon3DCollection,
};

export default TODO;
