import json, os

PROJECT_ROOT = "/home/ubuntu/桌面/project/cesium"
OUT_DIR = os.path.join(PROJECT_ROOT, ".understand-anything", "intermediate")

with open(os.path.join(PROJECT_ROOT, ".understand-anything/tmp/ua-file-extract-results-4.json")) as f:
    results = json.load(f)
with open(os.path.join(PROJECT_ROOT, ".understand-anything/tmp/ua-file-analyzer-input-4.json")) as f:
    inp = json.load(f)

batchImportData = inp["batchImportData"]
# Map path -> extracted result
res_by_path = {r["path"]: r for r in results["results"]}

CORE = "packages/engine/Source/Core/"

# ---------- Manual file-level metadata (summary, tags, complexity, languageNotes) ----------
# Keys: path -> dict
file_meta = {
 f"{CORE}EllipsoidalOccluder.js": dict(
    summary="基于椭球体和相机位置实现地平线剔除（horizon culling），判定被遮挡对象是否位于可见地平线之后。",
    tags=["occlusion","horizon-culling","ellipsoid","geometry"],
    complexity="complex",
    languageNotes="采用 Cesium 博客所述的 horizon culling 算法，将点变换到缩放空间后比较模长。"),
 f"{CORE}FrustumGeometry.js": dict(
    summary="描述相机视锥体（frustum）的几何体，提供顶点位置、法线、切线及纹理坐标等属性计算。",
    tags=["geometry","frustum","primitive","webgl"],
    complexity="complex"),
 f"{CORE}FrustumOutlineGeometry.js": dict(
    summary="生成相机视锥体的线框轮廓几何体，用于调试与可视化视锥范围。",
    tags=["geometry","frustum","outline","debug"],
    complexity="moderate"),
 f"{CORE}GeographicProjection.js": dict(
    summary="简单的等距圆柱（Plate Carrée / EPSG:4326）地图投影，将经纬度线性映射到 X/Y 平面。",
    tags=["projection","geographic","mapping","coordinates"],
    complexity="simple"),
 f"{CORE}Geometry.js": dict(
    summary="核心 Geometry 数据结构，封装顶点属性、索引与图元类型，是所有可渲染几何体的基础容器。",
    tags=["data-model","geometry","primitive","core"],
    complexity="complex"),
 f"{CORE}GeometryAttribute.js": dict(
    summary="表示单个顶点属性（如 position、normal）的数据结构，绑定 componentDatatype 与 typed array。",
    tags=["data-model","geometry","vertex-attribute"],
    complexity="moderate"),
 f"{CORE}GeometryAttributes.js": dict(
    summary="顶点属性的命名集合容器，按名称（position、normal、st 等）聚合多个 GeometryAttribute。",
    tags=["data-model","geometry","container"],
    complexity="simple"),
 f"{CORE}GeometryOffsetAttribute.js": dict(
    summary="私有枚举，标记哪些顶点的 applyOffset 属性应为 true（NONE / TOP / ALL）。",
    tags=["enum","geometry","private"],
    complexity="simple"),
 f"{CORE}GeometryPipeline.js": dict(
    summary="几何体处理管线，提供索引化、属性压缩、顶点变换、几何体合并以及沿国际日期变更线（±180°）的三角形/线段拆分等大量操作。",
    tags=["geometry","pipeline","utility","serialization","webgl"],
    complexity="complex",
    languageNotes="最大的单文件之一，包含三角化、barycentric 插值、encode 顶点编码与 splitLongitude 等关键算法。"),
 f"{CORE}GeometryType.js": dict(
    summary="私有枚举，标识几何体图元类型（NONE / TRIANGLES / LINES / POLYLINES）。",
    tags=["enum","geometry","private"],
    complexity="simple"),
 f"{CORE}GoogleEarthEnterpriseTerrainData.js": dict(
    summary="解析 Google Earth Enterprise 服务返回的地形数据，提供高度插值与网格重构，供地形瓦片加载使用。",
    tags=["terrain","google-earth","data-model","heightmap"],
    complexity="complex"),
 f"{CORE}GroundPolylineGeometry.js": dict(
    summary="生成贴地（clamped-to-terrain）折线的几何体，考虑地形高度并对线段做细分、miter 法线与日期线拆分。",
    tags=["geometry","polyline","terrain","ground-clamp"],
    complexity="complex",
    languageNotes="包含大段细分逻辑与 projectNormal 投影，处理贴地几何的法线与高度调整。"),
 f"{CORE}HeadingPitchRoll.js": dict(
    summary="用航向（heading）、俯仰（pitch）、横滚（roll）三个欧拉角描述姿态的数据结构。",
    tags=["data-model","orientation","euler"],
    complexity="moderate"),
 f"{CORE}HeightmapTessellator.js": dict(
    summary="将高度图（heightmap）曲面化为三角形网格的细分器，用于地形瓦片的几何生成。",
    tags=["terrain","heightmap","tessellator","geometry"],
    complexity="complex"),
 f"{CORE}Iau2000Orientation.js": dict(
    summary="IAU/IAG 2000 报告中各天体的自转方向与旋转参数表，用于计算行星/卫星的姿态（私有命名空间）。",
    tags=["astronomy","iau","orientation","private"],
    complexity="moderate"),
 f"{CORE}IauOrientationAxes.js": dict(
    summary="根据 IAU 旋转参数构造天体的姿态轴（旋转矩阵/四元数），用于将 inertial 坐标转换到 body-fixed 坐标。",
    tags=["astronomy","iau","orientation","transform"],
    complexity="moderate"),
 f"{CORE}IauOrientationParameters.js": dict(
    summary="天体姿态参数的数据结构（赤经、赤纬、旋转角及角速度），由 IAU 模型在给定时刻计算得出（私有）。",
    tags=["astronomy","iau","data-model","private"],
    complexity="simple"),
 f"{CORE}IndexDatatype.js": dict(
    summary="WebGL 索引数据类型枚举（UNSIGNED_BYTE/SHORT/INT），并提供字节数与校验辅助函数。",
    tags=["enum","webgl","index","geometry"],
    complexity="moderate"),
 f"{CORE}Intersect.js": dict(
    summary="相交判定枚举，表示对象相对视锥体的位置（OUTSIDE / INTERSECTING / INSIDE）。",
    tags=["enum","intersection","frustum"],
    complexity="simple"),
 f"{CORE}IntersectionTests.js": dict(
    summary="射线、平面、三角形、椭球、AABB 等几何体之间的相交测试函数集合（命名空间）。",
    tags=["intersection","ray","collision","utility"],
    complexity="complex",
    languageNotes="包含 raySphere、rayPlane、solveQuadratic 等解析几何求解，依赖多项式求解器。"),
 f"{CORE}Intersections2D.js": dict(
    summary="二维三角形操作工具集，用于按轴对齐阈值拆分 2D 三角形并返回结果多边形索引。",
    tags=["intersection","2d","triangulation","utility"],
    complexity="moderate"),
 f"{CORE}Interval.js": dict(
    summary="闭区间 [start, stop] 的轻量数据结构。",
    tags=["data-model","interval","math"],
    complexity="simple"),
 f"{CORE}KeyboardEventModifier.js": dict(
    summary="键盘修饰键枚举（SHIFT / CTRL / ALT），用于屏幕交互事件处理。",
    tags=["enum","input","event","keyboard"],
    complexity="simple"),
 f"{CORE}Math.js": dict(
    summary="CesiumMath 核心数学库，提供常量、角度/弧度转换、插值、随机数（Mersenne Twister）及 EPSILON 容差比较等大量函数。",
    tags=["math","utility","core","constants"],
    complexity="complex",
    languageNotes="导出为 CesiumMath 命名空间对象，是整个引擎的基础数学工具库。"),
 f"{CORE}Occluder.js": dict(
    summary="基于包围球的遮挡判定，根据相机位置判断被遮挡对象是否位于遮挡体之后。",
    tags=["occlusion","bounding-sphere","visibility","geometry"],
    complexity="complex"),
 f"{CORE}OrientedBoundingBox.js": dict(
    summary="有向包围盒（OBB）实现，提供从矩形/平面/区域构造 OBB 以及与视锥、平面、包围球的相交测试。",
    tags=["bounding-volume","obb","geometry","intersection"],
    complexity="complex"),
 f"{CORE}OrthographicFrustum.js": dict(
    summary="正交投影视锥体，封装宽度并基于 OrthographicOffCenterFrustum 计算投影矩阵与剔除体。",
    tags=["frustum","camera","projection","orthographic"],
    complexity="moderate"),
 f"{CORE}OrthographicOffCenterFrustum.js": dict(
    summary="带边界（left/right/top/bottom）的正交投影视锥体，计算投影矩阵与剔除体。",
    tags=["frustum","camera","projection","orthographic"],
    complexity="moderate"),
 f"{CORE}PerspectiveFrustum.js": dict(
    summary="透视投影视锥体，基于 fov/aspectRatio 委托 PerspectiveOffCenterFrustum 计算投影矩阵与剔除体。",
    tags=["frustum","camera","projection","perspective"],
    complexity="moderate"),
 f"{CORE}PerspectiveOffCenterFrustum.js": dict(
    summary="带边界（left/right/top/bottom）的透视投影视锥体，计算投影矩阵与剔除体。",
    tags=["frustum","camera","projection","perspective"],
    complexity="moderate"),
 f"{CORE}Plane.js": dict(
    summary="Hessian normal 形式的平面（法线 + 距离），提供点到平面距离、投影与变换。",
    tags=["geometry","plane","math"],
    complexity="moderate"),
 f"{CORE}PlaneGeometry.js": dict(
    summary="在 XY 平面上生成矩形平面几何体，支持顶点格式（法线/切线/纹理坐标）配置。",
    tags=["geometry","primitive","plane","webgl"],
    complexity="moderate"),
 f"{CORE}PlaneOutlineGeometry.js": dict(
    summary="生成单位矩形平面的线框轮廓几何体。",
    tags=["geometry","outline","plane","debug"],
    complexity="simple"),
 f"{CORE}PolygonGeometry.js": dict(
    summary="多边形几何体生成器，支持内外环、拉伸、贴地高度与纹理坐标，是绘制多边形 primitive 的核心。",
    tags=["geometry","polygon","primitive","tessellation"],
    complexity="complex",
    languageNotes="包含三角化、extruded 体积、splitPolygon 与 bounding rectangle 等大量计算逻辑。"),
}

# ---------- Significant function/class sub-nodes ----------
# Only functions meeting significance filter (exported OR 10+ lines OR 2+ methods)
# Each entry: (path, kind, name, startLine, endLine, summary, tags, complexity)
SUB_NODES = [
 # EllipsoidalOccluder (constructor + helpers)
 (f"{CORE}EllipsoidalOccluder.js","function","EllipsoidalOccluder",31,45,
   "EllipsoidalOccluder 构造函数，根据椭球体与相机位置构建地平线剔除器。",["occlusion","constructor","horizon-culling"],"simple"),
 (f"{CORE}EllipsoidalOccluder.js","function","computeHorizonCullingPointFromPositions",362,398,
   "根据一组笛卡尔位置计算相对指定方向的地平线剔除点（缩放空间）。",["occlusion","horizon-culling","culling"],"moderate"),
 (f"{CORE}EllipsoidalOccluder.js","function","computeHorizonCullingPointFromVertices",402,446,
   "从顶点数组中计算地平线剔除点，支持 stride 与中心偏移。",["occlusion","horizon-culling","vertices"],"moderate"),
 (f"{CORE}EllipsoidalOccluder.js","function","isScaledSpacePointVisible",448,471,
   "判定缩放空间中的点相对相机是否位于地平线之后（不可见）。",["occlusion","visibility","horizon-culling"],"moderate"),
 (f"{CORE}EllipsoidalOccluder.js","function","computeMagnitude",476,501,
   "计算位置向量在缩放方向上的模长，用于地平线剔除比较。",["occlusion","math","horizon-culling"],"moderate"),
 (f"{CORE}EllipsoidalOccluder.js","function","magnitudeToPoint",503,523,
   "将模长反向还原为地平线上的点。",["occlusion","math","horizon-culling"],"simple"),
 # FrustumGeometry
 (f"{CORE}FrustumGeometry.js","function","FrustumGeometry",33,79,
   "FrustumGeometry 构造函数，基于视锥体的近远平面与方向定义几何体。",["geometry","frustum","constructor"],"moderate"),
 (f"{CORE}FrustumGeometry.js","function","getAttributes",200,239,
   "填充视锥体顶点的法线/切线/bitangent/纹理坐标属性。",["geometry","vertex-attribute","frustum"],"moderate"),
 # FrustumOutlineGeometry
 (f"{CORE}FrustumOutlineGeometry.js","function","FrustumOutlineGeometry",29,69,
   "FrustumOutlineGeometry 构造函数，基于 FrustumGeometry 生成轮廓几何体。",["geometry","outline","frustum","constructor"],"moderate"),
 # GeographicProjection
 (f"{CORE}GeographicProjection.js","class","GeographicProjection",21,103,
   "GeographicProjection 类，提供 project/unproject 将经纬度与平面坐标互转。",
   ["projection","class","geographic","mapping"],"simple"),
 # Geometry
 (f"{CORE}Geometry.js","function","Geometry",67,165,
   "Geometry 构造函数，封装 attributes、indices、primitiveType 与 boundingSphere。",
   ["data-model","geometry","constructor","core"],"complex"),
 # GeometryAttribute
 (f"{CORE}GeometryAttribute.js","function","GeometryAttribute",40,132,
   "GeometryAttribute 构造函数，描述单个顶点属性的 datatype、分量数与数据缓冲。",
   ["data-model","geometry","vertex-attribute","constructor"],"moderate"),
 # GeometryAttributes
 (f"{CORE}GeometryAttributes.js","function","GeometryAttributes",13,87,
   "GeometryAttributes 容器构造函数，按名称存取多个 GeometryAttribute。",
   ["data-model","geometry","container","constructor"],"moderate"),
 # GeometryPipeline - significant exported functions
 (f"{CORE}GeometryPipeline.js","function","combineGeometries",939,1069,
   "合并多个 GeometryInstance 的几何体与属性（用于批渲染）。",["pipeline","geometry","batching"],"complex"),
 (f"{CORE}GeometryPipeline.js","function","indexTriangles",1630,1657,
   "将三角形列表几何体索引化以减少顶点重复。",["pipeline","geometry","indexing"],"moderate"),
 (f"{CORE}GeometryPipeline.js","function","splitTriangle",1899,2001,
   "使用 barycentric 坐标拆分单个三角形以处理跨日期线的情况。",["pipeline","geometry","triangulation","barycentric"],"complex"),
 (f"{CORE}GeometryPipeline.js","function","computeTriangleAttributes",2168,2313,
   "通过 barycentric 插值计算拆分后新顶点的所有属性。",["pipeline","geometry","interpolation","attributes"],"complex"),
 (f"{CORE}GeometryPipeline.js","function","splitLongitudeTriangles",2411,2623,
   "沿国际日期变更线（±180°）拆分三角形几何体，避免跨日期线渲染伪影。",
   ["pipeline","geometry","dateline","splitting"],"complex"),
 (f"{CORE}GeometryPipeline.js","function","splitLongitudeLines",2651,2865,
   "沿国际日期变更线拆分线段几何体。",["pipeline","geometry","dateline","splitting"],"complex"),
 (f"{CORE}GeometryPipeline.js","function","splitLongitudePolyline",2933,3232,
   "沿国际日期变更线拆分折线，处理邻接信息以保持连续性。",
   ["pipeline","geometry","polyline","dateline"],"complex"),
 (f"{CORE}GeometryPipeline.js","function","triangleStripToLines",59,82,
   "将 TRIANGLE_STRIP 图元转换为线段索引列表。",["pipeline","geometry","primitives"],"moderate"),
 (f"{CORE}GeometryPipeline.js","function","findAttributesInAllGeometries",884,935,
   "收集所有待合并几何体共有的属性名集合。",["pipeline","geometry","attributes"],"moderate"),
 # GoogleEarthEnterpriseTerrainData
 (f"{CORE}GoogleEarthEnterpriseTerrainData.js","function","GoogleEarthEnterpriseTerrainData",57,93,
   "GoogleEarthEnterpriseTerrainData 构造函数，封装地形网格与高度缓冲。",
   ["terrain","data-model","google-earth","constructor"],"moderate"),
 (f"{CORE}GoogleEarthEnterpriseTerrainData.js","function","interpolateMeshHeight",436,488,
   "在已曲面化的地形网格上通过双线性插值估算给定 UV 处的高度。",
   ["terrain","interpolation","heightmap"],"moderate"),
 (f"{CORE}GoogleEarthEnterpriseTerrainData.js","function","interpolateHeight",496,605,
   "根据地形表示方式（mesh / heightmap）计算指定 UV 的高度。",
   ["terrain","interpolation","heightmap"],"complex"),
 # GroundPolylineGeometry
 (f"{CORE}GroundPolylineGeometry.js","function","GroundPolylineGeometry",74,132,
   "GroundPolylineGeometry 构造函数，根据位置列表与高度配置贴地折线。",
   ["geometry","polyline","ground-clamp","constructor"],"moderate"),
 (f"{CORE}GroundPolylineGeometry.js","function","interpolateSegment",201,272,
   "按 arcType 对折线段进行测地线/等角航线细分，输出底部/顶部位置与法线。",
   ["polyline","interpolation","geodesic","rhumb"],"complex"),
 (f"{CORE}GroundPolylineGeometry.js","function","computeVertexMiterNormal",396,438,
   "基于前后顶点计算折线顶点的 miter 法线，保证拐角处宽度连续。",
   ["polyline","miter","normal","geometry"],"moderate"),
 (f"{CORE}GroundPolylineGeometry.js","function","projectNormal",835,891,
   "将折线法线在投影坐标系下计算并定位，生成 Vec4 几何属性。",
   ["polyline","projection","normal"],"complex"),
 (f"{CORE}GroundPolylineGeometry.js","function","generateGeometryAttributes",1056,1635,
   "汇总细分结果生成贴地折线的完整顶点属性、索引与包围球。",
   ["polyline","geometry","attributes","tessellation"],"complex"),
 # HeadingPitchRoll
 (f"{CORE}HeadingPitchRoll.js","function","HeadingPitchRoll",16,35,
   "HeadingPitchRoll 构造函数，封装三个欧拉角。",["data-model","orientation","constructor"],"simple"),
 # IauOrientationAxes
 (f"{CORE}IauOrientationAxes.js","function","IauOrientationAxes",21,27,
   "IauOrientationAxes 构造函数，接收用于计算天体姿态参数的回调。",
   ["astronomy","iau","orientation","constructor"],"simple"),
 (f"{CORE}IauOrientationAxes.js","function","computeRotationMatrix",33,63,
   "根据赤经/赤纬/旋转角计算天体的 body-fixed 旋转矩阵。",
   ["astronomy","iau","rotation","matrix"],"moderate"),
 # IauOrientationParameters
 (f"{CORE}IauOrientationParameters.js","function","IauOrientationParameters",13,53,
   "IauOrientationParameters 构造函数，保存赤经/赤纬/旋转角/角速度。",["astronomy","iau","data-model","constructor"],"moderate"),
 # IntersectionTests
 (f"{CORE}IntersectionTests.js","function","solveQuadratic",278,306,
   "带数值消减的一元二次方程求解，返回交点区间。",["intersection","math","polynomial"],"moderate"),
 (f"{CORE}IntersectionTests.js","function","raySphere",313,338,
   "计算射线与球体（椭球）的交点区间。",["intersection","ray","sphere"],"moderate"),
 (f"{CORE}IntersectionTests.js","function","addWithCancellationCheck",578,588,
   "带容差消减的浮点加法，避免大数吃小数导致的精度丢失。",["math","epsilon","cancellation"],"simple"),
 # Occluder
 (f"{CORE}Occluder.js","function","Occluder",28,48,
   "Occluder 构造函数，基于包围球与相机位置建立遮挡体。",["occlusion","constructor","bounding-sphere"],"simple"),
 # OrientedBoundingBox
 (f"{CORE}OrientedBoundingBox.js","function","OrientedBoundingBox",40,55,
   "OrientedBoundingBox 构造函数，由中心与半轴矩阵定义。",["bounding-volume","obb","constructor"],"simple"),
 (f"{CORE}OrientedBoundingBox.js","function","fromPlaneExtents",244,297,
   "由平面原点、轴向与各轴范围构造有向包围盒。",["bounding-volume","obb","factory"],"complex"),
 # OrthographicFrustum
 (f"{CORE}OrthographicFrustum.js","function","OrthographicFrustum",30,66,
   "OrthographicFrustum 构造函数，定义正交投影宽度等参数。",["frustum","orthographic","constructor"],"moderate"),
 (f"{CORE}OrthographicFrustum.js","function","update",126,172,
   "根据宽度/纵横比刷新正交视锥的投影矩阵与剔除体。",["frustum","orthographic","projection"],"moderate"),
 # OrthographicOffCenterFrustum
 (f"{CORE}OrthographicOffCenterFrustum.js","function","OrthographicOffCenterFrustum",38,91,
   "带边界的正交视锥构造函数。",["frustum","orthographic","constructor"],"moderate"),
 (f"{CORE}OrthographicOffCenterFrustum.js","function","update",93,147,
   "刷新带边界正交视锥的投影矩阵与剔除体。",["frustum","orthographic","projection"],"moderate"),
 # PerspectiveFrustum
 (f"{CORE}PerspectiveFrustum.js","function","PerspectiveFrustum",35,92,
   "PerspectiveFrustum 构造函数，定义 fov/aspectRatio/near/far。",["frustum","perspective","constructor"],"moderate"),
 (f"{CORE}PerspectiveFrustum.js","function","update",156,223,
   "根据 fov/纵横比刷新透视视锥的投影矩阵与剔除体。",["frustum","perspective","projection"],"moderate"),
 # PerspectiveOffCenterFrustum
 (f"{CORE}PerspectiveOffCenterFrustum.js","function","PerspectiveOffCenterFrustum",39,93,
   "带边界的透视视锥构造函数。",["frustum","perspective","constructor"],"moderate"),
 (f"{CORE}PerspectiveOffCenterFrustum.js","function","update",95,155,
   "刷新带边界透视视锥的投影矩阵与剔除体。",["frustum","perspective","projection"],"moderate"),
 # Plane
 (f"{CORE}Plane.js","function","Plane",34,66,
   "Plane 构造函数，由法线与距离（Hessian normal 形式）定义平面。",["geometry","plane","constructor"],"moderate"),
 # PlaneGeometry
 (f"{CORE}PlaneGeometry.js","function","PlaneGeometry",27,34,
   "PlaneGeometry 构造函数，创建单位矩形平面几何体。",["geometry","plane","constructor"],"simple"),
 # PolygonGeometry - several significant functions
 (f"{CORE}PolygonGeometry.js","function","computeAttributes",62,424,
   "根据三角化结果与顶点格式计算多边形的法线/切线/纹理坐标等顶点属性。",
   ["polygon","geometry","attributes"],"complex"),
 (f"{CORE}PolygonGeometry.js","function","createGeometryFromPositionsExtruded",428,574,
   "为拉伸（extruded）多边形生成侧壁、顶底面几何体。",["polygon","extruded","geometry"],"complex"),
 (f"{CORE}PolygonGeometry.js","function","PolygonGeometry",668,748,
   "PolygonGeometry 构造函数，封装内外环、拉伸高度与纹理坐标配置。",
   ["polygon","geometry","constructor"],"complex"),
 (f"{CORE}PolygonGeometry.js","function","expandRectangle",961,1026,
   "扩展多边形覆盖的地理矩形，处理极点与 arcType 分支。",["polygon","rectangle","bounding"],"complex"),
 (f"{CORE}PolygonGeometry.js","function","createProjectTo2d",1161,1196,
   "创建将多边形位置投影到 2D 切平面坐标系的函数。",["polygon","projection","2d"],"moderate"),
]

# ---------- Build nodes ----------
nodes = []
file_node_ids = set()

# File nodes
for path, r in res_by_path.items():
    meta = file_meta.get(path, dict(summary="", tags=["core"], complexity="simple"))
    name = os.path.basename(path)
    node = {
        "id": f"file:{path}",
        "type": "file",
        "name": name,
        "filePath": path,
        "summary": meta["summary"] or f"{name} 文件。",
        "tags": meta["tags"],
        "complexity": meta["complexity"],
    }
    if "languageNotes" in meta:
        node["languageNotes"] = meta["languageNotes"]
    nodes.append(node)
    file_node_ids.add(f"file:{path}")

# Sub-file nodes
sub_node_ids = set()
for (path, kind, name, sl, el, summary, tags, complexity) in SUB_NODES:
    if kind == "function":
        nid = f"function:{path}:{name}"
        nodes.append({
            "id": nid, "type":"function", "name": name,
            "filePath": path, "lineRange":[sl,el],
            "summary": summary, "tags": tags, "complexity": complexity
        })
    else:
        nid = f"class:{path}:{name}"
        nodes.append({
            "id": nid, "type":"class", "name": name,
            "filePath": path, "lineRange":[sl,el],
            "summary": summary, "tags": tags, "complexity": complexity
        })
    sub_node_ids.add(nid)

# ---------- Build edges ----------
edges = []

# imports: 1:1 from batchImportData
for path, imports in batchImportData.items():
    src = f"file:{path}"
    for tgt_path in imports:
        edges.append({
            "source": src, "target": f"file:{tgt_path}",
            "type": "imports", "direction": "forward", "weight": 0.7
        })

# contains + exports for each sub node (sub node always contained)
SUB_BY_PATH = {}
for (path, kind, name, sl, el, summary, tags, complexity) in SUB_NODES:
    SUB_BY_PATH.setdefault(path, []).append((kind, name))

for path, subs in SUB_BY_PATH.items():
    src = f"file:{path}"
    for (kind, name) in subs:
        nid = f"{kind}:{path}:{name}"
        edges.append({"source": src, "target": nid, "type":"contains","direction":"forward","weight":1.0})
        # exported constructors/classes from default/named export typically -> exports edge
        # In CesiumJS these constructors are the module's default export.
        edges.append({"source": src, "target": nid, "type":"exports","direction":"forward","weight":0.8})

# A few high-confidence cross-batch calls (intra-batch + neighborMap-confirmed):
# FrustumOutlineGeometry uses FrustumGeometry.createGeometry (intra-batch)
intra_calls = [
    ("file:packages/engine/Source/Core/FrustumOutlineGeometry.js",
     "function:packages/engine/Source/Core/FrustumGeometry.js:FrustumGeometry", "calls", 0.8),
    ("file:packages/engine/Source/Core/HeightmapTessellator.js",
     "function:packages/engine/Source/Core/EllipsoidalOccluder.js:EllipsoidalOccluder", "calls", 0.8),
    ("file:packages/engine/Source/Core/GeometryPipeline.js",
     "function:packages/engine/Source/Core/Geometry.js:Geometry", "calls", 0.8),
    ("file:packages/engine/Source/Core/PolygonGeometry.js",
     "function:packages/engine/Source/Core/GeometryPipeline.js:splitLongitudeTriangles", "calls", 0.8),
    ("file:packages/engine/Source/Core/GoogleEarthEnterpriseTerrainData.js",
     "function:packages/engine/Source/Core/Intersections2D.js:Intersections2D", "related", 0.5),
]
for s, t, ty, w in intra_calls:
    edges.append({"source": s, "target": t, "type": ty, "direction":"forward", "weight": w})

# OrthographicFrustum extends/wraps OrthographicOffCenterFrustum; PerspectiveFrustum wraps PerspectiveOffCenterFrustum
wrap_edges = [
    ("file:packages/engine/Source/Core/OrthographicFrustum.js",
     "function:packages/engine/Source/Core/OrthographicOffCenterFrustum.js:OrthographicOffCenterFrustum", "depends_on", 0.6),
    ("file:packages/engine/Source/Core/PerspectiveFrustum.js",
     "function:packages/engine/Source/Core/PerspectiveOffCenterFrustum.js:PerspectiveOffCenterFrustum", "depends_on", 0.6),
    ("file:packages/engine/Source/Core/IauOrientationAxes.js",
     "function:packages/engine/Source/Core/IauOrientationParameters.js:IauOrientationParameters", "depends_on", 0.6),
]
for s, t, ty, w in wrap_edges:
    edges.append({"source": s, "target": t, "type": ty, "direction":"forward", "weight": w})

# Remove any self-referencing edges just in case
edges = [e for e in edges if e["source"] != e["target"]]

# ---------- Stats & splitting ----------
nodeCount = len(nodes)
edgeCount = len(edges)
print(f"nodeCount={nodeCount} edgeCount={edgeCount}")

import math
parts = 1
if nodeCount > 60 or edgeCount > 120:
    parts = math.ceil(max(nodeCount/60, edgeCount/120))
print(f"parts={parts}")

# Partition by file path alphabetically
all_paths = sorted(res_by_path.keys())
chunk_size = math.ceil(len(all_paths)/parts)
path_chunks = [set(all_paths[i:i+chunk_size]) for i in range(0, len(all_paths), chunk_size)]

def part_for(path):
    for idx, c in enumerate(path_chunks):
        if path in c:
            return idx
    return 0

# Write parts
written = []
for pi in range(parts):
    pn = []
    pe = []
    for n in nodes:
        fp = n.get("filePath")
        if fp and part_for(fp) == pi:
            pn.append(n)
    # edges whose source belongs to this part
    part_paths = path_chunks[pi]
    for e in edges:
        src = e["source"]
        # source file path
        # extract path after 'file:' / 'function:' prefix
        if src.startswith("file:"):
            sp = src[5:]
        elif src.startswith("function:") or src.startswith("class:"):
            sp = src.split(":",2)[1]
        else:
            continue
        if sp in part_paths:
            pe.append(e)
    fname = f"batch-4.json" if parts == 1 else f"batch-4-part-{pi+1}.json"
    out_path = os.path.join(OUT_DIR, fname)
    with open(out_path, "w") as f:
        json.dump({"nodes": pn, "edges": pe}, f, ensure_ascii=False, indent=1)
    written.append((out_path, len(pn), len(pe)))
    print(f"WROTE {out_path}: {len(pn)} nodes, {len(pe)} edges")

# verify total
tot_n = sum(w[1] for w in written)
tot_e = sum(w[2] for w in written)
print(f"TOTAL across parts: {tot_n} nodes, {tot_e} edges")

# self-check imports count
imp_total = sum(1 for e in edges if e["type"]=="imports")
print(f"imports edges total: {imp_total} (expected 284)")
