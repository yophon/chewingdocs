# 11-TileMapLayer、TileSet 与 2D 关卡搭建

> 一句话导读:`TileMapLayer` 不是"装瓷砖的容器",而是"对一份 `TileSet` 资源的一个 chunked、稀疏、坐标受 16 位整数约束的索引",理解了这条心智链,关卡组织才不会失控。

到了第 11 篇,玩家已经能动、能跳、能跟着镜头看世界。现在需要一个"世界"——可以站立、可以掉下去、可以从一段走廊走到另一段。Godot 给出的答案是 `TileMapLayer` + `TileSet`,但从 4.3 开始,你过去看过的所有"放一个 `TileMap` 节点,设几层"的教程都已经过期。本篇直接按 4.6 的当前推荐路径讲。

## 1. 机制定位

### 关卡为什么用 Tile

工程师常会先问:为什么不直接用 `Sprite2D` 拼?答:你拼第 5 块就会想哭。Tile 系统提供三件事:

第一,**坐标压缩**。手画一段地表 50×3 的草地,如果用 `Sprite2D`,场景树要 150 个节点,序列化、加载、变换、绘制都按节点遍历。`TileMapLayer` 不存"哪个 sprite 在哪",只存"哪个网格坐标用了 `TileSet` 里哪一格",一格 12 字节,绘制走批处理。

第二,**碰撞、导航、遮挡的统一来源**。`TileSet` 里给某个 tile 配过 `physics_layer` 形状,`TileMapLayer` 自动生成 `StaticBody2D` 风格的碰撞,不用你给每块草地手挂一个 `CollisionShape2D`。导航与遮挡同理。

第三,**编辑器工作流**。`TileMapLayer` 编辑器里的画笔、桶填充、矩形、随机权重、地形匹配,都是手画 Sprite 不可能复用的工具链。`TileSet` 里把九宫格规则配好,你画两笔,边角自动连接。

新手最常见的失控写法,是"先把整个关卡背景画成一张 4096×2048 的 PNG,然后用一两个 `CollisionShape2D` 矩形当地面"。短期能跑,后续完全不能扩展:你想加一段新平台,要么改 PNG(图层全乱),要么再叠 sprite 错位。Tile 系统不解决"美术怎么画",但解决"美术画完之后如何被工程持续地、机械地组装回去"。

### 4.6 的"唯一推荐路径"

到 Godot 4.6,**`TileMap` 节点从 4.3 起就被标记为 deprecated**,不再新增功能,只保留加载兼容。社区文档、`tile_set` 编辑器底部的红色横幅、`@GlobalScope` 弃用注解都在反复提醒这件事。它的替代品是 `TileMapLayer`:

- 一个图层一个节点,而不是一个 `TileMap` 内部维护一个图层数组。
- 多个 `TileMapLayer` 节点可以挂在同一个父 `Node2D` 下,共享同一个 `TileSet` 资源。
- 图层间顺序由场景树兄弟顺序决定,你想把"前景"挪到"背景之前",拖动节点即可,不再有 `move_layer()` 之类的运行时 API。

这不仅是"换个名字"。`TileMapLayer` 把原来 `TileMap.set_cell(layer, ...)` 的 layer 参数从 API 上彻底拿掉;每层有自己独立的 `tile_set` 引用、自己的 `collision_enabled`/`navigation_enabled`,层与层之间不再共享状态。**所以本篇所有代码示例不会出现 `TileMap` 类,只会出现 `TileMapLayer`。旧教程里 `tilemap.set_cell(0, ...)` 这种第 0 个参数是 layer index 的调用,在新工程里直接不要再写。**

### 一个 cell 到底是什么

`TileMapLayer` 的核心数据是 `tile_map_data: PackedByteArray`,这是一段二进制,**每个 cell 占 12 字节**,记录:

- 网格坐标 `Vector2i`(分两个 16 位有符号整数压在 4 字节里)。
- `source_id`:在 `TileSet` 的 sources 数组中是第几个。
- 原子坐标 `atlas_coords`:这个 source(如果是 `TileSetAtlasSource`)里的列、行。
- `alternative_id`:这个 tile 的变体编号(常用作翻转/旋转标志位)。
- 物理层和导航层映射。

这套打包格式是引擎私有约定,**不要试图手编**这段字节。你写 `tile_map_data = some_byte_array` 的唯一合法场景,是把它从某个序列化形式中读回来(比如把上一关的数据从 `Resource` 反序列化),并且原始来源也是 Godot 自己生成的。手工拼装一个字节都会让整层数据失效。

更隐蔽的限制是 **16 位有符号整数边界:cell 坐标的合法范围是 -32768 ~ 32767**。看起来很大,但如果你做一张"开放世界"风的滚动地图,每格 16 像素,32768 格只对应 524288 像素的世界,放大字段(自由探索类)就摸到天花板了。一旦越界,引擎不会崩,但 cell 会被静默截断或写到错的坐标。下面"踩坑"会讲怎么 chunk 化绕开。

## 2. Godot 心智

### `TileSet`:被多层共享的资源

`TileSet` 是一个 `Resource`(`.tres`),存放在 `res://` 下作为单文件。它内部有几个并列的概念:

- **Sources**:一张图集贴图(`TileSetAtlasSource`)或一组场景(`TileSetScenesCollectionSource`)。每个 source 有数字 ID,运行时通过 ID 引用。
- **Physics layers**:几个并行的物理层,每个层独立配 `collision_layer`/`collision_mask` 位。Tile 在每一层上可以画不同的形状,常用例子:Layer 0 是地面(角色脚下),Layer 1 是子弹判定(允许子弹穿过软草地)。
- **Navigation layers**:让 Tile 生成 navmesh 多边形,供 `NavigationRegion2D` 烘焙(下篇详细讲)。
- **Occlusion layers**:为 2D 灯光提供遮挡边缘。
- **Custom data layers**:给每个 tile 挂自定义元数据,比如"是否危险"、"摩擦力"、"音效 ID",运行时用 `tile_data.get_custom_data("hazard")` 读。
- **Terrain sets**:把 tile 编组成"地形",支持自动连接;每个 terrain set 内部有多个 terrain(草地、岩石、水)。

理解关键:**`TileSet` 是数据,`TileMapLayer` 是它的索引**。你换一个 tile 的图,只要改 source,所有引用这个 source ID + atlas 坐标的层瞬间更新,不用挨个改 cell。

### Source 的两种形态

`TileSet` 的 source 可以是两种类型,日常工作中你大概率两种都会用到:

- `TileSetAtlasSource`:**默认形态**,源是一张图集贴图,每格是一个 tile。最大的优点是合批渲染,几千格地面只占一两次 draw call。它内部还能给同一格挂多个"alternative tile"(变体),配合 `TRANSFORM_FLIP_H/V/TRANSPOSE` 常量做翻转。还能配 `animation_frames_count` 把一格做成多帧动画(水面波纹、传送门光圈),完全由 `TileMapLayer` 自动循环,不需要 `AnimationPlayer`。
- `TileSetScenesCollectionSource`:**特殊场景**,每个 tile 不是一格图,而是一整个场景(`.tscn`)。把一棵子树当 tile 用,适合"水晶矿石带粒子"、"火把带光照",但代价是放一格就实例化一棵子树,不再合批。一般只在装饰物上少量使用,不要做主地形。

引擎不限制一张 `TileSet` 同时拥有两种 source,只要 ID 不冲突即可。运行时通过 `source_id` 区分,`TileSetAtlasSource` 和 `TileSetScenesCollectionSource` 都继承自 `TileSetSource`,可以用 `tile_set.get_source(id)` 拿到再做类型分支。

### Custom data layer 与 tile 元数据

`TileSet` 编辑器里可以为整套 tile 添加 custom data layer:每层是一个名字 + 类型(int/bool/string/Color 等),然后每个 tile 单独填值。运行时通过 `TileMapLayer.get_cell_tile_data(coords).get_custom_data("name")` 读出。常见用途:

- `slippery: bool`——冰面摩擦力。
- `hazard: int`——0 安全 / 1 火 / 2 毒 / 3 电,角色脚下读一次就够。
- `material_sound: String`——脚步音效查表。
- `triggers_dialogue: bool`——剧情触发位。

这些信息**不要塞进自定义节点或外部 Dictionary**。tile 数据天然按格存,custom data layer 是和 tile 一一对应的官方通道。它和 cell 一起被 `tile_map_data` 编码,层级序列化、复制粘贴时自动保留。

### `TileMapLayer` 的关键 API

下面这几个 API 是绝大多数关卡逻辑的入口:

- `set_cell(coords: Vector2i, source_id: int = -1, atlas_coords: Vector2i = Vector2i(-1, -1), alternative_tile: int = 0)`:画一格。`source_id = -1` 表示擦除。
- `get_cell_source_id(coords) -> int`:读 source。空格子返回 -1。
- `get_cell_atlas_coords(coords) -> Vector2i`:读 atlas 坐标。空格子返回 `Vector2i(-1, -1)`。
- `get_used_cells() -> Array[Vector2i]`:整层非空格子的坐标数组。
- `get_used_cells_by_id(source_id, atlas_coords, alternative_tile)`:按条件过滤,统计"地图里所有金币 tile"特别方便。
- `set_cells_terrain_connect(cells, terrain_set, terrain, ignore_empty_terrains = true)`:对一批坐标应用地形规则,自动接边。
- `local_to_map(local_pos)` / `map_to_local(cell)`:坐标互转。注意 `local`,如果你的 `TileMapLayer` 被父节点变换过,记得先 `to_local(global_pos)`。

### 多层组合的常见结构

一张关卡常见的 `TileMapLayer` 层级:

```text
Level (Node2D)
├── BackgroundLayer (TileMapLayer, 不参与碰撞)
├── DecorBackLayer  (TileMapLayer, z 较低,装饰)
├── TerrainLayer    (TileMapLayer, 物理层 0,可站立)
├── PlatformLayer   (TileMapLayer, 物理层 0 + 单向碰撞)
├── HazardLayer     (TileMapLayer, 物理层 1,造成伤害)
├── DecorFrontLayer (TileMapLayer, 在角色前面绘制)
└── EntitiesLayer   (Node2D, 非 tile,挂敌人和道具)
```

所有 `TileMapLayer` 引用同一份 `TileSet`,但每层只画属于自己语义的 tile。运行时切关卡,只需要替换 `Level` 整棵子树。

## 3. 工程实现

### 文件:`scenes/level/level_loader.gd`

这是一个最小的关卡加载/构建脚本,演示运行时如何画 cell、查询 cell、按地形规则铺设。

```gdscript
class_name LevelLoader
extends Node2D

const GROUND_SOURCE: int = 0
const HAZARD_SOURCE: int = 1
const TERRAIN_SET_GROUND: int = 0
const TERRAIN_GRASS: int = 0

@export var tile_set_resource: TileSet
@onready var terrain_layer: TileMapLayer = %TerrainLayer
@onready var hazard_layer: TileMapLayer = %HazardLayer


func _ready() -> void:
    # 共享同一份 TileSet,运行时换皮只改这一行。
    terrain_layer.tile_set = tile_set_resource
    hazard_layer.tile_set = tile_set_resource


## 在 [from, to] 区间(含端点)画一条草地,自动接边。
func paint_ground_row(y: int, from_x: int, to_x: int) -> void:
    var cells: Array[Vector2i] = []
    for x in range(from_x, to_x + 1):
        cells.append(Vector2i(x, y))
    terrain_layer.set_cells_terrain_connect(
        cells, TERRAIN_SET_GROUND, TERRAIN_GRASS, true
    )


## 在指定坐标插一根尖刺(用第二个 source,atlas 上某一格)。
func place_spike(cell: Vector2i, atlas_coords: Vector2i) -> void:
    hazard_layer.set_cell(cell, HAZARD_SOURCE, atlas_coords, 0)


## 把世界坐标转 cell,擦掉那一格(玩家挖矿、爆破场景常用)。
func erase_at_world(world_pos: Vector2) -> bool:
    var cell: Vector2i = terrain_layer.local_to_map(
        terrain_layer.to_local(world_pos)
    )
    if terrain_layer.get_cell_source_id(cell) == -1:
        return false
    terrain_layer.set_cell(cell, -1)
    return true


## 统计场上还有多少危险方块,供"全清"成就。
func remaining_hazards() -> int:
    return hazard_layer.get_used_cells_by_id(HAZARD_SOURCE).size()


## 用 custom data 读这一格是否会触发剧情。
func cell_triggers_dialogue(cell: Vector2i) -> bool:
    var data: TileData = terrain_layer.get_cell_tile_data(cell)
    if data == null:
        return false
    return bool(data.get_custom_data("triggers_dialogue"))
```

注意 `set_cells_terrain_connect` 要求 `TileSet` 端把所有"角部、边、内部"组合都画过,否则编辑器选不到合适的 tile,这一格会留空。这是配 terrain 的常见返工点:画了一半的 terrain,运行时调用就报错。

### 文件:`data/tilesets/`(目录组织约定)

`TileSet` 是 Resource,但工程上建议放在专门目录里,而不是塞到关卡场景旁边:

```text
res://
├── data/
│   ├── tilesets/
│   │   ├── ground_pixel.tres
│   │   ├── ground_pixel.png
│   │   └── hazards.tres
│   └── levels/
│       ├── level_01.tscn
│       └── level_02.tscn
└── scenes/
    └── level/
        └── level_loader.gd
```

理由是 `.tres` 引用图集贴图、形状、layer 配置,体积大且改动频繁,放在 `data/` 下方便和"逻辑场景"`scenes/` 区分。多个关卡场景引用同一份 tileset,改一处所有关卡同步更新。

### 文件:`scenes/level/chunked_tilemap.gd`(应对大世界)

如果你的关卡范围超出 ±32768 cell(开放世界、procgen、长卷轴),不要再用单个 `TileMapLayer` 强行装下,正确做法是 chunk 化:

```gdscript
class_name ChunkedTileMap
extends Node2D

const CHUNK_SIZE: int = 64  # 每个 chunk 64x64 个 cell

@export var tile_set_resource: TileSet
@export var load_radius_chunks: int = 2

var _chunks: Dictionary = {}  # Vector2i -> TileMapLayer
var _last_center_chunk: Vector2i = Vector2i.MAX


func update_around(world_pos: Vector2) -> void:
    var center: Vector2i = _chunk_of_world(world_pos)
    if center == _last_center_chunk:
        return
    _last_center_chunk = center
    _ensure_chunks_loaded(center)
    _unload_far_chunks(center)


func _chunk_of_world(world_pos: Vector2) -> Vector2i:
    # 假设每 cell 16 像素,可按项目调。
    var cell: Vector2i = Vector2i(world_pos / 16.0)
    return Vector2i(
        floor(float(cell.x) / CHUNK_SIZE),
        floor(float(cell.y) / CHUNK_SIZE)
    )


func _ensure_chunks_loaded(center: Vector2i) -> void:
    for dx in range(-load_radius_chunks, load_radius_chunks + 1):
        for dy in range(-load_radius_chunks, load_radius_chunks + 1):
            var key: Vector2i = center + Vector2i(dx, dy)
            if not _chunks.has(key):
                _chunks[key] = _spawn_chunk(key)


func _spawn_chunk(key: Vector2i) -> TileMapLayer:
    var layer: TileMapLayer = TileMapLayer.new()
    layer.tile_set = tile_set_resource
    layer.position = Vector2(key * CHUNK_SIZE * 16)
    add_child(layer)
    # 这里调用你自己的 chunk 生成器或从存档加载
    return layer


func _unload_far_chunks(center: Vector2i) -> void:
    var to_remove: Array[Vector2i] = []
    for key in _chunks.keys():
        if absi(key.x - center.x) > load_radius_chunks \
        or absi(key.y - center.y) > load_radius_chunks:
            to_remove.append(key)
    for key in to_remove:
        _chunks[key].queue_free()
        _chunks.erase(key)
```

每个 chunk 是独立的 `TileMapLayer`,自己的坐标系从 0 开始,不会撞 16 位上限。chunk 的世界位置由 `position` 决定。优点是绕开 ±32768 边界,缺点是 chunk 接缝处的 terrain 自动连接失效——画家在跨 chunk 边界的 tile 上要么手工修边,要么允许接缝有视觉断裂。

### 文件:`scripts/level_io.gd`(关卡序列化思路)

很多项目希望关卡数据脱离 `.tscn`,改用自定义格式存盘,方便外部编辑或玩家自制。这里给一个最小思路:**不要 dump `tile_map_data` 字节流**,改成保存每个非空 cell 的语义信息。

```gdscript
class_name LevelIO
extends RefCounted


static func dump(layer: TileMapLayer) -> Dictionary:
    var cells: Array = []
    for coords in layer.get_used_cells():
        cells.append({
            "x": coords.x,
            "y": coords.y,
            "source": layer.get_cell_source_id(coords),
            "atlas": [
                layer.get_cell_atlas_coords(coords).x,
                layer.get_cell_atlas_coords(coords).y,
            ],
            "alt": layer.get_cell_alternative_tile(coords),
        })
    return {"version": 1, "cells": cells}


static func load_into(layer: TileMapLayer, data: Dictionary) -> void:
    layer.clear()
    if int(data.get("version", 0)) != 1:
        push_warning("LevelIO: unsupported version")
        return
    for cell in data["cells"]:
        layer.set_cell(
            Vector2i(int(cell["x"]), int(cell["y"])),
            int(cell["source"]),
            Vector2i(int(cell["atlas"][0]), int(cell["atlas"][1])),
            int(cell["alt"]),
        )
```

好处:`version` 字段允许后续 schema 演进;格式可读、可被外部工具校验;不依赖 `tile_map_data` 私有编码。坏处:几万格的关卡 JSON 会膨胀到几 MB。真要做大世界关卡存档,把 cell 列表再用 RLE 或 chunk 编组压缩一次即可。第 14 篇会专门讨论存档版本迁移,这里只展示思路。

## 4. 调参和验收

### `rendering_quadrant_size` 与 `physics_quadrant_size`

这两个属性默认 16,意思是"绘制/物理生成时把多大区域作为一个内部块"。值越大,合批越激进、单个 draw call 范围越大,但局部修改一个 cell 会重建整块。

- 静态背景层:可以调到 32 ~ 64,反正不改。
- 频繁挖洞的可破坏地形层:保持 8 ~ 16,避免反复重建大块。
- 物理 quadrant:如果敌人体型很大,经常和多个 tile 同时碰撞,稍大的 quadrant 反而能减少接触点数量。

实际项目里,先不要动这两个值,等性能 profile 真发现 `_update_cells` 或物理 broad phase 上花了时间再回头调。它属于"工程后期手动微调",而不是"项目初期就要决定的架构参数"。

### `y_sort_origin` 与 `x_draw_order_reversed`

斜 45 度俯视角(等距、伪 3D)需要 Y 排序:站在 tile 后面的物体被 tile 遮挡,站在前面的物体盖住 tile。`y_sort_origin` 是这个 tile 的 Y 排序参考行,通常设到 tile 视觉"接触地面"的那一行像素位置。`x_draw_order_reversed` 用于六边形或菱形布局的镜像。

### `collision_enabled` / `navigation_enabled`

层级中并非每个 `TileMapLayer` 都要参与物理和导航。背景层 `collision_enabled = false`,装饰层 `navigation_enabled = false`,可以省下一大堆 quadrant 生成。运行时切换它们(比如雾区把导航关掉,逼玩家只能用视觉判断)也是合法用法。

### Tile 大小、世界坐标和 zoom 的协作

`TileSet` 在 Inspector 里有 `tile_size`,典型值是 `Vector2i(16, 16)` 或 `Vector2i(32, 32)`。它和镜头 `zoom`、视口基准分辨率组合起来,决定"一格 tile 在屏幕上看上去多大"。

举个具体例子:基准分辨率 480×270,`tile_size = 16`,屏幕能看到 30 列、16.875 行 tile。如果你想让玩家在 1080p 屏上看到一格 64 像素的"小方块",镜头 zoom 1、视口模式 viewport、整数倍放大 4 倍,正好 16×4 = 64。改 tile_size 之前先想一想:tile_size 不只影响视觉,还影响 cell 坐标范围(同样的世界宽度,32 像素 tile 用一半的 cell)、物理 quadrant 实际像素大小、navmesh 网格疏密。整个关卡系统的"分辨率"由 tile_size 决定,中途改它代价非常大。

### 关卡完成度判定

- [ ] 编辑器中画一段 20 格地面,运行时角色可以稳定站立、跑动,不卡在缝隙。
- [ ] 用 `get_used_cells()` 打印当前层 cell 数,和你画的格数一致。
- [ ] `set_cells_terrain_connect` 在一段地形内部画两次,接缝处 tile 自动更新,没有"空白角"。
- [ ] 物理层关闭后,角色穿过 tile;打开后,正常碰撞。
- [ ] 关卡场景从 `.tscn` 实例化的耗时(`OS.get_ticks_msec()` 包夹)在你目标硬件上低于 50ms。
- [ ] chunk 化场景下,角色越过 chunk 边界,加载/卸载发生在玩家视野外。

### 与第 09 篇 / 第 12 篇的边界

第 09 篇专门讲 `collision_layer` / `collision_mask` 的工程化设计,本篇不再展开"该开哪一位"。这里只关心:`TileSet` 的物理 layer 序号(0、1、2)和 `CollisionObject2D.collision_layer` 的位是两套概念,前者是 tileset 内部分层,后者由 `TileMapLayer.collision_layer` 字段映射到 Godot 全局碰撞矩阵。第 12 篇讲导航三件套,本篇只确保 `TileMapLayer.navigation_enabled` 已经为可行走 tile 配好 navigation polygon,具体烘焙、代理、避让在下一篇展开。

## 5. 踩坑

**坑 1:在 4.6 里新建 `TileMap` 节点。** 编辑器仍允许你创建,但顶部会显示 deprecated 横幅,Inspector 里的 layer 配置面板已经停止演进。新工程没有任何理由用 `TileMap`,直接用 `TileMapLayer`,把不同图层做成兄弟节点。已有项目从 `TileMap` 迁移:Godot 提供了一键 "Extract TileMap layers into TileMapLayers" 工具,在 `TileMap` 节点右键菜单里,把每一层拆成独立 `TileMapLayer` 子节点。迁完之后老的 `TileMap` 节点可以删掉,所有原 layer 0 的 API 调用要改成具体那个 TileMapLayer 的引用。

**坑 2:试图手写 `tile_map_data`。** 见过的写法是"读出整个字节数组,然后用 PackedByteArray 操作改某几个字节,再写回去"。每个 cell 12 字节的打包细节是引擎内部约定,且会随版本演进。**正确做法是只通过 `set_cell` / `set_cells_terrain_connect` 修改**,需要序列化整层时用 `get_used_cells()` + 自己定义的中间格式(JSON 或 Resource),不要直接 dump 字节流。

**坑 3:cell 坐标越过 ±32768 边界。** 你写 `tile_map_layer.set_cell(Vector2i(40000, 0), 0, ...)`,引擎不会报错,但这个 cell 要么被截断到 32767,要么写到一个意想不到的地方,排查时一头雾水。如果项目可能接近这个量级,从一开始就走 chunk 化,而不是临到上限再重构。

**坑 4:多个 `TileMapLayer` 引用了不同 `TileSet` 实例。** 你以为它们共享同一份资源,实际是 Inspector 里每层各拖了一个 `.tres`,改其中一个不影响另一个。表现是修了图集,只有一层更新。解决:确保所有兄弟 layer 引用的是 res 路径下的同一个 `.tres`(右键 → Inspector 里看 resource_path 一致),不要复制 sub-resource。

**坑 5:`terrain set` 没把所有组合画全,运行时静默留空。** `set_cells_terrain_connect` 用九宫格规则匹配 tile,如果你只画了"中心"和"四边"而漏了"四角",匹配不到的位置会保留旧 tile 或留空。编辑器有"Show invalid tiles"开关,运行前打开,把红色高亮的坑补完。

**坑 6:`get_cell_tile_data` 返回 null 当成 bug。** 这个方法对空格子返回 null,对存在但没配 custom data 的格子也可能返回 null 或空字典。读 custom data 前必须先判 `data != null`,否则 `null.get_custom_data(...)` 会崩。

**坑 7:把碰撞画在每个 tile 上,而不是 physics layer 上。** 旧教程里有时演示用 `Area2D` 子节点配 tile,这是错的:Tile 本身没有"子节点",你只能在 `TileSet` 的 physics_layer 配多边形/矩形,运行时由 `TileMapLayer` 统一生成一个 StaticBody。`Area2D` 类型的触发器(水域、剧情区域)应当用独立的 `Area2D` 节点画在场景里,而不是塞进 tileset。

**坑 8:对动态修改的 tile layer 设了非常大的 `rendering_quadrant_size`。** 比如 `128`。每次破坏一个 cell,整块 128×128 范围的网格被重建,1 秒内连续破坏会拖慢到 30 FPS 以下。可破坏地形保持小 quadrant。

**坑 9:`local_to_map` 没考虑节点变换。** `TileMapLayer` 如果被父节点平移、缩放,`local_to_map` 接受的是它自己的局部坐标。从世界坐标拿 cell 必须 `layer.local_to_map(layer.to_local(world_pos))`,顺序不能颠倒。

**坑 10:在 `_process` 里频繁调用 `get_used_cells()`。** 这是 O(n) 遍历整层,关卡稍大就是几千次拷贝。需要"场上所有金币"用 `get_used_cells_by_id(coin_source_id)`,且只在金币数量变化时调用,缓存结果。每帧调用会让 30 FPS 的关卡掉到 10。

**坑 11:`alternative_tile` 当成"装饰用变体"乱填。** 它是位字段,低位包含 `TRANSFORM_FLIP_H/V/TRANSPOSE`,所以 1/2/4 是有特殊含义的翻转标志。你想用 alternative 表达"草地的 3 种风格",应当在 `TileSetAtlasSource` 里给同一格添加多个 alternative,然后用 alternative_id ≥ 8 之类的值,避开翻转位段。

**坑 12:运行时频繁实例化 `TileMapLayer.new()`,但忘了赋 `tile_set`。** 新建的 `TileMapLayer` 默认 `tile_set` 为空,这时调用 `set_cell` 不会报错,但什么都不会被渲染——你 debug 半小时也找不到原因。chunk 化加载、过场关卡切换时,务必先赋值 `tile_set` 再画 cell;反过来也成立,运行时改 `tile_set` 字段,旧 cell 的 source_id 可能不再对应任何 source,这一层瞬间空白。

**坑 13:把 tile 的图像缩放当成 zoom 用。** 美术给的图集是 32×32,而你的项目 `tile_size` 设了 `Vector2i(16, 16)`,然后期待"自动缩小一半"。`TileSet` 不做缩放,它假设 atlas 的每格像素和 tile_size 一致。要么导出时让美术按 16×16 重画,要么在项目里把 tile_size 改成 32 并相应调整镜头 zoom。中间硬塞 `Sprite2D.scale` 是反模式。

**坑 14:把 `TileMapLayer` 当 chunk 用,却继承同一个父节点的物理变换。** chunk 化时 `TileMapLayer.position` 设了世界偏移,但父 `Node2D` 又被旋转或缩放过,内部碰撞形状的位置就会乱掉,角色脚下"看着是地",但走过去直接掉下去。chunk 容器层应当是纯 `Node2D` 且变换为单位变换,所有偏移在 `TileMapLayer` 自己的 `position` 上完成。

**坑 15:对 `TileMapLayer` 调用 `clear()` 后立刻读 `get_used_cells()`。** `clear()` 是即时的,但 Godot 内部对 quadrant 的清理可能跨帧合并。一般情况下数据视图立刻更新,极少数情况下(同一帧反复 clear + 大批 set_cell)会看到旧 cell 还在,加一帧 `await get_tree().process_frame` 让内部状态稳定,或直接信赖 `set_cell` 自己的状态机,不要混合调用。

**坑 16:用 `physics_quadrant_size = 1`,期望"每格都是独立静态体"。** 默认 16 已经为你做合并,1 反而导致几千个独立形状,物理 broad phase 直接拖到 5 FPS。需要单 tile 独立行为(比如可被推动的箱子)应当用单独 `RigidBody2D` 节点,不要靠 tile 物理。

**坑 17:把 `tile_set` 资源直接通过编辑器右键 "Make Local" 内嵌进场景。** 这种 sub-resource 形态会让每个关卡场景都带一份独立 TileSet 拷贝,改其中一份不影响其他。除非你刻意需要"每关一份 tileset",否则应当保持 `tile_set.tres` 为外部资源,所有关卡通过 `load("res://data/tilesets/ground.tres")` 共享同一份。

## 手动验证

- [ ] 新建一个空 `Level` 场景,挂三个 `TileMapLayer` 子节点(背景、地面、危险),共享同一份 `tile_set.tres`。
- [ ] 画一段 30 格地面,角色能跑到尾端不掉下去,中间任挖一格,坑位精确对齐。
- [ ] 在 `data/tilesets/` 修改图集 PNG 中某一格颜色,关卡运行时自动应用新颜色,无需重启编辑器。
- [ ] 调用 `paint_ground_row(0, -5, 5)`,terrain 自动接边,左右端点是"端角",中间是"水平边"。
- [ ] 把危险层 `navigation_enabled` 关掉,运行下一篇的导航烘焙后,敌人会绕开尖刺。
- [ ] chunk 化场景中,角色匀速向右移动 200 秒,FPS 全程稳定,日志显示老 chunk 被卸载、新 chunk 被加载。
- [ ] 用 `LevelIO.dump` 导出当前层为 Dictionary,清空后再用 `load_into` 还原,渲染结果像素级一致。
