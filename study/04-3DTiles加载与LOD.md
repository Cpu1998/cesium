# 04 · 3D Tiles：从 tileset.json 到画面上的城市模型

> 阅读前提：读完 [00-总览](00-总览-架构与目录地图.md)（知道 Scene/PrimitiveCollection 是什么）。
> 本文回答一个问题：**`await Cesium3DTileset.fromUrl(url)` 然后 `scene.primitives.add(tileset)` 之后，
> 城市模型是怎么按镜头远近一级级加载、又是怎么被画出来的？**
> 源码引用约定：「文件路径 + 函数名」。所有被引用处都已插入 `【导读】` 中文注释，可对照 GitHub 网页阅读。

涉及的核心文件（按数据流顺序）：

| 文件 | 一句话角色 |
|---|---|
| `packages/engine/Source/Scene/Cesium3DTileset.js` | 数据集总管：加载、每帧遍历入口、请求与缓存（本篇主角） |
| `packages/engine/Source/Scene/Cesium3DTile.js` | 单片瓦片：状态机、SSE 计算、内容请求 |
| `packages/engine/Source/Scene/Cesium3DTileContentState.js` | 内容生命周期枚举 |
| `packages/engine/Source/Scene/Cesium3DTilesetTraversal.js` | 遍历器公共助手（可见性/优先级/加载判定） |
| `packages/engine/Source/Scene/Cesium3DTilesetBaseTraversal.js` | 基础遍历器（严格 REPLACE 语义） |
| `packages/engine/Source/Scene/Cesium3DTilesetSkipTraversal.js` | skipLevelOfDetail 专用遍历器 |
| `packages/engine/Source/Scene/Cesium3DTilesetMostDetailedTraversal.js` | 拾取/预加载最细级遍历器 |
| `packages/engine/Source/Scene/Cesium3DTileContentFactory.js` | 内容类型分派表（magic → 内容类） |
| `packages/engine/Source/Scene/Tileset3DTileContent.js` | 嵌套/外部 tileset 内容（缝合两棵树） |
| `packages/engine/Source/Scene/Model/Model3DTileContent.js` | b3dm/i3dm/pnts/glb 内容宿主 |
| `packages/engine/Source/Scene/Model/Model.js` | glTF 系模型统一渲染入口 |
| `packages/engine/Source/Scene/Composite3DTileContent.js` | cmpt 复合内容（内含多内容） |
| `packages/engine/Source/Scene/Cesium3DTileStyle.js` | 声明式样式（表达式 DSL） |
| `packages/engine/Source/Scene/Cesium3DTilesetCache.js` | 已加载瓦片的 LRU 缓存 |
| `packages/engine/Source/Scene/PrimitiveCollection.js` | scene.primitives 有序容器（§8） |

> 注：1.145 里已**没有** `Gltf3DTileContent.js` / `PointCloud3DTileContent.js`——glTF 与点云内容统一由
> `Model/Model3DTileContent.js` 承载（`fromB3dm/fromPnts/fromI3dm/fromGltf/fromGeoJson`）。网上老教程的类名对不上时先想到这一点。

---

## 1. 3D Tiles 是什么：一棵带「误差预算」的瓦片树

把一个大场景（整座城市的倾斜摄影/BIM/点云）切成树状层级瓦片：

```
tileset.json（根描述文件）
├─ asset: {version: "1.1"}           # 或 1.0
├─ geometricError: 1024              # 根的最大几何误差（米）：离得远就只画一个粗壳
├─ root:
│  ├─ transform: [16 元素矩阵]        # 本节点局部坐标系（常见 ENU）到世界的变换
│  ├─ boundingVolume: {box/region/sphere}
│  ├─ geometricError: 512            # 误差沿树下降递减 → 越深越精细
│  ├─ refine: "REPLACE" | "ADD"      # 细化语义（§3.2）
│  ├─ content: {uri: "tile.b3dm"}    # 或 1.1 的 contents: [...]（可多内容）
│  └─ children: [ ...同结构... ]
```

两个关键概念先记住，后面反复用：

- **geometricError（几何误差）**：这层瓦片「用简化网格冒充真实几何」的最大偏差，单位米。父 1024 → 子 512 → 孙 256……叶节点为 0（即真实数据）。
- **refine（细化语义）**：当这层「不够细」需要下钻时，子瓦片是**替换**父瓦片（REPLACE，默认语义由规范定）还是**叠加**在父瓦片上（ADD，常用于多层兴趣点/装饰）。

内容二进制格式（`content.uri` 指向的文件）：

| magic | 格式 | 用途 |
|---|---|---|
| `b3dm` | Batched 3D Model | 批量建筑网格（内嵌 glTF + 批表属性） |
| `i3dm` | Instanced 3D Model | 实例化模型（树/路灯/广告牌，带位置属性） |
| `pnts` | Point Cloud | 点云（含逐点颜色/属性） |
| `glb/gltf` | glTF 2.0 | 1.1 核心直接用 glTF 作内容 |
| `cmpt` | Composite | 一个文件里塞多个上述内容 |
| `*.json` | external tileset | 又一个 tileset.json（嵌套瓦片集） |

---

## 2. 加载链路：fromUrl 到一棵 Cesium3DTile 树

```
await Cesium3DTileset.fromUrl(url, options)
  │  Cesium3DTileset.js / fromUrl
  ├─ loadJson(resource)                    # 拉 tileset.json
  ├─ processMetadataExtension(...)         # 3DTILES_metadata / 1.1 内联 metadata → schema
  ├─ new Cesium3DTileset(options)          # 只存配置与空状态（不做网络请求）
  └─ loadTileset(resource, json)           # ★建树（也用于嵌套 tileset，见 §6）
       ├─ 校验 asset.version（0.0/1.0/1.1）+ checkSupportedExtensions
       ├─ makeTile(...) → new Cesium3DTile / 隐式平铺占位瓦片
       └─ 显式栈迭代：逐瓦片解析 header、连 parent/children、维护 _depth
scene.primitives.add(tileset)              # 挂进有序容器，从此每帧被驱动（§8）
```

要点：

- **1.145 没有 `readyPromise`**：`fromUrl` 本身是 async 工厂，resolve 时树已建好、`tileset.root` 可用。但「瓦片内容」仍是之后按视野逐步加载的——树就绪 ≠ 内容就绪。
- 每片瓦片的构造（`Cesium3DTile.js` 构造函数）做三件事：解析 header（transform 乘父链算世界包围盒、geometricError、refine、content uri）；初始化状态机 `_contentState = UNLOADED`；准备优先级/LRU 挂钩（`cacheNode`）。
- **隐式平铺**（`3DTILES_implicit_tiling`）：tileset.json 里不显式写满千万级瓦片，只写模板（`content.uri: "content/{level}/{x}/{y}.b3dm"`）+ subdivision 规则；加载时 `makeTile` 造占位瓦片，`Implicit3DTileContent` 下载 `.subtree` 后再展开。

### 内容生命周期状态机（Cesium3DTileContentState）

```
UNLOADED → LOADING → PROCESSING → READY
                ↘ FAILED（单瓦片失败不炸 tileset，发 tileset.tileFailed 事件）
READY → EXPIRED → (重新 LOADING)      # content.expire 时效到期，防「快照陈旧」
```

对应 `Cesium3DTile.js` 的 `requestContent`（→LOADING，下载字节）与 `process`（PROCESSING→READY，`Cesium3DTileset.js` 的 `processTiles` 每帧驱动）。旧版的 `_contentReadyToProcessPromise` 链在 1.145 已重构成 tileset 的 `_processingQueue` 数组。

---

## 3. 每帧遍历：怎么决定「这一帧画哪几片、请求哪几片」

### 3.1 三个时机（谁调用 tileset）

`scene.primitives`（PrimitiveCollection）在帧循环的三个钩子上转发给每个图元（调度全景第 5 棒讲，这里只需知道顺序）：

1. `prePassesUpdate` → `Cesium3DTileset.prePassesUpdate`：`processTiles`（把上帧下载完的瓦片推到 READY、建 GPU 资源）、更新裁剪、算动态 SSE、重置 LRU 哨兵；
2. `update`/`updateForPass` → 每个 Pass（主渲染/拾取/预加载）各跑一遍 `selectTiles → requestTiles → updateTiles`；
3. `postPassesUpdate` → `Cesium3DTileset.postPassesUpdate`：取消出视野请求（`cancelOutOfViewRequests`）、发加载进度事件、按 cacheBytes 淘汰缓存。

### 3.2 SSE：屏幕空间误差判定（LOD 的心脏）

`Cesium3DTile.js / getScreenSpaceError`：

```
透视相机：SSE = (geometricError × 屏幕高) / (distance × sseDenominator)
正交/2D：SSE = geometricError / 视口像素尺寸
（dynamicScreenSpaceError 开启时再减去雾式密度折扣）
```

直觉：**几何误差投到屏幕上是几个像素**。遍历判定（`Cesium3DTilesetBaseTraversal.selectTiles`）：

- 根瓦片 `SSE ≤ tileset.memoryAdjustedScreenSpaceError`（≥ `maximumScreenSpaceError`，默认 16）→ 根就够了，选它，结束；
- 否则下钻子节点，子节点几何误差更小 → SSE 更小 → 某层终于 ≤ 16 → 停在那层。

### 3.3 refine 语义（BaseTraversal，严格模式）

`Cesium3DTilesetBaseTraversal.js / executeTraversal`（深度优先，栈实现）：

- **ADD**：父与子同时渲染（祖先沿途全部选中）——`selectDesiredTile` 立即选中；
- **REPLACE**：子**全部就绪**才允许替换父（`updateAndPushChildren` 返回 `refines`）；没就绪前父继续顶班，同时预加载子——这就是「为什么走近时模型会先糊一下再变清晰」：SSE 已要求更细层，但更细层还在下载；
- 空瓦片（无 content 的纯分组节点）走 `executeEmptyTraversal` 检查其后代内容是否就绪。

配套优化（`Cesium3DTilesetTraversal.js`）：视锥剔除（`updateVisibility`）、子包围盒并集剔除（`anyChildrenVisible`）、ADD 父误差提前满足剔除（`meetsScreenSpaceErrorEarly`）、请求节流（`isOnScreenLongEnough`：镜头移动太快时先不发请求）、注视中心优先（`foveatedFactor` 进优先级）。

**skipLevelOfDetail = true** 时换用 `Cesium3DTilesetSkipTraversal`：不再要求逐级 REPLACE，直接跳到目标层，首屏更快更省内存；代价是可能父/子同帧绘制，需要 stencil 双变量可见性测试修正（`Cesium3DTileset.js / updateTiles` 里的 `bivariateVisibilityTest` 分支）。

### 3.4 请求优先级

遍历回填 `tileset._requestedTiles` 后，`requestTiles` 先排序再发请求（走 RequestScheduler）。排序键是 `Cesium3DTile.js / updatePriority`：把「深度 > 距离 > 注视中心偏离 > 反向 SSE」四维各自归一到 0~1 后**拼成一个十进制多位数**——高位优先级压倒低位（深度最优先：先出最细层，避免在最粗层浪费带宽）。

---

## 4. 内容请求与类型分派

`Cesium3DTile.js / requestContent` → 下载字节 → `makeContent`：

```
tileset._runtimeContentCodec 存在？                # MVTDataProvider 注入的运行时解码器
  └─ 是 → codec.createContent(...)                 # 矢量瓦片路径，绕过标准分派
  └─ 否 → preprocess3DTileContent(arrayBuffer)     # 看二进制头 magic / JSON
        └─ Cesium3DTileContentFactory 分派表（§5）
```

失败处理：单内容失败 → `_contentState = FAILED` + `tileset.tileFailed` 事件（有监听者交给业务，否则 console）；不影响其它瓦片。

---

## 5. 内容类型分派表（1.145 实况）

`Cesium3DTileContentFactory.js`（一张函数表，key = magic/类型）：

| key | 内容类 | 职责 |
|---|---|---|
| `b3dm`/`pnts`/`i3dm` | `Model/Model3DTileContent` | 剥各自二进制头与批表 → 统一委托 `Model/Model.js` 渲染（b3dm/i3dm 内嵌 glTF；pnts 点云；1.145 已无独立 Gltf/PointCloud 内容类） |
| `glb`/`gltf`/`geoJson` | `Model/Model3DTileContent`（或高斯泼溅/矢量网格扩展分流 `GaussianSplat3DTileContent`/`VectorGltf3DTileContent`） | 1.1 核心直接用 glTF/GeoJSON 作内容 |
| `cmpt` | `Composite3DTileContent` | 复合容器：递归解析内嵌的多个 innerContent |
| `externalTileset` | `Tileset3DTileContent` | content 指向另一个 tileset.json（§6） |
| `geom`/`vctr` | `Geometry3DTileContent`/`Vector3DTileContent` | Cesium 矢量/几何数据瓦片（分类渲染到地形/模型上） |
| `subt`/`subtreeJson` | `Implicit3DTileContent` | 隐式平铺的子树文件，展开成真瓦片 |

## 6. 嵌套 tileset 与 Model（内容侧两条重要支线）

**外部/嵌套 tileset**（`Tileset3DTileContent.js / fromJson`）：瓦片 content 指向另一个 tileset.json 时，它回调宿主 `tileset.loadTileset` 把子树挂为本瓦片的 children——对遍历器完全透明（就是普通子树）。自身不渲染、无特征，是「转发节点」。分块维护超大城市模型就靠它。

**Model 统一入口**（`Model/Model.js`）：所有 glTF 系内容（b3dm/i3dm/pnts/glb/geoJson）最终都汇到这里。职责一句话：loader（GltfLoader/B3dmLoader/PntsLoader/I3dmLoader/GeoJsonLoader）把源数据解析成 ModelSceneGraph，`Model.update` 每帧遍历场景图生成 DrawCommand。本棒到此为止，内部机制（场景图/材质/纹理/KHR 扩展）留作后续深挖。

---

## 7. 缓存与内存：cacheBytes 淘汰、样式与 MVT 的关系

### 7.1 LRU 缓存（Cesium3DTilesetCache.js）

- 双向链表 + **哨兵**：每帧开头哨兵移到尾部（`reset`），本帧被选中的瓦片 `touch` 到哨兵右侧（受保护）；左侧就是「这帧没用、可被淘汰」的 LRU 序列；
- `postPassesUpdate` 里 `unloadTiles`：只要 `totalMemoryUsageInBytes > cacheBytes`（默认 512MB），就从链表头（最久未用）开始 `unloadTile` → `Cesium3DTile.unloadContent`（销毁内容、状态回 UNLOADED）；`maximumCacheOverflowBytes`（默认再 512MB）是内存自适应 SSE 的容忍上限；
- `tileset.trimLoadedTiles()`：手动要求「下帧把所有未选中瓦片全部卸载」，切页面想立刻释放内存时用。

### 7.2 内存自适应 SSE

满足 `maximumScreenSpaceError=16` 需要的瓦片太多、内存超预算时，引擎自动调大 `memoryAdjustedScreenSpaceError`（画面变模糊）以减少瓦片数；内存回落后再逐步降回 16（`Cesium3DTileset.js / increaseScreenSpaceError`、`decreaseScreenSpaceError`，由 `processTiles` 驱动）。所以**卡顿/爆内存时优先调大 cacheBytes 或 maximumScreenSpaceError，别急着换数据**。

### 7.3 Cesium3DTileStyle 与 MVTDataProvider

`Cesium3DTileStyle.js`（样式 DSL）：每个属性（show/color/pointSize/labelColor/…）取值三形态——常量、表达式字符串（`"regExp(${name},'商店') ? color('red') : color('white')"`）、`{conditions: [["${height} > 100", "color('red')"], ...]}` 条件表。`setup()` 把它们编译成 `Expression`/`ConditionsExpression`（可按瓦片批表特征求值），赋给 `tileset.style` 后由 StyleEngine 每帧对选中瓦片应用。

**与矢量瓦片（MVT）的关系**：MVTDataProvider 加载 Mapbox Vector Tile 时给 tileset 注入 `_runtimeContentCodec`（§4 的旁路），并把 Mapbox style 图层的过滤条件+配色**翻译成 Cesium3DTileStyle 的条件表达式**（DXApp 的 `translatePbfStyle` 就是这个工程实践），让 3D Tiles 的样式引擎直接驱动矢量瓦片着色——一套 DSL，两处复用。

---

## 8. `viewer.scene.primitives.add(tileset)` 的语义（PrimitiveCollection）

`scene.primitives` 是 `PrimitiveCollection.js` 实例（`CompositePrimitive` 的旧名），语义三点：

1. **有序渲染**：数组顺序即绘制顺序，后 add 的后画（视觉在上层）；`raise/raiseToTop/lower/lowerToBottom` 调整叠放；
2. **show 级联**：`collection.show=false`（或某层嵌套集合 false）→ `update` 直接 return，整棵子树不渲染；
3. **销毁级联**：`destroyPrimitives=true`（默认）时 `remove/removeAll/destroy` 连带销毁其中图元——`scene.primitives.remove(tileset)` 返回 true 后不要再碰这个 tileset（WebGL 资源已释放）。

它同时是**帧循环的中转站**：Scene 在 prePassesUpdate/update(每 Pass)/postPassesUpdate 三个时机遍历容器调用各图元对应钩子——Cesium3DTileset 的 §3.1 三步就挂在这三个钩子上。完整调度链（CesiumWidget.startRenderLoop → Scene.render → updateAndExecuteCommands → executeCommands）是第 5 棒主菜。

---

## 9. 常用 options 速查（fromUrl 第二参）

| 选项 | 默认 | 说明 |
|---|---|---|
| `maximumScreenSpaceError` | 16 | 清晰度/成本总开关：调大→糊+省流省内存；调小→清晰+更耗。内存吃紧时引擎会临时自动调大（§7.2） |
| `cacheBytes` / `maximumCacheOverflowBytes` | 512MB/512MB | 缓存水位/溢出容忍（`tileset.cacheBytes` 可运行时改） |
| `skipLevelOfDetail` | false | 跳级加载：首屏快、省内存；换 SkipTraversal + stencil 混叠修正（§3.3） |
| `dynamicScreenSpaceError` (+`Factor`/`Density`) | false | 贴地看远时给远处瓦片 SSE 打折，街景/倾斜摄影利器 |
| `foveatedScreenSpaceError` (+`TimeDelay`/`Size`) | false | 注视中心优先加载，眼角瓦片延迟请求（体感「先看清正前方」） |
| `cullRequestsWhileMoving` (+`Multiplier`) | true | 镜头快速移动时暂缓新请求 |
| `preloadFlightDestination` | false | 飞行终点预取（flyTo 前置加载，落点不糊） |
| `shadows` | DISABLED | 阴影开关（ENABLED/CAST_ONLY/RECEIVE_ONLY）；大 tileset 开阴影很贵 |
| `showOutline` | true | b3dm 的 KHR_batch_3dmodel outline（量大时可关省内存） |
| `modelMatrix` | 单位阵 | 整棵树的额外 4×4 变换（把倾斜摄影平移到目标地） |
| `classificationType` | — | geom/vctr 瓦片贴到地形还是 3D Tiles 上 |
| `clippingPlanes`/`clippingPolygons` | — | 裁剪平面/多边形（剖切模型看内部，参考系见 `clippingPlanesOriginMatrix`） |
| `debugWireframe`/`showDebugStatistics` 等 | false | 调试（瓦片线框/包围盒/统计面板） |

监控：`tileset.statistics`（每帧命令数/三角形/字节）、`tileset.totalMemoryUsageInBytes`（对照 cacheBytes）、事件 `allTilesLoaded`（本视图全部就绪）/`initialTilesLoaded`（首屏就绪，只发一次）/`loadProgress`/`tileVisible`/`tileLoad`/`tileUnload`/`tileFailed`。

---

## 10. 动手实验

1. **跑通示例**：Sandcastle 搜「3D Tiles」→ 打开 *3D Tiles* 基础示例（默认就是 OSMBuildings 建筑瓦片）。观察走近/拉远时的分级加载（先糊后清）。
2. **调 SSE**：把 tileset 的 `maximumScreenSpaceError` 分别设为 2 / 16 / 64，同一视角对比清晰度与 `tileset.totalMemoryUsageInBytes`（开发面板打印 `tileset.statistics`）。体会「16 = 16 像素误差预算」。
3. **看缓存淘汰**：设 `cacheBytes: 64*1024*1024`（64MB），绕着城市转一圈，观察内存稳定在水位附近（LRU 生效）；再调 `tileset.trimLoadedTiles()` 看内存立刻回落。
4. **skipLevelOfDetail**：开关对比首屏出图速度与走近时的「父瓦片残留」现象。
5. **样式**：给 OSMBuildings 配 `tileset.style = new Cesium.Cesium3DTileStyle({ color: { conditions: [["${feature['building']} === 'apartments'", "color('red')"], ["true", "color('white')"]] } })`，按属性给建筑上色——这就是 §7.3 条件表达式；MVT 的 Mapbox style 翻译成的是同一套东西。
6. **嵌套 tileset**：找一个 external tileset 示例（如 Cesium3DTilesRestoredHatuBoboru），感受「一个瓦片的内容是整棵子树」时加载行为与普通瓦片无异。

---

## 11. 小结与下一棒

Phase 4 讲完「数据侧」：fromUrl 建树 → 每帧 prePasses/update/postPasses 三拍 → 遍历器按 SSE+refine 选瓦片 → 优先级请求 → magic 分派内容 → LRU 缓存淘汰 → DrawCommand 已生成。

**第 5 棒（帧渲染循环）** 从这里接：这些 update 是谁在什么时机调的？——CesiumWidget.startRenderLoop → Scene.render → updateAndExecuteCommands → executeCommands，DrawCommand 怎么按 Pass 分类排序、经过 StateCompiler/RenderState 进 WebGL。建议从 `packages/engine/Source/Widget/CesiumWidget.js / startRenderLoop` 与 `packages/engine/Source/Scene/Scene.js / render` 读起。
