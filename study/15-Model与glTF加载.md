# 15 · Model 与 glTF 加载:从 fetch 到 DrawCommand 的组件化管线

> 阅读前提:读过 [05-帧更新与渲染循环.md](05-帧更新与渲染循环.md)(update 时序)与 [13-渲染命令与着色器.md](13-渲染命令与着色器.md)(DrawCommand/ShaderBuilder),[04-3DTiles加载与LOD.md](04-3DTiles加载与LOD.md)(瓦片内容分派)更佳。
> 一句话:1.145 的 Model = 「loader 层把 glTF 数据装进 CPU 组件树(ModelComponents)+ 运行时层把组件树经三级 pipeline stages 装配成 DrawCommand」的双层管线;本篇把这两层拆开讲透。

**本文讲什么**:

- 两层架构与状态机:[`GltfLoader.js`](../packages/engine/Source/Scene/GltfLoader.js) 如何「一次 await + 每帧 process()」分帧吃完一个 glTF
- 加载器族:[`GltfJsonLoader.js`](../packages/engine/Source/Scene/GltfJsonLoader.js) / [`GltfBufferViewLoader.js`](../packages/engine/Source/Scene/GltfBufferViewLoader.js) / [`GltfVertexBufferLoader.js`](../packages/engine/Source/Scene/GltfVertexBufferLoader.js) / [`GltfTextureLoader.js`](../packages/engine/Source/Scene/GltfTextureLoader.js) 与 [`ResourceCache.js`](../packages/engine/Source/Scene/ResourceCache.js) 缓存
- 组件层:[`ModelComponents.js`](../packages/engine/Source/Scene/ModelComponents.js) 全家福,[`parse`](../packages/engine/Source/Scene/GltfLoader.js#L3181) 如何把 JSON 变成对象树
- 运行时层:[`ModelSceneGraph.js`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js) 遍历建 [`ModelRuntimeNode`](../packages/engine/Source/Scene/Model/ModelRuntimeNode.js)/[`ModelRuntimePrimitive`](../packages/engine/Source/Scene/Model/ModelRuntimePrimitive.js),三级 pipeline stages 拼着色器,产出 [`ModelDrawCommand`](../packages/engine/Source/Scene/Model/ModelDrawCommand.js)
- 动画与骨架、特性与样式(`featureIdLabel`/BatchTexture/style)、贴地 `heightReference`([07](07-地形系统.md) 交叉)
- 与 3D Tiles 的关系:b3dm/pnts/i3dm/glb 如何全部复用 Model([04](04-3DTiles加载与LOD.md) 交叉)

**主战场**:`packages/engine/Source/Scene/` 下 `Gltf*.js` 家族、[`Scene/Model/Model.js`](../packages/engine/Source/Scene/Model/Model.js)(3611 行)、`Scene/Model/` 运行时家族。

## 1. 两层架构总览:先看地图再下潜

1.145 的 Model(历史上叫 `ModelExperimental`)是**数据与渲染彻底解耦**的重构:数据侧只产出纯 CPU 对象(组件树),渲染侧只消费组件树,中间用「pipeline stages」按需往 ShaderBuilder 里注代码。一个 glTF 从网络到屏幕共六段:

```
1 fromGltfAsync: 构造 GltfLoader, await loader.load()   ── 只做 JSON 摄取
        │
2 GltfJsonLoader: fetchArrayBuffer → parseGlb(二进制头拆包) 或 fetchJson
        │               └─ data URI / 嵌入 buffer 兜底解码
3 GltfLoader.process(frameState)  ←── 每帧由 Model.update 驱动
        │   loadResources → parse(): glTF JSON → ModelComponents 组件树
        │   同时挂起 GltfBufferView/VertexBuffer/IndexBuffer/Texture Loader
        │   (GPU 资源创建走 JobScheduler 分帧,不阻塞主线程)
        │
4 READY 后: new ModelSceneGraph(model, components)
        │   traverseAndCreateSceneGraph 递归 → ModelRuntimeNode/ModelRuntimePrimitive
        │
5 buildDrawCommands: buildRenderResources → computeBoundingVolumes → createDrawCommands
        │   model/node/primitive 三级 pipeline stages 逐级 process(资源包)
        │   ModelDrawCommands.buildModelDrawCommand → ShaderBuilder 拼着色器 + ModelDrawCommand
        │
6 每帧 pushDrawCommands → frameState.commandList   ── 交棒 [05](05-帧更新与渲染循环.md)/[13](13-渲染命令与着色器.md)
```

**关键设计**:2345每一步都可能跨多帧--`await loader.load()` 只保证 JSON 合法([`Model.js L3358-L3360`](../packages/engine/Source/Scene/Model/Model.js#L3358-L3360) 注释原话:「 Further resource loading ... requires hooking into model's update() as the frameState is needed」),其余资源在 `Model.update` 里由 [`processLoader`](../packages/engine/Source/Scene/Model/Model.js#L2154) 每帧推进;未就绪期间它往 `frameState.afterRender` 塞 `() => true` 保持 `requestRenderMode` 下持续补帧(详见 [16-性能调试与优化.md](16-性能调试与优化.md))。

**历史坐标**:这套架构前身是 `ModelExperimental`(1.97 引入),1.111 起取代旧 `Model.js`(Geometry/Loader 混合的"一次 await 全Ready"模型)。旧路径里与 [`Primitive`](../packages/engine/Source/Scene/Primitive.js) 合批共存的 Geometry 体系见 [09](09-几何图元与材质.md);新架构把「数据→组件→命令」彻底分层,也是 3D Tiles 1.1(glTF 内容、metadata)能直接落地的原因。

## 2. 入口全家福:一个工厂族 + 3D Tiles 复用

| 工厂 | 定义行 | 内部 loader | 用途 |
|---|---|---|---|
| [`Model.fromGltfAsync`](../packages/engine/Source/Scene/Model/Model.js#L3303) | L3303 | [`new GltfLoader`](../packages/engine/Source/Scene/Model/Model.js#L3345) | 普通 glTF/glb |
| [`Model.fromB3dm`](../packages/engine/Source/Scene/Model/Model.js#L3391) | L3391 | [`B3dmLoader`](../packages/engine/Source/Scene/Model/B3dmLoader.js) | 3D Tiles 批量模型 |
| [`Model.fromPnts`](../packages/engine/Source/Scene/Model/Model.js#L3425) | L3425 | [`PntsLoader`](../packages/engine/Source/Scene/Model/PntsLoader.js) | 点云([16](16-性能调试与优化.md) 交叉) |
| [`Model.fromI3dm`](../packages/engine/Source/Scene/Model/Model.js#L3447) | L3447 | [`I3dmLoader`](../packages/engine/Source/Scene/Model/I3dmLoader.js) | 实例化模型 |
| [`Model.fromGeoJson`](../packages/engine/Source/Scene/Model/Model.js#L3479) | L3479 | [`GeoJsonLoader`](../packages/engine/Source/Scene/Model/GeoJsonLoader.js) | geoJson 瓦片(vctr 内容) |

五个工厂统一经 [`makeModelOptions`](../packages/engine/Source/Scene/Model/Model.js#L3552) 归一选项再 `new Model(modelOptions)`;**构造函数 [`L204`](../packages/engine/Source/Scene/Model/Model.js#L204) 不做任何 IO**,只挂 loader、选项与空运行时(`_sceneGraph` 起初为 undefined,[`L543`](../packages/engine/Source/Scene/Model/Model.js#L543))。

**轴选项**:glTF 规范 y-up/z-forward,Cesium 世界 z-up--[`upAxis`](../packages/engine/Source/Scene/Model/Model.js#L3202)(默认 `Axis.Y`)与 [`forwardAxis`](../packages/engine/Source/Scene/Model/Model.js#L3203)(默认 `Axis.Z`)由 [`ModelUtility.getAxisCorrectionMatrix`](../packages/engine/Source/Scene/Model/ModelUtility.js#L267) 折算成一张修正矩阵,最终落在 ModelSceneGraph 的 [`_axisCorrectionMatrix`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L160)。
**⚠️ 1.145 实况**:没有 `sceneId` 选项--多场景 glTF 一律取 `gltf.scene` 标量指定的默认场景([`loadScene` 的取节点逻辑 L3147-L3148](../packages/engine/Source/Scene/GltfLoader.js#L3147-L3148))。

**3D Tiles 复用路径**([04](04-3DTiles加载与LOD.md) §6 续集):瓦片二进制经 [`preprocess3DTileContent`](../packages/engine/Source/Scene/Cesium3DTile.js#L1417) 按 magic 分派,[`Cesium3DTileContentFactory`](../packages/engine/Source/Scene/Cesium3DTileContentFactory.js#L23) 把 b3dm/pnts/i3dm/glb/gltf/geoJson 全部路由到 [`Model3DTileContent`](../packages/engine/Source/Scene/Model/Model3DTileContent.js#L36),其静态工厂 [`fromB3dm L373`](../packages/engine/Source/Scene/Model/Model3DTileContent.js#L373)/[`fromPnts L423`](../packages/engine/Source/Scene/Model/Model3DTileContent.js#L423)/[`fromI3dm L401`](../packages/engine/Source/Scene/Model/Model3DTileContent.js#L401)/[`fromGltf L346`](../packages/engine/Source/Scene/Model/Model3DTileContent.js#L346) 内部全部调 Model 对应工厂并带上 `content` 选项(`ModelType.TILE_GLTF`)。**每帧瓦片更新时 [`Model3DTileContent.update`](../packages/engine/Source/Scene/Model/Model3DTileContent.js#L249) 把 tileset 级属性(colorBlend/customShader/imageBasedLighting/pointCloudShading...)批量灌给内部 Model**--这就是「瓦片特性和单模型共用一条渲染管线」的全部秘密。

## 3. GltfLoader 状态机:一次 await + 每帧 process

[`GltfLoader`](../packages/engine/Source/Scene/GltfLoader.js#L184) 继承 [`ResourceLoader`](../packages/engine/Source/Scene/ResourceLoader.js#L16),用**双状态机**管「几何」与「纹理」两条腿([`_state`/`_textureState` 初始 NOT_LOADED,L255-L256](../packages/engine/Source/Scene/GltfLoader.js#L255-L256)):

```
NOT_LOADED → LOADING ──(JSON+资源承诺落定)──► LOADED
   ▲ LOADED → PROCESSING ──(JobScheduler 全部 job 完成)──► POST_PROCESSING
              POST_PROCESSING ──(postProcessGeometry: buffer 拷贝收尾)──► PROCESSED
              PROCESSED ──(卸 bufferView 释放 JSON)──► READY
纹理腿独立:LOADING → PROCESSING → READY(incrementallyLoadTextures 时允许几何先画)
失败任一腿:FAILED;destroy 后:UNLOADED
```

- [`load()`](../packages/engine/Source/Scene/GltfLoader.js#L361):幂等(缓存 `_promise`),只做一件事--[`loadGltfJson`](../packages/engine/Source/Scene/GltfLoader.js#L542) 把状态推到 LOADED。

几何腿逐态速查(枚举定义在 [`GltfLoaderState L81`](../packages/engine/Source/Scene/GltfLoader.js#L81)):

| 状态 | 含义 | 谁推进到下一态 |
|---|---|---|
| `NOT_LOADED` | 初始,`load()` 未调 | 构造函数置入([`L255`](../packages/engine/Source/Scene/GltfLoader.js#L255)) |
| `LOADING` | 等 JSON promise | `loadGltfJson` resolve(`L564`)/ reject(`L573`) |
| `LOADED` | JSON 就绪,尚未解析 | 首次 `process()` 发起 `loadResources`,置 `PROCESSING`([`L597`](../packages/engine/Source/Scene/GltfLoader.js#L597)) |
| `PROCESSING` | 解析+子加载器分帧上传中 | [`processLoaders L616`](../packages/engine/Source/Scene/GltfLoader.js#L616) 全部就绪后置 `POST_PROCESSING`(`L659`) |
| `POST_PROCESSING` | buffer 拷贝收尾 | [`postProcessGeometry L663`](../packages/engine/Source/Scene/GltfLoader.js#L663) → `PROCESSED`([`L388`](../packages/engine/Source/Scene/GltfLoader.js#L388)) |
| `PROCESSED` | 几何可用,中间数组还在 | `_resourcesLoaded` 后卸 bufferView、释放 typedArray([`L391-L398`](../packages/engine/Source/Scene/GltfLoader.js#L391-L398))→ `READY` |
| `READY` | 全就绪,`_process` 直接 true([`L375`](../packages/engine/Source/Scene/GltfLoader.js#L375)) | 终态 |
| `FAILED` | 任一环抛错 | `handleError` 统一报错([`L610`](../packages/engine/Source/Scene/GltfLoader.js#L610),几何腿 `L479-L488`、纹理腿 `L496`) |

**错误语义细节**:`incrementallyLoadTextures=true` 时(默认)纹理错误单独捕获、不拖垮几何腿([`loadTexture` 的 catch,L1637-L1649](../packages/engine/Source/Scene/GltfLoader.js#L1637-L1649));`false` 时纹理错误与几何错误一起归并进 `_processError`,在 `process()` 下一帧转 `FAILED`--「先上屏后补纹理」与「要么全好要么报错」两种产品语义的开关就在这。
- [`process(frameState)`](../packages/engine/Source/Scene/GltfLoader.js#L445):首次调用触发 [`loadResources`](../packages/engine/Source/Scene/GltfLoader.js#L579)(解析 + 挂起所有子加载器),随后每帧 [`processLoaders`](../packages/engine/Source/Scene/GltfLoader.js#L616) 逐个问子加载器「好了没」;几何全好后 [`postProcessGeometry`](../packages/engine/Source/Scene/GltfLoader.js#L663)(把 CPU 数组拷进 GPU Buffer)推到 READY 并卸掉中间产物。
- [`_processTextures`](../packages/engine/Source/Scene/GltfLoader.js#L427)(纹理腿):所有 `GltfTextureLoader.process` 返回 true 才 READY;`incrementallyLoadTextures`(默认 true)时**模型不等纹理即可上屏**,纹理陆续到齐。

**分帧的本质**:顶点/索引/纹理的 GPU 上传不是 Promise 而是「Job」--[`GltfVertexBufferLoader` 的 `jobScheduler.execute(..., JobType.BUFFER)`](../packages/engine/Source/Scene/GltfVertexBufferLoader.js#L263-L264) 与 [`GltfIndexBufferLoader` 同款 L205-L206](../packages/engine/Source/Scene/GltfIndexBufferLoader.js#L205-L206)、[`GltfTextureLoader` 的 `JobType.TEXTURE` L159-L166](../packages/engine/Source/Scene/GltfTextureLoader.js#L159-L166);调度器满了就「下帧再试」,所以 `process()` 必须每帧来。Draco/KTX2 等重解码则另有 [`GltfDracoLoader`](../packages/engine/Source/Scene/GltfDracoLoader.js) / [`GltfImageLoader`](../packages/engine/Source/Scene/GltfImageLoader.js)(KTX2 转码多 mip,[`L141` 注释](../packages/engine/Source/Scene/GltfImageLoader.js#L141))走 TaskProcessor worker。

## 4. JSON 摄取与缓存:GltfJsonLoader + ResourceCache

[`GltfJsonLoader.load`](../packages/engine/Source/Scene/GltfJsonLoader.js#L96) 三分支:已有 JSON 对象 / typedArray / URI。URI 路径走 [`_fetchGltf` → fetchArrayBuffer](../packages/engine/Source/Scene/GltfJsonLoader.js#L140),再 [`processGltfTypedArray`](../packages/engine/Source/Scene/GltfJsonLoader.js#L284) 判定 `.glb` 二进制([`parseGlb`](../packages/engine/Source/Scene/GltfJsonLoader.js#L288) 拆 JSON chunk/buffer chunk),否则按 JSON 取;嵌入的 data URI 由 [`decodeDataUris`](../packages/engine/Source/Scene/GltfJsonLoader.js#L214) 兜底转 buffer。之后 [`GltfPipeline`](../packages/engine/Source/Scene/GltfPipeline/parseGlb.js) 目录下的修正管线([`addDefaults.js`](../packages/engine/Source/Scene/GltfPipeline/addDefaults.js)、[`updateVersion.js`](../packages/engine/Source/Scene/GltfPipeline/updateVersion.js) 等纯函数族)补全默认值并升级旧扩展。

**内存复用靠 [`ResourceCache`](../packages/engine/Source/Scene/ResourceCache.js)**:以 cacheKey(通常是 glTF 资源 URL + bufferView/纹理 id 组合)为键全局去重--[`get`](../packages/engine/Source/Scene/ResourceCache.js#L59) 查引用计数,各工厂如 [`getGltfJsonLoader`](../packages/engine/Source/Scene/ResourceCache.js#L267)/[`getBufferViewLoader`](../packages/engine/Source/Scene/ResourceCache.js#L309)/[`getVertexBufferLoader`](../packages/engine/Source/Scene/ResourceCache.js#L470)。同一 bufferView 被多个 accessor 引用时只解码一次;3D Tiles 的同款瓦片跨 tileset 共享也靠它。[`GltfBufferViewLoader`](../packages/engine/Source/Scene/GltfBufferViewLoader.js#L17) 取 buffer(外置 URI 或 glb 内嵌 chunk,[`getBufferLoader L209`](../packages/engine/Source/Scene/GltfBufferViewLoader.js#L209))切出视图,EXT_meshopt 压缩在此同步 `MeshoptDecoder.decodeGltfBuffer`([`loadResources L151-L205`](../packages/engine/Source/Scene/GltfBufferViewLoader.js#L151-L205))。

纹理腿细节:[`GltfTextureLoader`](../packages/engine/Source/Scene/GltfTextureLoader.js#L23) [`load()`](../packages/engine/Source/Scene/GltfTextureLoader.js#L112) 负责 fetch+解码图片,[`process()`](../packages/engine/Source/Scene/GltfTextureLoader.js#L129) 借帧循环的 `frameState.context` 由 [`createTexture`](../packages/engine/Source/Scene/GltfTextureLoader.js#L246) 真正建 GPU 纹理--**持有 context 是「必须每帧 process」的根本原因**。

加载器族速查(全部继承 [`ResourceLoader L16`](../packages/engine/Source/Scene/ResourceLoader.js#L16),即 load/process/unload + cacheKey 四件套):

| 加载器 | 输入 | 产出 | 重活在哪 |
|---|---|---|---|
| [`GltfJsonLoader`](../packages/engine/Source/Scene/GltfJsonLoader.js#L28) | URI/typedArray/JSON | 归一 glTF JSON + buffer 下载器 | `parseGlb` 主线程拆包 |
| [`GltfBufferViewLoader`](../packages/engine/Source/Scene/GltfBufferViewLoader.js#L17) | buffer+偏移切片 | typedArray 视图 | meshopt wasm 同步解压([`L175 一带`](../packages/engine/Source/Scene/GltfBufferViewLoader.js#L175)) |
| [`GltfVertexBufferLoader`](../packages/engine/Source/Scene/GltfVertexBufferLoader.js#L22) | accessor+bufferView | GPU Buffer(VAO 挂点) | JobScheduler 分帧([`L263`](../packages/engine/Source/Scene/GltfVertexBufferLoader.js#L263)) |
| [`GltfIndexBufferLoader`](../packages/engine/Source/Scene/GltfIndexBufferLoader.js#L22) | indices accessor | GPU index Buffer | 同上([`L205`](../packages/engine/Source/Scene/GltfIndexBufferLoader.js#L205)) |
| [`GltfImageLoader`](../packages/engine/Source/Scene/GltfImageLoader.js#L18) | image URI/bufferView | ImageBitmap | KTX2/basis 转码 worker |
| [`GltfTextureLoader`](../packages/engine/Source/Scene/GltfTextureLoader.js#L23) | image+采样器 | GPU Texture | `JobType.TEXTURE` 分帧建纹理 |
| [`GltfDracoLoader`](../packages/engine/Source/Scene/GltfDracoLoader.js) | 压缩 accessor | 解压后 typedArray | Draco wasm worker |
| [`GltfSpzLoader`](../packages/engine/Source/Scene/GltfSpzLoader.js) | spz 压缩属性 | 解压 typedArray | spz wasm(高斯泼溅用) |
| [`GltfStructuralMetadataLoader`](../packages/engine/Source/Scene/GltfStructuralMetadataLoader.js) | EXT_structural_metadata | 属性表/属性纹理 | schema 解析([`loadStructuralMetadata` 挂入,L3250 一带](../packages/engine/Source/Scene/GltfLoader.js#L3250)) |

## 5. parse():glTF JSON → ModelComponents 组件树

[`parse`](../packages/engine/Source/Scene/GltfLoader.js#L3181) 一次性把 JSON 全部翻译成 [`ModelComponents.js`](../packages/engine/Source/Scene/ModelComponents.js) 的纯数据类(**不含任何 GPU 引用**,故可缓存/可跨 tileset 复用):

| 组件 | 定义行 | 对应 glTF 概念 |
|---|---|---|
| [`Components`](../packages/engine/Source/Scene/ModelComponents.js#L1108) | L1108 | 整个文档(scene/animation/skin/元数据/轴) |
| [`Scene`](../packages/engine/Source/Scene/ModelComponents.js#L866) | L866 | `scenes[i]`(根节点 id 列表) |
| [`Node`](../packages/engine/Source/Scene/ModelComponents.js#L748) | L748 | `nodes[i]`(matrix/translation/rotation/scale + children) |
| [`Primitive`](../packages/engine/Source/Scene/ModelComponents.js#L558) | L558 | `meshes[].primitives[]`(attribute/indices/material/featureIds) |
| [`Attribute`](../packages/engine/Source/Scene/ModelComponents.js#L134) | L134 | accessor+bufferView 语义化(POSITION/NORMAL...) |
| [`Indices`](../packages/engine/Source/Scene/ModelComponents.js#L304) | L304 | 索引 accessor |
| [`Instances`](../packages/engine/Source/Scene/ModelComponents.js#L678) | L678 | EXT_mesh_gpu_instancing 实例属性 |
| [`Skin`](../packages/engine/Source/Scene/ModelComponents.js#L714) | L714 | `skins[]`(joints/inverseBindMatrices) |
| [`Animation`](../packages/engine/Source/Scene/ModelComponents.js#L982) | L982 | `animations[]`(channel + sampler) |
| [`FeatureIdAttribute`](../packages/engine/Source/Scene/ModelComponents.js#L346) 等 | L346/L410/L480 | EXT_mesh_features 三形态(属性/隐式/纹理) |

翻译函数族(同名对位):[`loadNodes L2931`](../packages/engine/Source/Scene/GltfLoader.js#L2931)→[`loadNode L2862`](../packages/engine/Source/Scene/GltfLoader.js#L2862)、[`loadSkins L2974`](../packages/engine/Source/Scene/GltfLoader.js#L2974)、[`loadAnimations L3098`](../packages/engine/Source/Scene/GltfLoader.js#L3098)(通道 [`loadAnimationChannel L3068`](../packages/engine/Source/Scene/GltfLoader.js#L3068))、[`loadArticulations L3136`](../packages/engine/Source/Scene/GltfLoader.js#L3136)(Cesium 私有 AGI_articulations)、[`loadScene L3155`](../packages/engine/Source/Scene/GltfLoader.js#L3155);图元级在 [`loadPrimitive L2309`](../packages/engine/Source/Scene/GltfLoader.js#L2309)(材料 [`loadMaterial L1889`](../packages/engine/Source/Scene/GltfLoader.js#L1889)、属性 [`loadAttribute L1268`](../packages/engine/Source/Scene/GltfLoader.js#L1268)、纹理 [`loadTexture L1603`](../packages/engine/Source/Scene/GltfLoader.js#L1603)、实例化 [`loadInstances L2750`](../packages/engine/Source/Scene/GltfLoader.js#L2750))。两个坐标特例:**CESIUM_RTC** 中心扩展在此读取([`L3186`](../packages/engine/Source/Scene/GltfLoader.js#L3186),几乎总是 WGS84 坐标故跳过轴修正);普通 glTF 则把 y-up 顶点整体乘轴修正矩阵。

## 6. ModelSceneGraph:组件树 → 运行时节点 → DrawCommand

JSON READY 后,[`Model.update`](../packages/engine/Source/Scene/Model/Model.js#L2004)(L2042-L2070 段)首次拿到 `loader.components` 就 `new ModelSceneGraph({model, modelComponents})`([`L2065-L2070`](../packages/engine/Source/Scene/Model/Model.js#L2065-L2070))。[ModelSceneGraph 构造](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L44)做两件事:

1. [`computeModelMatrix L316`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L316):`modelMatrix × CESIUM_RTC 中心 × 轴修正`,缓存为 `_computedModelMatrix`;2D 场景另算 [`computeModelMatrix2D L341`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L341)。
2. [`traverseAndCreateSceneGraph L386`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L386):从场景根递归,为每个可达 Node 建 [`ModelRuntimeNode`](../packages/engine/Source/Scene/Model/ModelRuntimeNode.js#L28)(记 `transformToRoot` 祖先链乘积,初始化 [`initialize L497`](../packages/engine/Source/Scene/Model/ModelRuntimeNode.js#L497) 算 `computedTransform = transformToRoot × transform`),为每个 Primitive 建 [`ModelRuntimePrimitive`](../packages/engine/Source/Scene/Model/ModelRuntimePrimitive.js#L49)。**运行时层持有的就是可变状态**(drawCommand 槽位、pipelineStages、可见性),组件树保持只读。

命令装配三段式由 [`buildDrawCommands L461`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L461) 串起来:

```
buildRenderResources L485          computeBoundingVolumes L574      createDrawCommands L677
  ModelRenderResources(new L16)  →   自底向上:primitive 球   →      每个 runtimePrimitive:
  ├─ model 级 stages.process          ⊕ node 球 ⊕ model 球          ModelDrawCommands.buildModelDrawCommand
  ├─ NodeRenderResources(new L17)                                    → runtimePrimitive.drawCommand
  └─ PrimitiveRenderResources(new L18)
       primitive 级 stages.process(ShaderBuilder 在此逐步长出)
```

(三个资源包类:[`ModelRenderResources.js L16`](../packages/engine/Source/Scene/Model/ModelRenderResources.js#L16)、[`NodeRenderResources.js L17`](../packages/engine/Source/Scene/Model/NodeRenderResources.js#L17)、[`PrimitiveRenderResources.js L18`](../packages/engine/Source/Scene/Model/PrimitiveRenderResources.js#L18)。)

### 6.1 pipeline stages 全景(按级分组)

**model 级**(`configurePipeline` 按条件 push,见上)一览:

| Stage | 注入什么 | 触发条件 |
|---|---|---|
| `ModelColorPipelineStage` | czm_color 混合 uniform | `model.color` 定义 |
| `ImageBasedLightingPipelineStage` | SH 系数/环境 mip | `imageBasedLighting.enabled` |
| `ModelClippingPlanesPipelineStage` | 裁剪面判定 | 开启裁剪面 |
| `ModelClippingPolygonsPipelineStage` | 多边形裁剪纹理 | 裁剪多边形有几何 |
| `ModelSilhouettePipelineStage` | 轮廓放大重画 pass | `hasSilhouette`([16](16-性能调试与优化.md) 开销点) |
| `ModelSplitterPipelineStage` | 分屏 position.x 判定 | `splitDirection ≠ NONE` |
| `TilesetPipelineStage` | 瓦片级 uniform | `ModelType.is3DTiles` |
| `AtmospherePipelineStage` | 雾浓度 | 雾开启且可渲染 |

**primitive 级**主干(定义与顺序见 [`ModelRuntimePrimitive.configurePipeline L193-L322`](../packages/engine/Source/Scene/Model/ModelRuntimePrimitive.js#L193-L322)):`GeometryPipelineStage`(POSITION/NORMAL/TEXCOORD 属性声明,必入)→ `SceneMode2DPipelineStage`(projectTo2D 时)→ `Wireframe/Classification/MorphTargets/Skinning/PointCloudStyling`(按需)→ `DequantizationPipelineStage`(KHR_mesh_quantization)→ `ImageryPipelineStage`( draped 矢量)→ `MaterialPipelineStage`(PBR 参数/纹理 uniform)→ `MetadataPickingPipelineStage` → `CustomShaderPipelineStage`(用户 GLSL)→ `LightingPipelineStage`(光照模型选择)→ `PickingPipelineStage`(pickId)→ `SelectedFeatureIdPipelineStage`(高亮选中 feature)。每个 stage 一个文件,全部在 `Scene/Model/` 目录下同名可查--**读源码时先读 [`configurePipeline L193-L322`](../packages/engine/Source/Scene/Model/ModelRuntimePrimitive.js#L193-L322) 再顺着 stage 名点进对应文件**,是本目录最省力的入口。

**三级 pipeline stages**(按需注入、可重配):model 级 [`configurePipeline L715`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L715)(颜色混合/IBL/裁剪面/裁剪多边形/轮廓/分屏/雾...按条件 push);node 级 [`ModelRuntimeNode.configurePipeline L577`](../packages/engine/Source/Scene/Model/ModelRuntimeNode.js#L577)(instancing/morph);primitive 级 [`ModelRuntimePrimitive.configurePipeline L193`](../packages/engine/Source/Scene/Model/ModelRuntimePrimitive.js#L193)--依次可能 push `GeometryPipelineStage`(位置/法线属性)→`Skinning/MorphTargets/Wireframe/Classification`(L258-L283 一带)→`Material`(PBR 参数与纹理 uniform,L299)→`Metadata/CustomShader/Lighting/Picking`(L306-L322)→`SelectedFeatureId` 等。每个 stage 的 `process(renderResources, ...)` 往 ShaderBuilder 加 attribute/uniform/varying/函数--**着色器是「配置驱动拼装」出来的,不是写死的模板**(拼装终点见 [13 §着色器](13-渲染命令与着色器.md))。改 `customShader`/`imageBasedLighting` 等会置 dirty → [`Model.prototype.resetDrawCommands`](../packages/engine/Source/Scene/Model/Model.js#L1986)(调用点 L842/L863/L1074)→ 下帧重跑三段式。

**命令本体**:[`ModelDrawCommands.buildModelDrawCommand L38`](../packages/engine/Source/Scene/Model/ModelDrawCommands.js#L38) 内部 [`createShaderProgram L73`](../packages/engine/Source/Scene/Model/ModelDrawCommands.js#L73) 调 `shaderBuilder.buildShaderProgram(context)` 得编译产物,再组装 [`ModelDrawCommand`](../packages/engine/Source/Scene/Model/ModelDrawCommand.js#L37)。它是个**命令包装器**:内部同时持有不透明命令与派生的半透明命令([`initialize L160`](../packages/engine/Source/Scene/Model/ModelDrawCommand.js#L160),样式可能把部分 feature 变半透明),每帧按 `StyleCommandsNeeded` 决定 push 哪几条([`pushCommands L565`](../packages/engine/Source/Scene/Model/ModelDrawCommand.js#L565)+[`pushCommand L751`](../packages/engine/Source/Scene/Model/ModelDrawCommand.js#L751))。pick 用的 pickId 由 [`PickingPipelineStage`](../packages/engine/Source/Scene/Model/PickingPipelineStage.js#L58) 以 `context.createPickId` 生成并打包成 RGBA8([8](08-拾取系统.md) §2 的颜色编码协议);轮廓(edge pass)命令也在 [`pushDrawCommands L1012`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L1012) 一并进 `frameState.commandList`--之后的一切(分箱、pass 编队、执行)与 [13](13-渲染命令与着色器.md) 完全同轨。

每帧驱动链(都在 Model.js update 内):[`updateSceneGraph L2699`](../packages/engine/Source/Scene/Model/Model.js#L2699)(modelMatrix/minimumPixelSize 变化 → [`sceneGraph.updateModelMatrix L804`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L804) 重写节点矩阵;动画帧 → [`sceneGraph.update L771`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L771))→ [`buildDrawCommands L2473`](../packages/engine/Source/Scene/Model/Model.js#L2473)(一次性闸门 `_drawCommandsBuilt`)→ [`pushDrawCommands L2814`](../packages/engine/Source/Scene/Model/Model.js#L2814)。

### 6.2 StyleCommandsNeeded:为什么一个图元可能有两条命令

样式可能把部分 feature 画成半透明,而半透明必须走 TRANSLUCENT pass + [13 §背面剔除排序](13-渲染命令与着色器.md)。[`StyleCommandsNeeded`](../packages/engine/Source/Scene/Model/StyleCommandsNeeded.js#L9) 三态:`ALL_OPAQUE` / `ALL_TRANSLUCENT` / `OPAQUE_AND_TRANSLUCENT`;每次 style 变化重新评估([`Model.js L2248`](../packages/engine/Source/Scene/Model/Model.js#L2248)),`ModelDrawCommand.pushCommands` 按当前态选命令。轮辘(silhouette)也是双命令思路:轮廓画在独立 pass、放大顶点重画背面(开销讨论见 [16](16-性能调试与优化.md))。

### 6.3 内存统计:model.statistics

[`Model` 挂了 [`ModelStatistics`](../packages/engine/Source/Scene/Model/ModelStatistics.js#L14)(构造于 [`Model.js L528`](../packages/engine/Source/Scene/Model/Model.js#L528),getter [`L745-L756`](../packages/engine/Source/Scene/Model/Model.js#L745-L756)),按 `geometryByteLength / texturesByteLength / batchTexturesByteLength` 分列估算(清零 [`clear L114`](../packages/engine/Source/Scene/Model/ModelStatistics.js#L114),几何累加 [`L145`](../packages/engine/Source/Scene/Model/ModelStatistics.js#L145)、纹理累加 [`L172`](../packages/engine/Source/Scene/Model/ModelStatistics.js#L172));管线重跑时会同步重算([`Model.js L2138` 注释`](../packages/engine/Source/Scene/Model/Model.js#L2138))。这是排查「模型吃内存」的第一入口(配合 [16 §内存与瓦片缓存](16-性能调试与优化.md))。

## 7. 动画与骨架:activeAnimations 一条链

- API 入口 [`model.activeAnimations`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L24)(构造时挂在 Model 上,[`Model.js L299 _activeAnimations`](../packages/engine/Source/Scene/Model/Model.js#L299)):[`add`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L169)/[`addAll`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L253) 返回 [`ModelAnimation`](../packages/engine/Source/Scene/Model/ModelAnimation.js#L25)。

  `add(options)` 常用选项(参数文档见 [`ModelAnimationCollection.js L117-L122`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L117-L122)):

  | 选项 | 默认 | 语义 |
  |---|---|---|
  | `multiplier` | 1.0 | 相对场景时钟的倍速 |
  | `reverse` | false | 倒放 |
  | `loop` | NONE | REPEAT/MIRRORED_REPEAT(枚举 [`ModelAnimationLoop.js L17-L33`](../packages/engine/Source/Scene/ModelAnimationLoop.js#L17-L33),与 delay/removeOnStop 联动) |
  | `delay` | 0 | 起播延迟秒数 |
  | `removeOnStop` | false | 停止后从集合移除 |
  | `animationTime` | - | 自定义「场景时间→局部动画时间」回调 |

  动画对象上挂三个事件:[`start L64`](../packages/engine/Source/Scene/Model/ModelAnimation.js#L64)/[`update L83`](../packages/engine/Source/Scene/Model/ModelAnimation.js#L83)/[`stop L100`](../packages/engine/Source/Scene/Model/ModelAnimation.js#L100);集合级 [`animationAdded L37`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L37)/[`animationRemoved L51`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L51)([`L309` 单个 remove、`L331` removeAll 批量 raiseEvent`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L309))。[`animateWhilePaused L62`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L62) 允许场景暂停时仍按 `animationTime` 回调驱动动画(如接真实时钟,update 里判定见 [`L413`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L413))。
- 每帧 [`ModelAnimationCollection.update L403`](../packages/engine/Source/Scene/Model/ModelAnimationCollection.js#L403):算局部时间差 → 调 [`ModelAnimation.animate L393`](../packages/engine/Source/Scene/Model/ModelAnimation.js#L393) → 逐通道 [`ModelAnimationChannel.animate L249`](../packages/engine/Source/Scene/Model/ModelAnimationChannel.js#L249):用样条 [`spline.evaluate(localAnimationTime)`](../packages/engine/Source/Scene/Model/ModelAnimationChannel.js#L250-L295) 插值后**直接写 runtimeNode 的 translation/rotation/scale/morphWeights**--动画不是 shader 效果,是每帧改节点矩阵。样条按插值类型建(LINEAR/STEP/CUBICSPLINE,[`createSpline L146`](../packages/engine/Source/Scene/Model/ModelAnimationChannel.js#L146)、多条输出的 [`createSplines L173`](../packages/engine/Source/Scene/Model/ModelAnimationChannel.js#L173),rotation 通道走四元数 spline)。
- 骨架蒙皮:被 skin 引用的节点持有 [`ModelSkin`](../packages/engine/Source/Scene/Model/ModelSkin.js#L19)(joints + 逆绑定矩阵);每帧 [`updateJointMatrices L827`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L827) 重算 joint 数组,`SkinningPipelineStage` 把它作为 uniform 数组注入顶点着色器做 `skinningMatrix × position`。Cesium 私有的关节动画(articulations)走 [`setArticulationStage L1094`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L1094)/[`applyArticulations L1118`](../packages/engine/Source/Scene/Model/ModelSceneGraph.js#L1118) 直接改节点矩阵。

## 8. 特性与样式:featureIdLabel → BatchTexture → style

建筑等「一模型多对象」场景:glTF 的 EXT_mesh_features / 旧 EXT_feature_metadata 给每个顶点打 featureId,渲染/拾取都以 feature 为粒度。[`featureIdLabel`](../packages/engine/Source/Scene/Model/Model.js#L332-L336)(默认 `"featureId_0"`,数字自动转下标)选中一组 id;id 表 + 属性表(EXT_structural_metadata)装进 [`ModelFeatureTable`](../packages/engine/Source/Scene/Model/ModelFeatureTable.js#L25),为每个 feature 建 [`ModelFeature`](../packages/engine/Source/Scene/Model/ModelFeature.js#L33)--拾取后从 `model.getFeature(id)` 拿到它,[`getProperty L163`](../packages/engine/Source/Scene/Model/ModelFeature.js#L163)/[`setProperty L225`](../packages/engine/Source/Scene/Model/ModelFeature.js#L225) 读写属性(注意路径以本仓库为准:`Scene/Model/ModelFeature.js`)。

运行时写操作（style 的 show/color、`setProperty`）落到一张每 feature 一像素的 [`BatchTexture`](../packages/engine/Source/Scene/BatchTexture.js#L30)（[`ModelFeatureTable` 内创建，L148 一带](../packages/engine/Source/Scene/Model/ModelFeatureTable.js#L148)，每帧 [`update L162`](../packages/engine/Source/Scene/Model/ModelFeatureTable.js#L162) 上传脏行）；着色器侧 `BatchTexturePipelineStage` 按 featureId 采样它实现 per-feature 着色。样式求值的两路分工：

| 条件 | 求值路径 | 实现 |
|---|---|---|
| 常量表达式（不引用属性） | CPU 一次性 | 求值后写入 uniform/固定值，无需逐 feature |
| 引用属性的 show/color | **CPU 求值**（默认） | [`updateStyle L2220`](../packages/engine/Source/Scene/Model/Model.js#L2220) → [`ModelFeatureTable.applyStyle L256`](../packages/engine/Source/Scene/Model/ModelFeatureTable.js#L256) 逐行写 BatchTexture；[`CPUStylingPipelineStage L35`](../packages/engine/Source/Scene/Model/CPUStylingPipelineStage.js#L35) 只负责注入 `USE_CPU_STYLING` 着色路径与混合 uniform |
| 引用属性且无法 CPU 化 | GPU | StyleExpression 编译进着色器（重建命令） |

选 CPU 路的动机：改样式只重传一张小纹理、不动着色器；`styleCommandsNeededDirty` 变化时（不透明↔半透明份数切换）才触发 [`updateStyleCommandsNeeded L2232` 一带](../packages/engine/Source/Scene/Model/Model.js#L2232) 重建命令。`setProperty` 同样写 BatchTexture（[`ModelFeature.setProperty L225`](../packages/engine/Source/Scene/Model/ModelFeature.js#L225) 置脏该行）。[`model.style = new Cesium3DTileStyle(...)`](../packages/engine/Source/Scene/Model/Model.js#L1050-L1055) 置 `_styleDirty`,[`updateStyle L2220`](../packages/engine/Source/Scene/Model/Model.js#L2220) 评估条件表达式:颜色/show 按特性可分频成 CPU([`CPUStylingPipelineStage.process L35`](../packages/engine/Source/Scene/Model/CPUStylingPipelineStage.js#L35) 写 BatchTexture)与 GPU(StyleExpression 进着色器)两路,并按 alpha 结果用 [`StyleCommandsNeeded.getStyleCommandsNeeded L2248`](../packages/engine/Source/Scene/Model/Model.js#L2248) 决定 ModelDrawCommand 该派生哪些变体--**这就是 §6 双命令存在的原因**。[`CustomShader`](../packages/engine/Source/Scene/Model/CustomShader.js#L122)(vertex/fragment 片段注入)是用户侧逃生舱,由 `CustomShaderPipelineStage` 合入(开销见 [16](16-性能调试与优化.md))。

## 9. 贴地:heightReference 四态(07 交叉)

[`Model.fromGltfAsync` 的 `heightReference` 选项](../packages/engine/Source/Scene/Model/Model.js#L3207)(默认 [`NONE`](../packages/engine/Source/Scene/Model/Model.js#L365))支持 [`CLAMP_TO_GROUND`](../packages/engine/Source/Scene/HeightReference.js#L21)/[`RELATIVE_TO_GROUND`](../packages/engine/Source/Scene/HeightReference.js#L28)/[`CLAMP_TO_3D_TILE`](../packages/engine/Source/Scene/HeightReference.js#L49) 四态,且**必须同时传 `scene`**(要采样地形高度)。实现极简:[`updateClamping L2500`](../packages/engine/Source/Scene/Model/Model.js#L2500) 把模型位置换算成经纬度后调 [`scene.getHeight(carto, heightReference)`](../packages/engine/Source/Scene/Model/Model.js#L2548)--地形四叉树若还没把该处瓦片加载好,getHeight 返回 undefined,模型保持原高度等下帧再试(渐进贴合的视觉来源)。这与 [03](03-Entity数据体系.md) Entity 的贴地(GroundPrimitive 分类路径)和 [07-地形系统.md](07-地形系统.md) 的瓦片采样是同一套地形数据的两种消费方式。

## 10. 与 04 / 09 / 13 的关系(防迷路表)

| 问题 | 本文(15) | 邻篇 |
|---|---|---|
| 3D Tiles 瓦片里的模型谁渲染? | Model3DTileContent 复用 Model 全管线(§2) | [04 §6](04-3DTiles加载与LOD.md) 内容分派 |
| 老的 Primitive(Geometry 合批)和 Model 什么关系? | 两条平行管线:Primitive=Geometry 体系(09),Model=组件化管线(本文) | [09](09-几何图元与材质.md) |
| DrawCommand 出来之后呢? | `pushDrawCommands` 交棒 | [13](13-渲染命令与着色器.md) 分箱/pass/派生 |
| 瓦片没加载完如何持续补帧? | `afterRender.push(() => true)`(§1) | [05 §requestRenderMode](05-帧更新与渲染循环.md)、[16](16-性能调试与优化.md) |
| 模型怎么贴地? | updateClamping(§9) | [07](07-地形系统.md) |

## 11. 动手实验

1. **看状态机推进**:Chrome DevTools 断点 [`GltfLoader.process`](../packages/engine/Source/Scene/GltfLoader.js#L445),加载一个多纹理模型,观察 `_state` 每帧变化(PROCESSING 会停多帧--JobScheduler 在分帧传 buffer)。
2. **纹理渐进上屏**:`Cesium.Model.fromGltfAsync({url, incrementallyLoadTextures: true})` + `scene.requestRenderMode = true`,能看到几何先出、纹理后到的两阶段。
3. **拆一条命令**:`model._sceneGraph._runtimeNodes[0].runtimePrimitives[0].drawCommand` 检查其 `shaderProgram`、`uniformMap`、pickId--对照 [13 §DrawCommand](13-渲染命令与着色器.md)。
4. **动画直改矩阵**:播放动画时在 [`ModelAnimationChannel.animate`](../packages/engine/Source/Scene/Model/ModelAnimationChannel.js#L249) 打 log,验证 §7「动画=每帧改节点 transform」。
5. **贴地失败排查**:只传 `heightReference` 不传 `scene` → 高度恒不更新;地形没加载完 → getHeight undefined(§9)。

## 12. 常见坑

- **轮廓(silhouette)超过 256 个模型有色偏风险**:轮廓色从一张 256 色调色板取色([`L178` 参数注释`](../packages/engine/Source/Scene/Model/Model.js#L178)),且轮廓 = 额外 pass 重画背面,是典型开销点(详见 [16](16-性能调试与优化.md))。

- **`Model.fromGltfAsync` resolve ≠ 模型上屏**:只保证 JSON 与 loader 构造完成,DrawCommand 还要等 `loader.process` READY 后的下一帧(`readyEvent`/`model.ready` 才是「可渲染」信号,[`L699`](../packages/engine/Source/Scene/Model/Model.js#L699))。
- **glb 与 .gltf 路径**:.gltf 的外部 bin/纹理依赖 `basePath`/相对 URI 解析,漏配会整片资源 FAILED;glb 内嵌则无此问题(§4)。
- **upAxis/forwardAxis 只对非 CESIUM_RTC 生效**:RTC 扩展模型默认 WGS84 大坐标,跳过轴修正(§5);3D Tiles 内容由瓦片 transform 定位,轴选项同样不走这条路。
- **customShader + Cesium3DTileStyle 混用**:官方注释明示可能未定义行为([`L169` 选项说明`](../packages/engine/Source/Scene/Model/Model.js#L169))。
- **改 style 不会自动重建 bounding/color 变体之外的东西**:只有触发 `resetDrawCommands` 的属性(customShader/IBL/imageBasedLighting)才重跑着色器拼装;style 走 BatchTexture 热更新路径(§8)。
- **内存**:`releaseGltfJson: true` 可在解析完释放 JSON(3D Tiles 默认如此);重复加载同 URL 模型记得依赖 ResourceCache 去重而不是复制 URL 加参数(会击穿缓存键)。用 [`model.statistics`](../packages/engine/Source/Scene/Model/Model.js#L745) 量化前后差(§6.3)。
- **`asynchronous: false` 的代价**:所有 GPU 资源一次性同步创建(加载尾帧卡顿换上屏确定性,[`L3194` 参数说明`](../packages/engine/Source/Scene/Model/Model.js#L3194))--大批量小模型(i3dm 实例化除外)慎用。
