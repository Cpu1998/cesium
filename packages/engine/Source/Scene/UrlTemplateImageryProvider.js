// ═══ 【导读】UrlTemplateImageryProvider.js —— 「万能 XYZ 瓦片底图」数据源 ═══
// 【导读】用 URL 模板（如 https://tile.example.com/{z}/{x}/{y}.png）拉取标准 XYZ 切片瓦片，
// 【导读】接任意自建瓦片服务（天地图/Mapbox 栅格/OSM 镜像等）首选它；也是理解影像数据入口最简单的样本。
// 【导读】主链路：构造（存模板/子域名/tilingScheme，默认 WebMercatorTilingScheme 256px）→
// 【导读】requestImage(x,y,level) → buildImageResource 展开 {z}/{x}/{y}/{s}/{reverseX}… 标签 → ImageryProvider.loadImage（fetch+限并发）。
// 【导读】拾取链路：pickFeatures 用独立模板 pickFeaturesUrl + {i}/{j} 像素坐标标签，按 getFeatureInfoFormats 逐格式降级重试。
// 【导读】坐标体系：WebMercator 金字塔 L0=1×1、Geographic L0=2×1；y 从北向南编号（部分服务的反向编号见 reverseYTag）。
// 【导读】Provider 只答「数据从哪来」；怎么贴到地球由 ImageryLayer/GlobeSurfaceTileProvider 负责。
// 【导读】模板标签速查与 XYZ/quadkey 对比见 study/02-底图与影像体系.md §2；Provider 家族速查见 §6。
import Cartesian2 from "../Core/Cartesian2.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Cartographic from "../Core/Cartographic.js";
import Check from "../Core/Check.js";
import combine from "../Core/combine.js";
import Credit from "../Core/Credit.js";
import Frozen from "../Core/Frozen.js";
import defined from "../Core/defined.js";
import Event from "../Core/Event.js";
import GeographicProjection from "../Core/GeographicProjection.js";
import CesiumMath from "../Core/Math.js";
import Rectangle from "../Core/Rectangle.js";
import Resource from "../Core/Resource.js";
import WebMercatorTilingScheme from "../Core/WebMercatorTilingScheme.js";
import ImageryProvider from "./ImageryProvider.js";

const templateRegex = /{[^}]+}/g;

// 【导读】标签注册表：模板里每个 {tag} 对应一个取值函数，展开时仅替换已识别的标签（未识别的保留原样，便于路径里嵌自定义段）。
// 【导读】常用：x/y/z（行列层）、reverseX/Y/Z（服务端编号反向）、s（子域名轮询分摊并发）、
// 【导读】west/south/east/northDegrees（瓦片地理范围）、Projected 版（投影坐标）、width/height（分辨率）。
const tags = {
  x: xTag,
  y: yTag,
  z: zTag,
  s: sTag,
  reverseX: reverseXTag,
  reverseY: reverseYTag,
  reverseZ: reverseZTag,
  westDegrees: westDegreesTag,
  southDegrees: southDegreesTag,
  eastDegrees: eastDegreesTag,
  northDegrees: northDegreesTag,
  westProjected: westProjectedTag,
  southProjected: southProjectedTag,
  eastProjected: eastProjectedTag,
  northProjected: northProjectedTag,
  width: widthTag,
  height: heightTag,
};

const pickFeaturesTags = combine(tags, {
  i: iTag,
  j: jTag,
  reverseI: reverseITag,
  reverseJ: reverseJTag,
  longitudeDegrees: longitudeDegreesTag,
  latitudeDegrees: latitudeDegreesTag,
  longitudeProjected: longitudeProjectedTag,
  latitudeProjected: latitudeProjectedTag,
  format: formatTag,
});

/**
 * @typedef {object} UrlTemplateImageryProvider.ConstructorOptions
 *
 * Initialization options for the UrlTemplateImageryProvider constructor
 *
 * @property {Resource|string} url  The URL template to use to request tiles.  It has the following keywords:
 * <ul>
 *     <li><code>{z}</code>: The level of the tile in the tiling scheme.  Level zero is the root of the quadtree pyramid.</li>
 *     <li><code>{x}</code>: The tile X coordinate in the tiling scheme, where 0 is the Westernmost tile.</li>
 *     <li><code>{y}</code>: The tile Y coordinate in the tiling scheme, where 0 is the Northernmost tile.</li>
 *     <li><code>{s}</code>: One of the available subdomains, used to overcome browser limits on the number of simultaneous requests per host.</li>
 *     <li><code>{reverseX}</code>: The tile X coordinate in the tiling scheme, where 0 is the Easternmost tile.</li>
 *     <li><code>{reverseY}</code>: The tile Y coordinate in the tiling scheme, where 0 is the Southernmost tile.</li>
 *     <li><code>{reverseZ}</code>: The level of the tile in the tiling scheme, where level zero is the maximum level of the quadtree pyramid.  In order to use reverseZ, maximumLevel must be defined.</li>
 *     <li><code>{westDegrees}</code>: The Western edge of the tile in geodetic degrees.</li>
 *     <li><code>{southDegrees}</code>: The Southern edge of the tile in geodetic degrees.</li>
 *     <li><code>{eastDegrees}</code>: The Eastern edge of the tile in geodetic degrees.</li>
 *     <li><code>{northDegrees}</code>: The Northern edge of the tile in geodetic degrees.</li>
 *     <li><code>{westProjected}</code>: The Western edge of the tile in projected coordinates of the tiling scheme.</li>
 *     <li><code>{southProjected}</code>: The Southern edge of the tile in projected coordinates of the tiling scheme.</li>
 *     <li><code>{eastProjected}</code>: The Eastern edge of the tile in projected coordinates of the tiling scheme.</li>
 *     <li><code>{northProjected}</code>: The Northern edge of the tile in projected coordinates of the tiling scheme.</li>
 *     <li><code>{width}</code>: The width of each tile in pixels.</li>
 *     <li><code>{height}</code>: The height of each tile in pixels.</li>
 * </ul>
 * @property {Resource|string} [pickFeaturesUrl] The URL template to use to pick features.  If this property is not specified,
 *                 {@link UrlTemplateImageryProvider#pickFeatures} will immediately returned undefined, indicating no
 *                 features picked.  The URL template supports all of the keywords supported by the <code>url</code>
 *                 parameter, plus the following:
 * <ul>
 *     <li><code>{i}</code>: The pixel column (horizontal coordinate) of the picked position, where the Westernmost pixel is 0.</li>
 *     <li><code>{j}</code>: The pixel row (vertical coordinate) of the picked position, where the Northernmost pixel is 0.</li>
 *     <li><code>{reverseI}</code>: The pixel column (horizontal coordinate) of the picked position, where the Easternmost pixel is 0.</li>
 *     <li><code>{reverseJ}</code>: The pixel row (vertical coordinate) of the picked position, where the Southernmost pixel is 0.</li>
 *     <li><code>{longitudeDegrees}</code>: The longitude of the picked position in degrees.</li>
 *     <li><code>{latitudeDegrees}</code>: The latitude of the picked position in degrees.</li>
 *     <li><code>{longitudeProjected}</code>: The longitude of the picked position in the projected coordinates of the tiling scheme.</li>
 *     <li><code>{latitudeProjected}</code>: The latitude of the picked position in the projected coordinates of the tiling scheme.</li>
 *     <li><code>{format}</code>: The format in which to get feature information, as specified in the {@link GetFeatureInfoFormat}.</li>
 * </ul>
 * @property {object} [urlSchemeZeroPadding] Gets the URL scheme zero padding for each tile coordinate. The format is '000' where
 * each coordinate will be padded on the left with zeros to match the width of the passed string of zeros. e.g. Setting:
 * urlSchemeZeroPadding : { '{x}' : '0000'}
 * will cause an 'x' value of 12 to return the string '0012' for {x} in the generated URL.
 * It the passed object has the following keywords:
 * <ul>
 *  <li> <code>{z}</code>: The zero padding for the level of the tile in the tiling scheme.</li>
 *  <li> <code>{x}</code>: The zero padding for the tile X coordinate in the tiling scheme.</li>
 *  <li> <code>{y}</code>: The zero padding for the the tile Y coordinate in the tiling scheme.</li>
 *  <li> <code>{reverseX}</code>: The zero padding for the tile reverseX coordinate in the tiling scheme.</li>
 *  <li> <code>{reverseY}</code>: The zero padding for the tile reverseY coordinate in the tiling scheme.</li>
 *  <li> <code>{reverseZ}</code>: The zero padding for the reverseZ coordinate of the tile in the tiling scheme.</li>
 * </ul>
 * @property {string|string[]} [subdomains='abc'] The subdomains to use for the <code>{s}</code> placeholder in the URL template.
 *                          If this parameter is a single string, each character in the string is a subdomain.  If it is
 *                          an array, each element in the array is a subdomain.
 * @property {Credit|string} [credit=''] A credit for the data source, which is displayed on the canvas.
 * @property {number} [minimumLevel=0] The minimum level-of-detail supported by the imagery provider.  Take care when specifying
 *                 this that the number of tiles at the minimum level is small, such as four or less.  A larger number is likely
 *                 to result in rendering problems.
 * @property {number} [maximumLevel] The maximum level-of-detail supported by the imagery provider, or undefined if there is no limit.
 * @property {Rectangle} [rectangle=Rectangle.MAX_VALUE] The rectangle, in radians, covered by the image.
 * @property {TilingScheme} [tilingScheme=WebMercatorTilingScheme] The tiling scheme specifying how the ellipsoidal
 * surface is broken into tiles.  If this parameter is not provided, a {@link WebMercatorTilingScheme}
 * is used.
 * @property {Ellipsoid} [ellipsoid] The ellipsoid.  If the tilingScheme is specified,
 *                    this parameter is ignored and the tiling scheme's ellipsoid is used instead. If neither
 *                    parameter is specified, the WGS84 ellipsoid is used.
 * @property {number} [tileWidth=256] Pixel width of image tiles.
 * @property {number} [tileHeight=256] Pixel height of image tiles.
 * @property {boolean} [hasAlphaChannel=true] true if the images provided by this imagery provider
 *                  include an alpha channel; otherwise, false.  If this property is false, an alpha channel, if
 *                  present, will be ignored.  If this property is true, any images without an alpha channel will
 *                  be treated as if their alpha is 1.0 everywhere.  When this property is false, memory usage
 *                  and texture upload time are potentially reduced.
 * @property {GetFeatureInfoFormat[]} [getFeatureInfoFormats] The formats in which to get feature information at a
 *                                 specific location when {@link UrlTemplateImageryProvider#pickFeatures} is invoked.  If this
 *                                 parameter is not specified, feature picking is disabled.
 * @property {boolean} [enablePickFeatures=true] If true, {@link UrlTemplateImageryProvider#pickFeatures} will
 *        request the <code>pickFeaturesUrl</code> and attempt to interpret the features included in the response.  If false,
 *        {@link UrlTemplateImageryProvider#pickFeatures} will immediately return undefined (indicating no pickable
 *        features) without communicating with the server.  Set this property to false if you know your data
 *        source does not support picking features or if you don't want this provider's features to be pickable. Note
 *        that this can be dynamically overridden by modifying the {@link UriTemplateImageryProvider#enablePickFeatures}
 *        property.
 * @property {TileDiscardPolicy} [tileDiscardPolicy] A policy for discarding tile images according to some criteria
 * @property {object} [customTags] Allow to replace custom keywords in the URL template. The object must have strings as keys and functions as values.
 */

/**
 * Provides imagery by requesting tiles using a specified URL template.
 *
 * @alias UrlTemplateImageryProvider
 * @constructor
 *
 * @param {UrlTemplateImageryProvider.ConstructorOptions} options Object describing initialization options
 *
 * @example
 * // Access Natural Earth II imagery, which uses a TMS tiling scheme and Geographic (EPSG:4326) project
 * const tms = new Cesium.UrlTemplateImageryProvider({
 *     url : Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII') + '/{z}/{x}/{reverseY}.jpg',
 *     tilingScheme : new Cesium.GeographicTilingScheme(),
 *     maximumLevel : 5
 * });
 * // Access the CartoDB Positron basemap, which uses an OpenStreetMap-like tiling scheme.
 * const positron = new Cesium.UrlTemplateImageryProvider({
 *     url : 'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
 *     credit : 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.'
 * });
 * // Access a Web Map Service (WMS) server.
 * const wms = new Cesium.UrlTemplateImageryProvider({
 *    url : 'https://services.ga.gov.au/gis/services/NM_Hydrology_and_Marine_Points/MapServer/WMSServer?' +
 *          'tiled=true&transparent=true&format=image%2Fpng&exceptions=application%2Fvnd.ogc.se_xml&' +
 *          'styles=&service=WMS&version=1.3.0&request=GetMap&' +
 *          'layers=Bores&crs=EPSG%3A3857&' +
 *          'bbox={westProjected}%2C{southProjected}%2C{eastProjected}%2C{northProjected}&' +
 *          'width=256&height=256',
 *    rectangle : Cesium.Rectangle.fromDegrees(95.0, -55.0, 170.0, -1.0)  // From GetCapabilities EX_GeographicBoundingBox
 * });
 * // Using custom tags in your template url.
 * const custom = new Cesium.UrlTemplateImageryProvider({
 *    url : 'https://yoururl/{Time}/{z}/{y}/{x}.png',
 *    customTags : {
 *        Time: function(imageryProvider, x, y, level) {
 *            return '20171231'
 *        }
 *    }
 * });
 *
 * @see ArcGisMapServerImageryProvider
 * @see BingMapsImageryProvider
 * @see GoogleEarthEnterpriseMapsProvider
 * @see OpenStreetMapImageryProvider
 * @see SingleTileImageryProvider
 * @see TileMapServiceImageryProvider
 * @see WebMapServiceImageryProvider
 * @see WebMapTileServiceImageryProvider
 */
function UrlTemplateImageryProvider(options) {
  // 【导读】要点：① 默认 tilingScheme=WebMercatorTilingScheme（256×256，L0=1×1）；接 Geographic（L0=2×1）服务须显式传；
  // 【导读】② subdomains 配合 {s} 标签做域名轮询（默认 a/b/c）；③ pickFeaturesUrl + getFeatureInfoFormats 支持要素拾取。
  options = options ?? Frozen.EMPTY_OBJECT;

  this._errorEvent = new Event();

  //>>includeStart('debug', pragmas.debug);
  Check.defined("options.url", options.url);
  //>>includeEnd('debug');

  const resource = Resource.createIfNeeded(options.url);
  const pickFeaturesResource = Resource.createIfNeeded(options.pickFeaturesUrl);

  this._resource = resource;
  this._urlSchemeZeroPadding = options.urlSchemeZeroPadding;
  this._getFeatureInfoFormats = options.getFeatureInfoFormats;
  this._pickFeaturesResource = pickFeaturesResource;

  let subdomains = options.subdomains;
  if (Array.isArray(subdomains)) {
    subdomains = subdomains.slice();
  } else if (defined(subdomains) && subdomains.length > 0) {
    subdomains = subdomains.split("");
  } else {
    subdomains = ["a", "b", "c"];
  }
  this._subdomains = subdomains;

  this._tileWidth = options.tileWidth ?? 256;
  this._tileHeight = options.tileHeight ?? 256;
  this._minimumLevel = options.minimumLevel ?? 0;
  this._maximumLevel = options.maximumLevel;
  this._tilingScheme =
    options.tilingScheme ??
    new WebMercatorTilingScheme({ ellipsoid: options.ellipsoid });

  this._rectangle = options.rectangle ?? this._tilingScheme.rectangle;
  this._rectangle = Rectangle.intersection(
    this._rectangle,
    this._tilingScheme.rectangle,
  );

  this._tileDiscardPolicy = options.tileDiscardPolicy;

  let credit = options.credit;
  if (typeof credit === "string") {
    credit = new Credit(credit);
  }
  this._credit = credit;
  this._hasAlphaChannel = options.hasAlphaChannel ?? true;

  const customTags = options.customTags;
  const allTags = combine(tags, customTags);
  const allPickFeaturesTags = combine(pickFeaturesTags, customTags);
  this._tags = allTags;
  this._pickFeaturesTags = allPickFeaturesTags;

  this._defaultAlpha = undefined;
  this._defaultNightAlpha = undefined;
  this._defaultDayAlpha = undefined;
  this._defaultBrightness = undefined;
  this._defaultContrast = undefined;
  this._defaultHue = undefined;
  this._defaultSaturation = undefined;
  this._defaultGamma = undefined;
  this._defaultMinificationFilter = undefined;
  this._defaultMagnificationFilter = undefined;

  /**
   * Gets or sets a value indicating whether feature picking is enabled.  If true, {@link UrlTemplateImageryProvider#pickFeatures} will
   * request the <code>options.pickFeaturesUrl</code> and attempt to interpret the features included in the response.  If false,
   * {@link UrlTemplateImageryProvider#pickFeatures} will immediately return undefined (indicating no pickable
   * features) without communicating with the server.  Set this property to false if you know your data
   * source does not support picking features or if you don't want this provider's features to be pickable.
   * @type {boolean}
   * @default true
   */
  this.enablePickFeatures = options.enablePickFeatures ?? true;
}

Object.defineProperties(UrlTemplateImageryProvider.prototype, {
  /**
   * Gets the URL template to use to request tiles.  It has the following keywords:
   * <ul>
   *  <li> <code>{z}</code>: The level of the tile in the tiling scheme.  Level zero is the root of the quadtree pyramid.</li>
   *  <li> <code>{x}</code>: The tile X coordinate in the tiling scheme, where 0 is the Westernmost tile.</li>
   *  <li> <code>{y}</code>: The tile Y coordinate in the tiling scheme, where 0 is the Northernmost tile.</li>
   *  <li> <code>{s}</code>: One of the available subdomains, used to overcome browser limits on the number of simultaneous requests per host.</li>
   *  <li> <code>{reverseX}</code>: The tile X coordinate in the tiling scheme, where 0 is the Easternmost tile.</li>
   *  <li> <code>{reverseY}</code>: The tile Y coordinate in the tiling scheme, where 0 is the Southernmost tile.</li>
   *  <li> <code>{reverseZ}</code>: The level of the tile in the tiling scheme, where level zero is the maximum level of the quadtree pyramid.  In order to use reverseZ, maximumLevel must be defined.</li>
   *  <li> <code>{westDegrees}</code>: The Western edge of the tile in geodetic degrees.</li>
   *  <li> <code>{southDegrees}</code>: The Southern edge of the tile in geodetic degrees.</li>
   *  <li> <code>{eastDegrees}</code>: The Eastern edge of the tile in geodetic degrees.</li>
   *  <li> <code>{northDegrees}</code>: The Northern edge of the tile in geodetic degrees.</li>
   *  <li> <code>{westProjected}</code>: The Western edge of the tile in projected coordinates of the tiling scheme.</li>
   *  <li> <code>{southProjected}</code>: The Southern edge of the tile in projected coordinates of the tiling scheme.</li>
   *  <li> <code>{eastProjected}</code>: The Eastern edge of the tile in projected coordinates of the tiling scheme.</li>
   *  <li> <code>{northProjected}</code>: The Northern edge of the tile in projected coordinates of the tiling scheme.</li>
   *  <li> <code>{width}</code>: The width of each tile in pixels.</li>
   *  <li> <code>{height}</code>: The height of each tile in pixels.</li>
   * </ul>
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {string}
   * @readonly
   */
  url: {
    get: function () {
      return this._resource.url;
    },
  },

  /**
   * Gets the URL scheme zero padding for each tile coordinate. The format is '000' where each coordinate will be padded on
   * the left with zeros to match the width of the passed string of zeros. e.g. Setting:
   * urlSchemeZeroPadding : { '{x}' : '0000'}
   * will cause an 'x' value of 12 to return the string '0012' for {x} in the generated URL.
   * It has the following keywords:
   * <ul>
   *  <li> <code>{z}</code>: The zero padding for the level of the tile in the tiling scheme.</li>
   *  <li> <code>{x}</code>: The zero padding for the tile X coordinate in the tiling scheme.</li>
   *  <li> <code>{y}</code>: The zero padding for the the tile Y coordinate in the tiling scheme.</li>
   *  <li> <code>{reverseX}</code>: The zero padding for the tile reverseX coordinate in the tiling scheme.</li>
   *  <li> <code>{reverseY}</code>: The zero padding for the tile reverseY coordinate in the tiling scheme.</li>
   *  <li> <code>{reverseZ}</code>: The zero padding for the reverseZ coordinate of the tile in the tiling scheme.</li>
   * </ul>
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {object}
   * @readonly
   */
  urlSchemeZeroPadding: {
    get: function () {
      return this._urlSchemeZeroPadding;
    },
  },

  /**
   * Gets the URL template to use to use to pick features.  If this property is not specified,
   * {@link UrlTemplateImageryProvider#pickFeatures} will immediately return undefined, indicating no
   * features picked.  The URL template supports all of the keywords supported by the
   * {@link UrlTemplateImageryProvider#url} property, plus the following:
   * <ul>
   *     <li><code>{i}</code>: The pixel column (horizontal coordinate) of the picked position, where the Westernmost pixel is 0.</li>
   *     <li><code>{j}</code>: The pixel row (vertical coordinate) of the picked position, where the Northernmost pixel is 0.</li>
   *     <li><code>{reverseI}</code>: The pixel column (horizontal coordinate) of the picked position, where the Easternmost pixel is 0.</li>
   *     <li><code>{reverseJ}</code>: The pixel row (vertical coordinate) of the picked position, where the Southernmost pixel is 0.</li>
   *     <li><code>{longitudeDegrees}</code>: The longitude of the picked position in degrees.</li>
   *     <li><code>{latitudeDegrees}</code>: The latitude of the picked position in degrees.</li>
   *     <li><code>{longitudeProjected}</code>: The longitude of the picked position in the projected coordinates of the tiling scheme.</li>
   *     <li><code>{latitudeProjected}</code>: The latitude of the picked position in the projected coordinates of the tiling scheme.</li>
   *     <li><code>{format}</code>: The format in which to get feature information, as specified in the {@link GetFeatureInfoFormat}.</li>
   * </ul>
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {string}
   * @readonly
   */
  pickFeaturesUrl: {
    get: function () {
      return this._pickFeaturesResource.url;
    },
  },

  /**
   * Gets the proxy used by this provider.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {Proxy}
   * @readonly
   * @default undefined
   */
  proxy: {
    get: function () {
      return this._resource.proxy;
    },
  },

  /**
   * Gets the width of each tile, in pixels.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   * @default 256
   */
  tileWidth: {
    get: function () {
      return this._tileWidth;
    },
  },

  /**
   * Gets the height of each tile, in pixels.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   * @default 256
   */
  tileHeight: {
    get: function () {
      return this._tileHeight;
    },
  },

  /**
   * Gets the maximum level-of-detail that can be requested, or undefined if there is no limit.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {number|undefined}
   * @readonly
   * @default undefined
   */
  maximumLevel: {
    get: function () {
      return this._maximumLevel;
    },
  },

  /**
   * Gets the minimum level-of-detail that can be requested.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   * @default 0
   */
  minimumLevel: {
    get: function () {
      return this._minimumLevel;
    },
  },

  /**
   * Gets the tiling scheme used by this provider.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {TilingScheme}
   * @readonly
   * @default new WebMercatorTilingScheme()
   */
  tilingScheme: {
    get: function () {
      return this._tilingScheme;
    },
  },

  /**
   * Gets the rectangle, in radians, of the imagery provided by this instance.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {Rectangle}
   * @readonly
   * @default tilingScheme.rectangle
   */
  rectangle: {
    get: function () {
      return this._rectangle;
    },
  },

  /**
   * Gets the tile discard policy.  If not undefined, the discard policy is responsible
   * for filtering out "missing" tiles via its shouldDiscardImage function.  If this function
   * returns undefined, no tiles are filtered.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {TileDiscardPolicy}
   * @readonly
   * @default undefined
   */
  tileDiscardPolicy: {
    get: function () {
      return this._tileDiscardPolicy;
    },
  },

  /**
   * Gets an event that is raised when the imagery provider encounters an asynchronous error.  By subscribing
   * to the event, you will be notified of the error and can potentially recover from it.  Event listeners
   * are passed an instance of {@link TileProviderError}.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {Event}
   * @readonly
   */
  errorEvent: {
    get: function () {
      return this._errorEvent;
    },
  },

  /**
   * Gets the credit to display when this imagery provider is active.  Typically this is used to credit
   * the source of the imagery.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {Credit}
   * @readonly
   * @default undefined
   */
  credit: {
    get: function () {
      return this._credit;
    },
  },

  /**
   * Gets a value indicating whether or not the images provided by this imagery provider
   * include an alpha channel.  If this property is false, an alpha channel, if present, will
   * be ignored.  If this property is true, any images without an alpha channel will be treated
   * as if their alpha is 1.0 everywhere.  When this property is false, memory usage
   * and texture upload time are reduced.
   * @memberof UrlTemplateImageryProvider.prototype
   * @type {boolean}
   * @readonly
   * @default true
   */
  hasAlphaChannel: {
    get: function () {
      return this._hasAlphaChannel;
    },
  },
});

/**
 * Gets the credits to be displayed when a given tile is displayed.
 *
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level;
 * @returns {Credit[]} The credits to be displayed when the tile is displayed.
 */
UrlTemplateImageryProvider.prototype.getTileCredits = function (x, y, level) {
  return undefined;
};

/**
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @param {Request} [request] The request object. Intended for internal use only.
 * @returns {Promise<ImageryTypes>|undefined} A promise for the image that will resolve when the image is available, or
 *          undefined if there are too many active requests to the server, and the request should be retried later.
 */
UrlTemplateImageryProvider.prototype.requestImage = function (
  // 【导读】请求入口（ImageryLayer._requestImagery 调用）：buildImageResource 展开 URL 后交给
  // 【导读】ImageryProvider.loadImage（.ktx2 压缩纹理走 loadKTX2，普通图 fetchImage；同域并发超限返回 undefined 待重试）。
  x,
  y,
  level,
  request,
) {
  return ImageryProvider.loadImage(
    this,
    buildImageResource(this, x, y, level, request),
  );
};

/**
 * Asynchronously determines what features, if any, are located at a given longitude and latitude within
 * a tile.
 *
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @param {number} longitude The longitude at which to pick features.
 * @param {number} latitude  The latitude at which to pick features.
 * @return {Promise<ImageryLayerFeatureInfo[]>|undefined} A promise for the picked features that will resolve when the asynchronous
 *                   picking completes.  The resolved value is an array of {@link ImageryLayerFeatureInfo}
 *                   instances.  The array may be empty if no features are found at the given location.
 *                   It may also be undefined if picking is not supported.
 */
UrlTemplateImageryProvider.prototype.pickFeatures = function (
  x,
  y,
  level,
  longitude,
  latitude,
) {
  if (
    !this.enablePickFeatures ||
    !defined(this._pickFeaturesResource) ||
    this._getFeatureInfoFormats.length === 0
  ) {
    return undefined;
  }

  let formatIndex = 0;

  // 【导读】格式降级链：依次尝试 json→xml→text…，前一个格式 fetch/解析失败就 catch 后试下一个（doRequest 递归），
  // 【导读】全失败返回空数组。适合 GetFeatureInfo 端点返回格式不确定的情况。
  const that = this;

  function handleResponse(format, data) {
    return format.callback(data);
  }

  function doRequest() {
    if (formatIndex >= that._getFeatureInfoFormats.length) {
      // No valid formats, so no features picked.
      return Promise.resolve([]);
    }

    const format = that._getFeatureInfoFormats[formatIndex];
    const resource = buildPickFeaturesResource(
      that,
      x,
      y,
      level,
      longitude,
      latitude,
      format.format,
    );

    ++formatIndex;

    if (format.type === "json") {
      return resource.fetchJson().then(format.callback).catch(doRequest);
    } else if (format.type === "xml") {
      return resource.fetchXML().then(format.callback).catch(doRequest);
    } else if (format.type === "text" || format.type === "html") {
      return resource.fetchText().then(format.callback).catch(doRequest);
    }
    return resource
      .fetch({
        responseType: format.format,
      })
      .then(handleResponse.bind(undefined, format))
      .catch(doRequest);
  }

  return doRequest();
};

let degreesScratchComputed = false;
const degreesScratch = new Rectangle();
let projectedScratchComputed = false;
const projectedScratch = new Rectangle();

function buildImageResource(imageryProvider, x, y, level, request) {
  // 【导读】★模板展开：正则抳出所有 {tag}，逐个调 tags[key](provider,x,y,level) 求值填入 templateValues，
  // 【导读】再 getDerivedResource 生成带 Request 句柄的子 Resource（沿用原 resource 的 query/header/重试策略）。
  degreesScratchComputed = false;
  projectedScratchComputed = false;

  const resource = imageryProvider._resource;
  const url = resource.getUrlComponent(true);
  const allTags = imageryProvider._tags;
  const templateValues = {};

  const match = url.match(templateRegex);
  if (defined(match)) {
    match.forEach(function (tag) {
      const key = tag.substring(1, tag.length - 1); //strip {}
      if (defined(allTags[key])) {
        templateValues[key] = allTags[key](imageryProvider, x, y, level);
      }
    });
  }

  return resource.getDerivedResource({
    request: request,
    templateValues: templateValues,
  });
}

let ijScratchComputed = false;
const ijScratch = new Cartesian2();
let longitudeLatitudeProjectedScratchComputed = false;

function buildPickFeaturesResource(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  degreesScratchComputed = false;
  projectedScratchComputed = false;
  ijScratchComputed = false;
  longitudeLatitudeProjectedScratchComputed = false;

  const resource = imageryProvider._pickFeaturesResource;
  const url = resource.getUrlComponent(true);
  const allTags = imageryProvider._pickFeaturesTags;
  const templateValues = {};
  const match = url.match(templateRegex);
  if (defined(match)) {
    match.forEach(function (tag) {
      const key = tag.substring(1, tag.length - 1); //strip {}
      if (defined(allTags[key])) {
        templateValues[key] = allTags[key](
          imageryProvider,
          x,
          y,
          level,
          longitude,
          latitude,
          format,
        );
      }
    });
  }

  return resource.getDerivedResource({
    templateValues: templateValues,
  });
}

function padWithZerosIfNecessary(imageryProvider, key, value) {
  // 【导读】urlSchemeZeroPadding（如 {x:"00"} 的服务）按配置把 x/y/z 左补零到固定位数。
  if (
    imageryProvider &&
    imageryProvider.urlSchemeZeroPadding &&
    imageryProvider.urlSchemeZeroPadding.hasOwnProperty(key)
  ) {
    const paddingTemplate = imageryProvider.urlSchemeZeroPadding[key];
    if (typeof paddingTemplate === "string") {
      const paddingTemplateWidth = paddingTemplate.length;
      if (paddingTemplateWidth > 1) {
        value =
          value.length >= paddingTemplateWidth
            ? value
            : new Array(
                paddingTemplateWidth - value.toString().length + 1,
              ).join("0") + value;
      }
    }
  }
  return value;
}

function xTag(imageryProvider, x, y, level) {
  return padWithZerosIfNecessary(imageryProvider, "{x}", x);
}

function reverseXTag(imageryProvider, x, y, level) {
  // 【导读】反向编号换算：X' = 本层瓦片列数 - x - 1；reverseY/reverseZ 同理，适配服务端行/列/层方向相反的源（部分国产瓦片服务常见）。
  const reverseX =
    imageryProvider.tilingScheme.getNumberOfXTilesAtLevel(level) - x - 1;
  return padWithZerosIfNecessary(imageryProvider, "{reverseX}", reverseX);
}

function yTag(imageryProvider, x, y, level) {
  return padWithZerosIfNecessary(imageryProvider, "{y}", y);
}

function reverseYTag(imageryProvider, x, y, level) {
  const reverseY =
    imageryProvider.tilingScheme.getNumberOfYTilesAtLevel(level) - y - 1;
  return padWithZerosIfNecessary(imageryProvider, "{reverseY}", reverseY);
}

function reverseZTag(imageryProvider, x, y, level) {
  const maximumLevel = imageryProvider.maximumLevel;
  const reverseZ =
    defined(maximumLevel) && level < maximumLevel
      ? maximumLevel - level - 1
      : level;
  return padWithZerosIfNecessary(imageryProvider, "{reverseZ}", reverseZ);
}

function zTag(imageryProvider, x, y, level) {
  return padWithZerosIfNecessary(imageryProvider, "{z}", level);
}

function sTag(imageryProvider, x, y, level) {
  // 【导读】子域名轮询：按 (x+y+level) 取模选一个子域名，把并发分摊到多个主机（绕开浏览器同域连接数限制）。
  const index = (x + y + level) % imageryProvider._subdomains.length;
  return imageryProvider._subdomains[index];
}

function computeDegrees(imageryProvider, x, y, level) {
  // 【导读】惰性求值（degreesScratchComputed 标志）：一次展开中多个 Degree 标签只算一次 tileXYToRectangle，缓存在模块级 scratch。
  if (degreesScratchComputed) {
    return;
  }

  imageryProvider.tilingScheme.tileXYToRectangle(x, y, level, degreesScratch);
  degreesScratch.west = CesiumMath.toDegrees(degreesScratch.west);
  degreesScratch.south = CesiumMath.toDegrees(degreesScratch.south);
  degreesScratch.east = CesiumMath.toDegrees(degreesScratch.east);
  degreesScratch.north = CesiumMath.toDegrees(degreesScratch.north);

  degreesScratchComputed = true;
}

function westDegreesTag(imageryProvider, x, y, level) {
  computeDegrees(imageryProvider, x, y, level);
  return degreesScratch.west;
}

function southDegreesTag(imageryProvider, x, y, level) {
  computeDegrees(imageryProvider, x, y, level);
  return degreesScratch.south;
}

function eastDegreesTag(imageryProvider, x, y, level) {
  computeDegrees(imageryProvider, x, y, level);
  return degreesScratch.east;
}

function northDegreesTag(imageryProvider, x, y, level) {
  computeDegrees(imageryProvider, x, y, level);
  return degreesScratch.north;
}

function computeProjected(imageryProvider, x, y, level) {
  if (projectedScratchComputed) {
    return;
  }

  imageryProvider.tilingScheme.tileXYToNativeRectangle(
    x,
    y,
    level,
    projectedScratch,
  );

  projectedScratchComputed = true;
}

function westProjectedTag(imageryProvider, x, y, level) {
  computeProjected(imageryProvider, x, y, level);
  return projectedScratch.west;
}

function southProjectedTag(imageryProvider, x, y, level) {
  computeProjected(imageryProvider, x, y, level);
  return projectedScratch.south;
}

function eastProjectedTag(imageryProvider, x, y, level) {
  computeProjected(imageryProvider, x, y, level);
  return projectedScratch.east;
}

function northProjectedTag(imageryProvider, x, y, level) {
  computeProjected(imageryProvider, x, y, level);
  return projectedScratch.north;
}

function widthTag(imageryProvider, x, y, level) {
  return imageryProvider.tileWidth;
}

function heightTag(imageryProvider, x, y, level) {
  return imageryProvider.tileHeight;
}

function iTag(imageryProvider, x, y, level, longitude, latitude, format) {
  computeIJ(imageryProvider, x, y, level, longitude, latitude);
  return ijScratch.x;
}

function jTag(imageryProvider, x, y, level, longitude, latitude, format) {
  computeIJ(imageryProvider, x, y, level, longitude, latitude);
  return ijScratch.y;
}

function reverseITag(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  computeIJ(imageryProvider, x, y, level, longitude, latitude);
  return imageryProvider.tileWidth - ijScratch.x - 1;
}

function reverseJTag(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  computeIJ(imageryProvider, x, y, level, longitude, latitude);
  return imageryProvider.tileHeight - ijScratch.y - 1;
}

const rectangleScratch = new Rectangle();
const longitudeLatitudeProjectedScratch = new Cartesian3();

function computeIJ(imageryProvider, x, y, level, longitude, latitude, format) {
  if (ijScratchComputed) {
    return;
  }

  computeLongitudeLatitudeProjected(
    imageryProvider,
    x,
    y,
    level,
    longitude,
    latitude,
  );
  const projected = longitudeLatitudeProjectedScratch;

  const rectangle = imageryProvider.tilingScheme.tileXYToNativeRectangle(
    x,
    y,
    level,
    rectangleScratch,
  );
  ijScratch.x =
    ((imageryProvider.tileWidth * (projected.x - rectangle.west)) /
      rectangle.width) |
    0;
  ijScratch.y =
    ((imageryProvider.tileHeight * (rectangle.north - projected.y)) /
      rectangle.height) |
    0;
  ijScratchComputed = true;
}

function longitudeDegreesTag(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  return CesiumMath.toDegrees(longitude);
}

function latitudeDegreesTag(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  return CesiumMath.toDegrees(latitude);
}

function longitudeProjectedTag(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  computeLongitudeLatitudeProjected(
    imageryProvider,
    x,
    y,
    level,
    longitude,
    latitude,
  );
  return longitudeLatitudeProjectedScratch.x;
}

function latitudeProjectedTag(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  computeLongitudeLatitudeProjected(
    imageryProvider,
    x,
    y,
    level,
    longitude,
    latitude,
  );
  return longitudeLatitudeProjectedScratch.y;
}

const cartographicScratch = new Cartographic();

function computeLongitudeLatitudeProjected(
  imageryProvider,
  x,
  y,
  level,
  longitude,
  latitude,
  format,
) {
  if (longitudeLatitudeProjectedScratchComputed) {
    return;
  }

  if (imageryProvider.tilingScheme.projection instanceof GeographicProjection) {
    longitudeLatitudeProjectedScratch.x = CesiumMath.toDegrees(longitude);
    longitudeLatitudeProjectedScratch.y = CesiumMath.toDegrees(latitude);
  } else {
    const cartographic = cartographicScratch;
    cartographic.longitude = longitude;
    cartographic.latitude = latitude;
    imageryProvider.tilingScheme.projection.project(
      cartographic,
      longitudeLatitudeProjectedScratch,
    );
  }

  longitudeLatitudeProjectedScratchComputed = true;
}

function formatTag(imageryProvider, x, y, level, longitude, latitude, format) {
  return format;
}
export default UrlTemplateImageryProvider;
