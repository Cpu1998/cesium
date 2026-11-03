# Cesium 1.145 中文源码导读

> 分支：`study/1.145-annotated`（基于官方 tag `1.145`，仓库 fork 自 [CesiumGS/cesium](https://github.com/CesiumGS/cesium)）
> 读法：直接在 GitHub 网页上打开本仓库的源码文件，中文注释就贴在原代码旁边，配合本目录的文档对照阅读。

## 这是什么工程

Cesium 是最流行的开源三维地球引擎（WebGL）。本工程在 **不改动任何一行原有代码** 的前提下，
为 1.145 源码的 31 个关键文件插入 829 行成体系的中文导读注释，并配套六篇中文文档，
覆盖五大主题：**Viewer 创建、底图影像、Entity 数据、3D Tiles、帧渲染循环**。
工程已完结（2026-11-04），统计见下方「工程说明」。

适合读者：有前端基础（懂 DOM/事件/Promise）、第一次读 Cesium 源码的工程师。

## 文档索引（六篇导航）

| 顺序 | 文档 | 一句话摘要 | 对应源码主战场 |
|---|---|---|---|
| 00 | [00-总览-架构与目录地图.md](00-总览-架构与目录地图.md) | 三大包职责、engine 分层、一个坐标从数据到像素的端到端链路 | 目录地图 |
| 01 | [01-Viewer创建与场景初始化.md](01-Viewer创建与场景初始化.md) | `new Viewer()` 到第一帧渲染的完整时序逐段拆解 | `Viewer.js` / `CesiumWidget.js` |
| 02 | [02-底图与影像体系.md](02-底图与影像体系.md) | ImageryProvider/ImageryLayer/瓦片金字塔调度与 GPU 纹理的一生 | `Scene/Globe*`、`Scene/Imagery*` |
| 03 | [03-Entity数据体系.md](03-Entity数据体系.md) | Entity/Property 时间插值如何每帧同步成 GPU 图元 | `DataSources/*` |
| 04 | [04-3DTiles加载与LOD.md](04-3DTiles加载与LOD.md) | Tileset 加载、SSE/LOD 遍历、内容分派与缓存淘汰 | `Scene/Cesium3DTileset*`、`Scene/Cesium3DTile*` |
| 05 | [05-帧更新与渲染循环.md](05-帧更新与渲染循环.md) | 一帧的完整旅程：rAF→update→剔除分类→DrawCommand→WebGL，requestRenderMode 与请求调度 | `Scene/Scene.js`、`Core/RequestScheduler.js` |

## 推荐阅读路线

**快速线（约 30 分钟）**：先读 [00-总览](00-总览-架构与目录地图.md) 建立地图（10 分钟）→
直接跳 [05-帧更新与渲染循环.md §1–§2](05-帧更新与渲染循环.md) 看懂「一帧发生了什么」（15 分钟）→
按兴趣挑 02/03/04 任一篇的「动手实验」小节玩一把（5 分钟）。

**精读线（按序）**：`00 → 01 → 02 → 03 → 04 → 05`，每篇都以前一篇为前提；每读完一篇，
用 GitHub 网页打开该篇「对应源码主战场」列里的文件，顺着 `【导读】` 注释把源码走一遍。
05 的 §9 有一张「五棒 update 入口 ↔ 帧时间线位置」对照表，读完五篇后回看一次可把全书串起来。

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
  六篇中文文档 + 本 README，中文合计约 1.4 万字；28 个中文 commit。
- **五棒接力主题**：
  1. Phase 1 总览 + Viewer/CesiumWidget 创建（`Viewer.js`、`CesiumWidget.js`，文档 00/01）
  2. Phase 2 底图与影像体系（`ImageryLayer*`、`Globe*`、`QuadtreePrimitive` 等 9 文件，文档 02）
  3. Phase 3 Entity 数据体系（`Entity`、`DataSourceDisplay`、各 Visualizer 等 8 文件，文档 03）
  4. Phase 4 3D Tiles（`Cesium3DTileset`、`Cesium3DTile`、内容分派等 9 文件，文档 04）
  5. Phase 5 帧更新与渲染循环 + 收尾（`Scene.js`、`RequestScheduler.js`、`Context/DrawCommand`，
     文档 05 与本 README 定稿）
- **交接记录**：各棒的详细文件/方法清单与交接提示归档在 [PROGRESS.md](PROGRESS.md)（历史记录，已入库）。
- **后续可深挖方向**：Model/glTF 渲染管线（`Scene/Model/`）、Renderer 细节（RenderState/OIT/深度拷贝链）、
  拾取系统全链、ComputeCommand 影像重投影（见 [05 §10](05-帧更新与渲染循环.md)）。

## 上游与同步

- 上游：`upstream` = CesiumGS/cesium；发布分支：`origin` = Cpu1998/cesium 的 `study/1.145-annotated`。
- 本分支基点：tag `1.145`（commit `845a06b` 的直接后续）。
