// @ts-check

import Color from "../Core/Color.js";

/** @import Vector3DCollection from './Vector3DCollection.js'; */

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

  static Layout = {
    BATCH_ID_U32: 0,
    SHOW_U8: 4,
    DESTROYED_U8: 5,
    DIRTY_U8: 6,
    COLOR_U32: 8,

    __BYTE_LENGTH: 12,
  };

  static ERR_NOT_IMPLEMENTED = "Not implemented.";
  static ERR_INSTANTIATION =
    "This function defines an interface and should not be called directly.";
  static ERR_RESIZE =
    "Collection buffer size is immutable after initialization.";
  static ERR_CAPACITY = "Collection buffer capacity exceeded.";

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
    result._byteOffset = index * Vector3D.Layout.__BYTE_LENGTH;
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
    return this._getUint32(Vector3D.Layout.BATCH_ID_U32);
  }

  /** @type {boolean} */
  get show() {
    return this._getUint8(Vector3D.Layout.SHOW_U8) === 1;
  }

  set show(show) {
    this._setUint8(Vector3D.Layout.SHOW_U8, show ? 1 : 0);
  }

  /** @type {boolean} */
  get _dirty() {
    return this._getUint8(Vector3D.Layout.DIRTY_U8) === 1;
  }

  set _dirty(dirty) {
    this._setUint8(Vector3D.Layout.DIRTY_U8, dirty ? 1 : 0);
  }

  /** @type {boolean} */
  get _destroyed() {
    return this._getUint8(Vector3D.Layout.DESTROYED_U8) === 1;
  }

  set _destroyed(destroyed) {
    this._setUint8(Vector3D.Layout.DESTROYED_U8, destroyed ? 1 : 0);
  }

  // TODO(donmccurdy): Consider `point.getColor(color)` API instead.
  /** @type {Color} */
  get color() {
    return Color.fromRgba(
      this._getUint32(Vector3D.Layout.COLOR_U32),
      this._color,
    );
  }

  set color(color) {
    this._setUint32(Vector3D.Layout.COLOR_U32, color.toRgba());
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

export default Vector3D;
