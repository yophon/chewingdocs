# 24-异步加载-WorkerThreadPool 与 Physics Interpolation

> 一句话导读:`WorkerThreadPool` 是 4.x 取代手写 `Thread` 的统一调度器,Physics Interpolation 是 4.4+ 修补低物理 tick 抖动的官方机制,两者背后都是同一个心智——"什么放主线程、什么不放"。

游戏需要"假装一切都很流畅"。但底层的真实情况是:渲染按显示器刷新率走,逻辑按 `_process` 走,物理按 `physics_ticks_per_second` 走,资源加载理论上随时可发生。这四条节拍线如果不协调,玩家立刻能看出来——loading 时游戏卡死、移动物体跳跃、镜头抖动。这一篇讲 Godot 4.6 下处理这些不同步问题的三把工具:`ResourceLoader` 的线程化加载、`WorkerThreadPool` 异步任务派发、Physics Interpolation 物理插值。

这三件事单独都是"加分项",合在一起是"独立游戏从可玩原型走到可发布所必经的最后一关"。本篇不展开 GDExtension(25 篇)和发布检查清单(30 篇),只聚焦"运行时的异步与平滑"。读完之后,你应当知道:① 任意可能阻塞的操作如何挪出主线程,② 物理 tick 和渲染帧之间为什么会抖、怎么修,③ 如何在发布版里诊断"为什么这台机器卡"。三个能力放在一起,才能让独立游戏在玩家千差万别的硬件上保持基本的体面。

## 1. 机制定位

主线程(main thread)在 Godot 里干很多事:`_process`、`_input`、`_physics_process` 回调、信号派发、节点树管理、UI 绘制提交。这是单一线程,任何一个阻塞操作都会让整帧停下来。

**资源加载是典型的阻塞操作**。`load("res://maps/big_level.tscn")` 在大场景或多依赖资源的情况下可能阻塞几百毫秒到几秒——足以让玩家以为游戏崩溃。新手解法是"塞进 `_ready()` 让玩家在 loading 页面等",但实际上 `_ready()` 一样跑在主线程,只是因为之前没有内容才显得"不卡"。一旦你想做"过场动画 + 进度条 + 边玩边预加载",阻塞式 load 就完全玩不转。

**密集计算同理**。寻路网格烘焙、程序化关卡生成(22 篇)、AI 决策树评估,如果都在主线程上跑,大场景会出现"逻辑帧炸到几十毫秒"的尖刺。这种尖刺玩家看不到精确数字,但能感觉到"游戏一瞬间停了"。

**物理 tick 和渲染帧不对齐**是另一类问题。默认 `physics_ticks_per_second = 60`,渲染如果在 60 fps 显示器上、刚好跑 60 fps,两者每帧对应一次,顺滑;但实际情况:① 显示器 144 Hz,渲染每帧物理只推一次,144 帧里只有 60 帧有更新,中间 84 帧物体不动,呈现"原地等待 + 跳跃"效果;② 显示器 60 Hz 但 fps 跌到 50,物理累积、间断推进,物体微微抖。Physics Interpolation 就是解决这两类抖动。

**资源生命周期管理**是个容易被忽略的"异步副作用"。Godot 4 的 `Resource` 是 `RefCounted` 的子类,引用计数自动管理:某个 `PackedScene` 没有节点引用它了,引擎自动释放显存里的纹理、声音、shader。但异步加载场景下,如果你 `load_threaded_request` 一个场景但忘了 `load_threaded_get`,加载完的 Resource 会被引擎持有(等你来取),不会自动释放;如果你预加载了一堆 chunk 但切关时没显式置 null,旧关卡的纹理仍占着显存,玩多关后显存爆掉。"加载 → 用 → 释放"这条链路,在异步流程里要更显式地写出来。

新手对这些机制的常见误判:

第一,**以为"开 thread 就能加速"**。线程不是免费的——Godot 节点系统不是线程安全的,任何 `add_child`、`queue_free`、`set_position` 都不能在 worker 线程跑。你能在 worker 线程做的只有"纯计算"和"调用线程安全的引擎 API"(`ResourceLoader` 显式标了线程安全)。误用会导致随机崩溃,极难定位。

第二,**以为"开了 Physics Interpolation 就丝滑"**。它确实让物体在视觉上插值平滑,但代价是引入 1 个物理 tick 的视觉延迟(渲染时显示"上一两个 tick 之间的插值"),输入响应感会变慢一点。某些动作游戏(平台跳、bullet hell)对输入响应延迟极敏感,这种情况你要权衡"丝滑"和"跟手"。

第三,**以为"loading 页就该转圈"**。Godot 4 的 `ResourceLoader.load_threaded_*` 提供精确进度回调,你完全可以做"具体百分比 + 当前正加载哪个资源"的体面 loading 页。而且加载完不止是"切场景"——可以异步预热敌人池、AI 行为树、shader 编译,让真实切到关卡时已经热好。

工程心智要回到一个根本问题:**这个工作能不能挪出主线程?如果能,挪去哪?** Godot 4.6 提供的答案是分层的:

- IO 阻塞型(读盘、解压、序列化):`ResourceLoader.load_threaded_request`
- 通用计算型:`WorkerThreadPool.add_task` / `add_group_task`
- 渲染与物理不同步:`physics_interpolation` 项目设置 + `reset_physics_interpolation`
- 节点操作必须回主线程:`call_deferred` / signal `call_deferred` 模式

## 2. Godot 心智

先列清楚 4.6 下相关的核心 API:

| API | 用途 | 4.x 状态 |
| --- | --- | --- |
| `ResourceLoader.load_threaded_request(path)` | 触发异步资源加载 | 4.0+ |
| `ResourceLoader.load_threaded_get_status(path, progress)` | 查询进度,`progress` 数组返回 [0.0, 1.0] | 4.0+ |
| `ResourceLoader.load_threaded_get(path)` | 取回加载好的 Resource(未完成会阻塞) | 4.0+ |
| `WorkerThreadPool.add_task(callable, high_priority, description)` | 派发单个任务到 worker | 4.0+ 引入,取代 `Thread.start` |
| `WorkerThreadPool.add_group_task(callable, elements, ...)` | 并行执行多次,适合数据并行 | 4.0+ |
| `WorkerThreadPool.wait_for_task_completion(task_id)` | 阻塞等待任务结束 | 4.0+ |
| `WorkerThreadPool.is_task_completed(task_id)` | 非阻塞查询 | 4.0+ |
| `SceneTree.physics_interpolation` | 运行时开关 Physics Interpolation | 4.4+ |
| `ProjectSettings: physics/common/physics_interpolation` | 启动时开关 | 4.4+ |
| `Node.reset_physics_interpolation()` | 瞬移后调用,防止插值"拉丝" | 4.4+ |
| `Node.physics_interpolation_mode` | 个别节点禁用 / 启用 | 4.4+ |

**`WorkerThreadPool` 的心智模型**是"一个工程师把活塞进任务队列,几个 worker 线程从队列里抢着干"。你不再管"线程怎么启动、怎么销毁、怎么传参",只关心"这个 Callable 在后台跑,跑完我去取"。具体步骤:

1. `var id := WorkerThreadPool.add_task(some_callable, false, "load level")`,返回 task ID。
2. 主线程继续干别的事。
3. 任意时刻 `WorkerThreadPool.is_task_completed(id)` 检查是否结束。
4. 取结果之前**必须** `WorkerThreadPool.wait_for_task_completion(id)`,文档明确写了"Every task must be waited for completion",否则任务内部分配的资源不会清理。

**重要约束**:Callable 在 worker 线程跑,所以它内部不能碰节点树、不能 `add_child`、不能改 UI。能干的事:纯算法、`ResourceLoader.load`(同步阻塞但线程安全)、对 PackedArray 的处理、文件 IO(`FileAccess` 的多数操作线程安全)。需要回主线程的事用 `call_deferred("xxx", arg)`,这会把调用推迟到下一帧的主线程入口。

**`ResourceLoader.load_threaded_request` 的心智**是"先订单后取货"。`load_threaded_request(path)` 不返回 Resource,只是把订单挂进引擎内部的加载队列;之后你每帧轮询 `load_threaded_get_status(path, progress_array)`,根据 progress 数组的 [0] 元素(0.0-1.0)更新进度条;状态变成 `THREAD_LOAD_LOADED` 时调 `load_threaded_get(path)` 取回。这套 API 设计巧妙之处在于"幂等"——同一个 path 多次 request 不会重复加载,可以放心在多处代码调用。

**Physics Interpolation 的心智**是"渲染看到的物体位置是上两个物理状态之间插值"。引擎在每个物理 tick 结束时把所有节点的 transform 存为"上一帧 transform";下一个 tick 开始前,渲染按当前时间在 tick 周期内的比例,在上一帧和当前帧 transform 之间线性插值。结果:即使物理 tick 只有 60 Hz、渲染 144 Hz,物体看起来仍然丝滑。

但插值有个边界情况:**瞬移**。把角色从 (0,0) 设到 (1000,0),如果不告诉引擎"这是瞬移",它会在两帧之间画出一条贯穿屏幕的"拉丝"。`Node.reset_physics_interpolation()` 就是用来"把上一帧 transform 设成当前 transform"——告诉引擎"忘掉上一次,从这里重新开始"。瞬移、关卡切换、相机切换都需要这一步。

启用条件:**所有移动逻辑必须在 `_physics_process` 里执行**,而不是 `_process`。原因是 Physics Interpolation 只在 physics tick 之间插值,你在 `_process` 里改 transform 会被插值"擦除"或抖动。这是个把整个项目代码风格往"物理驱动"方向推的设计——也是为什么文档建议早期决策。如果你的项目混着 `_process` 改 transform 和 `_physics_process` 改 transform,开了插值后某些物体丝滑、某些抖,定位起来很痛苦。

**引用计数与资源泄漏**。`Resource` 子类(包括 `PackedScene`、`Texture2D`、`AudioStream`)都是 `RefCounted`,引用归零自动释放。但有几个常见漏点:① Autoload 单例里持有的 Resource 永不释放,因为单例永远在;② signal 连接的 Callable 隐式持有 Resource;③ `WorkerThreadPool` task 里 capture 的 Resource 在 task 没 wait 时不释放;④ `ResourceLoader.load_threaded_get` 没调用时,资源被引擎内部持有。定位手段是 `OS.print_resources_in_use()` 或 `Performance.OBJECT_RESOURCE_COUNT`,在 debug 构建里看资源总数趋势,异常上涨就 dump 当前所有 Resource 路径排查。

## 3. 工程实现

下面三段代码:一个加载页(`ResourceLoader.load_threaded_*`)、一个用 `WorkerThreadPool` 跑程序化生成、一个验证 Physics Interpolation 的最小场景。

第一段,带进度条的异步关卡加载。常用在主菜单 → 关卡之间,或者大世界 chunk 切换。

文件:`demo/scripts/loading/scene_loader.gd`

```gdscript
class_name SceneLoader
extends Node

## 异步加载场景并切换。挂在 Autoload 上,任何地方调用。
## 用法:SceneLoader.load_scene_async("res://levels/level_01.tscn")

signal loading_progress(ratio: float)
signal loading_finished(scene: PackedScene)
signal loading_failed(path: String, status: int)

var _current_path: String = ""
var _progress_buffer: Array = []  # API 要求传入空数组接收进度

func load_scene_async(path: String) -> void:
    if _current_path != "":
        push_warning("Already loading: " + _current_path)
        return
    var err: int = ResourceLoader.load_threaded_request(path)
    if err != OK:
        loading_failed.emit(path, err)
        return
    _current_path = path
    _progress_buffer = [0.0]
    set_process(true)

func _process(_delta: float) -> void:
    if _current_path == "":
        return
    var status: int = ResourceLoader.load_threaded_get_status(
        _current_path, _progress_buffer
    )
    match status:
        ResourceLoader.THREAD_LOAD_IN_PROGRESS:
            loading_progress.emit(_progress_buffer[0] as float)
        ResourceLoader.THREAD_LOAD_LOADED:
            var resource: Resource = ResourceLoader.load_threaded_get(_current_path)
            loading_progress.emit(1.0)
            loading_finished.emit(resource as PackedScene)
            _current_path = ""
            set_process(false)
        ResourceLoader.THREAD_LOAD_FAILED, ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
            loading_failed.emit(_current_path, status)
            _current_path = ""
            set_process(false)

## 主动取消(仅停止轮询,Godot 没有真正"取消加载"API,资源最终仍会被加载完)
func cancel() -> void:
    _current_path = ""
    set_process(false)
```

注意几点:`load_threaded_get_status` 的 progress 参数必须传入"长度为 1"的数组(实际 API 把进度写进 `[0]`)。如果传空数组也能工作,但拿不到进度。轮询不要放在 `while` 死循环里——会自旋,主线程一样卡。放在 `_process` 里每帧检查一次最自然。

调用方场景(loading 页):

```gdscript
extends Control

@onready var _bar: ProgressBar = $ProgressBar

func _ready() -> void:
    SceneLoader.loading_progress.connect(_on_progress)
    SceneLoader.loading_finished.connect(_on_finished)
    SceneLoader.load_scene_async("res://levels/level_01.tscn")

func _on_progress(ratio: float) -> void:
    _bar.value = ratio * 100.0

func _on_finished(scene: PackedScene) -> void:
    get_tree().change_scene_to_packed(scene)
```

加载页本身要做得有"生命感"——单纯一个 ProgressBar 会让玩家以为游戏卡了。常见技巧:① 进度条用平滑插值,真实值跳到 60% 时显示值用 1-2 秒滑过去;② 旁边放一个动画(Spinner、角色站立动画);③ 显示当前正加载的资源类别(如"加载 shader"、"烘焙寻路")。最后这条对玩家心理影响很大——他知道"系统在干活",而不是"卡死了"。这些都不影响实际加载速度,只影响主观体验。

第二段,用 `WorkerThreadPool` 把 22 篇的洞穴生成器挪到后台。这是异步生成"现在要去的下一个关卡"的标准模式。

文件:`demo/scripts/loading/async_pcg.gd`

```gdscript
class_name AsyncPCG
extends Node

## 在 worker 线程跑洞穴生成,完成后用 call_deferred 回主线程交付。

signal generation_finished(grid: Array)

var _task_id: int = -1
var _result: Array = []

func start(level_seed: int) -> void:
    if _task_id != -1:
        push_warning("Generation already in progress")
        return
    var callable := Callable(self, "_worker_generate").bind(level_seed)
    _task_id = WorkerThreadPool.add_task(callable, false, "pcg cave")

# 真正在 worker 线程跑的函数。注意:不能碰节点树!
func _worker_generate(level_seed: int) -> void:
    var ls := LevelSeed.new(level_seed)
    var cave := CaveGenerator.new()
    var grid: Array = cave.generate(ls)
    # 通过 call_deferred 把结果回送主线程
    call_deferred("_on_worker_done", grid)

func _on_worker_done(grid: Array) -> void:
    # 在主线程执行,需要先 wait 让 pool 清理资源
    WorkerThreadPool.wait_for_task_completion(_task_id)
    _task_id = -1
    _result = grid
    generation_finished.emit(grid)

func is_busy() -> bool:
    return _task_id != -1
```

关键点:**`_worker_generate` 内部不能访问节点系统**——`add_child`、`queue_free`、信号 emit(信号 emit 内部可能调用主线程连接的函数)都不行。这里用 `call_deferred` 把控制权交还主线程,真正的 `emit_signal("generation_finished", ...)` 在主线程执行,安全。

`wait_for_task_completion` 必须调用,文档明确写"every task must be waited for"。否则内部分配的 Thread state 不会清理,长期累积会泄漏。

`add_task` 第二个参数 `high_priority = false` 是默认低优先级。预加载、PCG 这种"可以等"的用低优;玩家点了按钮立刻要的(例如战斗中召唤召唤物)用 high。pool 内部按优先级排队。

第三段,验证 Physics Interpolation 的最小场景。一个 `CharacterBody2D` 匀速移动,把 `physics_ticks_per_second` 调到 10 让插值效果可见。

文件:`demo/scripts/physics_interp/mover.gd`

```gdscript
class_name InterpolatedMover
extends CharacterBody2D

## 演示 Physics Interpolation:把 physics_ticks_per_second 设为 10,
## 渲染 60 fps,关闭插值时物体每秒只更新 10 次,明显跳跃;
## 开启插值后视觉丝滑。

@export var speed: float = 200.0

func _ready() -> void:
    # 运行时也能切换,适合做 settings 选项
    get_tree().physics_interpolation = true

func _physics_process(_delta: float) -> void:
    velocity = Vector2.RIGHT * speed
    move_and_slide()
    # 如果出了屏右边,瞬移回左边
    if global_position.x > 1280.0:
        global_position.x = 0.0
        # 关键:瞬移后调用这个,否则插值会画一条横贯屏幕的"拉丝"
        reset_physics_interpolation()
```

要在工程上看到效果,在项目设置 `physics/common/physics_ticks_per_second` 改成 10,运行场景。关闭 `physics/common/physics_interpolation` 时,你能清楚看到物体每秒跳 10 次;开启后,渲染 60 帧之间被插值填满,视觉丝滑。这是验收 Physics Interpolation 是否生效的最直观办法。

## 4. 调参和验收

**`WorkerThreadPool` 调优**:

| 项目设置 | 默认值 | 调整方向 |
| --- | --- | --- |
| `threading/worker_pool/max_threads` | -1(自动按 CPU 核心数) | 一般保持自动,移动端可手动设 2-4 |
| `threading/worker_pool/use_system_threads_for_low_priority_tasks` | 默认 true | 低优先级任务用系统线程,不占用 pool |

实战经验:`WorkerThreadPool` 适合"短任务"(几十毫秒到几秒);超过 10 秒的任务建议拆分成多个子任务用 `add_group_task` 并行,或者直接用 `Thread` 类做长生命周期(例如挂着的网络监听)。worker 数量在桌面 8 核机上通常 7 个(留 1 个给主线程),在 Web 平台或低端移动设备上会少很多甚至只有 1-2 个——所以**不要在代码里假设 worker 数量**,任务要能在 1 个 worker 上跑完(只是变慢),也要能利用多 worker 加速。`add_group_task` 是为这一点设计的:你告诉它"要跑 N 次",pool 内部按可用 worker 切分,自动适配。

**Physics Interpolation 适用场景**:

| 场景 | 建议 |
| --- | --- |
| Steam Deck / Web / 中低端硬件,fps 经常掉到 30-50 | **开** |
| 显示器 144 Hz / 120 Hz,物理 60 tick | **开**,显著改善镜头跟随 |
| 物理 tick > 60(动作游戏精确手感) | 看情况,开会引入 1 tick 视觉延迟 |
| 大量瞬移(传送门、关卡切换、回廊跳跃) | 开,但务必加 `reset_physics_interpolation` |
| 节奏极快的 bullet hell、平台跳 | 慎开,输入响应可能变迟钝 |

调 `physics_ticks_per_second` 时的对应关系:

- 60(默认):60 Hz 显示器最稳,144 Hz 必须开插值
- 30:CPU 紧张时省一半,但物理穿透概率升高,需要插值
- 120:动作游戏精确碰撞,代价是 CPU 双倍开销
- 240:格斗 / FPS 风格,几乎只在硬核游戏用

文档明确写:**`physics_ticks_per_second` 不是 60 的倍数时一定开 Physics Interpolation**,否则会和显示器刷新率打架,出现明显抖动。

**加载页验收**:

1. 切关卡时进度条从 0 平滑爬到 100,不要卡死也不要瞬间跳。
2. 加载期间主线程不被阻塞——loading 页的动画(`AnimationPlayer`、Spinner)继续转。
3. 失败路径(资源不存在 / 损坏)能优雅显示错误,不崩溃。
4. 用 `--debug-collisions --debug-navigation` 启动,加载关卡时 print 进度日志,确认轮询频率正常(每帧约一次)。

**Physics Interpolation 验收**:

1. `physics_ticks_per_second = 10` 时,开 / 关插值视觉差异肉眼可见。
2. 瞬移类操作(传送、关卡切换)后没有"拉丝",说明 `reset_physics_interpolation` 调用正确。
3. 角色移动用 `_physics_process`,不在 `_process` 里改 transform,否则插值无效。
4. 镜头(`Camera2D`)如果跟着玩家,也要保证更新发生在 `_physics_process`;`Camera2D.position_smoothing_enabled` 开启时配合插值效果最好。

**资源泄漏验收**:

1. 反复加载 / 卸载同一关卡 20 次,`MEMORY_STATIC` 应在每次卸载后稳定回落,长期不持续上涨。
2. 用 `Engine.print_resources_by_id()`(debug 构建)dump 当前所有 Resource,切关后立即 dump 一次,比对上一次,确认旧关卡资源已释放。
3. Autoload 单例里不长期 cache 临时 Resource。如果必须 cache,提供显式 `clear_cache()` 方法,在场景切换时调用。
4. `WorkerThreadPool` 任务结束后必须 wait,否则 `Performance.OBJECT_RESOURCE_COUNT` 会缓慢漂移。

## 5. 踩坑

**坑 1:worker 线程内 `print` / `push_warning` 在主线程显示**。这两个函数本身线程安全(内部做了排队),但显示出来的"line number"可能错位,debugger 信息不全。worker 线程内调试推荐用结构化日志,主线程统一打印。

**坑 2:`WorkerThreadPool.add_task` 不能传 lambda**。GDScript 4 的 Callable 必须绑定到具体对象的方法,不能用匿名函数。正确写法是 `Callable(self, "_worker_method").bind(args)`,而不是 `WorkerThreadPool.add_task(func(): ...)`。匿名 callable 在 4.6 部分场景能编译过,但行为不稳定。

**坑 3:忘记 `wait_for_task_completion`,长期跑 pool 用尽**。pool 内部有任务表大小上限(默认几百),不清理会导致后续 `add_task` 返回错误。规则:每个 task ID 必须在某处被 wait 过,哪怕只是 `is_task_completed` 反复轮询后 wait 一次,都要 wait。

**坑 4:`ResourceLoader.load_threaded_request` 返回 OK,但 status 一直 IN_PROGRESS**。检查路径拼写、扩展名、`.import` 是否生成。Godot 4 严格区分 `res://maps/foo.tscn` 和 `res://Maps/Foo.tscn`(取决于平台文件系统大小写敏感性,Linux 严格,Windows / macOS 默认不敏感但 export 可能严格)。养成全小写文件名习惯能省一半这类 bug。

**坑 5:进度条卡在某个数值不动**。`progress` 数组里的值是引擎根据"已加载子资源数 / 总子资源数"计算的;对单一大文件,可能 90% 时间都卡在 50% 然后突然跳到 100%。这是 `ResourceLoader` 的实现限制,不是 bug。UI 上用"平滑插值"或"假进度"掩盖,玩家不会发现。

**坑 6:`load_threaded_get` 在未完成时阻塞主线程**。文档说"如果 status 不是 LOADED 还调用 get,会阻塞直到完成"。这其实可以救命——比如玩家立刻需要资源不能再等,你可以强制阻塞 100ms 把它"催熟";但平时一定先查 status,否则就违背了异步加载的初衷。

**坑 7:Physics Interpolation 开了之后镜头跳一帧**。`Camera2D` 默认会跟随 transform,但插值机制下"上一帧 transform"会被记录;场景切换瞬间镜头的"上一帧"是错的,导致第一帧抖。解决:场景 `_ready` 里对镜头调用 `reset_physics_interpolation()`。

**坑 8:`reset_physics_interpolation` 调用时机错**。文档明确:"调用此函数应在移动节点之后,而不是之前"。正确顺序:① 改 transform;② 立刻调用 reset。反过来调会失效。

**坑 9:同时开 `physics_jitter_fix` 和 `physics_interpolation`**。两者不兼容,引擎在 interpolation 启用时会自动禁用 jitter_fix。如果你看到老教程同时调这两个,以 interpolation 为准,jitter_fix 不用动它。

**坑 10:worker 线程里 emit signal 引发崩溃**。即使 signal 本身只触发 Callable,Callable 内部通常会修改节点状态(改 UI、`queue_free` 等)。所有节点操作必须回主线程,通过 `call_deferred` 排队到下一帧。简单规则:**worker 里只 `call_deferred` 一个方法,所有副作用集中在主线程方法里**。

**坑 11:小任务用 worker 反而慢**。`add_task` 本身有调度开销(队列入队、worker 唤醒、context switch),几微秒级。把"算两个数加法"扔进 worker 不仅没快,反而慢百倍。规则:任务时长 > 1 ms 才值得 worker;< 0.1 ms 一定不要。中间区间看吞吐量(批量任务用 `add_group_task`)。

**坑 12:`add_group_task` 的并行假设**。它把 callable 分发给 N 个 worker,Callable 接收 `int` 参数(0 到 elements-1)。但 worker 数量和 elements 不一定相等——可能 elements=100 但只有 8 个 worker,每个 worker 跑约 12 次。所以 worker 函数内部不能假设"我是 1/100 的工作量",而是按 index 取对应数据。

**坑 13:`ResourceLoader` 在 export 后路径不一致**。开发期 `res://` 指向项目目录;export 后 `res://` 指向 PCK 内部虚拟路径。绝大多数情况一致,但如果你用 `OS.get_executable_path()` 或字符串拼接生成路径,export 后可能错位。统一用 `res://` 前缀的相对路径,不要拼绝对路径。

**坑 14:Physics Interpolation 下用 `_process` 改 transform**。这会让插值机制丢失"上一帧 transform"参照,物体抖。所有移动操作放在 `_physics_process`。如果某个动画必须用 `_process`(比如 UI 缓动),给该节点单独 `physics_interpolation_mode = DISABLED`。

**坑 15:`WorkerThreadPool` 与 `Thread` 共存**。早期 4.0 代码可能直接用 `Thread.start(callable)`,4.6 仍然兼容,但混用要注意:`Thread` 是长生命周期(你管启动管停止),`WorkerThreadPool` 是短任务调度,两者不要在同一逻辑混用。新项目优先 pool,旧项目迁移时不必急着重写。

**坑 16:测试时 `await get_tree().process_frame` 在 `_ready` 里**。如果 `_ready` 里 `await` 然后立刻调用 `load_threaded_get_status`,可能拿到的还是上一帧的状态。`load_threaded_request` 之后至少等 1 帧再查,大资源等几十帧才有进度更新。

**坑 17:发版后玩家硬件五花八门,调优要靠遥测**。开发机上 fps 稳 60,玩家的二手笔记本上掉到 25 是常态。建议在游戏里加一个匿名遥测开关(用户同意后启用),收集每个版本的 fps 分布、加载时长、崩溃点;数据回流后能精准定位"哪一类硬件、哪一关、哪个时刻"出问题。这事在独立游戏圈不普遍,但做了的项目调优速度比"靠玩家描述"快 10 倍。隐私 / 合规问题在 30 篇有展开。

**坑 18:Web 平台 worker 数量极少**。浏览器对 Web Worker 数量、内存有限制,Godot Web 导出时 worker pool 通常只有 2-4 个。在桌面端跑得欢的并行 PCG 在 Web 上可能退化成接近串行,加载页一卡几秒。Web 平台调试要在真实浏览器里实测,不能只看桌面构建。

## 手动验证

- [ ] `SceneLoader` 加载一个 50 MB 的大场景,主线程的 UI 动画不停顿,进度条平滑前进至 100%。
- [ ] 把场景路径改成不存在的字符串,`loading_failed` 信号被触发,UI 显示错误而不是崩溃。
- [ ] 用 `WorkerThreadPool` 跑 22 篇的 256×256 洞穴生成,主线程 fps 在生成期间保持稳定,生成完成后通过 `call_deferred` 把网格交付主线程渲染。
- [ ] `physics_ticks_per_second` 改到 10,关闭 Physics Interpolation 运行 demo 场景,物体明显跳跃;开启后视觉丝滑。
- [ ] 瞬移角色(`global_position.x = 0` 一次)未调用 `reset_physics_interpolation` 时,屏幕上出现一条"拉丝"残影;调用后残影消失。
- [ ] 用 Debugger > Monitors 监控 `MEMORY_STATIC` 与节点数,反复加载 / 释放 10 次同一关卡,内存稳定不持续上涨(无引用泄漏)。
