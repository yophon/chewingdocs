# Autoload、事件总线与全局状态边界

Godot 项目很容易长出一个 `Global.gd`。一开始只存分数,后来存金币、玩家、HUD、敌人列表、当前菜单、存档路径。最后所有脚本都依赖它,谁也不敢改。

> 一句话先记住:**Autoload 适合放服务,不适合当杂物间。**

---

## 一、Autoload 解决什么

Autoload 是启动时就挂到 `/root` 下的节点。场景切换不会销毁它。

适合放:

```text
SceneManager   场景流
SaveSystem     存档读写
EventBus       全局事件
AudioManager   全局音乐和音效入口
GameSession    本局会话状态
```

不适合放:

```text
当前按钮 hover 文本
某个敌人的临时目标
某个 UI 面板的打开状态
某一关里还剩几个箱子
```

判断标准:这个东西是否跨场景存在?如果只属于当前关卡,就放关卡里。

---

## 二、三类全局东西分开

不要写一个 `Global` 装所有东西。拆成三类:

```text
EventBus     只放 signal,不放业务字段
GameSession 只放本局临时状态
SaveSystem  只管磁盘读写
```

事件总线:

```gdscript
# res://systems/event_bus.gd
extends Node

signal player_died
signal player_hp_changed(current: int, maximum: int)
signal item_picked(item_id: StringName, count: int)
signal level_completed(level_id: StringName, stats: Dictionary)
```

会话状态:

```gdscript
# res://systems/game_session.gd
extends Node

var current_level_id: StringName = &""
var gold: int = 0
var inventory: Array[StringName] = []

func reset() -> void:
    current_level_id = &""
    gold = 0
    inventory.clear()
```

存档系统继续用第 14 篇的 `SaveSystem`。

---

## 三、事件总线只做转发

`EventBus` 里不要写逻辑:

```gdscript
# 不要这样
func player_died() -> void:
    SaveSystem.save_game(...)
    SceneManager.go_to_main_menu()
```

事件总线应该只声明信号。谁关心谁监听:

```gdscript
func _ready() -> void:
    EventBus.player_died.connect(_on_player_died)

func _on_player_died() -> void:
    SceneManager.player_died()
```

这样事件总线不会变成第二个 `Global`。

---

## 四、什么时候不用 EventBus

同一场景内父子节点通信,直接信号连接就够:

```gdscript
player.died.connect(_on_player_died)
```

不需要绕一圈:

```gdscript
player -> EventBus -> level
```

适合 EventBus 的场景:

- 发出方和接收方不在同一个场景。
- 接收方可能有多个。
- 发出方不应该知道谁处理事件。
- 事件是游戏级别的,不是某个小控件内部的。

---

## 五、GameSession 不是存档

`GameSession` 是本局游戏运行中的状态:

```text
当前关卡
本局金币
临时 buff
当前检查点
本局击杀统计
```

它可以最后被 SaveSystem 写盘,但它自己不等于存档。

死亡重开时,你可能只重置关卡状态:

```gdscript
func restart_run() -> void:
    gold = 0
    inventory.clear()
```

回主菜单新开游戏时再完整 reset。

---

## 六、注册顺序要明确

Autoload 注册顺序会影响 `_ready()` 里能访问谁。

推荐顺序:

```text
EventBus
SaveSystem
AudioManager
GameSession
SceneManager
```

底层服务在前,依赖它们的管理器在后。不要让 `EventBus` 反过来调用 `SceneManager`。

---

## 七、暂停时谁还要跑

暂停游戏后,很多节点会停。Autoload 也要按职责设置:

```gdscript
func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
```

通常:

```text
EventBus       不跑 process,无所谓
SaveSystem     ALWAYS
AudioManager   ALWAYS
GameSession    默认或 PAUSABLE
SceneManager   ALWAYS
```

暂停菜单、转场、保存、音乐淡出这类东西不能被暂停卡住。

---

## 验收

- 没有一个包办一切的 `Global.gd`。
- `EventBus` 只声明信号。
- 本局状态和永久存档分开。
- 当前关卡临时状态不进 Autoload。
- Autoload 注册顺序有依赖方向。
- 暂停时仍需要工作的服务设置了 `PROCESS_MODE_ALWAYS`。

---

## 常见坑

**坑 1:把方便访问当成全局理由。**

“拿起来方便”不是理由。生命周期才是理由。

**坑 2:EventBus 里写业务逻辑。**

它会变成隐藏的 SceneManager。只发信号。

**坑 3:重开关卡以为 Autoload 会重置。**

不会。要手动 reset。

**坑 4:所有东西都直接读 GameSession。**

能通过信号传的就通过信号传,不要让 UI、敌人、关卡都随便改会话状态。

---

下一篇讲单个角色内部如何组件化。
