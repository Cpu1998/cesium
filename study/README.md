# Cesium 1.145 中文源码导读

> 分支：`study/1.145-annotated`（基于官方 tag `1.145`，仓库 fork 自 [CesiumGS/cesium](https://github.com/CesiumGS/cesium)）
> 读法：直接在 GitHub 网页上打开本仓库的源码文件，中文注释就贴在原代码旁边，配合本目录的文档对照阅读。

## 这是什么工程

Cesium 是最流行的开源三维地球引擎（WebGL）。本工程在 **不改动任何一行原有代码** 的前提下，
为 1.145 源码的关键文件插入成体系的中文导读注释，并配套五篇（+总览共六篇）中文文档，
覆盖五大主题：**Viewer 创建、底图影像、Entity 数据、3D Tiles、帧渲染循环**。

适合读者：有前端基础（懂 DOM/事件/Promise）、第一次读 Cesium 源码的工程师。

## 文档索引与阅读顺序

按 `00 → 01 → 02 → 03 → 04 → 05` 顺序读，每篇都以前一篇为前提：

| 顺序 | 文档 | 讲什么 | 对应源码主战场 |
|---|---|---|---|
| 00 | [00-总览-架构与目录地图.md](00-总览-架构与目录地图.md) | 三大包职责、engine 分层、一个坐标从数据到像素的端到端链路、对象树 | 目录地图 |
| 01 | [01-Viewer创建与场景初始化.md](01-Viewer创建与场景初始化.md) | `new Viewer()` 到第一帧渲染的完整时序逐段拆解 | `Viewer.js` / `CesiumWidget.js` |
| 02 | [02-底图与影像体系.md](02-底图与影像体系.md) | ImageryProvider/ImageryLayer/瓦片调度与 GPU 纹理 | `Scene/Globe*`、`Scene/Imagery*` |
| 03 | [03-Entity数据体系.md](03-Entity数据体系.md) | Entity/Property/DataSourceCollection/DataSourceDisplay | `DataSources/*` |
| 04 | 04-3DTiles加载与调度.md（第 4 棒） | Tileset 添加、LOD 调度、瓦片渲染 | `Scene/Cesium3DTileset*` |
| 05 | 05-帧渲染循环.md（第 5 棒） | requestAnimationFrame 主循环、Scene.render 多 Pass、requestRenderMode | `Scene/Scene.js` |

## 注释规范（全书统一，各棒接力时必须遵守）

1. **只插不改**：只允许插入全新的注释行；禁止修改、删除、移动任何既有代码行
   （包括空行与英文注释）。不碰 GLSL / JSON / Spec 文件，只碰 `.js`。
2. **文件头导读块**：每个精读文件在文件头（首个 import 之前）插入 8~15 行块注释，
   以 `// ═══ 【导读】` 开头，概述本文件职责、主链路、配套文档。
3. **行内导读**：函数/关键逻辑处插入 `// 【导读】…` 整行中文注释；每个注释行 ≤120 字符。
4. **每一行新增注释都必须含 `【导读】` 标记**（包括文件头块的续行），
   这样可以用一条命令验证"没有夹带任何新增代码行"：
   ```bash
   git diff -U0 | grep -vE '^\+.*(【导读】)' | grep -E '^\+[^+]'   # 输出应为空（markdown 文件除外）
   ```
5. **引用方式**：引用源码一律用「文件路径 + 函数名」（如 `packages/engine/Source/Widget/CesiumWidget.js` 的
   `CesiumWidget.prototype.render`），**不用行号**——注释会让行号漂移。
6. **深入内容外置**：代码里只放一两句提纲式注释，深入解读写进 `study/*.md`，
   并在注释尾注「详见 study/xx-….md §n」。
7. **接力标记**：属于后续棒次深挖的主题（帧循环细节、影像管线、Entity、3D Tiles），
   注释里明确写「第 N 棒深挖」，避免重复劳动。

## 工程结构与接力

- 本导读由 5 棒接力完成（Phase 1 总览+Viewer → Phase 2 影像 → Phase 3 Entity → Phase 4 3D Tiles → Phase 5 帧循环+收尾）。
- `study/PROGRESS.md` 记录各棒进度（该文件通过 `.git/info/exclude` 排除，不入库）。
- 各棒完成后：`node --check` 所有改动文件 → 用上面第 4 条命令验收 → 中文 commit（`docs(study): …` 风格）→ push。

## 上游与同步

- 上游：`upstream` = CesiumGS/cesium；发布分支：`origin` = Cpu1998/cesium 的 `study/1.145-annotated`。
- 本分支基点：tag `1.145`（commit `845a06b` 的直接后续）。
