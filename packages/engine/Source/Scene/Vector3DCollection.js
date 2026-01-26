// @ts-check

import BoundingSphere from "../Core/BoundingSphere.js";
import Color from "../Core/Color.js";
import DeveloperError from "../Core/DeveloperError.js";
import Frozen from "../Core/Frozen.js";
import Matrix4 from "../Core/Matrix4.js";
import Vector3D from "./Vector3D.js";

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
    throw new DeveloperError(Vector3D.ERR_INSTANTIATION);
  }

  /**
   * @protected
   * @return {unknown}
   */
  _getBatchLayout() {
    throw new DeveloperError(Vector3D.ERR_INSTANTIATION);
  }

  /////////////////////////////////////////////////////////////////////////////
  // COLLECTION LIFECYCLE

  /** @private */
  _allocateBatchBuffer() {
    const batchLayout = /** @type {typeof Vector3D.Layout} */ (
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
    throw new DeveloperError(Vector3D.ERR_NOT_IMPLEMENTED);
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
    result._setUint32(Vector3D.Layout.BATCH_ID_U32, this._nextBatchId++);
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
    throw new DeveloperError(Vector3D.ERR_NOT_IMPLEMENTED);
  }

  removeAll() {
    throw new DeveloperError(Vector3D.ERR_NOT_IMPLEMENTED);
  }

  /**
   * @param {Function} sortFn
   */
  sort(sortFn) {
    throw new DeveloperError(Vector3D.ERR_NOT_IMPLEMENTED);
  }

  /////////////////////////////////////////////////////////////////////////////
  // RENDER

  /** @param {object} frameState */
  update(frameState) {
    throw new DeveloperError(Vector3D.ERR_NOT_IMPLEMENTED);
  }

  /////////////////////////////////////////////////////////////////////////////
  // ACCESSORS

  /** @type {number} */
  get length() {
    return this._batchCount;
  }
}

export default Vector3DCollection;
