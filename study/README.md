# Cesium 1.145 中文源码导读

> 分支：`study/1.145-annotated`（基于官方 tag `1.145`，仓库 fork 自 [CesiumGS/cesium](https://github.com/CesiumGS/cesium)）
> 读法：直接在 GitHub 网页上打开本仓库的源码文件，中文注释就贴在原代码旁边，配合本目录的文档对照阅读。

## 这是什么工程

Cesium 是最流行的开源三维地球引擎（WebGL）。本工程在 **不改动任何一行原有代码** 的前提下，
为 1.145 源码的 31 个关键文件插入 829 行成体系的中文导读注释，并配套十七篇中文文档，
覆盖十四大主题：**Viewer 创建、底图影像、Entity 数据、3D Tiles、帧渲染循环、相机与视角控制、地形系统、拾取、几何图元与材质、时间与动态属性、坐标变换、事件与交互、渲染命令与着色器、向量数据源**。
首轮五棒已完结（2026-11-04）；2026-11-05/06 接力扩展篇 06–14 已全部落盘，全书收官，统计见下方「工程说明」。

适合读者：有前端基础（懂 DOM/事件/Promise）、第一次读 Cesium 源码的工程师。

## 文档索引（十七篇 · 五组 + 加餐导航）

> 组内按编号即阅读序；「顺序」列是全书通篇编号，跨组交叉引用都用它。

### 🗺️ 入门总览（先读这两篇建立地图）

| 顺序 | 文档 | 一句话摘要 | 对应源码主战场 |
|---|---|---|---|
| 00 | [00-总览-架构与目录地图.md](00-总览-架构与目录地图.md) | 三大包职责、engine 分层、一个坐标从数据到像素的端到端链路 | 目录地图 |
| 01 | [01-Viewer创建与场景初始化.md](01-Viewer创建与场景初始化.md) | `new Viewer()` 到第一帧渲染的完整时序逐段拆解 | [`Viewer.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/widgets/Source/Viewer/Viewer.js) / [`CesiumWidget.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Widget/CesiumWidget.js) |

### 📦 数据与加载（数据从哪来、怎么进场景）

| 顺序 | 文档 | 一句话摘要 | 对应源码主战场 |
|---|---|---|---|
| 02 | [02-底图与影像体系.md](02-底图与影像体系.md) | ImageryProvider/ImageryLayer/瓦片金字塔调度与 GPU 纹理的一生 | `Scene/Globe*`、`Scene/Imagery*` |
| 04 | [04-3DTiles加载与LOD.md](04-3DTiles加载与LOD.md) | Tileset 加载、SSE/LOD 遍历、内容分派与缓存淘汰 | `Scene/Cesium3DTileset*`、`Scene/Cesium3DTile*` |
| 07 | [07-地形系统.md](07-地形系统.md) | TerrainProvider 接口、四叉树三拍帧调度、SSE/几何误差 LOD 公式、瓦片两级状态机与 quantized-mesh 格式、地形×影像分层 | [`GlobeSurfaceTileProvider.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/GlobeSurfaceTileProvider.js)、[`QuadtreePrimitive.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/QuadtreePrimitive.js)、[`TerrainProvider.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/TerrainProvider.js) |
| 14 | [14-向量数据源.md](14-向量数据源.md) | GeoJSON/KML/GPX 向量数据源 load 管线与 crs 分支、KMZ 解包与 NetworkLink 刷新、DataSourceCollection 次序、EntityCluster 点聚合 | [`GeoJsonDataSource.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/GeoJsonDataSource.js)、[`KmlDataSource.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/KmlDataSource.js)、[`EntityCluster.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/EntityCluster.js) |

### 🧩 Entity 与动态（声明式数据的模型与时间维度）

| 顺序 | 文档 | 一句话摘要 | 对应源码主战场 |
|---|---|---|---|
| 03 | [03-Entity数据体系.md](03-Entity数据体系.md) | Entity/Property 时间插值如何每帧同步成 GPU 图元 | `DataSources/*` |
| 10 | [10-时间与动态属性.md](10-时间与动态属性.md) | JulianDate 双字段 TAI 表示、Clock 双闸门×ClockStep×ClockRange、onTick 事件流与 Timeline、Property 全家福、SampledProperty 从采样到插值、CZML 时间轴解析 | [`JulianDate.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/JulianDate.js)、[`Clock.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/Clock.js)、[`SampledProperty.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/SampledProperty.js)、[`CzmlDataSource.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/CzmlDataSource.js) |
| 11 | [11-坐标变换.md](11-坐标变换.md) | 坐标系全景表、Matrix3/4 列主序与四元数、椭球正反解与测地线、ENU/NED 生成器、worldToWindowCoordinates 完整链与「七级变换瀑布」、ModelMatrix 落点 | [`Transforms.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/Transforms.js)、[`Ellipsoid.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/Ellipsoid.js)、[`Matrix4.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/Matrix4.js)、[`SceneTransforms.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/SceneTransforms.js) |

### 🎨 渲染管线（一帧的内部世界）

| 顺序 | 文档 | 一句话摘要 | 对应源码主战场 |
|---|---|---|---|
| 05 | [05-帧更新与渲染循环.md](05-帧更新与渲染循环.md) | 一帧的完整旅程：rAF→update→剔除分类→DrawCommand→WebGL，requestRenderMode 与请求调度 | [`Scene.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Scene.js)、[`RequestScheduler.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/RequestScheduler.js) |
| 09 | [09-几何图元与材质.md](09-几何图元与材质.md) | Geometry/GeometryInstance 数据模型、几何工厂顶点计算、Primitive 合批与 VAO 上传、Fabric 材质→shader 生成、贴地分类 GroundPrimitive | [`Primitive.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Primitive.js)、[`Material.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Material.js)、[`GeometryVisualizer.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/GeometryVisualizer.js) |
| 13 | [13-渲染命令与着色器.md](13-渲染命令与着色器.md) | DrawCommand 字段与变体容器、Pass 通道枚举与多视锥分箱编队、derivedCommands 变体家族（pick/logDepth/HDR/阴影）、ShaderSource 内置注入与 ShaderCache、Context.draw 终点三步、ComputeCommand 计算旁支 | [`DrawCommand.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Renderer/DrawCommand.js)、[`ShaderSource.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Renderer/ShaderSource.js)、[`Context.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Renderer/Context.js)、[`Scene.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Scene.js) |

### 🖱️ 相机与交互（输入、视角与选取）

| 顺序 | 文档 | 一句话摘要 | 对应源码主战场 |
|---|---|---|---|
| 06 | [06-相机系统与视角控制.md](06-相机系统与视角控制.md) | 相机数据模型（position/dir/up/right + 参考系）、HPR 派生量、setView/lookAt/flyTo 调用链、视锥体系与多视锥、世界↔屏幕坐标 | [`Camera.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Camera.js)、[`SceneTransforms.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/SceneTransforms.js) |
| 08 | [08-拾取系统.md](08-拾取系统.md) | 颜色编码拾取：pick pass 重画场景→读像素反查对象、pickPosition 深度复原、drillPick 逐层钻取、射线拾取家族 | [`Picking.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Picking.js)、[`PickFramebuffer.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/PickFramebuffer.js)、[`PickDepth.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/PickDepth.js) |
| 12 | [12-事件与交互.md](12-事件与交互.md) | ScreenSpaceEventHandler 事件抽象（DOWN/UP/MOVE/DOUBLE_CLICK + 修饰键）、触摸翻译（长按=右键/双指=捏合）、Viewer 默认点选与双击跟踪、selectedEntity/trackedEntity 事件流、事件→相机操作翻译层、一次 LEFT_CLICK 全链时序 | [`ScreenSpaceEventHandler.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/ScreenSpaceEventHandler.js)、[`ScreenSpaceCameraController.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/ScreenSpaceCameraController.js)、[`Viewer.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/widgets/Source/Viewer/Viewer.js) |

### 🍱 加餐篇（专题深潜，按需选读）

| 顺序 | 文档 | 一句话摘要 | 对应源码主战场 |
|---|---|---|---|
| 15 | [15-Model与glTF加载.md](15-Model与glTF加载.md) | Model 两层架构（Components 组件树 × SceneGraph 运行时）、GltfLoader 异步状态机与三级 stages、ResourceCache 缓存、动画骨架链、特性样式 BatchTexture、heightReference 贴地四态 | [`Model.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Model.js)、[`Model/ModelSceneGraph.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Model/ModelSceneGraph.js)、[`GltfLoader.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/GltfLoader.js) |
| 16 | [16-性能调试与优化.md](16-性能调试与优化.md) | 测量→锚点→调参完整工具链：requestRenderMode 按需渲染、帧率观测三件套、debug 家族与 Inspector、内存三本账、缓存/LOD 上限、拾取限流、问题→工具→锚点→调参四列速查表 + 上线前检查单 | [`Scene.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Scene.js)、[`FrameRateMonitor.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/FrameRateMonitor.js)、[`ResourceCacheStatistics.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/ResourceCacheStatistics.js) |

## 推荐阅读路线

**快速线（约 30 分钟）**：先读 [00-总览](00-总览-架构与目录地图.md) 建立地图（10 分钟）→
直接跳 [05-帧更新与渲染循环.md §1–§2](05-帧更新与渲染循环.md) 看懂「一帧发生了什么」（15 分钟）→
按兴趣挑 02/04/06–14 任一篇的「动手实验」小节玩一把（5 分钟）。

**精读线（按序）**：`00 → 01 → 02 → 03 → 04 → 05`，每篇都以前一篇为前提；06/07（相机、地形）可与 02–05 并行穿插阅读；每读完一篇，
用 GitHub 网页打开该篇「对应源码主战场」列里的文件，顺着 `【导读】` 注释把源码走一遍。
05 的 §9 有一张「五棒 update 入口 ↔ 帧时间线位置」对照表，读完五篇后回看一次可把全书串起来；
08/09（拾取、几何材质）可与 03–05 并行穿插阅读；
10（时间与动态属性）建议紧跟在 03 之后读（同是 DataSources 主战场，互补视角）；
11（坐标变换）建议与 06 §7 配对读，读完再看 08/09 会更顺；
12（事件与交互）建议与 06 §8、08 §7 配对读，补齐「输入→拾取→选中/跟踪」闭环；
13（渲染命令与着色器）是 05 §5 的下潜续篇，读完再回看 09 §4 的合批装配会有完整命令层视角；
14（向量数据源）是 03 的数据入口姊妹篇（谁在造 Entity：GeoJSON/KML/CZML 的适配器全景），读完可随时回头翻；
15（Model 与 glTF）建议在 04/09/13 之后读（新一代 Model 架构与旧 Primitive 路径对照着看才不吃力）；
16（性能调试）通读全书后当手册用——排查卡顿时按 §1 决策树选工具，上线前过 §15 检查单；
做业务开发可先走「入门总览 → 03 → 14 → 06/12」捷径，再按需补渲染组。

## 如何在本分支对照源码读注释

1. 注释只在 `study/1.145-annotated` 分支上：GitHub 网页切换到该分支（或本地 `git checkout study/1.145-annotated`）。
2. 打开任一被注文件（清单见「工程说明」），中文注释以 `// 【导读】` 开头，紧跟被解释的代码；
   文件头 8–15 行的 `// ═══ 【导读】…` 块是本文件总览，先读它再往下走。
3. 快速定位：GitHub 文件页按 `t` 或浏览器 `Ctrl+F` 搜「【导读】」即可逐条跳。
4. 注释里引用源码一律用「路径 + 函数名」（不用行号，因为插注释会让行号漂移）；
   深入内容外置在 `study/*.md`，注释尾注「详见 study/xx-….md §n」。
5. 验证注释纯净性（可选）：
   ```bash
   git diff -U0 845a06b..HEAD -- '*.js' \
     | grep -vE '^\+.*(【导读】)' | grep -E '^\+[^+]'   # 输出应为空 = 新增行全是注释
   git diff 845a06b..HEAD -- '*.js' | grep -cE '^-[^-]'  # 输出 0 = 没删改任何原行
   ```

## 注释规范（全书统一）

1. **只插不改**：只允许插入全新的注释行；禁止修改、删除、移动任何既有代码行
   （包括空行与英文注释）。不碰 GLSL / JSON / Spec 文件，只碰 `.js`。
2. **文件头导读块**：每个精读文件在文件头（首个 import 之前）插入 8~15 行块注释，
   以 `// ═══ 【导读】` 开头，概述本文件职责、主链路、配套文档。
3. **行内导读**：函数/关键逻辑处插入 `// 【导读】…` 整行中文注释；每个注释行 ≤120 字符。
4. **每一行新增注释都必须含 `【导读】` 标记**（包括文件头块的续行），
   这样可以用一条命令验证"没有夹带任何新增代码行"（命令见上节第 5 条）。
5. **引用方式**：引用源码一律用「文件路径 + 函数名」，**不用行号**——注释会让行号漂移。
6. **深入内容外置**：代码里只放一两句提纲式注释，深入解读写进 `study/*.md`，
   并在注释尾注「详见 study/xx-….md §n」。

## 工程说明

- **基点**：官方 tag `1.145`（commit `845a06b` 的直接后续）；发布分支 `study/1.145-annotated`。
- **成果统计**：31 个 `.js` 源码文件、829 行纯中文导读注释（零代码改动，已用上节命令终验）；
  十七篇中文文档 + 本 README（00–05 为首轮五棒成果，06–14 为 2026-11-05/06 接力新增，15–16 为加餐篇，代码引用全部行级链接化：
  全书代码链接 2054 个、文档间相对链接 189 个，`node study/tools/check-links.mjs` 全绿）；30+ 中文 commit。
- **五棒接力主题**：
  1. Phase 1 总览 + Viewer/CesiumWidget 创建（[`Viewer.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/widgets/Source/Viewer/Viewer.js)、[`CesiumWidget.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Widget/CesiumWidget.js)，文档 00/01）
  2. Phase 2 底图与影像体系（`ImageryLayer*`、`Globe*`、[`QuadtreePrimitive`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/QuadtreePrimitive.js#L50) 等 9 文件，文档 02）
  3. Phase 3 Entity 数据体系（[`Entity`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/Entity.js#L135)、[`DataSourceDisplay`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/DataSources/DataSourceDisplay.js#L42)、各 Visualizer 等 8 文件，文档 03）
  4. Phase 4 3D Tiles（[`Cesium3DTileset`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Cesium3DTileset.js#L219)、[`Cesium3DTile`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Cesium3DTile.js#L71)、内容分派等 9 文件，文档 04）
  5. Phase 5 帧更新与渲染循环 + 收尾（[`Scene.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/Scene.js)、[`RequestScheduler.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Core/RequestScheduler.js)、[`Context.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Renderer/Context.js)/[`DrawCommand.js`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Renderer/DrawCommand.js#L76)，
     文档 05 与本 README 定稿）
- **交接记录**：各棒的详细文件/方法清单与交接提示归档在 [PROGRESS.md](PROGRESS.md)（历史记录，已入库）。
- **后续可深挖方向（加餐候选）**：~~Model/glTF 渲染管线~~、~~性能调试与内存剖析~~（均已落盘为 [15](15-Model与glTF加载.md)/[16](16-性能调试与优化.md)）；
  天空/光照/大气（SkyAtmosphere、Sun/Moon、光照与 IBL）、点云/粒子（[`PointCloud`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/PointCloud.js)、[`ParticleSystem`](https://github.com/Cpu1998/cesium/blob/study/1.145-annotated/packages/engine/Source/Scene/ParticleSystem.js)）、
  裁剪与开挖（ClippingPolygonCollection/ClippingPlane）、实战速查（常见业务配方索引篇）；
  Renderer 剩余细节（OIT/深度拷贝链/GaussianSplat）与事件/命令层已见 [12](12-事件与交互.md)/[13](13-渲染命令与着色器.md)；ComputeCommand 影像重投影见 [05 §10](05-帧更新与渲染循环.md)；向量数据源已落盘为 [14](14-向量数据源.md)。

## 上游与同步

- 上游：`upstream` = CesiumGS/cesium；发布分支：`origin` = Cpu1998/cesium 的 `study/1.145-annotated`。
- 本分支基点：tag `1.145`（commit `845a06b` 的直接后续）。
