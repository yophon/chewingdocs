# 04-类型化 GDScript 与面向引擎编程

> 一句话导读:GDScript 不是严格静态语言,是 **gradually typed**(渐进类型)。类型标注是你换取性能、自动补全和编辑器集成的代价,而不是语法义务。

第 03 篇把场景树和生命周期讲完了。从这一篇开始,代码会越来越多。在写代码之前,先把 GDScript 的真实形态讲清楚:它既不是 Python(虽然长得像),也不是 C#(虽然能标类型)。它是一门为引擎而生的脚本语言,设计目标是让"少量胶水代码"能直接驱动一个 C++ 引擎。

熟悉 TypeScript 的工程师可以把 GDScript 看成"运行时是 JavaScript、编译期可以选择是 TypeScript"的语言:你写多少类型,引擎就还你多少静态保证和字节码优化。这条心智不正,后面写得越多越难受。

## 1. 机制定位

来自其他语言的工程师在 GDScript 上最常见的两类错误:

一种把它当成 Python,所有变量都不标类型,函数签名空空荡荡。代码能跑,但 Godot 编辑器的自动补全只剩一堆 `Variant`,IDE 提示永远是"可能存在的方法",运行时每一次属性访问都要走多层 dispatch。等项目长到几十个脚本,任何一次重命名都要靠 grep,Bug 全部留到运行期才现身。

另一种是 C# / Java 工程师,看到 `var x: int = 0` 就要求每个变量都标类型,把 GDScript 当成 C# 写,结果是大量 `Variant` 转换、和引擎签名打架,代码冗长却没换到任何额外保证。

这两种写法都没踩在 GDScript 的设计意图上。GDScript 的官方定位是"渐进类型"(gradual typing):类型标注是可选的,引擎接受混合类型与无类型代码,但当你写出类型,编译器会立刻把这块代码编译成更紧凑的字节码,运行得更快,补全也更准。

工程上的判断标准其实很简单:**这段代码会在 `_process` / `_physics_process` 里每帧执行吗?会被信号在热路径上反复触发吗?它的入参出参是不是和其他脚本对接的边界?如果是,标类型;如果只是一段一次性初始化代码,可以省。**

更进一步的工程判断:**类型也是 IDE 给你的可读性**。一段无类型的 `func attack(target, weapon, modifier)` 半年后回来看,你需要去翻调用点才能猜出参数含义;而 `func attack(target: Enemy, weapon: Weapon, modifier: float) -> int` 的签名本身就是文档。独立游戏开发者经常一个人维护几万行代码,代码注释会落后,签名不会 —— 编译器会替你校对签名。

本篇要解决的问题就是这一条:让你写出的 GDScript 既不是无类型的"脚本风",也不是过度类型化的"C# 风",而是与引擎心智对齐的、可被工具链分析、可被字节码优化的工程代码。后续 26 篇里的所有代码块都默认按本篇约定的姿势书写,不会再单独说明。

## 2. Godot 心智

GDScript 的核心抽象有四件:**类型标注**、**注解(annotations)**、**`Variant` 系统**、**Callable / Signal**。它们一起构成"GDScript 与 C++ 引擎之间的契约"。

### 渐进类型的真实含义

GDScript 是 gradually typed:类型可选,有类型则验,无类型则信。Godot 源码 `modules/gdscript/README.md` 把这条写得很直接 —— "Static analysis in a gradually typed language is a best-effort situation"。当编译器看到一个 `var x: int` 被赋值给一个 `var y`(无类型),它不会报错,因为 `y` 是 `Variant`,理论上可以是任何东西。它只是相信你。

这种宽松带来两个工程后果。第一,无类型代码可以与类型代码自由互操作,你不必一次性把项目全部标类型,可以从热路径开始逐步迁移。第二,运行时仍然有类型错误的可能 —— 如果你把一个无类型变量传给一个 `int` 参数,而它运行时是字符串,程序会在那一行崩溃。

所以"类型标注换性能"这句话需要拆开看。它对 GDScript 来说真正成立的形式是:

- 标了类型的局部变量,编译器在该作用域内可以生成"类型专用"的 opcode。例如 `i += 1`,如果 `i: int`,字节码会直接走整数加法指令;如果 `i` 无类型,要走 `Variant + Variant` 的通用路径,带类型 dispatch。
- 标了类型的成员变量与函数签名,跨脚本调用时编译器可以省掉一层动态查表,直接把函数指针写进字节码。

`modules/gdscript/README.md` 的原话:"Typed code is safer code and faster code"。这不是营销,是字节码层面的事实。

### 注解(Annotation)而不是装饰器

GDScript 的 `@export`、`@onready`、`@tool`、`@rpc` 看起来像 Python 装饰器,但本质完全不同。它们是**编译期注解**,被 GDScript 解析器识别后直接影响生成的字节码与类元数据。

- `@export var hp: int = 100` 把 `hp` 注册到该脚本的 Inspector 暴露属性表,引擎在加载场景时会从 `.tscn` 里把保存的值塞回来。
- `@onready var sprite: Sprite2D = $Sprite` 把赋值推迟到 `_ready()` 之前那一刻,保证此时子节点已经入树。它解决的是"在 `_init` / 类成员初始化阶段,子节点还不存在"这个生命周期窟窿。
- `@tool` 让脚本在编辑器里也运行,而不仅是游戏运行时。
- `@rpc` 是多人联机时给函数挂的同步策略。

这些注解不能写在普通表达式里,也不能动态启用。它们与字节码一同生成,直接进入引擎的 ClassDB。

### `Variant` 与 `Callable`

`Variant` 是 Godot 整个内核的"无类型容器"。GDScript 里所有无类型变量、所有信号参数、所有元数据,本质都是 `Variant`。它在 C++ 层有约 30 种可能类型(`int`、`float`、`String`、`Vector2`、`Object*`、`Array`、`Dictionary` 等)。`Variant` 操作要做一次类型 tag 检查,然后分派到具体类型的逻辑。

这种设计是 Godot 跨语言互操作的代价:GDScript、C#、GDExtension(C++/Rust)都通过 `Variant` 与引擎核心通讯。所以哪怕你把 GDScript 全标了类型,跨过引擎边界(例如调用 `Node.get_meta("foo")`)拿回来的仍然是 `Variant`,**必须显式转**才能继续走快路径:`var hp: int = meta.get("hp", 0) as int`。

`Callable` 是"函数引用"的统一表示:你可以把一个方法名、Lambda、绑定参数后的方法,统一塞进 `Callable`,然后传给 `connect()`、`call_deferred()`、`Tween` 等系统。它替代了 Godot 3.x 时代到处出现的 `String` 方法名。

理解这两个抽象,后面看 `signal.connect(_on_pressed)`、`array.map(square)`、`tween.tween_method(set_alpha, 0.0, 1.0, 0.5)` 才不会觉得是魔法。`Callable.bind(args...)` 还能创建"提前绑定参数"的新 `Callable`,让一个回调可以携带上下文连接到多个不同源:

```gdscript
for button in $Buttons.get_children():
    button.pressed.connect(_on_pressed.bind(button.name))

func _on_pressed(button_name: StringName) -> void:
    print(button_name, " was pressed")
```

这是 4.x 信号系统能在工程化项目里取代"事件总线 + 字符串匹配"的关键能力。

### 容器与值语义

GDScript 有两个内置容器要单独拎出来说:`Array` 和 `Dictionary`。它们默认是**无类型的**(等价于 `Array[Variant]`、`Dictionary[Variant, Variant]`)。从 4.x 开始你可以写**类型化容器**:`Array[int]`、`Array[Node2D]`、`Dictionary[String, int]`。后者会在添加元素时做运行时类型检查,且能让编辑器知道遍历变量的类型。

另外,GDScript 的数学类型 `Vector2`、`Color`、`Rect2`、`Transform2D` 全部是**值类型**(struct-like)。`var a := Vector2(1, 0); var b := a; b.x = 2` 之后,`a.x` 仍然是 1。这与 Java 工程师的直觉相反,值得早期就内化。

一条相关的实操:把 `position` 当成"可以原地改"的字段是错的。`Node2D.position` 是属性 getter,返回的是 `Vector2` 值拷贝。`self.position.x = 5` 等于"取一份 position 拷贝、改它的 x、然后丢掉",原节点 `position` 完全没动。正确写法:`position = Vector2(5, position.y)` 或 `position += Vector2.RIGHT`。这是 Godot 4.x 早期最频繁的"为什么我的角色不动"问题来源。

### 字符串系列:`String` / `StringName` / `NodePath`

GDScript 里看起来都是"字符串"的东西其实有三种:

- `String`:UTF-8 编码,可拼接、可切片、可格式化,正常用法。
- `StringName`:引擎内部的 interned string,创建时会进哈希表,后续比较是 O(1) 指针比较。`Input.get_axis(&"ui_left", ...)`、信号名、节点名、`NodePath` 内部段,全部是 `StringName`。
- `NodePath`:`/root/Game/Player` 这种带斜杠的节点路径。`$Sprite/Hand` 编译期会被转成 `NodePath`,运行时由场景树解析。

工程上的原则:**每帧执行的常量字符串都用 `&"..."` 写成 `StringName`**;**多帧才动一次的拼接性字符串用 `String`**;**节点路径就交给 `$`**。混着写不会爆,但每次发信号或查动作时,引擎会偷偷帮你做 `String -> StringName` 转换,这部分在 Profiler 里基本看不到,但热路径上累积起来不小。

## 3. 工程实现

下面给一段贴近实战的玩家脚本(只是 GDScript 用法演示,不是完整角色控制器 —— 那是第 06 篇的活)。把它放在 `res://player/player_intro.gd`,挂在任何 `Node2D` 上都可运行。

```gdscript
# res://player/player_intro.gd
class_name PlayerIntro
extends Node2D

## 暴露给 Inspector,可以在场景里直接调
@export_range(50.0, 800.0, 10.0) var max_speed: float = 240.0
@export var initial_hp: int = 100
@export var allowed_jobs: Array[StringName] = [&"knight", &"wizard"]

## 信号声明也建议带参数类型
signal hp_changed(new_hp: int, max_hp: int)
signal job_locked(job: StringName)

const TAG: StringName = &"PlayerIntro"

var _hp: int = 0
var _velocity: Vector2 = Vector2.ZERO

## @onready 把子节点缓存到 _ready() 触发前
@onready var _sprite: Sprite2D = $Sprite as Sprite2D
@onready var _label: Label = %DebugLabel  ## Unique Node 引用,见 05 篇

func _ready() -> void:
    _hp = initial_hp
    hp_changed.emit(_hp, initial_hp)
    print("[%s] ready, hp=%d, jobs=%s" % [TAG, _hp, allowed_jobs])

func _process(delta: float) -> void:
    ## 热路径:所有局部变量都标类型,opcode 走整数/浮点专用指令
    var input_dir: Vector2 = _read_input()
    _velocity = input_dir * max_speed
    position += _velocity * delta

func take_damage(amount: int) -> void:
    if amount <= 0:
        return
    _hp = maxi(_hp - amount, 0)
    hp_changed.emit(_hp, initial_hp)
    if _hp == 0:
        await get_tree().create_timer(0.3).timeout
        queue_free()

func lock_job(job: StringName) -> void:
    if job not in allowed_jobs:
        push_warning("unknown job: %s" % job)
        return
    job_locked.emit(job)

func _read_input() -> Vector2:
    return Vector2(
        Input.get_axis(&"ui_left", &"ui_right"),
        Input.get_axis(&"ui_up", &"ui_down")
    )
```

逐点解读这段代码体现的几个关键决策:

**1. `class_name` + `extends`:让脚本成为一等公民**

写了 `class_name PlayerIntro` 之后,这个脚本就被注册到全局 ClassDB,其他脚本可以直接 `var p: PlayerIntro = ...` 拿到完整的静态类型支持,而不必 `preload("res://player/player_intro.gd")`。

**2. `@export` 的细化变体**

`@export_range` 是 `@export` 的子集,带 UI 滑块,适合需要在 Inspector 反复调参的字段。还有 `@export_file("*.json")`、`@export_node_path("Node2D")`、`@export_group("Stats")` 等,本质都是给编辑器额外的展示信息。

**3. `StringName` 与 `&"..."` 字面量**

注意 `Input.get_axis(&"ui_left", ...)` 里的 `&`。它把字符串字面量编译成 `StringName` 而不是 `String`。`StringName` 是引擎内部的 interned string,所有动作名、信号名、节点名比较时都走 `StringName`。**在每帧调用的输入查询里用 `&"..."`,可以省掉一次 `String -> StringName` 的转换**,这是 4.x 的细节优化点。

**4. 信号声明带类型**

`signal hp_changed(new_hp: int, max_hp: int)` 让 IDE 知道连接到这个信号的回调签名,自动补全 `func _on_hp_changed(new_hp: int, max_hp: int) -> void` 时不再瞎猜。运行时则不会强校验类型 —— 渐进类型的妥协。

**5. `await` 是协程而不是异步线程**

`await get_tree().create_timer(0.3).timeout` 把当前函数暂停 0.3 秒,但**它仍然在主线程**。协程在等待时让出执行权,游戏循环照常推进,定时器到点后从这里继续。它不是多线程,所以不需要关心数据竞争;但也意味着 `await` 期间整个函数的执行被切片,引用的节点可能已经被释放 —— 后面踩坑章节会再细讲。

**6. `await queue_free()` 不是真正释放**

`queue_free()` 是"标记这个节点在本帧结束后释放",立刻返回。不要写 `await queue_free()`,它不返回 Signal,不会有任何效果。

**7. setter / getter:`var x: int: set = _set_x`**

GDScript 支持给字段挂 setter/getter,语法与 Python `@property` 不同,在字段同一行写:

```gdscript
var hp: int = 100:
    set(value):
        hp = clampi(value, 0, max_hp)
        hp_changed.emit(hp, max_hp)
```

它的好处是把"变量赋值"和"派生事件"绑在一起,业务代码只写 `hp = hp - dmg`,信号自动发出。坏处是 setter 是同步执行的,如果里面做了重活,会让每个赋值都变慢;且 setter 内部对自己赋值时要小心写"循环触发"(`hp = value` 不会重新触发 setter,因为 GDScript 这里做了识别)。

再来看一段配套的容器用法:

```gdscript
# res://systems/inventory.gd
class_name Inventory
extends RefCounted

## 类型化容器:运行时会在 append 时校验
var items: Array[StringName] = []
var stats: Dictionary[StringName, int] = {}

## 函数参数与返回值类型化,跨脚本调用走快路径
func add(item: StringName, count: int = 1) -> bool:
    if count <= 0:
        return false
    for i in count:
        items.append(item)
    stats[item] = stats.get(item, 0) + count
    return true

func count_of(item: StringName) -> int:
    return stats.get(item, 0)

## 遍历类型化容器时,it 的类型也是 StringName,可走专用 opcode
func summary() -> Array[String]:
    var lines: Array[String] = []
    for item in stats.keys():
        var n: int = stats[item]
        lines.append("%s x%d" % [item, n])
    return lines
```

`extends RefCounted` 而不是 `Node`,因为这个类不参与场景树。`RefCounted` 走引用计数,作用域结束自动释放,适合"纯数据 / 业务对象"。`Node` 是被场景树管理的;`Object` 是手动 `free()` 的。第 05 篇会反复用到 `Resource`(它也继承自 `RefCounted`)。

**面向引擎编程 vs 面向对象编程**

到这里要给"面向引擎编程"一个清楚的定义,以免读者把它当成一句口号。GDScript 在语法上完全支持 OOP —— `extends`、虚方法、构造函数、继承链 —— 但 Godot 项目里真正能把代码量压下来的,不是把所有逻辑塞进一个深继承树,而是:

- **场景即组件**。一个 `.tscn` 文件可以挂脚本、可以预制子节点、可以暴露 `@export` 字段,本质是一个"带可视化配置的类"。复用一段逻辑,通常的做法是把它做成场景而不是基类。
- **`Resource` 即数据**。`.tres` 文件能在 Inspector 编辑、能跨场景共享、能版本管理,把"敌人配置 / 关卡参数 / 技能定义"全部塞进 `Resource`,数据与代码分离自然形成。
- **`Signal` 即事件**。父对子不发信号,只 `get_node` 调方法;子对父发信号,父连接信号回调。这条单向依赖规则一旦守住,场景间就能解耦到"父场景换一棵子树都不影响"。

类型化 GDScript 提供的是"代码层的契约";`Resource` + `Signal` 提供的是"场景层的契约"。两者合起来,才是 Godot 4.6 推荐的工程姿势。第 05 篇会深入展开后两块。

## 4. 调参和验收

类型化 GDScript 的"调参",不是改某个数值,而是决定"哪些代码标到什么程度"。给一份在多次项目里验过的优先级:

| 优先级 | 必标 | 备注 |
| --- | --- | --- |
| 最高 | `_process` / `_physics_process` 里的所有局部变量与表达式 | 每帧执行,字节码优化收益最大 |
| 高 | `class_name` 类的所有 public 方法签名 | 它们是跨脚本边界,影响调用方的静态分析 |
| 高 | `signal` 声明的参数 | 让信号接收方的回调能被 IDE 校验 |
| 中 | `@export` 字段 | Inspector 会按类型给出对应控件;不标会退化成无类型字段 |
| 中 | 类型化容器 `Array[T]` / `Dictionary[K, V]` | 用于会被反复 append 的容器,避免无类型 `Variant` 装箱 |
| 低 | 一次性初始化代码、`_ready` 内本地变量 | 不在热路径,标不标对运行时影响极小 |
| 慎用 | 把所有变量都标类型 | 对引擎类型的强制转换有时反而引入额外检查 |

**度量类型化效果的两个工具**

第一,**项目设置 -> Debug -> GDScript -> Warnings**。把 `Untyped Declaration`、`Inferred Declaration`、`Unsafe Cast`、`Unsafe Call Argument`、`Unsafe Property Access` 全开成"警告"或更高。Godot 会在编辑器里直接黄字标出"这里 GDScript 编译器只能走 Variant 慢路径"。整理这些警告,是把项目从无类型迁到类型化最有效的清单。

特别提醒一下 `Unsafe Cast` 这条 —— 它对应的就是文章前面提到的 `as` 失败返回 `null` 的场景,以及 `Dictionary.get(key)` 返回 `Variant` 然后被赋给类型化变量。打开后会让代码风格被迫向"显式 cast、显式默认值"靠拢,长期看是好事;短期会觉得编辑器啰嗦,这是必要的痛。

第二,**Debugger 的 Profiler 标签**。运行游戏后切到 Debugger -> Profiler,在底部看到每个 GDScript 函数的"自身时间 / 总时间"。把热路径函数从无类型版本改成类型版本,对比同一段代码的执行时间,基本能看到 10%-30% 的差距(整数运算 / 简单向量数学场景下),复杂场景差距更大。要让对比稳定,记得让函数运行足够长(几千次以上调用),否则单次 0.01ms 的差距很难看出来。

另外,**Editor -> Editor Settings -> Network -> Language Server** 默认就开着 LSP,把 VS Code + `godot-tools` 插件接上,体验会更接近你熟悉的工程化 IDE 工作流。GDScript 类型越完整,LSP 跳转和重命名就越准。

**验收清单**

- 项目设置中,GDScript 警告级别中至少把 `Untyped Declaration` 与 `Unsafe Call Argument` 打开。
- 玩家脚本(或任何 `_physics_process` 脚本)中的所有局部变量都有类型(或用 `:=` 推断)。
- 信号声明都带参数类型。
- 没有任何函数依靠 `String` 传方法名(应改成 `Callable`)。
- 把一个简单循环(例如 1000 次浮点累加)分别用类型化与无类型实现,在 Profiler 里能观察到差异。

## 5. 踩坑

**坑 1:`:=` 不是万能糖**

`var x := foo()` 的类型由 `foo()` 的返回类型决定。如果 `foo()` 返回 `Variant`(例如 `Dictionary.get(key)`),`x` 会被推断成 `Variant`,后续操作不会有 opcode 优化。要么显式标 `var x: int = dict.get("hp", 0)`,要么用类型化 `Dictionary[String, int]` 让 `get` 返回类型变成 `int`。

**坑 2:`as` 失败返回 `null` 而不是抛错**

`var s: Sprite2D = $Sprite as Sprite2D` 看起来安全,但如果 `$Sprite` 其实是 `AnimatedSprite2D`,这行的结果是 `s = null`,运行到第一次访问 `s.texture` 才会爆 `Invalid call on null`。建议在 `_ready()` 里加一句 `assert(s != null, "Sprite node missing or wrong type")`。

**坑 3:`@onready` + `@export` 一起用,值会被覆盖**

如果在同一个变量上同时挂 `@onready` 和 `@export`,`@onready` 在 `_ready` 前会用初始化表达式覆盖掉 `@export` 从 `.tscn` 反序列化回来的值。文档明确不推荐这种组合;典型表现是"我在 Inspector 改了值,运行时还是默认值"。

**坑 4:`await` 期间节点可能已经被 `free`**

```gdscript
func _on_button_pressed() -> void:
    await get_tree().create_timer(2.0).timeout
    label.text = "done"   ## 危险:这两秒里 self 可能已经被 free
```

经验做法:`await` 之后立即 `if not is_inside_tree(): return`(对于 `Node`),或者 `if not is_instance_valid(self): return`(对于 `RefCounted` 等)。

**坑 5:类型化容器与无类型容器不能隐式互转**

```gdscript
var typed: Array[int] = [1, 2, 3]
var raw: Array = typed             ## 这一行 编辑器会警告,运行时仍能走但失去类型保证
var back: Array[int] = raw         ## 这一行 运行时报错:Array[int] 不能由无类型 Array 赋值
```

正确的反向赋值:`var back: Array[int] = Array(raw, TYPE_INT, &"", null)`,显式构造。

**坑 6:`Variant` 装箱开销在循环里被放大**

```gdscript
var total := 0
var values: Array = [1, 2, 3]      ## 无类型容器
for v in values:                   ## v 是 Variant
    total += v                     ## 每次循环都有一次 Variant -> int 的拆箱
```

改成 `var values: Array[int] = [1, 2, 3]`,`v` 直接是 `int`,opcode 走整数加法。

**坑 7:全局 Autoload 单例用类型化引用,而不是字符串**

```gdscript
## 不好
get_node("/root/GameState").score += 1

## 推荐:Autoload 声明了 class_name GameState 后
GameState.score += 1
```

第二种写法编译期就能查到 `GameState` 是否有 `score` 字段。第 16 篇会单独讲 Autoload 的设计边界。

**坑 8:别把 `static func` 当成"自由函数"用**

GDScript 支持 `static func`,但它不是 Python `@staticmethod` 的等价物。`static func` 不能访问 `self`,且**不能访问该脚本的 `class_name` 之外的注解(如 `@export`)**。它在工具类里非常合适,但别拿来做"全局工具函数"集散地 —— 那应该是一个 Autoload 单例脚本的事。

**坑 9:`int` 与 `float` 之间的隐式转换会触发警告**

类型化 GDScript 区分整型与浮点型 opcode。把一个 `float` 赋值给 `var x: int = ...` 不会自动截断,而是触发 `Narrowing Conversion` 警告。要么显式 `int(value)`、`floori(value)`、`roundi(value)`,要么把字段本身改成 `float`。混着写"看起来都是数字"的代码,是 4.x 里最常见的字节码优化失败原因之一。

**坑 10:Lambda 的捕获是按引用而不是按值**

```gdscript
var callbacks: Array[Callable] = []
for i in 3:
    callbacks.append(func(): print(i))  ## 三个 lambda 共享同一个 i
for cb in callbacks:
    cb.call()
```

输出可能是 `3 3 3` 而不是 `0 1 2`。这是闭包语义里的经典坑。修法:用 `Callable.bind` 把当前值固化,`callbacks.append((func(x): print(x)).bind(i))`。

**坑 11:`is` 检查的是运行时类,`as` 转的是静态类型**

`if node is Sprite2D` 走运行时类型检查;`var s := node as Sprite2D` 是编译期把表达式类型缩窄,失败给 `null`。如果两者要联用,先 `is` 再用,而不是 `as` 完了再判 `null`,可读性更好。

---

类型化 GDScript 本质上是"你愿意写多少契约,引擎就给你多少保证"。在 2D 独立游戏这种代码量中等、迭代频繁的项目里,不要走极端 —— 不必为了一致性把每个 lambda 都标全,也不要为图省事让所有变量都漂在 `Variant` 里。**把类型当成给热路径与跨脚本边界的工程税**,该交的交,该省的省。下一篇我们用 `Resource` 与 `Signal` 把这层"类型契约"延伸到数据与通讯,让场景间彻底解耦。

## 手动验证

- [ ] 在项目设置中,GDScript 警告级别里 `Untyped Declaration` 与 `Unsafe Call Argument` 都已被打开为 "Warn"。
- [ ] 写一段 1000 次浮点累加的循环,一次无类型一次类型化,在 Debugger Profiler 里能观察到执行时间差异。
- [ ] 玩家脚本(或本篇示例 `PlayerIntro`)放进项目后,在 Inspector 里能看到 `max_speed` 显示为滑块,`allowed_jobs` 显示为字符串数组。
- [ ] 在另一个脚本里写 `var p: PlayerIntro = ...`,IDE 能补全 `take_damage`、`lock_job` 等方法。
- [ ] 故意把 `_read_input()` 的返回类型从 `Vector2` 改成无标注,观察 `position += _velocity * delta` 是否多出新的 `Unsafe ...` 警告。
- [ ] 故意在 `await` 之后立刻 `queue_free()`,然后访问 `self.position`,在调试器里复现"对已释放对象操作"的错误,作为本篇坑 4 的实证。

---

**下一篇:** `05-Resource-Signal与场景解耦基础.md`,把类型化的"数据"与"事件"延伸到资源与信号系统。
