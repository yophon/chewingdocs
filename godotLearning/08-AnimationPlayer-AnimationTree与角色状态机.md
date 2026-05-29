# AnimationPlayer、AnimationTree 与角色状态机

角色能动以后,下一步是让它看起来像一个角色。这里最容易犯的错是把动画和逻辑搅在一起:速度判断里播动画,动画事件里扣血,攻击动画没播完又被移动打断。

> 一句话先记住:**状态机决定角色在做什么,动画只负责把这个状态演出来。**

---

## 一、三个动画工具怎么选

Godot 2D 常见三件套:

```text
AnimatedSprite2D   播帧动画
AnimationPlayer    播属性时间轴
AnimationTree      管动画混合和动画状态图
```

简单选法:

```text
装饰物、火把、水流: AnimatedSprite2D
小角色、敌人、原型期: AnimationPlayer + 脚本状态机
主角、复杂 boss、需要混合: AnimationTree + 脚本大状态
```

不要为了“高级”上来就用 `AnimationTree`。如果角色只有 idle、run、jump、attack 四个状态,`AnimationPlayer` 加一个小状态机更清楚。

---

## 二、别每帧硬播动画

反例:

```gdscript
func _physics_process(_delta: float) -> void:
    if is_on_floor():
        if absf(velocity.x) > 10.0:
            $AnimationPlayer.play("run")
        else:
            $AnimationPlayer.play("idle")
    else:
        $AnimationPlayer.play("jump")
```

这段短期能跑,但问题很快出现:

- 每帧都在请求播放同一个动画。
- 加 attack、dash、hurt 后分支爆炸。
- 攻击动画很容易被 run/idle 立刻打断。
- 动画名全是字符串,拼错不容易发现。

更好的做法是把状态切换集中到一个小节点里。

---

## 三、一个够用的脚本状态机

场景结构:

```text
Player (CharacterBody2D)
├── %Sprite (Sprite2D)
├── %AnimationPlayer (AnimationPlayer)
└── %Fsm (PlayerFsm)
```

状态机脚本:

```gdscript
# res://player/player_fsm.gd
class_name PlayerFsm
extends Node

enum State { IDLE, RUN, JUMP, FALL, ATTACK, HURT, DEAD }

const ANIMATIONS := {
    State.IDLE: &"idle",
    State.RUN: &"run",
    State.JUMP: &"jump_up",
    State.FALL: &"jump_fall",
    State.ATTACK: &"attack",
    State.HURT: &"hurt",
    State.DEAD: &"dead",
}

signal state_changed(from: State, to: State)

@export var animation_player: AnimationPlayer

var _state: State = State.IDLE
var _locked: bool = false

func _ready() -> void:
    assert(animation_player != null, "animation_player must be assigned")
    animation_player.animation_finished.connect(_on_animation_finished)
    animation_player.callback_mode_process = AnimationPlayer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS
    _play(State.IDLE)

func request(next: State) -> bool:
    if _locked or _state == next:
        return false
    _play(next)
    return true

func force(next: State, lock_until_finished: bool = false) -> void:
    _locked = lock_until_finished
    _play(next)

func is_locked() -> bool:
    return _locked

func current() -> State:
    return _state

func _play(next: State) -> void:
    var prev := _state
    _state = next
    animation_player.play(ANIMATIONS[next])
    state_changed.emit(prev, next)

func _on_animation_finished(_name: StringName) -> void:
    _locked = false
```

攻击、受伤、死亡这种不可随便打断的状态,用 `force(..., true)`。

---

## 四、玩家脚本只请求状态

玩家的物理代码最后加一段:

```gdscript
@onready var _fsm: PlayerFsm = %Fsm

func _update_animation_state() -> void:
    if _fsm.is_locked():
        return

    if not is_on_floor():
        if velocity.y < 0.0:
            _fsm.request(PlayerFsm.State.JUMP)
        else:
            _fsm.request(PlayerFsm.State.FALL)
    elif absf(velocity.x) > 10.0:
        _fsm.request(PlayerFsm.State.RUN)
    else:
        _fsm.request(PlayerFsm.State.IDLE)

func attack() -> void:
    if _fsm.is_locked():
        return
    _fsm.force(PlayerFsm.State.ATTACK, true)
```

关键点:玩家逻辑只说“我要进入 ATTACK”。至于 ATTACK 播哪条动画、播完怎么解锁,交给状态机。

---

## 五、AnimationPlayer 适合做时间轴

`AnimationPlayer` 不只能改 sprite 帧,还可以在一条动画里控制多个东西:

```text
Sprite2D.frame
Hitbox.monitoring
CollisionShape2D.disabled
AudioStreamPlayer2D.playing
Camera shake 方法调用
```

比如攻击动画:

```text
0.00s  播 attack 第 1 帧
0.08s  Hitbox.monitoring = true
0.14s  Hitbox.monitoring = false
0.28s  动画结束
```

这样命中窗口跟动画严格对齐。

注意边界:不要把“扣血逻辑”塞进动画。动画可以打开 hitbox,但真正命中谁、扣多少血,应该由 hitbox/hurtbox 系统处理。

---

## 六、什么时候上 AnimationTree

当你出现这些需求,再上 `AnimationTree`:

- idle 到 run 想平滑过渡。
- 八方向移动需要 BlendSpace。
- 攻击连段有多个动画节点和过渡。
- 角色状态超过 6 个,手写切换开始混乱。

最小用法:

```gdscript
@onready var _tree: AnimationTree = %AnimationTree
@onready var _playback: AnimationNodeStateMachinePlayback = _tree.get("parameters/playback")

func _ready() -> void:
    _tree.active = true
    _tree.callback_mode_process = AnimationTree.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS

func travel(name: StringName) -> void:
    _playback.travel(name)
```

建议仍然让逻辑住在脚本里。`AnimationTree` 管“怎么混合”,不要让它决定“能不能攻击、能不能受伤、死亡后能不能移动”。

---

## 七、动画事件怎么用

可以用:

- 开关 hitbox。
- 播音效。
- 生成脚步灰尘。
- 通知“攻击可取消窗口开始”。

不要用:

- 直接扣敌人血。
- 直接切换关卡。
- 直接改存档。
- 写复杂战斗规则。

判断标准:动画事件应该只处理“和这段动画时间点强相关”的事。

---

## 八、验收

- 玩家脚本里没有一大坨 `if/else play("xxx")`。
- 攻击动画不会被 idle/run 每帧打断。
- `AnimationPlayer` 的 callback mode 对齐到 physics。
- 动画名集中在状态机里,不是到处散落字符串。
- hitbox 开关可以由动画时间轴控制。
- 扣血逻辑不写在动画时间轴里。

---

## 常见坑

**坑 1:每帧 `play("run")`。**

要在状态变化时播,不是每帧播。

**坑 2:攻击动画没有锁。**

没有锁,下一帧移动判断就会把攻击切回 idle。

**坑 3:AnimationTree 里写太多逻辑。**

图形状态机很难 diff 和审查。复杂规则放脚本,动画图只管视觉过渡。

**坑 4:动画和物理回调不同步。**

角色动画建议用 physics callback,否则 hitbox 开关可能和物理碰撞差一帧。

---

下一篇讲 Collision Layer / Mask。动画能打开 hitbox 了,还要确保它只打到该打的人。
