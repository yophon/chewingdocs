# 05-Resource、Signal 与场景解耦基础

> 一句话导读:`Resource` 让数据可以脱离场景独立存在并被复用,`Signal` 让节点之间不必互相 `get_node`。两者配合,场景树就从"耦合的网"变成"单向的图"。

第 04 篇把代码层契约讲清楚了。本篇把契约提升到**场景层**:不再是"这个函数参数是什么类型",而是"这段数据怎么存、谁能改"、"这件事怎么通知出去、谁有权听到"。一旦把 `Resource` 和 `Signal` 的边界守住,Godot 项目的可维护性就有了天花板。

读者画像默认:你已经会写一个能在场景里跑的 GDScript 脚本,知道 `_ready` 和 `_process` 怎么用,但你的代码里到处是 `get_node("/root/Game/HUD/Score")`,改一次场景结构就要全局搜替换。本篇要让你脱离这种状态。

## 1. 机制定位

新手在 Godot 里写代码,常见会演化出两种"反模式":

**反模式一:节点路径硬编码**。把"玩家"和"血条 UI"放在同一棵场景树里,玩家受伤时直接 `get_node("/root/Game/HUD/HealthBar").value -= dmg`。这种写法在第一个 demo 里跑得很好,但当你把这个玩家场景搬去新关卡、或者重命名上层节点,所有路径同时断裂。再激进一点的版本是 `get_parent().get_parent().get_node("HUD")`,这种代码三个月后没人能看懂它在引用哪里。

**反模式二:数据写死在脚本里**。敌人 HP 100、攻击力 5、掉落金币数,都直接放在 `enemy.gd` 里的成员变量。需要 10 种不同强度的敌人时,要么复制 10 份脚本,要么写一个 if-else 的工厂方法。然后策划想加一种"血更厚一点的精英版",你只能改代码再编译再跑。

这两种反模式的根因是一样的:**把代码、数据、场景结构三者混在一起**。Godot 给出的解药是把它们解耦成三层:

- 场景结构(树)由 `.tscn` 描述,运行时由场景树实例化。
- 数据由 `Resource` 描述,作为 `.tres` 文件独立存在,可以在 Inspector 编辑,可以在多个场景间共享。
- 通讯由 `Signal` 完成,发送方只管广播"我发生了什么",接收方自己决定要不要订阅。

熟悉前端工程的工程师,可以把这套机制类比成"组件 / Props / 事件":`PackedScene` ≈ Component,`Resource` ≈ Props/Config,`Signal` ≈ EmittedEvent。但 Godot 4.6 引入的 **Unique Node IDs** 又给这套体系加了一个保险:即便你重命名或重组场景树,只要节点被标为 `%UniqueName`,引用就不会断 —— 这条改变了上一代 Godot 教程里"信号要连稳定路径"的旧建议,后面会专门讲。

更进一步地,在写代码之前不妨先在脑子里画一张图:**数据(Resource)放正中,场景节点围在外圈,信号是从内向外、从一处向多处的箭头**。这张图与传统 OOP "父对象持有子对象的引用、子对象回调父对象方法" 不同 —— Godot 鼓励你把状态外置成资源,而不是塞在节点字段里。等你做到第 15 篇的场景流管理时会发现,只有这种"资源居中"的设计,场景切换才不需要把数据反复重建。

本篇要解决的就是:让你下笔写 `enemy.gd` 时,数据进 `.tres`,代码进 `.gd`,通讯走 `signal`,引用走 `%UniqueName` 或 `@export`,不再出现一行 `get_node("/root/...")`。

## 2. Godot 心智

### `Resource` 到底是什么

`Resource` 是 `RefCounted` 的子类,在 Godot 里扮演"序列化数据容器"。它不是节点,不出现在场景树里;它是值,通过引用计数被多个使用方共享。所有 Godot 内置的"配置型对象"几乎都是 `Resource` 的子类:`Texture2D`、`PackedScene`、`AudioStream`、`Mesh`、`Animation`、`Theme`、`Curve`、`Gradient`。

这是个值得停下来体会的事实:**`PackedScene` 也是一种 `Resource`**。你右键创建的每一个 `.tscn` 文件,在引擎眼里就是"一份打包好的节点数据"。`load("res://player.tscn")` 拿回来的是 `PackedScene`,再调 `instantiate()` 才得到一棵真实的节点树。这条心智一旦内化,你会发现 Godot 的"场景"和"资源"其实是同一种东西的不同表面 —— 都通过 `ResourceLoader` 走加载缓存,都用 `.import` 机制驱动重导入,都能在 Inspector 里编辑。

`Resource` 有三种存在形态:

1. **作为文件存在**(`.tres` 文本格式或 `.res` 二进制),通过 `ResourceLoader.load()` 或 `preload()` 加载到内存,Engine 用一个全局缓存表保证"同一个路径只加载一次"。
2. **作为内嵌资源存在**,直接写在某个 `.tscn` 或 `.tres` 文件内部,语法上是 `SubResource("Texture2D_xyz")`,不能跨场景共享。
3. **作为运行时对象存在**,`MyResource.new()` 创建后只在内存里,可以 `ResourceSaver.save()` 写到磁盘上变成 `.tres`。

工程上的关键性质是**默认共享**。`preload("res://enemies/goblin.tres")` 在不同场景里被调用三次,拿到的是同一个 `Resource` 实例。你在一处修改 `hp` 字段,所有引用同步可见。这通常是好事(用作"敌人模板"很合适),但偶尔会出问题(把模板当成 runtime state 改),所以 `Resource` 有一个 `resource_local_to_scene` 属性:打开后,每次场景实例化都会克隆出独立副本。这是后续第 17 / 18 篇做组件化与配表时的关键开关。

### 自定义 `Resource` 的写法

写一个自定义资源类只需要继承并标 `class_name`,Godot 编辑器会自动在 "Create New Resource" 对话框里列出:

```gdscript
class_name EnemyStats
extends Resource

@export var hp: int = 100
@export var attack: int = 5
@export var move_speed: float = 80.0
@export var sprite: Texture2D
@export var loot_table: Array[StringName] = []
```

之后右键 `enemies/` 目录 -> New Resource -> EnemyStats -> 保存为 `goblin.tres`,就有了一份可被 Inspector 编辑、可被多个敌人场景引用的数据对象。这正是 Godot 4.x 推荐的"数据驱动"工作流的最小骨架。

### `Signal` 的两种形态

`Signal` 在 GDScript 里有两层:声明形态和运行时形态。

**声明形态**用 `signal` 关键字写在脚本顶部:

```gdscript
signal died
signal hp_changed(new_hp: int, max_hp: int)
signal stat_buffed(stat_name: StringName, value: float)
```

它会在该脚本对应的类(可以是 `Node`、`Resource`、`RefCounted`)上注册一个同名信号。

**运行时形态**是 `Signal` 类型的对象。`my_button.pressed` 这个表达式,得到的是一个绑定了 `my_button` 和 `"pressed"` 的 `Signal` 值,你可以 `connect`、`disconnect`、`emit`、`is_connected`,甚至把它存进变量传给别处。

连接信号的推荐姿势是用 `Callable`:

```gdscript
player.died.connect(_on_player_died)
player.hp_changed.connect(_on_hp_changed)
button.pressed.connect(_on_pressed.bind(button.name))
```

Godot 4 完全废弃了 3.x 那种 `connect("died", self, "_on_player_died")` 的字符串方法名风格 —— 后者既不能被 IDE 校验,也不能在重命名函数时自动跟随。

连接时还可以传 `ConnectFlags`,常见的有三个:

- `CONNECT_ONE_SHOT`:触发一次后自动断开,适合"游戏开始动画播完一次后就别再听"这种场景。
- `CONNECT_DEFERRED`:回调放进下一帧主循环执行,而不是立刻同步调。这在"信号在物理回调里发,但接收方想安全地修改场景树"时很关键 —— 物理过程中不能 `queue_free` / 添加子节点,延迟到下一帧就稳了。
- `CONNECT_PERSIST`:与编辑器序列化相关,正常工程代码不需要主动设。

```gdscript
boss.spawned.connect(_play_intro, CONNECT_ONE_SHOT)
explosion.body_entered.connect(_apply_damage, CONNECT_DEFERRED)
```

这两条标志几乎能解决"信号触发时机不对"的 80% 问题,后续第 08、09 篇会反复用到。

### 信号的连接方式:代码连 vs 编辑器连

Godot 编辑器右侧有个 "Node" 面板,可以可视化地把信号拖到接收节点上,自动生成回调函数。这种 GUI 连接对小项目方便,但有两个工程缺点:

1. 连接关系藏在 `.tscn` 文件的 `[connection]` 段里,代码里看不到,审查代码时容易漏。
2. 重命名信号名或回调名,GUI 连接不会跟着变,通常默默断掉。

工程化项目的约定:**复杂或跨场景的连接,在脚本的 `_ready()` 里显式 `connect`**;**简单的、纯 UI 的本地连接,可以用编辑器面板,但要在脚本里写注释指明"该信号由编辑器连接"**。一致性比手段重要。

### Unique Node IDs:打破"稳定路径"的旧习惯

Godot 4.x 引入了 **Scene Unique Nodes** 特性,在编辑器里右键节点 -> "Access as Unique Name",节点名前会出现一个百分号(`%`)标记。之后在**同一场景**内的任何脚本里,可以用 `%NodeName` 短语法访问,无需关心它在树里挪到了哪里。

```gdscript
@onready var hp_bar: ProgressBar = %HPBar
@onready var label: Label = %ScoreLabel
```

这看似只是语法糖,实质改变了"信号连接要走稳定路径"的旧建议。在 Godot 3.x 时代,你会被反复告诫"不要 `get_node` 太深,要写适应重构的相对路径";4.x 之后,只要给关键节点打 `%` 标记,无论你后续怎么重排父子层级,引用都不会断 —— `%` 路径在场景内做唯一名查找,不依赖具体层级。

要注意三条边界:

- `%` 查找只在**同一个场景文件内**生效。从 `player.tscn` 访问 `%HUDLabel` 拿不到外层关卡里的节点。
- 同一个 owner 下不能有重名的 unique 节点,否则只有第一个有效。
- `%X` 仍然是运行时查找,有少量哈希表开销,放在 `_process` 每帧调用不如缓存到 `@onready var x := %X` 一次。

第 03 篇讲了节点生命周期与 `@onready` 的执行顺序,本篇把它们与 `%` 的组合作为推荐姿势固化下来:**所有跨子节点的引用,要么 `@export` 注入,要么 `@onready %`**,不再 `get_node("/root/...")`。

## 3. 工程实现

下面给一个最小但完整的 demo:玩家的血量数据放进 `Resource`,UI 通过信号订阅血量变化,玩家场景内部用 `%` 引用关键节点。

**第一步:定义 `PlayerStats` 资源**

文件路径 `res://player/player_stats.gd`:

```gdscript
# res://player/player_stats.gd
class_name PlayerStats
extends Resource

## 信号也可以挂在 Resource 上,而不只是 Node
signal hp_changed(new_hp: int, max_hp: int)
signal died

@export var max_hp: int = 100:
    set(value):
        max_hp = maxi(value, 1)
        ## 限幅一下,避免 hp > max_hp
        if hp > max_hp:
            hp = max_hp

@export var hp: int = 100:
    set(value):
        var clamped: int = clampi(value, 0, max_hp)
        if clamped == hp:
            return
        hp = clamped
        hp_changed.emit(hp, max_hp)
        if hp == 0:
            died.emit()

@export var attack: int = 10
@export var move_speed: float = 220.0

func take_damage(amount: int) -> void:
    if amount <= 0:
        return
    hp = hp - amount   ## 触发 setter,自动发信号
```

`Resource` 上也能挂 `signal`,这是 4.x 的关键能力 —— 数据本身可以是事件源,UI 直接订阅数据,而不必经过中间层 Node。

**第二步:在玩家场景里使用资源**

场景结构(略写):

```
Player (CharacterBody2D)
├── %Sprite (Sprite2D)
├── %HitBox (Area2D)
└── %DebugLabel (Label)
```

`%` 标记表示这三个节点都被注册为 unique。脚本 `res://player/player.gd`:

```gdscript
# res://player/player.gd
class_name Player
extends CharacterBody2D

## 通过 @export 注入数据资源,可在 Inspector 拖入 .tres
@export var stats: PlayerStats

@onready var _sprite: Sprite2D = %Sprite
@onready var _hit_box: Area2D = %HitBox
@onready var _debug_label: Label = %DebugLabel

func _ready() -> void:
    assert(stats != null, "Player.stats must be assigned in editor")
    ## 订阅自身资源的信号
    stats.hp_changed.connect(_on_hp_changed)
    stats.died.connect(_on_died)
    _hit_box.body_entered.connect(_on_hit_box_entered)
    _refresh_label()

func _on_hp_changed(new_hp: int, max_hp: int) -> void:
    _refresh_label()
    _sprite.modulate = Color(1, float(new_hp) / max_hp, float(new_hp) / max_hp)

func _on_died() -> void:
    _debug_label.text = "DEAD"
    set_physics_process(false)

func _on_hit_box_entered(body: Node) -> void:
    if body.is_in_group(&"enemy"):
        stats.take_damage(10)

func _refresh_label() -> void:
    _debug_label.text = "HP %d / %d" % [stats.hp, stats.max_hp]
```

注意几个关键点:

- 没有任何 `get_node("/root/...")`。
- 没有手动写"找 HUD、找 HealthBar"的路径;HUD 完全不知道 Player 在哪里。
- `stats` 是 `@export var stats: PlayerStats`,在编辑器里把 `player_default.tres` 拖进去即可。换一个 `.tres`(例如 `player_boss.tres`),整个玩家行为就变成"血更厚的版本",代码不动。

**第三步:HUD 订阅同一份 `Resource`**

`res://ui/hud.gd`:

```gdscript
# res://ui/hud.gd
class_name HUD
extends CanvasLayer

@export var stats: PlayerStats

@onready var _bar: ProgressBar = %HPBar
@onready var _hp_text: Label = %HPText

func _ready() -> void:
    if stats == null:
        push_warning("HUD.stats not assigned")
        return
    stats.hp_changed.connect(_on_hp_changed)
    _refresh()

func _on_hp_changed(_new_hp: int, _max_hp: int) -> void:
    _refresh()

func _refresh() -> void:
    _bar.max_value = stats.max_hp
    _bar.value = stats.hp
    _hp_text.text = "%d / %d" % [stats.hp, stats.max_hp]
```

把同一份 `player_default.tres` 同时拖给 `Player` 节点和 `HUD` 节点,运行时它们指向同一个 `Resource` 实例(因为 `Resource` 默认共享)。玩家受伤 -> `stats.hp -= 10` -> setter 触发 `hp_changed` -> Player 自己更新 modulate,HUD 同步刷新 ProgressBar。**两个节点完全不知道彼此存在**,只通过共享的资源建立了通讯。

这就是 Godot 4.6 推荐的解耦姿势:**`Resource` 作为状态源,`Signal` 作为通知通道,`%UniqueName` 处理场景内节点引用,`@export` 处理跨场景注入**。第 17 篇会在此基础上扩展到生命/属性/技能的组件化系统。

**关于 `.tres` 文件长什么样**

`PlayerStats.tres` 在硬盘上是文本格式,大致如下:

```text
[gd_resource type="Resource" script_class="PlayerStats" load_steps=2 format=3]

[ext_resource type="Script" path="res://player/player_stats.gd" id="1"]

[resource]
script = ExtResource("1")
max_hp = 100
hp = 100
attack = 10
move_speed = 220.0
```

这种纯文本格式带来两个工程红利:**版本控制可读**(Git diff 能看清"哪个字段被改了"),**外部脚本可生成**(写一段 Python / GDScript 工具,从 CSV 或 Excel 自动生成几十份敌人配置文件,不必手点 Inspector)。这是 Godot 在策划协作上比 Unity 序列化二进制 `.asset` 更友好的部分。生产二进制版本 `.res` 一般只在导出包里使用 —— `ResourceSaver.save(res, path, ResourceSaver.FLAG_COMPRESS)` 可手动转,但开发阶段保持 `.tres` 文本。

## 4. 调参和验收

`Resource` 与 `Signal` 没有数值参数要调,真正的"调参"在于设计取舍。给一份判断表。

| 决策 | 选项 A | 选项 B | 取舍 |
| --- | --- | --- | --- |
| 数据放哪 | 写死在 `.gd` 脚本里 | 抽成 `Resource` 存 `.tres` | 同一类对象有多变体或要在 Inspector 调,就用 `Resource` |
| 资源是否共享 | 默认共享(多个使用方同一实例) | `resource_local_to_scene = true` 每次场景实例化都克隆 | 模板配置用共享;运行时状态(当前 HP)用本地化 |
| 信号挂在哪 | 节点上(`Node` 子类) | 资源上(`Resource` 子类) | 跨节点 / 跨场景的状态变化,信号挂资源;只与本节点行为相关的事件,挂节点 |
| 引用方式 | `@export` 注入 | `%UniqueName` 查找 | 跨场景或跨实例的依赖用 `@export`;场景内的稳定子节点用 `%` |
| 信号连接 | 编辑器面板拖线 | 脚本 `_ready` 里 `connect` | 团队协作 / 大项目优先脚本连接,可在版本控制里 diff |

**关于 `resource_local_to_scene` 的实操**

这是新手最容易踩的细节。如果你的 `PlayerStats.tres` 用 `@export` 注入到两个不同的 `Player` 场景实例(例如 1P / 2P),它们会**共享同一份 stats**。1P 掉血,2P 同步掉血。要让每个实例有独立状态,在 `.tres` 文件的 Inspector 里勾上 **Local To Scene**。或者代码层显式调 `stats = stats.duplicate(true)`(深拷贝)。

**信号回路是放射状还是网状,要早点画清楚**

把工程做到第 15 篇时,你会有几十个信号。判断"信号系统是否失控"的标准是:能否画一张 DAG(有向无环图)。如果出现 A -> B -> C -> A 的回路,或者 A 在收到信号回调里又发出会被 A 自己监听的信号,就要警惕。Godot 不会替你检测这种循环,运行起来可能死循环、可能栈溢出、可能"看起来正常但实际跑了两遍"。**好的工程实践:把信号当作"通知",回调里只更新本对象状态或转发给更内层,不反向发起会回到上游的信号链**。第 16 篇的事件总线就是为这种"非父子节点之间也要通讯"的场景准备的中转层。

**验收清单**

- [ ] 项目里有至少一个自定义 `Resource` 子类(例如 `EnemyStats` 或 `PlayerStats`),并保存了对应的 `.tres` 文件。
- [ ] 同一份 `.tres` 在两个不同节点上被 `@export` 注入,数值变化能在两处同步。
- [ ] `Player` 脚本里没有任何 `get_node("/root/...")`。
- [ ] HUD 不通过 `find_child` / `get_parent().get_node` 找 Player,而是通过共享 `Resource` 或显式 `@export Player` 注入。
- [ ] 至少 3 个关键节点(玩家 Sprite、HUD 容器、相机)被设为 `%UniqueName`,脚本里用 `%` 短语法访问。
- [ ] 把场景树里某个子节点拖到另一个父节点下(例如 `%HitBox` 从 `Player` 移到 `Body/`),代码不需要修改,游戏能继续跑。

最后一条是最有说服力的验收实验:**重组节点层级而代码不改**。这就是 Unique Node IDs + 信号解耦真正想交付的工程能力。

## 5. 踩坑

**坑 1:`@export var x: Resource` 比 `@export var x: PlayerStats` 弱很多**

前者在 Inspector 里能接受任意 `Resource` 子类,IDE 也无法补全 `x.hp`。后者明确限制类型,接收方按 `PlayerStats` 来用,出错会被编辑器直接拒绝。原则:`@export` 的资源字段尽量标具体子类。

**坑 2:`signal` 挂 `Resource` 上,要警惕"陈旧资源"**

如果 `stats` 被某节点连了信号,然后你在 Inspector 里换成另一个 `.tres`,旧资源还在内存里;它的信号没人监听,看起来没事。但更危险的反向:你用 `stats = new_stats` 替换引用后,新 `stats` 上的 `hp_changed` 没人订阅。代码层要在 setter 里写"disconnect 旧的、connect 新的"逻辑,或者干脆把 stats 字段做成不可换。

**坑 3:`Resource.duplicate()` 默认是浅拷贝**

`stats.duplicate()` 只拷贝标量字段。如果 `PlayerStats` 里有 `Array[Resource]` 字段(例如装备列表),拷贝出来的副本和原对象**共享同一个数组**。要深拷贝写 `stats.duplicate(true)`,文档里 `subresources` 参数为真表示连同嵌套资源一起拷贝。

**坑 4:Unique Name 范围只在"同一 owner 场景"**

`%Hilt` 从 `Player` 场景里看不到 `Sword` 场景内部的 `Hilt`,即便 `Sword` 是 `Player` 的子场景。文档里把它叫 "Same-scene limitation"。要跨场景访问,要么走信号,要么把那个节点 `@export` 注入。

**坑 5:信号在 `await` 之后可能源对象已经被释放**

```gdscript
await player.died
hud.show_game_over()    ## 这里 hud 可能已经因关卡卸载而无效
```

`await` 一个信号,等于挂起当前函数直到信号发出。这期间任何对象都可能被释放。常用防御写法:

```gdscript
await player.died
if not is_instance_valid(hud):
    return
hud.show_game_over()
```

**坑 6:`resource_local_to_scene` 不会自动深拷贝嵌套资源**

打开 Local To Scene 后,Godot 会在 `PackedScene.instantiate()` 时复制最外层资源,但内部引用的其他 `Resource` 字段仍然共享。需要每层都设 Local To Scene,或者在 `_setup_local_to_scene()` 里手动 `duplicate(true)`。文档示例:

```gdscript
extends Resource
var damage = 0
func _setup_local_to_scene():
    damage = randi_range(10, 40)
```

这段代码每次场景实例化都会被调一次,可以用来给每个副本生成独立的初始随机值。

**坑 7:在 Inspector 里把 `.tres` 换了之后,信号连接不会自动迁移**

如果你的脚本是 `stats.hp_changed.connect(_on_hp_changed)`,然后 Inspector 把 `stats` 换成新 `.tres`,新资源上还没接信号,但旧资源上的连接也还挂着(指向旧资源)。最佳实践:把 `stats` 字段做成带 setter,在 setter 里手动重连:

```gdscript
@export var stats: PlayerStats:
    set(value):
        if stats != null and stats.hp_changed.is_connected(_on_hp_changed):
            stats.hp_changed.disconnect(_on_hp_changed)
        stats = value
        if stats != null:
            stats.hp_changed.connect(_on_hp_changed)
```

**坑 8:`preload` vs `load` 的边界**

`preload("res://foo.tres")` 在解析脚本时就把资源加载,常量级表达式,优势是确定性高、无运行时 IO。`load("res://foo.tres")` 是运行时调用,可以根据变量动态选择路径。规则很简单:**路径是字面量就 `preload`;路径要拼字符串就 `load`**。`preload` 会让脚本启动稍慢但跑得更稳。

**坑 9:旧教程里的 `connect("died", self, "_on_died")` 语法在 4.x 完全失效**

3.x 用"对象 + 方法名字符串"连接信号,4.x 全面切换到 `Callable`。看到老教程里的字符串方法名,直接替换成 `connect(_on_died)`(不带引号),否则会报错或行为异常。

**坑 10:`Resource` 默认线程不安全**

`Resource` 没有内置的锁。多个线程同时读写同一个 `Resource` 字段会出错。在主线程之外的代码(`WorkerThreadPool`、`Thread`)里只读用没问题;要写,要么自己加锁,要么把写操作 `call_deferred` 到主线程。本系列在第 24 篇异步加载里会重点讲这条边界,这里只是提醒别把"共享资源"当成"线程共享变量"。

**坑 11:不要在 `signal` 回调里直接 `queue_free` 信号源**

经典案例:`Area2D.body_entered` 触发的回调里,把自己 `queue_free()`。如果这个信号还有下一个监听者,引擎在调用它时会发现对象已无效,可能直接崩;即便没崩,行为也会变得不可预测。安全姿势:`call_deferred("queue_free")` 或者用 `CONNECT_DEFERRED` 把回调放到下一帧。

**坑 12:`@export` 资源字段为 `null` 时不会抛错,需要 assert**

`@export var stats: PlayerStats` 没在 Inspector 拖入资源,`stats` 就是 `null`,游戏照常启动,直到 `_on_hp_changed` 里第一次访问 `stats.hp` 才崩。约定:所有"必须设置"的 `@export` 字段,在 `_ready` 第一行写 `assert(field != null, "...")`。

---

`Resource` 与 `Signal` 不是炫技语法,而是 Godot 工程化的两个支点。把它们守好,场景树就会从"什么都耦合在一起的网"变成"数据居中、节点周围、信号单向流动的图"。下一篇把视角从"数据 + 通讯"转到"运动 + 碰撞",讲清 `CharacterBody2D` 与 `move_and_slide` 的 4.6 心智 —— 包括一次必须澄清的物理引擎误会。

## 手动验证

- [ ] 在项目里创建一份 `EnemyStats` 自定义资源,保存出 `goblin.tres` 与 `goblin_elite.tres` 两个变体,挂在同一个敌人脚本上,运行行为不同。
- [ ] 同一份 `player_default.tres` 同时拖给 Player 与 HUD,玩家受伤后两边都能看到 hp 变化,且 Player 和 HUD 脚本里都没有 `get_node` 到对方。
- [ ] 把 `%HPBar` 节点在 HUD 场景里从一个容器移到另一个容器,代码不改,游戏行为不变。
- [ ] 故意在 Inspector 里把 `stats` 字段替换为新 `.tres`,验证 setter 触发了 disconnect / reconnect。
- [ ] 打开某个资源的 **Local To Scene**,在两个独立的敌人实例上验证状态相互不影响。
- [ ] 用 `await some_signal` 写一段流程,故意让源对象在 `await` 期间 `queue_free`,观察是否需要补 `is_instance_valid` 防御。

---

**下一篇:** `06-CharacterBody2D与移动碰撞模型.md`,把"角色能动、能跳、能站在地上"这件事一次讲透,顺便澄清 4.6 Jolt 物理引擎与 2D 的关系。
