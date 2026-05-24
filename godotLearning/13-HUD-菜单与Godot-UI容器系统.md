# 13-HUD、菜单与 Godot UI 容器系统

> 一句话导读:Godot 的 UI 不是 DOM,也不是 ImGui。它是一棵继承自 `CanvasItem` 的 `Control` 树,用 anchor 和 Size Flags 表达布局意图,用 `Container` 接管子节点的位置,用 `Theme` 一次性覆盖整套外观。

游戏 UI 和网页 UI 看起来都在屏幕上画矩形,工程师容易想当然。但游戏 UI 的约束更狠:HUD 要叠在跟随相机的游戏画面之上而不跟相机晃,暂停菜单要在 `_physics_process` 全停下来时还能响应输入,背包要在 720p / 1080p / 4K 上对齐到像素,玩家把窗口拉到 1366×768 还不能错位。这些约束在 Web 里靠浏览器和操作系统兜底,在游戏引擎里要自己理顺。

`webLearning` 已经把 flex / grid / 媒体查询讲透,这里只讲 Godot 视角的 UI:Control 的坐标系、Container 的接管规则、Theme 的查找链,以及 HUD / 暂停菜单 / 背包三种典型场景的最小可行实现。

## 1. 机制定位

2D 游戏的画面通常由两类内容组成:跟随 `Camera2D` 在世界里移动的角色、敌人、地图,以及不跟随相机、贴在屏幕上的血条、计分、按钮。前者用 `Node2D` 体系,世界坐标参与物理与碰撞;后者用 `Control` 体系,只关心屏幕矩形与输入命中。新手最常见的错误是把这两者混着用:

- 用 `Label` 直接挂在玩家头顶显示血量。短期能跑,但只要相机一缩放或屏幕分辨率一变,字号、间距、对齐立刻散架,因为 `Label` 是 `Control`,它不参与 `Camera2D` 的世界变换,你以为它"跟随玩家"其实是巧合。
- 用 `Sprite2D` 当按钮。能画出来,能 `Area2D` 检测点击,但拿不到 focus、tab 导航、键盘 / 手柄交互,改个分辨率就要重新摆位置。
- 暂停菜单挂在主场景下,玩家按 Esc 后菜单没反应,因为整棵树都被 `paused` 冻住,菜单的按钮也没在跑。
- 背包用一堆 `TextureRect` 手动 `position.x += 64` 排列,加一格要重写一遍,玩家拉宽窗口后空了半屏。

这些错位的根源是没有意识到 Godot 把 UI 单独划成了一套子系统:坐标用 anchor + offset 而不是 (x, y);布局由 `Container` 决定而不是手摆;暂停由 `process_mode` 选择性穿透而不是全停;命中由 `mouse_filter` 串接而不是单点检测。这一层心智没建起来,后面无论怎么调都像在猫蛋糕。

更深一层的差异是:Web 的 DOM 是一个由浏览器维护的、独立于业务逻辑的展示树,事件冒泡 / 样式继承 / 重排都由浏览器调度;Godot 的 UI 是场景树的一部分,跟物理节点共享相同的 `_process` / `_input` / `_ready` 生命周期。这意味着 UI 性能问题就是游戏性能问题——`_process` 里写一个昂贵的字符串拼接,会和 `_physics_process` 抢同一帧的预算;UI 更新不及时会和角色卡顿同时出现。把 UI 和游戏视作同一棵树,而不是两个互不相干的系统,是后面写性能友好 UI 的关键前提。

本篇的工程目标是给原型搭三块 UI:跟随玩家但不被相机带歪的 HUD(血条 + 金币 + 钥匙图标)、玩家按 Esc 触发的暂停菜单(继续 / 重开 / 退出三个按钮)、能装下 8 个格子的背包雏形。完成后,原型就具备了显示状态、接收菜单输入和承载物品系统的能力,后续第 16-18 篇的事件总线、组件化、数据驱动可以挂在这套 UI 上扩展。本篇不展开"动态生成物品列表"或"拖拽交换槽位",那是数据驱动篇的事;这里只把视图骨架立起来。

## 2. Godot 心智

理解 Godot UI,先要理解一条继承链:

```text
Object → Node → CanvasItem → Node2D
                            → Control → Container → BoxContainer → HBoxContainer / VBoxContainer
                                                  → GridContainer
                                                  → MarginContainer
                                                  → CenterContainer / AspectRatioContainer / ...
                                      → Label / Button / TextureRect / Panel / RichTextLabel / ...
```

`CanvasItem` 是所有可绘制节点的基类,提供 `modulate`、`z_index`、`visible`、绘制顺序和材质槽。`Node2D` 在它之上加了世界坐标(`position`、`rotation`、`scale`)以及 `_draw()` 的世界变换。`Control` 在它之上加了完全不同的一套定位语义:矩形大小 + anchor + offset,以及一整套与输入命中、focus、theme 相关的属性。这两条分支不能混用——把 `Label` 当 `Node2D` 子节点放,你的 `position` 会被强制覆盖;把 `Sprite2D` 放进 `HBoxContainer`,容器只会忽略它,因为它不是 `Control`。

### Control 的坐标系:anchor 与 offset

`Control` 的位置和大小不是 (x, y, w, h)。引擎里维护的是四对值:

- `anchor_left`、`anchor_top`、`anchor_right`、`anchor_bottom`:取值 0.0 到 1.0,表示矩形四条边相对父容器的"百分比锚点"。
- `offset_left`、`offset_top`、`offset_right`、`offset_bottom`:每条边在 anchor 之上额外的像素偏移。

最终屏幕矩形是 `parent_rect.size * anchor + offset`。这套设计的好处是:窗口缩放时,左 anchor=0 / 右 anchor=1 的控件自动跟着拉伸;锚点都设 0.5、offset 对称负数,控件就锚在父容器正中。坏处是从 Web/Flutter 转过来的工程师容易把 anchor 当成 CSS 的 `position: absolute; top: 0`,踩一脚 4.x 把 `margin_*` 全改名成 `offset_*` 的坑。

Godot 编辑器里提供了一组叫 Anchor Preset 的快捷预设(Top Left / Center / Full Rect / HCenter Wide ...),本质就是把这八个值一次性写好。手写代码时直接赋值即可,不要去碰旧版的 `margin_*`,那是 Godot 3 的字段名。

### Size Flags:把控制权交给容器

只要一个 `Control` 的父节点是 `Container`(`HBoxContainer`、`VBoxContainer`、`GridContainer`、`MarginContainer` 等等),它的 `anchor_*` 和 `offset_*` 都会被容器接管并每帧覆盖。这时候唯一能向容器表达"我要更多空间"的接口是 Size Flags:

- `size_flags_horizontal` / `size_flags_vertical`,值是 `SIZE_FILL`(0x1,默认占满分配空间)、`SIZE_EXPAND`(0x2,争取额外空间)、`SIZE_SHRINK_CENTER`(0x4)、`SIZE_SHRINK_END`(0x8),可以用按位或组合。
- `size_flags_stretch_ratio`:多个带 `EXPAND` 的兄弟节点之间,按比例分配剩余空间。

心智模型是:不放进容器,自己用 anchor + offset 定位;放进容器,把布局完全交给容器,用 Size Flags 表达伸缩意图。两套互斥,混用就掉坑。

容器还有一组容易忽略的属性:`custom_minimum_size`。它是 `Control` 上的,表示"无论容器怎么压缩,我至少要这么大"。背包槽设 `Vector2(64, 64)` 保证 4 列时每个槽至少 64 像素;按钮设 `Vector2(120, 36)` 保证文字短的按钮也不会缩成正方形。`custom_minimum_size` 是容器布局算法的硬下限,设了之后容器会尽量满足它,实在不行就让父容器被它撑大。

### CanvasLayer:把 UI 抬出世界相机

`Control` 默认是 `CanvasItem`,会被 `Camera2D` 的变换影响。HUD 想做到"相机平移血条不动",就要把整个 UI 子树挂在 `CanvasLayer` 下。`CanvasLayer` 是一个独立的渲染层,有自己的变换矩阵,默认不受 `Camera2D` 影响,`layer` 属性决定它的绘制顺序(数越大越靠上)。一个典型的 HUD 场景骨架是:

```text
HUD (CanvasLayer, layer=10)
└── Root (Control, anchor preset = Full Rect)
    ├── TopLeftPanel (MarginContainer)
    │   └── VBoxContainer
    │       ├── HealthBar (ProgressBar)
    │       └── CoinRow (HBoxContainer)
    └── BottomCenter (CenterContainer)
        └── HintLabel (Label)
```

`CanvasLayer.follow_viewport_enabled` 默认 false,如果设成 true,HUD 又会跟随相机。需要"贴在世界某物体上的 UI"(比如敌人头顶的血条)有两条路:一是用 `Sprite2D` 直接画,放弃 Control 的命中和 Theme;二是在 `Control` 上每帧手动同步 `position = camera.get_viewport().get_canvas_transform().affine_inverse() * world_position`。前者简单,后者灵活,具体选哪种看是否需要文本国际化与 hover 命中。原型阶段用 `Sprite2D` 加血条就够,文字化交互留给主 HUD。

层级安排上,一个常见的项目分层是:游戏世界(layer 0,默认)→ HUD(layer 10)→ 暂停菜单(layer 50)→ 切场景遮罩(layer 100)→ 调试覆盖层(layer 200)。每隔一个数量级留出空间,后期加东西不需要重排所有 layer。

### Theme:覆盖外观的查找链

每个 `Control` 都有一个 `theme` 属性,类型是 `Theme`,是一个 `Resource`。`Theme` 内部是个 `(theme_type, item_name) → value` 的字典,`theme_type` 是控件类型名(`Button`、`Label`、`Panel`),`item_name` 是该类型暴露的样式槽(`Button` 暴露 `normal`、`hover`、`pressed`、`font`、`font_color` 等等)。

控件渲染时按以下顺序查值:自身的 `theme_type_variation`,自身 `theme` 属性,父节点的 `theme`,再往上,最后到项目的 `default_theme`。这意味着只要在 HUD 根节点挂一个共享 `Theme.tres`,所有子按钮、标签都会沿用这套外观。要做"暗黑模式 / 浅色模式"切换,改根节点 theme 就行,不需要遍历每个控件。

样式资源里最常用的是 `StyleBox`,有 `StyleBoxFlat`(矢量边框、圆角、阴影)和 `StyleBoxTexture`(九宫格贴图)。一个 `Button` 的背景就是把 `normal` / `hover` / `pressed` / `disabled` 四个 `StyleBox` 替换成你想要的样子。

`theme_type_variation` 是同类型的"变体"机制:你有一种主按钮(`Button`),还想要一种危险按钮(红色)、一种次要按钮(描边款)。在 Theme 里定义两个新的类型 `DangerButton` 和 `SecondaryButton`,继承自 `Button`,只覆盖颜色;在场景里把对应按钮的 `theme_type_variation = "DangerButton"`,就能复用基础排版只换色调。这条机制对一人独立开发非常划算——它让 UI 风格收敛在一个 `.tres` 文件里。

### process_mode 与暂停穿透

`Node.process_mode` 决定一个节点在 `SceneTree.paused = true` 时还跑不跑。可选值:

- `PROCESS_MODE_INHERIT`(默认,跟随父节点)
- `PROCESS_MODE_PAUSABLE`(游戏没暂停时跑,暂停后停)
- `PROCESS_MODE_WHEN_PAUSED`(只有暂停时才跑)
- `PROCESS_MODE_ALWAYS`(永远跑)
- `PROCESS_MODE_DISABLED`(永远不跑)

暂停菜单的标准做法是:整棵菜单子树设成 `PROCESS_MODE_WHEN_PAUSED`,按钮按下后把 `SceneTree.paused` 翻回 `false`。这样游戏世界(角色、敌人、物理)冻在那一帧,菜单本身的 `_input` 和按钮信号还在响应。

## 3. 工程实现

下面三段代码分别覆盖 HUD、暂停菜单和背包雏形。放在 `res://ui/` 子目录下,与原型主场景解耦。

### HUD 节点

文件位置:`res://ui/hud.gd`。挂在 `HUD.tscn` 的根节点 `CanvasLayer` 上,场景包含 `MarginContainer` → `VBoxContainer` → `ProgressBar(HealthBar)` 与 `HBoxContainer(CoinRow)`。

```gdscript
extends CanvasLayer
class_name HUD

@export var max_health: int = 100
@export var fade_in_seconds: float = 0.25

@onready var _health_bar: ProgressBar = %HealthBar
@onready var _coin_label: Label = %CoinLabel
@onready var _key_icon: TextureRect = %KeyIcon
@onready var _hint_label: Label = %HintLabel

var _current_health: int = 100
var _coins: int = 0

func _ready() -> void:
    _health_bar.max_value = max_health
    _health_bar.value = max_health
    _key_icon.modulate.a = 0.0
    modulate.a = 0.0
    create_tween().tween_property(self, "modulate:a", 1.0, fade_in_seconds)

func update_health(new_value: int) -> void:
    _current_health = clampi(new_value, 0, max_health)
    var tween: Tween = create_tween()
    tween.tween_property(_health_bar, "value", _current_health, 0.15)

func add_coins(delta: int) -> void:
    _coins = maxi(0, _coins + delta)
    _coin_label.text = str(_coins)

func set_key_obtained(has_key: bool) -> void:
    var target: float = 1.0 if has_key else 0.0
    create_tween().tween_property(_key_icon, "modulate:a", target, 0.2)

func show_hint(text: String, duration: float = 2.0) -> void:
    _hint_label.text = text
    _hint_label.modulate.a = 1.0
    var tween: Tween = create_tween()
    tween.tween_interval(duration)
    tween.tween_property(_hint_label, "modulate:a", 0.0, 0.4)
```

几个关键点:
- 整个根节点是 `CanvasLayer`,layer 在场景里设成 10,保证压在游戏层之上、暂停菜单之下。
- `%HealthBar` 这种 `%`-前缀是 Godot 4 的 Unique Node ID(第 03 篇心智段已经铺垫),即使把 `HealthBar` 在场景里挪位置,引用也不会断。
- `update_health` 用 `Tween` 平滑过渡,而不是瞬变,数值跳变在体感上比掉血更刺眼。
- `_hint_label` 用 alpha 渐隐,避免文字突然消失带来的"什么时候出现的"问题。

HUD 自身不知道也不关心玩家是谁,只暴露四个语义化方法。第 16 篇会把这种"被动接受指令的视图节点"用事件总线串起来,这里先保持简单。

### 暂停菜单

文件位置:`res://ui/pause_menu.gd`。挂在 `PauseMenu.tscn` 的根节点 `CanvasLayer` 上,场景包含 `ColorRect`(半透明黑色蒙版)、`CenterContainer` → `PanelContainer` → `VBoxContainer`(包含三个 `Button`:继续 / 重开 / 退出主菜单)。

```gdscript
extends CanvasLayer
class_name PauseMenu

signal resume_requested
signal restart_requested
signal quit_to_menu_requested

@onready var _resume: Button = %ResumeButton
@onready var _restart: Button = %RestartButton
@onready var _quit: Button = %QuitButton
@onready var _root: Control = %Root

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_WHEN_PAUSED
    visible = false
    _resume.pressed.connect(_on_resume)
    _restart.pressed.connect(func() -> void: restart_requested.emit())
    _quit.pressed.connect(func() -> void: quit_to_menu_requested.emit())

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed(&"ui_pause"):
        if get_tree().paused:
            _on_resume()
        else:
            open()
        get_viewport().set_input_as_handled()

func open() -> void:
    visible = true
    get_tree().paused = true
    _resume.grab_focus()

func _on_resume() -> void:
    visible = false
    get_tree().paused = false
    resume_requested.emit()
```

几个关键点:
- `process_mode = PROCESS_MODE_WHEN_PAUSED` 让整个菜单子树在 `paused = true` 时还在响应;切记不要在 `_ready` 之前用 `@onready` 触发节点初始化,直接在 `_ready` 设置 process_mode 是最稳的。
- `_unhandled_input` 而非 `_input` 拦截 Esc,避免和文本框输入冲突。`ui_pause` 是在 Project Settings → Input Map 里添加的自定义动作,绑定 Esc 与手柄 Start。
- 打开菜单后立刻 `_resume.grab_focus()`,保证手柄玩家能用方向键直接选择;Godot 的按钮 focus 不会自动给第一项。
- 三个动作只 `emit` 信号,不直接执行场景切换,把"切场景"留给第 15 篇的 `SceneManager`。

### 背包雏形

文件位置:`res://ui/inventory_panel.gd` 与 `res://ui/inventory_slot.gd`。背包面板用 `GridContainer` 装 8 个槽,每个槽是一个继承自 `Button` 的自定义控件。

```gdscript
extends PanelContainer
class_name InventoryPanel

const SLOT_SCENE: PackedScene = preload("res://ui/inventory_slot.tscn")

@export var columns: int = 4
@export var slot_count: int = 8

@onready var _grid: GridContainer = %Grid

var _slots: Array[InventorySlot] = []

func _ready() -> void:
    _grid.columns = columns
    for i: int in range(slot_count):
        var slot: InventorySlot = SLOT_SCENE.instantiate()
        slot.slot_index = i
        slot.slot_clicked.connect(_on_slot_clicked)
        _grid.add_child(slot)
        _slots.append(slot)

func set_item(index: int, icon: Texture2D, count: int) -> void:
    if index < 0 or index >= _slots.size():
        return
    _slots[index].set_item(icon, count)

func clear_item(index: int) -> void:
    if index < 0 or index >= _slots.size():
        return
    _slots[index].set_item(null, 0)

func _on_slot_clicked(index: int) -> void:
    print("clicked slot ", index)
```

`InventorySlot` 是一个最小自定义控件:

```gdscript
extends Button
class_name InventorySlot

signal slot_clicked(index: int)

@export var slot_index: int = 0

@onready var _icon: TextureRect = %Icon
@onready var _count_label: Label = %CountLabel

func _ready() -> void:
    custom_minimum_size = Vector2(64, 64)
    pressed.connect(func() -> void: slot_clicked.emit(slot_index))
    set_item(null, 0)

func set_item(icon: Texture2D, count: int) -> void:
    _icon.texture = icon
    _icon.visible = icon != null
    _count_label.visible = count > 1
    _count_label.text = str(count)
```

几个关键点:
- `GridContainer.columns` 是布局核心参数,父容器宽度变化时自动重排;`custom_minimum_size` 决定槽的最小尺寸,实际尺寸由容器拉伸决定。
- 继承 `Button` 而不是 `Panel`,免费拿到 hover / pressed 视觉态,以及 focus 与键盘 / 手柄导航。
- `slot_clicked` 信号把 index 一并 emit,让面板做"哪个槽被点了"的分发,不需要遍历查找。
- 第 18 篇会把背包的数据(物品定义、堆叠规则、拖拽)做成 `Resource`,这里只保留视图层的最小骨架。

## 4. 调参和验收

UI 的"调参"主要在三个层面:Size Flags / 间距 / Theme。

**Size Flags 决定多分辨率下的伸缩。** 把窗口宽度从 1280 拖到 1920,你希望 HUD 里哪些元素跟着拉、哪些保持原状。规则是:不希望变就只设 `SIZE_FILL`,希望吃掉多余空间就加 `SIZE_EXPAND`,要居中就设 `SIZE_SHRINK_CENTER`。一个常见组合是血条 `SIZE_FILL | SIZE_EXPAND`、金币图标 `SIZE_FILL` 不带 EXPAND,这样窗口拉宽时血条变长、金币区不变。`size_flags_stretch_ratio` 在多个 EXPAND 控件之间分配:左侧主血条 ratio=3、右侧体力条 ratio=1,主血条占去 3/4。

**间距由容器决定。** `BoxContainer` 用 `add_theme_constant_override("separation", 8)` 控制兄弟节点间距;`MarginContainer` 用 `margin_top / margin_bottom / ...` 决定内边距;`GridContainer` 同时受 `h_separation` 和 `v_separation` 控制。直接在 Theme 资源里设这些常量更利于复用。

**Theme 决定一致性。** 项目里给所有按钮做一套 `StyleBoxFlat`:背景色、圆角、边框、悬停色。新加按钮自动套上同样外观,不需要每个 Button 手动配色。这套 Theme 文件放在 `res://ui/theme/main.tres`,在 HUD / 暂停菜单 / 背包的根 `Control` 上引用一次即可。

**多分辨率项目设置**:`project.godot` → `display/window/stretch/mode` 推荐 `canvas_items`(矢量缩放,UI 跟着拉),`aspect` 用 `keep` 维持横竖比、或者 `expand` 用黑边补差。像素风游戏选 `viewport` + `keep` 保证整数缩放。这一项的选择直接影响 HUD 的 anchor 表达——如果 stretch 选了 `viewport`,基础参考分辨率就是 `project_settings/display/window/size/viewport_*`,所有 anchor 算的是这个虚拟分辨率,玩家拉窗口不会改变 HUD 内部的相对布局。

下面是这一篇的硬性验收:

- 玩家在窗口分辨率从 1280×720 拉到 1920×1080 的过程中,HUD 不出现错位、不被裁切;血条左对齐贴边,金币图标右上角贴角。
- 暂停菜单打开后,玩家角色停在原位,敌人停在原位,但按钮的 hover 高亮还在工作,鼠标光标还能动。
- 按 Esc 在游戏 / 菜单之间能反复切换,没有"按一下没反应,按两下才生效"的丢帧。
- 背包面板从 4 列改成 5 列,只需要改 `columns` 一处,布局自动重算;往里塞 8 个槽时窗口不需要手摆 8 次位置。
- 把所有按钮的圆角改成 12px,只需要改 `main.tres` 里 `Button/normal` 的 `corner_radius_*`,不需要碰场景文件。
- 暂停菜单打开时按 Tab 键可循环 focus,按方向键能在按钮间切换,按空格 / 回车触发当前按钮——这是手柄玩家也能用的最低门槛。

## 5. 踩坑

**anchor 不是 CSS 的 anchor。** anchor 在 Godot 里是相对父容器的百分比(0.0 到 1.0),不是固定像素;offset 是 anchor 之上的像素偏移,可以是负数。一个常见错误是想让控件居中,把 anchor 都设 0.5 但忘了把 offset 设成 `-size/2`,结果只有左上角在中心。Anchor Preset 的 "Center" 预设会一次性把八个值都写好,优先用预设。

**Container 接管后,anchor 和 position 都失效。** 把 Button 放进 `HBoxContainer` 再去改 Button 的 `position`,改完下一帧就被容器覆盖。要"在容器里调位置"是个错位需求,真正想做的事情是:加 `MarginContainer` 包一层做边距,或者改 `size_flags`,或者把这个 Button 拿出容器单独定位。

**mouse_filter 默认 STOP,会吞掉子节点点击。** `Control.mouse_filter` 有三个值:`STOP`(命中后阻挡传递,默认)、`PASS`(自己接收并继续传)、`IGNORE`(完全透明)。HUD 根节点用 Full Rect 占满整个屏幕时,如果它默认 STOP,玩家点哪儿都点不到游戏世界。HUD 容器层一般都要改成 `MOUSE_FILTER_IGNORE`,只在真正可点击的按钮上保留 `STOP`。

**4.x 没有 margin_*,旧 API 改名成 offset_*。** 跟着 Godot 3 教程抄代码,会发现 `set_margin(MARGIN_LEFT, ...)` 报错。4.x 是 `offset_left = ...` 或者 `set_offset(SIDE_LEFT, ...)`。这一类改名 4.0 就完成了,4.6 没有反复,但旧教程满网都是。

**`PROCESS_MODE_WHEN_PAUSED` 是节点级别的,继承到子节点。** 给暂停菜单根 `CanvasLayer` 设 `WHEN_PAUSED`,所有按钮自动跟着,但只要中间有一个节点显式设了 `PAUSABLE` 或 `DISABLED`,继承链就断。`@onready` 在子节点初始化时,父节点已经被设过 process_mode,所以直接在 `_ready` 写没问题;但如果你 `var menu = PauseMenu.new(); add_child(menu)` 这种代码加载,要等下一帧或显式调一次 `propagate_call("set_process_mode", [Node.PROCESS_MODE_WHEN_PAUSED])`。

**Theme 在祖先链上查找,不在场景树根。** Theme 查找是从控件自身向上沿场景树父节点找,直到 `default_theme`。HUD 子节点引用主 Theme,只需要在 HUD 根 Control 上挂 `theme` 即可,所有后代继承。如果你把 `theme` 挂在 `CanvasLayer` 上,后代查不到,因为 `CanvasLayer` 不是 `Control`,它的 `theme` 属性查找链不通过它。

**Label 文字溢出 Container 会撑大父容器。** `Label` 默认根据文本内容计算 `minimum_size`,放进 `HBoxContainer` 后会把容器顶宽。要限制就设 `Label.autowrap_mode = AUTOWRAP_WORD_SMART`、`custom_minimum_size = Vector2(200, 0)`,或者在 `RichTextLabel` 上设 `fit_content_height = true`。最常被忽略的细节是 `clip_contents = true`,这是 `Control` 上的属性,启用后控件矩形外的绘制被裁切,可以避免 hover 文本从面板里溢出来。

**`add_theme_*_override` 是单控件覆盖,不污染 Theme 资源。** 经常被新手当成"修改 Theme",其实它只在当前控件实例上加一组覆盖。要全局改样式,改 `Theme.tres`;只想给这一个按钮加红色,用 `add_theme_color_override("font_color", Color.RED)`,场景关闭重开不会持久化。

**容器重排不是立刻发生的**。`HBoxContainer.add_child(new_node)` 之后,这一帧 `new_node.size` 还是 `Vector2.ZERO`,容器在 `NOTIFICATION_SORT_CHILDREN` 才真正布局,而这个通知在 `_process` 之后才被分发。需要拿到准确尺寸要 `await get_tree().process_frame` 或 `container.queue_sort()` 触发同步排版。新手常见症状是"加完按钮立刻调它的 size 失败",原因就是排版还没跑。

**手柄 / 键盘 focus 是另一套规则。** `Button.focus_mode` 默认 `FOCUS_ALL`,可用 tab 和方向键聚焦。但 `Control.focus_neighbor_*` 决定方向键流转,默认按场景树顺序,不一定符合人的直觉。复杂菜单要显式设置 `focus_neighbor_top / bottom / left / right`,或者用 Godot 4 的 `Container` 行为自动推断。

**`Control.visible = false` 不释放节点,只是不画。** 暂停菜单频繁开关用 `visible` 就够,不要 `queue_free()` 再 `instantiate()`,后者会丢失内部状态(比如音量滑块、上一次焦点位置),还会让 GC 多走一遍。

**`_gui_input` 与 `_input` / `_unhandled_input` 的区别**。`Control._gui_input(event)` 只在该 `Control` 真正命中输入时触发(矩形内 + `mouse_filter != IGNORE`),自动适配 focus 与命中链;`_input` 在节点层级接所有输入;`_unhandled_input` 在所有 `_input` / GUI / Action 都没处理时才触发。游戏内按钮 → `_gui_input`;游戏全局快捷键(Esc 暂停) → `_unhandled_input`;调试快捷键 → `_input`。混用会出现"暂停菜单按钮被父级 `_input` 提前吃掉"或者"按钮点击事件冒泡到关卡"。

**Anchor Preset 不是动态机制**。编辑器里的 Anchor Preset 只是把八个 `anchor_*` / `offset_*` 一次性写好,运行时改 anchor 不会"切换 preset"。代码里要居中就直接赋值八个数;不要去找一个不存在的 `set_anchors_preset` 方法(它存在但是带四个参数,常被新手用错)。`set_anchors_and_offsets_preset(Control.PRESET_CENTER)` 是一次性应用预设的正确写法,会同时帮你算 offset。

**`ProgressBar` 的渐变要靠 Tween 不要靠 `set_process`**。直接 `_process(delta)` 里 lerp value 会被 HUD 这种"偶尔更新"的节点白白吃 CPU。每次 `update_health` 创建一个新 `Tween`、播完自动销毁,既省 CPU 又不需要管"上一次动画是否还在跑"。

## 手动验证

- [ ] 启动游戏,HUD 在屏幕左上 / 右上 / 右下三处都贴对边,角色移动时 HUD 元素纹丝不动。
- [ ] 把窗口拖到 1366×768、1920×1080、2560×1440 三种分辨率,血条不被裁切,金币图标不重叠,背包格子不溢出。
- [ ] 按 Esc 打开暂停菜单,角色立即停下,菜单按钮 hover 高亮在动;再次按 Esc,角色立即恢复。
- [ ] 用手柄方向键能在暂停菜单三个按钮间循环切换,A 键确认。
- [ ] 改 `main.tres` 里按钮的 `corner_radius_top_left` 到 16,运行后所有按钮圆角一致变化,没有遗漏。
- [ ] 调整 `InventoryPanel.columns` 从 4 改到 8,背包槽自动重排成一行,不需要改其它代码。
- [ ] 把 HUD 根节点的 `mouse_filter` 改成 `STOP`,鼠标点击不再穿透到游戏世界(用来确认 mouse_filter 链路真的生效);测完改回 `IGNORE`。
- [ ] 关闭项目重新打开,UI 场景在编辑器里 `Anchor` 与 `Layout` 字段保持原样,没有出现 `(0, 0, 0, 0)` 这种被容器重写后的异常值。
