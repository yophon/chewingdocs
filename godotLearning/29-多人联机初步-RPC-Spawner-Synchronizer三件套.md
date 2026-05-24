# 29-多人联机初步:RPC、Spawner、Synchronizer 三件套

> 一句话导读:Godot 的高层联机不要求你写一行 TCP/UDP,它把"远程调用、节点同步、属性同步"抽成三个节点级语义,让你 200 行 GDScript 就能跑通一个权威服务器架构的双人样例。

`networkLearning` 系列已经讲过 TCP/UDP、序列化、连接生命周期、可靠/不可靠传输的取舍,这一篇不再重复。本篇只回答一个问题:**在 Godot 4.6 里,我有了那一层底层心智之后,该按什么节奏组装出第一个能跑的多人 2D 原型?** 答案是 `@rpc` 注解、`MultiplayerSpawner`、`MultiplayerSynchronizer` 这三件套,以及它们背后那条"权威/客户端预测/插值"的细线。

写这一篇之前需要先打消两个常见预期。第一,Godot 高层联机不是"开箱即用的网络游戏框架",它只解决"两个进程之间的状态同步";匹配大厅、好友列表、聊天室、反作弊都得你自己写或者接第三方。第二,2D 游戏的网络复杂度不比 3D 低,虽然带宽小,但玩家对"同步精度"的容忍度可能更低——一个像素级跳跃游戏里,远端玩家位置抖 8 像素,玩家立刻能看出来。本篇给的样例适合做合作 PVE、回合制、慢节奏 PVP 的最小骨架;真要做格斗、节奏类竞技游戏,还需要在三件套之上自己加一层预测/回滚。

## 1. 机制定位

多人联机在游戏开发里的复杂度,远超它字面看上去的"两个客户端互发消息"。一个稳定的多人 2D 游戏要同时回答这些问题:

- 谁有权决定一个实体的位置——客户端,还是服务器?
- 一个新加入的玩家应该看到几个怪、几个其他玩家、它们各自在哪?
- 玩家按下方向键到画面上看见角色挪动,中间能容忍多少毫秒?
- 网络丢包时,角色应该原地卡住,还是按速度往前预测?
- 服务器修正客户端预测错误时,玩家会看到角色"被拉回去"吗?

这些问题没有"通用对错",每个游戏都要在帧率手感和反作弊之间挑一个点。但 Godot 把"传输什么"和"在哪里跑权威逻辑"这两件事抽成了三个非常具体的节点级原语,让你可以先用最朴素的"服务器权威 + 简单插值"跑通,再按需要换更复杂的方案。

三个原语对应三类需求:

- **`@rpc` 注解**:函数级远程调用。你写一个普通的 GDScript 方法,加上 `@rpc(...)` 注解,这个方法在任何一端调用 `the_func.rpc(...)` 时,会按你的配置(谁能调、谁会收到、走可靠还是不可靠)在另一端被执行。它解决"事件型"通信:玩家开了一枪、按了交互、聊天发了一条。
- **`MultiplayerSpawner`**:节点级"生成同步"。当权威端在某个父节点下加了一个子节点(且这个子节点的场景在 spawner 的可生成列表里),spawner 会自动通知所有客户端在对等位置实例化同一个场景。它解决"新出现/消失的对象"同步:有人加入房间、生成了一个掉落物、刷出了一个怪。
- **`MultiplayerSynchronizer`**:属性级"状态同步"。配置好哪些属性要同步,权威端的这些属性每次发生变化,都会被发到其他端。它解决"持续变化的属性"同步:位置、血量、朝向、动画状态。

把这三件套和 `networkLearning` 已有的底层知识连起来:`@rpc` 是事件 = 消息;`MultiplayerSpawner` 是 lifecycle = create/destroy;`MultiplayerSynchronizer` 是 state diff = snapshot。这是任何同步引擎都绕不开的三块,Godot 把它们做成节点,让你"拖一拖"就完成了 80% 的样板代码。

新手最常见的错误写法,是把所有事都写成 `@rpc`。比如玩家移动,每帧把 position 用 RPC 广播给所有人;有人加入房间,用一个庞大的 `@rpc("any_peer")` 把所有现有玩家信息一次性传过去。这样的代码不是不能跑,而是带宽爆炸、状态难一致、并发难调试。三件套各司其职,才是 Godot 高层 API 的设计意图。

## 2. Godot 心智

要理解三件套,先理解 Godot 高层联机的几条骨架规则。

**第一条:每个节点都有一个 multiplayer authority。** 默认是 1(也就是服务器)。一个节点的属性只在它的 authority 端被"读"为权威值;`MultiplayerSynchronizer` 同步属性时,是把 authority 端的值复制到其他端。`@rpc("authority", ...)` 的方法只有 authority 调用、其他端执行;`@rpc("any_peer", ...)` 的方法谁都能调,在指定 peer 上执行。你通过 `node.set_multiplayer_authority(peer_id)` 改变所有权——这一步在做"客户端控制自己角色"时极常用。

**第二条:有一个全局 `MultiplayerAPI`,但每个子树可以有自己的。** 默认场景树根下挂的是 `SceneMultiplayer`(`MultiplayerAPI` 的实现)。你通过 `multiplayer.multiplayer_peer = peer` 设置传输层(常用 `ENetMultiplayerPeer`)。`multiplayer.is_server()`、`multiplayer.get_unique_id()`、`multiplayer.peer_connected` 等都是从这个 API 上拿。

**第三条:`@rpc` 的注解参数顺序在 4.x 是固定的。** 完整签名是 `@rpc(mode, sync, transfer_mode, transfer_channel)`,前三个可以按任意顺序写,最后一个 `transfer_channel`(整数)必须是最后。常用组合:

| 写法 | 含义 |
| --- | --- |
| `@rpc` | 默认 `@rpc("authority", "call_remote", "reliable", 0)` |
| `@rpc("any_peer")` | 客户端也可以发起,在指定 peer 上执行 |
| `@rpc("any_peer", "call_local")` | 同上,加上"调用端自己也跑一份" |
| `@rpc("authority", "unreliable_ordered")` | 服务器到客户端的不可靠有序广播,适合高频状态 |
| `@rpc("any_peer", "reliable", 1)` | 不同 channel 上的可靠通道,避免被高频不可靠流量挤占 |

模式参数永远是 `"authority"` 或 `"any_peer"`,不要写成旧版的 `master`/`puppet`/`remote`——那是 Godot 3.x 的术语,4.x 已经移除。

**第四条:`MultiplayerSpawner` 的两种模式。** 一种是"声明式 spawnable scenes":在编辑器里把若干 PackedScene 拖进 spawner 的 spawnable scenes 列表,然后只要权威端把这些场景的实例加到 `spawn_path` 指向的父节点下,spawner 自动让所有客户端实例化同样的场景。另一种是"自定义 spawn":你写一个 `spawn_function: Callable`,接受 `Variant data`,返回一个还没入树的 Node;调 `spawner.spawn(data)`,所有 peer 都按这个 callable 生成节点。前者覆盖 80% 的需求,后者用于"需要按数据动态选择生成什么"的情况。

**第五条:`MultiplayerSynchronizer` 是"挂在节点上的同步器"。** 它的 `replication_config` 是一个 `SceneReplicationConfig` 资源,里面写了"哪些 NodePath 的属性参与 spawn 同步、哪些参与 sync 同步"。spawn 同步是节点刚生成时的一次性传输(适合不会变化的参数,比如怪物的等级、皮肤);sync 同步是周期性传输(适合 position、velocity)。`replication_interval` 控制完整同步的间隔,`delta_interval` 控制增量同步的间隔,都用秒为单位,0 表示每帧。

**第六条:权威、预测、插值。** Godot 三件套本身只给你"权威端发送、其他端接收并赋值"这条最直白的语义。客户端预测(自己先按输入更新位置,再被服务器纠错)、回滚(发现错了之后倒回去重算几帧)是要你在三件套之上自己写的。如果你做的是回合制、卡牌、合作 PVE,通常用不到预测,服务器权威 + 客户端插值就够了;真要做竞技 PVP 联机,你需要再加一层手写的预测/回滚——这一篇不深入展开,但下面的工程实现会给你一个能扩展的骨架。

**第七条:`SceneMultiplayer` 与 `MultiplayerAPI` 的关系。** `MultiplayerAPI` 是基类,`SceneMultiplayer` 是 Godot 默认的实现,它专门理解"场景树"这个概念,知道怎么按节点路径同步 RPC、按场景层级管理 spawner。你几乎不会直接 `new` 一个 `MultiplayerAPI`,但你会用 `multiplayer.is_server()` / `multiplayer.peer_connected.connect(...)` / `multiplayer.get_unique_id()` 这些 API。`SceneMultiplayer` 还提供了 `peer_authenticating` 信号,可以在 ENet 握手完成后、正式认作 peer 之前做一次身份认证——独立游戏阶段用不到,但要做反作弊时这是入口。

## 3. 工程实现

下面给一个能跑的双人样例。架构是:服务器权威,玩家按方向键时把输入打给服务器,服务器更新位置,所有客户端通过 `MultiplayerSynchronizer` 收到位置同步。Spawner 负责"每个新连上的 peer 自动生成一个玩家节点"。

项目结构:

```
res://
├── main.tscn         # 启动场景,有 Host / Join 按钮
├── main.gd
├── game.tscn         # 实际游戏房间,挂 spawner 和 players 容器
├── game.gd
├── player.tscn       # 单个玩家场景
└── player.gd
```

先看 `main.gd`,负责选 Host / Join 然后切到 `game.tscn`:

```gdscript
# res://main.gd
extends Control

const PORT := 7777
const MAX_CLIENTS := 7

@onready var _address: LineEdit = %Address
@onready var _host_btn: Button = %HostButton
@onready var _join_btn: Button = %JoinButton
@onready var _status: Label = %Status

func _ready() -> void:
    _host_btn.pressed.connect(_on_host)
    _join_btn.pressed.connect(_on_join)

func _on_host() -> void:
    var peer := ENetMultiplayerPeer.new()
    var err := peer.create_server(PORT, MAX_CLIENTS)
    if err != OK:
        _status.text = "host failed: %d" % err
        return
    multiplayer.multiplayer_peer = peer
    _enter_game()

func _on_join() -> void:
    var peer := ENetMultiplayerPeer.new()
    var addr := _address.text if _address.text else "127.0.0.1"
    var err := peer.create_client(addr, PORT)
    if err != OK:
        _status.text = "join failed: %d" % err
        return
    multiplayer.multiplayer_peer = peer
    _enter_game()

func _enter_game() -> void:
    get_tree().change_scene_to_file("res://game.tscn")
```

`game.tscn` 的关键结构:根节点是 `Node` 类型,挂 `game.gd`;子节点有 `Players`(纯容器 `Node`)和 `PlayerSpawner`(`MultiplayerSpawner` 节点)。在编辑器里把 spawner 的 `spawn_path` 设成 `../Players`,把 `player.tscn` 加进 spawnable scenes 列表。

`game.gd` 负责"有人连进来就生成玩家,有人断开就移除玩家",只有服务器执行这段逻辑:

```gdscript
# res://game.gd
extends Node

const PLAYER_SCENE := preload("res://player.tscn")

@onready var _players: Node = $Players

func _ready() -> void:
    if multiplayer.is_server():
        multiplayer.peer_connected.connect(_on_peer_connected)
        multiplayer.peer_disconnected.connect(_on_peer_disconnected)
        # 把本机服务器也算作 peer id 1 的玩家
        _spawn_player(1)

func _on_peer_connected(peer_id: int) -> void:
    _spawn_player(peer_id)

func _on_peer_disconnected(peer_id: int) -> void:
    var node := _players.get_node_or_null(str(peer_id))
    if node:
        node.queue_free()

func _spawn_player(peer_id: int) -> void:
    var player := PLAYER_SCENE.instantiate()
    player.name = str(peer_id)   # spawner 靠 name 在两端找到同一个对象
    player.set_multiplayer_authority(peer_id)  # 该玩家自己拥有这个节点
    _players.add_child(player, true)
```

`player.tscn` 是一个 `CharacterBody2D` 根,挂 `player.gd`,再挂一个 `Sprite2D`、一个 `CollisionShape2D`,以及一个 `MultiplayerSynchronizer` 节点。Synchronizer 的 `replication_config` 是一个 `.tres`,里面声明同步 `..:position` 这条属性路径(`..` 指向父节点,也就是 `CharacterBody2D` 自身)。配置写法:在编辑器选中 synchronizer,在 Inspector 里点 Replication 标签,然后 "Add property to sync" 输入 `..:position`,把 Sync 列勾上。`replication_interval` 留 0,表示尽量每帧同步。

`player.gd` 的关键是:服务器跑物理逻辑,客户端只把输入打给服务器:

```gdscript
# res://player.gd
extends CharacterBody2D

const SPEED := 220.0
var _input := Vector2.ZERO

func _ready() -> void:
    if is_multiplayer_authority():
        # 仅本机控制自己:打开摄像头 / 启用输入处理
        set_process_input(true)
    else:
        set_process_input(false)

func _input(event: InputEvent) -> void:
    if not is_multiplayer_authority():
        return
    var v := Vector2(
        Input.get_axis("move_left", "move_right"),
        Input.get_axis("move_up", "move_down")
    )
    if v != _input:
        _input = v
        push_input.rpc_id(1, v)  # 把输入只发给服务器,id=1

func _physics_process(delta: float) -> void:
    if not multiplayer.is_server():
        return  # 客户端不跑物理,等同步器把 position 推过来
    velocity = _input * SPEED
    move_and_slide()

@rpc("any_peer", "reliable")
func push_input(v: Vector2) -> void:
    # 仅服务器执行:确认这条 RPC 来自该玩家本人
    var sender := multiplayer.get_remote_sender_id()
    if sender != int(name):
        return
    _input = v
```

这一套就跑起来了:服务器开 7777 端口,客户端连进来,各自按方向键,两边屏幕上都能看到两个玩家在动,服务器是权威源。如果想加入"客户端预测"——也就是按下方向键的瞬间本地就开始移动,而不是等服务器确认——把 `_physics_process` 改成"无论是不是服务器都跑一次 `move_and_slide`",但用 synchronizer 同步过来的 `position` 在每帧物理之后纠正本地结果。这是一个最朴素的预测;真正的回滚需要保存历史输入和历史状态,这一篇不展开。

## 4. 调参和验收

**`replication_interval` 与带宽。** 默认 0 表示每帧同步,2D 小项目完全扛得住。但当你有 100 个怪同时移动,每帧同步 100 个 Vector2 会把带宽吃满。生产中常见做法是:玩家 synchronizer 用 0(高刷新),NPC synchronizer 用 0.05(每秒 20 帧)或 0.1(每秒 10 帧),配合客户端插值(下一段讲)看起来仍然平滑。

**插值的边界。** Godot 4.4+ 给 `CharacterBody2D` 引入了 Physics Interpolation,在低 tick 下渲染层会自动在两次物理帧之间插值,看起来很顺滑。但这一层插值只针对本地物理,**不会自动对网络同步的远端节点插值**。如果你发现远端玩家在 10Hz 同步下"跳着移动",你需要在 `_process` 里手动用 `lerp` 把渲染位置过渡到目标位置,而不是直接赋值。一种工程化做法是:不要让 synchronizer 直接同步 `position`,而是同步一个 `target_position` 自定义属性,本地 `_process` 把 `position` 平滑追到 `target_position`。

**可见性过滤的两种用法。** `MultiplayerSynchronizer.set_visibility_for(peer, bool)` 是显式的"对某个 peer 单独设可见性",适合"密语聊天"、"队伍内信息"这类静态分组。`add_visibility_filter(callable)` 是动态过滤,callable 接收一个 peer_id 参数返回 bool,适合"摄像机视野内才同步"这类基于运行时位置的过滤。后者会显著降带宽,但要注意 callable 不要在内部分配新对象,否则每帧都被调一次会产生 GC 压力。

**transfer_mode 的选择。** 一句话总结:位置类高频状态用 `unreliable_ordered`(丢一两帧无所谓,但顺序不能乱);事件类用 `reliable`(开枪、拾取、聊天,丢了游戏就坏);极少数"丢了就丢了"的非关键反馈用 `unreliable`(粒子触发、表情)。`reliable` 的代价是 ENet 会确认重传,延迟会比 unreliable 高,不要把每帧的 position 都加 `reliable`,否则一卡就累积。

**transfer_channel 的隔离。** ENet 支持多 channel,channel 0 是默认。把"高频不可靠状态"和"低频可靠事件"分到不同 channel,可以让前者的拥塞不堵后者的确认。`MultiplayerSpawner` 自己也用 channel,看官方文档对应的设置。

**`set_multiplayer_authority(peer_id)` 的时机。** 必须在节点入树前或入树时立刻设,不要等几帧后再设。理由是 synchronizer 在节点入树后会立刻开始按 authority 同步,如果你晚设了一帧,这一帧的同步可能从默认 authority(=1,服务器)往客户端推一次错误状态,造成"鬼影抖动"。上面的样例代码里,先 `set_multiplayer_authority`,再 `add_child`,顺序对就是这个原因。

**`call_local` 的取舍。** 默认 `@rpc` 是 `call_remote`,即调用方自己不会跑一遍。如果你做的是"加血"这种事,服务器调用 `add_hp(10)` 时希望自己也跑一遍把血加上,要写 `@rpc("any_peer", "call_local")`。否则服务器自己永远不会执行 RPC 体,数据只会更新到客户端。

**怎么算这一篇完成了。** 最低验收:两个 Godot 实例,一个 Host,一个 Join(同机用 127.0.0.1 即可),双方各能看到两个角色,各自方向键控制自己的角色,移动同步基本无延迟(局域网下 < 50ms)。断开客户端后,服务器画面里那个玩家消失;再次加入,重新出现。

**断线、重连与房间清理。** 这是新手做联机最容易忽略的边界。`multiplayer.peer_disconnected` 在客户端意外断开时会触发,服务器要负责清理那个 peer 关联的所有对象(包括玩家节点、所属的子弹、被这个玩家持有的物品)。如果你只清玩家节点,留下一堆"无主"子弹和"被该 peer 设为 authority"的资源,后果是这些节点会停止同步,但仍占内存,新加入的玩家可能看到一堆漂浮的鬼影。一个保守做法是为每个 peer 维护一份"所拥有节点"的列表,disconnect 时按列表批量 free。

**服务器权威 vs 客户端预测的取舍。** 服务器权威最简单,代价是按下方向键到画面响应有一次往返延迟。局域网下这没问题(几毫秒),公网上 100-200ms 玩家会明显感到"角色滞涩"。客户端预测可以掩盖这段延迟:本地立刻按输入更新位置,服务器回包时如果发现本地预测错了,把位置纠正回来(俗称"rubber band")。预测的边界是:确定性弱的逻辑(随机伤害、暴击)永远走服务器权威;高确定性逻辑(直线移动、跳跃)可以预测。这是个独立、很大的话题,本系列不展开,但下一阶段如果你做的是动作竞速游戏,值得专门读 Gaffer On Games 那几篇经典文章。

## 5. 踩坑

**`@rpc` 注解参数顺序写错。** 4.x 的注解形式是 `@rpc(mode, sync, transfer_mode, transfer_channel)`,前三个字符串可以乱序,但 channel 整数必须最后。如果你写成 `@rpc(0, "any_peer", "reliable")`,Godot 会报"unknown argument"。3.x 的 `master`/`puppet`/`remote` 关键字在 4.x 不再存在,旧教程千万别照搬。

**RPC 在 `_ready` 里直接调,可能远端节点还没准备好。** 一个节点在权威端入树时,可能远端 spawner 还没收到 spawn 消息,你这时 `some_method.rpc()` 调远端的方法,远端那个节点都不存在。常见做法:让 spawner 处理新节点入树,所有 RPC 调用从"用户输入"或者"明确的连接信号"之后开始,不要在 `_ready` 同帧就发。

**`MultiplayerSpawner.spawn_path` 指向的是父节点。** 不是 spawner 自己。spawn 的子节点被加到这个父节点下,在远端也是同样的父子关系。一个常见错误是把 `spawn_path` 指向了 spawner 自己,结果一加子节点就出递归同步。

**`spawnable_scenes` 是路径数组,不是 PackedScene。** 编辑器里看起来你在拖 PackedScene,实际上 Godot 存的是 `res://...tscn` 字符串路径。`add_spawnable_scene("res://enemies/slime.tscn")` 是代码里加新的可生成场景的方式,4.x 的 API 接受字符串,不要传 `preload` 进来。

**`MultiplayerSynchronizer` 的 `replication_config` 一定要存成单独 `.tres`。** 如果你只在内存里给 `synchronizer.replication_config = SceneReplicationConfig.new()` 然后 `add_property(...)`,这个配置不会被打包到场景文件里,也不会同步到客户端——客户端那一份 synchronizer 拿到的是空配置,什么都不会同步。新手最痛的一坑:"我代码里加了属性怎么没用?"——把 `replication_config` 通过 Inspector 保存成独立资源,挂上去。

**`set_multiplayer_authority(peer_id, recursive: bool = true)` 默认递归。** 也就是说,设置某个父节点的 authority,会把它所有子节点(包括 synchronizer)也改成同一个 authority。这是大部分情况下你想要的,但如果你想"父节点归玩家所有,但子节点的某个 synchronizer 留在服务器权威下"(比如玩家身上有个 NPC 跟随),就要在子节点上再调一次 `set_multiplayer_authority(1, false)` 来覆盖。

**`name` 要是字符串化的 peer_id。** Godot 在生成 spawn 时,两端要靠节点的 `name` 互相对应。如果服务器把玩家节点 `name` 设成 `Player1` 而客户端是 `Player_1`,spawner 在客户端找不到这个节点,同步就断了。最稳的做法是用 `peer_id` 转字符串当 name(像样例那样),既能在 `_on_peer_disconnected` 时用 `peer_id` 找回这个节点,也能在 RPC 里验证 sender 身份。

**`multiplayer.get_remote_sender_id()` 只在 RPC handler 里有意义。** 在其他地方调返回 0。在 RPC 里用这个 ID 做服务器侧的身份验证(像样例里防止 A 玩家伪造 B 玩家的输入),是基本的反作弊纪律。

**`ENetMultiplayerPeer` 在 Web 导出里默认不可用。** Web 上 UDP 受限,Godot 4.x 提供 `WebSocketMultiplayerPeer` / `WebRTCMultiplayerPeer` 作为替代。如果你的项目同时要导 PC 和 Web,要做一个抽象层让用户在两种 peer 之间切换;不要锁死 ENet。

**localhost 测试时 Windows 防火墙第一次会弹窗。** 第一次 Host 后操作系统会问"允许 Godot 通过防火墙吗",忘了点允许会导致客户端连不上。Linux/macOS 一般无感,但 Windows 用户报"连不上"九成是这个。

**别把每帧 position 写成 `@rpc("any_peer")` 广播。** 三件套就是为了避免这个写法。`MultiplayerSynchronizer` 内部已经做了 delta 编码、批量打包、按 interval 调度,自己写 RPC 每帧广播 position 的带宽会比 synchronizer 高一个量级。

**`call_local` 不等于"立刻执行"。** 这是一个微妙但容易出 Bug 的细节。`@rpc("any_peer", "call_local")` 的方法被调用时,本地执行被排进 MultiplayerAPI 的下一帧 tick,而不是立刻调用。如果你写了 `add_hp.rpc(5)` 紧接着 `assert(self.hp == old_hp + 5)`,断言会失败,因为 RPC 还没跑。要本地立即生效就直接调函数 `add_hp(5)`,要广播再 `add_hp.rpc(5)`,两步分开写。

**`MultiplayerSpawner` 在客户端生成节点时,该节点的 `_ready` 仍然会跑。** 这意味着你写在 `_ready` 里的初始化逻辑两端都会跑——客户端那一份的初始化可能跟服务器期望不一致,造成"刚出生的怪两边数据差一点"。一个保守做法是把 `_ready` 拆成"两端都跑的纯结构初始化"和"仅服务器跑的状态初始化",后者用 `if multiplayer.is_server()` 保护。

## 手动验证

- [ ] 同一台机器开两个 Godot 编辑器实例(或开一个再开一个导出的可执行),Host 一个、Join 一个,主菜单切到 game.tscn 后两个窗口都能看见两个角色。
- [ ] 在 Host 窗口里按方向键移动,Join 窗口里那只对应角色同步移动;反向也成立。延迟在 50ms 内手感与单机几乎一致。
- [ ] 关掉 Join 客户端,Host 窗口里对应玩家节点消失;重新 Join,玩家再次出现,且 `name` 一致。
- [ ] 在 RPC 里加一行 `print(multiplayer.get_remote_sender_id())` 验证服务器能区分两个客户端;尝试把 `push_input.rpc_id(1, v)` 改成 `push_input.rpc(v)` 看是否报错或漏调用。
- [ ] 把 `replication_interval` 改成 0.1,远端玩家会变得明显抖动;在 `player.gd` 里实现一个简单的 `lerp` 平滑后,远端再次顺滑。
- [ ] 启动时故意不开 Host 直接 Join,UI 会提示 "join failed: ..." 而不是崩溃。
