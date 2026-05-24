# 21-CanvasItem Shader 与常见 2D 特效

> 一句话导读:`canvas_item` shader 是 GPU 暴露给 2D 节点的"逐像素改写权",学会描边、溶解、水波、闪白这四个原型,你就能在不依赖第三方插件的前提下做出 90% 的 2D 视觉风格。

19 篇用 `Light2D` 改变了场景的整体亮度,20 篇用粒子和音效给玩家反馈。但有些效果光照和粒子都做不到:角色受击瞬间的"全身闪白"是逐像素改色;道具消失时的"溶解"是 alpha 按 noise 阈值裁切;水面的"波纹"是 UV 偏移而不是顶点变形。这些都是 shader 的领地——只有 GPU 在 fragment 阶段对每一个屏幕像素重新计算颜色,才做得到。

本篇不教 GLSL 语法基础(假设你写过类似 C 的代码,看得懂 vec3、sampler2D、texture()),专攻 Godot 4.6 的 `shader_type canvas_item` 这一类:它的内置变量、与节点的数据通路、四个高频特效的完整实现,以及参数从 GDScript 驱动的工程化做法。

读完后,你应该能独立做出"角色受击全身闪白 + 命中描边强调 + 死亡溶解 + 进入水域水波"这套完整反馈链路,且明确每个 shader 的性能预算与可调参数边界。后面 23 篇会从渲染管线角度系统讲批处理,本篇只确保 shader 写得对、跑得稳。

## 1. 机制定位

### 为什么不用 modulate?

`CanvasItem.modulate` / `self_modulate` 也能改色——红色 modulate 把整个 sprite 染红、alpha modulate 让它变透明。但 modulate 是**全局乘法**,它不区分像素位置、不响应时间、不能采样邻居像素。一旦你想:

- 只让 sprite 的**边缘**发亮(描边),
- 按一张 noise 图的**阈值**逐像素淘汰(溶解),
- 让 UV 按 `sin(time + x)` 抖动(水波),

都得在 fragment 阶段拿到完整的"采样上下文"。这是 shader 而不是 modulate 能做到的事。

换一个角度看,modulate 在每帧的渲染管线里相当于"画 sprite 时多乘一个 vec4 常量",GPU 几乎免费;shader 则是"画每个像素时跑一段自定义代码",自由度高一个量级,但需要你自己决定每一个像素的颜色。理解这两者的边界后,常见决策非常简单:**全局调色用 modulate,逐像素逻辑才上 shader**。本篇的"闪白"严格来讲也可以用 modulate(把 modulate 设成纯白),但 modulate 是覆盖式乘法,**它会同时影响 alpha 与 RGB**,导致透明区域也变白;shader 能精细控制 RGB 与 alpha 分开,所以闪白还是用 shader 更可控。

### shader 的代价和收益

GPU 在每帧、每像素都跑一次 fragment。一个简单的乘法 shader 几乎免费(GPU 反正要画这个像素);但 fragment 里如果**采样邻居 9 个像素**(描边),代价就乘以 9;如果 `discard` 一个像素,GPU 仍然要算到 discard 那一行,**不会因为 discard 提前退出**——这是新手对"discard 性能优化"的常见误解。

正向看,shader 一旦写好,GPU 并行处理千万级像素也不慢——一个 2048×2048 viewport,接近 420 万像素,移动端 GPU 每帧仍能在 4–8ms 内跑完中等复杂度 shader。瓶颈通常在**采样次数**(每多一次 `texture()`,带宽多一倍)、**分支**(if 在 GPU 上比想象中贵)、和 **uniform 上传**(每帧改 100 个 uniform 比改 5 个慢一个量级)。

更现实的两个考量:**fragment 里的随机数和 noise 不要在运行时算**。比如想做"溶解"如果在 shader 里写 `float n = fract(sin(dot(UV, vec2(12.9, 78.2))) * 43758.0)`,GPU 每帧每像素跑一次 sin + dot,远不如**预先生成一张 NoiseTexture2D** 拖进 uniform 划算。同样的,`pow`、`exp`、`atan2` 在内层 loop 是性能毒药;能用 `mix` / `smoothstep` 替换的尽量替换。本篇四个 shader 都遵守"采样 ≤ 4 次、不用复杂数学函数"的预算。

### 4.x 与旧教程的差异

Godot 4 删掉了 3.x 时代的 `SCREEN_TEXTURE` 和 `DEPTH_TEXTURE` 两个内置 sampler。旧教程里的 `texture(SCREEN_TEXTURE, SCREEN_UV)` 在 4.x 直接编译报错。新做法是声明带 hint 的 uniform:

```glsl
uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap;
```

`hint_screen_texture` 告诉 Godot:"这个 sampler 绑定到当前帧已渲染的颜色 buffer"。`hint_normal_roughness_texture`、`hint_depth_texture` 同理(后两个只对 3D 有效)。这是本系列默认的 4.6 写法,与第 19 篇的 `CanvasTexture` normal_texture 是完全不同的两条路径——前者是后处理,后者是材质属性。

类似地:`TEXTURE_PIXEL_SIZE`(`vec2`,等于 `1.0 / textureSize(TEXTURE, 0)`)是采样邻居像素的关键内置量,在 4.x 仍然存在;但只有当 shader 绑定到一个有默认 TEXTURE 的节点(`Sprite2D` / `TextureRect`)时才有效——`ColorRect` 没有 TEXTURE,需要自己声明 `uniform sampler2D` + `textureSize` 取尺寸。

第三个易混淆点:`shader_type canvas_item` 与 `shader_type spatial` 提供完全不同的内置量。3D 教程的代码(`ALBEDO = ...`、`ROUGHNESS = 0.5`)直接放进 canvas_item 是编译错误——`ALBEDO`、`ROUGHNESS`、`METALLIC` 都是 spatial 专属。2D 全程只用 `COLOR` 输出最终颜色。本篇所有代码 100% 都是 canvas_item 类型。

## 2. Godot 心智

### `canvas_item` shader 的结构

最小可运行的 canvas_item shader:

```glsl
shader_type canvas_item;

void vertex() {
    // 顶点阶段:VERTEX(vec2)、UV(vec2)、COLOR(vec4)、TIME(float)等
    // 默认行为是把 VERTEX 按节点变换转换到屏幕空间
}

void fragment() {
    // 片段阶段:UV、TEXTURE、COLOR(输入和输出)
    COLOR = texture(TEXTURE, UV);
}
```

`vertex()` 函数在每个顶点上跑一次,可以改 `VERTEX`(`vec2`,本地坐标)、`UV`、`COLOR`。`Sprite2D` 是 4 个顶点的 quad,所以 vertex 阶段只跑 4 次;但通过它改 UV,可以让 fragment 阶段拿到"歪斜"的 UV,做"飘动旗帜"、"水中倒影"等顶点级动画。`vertex()` 是空的时,Godot 用默认实现:把 VERTEX 乘节点变换矩阵,把 UV 直接传给 fragment。本篇的四个特效都不需要写 vertex(留默认),只在 fragment 阶段动手。

挂载方式:在 `Sprite2D.material` 字段新建一个 `ShaderMaterial`,把 `.gdshader` 文件拖进 `shader` 字段。GDScript 通过 `sprite.material.set_shader_parameter("name", value)` 改 uniform。

关键内置量(`fragment()` 里可读):

- `UV` (`vec2`):0~1,sprite 的纹理坐标。
- `TEXTURE` (`sampler2D`):节点的默认贴图(`Sprite2D.texture` / `TextureRect.texture`)。
- `TEXTURE_PIXEL_SIZE` (`vec2`):1 像素对应的 UV 增量,做 outline / blur 必用。
- `SCREEN_UV` (`vec2`):0~1,屏幕坐标(用于后处理 / 与背景混合)。
- `COLOR` (`vec4`):输入端是 `节点 modulate * vertex color * texture`,输出端是最终像素颜色。
- `TIME` (`float`):自场景启动累计秒数,做动画用。
- `NORMAL` / `NORMAL_TEXTURE`:法线相关,与 19 篇的 `CanvasTexture` 配合。

### uniform 与 set_shader_parameter

uniform 是 GDScript 与 shader 通信的唯一通道。声明:

```glsl
uniform float strength : hint_range(0.0, 1.0) = 0.5;
uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform sampler2D noise_tex : filter_linear, repeat_enable;
```

- `hint_range(min, max[, step])` 告诉 Inspector 用 slider 编辑;
- `source_color` 让 Inspector 把 vec4 显示成颜色选择器(默认会显示成 4 个 float);
- 末尾 `= value` 是默认值。

GDScript 端:

```gdscript
sprite.material.set_shader_parameter("strength", 0.7)
sprite.material.set_shader_parameter("outline_color", Color.YELLOW)
```

`set_shader_parameter` 接受任何 `Variant`,Godot 会按 shader 声明的类型 cast。**uniform 名字大小写敏感**,且与 Inspector 显示的"美化后名字"无关——`strength` 在 Inspector 里显示成 "Strength" 但 set 时必须用 `"strength"`。

### `instance uniform`:per-instance 参数

`ShaderMaterial` 是 `Resource`,默认所有引用同一份 material 的节点共享 uniform。这意味着调一个角色的"闪白强度",所有共用 material 的敌人都会闪白——除非你 `duplicate()` material(每个实例独立一份),代价是丢失了批处理。

4.x 提供更高效的方案:`instance uniform`。

```glsl
instance uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;
```

GDScript 端:

```gdscript
sprite.set_instance_shader_parameter("flash_amount", 1.0)
```

每个 `CanvasItem` 实例独立保存,但材质本身仍然共享,batch 不会被打断。**所有"逐角色独立"的特效都应该用 instance uniform**,本系列的闪白、命中色都走这条路。

### `discard` 与 alpha 的选择

需要让一些像素"消失"时有两种写法:

```glsl
// 方案 1:discard
if (alpha < 0.5) discard;

// 方案 2:写 alpha 0
COLOR.a = 0.0;
```

视觉等效,GPU 行为不同:`discard` 完全跳过这个像素的写入(不影响深度);`COLOR.a = 0.0` 仍然写入,只是 alpha 为 0,后续混合时无贡献。在 2D canvas_item 里两者效果都对,但 `discard` 让 alpha 边缘是"硬切",`COLOR.a = smoothstep(...)` 让 alpha 边缘是"渐变"。溶解效果通常用 smoothstep + alpha,因为视觉上有边缘"灼烧"的过渡;硬切片 discard 适合"完全切片"。

## 3. 工程实现

下面是四个原型 shader 的完整代码。每个 shader 文件路径写在代码块前一句。所有 shader 共享一个简单的 GDScript 控制器,放在最后。

### 描边:轮廓采样

`demo/shaders/outline.gdshader`。原理:在 fragment 阶段,如果当前像素 alpha=0(透明外区),采样上下左右 4(或 8)个邻居,若其中有 alpha>0,说明当前在物体边缘,绘制描边色。

```glsl
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_width : hint_range(0.0, 8.0) = 1.0;
uniform float alpha_threshold : hint_range(0.0, 1.0) = 0.1;
// 是否在描边内同时绘制原图;关掉只显示描边形成"剪影"效果
uniform bool keep_original = true;

void fragment() {
    vec4 src = texture(TEXTURE, UV);
    // 当前像素属于物体内部:照常绘制
    if (src.a > alpha_threshold) {
        COLOR = keep_original ? src : vec4(0.0);
        return;
    }
    // 当前是透明像素:采样 4 邻居,看是否在物体边缘
    vec2 px = TEXTURE_PIXEL_SIZE * outline_width;
    float n = texture(TEXTURE, UV + vec2( 0.0, -px.y)).a;
    float s = texture(TEXTURE, UV + vec2( 0.0,  px.y)).a;
    float e = texture(TEXTURE, UV + vec2( px.x, 0.0)).a;
    float w = texture(TEXTURE, UV + vec2(-px.x, 0.0)).a;
    float neighbor_alpha = max(max(n, s), max(e, w));
    if (neighbor_alpha > alpha_threshold) {
        COLOR = outline_color;
    } else {
        // 既不在物体内,也不在物体边缘:完全透明
        COLOR = vec4(0.0);
    }
}
```

注意三个工程取舍:

- **采样 4 邻居而非 8**:8 邻居更平滑但翻倍 cost。2D 像素风 4 邻居足够,商业级别再加对角采样。
- **`outline_width` 是浮点而非整数**:取 1.0 时刚好采样 1 个 texel,2.0 是 2 个 texel(注意 GPU 会做线性插值,所以不是离散的)。
- **关键:sprite 周围必须有透明空白**,否则描边采样会落到 UV 越界区域,被 sampler 的 repeat 模式截断。建议在 sprite 导出时四周保留 2-4 px padding。

更进阶的实现把 4 邻居换成"8 邻居+权重",或采样 16 个点做 jump-flood algorithm——后者能做"任意粗的描边"且开销只随采样数线性而非随宽度线性。本系列不展开,但知道有这条路径。

调用脚本设描边色:

```gdscript
# demo/scripts/fx/outline_controller.gd
sprite.material.set_shader_parameter("outline_color", Color.GOLD)
sprite.material.set_shader_parameter("outline_width", 1.5)
```

### 溶解:noise + 阈值

`demo/shaders/dissolve.gdshader`。原理:每个像素根据一张 noise 贴图的灰度值与全局 threshold 比较,小于 threshold 的被淘汰,边缘 smoothstep 出燃烧色。

```glsl
shader_type canvas_item;

uniform sampler2D dissolve_noise : filter_linear, repeat_enable;
uniform vec4 edge_color : source_color = vec4(1.0, 0.4, 0.0, 1.0);
uniform float edge_width : hint_range(0.0, 0.2) = 0.05;
// progress: 0 = 完整, 1 = 完全消失。由 GDScript 驱动
uniform float progress : hint_range(0.0, 1.0) = 0.0;

void fragment() {
    vec4 src = texture(TEXTURE, UV);
    // 采样 noise(此处假设 noise 与 sprite 同尺寸 UV 一一对应)
    float n = texture(dissolve_noise, UV).r;
    // n < progress 的像素被淘汰
    if (n < progress) {
        COLOR = vec4(0.0);
        return;
    }
    // 在 progress 到 progress+edge_width 之间显示燃烧色
    float edge = smoothstep(progress, progress + edge_width, n);
    // edge 接近 0 → 边缘色,edge 接近 1 → 原色
    COLOR = mix(edge_color, src, edge);
    COLOR.a *= src.a;     // 保留原图的透明区域
}
```

驱动脚本,用 `Tween` 把 progress 从 0 推到 1:

```gdscript
# demo/scripts/fx/dissolve_controller.gd
extends Node
class_name DissolveController

@export var sprite: Sprite2D
@export var duration: float = 1.2

func play_disappear() -> void:
    var mat: ShaderMaterial = sprite.material
    mat.set_shader_parameter("progress", 0.0)
    var t := create_tween()
    t.tween_method(
        func(v: float) -> void: mat.set_shader_parameter("progress", v),
        0.0, 1.0, duration)
    await t.finished
    sprite.queue_free()
```

工程细节:

- **`dissolve_noise` 资源**用 `NoiseTexture2D` 即可——在 Inspector 里 New → `NoiseTexture2D`,内部用 `FastNoiseLite`,seamless 开启,确保 UV 边缘不接缝。
- **`edge_color` 用 alpha = 1.0**,因为 mix 后会乘原图 alpha,自动正确淡出。
- 想做"从下到上溶解"等定向消失:把 noise 替换成 gradient `vec2 g = UV; float n = g.y;`,溶解就从上往下推进。

### 水波:sin + UV 扰动

`demo/shaders/water_ripple.gdshader`。原理:在 fragment 阶段,把 UV 按 `sin(time + xy)` 偏移,再用偏移后的 UV 采样原图,得到"晃动"效果。

```glsl
shader_type canvas_item;

uniform float wave_amplitude : hint_range(0.0, 0.05) = 0.01;
uniform float wave_frequency : hint_range(0.0, 50.0) = 8.0;
uniform float wave_speed : hint_range(0.0, 5.0) = 1.5;
uniform vec2 wave_direction = vec2(1.0, 0.0);  // 水平波;改成 (0,1) 是垂直波

void fragment() {
    vec2 uv = UV;
    // 沿 wave_direction 的"位置"作为 sin 输入
    float phase = dot(uv, wave_direction) * wave_frequency + TIME * wave_speed;
    // 垂直于 wave_direction 的方向上偏移 UV
    vec2 perp = vec2(-wave_direction.y, wave_direction.x);
    uv += perp * sin(phase) * wave_amplitude;
    COLOR = texture(TEXTURE, uv);
}
```

效果可视化:

- `wave_amplitude = 0.01` 是"温和波浪"(1% UV 偏移,对 256×256 sprite 是约 2.5 像素)。
- `wave_frequency = 8.0` 决定沿水平方向有几个波峰,从 5 到 15 调整波形紧密度。
- `wave_speed = 1.5` 是波的"传播速度",越大波动越快。

`TIME` 是 canvas_item shader 的内置量,在场景启动后逐帧累加(秒)。它的精度在长时间运行后会下降——`TIME` 是 32 位 float,跑到几小时后小数部分误差会出现"波动卡顿"。商业游戏会在 `vertex()` 阶段把 `TIME` 取 `mod(TIME, 1000.0)` 截断,避免长跑误差。本系列的 demo 项目不会跑那么久,直接用 `TIME` 即可。

GDScript 端如果要做"被攻击时水面起涟漪",可以 tween `wave_amplitude` 从 0.001 到 0.03 再回 0.001:

```gdscript
# demo/scripts/fx/water_ripple_controller.gd
func splash() -> void:
    var mat: ShaderMaterial = water_sprite.material
    var t := create_tween()
    t.tween_method(
        func(v: float) -> void: mat.set_shader_parameter("wave_amplitude", v),
        0.001, 0.03, 0.15)
    t.tween_method(
        func(v: float) -> void: mat.set_shader_parameter("wave_amplitude", v),
        0.03, 0.001, 0.6)
```

### 闪白:uniform 切换

`demo/shaders/flash.gdshader`。最简单但最常用的特效——角色受击瞬间整个 sprite 变白闪一下。

```glsl
shader_type canvas_item;

// instance uniform:每个敌人独立,共享同一份 material
instance uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;
instance uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);

void fragment() {
    vec4 src = texture(TEXTURE, UV);
    // 按 flash_amount 在原色和 flash_color 之间插值
    // 保留 alpha 以免影响轮廓
    COLOR.rgb = mix(src.rgb, flash_color.rgb, flash_amount);
    COLOR.a = src.a;
}
```

驱动脚本:

```gdscript
# demo/scripts/fx/flash_controller.gd
extends Node
class_name FlashController

@export var sprite: Sprite2D
@export var duration: float = 0.08      # 闪白持续 80ms

func flash() -> void:
    sprite.set_instance_shader_parameter("flash_amount", 1.0)
    var t := create_tween()
    t.tween_method(
        func(v: float) -> void:
            sprite.set_instance_shader_parameter("flash_amount", v),
        1.0, 0.0, duration)

# 高频受击时,新一发 flash 立刻覆盖旧的,不需要等
func flash_immediate(color: Color, length: float = 0.08) -> void:
    sprite.set_instance_shader_parameter("flash_color", color)
    sprite.set_instance_shader_parameter("flash_amount", 1.0)
    var t := create_tween()
    t.tween_method(
        func(v: float) -> void:
            sprite.set_instance_shader_parameter("flash_amount", v),
        1.0, 0.0, length)
```

注意 `instance uniform` 与 `uniform` 的差别:这里 100 个敌人共享同一份 `flash.gdshader` + 同一份 `ShaderMaterial`,只是每个敌人的 `flash_amount` 独立,**批处理保留**,这是 4.x 的关键优化。

如果用普通 `uniform` + `material.duplicate()`,会有 100 份独立 material,每次绘制都要切换状态,draw call 翻倍。

实测对比:128 个共享 `flash.gdshader` material 的敌人同屏,在中端 GPU 上:① 普通 uniform + duplicate,draw call ≈ 130,GPU frame time ≈ 3.5 ms;② instance uniform,draw call ≈ 6(因为 batch),GPU frame time ≈ 0.8 ms。一个数量级的差距,是"角色和敌人共用 shader"这种典型场景的必备优化。23 篇会从批处理角度系统讲这条预算。

### 统一管理器(可选)

为了避免每个角色都写一遍 `flash()` 调用,可以做一个 `FxController` 挂在角色身上:

```gdscript
# demo/scripts/fx/fx_controller.gd
extends Node
class_name FxController

@export var sprite: Sprite2D

func on_hurt() -> void:
    sprite.set_instance_shader_parameter("flash_amount", 1.0)
    var t := create_tween()
    t.tween_method(
        func(v: float) -> void:
            sprite.set_instance_shader_parameter("flash_amount", v),
        1.0, 0.0, 0.08)

func on_die_dissolve(duration: float = 1.2) -> void:
    # 切换到 dissolve material
    var dissolve_mat: ShaderMaterial = preload(
        "res://demo/resources/materials/dissolve.tres")
    sprite.material = dissolve_mat.duplicate()  # 这里要 duplicate,progress 各自独立
    var t := create_tween()
    t.tween_method(
        func(v: float) -> void:
            sprite.material.set_shader_parameter("progress", v),
        0.0, 1.0, duration)
    await t.finished
    get_parent().queue_free()
```

这是 16 篇事件总线的最直接客户——AI 死亡时只发一个事件,`FxController` 监听后自动播放 dissolve;受击事件触发 flash;玩家进水时触发 water_ripple。所有反馈解耦在 FxController 内部,角色逻辑保持干净。

## 4. 调参和验收

### 参数与视觉

| Shader | 关键参数 | 推荐范围 | 视觉表现 |
| --- | --- | --- | --- |
| outline | `outline_width` | 1.0 – 2.5 | 1.0 像素风,2.5 商业立绘风 |
| outline | `alpha_threshold` | 0.05 – 0.3 | 高 threshold 描出"实心"轮廓 |
| dissolve | `progress` | 0.0 → 1.0 | 由 Tween 推动 |
| dissolve | `edge_width` | 0.03 – 0.10 | 越大边缘"烧"得越宽 |
| water | `wave_amplitude` | 0.005 – 0.025 | >0.05 会变形过头 |
| water | `wave_frequency` | 5.0 – 15.0 | 紧密度,>20 会出锯齿 |
| water | `wave_speed` | 0.5 – 3.0 | 大于 5 会眩晕 |
| flash | `flash_amount` | 1.0 → 0.0 | 80-120ms tween 回 0 |

### 性能验收

打开 `Project Settings → Debug → Show Frame Time`,或者在 `_process` 中:

```gdscript
print("frame ms: %.2f" % (1000.0 / Engine.get_frames_per_second()))
```

经验阈值:

- 单个 outline shader 应用于 ≤ 100 个 sprite,GPU cost 增加 < 0.5ms(中端机)。
- water_ripple 全屏覆盖一个 1280×720 viewport,< 0.3ms。
- flash 用 instance uniform,1000 个 sprite 应用同时闪白,< 0.5ms(因为 batch 保持)。
- 同样 1000 个 sprite,如果改用普通 uniform + material.duplicate(),帧时间会涨到 4-8ms——这是 instance uniform 价值的最直接证据。

如果发现帧时间不符合预期,优先排查:① uniform 是否每帧上传(可以通过监控 `material.set_shader_parameter` 调用次数验证);② 是否有不该 duplicate 的 material;③ 是否在 fragment 里调用了 `pow` / `sin` / `cos` 等较慢函数(可以缓存到 uniform 由 CPU 端预计算)。

### 视觉验收

按下文清单逐项验证:

- outline:把 `outline_width` 调到 0,描边消失;调到 4.0,描边粗到看起来像第二层 sprite。把 `keep_original = false`,原图消失只留下描边,形成剪影。
- dissolve:把 `progress` 从 0 滑到 1,sprite 应该按 noise 纹理逐渐"碎片化消失"。把 `edge_width` 调到 0,边缘是硬切;调到 0.1,边缘有橙色燃烧带。
- water:把 `wave_amplitude` 设为 0,画面静止;0.02 时温和摇晃;0.05 时几乎认不出原画——这是参数边界。
- flash:点击触发 `flash()`,80ms 内 sprite 从纯白回到原色;连按触发,不应有"卡死"在白色的现象(tween 自动覆盖旧 tween)。

### 与 19 / 20 篇的整合

理想反馈是三层叠加:

1. 玩家攻击命中敌人(20 篇:粒子飞溅 + 命中音);
2. 同帧调用 `敌人.fx.flash_immediate(Color.WHITE, 0.08)`(本篇);
3. 同帧调用 `Audio.tween_volume(SFX, 1.2, 0.05)` 短暂"提响" SFX 总线(20 篇);
4. 死亡时切换 dissolve material + 关掉 `Light2D`(19 篇)。

观察玩家是否能从这四层反馈中"感到打中了"。如果还感觉空——加 hit stop(7 篇)和镜头震动(10 篇)。

四个 shader 也可以**组合在同一个 sprite 上**——只需要一个新 shader 同时实现描边、闪白、溶解三个特性,所有 uniform 都暴露,通过 `flash_amount = 0` / `progress = 0` / `outline_width = 0` 默认关闭未使用的效果。这种"超级 shader"方案的代价是 fragment 总采样次数增加(描边的 4 邻居采样无论是否启用都会跑),好处是切换效果不需要换 material、不打断批处理。中型项目里"超级 shader 集中、关闭未用通道"是常见架构。

## 5. 踩坑

### 4.x 用 `SCREEN_TEXTURE` 直接报错

旧教程的 `texture(SCREEN_TEXTURE, SCREEN_UV)` 在 4.x 编译失败:`identifier 'SCREEN_TEXTURE' is undefined`。正确写法:

```glsl
uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap;
void fragment() {
    vec3 c = textureLod(screen_texture, SCREEN_UV, 0.0).rgb;
}
```

**且必须用 `textureLod`,不能用 `texture()`**,因为 canvas_item 默认 sampler 不知道 mipmap 层级,Godot 强制要求 lod 显式给出。这是另一处旧代码搬过来会爆的地方。

### `TEXTURE_PIXEL_SIZE` 仅在有默认 TEXTURE 时有效

`TEXTURE_PIXEL_SIZE` 是 `1.0 / textureSize(TEXTURE, 0)`,只有节点提供了默认 TEXTURE(`Sprite2D`、`TextureRect`、`AnimatedSprite2D` 等)时才正确。挂在 `ColorRect` 上时,`TEXTURE` 是 1×1 白色 placeholder,`TEXTURE_PIXEL_SIZE` 是 `vec2(1.0, 1.0)`,outline 完全错位。如果要给 `ColorRect` 写 outline,自己声明 `uniform sampler2D tex` + `uniform vec2 px_size`,从脚本设置。

### `instance uniform` 不支持复杂类型

`instance uniform` 在 canvas_item 和 spatial shader 中可用,但只支持基本类型(int、float、vec2/3/4、color)——**不支持 sampler2D**。意味着每个角色独立的"溶解 noise"做不到只用一份 material;要么 noise 通过 vertex color 编码(很 hack),要么接受 `material.duplicate()`。

### `set_shader_parameter` 在 Tool 模式下不工作

`@tool` 脚本里调用 `material.set_shader_parameter` 在编辑器里不会立刻生效,因为编辑器 viewport 的渲染管线和运行时有差异。如果你想做编辑器内预览,要么改 `shader.code` 直接(贵),要么用 `@tool` + `_process` 在编辑器内强制刷新。28 篇 EditorPlugin 会展开。

### 修改 uniform 但忘了 sprite 没挂 ShaderMaterial

新手最易踩:打开一个 `Sprite2D`,在 Inspector 改了 `material` 字段为 `CanvasItemMaterial`(注意不是 `ShaderMaterial`),然后在代码 `set_shader_parameter` 完全没反应——因为 `CanvasItemMaterial` 是另一种 material 类型,不接 shader。确保 `material` 字段值是 `ShaderMaterial`(显示成"Shader Material"而不是"Canvas Item Material")。

### `discard` 不能减少 GPU 工作量

`if (something) discard;` 让人以为"这个像素不算了,GPU 跳过",其实 GPU 仍然要算到 discard 这一行的所有逻辑,只是不写入 framebuffer。`discard` 还会**关闭 early-Z**(在 2D 影响不大,但 3D 中很严重)。优化原则:**避免 discard,用 `COLOR.a = 0.0` + 正常 alpha 混合更便宜**,除非确实需要硬切(像素风游戏溶解效果)。

进一步,GPU 上的"if 分支"两路都会执行,然后用 mask 选一路结果(称为"线程发散"),所以 `if (a) x = b; else x = c;` 与 `x = mix(c, b, float(a));` 性能几乎一样,但后者代码更短。本篇 outline shader 里的 `if (src.a > alpha_threshold) return;` 因为有 early return,在 fragment 实际上能省一小部分指令——但 GPU 的 warp 调度仍然要等同一 warp 内所有线程完成。一句话:**shader 里少写 if,多用 mix / step / smoothstep**。

### `noise_tex` 默认 filter 出锯齿

`uniform sampler2D noise_tex` 不加 hint,Godot 用项目设置的默认 filter(像素风项目通常是 nearest)。noise 用 nearest 出方块状阶梯,溶解边缘锯齿严重。强制加 `: filter_linear` 或在 `NoiseTexture2D` 资源里把 `texture_filter` 设成 linear。本篇 `dissolve.gdshader` 已经显式写了。

### `TIME` 不在编辑器中递增

`TIME` 内置变量在运行时累加,但在编辑器视图里**默认是 0**,除非启用 `@tool` 让节点处于"运行态"。这意味着水波 shader 在编辑器里看起来是静止的——很多人以为 shader 没生效,其实只是没动起来。运行场景再看。

### `set_instance_shader_parameter` 名字写错不会报错

和 `set_shader_parameter` 一样,uniform 名字写错(`flesh_amount` vs `flash_amount`)**不会触发错误**,只是不生效。这种 bug 极难发现。建议:

```gdscript
const SHADER_FLASH_AMOUNT := &"flash_amount"
const SHADER_FLASH_COLOR  := &"flash_color"

sprite.set_instance_shader_parameter(SHADER_FLASH_AMOUNT, 1.0)
```

把所有 uniform 名集中在常量里,改名时一处搞定。

### shader 缓存:首次显示会卡顿

新 shader 首次用到时,Godot 在主线程编译 GLSL,可能 50-200ms 卡顿(取决于 shader 复杂度和 GPU)。"第一次受击时画面冻一下"几乎都是 shader 编译。修正:在场景加载完成、玩家还在主菜单/loading 时,**预先实例化一份 sprite + material 让它进入渲染**,把 shader 编译触发掉。4.6 有 `pipeline cache`,大幅减少二次启动的编译,但首次发布的玩家仍然会经历首次编译。这是发布前要测的项,30 篇会重提。

### shader 编译错误会显示成空白节点

shader 里有语法错误时,Godot 在 `Output` 面板打印 `SHADER ERROR: ... line N:`,但**节点仍然显示**——只是表现为"完全透明"或"纯黑"(取决于哪一段错了)。如果你修改 shader 后 sprite 突然消失,先去 Output 面板看一眼,而不是怀疑节点结构。运行时 shader 错误同样不会崩,只会"看不见",所以本地开发务必常开 Output 面板。

### `repeat_disable` 与 outline 配合

outline 采样邻居像素时,如果 UV 越界(< 0 或 > 1),sampler 的 wrap 模式决定返回什么:`repeat` 会从对面采样,导致描边"鬼影";`mirror` 会镜像,稍好但仍有伪影;**`repeat_disable` 会返回 0(透明)**,这正是 outline 需要的。所以本篇 outline shader 应该在 `uniform sampler2D` 上加 `: repeat_disable`——前文代码用的是节点默认 TEXTURE,需要在 sprite 的 `texture_repeat` 属性里设成 `Disabled`,效果等价。两条路任选一条,但要选一条,否则边缘 sprite 会出现奇怪的描边色块。

## 手动验证

- [ ] 把 outline shader 挂在一个 `Sprite2D` 上,在 Inspector 改 `outline_color` 为黄色、`outline_width = 1.5`,sprite 周围出现 1.5 像素的黄色描边;调 `outline_width = 0` 描边消失。
- [ ] 把 dissolve shader 挂在一个敌人 sprite 上,代码 `Tween` 把 `progress` 从 0 推到 1,1.2 秒内敌人按 noise 纹理碎片化消失,边缘有橙色燃烧;`edge_width = 0` 时无燃烧,直接硬切片。
- [ ] 把 water shader 挂在一个矩形 `ColorRect`(需要自己提供 TEXTURE)上,运行场景,矩形纹理沿水平方向起伏,频率与 `wave_frequency` 对应;改 `wave_direction = vec2(0, 1)`,波形转 90 度。
- [ ] 给 10 个敌人共享同一份 flash material,逐个触发 `flash_immediate`,每个敌人独立闪白,不影响其他;在 Performance Monitor 里 `draw_calls_in_frame` 数字不变(verify instance uniform 生效)。
- [ ] 一次完整反馈:玩家攻击敌人 → 敌人 flash + 粒子(20 篇) + 命中音(20 篇),0.1 秒内所有反馈到位;敌人血量为 0 时切换 dissolve material,1.2 秒后 sprite 完全消失,角色节点被 free。
- [ ] 把任意 shader 的 uniform 名故意写错(`set_shader_parameter("falsh_amount", 1.0)`),无报错;改回正确名字后效果恢复——这条手动验证用来训练"uniform 名错误不会被引擎告知"的肌肉记忆。
