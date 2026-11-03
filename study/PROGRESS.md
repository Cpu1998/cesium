# study/1.145-annotated 接力进度（内部状态，不入库）

- [x] Phase 1 总览+Viewer/CesiumWidget 创建 —— ✅ 完成（2026-11-03）
  - commit：0e375b3（源码注释，+138 行纯注释）+ c71c7d7（study 文档 README/00/01，+385 行），已 push origin
  - 已注文件：
    - packages/widgets/Source/Viewer/Viewer.js（文件头导读块；constructor 全流程逐段；addImagery/baseLayer 覆盖段、terrain、各 UI 部件、事件接线、鼠标拾取；resize/_onTick/zoomTo/flyTo/extend/destroy/addController 各注）
    - packages/engine/Source/Widget/CesiumWidget.js（文件头导读块；startRenderLoop/configure*；constructor 全流程含 new Scene/Globe/SkyBox/默认 baseLayer→ImageryLayer.fromWorldImagery/terrain/useDefaultRenderLoop→startRenderLoop/DataSourceDisplay；render 骨架/_onTick/_postRender/zoomToOrFly/updateZoomTarget/updateTrackedEntity/trackedEntity setter）
  - 注释规范已定稿在 study/README.md §注释规范（每行含【导读】、只插不改、路径+函数名引用、≤120 字符）
  - 给第 2 棒（底图与影像）的提示：
    1. 入口已在注释中标记「第 2 棒深挖」的两处：CesiumWidget.js「Set the base imagery layer」段、Viewer.js options.baseLayer 覆盖段
    2. 建议精读：Scene/ImageryLayer.js、Scene/ImageryLayerCollection.js、Scene/Globe.js（含 GlobeSurfaceTileProvider/QuadtreePrimitive 瓦片调度）、各 ImageryProvider；文档命名 study/02-底图与影像体系.md，并在 README.md 索引表里把「（第 2 棒）」占位替换为可点击链接
    3. 验收命令：node --check + `git diff -U0 | grep -vE '^\+.*(【导读】)' | grep -E '^\+[^+]'`（输出应仅 markdown）
    4. 引用行号一律用「路径+函数名」；不要动英文注释和空行
- [ ] Phase 2 底图与影像 Imagery —— ✅ 完成（2026-11-03，进行中状态同步见下）
  - commit：aceb62d（ImageryLayer/ImageryLayerCollection 注释 +73 行）+ ec6054b（CesiumWidget/Viewer 两处深挖标记补链路注释 +5 行）+ b0b1fbe（其余 7 个 Scene 文件注释 +121 行）+ 文档 commit（study/02/README/PROGRESS，见 git log）
  - 已注文件与方法清单：
    - Scene/ImageryLayerCollection.js：文件头；add/addImageryProvider/remove/removeAll/get、swapLayers、pickImageryHelper/pickImageryLayers/pickImageryLayerFeatures、queueReprojectionCommands、_update（基底层标记/索引重算）
    - Scene/ImageryLayer.js：文件头；构造参数段（alpha/nightAlpha 等）、fromProviderAsync、isBaseLayer、_createTileImagerySkeletons（★瓦片化入口：层级匹配/墨卡托判定/无覆盖拉伸/双重循环建 TileImagery）、getImageryFromCache（共享+引用计数）、_calculateTextureTranslationAndScale、_requestImagery（限流/重试语义）、_createTexture、_reprojectTexture（GPU ComputeCommand 重投影）、reprojectToGeographic、getLevelWithMaximumTexelSpacing、handlePromise
    - Scene/UrlTemplateImageryProvider.js：文件头；tags 注册表、构造（默认 WebMercator）、requestImage、pickFeatures（格式降级链）、buildImageResource（模板展开）、reverseXTag/sTag/computeDegrees/padWithZerosIfNecessary
    - Scene/Imagery.js + TileImagery.js：文件头；Imagery 构造（parent 链）/releaseReference/processStateMachine；TileImagery.processStateMachine（父图替代核心）
    - Scene/GlobeSurfaceTile.js：文件头；constructor.imagery、static initialize、static processStateMachine（先地形后影像/terrainOnly）、processImagery、prepareNewTile、processTerrainStateMachine
    - Scene/GlobeSurfaceTileProvider.js：文件头；构造（四件套）、update、initialize（重排序/版权）、beginUpdate、loadTile（★terrainOnly 策略）、showTileThisFrame（按纹理数分桶）、_onLayerAdded（中途加层不白屏）、addDrawCommandsForTile（多遍绘制/dayTexture* 装配循环）
    - Scene/QuadtreePrimitive.js（简注）：文件头；构造（三优先级队列/SSE）、update、selectTilesForRendering、visitIfVisible、screenSpaceError（LOD 公式）、processTileLoadQueue（时间片）
    - Scene/Globe.js（简注）：文件头；构造（组装现场）、update/beginFrame
    - CesiumWidget.js / Viewer.js：两处「第 2 棒深挖」标记已补链路去向注释（aceb62d/后续 commit 内）
  - 文档：study/02-底图与影像体系.md（§1 概念模型/§2 金字塔与 tilingScheme/§3 生命周期 8 步/§4 多层叠加语义/§5 集合事件/§6 Provider 速查/§7 API 对照/§8 动手实验 + 注释索引）；README.md 索引表 02 已换真链接
  - 给第 3 棒（Entity）的提示：
    1. 入口标记：CesiumWidget.js 构造里 DataSourceCollection + DataSourceDisplay 创建段（DataSourceDisplay.updateTime/display 在 render 链路里被调，注释已标「第 3 棒深挖」）；Viewer.js 数据源事件接线段（onDataSourceAdded 等）
    2. 建议精读：DataSources/DataSourceDisplay.js、DataSources/DataSourceCollection.js、DataSources/Entity.js、DataSources/Property.js（含 PropertyBag/时间插值）、CustomDataSource/GeoJsonDataSource/CzmlDataSource、displayers（GeometryVisualizer/BillboardVisualizer 等）
    3. 文档命名 study/03-Entity数据体系.md，README 索引表 03 换真链接；验收门同 Phase 1/2（node --check + 纯注释 diff 验证）
    4. 影像侧留尾巴（第 3 棒可顺带或留后续）：VectorProvider/VectorTileData（矢量裁剪多边形管线，GlobeSurfaceTileProvider.initialize 里调用）与 GroundClamping 相关未深挖；SingleTileIonImageryProvider 等小 provider 未注
- [ ] Phase 3 Entity 数据体系 —— ✅ 完成（2026-11-03）
  - commit：710a67d（Entity.js +56 / createPropertyDescriptor.js +14）+ 114bab0（CustomDataSource/DataSourceCollection +19）+
    2a85d18（DataSourceDisplay +32）+ 3dd2b6f（GeometryVisualizer +36）+ 1d7c2ff（PolygonGeometryUpdater +17）+
    157eced（BillboardVisualizer +18）+ 549aaff（CesiumWidget 两处链路去向 +4）+ 6255fd5（文档 03 + README 索引），已 push origin
  - 已注文件与方法清单：
    - DataSources/Entity.js：文件头（三层模型：Entity→*Graphics→Property）；顶部三个 descriptor 工厂（裸值自动包装机制）；
      构造（merge 集中赋值/GUID）；_propertyNames 白名单；_xxxSubscription 双字段；updateShow 递归可见性传播；
      id/definitionChanged/show setter/isShowing 三票合取/parent 双向链；billboard 等 createPropertyTypeDescriptor 属性块；
      position 专用 descriptor；registerEntityType；isAvailable；addProperty/removeProperty；merge（含「1.145 无 fromObject，
      EntityCollection.add 内 new Entity(options) 即等价物」说明）；computeModelMatrix/ForHeightReference
    - DataSources/createPropertyDescriptor.js：文件头；createProperty setter 四步（退订→包装→广播→冒泡订阅）
    - DataSources/CustomDataSource.js：文件头（DataSource 接口=entities+clock+4事件）；构造；update 恒 true 语义
    - DataSources/DataSourceCollection.js：文件头；add 的 Promise 处理与 removeAll 换数组防悬挂；remove；swap/raise/lower
    - DataSources/DataSourceDisplay.js：文件头（每帧同步引擎）；构造（贴地高度表初始化/两棵集合树/懒挂树/defaultDataSource）；
      defaultVisualizersCallback 8 类清单；update 三层循环与 _ready 只升不降；_postRender 版权；getBoundingSphere；
      _onDataSourceAdded/Removed/Moved（渲染顺序同步）
    - DataSources/GeometryVisualizer.js：文件头（Updater→Batch→Primitive 三层）；构造（静态桶矩阵/动态批）；
      update 四步（含同帧同 id 删旧加新拆分）；_insertUpdaterIntoBatch 路由信号；_onGeometryChanged；_onCollectionChanged 记账
    - DataSources/PolygonGeometryUpdater.js：文件头（GeometryUpdater 抽象代表）；构造；createFillGeometryInstance（id=entity 拾取）；
      _isDynamic 分水岭；_setStaticOptions
    - DataSources/BillboardVisualizer.js：文件头（图元级代表）；update 四步（懒创建 billboard.id=entity、image 最后赋）；
      getBoundingSphere 贴地 PENDING；_onCollectionChanged 直接同步不记账
    - engine/Widget/CesiumWidget.js：构造 DataSourceDisplay 创建点 + _onTick 两处补「见 study/03 §4/§5/§6」链接
  - 文档：study/03-Entity数据体系.md（§1 三层声明/§2 Property 系统与赋值魔法/§3 entities.add 链路/
    §4 DataSourceDisplay.update/§5 Visualizer 两种差量姿势/§6 时间轴与 trackedEntity/§7 拾取 id 机制/§8 CZML+实验/附录索引）；
    README.md 索引表 03 已换真链接
  - 注意事项：Entity.js 里锚点教训两次踩坑（edit 的 oldText 误吞 JSDoc/for 循环行，均已即时恢复）；
    「≤120 字符」按字符数计（Phase 1/2 已有先例，中文字符≠字节）
  - 给第 4 棒（3D Tiles）的提示：
    1. 入口两条：① scene.primitives.add(await Cesium3DTileset.fromUrl(url))（主链路）；② Entity 层入口
       DataSources/Cesium3DTilesetVisualizer.js（entity.tileset 属性→Tileset 的同步器，本棒已注 DataSourceDisplay 周边可顺链）
    2. primitives.add 的 PrimitiveCollection 机制：Scene/PrimitiveCollection.js 本身未注（只在 DataSourceDisplay.js 注释里涉及
       增删/raise/lower/级联销毁）；第 4 棒建议简注 Scene/PrimitiveCollection.js（add/remove/raise/lower + update 遍历）
    3. 建议精读：Scene/Cesium3DTileset.js（构造/fromUrl/统计）、Cesium3DTilesetChain?、Scene/Cesium3DTile.js、
       Cesium3DTileset 的 update（每帧遍历：selectTiles/LOD/SSE 与请求调度，对照第 2 棒 QuadtreePrimitive 的 screenSpaceError 公式注释）、
       TileOrientedBoundingBox/TileBoundingRegion；文档命名 study/04-3DTiles加载与调度.md，README 索引表 04 换真链接
    4. 与第 5 棒的边界：第 4 棒注到「Cesium3DTileset.update 生成 DrawCommand 列表为止」；
       Scene.render 的 updateFrameState/多 Pass/executeCommands/frustum culling/requestRenderMode 全部留给第 5 棒
    5. 验收门同前：node --check 所有改动 .js + `git diff -U0 | grep -vE '^\+.*(【导读】)' | grep -E '^\+[^+]'` 为空；
       锚点教训：oldText 永远只选代码行，且 newText 必须完整回显 oldText 的每一行（本棒两次教训）
- [ ] Phase 4 3D Tiles Tileset —— ✅ 完成（2026-11-03）
  - commit：2370b4bd8f PrimitiveCollection / 14520b076b Cesium3DTileset 主菜 / 02b207c636 Cesium3DTile /
    4bb7ad2663 ContentFactory+Tileset3DTileContent+Model3DTileContent / ef37b63691 Model+Cesium3DTileStyle /
    b419190a3d 文档 04-3DTiles加载与LOD.md + README 索引
  - 已注文件：PrimitiveCollection.js、Cesium3DTileset.js（构造/fromUrl/loadTileset/pre·post Passes/
    requestTiles/processTiles/updateTiles/update/updateForPass/getTraversal/cacheBytes 等）、Cesium3DTile.js
    （状态机/SSE/requestContent+makeContent/update/process/updatePriority）、Cesium3DTileContentFactory.js、
    Tileset3DTileContent.js、Model/Model3DTileContent.js、Model/Model.js（简注）、Cesium3DTileStyle.js（简注）。
    遍历器三兄弟与 Cache 未单独注释，机制在 04 文档 §3/§7 讲清
  - 1.145 命名坑：无 Gltf3DTileContent/PointCloud3DTileContent/_updateTileTraversal/_contentReadyToProcessPromise/
    readyPromise；对应现名 Model/Model3DTileContent（fromB3dm/fromPnts/…）、三个 *Traversal 类、_processingQueue、await 工厂
  - 给第 5 棒（帧渲染循环）的提示：
    1. 帧循环聚焦：CesiumWidget.startRenderLoop/render → Scene.render → updateAndExecuteCommands →
       executeCommands；PrimitiveCollection 与 Cesium3DTileset 的 update/updateForPass/prePassesUpdate/
       postPassesUpdate 均已注到入口，第 5 棒从「Scene 怎么在多 Pass 里调度这些 update」接
    2. 04 文档 §11 已预留给你交接段；DrawCommand 排序/Pass 分类/RenderState 可展开成 05 文档主菜
    3. QuadtreePrimitive（Globe 侧）与 Cesium3DTileset 同构地挂在 primitives 遍历链上，可对照讲
- [ ] Phase 5 帧更新与渲染循环+收尾推送 —— ✅ 完成（2026-11-04）
  - commit：a…（帧循环补注 CesiumWidget +6）/ RequestScheduler +19（含 §号修正）/ Scene.js 主菜 +66 /
    Context +12 + DrawCommand +8（简注）/ QuadtreePrimitive 三拍补注 +7 / 文档 05（331 行，约 3200 中文字）/
    README 定稿与 PROGRESS 入库（见 git log，Phase 5 起点从 b419190a3d）
  - 已注文件与方法清单：
    - Widget/CesiumWidget.js（补注）：startRenderLoop 内部 render 的 rAF 节流（interval 丢帧 +
      lastFrameTime 余数补偿）；CesiumWidget.render 三拍与 requestRenderMode 关系（时钟照走、只省画帧）
    - Core/RequestScheduler.js：文件头；优先级堆（容量 20/挤占取消）；updatePriority 动态优先级；
      update（每帧预算：清理/重算/填空闲槽）；startRequest/cancelRequest；request 入口三分支
      （data-blob 直发/服务器饱和 undefined/入堆）
    - Scene/Scene.js（主菜 +66）：文件头；requestRenderMode/maximumRenderTimeChange 构造注释；
      updateFrameNumber/updateFrameState（cullingVolume+occluder）；isVisible（视锥+地球遮挡）；
      executeCommand（derivedCommands 变体切换）；executeCommands（performPass/多视锥远→近/Pass 固定顺序/
      OPAQUE early-z/TRANSLUCENT 远→近）；updateAndExecuteCommands→executeCommandsInViewport 四步曲；
      updateAndRenderPrimitives（命令收集步）；initializeFrame；prePassesUpdate/postPassesUpdate
      （★RequestScheduler.update 位置）；render(scene) 私有（雾/uniform/beginFrame/四步曲/后处理/globe.endFrame
      tilesLoaded 持续置脏）；Scene.prototype.render 总入口生命周期；shouldRender 判定；forceRender/
      requestRender；updateDebugShowFramesPerSecond；callAfterRenderFunctions；updatePreload/
      PreloadFlight/RequestRenderModeDeferCheck 三 Pass
    - Renderer/Context.js（简注）：文件头；WebGL 参数默认值；双缓存（ShaderCache/TextureCache）；
      draw 终点站（beginDraw/continueDraw→drawElements/drawArrays）；endFrame 状态还原
    - Renderer/DrawCommand.js（简注）：文件头（「一次 draw 的参数包」概念）；Flags 位标志；execute→Context.draw
    - Scene/QuadtreePrimitive.js（补注）：beginFrame/render/endFrame 三拍与 Scene 调用点对应表
  - 文档：study/05-帧更新与渲染循环.md（§1 三阶段结论/§2 总时序图/§3 帧率控制/§4 requestRenderMode/
    §5 executeCommands 剔除分 Pass 提交/§6 RequestScheduler/§7 单帧预算/§8 调试与打点/§9 五棒合璧表/§10 收官）
  - 全工程收尾：README 定稿（六篇导航/双阅读路线/对照读法/工程说明统计）；PROGRESS.md 移出
    .git/info/exclude 入库；全量终验（node --check 全过 + 纯注释 diff 验证 + 0 删除）；push 确认
  - 遗留建议：Model/glTF 深读（Scene/Model/ SceneGraph 三层/draco/meshopt）、Renderer 细节
    （RenderState/OIT/GlobeDepth 深度拷贝链）、拾取全链、ComputeCommand 重投影——见 05 文档 §10

---

## 全工程归档（第 5 棒收尾时写入）

- 基点 tag 1.145（845a06b）→ 终点 HEAD：31 个 .js / 829 行纯【导读】注释 / 6 篇文档+README ≈1.4 万中文字 / 28+ commit
- 各棒细节见上方各 Phase 小节；验证命令与阅读路线见 study/README.md
