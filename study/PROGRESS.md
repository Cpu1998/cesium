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

---

## 2026-11-05 23:5x · L1 链接化（L1+L1b 两棒接力，主会话收尾提交）

- **做了什么**：README + 00~05 六篇全部源码引用改为 GitHub 行级跳转；修复 03 篇指向 `04-3DTiles加载与调度.md` 的坏链（实际文件 04-3DTiles加载与LOD.md）
- **改动文件**：README/00/01/02/03/04/05 + tools/linked-files.txt（冻结清单重生成）
- **数字**：代码链接 565 个（00:8 / 01:50 / 02:78 / 03:74 / 04:52 / 05:53 / README:8）；check-links 错误 0 警告 0；主会话抽查 03:Entity.js#L135、05:Scene.js#L4833 均精确命中定义行
- **过程**：L1 棒跑 15 分钟在 02 中途中断（假完成信号），L1b 续棒补完 03/04/05 与 02 尾部但在提交前再次中断，主会话核实后直接完成 commit+push
- **下一棒建议（L2：新写 06-相机系统与视角控制 / 07-地形）**：
  - 主战场：packages/engine/Source/Scene/Camera.js（flyTo/setView/lookAt）、SceneTransforms.js、 GlobeSurfaceTileProvider 与 packages/engine/Source/Core/地形相关（TerrainProvider/GlobeSurfaceTile/QuadtreePrimitive 已有【导读】注释可引用）
  - 新篇按 LINKING.md「新文档风格」：三件套开头、250-450 行、全部引用带链接、追加 README 索引表并更新成果统计
  - ⚠️ 教训：控制在输出预算内——少过程叙述、批量编辑、**先完成 commit+push+PROGRESS 再汇报**

---

## 2026-11-06 00:1x · L2 新写两篇：06-相机系统与视角控制 / 07-地形系统

- **做了什么**：新写 `study/06-相机系统与视角控制.md`（266 行）与 `study/07-地形系统.md`（276 行），全文代码引用行级链接；README 索引表收录 06/07 并更新「文档索引八篇导航」「成果统计」（篇数 6→8、说明 06/07 为接力新增）；README 快速线/精读线提法微调
- **commit**：9c7bffc946（06）、2217acf3b3（07+README）；首个 push 曾遇 GitHub 端 `fatal error in commit_refs_rules`，重试即成功（规则引擎偶发故障，非仓库问题）
- **06 主战场与锚点**：
  - Scene/Camera.js：function Camera L82（position L101/direction L134/up L143/right L152/frustum L166 均为公开可写字段）、updateViewMatrix L316、updateMembers L657、getHeading/getPitch/getRoll L818/L831/L835、heading/pitch/roll getter L994/L1025/L1056（ENU 临时换参考系反解的派生量）、update L1120、_setTransform L1179、setView L1488（→setView3D L1268/2D L1338/CV L1303）、lookAt L2331、lookAtTransform L2419、offsetFromHeadingPitchRange L2360、flyTo L3425、cancelFlight L3335、flyToBoundingSphere L3660、computeViewRectangle L3883、flyHome L1544、switchToPerspective/Orthographic L3985/L4009
  - Scene/CameraFlightPath.js：createTween L406、createUpdate3D/2D/CV L219/L334/L150、每帧回调即 camera.setView（L321）——「飞行=连续 setView」
  - Core/PerspectiveFrustum.js L35/L240/L277（sseDenominator）、Core/OrthographicFrustum.js L30/L184、Scene/FrustumCommands.js L13、Scene/View.js L42（多视口 View 抽象，scene.camera 是 _view 转发）、Scene.js L733/L755/L1052/L1510/L1525/L2833（多视锥）、Scene/SceneTransforms.js L46/L58/L99/L282/L301/L358（wgs84ToWindowCoordinates 已在 1.145 移除→worldToWindowCoordinates）、Scene/ScreenSpaceCameraController.js L35/L3010（initializeFrame 里先 controller.update 再 camera.update：Scene.js L4495/L4500）
- **07 主战场与锚点**：
  - Core/TerrainProvider.js：L21 抽象接口（requestTileGeometry L541 / getLevelMaximumGeometricError L551 / getTileDataAvailable L563 / availability L89 / getEstimatedLevelZeroGeometricErrorForAHeightmap L513）；Provider 家族：CesiumTerrainProvider L477（fromIonAssetId L1184/fromUrl L1224/getLevelMaximumGeometricError L1148=误差减半律/skirt L798）、EllipsoidTerrainProvider L26、Cesium3DTilesTerrainProvider L68（1.145 新增）、ArcGIS L351、CustomHeightmap L56
  - 入口链：Scene.js setTerrain L5531（内部 L5487）→ globe.terrainProvider setter L528 → GlobeSurfaceTileProvider._terrainProvider L149/L330 → invalidateAllTiles（QuadtreePrimitive.js L211）= 全树重建
  - 帧调度三拍：Globe.js L1003/L1098/L1113 ↔ QuadtreePrimitive.js update L316/beginFrame L341/render L371/endFrame L451 ↔ GlobeSurfaceTileProvider update L402/initialize L412/beginUpdate L480/endUpdate L516/loadTile L694/showTileThisFrame L1105/addDrawCommandsForTile L2528；三优先级队列 L91、时间片 L97/L1335、LRU tileCacheSize L130
  - SSE 公式：QuadtreePrimitive.js screenSpaceError L1270（sseDenominator L1286、雾放行）、maximumScreenSpaceError 默认 2px L120、2D 版 L1300；与 3D Tiles 同构（Cesium3DTile.js L975）
  - 瓦片状态机：QuadtreeTile L75（data L180/renderable L162）+ 两级状态（QuadtreeTileLoadState / TerrainState L7）；GlobeSurfaceTile.processStateMachine L253 → initialize L221 → processTerrainStateMachine L723（requestTileGeometry L908/upsample L849/transform L1014/createResources L1058）→ processImagery L347（TileImagery L52）
  - 格式：QuantizedMeshTerrainData L94/L264（Worker createVerticesFromQuantizedTerrainMesh L26、zigzag 量化、horizon occlusion、裙边）、HeightmapTerrainData L96/L315/L492、waterMask（CesiumTerrainProvider L63 + GlobeSurfaceTile L1122）、availability L520/L1258
- **数字**：check-links 全绿（10 个 md，代码链接 782、相对链接 39、错误 0 警告 0）；06 含代码链接 67 个、07 含 96 个（校验器差值：674-674 前后对比……准确值：06 提交后 674、07 加入后 777→README 更新 782）
- **下一棒建议（08-拾取 / 09-几何图元与材质）**：
  - 08 拾取主战场：Scene.js 的 pick pass 编排（updateAndExecuteCommands 挑 pick pass、executeCommands 里 pickRenderTarget/PickDepth）、Scene.prototype.pick/morphto…（定义行 grep "Scene.prototype.pick = "）、PickId（Renderer/PickId.js + Context.createPickId）、PickFramebuffer、GlobeSurfaceTileProvider 的 pickTerrain（GlobeSurfaceTile.pickTriangle / getTileImageryCoordinates）、 drillPick/mode 颜色编码（pickPosition 深度复原：PickDepth.js）；文档可复用 05 §5 的多视锥剔除叙述与 07 的 addDrawCommandsForTile 锚点
  - 09 几何图元与材质主战场：GeometryVisualizer（DataSources）→ GeometryInstance/Geometry 属性流（Core/Geometry.js）、GeometryAttribute/Indices、Appearance+Material（Scene/Appearance.js、Material.js 的 fabric JSON 与 shader 缓存）、PerInstanceColorAppearance、GroundPolyline/ClassificationType 贴地判定；可交叉引用 03 §Visualizer 表与 07 §7（depthTestAgainstTerrain）
  - 通用纪律：行号唯一来源本地 grep 定义行；每篇写完立即 commit（本棒 06 曾以 1 个已知坏链先提交以降低中断损失，风险自负但 07 补齐后全绿）；push 遇 commit_refs_rules 直接重试

---

## 2026-11-06 00:4x · L3 拾取+几何材质（L3 棒半程中断，主会话收尾）

- **做了什么**：新写 08-拾取系统（290 行/100 链接）、09-几何图元与材质（305 行/95 链接）；README 升级十篇导航（索引+阅读路线+成果统计+可深挖方向）
- **内容要点**：08——颜色编码拾取（pick pass 重画→readPixel→PickId 反查）、Picking.js（1.145 从 Scene 拆出的新类）、PickDepth 深度复原、drillPick、射线家族；09——Geometry 三层数据模型、四代表几何工厂、Primitive.js 合批总装（loadSynchronous/createVertexArray）、Fabric 材质→shader、贴地分类 ClassificationPrimitive
- **过程**：L3 棒完成 08 并提交后在撰写 09 尾段中断；09 全文实际已落盘（305 行/95 链接全绿），主会话核实后补 README + 提交推送
- **下一棒建议（L4：10-时间与动态属性 / 11-坐标变换）**：
  - 10 主战场：Core/JulianDate.js、Clock.js、ClockStep/ClockRange、TimeInterval/TimeIntervalCollection、DataSources/Property 体系（SampledProperty 插值/TimeIntervalCollectionProperty/CallbackProperty）、CzmlDataSource 时间轴
  - 11 主战场：Core/Cartesian3/Cartesian4/Matrix3/Matrix4/Quaternion、Transforms.js（eastNorthUpToFixedFrame 等）、EllipsoidGeodesic、SceneTransforms（交叉引用 06 §7）、各坐标系（WGS84/ECEF/ENU/窗口）互转全景表
  - 纪律同前：少叙述、每篇即 commit、收尾全绿再汇报

---

## 2026-11-06 04:3x · L4 时间与动态属性 + 坐标变换（重试棒，00:47 首派因上游配额未开工）

- **做了什么**：新写 `study/10-时间与动态属性.md`（253 行）与 `study/11-坐标变换.md`（200 行），全文代码引用行级链接；README 升级十二篇导航（索引 +2 行、阅读路线补 10/11 位置建议、成果统计篇数 10→12、可深挖方向以 10/11 落盘为由替换为事件交互/渲染着色器）
- **commit**：c783eadb67（10）、af784bcb4c（11）、a43ed66994（README）；push 一次成功，未遇 commit_refs_rules
- **10 主战场与锚点**：
  - Core/JulianDate.js：class L199/构造 L205（dayNumber L66 + secondsOfDay L72 双字段、内部恒 TAI、leapSeconds L1201）；静态一族 fromIso8601 L312/fromDate L277/now L615/toDate L717/toIso8601 L749/toGregorianDate L626；运算 addSeconds L1009/addMinutes L1037/addHours L1063/addDays L1089/secondsDifference L939（左减右）/daysDifference L961/totalDays L920/compare L858/equalsEpsilon L903；TimeStandard UTC:0 L21 / TAI:1 L30
  - Core/Clock.js：function L43；双闸门 canAnimate×shouldAnimate（判断 L262、getter L233）；multiplier L183；clockStep 默认 SYSTEM_CLOCK_MULTIPLIER L140、clockRange 默认 UNBOUNDED L106；tick L258（CLAMPED 钳 L285、LOOP_STOP 回绕 L295、onStop L293/L305、onTick L313）；事件创建 onTick L121/onStop L126；ClockStep.js TICK_DEPENDENT L20/SYSTEM_CLOCK_MULTIPLIER L29/SYSTEM_CLOCK L38；ClockRange.js UNBOUNDED L19/CLAMPED L28/LOOP_STOP L39
  - 时钟链：Widget/CesiumWidget.js new Clock L333、订阅 onTick L499、render L1140、tick 调用 L1146、_onTick L1201（→DataSourceDisplay.update→EntityView）、canAnimate 反馈 L1193；widgets ClockViewModel.js L19、Viewer.js 时钟段 L519-525/Animation 容器 L821/Timeline 创建 L837；DataSources/DataSourceClock.js L15（raw 属性 L45-85，multiplier L85）
  - Timeline（widgets/Source/Timeline/Timeline.js）：function L103、订阅 onTick L188、updateFromClock L701、zoomTo L273、resize L989
  - Property 体系（DataSources）：Property.js equals L73/arrayEquals L80/isConstant L99；ConstantProperty L14（getValue L57）；SampledProperty L158（addSample L578/addSamples L622/addSamplesPackedArray L703/getValue L366/setInterpolationOptions L539/默认 Linear L193/滑窗 L443-466/调插值 L499/L507）；SampledPositionProperty L21（getValueInReferenceFrame L205、setInterpolationOptions L235）；TimeIntervalCollectionProperty L43（getValue L103）；CompositeProperty L55（getValue L115）；CallbackProperty L15（getValue L59）；ReferenceProperty L90（fromString L218/getValue L267/_onTargetEntityDefinitionChanged L340/_onCollectionChanged L352）；PropertyBag L19（addProperty L98/getValue L171/raiseEvent L131）；PositionProperty L23；createPropertyDescriptor L72（createProperty L9）；Core/binarySearch.js L24；Core/ExtrapolationType.js NONE L18/HOLD L26/EXTRAPOLATE L34；Core/ReferenceFrame.js FIXED/INERTIAL L8-21
  - 插值三兄弟：LinearApproximation L11（orderZero L45）、LagrangePolynomialApproximation L10（L42，龙格震荡警示）、HermitePolynomialApproximation L88（orderZero L137/interpolate L236 带 inputOrder）；InterpolationAlgorithm L14
  - 驱动链：DataSourceDisplay.update L311（defaultVisualizersCallback L169）、BillboardVisualizer.update L95；CzmlDataSource.js load L4868/loadCzml L4782/updateClock L4664（无 clock 包时 availability 推 LOOP_STOP+multiplier=总时长/120，L4674）、interpolators 映射 L596-600、updateInterpolationSettings L602、processPacketData L873、epoch L757-769、numberOfDerivatives L932
- **11 主战场与锚点**：
  - 原子类型：Cartesian2 L19/Cartesian3 L20（magnitude L351/distance L366/fromDegrees L839/fromRadians L869）/Cartesian4 L18/Cartographic L16（fromDegrees L84/fromCartesian L105）；Math.js RADIANS_PER_DEGREE L478
  - 矩阵/四元数：Matrix3 L39（fromQuaternion L296/multiply L1043/getColumn L729）、Matrix4 L53（列主序文档 L26/L185；multiply L1699/multiplyTransformation L1882/multiplyByPoint L2271/multiplyByPointAsVector L2237/fromRotationTranslation L375/fromTranslationQuaternionRotationScale L439/fromTranslationRotationScale L509/getTranslation L2599/getRotation L1668/inverse L2663/inverseTransformation L2877/getColumn L1251/fromArray L3062/computeViewportTransformation L1045-1080）、Quaternion L20（fromHeadingPitchRoll L186）、HeadingPitchRoll L16
  - 椭球：Ellipsoid L89（initialize L32/cartographicToCartesian L385 三步/cartesianToCartographic L445/scaleToGeodeticSurface L510/geodeticSurfaceNormal L350/geodeticSurfaceNormalCartographic L321/WGS84 L762）；EllipsoidGeodesic L285（surfaceDistance L321/setEndPoints L394/interpolateUsingFraction L410）
  - Transforms.js：localFrameToFixedFrameGenerator L99（轴组合缓存 L115 起）、eastNorthUpToFixedFrame L276、northEastDownToFixedFrame L302、headingPitchRollToFixedFrame L384（HPR→Matrix3→multiply L397-408）、headingPitchRollQuaternion L437（默认 ENU L396）
  - SceneTransforms.js：worldToWindowCoordinates L46、worldToClip L58、worldWithEyeOffsetToWindowCoordinates L99、computeActualEllipsoidPosition L301、worldToDrawingBufferCoordinates L282、clipToGLWindowCoordinates L358；Camera.js viewMatrix getter L891；Core/PerspectiveFrustum.js projectionMatrix L237
  - GPU 侧：Renderer/AutomaticUniforms.js czm_viewportTransformation L135/czm_model L264/czm_view L313/czm_projection L509/czm_inverseProjection L532/czm_viewProjection L728/czm_modelViewProjection L783；Renderer/UniformState.js model setter L267/updateCamera L1422/updateFrustum L1443/update L1486；Renderer/Context.js L1359（drawCommand._modelMatrix → _us.model）；Scene/Primitive.js modelMatrix L71/L225/L227/L1267；Renderer/DrawCommand.js L76/L86/L239；Core/GeometryPipeline.js transformToWorldCoordinates L835
  - 特色：坐标系全景表（8 系）、日常互转 API 速查表（§4.5）、「一个坐标的七级变换瀑布」ASCII 图（§5）
- **数字**：check-links 全绿（14 个 md，代码链接 1254、相对链接 73、错误 0 警告 0）；10 含代码链接约 96 个、11 含约 90 个（差值：1133→1254，含 README 追加的索引链接）
- **下一棒建议（L5：12-事件与交互 / 13-渲染命令与着色器）**：
  - 12 主战场：Core/ScreenSpaceEventHandler.js（事件抽象：DOWN/UP/MOVE/DOUBLE_CLICK + 修饰键）、Core/ScreenSpaceEventType.js、widgets Viewer 默认 handler 与 screenSpaceEventHandler 销毁、Scene/ScreenSpaceCameraController.js（已注，06 §8 提过：把事件翻译成相机操作）、Entity 拾取联动（08 §7 id=entity）、viewer.selectedEntity/trackedEntity 事件（01/03 交叉）；可配「一个 click 从 DOM 事件到 drillPick 到相机 flyTo」全链图
  - 13 主战场：Renderer/DrawCommand.js 生命周期（build/execute/derivedCommands pass）、Renderer/ShaderSource.js + ShaderBuild（内置 uniform/函数注入）、Renderer/Context.js executeCommand/createVertexArray、Scene/Scene.js updateAndExecuteCommands 的 pass 编排（已注，05 §5）、ComputeCommand（05 §10）、RenderState/深度模板缓存；可配「一条 DrawCommand 从 Primitive 到 gl.drawElements」管线图，交叉引用 05/09
  - 纪律同前：零过程叙述、每篇即 commit、收尾全绿再汇报；行号唯一来源本地 grep 定义行

---

## 2026-11-06 04:4x · L5 事件与交互 + 渲染命令与着色器（重试棒）

- **做了什么**：新写 `study/12-事件与交互.md`（264 行）与 `study/13-渲染命令与着色器.md`（254 行），全文代码引用行级链接；README 升级十四篇导航（索引 +2 行、阅读路线补 12/13 位置建议、成果统计篇数 12→14、可深挖方向更新：事件/命令层已落盘，新增向量数据源方向）
- **commit**：11dc00980e（12 初稿）、add478e147（12 定稿）、5cc57529f7（13 初稿）、c16a5b8442（13 定稿）、4ea615b4b1（README）
- ⚠️ **异常记录**：本棒出现双实例并发写入——上一棒（00:47 首派后失联）在中途苏醒并同时产出 12/13（add478e147/c16a5b8442 覆写了本棒初稿 11dc00980e/5cc57529f7 的文件内容）。两版主题覆盖与结构均合规、行数均达标，最终以 HEAD 定稿版为准，未做回退。后续棒注意：开工前 `git log` 查重、PROGRESS 先占坑再动笔
- **12 主战场与锚点**：
  - Core/ScreenSpaceEventHandler.js：构造 L987（clickPixelTolerance 5px L1012、touchHoldDelay 1500ms L1145、mouseEmulationIgnore 800ms L1137）；注册三件套 setInputAction L1031/getInputAction L1061/removeInputAction L1082（键=getInputEventKey L25，type+modifier 独立槽位）；派发族 handleMouseDown L209/cancelMouseEvent L259（UP 后位移≤5px 合成 CLICK）/handleMouseUp L306/handleDblClick L396/handleWheel L420/fireTouchEvents L542（单指=左键、长按 1.5s=RIGHT_CLICK L646、双指=PINCH，handleTouchMove L703 喂 distance/angleAndHeight）；destroy L1125
  - Core/ScreenSpaceEventType.js：15 事件 L15-L127；KeyboardEventModifier.js SHIFT/CTRL/ALT L16/24/32
  - widgets/Viewer.js：pickEntity L119（picked.id ?? primitive.id；3DTileFeature 造临时 Entity；pickImageryLayerFeature L183）、默认槽位 L1010/L1014（pickAndSelectObject L1006/pickAndTrackObject L988）、selectedEntity setter L1553 + selectedEntityChanged L1578、_onTick L1908（绿框/InfoBox 刷新）、destroy L1776（removeInputAction L1781/L1784）
  - Widget/CesiumWidget.js：new ScreenSpaceEventHandler L440、trackedEntity setter L882（cancelZoom→_needTrackedEntityUpdate→禁平移倾斜）/trackedEntityChanged L935/updateTrackedEntity L1666、_onTick L1201；DataSources/EntityView.js update L396（defaultOffset3D L385）
  - Scene/ScreenSpaceCameraController.js：构造 L35、inertiaSpin L96、minimumZoomDistance L132、手势→操作映射 translate/zoom/rotate/tilt/look L157-L222、update2D/updateCV/update3D L1090/L1785/L2873、update L3010；CameraEventAggregator.js L374（isMoving L452/getMovement L470）；CameraEventType.js L15-L47
  - 交叉：06 §8（翻译层）、08 §7（id=entity 接缝）、03（definitionChanged）、11 §6（绿框世界→窗口）、05 §4（requestRenderMode）
- **13 主战场与锚点**：
  - Renderer/DrawCommand.js：class L76（va L92/sp L101/uniformMap L104/renderState L107/framebuffer L110/pass L113/owner L116/pickId L119）；flags 位域 L133-L143（cull getter L195）；derivedCommands L140 + dirty L144；shallowClone L635；execute L676（一行转发 context.draw）
  - Renderer/Pass.js：15 通道 L17-L31（ENVIRONMENT→COMPUTE→GLOBE→分类→3DTILE→OPAQUE L26→TRANSLUCENT L27→VOXELS/GAUSSIAN→OVERLAY L31）
  - 编队：Scene.js updateAndRenderPrimitives L3955 收集 → View.js createPotentiallyVisibleSet L285/updateFrustums L168（多视锥拟合）/insertIntoBin L236（executeInClosestFrustum break L264；无包围体积按最坏 near/far 入全部视锥 L381）→ FrustumCommands L13；Scene.js updateAndExecuteCommands L3391/executeCommandsInViewport L3667/executeCommands L2796/performPass L2845/executeIdCommand L2398/executeTranslucentCommandsBackToFront L2458/executeOverlayCommands L3265
  - 变体：Scene.js updateDerivedCommands L1814（prototype 版 L1906，dirty 闸门 L1930-L1950；logDepth 递归派生 pick L1972；OIT L1883-L1890）；DerivedCommand.js createDepthOnly L95/createLogDepth L231（正则探测 L136）/createPick L315/createSnap L409/createHdr L762；ShadowMap.js createReceiveDerivedCommand L1791/createCastDerivedCommand L1894；执行切换 executeCommand L2291
  - 着色器：ShaderSource.js ctor L332/combineShader L155（#line 0 归置）/getBuiltinsAndAutomaticUniforms L138（czm_ 依赖图注入：getDependencyNode L23/sortDependencies L87）/replaceMain L363/createPickFragmentShaderSource L450（main→czm_pick_main 包装只输出 pickColor）；ShaderCache.js L9/getShaderProgram L75（getCacheKey L377 含 defines+全文）；ShaderProgram.js ctor L17/replaceCache L75（引用计数释放）/_bind L541/_setUniforms L546（manual←uniformMap 惰性求值 + automatic←UniformState；setSamplerUniforms L444）；ShaderBuilder.js L56（Model 新拼装器，buildShaderProgram L470）
  - GL 终点：Context.js L48（_shaderCache L89/UniformState L344）/draw L1414/beginDraw L1303（FBO+applyRenderState L1213 差量）/continueDraw L1330（us.model←modelMatrix→_setUniforms→va._bind L884→gl.drawElements/Arrays[Instanced]）/beginFrame L1438/endFrame L1442/readPixels L1550；RenderState.js ctor L91/fromCache L461（内容为键全局去重）；VertexArray.js L291/_bind L884/VertexArrayFacade L14
  - 计算旁支：ComputeCommand.js L10/execute L116 → ComputeEngine.js L63（全屏四边形 getViewportQuadVertexArray Context.js L1599 画进 outputTexture）；执行点 Scene.js executeComputeCommands L3243（View.js L340 单列）
  - 交叉：05 §5/§10、08 §2/§3（pick 变体与颜色编码）、09 §4（Primitive 侧 createShaderProgram L1724/createVertexArray L1622/new DrawCommand L1878/RenderState.fromCache L1690）
- **数字**：check-links 全绿（16 个 md，代码链接 1522、相对链接 103、错误 0 警告 0）；12 含代码链接约 60 个、13 含约 63 个
- **下一棒建议（L6：14-向量数据源 + README 分组导航重排）**：
  - 主战场：DataSources/GeoJsonDataSource.js（load L 主入口、crs 坐标系分支、process* 系列造 Entity）、KmlDataSource.js（load/networkLink、KMZ 解包）、CustomDataSource.js、DataSourceCollection.js（add/remove/raiseLower 次序）、DataSourceDisplay 联动（03 交叉）、CustomDataSourceerCollection/cluster 聚合（EntityCluster.js：enabled、pixelRange、minimumClusterSize、_initialize 与监听 scene.preUpdate/postRender）
  - load 通用管线抽象：Promise<DataSource> 返回、loader 线程模型（TaskProcessor？GeoJson 走 worker？——本地 grep 核实）、name/id/credit 归一
  - README 重排建议：十四篇后索引表已长，可按「入门 00-01 / 数据 02-04+14 / 渲染 05+09+13 / 交互 06-08+12 / 动态 03+10-11」分组或加主题列
  - 纪律同前：零过程叙述、每篇即 commit、收尾全绿再汇报；行号唯一来源本地 grep 定义行；⚠️ 开工前先 git log 查重 + PROGRESS 占坑（本棒双实例教训）

---

## 2026-11-06 04:5x · L6 向量数据源 + README 重排（收官棒）

- **做了什么**：新写 `study/14-向量数据源.md`（273 行 / 代码链接约 173 个），全文行级可点击链接；`study/README.md` 索引重排为十五篇五组导航（入门总览 00-01 / 数据与加载 02+04+07+14 / Entity 与动态 03+10-11 / 渲染管线 05+09+13 / 相机与交互 06+08+12），成果统计同步（篇数 14→15、代码链接 1702、相对链接 130），可深挖方向移除已落盘的向量数据源、扩为 Model-glTF/性能调试/天空光照/点云粒子/裁剪/实战速查六条加餐候选
- **commit**：146a7c6cee（PROGRESS 占坑）、0d64bcf7bf（14 正文）、b4da3e1ae3（README 重排）；push 见下
- **14 主战场与锚点**：
  - 契约/容器：DataSource.js ctor L13/update L103/setLoading L110；DataSourceCollection.js ctor L16（三事件 L18-20）、add L84（Promise 透传 + removeAll 竞态守卫 L97）、remove L114、raise L253/lower L266/raiseToTop L279/lowerToBottom L302、getByName L198
  - 接线（01/03 交叉）：DataSourceDisplay.js ctor 订阅 L59-76（postRender L76）、defaultDataSource L105、defaultVisualizersCallback L169、update L311、_postRender L361、_onDataSourceAdded L476（entityCluster._initialize L494、primitives.add(entityCluster) L496）、_onDataSourceRemoved L506、_onDataSourceMoved L533（index 0 恒留 default）；CesiumWidget.js new DataSourceCollection L476/new DataSourceDisplay L483/entities getter L681/update 调用 L1208；Viewer.js L946-973/dataSources getter L1251
  - GeoJsonDataSource.js：defaultCrsFunction L29、crsNames L33/crsLinkHrefs L39/crsLinkTypes L40、默认样式 L41-47、simpleStyleIdentifiers L55、defaultDescribe L68、createObject L113（id 去重 L118-126/name 四级回退 L133-160）、geoJsonObjectTypes L189/geometryTypes L202、createPoint L265（PinBuilder 异步 promise L323-330）、createLineString L349（RHUMB L397）、createPolygon L429（holes L484-491/perPositionHeight L515-518）、processTopology L541（topojson.feature L545 复用查表）、ctor L592、static load L614、prototype.load L892/process L904（clear 唯一差异）、preload L908（fetchJson L929/选项 Property 化 L943-955）、load L984（crs 三分支 L999-1040、crs:null no-op L1047-1049）
  - KmlDataSource.js：isZipFile L320（魔数嗅探非后缀）、insertNamespaces L349/removeDuplicateNamespaces L376、loadXmlFromZip L397/loadDataUriFromZip L404、createEntity L447（kml PropertyBag）、readCoordinate L480、computeFinalStyle L1116/processStyles L1214/processExternalStyles L1204/applyStyle L1010、processFeature L2220（可见性祖先链 L2251-2263）、processFolder L2321（parentEntity 链）、processPlacemark L2329、RefreshMode L2792-2795、processNetworkLinkQueryString L2816（BBOX/viewBoundScale）、processNetworkLink L2996（onRegion 不支持 L3033-3039、onStop 默认 BBOX L3041-3046）、processFeatureNode L3203、loadKml L3217（DeferredLoading L3243）、loadKmz L3290（zip.js worker/wasm L3299-3302、doc 选取规则 L3310-3330）、load L3351、class L3524（camera/canvas L3555/3565、_lastCameraView L3570-3582）、static load L3603、instance load L3745（availability→clock）、update L3843（三模式刷新、EPSILON7 相机判定 L3869-3895）、DeferredLoading L194（1s/50ms 时间片 _giveUpTime L264）
  - CustomDataSource.js ctor L35/update L178（defaultDataSource 用途）；GpxDataSource.js loadGpx L554（computeAvailability→DataSourceClock L586-600）
  - EntityCluster.js：ctor L35（pixelRange 80 L39/minimumClusterSize 2 L40）、expandBoundingBox L79/getBoundingBox L88、addNonClusteredItem L127、addCluster L143（clusterEvent L160、簇三件套 id=成员数组）、getScreenSpacePositions L171（clusterShow L182、occluder 地平线剔除 L191-196）、createDeclutterCallback L223（amount<0.05 L225、高度未变跳过）、_initialize L508（订阅 scene.camera.changed L513，非 preUpdate/postRender 直订）、enabled L522/pixelRange L536/minimumClusterSize L550/clusterEvent L565/clusterBillboards-Labels-Points L570-602、getLabel L709/getBillboard L755/getPoint L801（BillboardVisualizer ctor L61/getBillboard L141 接缝）
- **⚠️ 与任务单差异（以源码为准）**：①1.145 KmlDataSource 无 featureByEntity 反查 API，KML 元数据在装载期写入 entity.kml PropertyBag；②EntityCluster 触发链是 scene.camera.changed（DataSourceDisplay._onDataSourceAdded 调 _initialize 挂上），帧循环只起间接作用；③GeoJSON 解析不走 worker/TaskProcessor（DataSources 目录零 TaskProcessor 引用，唯一 worker 是 KMZ 的 zip.js 自带 worker+wasm），文档已按实测写
- **数字**：check-links 全绿（17 个 md，代码链接 1702、相对链接 130、错误 0 警告 0）；14 全文 273 行、代码链接约 173 个
- **加餐篇建议（若有余力）**：Model/glTF 渲染管线（Scene/Model/ 新架构 + ModelSceneGraph + gltf 缓存）、性能调试（CesiumInspector/Cesium3DTilesInspector + requestRenderMode 度量）、天空光照大气（SkyAtmosphere/Sun/SkyBox）、点云与粒子（PointCloud/ParticleSystem）、裁剪与开挖（ClippingPolygon/ClippingPlane）、实战速查篇（业务配方索引）；纪律同前：grep 定行、占坑先行、每篇即 commit、全绿再 push

---

## 2026-11-06 04:5x–05:3x · 加餐A 15-Model与glTF加载 / 16-性能调试与优化（子代理半程中断，主会话接管收尾）

- **做了什么**：新写 `study/15-Model与glTF加载.md`（253 行/84 链接）与 `study/16-性能调试与优化.md`（256 行/64 链接，含四列速查表、卡顿源清单、动手实验、上线前检查单）；README 增设「加餐篇」分组（十七篇 · 五组+加餐导航）、成果统计与可深挖方向同步；PROGRESS 本节补全
- **过程**：子代理完成 15 定稿（882d1a9a30）后写 16 至 229 行中断（模型调用超时，announce 重投证实），05:07 后 15 分钟零进展、subagents 列表零存活 → 主会话接管：补 §15 上线前检查单达 256 行、README/PROGRESS/校验/push 全链收尾
- **15 主战场与锦点**：Scene/Model.js（入口工厂族/3D Tiles 复用）、GltfLoader 状态机（await + 每帧 process 三级 stages）、GltfJsonLoader + ResourceCache（JSON 摄取与缓存）、parse() → ModelComponents 组件树、ModelSceneGraph（组件树→运行时节点→DrawCommand）、activeAnimations 动画骨架、featureIdLabel→BatchTexture→style 特性样式、heightReference 贴地四态；与 04（3D Tiles 内嵌 gltf）/09（旧 Primitive 路径）/13（DrawCommand）关系防迷路表
- **16 主战场与锦点**：requestRenderMode（标脏/maximumRenderTimeChange）、帧率观测三件套（debugShowFramesPerSecond/FrameRateMonitor/PerformanceWatchdog）、debug 家族 + CesiumInspector、内存三本账（model.statistics/tileset.totalMemoryUsageInBytes/ResourceCacheStatistics）、缓存 LOD 上限（tileCacheSize/cacheBytes/skipLevelOfDetail）、相机惯性、拾取限流、像素比与 MSAA、点云 attenuation/EDL、问题→工具→锚点→调参四列速查表、常见卡顿源十条、上线前 11 条检查单
- **数字**：check-links 全绿（19 个 md，代码链接 2054、相对链接 189、错误 0 警告 0）
- **下一棒建议（加餐B：17-天空光照大气 / 18-点云与粒子）**：
  - 17 主战场：Scene/SkyAtmosphere.js、Globe.js 大气光散射（轮廓光/地面大气）、Scene/Sun/Moon/SunLight（光照方向与 Illuminate 统一）、 lightingModel（Scene.lightingMode？以 grep 为准：UNIFORM/HDR/LAMPLIGHT）、HDR 与 bloom（PostProcess 阶段，13 交叉）、EnvironmentMapping/IBL（若有，grep 确认）；与 02（大气对影像色调影响）、06（大气对 far plane/雾）交叉
  - 18 主战场：Scene/PointCloud.js（1.145 拆分后的 PointCloudShading/attenuation/EDL/backFaceCulling）、PointCloudEyeDomeLighting.js、Cesium3DTiles 点云瓦片（04 交叉：pnts 语义 extension）、Scene/ParticleSystem.js（发射器/粒子池/update 循环）、Billboard 驱动的粒子渲染链（与 03 交叉）
  - 纪律同前：开工 git log 查重 + PROGRESS 占坑先行；行号唯一来源本地 grep；收尾全绿再 push；若加餐C（19-裁剪开挖 / 20-实战速查）时间不足可留给下个夜间班次

---

## 2026-11-06 23:0x–23:3x · 加餐B 17-天空光照与大气 / 18-点云与粒子（子代理执行，无中断）

- **做了什么**：新写 `study/17-天空光照与大气.md`（251 行/约 140 链接）与 `study/18-点云与粒子.md`（259 行/约 137 链接）；README 加餐表 +2 行、阅读路线补 17/18 位置、成果统计十九篇（代码链接 2056、相对链接 527，17/18 起启用相对路径新格式）、可深挖方向划掉天空/点云两项；PROGRESS 本节补全
- **commit**：301b684632（17）、3ceef8918d（18）、7df146176d（README）；每篇写完即提交，收尾 check-links 全绿后 push
- **⚠️ 新规范（23:06 用户拍板，本棒首次执行）**：文档代码引用改用仓库内相对路径（从 study/ 出发 `../packages/...js#L123`），不再写 github.com 长链；旧文档长链由主会话脚本统一转换（待办：LINKING.md 与校验器同步更新）。校验器现状：相对链接只验目标存在（锤点剥离），新格式天然通过
- **17 主战场与锚点**：
  - 环境家族与默认装配：Scene.js L307/L315/L323/L330/L340/L565/L574/L780；CesiumWidget.js L382-L404（WGS84 限定建星空盒/月/大气、skyBox:false 纯净模式、globe 关→大气不显示）；帧内时序 renderEnvironment L3188（skyBox→大气→sun+bloom→moon）↔ updateEnvironment L3747 ↔ executeComputeCommands L3243（sun glow）
  - SkyBox/CubeMapPanorama：SkyBox.js L36/L89/L101（已退化为薄壳转发）；CubeMapPanorama.js L76/L102/L160/L179（transform/credit/错误事件，全景化）；SkyBox._cubeMap→frameState.environmentMap（Scene.js L2061，IBL 原料）
  - 空间大气：SkyAtmosphere.js L42/L60/L70/L73/L168/L172/L224/L233/L302-L337（flags 重建 program）；perFragmentAtmosphere 判定 L271；DynamicAtmosphereLightingType.js L8/L42 三态+fromGlobeFlags；Scene.js L3775-L3781（fromGlobeFlags 优先于 scene.atmosphere.dynamicLighting、isReadyForAtmosphere 闸门）；Atmosphere.js L39-L125（瑞利/米氏 6 参数+HSL 三偏移）；shader 文件为 .glsl（踩坑：.js 会校验失败）
  - 地面大气/晨昏线：Globe.js L176/L195/L205/L213/L221-L263/L272-L302（四个 fade 距离）/L344-L360；beginFrame L1003→tileProvider 同步 L1043-L1069（07 交叉）；GroundAtmosphere.glsl 组装 L676/L690
  - 太阳/月亮：Sun.js L42/L56/L95/L115/L134-L143/L167-L168/L177（ComputeCommand 现算 glow 纹理）/L230/L236；SunPostProcess.js L19/L23-L96/L111/L262（六级链）；Scene.js L3210-L3216（bloom 时机）/L4006-L4015（链启停）；Moon.js L32/L101/L115/L119；Simon1994PlanetaryPositions.js L638/L670
  - 光照总线：Scene.js L780/L2082（frameState.light）；Light.js L12/L14-L26；SunLight.js L14；UniformState.js setSunAndMoonDirections L1375/L1380/L1388/L1391、仲裁 L1505-L1523（SunLight 忽略自 direction 绑天文太阳、否则用 light.direction）；AutomaticUniforms.js czm_sunDirectionEC L1264/WC L1286
  - 雾：Fog.js L16/L25/L49/L56/L82/L89/L99/L122；CesiumMath.fog L1122；QuadtreePrimitive.js L1290-L1292/L1319-L1322（雾放行 SSE，07 伏笔兑现）；enabled+renderable=false 白嫖剔除组合；Scene.js L575/L4591
  - HDR/后处理：Scene.js L760/L761/L1664-L1676/L1686/L636/L4201；PostProcessStageCollection.js L35/L62（预装 fxaa/ao/bloom/tonemapping）；PostProcessStage.js L96/L876/L952；PostProcessStageLibrary.js createBloomStage L388/其余 L120-L496；两个 bloom 辨析（sunBloom≠postProcess.bloom）
  - IBL：Scene.js L767/L773；DynamicEnvironmentMapManager.js L69/L264/L295/L303/L854（星空盒→ComputeCommand 卷积 radiance+球谐）；ImageBasedLightingPipelineStage.js L21/L31-L37/L87；LightingModel.js L20/L33（UNLIT/PBR，与光照总线辨析）
  - 特色：环境家族一帧时序 ASCII、光照灌装链路图、5 个动手实验（拨快时钟看晨昏线/fog renderable=false 等）、7 条常见坑表
- **18 主战场与锚点**：
  - 双路线总览表（3D Tiles pnts vs TimeDynamic）；1.145 架构事实：**已无 PointCloud3DTileContent**，pnts 由 Model3DTileContent 承担（文件头导读 L2 原话）；preprocess3DTileContent.js L27 魔数嗅探；Cesium3DTileContentType.js L48；PntsParser.js L33/L256/L329/L394/L484/L526（两代架构共用解析器，BATCH_ID→_FEATURE_ID_0）
  - 衰减：PointCloudShading.js L21 九参数表；挂载三入口：Cesium3DTileset.js L610/L1713、Model/Model.js L385/L833；PointCloudStylingPipelineStage.js L57/L108/L119-L132/L153/L285/L358（HAS_POINT_CLOUD_ATTENUATION/BACK_FACE_CULLING 定义、样式→GLSL 函数）；「EDL 依赖 attenuation」的原理说明
  - EDL：Cesium3DTileset.js L611/L3352-L3361 门控；PointCloudEyeDomeLighting.js L22/L23-L50/L92/L157/L171/L181-L183/L192-L210（劫持 POINTS 命令→shallowClone 派生命令→离屏 FBO 重画→全屏混合，derivedCommands.pointCloudProcessor 缓存与 dirty 纪律，13 交叉）
  - 时序：TimeDynamicPointCloud.js L41/L93/L99/L150/L165/L171/L264/L283/L294/L324/L360/L399/L411/L468/L498/L510/L552/L612（平均加载时间预取/跳帧/getNearestReadyInterval 防黑屏/maximumMemoryUsage 256MB LRU）；旧 PointCloud.js 仅存此路：L57/L200-L201/L287/L301/L353/L613/L702/L768/L1166/L1273（update 内 2D/CV 投影换算 L1290-L1340、透明 pass 判定 L1386-L1390）
  - 粒子：ParticleSystem.js L58（成对 min/max 参数表：L80-L142，emissionRate L114、双矩阵 L97-L98/L102、updateCallback L73、bursts L95）；update L704 六步 ASCII（懒建 BillboardCollection L709、dt 鈐0 L721、Particle.update L732、calculateNumberToEmit L666、发射后组合矩阵变换回世界系 L777-L800、billboardCollection.update L807）；Particle.js L27/L35-L89/update L126（normalizedAge 插值）；updateBillboard L586/removeBillboard L580/freeParticlePool L563；ParticleBurst.js L14/L22/L28/L34；发射器：ParticleEmitter L19、Cone L46/Circle L50/Sphere L50/Box L60 emit
  - 性能账：「点云一次上传 GPU 反复画 vs 粒子 CPU 每帧重算 Billboard 转卖」本质分野；万级粒子主线程预警（16 交叉）
  - 特色：pnts 归宿链路图、EDL 劫持四步图、update 六步图、4 个动手实验（ion 资产/样式表达式/最小粒子系统/时序倍速）、8 条常见坑表
- **数字**：check-links 全绿（21 个 md，代码链接 2056、相对链接 527、错误 0 警告 0）；17 含链接约 140 个、18 含约 137 个（新格式计入相对链接）
- **下一棒建议（若继续加餐）**：裁剪与开挖（ClippingPlane/ClippingPolygonCollection，Scene/Globe/Model/3DTiles 四处挂点）、实战速查索引篇；旧文档 github.com 长链→相对路径的批量转换脚本由主会话执行（含 LINKING.md/check-links.mjs 同步改造：校验器需新增相对路径行号校验分支）；纪律同前：开工 git log 查重、行号唯一来源本地 grep、每篇即 commit、收尾全绿再 push
