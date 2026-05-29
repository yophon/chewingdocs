# 类型化 GDScript 与面向引擎编程

GDScript 看起来像 Python,但把它当 Python 写,项目很快会变成一堆无类型脚本。它也能写类型,但把它当 Java / C# 写,又会变成啰嗦、别扭、和 Godot 编辑器打架的代码。GDScript 的正确位置是:**为 Godot 引擎写胶水代码的渐进类型脚本语言**。

从这一篇开始,后面的示例代码会越来越多。先把写法定下来:什么时候标类型、`@export` 怎么用、`@onready` 解决什么、信号怎么声明、`await` 到底是不是线程、哪些写法会让性能和维护性变差。

> 一句话先记住:**GDScript 的类型标注不是装饰,是给编辑器、静态检查和运行时优化看的契约**。热路径、跨脚本边界、信号参数、导出配置,都应该认真标类型;一次性临时代码可以少写。

---

## 一、GDScript 不是 Python

GDScript 长得像 Python:

```gdscript
func take_damage(amount):
    hp -= amount
```

但它运行在 Godot 引擎里,不是普通脚本环境。它要和节点、资源、信号、Inspector、场景序列化、C++ 引擎对象打交道。

无类型写法能跑,但问题很快出现:

```gdscript
var hp = 100
var target = null

func attack(enemy, weapon, modifier):
    enemy.take_damage(weapon.damage * modifier)
```

半年后你再看:

- `enemy` 是 `Node2D`、`Enemy` 还是字典?
- `weapon.damage` 是 int 还是 float?
- `modifier` 能不能为 null?
- `attack` 有没有返回值?
- IDE 为什么补全不出来?

更稳的写法:

```gdscript
var hp: int = 100
var target: Node2D

func attack(enemy: Enemy, weapon: WeaponData, modifier: float) -> void:
    enemy.take_damage(roundi(weapon.damage * modifier))
```

类型标注给你三件事:

1. **读代码的人知道你想要什么**
2. **编辑器能补全和检查**
3. **运行时少走一些动态派发**

> GDScript 可以不标类型,但项目代码不应该长期不标。越是会被别人调用、会反复执行、会被重构的代码,越应该标。

---

## 二、也不要把它写成 C#

另一种反向错误:所有地方都过度类型化,把简单脚本写成企业 Java。

比如这种:

```gdscript
var temporary_index: int = 0
var temporary_child_count: int = get_child_count()
var temporary_children: Array[Node] = get_children()

for temporary_child: Node in temporary_children:
    temporary_index += 1
```

这不是工程化,这是噪音。

更自然:

```gdscript
for child in get_children():
    if child is Enemy:
        child.queue_free()
```

GDScript 的类型策略应该是:

| 位置 | 建议 |
| --- | --- |
| 成员变量 | 标类型 |
| 函数参数 | 标类型 |
| 函数返回值 | 标类型 |
| 信号参数 | 标类型 |
| `@export` 字段 | 标类型 |
| 热路径局部变量 | 标类型 |
| 一次性局部变量 | 可以用类型推断 |

推荐写法:

```gdscript
@export var max_hp: int = 100
@export var move_speed: float = 180.0

var hp: int
var velocity: Vector2 = Vector2.ZERO

func take_damage(amount: int) -> void:
    hp = maxi(hp - amount, 0)

func _read_input() -> Vector2:
    return Vector2(
        Input.get_axis(&"move_left", &"move_right"),
        Input.get_axis(&"move_up", &"move_down")
    )
```

> 类型标注是为了减少误解,不是为了把每一行都写满。边界要清楚,内部可以让代码保持轻。

---

## 三、`class_name`:给脚本一个正式名字

没有 `class_name` 时,别的脚本想引用这个类型,通常要:

```gdscript
const PlayerScript = preload("res://player/player.gd")
```

写了:

```gdscript
class_name Player
extends CharacterBody2D
```

以后就可以直接:

```gdscript
var player: Player
```

这有几个好处:

- Inspector 里能识别类型
- 其它脚本能直接标类型
- 自动补全更准
- 重构时更容易搜

建议:

| 脚本 | 要不要 `class_name` |
| --- | --- |
| 玩家、敌人、组件、数据资源 | 要 |
| 只挂在某个一次性场景里的小脚本 | 可选 |
| 临时调试脚本 | 不必 |

例子:

```gdscript
# res://player/player.gd
class_name Player
extends CharacterBody2D

# res://data/weapon_data.gd
class_name WeaponData
extends Resource
```

> 能被别的地方当"类型"使用的脚本,就给 `class_name`。只给自己场景用的小脚本,不用强迫。

---

## 四、`@export`:把参数交给 Inspector

不要把手感参数写死:

```gdscript
var speed := 180.0
var jump_velocity := -320.0
```

这样每次调参都要改代码。更好的写法:

```gdscript
@export var speed: float = 180.0
@export var jump_velocity: float = -320.0
@export var max_hp: int = 100
```

这样参数会出现在 Inspector 里,你可以在编辑器里调,场景会保存对应值。

常用导出写法:

```gdscript
@export var enabled: bool = true
@export var display_name: String = "Slime"
@export var speed: float = 120.0
@export var icon: Texture2D
@export var target: Node2D
@export var weapon_data: WeaponData
```

带范围:

```gdscript
@export_range(0.0, 1000.0, 10.0) var speed: float = 180.0
@export_range(0, 100, 1) var max_hp: int = 100
```

分组:

```gdscript
@export_group("Movement")
@export var speed: float = 180.0
@export var acceleration: float = 1200.0
@export var friction: float = 1600.0

@export_group("Combat")
@export var max_hp: int = 100
@export var invincible_time: float = 0.4
```

用法边界:

| 适合 `@export` | 不适合 `@export` |
| --- | --- |
| 手感参数 | 运行时临时状态 |
| 资源引用 | 缓存变量 |
| 巡逻点、目标引用 | 每帧计算结果 |
| 最大血量、伤害、冷却 | 当前帧输入 |

> `@export` 是给设计时配置用的,不是给所有变量用的。当前血量可以是运行时状态,最大血量才适合导出。

---

## 五、`@onready`:等节点真的可用了再取

上一篇讲过,字段初始化时子节点不一定已经准备好。所以节点引用一般写:

```gdscript
@onready var sprite: Sprite2D = $Sprite2D
@onready var animation_player: AnimationPlayer = $AnimationPlayer
@onready var hurt_box: Area2D = $HurtBox
```

不要写:

```gdscript
var sprite: Sprite2D = $Sprite2D
```

也不要在每一帧反复取:

```gdscript
func _process(delta: float) -> void:
    $Sprite2D.flip_h = true # 不推荐:每帧解析 NodePath
```

缓存起来:

```gdscript
@onready var sprite: Sprite2D = $Sprite2D

func _process(delta: float) -> void:
    sprite.flip_h = true
```

如果节点不是自己的子节点,先问一句:为什么我要跨过去拿?

```gdscript
@onready var hud: HUD = $"../../UI/HUD" # 危险信号
```

通常可以改成:

```gdscript
signal hp_changed(current: int, max_value: int)
```

让 HUD 自己连接 Player 的信号。

> `@onready` 负责"取节点的时机",不负责"依赖设计是否合理"。能只取自己的子节点,就别跨场景硬找。

---

## 六、信号也要写类型

不要这样:

```gdscript
signal hp_changed
signal died
```

这样 IDE 不知道信号带什么参数。推荐:

```gdscript
signal hp_changed(current: int, max_value: int)
signal died
signal weapon_changed(weapon: WeaponData)
```

发信号:

```gdscript
hp_changed.emit(hp, max_hp)
```

连接:

```gdscript
player.hp_changed.connect(_on_player_hp_changed)

func _on_player_hp_changed(current: int, max_value: int) -> void:
    hp_bar.max_value = max_value
    hp_bar.value = current
```

如果同一个回调要带上下文,用 `bind`:

```gdscript
for button in job_buttons:
    button.pressed.connect(_on_job_pressed.bind(button.job_id))

func _on_job_pressed(job_id: StringName) -> void:
    select_job(job_id)
```

这比用字符串拼事件名稳:

```gdscript
# 不推荐
emit_signal("job_" + job_name + "_pressed")
```

> 信号名可以是事件,信号参数应该是数据。别把一堆语义塞进字符串里再解析。

---

## 七、`String`、`StringName`、`NodePath` 别混着用

GDScript 里有三类常见"字符串":

| 类型 | 用途 |
| --- | --- |
| `String` | 普通文本,会显示、拼接、存档 |
| `StringName` | 引擎内部名字,适合动作名、信号名、状态名 |
| `NodePath` | 节点路径 |

普通文本:

```gdscript
var title: String = "开始游戏"
```

动作名、状态名:

```gdscript
const STATE_IDLE: StringName = &"idle"
const STATE_RUN: StringName = &"run"

Input.is_action_pressed(&"move_left")
```

节点路径:

```gdscript
@export var target_path: NodePath
@onready var target: Node2D = get_node(target_path) as Node2D
```

为什么输入动作名用 `&"move_left"`?因为 `&"..."` 是 `StringName` 字面量。`InputMap`、信号名、节点名这些在引擎里本来就是 `StringName`,热路径上少一次转换。

简单规则:

```text
给玩家看的文字 → String
给引擎查名字   → StringName / &"..."
节点路径        → NodePath 或 $
```

---

## 八、数组和字典:能标就标

无类型数组:

```gdscript
var enemies := []
```

里面可以塞任何东西:

```gdscript
enemies.append(123)
enemies.append("slime")
enemies.append($Enemy)
```

后面遍历时,IDE 完全不知道元素是什么。

推荐:

```gdscript
var enemies: Array[Enemy] = []
var spawn_points: Array[Marker2D] = []
var damage_table: Dictionary[StringName, int] = {
    &"slime": 10,
    &"bat": 6,
}
```

遍历时:

```gdscript
for enemy: Enemy in enemies:
    enemy.take_damage(10)
```

但也别过度。临时数组可以简单写:

```gdscript
var candidates := get_tree().get_nodes_in_group(&"enemy")
```

如果这个数组要长期保存、跨函数传递、当公开 API,就标类型。

> 容器越长寿,越应该标类型。只活三行的临时数组,不用写得像数据库 schema。

---

## 九、`await` 不是线程

GDScript 的 `await` 很容易被误解成"开了异步线程"。不是。

它只是让当前函数等一个信号,期间把执行权还给主循环。

例子:

```gdscript
func die() -> void:
    animation_player.play(&"death")
    await animation_player.animation_finished
    queue_free()
```

意思是:

1. 播放死亡动画
2. 当前函数暂停
3. 游戏继续跑
4. 动画结束信号发出
5. 从 `await` 后面继续执行

它仍然在主线程,不会并行跑计算。不要用它处理重活:

```gdscript
# 不会让这段计算去后台线程
await heavy_generate_map()
```

真正的后台加载和线程任务,后面第 24 篇讲。

`await` 的常见坑是:等待期间节点可能已经被删。

```gdscript
func flash_then_damage(target: Enemy) -> void:
    await get_tree().create_timer(0.2).timeout
    target.take_damage(10) # target 可能已经死了
```

稳一点:

```gdscript
func flash_then_damage(target: Enemy) -> void:
    await get_tree().create_timer(0.2).timeout
    if not is_instance_valid(target):
        return
    target.take_damage(10)
```

> `await` 是"稍后继续",不是"后台并行"。一旦跨帧,就要考虑对象还在不在。

---

## 十、属性 setter:状态变化要收口

如果一个字段被改时,要同步 UI、发信号、限制范围,不要到处手写。

可以用 setter:

```gdscript
var hp: int = 100:
    set(value):
        hp = clampi(value, 0, max_hp)
        hp_changed.emit(hp, max_hp)

@export var max_hp: int = 100
signal hp_changed(current: int, max_value: int)
```

以后外部写:

```gdscript
player.hp -= 10
```

也会走 setter,自动 clamp 和 emit。

适合 setter 的场景:

- 血量变化
- 状态切换
- 装备变化
- 音量变化
- 配置项变化

不适合:

- 每帧高速变化的临时变量
- 只在函数内部用的局部变量
- 复杂副作用太多的逻辑

> setter 是状态入口,不是隐藏业务流程的地方。超过三五行,考虑写成明确方法。

---

## 十一、一个推荐的脚本模板

后面大部分脚本会按这个顺序写:

```gdscript
class_name Player
extends CharacterBody2D

signal hp_changed(current: int, max_value: int)
signal died

@export_group("Movement")
@export var speed: float = 180.0
@export var acceleration: float = 1200.0

@export_group("Stats")
@export var max_hp: int = 100

var hp: int:
    set(value):
        hp = clampi(value, 0, max_hp)
        hp_changed.emit(hp, max_hp)

var move_direction: Vector2 = Vector2.ZERO

@onready var sprite: Sprite2D = $Sprite2D
@onready var animation_player: AnimationPlayer = $AnimationPlayer

func _ready() -> void:
    hp = max_hp

func _physics_process(delta: float) -> void:
    move_direction = _read_move_direction()
    velocity = velocity.move_toward(move_direction * speed, acceleration * delta)
    move_and_slide()

func take_damage(amount: int) -> void:
    if amount <= 0:
        return
    hp -= amount
    if hp == 0:
        died.emit()

func _read_move_direction() -> Vector2:
    return Vector2(
        Input.get_axis(&"move_left", &"move_right"),
        Input.get_axis(&"move_up", &"move_down")
    )
```

顺序大致是:

```text
class_name / extends
signals
export 参数
运行时状态
@onready 节点缓存
生命周期函数
公开方法
私有辅助方法
```

这样写的好处是:别人打开文件,先看到这个脚本对外暴露了什么,再看到内部怎么跑。

---

## 十二、性能边界:别在热路径做这些

GDScript 早期不需要过度优化,但几个坏习惯要避开。

### 1. 每帧解析节点路径

不推荐:

```gdscript
func _process(delta: float) -> void:
    $Sprite2D.rotation += delta
```

推荐:

```gdscript
@onready var sprite: Sprite2D = $Sprite2D

func _process(delta: float) -> void:
    sprite.rotation += delta
```

### 2. 每帧拼字符串

不推荐:

```gdscript
func _process(delta: float) -> void:
    label.text = "HP: " + str(hp) + "/" + str(max_hp)
```

更好:血量变化时再改 UI。

```gdscript
func _on_hp_changed(current: int, max_value: int) -> void:
    label.text = "HP: %d/%d" % [current, max_value]
```

### 3. 每帧创建大量临时对象

不推荐:

```gdscript
func _process(delta: float) -> void:
    var enemies := get_tree().get_nodes_in_group(&"enemy")
    for enemy in enemies:
        ...
```

更好:敌人进场/出场时维护列表,或者降低查询频率。

### 4. 用字符串当状态机

能跑:

```gdscript
var state := "idle"
```

更好:

```gdscript
enum State { IDLE, RUN, JUMP, HURT }
var state: State = State.IDLE
```

字符串状态很容易拼错,enum 至少能让编辑器检查。

> 优化优先级:先写清楚,再看 profiler。只有每帧跑、成百上千对象跑、或者明显卡顿的地方,才值得提前收紧。

---

## 十三、验收清单

写完这一篇后,你的 GDScript 习惯应该变成:

1. 常用脚本有 `class_name`
2. 成员变量、函数参数、返回值标类型
3. Inspector 参数用 `@export`
4. 子节点引用用 `@onready`
5. 信号参数写类型
6. 输入动作名用 `&"action_name"`
7. 长寿命数组/字典写类型
8. 需要跨帧等待时用 `await`,但会检查对象是否还活着
9. 状态变化用方法或 setter 收口
10. `_process` / `_physics_process` 里不反复 `$Node`、拼字符串、全树搜索

---

## 十四、踩坑提醒

1. **所有东西都不标类型**  
   能跑,但补全、重构、排错都会变差。

2. **为了标类型把代码写得很重**  
   GDScript 不是 C#。边界和热路径认真标,临时代码保持轻。

3. **把 `@export` 当运行时状态**  
   `@export` 是设计时配置。当前血量、当前速度、临时目标不要随便导出。

4. **忘了 `@onready`**  
   子节点引用不要在字段初始化时直接 `$Node`。

5. **信号不写参数类型**  
   后面连接多了,你会忘记回调该收什么。

6. **以为 `await` 是多线程**  
   它只是等信号后继续。重计算不会自动去后台。

7. **每帧查节点、查 group、拼字符串**  
   单个没事,一多就卡。热路径要收敛。

8. **用字符串写所有状态**  
   状态机优先 enum 或 `StringName`,别靠裸字符串乱飞。

---

下一篇:`05-Resource-Signal与场景解耦基础.md`,讲怎么把"数据"和"在场对象"分开,以及怎么用 Signal 让 Player、HUD、音效、镜头互相不硬依赖。
