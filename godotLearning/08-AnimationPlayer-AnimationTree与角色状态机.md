# 08-AnimationPlayer、AnimationTree 与角色状态机

> 一句话导读:动画工具的选型本质上是回答一个问题——"我的状态机是写在节点图里,还是写在脚本里?"两条路都对,前提是想清楚状态数、过渡复杂度和混合需求。

第 07 篇把手感参数调好,角色已经能稳定地跑、跳、冲刺。但屏幕上看到的还是个静态色块。这一篇要做的事是给这套行为加上视觉,而且**不能让动画反过来污染状态逻辑**。

Godot 给 2D 动画提供了三件工具:`AnimatedSprite2D`、`AnimationPlayer`、`AnimationTree`。新手很容易把它们当作"高级 / 低级"的同一谱系——不是。它们解决不同的问题,叠加使用时各管各的层。本篇把选型决策、最小示例和动画-逻辑解耦的工程模式都摆开。

## 1. 机制定位

### 1.1 动画系统真正解决的问题

"播放一段帧动画"在引擎里其实是个小问题。`AnimatedSprite2D` 五行代码就能跑。动画系统真正解决的是这三件事:

1. **多轨同步**:同一个动画里要同时驱动 sprite 帧、骨骼旋转、collision shape 位置、特效粒子开关、音效触发,而且它们必须严格按时间对齐。
2. **状态过渡**:从 idle 切到 run 不是"立刻切",而是要有一段几十毫秒的混合(crossfade);从 attack 切到 idle 又必须等当前动画播完。
3. **逻辑解耦**:战斗、移动、状态机的代码不应该长这样—`if state == "attack_3" and animation.current_frame == 7 then create_hitbox()`,这种写法每加一个动作就要改两处代码。

`AnimatedSprite2D` 只覆盖 (1) 中的"sprite 帧"一件事。`AnimationPlayer` 覆盖 (1) 的全部和 (3) 的一半(通过 Call Method Track / Audio Track)。`AnimationTree` 覆盖 (1)(2)(3) 三件事,代价是引入一张需要单独维护的节点图。

### 1.2 新手最容易踩的两条错路

第一条是**把动画播放写在状态判断的分支里**:

```gdscript
# 反面写法:每加一个状态,就要补一份动画 if/else
func _physics_process(_delta: float) -> void:
    if is_on_floor():
        if absf(velocity.x) > 0.1:
            sprite.play("run")
        else:
            sprite.play("idle")
    else:
        if velocity.y < 0.0:
            sprite.play("jump_up")
        else:
            sprite.play("jump_fall")
```

这段代码看着没问题,但只要再加一个 `dash`、一个 `wall_slide`、一个 `attack`,分支会爆炸——更糟的是,**`sprite.play("run")` 每物理 tick 都被调用一次**,Godot 内部会做相同动画的 no-op 优化,但一旦你切到 `AnimationTree.travel(...)`,这种"每帧调用"会反复触发过渡判定,出现动画卡在第 0 帧的现象。

第二条是**把游戏逻辑写进动画的 Call Method Track**:命中判定、扣血、生成子弹全都通过动画事件回调出去。短期看很优雅,长期看会让代码完全跟动画时间表绑死——你想把攻击改快 20%,要回头改十个动画里的事件时间戳。

正确的做法是:**状态机是逻辑的事,动画跟随状态。** 状态机决定"现在该播什么",动画系统决定"怎么播、播完了告诉你"。

### 1.3 三个工具的真实分工

| 工具 | 处理什么 | 不处理什么 | 适合状态数 |
| --- | --- | --- | --- |
| `AnimatedSprite2D` + `SpriteFrames` | 纯 sprite 帧动画 | 多轨同步、过渡、混合 | 1-3 |
| `AnimationPlayer` + 自写 FSM | 任意属性 keyframe、call method、音轨 | 自动过渡、混合树 | 2-5 |
| `AnimationTree` (StateMachine) | 节点图状态机、自动过渡、BlendSpace | 复杂游戏逻辑 | 5+ |

这张表是后面章节的总纲。先有这层认识,代码部分才不会"为了用而用 AnimationTree"。

### 1.4 状态机的归属问题

动画系统选型背后还有一个更深的问题:**状态机本身应该住在哪里?** 三个候选位置:

1. **写在角色脚本里**(`PlayerFsm` 子节点),状态枚举 + 字典映射动画名,自己处理过渡条件。
2. **写在 `AnimationTree.StateMachine` 里**,过渡条件做成 bool 参数,代码只写参数更新。
3. **混合**:大状态用脚本控制(idle、combat、stunned、dead),每个大状态内部的小状态(idle 子状态里的呼吸 / 看四周)用 `AnimationTree`。

新手往往会选 1,因为脚本看着踏实;然后在角色复杂化时被迫迁移到 2,踩一堆"travel 没生效"的坑。本系列的推荐:**项目初期、角色不超过 5 状态时,用 1**;美术接入完整动画集、需要 idle/run 平滑混合时,**直接跳到 3**——也就是脚本里管大状态、AnimationTree 里管 visual blending。

为什么不是纯 2?因为一旦把游戏逻辑(攻击是否能取消、死亡前置条件)塞进 StateMachine 的 Expression 里,你就把代码逻辑撕成了脚本一半、图形界面一半两份,版本控制审阅、单元测试都会变难。脚本是文本,容易 diff;StateMachine 是 `.tres`,序列化后看不出含义。**让逻辑住在代码,让混合住在图里,这是 4.x 工程化的主旋律。**

## 2. Godot 心智

### 2.1 `AnimatedSprite2D` 的边界

`AnimatedSprite2D` 持有一个 `SpriteFrames` 资源,里面是若干命名动画(`idle`、`run`、`jump`),每个动画是一个 frame 列表。它的好处是**所见即所得**:在编辑器底部 SpriteFrames 面板拖拽帧、设速度,立刻能预览。它的缺点是:

- 不支持非 sprite 属性的关键帧。想让攻击动画里 `Hitbox.disabled` 在第 7 帧变 false,做不到。
- 不支持过渡混合(crossfade)。从一个动画切到另一个会有"啪"的瞬切。
- 没有时间轴概念。动画事件只能挂在"动画播完"(`animation_finished` 信号)。

适用场景:**装饰元素**(篝火、瀑布、闪烁宝箱)、**敌人简单循环**(三状态以内)、**项目原型期**(美术还没接入骨骼)。

### 2.2 `AnimationPlayer` 的真正能力

`AnimationPlayer` 操作 `Animation` 资源。一个 Animation 包含多条 Track,每条 Track 操作一个节点的某个属性,例如:

| Track 类型 | 用途示例 |
| --- | --- |
| Property Track | `Sprite2D:frame`、`Hitbox/CollisionShape2D:disabled` |
| Method Call Track | `Player:on_attack_start_hitbox()` |
| Audio Track | 攻击挥砍音、脚步声 |
| Animation Track | 套娃,播放其它 AnimationPlayer |
| Bezier Track | 自定义曲线插值 |

Godot 4.x 把动画组织成 `AnimationLibrary`,一个 `AnimationPlayer` 可以挂多个 library。常见组织方式是按角色拆库:`player.tres`、`enemy_slime.tres`,运行时通过 `add_animation_library` 切换,适合多角色共用同一套播放器架构(第 17 篇组件化时会展开)。

`AnimationPlayer.play(name)` 的一个关键细节是**它不会立即生效**——动画在下一次 `_process` 或 `_physics_process`(取决于 `callback_mode_process`)时才推进。如果在同一帧里 `play("attack")` 然后立刻读 `Hitbox.disabled`,读到的是上一动画的状态。要"立即生效"必须 `play("attack"); advance(0.0)`。这是手感对齐时的高频踩坑点。

### 2.3 `AnimationTree` 与状态机

`AnimationTree` 是另一种心智:你不再"播 / 停 / 切",而是在 inspector 里搭一张 **AnimationNode 图**,然后只通过参数路径告诉它当前状态。常见 root 节点:

- `AnimationNodeAnimation`:最简单,播一个固定动画。
- `AnimationNodeBlendTree`:多个 Blend2/Blend3 节点的图,适合 BlendSpace + OneShot 混合。
- `AnimationNodeStateMachine`:节点图里的状态机,每个状态是一个动画(或子图),状态之间通过 Transition 连接。
- `AnimationNodeStateMachinePlayback`:控制 StateMachine 的运行时对象,通过 `tree.get("parameters/playback")` 拿到,调用 `travel("state_name")`。

4.x 重要变化:**所有动态控制都通过 `tree.set("parameters/...", value)` 和 `tree.get("parameters/...")` 字符串路径完成**,没有强类型 getter/setter。这个设计让节点图能被 inspector 通用化呈现,代价是代码里要写一堆字符串路径——通常解法是把路径定义为 `const` 常量。

### 2.4 动画与物理的回调对齐

`AnimationPlayer.callback_mode_process` 和 `AnimationTree.callback_mode_process` 都有三个值:`IDLE`(默认,`_process`)、`PHYSICS`(`_physics_process`)、`MANUAL`(脚本自己调 `advance`)。

| 设为 | 适用 | 注意 |
| --- | --- | --- |
| `IDLE` | 装饰元素、UI 动画 | 高帧率下动画比物理更顺滑,但与物理事件可能错位 |
| `PHYSICS` | 角色、敌人、攻击 | 与 hitbox、状态机严格同步;低帧率下动画掉帧明显 |
| `MANUAL` | 子弹时间、回放 | 完全脚本控制,适合做特殊节奏效果 |

**角色相关的 AnimationPlayer / AnimationTree 都应当切到 `PHYSICS`。** 这一条几乎是默认推荐,但 Godot 默认值是 `IDLE`,新建场景必须手动改。

## 3. 工程实现

### 3.1 简单角色:AnimationPlayer + 自写 FSM

先看一个"够用就好"的方案。三个状态:`idle`、`run`、`jump`。状态切换是显式的,动画跟随状态。

路径 `res://player/player_fsm.gd`(在第 07 篇的 `Player` 节点上以子节点 `Fsm` 形式挂载),配套 `res://player/anim/player.tres` AnimationLibrary。

```gdscript
class_name PlayerFsm
extends Node
## 简易状态机:状态名即动画名,enter/exit 钩子可注入逻辑。
## 状态总数 <= 5 时,这种写法比 AnimationTree 更短小。

enum State { IDLE, RUN, JUMP, FALL, ATTACK }

const STATE_TO_ANIM: Dictionary = {
    State.IDLE: "idle",
    State.RUN: "run",
    State.JUMP: "jump_up",
    State.FALL: "jump_fall",
    State.ATTACK: "attack_1",
}

@export var anim_player_path: NodePath
@onready var _anim: AnimationPlayer = get_node(anim_player_path)

var _state: State = State.IDLE
var _state_locked_until_finished: bool = false

signal state_changed(from: State, to: State)

func _ready() -> void:
    _anim.animation_finished.connect(_on_anim_finished)
    _anim.callback_mode_process = AnimationPlayer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS

func _on_anim_finished(_anim_name: StringName) -> void:
    _state_locked_until_finished = false

func request(next: State) -> bool:
    if _state == next:
        return false
    if _state_locked_until_finished:
        return false
    _enter(next)
    return true

func force(next: State, lock: bool = false) -> void:
    _enter(next)
    _state_locked_until_finished = lock

func _enter(next: State) -> void:
    var prev := _state
    _state = next
    _anim.play(STATE_TO_ANIM[next])
    state_changed.emit(prev, next)

func current() -> State:
    return _state

func is_busy() -> bool:
    return _state_locked_until_finished
```

设计要点:

- **状态枚举 + 字典映射**:不直接用字符串做状态名,避免拼写错误,IDE 能补全。
- **`_state_locked_until_finished`**:攻击、起跳等"不可打断"的动作,设置后等动画播完才解锁。`force` 提供绕过锁的紧急通道(死亡、击退)。
- **`callback_mode_process = PHYSICS`**:在 `_ready` 里显式切到物理回调,跟手感对齐。
- **`request` 而非 `set_state`**:返回 bool 表示是否真切到位,让调用方知道意图被吃掉。

Player 端的调用变得很短。在 `Player._physics_process` 末尾添加:

```gdscript
if _freeze_timer > 0.0 or _fsm.is_busy():
    return

if _buffer.consume_attack():
    _fsm.force(PlayerFsm.State.ATTACK, true)
elif not is_on_floor():
    _fsm.request(PlayerFsm.State.JUMP if velocity.y < 0.0 else PlayerFsm.State.FALL)
elif absf(velocity.x) > 10.0:
    _fsm.request(PlayerFsm.State.RUN)
else:
    _fsm.request(PlayerFsm.State.IDLE)
```

七行代码概括了角色的全部视觉状态切换。这就是"动画跟随状态"的实际形态:**状态由物理与输入决定,动画名只是状态的标签。**

### 3.2 复杂角色:AnimationTree StateMachine 最小示例

当角色状态达到 6 个以上,或者出现"idle ↔ run 之间要有 0.15 秒混合"、"攻击轻 → 重 → 终结技存在窗口期 combo"这类需求,就该上 `AnimationTree`。

场景结构:

```text
Player (CharacterBody2D)
  Sprite2D
  AnimationPlayer        # 仍由它持有 Animation 资源
  AnimationTree          # root = AnimationNodeStateMachine
  CollisionShape2D
```

`AnimationTree.anim_player` 指向上面的 `AnimationPlayer`。在 Inspector 里把 `tree_root` 设为 `New AnimationNodeStateMachine`,然后双击进入图编辑模式,放下 5 个 AnimationNodeAnimation 状态:`idle`、`run`、`jump`、`fall`、`attack`,每个 `animation` 字段指向对应的动画名。连线:

- `idle ↔ run`:双向,`Auto Advance` + 0.12 秒 xfade
- `idle/run → jump`:单向,即时切换(xfade=0)
- `jump → fall`:`Auto Advance`,条件是 `velocity_y >= 0`
- `fall → idle`:`Auto Advance`,条件是 `on_floor`
- 任意 → `attack`:由代码 `travel` 触发,xfade=0.05
- `attack → idle`:`Auto Advance` + 等动画播完(`Switch On = AtEnd`)

代码路径 `res://player/player_anim_controller.gd`:

```gdscript
class_name PlayerAnimController
extends Node
## 桥接物理状态与 AnimationTree 状态机。
## 所有 parameters 路径集中在 const 常量,便于改名时全局替换。

const PATH_PLAYBACK := "parameters/playback"
const PATH_ON_FLOOR := "parameters/conditions/on_floor"
const PATH_VY_DOWN := "parameters/conditions/vy_down"

@export var tree_path: NodePath
@export var body_path: NodePath

@onready var _tree: AnimationTree = get_node(tree_path)
@onready var _body: CharacterBody2D = get_node(body_path)
var _playback: AnimationNodeStateMachinePlayback

func _ready() -> void:
    _tree.active = true
    _tree.callback_mode_process = AnimationTree.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS
    _playback = _tree.get(PATH_PLAYBACK)

func _physics_process(_delta: float) -> void:
    _tree.set(PATH_ON_FLOOR, _body.is_on_floor())
    _tree.set(PATH_VY_DOWN, _body.velocity.y >= 0.0)
    var dir := _body.velocity.x
    var moving := absf(dir) > 10.0
    if _body.is_on_floor():
        if moving and _playback.get_current_node() in [&"idle", &""]:
            _playback.travel(&"run")
        elif not moving and _playback.get_current_node() == &"run":
            _playback.travel(&"idle")
    if dir != 0.0:
        _tree.set("parameters/run/blend_position", signf(dir))

func trigger_jump() -> void:
    _playback.travel(&"jump")

func trigger_attack() -> void:
    _playback.travel(&"attack")

func is_in_attack() -> bool:
    return _playback.get_current_node() == &"attack"
```

设计要点:

- **`_tree.active = true`**:AnimationTree 默认不激活,需要显式开启,否则 inspector 里搭好的图不会跑。
- **路径常量**:`"parameters/playback"` 这种字符串散落各处会让重命名痛苦。集中到 const,IDE 重构友好。
- **条件参数**:`on_floor`、`vy_down` 是 bool 类型条件,在 StateMachine 的 Transition 里勾选 `Advance Mode = Auto`,引用同名 condition。代码只负责更新条件值,过渡自动触发。
- **`travel` 与"路径搜索"**:`travel("attack")` 会在状态图里搜出从当前状态到 attack 的最短路径,逐步走过去——这是 StateMachine 比手写 FSM 更省心的地方。如果 idle→attack 直接相连就直跳,如果中间夹着 prepare,会自动经过 prepare。
- **混合方向**:`parameters/run/blend_position` 是个例子,展示如何在 run 状态里嵌入 BlendSpace1D 控制朝左 / 朝右的不同动画(配上对应的 sprite flip)。

### 3.3 选型决策的一行总结

如果你只能记一句话:

**"`AnimatedSprite2D` 给装饰物;`AnimationPlayer` + 自写 FSM 给 5 状态以内的角色;`AnimationTree` StateMachine 给带过渡 / 混合 / Combo 的角色。"**

不要中途切换。这一篇的方案是项目内决策,不是不可逆的工程债。从 AnimationPlayer 升级到 AnimationTree,只要 Animation 资源不动,搭一张图就行,旧的播放代码可以一并删掉。

### 3.4 动画事件的正确接法

回到 §1.2 的反面写法——"把游戏逻辑写进 Call Method Track"。这并不是说 Call Method Track 不能用,而是说**它只用来通知,不用来决策**。下面这种用法是健康的:

```gdscript
# 在 attack_1 动画的第 7 帧上挂 Call Method:_emit_hit_window_open()
func _emit_hit_window_open() -> void:
    hit_window_opened.emit()

# 在 attack_1 动画的第 11 帧上挂 _emit_hit_window_close()
func _emit_hit_window_close() -> void:
    hit_window_closed.emit()
```

战斗系统订阅这两个信号,自行决定何时开 hitbox、扣血。动画只是"告知节奏",决策权留在战斗代码里。第 09 篇会把 hitbox 接到这一对信号上,验证这层解耦的回报。

### 3.5 动画 → 战斗的完整桥接示例

把 §3.1 的 `PlayerFsm`、§3.4 的动画信号、以及攻击 hitbox 三者拧到一起,形成"按下 attack → 动画播放 → 动画事件 → hitbox 启用 → 命中判定"的链。下面这段挂在 `Player` 节点上,作为战斗组件的最小骨架。

路径 `res://player/player_combat.gd`:

```gdscript
class_name PlayerCombat
extends Node
## 监听 AnimationPlayer 的 Call Method,决定何时启用 hitbox。
## hitbox 自身的 layer/mask 配置在第 09 篇展开。

@export var anim_player_path: NodePath
@export var hitbox_path: NodePath
@export var fsm_path: NodePath

@onready var _anim: AnimationPlayer = get_node(anim_player_path)
@onready var _hitbox: Area2D = get_node(hitbox_path)
@onready var _fsm: PlayerFsm = get_node(fsm_path)

signal attack_hit(target: Node2D)

func _ready() -> void:
    _hitbox.monitoring = false
    _hitbox.body_entered.connect(_on_hitbox_body_entered)
    _hitbox.area_entered.connect(_on_hitbox_area_entered)

# 由 AnimationPlayer 的 Call Method Track 在攻击动画第 7 帧触发
func on_attack_window_open() -> void:
    _hitbox.monitoring = true

# 由 AnimationPlayer 的 Call Method Track 在第 11 帧触发
func on_attack_window_close() -> void:
    _hitbox.monitoring = false

func _on_hitbox_body_entered(body: Node2D) -> void:
    if body == owner:
        return
    attack_hit.emit(body)

func _on_hitbox_area_entered(area: Area2D) -> void:
    if area.get_parent() == owner:
        return
    attack_hit.emit(area.get_parent())
```

整条链的工程价值在于:**调一次攻击节奏(让命中窗口提前 2 帧),只需要在 Animation 面板里拖动那条 Call Method Track 的时间戳**,代码不动、战斗参数不动、状态机不动。这是"动画跟随状态"模式的回报——决策与表现解耦后,迭代成本指数级下降。

要把攻击节奏改快一倍?在 Animation 面板拉缩 length,Call Method Track 时间戳保持百分比不变(选中 keyframe 用 Stretch Selection),整个流程跟着拉缩。状态机和战斗代码完全不知道这件事发生过。

## 4. 调参和验收

### 4.1 影响手感的动画参数

| 参数 | 位置 | 典型值 | 影响 |
| --- | --- | --- | --- |
| Transition xfade | StateMachine 边 | 0.05-0.15 s | idle ↔ run 流畅度;过长有滞涩感 |
| Auto Advance 条件 | StateMachine 边 | bool / Expression | 状态自动流转的触发 |
| `Switch On = AtEnd` | StateMachine 边 | - | 等动画播完才过渡 |
| `Reset` 节点 | BlendTree | - | RESET 动画用于过渡基线,通常需要 |
| `callback_mode_process` | AnimationPlayer / Tree | PHYSICS | 与物理同步 |
| Animation `step` | AnimationLibrary | 0.0333 / 0 | 0 表示连续插值;0.0333 对齐 30 fps 帧画风 |

像素风游戏要让动画"踩在像素格上",会显式把 `step` 设为帧间隔(如 `1/12 = 0.0833`),避免帧之间的亚像素抖动。这一项默认是 `1/30`,意味着动画以 30 fps 步进,与渲染帧率无关。

### 4.2 验证状态机的正确性

调好 StateMachine 后,以下几条用来验证:

- 角色 idle 时按下移动键,应在 0.1-0.15 秒内平滑过渡到 run,而不是瞬切。
- 起跳时立即切到 jump 动画,不留过渡(即时反馈)。
- 跳起后,垂直速度由负变正的那一瞬间应过渡到 fall(由 `vy_down` 条件驱动)。
- 在空中按下攻击,过渡到 attack 应是即时的;attack 播完后,根据 `on_floor` 自动回到 idle 或 fall。
- 反复在 idle / run 之间快速切换,xfade 不应出现"播一半切回去"的卡帧;若出现,把 xfade 调短或检查条件更新频率。

### 4.3 调试技巧:开 AnimationTree 的 Travel Path 显示

编辑器里选中 `AnimationTree`,顶部"Save"旁有一个 `Filter` 按钮,运行时可以看到当前激活的状态高亮、travel 路径连线。这是排查"为什么没切过去"最直接的工具。代码里也可以 `print(_playback.get_travel_path())` 打印实际经过的状态序列。

### 4.4 帧步进与子像素

像素风游戏的角色 sprite 在动画过渡时,可能因为 xfade 时间内的位置插值落到非整数像素上,出现"半个像素的歪斜"。两种修法:

- **关闭过渡(xfade = 0)**:像素风通常本来就不需要 crossfade。
- **保留过渡但在 sprite 父节点上启用 snap**:`Sprite2D` 自身没有 snap,通常做法是把 sprite 挂在一个 `Node2D` 下,Player 主体移动,sprite `position` 用 `roundi` 取整。这一策略第 02 篇像素级配置里已有铺垫。

### 4.5 资源管理:动画拆库的时机

`AnimationPlayer` 默认只有一个全局 library `""`,所有动画名直接放进去。项目里角色动画超过 20 个、出现命名冲突("idle" 既是 player 又是 enemy)、或要做"换皮"功能(同一套行为不同视觉)时,改成多 library:

```gdscript
var lib_a := load("res://anim/player_base.tres") as AnimationLibrary
_anim.add_animation_library("base", lib_a)
_anim.play("base/idle")  # 引用时加 library 前缀
```

切换角色时只要换 library,播放器代码不动。这一模式在第 17 篇组件化时会被反复用到,本篇只做提及。

## 5. 踩坑

### 5.1 `parameters/...` 路径写错时没报错

`AnimationTree.set("parameters/playbackk", value)`(打错字)在 Godot 4.6 里不会抛异常,只会安静地什么都不做。这是 `set` 通过反射机制存进字典的副作用——找不到的路径被当作"自定义属性"存下。排查方法:在脚本里把路径写成 `const`,改一处全跟着改;或用 `tree.get(path) == null` 验证路径有效性。

`get_animation_node_state` 这类 API 在 Inspector 节点图里能看见结构,但代码里访问得用字符串拼接。建议在角色状态机模块顶部统一定义:

```gdscript
const STATE_IDLE := &"idle"
const STATE_RUN := &"run"
const STATE_JUMP := &"jump"
const STATE_FALL := &"fall"
const STATE_ATTACK := &"attack"
```

使用 `StringName`(`&"idle"`)而不是 `String`,在 Godot 内部比对时不走字符串哈希,速度快、不分配堆内存。

### 5.2 AnimationTree 默认未激活

新建场景挂上 `AnimationTree` 后,inspector 里 `active` 默认是 `false`,运行时不会推进。脚本必须 `_tree.active = true` 才能跑起来。这一项 4.x 没有改默认值,理由是"配好图再激活"。代价是新手非常容易困惑——图搭好了为什么没动。

### 5.3 `AnimatedSprite2D` 与 `AnimationPlayer` 并存

同一个 `Sprite2D` 不可能既被 `AnimatedSprite2D` 控制(因为 `AnimatedSprite2D` 自己就是 sprite),又被 `AnimationPlayer` 的 Property Track 控制。但**两个节点**(一个 `AnimatedSprite2D` 用来播角色帧动画,一个 `AnimationPlayer` 用来挂 hitbox / call method / 音轨)可以共存,彼此通过状态机协调。常见结构:

```text
Player
  AnimatedSprite2D     # 播 sprite 帧
  AnimationPlayer      # 管 hitbox/CollisionShape2D.disabled 等
```

让状态机同时调 `sprite.play("attack_1")` 与 `anim.play("attack_1_meta")`。AnimationPlayer 的 Animation 资源里**不放 sprite track**,只放属性 / call method / audio track。两边的动画名要严格一致,否则对不上节奏。

### 5.4 `attack` 播完不回 idle

最常见的 StateMachine 配置错误。两个原因:

1. **Switch On 没设 AtEnd**:Transition 默认 `Switch On = Immediate`,意味着条件满足就立刻过渡,不等当前动画播完。攻击动画的 `attack → idle` 边必须改成 `AtEnd`。
2. **Auto Advance 关闭**:`Switch On = AtEnd` 还需要勾上 `Advance Mode = Auto`,否则要代码主动 `travel("idle")`。

第二种情况其实没错,只是设计选择不同。生产中常见的写法是"play 完一个 attack,等代码主动决定下一步是 idle 还是连击 attack_2"。

### 5.5 `_process` vs `_physics_process` 错位

`AnimationPlayer.callback_mode_process = IDLE`(默认)时,动画在 `_process` 里推进;角色物理在 `_physics_process` 里。如果攻击动画第 7 帧通过 Call Method 调用 `_start_hitbox()`,而 hitbox 的位置由角色 velocity 决定——那么 hitbox 可能比角色"早一帧"出现在错误位置,玩家能看到"剑还没挥到那儿,已经判定命中"。把 `callback_mode_process` 切到 `PHYSICS` 解决,代价是高刷新率显示器看不到 60 fps 之外的动画插值。两害相权,角色相关动画几乎总是该选 `PHYSICS`。

### 5.6 RESET 动画的意义

`AnimationPlayer` 推荐每个项目都有一个名为 `RESET` 的动画——所有可能被动画修改的属性都在 RESET 里写一个 keyframe,值是"默认状态"。当 inspector 里选 sprite 时,编辑器会播 RESET 来恢复默认外观,而不是停留在上一次预览的某一帧。运行时也会作为某些过渡的基线。新手忽略 RESET 后,会在编辑器里看到角色"半截攻击姿势 / hitbox 还开着"等怪异状态。

### 5.7 `travel` 与 `start` 的区别

`AnimationNodeStateMachinePlayback.travel(name)` 走最短路径过渡过去;`start(name)` 直接跳到目标状态,忽略中间过渡。日常用 `travel`,需要"强制重启动画"(如多次连击 attack_1)时用 `start`,否则 travel 发现"已经在 attack_1"会被忽略。

### 5.8 `AnimationPlayer` 内嵌动画 vs 外部 `.tres`

新建动画时,默认存为 AnimationPlayer 节点的内嵌资源,不写到 `.tres`。这会让动画跟随场景文件走,小项目很方便。但只要动画想在多个场景复用、或团队中两人同时编辑同一个场景文件,就会产生 merge 冲突。

切换方法:Animation 面板里点动画名旁的下拉,选"Save As..."拆成 `.tres`。这一操作的副作用是后续删 / 改动画都要保存外部文件,工作流变长。建议项目稳定后再拆,原型阶段保持内嵌。

### 5.9 `play("name")` 与 `animation` 属性

设置 `sprite.animation = "run"` 不会播放,只会设定"下次 play 时播什么";`sprite.play("run")` 既设属性又开始播放。直接 `sprite.play()`(空参)会从当前 animation 重新开始。多个 sprite 状态混在一起切换时,这一点经常被混淆。

### 5.10 `Animation.length` 与 `step` 的关系

`Animation.length` 是动画总时长,`step` 是步进间隔。设 `step = 0.0833`(12 fps)的动画,如果 length 不是 step 的整数倍,最后一帧会被截断。修法是把 length 设为 `step * frame_count` 而不是手动估值。

---

## 手动验证

- [ ] `AnimationPlayer` 的 `callback_mode_process` 已设为 `PHYSICS`(角色相关),`AnimationTree.active = true` 且 `callback_mode_process = PHYSICS`。
- [ ] 角色 idle 时按下移动键,在 0.1-0.15 秒内平滑过渡到 run 动画(可通过 inspector 顶部 Filter 按钮观察状态高亮)。
- [ ] 起跳瞬间立即切到 jump 动画(无 xfade);垂直速度由负转正时自动过渡到 fall。
- [ ] 攻击动画完整播完后,角色回到 idle 或 fall(取决于落地状态),期间不响应跳跃 / 攻击的 buffer 消费。
- [ ] AnimationPlayer 的 attack 动画里挂着 `hit_window_open` / `hit_window_close` 两个 Call Method,信号被战斗系统接收(第 09 篇验证落地)。
- [ ] 在编辑器底部 Animation 面板存在 `RESET` 动画,所有 sprite / hitbox / collision 属性都有一条默认 keyframe;切换场景或重启编辑器后角色外观正常。