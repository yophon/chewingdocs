# 25-GDExtension 与 Rust/C++ 性能模块入门

> 一句话导读:GDExtension 不是"用 Rust/C++ 重写游戏",而是把单点热点函数从字节码移到原生码,代价是引入一条 FFI 边界。这一篇讲清楚这条边界长什么样、什么时候值得跨过去、跨过去之后用什么工程结构盛装。

`rustLearning` 已经把 Rust 语法讲透,本篇不再展开。读者可以直接当成"用 Rust 写一个 Godot 能加载的动态库",然后聚焦在 Godot 这一侧的心智:为什么不是改引擎源码、`.gdextension` 文件到底承担什么、`Gd<T>` 与 `Node` 的边界在哪里。

## 1. 机制定位

GDScript 的典型瓶颈不是"语言慢",而是"语言在错误的地方被反复调用"。如果一个函数每帧只触发几次,字节码与原生码之间的差距几乎被场景树调度噪声淹没;但如果一个函数一帧要在像素层面跑 10 万次,GDScript 解释器开销就会暴露。常见三类热点都满足这个模式:

- **程序化噪声 / 地形生成**:`FastNoiseLite` 自身是 C++,但如果你要叠 4 层八度音、再做侵蚀模拟,叠加层就回到了 GDScript;
- **大规模寻路 / 视线计算**:`NavigationAgent2D` 已经够用,但塔防类游戏一秒要算几百个独立 agent 的优先级队列时,瓶颈会落到管理层;
- **像素操作 / 图像后处理**:`Image::set_pixel` 在 GDScript 里是真正的逐像素调用,128×128 就要 1.6 万次方法分派;
- **大规模实体属性结算**:伤害类型、抗性、状态效果叠加,如果每帧给 500 个敌人各跑一次,GDScript 在脏标记 / 重计算时容易堆积调用栈;
- **逐顶点 / 逐索引几何处理**:`ArrayMesh` 的 `surface_get_arrays` 拉出来后想做切割、裁剪、布尔运算,纯 GDScript 在万顶点级别会卡顿。

这五类热点的共性是:**循环内的单步开销小,但循环次数大,而且循环逻辑不依赖场景树或信号。** 这恰好是 FFI 跨界一次、内部 batch 几十万次能放大正收益的形状。

新手常见的错误写法有两种。一种是看到"GDScript 慢"就立刻把整个玩家控制类用 C# 或 Rust 重写,结果发现 99% 的逻辑根本不在热路径上,只是给自己增加了构建复杂度和 FFI 调用次数;另一种是相反,坚持纯 GDScript,在循环里反复跨 `set_pixel`、`get_data`,等帧率掉到 20 帧才想起来优化,而此时热点已经分散到三个文件里、无法局部替换。

GDExtension 的工程定位介于两者之间:**它是把"已经定位清楚的纯算法热点"封装成一个可以从 GDScript 用 `new()` 调用的类,逻辑层依然用 GDScript 写。** 这条界限不是建议,而是 FFI 边界本身决定的——每次跨界都有固定开销,只有当 Rust 函数体的工作量远大于这个开销,替换才有正收益。

与之容易混淆的另一个 Godot 扩展通道是 **engine modules**(在 Godot 源码树的 `modules/` 里加 C++,然后重编引擎)。两者并不冲突,但 GDExtension 是默认推荐路径:你不需要重编引擎,不需要每个用户都装一份魔改版 Godot,你的扩展可以独立于引擎发版本。模块路径只在一种情况下仍然有意义:你的扩展要触碰引擎内部数据结构、绕过 GDExtension API 暴露的边界,或者你就是引擎贡献者。对独立游戏开发者,这种情况几乎不会出现。

最后一句心智底色:**写 GDExtension 不等于追求性能,真正的目标是用一种"宿主可以独立打包发版"的方式落地不再变动的算法。** 如果一个函数三个月内还会被频繁迭代设计参数,把它先放在 GDScript 里;等它稳定下来再下放到 Rust。GDExtension 的编译/部署成本远大于 GDScript 的热加载成本,这种摩擦本身就是你不该过早下沉到原生码的提示。

## 2. Godot 心智

### 2.1 GDExtension 是一份"被场景树识别的动态库"

GDExtension 在 Godot 心智里的形象很简单:**一个 `.so` / `.dll` / `.dylib` 动态库,加上一个 `.gdextension` 描述文件,告诉引擎"我里面有哪些类,叫什么名字,继承自哪个 Godot 内置类"。** 引擎启动时扫描 `res://` 下的所有 `.gdextension` 文件,dlopen 对应平台的动态库,调用一个由扩展实现的 C 入口函数(entry symbol),扩展在这个入口里注册自己的类。注册完之后,这些类对 GDScript 就像内置类一样可用:可以 `new()`、可以做 `extends`、可以在编辑器 Inspector 里编辑 `@export` 字段、可以连 signal。

这意味着 GDExtension 类**不需要重编 Godot**,也**不依赖某个特定的引擎二进制构建**:同一个动态库可以被多个 4.x 版本的 Godot 加载,只要满足 `compatibility_minimum` 声明的最低版本。这是它与"用 C++ 写 module"最大的工程区别——module 必须随引擎一起编译,版本绑死。

### 2.2 `.gdextension` 配置文件的契约

每个扩展的元数据都集中在项目里的一个 `.gdextension` 文本文件里,字段不多但每一项都关键:

- `entry_symbol`:动态库导出的 C 入口函数名,引擎用 `dlsym` 找到它并调用一次;
- `compatibility_minimum`:扩展要求的最低 Godot 版本(写 `"4.2"` 之类),低于这个版本的引擎不会加载;`compatibility_maximum` 可选,用于排除已知不兼容的更高版本;
- `[libraries]` 表:对每个 (平台, 构建模式, 架构) 元组给出动态库的 `res://` 路径,引擎根据当前运行环境挑选其中一项。

一个写错路径或者写错平台 key 的 `.gdextension` 文件会让 Godot 启动时静默忽略你的扩展,然后所有 `new MyClass()` 都会变成 `Nil`——这是新手最容易踩的坑,稍后展开。

### 2.3 数据流与生命周期

跨 FFI 的数据流要按"类型可否零成本传递"来分:

- **POD 标量**(`int`、`float`、`bool`)、**Godot 内置值类型**(`Vector2`、`Color`、`Rect2`)是按值复制的,跨界几乎免费;
- **`PackedXxxArray`**(`PackedByteArray`、`PackedFloat32Array` 等)是引用计数容器,跨界传递只是 `Ref<>` 加一,适合做"GDScript 准备数据 / Rust 跑算法 / GDScript 拿回结果"模式;
- **`Object` / `Node` 引用** 在 Rust 侧表现为 `Gd<T>` 智能指针,持有方负责生命周期(refcounted 自动管理,manually managed 要 `queue_free()`);
- **`String` / `GString`** 之间转换有 UTF-16/UTF-32 编码差异,不要在热循环里频繁 to-from。

godot-rust(crate 名 `godot`,仓库 `gdext`)的 `#[derive(GodotClass)]` 把 Rust struct 注册成一个 Godot 类。`#[class(init, base = Sprite2D)]` 表示自动生成默认构造,基类是 `Sprite2D`。`#[godot_api]` 标注的 `impl` 块里,带 `#[func]` 的方法对 GDScript 可见,带 `#[signal]` 的方法是类型化信号,带 `#[rpc]` 的是高级网络 RPC。这套宏的设计哲学是"Rust 侧写最接近原生 Rust 的代码,FFI 边界由宏生成",所以你看到的 `#[derive(GodotClass)]` struct 在外形上不像 C++ `_bind_methods()` 那样啰嗦。

更具体一点,GDExtension API 在引擎侧暴露一组 C 函数指针表(称为 interface table),扩展启动时拿到这张表,所有"调一个 Godot 内置方法"、"读一个属性"、"emit 一个信号"最终都会变成一次 interface 函数指针调用。godot-rust 把这张表封装在 `Gd<T>::call` 等 API 背后,你写 `gd.set_position(v)` 看起来像普通方法,实际上是一次跨 FFI 表查找。这个开销在每次单次调用里大约几十到几百纳秒,放进每帧几千次循环就是 1 ms 量级——这也是为什么"把循环搬进 Rust 内部"几乎总是值得的。

### 2.4 InitLevel 与扩展加载时机

`ExtensionLibrary::min_level()` 决定扩展在引擎启动哪一阶段开始注册类:

- `InitLevel::Core` 最早,几乎只有 Variant 系统就绪;能在这里注册的东西非常少,通常不用;
- `InitLevel::Servers` 渲染、物理、音频服务器初始化时;适合注册自定义 RenderingServer / PhysicsServer 扩展;
- `InitLevel::Scene` **默认值**,所有 `Node` / `Resource` 子类必须在这一级注册;独立游戏的扩展类都落在这里;
- `InitLevel::Editor` 仅编辑器进程加载;适合 `@tool` 等价的纯编辑时类,但不会出现在导出后的可执行里。

99% 的扩展不用动这个值,但你需要知道它存在:某天你写了一个自定义资源加载器(`ResourceFormatLoader`),发现注册时 `ResourceLoader` 还没就绪,就要把 `min_level()` 拉到 `Servers`。

### 2.5 LibGodot:反向心智的一句话延伸

4.6 同时引入了 **LibGodot**:把 Godot 引擎本身编译成动态/静态库,嵌入到非 Godot 宿主进程里(Qt 工具、CAD 软件、React Native App、.NET 程序),由宿主控制 Godot 的启动、循环、渲染目标。本系列不展开 LibGodot,只需要建立一个反向心智:**GDExtension 是"宿主是 Godot,扩展是动态库";LibGodot 是"宿主是别的应用,Godot 自己是动态库"。** 两条路径共用 GDExtension API 这套契约,所以你为 LibGodot 宿主编写的 binding,本质上就是一份反过来用的 GDExtension。对独立游戏开发者,本篇之后的所有讨论都是 GDExtension 方向。

## 3. 工程实现

我们以一个真实热点为例:**多八度 Worley 噪声采样器**。`FastNoiseLite` 的内置噪声够用,但如果你要做一种"细胞自动机风格的洞穴生成"——每个网格点要计算到最近 K 个种子点的距离,再做加权——这个内层循环用 GDScript 写每帧只能处理几百个点。我们把它做成一个 GDExtension 类 `WorleyField`,从 GDScript 调用。

目录假设(只描述与扩展相关的部分):

```text
res://
├── addons/
│   └── worley_field/
│       ├── worley_field.gdextension
│       └── bin/
│           ├── libworley_field.linux.x86_64.so
│           ├── libworley_field.windows.x86_64.dll
│           └── libworley_field.macos.universal.dylib
└── scripts/
    └── caves/
        └── cave_generator.gd
```

### 3.1 Rust crate 骨架

宿主项目结构(独立于 Godot 项目)放在 `tools/worley_field/`,标准 cargo 工程。`Cargo.toml`:

```toml
[package]
name = "worley_field"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
godot = { version = "0.5", features = ["api-4-6"] }

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
strip = true
```

三个细节要注意:

1. `crate-type = ["cdylib"]` 让 cargo 输出动态库,这是 Godot 能 dlopen 的前提;不写就只产 `.rlib`。
2. `features = ["api-4-6"]` 把 godot crate 锁到 4.6 的 API 表面,生成的 binding 与 4.6 引擎对齐;4.7 发布后切到 `api-4-7` 会触发一些类型变化。
3. release 配置开 LTO 与 codegen-units=1 是热点路径标准做法,LTO 让跨 crate 内联生效,strip 把符号表去掉减小体积——发布版扩展通常不到 1 MB。

### 3.2 入口与类定义

`src/lib.rs`,完整可编译:

```rust
use godot::prelude::*;
use godot::classes::{IRefCounted, RefCounted};

struct WorleyExtension;

#[gdextension]
unsafe impl ExtensionLibrary for WorleyExtension {}

#[derive(GodotClass)]
#[class(init, base = RefCounted)]
struct WorleyField {
    base: Base<RefCounted>,

    #[init(val = 32)]
    #[var]
    grid_size: i32,

    #[init(val = 1337)]
    #[var]
    seed: i64,

    #[init(val = 2)]
    #[var]
    octaves: i32,

    points: Vec<Vector2>,
}

#[godot_api]
impl WorleyField {
    #[func]
    fn rebuild(&mut self) {
        // 在 grid_size x grid_size 网格里撒点,seed 决定可复现性。
        let n = self.grid_size.max(1) as usize;
        let mut rng_state = self.seed as u64;
        self.points.clear();
        self.points.reserve(n * n);
        for gy in 0..n {
            for gx in 0..n {
                let r = next_rand(&mut rng_state);
                let jitter_x = (r as f32 / u64::MAX as f32) * 0.9;
                let r = next_rand(&mut rng_state);
                let jitter_y = (r as f32 / u64::MAX as f32) * 0.9;
                self.points.push(Vector2::new(
                    gx as f32 + jitter_x,
                    gy as f32 + jitter_y,
                ));
            }
        }
    }

    #[func]
    fn sample(&self, x: f32, y: f32) -> f32 {
        let n = self.grid_size.max(1) as f32;
        let mut acc = 0.0_f32;
        let mut amp = 1.0_f32;
        let mut freq = 1.0_f32;
        for _ in 0..self.octaves.max(1) {
            let px = (x * freq).rem_euclid(n);
            let py = (y * freq).rem_euclid(n);
            acc += amp * nearest_distance(&self.points, px, py, n);
            amp *= 0.5;
            freq *= 2.0;
        }
        acc
    }

    #[func]
    fn sample_grid(&self, width: i32, height: i32) -> PackedFloat32Array {
        // 一次拿一整张网格,避免 width*height 次跨 FFI。
        let mut out = PackedFloat32Array::new();
        out.resize((width * height) as usize);
        let raw = out.as_mut_slice();
        for j in 0..height {
            for i in 0..width {
                raw[(j * width + i) as usize] = self.sample(i as f32, j as f32);
            }
        }
        out
    }
}

fn next_rand(state: &mut u64) -> u64 {
    // xorshift64*,够用且确定性。
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}

fn nearest_distance(points: &[Vector2], x: f32, y: f32, wrap: f32) -> f32 {
    let mut best = f32::INFINITY;
    let q = Vector2::new(x, y);
    for p in points {
        let dx = (p.x - q.x).abs().min(wrap - (p.x - q.x).abs());
        let dy = (p.y - q.y).abs().min(wrap - (p.y - q.y).abs());
        let d2 = dx * dx + dy * dy;
        if d2 < best {
            best = d2;
        }
    }
    best.sqrt()
}
```

几个工程要点:

- 基类选 `RefCounted` 而不是 `Node`,意味着这个类不是场景树成员,生命周期由引用计数控制,GDScript 写 `var field := WorleyField.new()` 就会触发 `init`,变量超出作用域自动释放;
- `#[init(val = 32)]` 是 godot-rust 的初始化语法,等价于 GDScript 的 `@export var grid_size := 32`;`#[var]` 让该字段对 Inspector 和 GDScript 可见;
- `sample_grid` 一次返回 `PackedFloat32Array` 是关键模式:**把"该循环 1 万次跨 FFI"压缩成"跨 FFI 一次,1 万次循环在 Rust 内"**,这是 GDExtension 性能优势真正落地的地方。

### 3.3 描述文件与 GDScript 调用

`res://addons/worley_field/worley_field.gdextension`:

```ini
[configuration]
entry_symbol = "gdext_rust_init"
compatibility_minimum = "4.6"
reloadable = true

[libraries]
linux.debug.x86_64     = "res://addons/worley_field/bin/libworley_field.linux.x86_64.so"
linux.release.x86_64   = "res://addons/worley_field/bin/libworley_field.linux.x86_64.so"
windows.debug.x86_64   = "res://addons/worley_field/bin/libworley_field.windows.x86_64.dll"
windows.release.x86_64 = "res://addons/worley_field/bin/libworley_field.windows.x86_64.dll"
macos.debug            = "res://addons/worley_field/bin/libworley_field.macos.universal.dylib"
macos.release          = "res://addons/worley_field/bin/libworley_field.macos.universal.dylib"
```

`entry_symbol = "gdext_rust_init"` 是 godot-rust 默认导出的入口名,与 `#[gdextension]` 宏生成的符号对齐,不写会用这个默认值;`reloadable = true` 允许编辑器在不重启的情况下重新加载扩展,适合开发循环。

GDScript 这边调用:`res://scripts/caves/cave_generator.gd`

```gdscript
extends Node2D
class_name CaveGenerator

@export var width: int = 256
@export var height: int = 256
@export var threshold: float = 1.8

var _field: WorleyField

func _ready() -> void:
	_field = WorleyField.new()
	_field.grid_size = 16
	_field.seed = 20260524
	_field.octaves = 3
	_field.rebuild()
	_render()

func _render() -> void:
	var samples: PackedFloat32Array = _field.sample_grid(width, height)
	var image: Image = Image.create(width, height, false, Image.FORMAT_L8)
	for y in height:
		for x in width:
			var v: float = samples[y * width + x]
			var pixel: float = clampf(v / threshold, 0.0, 1.0)
			image.set_pixel(x, y, Color(pixel, pixel, pixel))
	var texture: ImageTexture = ImageTexture.create_from_image(image)
	($Sprite2D as Sprite2D).texture = texture
```

注意 GDScript 这边几乎看不出来 `WorleyField` 是 Rust 类,它就像内置类一样用 `new()` 构造、按字段赋值、调方法、拿 `PackedFloat32Array`。FFI 的存在被 `#[derive(GodotClass)]` 完全藏在宏背后。

## 4. 调参和验收

### 4.1 关键参数

| 参数 | 作用 | 推荐 |
| --- | --- | --- |
| `crate-type` | 必须包含 `cdylib`,否则不产动态库 | `["cdylib"]` |
| `godot` crate features | `api-4-6` 锁定 API 表面,版本错位会编译失败但运行不会出诡异错 | 跟随项目引擎版本 |
| `[profile.release] lto / codegen-units / strip` | LTO 让跨 crate 内联,strip 砍体积 | `lto = "fat"`、`codegen-units = 1`、`strip = true` |
| `compatibility_minimum` | 低于此版本的 Godot 拒绝加载扩展 | 与项目引擎版本一致,如 `"4.6"` |
| `reloadable` | 编辑器内热加载;发布版关掉,只在开发开 | dev: `true`,prod: `false` |
| `#[func]` 跨 FFI 颗粒度 | 不要在循环里调,把循环移进 Rust | 单次返回 `PackedXxxArray` |

### 4.2 验证负收益还是正收益

GDExtension 不是越多越好。判断一个函数值不值得移到 Rust,看两个指标:

- **函数体内部循环次数**:小于 1000 次的函数,FFI 开销通常吃掉收益,不要移。
- **每帧调用次数 × FFI 开销**:每帧调 1 次但内部跑 10 万次循环值得移;每帧调 5000 次但内部只跑 5 次循环就是反优化。

落地做法:用 Godot 内置 profiler 截一段 GDScript 实现的 CPU 时间,然后 cargo build --release、替换、再截一段。`scripts/caves/cave_generator.gd` 中的 `sample_grid` 调用应该比纯 GDScript 实现快一个数量级,你能在 profiler 里直接看到 "WorleyField.sample_grid" 一行占比从 80% 掉到 8%。

更严肃一点的做法是**先建立基线再优化**。在 GDScript 里写一份功能完整的实现,跑出帧时间分布(`Engine.get_frames_per_second()` 配合 `Time.get_ticks_usec()` 自己打点,或直接看 profiler 的 "Script Time / Physics Time / Render Time" 拆分)。然后选最高的那一行,只移那一个函数。每次只移一个,移完测一次。如果两次测的差值小于一帧(16.67 ms 量级)的 5%,不要合并,把代码改回 GDScript——这条原则比"原生码总是快"更接近真实结果。

### 4.3 godot-rust 与 godot-cpp 的取舍

两种 binding 都在维护、都对齐 4.6 API,选哪种本质上是团队语言栈与心智偏好的问题:

| 维度 | godot-rust (gdext) | godot-cpp |
| --- | --- | --- |
| 类型系统 | 强类型,编译期防错多 | 强类型但模板报错难读 |
| 内存安全 | 默认安全,跨 FFI 必须 `unsafe` 标注 | 全程要手动管理 |
| 构建工具 | `cargo`,依赖管理简单 | `scons` / `cmake`,跨平台脚手架繁琐 |
| 学习曲线 | 需要先学 Rust 所有权 | C++ 现有经验直接复用 |
| 与已有 C/C++ 库混编 | 通过 `bindgen` 中转 | 直接 `#include` |
| 工程师视角推荐 | 新项目首选 | 已有大量 C++ 资产时保留 |

本系列默认 godot-rust,理由有三:Cargo 工程发版比 scons 简单太多;Rust 所有权刚好对应 Godot 的 `Gd<T>` 引用计数模型,学习曲线在场景树这一侧有正反馈;`rustLearning` 系列已经覆盖语法,读者迁移成本最低。

### 4.4 构建产物校验

每次改完 Rust 代码后:

```text
cargo build --release --target-dir target
cp target/release/libworley_field.{so,dll,dylib} addons/worley_field/bin/...
```

(具体路径与平台后缀依平台变化。)在编辑器里 reopen 项目(或者用 `reloadable = true` 时点工具栏的"重新加载扩展"),`WorleyField` 应当出现在 Add Node 之外的"自定义类型"列表里——它本身是 RefCounted,所以不是节点,但 GDScript 自动补全里能搜到它。

## 5. 踩坑

### 5.1 `.gdextension` 路径写错,引擎静默忽略

最常见的现象是改完代码 `new WorleyField()` 突然返回 `Nil`,然后所有连锁的属性赋值都报"试图设置 Nil 对象的属性"。原因往往是 `[libraries]` 表里平台 key 写错——`linux.x86_64` 不带 debug/release 在 4.6 下会被忽略,必须显式区分;或者你删了 debug 库但 key 还在,引擎会按运行时配置去找那个 key 对应的文件,找不到就放弃加载扩展。Godot 不会弹错误对话框,只在编辑器输出面板写一行小字。养成习惯:每次构建完后看一眼输出有没有 `Couldn't open dynamic library` 之类的提示。

### 5.2 把 `Node` 当 `RefCounted` 用 / 反之

`Node` 的生命周期由场景树管理,`queue_free()` 才会释放;`RefCounted` 是引用计数,引用归零自动释放。混用会出两种 bug:

- 把算法类做成 `Node`,GDScript 里 `var f := WorleyField.new()` 后忘了 `add_child` 或忘了 `queue_free`,内存泄漏;
- 把场景树成员做成 `RefCounted`,本来想做粒子节点,结果一旦超出 GDScript 局部作用域立刻被释放,场景里只闪一下。

经验法则:**纯算法 / 数据容器 → `RefCounted`;有自己 `_process` / `_physics_process` / 在场景里有可视位置 → `Node2D` / `Sprite2D` / `CanvasItem`。**

### 5.3 FFI 颗粒度过细 = 反优化

新手最容易写出这种 GDScript:

```gdscript
for y in height:
	for x in width:
		var v: float = _field.sample(x, y)  # 每次跨 FFI
		...
```

`width * height` 次跨界,即便每次 sample 函数内部只跑几条指令,FFI 固定开销也会变成主成本。`sample_grid` 模式才是正确答案:一次跨界、内部 batch 计算、一次返回 `PackedFloat32Array`。这条规则不限于 GDExtension,对 `Image.set_pixel` vs `Image.set_data` 同样成立。

### 5.4 编辑器内 reload 不能挽救所有更改

`reloadable = true` 允许在不重启编辑器的情况下重新加载扩展,但**它只对没有持有 `Gd<T>` 引用的场景生效**。如果场景里已经有一个 `WorleyField` 实例在某个 RefCounted 引用链中,reload 时引擎会拒绝替换,在控制台打"Extension still in use"。开发循环里建议:每次重大 Rust 改动后关闭运行场景、停 game,再 reload;否则就是关编辑器重开,这比看到诡异崩溃更省时间。

### 5.5 `compatibility_minimum` 写得太低 = 静默崩

把 `compatibility_minimum = "4.0"` 留在 4.6 项目里听上去保守,但 godot-rust 0.5 + `api-4-6` feature 产生的 binding 实际依赖 4.6 的内部表,4.0 引擎加载这个动态库会在第一次调用某个新 API 时直接 crash。`compatibility_minimum` 的正确值是**你 feature flag 选定的 API 版本**,不是更早的一个数字。

### 5.6 别混用 godot-rust 与 godot-cpp 在同一个项目

理论上一个 Godot 项目可以加载多个 `.gdextension`,但 godot-rust 和 godot-cpp 各自的初始化栈与类注册时机不完全对齐,放在同一项目里偶尔会出现"我注册的类 GDScript 看不到"的问题。独立游戏阶段如果选 Rust,就让 Rust 覆盖所有原生扩展;一个项目里有大量 C++ 历史代码再考虑 C++ 路径。

### 5.7 LibGodot 不是 GDExtension 的反义词

社区里偶尔会看到"既然有 LibGodot 了我是不是不用 GDExtension 了"的疑问。澄清:LibGodot 解决的是"宿主进程不是 Godot 怎么用 Godot",GDExtension 解决的是"宿主进程是 Godot 怎么调原生代码",两者的角色完全不冲突。LibGodot 宿主里同样要通过 GDExtension API 与引擎通信,只是这次 API 调用方向是宿主→引擎而不是引擎→扩展。本系列后续如果做工具链(28 篇 EditorPlugin)会再扫一眼 LibGodot 的现实用例,这里只建立心智。

### 5.8 跨平台二进制不是免费午餐

GDExtension 不像 GDScript 那样源代码就是产物,它本质是一份**当前平台对应的二进制**。Mac 用户开发了一个 Rust 扩展,直接交给 Windows 同事运行,只会在编辑器输出里看到 "Could not find any library for platform"——因为 `.gdextension` 表里 `windows.x86_64` 那行指向的 dll 根本不存在。这条 friction 远比 GDScript 严重,处理方式有三:

- **本地开发只交叉编译目标平台**:`cargo build --target x86_64-pc-windows-gnu` 等,前置安装好 `cargo-zigbuild` 或 `cross`;
- **CI 流水线统一构建多平台二进制**:在 GitHub Actions 用 Linux / macOS / Windows 三个 job 各跑一次 `cargo build --release`,产物上传到对应路径,再合并提交;
- **发版前的 export 用预构建分发**:把 `.gdextension` 与所有平台二进制打成 release tar,游戏项目通过 git submodule 或 npm-style 包管理引入。

独立开发者通常会选 CI 路径,因为它把"我自己电脑装不齐三套交叉工具链"这条阻力交给云端。

### 5.9 静态初始化与 `on_stage_init` 的位置

godot-rust 默认在扩展加载时跑 `#[derive(GodotClass)]` 各类的注册逻辑,但**全局静态变量、`lazy_static`、`OnceCell` 这种 Rust 侧初始化时机不在 godot-rust 控制之内**,它们由动态库加载器决定。如果你在 `static` 块里访问 Godot 内置类型,可能在引擎还未把 Variant 系统就绪前就触发,导致 segfault。安全做法是把这类延迟初始化放进 `ExtensionLibrary::on_stage_init(InitStage::Scene)` 回调里,这时引擎已经准备好与扩展通信。这是一个低频但出现一次就让人摸不到头脑的坑。

## 手动验证

- [ ] `cargo build --release` 成功产出 `libworley_field.{so,dll,dylib}`,放进 `res://addons/worley_field/bin/` 对应路径。
- [ ] Godot 4.6 编辑器启动时,输出面板没有 `Couldn't open dynamic library` 或 `Could not resolve symbol` 警告。
- [ ] GDScript 里输入 `WorleyField` 能触发自动补全,`WorleyField.new()` 返回非 `Nil` 对象。
- [ ] 调用 `_field.sample_grid(256, 256)` 返回长度为 65536 的 `PackedFloat32Array`,渲染到 `Sprite2D` 上能看见连续的细胞噪声纹理。
- [ ] 在 profiler 里对比:同样算法用纯 GDScript 写 vs 调用 Rust 扩展,后者至少快 5 倍以上。
- [ ] 修改 `seed` 重新 `rebuild()` 后纹理变化;同一个 seed 重启游戏后纹理可复现。
