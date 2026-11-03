// ═══ 【导读】CustomDataSource.js —— 最简单的 DataSource 实现：手写 Entity 的容器 ═══
// 【导读】DataSource 接口 =「一组 Entity（entities）+ 自己的时钟（clock）+ 4 个事件」。
// 【导读】CzmlDataSource/GeoJsonDataSource 等都是「加载时批量造 Entity 的 DataSource」，
// 【导读】而 CustomDataSource 是空壳：数据全靠运行时手写 entities.add(...)。
// 【导读】Viewer 内部的 viewer.entities 就是一个不进 dataSources 列表的 CustomDataSource
// 【导读】（见 DataSourceDisplay.js 构造里的 defaultDataSource）。详见 study/03-Entity数据体系.md §3。
import defined from "../Core/defined.js";
import DeveloperError from "../Core/DeveloperError.js";
import Event from "../Core/Event.js";
import DataSource from "./DataSource.js";
import EntityCluster from "./EntityCluster.js";
import EntityCollection from "./EntityCollection.js";

/**
 * A {@link DataSource} implementation which can be used to manually manage a group of entities.
 *
 * @alias CustomDataSource
 * @constructor
 *
 * @param {string} [name] A human-readable name for this instance.
 *
 * @example
 * const dataSource = new Cesium.CustomDataSource('myData');
 *
 * const entity = dataSource.entities.add({
 *    position : Cesium.Cartesian3.fromDegrees(1, 2, 0),
 *    billboard : {
 *        image : 'image.png'
 *    }
 * });
 *
 * viewer.dataSources.add(dataSource);
 */
  // 【导读】持有自己的 EntityCollection（Entity 集合与增删改事件都在那里）与 EntityCluster（点聚合）。
function CustomDataSource(name) {
  this._name = name;
  this._clock = undefined;
  this._changed = new Event();
  this._error = new Event();
  this._isLoading = false;
  this._loading = new Event();
  this._entityCollection = new EntityCollection(this);
  this._entityCluster = new EntityCluster();
}

Object.defineProperties(CustomDataSource.prototype, {
  /**
   * Gets or sets a human-readable name for this instance.
   * @memberof CustomDataSource.prototype
   * @type {string}
   */
  name: {
    get: function () {
      return this._name;
    },
    set: function (value) {
      if (this._name !== value) {
        this._name = value;
        this._changed.raiseEvent(this);
      }
    },
  },
  /**
   * Gets or sets the clock for this instance.
   * @memberof CustomDataSource.prototype
   * @type {DataSourceClock}
   */
  clock: {
    get: function () {
      return this._clock;
    },
    set: function (value) {
      if (this._clock !== value) {
        this._clock = value;
        this._changed.raiseEvent(this);
      }
    },
  },
  /**
   * Gets the collection of {@link Entity} instances.
   * @memberof CustomDataSource.prototype
   * @type {EntityCollection}
   */
  entities: {
    get: function () {
      return this._entityCollection;
    },
  },
  /**
   * Gets or sets whether the data source is currently loading data.
   * @memberof CustomDataSource.prototype
   * @type {boolean}
   */
  isLoading: {
    get: function () {
      return this._isLoading;
    },
    set: function (value) {
      DataSource.setLoading(this, value);
    },
  },
  /**
   * Gets an event that will be raised when the underlying data changes.
   * @memberof CustomDataSource.prototype
   * @type {Event}
   */
  changedEvent: {
    get: function () {
      return this._changed;
    },
  },
  /**
   * Gets an event that will be raised if an error is encountered during processing.
   * @memberof CustomDataSource.prototype
   * @type {Event}
   */
  errorEvent: {
    get: function () {
      return this._error;
    },
  },
  /**
   * Gets an event that will be raised when the data source either starts or stops loading.
   * @memberof CustomDataSource.prototype
   * @type {Event}
   */
  loadingEvent: {
    get: function () {
      return this._loading;
    },
  },
  /**
   * Gets whether or not this data source should be displayed.
   * @memberof CustomDataSource.prototype
   * @type {boolean}
   */
  show: {
    get: function () {
      return this._entityCollection.show;
    },
    set: function (value) {
      this._entityCollection.show = value;
    },
  },

  /**
   * Gets or sets the clustering options for this data source. This object can be shared between multiple data sources.
   *
   * @memberof CustomDataSource.prototype
   * @type {EntityCluster}
   */
  clustering: {
    get: function () {
      return this._entityCluster;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      if (!defined(value)) {
        throw new DeveloperError("value must be defined.");
      }
      //>>includeEnd('debug');
      this._entityCluster = value;
    },
  },
});

/**
 * Updates the data source to the provided time.  This function is optional and
 * is not required to be implemented.  It is provided for data sources which
 * retrieve data based on the current animation time or scene state.
 * If implemented, update will be called by {@link DataSourceDisplay} once a frame.
 *
 * @param {JulianDate} time The simulation time.
 * @returns {boolean} True if this data source is ready to be displayed at the provided time, false otherwise.
 */
  // 【导读】update 由 DataSourceDisplay.update 每帧调用（见 DataSourceDisplay.js 的 update）；
  // 【导读】返回值=false 表示「还没准备好」，会暂停时钟动画。CustomDataSource 无异步数据，永远 true。
CustomDataSource.prototype.update = function (time) {
  return true;
};

export default CustomDataSource;
