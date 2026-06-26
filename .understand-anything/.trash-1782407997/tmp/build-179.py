import json

nodes = []
edges = []

# 1) CesiumTerrainTileJson layer.json configs
def add(node):
    nodes.append(node)

layer_base = "Specs/Data/CesiumTerrainTileJson"

# Each layer.json is a tilejson descriptor for quantized-mesh terrain test data
layer_files = [
    ("QuantizedMeshWithParentUrlMetadataAvailability/ChildTileset/layer.json", 38, "ChildTileset",
     "ChildTileset 的 tilejson layer 描述文件，声明 quantized-mesh 格式、parent URL 模板及 metadataavailability 扩展，供 terrain 加载测试使用。"),
    ("QuantizedMeshWithParentUrlMetadataAvailability/layer.json", 36, "ParentUrlMetadataAvailability",
     "quantized-mesh 测试 layer.json，配置 tile 模板、metadataavailability 扩展与可用瓦片范围（available 数组），用于验证带 parent URL 的地形瓦片加载。"),
    ("QuantizedMeshWithUnknownExt/layer.json", 27, "UnknownExt",
     "quantized-mesh 测试 layer.json，包含一个未知扩展（unknownext），用于验证解析器对未识别扩展的容错处理。"),
    ("QuantizedMeshWithVertexNormals/layer.json", 30, "VertexNormals",
     "quantized-mesh 测试 layer.json，声明 vertexnormals 扩展与瓦片可用性，用于测试带顶点法线的地形瓦片解析。"),
    ("QuantizedMeshWithVertexNormalsAndUnknownExt/layer.json", 30, "VertexNormalsAndUnknownExt",
     "quantized-mesh 测试 layer.json，同时声明 vertexnormals 扩展与一个未知扩展，用于测试混合扩展场景下的解析行为。"),
    ("QuantizedMeshWithWaterMask/layer.json", 30, "WaterMask",
     "quantized-mesh 测试 layer.json，声明 watermask 扩展，用于测试带水域遮罩的地形瓦片加载。"),
]

for rel, lines, variant, summary in layer_files:
    path = f"{layer_base}/{rel}"
    add({
        "id": f"config:{path}",
        "type": "config",
        "name": "layer.json",
        "filePath": path,
        "summary": summary,
        "tags": ["test-fixture", "tilejson", "quantized-mesh", "terrain", "configuration"],
        "complexity": "simple",
    })

# 2) terrain binary tiles
terrain_files = [
    ("QuantizedMeshWithParentUrlMetadataAvailability/tile.metadataavailability.terrain", 107,
     "带 metadataavailability 扩展的 quantized-mesh 二进制地形瓦片测试样本，供地形解析器单元测试使用。"),
    ("QuantizedMeshWithUnknownExt/tile.unknownext.terrain", 75,
     "包含未知扩展数据的 quantized-mesh 二进制地形瓦片样本，用于验证解析器跳过未识别扩展的能力。"),
    ("QuantizedMeshWithVertexNormals/tile.vertexnormals.terrain", 40,
     "带顶点法线扩展的 quantized-mesh 二进制地形瓦片样本，用于测试法线数据的解析。"),
    ("QuantizedMeshWithVertexNormalsAndUnknownExt/tile.vertexnormals.unknownext.terrain", 77,
     "同时包含顶点法线与未知扩展的 quantized-mesh 二进制地形瓦片样本，用于测试复合扩展解析。"),
    ("QuantizedMeshWithWaterMask/tile.watermask.terrain", 42,
     "带水域遮罩扩展的 quantized-mesh 二进制地形瓦片样本，用于测试水域遮罩数据解析。"),
    ("GoogleEarthEnterprise/gee.terrain", 12,
     "Google Earth Enterprise 格式的地形测试数据样本，用于 GEE 地形提供者的单元测试。"),
]
for rel, lines, summary in terrain_files:
    if rel.startswith("GoogleEarthEnterprise"):
        path = f"Specs/Data/{rel}"
    else:
        path = f"{layer_base}/{rel}"
    add({
        "id": f"file:{path}",
        "type": "file",
        "name": path.split("/")[-1],
        "filePath": path,
        "summary": summary,
        "tags": ["test-fixture", "binary", "quantized-mesh", "terrain", "data"],
        "complexity": "simple",
    })

# Google Earth Enterprise metadata
gee_meta = "Specs/Data/GoogleEarthEnterprise/gee.metadata"
add({
    "id": f"file:{gee_meta}",
    "type": "file",
    "name": "gee.metadata",
    "filePath": gee_meta,
    "summary": "Google Earth Enterprise 元数据测试样本文件，与 gee.terrain 配套供 GEE 地形/影像提供者测试使用。",
    "tags": ["test-fixture", "metadata", "google-earth-enterprise", "data"],
    "complexity": "simple",
})

# 3) CZML test documents
czml_base = "Specs/Data/CZML"
czml_files = [
    ("simple.czml", 3696,
     "Cesium CZML 综合测试文档，涵盖多种 packet 类型（点、线、面、模型、属性插值等），是 CZML 解析与可视化测试的主力样本。", "complex"),
    ("TwoSats.czml", 1260,
     "包含两颗卫星轨道的 CZML 测试文档，用于验证多 packet 场景下 position/orientation 的轨道演算与渲染。", "complex"),
    ("TwoSatsOrientation.czml", 1263,
     "带显式 orientation 的双卫星 CZML 测试文档，用于验证姿态插值与参考系变换。", "complex"),
    ("TwoSatsRelativeReferenceEnds.czml", 896,
     "使用相对参考（relative reference）且参考 packet 在文档两端的双卫星 CZML 测试文档，用于验证前向与后向引用解析。", "complex"),
    ("ValidationDocument.czml", 21099,
     "超大型的 CZML 协议验证文档，覆盖 CZML 规范几乎所有字段与数据类型，用于验证解析器对完整规范的健壮性。", "complex"),
    ("Vehicle.czml", 487,
     "以载具（Vehicle）为主体的 CZML 测试文档，包含 position、orientation 与图形属性，用于验证基本 packet 加载。", "moderate"),
]
for name, lines, summary, complexity in czml_files:
    path = f"{czml_base}/{name}"
    add({
        "id": f"file:{path}",
        "type": "file",
        "name": name,
        "filePath": path,
        "summary": summary,
        "tags": ["test-fixture", "czml", "data-format", "cesium", "data"],
        "complexity": complexity,
    })

# 4) CSS font file
css_path = "Specs/Data/Fonts/OpenSans-Main.css"
add({
    "id": f"file:{css_path}",
    "type": "file",
    "name": "OpenSans-Main.css",
    "filePath": css_path,
    "summary": "声明 @font-face 规则，加载 Open Sans 字体的 woff 资源（OpenSansNormal400.woff），供 Cesium 文本/标签渲染测试使用。",
    "tags": ["test-fixture", "font-face", "css", "webfont", "markup"],
    "complexity": "simple",
})

# 5) GPX
gpx_path = "Specs/Data/GPX/simple.gpx"
add({
    "id": f"file:{gpx_path}",
    "type": "file",
    "name": "simple.gpx",
    "filePath": gpx_path,
    "summary": "简单的 GPX 1.1 测试文档，包含若干 waypoint（wpt），用于验证 Cesium 的 GPX 导入与地理要素加载。",
    "tags": ["test-fixture", "gpx", "xml", "geospatial", "data"],
    "complexity": "simple",
})

# 6) KML / KMZ
kml_files = [
    ("Specs/Data/KML/backslash.kmz", 7, "backslash.kmz",
     "包含反斜杠路径转义场景的 KMZ（压缩 KML）测试样本，用于验证 KML 加载器对特殊字符路径的处理。", "simple"),
    ("Specs/Data/KML/duplicateNamespace.kml", 18, "duplicateNamespace.kml",
     "包含重复 XML 命名空间声明的 KML 测试文档，用于验证 KML 解析器对重复命名空间的容错处理。", "simple"),
    ("Specs/Data/KML/duplicateNamespace.kmz", 2, "duplicateNamespace.kmz",
     "压缩形式的 duplicateNamespace KML 文档（KMZ），用于验证 KMZ 解包与命名空间去重的组合行为。", "simple"),
    ("Specs/Data/KML/empty.kmz", 3, "empty.kmz",
     "空的 KMZ 测试样本，用于验证 KMZ 加载器对空压缩包的边界条件处理。", "simple"),
]
for path, lines, name, summary, complexity in kml_files:
    add({
        "id": f"file:{path}",
        "type": "file",
        "name": name,
        "filePath": path,
        "summary": summary,
        "tags": ["test-fixture", "kml", "kmz", "geospatial", "data"],
        "complexity": complexity,
    })

# Edges: these are pure data fixtures with no imports. We capture logical
# fixture-grouping relationships (config layer.json -> its binary terrain tile,
# and the GEE metadata -> terrain pair) using 'related' edges.

# layer.json -> its terrain tile (within each QuantizedMesh* dir)
layer_terrain_pairs = [
    ("QuantizedMeshWithParentUrlMetadataAvailability/layer.json",
     "QuantizedMeshWithParentUrlMetadataAvailability/tile.metadataavailability.terrain"),
    ("QuantizedMeshWithUnknownExt/layer.json",
     "QuantizedMeshWithUnknownExt/tile.unknownext.terrain"),
    ("QuantizedMeshWithVertexNormals/layer.json",
     "QuantizedMeshWithVertexNormals/tile.vertexnormals.terrain"),
    ("QuantizedMeshWithVertexNormalsAndUnknownExt/layer.json",
     "QuantizedMeshWithVertexNormalsAndUnknownExt/tile.vertexnormals.unknownext.terrain"),
    ("QuantizedMeshWithWaterMask/layer.json",
     "QuantizedMeshWithWaterMask/tile.watermask.terrain"),
]
for layer_rel, terrain_rel in layer_terrain_pairs:
    src = f"config:{layer_base}/{layer_rel}"
    tgt = f"file:{layer_base}/{terrain_rel}"
    edges.append({"source": src, "target": tgt, "type": "related",
                  "direction": "forward", "weight": 0.5})

# ChildTileset layer.json related to its parent layer.json
child = f"config:{layer_base}/QuantizedMeshWithParentUrlMetadataAvailability/ChildTileset/layer.json"
parent = f"config:{layer_base}/QuantizedMeshWithParentUrlMetadataAvailability/layer.json"
edges.append({"source": child, "target": parent, "type": "related",
              "direction": "forward", "weight": 0.5})

# GEE metadata -> terrain
edges.append({"source": f"file:Specs/Data/GoogleEarthEnterprise/gee.metadata",
              "target": f"file:Specs/Data/GoogleEarthEnterprise/gee.terrain",
              "type": "related", "direction": "forward", "weight": 0.5})

# CSS -> woff resource is external (not in batch) — skip to avoid dangling.

out = {"nodes": nodes, "edges": edges}
with open(".understand-anything/intermediate/batch-179.json", "w") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)

print(f"Nodes: {len(nodes)}")
print(f"Edges: {len(edges)}")
# self-edge check
for e in edges:
    assert e["source"] != e["target"], e
# duplicate id check
ids = [n["id"] for n in nodes]
assert len(ids) == len(set(ids)), "dup ids"
print("validation OK")
