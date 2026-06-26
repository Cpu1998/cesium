#!/usr/bin/env python3
"""Build batch-7 knowledge graph: 4 parts (alphabetical file partition)."""
import json
from collections import defaultdict

ROOT = "/home/ubuntu/桌面/project/cesium"

with open(f"{ROOT}/.understand-anything/tmp/ua-file-extract-results-7.json") as f:
    RESULTS = {r["path"]: r for r in json.load(f)["results"]}
with open(f"{ROOT}/.understand-anything/tmp/ua-file-analyzer-input-7.json") as f:
    INP = json.load(f)
IMP = INP["batchImportData"]

CORE = "packages/engine/Source/Core"

# ---------- file-level metadata (Chinese summaries) ----------
FILE_META = {
f"{CORE}/PolygonGeometryLibrary.js": ("PolygonGeometryLibrary.js",
    "为多边形几何（含挤出与孔洞）提供三角化、边界与底面计算的库函数集合，被 PolygonGeometry / PolygonOutlineGeometry 等复用。",
    ["geometry", "polygon", "triangulation", "utility"], "complex"),
f"{CORE}/PolygonOutlineGeometry.js": ("PolygonOutlineGeometry.js",
    "描述多边形（支持挤出与孔洞）轮廓线的几何体描述符，按位置生成线段顶点并暴露 fromOptions 工厂方法。",
    ["geometry", "polygon", "outline", "data-model"], "complex"),
f"{CORE}/PolygonPipeline.js": ("PolygonPipeline.js",
    "多边形处理管线：将带孔洞的多边形层次结构三角化为 WebGL 可渲染的三角形与边界，是各类多边形几何的核心算法层。",
    ["geometry", "polygon", "triangulation", "pipeline"], "complex"),
f"{CORE}/PolylineGeometry.js": ("PolylineGeometry.js",
    "折线几何体描述符：基于大地弧或恒向线生成带每顶点颜色的折线顶点缓冲，并计算包围球。",
    ["geometry", "polyline", "data-model", "arc"], "complex"),
f"{CORE}/PolylinePipeline.js": ("PolylinePipeline.js",
    "折线处理管线：沿测地线或恒向线对折线点进行细分采样，输出 Cartesian3 顶点序列，被折线几何与墙体库复用。",
    ["geometry", "polyline", "subdivision", "pipeline"], "complex"),
f"{CORE}/PolylineVolumeGeometry.js": ("PolylineVolumeGeometry.js",
    "沿路径扫掠二维形状生成的体积（管状）几何体描述符，调用 PolylineVolumeGeometryLibrary 计算拐角与属性。",
    ["geometry", "polyline-volume", "sweep", "data-model"], "complex"),
f"{CORE}/PolylineVolumeGeometryLibrary.js": ("PolylineVolumeGeometryLibrary.js",
    "为折线体积扫掠提供形状旋转、拐角圆滑（round/miter/bevel）与位置加成等几何算法的库函数集合。",
    ["geometry", "polyline-volume", "corner", "utility"], "complex"),
f"{CORE}/PolylineVolumeOutlineGeometry.js": ("PolylineVolumeOutlineGeometry.js",
    "折线体积轮廓线几何体描述符：仅生成体积的外壳线段，复用 PolylineVolumeGeometryLibrary 的形状扫掠结果。",
    ["geometry", "polyline-volume", "outline", "data-model"], "moderate"),
f"{CORE}/PrimitiveType.js": ("PrimitiveType.js",
    "枚举 WebGL 图元装配类型（POINTS/TRIANGLES/LINES 等），基于 WebGLConstants 暴露为冻结对象，被渲染与几何管线广泛引用。",
    ["enumeration", "webgl", "primitive", "constants"], "simple"),
f"{CORE}/QuantizedMeshTerrainData.js": ("QuantizedMeshTerrainData.js",
    "量化网格（quantized-mesh）地形数据实现：解码地形瓦片，提供高度插值、上采样与射线相交，用于 Cesium 与 quantized-mesh 服务。",
    ["terrain", "quantized-mesh", "data-model", "heightmap"], "complex"),
f"{CORE}/Queue.js": ("Queue.js",
    "轻量 FIFO 队列数据结构，提供 enqueue/dequeue/peek 与 length，被地形填充网格等场景用作工作队列。",
    ["data-structure", "queue", "utility", "collection"], "simple"),
f"{CORE}/Ray.js": ("Ray.js",
    "射线原点与方向表示，提供 getPoint 沿射线取点与 clone，是 IntersectionTests / 相机拾取的基础类型。",
    ["math", "ray", "intersection", "data-model"], "simple"),
f"{CORE}/RectangleGeometry.js": ("RectangleGeometry.js",
    "地理矩形几何体描述符：在椭球面或挤出体积上生成带纹理坐标的网格，支持墙与旋转纹理，体积庞大（约 1480 行）。",
    ["geometry", "rectangle", "data-model", "extrude"], "complex"),
f"{CORE}/RectangleGeometryLibrary.js": ("RectangleGeometryLibrary.js",
    "为矩形几何计算旋转矩阵、墙高度选项与地理投影变换的辅助库，被 RectangleGeometry / 其轮廓几何复用。",
    ["geometry", "rectangle", "utility", "rotation"], "moderate"),
f"{CORE}/RectangleOutlineGeometry.js": ("RectangleOutlineGeometry.js",
    "地理矩形轮廓线几何体描述符：仅生成矩形（含挤出）的边线段顶点，复用 RectangleGeometryLibrary 的旋转选项。",
    ["geometry", "rectangle", "outline", "data-model"], "complex"),
f"{CORE}/S2Cell.js": ("S2Cell.js",
    "Google S2 几何单元：在球面 Hilbert 曲线上进行 cell id 与面/UV/XYZ 坐标互转，支撑 3D Tiles 的 S2 bounding volume。",
    ["s2", "hilbert-curve", "spatial-index", "3d-tiles"], "complex"),
f"{CORE}/ScreenSpaceEventHandler.js": ("ScreenSpaceEventHandler.js",
    "屏幕空间事件分发器：将鼠标/触摸/指针/滚轮原始事件归一化为带修饰键的 ScreenSpaceEventType，并按 InputAction 触发回调。",
    ["input", "event-handler", "mouse", "touch"], "complex"),
f"{CORE}/ScreenSpaceEventType.js": ("ScreenSpaceEventType.js",
    "屏幕空间事件类型枚举（LEFT_DOWN/RIGHT_CLICK/MOUSE_MOVE 等），作为 ScreenSpaceEventHandler 的回调 key。",
    ["enumeration", "input", "event", "constants"], "simple"),
f"{CORE}/Simon1994PlanetaryPositions.js": ("Simon1994PlanetaryPositions.js",
    "依据 Simon 1994 历表计算日、月及行星质心在惯性系下的笛卡尔位置，供 Sun/Moon 与 UniformState 的光照方向使用。",
    ["astronomy", "ephemeris", "moon", "sun"], "complex"),
f"{CORE}/SimplePolylineGeometry.js": ("SimplePolylineGeometry.js",
    "简化版折线几何体描述符：按每顶点颜色生成 LINES 图元，不做材质包裹，常用于调试或简单可视化。",
    ["geometry", "polyline", "simple", "data-model"], "moderate"),
f"{CORE}/SphereGeometry.js": ("SphereGeometry.js",
    "球体几何体描述符：通过对 EllipsoidGeometry 取等长短轴的薄壳封装，便于直接生成规则球面。",
    ["geometry", "sphere", "ellipsoid", "data-model"], "simple"),
f"{CORE}/Stereographic.js": ("Stereographic.js",
    "极射赤面投影坐标，记录投影中心与缩放，用于平面贴图与 EllipsoidTangentPlane 的二维映射。",
    ["projection", "stereographic", "math", "data-model"], "moderate"),
f"{CORE}/TerrainData.js": ("TerrainData.js",
    "地形数据抽象基类：定义 upsample/interpolateHeight/createMesh 等接口，由 QuantizedMeshTerrainData 等具体实现继承。",
    ["terrain", "abstract", "interface", "data-model"], "simple"),
f"{CORE}/TerrainEncoding.js": ("TerrainEncoding.js",
    "地形顶点编码/解码器：处理量化或非量化地形顶点的位置/高度/纹理坐标的 GPU 上传与夸张度偏移，被地形网格与 worker 复用。",
    ["terrain", "encoding", "quantization", "gpu"], "complex"),
f"{CORE}/TerrainMesh.js": ("TerrainMesh.js",
    "地形网格表示：持有顶点/索引/包围盒及到世界/2D 的变换矩阵，并提供射线相交与高度采样，是 Globe 渲染的核心数据载体。",
    ["terrain", "mesh", "rendering", "data-model"], "complex"),
f"{CORE}/TerrainPicker.js": ("TerrainPicker.js",
    "地形拾取器：基于 BVH（AABB 节点树）对地形网格做射线-三角形相交，返回最近交点高度，支撑 Globe/3D Tiles 拾取。",
    ["terrain", "picking", "bvh", "ray-cast"], "complex"),
f"{CORE}/TileEdge.js": ("TileEdge.js",
    "地形瓦片四边（东/南/西/北）的枚举常量，用于相邻瓦片边缘匹配与 TerrainFillMesh 的几何缝合。",
    ["enumeration", "terrain", "tile", "constants"], "simple"),
f"{CORE}/TimeConstants.js": ("TimeConstants.js",
    "时间相关常量：秒/毫秒/天等换算因子及 DayOfWeek 枚举，被 JulianDate 与动画系统引用。",
    ["constants", "time", "enumeration"], "simple"),
f"{CORE}/Transforms.js": ("Transforms.js",
    "坐标变换工具集：在固定系/ECEF/东-北-上/东北天框架间生成 4x4 矩阵与四元数，并支持 IAU 地球指向与 ICRF 变换，是全引擎最核心的变换入口。",
    ["transform", "matrix", "enu", "quaternion"], "complex"),
f"{CORE}/VertexFormat.js": ("VertexFormat.js",
    "顶点格式描述符：声明几何体需要哪些属性（位置/法线/ST/切线/颜色），驱动各 Geometry 的属性计算与着色器绑定。",
    ["geometry", "vertex-format", "attributes", "data-model"], "moderate"),
f"{CORE}/VerticalExaggeration.js": ("VerticalExaggeration.js",
    "垂直夸张度工具：按高度对位置/高度做非线性缩放，用于在低坡度地形上突出表现高程，被 TerrainEncoding 与拾取引用。",
    ["terrain", "exaggeration", "utility", "height"], "simple"),
f"{CORE}/Visibility.js": ("Visibility.js",
    "可见性枚举（NONE/PARTIAL/FULL），供 Occluder 与 QuadtreePrimitive 做遮挡剔除判定。",
    ["enumeration", "culling", "visibility", "constants"], "simple"),
f"{CORE}/VulkanConstants.js": ("VulkanConstants.js",
    "Vulkan / KTX 纹理编解码相关常量（格式、压缩模式），被 KTX2 转码 worker 用于跨平台纹理压缩选择。",
    ["constants", "vulkan", "ktx2", "texture"], "moderate"),
f"{CORE}/WallGeometry.js": ("WallGeometry.js",
    "墙体几何体描述符：沿一组折线在椭球面与给定高度间生成垂直墙面板，复用 WallGeometryLibrary 计算拐角与顶点。",
    ["geometry", "wall", "data-model", "extrude"], "complex"),
}

assert len(FILE_META) == 34, f"expected 34, got {len(FILE_META)}"

# ---------- function-level metadata (Chinese summaries) ----------
# Only functions with >=10 lines OR named constructors / significant entries.
# Keys: (filePath, fnName) -> (summary, tags, complexity)
FN_META = {
# PolygonGeometryLibrary
(f"{CORE}/PolygonGeometryLibrary.js","getPointAtDistance2D"):
    ("沿 2D 直线按给定距离返回插值点（Cartesian3 投影）。", ["geometry","interpolation","utility"], "simple"),
(f"{CORE}/PolygonGeometryLibrary.js","getPointAtDistance"):
    ("沿 3D 测地线/恒向线按弧长返回插值点。", ["geometry","interpolation","geodesic"], "simple"),
(f"{CORE}/PolygonGeometryLibrary.js","computeEquatorIntersectionRhumb"):
    ("沿恒向线计算与赤道的交点，用于跨赤道多边形裁剪。", ["geometry","rhumb","intersection"], "moderate"),
(f"{CORE}/PolygonGeometryLibrary.js","computeEquatorIntersection"):
    ("计算多边形边与赤道的交点并去重，处理跨赤道场景。", ["geometry","equator","intersection"], "moderate"),
(f"{CORE}/PolygonGeometryLibrary.js","computeEdgesOnPlane"):
    ("将多边形各边投影到指定平面并输出边线段集合，供后续三角化使用。", ["geometry","edges","projection"], "moderate"),
(f"{CORE}/PolygonGeometryLibrary.js","wirePolygon"):
    ("为多边形（含孔洞与挤出）生成线框几何体，是 PolygonOutlineGeometry 的核心算法。", ["geometry","wireframe","polygon","algorithm"], "complex"),
# PolygonOutlineGeometry
(f"{CORE}/PolygonOutlineGeometry.js","createGeometryFromPositions"):
    ("从平面多边形位置生成轮廓线几何体（底面与可选顶面、墙边）。", ["geometry","outline","factory"], "complex"),
(f"{CORE}/PolygonOutlineGeometry.js","createGeometryFromPositionsExtruded"):
    ("为挤出多边形生成完整的顶/底/侧轮廓线几何体。", ["geometry","outline","extrude"], "complex"),
(f"{CORE}/PolygonOutlineGeometry.js","PolygonOutlineGeometry"):
    ("PolygonOutlineGeometry 构造器：缓存选项并初始化内部几何状态。", ["geometry","constructor","data-model"], "moderate"),
# PolylineGeometry
(f"{CORE}/PolylineGeometry.js","interpolateColors"):
    ("在折线两端颜色间按顶点数线性插值，生成逐顶点颜色数组。", ["color","interpolation","polyline"], "moderate"),
(f"{CORE}/PolylineGeometry.js","PolylineGeometry"):
    ("PolylineGeometry 构造器：解析弧类型、细分并封装逐顶点颜色。", ["geometry","constructor","data-model"], "moderate"),
# PolylinePipeline
(f"{CORE}/PolylinePipeline.js","subdivideHeights"):
    ("按段数对高度数组进行线性插值，输出细分后的高度序列。", ["polyline","subdivision","interpolation"], "simple"),
(f"{CORE}/PolylinePipeline.js","generateCartesianArc"):
    ("沿测地线/恒向线细分折线点并返回 Cartesian3 顶点数组。", ["polyline","geodesic","subdivision"], "moderate"),
(f"{CORE}/PolylinePipeline.js","generateCartesianRhumbArc"):
    ("沿恒向线细分折线点并返回 Cartesian3 顶点数组。", ["polyline","rhumb","subdivision"], "moderate"),
# PolylineVolumeGeometry
(f"{CORE}/PolylineVolumeGeometry.js","computeAttributes"):
    ("为折线体积几何计算位置、法线、ST 与逐位置颜色等顶点属性。", ["geometry","attributes","polyline-volume"], "complex"),
(f"{CORE}/PolylineVolumeGeometry.js","PolylineVolumeGeometry"):
    ("PolylineVolumeGeometry 构造器：扫掠二维形状沿路径生成体积网格。", ["geometry","constructor","data-model"], "moderate"),
# PolylineVolumeGeometryLibrary
(f"{CORE}/PolylineVolumeGeometryLibrary.js","scaleToSurface"):
    ("将形状坐标点缩放并投影到椭球面上。", ["polyline-volume","projection","utility"], "simple"),
(f"{CORE}/PolylineVolumeGeometryLibrary.js","subdivideHeights"):
    ("按高度对形状点做线性细分，生成平滑的高度采样。", ["polyline-volume","subdivision","utility"], "simple"),
(f"{CORE}/PolylineVolumeGeometryLibrary.js","computeRotationAngle"):
    ("根据相邻路径点计算形状应旋转的角度以贴合路径切线。", ["polyline-volume","rotation","math"], "simple"),
(f"{CORE}/PolylineVolumeGeometryLibrary.js","addPosition"):
    ("在单个路径点上叠加旋转后的形状副本，生成截面环。", ["polyline-volume","cross-section","math"], "moderate"),
(f"{CORE}/PolylineVolumeGeometryLibrary.js","addPositions"):
    ("对所有路径点逐一调用 addPosition，输出全部截面环。", ["polyline-volume","cross-section","loop"], "moderate"),
(f"{CORE}/PolylineVolumeGeometryLibrary.js","convertShapeTo3DDuplicate"):
    ("将 2D 形状复制为 3D 坐标（重复顶点以闭合环）。", ["polyline-volume","shape","conversion"], "moderate"),
(f"{CORE}/PolylineVolumeGeometryLibrary.js","convertShapeTo3D"):
    ("将 2D 形状提升为 3D 坐标（不重复顶点）。", ["polyline-volume","shape","conversion"], "simple"),
(f"{CORE}/PolylineVolumeGeometryLibrary.js","computeRoundCorner"):
    ("按圆角（round）类型在拐角处生成平滑弧形顶点，是最复杂的拐角算法。", ["polyline-volume","corner","round","algorithm"], "complex"),
# PolylineVolumeOutlineGeometry
(f"{CORE}/PolylineVolumeOutlineGeometry.js","computeAttributes"):
    ("为折线体积轮廓计算位置属性（仅外壳线段）。", ["geometry","attributes","outline"], "moderate"),
(f"{CORE}/PolylineVolumeOutlineGeometry.js","PolylineVolumeOutlineGeometry"):
    ("PolylineVolumeOutlineGeometry 构造器：仅生成外壳线段的几何描述。", ["geometry","constructor","data-model"], "moderate"),
# QuantizedMeshTerrainData
(f"{CORE}/QuantizedMeshTerrainData.js","QuantizedMeshTerrainData"):
    ("构造器：解析 quantized-mesh 头/顶点/索引并初始化包围盒与边界高度。", ["terrain","constructor","quantized-mesh"], "complex"),
(f"{CORE}/QuantizedMeshTerrainData.js","sortIndicesIfNecessary"):
    ("必要时对索引按相对屏幕误差重排，保证索引数据一致性。", ["terrain","index","sort"], "simple"),
(f"{CORE}/QuantizedMeshTerrainData.js","interpolateMeshHeight"):
    ("在量化网格的三角形内对指定经纬度做重心坐标高度插值。", ["terrain","interpolation","height"], "moderate"),
(f"{CORE}/QuantizedMeshTerrainData.js","interpolateHeight"):
    ("对外暴露的高度插值入口，按三角形包围判定后调用 interpolateMeshHeight。", ["terrain","interpolation","height"], "moderate"),
# Ray
# (Ray class handled separately)
# RectangleGeometry
(f"{CORE}/RectangleGeometry.js","createAttributes"):
    ("为矩形几何按行/列分配顶点并写入初始属性缓冲。", ["geometry","attributes","rectangle"], "moderate"),
(f"{CORE}/RectangleGeometry.js","calculateAttributes"):
    ("为平面矩形顶点计算位置、法线、切线、ST 与颜色属性。", ["geometry","attributes","rectangle"], "moderate"),
(f"{CORE}/RectangleGeometry.js","calculateAttributesWall"):
    ("为挤出矩形的墙体顶点单独计算法线与纹理坐标。", ["geometry","attributes","wall"], "complex"),
(f"{CORE}/RectangleGeometry.js","constructRectangle"):
    ("构建矩形（含旋转与 granularity 细分）的主网格几何体。", ["geometry","rectangle","mesh"], "complex"),
(f"{CORE}/RectangleGeometry.js","constructExtrudedRectangle"):
    ("构建挤出矩形：底面、顶面与四面墙体的完整几何体，逻辑量最大。", ["geometry","rectangle","extrude"], "complex"),
(f"{CORE}/RectangleGeometry.js","computeRectangle"):
    ("依据椭球、旋转与 granularity 计算矩形地理边界与包围球。", ["geometry","rectangle","bounds"], "moderate"),
(f"{CORE}/RectangleGeometry.js","RectangleGeometry"):
    ("RectangleGeometry 构造器：分发平面/挤出两种构造路径并缓存。", ["geometry","constructor","data-model"], "moderate"),
(f"{CORE}/RectangleGeometry.js","textureCoordinateRotationPoints"):
    ("返回用于旋转纹理坐标的控制点列表。", ["geometry","texture","rotation"], "moderate"),
# RectangleGeometryLibrary
(f"{CORE}/RectangleGeometryLibrary.js","getRotationOptions"):
    ("根据旋转角度与墙选项计算 RectangleGeometry 所需的旋转矩阵与高度参数。", ["geometry","rectangle","rotation"], "moderate"),
# RectangleOutlineGeometry
(f"{CORE}/RectangleOutlineGeometry.js","constructRectangle"):
    ("构建矩形轮廓线段（含旋转）的顶点几何体。", ["geometry","rectangle","outline"], "complex"),
(f"{CORE}/RectangleOutlineGeometry.js","constructExtrudedRectangle"):
    ("构建挤出矩形轮廓（顶/底/四侧）的完整线段几何体。", ["geometry","rectangle","outline","extrude"], "complex"),
(f"{CORE}/RectangleOutlineGeometry.js","RectangleOutlineGeometry"):
    ("RectangleOutlineGeometry 构造器：分发平面/挤出轮廓构造路径。", ["geometry","constructor","data-model"], "moderate"),
# S2Cell (keep significant ones; many small helpers exist)
(f"{CORE}/S2Cell.js","S2Cell"):
    ("S2Cell 构造器：从 cell id、面、ij 与层级构建单元。", ["s2","constructor","data-model"], "simple"),
(f"{CORE}/S2Cell.js","convertCellIdToFaceIJ"):
    ("将 64 位 cell id 解码为面索引与 ij 坐标。", ["s2","decode","hilbert"], "moderate"),
(f"{CORE}/S2Cell.js","convertFaceUVtoXYZ"):
    ("将 (面, uv) 转换为笛卡尔 XYZ，用于单元顶点。", ["s2","projection","math"], "simple"),
(f"{CORE}/S2Cell.js","generateLookupCell"):
    ("递归生成 Hilbert 曲线查找表单元，加速 cell 解码。", ["s2","hilbert","lookup-table"], "moderate"),
(f"{CORE}/S2Cell.js","generateLookupTable"):
    ("构建并缓存 S2 面的查找表（模块加载时执行一次）。", ["s2","lookup-table","initialization"], "moderate"),
(f"{CORE}/S2Cell.js","convertCellIdToFaceSiTi"):
    ("将 cell id 解码为面与 Si/Ti 坐标（比 ij 更精细）。", ["s2","decode","math"], "moderate"),
# ScreenSpaceEventHandler (keep the big ones)
(f"{CORE}/ScreenSpaceEventHandler.js","registerListeners"):
    ("向 DOM 注册鼠标/触摸/指针/滚轮等全部原始事件监听器。", ["input","event-handler","dom"], "complex"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleMouseDown"):
    ("处理 mousedown，计算移动阈值并触发 LEFT_DOWN/LEFT_CLICK 事件。", ["input","mouse","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","cancelMouseEvent"):
    ("在触摸抢占时取消挂起的鼠标事件并清理定时器。", ["input","mouse","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleMouseUp"):
    ("处理 mouseup，判定单击/双击并触发对应 ScreenSpaceEventType。", ["input","mouse","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleMouseMove"):
    ("处理 mousemove，更新位置并触发 MOUSE_MOVE 回调。", ["input","mouse","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleWheel"):
    ("处理 wheel 事件并归一化为 WHEEL 事件类型。", ["input","wheel","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleTouchStart"):
    ("处理 touchstart：记录触点、起止时间并准备捏合/移动判定。", ["input","touch","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","fireTouchEvents"):
    ("综合多触点状态，按像素容差与时机触发 PINCH/MOVE/TOUCH 事件，逻辑最复杂。", ["input","touch","event-handler","pinch"], "complex"),
(f"{CORE}/ScreenSpaceEventHandler.js","fireTouchMoveEvents"):
    ("根据触点移动量触发捏合缩放与触摸移动事件。", ["input","touch","event-handler","pinch"], "complex"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleTouchMove"):
    ("处理 touchmove：更新触点位置与移动距离。", ["input","touch","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","ScreenSpaceEventHandler"):
    ("构造器：绑定目标元素并注册全部事件监听器。", ["input","constructor","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleDblClick"):
    ("处理 dblclick，触发对应双击 ScreenSpaceEventType。", ["input","mouse","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handleTouchEnd"):
    ("处理 touchend：清理触点并在合适时机触发触摸结束事件。", ["input","touch","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handlePointerDown"):
    ("处理 pointerdown：将统一指针事件转换为鼠标/触摸语义。", ["input","pointer","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handlePointerMove"):
    ("处理 pointermove：转发位置更新。", ["input","pointer","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","handlePointerUp"):
    ("处理 pointerup：转发点击/抬起语义。", ["input","pointer","event-handler"], "moderate"),
(f"{CORE}/ScreenSpaceEventHandler.js","getModifiers"):
    ("从当前事件中提取 Ctrl/Shift/Alt 等修饰键状态。", ["input","modifier","event-handler"], "simple"),
(f"{CORE}/ScreenSpaceEventHandler.js","getPosition"):
    ("将事件 clientX/clientY 转换为相对元素的 Cartesian2 坐标。", ["input","position","dom"], "simple"),
(f"{CORE}/ScreenSpaceEventHandler.js","getInputEventKey"):
    ("由事件类型与修饰键生成内部 InputAction 哈希 key。", ["input","event-handler","hash"], "simple"),
(f"{CORE}/ScreenSpaceEventHandler.js","registerListener"):
    ("注册单个 DOM 监听器并加入清理集合。", ["input","event-handler","dom"], "simple"),
# Simon1994
(f"{CORE}/Simon1994PlanetaryPositions.js","computeTdbMinusTtSpice"):
    ("按 SPICE 风格公式计算质心动力学时（TDB）与地球时（TT）之差。", ["astronomy","time","ephemeris"], "moderate"),
(f"{CORE}/Simon1994PlanetaryPositions.js","elementsToCartesian"):
    ("将轨道根数转换为惯性系笛卡尔位置向量。", ["astronomy","ephemeris","conversion"], "complex"),
(f"{CORE}/Simon1994PlanetaryPositions.js","chooseOrbit"):
    ("按天体编号选择对应的轨道根数表项。", ["astronomy","ephemeris","dispatch"], "simple"),
(f"{CORE}/Simon1994PlanetaryPositions.js","meanAnomalyToTrueAnomaly"):
    ("将平近点角换算为真近点角。", ["astronomy","orbit","math"], "simple"),
(f"{CORE}/Simon1994PlanetaryPositions.js","meanAnomalyToEccentricAnomaly"):
    ("用牛顿迭代求解开普勒方程，得到偏心近点角。", ["astronomy","kepler","iteration"], "moderate"),
(f"{CORE}/Simon1994PlanetaryPositions.js","eccentricAnomalyToTrueAnomaly"):
    ("由偏心近点角换算为真近点角。", ["astronomy","orbit","math"], "moderate"),
(f"{CORE}/Simon1994PlanetaryPositions.js","perifocalToCartesianMatrix"):
    ("构造近焦点到惯性坐标系的旋转矩阵。", ["astronomy","matrix","rotation"], "moderate"),
(f"{CORE}/Simon1994PlanetaryPositions.js","computeSimonEarthMoonBarycenter"):
    ("按 Simon 1994 历表计算地月系质心位置。", ["astronomy","ephemeris","emb"], "complex"),
(f"{CORE}/Simon1994PlanetaryPositions.js","computeSimonMoon"):
    ("按 Simon 1994 历表计算月球相对地球的地心位置（含黄经章动等修正）。", ["astronomy","moon","ephemeris"], "complex"),
(f"{CORE}/Simon1994PlanetaryPositions.js","taiToTdb"):
    ("将国际原子时（TAI）转换为质心动力学时（TDB）。", ["astronomy","time","conversion"], "simple"),
# SimplePolylineGeometry
(f"{CORE}/SimplePolylineGeometry.js","interpolateColors"):
    ("在折线两端颜色间按段数线性插值，生成逐顶点颜色。", ["color","interpolation","polyline"], "moderate"),
(f"{CORE}/SimplePolylineGeometry.js","SimplePolylineGeometry"):
    ("SimplePolylineGeometry 构造器：细分并生成 LINES 顶点缓冲。", ["geometry","constructor","polyline"], "moderate"),
# SphereGeometry
(f"{CORE}/SphereGeometry.js","SphereGeometry"):
    ("SphereGeometry 构造器：以等长短轴调用 EllipsoidGeometry 生成球面。", ["geometry","constructor","sphere"], "simple"),
# Stereographic
(f"{CORE}/Stereographic.js","Stereographic"):
    ("Stereographic 构造器：保存投影中心与缩放系数。", ["projection","constructor","stereographic"], "simple"),
# TerrainEncoding
(f"{CORE}/TerrainEncoding.js","TerrainEncoding"):
    ("TerrainEncoding 构造器：根据量化模式与夸张度配置解码矩阵与属性布局。", ["terrain","encoding","constructor"], "complex"),
# TerrainMesh
(f"{CORE}/TerrainMesh.js","TerrainMesh"):
    ("TerrainMesh 构造器：持有顶点/索引/包围盒并初始化世界变换。", ["terrain","constructor","mesh"], "complex"),
(f"{CORE}/TerrainMesh.js","computeTransform"):
    ("计算 3D 模式下地形网格到世界坐标系的 4x4 变换矩阵。", ["terrain","transform","matrix"], "moderate"),
(f"{CORE}/TerrainMesh.js","computeTransform2D"):
    ("计算 2D 模式（哥伦布视图）下地形网格的投影变换矩阵。", ["terrain","transform","matrix","2d"], "moderate"),
# TerrainPicker
(f"{CORE}/TerrainPicker.js","TerrainPicker"):
    ("TerrainPicker 构造器：初始化根 BVH 节点与三角形缓冲池。", ["terrain","picking","constructor"], "moderate"),
(f"{CORE}/TerrainPicker.js","TerrainPickerNode"):
    ("BVH 节点构造器：保存 AABB 与子节点列表。", ["terrain","picking","bvh"], "moderate"),
(f"{CORE}/TerrainPicker.js","reset"):
    ("重置拾取器：清空节点树与缓冲以接受新网格。", ["terrain","picking","reset"], "simple"),
(f"{CORE}/TerrainPicker.js","createAABBForNode"):
    ("为给定三角形集合构造节点 AABB 包围盒。", ["terrain","picking","bvh","aabb"], "simple"),
(f"{CORE}/TerrainPicker.js","packTriangleBuffers"):
    ("将顶点与索引打包进连续缓冲，便于 worker 传输。", ["terrain","picking","buffer"], "moderate"),
(f"{CORE}/TerrainPicker.js","getNodesIntersectingRay"):
    ("返回 BVH 中与射线相交的节点列表（自顶向下遍历）。", ["terrain","picking","bvh","ray-cast"], "moderate"),
(f"{CORE}/TerrainPicker.js","findClosestPointInClosestNode"):
    ("在距离最近的 BVH 节点中找到与射线最近的交点。", ["terrain","picking","ray-cast"], "moderate"),
(f"{CORE}/TerrainPicker.js","getClosestTriangleInNode"):
    ("逐三角形测试射线相交并保留最近交点与重心坐标。", ["terrain","picking","ray-cast","triangle"], "complex"),
(f"{CORE}/TerrainPicker.js","getVertexPosition"):
    ("按索引从量化缓冲解码出顶点的世界位置。", ["terrain","picking","vertex"], "moderate"),
(f"{CORE}/TerrainPicker.js","addTrianglesToChildrenNodes"):
    ("按三角形质心将三角形分配到子节点，递归构建 BVH。", ["terrain","picking","bvh","subdivision"], "moderate"),
# VertexFormat
(f"{CORE}/VertexFormat.js","VertexFormat"):
    ("VertexFormat 构造器：按选项声明需要哪些顶点属性（位置/法线/ST/切线/颜色）。", ["geometry","constructor","vertex-format"], "moderate"),
# WallGeometry
(f"{CORE}/WallGeometry.js","WallGeometry"):
    ("WallGeometry 构造器：沿折线与最小/最大高度生成垂直墙面板几何体。", ["geometry","constructor","wall"], "moderate"),
}

# ---------- Class metadata ----------
CLS_META = {
(f"{CORE}/Ray.js","Ray"): ("Ray","射线类型，封装原点（origin）与单位方向（direction），提供 getPoint 与 clone。",
    ["math","ray","data-model","intersection"], "simple"),
}

# ---------- Build partition ----------
FILES_SORTED = sorted(FILE_META.keys())
PARTS = 4
SIZE = -(-len(FILES_SORTED) // PARTS)
part_files = [FILES_SORTED[k*SIZE:(k+1)*SIZE] for k in range(PARTS)]

def file_node(path):
    name, summary, tags, complexity = FILE_META[path]
    return {
        "id": f"file:{path}",
        "type": "file",
        "name": name,
        "filePath": path,
        "summary": summary,
        "tags": tags,
        "complexity": complexity,
    }

def fn_node(path, fn):
    key = (path, fn["name"])
    if key not in FN_META:
        return None
    summary, tags, complexity = FN_META[key]
    return {
        "id": f"function:{path}:{fn['name']}",
        "type": "function",
        "name": fn["name"],
        "filePath": path,
        "lineRange": [fn["startLine"], fn["endLine"]],
        "summary": summary,
        "tags": tags,
        "complexity": complexity,
    }

def cls_node(path, cls):
    key = (path, cls["name"])
    if key not in CLS_META:
        return None
    _, summary, tags, complexity = CLS_META[key]
    return {
        "id": f"class:{path}:{cls['name']}",
        "type": "class",
        "name": cls["name"],
        "filePath": path,
        "lineRange": [cls["startLine"], cls["endLine"]],
        "summary": summary,
        "tags": tags,
        "complexity": complexity,
    }

# Pre-compute all nodes
all_fn_by_file = defaultdict(list)
all_cls_by_file = defaultdict(list)
for path, r in RESULTS.items():
    for fn in r.get("functions", []):
        node = fn_node(path, fn)
        if node:
            all_fn_by_file[path].append(node)
    for cls in r.get("classes", []):
        node = cls_node(path, cls)
        if node:
            all_cls_by_file[path].append(node)

total_nodes = 0
total_edges = 0
total_imp = 0
for k, files in enumerate(part_files, 1):
    nodes = []
    edges = []
    for path in files:
        # file node
        nodes.append(file_node(path))
        # fn/cls nodes + contains/exports edges
        for n in all_fn_by_file[path]:
            nodes.append(n)
            edges.append({
                "source": f"file:{path}",
                "target": n["id"],
                "type": "contains",
                "direction": "forward",
                "weight": 1.0,
            })
        for n in all_cls_by_file[path]:
            nodes.append(n)
            edges.append({
                "source": f"file:{path}",
                "target": n["id"],
                "type": "contains",
                "direction": "forward",
                "weight": 1.0,
            })
        # imports edges (1:1)
        for tgt in IMP.get(path, []):
            edges.append({
                "source": f"file:{path}",
                "target": f"file:{tgt}",
                "type": "imports",
                "direction": "forward",
                "weight": 0.7,
            })
            total_imp += 1
    out = {"nodes": nodes, "edges": edges}
    fname = f"{ROOT}/.understand-anything/intermediate/batch-7-part-{k}.json"
    with open(fname, "w") as f:
        json.dump(out, f, ensure_ascii=False)
    total_nodes += len(nodes)
    total_edges += len(edges)
    print(f"part {k}: {len(files)} files, {len(nodes)} nodes, {len(edges)} edges -> {fname}")

print(f"\nTOTAL: nodes={total_nodes}, edges={total_edges}, import_edges={total_imp}")
# verify expected import count
expected_imp = sum(len(v) for v in IMP.values())
print(f"expected import edges: {expected_imp} (match: {expected_imp == total_imp})")
