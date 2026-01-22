// @ts-check

import BoundingSphere from "../Core/BoundingSphere.js";
import Cartesian3 from "../Core/Cartesian3";
import Color from "../Core/Color.js";
import DeveloperError from "../Core/DeveloperError.js";
import Frozen from "../Core/Frozen.js";
import Matrix4 from "../Core/Matrix4.js";

const ERR_NOT_IMPLEMENTED = "Not implemented";
const ERR_INSTANTIATION =
  "This function defines an interface and should not be called directly.";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// VECTOR3D

const Vector3DLayout = {
  ID_U32: 0,
  SHOW_U8: 4,
  DESTROYED_U8: 5,
  DIRTY_U8: 6,
  COLOR_U32: 8,

  /** Offset in elements, not bytes. */
  VERTEX_OFFSET_U32: 12,
  VERTEX_COUNT_U32: 16, // TODO(donmccurdy): Doesn't apply to Point3D.

  /** Offset in elements, not bytes. */
  INDEX_OFFSET_U32: 20, // TODO(donmccurdy): Doesn't apply to Point3D.
  INDEX_COUNT_U32: 24, // TODO(donmccurdy): Doesn't apply to Point3D.

  __BYTE_LENGTH: 32, // TODO(donmccurdy): Limit to space required.
};

/** @abstract */
export class Vector3D {
  /**
   * @param {Vector3DCollection<Vector3D>} collection
   * @param {number} index
   */
  constructor(collection, index) {
    /** @type {Vector3DCollection<Vector3D>} */
    this._collection = collection;

    /** @type {number} */
    this._index = index;

    /** @type {number} */
    this._byteOffset = index * Vector3DLayout.__BYTE_LENGTH;

    /** @type {Color} */
    this._color = new Color();
  }

  /////////////////////////////////////////////////////////////////////////////
  // LIFECYCLE

  /**
   * @param {Vector3D} result
   * @returns {Vector3D}
   */
  static fromDefaults(result) {
    result.show = true;
    result._destroyed = false;
    result.dirty = true;
    result.color = Color.fromRgba(0xffffff, result._color);
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
  // GEOMETRY

  /**
   * @param {Cartesian3} result
   * @returns {Cartesian3}
   */
  getPosition(result) {
    const vertexOffset = this._collection._batchView.getUint32(
      this._byteOffset + Vector3DLayout.VERTEX_OFFSET_U32,
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
      this._byteOffset + Vector3DLayout.VERTEX_OFFSET_U32,
      true,
    );
    this._collection._vertexF64[vertexOffset] = position.x;
    this._collection._vertexF64[vertexOffset + 1] = position.y;
    this._collection._vertexF64[vertexOffset + 2] = position.z;
    this._collection._batchView.setUint32(
      this._byteOffset + Vector3DLayout.VERTEX_COUNT_U32,
      1,
      true,
    );
  }

  /////////////////////////////////////////////////////////////////////////////
  // ACCESSORS

  /** @returns {boolean} */
  get show() {
    const byteOffset = this._byteOffset + Vector3DLayout.SHOW_U8;
    return this._collection._batchView.getUint8(byteOffset) === 1;
  }

  /**
   * @param {boolean} show
   */
  set show(show) {
    const byteOffset = this._byteOffset + Vector3DLayout.SHOW_U8;
    this._collection._batchView.setUint8(byteOffset, show ? 1 : 0);
  }

  /** @returns {boolean} */
  get dirty() {
    const byteOffset = this._byteOffset + Vector3DLayout.DIRTY_U8;
    return this._collection._batchView.getUint8(byteOffset) === 1;
  }

  /**
   * @param {boolean} dirty
   */
  set dirty(dirty) {
    const byteOffset = this._byteOffset + Vector3DLayout.DIRTY_U8;
    this._collection._batchView.setUint8(byteOffset, dirty ? 1 : 0);
  }

  /** @returns {boolean} */
  get _destroyed() {
    const byteOffset = this._byteOffset + Vector3DLayout.DESTROYED_U8;
    return this._collection._batchView.getUint8(byteOffset) === 1;
  }

  /**
   * @param {boolean} destroyed
   */
  set _destroyed(destroyed) {
    const byteOffset = this._byteOffset + Vector3DLayout.DESTROYED_U8;
    this._collection._batchView.setUint8(byteOffset, destroyed ? 1 : 0);
  }

  get color() {
    const byteOffset = this._byteOffset + Vector3DLayout.COLOR_U32;
    const rgba = this._collection._batchView.getUint32(byteOffset, true);
    return Color.fromRgba(rgba, this._color);
  }

  /**
   * @param {Color} color
   */
  set color(color) {
    const byteOffset = this._byteOffset + Vector3DLayout.COLOR_U32;
    this._collection._batchView.setUint32(byteOffset, color.toRgba(), true);
  }
}

/**
 * @typedef {new(id: number, collection: unknown) => V} Vector3DConstructor
 * @template V extends Vector3D
 */

/**
 * @abstract
 * @template V extends Vector3D
 */
export class Vector3DCollection {
  /**
   * @param {object} options
   * @param {number} [options.maxPrimitiveCount=1024]
   * @param {number} [options.maxVertexCount=4096]
   * @param {number} [options.maxIndexCount=4096]
   * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] The 4x4 transformation matrix that transforms each polyline from model to world coordinates.
   * @param {boolean} [options.show=true] Determines if the polylines in the collection will be shown.
   */
  constructor(options = Frozen.EMPTY_OBJECT) {
    // Public.

    /** @type {boolean} */
    this.show = options.show ?? true;

    /** @type {Matrix4} */
    this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);

    // Protected.

    /** @type {number} */
    this._version = 0;

    /** @type {BoundingSphere} */
    this._boundingVolume = new BoundingSphere();

    /** @type {number} */
    this._batchCount = 0;
    /** @type {number} */
    this._batchCapacity = options.maxPrimitiveCount ?? 1024;
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

    this._allocateBatchBuffer(this._indexCapacity);
  }

  /**
   * @protected
   * @return {unknown}
   */
  _getPrimitiveType() {
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
    const vertexBufferByteLength = (capacity || 4096) * 3;

    this._vertexBuffer = new ArrayBuffer(vertexBufferByteLength);
    this._vertexF64 = new Float64Array(this._vertexBuffer);
    this._vertexF32 = new Float32Array(this._vertexBuffer);
    this._vertexU32 = new Uint32Array(this._vertexBuffer);
    this._vertexU8 = new Uint8Array(this._vertexBuffer);
    this._indexCapacity = capacity;
  }

  /** @param {number} capacity */
  _allocateIndexBuffer(capacity) {
    this._index = new Uint32Array(capacity || 4096);
    this._indexCapacity = capacity;
  }

  destroy() {
    throw new DeveloperError(ERR_NOT_IMPLEMENTED);
  }

  /////////////////////////////////////////////////////////////////////////////
  // PRIMITIVE LIFECYCLE

  /**
   * @returns {V}
   */
  add() {
    // @ts-expect-error TODO(donmccurdy)
    return this._getPrimitiveType().fromDefaults(this.get(this._batchCount++));
  }

  /**
   * @param {number} index
   * @returns {V}
   */
  get(index) {
    const PrimitiveType = /** @type {Vector3DConstructor<V>} */ (
      this._getPrimitiveType()
    );
    return new PrimitiveType(index, this);
  }

  /**
   * @param {V} primitive
   */
  release(primitive) {
    throw new DeveloperError(ERR_NOT_IMPLEMENTED);
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

  get length() {
    return this._batchCount;
  }
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// POINT3D

const Point3DLayout = {
  ...Vector3DLayout,
  __BYTE_LENGTH: Vector3DLayout.__BYTE_LENGTH,
};

export class Point3D extends Vector3D {
  /**
   * @param {Point3DCollection} collection
   * @param {number} index
   */
  constructor(collection, index) {
    super(collection, index);
  }

  /**
   * @param {Point3D} result
   * @override
   */
  static fromDefaults(result) {
    return super.fromDefaults(result);
  }
}

/**
 * @extends Vector3DCollection<Point3D>
 */
export class Point3DCollection extends Vector3DCollection {
  _getPrimitiveType() {
    return /** @type {unknown} */ (Point3D);
  }

  _getBatchLayout() {
    return Point3DLayout;
  }
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// POLYLINE3D

const Polyline3DLayout = {
  ...Vector3DLayout,
  BOUNDING_SPHERE: Vector3DLayout.__BYTE_LENGTH,
  WIDTH_U8: Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength,
  __BYTE_LENGTH: Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength + 4,
};

export class Polyline3D extends Vector3D {
  /**
   * @param {Polyline3DCollection} collection
   * @param {number} index
   */
  constructor(collection, index) {
    super(collection, index);

    /** @type {BoundingSphere} */
    this._boundingSphere = new BoundingSphere();
  }

  /////////////////////////////////////////////////////////////////////////////
  // LIFECYCLE

  /**
   * @param {Polyline3D} result
   * @override
   */
  static fromDefaults(result) {
    return super.fromDefaults(result);
  }

  /////////////////////////////////////////////////////////////////////////////
  // ACCESSORS

  /** @returns {number} */
  get width() {
    const byteOffset = this._byteOffset + Polyline3DLayout.WIDTH_U8;
    return this._collection._batchView.getUint8(byteOffset);
  }

  /**
   * @param {number} width
   */
  set width(width) {
    const byteOffset = this._byteOffset + Polyline3DLayout.WIDTH_U8;
    this._collection._batchView.setUint8(byteOffset, width);
  }
}

/**
 * @extends Vector3DCollection<Polyline3D>
 */
export class Polyline3DCollection extends Vector3DCollection {
  _getPrimitiveType() {
    return Polyline3D;
  }

  _getBatchLayout() {
    return Polyline3DLayout;
  }
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// POLYGON3D

const Polygon3DLayout = {
  ...Vector3DLayout,
  BOUNDING_SPHERE: Vector3DLayout.__BYTE_LENGTH,
  __BYTE_LENGTH: Vector3DLayout.__BYTE_LENGTH + BoundingSphere.packedLength,
};

export class Polygon3D extends Vector3D {
  /**
   * @param {number} index
   * @param {Polygon3DCollection} collection
   */
  constructor(collection, index) {
    super(collection, index);

    /** @type {BoundingSphere} */
    this._boundingSphere = new BoundingSphere();
  }

  /////////////////////////////////////////////////////////////////////////////
  // LIFECYCLE

  /**
   * @param {Polygon3D} result
   * @override
   */
  static fromDefaults(result) {
    return super.fromDefaults(result);
  }
}

/**
 * @extends Vector3DCollection<Polygon3D>
 */
export class Polygon3DCollection extends Vector3DCollection {
  _getPrimitiveType() {
    return Polygon3D;
  }

  _getBatchLayout() {
    return Polygon3DLayout;
  }
}
