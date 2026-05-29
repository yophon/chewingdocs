# CharacterBody2D 与移动碰撞模型

从这一篇开始,角色要真的动起来。Godot 里让 2D 主角移动,最常用的节点不是 `RigidBody2D`,也不是普通 `Sprite2D`,而是 `CharacterBody2D`。

> 一句话先记住:**你负责改 `velocity`,Godot 负责用 `move_and_slide()` 处理碰撞。**

别一上来纠结物理引擎新闻。Godot 4.6 的 Jolt 默认只影响 3D,2D 仍然是 GodotPhysics2D。做 2D 平台跳跃、俯视角动作、像素 RPG,你照样用 `CharacterBody2D`、`Area2D`、`StaticBody2D` 这一套。

---

## 一、别直接改 position

新手最容易写出这种代码:

```gdscript
func _process(delta: float) -> void:
    if Input.is_action_pressed("move_right"):
        position.x += 200.0 * delta
```

能动,但碰撞很快就坏。

你会遇到这些问题:

- 撞墙后角色钻进去。
- 斜坡上不能自然贴地。
- 一帧移动太远时穿过薄墙。
- 想知道“我脚下是不是地面”很麻烦。

`CharacterBody2D` 的价值就在这里:它让你自己写速度,但不用自己写碰撞几何。

正确的基本形状是:

```gdscript
extends CharacterBody2D

func _physics_process(delta: float) -> void:
    velocity.x = 200.0
    move_and_slide()
```

Godot 4 里 `move_and_slide()` 不再接参数。它读当前节点的 `velocity`,移动以后再把碰撞修正后的速度写回 `velocity`。

旧教程里的这句是 Godot 3 写法:

```gdscript
velocity = move_and_slide(velocity, Vector2.UP)
```

在 Godot 4 项目里不要照抄。

---

## 二、物理代码放在 _physics_process

Godot 有两条常见循环:

```text
_process(delta)          每个渲染帧调用,帧率不固定
_physics_process(delta)  每个物理 tick 调用,默认 60 次/秒
```

移动、跳跃、碰撞都放 `_physics_process`。UI、粒子、非关键视觉效果可以放 `_process`。

原因很简单:物理要稳定。渲染帧率可能 144、90、60、45 来回变,但物理 tick 默认稳定在 60。你把 `move_and_slide()` 放在 `_process`,就会把物理行为绑到显卡帧率上。

---

## 三、一个能走能跳的最小角色

场景结构:

```text
Player (CharacterBody2D)
├── %Sprite (Sprite2D)
└── CollisionShape2D
```

脚本:

```gdscript
# res://player/player_body.gd
class_name PlayerBody
extends CharacterBody2D

@export_group("Move")
@export var max_speed: float = 220.0
@export var acceleration: float = 1600.0
@export var friction: float = 1800.0

@export_group("Jump")
@export var jump_velocity: float = -420.0
@export var jump_cut_multiplier: float = 0.45
@export var max_fall_speed: float = 700.0

@export_group("Gravity")
@export var gravity: float = 980.0
@export var fall_gravity_multiplier: float = 1.35

signal jumped
signal landed

var _was_on_floor: bool = false

@onready var _sprite: Sprite2D = %Sprite

func _physics_process(delta: float) -> void:
    var input_x := Input.get_axis(&"move_left", &"move_right")

    _apply_horizontal(input_x, delta)
    _apply_gravity(delta)
    _apply_jump()

    move_and_slide()

    _emit_landing_if_needed()

func _apply_horizontal(input_x: float, delta: float) -> void:
    if absf(input_x) > 0.01:
        velocity.x = move_toward(velocity.x, input_x * max_speed, acceleration * delta)
        _sprite.flip_h = input_x < 0.0
    else:
        velocity.x = move_toward(velocity.x, 0.0, friction * delta)

func _apply_gravity(delta: float) -> void:
    if is_on_floor() and velocity.y >= 0.0:
        return

    var g := gravity
    if velocity.y > 0.0:
        g *= fall_gravity_multiplier

    velocity.y = minf(velocity.y + g * delta, max_fall_speed)

func _apply_jump() -> void:
    if Input.is_action_just_pressed(&"jump") and is_on_floor():
        velocity.y = jump_velocity
        jumped.emit()

    if Input.is_action_just_released(&"jump") and velocity.y < 0.0:
        velocity.y *= jump_cut_multiplier

func _emit_landing_if_needed() -> void:
    if not _was_on_floor and is_on_floor():
        landed.emit()
    _was_on_floor = is_on_floor()
```

这段代码解决了最小平台跳跃角色的四件事:

- 按方向键逐渐加速,不是瞬间满速。
- 松开方向键逐渐减速,不是像冰面一样滑很久。
- 按跳跃键起跳。
- 松开跳跃键截断上升速度,做出“轻按小跳、长按大跳”。

---

## 四、为什么顺序是这样

典型顺序是:

```text
读输入
改 velocity
move_and_slide()
读碰撞结果
```

`is_on_floor()`、`is_on_wall()`、`is_on_ceiling()` 都来自最近一次 `move_and_slide()` 的结果。也就是说,你在本帧调用 `move_and_slide()` 前读到的是上一帧状态。

这不代表不能用。上面的跳跃判断用的是上一帧是否在地面,这在平台跳跃里通常没问题。更严格的输入缓冲和土狼时间放到第 07 篇讲。

碰撞后想看这一帧撞到了什么,用:

```gdscript
for i in get_slide_collision_count():
    var collision := get_slide_collision(i)
    var normal := collision.get_normal()
    var collider := collision.get_collider()
```

墙跳、撞墙音效、踩敌人头顶,都会用到这类信息。

---

## 五、平台跳跃和俯视角不一样

横版平台跳跃默认用:

```gdscript
motion_mode = CharacterBody2D.MOTION_MODE_GROUNDED
up_direction = Vector2.UP
```

这时 Godot 会把碰撞面分成地面、墙、天花板。

俯视角游戏没有“地面”和“跳跃”概念,要改成:

```gdscript
motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
```

俯视角移动一般这样写:

```gdscript
var input := Input.get_vector(&"move_left", &"move_right", &"move_up", &"move_down")
velocity = input * max_speed
move_and_slide()
```

别把平台跳跃那套重力代码硬塞进俯视角游戏。

---

## 六、斜坡和贴地

两个属性会影响平台角色的地面感:

```gdscript
floor_max_angle
floor_snap_length
```

`floor_max_angle` 决定多陡的面还算地面。默认接近 45 度。

`floor_snap_length` 决定角色离地一点点时要不要继续贴住地面。斜坡、下台阶、移动平台都依赖它。角色下坡时如果频繁小跳,先看这个值。

一般不要一上来乱调。先用默认值跑通,出现具体问题再改。

---

## 七、验收

这篇做完,角色应该达到这些标准:

- 用 `CharacterBody2D`,不是直接改 `position`。
- 移动和 `move_and_slide()` 都在 `_physics_process`。
- Godot 4 代码里没有 `move_and_slide(velocity)`。
- 撞墙不会穿过去。
- 落地能被 `is_on_floor()` 识别。
- 松开跳跃键时跳跃高度会变低。
- 俯视角项目明确使用 `MOTION_MODE_FLOATING`。

---

## 常见坑

**坑 1:把玩家做成 RigidBody2D。**

`RigidBody2D` 适合箱子、碎片、可推物。主角通常要精确响应输入,用 `CharacterBody2D` 更合适。

**坑 2:每帧直接 `velocity.x = 0`。**

这会抹掉空中惯性。用 `move_toward` 控制加速和摩擦。

**坑 3:在 `_process` 调 `move_and_slide()`。**

能跑,但会出现帧率相关问题。移动碰撞放 `_physics_process`。

**坑 4:不知道 4.x 的 API 已经变了。**

Godot 4 的 `move_and_slide()` 不接参数,也不返回新速度。

**坑 5:用 `is_on_floor()` 解释所有手感问题。**

跳跃按早、按晚、边缘没跳起来,很多时候不是地面判断错,而是输入缓冲没做。下一篇处理这个问题。

---

下一篇讲输入映射、跳跃缓冲、土狼时间、加速度、hit stop。也就是让“能动”变成“好按”。
