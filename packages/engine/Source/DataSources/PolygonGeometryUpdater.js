// ═══ 【导读】PolygonGeometryUpdater.js —— GeometryUpdater 抽象的代表实现（polygon 专版）═══
// 【导读】GeometryUpdater 体系是「Entity.polygon 等 Graphics 属性 → 几何描述」的转换器：
// 【导读】它盯着 Entity 的 definitionChanged，动态判断「静态/动态、是否贴地、是否闭合」，
// 【导读】向 GeometryVisualizer 的批次桶暴露 fillEnabled/outlineEnabled/isDynamic/isClosed 等路由信号，
// 【导读】并产出 createFillGeometryInstance/createOutlineGeometryInstance（GeometryInstance+id=entity）。
// 【导读】基类链：GeometryUpdater → DynamicGeometryUpdater（动态版包装）；贴地类再继承 GroundGeometryUpdater。
// 【导读】同族 10 个 Updater 由 GeometryUpdaterSet.js 统一为每个 Entity 各建一个。
// 【导读】详见 study/03-Entity数据体系.md §5；动态/静态判定见下面 _isDynamic。
import ApproximateTerrainHeights from "../Core/ApproximateTerrainHeights.js";
import ArcType from "../Core/ArcType.js";
import Cartesian2 from "../Core/Cartesian2.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Check from "../Core/Check.js";
import Color from "../Core/Color.js";
import ColorGeometryInstanceAttribute from "../Core/ColorGeometryInstanceAttribute.js";
import CoplanarPolygonGeometry from "../Core/CoplanarPolygonGeometry.js";
import CoplanarPolygonOutlineGeometry from "../Core/CoplanarPolygonOutlineGeometry.js";
import defined from "../Core/defined.js";
import DeveloperError from "../Core/DeveloperError.js";
import DistanceDisplayConditionGeometryInstanceAttribute from "../Core/DistanceDisplayConditionGeometryInstanceAttribute.js";
import EllipsoidTangentPlane from "../Core/EllipsoidTangentPlane.js";
import GeometryInstance from "../Core/GeometryInstance.js";
import Iso8601 from "../Core/Iso8601.js";
import OffsetGeometryInstanceAttribute from "../Core/OffsetGeometryInstanceAttribute.js";
import oneTimeWarning from "../Core/oneTimeWarning.js";
import PolygonGeometry from "../Core/PolygonGeometry.js";
import PolygonOutlineGeometry from "../Core/PolygonOutlineGeometry.js";
import Rectangle from "../Core/Rectangle.js";
import ShowGeometryInstanceAttribute from "../Core/ShowGeometryInstanceAttribute.js";
import HeightReference from "../Scene/HeightReference.js";
import MaterialAppearance from "../Scene/MaterialAppearance.js";
import PerInstanceColorAppearance from "../Scene/PerInstanceColorAppearance.js";
import ColorMaterialProperty from "./ColorMaterialProperty.js";
import DynamicGeometryUpdater from "./DynamicGeometryUpdater.js";
import GeometryUpdater from "./GeometryUpdater.js";
import GroundGeometryUpdater from "./GroundGeometryUpdater.js";
import Property from "./Property.js";

const heightAndPerPositionHeightWarning =
  "Entity polygons cannot have both height and perPositionHeight.  height will be ignored";
const heightReferenceAndPerPositionHeightWarning =
  "heightReference is not supported for entity polygons with perPositionHeight. heightReference will be ignored";

const scratchColor = new Color();
const defaultOffset = Cartesian3.ZERO;
const offsetScratch = new Cartesian3();
const scratchRectangle = new Rectangle();
const scratch2DPositions = [];
const cart2Scratch = new Cartesian2();

function PolygonGeometryOptions(entity) {
  this.id = entity;
  this.vertexFormat = undefined;
  this.polygonHierarchy = undefined;
  this.perPositionHeight = undefined;
  this.closeTop = undefined;
  this.closeBottom = undefined;
  this.height = undefined;
  this.extrudedHeight = undefined;
  this.granularity = undefined;
  this.stRotation = undefined;
  this.offsetAttribute = undefined;
  this.arcType = undefined;
  this.textureCoordinates = undefined;
}

/**
 * A {@link GeometryUpdater} for polygons.
 * Clients do not normally create this class directly, but instead rely on {@link DataSourceDisplay}.
 * @alias PolygonGeometryUpdater
 * @constructor
 *
 * @param {Entity} entity The entity containing the geometry to be visualized.
 * @param {Scene} scene The scene where visualization is taking place.
 */
  // 【导读】构造：交给基类 GroundGeometryUpdater 注册关心的属性名（availability/polygon），
  // 【导读】再立即回放一次 _onEntityPropertyChanged 完成首次状态计算（静态选项在此评估）。
function PolygonGeometryUpdater(entity, scene) {
  GroundGeometryUpdater.call(this, {
    entity: entity,
    scene: scene,
    geometryOptions: new PolygonGeometryOptions(entity),
    geometryPropertyName: "polygon",
    observedPropertyNames: ["availability", "polygon"],
  });

  this._onEntityPropertyChanged(entity, "polygon", entity.polygon, undefined);
}

if (defined(Object.create)) {
  PolygonGeometryUpdater.prototype = Object.create(
    GroundGeometryUpdater.prototype,
  );
  PolygonGeometryUpdater.prototype.constructor = PolygonGeometryUpdater;
}

/**
 * Creates the geometry instance which represents the fill of the geometry.
 *
 * @param {JulianDate} time The time to use when retrieving initial attribute values.
 * @returns {GeometryInstance} The geometry instance representing the filled portion of the geometry.
 *
 * @exception {DeveloperError} This instance does not represent a filled geometry.
 */
  // 【导读】创建填充几何实例：attributes（show/color/distanceDisplayCondition/offset）在合批后
  // 【导读】仍可逐实例控制；几何体选型：perPositionHeight 无拉伸→共面多边形几何，否则标准 PolygonGeometry。
  // 【导读】关键在末尾 id: entity——拾取（scene.pick）正是拿到这个 id 才能从像素回到 Entity。
PolygonGeometryUpdater.prototype.createFillGeometryInstance = function (time) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("time", time);

  if (!this._fillEnabled) {
    throw new DeveloperError(
      "This instance does not represent a filled geometry.",
    );
  }
  //>>includeEnd('debug');

  const entity = this._entity;
  const isAvailable = entity.isAvailable(time);
  const options = this._options;

  const attributes = {
    show: new ShowGeometryInstanceAttribute(
      isAvailable &&
        entity.isShowing &&
        this._showProperty.getValue(time) &&
        this._fillProperty.getValue(time),
    ),
    distanceDisplayCondition:
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        this._distanceDisplayConditionProperty.getValue(time),
      ),
    offset: undefined,
    color: undefined,
  };

  if (this._materialProperty instanceof ColorMaterialProperty) {
    let currentColor;
    if (
      defined(this._materialProperty.color) &&
      (this._materialProperty.color.isConstant || isAvailable)
    ) {
      currentColor = this._materialProperty.color.getValue(time, scratchColor);
    }
    if (!defined(currentColor)) {
      currentColor = Color.WHITE;
    }
    attributes.color = ColorGeometryInstanceAttribute.fromColor(currentColor);
  }
  if (defined(options.offsetAttribute)) {
    attributes.offset = OffsetGeometryInstanceAttribute.fromCartesian3(
      Property.getValueOrDefault(
        this._terrainOffsetProperty,
        time,
        defaultOffset,
        offsetScratch,
      ),
    );
  }

  let geometry;
  if (options.perPositionHeight && !defined(options.extrudedHeight)) {
    geometry = new CoplanarPolygonGeometry(options);
  } else {
    geometry = new PolygonGeometry(options);
  }

  return new GeometryInstance({
    id: entity,
    geometry: geometry,
    attributes: attributes,
  });
};

/**
 * Creates the geometry instance which represents the outline of the geometry.
 *
 * @param {JulianDate} time The time to use when retrieving initial attribute values.
 * @returns {GeometryInstance} The geometry instance representing the outline portion of the geometry.
 *
 * @exception {DeveloperError} This instance does not represent an outlined geometry.
 */
PolygonGeometryUpdater.prototype.createOutlineGeometryInstance = function (
  time,
) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("time", time);

  if (!this._outlineEnabled) {
    throw new DeveloperError(
      "This instance does not represent an outlined geometry.",
    );
  }
  //>>includeEnd('debug');

  const entity = this._entity;
  const isAvailable = entity.isAvailable(time);
  const options = this._options;
  const outlineColor = Property.getValueOrDefault(
    this._outlineColorProperty,
    time,
    Color.BLACK,
    scratchColor,
  );
  const distanceDisplayCondition =
    this._distanceDisplayConditionProperty.getValue(time);

  const attributes = {
    show: new ShowGeometryInstanceAttribute(
      isAvailable &&
        entity.isShowing &&
        this._showProperty.getValue(time) &&
        this._showOutlineProperty.getValue(time),
    ),
    color: ColorGeometryInstanceAttribute.fromColor(outlineColor),
    distanceDisplayCondition:
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        distanceDisplayCondition,
      ),
    offset: undefined,
  };

  if (defined(options.offsetAttribute)) {
    attributes.offset = OffsetGeometryInstanceAttribute.fromCartesian3(
      Property.getValueOrDefault(
        this._terrainOffsetProperty,
        time,
        defaultOffset,
        offsetScratch,
      ),
    );
  }

  let geometry;
  if (options.perPositionHeight && !defined(options.extrudedHeight)) {
    geometry = new CoplanarPolygonOutlineGeometry(options);
  } else {
    geometry = new PolygonOutlineGeometry(options);
  }
  return new GeometryInstance({
    id: entity,
    geometry: geometry,
    attributes: attributes,
  });
};

PolygonGeometryUpdater.prototype._computeCenter = function (time, result) {
  const hierarchy = Property.getValueOrUndefined(
    this._entity.polygon.hierarchy,
    time,
  );
  if (!defined(hierarchy)) {
    return;
  }
  const positions = hierarchy.positions;
  if (positions.length === 0) {
    return;
  }
  const ellipsoid = this._scene.ellipsoid;

  const tangentPlane = EllipsoidTangentPlane.fromPoints(positions, ellipsoid);
  const positions2D = tangentPlane.projectPointsOntoPlane(
    positions,
    scratch2DPositions,
  );

  const length = positions2D.length;
  let area = 0;
  let j = length - 1;
  let centroid2D = new Cartesian2();
  for (let i = 0; i < length; j = i++) {
    const p1 = positions2D[i];
    const p2 = positions2D[j];
    const f = p1.x * p2.y - p2.x * p1.y;

    let sum = Cartesian2.add(p1, p2, cart2Scratch);
    sum = Cartesian2.multiplyByScalar(sum, f, sum);
    centroid2D = Cartesian2.add(centroid2D, sum, centroid2D);

    area += f;
  }

  const a = 1.0 / (area * 3.0);
  centroid2D = Cartesian2.multiplyByScalar(centroid2D, a, centroid2D);
  return tangentPlane.projectPointOntoEllipsoid(centroid2D, result);
};

PolygonGeometryUpdater.prototype._isHidden = function (entity, polygon) {
  return (
    !defined(polygon.hierarchy) ||
    GeometryUpdater.prototype._isHidden.call(this, entity, polygon)
  );
};

PolygonGeometryUpdater.prototype._isOnTerrain = function (entity, polygon) {
  const onTerrain = GroundGeometryUpdater.prototype._isOnTerrain.call(
    this,
    entity,
    polygon,
  );
  const perPositionHeightProperty = polygon.perPositionHeight;
  const perPositionHeightEnabled =
    defined(perPositionHeightProperty) &&
    (perPositionHeightProperty.isConstant
      ? perPositionHeightProperty.getValue(Iso8601.MINIMUM_VALUE)
      : true);
  return onTerrain && !perPositionHeightEnabled;
};

  // 【导读】静态/动态分水岭：hierarchy/height/extrudedHeight/……任一属性不是常量 → 动态几何
  // 【导读】（每帧重建，进 DynamicGeometryBatch）；或「贴地+非纯色材质」也按动态处理。
PolygonGeometryUpdater.prototype._isDynamic = function (entity, polygon) {
  return (
    !polygon.hierarchy.isConstant || //
    !Property.isConstant(polygon.height) || //
    !Property.isConstant(polygon.extrudedHeight) || //
    !Property.isConstant(polygon.granularity) || //
    !Property.isConstant(polygon.stRotation) || //
    !Property.isConstant(polygon.textureCoordinates) || //
    !Property.isConstant(polygon.outlineWidth) || //
    !Property.isConstant(polygon.perPositionHeight) || //
    !Property.isConstant(polygon.closeTop) || //
    !Property.isConstant(polygon.closeBottom) || //
    !Property.isConstant(polygon.zIndex) || //
    !Property.isConstant(polygon.arcType) || //
    (this._onTerrain &&
      !Property.isConstant(this._materialProperty) &&
      !(this._materialProperty instanceof ColorMaterialProperty))
  );
};

  // 【导读】静态选项固化：静态几何只在创建时求值一次（用 Iso8601.MINIMUM_VALUE 取常量值），
  // 【导读】含 height/heightReference/extrudedHeight 的贴地规则修正与互斥警告（height×perPositionHeight）。
PolygonGeometryUpdater.prototype._setStaticOptions = function (
  entity,
  polygon,
) {
  const isColorMaterial =
    this._materialProperty instanceof ColorMaterialProperty;

  const options = this._options;
  options.vertexFormat = isColorMaterial
    ? PerInstanceColorAppearance.VERTEX_FORMAT
    : MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat;

  const hierarchyValue = polygon.hierarchy.getValue(Iso8601.MINIMUM_VALUE);
  let heightValue = Property.getValueOrUndefined(
    polygon.height,
    Iso8601.MINIMUM_VALUE,
  );
  const heightReferenceValue = Property.getValueOrDefault(
    polygon.heightReference,
    Iso8601.MINIMUM_VALUE,
    HeightReference.NONE,
  );
  let extrudedHeightValue = Property.getValueOrUndefined(
    polygon.extrudedHeight,
    Iso8601.MINIMUM_VALUE,
  );
  const extrudedHeightReferenceValue = Property.getValueOrDefault(
    polygon.extrudedHeightReference,
    Iso8601.MINIMUM_VALUE,
    HeightReference.NONE,
  );
  const perPositionHeightValue = Property.getValueOrDefault(
    polygon.perPositionHeight,
    Iso8601.MINIMUM_VALUE,
    false,
  );

  heightValue = GroundGeometryUpdater.getGeometryHeight(
    heightValue,
    heightReferenceValue,
  );

  let offsetAttribute;
  if (perPositionHeightValue) {
    if (defined(heightValue)) {
      heightValue = undefined;
      oneTimeWarning(heightAndPerPositionHeightWarning);
    }
    if (
      heightReferenceValue !== HeightReference.NONE &&
      perPositionHeightValue
    ) {
      heightValue = undefined;
      oneTimeWarning(heightReferenceAndPerPositionHeightWarning);
    }
  } else {
    if (defined(extrudedHeightValue) && !defined(heightValue)) {
      heightValue = 0;
    }
    offsetAttribute = GroundGeometryUpdater.computeGeometryOffsetAttribute(
      heightValue,
      heightReferenceValue,
      extrudedHeightValue,
      extrudedHeightReferenceValue,
    );
  }

  options.polygonHierarchy = hierarchyValue;
  options.granularity = Property.getValueOrUndefined(
    polygon.granularity,
    Iso8601.MINIMUM_VALUE,
  );
  options.stRotation = Property.getValueOrUndefined(
    polygon.stRotation,
    Iso8601.MINIMUM_VALUE,
  );
  options.perPositionHeight = perPositionHeightValue;
  options.closeTop = Property.getValueOrDefault(
    polygon.closeTop,
    Iso8601.MINIMUM_VALUE,
    true,
  );
  options.closeBottom = Property.getValueOrDefault(
    polygon.closeBottom,
    Iso8601.MINIMUM_VALUE,
    true,
  );
  options.offsetAttribute = offsetAttribute;
  options.height = heightValue;
  options.arcType = Property.getValueOrDefault(
    polygon.arcType,
    Iso8601.MINIMUM_VALUE,
    ArcType.GEODESIC,
  );
  options.textureCoordinates = Property.getValueOrUndefined(
    polygon.textureCoordinates,
    Iso8601.MINIMUM_VALUE,
  );

  extrudedHeightValue = GroundGeometryUpdater.getGeometryExtrudedHeight(
    extrudedHeightValue,
    extrudedHeightReferenceValue,
  );
  if (extrudedHeightValue === GroundGeometryUpdater.CLAMP_TO_GROUND) {
    const rectangle = PolygonGeometry.computeRectangleFromPositions(
      options.polygonHierarchy.positions,
      options.ellipsoid,
      options.arcType,
      scratchRectangle,
    );
    extrudedHeightValue =
      ApproximateTerrainHeights.getMinimumMaximumHeights(
        rectangle,
      ).minimumTerrainHeight;
  }

  options.extrudedHeight = extrudedHeightValue;
};

PolygonGeometryUpdater.prototype._getIsClosed = function (options) {
  const height = options.height;
  const extrudedHeight = options.extrudedHeight;
  const isExtruded = defined(extrudedHeight) && extrudedHeight !== height;
  return (
    !options.perPositionHeight &&
    ((!isExtruded && height === 0) ||
      (isExtruded && options.closeTop && options.closeBottom))
  );
};

PolygonGeometryUpdater.DynamicGeometryUpdater = DyanmicPolygonGeometryUpdater;

/**
 * @private
 */
function DyanmicPolygonGeometryUpdater(
  geometryUpdater,
  primitives,
  groundPrimitives,
) {
  DynamicGeometryUpdater.call(
    this,
    geometryUpdater,
    primitives,
    groundPrimitives,
  );
}

if (defined(Object.create)) {
  DyanmicPolygonGeometryUpdater.prototype = Object.create(
    DynamicGeometryUpdater.prototype,
  );
  DyanmicPolygonGeometryUpdater.prototype.constructor =
    DyanmicPolygonGeometryUpdater;
}

DyanmicPolygonGeometryUpdater.prototype._isHidden = function (
  entity,
  polygon,
  time,
) {
  return (
    !defined(this._options.polygonHierarchy) ||
    DynamicGeometryUpdater.prototype._isHidden.call(this, entity, polygon, time)
  );
};

DyanmicPolygonGeometryUpdater.prototype._setOptions = function (
  entity,
  polygon,
  time,
) {
  const options = this._options;

  options.polygonHierarchy = Property.getValueOrUndefined(
    polygon.hierarchy,
    time,
  );

  let heightValue = Property.getValueOrUndefined(polygon.height, time);
  const heightReferenceValue = Property.getValueOrDefault(
    polygon.heightReference,
    time,
    HeightReference.NONE,
  );
  const extrudedHeightReferenceValue = Property.getValueOrDefault(
    polygon.extrudedHeightReference,
    time,
    HeightReference.NONE,
  );
  let extrudedHeightValue = Property.getValueOrUndefined(
    polygon.extrudedHeight,
    time,
  );
  const perPositionHeightValue = Property.getValueOrUndefined(
    polygon.perPositionHeight,
    time,
  );

  heightValue = GroundGeometryUpdater.getGeometryHeight(
    heightValue,
    extrudedHeightReferenceValue,
  );

  let offsetAttribute;
  if (perPositionHeightValue) {
    if (defined(heightValue)) {
      heightValue = undefined;
      oneTimeWarning(heightAndPerPositionHeightWarning);
    }
    if (
      heightReferenceValue !== HeightReference.NONE &&
      perPositionHeightValue
    ) {
      heightValue = undefined;
      oneTimeWarning(heightReferenceAndPerPositionHeightWarning);
    }
  } else {
    if (defined(extrudedHeightValue) && !defined(heightValue)) {
      heightValue = 0;
    }

    offsetAttribute = GroundGeometryUpdater.computeGeometryOffsetAttribute(
      heightValue,
      heightReferenceValue,
      extrudedHeightValue,
      extrudedHeightReferenceValue,
    );
  }

  options.granularity = Property.getValueOrUndefined(polygon.granularity, time);
  options.stRotation = Property.getValueOrUndefined(polygon.stRotation, time);
  options.textureCoordinates = Property.getValueOrUndefined(
    polygon.textureCoordinates,
    time,
  );
  options.perPositionHeight = Property.getValueOrUndefined(
    polygon.perPositionHeight,
    time,
  );
  options.closeTop = Property.getValueOrDefault(polygon.closeTop, time, true);
  options.closeBottom = Property.getValueOrDefault(
    polygon.closeBottom,
    time,
    true,
  );
  options.offsetAttribute = offsetAttribute;
  options.height = heightValue;
  options.arcType = Property.getValueOrDefault(
    polygon.arcType,
    time,
    ArcType.GEODESIC,
  );

  extrudedHeightValue = GroundGeometryUpdater.getGeometryExtrudedHeight(
    extrudedHeightValue,
    extrudedHeightReferenceValue,
  );
  if (extrudedHeightValue === GroundGeometryUpdater.CLAMP_TO_GROUND) {
    const rectangle = PolygonGeometry.computeRectangleFromPositions(
      options.polygonHierarchy.positions,
      options.ellipsoid,
      options.arcType,
      scratchRectangle,
    );
    extrudedHeightValue =
      ApproximateTerrainHeights.getMinimumMaximumHeights(
        rectangle,
      ).minimumTerrainHeight;
  }

  options.extrudedHeight = extrudedHeightValue;
};
export default PolygonGeometryUpdater;
