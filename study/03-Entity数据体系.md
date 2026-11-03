# 03 · Entity 数据体系：声明一行代码，每帧同步成画面

> 阅读前提：读完 [01-Viewer 创建链路](01-Viewer创建与场景初始化.md)，知道 `new Viewer()` 构造里
> 创建了 `DataSourceCollection` 与 `DataSourceDisplay`（`CesiumWidget.js` 构造尾部）。
> 本文回答一个问题：**`viewer.entities.add({ position, billboard })` 之后，画面上为什么会多出一个图标？**
> 源码引用约定：「文件路径 + 函数名」。所有被引用处都已插入 `【导读】` 中文注释，可对照 GitHub 网页阅读。

涉及的核心文件（按阅读顺序）：

| 文件 | 一句话角色 |
|---|---|
| `packages/engine/Source/DataSources/Entity.js` | 「我想要什么」的声明对象 |
| `packages/engine/Source/DataSources/createPropertyDescriptor.js` | 属性赋值魔法（裸值自动包 Property） |
| `packages/engine/Source/DataSources/EntityCollection.js` | Entity 集合 + collectionChanged 事件 |
| `packages/engine/Source/DataSources/CustomDataSource.js` | 最简 DataSource（viewer.entities 的真身） |
| `packages/engine/Source/DataSources/DataSourceCollection.js` | 数据源集合（viewer.dataSources） |
| `packages/engine/Source/DataSources/DataSourceDisplay.js` | 每帧同步引擎（本篇主角） |
| `packages/engine/Source/DataSources/GeometryVisualizer.js` | 几何类 Entity → Primitive 的差量同步 |
| `packages/engine/Source/DataSources/PolygonGeometryUpdater.js` | GeometryUpdater 抽象的代表 |
| `packages/engine/Source/DataSources/BillboardVisualizer.js` | 图元类 Entity → BillboardCollection 同步 |

---

## 1. 概念模型：三层声明，从「想要什么」到「随时间变化的值」

Cesium 把业务数据拆成三层，初学者最容易混淆：

```
Entity（实体）                *Graphics（图形描述）           Property（值）
「一架飞机」            →     「它有个广告牌/多边形」     →    「位置=随时间插值的轨迹」
entity.position              entity.billboard.image           position.getValue(time)
entity.billboard             entity.polygon.hierarchy         每个字段都可以是「时间函数」
entity.polygon               entity.point.color
```

- **Entity**（`DataSources/Entity.js` 的 `function Entity`）：纯粹的数据容器。注意它**没有任何
  WebGL 资源**——你可以创建一百万个 Entity 而不渲染任何东西，渲染是别的对象的事。
- ***Graphics***：`Entity.prototype` 上的 `billboard`/`label`/`point`/`polyline`/`polygon`/`box`/
  `model` 等 20+ 个属性（见 `Entity.js` 的 `Object.defineProperties(Entity.prototype, ...)`），
  每个对应一种「画成什么」。它们全部由 `createPropertyTypeDescriptor` 工厂生成
  （`Entity.js` 顶部）：赋**裸对象**（如 `{ image: 'x.png' }`）会自动 `new BillboardGraphics(...)`。
- **Property**：Graphics 的每个字段（`billboard.image`、`polygon.height`…）以及 Entity 的
  `position`/`orientation` 都是 Property——一个「`getValue(time)` 才出值」的惰性时间函数。

这套设计的意义：**同一份数据描述，既可以是静态的（常量），也可以是随时间演化的（动画），
消费端（Visualizer）代码完全一致**——每帧统一 `Property.getValue(time)` 即可。

「只插不改」之外还有一条隐性契约：**Entity 是可以被替换/重建的**（CZML 加载、网络更新），
所以 Visualizer 永远以「事件 + 每帧求值」的方式消费它，而不是缓存它的内部状态。

## 2. Property 系统：随时间变化的值

### 2.1 四个常用实现对比

| Property | 值怎么来 | 典型用途 | 换值代价 |
|---|---|---|---|
| `ConstantProperty` / `ConstantPositionProperty` | 固定值 | 静态点/面（默认包装） | 赋值即生效 |
| `CallbackProperty` / `CallbackPositionProperty` | 每帧调你的回调 | 动态扩散圆、实时轨迹 | 每帧一次 JS 回调，无分配 |
| `SampledPositionProperty` | 按时刻采样点插值（Lagrange） | 卫星/飞机轨迹回放 | 插值计算，适合成批时间点 |
| `ReferenceProperty` | 引用另一个 Entity 的属性 | 「label 跟着 point 走」 | 解引用一层 |

另有 `TimeIntervalCollectionProperty`（分段常量，CZML 的区间值）、
`CompositeProperty`（按时间段组合不同 Property）等，都在 `DataSources/` 下同目录。

### 2.2 赋值魔法：createPropertyDescriptor

为什么这三种写法都合法？

```js
entity.billboard = { image: 'a.png' };                    // 裸对象 → 自动 new BillboardGraphics
entity.billboard.image = 'b.png';                         // 裸值   → 自动 new ConstantProperty
entity.position = new Cesium.CallbackPositionProperty(cb, false); // Property → 原样保留
entity.position = Cesium.Cartesian3.fromDegrees(116, 39); // 裸值 → 自动 new ConstantPositionProperty
```

答案在 `DataSources/createPropertyDescriptor.js` 的 `createProperty`（每个属性共用同一个
getter/setter 模板）——setter 四步：

1. 退订旧 Property 的 `definitionChanged` 订阅（`_xxxSubscription` 存句柄）；
2. 若新值不是 Property（没有 `getValue` 方法），用回调包装：Entity 层默认包
   `ConstantProperty`，`position` 专用包 `ConstantPositionProperty`（`Entity.js` 顶部的
   `createConstantPositionProperty`），Graphics 层各自传包装函数；
3. 值变了就写入私有字段，并广播 `entity.definitionChanged.raiseEvent(entity, name, 新值, 旧值)`；
4. 订阅新 Property 自己的 `definitionChanged`——**子属性变化冒泡**：以 `(newValue, newValue)`
   再广播一次，监听者无需区分「属性被整体替换」还是「属性内部值变了」。

`definitionChanged` 是整个体系的事件总线：EntityCollection 把它汇成
`collectionChanged`，Visualizer 靠它做差量更新（§4/§5）。

### 2.3 show / isShowing / parent：可见性的三票合取

`Entity.js` 的 `Entity.prototype.isShowing` getter = `自己.show && 所属集合.show && 父.isShowing`。
改 `show`/`parent`/集合 `show` 时，`Entity.js` 的 `updateShow` 递归向子孙传播并广播
`definitionChanged("isShowing")`。Visualizer 每帧读的是 **isShowing**（真值）而非 show（只是自己一票）。

## 3. `viewer.entities.add()` 之后发生了什么

先厘清三个容易混的对象：

```
viewer.entities        → EntityCollection（挂在 defaultDataSource 上）
viewer.dataSources     → DataSourceCollection（管「有哪些 DataSource」）
DataSourceDisplay      → 每帧把所有 DataSource 的 Entity 同步成画面（不暴露给用户）
```

`viewer.entities.add({...})`（`Widget/Viewer.js` 或 `engine/Widget/CesiumWidget.js` 构造里
`defaultDataSource` 的 entities）的完整链路：

1. **裸对象转 Entity**：`EntityCollection.js` 的 `EntityCollection.prototype.add` 里
   `if (!(entity instanceof Entity)) entity = new Entity(entity)`——所以传 options 对象即可
   （1.145 没有独立的 `Entity.fromObject`，这条路径就是等价物；`new Entity(options)` 内部
   走 `Entity.prototype.merge` 完成赋值，见 `Entity.js` 注释）。
2. **登记 + 订阅**：以 `entity.id`（缺省 GUID）为 key 存入集合，订阅它的 `definitionChanged`。
3. **广播 collectionChanged**：`EntityCollection.js` 的 `fireChangedEvent`——注意它支持
   `suspendEvents()/resumeEvents()` 合并批量增删改为一次事件（CZML 加载千条数据只广播一次）。
4. **每个 Visualizer 收到事件**（8 个全部监听同一个 `collectionChanged`）：
   - `BillboardVisualizer.js` 的 `_onCollectionChanged`：实体有 `billboard`+`position` → 入 `_items`；
   - `GeometryVisualizer.js` 的 `_onCollectionChanged`：仅记账进 `_addedObjects` 队列，帧内处理；
   - 其余同理。
5. **下一帧**：`CesiumWidget._onTick` → `DataSourceDisplay.update(time)` → 各 Visualizer
   `update(time)` → Billboard/Primitive 真正创建 → 画面出现。

而 `viewer.dataSources.add(dataSource)`（`DataSourceCollection.js` 的
`DataSourceCollection.prototype.add`）多一层：它接受 Promise（如 `GeoJsonDataSource.load(url)`
的返回值），resolve 后才入列并广播 `dataSourceAdded`——
`DataSourceDisplay.js` 的 `_onDataSourceAdded` 收到后：为该源建子 PrimitiveCollection（普通+贴地
两棵树）、初始化 `EntityCluster`（点聚合）、用 `defaultVisualizersCallback` 建全套 8 个 Visualizer。

**defaultDataSource**：`DataSourceDisplay.js` 构造尾部 `new CustomDataSource()`——`viewer.entities`
的背后就是它。它**不在** `viewer.dataSources` 列表里（所以 `dataSources.removeAll()` 不会清掉
`viewer.entities`），销毁时单独处理。`CustomDataSource.js` 是最简 DataSource：一组 entities +
可选 clock + 4 个事件，update 恒返回 true（无异步数据要等）。

## 4. 每帧同步引擎：DataSourceDisplay.update

`DataSourceDisplay.js` 的 `DataSourceDisplay.prototype.update(time)` 每帧被
`CesiumWidget.js` 的 `CesiumWidget.prototype._onTick` 在 `clock.tick()` 之后调用一次：

```js
for 每个 dataSource:                    // ① 数据源自身 update（如 CzmlDataSource 按时间取数据）
    dataSource.update(time)
    for 每个 visualizer:                // ② 8 类 Visualizer 逐个 update
        visualizer.update(time)
for defaultDataSource 的 visualizer:    // ③ viewer.entities 同样待遇
    visualizer.update(time)
```

返回值语义：「所有源都就绪」。返回 false 时 `CesiumWidget` 会暂停时钟动画
（`_canAnimate`）——所以异步几何没准备好时，时间轴会礼貌地等一下。注意 `_ready` 只升不降：
一旦就绪就永久就绪，防止单个实体短暂 un-ready 卡住全局动画（源码内注释明说）。

**8 个默认 Visualizer**（`DataSourceDisplay.defaultVisualizersCallback`）分两派：

| 派系 | Visualizer | 同步目标 |
|---|---|---|
| 图元级（点/图/字） | BillboardVisualizer / LabelVisualizer / PointVisualizer | `BillboardCollection` 等图元集合成员 |
| 几何级（面/体/线） | GeometryVisualizer / PolylineVisualizer | 合批的 `Primitive` / `GroundPrimitive` |
| 资源级 | ModelVisualizer / Cesium3DTilesetVisualizer / PathVisualizer | glTF / Tileset / 轨迹线 |

渲染顺序与 `dataSources` 列表顺序一致：`DataSourceCollection` 的 raise/lower 会触发
`dataSourceMoved`，`DataSourceDisplay._onDataSourceMoved` 同步调整对应子 PrimitiveCollection
在树中的位置（后加的画在上面）。

## 5. Visualizer 内部：差量同步的两种姿势

### 5.1 图元级：BillboardVisualizer（简单直接）

`BillboardVisualizer.js` 的 `BillboardVisualizer.prototype.update(time)`，对 `_items` 里每个实体：

1. 算 `show = entity.isShowing && entity.isAvailable(time) && billboard.show`；
2. `Property.getValueOrUndefined(entity._position, time)` 取位置（顺便判 image）；
3. 懒创建：`cluster.getBillboard(entity)`，**`billboard.id = entity`**（§7 拾取的源头）；
4. 二十来个字段逐一 `Property.getValueOrDefault(billboardGraphics._xxx, time, 默认值)` 赋给
   Billboard 同名属性——常量 Property 走快速路径，动态 Property 每帧求值。

`image` 字段**故意最后赋**（源码内英文注释）：其它字段就绪后再入纹理图集，避免图集重排。
`LabelVisualizer`/`PointVisualizer` 与之同构，只是换集合与字段。

### 5.2 几何级：GeometryVisualizer（Updater + 分桶合批）

面/体类几何不能逐实例渲染（draw call 爆炸），所以要**合批**——代价是复杂度暴涨。
`GeometryVisualizer.js` 三层结构：

**① GeometryUpdater**：每个 Entity 每种几何一个（10 种 updater 由 `GeometryUpdaterSet.js`
统一创建，`geometryUpdaters` 数组可见 box/cylinder/corridor/ellipse/ellipsoid/plane/polygon/
polylineVolume/rectangle/wall 全家桶）。职责：把 `entity.polygon` 等 Graphics 属性翻译成几何
选项。以 `PolygonGeometryUpdater.js` 为代表：

- `_isDynamic`：hierarchy/height/extrudedHeight… 任一属性非常量 → 动态几何；
- `_isOnTerrain` / `_getIsClosed`：是否贴地 / 是否闭合体（路由信号）；
- `createFillGeometryInstance` / `createOutlineGeometryInstance`：产出 `GeometryInstance`，
  注意 **`id: entity`**（拾取）与逐实例 attributes（show/color/distanceDisplayCondition）；
- `_setStaticOptions`：静态几何只在创建时求值一次（`Iso8601.MINIMUM_VALUE` 时刻取常量）。

**② Batch（桶）**：构造函数里建的静态桶矩阵——
`阴影模式 × 有无地形偏移 × {outline / closedColor / closedMaterial / openColor / openMaterial}`，
外加贴地的 `groundColor/groundMaterialBatches`（按 ClassificationType 分）。同桶的 Entity 合成
**一个** Primitive 的多个 GeometryInstance（性能核心）。`_insertUpdaterIntoBatch` 按 updater
的路由信号（isDynamic/onTerrain/isClosed/材质类型/shadows/terrainOffset）定位目标桶。

**③ 差量三队列**：`_onCollectionChanged` 只记账（`_added/_removed/_changedObjects`），
每帧 `GeometryVisualizer.prototype.update(time)` 集中消费：

- changed → 从所有桶拔出重插（同帧「同 id 删旧加新」会拆成 remove+add，源码英文注释）；
- removed → 销毁 updaterSet、退订事件；
- added → `new GeometryUpdaterSet` 并立即分发进桶；
- 最后逐桶 `update(time)` 差量重建 Primitive（返回 false = 异步几何未就绪，上抛给 §4 的就绪语义）。

**动态几何**（CallbackProperty 驱动 hierarchy 之类）不进合批，走 `DynamicGeometryBatch`
每帧重建——正确性优先。这就是官方文档说「动态几何比静态贵」的源码根据。

## 6. 时间轴驱动：从 clock.tick 到相机跟随

把本篇与前两篇串起来的完整时间链：

```
requestAnimationFrame（第 5 棒深挖）
  → CesiumWidget.render: scene.initializeFrame
  → clock.tick(): currentTime 前进，广播 onTick
  → CesiumWidget._onTick:
       ① DataSourceDisplay.update(time)          ← 本文 §4：Entity→Primitive 同步
       ② updateTrackedEntity → EntityView.update ← 相机跟随
  → scene.render(time): 各 Pass 真正画（Primitive/BillboardCollection 都在这时上屏）
```

`SampledPositionProperty` 的插值发生在 ① 里每个 Visualizer 调
`Property.getValue(time)` 的瞬间——没有「预烘焙动画」概念，位置永远是问时刻算出来的。

**trackedEntity 相机跟随**（`Viewer` 的 `viewer.trackedEntity = entity`）：
setter（`CesiumWidget.js` 的 `trackedEntity`）只记目标；真正跟随在每帧 `_onTick` 之后由
`EntityView.js` 的 `EntityView.prototype.update` 完成：取 `entity.position.getValue(time)` 与
orientation（缺省用速度方向/东北天），把相机摆到实体后上方并锁定（禁平移/倾斜防穿模）。
`DataSourceDisplay.getBoundingSphere`（汇总各 Visualizer 的包围球）则服务于
`viewer.zoomTo/flyTo`——PENDING（几何/贴地采样未就绪）时 `_postRender` 里会自动重试（见
01 篇 `updateZoomTarget` 的注释）。

## 7. 拾取：为什么 `scene.pick(...).id` 就是 Entity

两处源头，机制相同——**创建可拾取对象时把 Entity 塞进它的 `id` 字段**：

- `BillboardVisualizer.js` 的 `update`：`billboard.id = entity`；
- `PolygonGeometryUpdater.js` 的 `createFillGeometryInstance`：`new GeometryInstance({ id: entity, ... })`。

`scene.pick(windowPosition)`（或 `drillPick`）命中图元/实例后，把 `id` 原样返回。于是业务代码
的惯用法：

```js
const picked = viewer.scene.pick(movement.position);
if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
  // picked.id 就是 entity；viewer.selectedEntity 面板/InfoBox 也走这条路
}
```

（`Viewer.js` 构造里的屏幕鼠标事件接线 → `pickEntityOrPrimitive`，01 篇已注。）

## 8. CZML 一笔带过 + 动手实验

**CZML** = 「批量 Entity 的 JSON 协议」：`CzmlDataSource.load(czml)` 把每段 JSON 翻译成
Entity + Property（时间轴采样点变 `SampledPositionProperty`，区间值变
`TimeIntervalCollectionProperty`，availability 直通 `entity.availability`）。数据源自身实现
`update(time)` 按时间窗动态增删 Entity——这就是 §4 ① 那一步的意义。读懂数据层后再回头看
CZML，它只是「语法糖」。

**动手实验**（Sandcastle 或本地页面，30 行体验全链路）：

```js
const viewer = new Cesium.Viewer("cesiumContainer");

// ① 动态位置：CallbackPositionProperty 每帧算（§2.1）
const position = new Cesium.CallbackPositionProperty(
  (time, result) =>
    Cesium.Cartesian3.fromDegrees(
      116.39 + 0.01 * Cesium.JulianDate.secondsDifference(time, viewer.clock.startTime),
      39.9, 100, Cesium.Ellipsoid.WGS84, result),
  false);

const plane = viewer.entities.add({           // §3：裸对象 → new Entity → collectionChanged
  position,
  point: { pixelSize: 12, color: Cesium.Color.RED },   // 图元级 Visualizer 路线（§5.1）
  path: { width: 2 },                                   // PathVisualizer：画出历史轨迹
});

// ② 动态多边形：hierarchy 也是 Property（§5.2 动态几何每帧重建）
const dynamicPolygon = viewer.entities.add({
  polygon: {
    hierarchy: new Cesium.CallbackProperty(
      (time) => new Cesium.PolygonHierarchy([
        Cesium.Cartesian3.fromDegrees(116.0, 39.0),
        Cesium.Cartesian3.fromDegrees(117.0, 39.0),
        Cesium.Cartesian3.fromDegrees(116.5, 39.0 + 0.5 *
          (1 + Math.sin(Cesium.JulianDate.secondsDifference(time, viewer.clock.startTime)))),
      ]), false),
    material: Cesium.Color.CYAN.withAlpha(0.5),
  },
});

viewer.trackedEntity = plane;   // §6：相机跟随（打开时间轴动画看效果）
```

观察点：
- 拖动时间轴：`_onTick` → `DataSourceDisplay.update` → 两个 Visualizer 各自求值——点图标贴轨迹走
  （图元级便宜），多边形每帧重建（几何级贵，DevTools Performance 可见差异）；
- 改 `dynamicPolygon.polygon.hierarchy` 回调里 `Math.sin` 的频率，体会「动态=每帧重建」的代价；
- 在 console 里 `viewer.scene.pick(...)`（或点一下实体）验证 §7 的 `picked.id === plane`。

## 附：本篇对应的【导读】注释索引

| 文件 | 注释重点 |
|---|---|
| `DataSources/Entity.js` | 文件头三层模型；Property 包装三工厂；构造/merge；show/isShowing/parent；computeModelMatrix |
| `DataSources/createPropertyDescriptor.js` | setter 四步：退订→包装→广播→冒泡订阅 |
| `DataSources/CustomDataSource.js` | 最简 DataSource；update 语义 |
| `DataSources/DataSourceCollection.js` | add 的 Promise 处理；remove/removeAll 防悬挂技巧 |
| `DataSources/DataSourceDisplay.js` | 构造（两棵集合树/懒挂树/defaultDataSource）；默认 8 visualizer；update 三层循环；getBoundingSphere；增删移处理 |
| `DataSources/GeometryVisualizer.js` | 差量三队列；分桶矩阵；update 四步；_insertUpdaterIntoBatch 路由 |
| `DataSources/PolygonGeometryUpdater.js` | Updater 职责边界；_isDynamic 分水岭；GeometryInstance 的 id=entity |
| `DataSources/BillboardVisualizer.js` | 图元级同步全流程；billboard.id=entity；image 最后赋 |
| `engine/Widget/CesiumWidget.js` | 构造里 DataSourceDisplay 创建点、_onTick 两处补「见 study/03」链路注释 |

下一篇：[04-3DTiles加载与调度](04-3DTiles加载与调度.md)（第 4 棒）。
