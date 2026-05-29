# 多人联机初步:RPC、Spawner、Synchronizer 三件套

多人联机不是“把玩家位置发给别人”这么简单。至少要解决谁说了算、谁生成节点、哪些属性同步、延迟和丢包怎么办。

> 一句话先记住:**RPC 传事件,Spawner 传生成,Synchronizer 传持续状态。**

---

## 一、三件套各管什么

```text
@rpc                     远程调用函数,适合开枪、交互、聊天
MultiplayerSpawner       同步生成和销毁节点
MultiplayerSynchronizer  同步属性,比如位置、血量、动画状态
```

不要所有东西都用 RPC。持续变化的位置每帧 RPC 广播,很快就会乱。

---

## 二、先做服务器权威

最小原则:

```text
客户端发送输入
服务器计算结果
服务器同步状态
客户端显示结果
```

这比“客户端各自说自己在哪”慢一点,但更清楚,也更不容易作弊。

---

## 三、启动 Host / Join

```gdscript
# res://network/network_boot.gd
extends Node

const PORT := 24567
const ADDRESS := "127.0.0.1"

func host() -> void:
    var peer := ENetMultiplayerPeer.new()
    var err := peer.create_server(PORT, 8)
    if err != OK:
        push_error("Host failed: %s" % err)
        return
    multiplayer.multiplayer_peer = peer

func join() -> void:
    var peer := ENetMultiplayerPeer.new()
    var err := peer.create_client(ADDRESS, PORT)
    if err != OK:
        push_error("Join failed: %s" % err)
        return
    multiplayer.multiplayer_peer = peer
```

这只适合局域网或本机测试。公网、匹配、房间、NAT 不是这篇的范围。

---

## 四、玩家输入用 RPC

客户端发输入给服务器:

```gdscript
@rpc("any_peer", "unreliable")
func submit_input(input: Vector2) -> void:
    if not multiplayer.is_server():
        return

    var peer_id := multiplayer.get_remote_sender_id()
    var player := _players.get(peer_id)
    if player != null:
        player.set_input(input)
```

客户端每物理帧:

```gdscript
func _physics_process(_delta: float) -> void:
    if multiplayer.is_server():
        return

    var input := Input.get_vector(&"move_left", &"move_right", &"move_up", &"move_down")
    submit_input.rpc_id(1, input)
```

`unreliable` 适合高频输入。丢一帧输入没关系,下一帧会补。

---

## 五、Spawner 生成玩家

场景结构:

```text
Game
├── Players
└── MultiplayerSpawner
```

`MultiplayerSpawner.spawn_path` 指向 `Players`。把 `Player.tscn` 加到 spawnable scenes。

服务器在玩家连接时生成:

```gdscript
func _ready() -> void:
    if multiplayer.is_server():
        multiplayer.peer_connected.connect(_spawn_player)
        _spawn_player(1)

func _spawn_player(peer_id: int) -> void:
    var player := preload("res://player/net_player.tscn").instantiate()
    player.name = str(peer_id)
    player.set_multiplayer_authority(1)
    %Players.add_child(player)
    _players[peer_id] = player
```

服务器生成后,Spawner 通知客户端也生成。

---

## 六、Synchronizer 同步属性

在 `Player.tscn` 下加:

```text
MultiplayerSynchronizer
```

配置同步:

```text
root_path = ..
properties:
  position
  velocity
  hp
```

服务器改这些属性,客户端收到同步。

慢节奏合作游戏可以直接用。动作游戏还需要客户端插值:

```gdscript
var _remote_target_position: Vector2

func _process(delta: float) -> void:
    if not is_multiplayer_authority():
        global_position = global_position.lerp(_remote_target_position, 1.0 - exp(-12.0 * delta))
```

---

## 七、哪些 RPC 要 reliable

用可靠:

```text
开始游戏
打开门
拾取唯一道具
聊天消息
确认结算
```

用不可靠:

```text
移动输入
瞄准方向
临时动画朝向
高频位置辅助
```

可靠消息会排队,不要拿它传每帧输入。

---

## 八、验收

- 本机能 host 和 join。
- 新 peer 加入后能看到自己的玩家和已有玩家。
- 玩家生成通过 `MultiplayerSpawner`。
- 持续属性通过 `MultiplayerSynchronizer`。
- 输入用 RPC 发给服务器。
- 高频输入不用 reliable。

---

## 常见坑

**坑 1:每帧 RPC 广播 position。**

用 synchronizer 或自己做 snapshot,不要乱发函数。

**坑 2:客户端直接决定权威状态。**

原型能跑,但很难防作弊和纠错。先让服务器权威。

**坑 3:节点 name 不稳定。**

多人同步靠节点路径,玩家节点名要可预测,比如 peer id。

**坑 4:把联网和单机逻辑完全写两套。**

尽量让单机也走同一套输入/状态边界,只是 transport 不同。

---

下一篇是发售前工程检查表。
