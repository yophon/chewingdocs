# GDExtension 与 Rust/C++ 性能模块入门

GDExtension 不是让你用 Rust 或 C++ 重写整个游戏。它适合把已经定位清楚的纯算法热点挪到原生代码里。

> 一句话先记住:**跨语言有成本,只有大循环里做足够多工作才值得。**

---

## 一、什么时候需要 GDExtension

适合:

```text
大规模程序化生成
逐像素图像处理
大量路径/几何计算
复杂战斗数值批量结算
压缩、解析、加密这类纯算法
```

不适合:

```text
玩家移动控制
普通 UI
简单敌人 AI
场景流
经常改的玩法原型
```

先用 GDScript 写清楚,用 profiler 确认热点,再下沉到 GDExtension。

---

## 二、边界怎么画

好边界:

```text
GDScript 准备 PackedFloat32Array / PackedInt32Array
Rust/C++ 一次性处理大量数据
GDScript 拿结果更新节点
```

坏边界:

```text
GDScript 每帧循环 10000 次
每次调用一次 Rust 函数
Rust 函数只算一个小值
```

跨界调用本身有成本。要把循环放到原生侧内部。

---

## 三、GDExtension 是什么

它由两部分组成:

```text
动态库: .dll / .dylib / .so
描述文件: .gdextension
```

Godot 启动时读取 `.gdextension`,加载对应动态库,注册里面的类。注册后,GDScript 就能像用普通类一样使用。

你不需要重编 Godot 引擎。这是它和 engine module 的主要区别。

---

## 四、一个适合下沉的例子

比如程序化生成里有一段:

```gdscript
for y in height:
    for x in width:
        for i in 8:
            value += expensive_noise(x, y, i)
```

地图 512x512,每格 8 层噪声,就是 200 多万次循环。GDScript 能跑,但 loading 会卡。

适合改成:

```gdscript
var heights: PackedFloat32Array = NativeTerrain.generate_heightmap(width, height, seed)
```

原生侧一次性生成整张图,返回 packed array。GDScript 只负责把结果写进 TileMap 或 Image。

---

## 五、Rust 工程心智

用 Rust 时,常见结构:

```text
rust/
  Cargo.toml
  src/lib.rs
godot/
  native/terrain.gdextension
  native/libterrain.dylib
```

Rust 类注册成 Godot 类,暴露方法。GDScript 只看到:

```gdscript
var terrain := NativeTerrain.new()
var data := terrain.generate_heightmap(256, 256, 12345)
```

这篇不展开 Rust 语法。重点是边界:传入简单值和 PackedArray,返回简单值和 PackedArray,少传 Node。

---

## 六、不要在原生侧乱碰节点树

即使用 Rust/C++ 能拿到 `Node`,也不要把场景逻辑搬进去。

推荐:

```text
原生侧: 纯计算
GDScript: 节点、信号、场景、UI
```

原因:

- 节点生命周期复杂。
- 调试成本高。
- 玩法迭代慢。
- 跨界调用太碎会抵消性能收益。

---

## 七、发布要考虑平台

每个平台要对应动态库:

```text
Windows: .dll
macOS: .dylib
Linux: .so
```

移动端、Web、主机平台还会更麻烦。你决定上 GDExtension 前,要先问:

```text
这个项目真的需要多平台导出吗?
每个平台的构建链能不能维护?
这个性能热点能不能先用 GDScript 优化掉?
```

如果答案不清楚,先别上。

---

## 八、验收

- 已用 profiler 确认热点。
- 原生函数一次处理大数组,不是频繁小调用。
- GDScript 仍负责场景树和玩法流程。
- 跨界数据用 PackedArray 或简单类型。
- 已考虑目标平台动态库构建。
- 有 GDScript 版本作为对照或 fallback。

---

## 常见坑

**坑 1:过早优化。**

原型期玩法还没定,先别把逻辑锁进原生库。

**坑 2:把 Node 传来传去。**

这会让原生层和场景树强耦合。传数据。

**坑 3:循环还留在 GDScript。**

每次只调用原生函数算一个点,收益很小。整批处理。

**坑 4:忘了发布成本。**

GDExtension 不是只有写代码,还有每个平台构建和打包。

---

下一篇进入发布:多平台导出、D3D12 和增量补丁。
