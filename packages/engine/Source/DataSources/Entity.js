// ═══ 【导读】Entity.js —— Entity 数据体系的原子：声明式数据容器 ═══
// 【导读】Entity 是 Cesium 数据层的核心抽象：一个「我想要什么」的声明对象——
// 【导读】position/orientation 描述「在哪/朝向」，billboard/label/point/polygon 等 *Graphics
// 【导读】属性描述「渲染成什么」。它本身不含任何 WebGL 资源；真正把它变成画面的是
// 【导读】DataSourceDisplay 每帧驱动的各 Visualizer（见 DataSourceDisplay.js，本文件不碰渲染）。
// 【导读】关键机制一：Property 包装。本文件顶部 createPropertyTypeDescriptor 等工厂函数给每个
// 【导读】属性生成 getter/setter：赋裸值（如 Cartesian3）自动包成 ConstantProperty，赋 Property 原样保留，
// 【导读】因此「entity.position = new CallbackProperty(...)」与「= fromDegrees(...)」都能工作。
// 【导读】关键机制二：definitionChanged 事件。任何属性/子属性变化都会广播，Visualizer 借此差量更新。
// 【导读】主链路：function Entity 构造（merge 初始 options）→ 属性 setter 包装 → definitionChanged →
// 【导读】→ EntityCollection.collectionChanged → Visualizer（第 3 棒主战场）。
// 【导读】深入解读见 study/03-Entity数据体系.md §1/§2。
import Cartesian3 from "../Core/Cartesian3.js";
import Cartographic from "../Core/Cartographic.js";
import Check from "../Core/Check.js";
import createGuid from "../Core/createGuid.js";
import Frozen from "../Core/Frozen.js";
import defined from "../Core/defined.js";
import DeveloperError from "../Core/DeveloperError.js";
import Event from "../Core/Event.js";
import CesiumMath from "../Core/Math.js";
import Matrix3 from "../Core/Matrix3.js";
import Matrix4 from "../Core/Matrix4.js";
import Quaternion from "../Core/Quaternion.js";
import TrackingReferenceFrame from "../Core/TrackingReferenceFrame.js";
import Transforms from "../Core/Transforms.js";
import GroundPolylinePrimitive from "../Scene/GroundPolylinePrimitive.js";
import GroundPrimitive from "../Scene/GroundPrimitive.js";
import HeightReference, {
  isHeightReferenceClamp,
} from "../Scene/HeightReference.js";
import BillboardGraphics from "./BillboardGraphics.js";
import BoxGraphics from "./BoxGraphics.js";
import ConstantPositionProperty from "./ConstantPositionProperty.js";
import CorridorGraphics from "./CorridorGraphics.js";
import createPropertyDescriptor from "./createPropertyDescriptor.js";
import createRawPropertyDescriptor from "./createRawPropertyDescriptor.js";
import CylinderGraphics from "./CylinderGraphics.js";
import EllipseGraphics from "./EllipseGraphics.js";
import EllipsoidGraphics from "./EllipsoidGraphics.js";
import LabelGraphics from "./LabelGraphics.js";
import ModelGraphics from "./ModelGraphics.js";
import Cesium3DTilesetGraphics from "./Cesium3DTilesetGraphics.js";
import PathGraphics from "./PathGraphics.js";
import PlaneGraphics from "./PlaneGraphics.js";
import PointGraphics from "./PointGraphics.js";
import PolygonGraphics from "./PolygonGraphics.js";
import PolylineGraphics from "./PolylineGraphics.js";
import PolylineVolumeGraphics from "./PolylineVolumeGraphics.js";
import Property from "./Property.js";
import PropertyBag from "./PropertyBag.js";
import RectangleGraphics from "./RectangleGraphics.js";
import WallGraphics from "./WallGraphics.js";

const cartoScratch = new Cartographic();

const ExtraPropertyNames = [];

// 【导读】Property 包装机制（一）：把裸值包装成 ConstantPositionProperty 的回调。
// 【导读】这就是为什么 entity.position = Cesium.Cartesian3.fromDegrees(...) 能直接生效。
function createConstantPositionProperty(value) {
  return new ConstantPositionProperty(value);
}

// 【导读】Property 包装机制（二）：position 专用 descriptor——setter 里遇到非 Property 值时
// 【导读】调上面的回调自动包一层；descriptor 的完整实现在 createPropertyDescriptor.js（已注）。
function createPositionPropertyDescriptor(name) {
  return createPropertyDescriptor(
    name,
    undefined,
    createConstantPositionProperty,
  );
}

// 【导读】Property 包装机制（三）：*Graphics 属性专用——赋裸对象（如 {image:'x.png'}）时
// 【导读】自动 new 对应 Graphics 类；赋 Graphics 实例原样保留。所有 visual 属性共用这一个工厂。
function createPropertyTypeDescriptor(name, Type) {
  return createPropertyDescriptor(name, undefined, function (value) {
    if (value instanceof Type) {
      return value;
    }
    return new Type(value);
  });
}

/**
 * @typedef {object} Entity.ConstructorOptions
 *
 * Initialization options for the Entity constructor
 *
 * @property {string} [id] A unique identifier for this object. If none is provided, a GUID is generated.
 * @property {string} [name] A human readable name to display to users. It does not have to be unique.
 * @property {TimeIntervalCollection} [availability] The availability, if any, associated with this object.
 * @property {boolean} [show] A boolean value indicating if the entity and its children are displayed.
 * @property {TrackingReferenceFrame} [trackingReferenceFrame=TrackingReferenceFrame.AUTODETECT] The reference frame used when this entity is being tracked. <br/> If <code>undefined</code>, reference frame is determined based on entity velocity: near-surface slow moving entities are tracked using the local east-north-up reference frame, whereas fast moving entities such as satellites are tracked using VVLH (Vehicle Velocity, Local Horizontal).
 * @property {Property | string} [description] A string Property specifying an HTML description for this entity.
 * @property {PositionProperty | Cartesian3 | CallbackPositionProperty} [position] A Property specifying the entity position.
 * @property {Property | Quaternion} [orientation=Transforms.eastNorthUpToFixedFrame(position)] A Property specifying the entity orientation in respect to Earth-fixed-Earth-centered (ECEF). If undefined, east-north-up at entity position is used.
 * @property {Property | Cartesian3} [viewFrom] A suggested initial offset for viewing this object.
 * @property {Entity} [parent] A parent entity to associate with this entity.
 * @property {BillboardGraphics | BillboardGraphics.ConstructorOptions} [billboard] A billboard to associate with this entity.
 * @property {BoxGraphics | BoxGraphics.ConstructorOptions} [box] A box to associate with this entity.
 * @property {CorridorGraphics | CorridorGraphics.ConstructorOptions} [corridor] A corridor to associate with this entity.
 * @property {CylinderGraphics | CylinderGraphics.ConstructorOptions} [cylinder] A cylinder to associate with this entity.
 * @property {EllipseGraphics | EllipseGraphics.ConstructorOptions} [ellipse] A ellipse to associate with this entity.
 * @property {EllipsoidGraphics | EllipsoidGraphics.ConstructorOptions} [ellipsoid] A ellipsoid to associate with this entity.
 * @property {LabelGraphics | LabelGraphics.ConstructorOptions} [label] A options.label to associate with this entity.
 * @property {ModelGraphics | ModelGraphics.ConstructorOptions} [model] A model to associate with this entity.
 * @property {Cesium3DTilesetGraphics | Cesium3DTilesetGraphics.ConstructorOptions} [tileset] A 3D Tiles tileset to associate with this entity.
 * @property {PathGraphics | PathGraphics.ConstructorOptions} [path] A path to associate with this entity.
 * @property {PlaneGraphics | PlaneGraphics.ConstructorOptions} [plane] A plane to associate with this entity.
 * @property {PointGraphics | PointGraphics.ConstructorOptions} [point] A point to associate with this entity.
 * @property {PolygonGraphics | PolygonGraphics.ConstructorOptions} [polygon] A polygon to associate with this entity.
 * @property {PolylineGraphics | PolylineGraphics.ConstructorOptions} [polyline] A polyline to associate with this entity.
 * @property {PropertyBag | Object<string,*>} [properties] Arbitrary properties to associate with this entity.
 * @property {PolylineVolumeGraphics | PolylineVolumeGraphics.ConstructorOptions} [polylineVolume] A polylineVolume to associate with this entity.
 * @property {RectangleGraphics | RectangleGraphics.ConstructorOptions} [rectangle] A rectangle to associate with this entity.
 * @property {WallGraphics | WallGraphics.ConstructorOptions} [wall] A wall to associate with this entity.
 */

/**
 * Entity instances aggregate multiple forms of visualization into a single high-level object.
 * They can be created manually and added to {@link Viewer#entities} or be produced by
 * data sources, such as {@link CzmlDataSource} and {@link GeoJsonDataSource}.
 * @alias Entity
 * @constructor
 *
 * @param {Entity.ConstructorOptions} [options] Object describing initialization options
 *
 * @see {@link https://cesium.com/learn/cesiumjs-learn/cesiumjs-creating-entities/|Creating Entities}
 */
// 【导读】Entity 构造：几乎全部字段交给下面的 merge() 统一赋值（merge 同时服务于
// 【导读】「构造时 options」与「运行时 entity.merge(other)」两条路径）。id 缺省自动生成 GUID。
// 【导读】注意构造过程零渲染开销——Entity 可以先大量创建、择机加入集合。
function Entity(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  let id = options.id;
  if (!defined(id)) {
    id = createGuid();
  }

  this._availability = undefined;
  this._id = id;
  this._definitionChanged = new Event();
  this._name = options.name;
  this._show = options.show ?? true;
  this._trackingReferenceFrame =
    options.trackingReferenceFrame ?? TrackingReferenceFrame.AUTODETECT;
  this._parent = undefined;
  // 【导读】_propertyNames 是「本 Entity 拥有哪些属性」的白名单：序列化/拷贝/遍历都按它来，
  // 【导读】后续 addProperty 注册的自定义属性也会追加进来（见 Entity.prototype.addProperty）。
  this._propertyNames = [
    "billboard",
    "box",
    "corridor",
    "cylinder",
    "description",
    "ellipse",
    "ellipsoid",
    "label",
    "model",
    "tileset",
    "orientation",
    "path",
    "plane",
    "point",
    "polygon",
    "polyline",
    "polylineVolume",
    "position",
    "properties",
    "rectangle",
    "viewFrom",
    "wall",
    ...ExtraPropertyNames,
  ];

  // 【导读】每个属性两个字段：_xxx 存值，_xxxSubscription 存「子 Property 的 definitionChanged
  // 【导读】订阅句柄」（属性整体替换时退订旧的、订阅新的，见 createPropertyDescriptor.js 的 setter）。
  this._billboard = undefined;
  this._billboardSubscription = undefined;
  this._box = undefined;
  this._boxSubscription = undefined;
  this._corridor = undefined;
  this._corridorSubscription = undefined;
  this._cylinder = undefined;
  this._cylinderSubscription = undefined;
  this._description = undefined;
  this._descriptionSubscription = undefined;
  this._ellipse = undefined;
  this._ellipseSubscription = undefined;
  this._ellipsoid = undefined;
  this._ellipsoidSubscription = undefined;
  this._label = undefined;
  this._labelSubscription = undefined;
  this._model = undefined;
  this._modelSubscription = undefined;
  this._tileset = undefined;
  this._tilesetSubscription = undefined;
  this._orientation = undefined;
  this._orientationSubscription = undefined;
  this._path = undefined;
  this._pathSubscription = undefined;
  this._plane = undefined;
  this._planeSubscription = undefined;
  this._point = undefined;
  this._pointSubscription = undefined;
  this._polygon = undefined;
  this._polygonSubscription = undefined;
  this._polyline = undefined;
  this._polylineSubscription = undefined;
  this._polylineVolume = undefined;
  this._polylineVolumeSubscription = undefined;
  this._position = undefined;
  this._positionSubscription = undefined;
  this._properties = undefined;
  this._propertiesSubscription = undefined;
  this._rectangle = undefined;
  this._rectangleSubscription = undefined;
  this._viewFrom = undefined;
  this._viewFromSubscription = undefined;
  this._wall = undefined;
  this._wallSubscription = undefined;
  this._children = [];

  /**
   * Gets or sets the entity collection that this entity belongs to.
   * @type {EntityCollection}
   */
  this.entityCollection = undefined;

  // 【导读】merge(options) 在构造尾部统一赋初值；parent setter 里会顺带把自己挂进父 Entity 的 _children。
  this.parent = options.parent;
  this.merge(options);
}

// 【导读】show/parent 变化时向子 Entity 递归传播 isShowing 状态，
// 【导读】并逐层触发 definitionChanged("isShowing")——Visualizer 靠它及时显示/隐藏子孙实体。
function updateShow(entity, children, isShowing) {
  const length = children.length;
  for (let i = 0; i < length; i++) {
    const child = children[i];
    const childShow = child._show;
    const oldValue = !isShowing && childShow;
    const newValue = isShowing && childShow;
    if (oldValue !== newValue) {
      updateShow(child, child._children, isShowing);
    }
  }
  entity._definitionChanged.raiseEvent(
    entity,
    "isShowing",
    isShowing,
    !isShowing,
  );
}

Object.defineProperties(Entity.prototype, {
  /**
   * The availability, if any, associated with this object.
   * If availability is undefined, it is assumed that this object's
   * other properties will return valid data for any provided time.
   * If availability exists, the objects other properties will only
   * provide valid data if queried within the given interval.
   * @memberof Entity.prototype
   * @type {TimeIntervalCollection|undefined}
   */
  availability: createRawPropertyDescriptor("availability"),
  /**
   * Gets the unique ID associated with this object.
   * @memberof Entity.prototype
   * @type {string}
   */
  // 【导读】id 只读：Entity 的身份标识，EntityCollection/拾取/GeometryUpdaterSet 都以它做 key。
  id: {
    get: function () {
      return this._id;
    },
  },
  /**
   * Gets the event that is raised whenever a property or sub-property is changed or modified.
   * @memberof Entity.prototype
   *
   * @type {Event}
   * @readonly
   */
  definitionChanged: {
    get: function () {
      return this._definitionChanged;
    },
  },
  /**
   * Gets or sets the name of the object.  The name is intended for end-user
   * consumption and does not need to be unique.
   * @memberof Entity.prototype
   * @type {string|undefined}
   */
  name: createRawPropertyDescriptor("name"),
  /**
   * Gets or sets whether this entity should be displayed. When set to true,
   * the entity is only displayed if the parent entity's show property is also true.
   * @memberof Entity.prototype
   * @type {boolean}
   */
  // 【导读】show setter：值变化时先算 isShowing（综合本实体+集合+父链），变化才递归 updateShow
  // 【导读】并 raiseEvent("show")。注意 setter 只改数据，不碰渲染——显示生效靠 Visualizer 每帧读 isShowing。
  show: {
    get: function () {
      return this._show;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      if (!defined(value)) {
        throw new DeveloperError("value is required.");
      }
      //>>includeEnd('debug');

      if (value === this._show) {
        return;
      }

      const wasShowing = this.isShowing;
      this._show = value;
      const isShowing = this.isShowing;

      if (wasShowing !== isShowing) {
        updateShow(this, this._children, isShowing);
      }

      this._definitionChanged.raiseEvent(this, "show", value, !value);
    },
  },
  /**
   * Gets or sets the entity's tracking reference frame.
   * @demo {@link https://sandcastle.cesium.com/index.html?id=entity-tracking|Cesium Sandcastle Entity tracking Demo}
   *
   * @memberof Entity.prototype
   * @type {TrackingReferenceFrame}
   */
  trackingReferenceFrame: createRawPropertyDescriptor("trackingReferenceFrame"),
  /**
   * Gets whether this entity is being displayed, taking into account
   * the visibility of any ancestor entities.
   * @memberof Entity.prototype
   * @type {boolean}
   */
  // 【导读】isShowing（只读合成）：本实体 show && 所属集合 show && 父链 isShowing 三者合取。
  // 【导读】它才是 Visualizer 真正消费的「是否可见」；show 只是本实体自己的一票。
  isShowing: {
    get: function () {
      return (
        this._show &&
        (!defined(this.entityCollection) || this.entityCollection.show) &&
        (!defined(this._parent) || this._parent.isShowing)
      );
    },
  },
  /**
   * Gets or sets the parent object.
   * @memberof Entity.prototype
   * @type {Entity|undefined}
   */
  // 【导读】parent setter：维护双向链（父的 _children / 子的 _parent），换父时同步传播 isShowing。
  // 【导读】父子关系只影响可见性与「zoomTo 取子树包围球」，不影响坐标。
  parent: {
    get: function () {
      return this._parent;
    },
    set: function (value) {
      const oldValue = this._parent;

      if (oldValue === value) {
        return;
      }

      const wasShowing = this.isShowing;
      if (defined(oldValue)) {
        const index = oldValue._children.indexOf(this);
        oldValue._children.splice(index, 1);
      }

      this._parent = value;
      if (defined(value)) {
        value._children.push(this);
      }

      const isShowing = this.isShowing;

      if (wasShowing !== isShowing) {
        updateShow(this, this._children, isShowing);
      }

      this._definitionChanged.raiseEvent(this, "parent", value, oldValue);
    },
  },
  /**
   * Gets the names of all properties registered on this instance.
   * @memberof Entity.prototype
   * @type {string[]}
   */
  propertyNames: {
    get: function () {
      return this._propertyNames;
    },
  },
  /**
   * Gets or sets the billboard.
   * @memberof Entity.prototype
   * @type {BillboardGraphics|undefined}
   */
  // 【导读】billboard/box/polygon/… 等 visual 属性全部由 createPropertyTypeDescriptor 生成：
  // 【导读】读返回 Graphics 实例（或 undefined）；写接受「Graphics 实例或裸 options 对象」（自动 new）。
  // 【导读】同类：label→LabelGraphics、point→PointGraphics、polyline→PolylineGraphics……
  // 【导读】（Graphics 内部字段又各自用 createPropertyDescriptor 包装成 Property，两层包装见文档 §2）。
  billboard: createPropertyTypeDescriptor("billboard", BillboardGraphics),
  /**
   * Gets or sets the box.
   * @memberof Entity.prototype
   * @type {BoxGraphics|undefined}
   */
  box: createPropertyTypeDescriptor("box", BoxGraphics),
  /**
   * Gets or sets the corridor.
   * @memberof Entity.prototype
   * @type {CorridorGraphics|undefined}
   */
  corridor: createPropertyTypeDescriptor("corridor", CorridorGraphics),
  /**
   * Gets or sets the cylinder.
   * @memberof Entity.prototype
   * @type {CylinderGraphics|undefined}
   */
  cylinder: createPropertyTypeDescriptor("cylinder", CylinderGraphics),
  /**
   * Gets or sets the description.
   * @memberof Entity.prototype
   * @type {Property|undefined}
   */
  // 【导读】description：InfoBox 展示的 HTML 描述，也是普通 Property（可随时变、可随时间变）。
  description: createPropertyDescriptor("description"),
  /**
   * Gets or sets the ellipse.
   * @memberof Entity.prototype
   * @type {EllipseGraphics|undefined}
   */
  ellipse: createPropertyTypeDescriptor("ellipse", EllipseGraphics),
  /**
   * Gets or sets the ellipsoid.
   * @memberof Entity.prototype
   * @type {EllipsoidGraphics|undefined}
   */
  ellipsoid: createPropertyTypeDescriptor("ellipsoid", EllipsoidGraphics),
  /**
   * Gets or sets the label.
   * @memberof Entity.prototype
   * @type {LabelGraphics|undefined}
   */
  label: createPropertyTypeDescriptor("label", LabelGraphics),
  /**
   * Gets or sets the model.
   * @memberof Entity.prototype
   * @type {ModelGraphics|undefined}
   */
  model: createPropertyTypeDescriptor("model", ModelGraphics),
  /**
   * Gets or sets the tileset.
   * @memberof Entity.prototype
   * @type {Cesium3DTilesetGraphics|undefined}
   */
  tileset: createPropertyTypeDescriptor("tileset", Cesium3DTilesetGraphics),
  /**
   * Gets or sets the orientation in respect to Earth-fixed-Earth-centered (ECEF).
   * Defaults to east-north-up at entity position.
   * @memberof Entity.prototype
   * @type {Property|undefined}
   */
  orientation: createPropertyDescriptor("orientation"),
  /**
   * Gets or sets the path.
   * @memberof Entity.prototype
   * @type {PathGraphics|undefined}
   */
  path: createPropertyTypeDescriptor("path", PathGraphics),
  /**
   * Gets or sets the plane.
   * @memberof Entity.prototype
   * @type {PlaneGraphics|undefined}
   */
  plane: createPropertyTypeDescriptor("plane", PlaneGraphics),
  /**
   * Gets or sets the point graphic.
   * @memberof Entity.prototype
   * @type {PointGraphics|undefined}
   */
  point: createPropertyTypeDescriptor("point", PointGraphics),
  /**
   * Gets or sets the polygon.
   * @memberof Entity.prototype
   * @type {PolygonGraphics|undefined}
   */
  polygon: createPropertyTypeDescriptor("polygon", PolygonGraphics),
  /**
   * Gets or sets the polyline.
   * @memberof Entity.prototype
   * @type {PolylineGraphics|undefined}
   */
  polyline: createPropertyTypeDescriptor("polyline", PolylineGraphics),
  /**
   * Gets or sets the polyline volume.
   * @memberof Entity.prototype
   * @type {PolylineVolumeGraphics|undefined}
   */
  polylineVolume: createPropertyTypeDescriptor(
    "polylineVolume",
    PolylineVolumeGraphics,
  ),
  /**
   * Gets or sets the bag of arbitrary properties associated with this entity.
   * @memberof Entity.prototype
   * @type {PropertyBag|undefined}
   */
  properties: createPropertyTypeDescriptor("properties", PropertyBag),
  /**
   * Gets or sets the position.
   * @memberof Entity.prototype
   * @type {PositionProperty|undefined}
   */
  // 【导读】position：专用 descriptor——非 Property 裸值自动包成 ConstantPositionProperty（区别于普通 ConstantProperty，
  // 【导读】PositionProperty 额外支持参考条在 referenceFrame 语义）。详见 createPropertyDescriptor.js 注释。
  position: createPositionPropertyDescriptor("position"),
  /**
   * Gets or sets the rectangle.
   * @memberof Entity.prototype
   * @type {RectangleGraphics|undefined}
   */
  rectangle: createPropertyTypeDescriptor("rectangle", RectangleGraphics),
  /**
   * Gets or sets the suggested initial offset when tracking this object.
   * The offset is typically defined in the east-north-up reference frame,
   * but may be another frame depending on the object's velocity.
   * @memberof Entity.prototype
   * @type {Property|undefined}
   */
  viewFrom: createPropertyDescriptor("viewFrom"),
  /**
   * Gets or sets the wall.
   * @memberof Entity.prototype
   * @type {WallGraphics|undefined}
   */
  wall: createPropertyTypeDescriptor("wall", WallGraphics),
});

/**
 * Add the specified type and construct the properties for it in the Entity class
 * @private
 * @param {string} propertyName name of the property that controls/accesses this entity type
 * @param {{ constructor: function }} Type The Graphics class to associate with this entity type
 */
  // 【导读】运行时扩展：第三方包可注册新的 Entity 属性（如 cesium-vr 的自定义 visual），
  // 【导读】追加进全局 ExtraPropertyNames，对所有后续 new Entity 生效。
Entity.registerEntityType = function (propertyName, Type) {
  Object.defineProperties(Entity.prototype, {
    [propertyName]: createPropertyTypeDescriptor(propertyName, Type),
  });
  if (!ExtraPropertyNames.includes(propertyName)) {
    ExtraPropertyNames.push(propertyName);
  }
};

/**
 * Given a time, returns true if this object should have data during that time.
 *
 * @param {JulianDate} time The time to check availability for.
 * @returns {boolean} true if the object should have data during the provided time, false otherwise.
 */
Entity.prototype.isAvailable = function (time) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(time)) {
    throw new DeveloperError("time is required.");
  }
  //>>includeEnd('debug');

  const availability = this._availability;
  // 【导读】无 availability 视为任意时刻都有数据；有则按时间区间判断（CZML 常用它表达「目标何时可见」）。
  return !defined(availability) || availability.contains(time);
};

/**
 * Adds a property to this object.  Once a property is added, it can be
 * observed with {@link Entity#definitionChanged} and composited
 * with {@link CompositeEntityCollection}
 *
 * @param {string} propertyName The name of the property to add.
 *
 * @exception {DeveloperError} "propertyName" is a reserved property name.
 * @exception {DeveloperError} "propertyName" is already a registered property.
 */
  // 【导读】addProperty/removeProperty：动态注册自定义属性（ CZML 加载未知字段时会自动走到这里），
  // 【导读】注册后同样受 definitionChanged 观察、被 merge 合并。外部插件体系的基石。
Entity.prototype.addProperty = function (propertyName) {
  const propertyNames = this._propertyNames;

  //>>includeStart('debug', pragmas.debug);
  if (!defined(propertyName)) {
    throw new DeveloperError("propertyName is required.");
  }
  if (propertyNames.indexOf(propertyName) !== -1) {
    throw new DeveloperError(
      `${propertyName} is already a registered property.`,
    );
  }
  if (propertyName in this) {
    throw new DeveloperError(`${propertyName} is a reserved property name.`);
  }
  //>>includeEnd('debug');

  propertyNames.push(propertyName);
  Object.defineProperty(
    this,
    propertyName,
    createRawPropertyDescriptor(propertyName, true),
  );
};

/**
 * Removed a property previously added with addProperty.
 *
 * @param {string} propertyName The name of the property to remove.
 *
 * @exception {DeveloperError} "propertyName" is a reserved property name.
 * @exception {DeveloperError} "propertyName" is not a registered property.
 */
Entity.prototype.removeProperty = function (propertyName) {
  const propertyNames = this._propertyNames;
  const index = propertyNames.indexOf(propertyName);

  //>>includeStart('debug', pragmas.debug);
  if (!defined(propertyName)) {
    throw new DeveloperError("propertyName is required.");
  }
  if (index === -1) {
    throw new DeveloperError(`${propertyName} is not a registered property.`);
  }
  //>>includeEnd('debug');

  this._propertyNames.splice(index, 1);
  delete this[propertyName];
};

/**
 * Assigns each unassigned property on this object to the value
 * of the same property on the provided source object.
 *
 * @param {Entity} source The object to be merged into this object.
 */
  // 【导读】merge：把 source 上「本实体尚未赋值」的属性补齐；已赋值的字段递归 merge（Graphics 级），
  // 【导读】同名不覆盖。构造函数用它处理 options（EntityCollection.add 传裸对象也等价于这条路径），
  // 【导读】DataSource 加载/Entity 合并语义相同。1.145 无独立 Entity.fromObject，「对象→Entity」
  // 【导读】统一由 EntityCollection.add 内部 new Entity(entity) 完成（见 EntityCollection.js 的 add）。
Entity.prototype.merge = function (source) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(source)) {
    throw new DeveloperError("source is required.");
  }
  //>>includeEnd('debug');

  //Name, show, and availability are not Property objects and are currently handled differently.
  //source.show is intentionally ignored because this.show always has a value.
  this.name = this.name ?? source.name;
  this.availability = this.availability ?? source.availability;

  const propertyNames = this._propertyNames;
  const sourcePropertyNames = defined(source._propertyNames)
    ? source._propertyNames
    : Object.keys(source);
  const propertyNamesLength = sourcePropertyNames.length;
  for (let i = 0; i < propertyNamesLength; i++) {
    const name = sourcePropertyNames[i];

    //While source is required by the API to be an Entity, we internally call this method from the
    //constructor with an options object to configure initial custom properties.
    //So we need to ignore reserved-non-property.
    if (
      name === "parent" ||
      name === "name" ||
      name === "availability" ||
      name === "children"
    ) {
      continue;
    }

    const targetProperty = this[name];
    const sourceProperty = source[name];

    //Custom properties that are registered on the source entity must also
    //get registered on this entity.
    if (!defined(targetProperty) && propertyNames.indexOf(name) === -1) {
      this.addProperty(name);
    }

    if (defined(sourceProperty)) {
      if (defined(targetProperty)) {
        if (defined(targetProperty.merge)) {
          targetProperty.merge(sourceProperty);
        }
      } else if (
        defined(sourceProperty.merge) &&
        defined(sourceProperty.clone)
      ) {
        this[name] = sourceProperty.clone();
      } else {
        this[name] = sourceProperty;
      }
    }
  }
};

const matrix3Scratch = new Matrix3();
const positionScratch = new Cartesian3();
const orientationScratch = new Quaternion();

/**
 * Computes the model matrix for the entity's transform at specified time. Returns undefined if position is undefined
 *
 * @param {JulianDate} time The time to retrieve model matrix for.
 * @param {Matrix4} [result] The object onto which to store the result.
 *
 * @returns {Matrix4} The modified result parameter or a new Matrix4 instance if one was not provided. Result is undefined if position is undefined.
 */
  // 【导读】computeModelMatrix：position+orientation 在指定时刻求值，合成 ECEF 模型矩阵；
  // 【导读】无 orientation 时默认用「东-北-天」局部系（Transforms.eastNorthUpToFixedFrame）。
  // 【导读】billboard/model 等 Visualizer 与 EntityView（跟踪相机）都以它为定位基准。
Entity.prototype.computeModelMatrix = function (time, result) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("time", time);
  //>>includeEnd('debug');
  const position = Property.getValueOrUndefined(
    this._position,
    time,
    positionScratch,
  );
  if (!defined(position)) {
    return undefined;
  }

  const orientation = Property.getValueOrUndefined(
    this._orientation,
    time,
    orientationScratch,
  );
  if (!defined(orientation)) {
    result = Transforms.eastNorthUpToFixedFrame(position, undefined, result);
  } else {
    result = Matrix4.fromRotationTranslation(
      Matrix3.fromQuaternion(orientation, matrix3Scratch),
      position,
      result,
    );
  }
  return result;
};

/**
 * @private
 */
  // 【导读】heightReference（贴地/相对地形）专用变体：先按参考高度修正在 position 上，
  // 【导读】再合成模型矩阵。box/cylinder 等通过地形偏移渲染时走这里。
Entity.prototype.computeModelMatrixForHeightReference = function (
  time,
  heightReferenceProperty,
  heightOffset,
  ellipsoid,
  result,
) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("time", time);
  //>>includeEnd('debug');
  const heightReference = Property.getValueOrDefault(
    heightReferenceProperty,
    time,
    HeightReference.NONE,
  );
  let position = Property.getValueOrUndefined(
    this._position,
    time,
    positionScratch,
  );
  if (
    heightReference === HeightReference.NONE ||
    !defined(position) ||
    Cartesian3.equalsEpsilon(position, Cartesian3.ZERO, CesiumMath.EPSILON8)
  ) {
    return this.computeModelMatrix(time, result);
  }

  const carto = ellipsoid.cartesianToCartographic(position, cartoScratch);
  if (isHeightReferenceClamp(heightReference)) {
    carto.height = heightOffset;
  } else {
    carto.height += heightOffset;
  }
  position = ellipsoid.cartographicToCartesian(carto, position);

  const orientation = Property.getValueOrUndefined(
    this._orientation,
    time,
    orientationScratch,
  );
  if (!defined(orientation)) {
    result = Transforms.eastNorthUpToFixedFrame(position, undefined, result);
  } else {
    result = Matrix4.fromRotationTranslation(
      Matrix3.fromQuaternion(orientation, matrix3Scratch),
      position,
      result,
    );
  }
  return result;
};

/**
 * Checks if the given Scene supports materials besides Color on Entities draped on terrain or 3D Tiles.
 * If this feature is not supported, Entities with non-color materials but no `height` will
 * instead be rendered as if height is 0.
 *
 * @param {Scene} scene The current scene.
 * @returns {boolean} Whether or not the current scene supports materials for entities on terrain.
 */
Entity.supportsMaterialsforEntitiesOnTerrain = function (scene) {
  return GroundPrimitive.supportsMaterials(scene);
};

/**
 * Checks if the given Scene supports polylines clamped to terrain or 3D Tiles.
 * If this feature is not supported, Entities with PolylineGraphics will be rendered with vertices at
 * the provided heights and using the `arcType` parameter instead of clamped to the ground.
 *
 * @param {Scene} scene The current scene.
 * @returns {boolean} Whether or not the current scene supports polylines on terrain or 3D TIles.
 */
Entity.supportsPolylinesOnTerrain = function (scene) {
  return GroundPolylinePrimitive.isSupported(scene);
};
export default Entity;
