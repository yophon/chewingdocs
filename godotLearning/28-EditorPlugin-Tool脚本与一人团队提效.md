# EditorPlugin、Tool 脚本与一人团队提效

独立开发最怕重复手工活:新建几十个资源、批量改字段、从贴图生成碰撞、检查关卡有没有漏出生点。Godot 的编辑器脚本可以把这些事变成按钮。

> 一句话先记住:**@tool 改单个节点,EditorPlugin 改编辑器工作流。**

---

## 一、@tool 用在哪里

`@tool` 让脚本在编辑器里也运行。

适合:

```text
路径节点实时生成预览
修改参数时刷新碰撞形状
关卡节点显示调试范围
资源字段变化时自动校验
```

示例:

```gdscript
@tool
extends Node2D

@export var radius: float = 64.0:
    set(value):
        radius = value
        queue_redraw()

func _draw() -> void:
    if Engine.is_editor_hint():
        draw_circle(Vector2.ZERO, radius, Color(1, 0, 0, 0.25))
```

编辑器里改 `radius`,视口立刻看到范围。

---

## 二、@tool 要防误运行

`@tool` 代码会在编辑器里执行 `_ready()`、setter、`_process()`。不要在里面直接改存档、切场景、生成一堆运行时节点。

常用保护:

```gdscript
if not Engine.is_editor_hint():
    return
```

或者反过来:

```gdscript
if Engine.is_editor_hint():
    return
```

看这段逻辑到底给编辑器用还是给游戏运行时用。

---

## 三、EditorPlugin 放在哪

目录:

```text
addons/item_forge/
├── plugin.cfg
├── item_forge_plugin.gd
└── item_forge_dock.tscn
```

`plugin.cfg`:

```ini
[plugin]
name="Item Forge"
description="Generate item resources from sprites."
author="Project"
version="0.1"
script="item_forge_plugin.gd"
```

启用:

```text
Project Settings -> Plugins
```

---

## 四、最小插件

```gdscript
# addons/item_forge/item_forge_plugin.gd
@tool
extends EditorPlugin

var _dock: Control

func _enter_tree() -> void:
    _dock = preload("res://addons/item_forge/item_forge_dock.tscn").instantiate()
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)

func _exit_tree() -> void:
    remove_control_from_docks(_dock)
    _dock.queue_free()
```

Godot 新版本有新的 dock API,旧 API 仍能满足很多项目。你如果面向 4.6 长期维护,再按新版 `EditorDock` 整理。

---

## 五、批量生成资源

按钮脚本:

```gdscript
@tool
extends VBoxContainer

@export var sprite_dir := "res://items/sprites/"
@export var output_dir := "res://items/data/"

func _on_generate_pressed() -> void:
    DirAccess.make_dir_recursive_absolute(output_dir)

    var files := DirAccess.get_files_at(sprite_dir)
    for file_name in files:
        if not file_name.ends_with(".png"):
            continue

        var id := file_name.get_basename()
        var item := ItemResource.new()
        item.id = StringName(id)
        item.display_name = id.capitalize()
        item.icon = load(sprite_dir + file_name)

        var path := output_dir + id + ".tres"
        ResourceSaver.save(item, path)

    EditorInterface.get_resource_filesystem().scan()
```

这就是插件的价值:把半天重复操作变成一次点击。

---

## 六、写工具也要有边界

适合做工具:

```text
批量生成 .tres
检查关卡结构
自动创建 TileSet 元数据
扫描缺失翻译 key
压缩/打包资源
```

不适合做工具:

```text
核心玩法逻辑
运行时 AI
玩家输入
存档流程
```

工具服务开发流程,不要和运行时代码混在一起。

---

## 七、关卡检查器

一个实用工具:检查所有关卡有没有 `PlayerSpawn` 和 `Goal`。

```gdscript
func validate_level(scene: PackedScene, path: String) -> void:
    var root := scene.instantiate()
    var spawn := root.find_child("PlayerSpawn", true, false)
    var goal := root.find_child("Goal", true, false)
    if spawn == null:
        push_warning("%s missing PlayerSpawn" % path)
    if goal == null:
        push_warning("%s missing Goal" % path)
    root.queue_free()
```

这类检查比“靠记忆”可靠得多。

---

## 验收

- 至少有一个 `@tool` 脚本用于编辑器预览或校验。
- 插件代码放在 `addons/` 下,不污染运行时代码。
- 有一个按钮能批量生成或检查资源。
- 工具执行后会刷新资源文件系统。
- 工具逻辑有 `Engine.is_editor_hint()` 边界。

---

## 常见坑

**坑 1:@tool 里写运行时副作用。**

编辑器打开场景就会跑。小心存档、生成、删除。

**坑 2:插件忘了清理 dock。**

`_exit_tree()` 里 remove 和 queue_free。

**坑 3:路径写死到个人电脑。**

插件路径用 `res://`,不要写绝对路径。

**坑 4:工具越写越像运行时系统。**

工具是辅助,不要把核心玩法藏进插件。

---

下一篇讲多人联机初步。
