# 16-Autoload、事件总线与全局状态边界

新手做 Godot 项目,第二个月通常会出现一个名叫 `Global.gd` 的脚本。一开始它只有 5 行,存玩家分数。两周之后,它有 30 个属性、12 个方法、4 个信号。再过一个月,主菜单要拿玩家昵称,关卡要写当前波次,商店要查金币,存档要序列化所有这些字段,删掉任意一个都要全工程搜索。

这一篇不讲"Autoload 怎么用",而讲 **Autoload 应该承担什么、不应该承担什么**,以及如何用 `signal` 把全局通信变成低耦合的事件总线(EventBus),让"全局状态"和"业务节点"之间维持清晰的依赖方向。

## 1. 机制定位

Autoload(官方文档里也写作 Singleton)要解决的核心问题只有一个:

> **在场景树之外,提供少量必须随项目启动而存在、生命周期等于整个进程的"服务"。**

典型场景:

- 一个事件总线,让不同场景的节点不直接持有彼此引用,也能完成发布订阅。
- 一份会话状态(本局游戏的金币、关卡进度、Buff),不能跟着关卡场景被 `free()` 掉。
- 一份永久存档读写器(`user://save.tres` 的载入与回写),应该是全局唯一入口,不允许两份代码并发写盘。
- 一个音频管理器(全局 BGM、SFX 总线),不应跟随关卡销毁而中断。

这些场景的共同特征:**它们不属于任何一个具体场景**。跟随主场景换出会丢数据,作为普通节点又找不到稳定位置。Autoload 把"挂在 `/root/` 下、比主场景更早入树、永远不释放"作为这类服务的默认归属。

新手常见的失控写法是反方向的:**把一切跨节点不方便传递的东西都塞进 Autoload**。把"当前选中的菜单按钮"、"鼠标悬停的物品 tooltip 文本"、"敌人 AI 临时决策结果"一股脑写进 `Global`。后果是:

- Autoload 变成大杂烩,字段含义靠注释维护,改一个属性要在十几处脚本里搜索。
- 单元测试无法运行,任何脚本一加载就要求全局变量存在。
- 场景之间互相用 `Global.xxx` 通信,看似解耦,实际上把所有节点都耦合到这个 Autoload 的实现细节上。

这条失控线一旦走出去,只能整体重构。本篇用三条规则把它截在出口前:**职责分层、单向依赖、状态生命周期显式**。

为什么"全局变量"在游戏里特别危险,而在 Web 后端代码里没那么显眼?根本原因是游戏的对象生命周期极不规则:玩家会反复进入退出关卡,敌人会被批量生成又批量销毁,UI 面板会在暂停时挂起、恢复时重连。每一次场景切换都意味着大量节点入树、出树。Autoload 是这条混乱时间线里唯一"不动"的锚点,它的稳定性吸引人把任何"想稳定下来的状态"都挪进去。但**真正稳定的不是节点,而是数据;不是符号,而是职责**。一旦你把"哪个按钮当前高亮"也挪进 Autoload,Autoload 就背上了关卡级 UI 的生命周期,而它本身又活得比 UI 久,这种不匹配就是 bug 的来源。

记住:`Global` 不是收容所。每次想往 Autoload 加一个字段,先问"这个字段死了之后,系统会失去什么"。如果答案是"下一个场景就用不到了",那它压根就不是全局状态,它是关卡状态,应该挂在关卡场景里。如果答案是"玩家退出游戏再进来还要用",那它属于永久存档,而不是会话状态。两个生命周期都不沾的字段——例如"当前选中按钮"——只属于具体 UI 节点,根本不该爬到全局层。

## 2. Godot 心智

### 注册位置与生命周期

Autoload 不是脚本里的某个 `static` 修饰,而是**编辑器配置**。打开 `Project > Project Settings > Globals > Autoload`,把脚本(`.gd`)或场景(`.tscn`)添加进去,给它一个名字,比如 `EventBus`。引擎启动时做三件事:

1. 实例化这个脚本或场景。
2. 把它作为子节点挂到 `/root/`,也就是 `SceneTree` 的根 `Window` 节点下面。
3. 名字注册成全局符号,任何脚本里都能直接写 `EventBus.something`,不需要 `get_node`。

注册顺序就是入树顺序。引擎按列表从上到下,逐个完成 `_enter_tree` → `_ready`,然后才加载 Main Scene。这意味着:

- `EventBus` 排在 `GameSession` 前面,`GameSession._ready()` 里可以安全访问 `EventBus`。
- 反过来不行,`EventBus._ready()` 时 `GameSession` 还没入树。
- 主场景的 `_ready()` 时所有 Autoload 都已就绪。

```text
/root/
├── EventBus           (autoload, 1)
├── GameSession        (autoload, 2)
├── SaveProfile        (autoload, 3)
└── MainScene          (Main Scene)
    ├── Player
    ├── Enemies
    └── HUD
```

Autoload 不响应 `get_tree().reload_current_scene()`,它根本不在当前场景里,所以重开关卡时它保留所有数据。这是一个特性而非 bug:**进度信息就应该跨场景活着**。如果你需要"开一局新游戏",必须手动调用 `GameSession.reset()`,而不是依赖场景重载。

另一个容易被忽视的细节是 `process_mode`。Autoload 默认 `PROCESS_MODE_INHERIT`,从 `/root/` 继承,通常等价于 `PROCESS_MODE_PAUSABLE`。结果是:当业务代码调 `get_tree().paused = true` 暂停游戏时,`GameSession._process` 也会停。如果你的 Autoload 需要在暂停时仍然工作——例如 `AudioBus` 要继续淡入淡出菜单 BGM、`SaveProfile` 要响应"在菜单里点存档"——必须在 `_ready` 里设 `process_mode = PROCESS_MODE_ALWAYS`。`EventBus` 因为不跑 `_process`,无所谓;`GameSession` 通常希望暂停时停;`AudioBus` 一般要 ALWAYS。这件事需要按 Autoload 单独决策,而不是一刀切。

### 三种角色,三种边界

把 Autoload 的职责拆成三种,而不是混在一起:

| 角色 | 内容 | 生命周期 | 是否落盘 |
| --- | --- | --- | --- |
| 事件总线 `EventBus` | 只声明 `signal`,无字段、无逻辑 | 进程 | 否 |
| 会话状态 `GameSession` | 本局数据:金币、关卡进度、Buff | 一局游戏 | 否 |
| 永久存档 `SaveProfile` | 跨局数据:解锁、设置、统计 | 跨进程 | 是 |

**会话状态与永久存档的区分非常关键**。临时数据不应该出现在存档文件里,否则关卡里的临时金币、Buff 计时器、敌人 ID 都会被序列化,存档版本一变就崩。永久存档只关心"玩家在两次启动之间需要保留什么":成就、设置、最高分、解锁进度。临时数据由 `GameSession` 持有,死亡或退出关卡时按需丢弃或回写。

事件总线、会话状态、永久存档之所以分成三个 Autoload 而不是合成一个 `Global`,根本原因是它们三者的**变化频率和变化原因不同**。`EventBus` 在加新功能时几乎每天都在改信号声明,但永远不需要序列化、不需要测试持久化逻辑。`GameSession` 在玩法迭代时频繁改字段,但跟磁盘无关。`SaveProfile` 改动较少,但每次改都要考虑版本迁移、磁盘 I/O、损坏恢复。让三者各管一摊,改任何一个不会影响其他两个的测试场景。

### 依赖方向

Autoload 在依赖图上必须是**叶子**:

```text
业务节点 ── depends on ──>  Autoload
Autoload ── does NOT depend on ──>  业务节点
```

理由很直接。业务节点会随场景反复实例化、释放;Autoload 不会。如果 Autoload 持有业务节点引用(用 `get_node("/root/MainScene/Player")` 拿),那么:

- 业务节点销毁后,Autoload 持有悬空引用。
- 业务节点改名或重组场景树,Autoload 跟着改。
- 测试 Autoload 时必须先构造一棵完整场景树。

正确做法是反过来:业务节点在 `_ready()` 里订阅 Autoload 的信号,在 `_exit_tree()` 里解绑(实际上节点 `free()` 时引擎会自动断开,但显式写更可读)。Autoload 永远只对外**广播**,不**点名**。这是事件总线模式的核心。

## 3. 工程实现

下面三个脚本是 `EventBus` / `GameSession` / 业务节点订阅样式的最小骨架,代码可直接贴进项目运行。

`EventBus` 只有信号声明,不要有字段、不要有逻辑。一旦它开始持有状态,它就不再是事件总线,而是变质成另一个 Global。文件位置 `res://autoload/event_bus.gd`:

```gdscript
# res://autoload/event_bus.gd
extends Node

# === 战斗相关 ===
signal player_damaged(amount: int, source: Node)
signal player_died
signal player_healed(amount: int)
signal enemy_killed(enemy_id: StringName, drop_position: Vector2)
signal enemy_spawned(enemy_id: StringName, spawn_position: Vector2)

# === 资源与物品 ===
signal coins_changed(new_amount: int)
signal item_picked_up(item_id: StringName, count: int)
signal item_used(item_id: StringName)
signal inventory_full(item_id: StringName)

# === 关卡流程 ===
signal level_started(level_id: StringName)
signal level_cleared(level_id: StringName, elapsed_sec: float)
signal level_failed(level_id: StringName, reason: StringName)

# === UI 反馈 ===
signal toast_requested(message: String, duration_sec: float)
signal screen_shake_requested(strength: float, duration_sec: float)
signal dialog_requested(speaker_id: StringName, text: String)

# === 进度与持久化 ===
signal achievement_unlocked(achievement_id: StringName)
signal settings_changed
```

注意几点:

- 信号参数加类型标注,Godot 4.x 起支持,IDE 能在 `connect` 时提示参数。
- `StringName` 用于 ID 类常量(物品 id、关卡 id),它在引擎内部去重,比 `String` 更适合做 dictionary key,也省内存。
- `signal player_died` 不带参数,可以省去括号。
- **`EventBus` 没有 `func _ready()`、没有业务逻辑**。如果你想在这里写"打印日志""存盘""判断游戏结束",停下来,那是 `GameSession` 或其他业务节点的事。
- 不要在 `EventBus` 里再 `connect` 自己的信号——`EventBus` 是广播台,不是订阅者。

会话状态有字段,有方法,有内部信号,但**不持有任何业务节点引用**。文件位置 `res://autoload/game_session.gd`:

```gdscript
# res://autoload/game_session.gd
extends Node

const STARTING_COINS: int = 0
const STARTING_LIVES: int = 3

var coins: int = STARTING_COINS:
    set(value):
        var clamped := maxi(value, 0)
        if clamped == coins:
            return
        coins = clamped
        EventBus.coins_changed.emit(coins)

var lives: int = STARTING_LIVES
var current_level_id: StringName = &""
var level_elapsed: float = 0.0
var run_seed: int = 0

func _process(delta: float) -> void:
    if current_level_id != &"":
        level_elapsed += delta

func start_new_run() -> void:
    coins = STARTING_COINS
    lives = STARTING_LIVES
    current_level_id = &""
    level_elapsed = 0.0
    run_seed = randi()

func enter_level(level_id: StringName) -> void:
    current_level_id = level_id
    level_elapsed = 0.0
    EventBus.level_started.emit(level_id)

func clear_level() -> void:
    var cleared := current_level_id
    var elapsed := level_elapsed
    current_level_id = &""
    EventBus.level_cleared.emit(cleared, elapsed)

func notify_enemy_killed(enemy_id: StringName, drop_position: Vector2) -> void:
    EventBus.enemy_killed.emit(enemy_id, drop_position)
```

观察几个细节:

- `coins` 用属性 setter 在赋值时自动广播,避免在 30 个调用处都手写 `EventBus.coins_changed.emit(...)`。把"状态写入"和"事件分发"绑定在一处,新代码自动获得正确的反馈链路。
- 整个文件没有 `get_node("/root/...")`,没有 `@onready var player = ...`。`GameSession` 对外一无所知,只暴露字段、方法和经 `EventBus` 转发的信号。
- `_process` 只做与会话本身有关的时间累计(关卡用时)。如果你发现自己写 `if player.is_dead():`,那行代码应该改成"业务节点广播 `player_died`,会话作为监听者反应"。
- `&""` 是 `StringName` 字面量。判断"未在任何关卡里"用 `current_level_id == &""` 比用空 `String` 更明确。

业务节点订阅 `EventBus` 的样式。文件位置 `res://entities/player.gd`:

```gdscript
# res://entities/player.gd
extends CharacterBody2D

@export var max_hp: int = 100
@export var move_speed: float = 200.0
var hp: int

func _ready() -> void:
    hp = max_hp
    add_to_group("player")
    EventBus.toast_requested.connect(_on_toast_requested)
    EventBus.player_healed.connect(_on_player_healed)

func _exit_tree() -> void:
    # 节点 free() 时引擎会自动断开,这里显式写
    # 是为了"未销毁但暂时离开树"的情况也保持清洁
    if EventBus.toast_requested.is_connected(_on_toast_requested):
        EventBus.toast_requested.disconnect(_on_toast_requested)

func take_damage(amount: int, source: Node) -> void:
    hp -= amount
    EventBus.player_damaged.emit(amount, source)
    if hp <= 0:
        EventBus.player_died.emit()
        GameSession.lives -= 1

func _on_toast_requested(message: String, _duration: float) -> void:
    print("[Player] toast: ", message)

func _on_player_healed(amount: int) -> void:
    hp = mini(hp + amount, max_hp)
```

整张数据流就成形了:

```text
Enemy.gd                EventBus                 GameSession          HUD/CoinLabel.gd
   │ on_killed()           │                         │                      │
   ├─► enemy_killed.emit() │                         │                      │
   │                       ├── enemy_killed ───────► │                      │
   │                       │                         ├── coins += 5         │
   │                       │                         ├── setter triggers    │
   │                       │ <─── coins_changed.emit │                      │
   │                       ├── coins_changed ───────────────────────────────┤
   │                       │                         │                      ├─ label.text
```

Enemy 不知道 HUD 存在,HUD 不知道 Enemy 存在,两者只看 `EventBus`。`GameSession` 在中间推演状态,但它也不调 `find_node("CoinLabel")`。这条链路一旦稳定下来,新增"敌人死了之后..."的副作用——播音效、加经验、统计成就——只是再加一个监听者,不需要改动任何现有脚本。

最后补一个永久存档 Autoload 的最小骨架,展示**会话状态**与**落盘状态**如何分开。文件位置 `res://autoload/save_profile.gd`:```gdscript
# res://autoload/save_profile.gd
extends Node

const SAVE_PATH: String = "user://profile.tres"
const SCHEMA_VERSION: int = 1

var data: SaveData

func _ready() -> void:
    data = _load_or_create()
    EventBus.level_cleared.connect(_on_level_cleared)

func _on_level_cleared(level_id: StringName, elapsed_sec: float) -> void:
    var prev: float = data.best_times.get(level_id, INF)
    if elapsed_sec < prev:
        data.best_times[level_id] = elapsed_sec
        save_async()

func save_async() -> void:
    # 用 deferred 避免在信号回调里直接做磁盘 I/O 阻塞物理 tick
    call_deferred("_do_save")

func _do_save() -> void:
    var err := ResourceSaver.save(data, SAVE_PATH)
    if err != OK:
        push_warning("save failed: %s" % err)

func _load_or_create() -> SaveData:
    if not ResourceLoader.exists(SAVE_PATH):
        return SaveData.new()
    var res := ResourceLoader.load(SAVE_PATH, "SaveData")
    if res is SaveData and res.schema_version == SCHEMA_VERSION:
        return res
    # 版本不匹配走迁移逻辑(具体见第 14 篇)
    return SaveData.new()
```

这段代码里有四个关键设计:`SaveProfile` 只听 `EventBus.level_cleared`,不直接被业务节点调用;落盘走 `call_deferred` 避免在物理 tick 中阻塞;读盘把 schema 版本作为门禁,版本不对就回退到新数据;`SaveData` 本身是 `Resource` 子类(具体定义留给第 14 篇展开),这样 `.tres` 文件天然带类型信息,可以直接在编辑器里查看。

注意 `SaveProfile` 是**会话与磁盘的桥梁**,它本身不暴露字段给业务节点修改——业务节点要修改某个永久数据(比如解锁成就),应该走 `EventBus.achievement_unlocked.emit(id)`,`SaveProfile` 监听后改 `data`、触发 `save_async()`。这样保证所有落盘动作都集中在一处,易于打 log、易于测。

## 4. 调参和验收

调参主要是**职责切分**而不是数值。每个 Autoload 加进列表之前问三个问题:

1. **它的生命周期等于一局游戏吗?** 是的,归 `GameSession`。等于整个进程?可能是 `EventBus` 或音频管理器。等于"两次启动之间"?那是 `SaveProfile`。
2. **它需要持有某个具体业务节点吗?** 是的,不要做成 Autoload。放进对应场景里,用 Unique Node ID(`%PlayerHud`)在场景内引用。
3. **它会被两个以上场景同时使用吗?** 只有一个场景用,做成场景内子节点更合适。强行做成 Autoload 是过度全局化,迟早因为"我也想在另一个场景用一下"而把状态写坏。

实际项目里,Autoload 数量通常稳定在 4-8 个:`EventBus`、`GameSession`、`SaveProfile`、`SceneRouter`(场景切换器,第 15 篇展开)、`AudioBus`、`Settings`、`Localization`、`InputRebind`(只在需要重写绑定时单独抽)。超过 10 个就值得审视有没有把不属于全局的东西塞进来。

### 信号粒度

信号粒度是 `EventBus` 的另一个重要参数。两个极端都有问题:

- **太粗**:只有一个 `signal anything_happened(event_type: StringName, payload: Dictionary)`。所有节点都订阅它,然后内部 `match event_type:` 一遍。这等于自己重写一个事件分发,失去了 Godot 信号系统的类型检查。
- **太细**:每个敌人、每件物品、每个 UI 元素都有专属信号。`signal goblin_killed`, `signal slime_killed`, `signal coin_picked`, `signal gem_picked`,几十个信号靠手工维护。

合理的粒度通常是"按业务行为"而不是"按具体对象"。`enemy_killed(enemy_id: StringName, ...)` 而不是 `goblin_killed`,因为订阅者要做的事(加经验、掉落、计数)对所有敌人都一样,差异通过参数表达。`item_picked_up(item_id: StringName, count: int)` 同理,所有物品共享一条信号。如果某类物品需要特殊处理,订阅者用 `if item_id == &"key_red":` 分支处理,而不是新增信号。

### 注册顺序

`Project Settings > Globals > Autoload` 列表从上到下决定初始化顺序。推荐排列:

1. `EventBus`,无任何依赖,纯信号集合。
2. `Settings` 或 `SaveProfile`,可能需要先读盘。
3. `AudioBus`,依赖 `Settings` 拿音量。
4. `GameSession`,依赖 `EventBus` 转发事件。
5. `SceneRouter`,依赖以上所有。

排错原则:**下面的可以依赖上面的,上面的不能依赖下面的**。如果你发现要"反过来",通常说明 `EventBus` 没被充分利用,把直接调用改成发信号,问题就消失。

### 验收

一个健康的 Autoload 结构应满足:

- 全工程搜索 `get_node("/root/`,除了极少数框架式接管点之外,业务代码不应出现这种字符串路径。
- 全工程搜索 Autoload 名,业务代码里大多数是"订阅信号"或"读字段",而不是"调方法改它的状态"。
- 临时禁用某个 Autoload(取消 Project Settings 里的勾选)后,引擎启动应该立刻在第一处依赖点报错,这说明依赖关系是**显式**的,而不是隐式藏在动态字符串路径里。
- 重新进入关卡(`get_tree().reload_current_scene()`)后,会话数据是被清空还是保留,完全由你的代码决定,不是引擎默认行为决定的。
- 把 `EventBus` 单独拉出来用 `gdscript --headless` 加载,不报错。事件总线没有任何业务依赖,这是它健康的硬指标。

## 5. 踩坑

### 坑 1:`@onready` 引用 Autoload

`@onready var event_bus := EventBus` 是冗余,`EventBus` 本身就是全局符号,任何函数里直接写 `EventBus.xxx` 即可。更糟的是有人写 `@onready var hud := $/root/MainScene/HUD`,把 Autoload 的兄弟节点路径硬编码进脚本,场景树一改全断。让 Autoload 反向引用业务节点本身就是错的方向。

### 坑 2:`reload_current_scene()` 不重置会话数据

```gdscript
func restart() -> void:
    get_tree().reload_current_scene()
    # GameSession.coins 没有被清空
```

`reload_current_scene` 只换主场景,Autoload 留着原样。这是设计上的优点而非缺陷:玩家死亡后只重载关卡场景,本局总进度保留。但如果要"开新一局",必须先调 `GameSession.start_new_run()` 再 reload。常见做法是把这两步包成 `SceneRouter.start_new_run(level_id)`,所有"开新局"入口走同一条路径。

### 坑 3:Autoload 之间的 `_ready` 顺序陷阱

```gdscript
# audio_bus.gd  (排在 settings 之前)
func _ready() -> void:
    set_master_volume(Settings.master_volume)
    # 此时 Settings._ready() 还没跑,字段是初始默认值
```

如果 `AudioBus` 在列表里排在 `Settings` 之前,`Settings._ready()` 还没运行就来调它。两种解法:

- 把 `Settings` 在 Project Settings 里移到 `AudioBus` 上面,**声明式**依赖,首选。
- 把跨 Autoload 的初始化挪到 `call_deferred("_late_init")`,在所有 Autoload 都 `_ready` 完之后再运行,**运行时**延迟。

第二种是没办法时才用,因为依赖关系会被隐藏在 deferred 调用里,日后难以排查。

### 坑 4:信号连接的悬挂引用

节点 `free()` 时引擎会自动断开它涉及的信号连接。但两种情况不会自动清理:

- **跨 Autoload 的连接**。`EventBus.signal_x.connect(GameSession._on_x)`,两边都不释放,信号一直挂着,通常没问题。但如果你 `connect` 时用了 `Callable.bind(some_node)`,那个 `some_node` 释放后,这条连接会变成"指向已释放对象的可调用"。Godot 会跳过它并在日志里打警告。
- **用 `bind` 绑定了非节点对象**。`signal.connect(callable.bind(refcounted_object))`,这条引用会拖住 `refcounted_object` 不释放。需要在合适时机手动 `disconnect`。

经验法则:Autoload 自己 `connect` 业务回调时,要么在业务节点 `_exit_tree` 中显式 `disconnect`,要么用 `CONNECT_ONE_SHOT` 让连接自动消亡。

### 坑 5:把场景切换写成 `GameSession` 字段

```gdscript
# 反例
GameSession.current_scene = preload("res://levels/level_2.tscn")
get_tree().change_scene_to_packed(GameSession.current_scene)
```

`GameSession` 既不是路由器,也不应该持有 `PackedScene` 引用。把场景管理抽成单独的 `SceneRouter` Autoload(第 15 篇展开),让 `GameSession` 只关心"我现在在哪一关的 id",不关心"那个 id 对应哪个 .tscn 文件"。这是把"数据"和"资源加载"分层的入口。

### 坑 6:在 Autoload 脚本上加 `@tool`

`@tool` 标记意味着脚本在编辑器中也会运行。Autoload 脚本加上 `@tool` 会导致打开任何场景都触发 `EventBus._ready`,如果里面有信号订阅或 `print`,编辑器会被污染日志,严重时甚至会因为编辑器期 `Engine.is_editor_hint()` 为 `true` 时调到只在运行时存在的资源而崩溃。Autoload 默认就不应该加 `@tool`,除非确实需要它在编辑器期间提供数据(例如自定义资源类型的编辑器辅助)。

### 坑 7:在 Autoload 里写 `_input` / `_unhandled_input`

Autoload 是节点,挂在 `/root/`,会接收输入事件回调。在 `EventBus` 里写 `_unhandled_input` 看似方便,实际会和主场景的 UI、玩家输入抢同一份事件,且没有暂停语义。**输入处理应该归属于业务节点**(玩家、UI),Autoload 顶多提供一个"重绑定的当前键位映射"作为数据源。

### 坑 8:用字符串签名 `emit` 信号

```gdscript
# 反例
EventBus.emit_signal("coins_changed", 100)

# 正例
EventBus.coins_changed.emit(100)
```

`emit_signal("...")` 是 Godot 3.x 风格,4.x 起信号本身就是一个 `Signal` 类型对象,直接 `.emit()` 调用。前者拼写错信号名时编译器不报错、运行时静默失败;后者拼错就是语法错误,立刻定位。`EventBus` 的信号需要被全工程不同模块调用,这种类型检查带来的安全性收益尤其大。同理订阅也用 `EventBus.coins_changed.connect(...)`,不要写 `EventBus.connect("coins_changed", ...)`。

### 坑 9:Autoload 间互相 `await` 自己的信号

```gdscript
# game_session.gd
func wait_for_level_clear() -> void:
    await EventBus.level_cleared
    # GameSession 自己发的信号自己 await
```

`GameSession` 自己 emit 了 `level_cleared`,自己再 `await` 同一条信号,意味着同步流程被拆成两个时钟周期。除非你有非常明确的解耦目的(比如要等所有其他订阅者都处理完再继续),否则这种自环 await 就是把简单的顺序调用复杂化。简单方案是直接在 emit 之后接着写后续逻辑。

### 坑 10:在 Autoload 里 `preload` 大量资源

```gdscript
# 反例
extends Node
const ALL_LEVELS := [
    preload("res://levels/l1.tscn"),
    preload("res://levels/l2.tscn"),
    # ... 30 个
]
```

`preload` 是脚本加载时同步发生的。Autoload 在引擎启动时就加载,这意味着这 30 个 `PackedScene` 全部在启动阶段被解析、纹理被加载、子资源被引用计数。游戏启动会变慢、内存峰值会变高,且只要 Autoload 不释放,这些 `PackedScene` 也不会释放。**全局表用 `Resource` 配表的方式由编辑器持有引用,业务代码按需 `load`**(第 18 篇详细展开)。Autoload 只持有 ID,不持有具体场景资源。如果不得不缓存,优先用 `load()`(运行时加载)而不是 `preload()`(编译期常量),并配合 `WeakRef` 在合适时机让 GC 回收。

## 手动验证

- [ ] 在 `Project Settings > Globals > Autoload` 中确认 `EventBus`、`GameSession`、`SaveProfile` 三项均勾选启用,排序 `EventBus` 在最上。
- [ ] 启动游戏,打开 Remote 场景树面板,确认 `/root/` 下有 `EventBus`、`GameSession`、`SaveProfile` 三个节点,且早于主场景。
- [ ] 让玩家受击,确认 HUD、音效节点等同时被触发,而玩家代码本身没有引用 HUD。
- [ ] 调用 `get_tree().reload_current_scene()`,验证 `GameSession.coins` 保持不变(说明它独立于关卡场景生命周期)。
- [ ] 调用 `GameSession.start_new_run()` 后再 reload,验证字段已重置到初始值。
- [ ] 临时在 Project Settings 中禁用 `GameSession`,启动后应在第一个 `GameSession.xxx` 处立刻报错(说明依赖是显式的,没有藏在字符串路径里)。
- [ ] 用 `Find in Files` 检查 `event_bus.gd`,文件里只能出现 `signal` 声明、注释和空行;一旦看到 `var`、`func` 或 `connect`,说明事件总线开始变质,要及时迁移到 `GameSession`。
- [ ] 启动游戏,从主菜单进入关卡再退回主菜单,反复 3 次,确认 `GameSession.coins` 在每次返回主菜单后归零,而 `SaveProfile.data.best_times` 中的最佳时间被保留。
