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

const ERR_NOT_IMPLEMENTED = "Not implemented.";
const ERR_INSTANTIATION =
  "This function defines an interface and should not be called directly.";
const ERR_RESIZE = "Collection buffer size is immutable after initialization.";
const ERR_CAPACITY = "Collection buffer capacity exceeded.";

/**
 * @param {unknown} condition
 * @param {string} msg
 * @returns {asserts condition}
 */
function assert(condition, msg) {
  if (!condition) {
    throw new DeveloperError(msg);
  }
}

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

  /**
   * @returns {boolean}
   * @protected
   */
  _isResizable() {
    return this._index === this._collection._batchCount - 1;
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

  /////////////////////////////////////////////////////////////////////////////
  // DATAVIEW ACCESSORS

  /**
   * @param {number} itemByteOffset
   * @returns {number}
   */
  _getUint8(itemByteOffset) {
    return this._collection._batchView.getUint8(
      this._byteOffset + itemByteOffset,
    );
  }

  /**
   * @param {number} itemByteOffset
   * @param {number} itemValue
   */
  _setUint8(itemByteOffset, itemValue) {
    this._collection._batchView.setUint8(
      this._byteOffset + itemByteOffset,
      itemValue,
    );
  }

  /**
   * @param {number} itemByteOffset
   * @returns {number}
   */
  _getUint32(itemByteOffset) {
    return this._collection._batchView.getUint32(
      this._byteOffset + itemByteOffset,
      true,
    );
  }

  /**
   * @param {number} itemByteOffset
   * @param {number} itemValue
   */
  _setUint32(itemByteOffset, itemValue) {
    this._collection._batchView.setUint32(
      this._byteOffset + itemByteOffset,
      itemValue,
      true,
    );
  }

  /**
   * @param {number} itemByteOffset
   * @returns {number}
   */
  _getFloat32(itemByteOffset) {
    return this._collection._batchView.getFloat32(
      this._byteOffset + itemByteOffset,
      true,
    );
  }

  /**
   * @param {number} itemByteOffset
   * @param {number} itemValue
   */
  _setFloat32(itemByteOffset, itemValue) {
    this._collection._batchView.setFloat32(
      this._byteOffset + itemByteOffset,
      itemValue,
      true,
    );
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
   * @param {number} [options.maxPositionCount=4096]
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
    this._batchCountMax = options.maxInstanceCount ?? 1024;
    /** @type {ArrayBuffer} */
    this._batchBuffer = null;
    /** @type {DataView<ArrayBuffer>} */
    this._batchView = null;

    this._allocateBatchBuffer();

    /** @type {number} */
    this._positionCount = 0;
    /** @type {number} */
    this._positionCountMax = options.maxPositionCount ?? 4096;
    /** @type {ArrayBuffer} */
    this._positionBuffer = null;
    /** @type {Float64Array<ArrayBuffer>} */
    this._positionF64 = null;

    this._allocatePositionBuffer();
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

  /** @private */
  _allocateBatchBuffer() {
    const batchLayout = /** @type {typeof Vector3DLayout} */ (
      this._getBatchLayout()
    );
    const batchBufferByteLength =
      this._batchCountMax * batchLayout.__BYTE_LENGTH;

    this._batchBuffer = new ArrayBuffer(batchBufferByteLength);
    this._batchView = new DataView(this._batchBuffer);
  }

  /** @private */
  _allocatePositionBuffer() {
    const positionBufferByteLength =
      this._positionCountMax * 3 * Float64Array.BYTES_PER_ELEMENT;
    this._positionBuffer = new ArrayBuffer(positionBufferByteLength);
    this._positionF64 = new Float64Array(this._positionBuffer);
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
    result._setUint32(Vector3DLayout.BATCH_ID_U32, this._nextBatchId++);
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

  /** Offset in bytes, pointing to an offset in elements. */
  POSITION_OFFSET_U32: Vector3DLayout.__BYTE_LENGTH,

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
    const vertexOffset = this._getUint32(Point3DLayout.POSITION_OFFSET_U32);
    return Cartesian3.fromArray(
      // @ts-expect-error TODO(donmccurdy): Will need to support this.
      this._collection._positionF64,
      vertexOffset * 3,
      result,
    );
  }

  /** @param {Cartesian3} position */
  setPosition(position) {
    const collection = /** @type {Point3DCollection} */ (this._collection);
    const vertexOffset = this._getUint32(Point3DLayout.POSITION_OFFSET_U32);

    //>>includeStart('debug', pragmas.debug);
    assert(vertexOffset < collection._positionCountMax, ERR_CAPACITY);
    //>>includeEnd('debug');

    this._collection._positionF64[vertexOffset * 3] = position.x;
    this._collection._positionF64[vertexOffset * 3 + 1] = position.y;
    this._collection._positionF64[vertexOffset * 3 + 2] = position.z;
  }
}

/**
 * @extends Vector3DCollection<Point3D>
 */
class Point3DCollection extends Vector3DCollection {
  /** @type {Record<string, unknown>} */
  _renderContext = null;

  _getVector3DClass() {
    return Point3D;
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

    result._setUint32(Point3DLayout.POSITION_OFFSET_U32, this._positionCount++);
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

    const positionTypedArray = new Float32Array(collection._positionCount * 3);
    const colorTypedArray = new Uint8Array(collection._positionCount * 4);

    for (let i = 0, il = collection._positionCount; i < il; i++) {
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

  /** Offset in bytes, pointing to an offset in elements. */
  POSITION_OFFSET_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 4,
  POSITION_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 8,

  __BYTE_LENGTH:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 12,
};

/**
 * @typedef {object} Polyline3DOptions
 * @property {boolean} [show=true]
 * @property {Color} [color=Color.WHITE]
 * @property {Float64Array} [positions]
 * @property {number} [width=1]
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
  // GEOMETRY

  /** @returns {number} */
  getPositionCount() {
    return this._getUint32(Polyline3DLayout.POSITION_COUNT_U32);
  }

  /**
   * @param {Float64Array} result
   * return {Float64Array}
   */
  getPositions(result) {
    const collection = this._collection;
    const vertexOffset = this._getUint32(Polyline3DLayout.POSITION_OFFSET_U32);
    const vertexCount = this._getUint32(Polyline3DLayout.POSITION_COUNT_U32);
    const positionF64 = collection._positionF64;
    for (let i = 0; i < vertexCount; i++) {
      result[i * 3] = positionF64[(vertexOffset + i) * 3];
      result[i * 3 + 1] = positionF64[(vertexOffset + i) * 3 + 1];
      result[i * 3 + 2] = positionF64[(vertexOffset + i) * 3 + 2];
    }
    return result;
  }

  /** @param {Float64Array} positions */
  setPositions(positions) {
    const collection = this._collection;
    const vertexOffset = this._getUint32(Polyline3DLayout.POSITION_OFFSET_U32);
    const srcCount = this._getUint32(Polyline3DLayout.POSITION_COUNT_U32);
    const dstCount = positions.length / 3;
    const collectionCount = collection._positionCount + dstCount - srcCount;

    //>>includeStart('debug', pragmas.debug);
    assert(srcCount === dstCount || this._isResizable(), ERR_RESIZE);
    assert(collectionCount <= collection._positionCountMax, ERR_CAPACITY);
    //>>includeEnd('debug');

    collection._positionCount = collectionCount;
    this._setUint32(Polyline3DLayout.POSITION_COUNT_U32, dstCount);

    const positionF64 = collection._positionF64;
    for (let i = 0; i < dstCount; i++) {
      positionF64[(vertexOffset + i) * 3] = positions[i * 3];
      positionF64[(vertexOffset + i) * 3 + 1] = positions[i * 3 + 1];
      positionF64[(vertexOffset + i) * 3 + 2] = positions[i * 3 + 2];
    }
  }

  /////////////////////////////////////////////////////////////////////////////
  // ACCESSORS

  /** @type {number} */
  get width() {
    return this._getUint8(Polyline3DLayout.WIDTH_U8);
  }

  set width(width) {
    this._setUint8(Polyline3DLayout.WIDTH_U8, width);
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

    const vertexOffset = this._positionCount * 3;
    result._setUint32(Polyline3DLayout.POSITION_OFFSET_U32, vertexOffset);
    result._setUint32(Polyline3DLayout.POSITION_COUNT_U32, 0);

    result.width = options.width ?? 1;

    if (defined(options.positions)) {
      result.setPositions(options.positions);
    }

    return result;
  }
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// POLYGON3D

const Polygon3DLayout = {
  ...Vector3DLayout,

  BOUNDING_SPHERE: Vector3DLayout.__BYTE_LENGTH,

  /** Offset in bytes, pointing to an offset in elements. */
  POSITION_OFFSET_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength,
  POSITION_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 4,

  /** Offset in bytes, pointing to an offset in elements. */
  HOLE_OFFSET_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 8,
  HOLE_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 12,

  /** Offset in bytes, pointing to an offset in elements. */
  TRIANGLE_OFFSET_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 16,
  TRIANGLE_COUNT_U32:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 20,

  __BYTE_LENGTH:
    Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 24,
};

/**
 * @typedef {object} Polygon3DOptions
 * @property {boolean} [show=true]
 * @property {Color} [color=Color.WHITE]
 * @property {Float64Array} [positions]
 * @property {Uint32Array} [holes]
 * @property {Uint32Array} [triangles]
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

  /////////////////////////////////////////////////////////////////////////////
  // GEOMETRY

  /** @returns {number} */
  getVertexCount() {
    return this._getUint32(Polygon3DLayout.POSITION_COUNT_U32);
  }

  /**
   * @param {Float64Array} result
   * return {Float64Array}
   */
  getPositions(result) {
    const collection = this._collection;
    const vertexOffset = this._getUint32(Polygon3DLayout.POSITION_OFFSET_U32);
    const vertexCount = this._getUint32(Polygon3DLayout.POSITION_COUNT_U32);
    const positionF64 = collection._positionF64;
    for (let i = 0; i < vertexCount; i++) {
      result[i * 3] = positionF64[(vertexOffset + i) * 3];
      result[i * 3 + 1] = positionF64[(vertexOffset + i) * 3 + 1];
      result[i * 3 + 2] = positionF64[(vertexOffset + i) * 3 + 2];
    }
    return result;
  }

  /** @param {Float64Array} positions */
  setPositions(positions) {
    const collection = this._collection;
    const vertexOffset = this._getUint32(Polygon3DLayout.POSITION_OFFSET_U32);
    const srcCount = this._getUint32(Polygon3DLayout.POSITION_COUNT_U32);
    const dstCount = positions.length / 3;
    const collectionCount = collection._positionCount + dstCount - srcCount;

    //>>includeStart('debug', pragmas.debug);
    assert(srcCount === dstCount || this._isResizable(), ERR_RESIZE);
    assert(collectionCount <= collection._positionCountMax, ERR_CAPACITY);
    //>>includeEnd('debug');

    collection._positionCount = collectionCount;
    this._setUint32(Polygon3DLayout.POSITION_COUNT_U32, dstCount);

    const positionF64 = collection._positionF64;
    for (let i = 0; i < dstCount; i++) {
      positionF64[(vertexOffset + i) * 3] = positions[i * 3];
      positionF64[(vertexOffset + i) * 3 + 1] = positions[i * 3 + 1];
      positionF64[(vertexOffset + i) * 3 + 2] = positions[i * 3 + 2];
    }
  }

  /** @returns {number} */
  getHoleCount() {
    return this._getUint32(Polygon3DLayout.HOLE_COUNT_U32);
  }

  /**
   * @param {Uint32Array} result
   * @returns {Uint32Array}
   */
  getHoles(result) {
    const collection = /** @type {Polygon3DCollection} */ (this._collection);
    const holeOffset = this._getUint32(Polygon3DLayout.HOLE_OFFSET_U32);
    const holeCount = this._getUint32(Polygon3DLayout.HOLE_COUNT_U32);
    const holeIndexU32 = collection._holeIndexU32;
    for (let i = 0; i < holeCount; i++) {
      result[i] = holeIndexU32[holeOffset + i];
    }
    return result;
  }

  /** @param {Uint32Array} holes */
  setHoles(holes) {
    const collection = /** @type {Polygon3DCollection} */ (this._collection);
    const holeOffset = this._getUint32(Polygon3DLayout.HOLE_OFFSET_U32);
    const srcCount = this._getUint32(Polygon3DLayout.HOLE_COUNT_U32);
    const dstCount = holes.length;
    const collectionCount = collection._holeCount + dstCount - srcCount;

    //>>includeStart('debug', pragmas.debug);
    assert(srcCount === dstCount || this._isResizable(), ERR_RESIZE);
    assert(collectionCount <= collection._holeCountMax, ERR_CAPACITY);
    //>>includeEnd('debug');

    collection._holeCount = collectionCount;
    this._setUint32(Polygon3DLayout.HOLE_COUNT_U32, dstCount);

    const holeIndexU32 = collection._holeIndexU32;
    for (let i = 0; i < dstCount; i++) {
      holeIndexU32[holeOffset + i] = holes[i];
    }
  }

  /** @returns {number} */
  getTriangleCount() {
    return this._getUint32(Polygon3DLayout.TRIANGLE_COUNT_U32);
  }

  /**
   * @param {Uint32Array} result
   * @returns {Uint32Array}
   */
  getTriangles(result) {
    const collection = /** @type {Polygon3DCollection} */ (this._collection);
    const triangleOffset = this._getUint32(Polygon3DLayout.TRIANGLE_OFFSET_U32);
    const triangleCount = this._getUint32(Polygon3DLayout.TRIANGLE_COUNT_U32);
    const indices = collection._triangleIndexU32;
    for (let i = 0; i < triangleCount; i++) {
      result[i * 3] = indices[(triangleOffset + i) * 3];
      result[i * 3 + 1] = indices[(triangleOffset + i) * 3 + 1];
      result[i * 3 + 2] = indices[(triangleOffset + i) * 3 + 2];
    }
    return result;
  }

  /** @param {Uint32Array} indices */
  setTriangles(indices) {
    const collection = /** @type {Polygon3DCollection} */ (this._collection);
    const triangleOffset = this._getUint32(Polygon3DLayout.TRIANGLE_OFFSET_U32);
    const srcCount = this._getUint32(Polygon3DLayout.TRIANGLE_COUNT_U32);
    const dstCount = indices.length / 3;
    const collectionCount = collection._triangleCount + dstCount - srcCount;

    //>>includeStart('debug', pragmas.debug);
    assert(srcCount === dstCount || this._isResizable(), ERR_RESIZE);
    assert(collectionCount <= collection._triangleCountMax, ERR_CAPACITY);
    //>>includeEnd('debug');

    collection._triangleCount += dstCount - srcCount;
    this._setUint32(Polygon3DLayout.TRIANGLE_COUNT_U32, dstCount);

    const dstIndices = collection._triangleIndexU32;
    for (let i = 0; i < dstCount; i++) {
      dstIndices[(triangleOffset + i) * 3] = indices[i * 3];
      dstIndices[(triangleOffset + i) * 3 + 1] = indices[i * 3 + 1];
      dstIndices[(triangleOffset + i) * 3 + 2] = indices[i * 3 + 2];
    }
  }
}

/**
 * @extends Vector3DCollection<Polygon3D>
 */
class Polygon3DCollection extends Vector3DCollection {
  /**
   * @param {object} options
   * @param {number} [options.maxHoleCount = 0]
   * @param {number} [options.maxTriangleCount = 4096]
   */
  constructor(options = Frozen.EMPTY_OBJECT) {
    // @ts-expect-error TODO(donmccurdy): Define interfaces in a .d.ts file? Need to duplicate JSDoc?
    super(options);

    /** @type {number} */
    this._holeCount = 0;
    /** @type {number} */
    this._holeCountMax = options.maxHoleCount ?? 0;
    /** @type {ArrayBuffer} */
    this._holeIndexBuffer = null;
    /** @type {Uint32Array<ArrayBuffer>} */
    this._holeIndexU32 = null;

    this._allocateHoleIndexBuffer();

    /** @type {number} */
    this._triangleCount = 0;
    /** @type {number} */
    this._triangleCountMax = options.maxTriangleCount ?? 4096;
    /** @type {ArrayBuffer} */
    this._triangleIndexBuffer = null;
    /** @type {Uint32Array<ArrayBuffer>} */
    this._triangleIndexU32 = null;

    this._allocateTriangleIndexBuffer();
  }

  _getVector3DClass() {
    return Polygon3D;
  }

  _getBatchLayout() {
    return Polygon3DLayout;
  }

  /////////////////////////////////////////////////////////////////////////////
  // COLLECTION LIFECYCLE

  /**
   * @private
   */
  _allocateHoleIndexBuffer() {
    const holeIndexBufferByteLength =
      this._holeCountMax * Uint32Array.BYTES_PER_ELEMENT;
    this._holeIndexBuffer = new ArrayBuffer(holeIndexBufferByteLength);
    this._holeIndexU32 = new Uint32Array(this._holeIndexBuffer);
  }

  /**
   * @private
   */
  _allocateTriangleIndexBuffer() {
    const triangleIndexBufferByteLength =
      this._triangleCountMax * 3 * Uint32Array.BYTES_PER_ELEMENT;
    this._triangleIndexBuffer = new ArrayBuffer(triangleIndexBufferByteLength);
    this._triangleIndexU32 = new Uint32Array(this._triangleIndexBuffer);
  }

  /////////////////////////////////////////////////////////////////////////////
  // INSTANCE LIFECYCLE

  /**
   * @param {Polygon3DOptions} options
   * @param {Polygon3D} result
   * @override
   */
  add(options, result = new Polygon3D()) {
    super.add(options, result);

    const vertexOffset = this._positionCount;
    result._setUint32(Polygon3DLayout.POSITION_OFFSET_U32, vertexOffset);
    result._setUint32(Polygon3DLayout.POSITION_COUNT_U32, 0);

    const holeOffset = this._holeCount;
    result._setUint32(Polygon3DLayout.HOLE_OFFSET_U32, holeOffset);
    result._setUint32(Polygon3DLayout.HOLE_COUNT_U32, 0);

    const triangleOffset = this._triangleCount;
    result._setUint32(Polygon3DLayout.TRIANGLE_OFFSET_U32, triangleOffset);
    result._setUint32(Polygon3DLayout.TRIANGLE_COUNT_U32, 0);

    if (defined(options.positions)) {
      result.setPositions(options.positions);
    }

    if (defined(options.holes)) {
      result.setHoles(options.holes);
    }

    if (defined(options.triangles)) {
      result.setTriangles(options.triangles);
    }

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
  Polygon3D,
  Polygon3DCollection,
};

export default TODO;
