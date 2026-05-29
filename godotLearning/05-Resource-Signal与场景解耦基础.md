# Resource、Signal 与场景解耦基础

前几篇已经把项目骨架、节点生命周期、GDScript 写法讲清楚了。现在会遇到一个更现实的问题:节点越来越多以后,谁去找谁?数据放哪?UI 怎么知道玩家掉血了?

很多 Godot 项目不是死在功能做不出来,而是死在这种代码里:

```gdscript
func take_damage(amount: int) -> void:
    hp -= amount
    get_node("/root/Main/HUD/HPBar").value = hp
    get_parent().get_node("Camera").shake()
```

这段代码短期能跑,长期很难维护。玩家脚本知道 HUD 在哪里,知道 Camera 在哪里,还知道它们内部节点叫什么。只要你改一下场景结构,血条、镜头、玩家逻辑就一起断。

> 一句话先记住:**Resource 管数据,Signal 管通知,节点少互相找。**

`Resource` 解决“这类东西的参数放哪”;`Signal` 解决“发生了某件事怎么告诉别人”;`@export` 和 `%UniqueName` 解决“引用从哪里来”。把这四个东西用顺,场景树才不会变成一张乱网。

---

## 一、先看坏味道

假设你做了一个玩家:

```gdscript
class_name Player
extends CharacterBody2D

var max_hp: int = 100
var hp: int = 100
var attack: int = 10
var move_speed: float = 220.0

func take_damage(amount: int) -> void:
    hp = max(hp - amount, 0)
    get_node("/root/Game/HUD/HPBar").value = hp
    get_node("/root/Game/HUD/HPText").text = "%d / %d" % [hp, max_hp]

    if hp == 0:
        get_node("/root/Game").restart_level()
```

它有三个问题。

第一,数据写死在脚本里。想做普通玩家、强化玩家、测试用无敌玩家,你只能改代码,或者复制脚本。

第二,玩家直接改 HUD。玩家场景拿去另一个关卡,只要外层节点不是 `/root/Game/HUD`,代码就断。

第三,玩家还知道“死亡后由 Game 重开关卡”。这不是玩家该知道的事。玩家只应该说“我死了”,至于重开、结算、播放动画,应该让关卡或流程管理器决定。

更好的方向是:

```text
PlayerStats 记录血量、攻击力、速度
Player 修改 PlayerStats
PlayerStats 发出 hp_changed / died 信号
HUD 监听 PlayerStats,自己刷新 UI
Game 监听 died,自己决定怎么处理死亡
```

玩家不再找 HUD。HUD 也不需要找玩家。两边都看同一份数据,听同一个通知。

---

## 二、Resource 是“可保存的数据对象”

`Resource` 不是节点,不会出现在场景树里。你可以把它理解成 Godot 里专门给编辑器、磁盘文件、Inspector 使用的数据对象。

贴图是 `Resource`,音频是 `Resource`,材质是 `Resource`,场景文件打包后也是 `PackedScene` 这种 `Resource`。我们自己也可以写资源类。

先写一份玩家参数:

```gdscript
# res://player/player_stats.gd
class_name PlayerStats
extends Resource

signal hp_changed(current: int, maximum: int)
signal died

@export var max_hp: int = 100:
    set(value):
        max_hp = maxi(value, 1)
        if hp > max_hp:
            hp = max_hp

@export var hp: int = 100:
    set(value):
        var next_hp := clampi(value, 0, max_hp)
        if next_hp == hp:
            return

        hp = next_hp
        hp_changed.emit(hp, max_hp)

        if hp == 0:
            died.emit()

@export var attack: int = 10
@export var move_speed: float = 220.0

func take_damage(amount: int) -> void:
    if amount <= 0:
        return
    hp -= amount
```

然后在 Godot 里右键目录:

```text
New Resource -> PlayerStats -> 保存为 res://player/player_default.tres
```

这个 `.tres` 文件就是一份可以被 Inspector 编辑、可以被 Git diff、可以拖给节点使用的数据。

以后你要做不同版本的玩家,不必复制脚本:

```text
player_default.tres      hp 100, speed 220
player_tank.tres         hp 200, speed 160
player_debug.tres        hp 9999, speed 320
```

代码只认 `PlayerStats`,具体数值交给资源文件。

---

## 三、Signal 是“我发生了什么”

信号不要理解成“远程调用函数”。它更像一句广播:

```text
我的血量变了
我死了
按钮被按了
动画播完了
敌人进入攻击范围了
```

发信号的一方不应该知道谁在听。

这就是好处。`PlayerStats` 只负责发:

```gdscript
hp_changed.emit(hp, max_hp)
died.emit()
```

HUD 可以听:

```gdscript
stats.hp_changed.connect(_on_hp_changed)
```

Game 也可以听:

```gdscript
stats.died.connect(_on_player_died)
```

以后你再加音效、震屏、成就系统,也只是多一个监听者。`PlayerStats` 不需要跟着改。

在 Godot 4 里,信号连接推荐这样写:

```gdscript
button.pressed.connect(_on_button_pressed)
stats.hp_changed.connect(_on_hp_changed)
stats.died.connect(_on_died)
```

看到旧教程里这种写法:

```gdscript
connect("died", self, "_on_died")
```

直接换掉。字符串方法名不利于检查和重构,也是很多旧 Godot 教程最容易误导人的地方。

---

## 四、玩家只关心自己的事

现在让玩家使用这份资源。

场景大概长这样:

```text
Player (CharacterBody2D)
├── %Sprite (Sprite2D)
├── %HitBox (Area2D)
└── %DebugLabel (Label)
```

`%Sprite` 里的 `%` 表示这个节点被设置为 Unique Name。它仍然在同一个场景里,但你不用再写长路径。

玩家脚本:

```gdscript
# res://player/player.gd
class_name Player
extends CharacterBody2D

@export var stats: PlayerStats

@onready var _sprite: Sprite2D = %Sprite
@onready var _hit_box: Area2D = %HitBox
@onready var _debug_label: Label = %DebugLabel

func _ready() -> void:
    assert(stats != null, "Player.stats must be assigned")

    stats.hp_changed.connect(_on_hp_changed)
    stats.died.connect(_on_died)
    _hit_box.body_entered.connect(_on_hit_box_entered)

    _refresh_debug_text()

func _on_hit_box_entered(body: Node) -> void:
    if body.is_in_group(&"enemy"):
        stats.take_damage(10)

func _on_hp_changed(_current: int, _maximum: int) -> void:
    _refresh_debug_text()
    _sprite.modulate = Color.RED

func _on_died() -> void:
    _debug_label.text = "DEAD"
    set_physics_process(false)

func _refresh_debug_text() -> void:
    _debug_label.text = "HP %d / %d" % [stats.hp, stats.max_hp]
```

这里有几个重点。

`stats` 是 `@export`,所以从 Inspector 拖 `.tres` 进来。玩家不自己 `load()` 固定路径,这样同一个玩家场景可以换不同配置。

`_sprite`、`_hit_box`、`_debug_label` 是场景内部节点,用 `%UniqueName` 缓存到 `@onready` 变量。以后你把 `HitBox` 挪到 `Body/HitBox`,只要还是同一个场景里的 unique 节点,脚本不用改。

玩家受伤以后,它只改 `stats`。血条、菜单、关卡流程不应该写在玩家脚本里。

---

## 五、HUD 不找玩家,只听数据

HUD 也拿同一份 `PlayerStats`:

```gdscript
# res://ui/hud.gd
class_name HUD
extends CanvasLayer

@export var stats: PlayerStats

@onready var _hp_bar: ProgressBar = %HPBar
@onready var _hp_text: Label = %HPText

func _ready() -> void:
    assert(stats != null, "HUD.stats must be assigned")

    stats.hp_changed.connect(_on_hp_changed)
    _refresh()

func _on_hp_changed(_current: int, _maximum: int) -> void:
    _refresh()

func _refresh() -> void:
    _hp_bar.max_value = stats.max_hp
    _hp_bar.value = stats.hp
    _hp_text.text = "%d / %d" % [stats.hp, stats.max_hp]
```

现在数据流很清楚:

```text
敌人碰到 Player
Player 调 stats.take_damage(10)
PlayerStats 修改 hp
PlayerStats 发 hp_changed
HUD 收到信号,刷新血条
Player 收到信号,刷新自身表现
```

这套结构最重要的好处不是“高级”,而是“改得动”。

你可以把 HUD 从 `Game/HUD` 挪到 `UIRoot/HUD`;可以把 Player 做成子场景;可以临时加一个 DebugPanel 也监听 `hp_changed`。只要都通过 `stats` 和信号沟通,大家不用互相知道路径。

---

## 六、跨场景引用用 @export,场景内引用用 %

Godot 里引用节点有很多写法,新手最容易混着用。先记这条简单规则:

> **同一个场景内部的固定子节点,用 `%UniqueName`;外部传进来的对象,用 `@export`。**

适合 `%UniqueName`:

```gdscript
@onready var _sprite: Sprite2D = %Sprite
@onready var _hp_bar: ProgressBar = %HPBar
@onready var _menu: Control = %PauseMenu
```

这些节点属于当前场景,脚本和它们一起保存。

适合 `@export`:

```gdscript
@export var stats: PlayerStats
@export var target: Node2D
@export var bullet_scene: PackedScene
@export var hit_sound: AudioStream
```

这些东西来自外部,应该由使用这个场景的人决定。

不推荐长期使用:

```gdscript
get_node("/root/Game/HUD/HPBar")
get_parent().get_parent().get_node("Player")
find_child("ScoreLabel")
```

不是说这些函数永远不能用,而是它们把代码绑在场景结构上。项目越大,这种绑定越贵。

---

## 七、Resource 默认会共享

这是 `Resource` 最容易踩的坑。

如果两个玩家实例都拖了同一个 `player_default.tres`,默认情况下它们拿到的是同一份资源。也就是说:

```text
1P 掉血
同一个 PlayerStats.hp 变了
2P 也会看到血量变了
```

这不是 bug,这是 `Resource` 的默认行为。因为很多资源本来就应该共享,例如贴图、音频、敌人基础配置。

判断方式很简单:

```text
这是模板配置吗? 共享没问题。
这是运行时状态吗? 小心共享。
```

适合共享:

```text
敌人基础血量
武器基础伤害
技能冷却时间
贴图、音效、字体
```

不适合共享:

```text
当前血量
当前蓝量
当前装备耐久
本局随机出来的掉落结果
```

如果一份资源要跟着场景实例复制,可以在 Inspector 里打开 **Local To Scene**。更明确的做法是在运行时复制:

```gdscript
func _ready() -> void:
    stats = stats.duplicate(true)
```

`true` 表示尽量做深拷贝。只写 `duplicate()` 是浅拷贝,嵌套的资源还可能共享。

实际项目里常见做法是分两层:

```text
PlayerConfig: 共享模板,记录 max_hp / speed / attack
PlayerState: 运行时状态,记录 current_hp / buffs / temporary_flags
```

前期可以先用一份 `PlayerStats` 跑通,但要知道共享这条边界。

---

## 八、信号连接放哪里

Godot 编辑器可以在 Node 面板里拖信号,自动生成回调。小 Demo 这样做很快,但项目变大后有两个问题:

```text
连接关系藏在 .tscn 里,代码审查时不容易看到
重命名函数或信号时,旧连接可能静悄悄断掉
```

建议:

```text
纯 UI、本场景内部、很简单的按钮事件:可以用编辑器连
跨场景、核心玩法、会被多人维护的连接:在 _ready() 里用代码连
```

例如:

```gdscript
func _ready() -> void:
    stats.hp_changed.connect(_on_hp_changed)
    stats.died.connect(_on_died)
    _start_button.pressed.connect(_on_start_button_pressed)
```

这样打开脚本就知道这个对象依赖什么事件。

有些信号只想听一次:

```gdscript
animation_player.animation_finished.connect(_on_intro_finished, CONNECT_ONE_SHOT)
```

有些回调里会改场景树,可以延迟到下一帧:

```gdscript
area.body_entered.connect(_on_body_entered, CONNECT_DEFERRED)
```

不用一开始就背所有 flag。先记住两个:一次性用 `CONNECT_ONE_SHOT`,回调里要删节点或加节点时考虑 `CONNECT_DEFERRED`。

---

## 九、换资源时要重连信号

还有一个真实项目里很常见的坑。

如果 `stats` 一开始指向 A:

```gdscript
stats.hp_changed.connect(_on_hp_changed)
```

后来你把 `stats` 换成 B,A 的连接还在,B 还没连接。于是你改 B 的血量,HUD 没反应。

需要支持运行时换资源时,给 `@export` 字段写 setter:

```gdscript
@export var stats: PlayerStats:
    set(value):
        if stats == value:
            return

        if stats != null and stats.hp_changed.is_connected(_on_hp_changed):
            stats.hp_changed.disconnect(_on_hp_changed)

        stats = value

        if stats != null:
            stats.hp_changed.connect(_on_hp_changed)

        if is_node_ready():
            _refresh()
```

`@export` 字段的 setter 可能在 `_ready()` 之前触发,所以刷新 UI、访问 `@onready` 节点时要先判断 `is_node_ready()`。

如果你的项目里 `stats` 只在编辑器里设置一次,不会运行时替换,可以先不写这么复杂。但你要知道问题在哪里。

---

## 十、一个最小验收实验

按下面的步骤做一遍,比看概念有用。

1. 新建 `PlayerStats` 资源脚本。
2. 保存两份资源:`player_default.tres` 和 `player_tank.tres`。
3. `Player` 场景导出 `@export var stats: PlayerStats`。
4. `HUD` 场景也导出同一个 `stats`。
5. 让 `Player` 受伤时调用 `stats.take_damage(10)`。
6. 让 `HUD` 监听 `stats.hp_changed`。
7. 把 HUD 在场景树里换个位置,不改代码再跑一次。

验收标准:

- 玩家脚本里没有 `/root/Game/HUD` 这种路径。
- HUD 脚本里没有 `get_parent().get_node("Player")`。
- 换 `player_tank.tres` 后,玩家最大血量变化,脚本不需要改。
- 移动 HUD 子节点位置后,`%HPBar` 仍然能找到。
- 玩家死亡时,玩家只发出 `died`,不直接决定“重开关卡”。

做到这些,第 05 篇的目标就达到了:节点之间不再互相乱找,数据和通知有了稳定入口。

---

## 常见坑

**坑 1:`Resource` 不是“每个节点自动一份”。**

同一个 `.tres` 被多个地方引用时,默认是同一份对象。模板可以共享,运行时状态要复制或 Local To Scene。

**坑 2:`@export var stats: Resource` 太宽。**

尽量写具体类型:

```gdscript
@export var stats: PlayerStats
```

这样 Inspector 会限制可拖入的资源类型,编辑器也能补全字段。

**坑 3:`%UniqueName` 不能跨场景乱找。**

`%HPBar` 只能找当前场景 owner 内的 unique 节点。想访问外部 HUD,用 `@export` 注入、信号、或者更高层管理器。

**坑 4:信号回调里不要做太多“反向通知”。**

如果 A 收到 B 的信号后又发信号让 B 改状态,很容易形成循环。回调里优先更新自己;复杂转发以后放到事件总线或流程管理器里处理。

**坑 5:`await some_signal` 之后对象可能已经没了。**

```gdscript
await stats.died
if not is_instance_valid(hud):
    return
hud.show_game_over()
```

`await` 期间场景可能切换,节点可能被释放。涉及 UI、关卡切换、过场动画时尤其要防。

**坑 6:忘记给必须字段做检查。**

`@export var stats: PlayerStats` 没拖资源时就是 `null`。在 `_ready()` 开头写:

```gdscript
assert(stats != null, "stats must be assigned")
```

越早报错,越容易修。

---

`Resource` 和 `Signal` 不是为了让代码显得“架构化”。它们解决的是最朴素的问题:数据不要散在脚本里,节点不要到处找别的节点,发生变化时用通知说清楚。

下一篇开始进入真正的手感核心:用 `CharacterBody2D` 讲清移动、碰撞、地面检测和 `move_and_slide()`。
