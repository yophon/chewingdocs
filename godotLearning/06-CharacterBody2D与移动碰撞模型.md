# 06-CharacterBody2D 与移动碰撞模型

> 一句话导读:`CharacterBody2D` 是"由程序员逐帧推动、由引擎计算碰撞"的玩家物理体。`move_and_slide` 是它的核心动词,但在 Godot 4.x 里**它已经不再接参数,只读 `velocity` 属性**。

第 05 篇把"数据 / 通讯 / 引用"三个解耦工具讲完了。从这一篇起,我们用这些工具搭真正的玩法。第二层(06-10 篇)的目标是"角色能动、能跳、能撞、能演出、镜头稳定"。本篇是第二层的入口,聚焦在最基础的:**让一个 2D 角色能够走、能够跳、能够踩在地面上、能够顺斜坡上下、能够撞墙停下**。

在写第一行代码之前,先把一桩很容易让 2026 年读者带着错误心智进入本篇的事情**显式澄清**。

## 重要澄清:Jolt 是 3D 默认,2D 物理没有任何变化

Godot 4.6 把 Jolt Physics 提升为 **3D 默认物理引擎**(替换 GodotPhysics3D 作为新项目的默认),很多技术新闻、博客、AI 摘要都会把它说成"Godot 4.6 换了物理引擎"。这句话非常容易被读者误读为"我的 2D 角色行为会变"。

**事实是:Jolt 只服务于 3D。Godot 4.6 的 2D 物理引擎仍然是 GodotPhysics2D,与 4.5 / 4.4 / 4.3 在 API 与运行行为上**完全一致**。`CharacterBody2D`、`RigidBody2D`、`Area2D`、`StaticBody2D`、`move_and_slide`、`move_and_collide` 这些 2D 节点和方法没有任何破坏性变化。**如果你做 2D 游戏,可以彻底忽略 Jolt 相关的所有迁移指南、所有"行为变了"的讨论**。

唯一在 4.4+ 引入并持续完善的"会影响 2D 手感"的特性,是 **Physics Interpolation**(物理插值)。它解决的是"物理 tick 频率与渲染帧率不匹配时,角色看起来抖"的问题。本篇会简述其心智,**实现细节留到第 24 篇**(异步加载与 WorkerThreadPool 那一篇会一起讲完)。

把这两件事澄清完,你可以放心地把本篇内容直接套用到 4.4 / 4.5 / 4.6 任何一个版本的 2D 项目里。

## 1. 机制定位

`CharacterBody2D` 解决一个非常具体的问题:**让我自己写运动逻辑,但不要让我手动算碰撞**。

新手通常会从两条错路开始:

**错路一:直接改 `position`,然后 `Area2D` 检测碰撞**。这是把"运动"和"碰撞"分开做。运动逻辑简单,但碰撞响应必须自己写 —— 撞墙后要不要停?斜坡怎么贴地?多角碰撞怎么处理?自己写到第三周就会想退坑。

**错路二:把玩家做成 `RigidBody2D`,加力推它走**。这套是"完全动力学"模型,引擎全权管理速度、摩擦、反作用力。看起来省事,但玩家手感会很奇怪 —— 一个真实物理对象不会按你期望的"按键瞬间满速、松开瞬间停止"来响应,角色像一团黏土。这是为什么几乎所有平台跳跃游戏都不用 `RigidBody2D` 做主角。

`CharacterBody2D` 的位置正好在这两条之间。它不是动力学体,不接受力 / 冲量;它是运动学体,**你设定速度 (`velocity`),引擎用一次 `move_and_slide()` 把它推过去、解决路径上的所有碰撞、必要时沿斜坡滑动、撞墙时把垂直分量保留**。你掌控行为,引擎接管几何。

这种"半托管"模型在 2D 游戏里几乎是唯一正确的选择 —— 平台跳跃、Top-down 射击、像素 RPG、地牢爬行,主角全都走 `CharacterBody2D`。`RigidBody2D` 只用在炸弹、桶、可推物理玩具这类不需要精确手感的角色。

一个常见的混淆:**为什么不直接写一个 `Sprite2D` + `RayCast2D` 自己手算碰撞**?答案是,你最终会重新发明 `CharacterBody2D`,而且做得更差。Godot 在 4.x 重写过几遍 `move_and_slide` 的实现,处理了边角碰撞、斜面贴地、平台层、安全余量、最大滑动次数、墙体允许角等十几个细节;自己重写一遍能让你深刻理解这些细节,但代价是六个月写不出真正的玩法。**把 `CharacterBody2D` 当成"运动学体的标准抽象",尊重它,然后专心写玩法**。这是本篇底层的工程态度。

本篇要把"用 `CharacterBody2D` 写一个能走能跳的角色"这件事讲透,并把它和"渲染层平滑"分开 —— 物理是物理,渲染是渲染,这是工程上极易混淆的两件事。

## 2. Godot 心智

### 物理 Tick 与渲染帧

Godot 把游戏循环分成两条独立的回调:`_process(delta)` 每帧调一次(频率等于渲染帧率,通常受 VSync 控制),`_physics_process(delta)` 每物理 tick 调一次(默认 60 Hz,由项目设置 `physics/common/physics_ticks_per_second` 控制)。

**所有改变运动状态的代码都应该写在 `_physics_process` 里**。原因有两个:

1. `_physics_process` 的 `delta` 是固定的(1.0 / physics_ticks_per_second),数值稳定,跨帧表现一致;`_process` 的 `delta` 会随帧率抖动,用它做物理更新会产生帧率依赖的 bug。
2. `move_and_slide()` 内部依赖物理空间的状态,它假设你在物理 tick 里调用。在 `_process` 里调可能拿到不对的碰撞数据。

实操上的指导:**移动 / 跳跃 / 碰撞响应 -> `_physics_process`;UI 刷新 / 视觉效果 / 摄像机 follow -> `_process`**。

### Physics Interpolation 是什么(心智层)

如果物理 tick 是 60 Hz,而你的显示器是 144 Hz,会发生什么?物理在每 16.7ms 才更新一次角色位置,渲染却以 7ms 一帧的速度刷,中间的帧角色"位置没变",看起来就会一卡一卡的。在 60 Hz 的低帧率手机上更严重。

Physics Interpolation(项目设置 `physics/common/physics_interpolation = true`)解决这件事:引擎在渲染帧里,根据"上一次物理 tick 位置 + 这一次物理 tick 位置 + 当前帧在两次 tick 之间的进度"做线性插值,在 `_process` 那侧呈现一个平滑的中间位置,而物理逻辑里的 `position` 仍然是离散的 tick 值。

它的代价:渲染位置永远落后物理 0~1 个 tick,主观上多出一点输入延迟,但视觉抖动消失。对手感敏感的精确平台跳跃可能需要权衡;大多数 2D 项目开了它收益大于代价。

**本篇只需记心智一句:Physics Interpolation 是渲染层的事,与 `CharacterBody2D` 的 `velocity` / `move_and_slide` 逻辑完全无关**。第 24 篇会展开讲怎么手动控制特定节点是否参与插值、`Camera2D` 在插值开启时如何配合等细节。

### `move_and_slide` 在 4.x 的 API 变化

这是从 3.x 升过来的工程师最常踩的坑。3.x 的签名是:

```gdscript
## 3.x 旧版,不要这样写!
velocity = move_and_slide(velocity, Vector2.UP)
```

4.x 完全变了:

```gdscript
## 4.x 正确写法
move_and_slide()
```

参数全部移除,改成读写 `CharacterBody2D` 自身的属性:

- `velocity`(Vector2):函数读取它作为输入,函数返回后**自动修正它**为碰撞后实际的速度(撞墙后水平分量归零等)。
- `up_direction`(Vector2):默认 `Vector2(0, -1)`,决定"哪是上"。
- `floor_max_angle`(float,弧度):大于这个角的斜面被当作墙,默认 ~45°。
- `floor_snap_length`(float):"贴地长度",离地这个距离以内仍算站在地上,默认 1.0。
- `motion_mode`(枚举):`MOTION_MODE_GROUNDED` 平台跳跃(默认),`MOTION_MODE_FLOATING` 自顶向下。

碰到 4.x 教程里还写 `move_and_slide(velocity)` 的,要么是机翻 3.x 旧文,要么是 AI 训练数据落后了 —— 直接忽略。

### `is_on_floor` / `is_on_wall` / `is_on_ceiling`

这三个查询函数返回布尔,基于最近一次 `move_and_slide()` 的碰撞结果。它们的"快门时刻"是 `move_and_slide()` 调完那一瞬间;在调用之前,值是上一帧的状态。**正确顺序:先算速度 -> 调 `move_and_slide` -> 查碰撞状态**。

经典坑:把 `is_on_floor()` 写在跳跃判定**之前**,然后在判定到按键后才调 `move_and_slide`。这会读到一帧之前的着地状态,玩家离地一帧后还能跳一次 —— 看起来像 bug,实则是顺序错。第 07 篇里讲的 coyote time 是"故意"用类似机制做手感容差,与这种意外延迟是两回事。

### Motion Mode:平台跳跃还是自顶向下

`motion_mode` 这个枚举决定了 `move_and_slide` 的"碰撞分类规则",是 4.x 单独划出来的核心设计:

- `MOTION_MODE_GROUNDED`(默认):有"上下"概念。`move_and_slide` 会按 `up_direction` 把碰到的表面分为**地面 / 墙 / 天花板**,提供 `is_on_floor`、`is_on_wall`、`is_on_ceiling` 区分查询;斜面上的速度会按物理直觉减缓 / 加速。适合横版平台跳跃、横版战斗、横版 RPG。
- `MOTION_MODE_FLOATING`:没有"上下"概念。所有碰撞统一报告为墙;滑动时速度保持恒定。适合自顶向下视角、太空船、俯视角射击。

写自顶向下游戏时**一定要把 `motion_mode` 改成 floating**,否则 `floor_max_angle` / `floor_snap_length` / 重力之类的逻辑会在每一帧偷偷干扰你。改完之后,本篇示例里的"重力"代码段就不再需要了,玩家直接用方向键改 `velocity.x / velocity.y` 即可。

### `safe_margin` 与 `max_slides`

两个不常碰但出 bug 时一定要知道的进阶字段:

- `safe_margin`(默认 0.08 像素):碰撞解算后,引擎额外推开一点点的距离,防止精度误差导致下一帧又卡进去。极少需要调,但在像素风(整数坐标 + 极小角色)项目里偶尔要降到 0.04。
- `max_slides`(默认 4):一次 `move_and_slide` 最多重复滑动几次。复杂多角碰撞场景下,4 已经够。提高它没有副作用但消耗略增;调到 1 会让"撞墙后沿墙下滑"的常规行为消失。

### `KinematicCollision2D`:细粒度碰撞响应

`move_and_slide` 内部可能产生多次滑动 / 多次碰撞。如果你需要查"我这一帧到底撞到了什么、从哪个方向撞的",可以遍历:

```gdscript
for i in get_slide_collision_count():
    var col: KinematicCollision2D = get_slide_collision(i)
    var normal: Vector2 = col.get_normal()
    var hit: Object = col.get_collider()
```

`KinematicCollision2D` 还能拿到 `get_position()`(碰撞点世界坐标)、`get_remainder()`(没走完的位移)、`get_travel()`(已走的位移)。这些字段在写"反弹小球"、"霰弹枪击退"、"墙跳"等需要响应碰撞几何的玩法时是必备。

或者更精确的:`move_and_collide(motion: Vector2)` 走一步、返回**单次**碰撞信息,你自己处理 reflection / projection。文档给的反弹模板就是这样:

```gdscript
var col := move_and_collide(velocity * delta)
if col:
    velocity = velocity.bounce(col.get_normal())
    move_and_collide(col.get_remainder().bounce(col.get_normal()))
```

平台跳跃主角不需要这种细粒度;但 boss 战里的弹反子弹、Pong 类游戏的小球,几乎一定走 `move_and_collide`。

## 3. 工程实现

下面是一个完整、可运行的 `CharacterBody2D` 子类,带重力、跳跃、地面检测、可参数化的加速度与摩擦。文件路径 `res://player/player_body.gd`。

```gdscript
# res://player/player_body.gd
class_name PlayerBody
extends CharacterBody2D

## ---- 调参字段 ----------------------------------------------------------
@export_group("Move")
@export var max_speed: float = 220.0
@export var acceleration: float = 1800.0
@export var friction: float = 1400.0

@export_group("Jump")
@export var jump_velocity: float = -420.0
@export var jump_cut_multiplier: float = 0.45    ## 松手即截断跳跃高度
@export var max_fall_speed: float = 700.0

@export_group("Gravity")
@export var gravity_scale: float = 1.0           ## 1.0 跟随项目默认重力
@export var fall_gravity_scale: float = 1.4      ## 下落阶段额外加重

## ---- 信号 --------------------------------------------------------------
signal jumped
signal landed
signal hit_wall(normal: Vector2)

## ---- 内部状态 ----------------------------------------------------------
var _was_on_floor: bool = false

@onready var _sprite: Sprite2D = %Sprite

func _physics_process(delta: float) -> void:
    var input_x: float = Input.get_axis(&"move_left", &"move_right")
    _apply_horizontal(input_x, delta)
    _apply_gravity(delta)
    _handle_jump_input()

    move_and_slide()      ## 4.x 不带参数

    _post_collide()

func _apply_horizontal(input_x: float, delta: float) -> void:
    if absf(input_x) > 0.01:
        velocity.x = move_toward(velocity.x, input_x * max_speed, acceleration * delta)
        _sprite.flip_h = input_x < 0.0
    else:
        velocity.x = move_toward(velocity.x, 0.0, friction * delta)

func _apply_gravity(delta: float) -> void:
    var base_g: float = ProjectSettings.get_setting(
        "physics/2d/default_gravity", 980.0
    )
    var scale: float = fall_gravity_scale if velocity.y > 0.0 else gravity_scale
    velocity.y = minf(velocity.y + base_g * scale * delta, max_fall_speed)

func _handle_jump_input() -> void:
    if Input.is_action_just_pressed(&"jump") and is_on_floor():
        velocity.y = jump_velocity
        jumped.emit()
    ## 松开跳跃键时,如果还在上升,把垂直速度截断一部分
    if Input.is_action_just_released(&"jump") and velocity.y < 0.0:
        velocity.y *= jump_cut_multiplier

func _post_collide() -> void:
    ## 落地事件
    if not _was_on_floor and is_on_floor():
        landed.emit()
    _was_on_floor = is_on_floor()

    ## 撞墙事件,遍历这帧所有 slide 碰撞
    if is_on_wall_only():
        for i in get_slide_collision_count():
            var col: KinematicCollision2D = get_slide_collision(i)
            hit_wall.emit(col.get_normal())
```

逐点解读:

**1. `@export_group` 把字段分组**

Inspector 里会以折叠分组展示,几十个 `@export` 字段不再是一坨。这是 4.x 才有的,显著改善"超长 Inspector"问题。

**2. `move_toward` 而不是直接赋值**

直接 `velocity.x = input_x * max_speed` 会让加速无限快,松开按键瞬间停。`move_toward(current, target, step)` 给一个"逐帧逼近"的过渡,通过 `acceleration` 和 `friction` 区分按键时和松手时的过渡速度。这是手感工程化的最基础工具,第 07 篇会继续细化。

**3. 上升和下落重力不同**

`fall_gravity_scale` 比 `gravity_scale` 大,意思是下落比上升更"重"。这是 2D 平台游戏最常见的手感技巧之一(被称为"snappy jump curve"),让玩家觉得跳跃有"漂浮感",落地有"果断感"。马里奥、Celeste、Hollow Knight 全部这么干。

**4. 跳跃截断(jump cut)**

按住跳键跳得高,轻点跳得矮 —— 这种"可变高度跳跃"由 `jump_cut_multiplier` 实现:松开 jump 时,如果还在上升,把 `velocity.y` 乘以一个小数(本例 0.45)。它不是"突然停",而是"把剩余冲量削掉一半"。第 07 篇会和 coyote time、jump buffer 一起整合。

**5. 落地与撞墙事件用信号外发**

`PlayerBody` 自己不播音效、不放灰尘粒子、不震屏 —— 那些是表现层的事,由订阅 `landed` 和 `hit_wall` 的其他节点完成。这正是第 05 篇"信号让节点解耦"的实战。

**6. 项目重力读取**

`ProjectSettings.get_setting("physics/2d/default_gravity", 980.0)` 读项目默认重力,**单位是像素/秒²**。这一项可以在编辑器项目设置里调,所有 2D 物体共享。建议不要硬编码 980,因为如果美术后来把"世界尺度"调成了 2x,所有重力都需要跟着改。

**7. `is_on_wall_only()` 与 `is_on_wall()` 的区别**

`is_on_wall_only()` 是"只撞了墙、没有同时在地上"。区分这两者,可以避免"在斜坡边缘走时把斜坡误判为墙、然后触发撞墙音效"这种典型 bug。

### 场景搭建

把上面这个脚本挂到 `CharacterBody2D` 上,场景结构最小是:

```
PlayerBody (CharacterBody2D, 挂 player_body.gd)
├── %Sprite (Sprite2D, 给一张角色贴图)
└── CollisionShape2D (拖一个 CapsuleShape2D 进去)
```

胶囊形碰撞体在斜坡上比矩形稳定 —— 边角不会卡。再做一个 `Level` 场景,塞几块 `StaticBody2D` 当地面 / 墙 / 斜坡,就可以跑起来了。

输入映射方面,在 Project Settings -> Input Map 里加 `move_left` / `move_right` / `jump` 三个 action(分别绑 A、D、Space 即可)。第 07 篇会把 InputMap 单独讲透。

## 4. 调参和验收

`CharacterBody2D` 的调参不是某一个数值,而是"几个数值之间的平衡"。给一份在多个 2D 项目里验过的初始范围,作为起点:

| 字段 | 推荐起始值 | 调高的效果 | 调低的效果 |
| --- | --- | --- | --- |
| `max_speed` | 200~280 | 跑得更快但难精准停 | 慢但好控 |
| `acceleration` | 1500~2200 | 起步更脆 | 起步有"重车"感 |
| `friction` | 1200~1800 | 松手立刻停 | 松手有"滑冰"感 |
| `jump_velocity` | -380 ~ -480 | 跳得高 | 跳得矮 |
| `jump_cut_multiplier` | 0.3~0.6 | 截断更狠,高跳更短 | 截断不明显 |
| `fall_gravity_scale` | 1.2~1.8 | 落地更脆 | 跳跃曲线更对称 |
| `floor_snap_length` | 2~6 | 下楼梯不抖 | 离地更敏感 |
| `floor_max_angle` | π/4 (45°) | 能爬更陡的斜坡 | 陡坡被当成墙 |

**调参方法论**

不要一次调一堆。固定一组初始值跑 5 分钟,记下不舒服的具体问题:"跳起来感觉过于飘"、"撞墙后角色弹一下"、"上斜坡时卡顿"。每个问题对应一两个字段,改完再跑。盲调三个字段以上,你不会知道是哪一项救了你。

**Physics Tick 调参**

项目设置 `physics/common/physics_ticks_per_second` 默认 60。把它调到 120,角色移动会更顺滑,但物理代价翻倍。常见取值:

- 60:默认,大部分 2D 平台游戏够用。
- 120:精确平台跳跃(类 Celeste)、子弹地狱、需要细致输入响应的项目。
- 30:只在性能极端紧张的移动设备上考虑,会影响手感。

**Physics Interpolation 开关**

`physics/common/physics_interpolation = true`。建议在低帧率目标设备(Web / 移动 / Steam Deck)上开;在 144Hz+ 桌面项目上,可以根据视觉抖动观察决定。开它会引入 0-1 tick 的"渲染落后",对精确平台跳跃可能有微小影响,**但物理逻辑本身完全不变**。

**验收清单**

- [ ] 角色在平地能走、能停;松手 0.2 秒内速度归零。
- [ ] 在地面按 jump 能跳;空中按 jump 不会二段跳。
- [ ] 跳跃时按住与轻点能产生明显的高度差(jump cut 生效)。
- [ ] 上升缓慢、下落明显更快,跳跃曲线非对称。
- [ ] 走上 30° 斜坡正常贴地,走下时不"漂"出去(`floor_snap_length` 起作用)。
- [ ] 撞墙时角色不会沿墙抖动,水平速度被引擎自动清零。
- [ ] 落地时 `landed` 信号被发出一次,持续在地上不重复发。
- [ ] 把 `physics_ticks_per_second` 在 30 / 60 / 120 之间切换,手感与稳定性符合预期。

## 5. 踩坑

**坑 1:在 `_process` 里调 `move_and_slide`**

最常见的低级错。结果是角色位置随渲染帧率漂移,144Hz 显示器上跑得比 60Hz 显示器上快一倍多。修法:所有 `velocity` / `move_and_slide` 调用都搬到 `_physics_process`。

**坑 2:重力没乘 `delta`**

`velocity.y += gravity` 而不是 `velocity.y += gravity * delta`。前者让角色"刹那间获得永远累积的速度",一秒后就掉出屏幕。`move_and_slide` 内部确实会用 delta 推位置,但**速度的积累必须你自己乘 delta**,这是 4.x 文档反复强调的边界(`# move_and_slide already takes delta time into account`,但速度的变化不归它管)。

**坑 3:`velocity.x = 0` 直接赋值,导致没有摩擦感**

新手版的"松手就停"。`move_toward(velocity.x, 0, friction * delta)` 才是合理写法。前者让角色像被电闸切断电源,后者像有摩擦力。

**坑 4:`is_on_floor()` 在 `move_and_slide` 之前查**

```gdscript
if is_on_floor() and Input.is_action_just_pressed(&"jump"):
    velocity.y = jump_velocity
move_and_slide()
```

这段在 4.x 里通常**是对的**,因为 `is_on_floor()` 返回的是上一帧 `move_and_slide` 的结果,大多数情况一致。但严格说,如果你在中途修改了角色 transform(例如传送),需要在传送后手动 `apply_floor_snap()` 或下一帧再判。文档原话:贴地基于上一次 `move_and_slide` 的快照。

**坑 5:角色穿墙、卡进地里**

绝大多数情况是 **`CollisionShape2D` 没设、设歪了、或形状边界精确为 0**。打开 Debug -> Visible Collision Shapes,直接看角色身上的红框是否合理。胶囊体的"轴"要垂直(平台跳跃)或水平(自顶向下),不要乱转。

**坑 6:在斜坡上不停抖动**

`floor_snap_length` 太小,或者斜面与地面之间有微小缝隙。先把 `floor_snap_length` 改到 4~6,问题通常就消失了。如果还抖,检查碰撞形状是否是矩形 —— 改用胶囊,90% 的"边缘卡顿"会消失。

**坑 7:误以为 `CharacterBody2D` 接受 `apply_impulse`**

`apply_impulse / apply_force` 是 `RigidBody2D` 的接口。`CharacterBody2D` 没有力的概念,你想给它一个"被打飞"的效果,只能 `velocity = knockback_dir * knockback_speed`,然后让常规的摩擦逻辑把它逐帧拉回来。

**坑 8:`move_and_slide(velocity)` 来自 3.x 教程**

再次强调,4.x 里 `move_and_slide` **不接参数**。看到带参数的代码,直接判定该教程过时。

**坑 9:把 Jolt 配置搬到 2D**

有人看到 4.6 发布说明里 "Project Settings -> Physics -> Jolt" 有几十个选项,顺手在自己的 2D 项目里调。**所有 `physics/jolt_physics_3d/...` 设置对 2D 完全无效**。2D 的项目设置在 `physics/2d/...` 路径下(默认重力、默认线性阻尼、空间块大小等),与 Jolt 完全无关。

**坑 10:Physics Interpolation 开后,自己 `position = ...` 传送会出现一道拉丝**

如果开了 `physics_interpolation = true`,然后你某帧把角色直接 `position = new_pos` 传送到远处,渲染层会把"从旧位置到新位置"看作一次平滑移动,屏幕上看到一条很长的位移残影。修法:传送后调 `reset_physics_interpolation()`,显式告诉引擎"这一次不要插值"。

**坑 11:`max_slides` 默认 4,极少需要改**

`max_slides` 是 `move_and_slide` 内部"一帧最多重新滑动几次"。复杂几何下设太低可能让角色卡住,设太高没有副作用但消耗稍多。默认 4 足够大多数 2D 项目,不要轻易调。

**坑 12:把"速度"和"位移"在同一帧反复重置**

写过一个错误版本的人会知道:`_physics_process` 里先 `velocity = Vector2.ZERO`,再根据输入加,再 `move_and_slide`。表面看没问题,实际上每帧把上一次 `move_and_slide` 改正过的速度也清零了(撞墙后引擎给你的水平 0 没了),角色撞墙后会瞬间获得满速度反弹回去。正确节奏:**只在按键明确变向时改 `velocity.x`,垂直分量按重力累加,其它情况让 `move_and_slide` 自己维护它。**

---

`CharacterBody2D` 与 `move_and_slide` 是 Godot 2D 游戏角色控制的"两件套",理解了它们的边界,后面几乎所有平台跳跃 / Top-down 游戏的主角逻辑都能套这个骨架。下一篇 **07 输入映射、输入缓冲与手感参数** 会接着把"按键到运动"这一段做到独立游戏的工业水准:coyote time、jump buffer、acceleration / friction 曲线,以及 hit stop 一类的"反馈不在动作上而在停顿里"的小技巧。

## 手动验证

- [ ] 在新建空项目里跑本篇 `PlayerBody` 脚本 + 一个含三段斜坡(0°、20°、40°)的关卡,玩家能正常上下三种斜坡。
- [ ] 把 `floor_max_angle` 改成 30°,40° 斜坡变成墙,角色无法走上去。
- [ ] 把 `move_and_slide()` 改回 3.x 写法 `move_and_slide(velocity)`,确认编辑器报错。
- [ ] 在 `_process` 里调一次 `move_and_slide()`(故意),把显示器从 60Hz 切到 144Hz,观察角色速度是否漂移。
- [ ] 项目设置中关闭 / 打开 `physics_interpolation`,在 30 FPS 限帧下对比角色移动平滑度。
- [ ] 在 `landed` 信号上挂一段 `print("LANDED")`,确认每次落地只打一次。
- [ ] 监听 `hit_wall` 信号,撞墙时打印法线,验证法线方向符合直觉(左墙法线 = (1, 0))。

---

**下一篇:** `07-输入映射-输入缓冲与手感参数.md`,把"按键 -> 速度"中间那一段做成可调、可重映射、可缓冲的独立游戏级输入系统。

---

**信息源**:

- [Godot 4.6 Release: It's all about your flow](https://godotengine.org/releases/4.6/)
- [Godot 4.6 Jolt Physics: Complete Migration Guide (StraySpark)](https://www.strayspark.studio/blog/godot-46-jolt-physics-migration-guide)
- [Godot 4.6: What changes for you (GDQuest)](https://www.gdquest.com/library/godot_4_6_workflow_changes/)
