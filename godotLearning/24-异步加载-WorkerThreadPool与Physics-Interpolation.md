# 异步加载、WorkerThreadPool 与 Physics Interpolation

游戏卡住一秒,玩家不在乎你是在读盘、解压、生成地图还是烘焙数据。他只会觉得游戏卡。要解决这类问题,先分清什么能离开主线程,什么必须回主线程。

> 一句话先记住:**后台线程算数据和加载资源,节点树操作回主线程。**

---

## 一、阻塞式 load 会卡

```gdscript
var scene := load("res://levels/big_level.tscn")
```

场景大时,这行会阻塞主线程。按钮、动画、进度条都会停。

异步加载用:

```gdscript
ResourceLoader.load_threaded_request(path)
```

---

## 二、异步加载场景

```gdscript
# res://systems/level_loader.gd
extends Node

signal progress_changed(value: float)
signal load_finished(scene: PackedScene)

var _path: String = ""

func start(path: String) -> void:
    _path = path
    var err := ResourceLoader.load_threaded_request(path)
    if err != OK:
        push_error("Load request failed: %s" % err)

func _process(_delta: float) -> void:
    if _path.is_empty():
        return

    var progress := []
    var status := ResourceLoader.load_threaded_get_status(_path, progress)

    if not progress.is_empty():
        progress_changed.emit(float(progress[0]))

    if status == ResourceLoader.THREAD_LOAD_LOADED:
        var scene := ResourceLoader.load_threaded_get(_path) as PackedScene
        _path = ""
        load_finished.emit(scene)
    elif status == ResourceLoader.THREAD_LOAD_FAILED:
        push_error("Load failed: %s" % _path)
        _path = ""
```

切场景:

```gdscript
func _on_load_finished(scene: PackedScene) -> void:
    get_tree().change_scene_to_packed(scene)
```

---

## 三、WorkerThreadPool 做纯计算

适合后台做:

```text
程序化地图数组
大批量排序
路径预处理
保存前压缩数据
图像数据处理
```

不适合后台做:

```text
add_child
queue_free
改 Control 文本
改 Node2D.position
发会立刻触发节点操作的信号
```

例子:

```gdscript
var _task_id: int = -1
var _generated_grid: Array

func start_generation(seed: int, config: GenerationConfig) -> void:
    _task_id = WorkerThreadPool.add_task(
        func():
            _generated_grid = CaveGenerator.generate(seed, config),
        false,
        "generate cave"
    )

func _process(_delta: float) -> void:
    if _task_id == -1:
        return

    if WorkerThreadPool.is_task_completed(_task_id):
        WorkerThreadPool.wait_for_task_completion(_task_id)
        _task_id = -1
        _paint_grid_on_main_thread(_generated_grid)
```

注意:所有 task 最后都要 `wait_for_task_completion()`。

---

## 四、回主线程

后台线程算完后,节点操作用:

```gdscript
call_deferred("_apply_generated_level", grid)
```

或者主线程轮询 task 完成后再处理。不要在 worker 里直接改场景树。

---

## 五、Physics Interpolation 解决什么

物理默认 60Hz,显示器可能 144Hz。物理位置每 16.7ms 更新一次,渲染却更频繁,画面会像一跳一跳。

Physics Interpolation 会在两个物理 tick 之间插值显示位置。

开启:

```text
Project Settings -> Physics -> Common -> Physics Interpolation
```

前提:移动逻辑主要在 `_physics_process`。

---

## 六、瞬移后要 reset

如果角色从 A 瞬移到 B,插值系统可能画出从 A 到 B 的过渡。

瞬移后调用:

```gdscript
global_position = spawn_point.global_position
reset_physics_interpolation()
```

相机切换、关卡复活、传送门都要记住这句。

---

## 七、加载链路要释放引用

异步预加载很多场景时,要明确什么时候释放:

```gdscript
var _cached_scene: PackedScene

func clear_cache() -> void:
    _cached_scene = null
```

Godot 的资源引用计数会处理释放,但前提是你别一直持有引用。

---

## 验收

- 大场景加载不用阻塞式 `load()`。
- loading 页面能显示进度。
- 程序化生成先出纯数据,再回主线程写 TileMapLayer。
- WorkerThreadPool 任务结束后有 wait。
- 开启 Physics Interpolation 后移动物体更平滑。
- 传送和复活后调用 `reset_physics_interpolation()`。

---

## 常见坑

**坑 1:线程里 add_child。**

节点树不是线程安全的。回主线程。

**坑 2:load_threaded_get 太早调用。**

没加载完时会阻塞,等于又卡主线程。先查 status。

**坑 3:开插值但在 _process 改位置。**

插值服务于 physics tick。移动逻辑要统一。

**坑 4:预加载后不清引用。**

玩几关显存越来越高,先查缓存是否释放。

---

下一篇讲 GDExtension 与 Rust/C++ 性能模块。
