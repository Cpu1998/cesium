// @ts-check

import DeveloperError from "./DeveloperError.js";

/**
 * @function
 *
 * @param {*} condition
 * @param {string} msg
 * @returns {asserts condition}
 *
 * @example
 * if (Cesium.defined(positions)) {
 *      doSomething();
 * } else {
 *      doSomethingElse();
 * }
 */
function assert(condition, msg) {
  if (!condition) {
    throw new DeveloperError(msg);
  }
}

export default assert;
