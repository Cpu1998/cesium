// ═══ 【导读】createPropertyDescriptor.js —— Property 属性描述符工厂（Entity/Graphics 的赋值魔法）═══
// 【导读】Entity 与各 *Graphics 的每个属性都用这里生成的 getter/setter：统一实现
// 【导读】「赋任意值→自动包装」「赋 Property→原样保留」「子属性变化→冒泡 definitionChanged」。
// 【导读】详见 study/03-Entity数据体系.md §2。
import defined from "../Core/defined.js";
import ConstantProperty from "./ConstantProperty.js";

// 【导读】真正的 descriptor 实现。两个私有字段：`_name` 存值、`_nameSubscription` 存订阅句柄。
function createProperty(
  name,
  privateName,
  subscriptionName,
  configurable,
  createPropertyCallback,
) {
  return {
    configurable: configurable,
    get: function () {
      return this[privateName];
    },
    set: function (value) {
      // 【导读】四步赋值流程：①退订旧 Property 的 definitionChanged 订阅；
      const oldValue = this[privateName];
      const subscription = this[subscriptionName];
      if (defined(subscription)) {
        subscription();
        this[subscriptionName] = undefined;
      }

      const hasValue = value !== undefined;
      // 【导读】②值不是 Property（没有 getValue 方法）时用 createPropertyCallback 包装成 ConstantProperty，
      // 【导读】（Entity.js 传 position 专用回调包成 ConstantPositionProperty；Graphics 层传 undefined 用默认）；
      if (
        hasValue &&
        (!defined(value) || !defined(value.getValue)) &&
        defined(createPropertyCallback)
      ) {
        value = createPropertyCallback(value);
      }

      if (oldValue !== value) {
        // 【导读】③值变化则写入私有字段并向上广播 definitionChanged(entity, name, 新值, 旧值)，
        // 【导读】这是 Visualizer/拾取/InfoBox 等一切「响应 Entity 变化」的源头；
        this[privateName] = value;
        this._definitionChanged.raiseEvent(this, name, value, oldValue);
      }

      if (defined(value) && defined(value.definitionChanged)) {
        // 【导读】④订阅新 Property 自身的 definitionChanged：子属性变化时以 (newValue, newValue) 再广播一次，
        // 【导读】让监听者无需区分「属性被替换」还是「属性内部变了」——冒泡机制。
        this[subscriptionName] = value.definitionChanged.addEventListener(
          function () {
            this._definitionChanged.raiseEvent(this, name, value, value);
          },
          this,
        );
      }
    },
  };
}

function createConstantProperty(value) {
  return new ConstantProperty(value);
}

/**
 * Used to consistently define all DataSources graphics objects.
 * This is broken into two functions because the Chrome profiler does a better
 * job of optimizing lookups if it notices that the string is constant throughout the function.
 * @private
 */
function createPropertyDescriptor(name, configurable, createPropertyCallback) {
  //Safari 8.0.3 has a JavaScript bug that causes it to confuse two variables and treat them as the same.
  //The two extra toString calls work around the issue.
  return createProperty(
    name,
    `_${name.toString()}`,
    `_${name.toString()}Subscription`,
    configurable ?? false,
    createPropertyCallback ?? createConstantProperty,
  );
}
export default createPropertyDescriptor;
