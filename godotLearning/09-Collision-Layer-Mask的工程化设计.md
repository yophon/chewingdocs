# 09-Collision Layer / Mask 的工程化设计

> 一句话导读:`collision_layer` 是"我是谁",`collision_mask` 是"我想看到谁"。这两个是有向关系,不是对称的标签,工程上要从一开始就用矩阵化的方式管理。

第 06 篇做了 `CharacterBody2D.move_and_slide`,角色能撞地形;第 07 篇调了输入手感;第 08 篇让动画跟随状态。所有这些都在一个隐含假设之上:"碰撞分类是正确的"。但 Godot 默认所有节点的 `collision_layer = 1, collision_mask = 1`——意味着所有东西都看见所有东西。当游戏里有玩家、敌人、子弹、拾取物、地形、触发器之后,这种"一团乱"会立刻吞掉调试时间。

本篇把 Layer / Mask 的位运算心智、矩阵化设计方法、`Area2D` 与各种 `CollisionObject2D` 的边界、`RayCast2D` / `ShapeCast2D` 的选型、hurtbox-hitbox 的工程模式都摆开。这是 2D 游戏架构里最容易"想当然"但最该一次配对的地方。

## 1. 机制定位

### 1.1 Layer / Mask 到底是什么

Godot 用 32 个比特表示"碰撞分类"。每个 `CollisionObject2D` 的实例有两个 32 位整数:

- `collision_layer`:**"我属于哪些层"**。它是被动属性,告诉别人我在哪。
- `collision_mask`:**"我会与哪些层发生碰撞"**。它是主动属性,告诉物理系统去扫描什么。

判定两个对象 A、B 是否发生碰撞,Godot 内部做的事情是:

```text
collide(A, B) = (A.mask & B.layer) != 0  OR  (B.mask & A.layer) != 0
```

注意这是**或**——只要 A 看 B 或 B 看 A,就算碰撞。这一点对 `Area2D` 也成立(`monitoring` 控制是否生效,`monitorable` 控制能不能被别人看到)。新手最常见的错误就是只配 layer 不配 mask,然后惊讶于"为什么没触发"——A 自报了身份,但没人在扫描这个身份。

### 1.2 "我是谁"与"我看谁"为什么必须分开

如果 layer 与 mask 是同一个值,那么所有交互都是对称的——A 能碰 B,意味着 B 也能碰 A。在真实游戏里,绝大多数交互**不是对称**的:

- 玩家会被敌人攻击,但玩家的剑同样不应该撞到自己。
- 子弹要被地形阻挡,但地形不需要"知道"子弹存在。
- 拾取物被玩家触发,但拾取物不应该阻挡敌人移动。
- 触发器(Area2D)能感知玩家进入,但不会反过来推开玩家。

把 layer 和 mask 分开,本质上是把"我是什么"与"我在乎什么"解耦。两个独立位图给了 32 × 32 = 1024 种组合可能,工程上完全够用。

### 1.3 新手最容易踩的两个坑

第一个坑:**把所有东西都放在 layer 1**。Godot 默认 layer/mask 都是 1,新手做了几个 demo 之后,所有节点都在 layer 1,所有节点都看 layer 1,看上去一切正常。一旦引入"敌人不应该撞拾取物""友军子弹不伤友军"这种需求,就必须从头梳理。**项目第一周就把层级矩阵定好,后期改成本最低。**

第二个坑:**给地形也加 mask**。新手会想"地形也是一个物理体,应该 mask 把所有东西看到才对"。错——地形通常只需要 layer,mask 可以为 0。原因是物理碰撞由"主动方"驱动:角色 mask 看见地形 layer,角色撞地形;子弹 mask 看见地形 layer,子弹撞地形。地形自己什么都不"主动"做。给地形配 mask 不是错,但白白增加了物理服务器的扫描成本。

### 1.4 工程上的"层 vs 组(group)"取舍

Godot 还有一套与碰撞层无关的分类工具:`Node.add_to_group(name)` / `is_in_group(name)`。它适合"角色阵营""可暂停清单""场景统计"这种**逻辑**分类,运行时通过 `get_tree().get_nodes_in_group("enemy")` 取节点。**碰撞层用于物理查询过滤,group 用于游戏逻辑分类**,两者各做一件事,常常需要并存:

| 维度 | collision_layer | group |
| --- | --- | --- |
| 作用范围 | 物理引擎查询 | 全场景遍历 |
| 数量限制 | 32 位 | 无限 |
| 性能 | 极轻(位与) | 字符串匹配,中等 |
| 改名成本 | 高(已有 .tscn 不动) | 低(代码集中改) |
| 适合 | 玩家/敌人/地形分类 | 阵营、波次、剧情标签 |

简单规则:**只要是"我要不要被物理查到",用 layer;其它都用 group。** 同一个敌人节点既在 `enemy_body` layer 也在 `"wave_1"` group,完全不冲突。

## 2. Godot 心智

### 2.1 `CollisionObject2D` 家谱

理解 Layer / Mask 前,先把"谁带 layer/mask"理清楚。所有可参与物理碰撞的 2D 节点都派生自 `CollisionObject2D`:

```text
CollisionObject2D
├── Area2D                   # 触发器,只感知不阻挡
└── PhysicsBody2D
    ├── StaticBody2D         # 地形,不动
    ├── CharacterBody2D      # 玩家/敌人,脚本驱动
    ├── RigidBody2D          # 物理驱动,适合道具、碎片
    └── AnimatableBody2D     # 移动平台,由动画驱动
```

`Area2D` 与各 `PhysicsBody2D` 都有 `collision_layer` / `collision_mask`,差别在行为:

- `Area2D` 不阻挡运动,只发 `body_entered` / `area_entered` 信号。
- `PhysicsBody2D` 之间会按物理规则相互阻挡。
- `Area2D` 与 `PhysicsBody2D` 之间不会阻挡(area 只看不挡)。

另外两类节点不是 `CollisionObject2D` 但也有 mask(没有 layer,因为它们不被人扫描,只主动扫描别人):

- `RayCast2D`:沿一条线段查询。
- `ShapeCast2D`:沿一个形状的扫掠区域查询(4.x 加入的方便工具)。

### 2.2 心智:层是"分类",不是"语义"

工程上一个常见误区:把层当成"伤害类型分类"(火、冰、毒...)。这条路通向地狱——伤害类型应该是数据(Resource 字段),不是物理层。**物理层只用来回答"物理引擎要不要测这两个对象的相交"**,语义判定走数据。

举个反例:把 layer 5 命名为 "fire_damage",所有火属性 hitbox 都放在 5。玩家身上现在没有"火免疫 hurtbox",只能"全部受 fire_damage hitbox 攻击"。哪天要做"穿火甲免疫火伤"——你要新增 layer 11 = "fire_immune_hurtbox",敌人 hitbox 的 mask 要勾 5 和 11 然后逻辑里区分?还是给玩家 hurtbox 加条件?物理层很快就乱了。

**正确做法**:hitbox 只有 `PLAYER_HITBOX`、`ENEMY_HITBOX` 两类层,`damage_type` 是 hitbox 上的 `@export` 字段(字符串或枚举)。hurtbox 收到命中后看 `info.damage_type`,根据角色身上的"抗性表"决定扣多少血。第 17 篇属性系统会完全展开这层数据驱动。

### 2.3 编辑器里的层名与位图

Godot 4.x 在 `项目设置 → Layer Names → 2D Physics` 提供 32 个槽位给你命名。**永远要命名**——不命名时 inspector 上每个 `CollisionObject2D` 都是一堆没标签的方格,改两次就乱。命名后 inspector 会把方格按名字显示,鼠标悬停看 tooltip 也能知道哪是哪。

层数限制是 32,对 2D 项目极其充裕。本系列建议留出前 16 层给"核心实体",后 16 层给"机制 / 触发器 / 临时层",避免在原型期就把所有 32 层吃光。

### 2.4 `Area2D.monitoring` 与 `monitorable`

`Area2D` 有两个布尔值,刚接触时容易搞混:

- `monitoring = true`:**我**会在每物理 tick 扫描重叠,触发我的 `body_entered` / `area_entered` 信号。
- `monitorable = true`:**别人**能扫到我(即"我能被监视")。

典型搭配:

- 拾取物的 `Area2D`:`monitoring = true`(检测玩家进入)、`monitorable` 不重要。
- 玩家身上的 `Hurtbox` `Area2D`:`monitoring = false`(不主动扫描)、`monitorable = true`(可被敌人 hitbox 扫到)。
- 敌人攻击的 `Hitbox` `Area2D`:`monitoring = true`(扫玩家 hurtbox)、`monitorable = false`(不需要被反扫)。

这两个开关与 layer/mask 是叠加关系——四个条件都满足才会触发。第 8 篇 §3.4 的攻击窗口信号,在战斗系统里最终会落到 `hitbox.monitoring = true` 这一行上。

### 2.5 `move_and_slide` 与 `mask`

`CharacterBody2D.move_and_slide()` 实际是按 `collision_mask` 决定"撞什么"。如果你想要"一个角色可以穿过敌人但被地形挡住",做法是:

- 玩家 `mask` 勾上 `terrain` 层,不勾 `enemy` 层。
- 敌人 `layer` 在 `enemy` 层,不在 `terrain` 层。

这样物理服务器查询时,player.mask & enemy.layer = 0,直接跳过。这种"分类避让"比写"if collision.collider is Enemy: continue" 干净得多——它发生在物理层,零脚本开销。

## 3. 工程实现

### 3.1 一张项目级的层级矩阵

下面这张矩阵是本系列 2D 原型(玩家、敌人、子弹、拾取物、地形)的标准配置。横向是各实体的 `layer`,纵向是各实体的 `mask`,√ 表示该实体的 mask 勾上该列对应的 layer:

| mask ↓ \ layer → | terrain | platform | player_body | player_hitbox | player_hurtbox | enemy_body | enemy_hitbox | enemy_hurtbox | pickup | trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| terrain (StaticBody2D) | - | - | - | - | - | - | - | - | - | - |
| platform (AnimatableBody2D) | - | - | - | - | - | - | - | - | - | - |
| player_body (CharacterBody2D) | √ | √ | - | - | - | √ | - | - | - | - |
| player_hitbox (Area2D) | - | - | - | - | - | - | - | √ | - | - |
| player_hurtbox (Area2D) | - | - | - | - | - | - | - | - | - | - |
| enemy_body (CharacterBody2D) | √ | √ | √ | - | - | - | - | - | - | - |
| enemy_hitbox (Area2D) | - | - | - | - | √ | - | - | - | - | - |
| enemy_hurtbox (Area2D) | - | - | - | - | - | - | - | - | - | - |
| pickup (Area2D) | - | - | √ | - | - | - | - | - | - | - |
| trigger (Area2D) | - | - | √ | - | - | √ | - | - | - | - |

读这张表的方法:**找到一行,看横向勾了哪些 layer**。例如:`player_hitbox` 这一行只勾了 `enemy_hurtbox`,意思是玩家的攻击只扫敌人的 hurtbox,不扫敌人 body、地形、其它玩家。这种"hitbox 只看 hurtbox"的做法是动作游戏的事实标准。

层定义放在 `项目设置 → Layer Names → 2D Physics`,槽位 1-10 依次命名为表中字段。空白槽位 11-32 留给后续扩展。

### 3.2 配置层名的脚本化方式

手动改 32 个槽位易错,推荐用 `@tool` 脚本一次性写入。`项目设置` 实际是 `project.godot` 文件,可以用 `ProjectSettings` API 在编辑器里调用:

```gdscript
@tool
extends EditorScript
## 一次性写入 2D 物理层名。
## 运行方式:在 Godot 编辑器里 File → Run, 选这个脚本。

const LAYERS: Array[String] = [
    "terrain",         # 1
    "platform",        # 2
    "player_body",     # 3
    "player_hitbox",   # 4
    "player_hurtbox",  # 5
    "enemy_body",      # 6
    "enemy_hitbox",    # 7
    "enemy_hurtbox",   # 8
    "pickup",          # 9
    "trigger",         # 10
]

func _run() -> void:
    for i in LAYERS.size():
        var key := "layer_names/2d_physics/layer_%d" % (i + 1)
        ProjectSettings.set_setting(key, LAYERS[i])
    var err := ProjectSettings.save()
    if err == OK:
        print("Layer names written to project.godot.")
    else:
        push_error("Save failed: %s" % err)
```

把它放在 `res://tools/setup_collision_layers.gd`,通过 `File → Run` 执行一次,以后改名只需调整数组并重跑。详细的 `@tool` 与编辑器脚本机制见第 28 篇。

### 3.3 给每个节点配 layer/mask 的两种风格

风格 A:**inspector 勾选**。打开节点,在 inspector 的 "Collision" 里勾选 layer / mask 对应的方格。优点直观,缺点是配置散落在 `.tscn` 文件里,代码看不到。

风格 B:**代码集中配置**。建立常量,然后在 `_ready` 里设置:

路径 `res://core/collision_layers.gd`(作为 `class_name` 全局类型):

```gdscript
class_name CL
extends RefCounted
## 集中常量:Layer 与 Mask 位值。
## 让节点代码自描述"我属于谁、我看谁"。

const LAYER_TERRAIN := 1
const LAYER_PLATFORM := 2
const LAYER_PLAYER_BODY := 3
const LAYER_PLAYER_HITBOX := 4
const LAYER_PLAYER_HURTBOX := 5
const LAYER_ENEMY_BODY := 6
const LAYER_ENEMY_HITBOX := 7
const LAYER_ENEMY_HURTBOX := 8
const LAYER_PICKUP := 9
const LAYER_TRIGGER := 10

static func bit(layer_number: int) -> int:
    return 1 << (layer_number - 1)

static func bits(layer_numbers: Array[int]) -> int:
    var v := 0
    for n in layer_numbers:
        v |= 1 << (n - 1)
    return v
```

然后在玩家 hitbox 脚本里:

```gdscript
extends Area2D
## 玩家攻击 hitbox。

func _ready() -> void:
    collision_layer = CL.bits([CL.LAYER_PLAYER_HITBOX])
    collision_mask = CL.bits([CL.LAYER_ENEMY_HURTBOX])
    monitoring = false  # 由 AnimationPlayer Call Method 在攻击窗口期开启
    monitorable = false # 不需要被反扫
```

这种风格的好处:**配置写在代码里、可以被 grep**。生产项目里强烈推荐 B,原型期可以混用,但要在 12 篇引入敌人时统一收紧。

### 3.4 hurtbox-hitbox 模式的最小实现

把 §3.3 的配置与第 08 篇 §3.5 的动画事件接到一起,得到一个能跑的"攻击命中"链。

场景结构(玩家):

```text
Player (CharacterBody2D, layer=PLAYER_BODY, mask=[TERRAIN, PLATFORM, ENEMY_BODY])
  Sprite2D
  AnimationPlayer
  CollisionShape2D
  Hurtbox (Area2D, layer=PLAYER_HURTBOX, mask=[], monitorable=true)
    CollisionShape2D
  Attack (Node2D)
    Hitbox (Area2D, layer=PLAYER_HITBOX, mask=[ENEMY_HURTBOX], monitoring=false)
      CollisionShape2D
```

`Hitbox` 监听 `area_entered`,目标是其它角色身上的 `Hurtbox`:

路径 `res://combat/hitbox.gd`:

```gdscript
class_name Hitbox
extends Area2D
## 进攻方的命中区。由动画系统控制 monitoring 的开关。
## damage、knockback 由数据资源(第 18 篇)注入。

@export var damage: int = 1
@export var knockback: Vector2 = Vector2(220.0, -120.0)
@export var knockback_direction: int = 1  ## 1 = 朝右,-1 = 朝左

signal hit(target: Hurtbox, info: Dictionary)

func _ready() -> void:
    monitoring = false
    monitorable = false
    area_entered.connect(_on_area_entered)

func _on_area_entered(area: Area2D) -> void:
    if not (area is Hurtbox):
        return
    var info := {
        "damage": damage,
        "knockback": Vector2(knockback.x * knockback_direction, knockback.y),
        "source": owner,
    }
    (area as Hurtbox).take_hit(info)
    hit.emit(area, info)

func enable_window() -> void:
    monitoring = true

func disable_window() -> void:
    monitoring = false
```

路径 `res://combat/hurtbox.gd`:

```gdscript
class_name Hurtbox
extends Area2D
## 受击方的判定区。由 take_hit 注入伤害,内部不做扣血决策。
## 真正扣血在 HealthComponent(第 17 篇组件化)。

@export var invincibility_after_hit_sec: float = 0.4

signal hit_taken(info: Dictionary)

var _iframe_timer: float = 0.0

func _ready() -> void:
    monitoring = false
    monitorable = true

func _physics_process(delta: float) -> void:
    _iframe_timer = max(_iframe_timer - delta, 0.0)

func take_hit(info: Dictionary) -> void:
    if _iframe_timer > 0.0:
        return
    if _is_owner_invulnerable():
        return
    _iframe_timer = invincibility_after_hit_sec
    hit_taken.emit(info)

func _is_owner_invulnerable() -> bool:
    var root: Node = owner
    if root and root.has_method("is_invulnerable"):
        return root.is_invulnerable()
    return false
```

两段代码协同的工程价值:

- **决策链清晰**:动画 → hitbox.enable_window → 物理碰撞 → hurtbox.take_hit → 角色 hit_taken 信号。每一环只做一件事。
- **闪避状态自动接管**:hurtbox 调 `owner.is_invulnerable()`——第 07 篇 dash 期间 `_iframe_timer > 0` 返回 true,hurtbox 直接 return,不扣血。这就是第 07 篇预留接口的回报。
- **数据驱动**:damage、knockback 是 `@export` 字段,可以挂多个不同的 hitbox 配出"轻击 / 重击 / 终结技"。

### 3.5 `RayCast2D` 与 `ShapeCast2D` 的选型

mask 不仅给物理体用,也给 cast 类节点用。它们是"主动扫描"的代表,不参与碰撞响应,只回答"沿这个方向有没有东西"。

| 工具 | 用途 | 性能 | 单次回答 |
| --- | --- | --- | --- |
| `RayCast2D` | 线段查询(脚下、墙壁) | 极轻 | 一个命中点 |
| `ShapeCast2D` | 区域扫掠(宽刀挥砍、跳台落点预测) | 中等 | 多个命中点(`get_collision_count`) |
| `space_state.intersect_ray` | 一次性查询(AI 视野判断) | 轻 | 一个命中点 |
| `space_state.intersect_shape` | 一次性面积查询 | 中等 | 多个命中点 |

常见用法:

- **脚下检测**:`RayCast2D` 朝下 4-6 px,`mask = [TERRAIN, PLATFORM]`。比 `is_on_floor()` 更细粒度——可以区分"快着地了"(预测下一帧)与"已经着地"。
- **墙壁吸附**:左右各一根 `RayCast2D`,长度等于角色半宽 + 2px。判断 wall jump 可用。
- **宽攻击判定**:刀挥的扇形区域用 `ShapeCast2D` 把整个挥砍轨迹扫一遍,代替逐帧的 Hitbox 形状。

需要注意:`RayCast2D.enabled = true` 时,每物理 tick 自动更新一次结果;如果你在脚本里手动移动了 ray 然后想立刻读结果,要调 `force_raycast_update()`。`ShapeCast2D` 对应的是 `force_shapecast_update()`。

### 3.6 完整地面检测示例:RayCast2D 替代 is_on_floor

`CharacterBody2D.is_on_floor()` 已经足够好,但它有两个边界:无法预测"下一帧会着地"、坡度判定受 `floor_max_angle` 影响。当游戏需要"在着地前 50 ms 切到 land 动画"或"识别陡坡"时,自己用 `RayCast2D` 做地面检测更灵活。

路径 `res://player/ground_sensor.gd`:

```gdscript
class_name GroundSensor
extends Node2D
## 三根射线探测脚下,综合给出 on_floor / about_to_land / floor_normal。
## 多根射线避免站在地形缝隙正中的误判。

@export var probe_length: float = 8.0
@export var prelanding_length: float = 18.0
@export var half_width: float = 8.0
@export var collision_mask: int = 0

var _rays: Array[RayCast2D] = []

func _ready() -> void:
    for x in [-half_width, 0.0, half_width]:
        var r := RayCast2D.new()
        r.position = Vector2(x, 0.0)
        r.target_position = Vector2(0.0, prelanding_length)
        r.collision_mask = collision_mask
        r.enabled = true
        add_child(r)
        _rays.append(r)

func is_grounded(close_threshold: float = 0.0) -> bool:
    var limit := probe_length if close_threshold <= 0.0 else close_threshold
    for r in _rays:
        if r.is_colliding():
            var dist := (r.get_collision_point() - r.global_position).length()
            if dist <= limit:
                return true
    return false

func is_about_to_land() -> bool:
    return is_grounded(prelanding_length) and not is_grounded(probe_length)

func get_floor_normal() -> Vector2:
    for r in _rays:
        if r.is_colliding():
            return r.get_collision_normal()
    return Vector2.UP
```

这种"3 根射线"方案在 Sonic 类游戏里普遍——左右两根防止角色站在 1 px 缝隙上被判定为悬空,中间一根给出主要法线。第 06 篇的 `is_on_floor` 在大多数情况下够用,这一节作为"何时该自己写"的参考实现。

## 4. 调参和验收

### 4.1 调试视图

Godot 4.6 的运行时调试视图有两个开关需要打开,**只有打开了才能看见 collision shape**:

- **编辑器顶部菜单**:Debug → Visible Collision Shapes(运行时显示所有碰撞形状)。
- **代码运行时控制**:`get_tree().debug_collisions_hint = true`。

打开后,所有 CollisionShape2D 会以半透明色块叠加显示——`Area2D` 是绿色,`StaticBody2D` 是浅蓝,`CharacterBody2D` 是深蓝,`RigidBody2D` 是橙色。这层视觉对排查"为什么 hitbox 没击中"几乎是必需的。

颜色定义在 `项目设置 → Debug → Shapes → 2D` 里可调,某些项目美术风格与默认色冲突时建议改色提高识别度。

### 4.2 hitbox 调试日志

在战斗系统里加一段调试输出,把命中事件打到 Output:

```gdscript
func _on_hit(target: Hurtbox, info: Dictionary) -> void:
    if OS.is_debug_build():
        print("[Hit] %s -> %s dmg=%d kb=%s"
            % [info.source.name, target.get_parent().name, info.damage, info.knockback])
```

配合 Debug → Visible Collision Shapes,基本能定位 90% 的"没打中"问题。

### 4.3 参数与验收

| 参数 | 典型值 | 影响 |
| --- | --- | --- |
| Hurtbox 尺寸 | 角色身体的 70-80% | 太大有"碰瓷感",太小玩家觉得不公平 |
| Hitbox 尺寸 | 攻击动画视觉的 100-120% | 略大于视觉,容错友好 |
| `invincibility_after_hit_sec` | 0.3-0.5 s | 受击后无敌窗口,防连击锁死 |
| `monitoring` 切换帧位 | 攻击动画 30-50% 处 | 与动画"挥到中段"对齐 |

验收清单见末尾"手动验证"段。

### 4.4 何时该把 hurtbox 拆分成多个

绝大多数 2D 游戏一个角色只配一个 hurtbox 就够。但下列情形要拆:

- **多段身体**:大型 boss 的腿、躯干、头部分别有不同伤害倍率(头部 2x 暴击)。每段一个 hurtbox,各自挂不同 `damage_multiplier` 字段。
- **方向性受击**:背刺加倍。给前后各一个 hurtbox,前面的 multiplier=1,后面的 multiplier=1.5。
- **特殊状态**:盾下半身免疫(玩家蹲下),把腿部 hurtbox `monitorable = false`。

拆分的工程成本是"hurtbox 数量翻倍",回报是"伤害逻辑全靠数据"。第 17 篇组件化时会把这类 boss 多段 hurtbox 做成模板。

### 4.5 区分"实体碰撞层"与"触发器层"

矩阵 §3.1 里区分了 `_body` 与 `_hitbox / _hurtbox / pickup / trigger`,**body 类与 area 类分别用不同的层**。原因:`move_and_slide` 的 mask 只看 body 层,Area2D 的扫描只看 area 层。物理引擎在每物理 tick 会按 layer 分桶,层内做 broadphase——把 body 与 area 混到同一层会让 body 的运动查询包括 area,白白浪费 CPU。

具体做法:layer 1-2 留给 terrain / platform(纯 body),layer 3-6 给角色 body / hitbox / hurtbox(混杂),layer 7-10 给 area-only 的触发器与拾取物。运行时如果用 Profiler 看到 "Physics Server" 这一行飙高,层级划分往往是首要嫌疑。

### 4.6 矩阵对称性自检

层级矩阵配完后,做一遍"反向检查":每个 layer 是不是至少有一个 mask 关注它?如果某个 layer 没被任何 mask 勾上,那这个 layer 上的物体物理上"对所有人隐形"——多半是配置漏了。Godot 编辑器不会提示这一类问题,需要靠人脑或脚本扫:

```gdscript
@tool
extends EditorScript
## 扫描场景中所有 CollisionObject2D,警告 layer 没人看的节点。
func _run() -> void:
    var root := EditorInterface.get_edited_scene_root()
    if root == null:
        return
    var all_masks := 0
    var nodes: Array[CollisionObject2D] = []
    _collect(root, nodes)
    for n in nodes:
        all_masks |= n.collision_mask
    for n in nodes:
        if n.collision_layer != 0 and (n.collision_layer & all_masks) == 0:
            push_warning("%s 的 layer 没人看见。" % n.get_path())

func _collect(node: Node, out: Array[CollisionObject2D]) -> void:
    if node is CollisionObject2D:
        out.append(node)
    for c in node.get_children():
        _collect(c, out)
```

把它放进 `res://tools/audit_collision.gd`,在每个场景大版本合并前跑一遍,能挡住大部分"忘了配 mask"的错误。

## 5. 踩坑

### 5.1 `set_collision_layer = 5` 的语义

新手会写 `self.collision_layer = 5`,期望"放到第 5 层"。错——`5 = 0b101`,意味着同时在 layer 1 和 layer 3。要"只在第 5 层"得写 `1 << (5 - 1) = 16`,或用 `set_collision_layer_value(5, true)` 这种按编号的 API。**整数赋值是位图,不是层号。** 这一条 4.x 与 3.x 一致,但跨语言开发者第一次遇到必栽。

### 5.2 `Area2D` 信号没触发的常见原因

按出现频率列:

1. `monitoring` 是 false(或者两边的 monitoring/monitorable 没都 true)。
2. layer/mask 配置不对(忘了 mask 看 hurtbox)。
3. 信号没 connect。
4. `disabled` 在 CollisionShape2D 上是 true。
5. 节点在场景树里但 `process_mode = DISABLED`。
6. **(4.x 特有)** 节点刚被 `add_child`,Area2D 的物理状态在下一物理 tick 才生效——`add_child` 后立刻读 `overlaps_body()` 会返回空。

第 6 条是最隐蔽的,常见解决方式是 `await get_tree().physics_frame` 等下一物理 tick。

### 5.3 `move_and_slide` 推到 Area2D 上

CharacterBody2D 用 mask 看 Area2D 的 layer——`area` 不会阻挡,但碰撞计数会增加。如果 `get_slide_collision_count() > 0`,你会发现 `get_slide_collision(0).get_collider() is Area2D`,这通常不是你想要的。**CharacterBody2D 的 mask 通常不勾任何 Area2D 层**,Area2D 主动 monitoring 即可。

### 5.4 同一个节点上挂多个 CollisionShape2D

允许,但 layer/mask 是节点级而非 shape 级。如果想让两个形状有不同 layer,得拆成两个 `Area2D` / `CollisionObject2D`。一个常见错误是把 hitbox 和 hurtbox 共用一个 `Area2D`,然后发现两边的 monitoring/monitorable/mask 没法独立配。**hitbox 和 hurtbox 永远是两个独立 Area2D**。

### 5.5 `RigidBody2D` 不会被 `move_and_slide` 推动

`CharacterBody2D` 的 move_and_slide 只解析碰撞,不主动施加力。要让玩家撞飞物理道具,只能在 `get_slide_collision` 里手动给道具的 `RigidBody2D` 加 impulse:

```gdscript
for i in get_slide_collision_count():
    var col := get_slide_collision(i)
    if col.get_collider() is RigidBody2D:
        (col.get_collider() as RigidBody2D).apply_central_impulse(-col.get_normal() * 80.0)
```

### 5.6 `one_way_collision` 与平台

`StaticBody2D` 内的 `CollisionShape2D` 有 `one_way_collision` 属性,勾上后只阻挡某一侧的运动(默认是从上方碰撞)。这就是"穿过平台从下方跳上去"的实现。注意:**`one_way_collision` 受 `one_way_collision_margin` 影响**——margin 太小,角色一帧速度很快时会"穿"过平台。典型值 10 px。

### 5.7 `RayCast2D` 默认不查 Area2D

`RayCast2D` 的 `collide_with_areas` 默认是 `false`,只查 `PhysicsBody2D`。如果你想用 ray 检测拾取物(Area2D),要显式开启。`ShapeCast2D` 同样有这个开关。

### 5.8 layer 32 给"专属调试"

工程上有个不成文约定:**Layer 32 不用于游戏逻辑,留给调试**。运行时临时想"看看哪些东西被某个 mask 命中",把它们的 layer 加上 32,然后让一个调试 raycast 只看 layer 32,通过 inspector 实时查看。这是个习惯,不强制,但对大型项目调试时长有显著影响。

### 5.9 PhysicsServer2D 直接查询的边界

`PhysicsDirectSpaceState2D.intersect_shape` 等 API 比节点更轻量,但有几个限制:

- 必须在 `_physics_process` 内调用(否则物理状态可能不一致)。
- 查询不会返回"先撞到哪个"——返回数组,需要自己按距离排序。
- query 对象是一次性的,频繁查询要复用 `PhysicsShapeQueryParameters2D`。

AI 视野检测、敌人巡逻预判路径这类一帧一次的查询用这套 API 很合适,比放一堆 RayCast2D 节点轻得多。第 12 篇敌人 AI 会展开这种模式。

### 5.10 项目层名漂移导致的兼容性问题

一旦把"layer 5 是 player_hurtbox"写进若干 .tscn 文件,后来在 `Layer Names` 里把 5 改成"buff_zone",**已有 .tscn 文件里的位图不会跟着改**——这些节点仍然 layer 5,只是 inspector 上显示的名字变了。这是位图存储的固有限制。

预防办法:层名一旦在第一个角色 / 敌人节点里使用,就视为"对外契约",不可改名。要废弃就标 `__deprecated_xxx`,新位用别的槽位。

### 5.11 `Area2D.contact_monitor` 是 RigidBody2D 的属性

新手看 inspector 容易把 `Area2D` 的 `monitoring` 与 `RigidBody2D` 的 `contact_monitor` 混淆。它们看起来都是"开始监听碰撞",但作用域不同:

- `Area2D.monitoring`:扫重叠,触发 `body_entered` / `area_entered`。
- `RigidBody2D.contact_monitor` + `max_contacts_reported`:报告物理碰撞接触点,触发 `body_entered` / `body_shape_entered`。**默认 max_contacts_reported = 0,即使 monitor = true 也不会发任何信号。**

要让 RigidBody2D 撞到东西时通知,两个开关都得开,且 `max_contacts_reported` 设为非零。这条踩坑非常常见,因为 inspector 没有把这两个属性放在显眼的位置。

### 5.12 `set_collision_mask_value` 与位编号

API 有 `set_collision_layer_value(layer_number, value)` 和 `set_collision_mask_value(layer_number, value)`,接收的是"层编号"(1-32),不是位图。这两个方法是 Godot 4.x 加入的,比手动 `1 << (n-1)` 可读性好得多。`CL.bits(...)` 辅助函数在 §3.3 给出,只在批量配置时使用——单独设一两位用 `set_collision_layer_value(3, true)` 直观。

---

## 手动验证

- [ ] `项目设置 → Layer Names → 2D Physics` 至少前 10 层有具名("terrain"、"platform"、"player_body" 等),与 `res://core/collision_layers.gd` 常量对齐。
- [ ] 编辑器 Debug → Visible Collision Shapes 打开后运行,所有 hitbox(绿色)、hurtbox(绿色)、地形(浅蓝)颜色与位置正确。
- [ ] 玩家攻击窗口期外,hitbox.monitoring = false;窗口期内为 true(可通过临时打印验证)。
- [ ] 玩家与敌人 body 之间不直接判定伤害(只有 player_hitbox ↔ enemy_hurtbox 这一条路径);玩家不会被自己的 hitbox 误伤。
- [ ] 拾取物(`Area2D` layer=pickup)能被玩家触发,但不阻挡敌人移动;敌人脚下的 RayCast2D 不把拾取物当地面。
- [ ] 玩家在第 07 篇 dash 的 i-frames 期间冲过敌人 hitbox,`hurtbox.take_hit` 被调用但因 `owner.is_invulnerable()` 返回 true 而 return,角色不掉血。
