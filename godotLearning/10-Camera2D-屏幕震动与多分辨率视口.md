# 10-Camera2D、屏幕震动与多分辨率视口

> 一句话导读:`Camera2D` 不是把世界搬到屏幕上,而是把屏幕中心绑在一段会延迟、会偏移、会被噪声扰动的目标轨迹上;视口决定了"一个像素"到底有多大。

前 9 篇把角色做到能动、能跳、能撞,但游戏画面看起来还是僵硬的:角色一靠近屏幕边缘就贴边,跳跃的瞬间镜头死死跟着抖,改一下分辨率原本对齐的像素全花了。这些问题都不在角色身上,在镜头和视口。本篇把 `Camera2D` 当成一个独立的二阶系统讲透:它有自己的目标、自己的偏移、自己的扰动源,并且最终的输出要和 `Viewport` / `Window` 的拉伸策略协作。

## 1. 机制定位

### 镜头要解决的问题

2D 游戏的镜头本质上是一个一阶或二阶滤波器,把"角色当前位置"这个噪声很高的输入信号,转换成"屏幕中心"这个低频、可预测的输出信号。换句话说,玩家的输入是高频的(每帧改一次速度),角色物理体是高频的(每物理 tick 改一次位置),但镜头如果同样高频地跟着移动,玩家眼睛根本来不及处理,体感就是"晕"和"糊"。

新手最常见三种失控写法:

第一种是把摄像机当成 `Player` 的子节点。镜头紧贴角色,角色每帧抖一点镜头就抖一点。跳跃和受击时屏幕跟着剧烈摆动,横版动作游戏几乎不可玩。

第二种是写一段 `camera.position = player.position` 放在 `_process` 里。和上一种本质相同,只是手动复制,且因为 `_process` 在物理 tick 之前/之后的相对顺序不稳定,镜头会比角色"滞后一帧",像素游戏里直接表现为画面抖动。

第三种是开了 `position_smoothing_enabled = true` 就以为完事,然后发现 BOSS 一记重击,镜头没反应,因为平滑追踪是"持续逼近目标位置",不带任何瞬时扰动。

正确的心智是:镜头位置 = `lerp(当前, 目标, smoothing) + dead_zone_offset + shake_offset`,每一项都有独立的调参空间和独立的失效模式。

### 多分辨率视口要解决的问题

PC 玩家可能用 1920×1080、2560×1440 甚至 3840×2160,Steam Deck 是 1280×800,手机和掌机更杂。游戏内容(像素美术、UI 字体、Tile 网格)在工程里只可能用一个基准分辨率画。从基准分辨率到玩家屏幕的映射规则,就是视口的拉伸策略。

错误心智是"屏幕越大画面越多",于是用户用 4K 屏开你的横版游戏,看到一整张关卡地图,而你想让他看到的只是角色周围那一块。也错的是"屏幕越大画面越糊",用了线性过滤,4K 屏上像素被插值成糊糊的奶油色。

Godot 4 用 `Window.content_scale_mode` + `content_scale_aspect` + `content_scale_size` 三参数定义这套映射,完全替代了 Godot 3 的 `stretch_mode`/`stretch_aspect` 投影设置。同时,`scale_mode` 子参数(`integer` / `fractional`)决定整体缩放比例是否被限制为整数,这是像素游戏和非像素游戏的真正分水岭。

理解这条链路,意味着你要回答三个问题:基准分辨率定多大、宽高比不匹配时如何处理、像素允许小数倍缩放吗。三个问题各自对应一个项目设置项,且需要和 `Camera2D.zoom`、纹理过滤策略一起统筹。

## 2. Godot 心智

### `Camera2D` 是一个变换源,不是一个观察者

`Camera2D` 是一个挂在场景树里的 2D 节点,自己有 `position`,被 `Viewport` 选为当前激活相机后,它的全局变换的逆,会作为 `canvas_transform` 应用到这个 viewport 的所有 `CanvasItem` 上。换句话说,镜头移动的是世界,不是相机本身的渲染。

理解这一点之后,几个似乎"违反直觉"的现象就解释通了:

- 你看到的"镜头跟着角色"实际上是"世界整体向角色的反方向偏移",所以如果你在镜头脚本里手抖把 `position` 设成了角色 `global_position` 的两倍,角色不会跑出屏幕,而是会被画到屏幕的反方向极远处。
- 多个 `Camera2D` 节点可以同时存在,但同一个 viewport 在任意瞬间只有一个 current。切换镜头本质上是切换 `canvas_transform` 的来源,这正是过场动画、对话特写、boss 战切换的实现方式。
- 镜头本身被父节点变换影响。父节点旋转 90 度,镜头视图也跟着旋转(因为它的全局变换包含父级旋转)。这就是为什么要把相机挂在不旋转、不缩放的"场景根"下,而不是任何会移动的逻辑节点下。

### Dead Zone:从"硬贴"到"懒洋洋"

新手如果把镜头写成 `camera.position = player.position`,会发现哪怕角色只是抬手挥剑,屏幕中心也跟着摆动几个像素。这种"过度响应"是 2D 镜头里最常见的体感问题之一。`Camera2D` 的 dead zone(在 Inspector 里叫 Drag)就是为了让镜头"懒一点":

- 想象屏幕中心有一个矩形 dead zone,边界由四个 `drag_*_margin` 比例定义。
- 角色在 dead zone 内移动时,镜头完全不动。
- 角色越界后,镜头只在该方向追,直到把角色"推"回 dead zone 边界。

这套机制和 `position_smoothing` 是叠加的,不是替代:dead zone 决定目标,smoothing 决定逼近曲线。最终的镜头行为是"角色越界 → 设新目标 → 平滑趋近",每一步都用各自的参数。

注意 4.6 的 `drag_left_margin` 等属性是 0~1 的比例(`drag_horizontal_offset` / `drag_vertical_offset` 才是单独的 -1~1 推动量),不是像素。这是从 4.0 开始的命名,3.x 用过的 `drag_margin_h_enabled` 之类旧名已经被替换。

### `offset`、`zoom` 与 `position` 各管一摊

`Camera2D` 暴露的属性看起来有不少能影响视点,但语义并不重叠:

- `position`:相机自身在世界中的位置。是 `position_smoothing` 的目标,也是 dead zone 计算的输入。**所有"追踪目标"的脚本应当只写它**。
- `offset`:在 `position` 之上的视点偏移,**不被 smoothing 平滑**。**所有"震动、回弹、look-ahead 微调"的脚本应当只写它**。
- `zoom`:`Vector2(2, 2)` 表示放大 2 倍,世界缩小一半。运行时改 zoom 会改变 dead zone 的实际像素大小,因为 dead zone 是按视口比例算的。
- `rotation`:相机旋转。注意 2D 像素游戏一般不旋转镜头,因为整数像素和旋转不兼容,会引入糊化。

### 节点关系与生命周期

镜头不能是角色的子节点,否则父子变换会先把角色的抖动传过去,再让相机自己平滑,这是两个滤波器串联,得到的并不是你想要的曲线。正确做法是:把 `Camera2D` 放在和角色同级的"游戏世界根"下,用脚本或 `RemoteTransform2D` 把"目标位置"喂给相机。

最朴素的喂法是:

```text
Level (Node2D)
├── Player (CharacterBody2D)
├── Enemies
├── TileMapLayer
└── GameCamera (Camera2D, 脚本里读取 Player.global_position 作为目标)
```

相机自己每物理 tick 移动 `position`,平滑追踪由 `Camera2D` 内部处理;`offset` 由 shake 系统每帧覆写。

`reset_smoothing()` 是关键 API:每次场景切换、角色瞬移、关卡复位时调用,否则镜头会从上一张关卡的位置开始"走过来",观感上像是一段慢镜头滑入。还有一个不那么显眼但同样重要的 `make_current()`,在场景里有多台 `Camera2D` 时,显式声明哪一台是当前激活相机,避免节点入树顺序决定的隐式选择。

### 视口与窗口

`Viewport` 是 Godot 的渲染容器,根节点叫 `Window`,本质上是一个继承自 `Viewport` 的特殊节点。`Window.content_scale_mode` 决定如何把"内容基准尺寸"拉伸到"窗口当前尺寸":

- `CONTENT_SCALE_MODE_DISABLED`:不缩放,基准只是初始窗口大小,后续按 1:1 渲染,窗口变大就多露出。
- `CONTENT_SCALE_MODE_CANVAS_ITEMS`:**绝大多数 2D 游戏的默认选择**。所有 `CanvasItem` 按比例缩放,UI 和世界同步缩放,直接在目标分辨率渲染,适合矢量风或非像素风。
- `CONTENT_SCALE_MODE_VIEWPORT`:先在基准尺寸的低分辨率 viewport 渲染,再整体放大到窗口。**像素风首选**,因为它能保证像素是大块的整数倍。

`content_scale_aspect` 决定宽高比不匹配时如何处理:

- `KEEP`:加黑边维持宽高比。
- `KEEP_WIDTH` / `KEEP_HEIGHT`:基准宽/高不变,另一维多出/少出。
- `EXPAND`:多出的区域露出更多游戏内容(横版动作友好)。
- `IGNORE`:直接拉伸变形,几乎从来不该用。

还有一个常被忽视的 `Window.content_scale_factor`,默认 1.0,可以用作"全局 UI 缩放比例",方便给视障玩家提供 1.25/1.5 倍 HUD。它和 `content_scale_mode` 是叠加关系。

注意:Godot 3 的 `stretch_mode = "2d"/"viewport"` 对应的就是 4.x 的 `canvas_items`/`viewport`,迁移文档里有等价表。Godot 4.6 仍然在 `display/window/stretch/mode` 这个项目设置 key 下,允许的值变成了 `disabled`/`canvas_items`/`viewport`,运行时则通过 `Window.content_scale_mode` 这个新枚举读写。

## 3. 工程实现

### 文件:`scenes/camera/game_camera.gd`

这是一个跟随目标、带 dead zone、带噪声 shake 的 `Camera2D` 子类,挂到场景里的 `Camera2D` 节点上即可。

```gdscript
class_name GameCamera
extends Camera2D

## 跟随目标(通常是 Player)。可以为空,空时镜头静止。
@export var follow_target: Node2D

## 屏幕震动用的噪声资源。建议在 Inspector 里挂一个 FastNoiseLite,
## frequency 设到 30 左右,seed 随便。
@export var shake_noise: FastNoiseLite

## 震动强度上限(像素)。BOSS 重击 12-16,普通受击 4-6。
@export var shake_max_offset: float = 8.0

## 震动旋转上限(弧度),pixel art 一般留 0。
@export var shake_max_roll: float = 0.0

## 震动衰减速率,数值越大恢复越快。1.5~3.0 是常用区间。
@export_range(0.5, 6.0, 0.1) var shake_decay: float = 2.0

# 当前震动强度(0~1),trauma 取平方放大,曲线更脆。
var _trauma: float = 0.0
var _time: float = 0.0


func _ready() -> void:
    make_current()
    position_smoothing_enabled = true
    position_smoothing_speed = 10.0
    drag_horizontal_enabled = true
    drag_vertical_enabled = true
    drag_left_margin = 0.15
    drag_right_margin = 0.15
    drag_top_margin = 0.10
    drag_bottom_margin = 0.10
    if shake_noise == null:
        shake_noise = FastNoiseLite.new()
        shake_noise.frequency = 30.0


func _physics_process(delta: float) -> void:
    if follow_target != null:
        global_position = follow_target.global_position
    _time += delta
    _trauma = maxf(_trauma - shake_decay * delta, 0.0)
    offset = _compute_shake_offset()


## 外部接口:受击、爆炸、落地震屏调用。amount 是 0~1 的伤害强度。
func add_trauma(amount: float) -> void:
    _trauma = clampf(_trauma + amount, 0.0, 1.0)


## 场景切换或瞬移后调用,避免平滑追踪从老位置缓动过来。
func snap_to_target() -> void:
    if follow_target != null:
        global_position = follow_target.global_position
    reset_smoothing()
    _trauma = 0.0
    offset = Vector2.ZERO


func _compute_shake_offset() -> Vector2:
    if _trauma <= 0.0 or shake_noise == null:
        return Vector2.ZERO
    var amount: float = pow(_trauma, 2.0)
    # 三个独立的噪声通道:x、y、roll(可选)
    var nx: float = shake_noise.get_noise_2d(_time * 1000.0, 0.0)
    var ny: float = shake_noise.get_noise_2d(0.0, _time * 1000.0)
    return Vector2(nx, ny) * shake_max_offset * amount
```

几处工程取舍说明:

- 用 `_physics_process` 而非 `_process`,因为目标(`CharacterBody2D`)在物理 tick 中更新位置,镜头跟着同一个时钟可以避免"差一帧"的撕扯。`Camera2D` 自身的 `position_smoothing` 是基于 `process_callback`(默认 `CAMERA2D_PROCESS_PHYSICS`)运行的,要和你写的代码对齐。
- `trauma` 取自 Squirrel Eiserloh 在 GDC 2013 提出的设计:能量值 0~1,平方放大,衰减线性。比直接随机震幅更可控。
- `offset` 而不是 `position` 承载震动,因为 `position` 是平滑追踪的输入,你把震动写在那里,平滑追踪会"努力地把震动也跟稳",震感全没了。

### 文件:`scenes/level/main_level.gd`(片段,演示如何驱动)

```gdscript
extends Node2D

@onready var player: CharacterBody2D = %Player
@onready var camera: GameCamera = %GameCamera


func _ready() -> void:
    camera.follow_target = player
    camera.snap_to_target()
    player.hit_taken.connect(_on_player_hit)


func _on_player_hit(damage: float) -> void:
    var normalized: float = clampf(damage / 50.0, 0.0, 1.0)
    camera.add_trauma(normalized * 0.6 + 0.2)
```

这里假设 `Player` 暴露了 `hit_taken(damage: float)` 信号,关卡只负责把伤害值翻译成 trauma 量级。下层不知道镜头存在,镜头不知道伤害公式,二者只通过信号约定耦合。

### 给镜头加一个 look-ahead(可选增强)

如果你做的是横版动作或卷轴射击,常见的体验优化是"角色向右跑时镜头略微向右偏",让玩家提前看到前方。这不必改 dead zone,只要在 `offset` 上叠加一个跟着速度变化的目标偏移即可:

```gdscript
@export var look_ahead_x: float = 24.0
@export var look_ahead_smooth: float = 4.0

var _look_ahead: Vector2 = Vector2.ZERO

func _physics_process(delta: float) -> void:
    if follow_target != null:
        global_position = follow_target.global_position
        var target_offset: Vector2 = Vector2.ZERO
        if follow_target.has_method("get_facing_sign"):
            target_offset.x = follow_target.get_facing_sign() * look_ahead_x
        _look_ahead = _look_ahead.lerp(target_offset, look_ahead_smooth * delta)
    _time += delta
    _trauma = maxf(_trauma - shake_decay * delta, 0.0)
    offset = _look_ahead + _compute_shake_offset()
```

注意 look-ahead 写在 `offset` 上,和 shake 一样,不污染 `position_smoothing`。它和 dead zone 也不冲突:dead zone 决定"是否要追角色",look-ahead 决定"追上以后视点要不要再往前探一点"。

### 文件:`project.godot`(关键片段)

像素风游戏的推荐配置:

```ini
[display]
window/size/viewport_width=480
window/size/viewport_height=270
window/size/window_width_override=1920
window/size/window_height_override=1080
window/stretch/mode="viewport"
window/stretch/aspect="keep"
window/stretch/scale_mode="integer"

[rendering]
textures/canvas_textures/default_texture_filter=0
```

`viewport` 模式 + `integer` scale_mode 是真正的"像素 perfect 双保险":先在 480×270 渲染,再以整数倍缩放贴到 1920×1080(刚好 4 倍)。`default_texture_filter=0` 是 Nearest(最近邻),全局禁用线性过滤;若某些贴图(粒子、特效)仍想要平滑,改写在对应 `Sprite2D.texture_filter` 上即可,优先级更高。

非像素风游戏改成:

```ini
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"
window/stretch/scale_mode="fractional"
[rendering]
textures/canvas_textures/default_texture_filter=1
```

`canvas_items` + `expand` + `fractional` + Linear:UI 字体清晰,横屏不留黑边,世界部分多露出。

如果你希望像素风游戏在窗口尺寸不够整数倍时也接受一档"次优"的小数倍(比如 1366×768 屏只能放 2.85 倍 480×270),把 `scale_mode` 改成 `fractional` 并把 `default_texture_filter` 仍保持 Nearest,可以在保留像素硬边的同时避免黑边过大。这是大多数 Steam 玩家的实际场景。

## 4. 调参和验收

### 平滑追踪曲线怎么挑

`position_smoothing_speed` 数值的物理意义是"每秒以多少像素的最大速度追赶目标"。但实际逼近曲线不是线性,Godot 内部用的是指数衰减:每物理 tick,残余距离按 `1 - exp(-speed * delta)` 收敛。

工程经验值:

- 4 ~ 6:慢节奏养成、解谜,镜头明显跟不上,营造"镜头是观察者"的疏离感。
- 8 ~ 12:横版动作、平台跳跃主流区间。8 偏柔和,12 偏紧凑。
- 14 ~ 18:快节奏射击、Roguelike,镜头几乎贴着角色但不抖动。
- 20+:相当于没开平滑,只是省去自己写 lerp,慎用。

### Dead Zone 怎么调

`drag_*_margin` 是相对视口尺寸的比例,不是像素。`drag_left_margin = 0.2` 意味着角色在屏幕左侧 20% 半宽以内不会推动镜头。横版游戏推荐左右大、上下小:水平拖拽 0.15~0.25,垂直拖拽 0.05~0.15。原因是玩家水平移动多,镜头追得太紧会晃;垂直方向跳跃和落地频繁,如果给太大 dead zone,角色起跳后镜头不动,看不到落点。

### Shake 量级

`shake_max_offset` 单位是基准分辨率下的像素。在 480×270 基准上,`8` 对应屏幕 1.6%,已经够烈;打 BOSS 高潮可以走到 `12~16`。如果你在 1920×1080 基准上,要乘 4(因为 viewport 模式下震动也会跟着整数倍放大),设到 32 比较合理。

`shake_decay = 2.0` 意味着 trauma 从 1.0 衰减到 0 需要 0.5 秒。配合平方放大,感官上震动会"瞬间到顶,然后很快平静",这是动作游戏需要的曲线。改成 `0.8` 试试,你会感觉像没刹车的电梯。

如果想让不同事件叠加震动而不互相覆盖,`add_trauma` 改成"取最大值"会比"求和"更好:`_trauma = maxf(_trauma, amount)`。原因是多个小震动求和容易溢出到 1.0 并被钳制,体感无差别;取最大值能保留"最严重的那一击"独立衰减。

### `shake_noise.frequency` 与 trauma 的关系

`FastNoiseLite.frequency` 控制采样空间的密度。频率越大,相邻样本变化越剧烈,镜头摆动越"高频抖动",像低预算电影的手持镜头;频率越小,样本越平滑,镜头摆动接近正弦波,像被低音炮震到。常见区间:

- 8 ~ 15:慢节奏摇摆,适合震屏背景(地震、巨兽踩地)。
- 25 ~ 40:动作打击主流区间,像传统横版动作。
- 60+:高速电流抖动,适合电击 debuff 这种特殊状态。

不要给 `frequency` 一个非常大的值再期待用衰减"压住",衰减只是降低振幅上限,频率特征不变。

### 多分辨率验收清单

- 在 1920×1080 全屏运行:UI 不变形,角色像素整齐,无糊化。
- 缩窗口到 1280×720:像素游戏应当只有更小的整数倍(1280/480 不整除,所以会有黑边,这是对的);非像素游戏应当无黑边。
- 拉到 3840×2160:整数倍模式应该 8 倍渲染,边缘锐利;若边缘开始模糊,检查 `scale_mode` 是否为 `integer` 而非 `fractional`。
- 21:9 超宽屏:`KEEP` 模式两侧黑边,`EXPAND` 两侧多露出关卡。后者要确认关卡边界够宽,否则会露出空场。

### 镜头切换的优先级

场景里同时有多台 `Camera2D` 时,Godot 用一个简单规则决定谁生效:最后被 `make_current()` 的那一台。`enabled` 仅控制"是否参与候选",不直接决定优先级。一个常见的过场镜头实现:战斗结束、boss 倒地时,在战场尾部摆一台 `CinematicCamera`,运行时 `make_current()` 切过去,等 `AnimationPlayer` 播完再切回 `GameCamera`,并对后者调一次 `reset_smoothing()`。如果忘记 `reset_smoothing()`,玩家会看到镜头从过场位置慢慢滑回主角身上,过场感残留。

### Physics Interpolation 的相处方式

Godot 4.4+ 默认开启 Physics Interpolation,2D 物理体在两次物理 tick 之间被渲染插值,角色看起来比单纯 60Hz 物理更顺滑。镜头跟随写在 `_physics_process` 里能匹配同一节奏,但要注意:你直接读 `follow_target.global_position` 拿到的是物理 tick 上的位置,而被渲染出来的角色可能在两 tick 之间;两者的视觉差是 0~1 个物理帧。如果做精确瞄准镜头(比如狙击放大),最好启用相机自身的 Physics Interpolation 开关,或者把镜头跟随移到 `_process` 并改读物体的插值位置(`get_global_transform_interpolated()`)。

## 5. 踩坑

**坑 1:把 `Camera2D` 设成角色子节点,然后开 `position_smoothing`。** 平滑只在 `position`(本地坐标)上生效,本地坐标因为父级是角色而恒为零附近,平滑根本没意义。表现是镜头硬贴角色、smoothing 形同虚设。解法:相机和角色同级,脚本喂目标位置。

**坑 2:在 `_process` 里更新相机目标,角色在 `_physics_process` 里移动。** 物理 tick 通常 60Hz,渲染 tick 看显示器(可能 144Hz)。两个时钟错位,角色每物理帧动一次,镜头每渲染帧补一次,在像素游戏里会看到角色每两帧"跳"一像素,镜头跟着抖。解法:把镜头跟随写在 `_physics_process`,或者打开 Project Settings 的 Physics Interpolation(4.4+),让物理体在渲染插值。

**坑 3:`reset_smoothing()` 忘了调。** 关卡切换、玩家死亡复位、坐传送门时,镜头会从原位置慢慢滑到新位置,玩家看到的是一段不受控的运镜,有人会以为是 bug,有人会晕。每次瞬移角色后,立刻 `camera.reset_smoothing()`。

**坑 4:在 `position` 上加震动,而不是 `offset`。** 你写 `camera.position += shake_vector` 后,`position_smoothing` 会试图把这个偏移"平滑"掉,震动信号被低通滤波,玩家几乎看不见。解法:震动写到 `offset`,平滑追踪写到 `position`,二者解耦。

**坑 5:`shake_noise` 用 `randf_range` 而不是噪声。** 纯随机抖动看起来像电视雪花,因为相邻两帧的偏移可能差正负 max_offset,呈现刺眼的"白噪声"。Perlin/Simplex 噪声相邻样本相关,出来的是平滑摇晃的"震感"。Godot 4 用 `FastNoiseLite`,frequency 在 25~40 之间最像传统震屏。

**坑 6:像素风用了 `canvas_items` 模式 + 整数 zoom。** `canvas_items` 模式下,所有变换都在最终分辨率上执行,zoom 不是整数倍像素就会出现"半像素",sprite 边缘出现一行细线/糊化。像素风必须用 `viewport` 模式,这样底层就在低分辨率画好,再整数缩放。

**坑 7:`default_texture_filter` 留默认 Linear,然后给关键 sprite 单独设 Nearest。** 这是反的。像素风的正确做法是项目级默认 Nearest,例外用 Linear(粒子、HDR 光晕)。否则忘记改的那张图就糊了,你还不知道在哪一个 Sprite 上。

**坑 8:`drag_*_margin` 当像素值用。** 它是比例,值域 0~1。写 `drag_left_margin = 100` 会被裁到 1,整个屏幕都是 dead zone,镜头永远不动。

**坑 9:用 `Camera2D.position_smoothing_speed = 0` 关闭平滑。** 这只是"非常慢的平滑",还是会被插值。要彻底关闭,把 `position_smoothing_enabled` 设回 `false`。

**坑 10:Godot 3 教程的 `stretch_mode = "2d"` 直接抄到 4.6。** 4.x 的项目设置 key 改名,`stretch_mode` 仍存在但值变成了 `disabled`/`canvas_items`/`viewport`,旧值 `2d` 会被映射成 `canvas_items` 但语义其实更接近你想要的 `viewport`(看美术风格)。迁移项目时一定核对一次。

## 手动验证

- [ ] 启动场景,角色站定不动:镜头静止,无任何漂移或抖动。
- [ ] 角色快速左右移动:镜头先有一小段 dead zone 不跟随,越过 margin 后平滑追赶,松手后 1 秒内停稳。
- [ ] 在 `_on_player_hit` 里手动触发一次 `add_trauma(1.0)`:屏幕剧烈震动 0.5 秒内归位,无残留偏移。
- [ ] 调用 `snap_to_target()` 模拟一次传送:镜头瞬移到新位置,无缓动,无残留 shake。
- [ ] 项目从 1920×1080 切到 1280×720 再切到全屏 4K:像素风无糊化、无小数倍;非像素风无黑边、UI 不变形。
- [ ] 用 Remote 调试面板把 `Camera2D` 的 `offset` 实时显示出来,确认空闲时 `offset` 始终为 `(0, 0)`。
