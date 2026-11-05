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
