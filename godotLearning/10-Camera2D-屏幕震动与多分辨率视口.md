# Camera2D、屏幕震动与多分辨率视口

角色能跑能跳以后,画面还可能很难受:镜头死死贴着玩家,跳一下屏幕跟着抖,受击没有反馈,换个分辨率像素全糊。

> 一句话先记住:**镜头不是玩家的子节点,它是一个独立跟随系统。**

---

## 一、别把 Camera2D 挂在玩家下面

新手常见结构:

```text
Player
└── Camera2D
```

这样镜头会继承玩家的所有移动。玩家抖一下,镜头也抖一下;玩家被击退,整个屏幕跟着猛甩。

更好的结构:

```text
Level
├── Player
├── TileMapLayer
├── Enemies
└── GameCamera (Camera2D)
```

相机自己读取玩家位置,再决定怎么跟。

---

## 二、最小跟随镜头

```gdscript
# res://camera/game_camera.gd
class_name GameCamera
extends Camera2D

@export var follow_target: Node2D
@export var follow_speed: float = 10.0

func _ready() -> void:
    make_current()

func _physics_process(delta: float) -> void:
    if follow_target == null:
        return

    global_position = global_position.lerp(
        follow_target.global_position,
        1.0 - exp(-follow_speed * delta)
    )

func snap_to_target() -> void:
    if follow_target == null:
        return
    global_position = follow_target.global_position
    reset_smoothing()
```

`snap_to_target()` 用在进关卡、复活、传送之后。否则镜头会从旧位置慢慢滑过来。

---

## 三、Camera2D 内置平滑也能用

Godot 的 `Camera2D` 自带平滑:

```gdscript
func _ready() -> void:
    make_current()
    position_smoothing_enabled = true
    position_smoothing_speed = 10.0
```

如果用内置平滑,脚本里可以直接设置目标位置:

```gdscript
func _physics_process(_delta: float) -> void:
    if follow_target != null:
        global_position = follow_target.global_position
```

两种方式选一个,不要自己 lerp 一次,又打开内置 smoothing。双重平滑会让镜头像慢半拍。

---

## 四、震屏写 offset,别写 position

镜头震动不是改相机位置:

```gdscript
global_position += random_offset
```

这样会污染跟随目标,平滑系统也会把震动吃掉。

震动应该写 `offset`:

```gdscript
@export var shake_max_offset: float = 8.0
@export var shake_decay: float = 4.0

var _trauma: float = 0.0
var _rng := RandomNumberGenerator.new()

func add_trauma(amount: float) -> void:
    _trauma = clampf(_trauma + amount, 0.0, 1.0)

func _process(delta: float) -> void:
    _trauma = maxf(_trauma - shake_decay * delta, 0.0)

    if _trauma <= 0.0:
        offset = Vector2.ZERO
        return

    var strength := _trauma * _trauma
    offset = Vector2(
        _rng.randf_range(-1.0, 1.0),
        _rng.randf_range(-1.0, 1.0)
    ) * shake_max_offset * strength
```

受击时:

```gdscript
camera.add_trauma(0.35)
```

爆炸时:

```gdscript
camera.add_trauma(0.8)
```

小项目用随机就够了。想更顺滑再换 `FastNoiseLite`。

---

## 五、look ahead 让玩家看见前方

横版游戏常见需求:玩家往右跑,镜头略微往右偏。

```gdscript
@export var look_ahead_distance: float = 32.0
@export var look_ahead_speed: float = 6.0

var _look_ahead := Vector2.ZERO

func update_look_ahead(input_x: float, delta: float) -> void:
    var target := Vector2(input_x * look_ahead_distance, 0.0)
    _look_ahead = _look_ahead.lerp(target, 1.0 - exp(-look_ahead_speed * delta))
```

最后把它加到 `offset` 或你的目标位置里。注意别和震屏互相覆盖:

```gdscript
offset = _look_ahead + _shake_offset
```

---

## 六、分辨率先定基准

先选一个游戏内部基准分辨率,比如:

```text
像素风: 320x180, 426x240, 640x360
非像素风: 1280x720, 1920x1080
```

然后在项目设置里配拉伸:

```text
Project Settings -> Display -> Window -> Stretch
```

常见选择:

```text
像素风:
  mode = viewport
  aspect = keep
  scale mode = integer

非像素风:
  mode = canvas_items
  aspect = expand 或 keep
  scale mode = fractional
```

像素风最怕小数缩放和线性过滤。第 02 篇已经讲过导入过滤,这里再记一次:像素美术用 nearest,不要让纹理被糊成一团。

---

## 七、UI 不要被镜头带走

HUD 用 `CanvasLayer`:

```text
Level
├── World
│   ├── Player
│   └── GameCamera
└── HUD (CanvasLayer)
```

`CanvasLayer` 不受 `Camera2D` 世界变换影响。血条、菜单、对话框都应该放这里,不要塞在地图节点下面。

---

## 八、关卡边界

不要让镜头看到地图外面。`Camera2D` 有 limit:

```gdscript
camera.limit_left = 0
camera.limit_top = 0
camera.limit_right = level_width
camera.limit_bottom = level_height
```

如果关卡来自 `TileMapLayer`,可以在关卡加载后根据 used rect 算边界。前期也可以手填,先让画面别露底。

---

## 验收

- `Camera2D` 不挂在玩家下面。
- 场景切换和复活后调用 `snap_to_target()` 或 `reset_smoothing()`。
- 震屏写 `offset`,不污染 `global_position`。
- HUD 放在 `CanvasLayer`。
- 像素风项目使用整数缩放和 nearest 过滤。
- 镜头有边界,不会看到关卡外空白。

---

## 常见坑

**坑 1:双重平滑。**

自己 lerp 了,又开 Camera2D smoothing,镜头会拖很久。

**坑 2:震屏直接改 position。**

用 `offset`。`position` 是跟随系统的主输入。

**坑 3:UI 放在世界节点里。**

相机一动 UI 就跑。HUD 用 `CanvasLayer`。

**坑 4:像素风用小数缩放。**

像素会糊。用 viewport + integer scale。

---

下一篇进入关卡搭建:TileMapLayer、TileSet 和 2D 地图工作流。
