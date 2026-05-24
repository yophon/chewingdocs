# 28-EditorPlugin、Tool 脚本与一人团队提效

> 一句话导读:独立开发者不需要"团队工具",但需要一个不抗拒被自动化的工程师。Godot 的 `@tool` 与 `EditorPlugin` 让你在编辑器里写一段几十行的脚本,把每周都要做一次的脏活直接变成菜单按钮。

独立开发到中后期,几乎所有人都会撞上同一道墙:有 80 个掉落物配置要新建,每个都要先 New Resource、再选类型、再填字段、再保存。这事一个早上能做完,但你会在做第 40 个的时候开始想,如果直接遍历一下 `res://items/` 下的 PNG 就能批量生成,那有多省事。这一篇讲的就是把这种念头落地的技术骨架:`@tool` 注解、`EditorPlugin` 节点、4.6 新的 `EditorDock`,以及一个真的能跑起来的批量生成插件示例。

工具型代码的特殊性在于,它的目的不是被玩家使用,而是被开发者自己使用。这就引出一个反直觉的设计原则:工具代码不需要追求"对外可读",但必须追求"对己稳定"。一个早晨写好、当天用了两次的脏脚本如果第二天因为路径写死或者没处理边界条件而坑你两个小时,它的净收益就是负的。Godot 的插件机制把"工具代码"和"游戏代码"在文件系统层面隔离开,就是为了让你在写工具时可以更随性,但又保留升级成长期复用插件的可能。

## 1. 机制定位

游戏开发不像一般业务系统。业务系统的"工具"通常是工程内部的辅助脚本,跑在 CI 或者本地命令行里。游戏开发的工具大部分必须跑在编辑器里,因为它们要消费场景节点、Resource、贴图导入器这些只有编辑器才有的对象。这就引出第一个核心问题:**怎么让一段 GDScript 在编辑器进程里运行,而不仅仅在游戏运行时被调用?**

答案是 `@tool` 注解。它告诉 Godot,这个脚本不仅要在游戏运行时执行,也要在编辑器加载场景、属性变化、节点被选中时执行。这样你写在 `_ready` 里的逻辑,在你拖一个节点进场景的瞬间就会跑一次。这是所有编辑器自动化的起点。

但 `@tool` 只解决"脚本能在编辑器里跑"。真正的工程化提效需要两层能力:

- **Tool 脚本层**:挂在节点上,让节点在编辑器里能"活"——比如一个 `Polygon2D` 在你修改顶点时实时生成碰撞形状,一个挂在 `Path2D` 上的脚本在你拖动控制点时实时刷新沿途的装饰物。
- **EditorPlugin 层**:不挂在场景节点上,而是注册进编辑器本身。它能加自定义 dock(侧边栏面板)、加菜单按钮、加自定义 Inspector,甚至替换默认的属性编辑器。

新手最常见的失控写法,是把生产力脚本和游戏逻辑混在一个文件里。比如想在编辑器里自动生成关卡的脚本,直接挂在 `LevelManager` 上,加一个 `@tool`,再加一个 `@export var regenerate: bool` 来当"按钮"。这个写法不是不能跑,但它有两个长期问题:第一,这段生成逻辑会在每次场景加载时跑一次,因为 `_ready` 在 `@tool` 下也会触发(`Engine.is_editor_hint()` 就是用来挡这种情况的);第二,这段代码污染了游戏运行时的脚本——发布版本里实际上还携带着一段永远不会用的"开发期工具代码"。

`EditorPlugin` 的存在就是为了把这两层彻底分开。挂在节点上的 Tool 脚本只做"和节点本身高度耦合"的事,所有跨节点、跨资源、跨项目目录的批处理逻辑,放在 `EditorPlugin` 里。

把这种分工再说得直白一点。Tool 脚本是"节点的本地能力增强",它的关注点边界等于这个节点自己;`EditorPlugin` 是"编辑器级的横切关注点",它的关注点是整个项目。哪天你想把这个插件分享给别人,只需要打包 `addons/<plugin>/` 这一个目录就够,游戏运行时代码不会被污染,这是真正"可复用"的形态。反过来,Tool 节点脚本只能跟着具体场景一起被复用,适合做项目内的便捷工具,不适合做对外发布。

## 2. Godot 心智

理解 `EditorPlugin` 需要先理解它在 Godot 编辑器里的"形状"。

打开任何一个 Godot 项目,编辑器界面大致由以下几块组成:菜单栏、场景树面板(左侧)、Inspector(右侧)、文件系统(左下)、视口(中间)、输出/调试/动画/底部面板(下方)。除了顶部菜单栏,**几乎每一个面板都是一个 dock**,可以被你拖到不同的 slot,也可以被关闭。4.6 开始,所有 dock 还能被拖出主窗口,变成一个浮动小窗——这就是这一版的 Movable / Floatable Docks。

`EditorPlugin` 是一个继承自 `Node` 的特殊类型,它通过 `plugin.cfg` 注册进编辑器,然后在编辑器启动时被实例化、`_enter_tree()`、加入到一个特殊的"编辑器场景树"里。它不属于你的游戏运行时,导出游戏时不会被打包进去。

它的主要钩子(虚函数)我把高频用到的列在一起:

| 钩子 | 触发时机 |
| --- | --- |
| `_enter_tree()` | 插件启用时,做注册工作:加 dock、加菜单、加 inspector |
| `_exit_tree()` | 插件禁用或编辑器关闭时,做清理工作 |
| `_has_main_screen()` / `_make_visible(visible)` | 注册一个全屏主界面(像 2D/3D/Script/AssetLib 那一排) |
| `_forward_canvas_gui_input(event)` | 拦截 2D 视口的鼠标键盘事件,做自定义工具 |
| `_handles(object)` / `_edit(object)` | 当编辑器选中某种对象时介入它的编辑 |

4.6 之前,挂自定义面板靠的是 `add_control_to_dock(slot, control)`,你直接传一个 `Control`,编辑器把它塞到固定 dock 槽里,位置和大小都由 slot 决定。4.6 之后,这个 API 被标记为 deprecated,新的 API 是:

```gdscript
add_dock(EditorDock.new())
```

`EditorDock` 是一个新类,自己持有 `title`、`dock_icon`、`default_slot`、`available_layouts` 这些属性。`available_layouts` 是个 bitmask,可以组合 `DOCK_LAYOUT_VERTICAL`、`DOCK_LAYOUT_HORIZONTAL`、`DOCK_LAYOUT_FLOATING`,告诉编辑器"我这个 dock 在哪些 layout 下能用"。这个变化的本质,是把以前固定贴边的 dock 工作流,改成了"dock 是个有自己状态的对象,用户可以浮起来、横竖切换、关掉再开"。对插件作者来说,这意味着你写代码时不能再假设"我的 dock 一定在右侧某个固定位置";写 UI 布局时尽量让内容能自适应 vertical 和 floating 两种摆放。

另一组要早点知道的概念,是**自定义类型注册**与**自定义 inspector**:

- `add_custom_type(name, base, script, icon)`:让你写的脚本变成"可以在 Add Node 弹窗里直接搜到"的节点类型。配合 `class_name` 关键字,后者会自动让脚本在全局类列表里出现,前者额外给它配图标。
- `EditorInspectorPlugin`:挂进编辑器后,可以介入任何对象在 Inspector 面板的渲染。常见场景是给某个 `Resource` 加一个"测试播放"按钮,或者把一个 `int` 属性换成自定义的 spinbox。

最后是 `EditorInterface`。这是个全局接口,可以拿到当前打开的场景、文件系统快照、选中节点列表、调用 `restart_editor`、`save_scene`、`reload_scene_from_path` 等等。所有"我想在插件里模拟用户点了某个按钮"的需求,九成会在这个类里找到。

一个值得早期记住的小心智:Godot 编辑器本身就是一个用 Godot 写的应用,`EditorInterface` 拿到的引用是编辑器进程里的真节点,改它们会真正影响编辑器外观。这是为什么 `EditorPlugin` 可以做出"自定义 dock"、"加新菜单"、"换颜色主题"这种深度集成的原因,但同时也意味着,如果你在插件里写一个无限循环、把某个编辑器节点 `queue_free()` 掉,编辑器本身就会出问题。它不是"在沙箱里运行的脚本",而是"被加进编辑器主进程里的代码"。所以 plugin 的任何破坏性操作,要小心处理边界条件。

## 3. 工程实现

下面这个插件是真实场景的一个抽象:你的项目里有 `res://items/sprites/` 一堆掉落物的 PNG,你想在编辑器里一键扫描这个目录,给每一个 PNG 在 `res://items/data/` 下生成一个 `ItemResource` 的 `.tres` 文件,字段都按 PNG 文件名预填,后续你只需要去调每条数据的具体数值。

整个插件由 4 个文件组成,目录结构是 Godot 插件的标准布局:

```
res://
├── addons/
│   └── item_forge/
│       ├── plugin.cfg
│       ├── plugin.gd
│       └── item_forge_dock.tscn
└── items/
    ├── item_resource.gd
    ├── sprites/
    └── data/
```

先看 `addons/item_forge/plugin.cfg`,所有 EditorPlugin 都从这里被发现:

```ini
[plugin]

name="Item Forge"
description="Batch generate ItemResource files from res://items/sprites/"
author="independent"
version="0.1.0"
script="plugin.gd"
```

然后是 `res://items/item_resource.gd`,作为被批量生成的 Resource 类型。注意 `class_name` 让它在编辑器和 GDScript 里都可以按类型引用:

```gdscript
# res://items/item_resource.gd
@tool
class_name ItemResource
extends Resource

@export var item_id: StringName = &""
@export var display_name: String = ""
@export_multiline var description: String = ""
@export_range(1, 999) var max_stack: int = 1
@export var rarity: int = 0
@export var icon: Texture2D
@export var price: int = 0
```

接着是 `addons/item_forge/plugin.gd`,这是 EditorPlugin 主入口。它做三件事:启用时在右侧 dock 槽里挂一个面板;面板上有"扫描"按钮,点了会遍历 `res://items/sprites/` 生成 `ItemResource`;禁用时回收所有面板:

```gdscript
# res://addons/item_forge/plugin.gd
@tool
extends EditorPlugin

const SPRITE_DIR := "res://items/sprites/"
const DATA_DIR := "res://items/data/"
const DOCK_SCENE := preload("res://addons/item_forge/item_forge_dock.tscn")

var _dock: EditorDock
var _dock_panel: Control

func _enter_tree() -> void:
    _dock_panel = DOCK_SCENE.instantiate()
    _dock_panel.scan_requested.connect(_on_scan_requested)

    _dock = EditorDock.new()
    _dock.title = "Item Forge"
    _dock.default_slot = EditorDock.DOCK_SLOT_RIGHT_UL
    _dock.available_layouts = (
        EditorDock.DOCK_LAYOUT_VERTICAL
        | EditorDock.DOCK_LAYOUT_FLOATING
    )
    _dock.add_child(_dock_panel)
    add_dock(_dock)

func _exit_tree() -> void:
    if _dock:
        remove_dock(_dock)
        _dock.queue_free()
        _dock = null
    _dock_panel = null

func _on_scan_requested() -> void:
    var fs := EditorInterface.get_resource_filesystem()
    var dir := DirAccess.open(SPRITE_DIR)
    if dir == null:
        push_error("Item Forge: sprite dir not found: %s" % SPRITE_DIR)
        return
    DirAccess.make_dir_recursive_absolute(DATA_DIR)

    var created := 0
    var skipped := 0
    dir.list_dir_begin()
    var name := dir.get_next()
    while name != "":
        if name.get_extension() == "png":
            var sprite_path := SPRITE_DIR + name
            var data_path := DATA_DIR + name.get_basename() + ".tres"
            if ResourceLoader.exists(data_path):
                skipped += 1
            else:
                _create_item(sprite_path, data_path)
                created += 1
        name = dir.get_next()
    dir.list_dir_end()

    fs.scan()
    _dock_panel.report("created=%d, skipped=%d" % [created, skipped])

func _create_item(sprite_path: String, data_path: String) -> void:
    var res := ItemResource.new()
    res.item_id = StringName(sprite_path.get_file().get_basename())
    res.display_name = String(res.item_id).capitalize()
    res.icon = load(sprite_path) as Texture2D
    ResourceSaver.save(res, data_path)
```

最后是 dock 面板自身。它的 `.tscn` 根节点是一个 `Control`,里面挂一个垂直容器、一个标题 Label、一个 Button、一个状态 Label。脚本只暴露一个信号让 plugin 知道用户点了按钮,以及一个 `report()` 让 plugin 把结果写回。脚本保存在 `addons/item_forge/item_forge_dock.gd`,被 `.tscn` 引用:

```gdscript
# res://addons/item_forge/item_forge_dock.gd
@tool
extends Control

signal scan_requested

@onready var _button: Button = %ScanButton
@onready var _status: Label = %Status

func _ready() -> void:
    _button.pressed.connect(func() -> void: scan_requested.emit())
    _status.text = ""

func report(message: String) -> void:
    _status.text = message
```

启用这个插件的方法是:把整个 `addons/item_forge/` 复制进项目,在 Project Settings → Plugins 里把 Item Forge 打开。打开瞬间 `_enter_tree()` 跑,右上 dock 区会多一个标着 "Item Forge" 的小面板。把它拖出主窗口浮动也行,贴回左下角也行——这就是 4.6 Movable Docks 给插件用户带来的灵活度,代价仅是你的面板 UI 不要依赖固定尺寸。

需要再强调一遍:`@tool` 注解必须出现在 `plugin.gd` 和 `item_forge_dock.gd` 的顶部,否则脚本根本不会在编辑器进程里执行。`item_resource.gd` 也写了 `@tool`,这是为了让它在编辑器选中节点引用 `ItemResource` 时,导出的字段可以正常显示。

## 4. 调参和验收

这个骨架在生产中会遇到几类参数和取舍。

**第一,扫描目录是惰性还是激进。** 上面的实现是"只创建不存在的 `.tres`,不覆盖已有数据"。这是一个保守默认值,因为生产中你最不想要的就是"我加了一个新 PNG,工具自动把我已经调了三天平衡的旧 `.tres` 覆盖成全零"。如果想加"强制覆盖"开关,加一个 `CheckBox`,在 dock 里读它的状态,通过信号传给 plugin。永远不要做"自动选择保守/激进策略"这种事,把决策权显式交给用户。

**第二,文件系统刷新的时机。** `EditorInterface.get_resource_filesystem().scan()` 是异步的,触发以后编辑器会在后台扫一遍 `res://`,扫完才会把新文件出现在 FileSystem dock 里。如果你的插件在生成完资源后立刻想"再读一次新文件",必须 `await fs.filesystem_changed`,否则可能拿不到。这是新手最容易踩的一个空时序坑。

**第三,UI 在 vertical / floating 两种 layout 下的可读性。** dock 在垂直布局下宽度往往只有 250-350 像素,容易撑爆按钮和标签;但浮动时用户可能拉到 800 像素宽。一个简单做法是用 `VBoxContainer` 包按钮,让按钮 `size_flags_horizontal = SIZE_EXPAND_FILL`,这样无论宽窄都贴满。`available_layouts` 里如果你只设 `DOCK_LAYOUT_VERTICAL`,4.6 编辑器在用户尝试把它拖到底部 horizontal 区域时会拒绝;如果你两个都开,记得 dock 内布局要响应式。

**第四,Tool 脚本里的副作用要可逆。** 这一篇虽然示例是 EditorPlugin,但很多 2D 项目还会写 `@tool` 节点脚本,常见场景比如"在 `Path2D` 上沿路径生成 N 个装饰节点"。这种脚本一旦写错条件,会在你每次保存场景时往场景树里塞节点,导致 `.tscn` 越存越大。验收 `@tool` 节点脚本的硬规则是:看看 git diff,场景文件的变化是不是仅来自你刚才"显式编辑"的内容。如果你只是点了一下播放就发现 `.tscn` 多了 100 行,这个 tool 脚本一定有副作用泄漏。

**第五,如何验证这一篇的工程实际完成了。** 最低验收是:`res://items/sprites/` 放两个 PNG,启用插件,点扫描按钮,`res://items/data/` 里出现两个 `.tres`,字段都按 PNG 名预填了 `item_id` 和 `display_name`,`icon` 引用正确。再放两个新 PNG 进去,再扫一次,`status` 显示 `created=2, skipped=2`,旧 `.tres` 不被覆盖。

**第六,什么时候该升级到 `EditorInspectorPlugin`。** 上面的样例是用 dock 触发批处理,适合"一次性扫描全目录"这类场景。如果你的诉求换成"在选中某个 `ItemResource` 时,Inspector 里直接显示一个'当前等级预览'下拉框,或者一个'随机生成数值'按钮",就该用 `EditorInspectorPlugin`。它在 `_enter_tree` 里注册:`add_inspector_plugin(MyInspectorPlugin.new())`;插件实现 `_can_handle(object)` 返回 true,然后在 `_parse_property` 或 `_parse_category` 里 `add_property_editor(...)`、`add_custom_control(...)`。这是 dock 不擅长但 Inspector plugin 很自然的形态。

**第七,如何与 git 协作。** 插件目录 `addons/<name>/` 应当被纳入版本控制,这是默认就成立的事。但插件运行过程中生成的中间文件(比如批量生成的 `.tres`)既可能是产物、也可能是源——这两者要做出区分。给每个生成步骤一个 readme 写清楚"哪些目录是手动维护、哪些是工具产物",可以避免下一次清理时把工具产物当垃圾删掉。

## 5. 踩坑

**`@tool` 脚本里的 `_ready`、`_process` 在编辑器里也会跑。** 这是新手最痛的一个坑。你以为你写的是游戏运行时逻辑,但脚本一带 `@tool`,编辑器在场景加载、节点被选中、属性变更时都会把 `_ready` 跑一遍。任何"操作场景节点、修改子节点"的代码都要先用 `if Engine.is_editor_hint(): return` 或者反过来 `if not Engine.is_editor_hint(): return` 隔离。不要试图靠"先判断 owner 是不是 null"来绕过,这条路只会让你在 4.6 升级时再撞一次。

**4.6 之前的教程用 `add_control_to_dock`,4.6 用 `add_dock(EditorDock.new())`。** 旧 API 没被立刻删除,所以 4.5 的代码丢进 4.6 还能跑,但编辑器会在控制台报一行 deprecation 警告。如果你跟着旧教程走,看到的代码会是 `add_control_to_dock(DOCK_SLOT_RIGHT_UL, control)`,这种写法在 4.6 之后会失去 floatable 支持,因为它根本没有 `EditorDock` 这层包装。新项目直接用新 API,旧插件改造时先把所有 `add_control_to_dock` 换掉。`add_control_to_bottom_panel` 也是同样的命运,新 API 是 `add_dock(dock)` + `dock.default_slot = DOCK_SLOT_BOTTOM`。

**`plugin.cfg` 里的 `script` 路径必须相对于 `addons/<your_plugin>/` 目录。** 写 `script="res://addons/item_forge/plugin.gd"` 是错的,正确是 `script="plugin.gd"`。这是因为 Godot 把 `addons/<name>/` 当成插件的根。

**`EditorPlugin` 不能用 `class_name` 在 Add Node 弹窗里出现。** 你不会希望用户把 `ItemForge` 的 plugin 节点拖进游戏场景里。EditorPlugin 是被编辑器自己实例化的,不属于用户场景树。如果想让自己的 `ItemResource` 类型在 Inspector 里能被识别成自定义类型(带图标、Quick Type Search 能搜到),用 `add_custom_type(...)` 而不是依赖 `class_name`(虽然 `class_name` 也够用,但 `add_custom_type` 能挂图标)。`_exit_tree` 里要记得 `remove_custom_type` 配对,否则插件禁用时图标会泄漏。

**`ResourceSaver.save()` 的第一个参数是资源,第二个是路径。** 不少教程版本(包括 3.x)的参数顺序是反的,如果你照着旧文档写成 `ResourceSaver.save(path, res)`,4.x 会直接报"参数类型不匹配"。

**`DirAccess.open()` 在 4.x 是静态工厂方法,返回 `DirAccess` 对象;在 3.x 是 `Directory.new()` 然后 `open()`。** 旧教程的写法在 4.6 里完全跑不了,要照着 4.x 文档写。

**`Engine.is_editor_hint()` 在导出版本里恒为 `false`。** 这是一个友好的设计:编辑器工具代码不会破坏发布游戏。但反过来,这也意味着你不能把"只在编辑器跑一次"的初始化逻辑当成"只跑一次"的等价物,导出后 `is_editor_hint()` 永远 false,那段代码就再也不会执行。如果你需要"项目运行时初始化只跑一次",用 Autoload + `_ready` 而不是 `@tool` + `is_editor_hint`。

**`EditorDock.available_layouts` 默认值仅包含 vertical。** 如果你想让用户能把 dock 浮起来或拖到水平区,必须显式 OR 上 `DOCK_LAYOUT_FLOATING` 和/或 `DOCK_LAYOUT_HORIZONTAL`。这一点 4.5 没有,4.6 才有,旧教程不会提。

**dock 内部 UI 不要硬编码像素宽度。** 因为 4.6 让用户能把 dock 拖出去浮动,floating 状态下 dock 宽度可能从 200 一直拉到 1200。你写 `custom_minimum_size = Vector2(300, 0)` 没问题,但写 `size = Vector2(300, 800)` 就会被忽略。靠容器和 `size_flags` 解决布局,而不是固定尺寸。

**`EditorInterface.get_resource_filesystem().scan()` 是异步的,但不会阻塞编辑器。** 这是个友好的设计,但也意味着新生成的 `.tres` 不会立即出现在 FileSystem 面板里。如果你的插件想在生成完资源后立刻把它"选中"或者"刷新到 Inspector",必须等 `filesystem_changed` 信号回来,再调 `EditorInterface.get_resource_filesystem().get_filesystem()` 找你刚生成的路径。心急的写法会拿到旧的快照,显得"插件没生效"。

**插件运行过程不要修改用户当前正在编辑的场景,除非用户明确请求。** 4.6 编辑器对未保存的场景修改有 dirty flag,如果你的插件在用户没察觉的情况下偷偷改了主场景,用户保存时会发现一堆莫名其妙的修改,极容易被误判成"插件破坏了我的项目"。一个保守的规则是:插件只读、只生成新资源,改场景一定先弹确认。

**字符串硬编码路径要走 `const` 常量。** 上面样例用 `const SPRITE_DIR := "res://items/sprites/"` 而不是把字符串散在三处,理由是:第一,常量名比裸字符串更易读;第二,如果哪天用户搬目录,改一个常量比全文搜替换稳。配合 `@export var sprite_dir: String = "res://items/sprites/"` 还能让常量变成可在 Inspector 里调整的参数,适合做"可配置插件"。

**插件版本管理被严重低估。** `plugin.cfg` 里的 `version` 字段不是装饰,如果你把插件分享给别人或者自己跨项目复用,这个数字是用户决定是否升级的唯一依据。建议你给每个稳定版的插件打 git tag,在 `plugin.cfg` 写明 `version="0.2.0"`,这样以后即便你的插件代码躺在某个项目里被尘封一年,翻回来时还能看到"啊这一版我做了什么"。Godot 4.x 的项目设置面板会显示插件版本号,这一栏空着会让其他用户怀疑你这个插件还活着没。

**编辑器重启不会丢插件状态,但代码热重载会。** 4.6 编辑器支持脚本热重载,你改完 `plugin.gd` 保存,编辑器会立刻重新加载这个脚本——但已有的 dock 实例不会被销毁重建。结果是新代码的 `_enter_tree` 永远不会跑第二次,你的修改可能"看不到效果"。解决办法是手动在 Project Settings 里把插件禁用再启用一次,触发 `_exit_tree` + `_enter_tree` 的完整循环。这是开发期最大的认知摩擦,记住"改了 `_enter_tree` 就 disable/enable 一次"即可。

## 手动验证

- [ ] 启用 Item Forge 插件,右上区域出现标着 "Item Forge" 的 dock 面板,带"扫描"按钮和状态标签。
- [ ] 在 `res://items/sprites/` 放两个 PNG(随便起名,例如 `apple.png` / `sword.png`),点扫描,`res://items/data/` 里出现 `apple.tres`、`sword.tres`,各自的 `item_id`、`display_name`、`icon` 字段已被预填。
- [ ] 再点一次扫描按钮,状态显示 `created=0, skipped=2`,旧 `.tres` 没被覆盖。
- [ ] 把 dock 从右侧拖出主窗口变成浮动小窗,再拖回另一个 slot,内部布局都不破。
- [ ] 在 Project Settings → Plugins 里禁用插件,dock 消失;再启用,dock 重新出现且无报错。
- [ ] 关掉编辑器再开,启用状态保留,dock 内容不要在重启后异常。
