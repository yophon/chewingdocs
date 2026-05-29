# HUD、菜单与 Godot UI 容器系统

游戏画面分两层:世界和 UI。角色、敌人、地图跟着相机走;血条、菜单、背包贴在屏幕上。把这两层混在一起,后面一定错位。

> 一句话先记住:**世界用 Node2D,界面用 Control,HUD 放进 CanvasLayer。**

---

## 一、不要用 Sprite2D 做按钮

`Sprite2D` 能画图,但它不是 UI 控件。它没有焦点、没有主题、没有键盘/手柄导航,也不会被容器布局。

Godot UI 用 `Control` 系列:

```text
Label
Button
TextureRect
ProgressBar
Panel
MarginContainer
HBoxContainer / VBoxContainer
GridContainer
```

能点的东西用 `Button`。能排版的东西放 `Container`。能显示图片的 UI 用 `TextureRect`。

---

## 二、HUD 标准结构

```text
HUD (CanvasLayer)
└── Root (Control, Full Rect)
    ├── TopLeft (MarginContainer)
    │   └── VBoxContainer
    │       ├── HealthBar (ProgressBar)
    │       └── CoinRow (HBoxContainer)
    └── BottomCenter (CenterContainer)
        └── HintLabel (Label)
```

`CanvasLayer` 让 HUD 不受 `Camera2D` 影响。相机震动时血条不应该跟着晃。

`Root` 设置成 Full Rect,铺满屏幕。之后内部位置交给容器。

---

## 三、Container 接管子节点位置

只要父节点是 `HBoxContainer`、`VBoxContainer`、`GridContainer` 这类容器,子节点的位置就不要手动摆。

```text
手动摆 position: 适合 Node2D 世界对象
Container 排版: 适合 Control UI
```

给按钮设置最小尺寸:

```gdscript
button.custom_minimum_size = Vector2(160, 40)
```

让控件争取剩余空间:

```gdscript
control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
```

少写绝对坐标。绝对坐标在 720p 看起来对,到 1080p、Steam Deck、窗口缩放就容易坏。

---

## 四、HUD 只订阅数据

HUD 不要去找玩家节点路径:

```gdscript
get_node("/root/Game/Player").hp
```

延续第 05 篇的做法,HUD 拿 `PlayerStats`:

```gdscript
# res://ui/hud.gd
class_name HUD
extends CanvasLayer

@export var stats: PlayerStats

@onready var _hp_bar: ProgressBar = %HealthBar
@onready var _coin_label: Label = %CoinLabel

func _ready() -> void:
    assert(stats != null, "HUD.stats must be assigned")
    stats.hp_changed.connect(_on_hp_changed)
    _refresh_hp()

func _on_hp_changed(_hp: int, _max_hp: int) -> void:
    _refresh_hp()

func _refresh_hp() -> void:
    _hp_bar.max_value = stats.max_hp
    _hp_bar.value = stats.hp

func set_coins(value: int) -> void:
    _coin_label.text = str(value)
```

HUD 是显示层。玩家数据怎么变,不应该由 HUD 决定。

---

## 五、暂停菜单

暂停菜单要在游戏暂停时仍能响应输入。

结构:

```text
PauseMenu (CanvasLayer)
└── Root (Control)
    └── Panel
        └── VBoxContainer
            ├── ResumeButton
            ├── RestartButton
            └── QuitButton
```

脚本:

```gdscript
# res://ui/pause_menu.gd
class_name PauseMenu
extends CanvasLayer

signal restart_requested
signal quit_requested

@onready var _root: Control = %Root
@onready var _resume: Button = %ResumeButton

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    hide_menu()

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed(&"pause"):
        if get_tree().paused:
            hide_menu()
        else:
            show_menu()

func show_menu() -> void:
    get_tree().paused = true
    _root.visible = true
    _resume.grab_focus()

func hide_menu() -> void:
    get_tree().paused = false
    _root.visible = false

func _on_resume_button_pressed() -> void:
    hide_menu()

func _on_restart_button_pressed() -> void:
    hide_menu()
    restart_requested.emit()

func _on_quit_button_pressed() -> void:
    hide_menu()
    quit_requested.emit()
```

按钮自己不切场景,只发请求。第 15 篇的场景管理器接这个请求。

---

## 六、背包先用 GridContainer

八格背包:

```text
InventoryPanel (Panel)
└── MarginContainer
    └── GridContainer(columns = 4)
        ├── Slot0
        ├── Slot1
        └── ...
```

槽位可以先做成 `TextureButton` 或 `Panel`:

```gdscript
func build_slots(count: int) -> void:
    for i in count:
        var slot := TextureButton.new()
        slot.custom_minimum_size = Vector2(48, 48)
        %GridContainer.add_child(slot)
```

拖拽、堆叠、物品详情以后再做。第 13 篇只要把容器骨架搭好。

---

## 七、Theme 统一外观

不要每个按钮单独改颜色。做一个 `Theme.tres`,挂在 UI 根节点上。

Theme 负责:

```text
Button normal / hover / pressed
Label font
ProgressBar fill
Panel background
```

以后想换 UI 风格,改 Theme,不是全项目搜按钮。

---

## 验收

- HUD 放在 `CanvasLayer`,不被相机影响。
- UI 节点使用 `Control` 和 `Container`,不是手摆一堆坐标。
- 暂停时菜单还能响应按钮。
- 暂停菜单按钮发信号,不直接切场景。
- HUD 通过数据或信号刷新,不硬找玩家路径。
- 背包槽位用 `GridContainer` 排列。

---

## 常见坑

**坑 1:Label 挂在 Node2D 下当世界血条。**

可以临时用,但正式 HUD 用 CanvasLayer。敌人头顶血条要么用世界节点,要么手动做坐标转换。

**坑 2:Container 里还手动设 position。**

容器会覆盖它。用 size flags 和 minimum size 表达布局。

**坑 3:暂停后按钮没反应。**

检查菜单节点的 `process_mode`。

**坑 4:UI 到处单独改样式。**

用 Theme 收口。

---

下一篇讲存档、配置和版本迁移。
