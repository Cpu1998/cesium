import json, math, os

ROOT = "/home/ubuntu/桌面/project/cesium"
OUT_DIR = "/home/ubuntu/桌面/project/cesium/.understand-anything/intermediate"
BATCH_INDEX = 28

with open(f"{ROOT}/.understand-anything/tmp/ua-file-extract-results-28.json") as f:
    extraction = json.load(f)
with open(f"{ROOT}/.understand-anything/tmp/ua-file-analyzer-input-28.json") as f:
    inp = json.load(f)

batch_imports = inp["batchImportData"]
files_in_batch = [r["path"] for r in extraction["results"]]
by_path = {r["path"]: r for r in extraction["results"]}

# ------------------------------------------------------------------
# Per-file metadata (summary, tags, complexity, type, languageNotes)
# ------------------------------------------------------------------
FILE_META = {
"packages/engine/Source/Scene/Model/CustomShaderMode.js": dict(
    type="file", complexity="simple",
    summary="枚举类型，定义 CustomShader 与 fragment shader 的交互方式（MODIFY_MATERIAL 或 REPLACE_MATERIAL），用于决定自定义 shader 与材质阶段的结合方式。",
    tags=["enum","custom-shader","shader","3d-tiles"]),
"packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="CustomShader 渲染管线阶段，负责把用户自定义的 vertex/fragment shader 代码注入到 Model 的 ShaderBuilder 中，并推断属性默认值、处理 primitive property id。",
    tags=["pipeline-stage","custom-shader","shader-builder","rendering"]),
"packages/engine/Source/Scene/Model/CustomShaderTranslucencyMode.js": dict(
    type="file", complexity="simple",
    summary="枚举类型，控制 CustomShader 的半透明行为（INHERIT/OPAQUE/TRANSLUCENT），决定是否覆盖 primitive 材质的透明度设置。",
    tags=["enum","custom-shader","translucency","3d-tiles"]),
"packages/engine/Source/Scene/Model/DequantizationPipelineStage.js": dict(
    type="file", complexity="moderate",
    summary="反量化管线阶段，为量化的顶点属性（含 oct 编码法线）注入 uniform 与 GLSL 反量化代码，把压缩属性恢复为浮点值。",
    tags=["pipeline-stage","dequantization","vertex-attribute","shader-builder"]),
"packages/engine/Source/Scene/Model/EdgeDetectionPipelineStage.js": dict(
    type="file", complexity="simple",
    summary="屏幕空间边缘检测/合成管线阶段，注入 fragment shader 逻辑以采样 EdgeVisibilityPipelineStage 生成的边缘缓冲，并做深度与 feature id 过滤后合成最终边缘颜色。",
    tags=["pipeline-stage","edge-detection","fragment-shader","rendering"]),
"packages/engine/Source/Scene/Model/EdgeVisibilityPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="边缘可见性管线阶段，从 primitive 几何中抽取唯一边、计算每条边的面法向与可见性，并构造四边形边几何写入专门的边缘渲染 pass。",
    tags=["pipeline-stage","edge-visibility","geometry","rendering"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/AnchorPointDirect.js": dict(
    type="file", complexity="simple",
    summary="NGA_gpm_local glTF 扩展中直接存储方式锚点的元数据类，保存锚点地理坐标与调整参数。",
    tags=["gpm","data-model","anchor-point","gltf-extension"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/AnchorPointIndirect.js": dict(
    type="file", complexity="simple",
    summary="NGA_gpm_local 扩展中间接存储方式锚点的元数据类，除位置与调整参数外还保存 3x3 协方差矩阵。",
    tags=["gpm","data-model","anchor-point","gltf-extension"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/CorrelationGroup.js": dict(
    type="file", complexity="simple",
    summary="NGA_gpm_local 扩展中的相关性分组元数据类，记录使用相同相关性建模的参数（groupFlags、旋转角与 Spdcf 参数）。",
    tags=["gpm","data-model","correlation","gltf-extension"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/GltfGpmLoader.js": dict(
    type="file", complexity="moderate",
    summary="NGA_gpm_local 扩展的 glTF 级加载器，解析锚点（直接/间接）与相关性分组并构建 GltfGpmLocal，提供上三角协方差矩阵转换等工具函数。",
    tags=["gpm","loader","gltf-extension","data-pipeline"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/GltfGpmLocal.js": dict(
    type="file", complexity="moderate",
    summary="NGA_gpm_local 扩展的顶层运行时表示，持有 storageType、锚点列表与相关性分组，并提供按 Direct/Indirect 类型解析的构造逻辑。",
    tags=["gpm","data-model","gltf-extension","runtime"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/GltfMeshPrimitiveGpmLoader.js": dict(
    type="file", complexity="complex",
    summary="按 primitive 加载 NGA_gpm_local 的 PPE（Per-Point Error）纹理，将其解码为 StructuralMetadata/PropertyTexture 并挂接到 mesh primitive 上。",
    tags=["gpm","loader","ppe","metadata"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/MeshPrimitiveGpmLocal.js": dict(
    type="file", complexity="simple",
    summary="单个 glTF primitive 的 GPM 本地信息容器，持有一组 PpeTexture 引用。",
    tags=["gpm","data-model","ppe","gltf-extension"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/PpeMetadata.js": dict(
    type="file", complexity="simple",
    summary="PPE（Per-Point Error）数据元数据类，记录数据来源、允许的最小/最大值。",
    tags=["gpm","data-model","ppe","metadata"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/PpeTexture.js": dict(
    type="file", complexity="simple",
    summary="NGA_gpm_local 中的 PPE 纹理描述类，是一个合法 glTF TextureInfo 加上 noData/offset/scale 等元数据字段。",
    tags=["gpm","data-model","ppe","texture"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/Spdcf.js": dict(
    type="file", complexity="simple",
    summary="严格正定相关函数（Strictly Positive-Definite Correlation Function）参数类，用 A/alpha/beta/T 描述点间相关性随距离衰减的数学模型。",
    tags=["gpm","data-model","correlation","gltf-extension"]),
"packages/engine/Source/Scene/Model/Extensions/Gpm/StorageType.js": dict(
    type="file", complexity="simple",
    summary="枚举类型，表示 NGA_gpm_local 中协方差信息的存储方式：Direct（含交叉协方差项）或 Indirect（仅对角协方差，交叉项由相关性函数推断）。",
    tags=["enum","gpm","gltf-extension","covariance"]),
"packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="feature id 管线阶段，把 primitive/instance 的 feature id（属性、隐式范围或纹理形式）处理为 shader 可用的变量与别名，支撑 per-feature 样式与拾取。",
    tags=["pipeline-stage","feature-id","shader-builder","metadata"]),
"packages/engine/Source/Scene/Model/GeoJsonLoader.js": dict(
    type="file", complexity="complex",
    summary="将 GeoJSON 几何解析为 ModelComponents 的 ResourceLoader 实现，按 Point/LineString/Polygon 类型生成对应的 lines/points primitive 并附带结构化元数据。",
    tags=["loader","geojson","data-pipeline","primitive"]),
"packages/engine/Source/Scene/Model/GeometryPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="几何管线阶段，处理 primitive 的顶点属性（语义、矩阵属性、2D 投影、插值限定符），并向 ShaderBuilder 注入属性声明、varying 与初始化代码。",
    tags=["pipeline-stage","geometry","vertex-attribute","shader-builder"]),
"packages/engine/Source/Scene/Model/I3dmLoader.js": dict(
    type="file", complexity="complex",
    summary="3D Tiles i3dm（实例化 3D 模型）格式的 ResourceLoader，解析 batch table 与 feature table、为每个实例计算位置/旋转/缩放并构造实例化 ModelComponents。",
    tags=["loader","i3dm","3d-tiles","instancing"]),
"packages/engine/Source/Scene/Model/ImageryConfiguration.js": dict(
    type="file", complexity="simple",
    summary="记录单个 ImageryLayer 影响外观的设置快照（show/alpha/brightness/contrast 等），供 ModelImagery 检测设置变更以触发 draw command 重建。",
    tags=["imagery","data-model","configuration","change-detection"]),
"packages/engine/Source/Scene/Model/ImageryFlags.js": dict(
    type="file", complexity="simple",
    summary="标志集合类，指示哪些 ImageryLayer 处理步骤（alpha/brightness/contrast 等）需要启用，用于决定 ImageryPipelineStage 生成的混合 shader 结构。",
    tags=["imagery","flags","shader-builder","rendering"]),
"packages/engine/Source/Scene/Model/ImageryInput.js": dict(
    type="file", complexity="simple",
    summary="单个 imagery 纹理在 shader 中所需的输入汇总类，包含 imageryLayer、纹理、纹理平移缩放与覆盖的纹理坐标矩形。",
    tags=["imagery","data-model","uniform","texture"]),
"packages/engine/Source/Scene/Model/ImageryPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="影像叠加管线阶段，在 Model3DTileContent 上将 ImageryLayer 的纹理按 coverage 投影到 primitive 上，生成采样与混合 shader 代码及相关 uniform。",
    tags=["pipeline-stage","imagery","shader-builder","3d-tiles"]),
"packages/engine/Source/Scene/Model/InstancingPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="实例化管线阶段，把 instance 的变换（矩阵或 vec3 平移）、feature id 等属性组织成实例顶点缓冲，并处理 2D 投影与参考点计算。",
    tags=["pipeline-stage","instancing","vertex-buffer","2d-projection"]),
"packages/engine/Source/Scene/Model/LightingModel.js": dict(
    type="file", complexity="simple",
    summary="枚举类型，定义 Model 的光照模型：UNLIT（无光照）或 PBR（基于物理的渲染，含金属粗糙度/镜面光泽度与基于图像的光照）。",
    tags=["enum","lighting","pbr","3d-tiles"]),
"packages/engine/Source/Scene/Model/LightingPipelineStage.js": dict(
    type="file", complexity="simple",
    summary="光照管线阶段，根据 Model 的 lightingOptions（光照模型、自定义光源色、IBL 等）向 ShaderBuilder 注入光照阶段 fragment 代码与相关 define。",
    tags=["pipeline-stage","lighting","shader-builder","rendering"]),
"packages/engine/Source/Scene/Model/MappedPositions.js": dict(
    type="file", complexity="simple",
    summary="在指定椭球上由笛卡尔位置转换得到的地理坐标集合及其包围矩形的容器，缓存于 ModelPrimitiveImagery 中以避免重复投影计算。",
    tags=["imagery","data-model","cartographic","ellipsoid"]),
"packages/engine/Source/Scene/Model/MaterialPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="材质管线阶段，处理 glTF 材质（PBR 金属粗糙度、镜面光泽度、specular、anisotropy、clearcoat、line style 等）的 uniform、纹理变换与 shader define。",
    tags=["pipeline-stage","material","pbr","shader-builder"]),
"packages/engine/Source/Scene/Model/MetadataPickingPipelineStage.js": dict(
    type="file", complexity="simple",
    summary="元数据拾取管线阶段，向 shader 注入 metadataPickingStage 函数与一组 define（值类型、分量等），实际值在 DerivedCommands 中按拾取目标填充。",
    tags=["pipeline-stage","metadata","picking","shader-builder"]),
"packages/engine/Source/Scene/Model/MetadataPipelineStage.js": dict(
    type="file", complexity="complex",
    summary="结构化元数据管线阶段，将 property attributes/textures/tables 映射到 feature id 集合，声明 struct、统计信息与值变换 uniform，生成元数据访问的 shader 代码。",
    tags=["pipeline-stage","metadata","shader-builder","structural-metadata"]),
"packages/engine/Source/Scene/Model/Model.js": dict(
    type="file", complexity="complex",
    summary="基于 glTF 的 3D 模型核心类，统一管理加载（B3dm/I3dm/Pnts/GeoJson/GltfLoader）、场景图、动画、特征表、样式、裁剪、影像叠加与每帧 draw command 的构建与更新。",
    tags=["entry-point","model","gltf","rendering"],
    languageNotes="采用构造函数 + 原型方法的经典 Cesium 模式；3000+ 行的 update() 中按固定顺序调用数十个 update* 子函数。"),
}

# ------------------------------------------------------------------
# Significant function/class metadata (summary/tags) for selected nodes
# ------------------------------------------------------------------
FN_META = {
 # CustomShaderPipelineStage
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","generateVertexShaderLines"):
   ("根据 CustomShader 配置生成 vertex shader 代码行，处理属性注入与 builtin position 变量。",["custom-shader","vertex-shader","shader-builder"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","generateFragmentShaderLines"):
   ("根据 CustomShader 配置生成 fragment shader 代码行，注入材质属性与 primitive property id。",["custom-shader","fragment-shader","shader-builder"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","getPrimitiveAttributesUsedInShader"):
   ("收集 shader 中实际使用的 primitive 属性集合，区分 vertex/fragment shader。",["custom-shader","attribute","analysis"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","getAttributesNeedingDefaults"):
   ("确定 shader 引用但 primitive 未提供的属性，为其生成默认值。",["custom-shader","attribute","default-value"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","generateShaderLines"):
   ("CustomShader 阶段入口，协调 vertex/fragment shader 行的生成并写入 ShaderBuilder。",["custom-shader","pipeline-stage","entry"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","addVertexLinesToShader"):
   ("把生成的 vertex shader 代码行按结构添加到 ShaderBuilder 的对应位置。",["shader-builder","vertex-shader"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","addFragmentLinesToShader"):
   ("把生成的 fragment shader 代码行按结构添加到 ShaderBuilder 的对应位置。",["shader-builder","fragment-shader"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","getAllPropertyIds"):
   ("枚举 primitive 上所有可用的 structural metadata property id，供 custom shader 引用校验。",["custom-shader","metadata","property-id"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","checkMetadataCompatibility"):
   ("校验 custom shader 引用的 metadata property id 在 primitive 上确实存在。",["custom-shader","metadata","validation"]),
 ("packages/engine/Source/Scene/Model/CustomShaderPipelineStage.js","inferAttributeDefaults"):
   ("推断 custom shader 引用的 builtin 属性的默认值。",["custom-shader","attribute","default-value"]),
 # DequantizationPipelineStage
 ("packages/engine/Source/Scene/Model/DequantizationPipelineStage.js","addDequantizationUniforms"):
   ("为量化属性添加反量化所需的 uniform（如归一化范围、平移缩放）到 render resources。",["dequantization","uniform","quantization"]),
 ("packages/engine/Source/Scene/Model/DequantizationPipelineStage.js","updateDequantizationFunction"):
   ("向 ShaderBuilder 注入属性反量化函数调用代码。",["dequantization","shader-builder","function"]),
 ("packages/engine/Source/Scene/Model/DequantizationPipelineStage.js","generateOctDecodeLine"):
   ("生成 oct 编码法线的解码 GLSL 代码行。",["dequantization","oct-encoding","shader"]),
 ("packages/engine/Source/Scene/Model/DequantizationPipelineStage.js","generateDequantizeLine"):
   ("生成通用属性反量化的 GLSL 代码行。",["dequantization","shader","attribute"]),
 # EdgeVisibilityPipelineStage
 ("packages/engine/Source/Scene/Model/EdgeVisibilityPipelineStage.js","extractVisibleEdges"):
   ("遍历 primitive 的边与邻接面，依据二面角等准则抽取可见边的索引与元数据。",["edge-visibility","geometry","visibility"]),
 ("packages/engine/Source/Scene/Model/EdgeVisibilityPipelineStage.js","generateEdgeFaceNormals"):
   ("为每条边计算其两侧面的法向量，用于边缘显示着色与可见性判断。",["edge-visibility","normal","geometry"]),
 ("packages/engine/Source/Scene/Model/EdgeVisibilityPipelineStage.js","collectVertexColors"):
   ("收集 primitive 的顶点颜色属性以支持边缘着色。",["edge-visibility","vertex-color","attribute"]),
 ("packages/engine/Source/Scene/Model/EdgeVisibilityPipelineStage.js","createQuadEdgeGeometry"):
   ("为每条可见边构造四边形几何（含法向、feature id、累积距离等属性），写入边缘渲染缓冲。",["edge-visibility","geometry","quad","buffer"]),
 # GltfGpmLoader
 ("packages/engine/Source/Scene/Model/Extensions/Gpm/GltfGpmLoader.js","createCovarianceMatrixFromUpperTriangle"):
   ("由上三角数组重建对称的 3x3 协方差矩阵。",["gpm","covariance","matrix"]),
 ("packages/engine/Source/Scene/Model/Extensions/Gpm/GltfGpmLoader.js","createAnchorPointDirect"):
   ("从 JSON 构造直接存储方式的 AnchorPointDirect 对象。",["gpm","anchor-point","factory"]),
 ("packages/engine/Source/Scene/Model/Extensions/Gpm/GltfGpmLoader.js","createAnchorPointIndirect"):
   ("从 JSON 构造间接存储方式的 AnchorPointIndirect 对象。",["gpm","anchor-point","factory"]),
 ("packages/engine/Source/Scene/Model/Extensions/Gpm/GltfGpmLoader.js","createCorrelationGroup"):
   ("从 JSON 构造相关性分组 CorrelationGroup 对象。",["gpm","correlation","factory"]),
 # GltfMeshPrimitiveGpmLoader
 ("packages/engine/Source/Scene/Model/Extensions/Gpm/GltfMeshPrimitiveGpmLoader.js","gatherUsedTextureIds"):
   ("扫描 GPM 扩展收集所有被引用的纹理索引，便于资源加载与缓存。",["gpm","ppe","texture"]),
 # FeatureIdPipelineStage
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","declareStructsAndFunctions"):
   ("向 ShaderBuilder 注入 feature id 相关的 struct 与函数声明。",["feature-id","shader-builder","struct"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","processInstanceFeatureIds"):
   ("处理实例化 primitive 的 feature id 属性。",["feature-id","instancing","pipeline-stage"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","processPrimitiveFeatureIds"):
   ("处理非实例化 primitive 的 feature id（属性、隐式范围、纹理）。",["feature-id","pipeline-stage","primitive"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","processAttribute"):
   ("把单个 feature id 属性处理为 shader 变量与可能的实例化除数。",["feature-id","attribute","shader"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","processImplicitRange"):
   ("把隐式范围的 feature id（起始/步长）处理为 shader 中的 feature id 计算。",["feature-id","implicit-range","shader"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","processTexture"):
   ("把 feature id 纹理处理为 shader 中的 feature id 采样。",["feature-id","texture","shader"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","generateImplicitFeatureIdAttribute"):
   ("由隐式范围生成一个显式的 feature id 顶点属性缓冲。",["feature-id","buffer","implicit-range"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","addAlias"):
   ("为 feature id 变量添加一个可选别名 define（如选中 feature id）。",["feature-id","alias","shader-builder"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","processInstanceAttribute"):
   ("把实例化的 feature id 属性处理为 shader 变量并设置实例除数。",["feature-id","instancing","attribute"]),
 ("packages/engine/Source/Scene/Model/FeatureIdPipelineStage.js","generateImplicitFeatureIdTypedArray"):
   ("由隐式范围生成 feature id 的 TypedArray。",["feature-id","typed-array","implicit-range"]),
 # GeoJsonLoader
 ("packages/engine/Source/Scene/Model/GeoJsonLoader.js","parse"):
   ("GeoJSON 解析主入口，把 GeoJSON 对象分发到对应的 Point/LineString/Polygon 解析与 primitive 构造流程。",["geojson","parser","entry"]),
 ("packages/engine/Source/Scene/Model/GeoJsonLoader.js","createLinesPrimitive"):
   ("由解析后的线状特征构造 ModelComponents lines primitive（顶点/索引/属性）。",["geojson","primitive","lines"]),
 ("packages/engine/Source/Scene/Model/GeoJsonLoader.js","createPointsPrimitive"):
   ("由解析后的点状特征构造 ModelComponents points primitive。",["geojson","primitive","points"]),
 ("packages/engine/Source/Scene/Model/GeoJsonLoader.js","parseFeature"):
   ("解析单个 GeoJSON Feature 并填充 ParseResult。",["geojson","parser","feature"]),
 ("packages/engine/Source/Scene/Model/GeoJsonLoader.js","parseFeatureCollection"):
   ("解析 GeoJSON FeatureCollection，迭代每个 Feature。",["geojson","parser","feature-collection"]),
 # GeometryPipelineStage
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","processAttribute"):
   ("处理单个顶点属性：决定位置、添加到 render resources 并处理 2D/实例化情形。",["geometry","vertex-attribute","pipeline-stage"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","addAttributeToRenderResources"):
   ("把属性添加到 render resources，处理 2D 模式下的位置变换。",["geometry","attribute","render-resources"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","addMatrixAttributeToRenderResources"):
   ("把矩阵属性拆分为多列添加到 render resources。",["geometry","matrix-attribute","render-resources"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","updateAttributesStruct"):
   ("更新 shader 中 attributes struct 的字段声明。",["geometry","shader-builder","struct"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","updateInitializeAttributesFunction"):
   ("更新 shader 中初始化 attributes 的函数代码。",["geometry","shader-builder","function"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","handleBitangents"):
   ("为带有切向量的 primitive 推导 bitangent 并补充到属性中。",["geometry","tangent","bitangent"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","addVaryingDeclaration"):
   ("为顶点属性在 shader 中添加 varying 声明与插值限定符。",["geometry","varying","shader-builder"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","addAttributeDeclaration"):
   ("为属性在 shader 中添加声明（含 2D 修改）。",["geometry","shader-builder","declaration"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","addSemanticDefine"):
   ("为带语义的属性添加 shader define。",["geometry","semantic","shader-builder"]),
 ("packages/engine/Source/Scene/Model/GeometryPipelineStage.js","updateSetDynamicVaryingsFunction"):
   ("更新 shader 中设置动态 varying 的函数代码（用于 2D）。",["geometry","shader-builder","varying"]),
 # I3dmLoader
 ("packages/engine/Source/Scene/Model/I3dmLoader.js","createInstances"):
   ("由 i3dm feature table 计算每个实例的位置/旋转/缩放并构造实例化 ModelComponents.Instances。",["i3dm","instancing","factory"]),
 ("packages/engine/Source/Scene/Model/I3dmLoader.js","getPositions"):
   ("从 feature table 解析实例位置（含 CONSTANT/RTC/QUANTIZED 等形式）。",["i3dm","position","feature-table"]),
 ("packages/engine/Source/Scene/Model/I3dmLoader.js","processRotation"):
   ("计算单个实例的旋转（含 UP/RIGHT 法向或 East-North-Up 对齐）。",["i3dm","rotation","transform"]),
 ("packages/engine/Source/Scene/Model/I3dmLoader.js","processScale"):
   ("从 feature table 解析单个实例的缩放（含 NON_UNIFORM 缩放）。",["i3dm","scale","feature-table"]),
 ("packages/engine/Source/Scene/Model/I3dmLoader.js","createStructuralMetadata"):
   ("把 i3dm batch table 转换为 StructuralMetadata。",["i3dm","metadata","batch-table"]),
 ("packages/engine/Source/Scene/Model/I3dmLoader.js","createInstancesCopy"):
   ("复制实例化 components（用于拆分/重复实例场景）。",["i3dm","instancing","copy"]),
 # ImageryPipelineStage methods (class methods on instance, but functions present)
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_processImageryInputs"):
   ("遍历 primitive 的 imagery coverage，构建 ImageryInput 列表并决定需要启用的 imagery 处理标志。",["imagery","pipeline-stage","input"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_buildSampleAndBlendFunction"):
   ("生成在 shader 中采样各 imagery 纹理并与已有像素混合的函数体。",["imagery","shader-builder","blending"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_createMainImageryShader"):
   ("组装 imagery 阶段的主 shader 片段，注入 uniform、函数与调用。",["imagery","shader-builder","main"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_computeTextureTranslationAndScale"):
   ("计算 imagery 纹理在 primitive 上的平移与缩放（含 native 坐标转换）。",["imagery","texture","transform"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_computeTextureTranslationAndScaleFromNative"):
   ("基于 native 边界矩形计算 imagery 纹理的平移与缩放。",["imagery","texture","transform"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_createImageryInputs"):
   ("为每个 imagery coverage 创建 ImageryInput 对象。",["imagery","input","factory"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_createImageryInput"):
   ("从单个 ImageryCoverage 构建一个 ImageryInput（纹理、平移缩放、覆盖矩形）。",["imagery","input","factory"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_createSampleAndBlendCallArguments"):
   ("生成 shader 中 sampleAndBlend 函数调用的实参列表。",["imagery","shader-builder","arguments"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_createSampleAndBlendFunctionSignature"):
   ("生成 sampleAndBlend 函数的签名（依据启用的 imagery 标志）。",["imagery","shader-builder","signature"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_defineUniforms"):
   ("向 ShaderBuilder 声明 imagery 阶段所需的 uniform。",["imagery","uniform","shader-builder"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_addAttributes"):
   ("向 render resources 添加 imagery 纹理坐标属性。",["imagery","attribute","render-resources"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_addImageryTexCoordAttributesToRenderResources"):
   ("批量添加 imagery 阶段需要的纹理坐标属性到 render resources。",["imagery","tex-coord","render-resources"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_addImageryTexCoordAttributeToRenderResources"):
   ("添加单个 imagery 纹理坐标属性到 render resources。",["imagery","tex-coord","render-resources"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_computeImageryFlags"):
   ("根据各 ImageryLayer 的非默认设置计算 ImageryFlags。",["imagery","flags","analysis"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_setImageryUniforms"):
   ("在每帧更新时把 imagery input 的值写入对应 uniform。",["imagery","uniform","update"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_createImageryUniforms"):
   ("为每个 imagery input 创建 uniform 对象。",["imagery","uniform","factory"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","_computeIndexMapping"):
   ("计算 imagery input 到 shader 数组索引的映射。",["imagery","index-mapping","shader-builder"]),
 # InstancingPipelineStage
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","getInstanceTransformsAsMatrices"):
   ("把所有实例变换（可能为矩阵或 vec3+旋转）收集为矩阵 TypedArray。",["instancing","transform","matrix"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","getInstanceTranslationsAsCartesian3s"):
   ("把实例平移属性收集为 Cartesian3 TypedArray。",["instancing","transform","translation"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","projectTransformsTo2D"):
   ("把实例变换矩阵投影到 2D（Columbus 视图）下的等价矩阵。",["instancing","2d-projection","transform"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","projectTranslationsTo2D"):
   ("把实例平移投影到 2D 下的等价平移。",["instancing","2d-projection","translation"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","computeReferencePoint2D"):
   ("计算实例集合在 2D 投影下的参考点。",["instancing","2d-projection","reference-point"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","processTransformAttributes"):
   ("分发实例变换属性的处理（矩阵形式或 vec3 形式）。",["instancing","pipeline-stage","dispatch"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","processTransformMatrixAttributes"):
   ("处理矩阵形式的实例变换属性。",["instancing","matrix","attribute"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","processTransformVec3Attributes"):
   ("处理 vec3 形式的实例变换属性（平移/旋转/缩放）。",["instancing","vec3","attribute"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","processMatrixAttributes"):
   ("把单个矩阵实例属性添加到顶点缓冲布局。",["instancing","matrix","buffer"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","processVec3Attribute"):
   ("把单个 vec3 实例属性添加到顶点缓冲布局。",["instancing","vec3","buffer"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","processFeatureIdAttributes"):
   ("处理实例化的 feature id 属性。",["instancing","feature-id","attribute"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","transformsToTypedArray"):
   ("把变换矩阵列表转为 Float32Array。",["instancing","typed-array","matrix"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","translationsToTypedArray"):
   ("把平移列表转为 Float32Array。",["instancing","typed-array","translation"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","createVertexBuffer"):
   ("为实例属性创建 GPU 顶点缓冲。",["instancing","buffer","gpu"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","getModelMatrixAndNodeTransform"):
   ("计算实例节点的模型矩阵与节点变换。",["instancing","transform","model-matrix"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","projectTransformTo2D"):
   ("把单个变换矩阵投影到 2D。",["instancing","2d-projection","matrix"]),
 ("packages/engine/Source/Scene/Model/InstancingPipelineStage.js","projectPositionTo2D"):
   ("把单个位置投影到 2D。",["instancing","2d-projection","position"]),
 # MaterialPipelineStage
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processMaterialUniforms"):
   ("处理通用 glTF 材质 uniform（baseColor、emissive 等）与纹理。",["material","uniform","pbr"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processMetallicRoughnessUniforms"):
   ("处理 PBR 金属粗糙度材质的 uniform 与纹理（baseColor、metallic、roughness）。",["material","pbr","metallic-roughness"]),
 ("packages/engine/Source/Scene/Scene/Model/SpecularGlossinessUniforms","processSpecularGlossinessUniforms") if False else
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processSpecularGlossinessUniforms"):
   ("处理 PBR 镜面光泽度（KHR_materials_pbrSpecularGlossiness）材质的 uniform 与纹理。",["material","pbr","specular-glossiness"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processSpecularUniforms"):
   ("处理 KHR_materials_specular 扩展的 uniform 与纹理。",["material","specular","extension"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processAnisotropyUniforms"):
   ("处理 KHR_materials_anisotropy 扩展的 uniform 与纹理。",["material","anisotropy","extension"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processClearcoatUniforms"):
   ("处理 KHR_materials_clearcoat 扩展的 uniform 与纹理。",["material","clearcoat","extension"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processLineStyleUniforms"):
   ("处理矢量瓦片 line style（线宽、端点/连接）的 uniform。",["material","line-style","vector-tile"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processTexture"):
   ("为单个材质纹理注入 uniform、define 与纹理变换。",["material","texture","uniform"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processTextureTransform"):
   ("处理 KHR_texture_transform 扩展的纹理平移/旋转/缩放。",["material","texture-transform","extension"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processTextureScale"):
   ("处理纹理缩放相关的 uniform。",["material","texture","scale"]),
 ("packages/engine/Source/Scene/Model/MaterialPipelineStage.js","processConstantLod"):
   ("处理常驻 LOD（constant LOD）纹理相关的 uniform 与 define。",["material","lod","texture"]),
 # MetadataPipelineStage
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","mapPropertyTablesToFeatureIdSets"):
   ("把 property table 映射到 primitive 的 feature id 集合，建立元数据与 feature 的关联。",["metadata","property-table","feature-id"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","declareMetadataTypeStructs"):
   ("为元数据类型在 shader 中声明对应的 struct。",["metadata","shader-builder","struct"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","declareStructsAndFunctions"):
   ("声明元数据阶段所需的 struct 与访问函数。",["metadata","shader-builder","declaration"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","addPropertyTexturePropertyMetadata"):
   ("为单个 property texture 属性生成 shader 中的元数据访问代码。",["metadata","property-texture","shader"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","addPropertyTablePropertyMetadata"):
   ("为单个 property table 属性生成 shader 中的元数据访问代码。",["metadata","property-table","shader"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","addPropertyAttributePropertyMetadata"):
   ("为单个 property attribute 属性生成 shader 中的元数据访问代码。",["metadata","property-attribute","shader"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","addPropertyMetadataClass"):
   ("为属性元数据添加 class 信息（min/max 等）的 shader 代码。",["metadata","class","shader"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","addPropertyMetadataStatistics"):
   ("为属性元数据添加统计信息的 shader 代码。",["metadata","statistics","shader"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","getPropertyTablesInfo"):
   ("收集 primitive 上所有 property table 的信息。",["metadata","property-table","info"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","getPropertyTableInfo"):
   ("收集单个 property table 的属性信息。",["metadata","property-table","info"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","getPropertyAttributesInfo"):
   ("收集 primitive 上所有 property attribute 的信息。",["metadata","property-attribute","info"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","getPropertyAttributeInfo"):
   ("收集单个 property attribute 的属性信息。",["metadata","property-attribute","info"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","getPropertyTexturesInfo"):
   ("收集 primitive 上所有 property texture 的信息。",["metadata","property-texture","info"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","getPropertyTextureInfo"):
   ("收集单个 property texture 的属性信息。",["metadata","property-texture","info"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","collectMetadataUsedByOtherStages"):
   ("收集被其他管线阶段（custom shader、点云样式）引用的 metadata property。",["metadata","analysis","cross-stage"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","collectMetadataUsedInCustomShader"):
   ("收集 CustomShader 中引用的 metadata property（区分 vertex/fragment）。",["metadata","custom-shader","analysis"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","collectMetadataUsedInPointCloudStyling"):
   ("收集点云样式引用的 metadata property。",["metadata","point-cloud","styling"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","addValueTransformUniforms"):
   ("为属性元数据的值变换（offset/scale）添加 uniform。",["metadata","uniform","transform"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","processPropertyAttributeProperty"):
   ("处理单个 property attribute 属性（设置变量名与 offset）。",["metadata","property-attribute","process"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","processPropertyTextureProperty"):
   ("处理单个 property texture 属性。",["metadata","property-texture","process"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","processPropertyTableProperty"):
   ("处理单个 property table 属性。",["metadata","property-table","process"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","getStructAssignments"):
   ("生成 struct 字段赋值的 shader 代码。",["metadata","struct","shader"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","propertyDestination"):
   ("决定某 property id 在 shader 中的目标位置（vertex/fragment）。",["metadata","property-id","routing"]),
 ("packages/engine/Source/Scene/Model/MetadataPipelineStage.js","convertToFloatComponents"):
   ("把元数据类型转换为对应的 float 分量数。",["metadata","type","conversion"]),
 # Model.js - key significant functions
 ("packages/engine/Source/Scene/Model/Model.js","Model"):
   ("Model 构造函数，校验并保存所有用户选项（资源、变换、样式、裁剪、影像、光照等），初始化内部状态。",["model","constructor","entry-point"]),
 ("packages/engine/Source/Scene/Model/Model.js","processLoader"):
   ("推进底层 loader（GltfLoader 等）的加载状态并在完成后构建场景图与特征表。",["model","loader","lifecycle"]),
 ("packages/engine/Source/Scene/Model/Model.js","buildDrawCommands"):
   ("为每个 runtime primitive 调用各管线阶段并组装最终的 DrawCommand。",["model","draw-command","rendering"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateModelMatrix"):
   ("检测 modelMatrix 变化并触发边界球、参考矩阵等相关更新。",["model","model-matrix","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateBoundingSphere"):
   ("根据当前模型矩阵重新计算世界空间包围球。",["model","bounding-sphere","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateComputedScale"):
   ("依据模型矩阵与帧状态计算 Model 的显示比例与距离缩放。",["model","scale","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateReferenceMatrices"):
   ("更新用于高度参考（clamp/relative）的相关矩阵与位置。",["model","height-reference","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateSceneGraph"):
   ("遍历并更新场景图节点的变换、动画与可见性。",["model","scene-graph","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","submitDrawCommands"):
   ("把构建好的 DrawCommand 提交给 FrameState 的渲染列表。",["model","draw-command","submit"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateClamping"):
   ("处理模型贴地/相对高度参考时的位置采样与回调。",["model","clamping","height-reference"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateCustomShader"):
   ("同步 CustomShader 配置变化到 shader 重建。",["model","custom-shader","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateEnvironmentMap"):
   ("在需要时请求/更新环境贴图（用于 IBL）。",["model","environment-map","ibl"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateFeatureTableId"):
   ("当 selected feature id 改变时切换特征表映射。",["model","feature-table","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateFeatureTables"):
   ("刷新 ModelFeatureTable 的内容与样式。",["model","feature-table","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updatePointCloudShading"):
   ("应用点云着色（点大小、衰减、基于眼睛的缩放）参数。",["model","point-cloud","shading"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateSilhouette"):
   ("根据是否需要轮廓渲染调整 pass。",["model","silhouette","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateClippingPlanes"):
   ("同步 ClippingPlaneCollection 状态到渲染资源。",["model","clipping","plane"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateClippingPolygons"):
   ("同步 ClippingPolygonCollection 状态到渲染资源。",["model","clipping","polygon"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateStyle"):
   ("应用颜色样式变化到 feature 表。",["model","style","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateStyleCommandsNeeded"):
   ("根据样式透明度变化重新决定需要的绘制命令集合。",["model","style","draw-command"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateSkipLevelOfDetail"):
   ("同步 skipLevelOfDetail 选项的缓存行为。",["model","lod","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateImageBasedLighting"):
   ("同步 ImageBasedLighting（IBL）资源变化。",["model","ibl","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateSceneMode"):
   ("响应场景模式（3D/Columbus/2D）切换。",["model","scene-mode","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateFog"):
   ("应用雾效衰减到模型渲染。",["model","fog","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateVerticalExaggeration"):
   ("应用垂直夸张比例到模型渲染。",["model","vertical-exaggeration","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","updatePickIds"):
   ("分配/刷新用于拾取的 pick id。",["model","picking","pick-id"]),
 ("packages/engine/Source/Scene/Model/Model.js","updateShowCreditsOnScreen"):
   ("同步 credit 的屏幕显示设置。",["model","credit","update"]),
 ("packages/engine/Source/Scene/Model/Model.js","passesDistanceDisplayCondition"):
   ("根据距离显示条件判断模型是否应被渲染。",["model","distance-display","culling"]),
 ("packages/engine/Source/Scene/Model/Model.js","scaleInPixels"):
   ("计算世界空间半径在屏幕上的像素尺寸。",["model","scale","pixels"]),
 ("packages/engine/Source/Scene/Model/Model.js","getUpdateHeightCallback"):
   ("返回用于高度参考贴地的高度更新回调。",["model","clamping","callback"]),
 ("packages/engine/Source/Scene/Model/Model.js","addCreditsToCreditDisplay"):
   ("把模型 credit 添加到场景的 credit 显示。",["model","credit","display"]),
 ("packages/engine/Source/Scene/Model/Model.js","makeModelOptions"):
   ("把用户传入的 options 规范化为内部 Model 使用的 modelOptions（含 loader 选择）。",["model","options","factory"]),
 ("packages/engine/Source/Scene/Model/Model.js","createModelFeatureTables"):
   ("由 structural metadata 构建 ModelFeatureTable。",["model","feature-table","factory"]),
 ("packages/engine/Source/Scene/Model/Model.js","selectFeatureTableId"):
   ("根据 primitive 的 feature id 情况选择主特征表。",["model","feature-table","selection"]),
 ("packages/engine/Source/Scene/Model/Model.js","isColorAlphaDirty"):
   ("检测样式颜色透明度是否发生变化。",["model","style","change-detection"]),
 ("packages/engine/Source/Scene/Model/Model.js","handleError"):
   ("统一处理加载/运行时错误并触发 error 事件。",["model","error-handling","event"]),
}

CLASS_META = {
 ("packages/engine/Source/Scene/Model/GeoJsonLoader.js","GeoJsonLoader"):
   ("ResourceLoader 实现：解析 GeoJSON 输入并产出可被 Model 渲染的 lines/points ModelComponents。",["loader","geojson","resource-loader"]),
 ("packages/engine/Source/Scene/Model/I3dmLoader.js","I3dmLoader"):
   ("3D Tiles i3dm 格式的 ResourceLoader：加载二进制头、batch/feature table，并构造实例化 ModelComponents。",["loader","i3dm","resource-loader"]),
 ("packages/engine/Source/Scene/Model/ImageryConfiguration.js","ImageryConfiguration"):
   ("ImageryLayer 外观设置的快照值对象，用于变更检测。",["imagery","configuration","value-object"]),
 ("packages/engine/Source/Scene/Model/ImageryFlags.js","ImageryFlags"):
   ("标志集合，指示 imagery 处理中需要启用的步骤。",["imagery","flags","value-object"]),
 ("packages/engine/Source/Scene/Model/ImageryInput.js","ImageryInput"):
   ("单个 imagery 纹理在 shader 采样所需的输入汇总。",["imagery","input","value-object"]),
 ("packages/engine/Source/Scene/Model/ImageryPipelineStage.js","ImageryPipelineStage"):
   ("影像叠加管线阶段类，把 ImageryLayer 纹理投影到 primitive 并生成采样/混合 shader。",["pipeline-stage","imagery","shader-builder"]),
 ("packages/engine/Source/Scene/Model/MappedPositions.js","MappedPositions"):
   ("在特定椭球上由笛卡尔位置转换得到的地理坐标集合及其包围矩形容器。",["imagery","cartographic","value-object"]),
}

# ------------------------------------------------------------------
# Build nodes
# ------------------------------------------------------------------
nodes = []
file_node_ids = set()

for path in files_in_batch:
    meta = FILE_META[path]
    node_id = f"file:{path}"
    file_node_ids.add(node_id)
    node = {
        "id": node_id,
        "type": meta["type"],
        "name": os.path.basename(path),
        "filePath": path,
        "summary": meta["summary"],
        "tags": meta["tags"],
        "complexity": meta["complexity"],
    }
    if "languageNotes" in meta:
        node["languageNotes"] = meta["languageNotes"]
    nodes.append(node)

# Add significant function/class nodes
def is_significant_fn(f):
    start, end = f.get("startLine",0), f.get("endLine",0)
    return (end - start + 1) >= 10

sub_nodes_per_file = {}  # path -> list of node ids

for path in files_in_batch:
    r = by_path[path]
    sub_nodes_per_file[path] = []
    # functions
    for f in r.get("functions", []):
        if not is_significant_fn(f):
            continue
        name = f["name"]
        key = (path, name)
        node_id = f"function:{path}:{name}"
        if key in FN_META:
            summary, tags = FN_META[key]
        else:
            # Generic summary for functions without hand-written metadata
            summary = f"{name} 函数。"
            tags = ["function"]
        nodes.append({
            "id": node_id,
            "type": "function",
            "name": name,
            "filePath": path,
            "lineRange": [f.get("startLine"), f.get("endLine")],
            "summary": summary,
            "tags": tags,
            "complexity": "simple" if (f.get("endLine",0)-f.get("startLine",0)+1) < 50 else "moderate",
        })
        sub_nodes_per_file[path].append(node_id)
    # classes
    for c in r.get("classes", []):
        name = c["name"]
        key = (path, name)
        node_id = f"class:{path}:{name}"
        if key in CLASS_META:
            summary, tags = CLASS_META[key]
        else:
            summary = f"{name} 类。"
            tags = ["class"]
        nodes.append({
            "id": node_id,
            "type": "class",
            "name": name,
            "filePath": path,
            "lineRange": [c.get("startLine"), c.get("endLine")],
            "summary": summary,
            "tags": tags,
            "complexity": "moderate",
        })
        sub_nodes_per_file[path].append(node_id)

# ------------------------------------------------------------------
# Build edges
# ------------------------------------------------------------------
edges = []
seen_edges = set()

def add_edge(s, t, ty, w):
    if s == t:
        return
    k = (s, t, ty)
    if k in seen_edges:
        return
    seen_edges.add(k)
    edges.append({"source": s, "target": t, "type": ty, "direction": "forward", "weight": w})

# imports (1:1 from batchImportData)
for path, imports in batch_imports.items():
    src = f"file:{path}"
    for tgt_path in imports:
        add_edge(src, f"file:{tgt_path}", "imports", 0.7)

# contains + exports for each sub-file node
for path, ids in sub_nodes_per_file.items():
    src = f"file:{path}"
    for nid in ids:
        add_edge(src, nid, "contains", 1.0)
        # exports edge if the symbol appears to be top-level (most Cesium files export default or named)
        # We'll emit exports for all sub-nodes since these are significant API surfaces
        add_edge(src, nid, "exports", 0.8)

# cross-batch calls (confidence edges from imports + neighborMap symbols)
# FeatureIdPipelineStage -> ModelComponents.Quantization etc already imports cover file-level.
# Model.js -> pickModel function
add_edge("file:packages/engine/Source/Scene/Model/Model.js",
         "function:packages/engine/Source/Scene/Model/pickModel.js:pickModel",
         "calls", 0.8)

print(f"Total nodes: {len(nodes)}")
print(f"Total edges: {len(edges)}")
print(f"Imports edges: {sum(len(v) for v in batch_imports.values())}")

# ------------------------------------------------------------------
# Decide split
# ------------------------------------------------------------------
nodeCount = len(nodes)
edgeCount = len(edges)
parts = 6
print(f"parts = {parts}")

# Partition files alphabetically
sorted_files = sorted(files_in_batch)
chunk_size = math.ceil(len(sorted_files) / parts)
file_chunks = [sorted_files[i*chunk_size:(i+1)*chunk_size] for i in range(parts)]
# ensure none empty
file_chunks = [c for c in file_chunks if c]
parts = len(file_chunks)

# Map file -> part index
file_to_part = {}
for i, chunk in enumerate(file_chunks, start=1):
    for p in chunk:
        file_to_part[p] = i

# Determine which file paths belong to each part (for filePath lookup)
def part_of_node(n):
    fp = n.get("filePath")
    return file_to_part.get(fp)

# Assign nodes to parts; edges follow their source node's part
part_nodes = {i: [] for i in range(1, parts+1)}
part_edges = {i: [] for i in range(1, parts+1)}
node_id_to_part = {}
for n in nodes:
    pi = part_of_node(n)
    if pi is None:
        # Fallback: put in part 1
        pi = 1
    part_nodes[pi].append(n)
    node_id_to_part[n["id"]] = pi

# Build global set of all node ids we know about (for validation of cross-part targets)
all_node_ids = set(n["id"] for n in nodes)

for e in edges:
    src_part = node_id_to_part.get(e["source"])
    if src_part is None:
        # source not in our nodes (cross-batch); assign by file path if possible
        # extract path from "file:..." id
        if e["source"].startswith("file:"):
            sp = e["source"][5:]
            src_part = file_to_part.get(sp, 1)
        else:
            src_part = 1
    part_edges[src_part].append(e)

# ------------------------------------------------------------------
# Write parts
# ------------------------------------------------------------------
for k in range(1, parts+1):
    out = {"nodes": part_nodes[k], "edges": part_edges[k]}
    out_path = os.path.join(OUT_DIR, f"batch-{BATCH_INDEX}-part-{k}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path}: {len(part_nodes[k])} nodes, {len(part_edges[k])} edges")
