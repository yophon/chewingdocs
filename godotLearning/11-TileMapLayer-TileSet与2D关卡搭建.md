# TileMapLayer、TileSet 与 2D 关卡搭建

角色和镜头都有了,现在需要一张能站、能跳、能撞的地图。Godot 4 里新项目不要再用旧 `TileMap`,用 `TileMapLayer`。

> 一句话先记住:**TileSet 是砖块表,TileMapLayer 是把这些砖块画到网格上的一层。**

---

## 一、为什么不用一堆 Sprite2D 拼地图

直接放 `Sprite2D` 能做 Demo,但很快会痛:

- 一段地面可能要几十上百个节点。
- 每块地都要单独配碰撞。
- 想批量替换草地样式很麻烦。
- 自动连接边角、斜坡、墙面都要手工摆。

Tile 系统把这些事情变成数据:

```text
TileSet: 这张图集里每个格子是什么,有没有碰撞,有没有自定义数据
TileMapLayer: 哪个网格坐标放哪个 tile
```

关卡编辑器里画格子,运行时引擎负责合批、碰撞和导航数据。

---

## 二、Godot 4 用 TileMapLayer

旧教程常写:

```gdscript
TileMap.set_cell(layer, coords, source_id, atlas_coords)
```

Godot 4.3 之后 `TileMap` 已经是旧路线。新工程用:

```text
Level
├── BackgroundTiles (TileMapLayer)
├── GroundTiles (TileMapLayer)
├── DecorTiles (TileMapLayer)
└── ForegroundTiles (TileMapLayer)
```

一层一个节点,顺序由场景树决定。背景在下面,前景在上面。

---

## 三、推荐关卡结构

```text
Level01 (Node2D)
├── Tiles
│   ├── Background (TileMapLayer)
│   ├── Ground (TileMapLayer)
│   └── Foreground (TileMapLayer)
├── PlayerSpawn (Marker2D)
├── EnemySpawns (Node2D)
├── Pickups (Node2D)
├── Goal (Area2D)
└── Bounds (Node2D)
```

这样分工清楚:

- `Background` 只画背景,没有碰撞。
- `Ground` 负责地形和碰撞。
- `Foreground` 负责遮挡、草丛、前景装饰。
- 出生点、敌人、终点用普通节点,不要藏在 tile 数据里。

---

## 四、TileSet 里要配什么

打开 `TileSet` 编辑器后,至少配三类东西。

第一,图集:

```text
Atlas Source -> 选择 tileset.png -> 设置 tile size
```

第二,碰撞:

```text
Physics Layer -> 给地面 tile 画碰撞多边形
```

第三,自定义数据:

```text
Custom Data:
  material: StringName   grass / stone / wood
  hazard: int            0 安全,1 伤害
  one_way: bool          是否单向平台
```

角色脚下踩到什么材质,可以从 tile 读:

```gdscript
func get_tile_material(layer: TileMapLayer, world_pos: Vector2) -> StringName:
    var coords := layer.local_to_map(layer.to_local(world_pos))
    var data := layer.get_cell_tile_data(coords)
    if data == null:
        return &"none"
    return data.get_custom_data("material")
```

脚步声、冰面、伤害地板都可以靠这层数据驱动。

---

## 五、代码里怎么改 tile

运行时设置一个格子:

```gdscript
@export var ground: TileMapLayer

const SOURCE_ID := 0
const GRASS := Vector2i(1, 0)

func place_grass(cell: Vector2i) -> void:
    ground.set_cell(cell, SOURCE_ID, GRASS)
```

清掉一个格子:

```gdscript
func erase(cell: Vector2i) -> void:
    ground.erase_cell(cell)
```

世界坐标转格子:

```gdscript
var cell := ground.local_to_map(ground.to_local(global_position))
```

格子转世界坐标:

```gdscript
var world := ground.to_global(ground.map_to_local(cell))
```

这两个转换很常用,不要自己拿 `tile_size` 手算。

---

## 六、不要手改 tile_map_data

`TileMapLayer` 里面的 `tile_map_data` 是引擎打包后的二进制数据。它能被 Git 看到,但不是给你手写的。

正确做法:

```gdscript
set_cell()
erase_cell()
get_cell_tile_data()
get_used_rect()
```

不要试图拼字节改 `tile_map_data`。程序化关卡放到第 22 篇讲,也会用公开 API 生成。

---

## 七、大地图要分块

Tile 坐标不是无限大。做很大的地图时,不要把全世界塞进一个 `TileMapLayer`。

更好的结构:

```text
World
├── Chunk_0_0
│   └── Ground (TileMapLayer)
├── Chunk_0_1
│   └── Ground (TileMapLayer)
└── Chunk_1_0
    └── Ground (TileMapLayer)
```

每块关卡自己有局部坐标。开放世界、程序化关卡、超大地图都走这个方向。

---

## 八、验收

- 新工程使用 `TileMapLayer`,不是旧 `TileMap`。
- 背景、地面、前景分成不同 layer 节点。
- 地面 tile 在 TileSet 里配置碰撞。
- 关卡里有 `PlayerSpawn` 和 `Goal`,不要把它们画进 tile。
- 能用 `local_to_map()` 和 `map_to_local()` 做坐标转换。
- 至少有一个 custom data layer 被运行时代码读取。

---

## 常见坑

**坑 1:把所有东西画在一层。**

背景、地面、前景混在一起,后面调遮挡和碰撞会很痛。

**坑 2:用 Sprite2D 补洞。**

偶尔装饰可以,主地形不要这样做。主地形统一进 TileSet。

**坑 3:忘了碰撞层。**

TileSet 里画了碰撞,还要确认 physics layer 的 collision layer/mask 跟第 09 篇矩阵一致。

**坑 4:坐标自己手算。**

用 `local_to_map()` / `map_to_local()`。自己除 tile size 很容易在缩放和父节点变换下出错。

---

下一篇讲敌人 AI、巡逻、追击和导航。
