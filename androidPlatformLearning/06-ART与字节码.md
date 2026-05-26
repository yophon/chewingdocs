# ART / Dalvik:GC、JIT、AOT 与字节码

> 一句话:**ART 是 Android 自己的 Java 虚拟机——它跑 DEX 字节码,做混合编译(AOT + JIT + Baseline Profile),自己做 GC,每个 App 进程跑一份独立 ART**。理解 ART = 理解 Android 应用启动 / 内存 / 性能的根。

---

## 一、Dalvik 与 ART:两代虚拟机

| 维度 | Dalvik(2008-2014) | ART(2014+) |
| --- | --- | --- |
| 编译策略 | JIT(运行时翻译) | **AOT + JIT 混合** |
| 启动速度 | 慢(每次都翻译) | 快(已编译到机器码) |
| 安装时间 | 快 | 慢(dex2oat) |
| 安装包大小 | 小 | 大(多了 .oat) |
| GC | 标记清除,STW 长 | 并发标记 + 整理,STW 短 |
| 默认引入 | Android 1.0 | Android 5.0(完全取代) |

**关键认识**:**Android 5.0 起 Dalvik 已经完全淘汰**——但很多老资料还在讲"Dalvik 是 Android 的 VM",这是过时的。本系列从这里起一律说 ART。

---

## 二、`.dex` / `.oat` / `.vdex` / `.art` 文件

App 安装后,`/data/dalvik-cache/<arch>/` 里堆了几种文件:

```
/data/dalvik-cache/arm64/data@app@com.notedx-1@base.apk@classes.dex
/data/app/com.notedx-1/oat/arm64/base.odex      # 编译后的机器码
/data/app/com.notedx-1/oat/arm64/base.vdex      # 验证过的 DEX(+ 元数据)
/data/dalvik-cache/arm64/boot.art                # 系统镜像
```

- **`.dex`** ← APK 里的字节码,作为输入
- **`.oat`(ELF 文件)** ← `dex2oat` 编译后的机器码,可以直接执行
- **`.vdex`** ← 验证过 + 优化过的 DEX,允许"先解释执行,后台再 AOT"
- **`.art`(boot image)** ← 系统类预加载的内存镜像,Zygote 加载

ART 启动 App 时:

1. mmap `.oat` 文件——里面已经有编译好的机器码,直接跳转
2. 没编译的代码(可能是后续 lazy compile)走 `.vdex` 的解释器或 JIT
3. 内核 Page Cache 帮忙缓存,反复启动时 OAT 不重复读盘

---

## 三、`dex2oat`:安装时的 AOT 编译

```
classes.dex(DEX 字节码)
     ↓ dex2oat
classes.odex(ELF,机器码)+ classes.vdex(元数据)
```

`dex2oat` 是 ART 自带的编译工具,**安装 App 时由系统自动调用**——把 DEX 翻译成对应 CPU 架构(arm64-v8a / armeabi-v7a / x86_64)的机器码。

**编译模式**(Android 7.0+ 引入混合策略):

- **speed**——全量 AOT,APK 安装慢 + 占空间大,但运行最快
- **speed-profile**——只编译用过的方法(基于 Baseline Profile 或运行时收集的 profile)
- **interpret-only**——不编译,纯解释执行(开发时模式)
- **verify**——只验证 DEX,不编译

**Android 7+ 默认 `speed-profile`**——这是 Baseline Profile 红利的根源:

```
首次安装 → 只 verify,不 AOT(快装)
   ↓
用户使用 App → ART 记录哪些方法被频繁调用
   ↓
设备空闲 + 充电 → 后台 dex2oat 编译热方法
   ↓
之后启动 → AOT 编译过的部分直接跑机器码
```

Baseline Profile 提前告诉 ART:"这些方法启动时必用,先编"——跳过"用户使用收集 profile"那一步,首启就快。

手动触发编译:

```bash
# 强制编译 com.notedx 到 speed 模式
adb shell cmd package compile -m speed -f com.notedx

# 看编译状态
adb shell dumpsys package com.notedx | grep "Compilation"
```

---

## 四、运行时混合编译:解释器 + JIT + AOT

ART 同一份代码可能用三种方式跑:

```
代码方法 X 被调用
   ↓
1. 已 AOT 编译过(在 .oat 里)? → 直接跑机器码
2. 没 AOT,运行时编译过(JIT 缓存)? → 跑 JIT 产物
3. 都没有 → 用解释器跑(慢),同时记录调用次数
   ↓
调用次数超过阈值 → ART JIT 编译这个方法,加入缓存
   ↓
设备空闲 + 充电 → ART 把 JIT profile 写盘 → 下次 dex2oat 用 profile 做 speed-profile 编译
```

**自适应的关键**:ART 不需要你显式告诉它"哪些代码该 AOT"——它自己根据使用情况优化。

---

## 五、Baseline Profile:跳过冷启动期

正常情况下,App 首次安装后**前几次启动慢**——因为 JIT profile 还没收集,大部分代码走解释器。

**Baseline Profile** 是开发者在打包时附带的文件,告诉 ART:"这些方法启动时一定会调,先 AOT 编译":

```
:app/src/main/baseline-prof.txt   ← 列出热路径方法的 DEX 签名

HSPLandroidx/compose/runtime/Composer;->startReplaceableGroup(I)V
HSPLandroidx/compose/material3/AppBarKt;->TopAppBar(...)
HSPLcom/notedx/HomeScreen$Content;-><init>()V
...
```

`H` = Hot(热方法),`S` = Startup(启动期调用),`P` = PostStartup(启动后调用)。

工具自动生成(现代版 21 篇展开):用 Macrobenchmark 写"模拟启动 + 滚动"的脚本,跑几次,生成 baseline-prof.txt 自动放进 APK。

**效果**:Compose / Material3 / Navigation 这种栈深的应用,**冷启动快 20-40%**。

```bash
# 看 App 的当前编译状态
adb shell dumpsys package com.notedx | grep -E "Profile|Compilation"
```

---

## 六、ART 的 GC

ART 用 **并发标记清除整理**(Concurrent Mark Sweep + Compact)收集器,默认配置下:

- **小堆**(< 8MB):新生代用 Bump pointer + Mark-sweep
- **大堆**:并发 Mark-Sweep
- **STW(Stop-The-World)目标**:< 5ms

GC 时机:

- **Allocation GC**——分配对象时堆耗尽
- **Background GC**——周期性后台回收
- **Explicit GC**——`System.gc()`(几乎从不用)
- **Process state GC**——进程切到后台时主动回收
- **Low memory GC**——系统紧张时通知

```bash
# 查看 App 的 GC 统计
adb shell dumpsys meminfo com.notedx | head -40
```

---

## 七、`Object` 分配的物理路径

```kotlin
val n = Note(1, "title", "content")
```

发生了什么:

1. ART 在 TLAB(Thread Local Allocation Buffer)里 bump pointer 分配 `Note` 对象的内存
2. 调用构造函数,在新对象内填字段
3. 返回引用

**TLAB**:每个线程预分配一块内存,本线程在 TLAB 内无锁分配——这是 Android 上对象分配快的根本原因。TLAB 用完会向 GC 申请新的。

**对象的内存布局**:

```
Note 对象
├── Header(8-16 字节,包括 class 指针、lock state、hash)
├── id: Long       (8 字节,对齐)
├── title: String  (8 字节,引用)
├── content: String(8 字节,引用)
```

对象越多,Header 越浪费——这是 Compose Runtime 内部用 "Slot Table"(密集数组)而不是大量小对象的原因。

---

## 八、字符串与 String pool

Java/Kotlin 的 `String` 在 ART 里有特殊优化:

- 编译期字符串字面量(`"NotedX"`)进入 **DEX 字符串池**,运行时共享
- 启动时 ART 把常用字符串(Android Framework 用的)放到 boot image,所有 App 共享
- 运行时 `String.intern()` 把字符串放入运行时池,后续相同内容共享

但 `String.intern()` **代价高**(全局哈希查找),不应该在热路径用。

`StringBuilder`:每次 append 检查容量,可能 realloc——预设大小避免增长:

```kotlin
val sb = StringBuilder(1024)
// vs StringBuilder() 默认 16
```

---

## 九、`SoftReference` / `WeakReference` / `PhantomReference`

```kotlin
val cache = HashMap<String, SoftReference<Bitmap>>()
cache[key] = SoftReference(largeBitmap)

val bmp = cache[key]?.get()    // 可能拿到,也可能 GC 把它清了
```

| 引用 | 何时 GC | 用途 |
| --- | --- | --- |
| **强引用** | 永不(直到无引用) | 默认 |
| **SoftReference** | 内存紧张时回收 | 缓存(对象有就用,没有就重建) |
| **WeakReference** | 下次 GC 一定回收 | 不阻止 GC 的引用 |
| **PhantomReference** | 配合 ReferenceQueue | 极少用,资源清理 |

**Android 上的实际行为**:`SoftReference` 不太靠谱——ART 的策略偏向积极回收,很多 SoftReference 没等到内存紧张就被收。**做缓存用 LruCache(`androidx.collection`)更可靠**。

---

## 十、JNI:跨 ART 与 native 的边界

```kotlin
external fun nativeProcess(data: ByteArray): ByteArray

companion object {
    init { System.loadLibrary("notedx_native") }
}
```

```cpp
// JNI C++
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_notedx_Foo_nativeProcess(JNIEnv *env, jobject obj, jbyteArray data) {
    jbyte* buf = env->GetByteArrayElements(data, nullptr);
    jsize len = env->GetArrayLength(data);
    // ... 处理
    env->ReleaseByteArrayElements(data, buf, 0);
    return result;
}
```

**JNI 调用代价**:每次跨边界有数百 ns 开销(参数转换 / 状态保存)。**热路径不要频繁过 JNI**——批处理:把"循环里每次 JNI 调一个 native 方法"改成"一次 JNI 传一个 buffer 让 native 内部循环"。

JNI 的方法签名遵守特定编码:

- 类名:`Ljava/lang/String;`
- 基础类型:`I` (int), `J` (long), `Z` (boolean), `F` (float), `D` (double)
- 数组:`[I` (int[]),`[Ljava/lang/String;` (String[])

方法签名:`(Ljava/lang/String;I)V` = `void method(String, int)`

---

## 十一、字节码:DEX vs JVM

JVM 字节码(.class):**栈机器**——所有操作通过操作数栈。

```
ldc "hello"        // 把常量 "hello" 压栈
astore_1           // 把栈顶弹出存到局部变量 1
```

DEX 字节码:**寄存器机器**——直接引用虚拟寄存器。

```
const-string v0, "hello"     // 把 "hello" 放到寄存器 v0
move-object v1, v0            // 把 v0 复制到 v1
```

寄存器机器的优势:**指令数更少,执行效率更高**——平均一个 Java 方法翻译成 DEX 后指令数减少 ~20%。

看 DEX 字节码:

```bash
dexdump -d classes.dex | head -100
# 或者用 baksmali / jadx 反编译为 smali / Java
```

---

## 十二、`R8`:Android 的字节码优化器

R8 是 AGP 自带的 DEX 优化器,做四件事:

1. **Shrinking**——去除未使用代码(类、方法、字段)
2. **Optimization**——inline / 死代码消除 / 常量折叠
3. **Obfuscation**——类名 / 方法名 / 字段名改成 `a` / `b` / `c`
4. **Compaction**——更紧凑的 DEX 文件布局

**R8 是 ProGuard 的现代替代**——速度快、与 Kotlin 集成好。新项目不用 ProGuard。

`release` build 默认开启 R8(`isMinifyEnabled = true`)。**典型效果:DEX 文件减小 30-50%,方法数减一半,启动加快**。

R8 的"keep 规则"告诉它"哪些代码不要动"(反射 / 序列化 / JNI):

```
-keep class com.notedx.Note { *; }                    # 保留 Note 类的全部成员
-keepclassmembers class * { @retrofit2.http.* <methods>; }  # 保留所有 Retrofit 标注的方法
```

---

## 十三、ABI / `.so`:32-bit vs 64-bit

每个 Android 设备有一个 ABI(Application Binary Interface):

- `arm64-v8a`——现代 ARM 64 位(90%+ 设备)
- `armeabi-v7a`——老 ARM 32 位
- `x86_64`——模拟器
- `x86`——古老的 Intel 设备

APK 里 `.so` 必须按 ABI 拆分:

```
NotedX.apk
└── lib/
    ├── arm64-v8a/libnotedx.so
    └── armeabi-v7a/libnotedx.so
```

**AAB(App Bundle)自动按设备 ABI 分发**——一台 arm64 手机只下到 arm64 的 .so,体积省一半。

**API 35 起强制 16 KB page size**:某些 .so 库需要重对齐(原来对齐 4 KB)。OpenCV / TensorFlow Lite / FFmpeg 等需要重编译。纯 Kotlin App 不受影响。

---

## 十四、ART 的内存视图

```bash
adb shell dumpsys meminfo com.notedx
```

输出关键字段:

```
** MEMINFO in pid 12345 [com.notedx] **
                   Pss  Private  Shared  
                  Total    Dirty   Dirty  
  Native Heap     5132     5132       0   # JNI / native 分配
  Dalvik Heap    24532    24532       0   # ART 主堆,你的对象都在这
  Dalvik Other   16780    16780       0   # ART 元数据
  Stack            420      420       0   # 线程栈
  Ashmem            56        0      52   # 共享内存
  Other dev        324      324       0
  .so mmap        5012        0     124   # mmap 的 .so 库
  .jar mmap          0        0       0
  .apk mmap        856        0     412   # mmap 的 APK
  .ttf mmap        108        0      72   # 字体
  .dex mmap       1376        0    1376   # mmap 的 DEX
  .oat mmap        324        0     324   # mmap 的 AOT 机器码
  .art mmap       2008     1900       8   # boot image 镜像
  Other mmap      1004      720       0
  ----------- -------  -------  -------
       TOTAL    57932    49808    2368
```

**关键认识**:
- **Dalvik Heap** 是你 Java/Kotlin 对象的内存
- **`.dex` / `.oat` / `.art` mmap** 不是你 App 的"内存使用",是和系统共享的页面缓存
- **`Pss`(Proportional Set Size)** 是更公平的"实际占用"——共享页按使用方数量分摊

调优内存关注 `Dalvik Heap + Native Heap`——这是真正可控的部分。

---

## 十五、踩坑

**坑 1:认为 `System.gc()` 能优化内存**。ART 内部 GC 比你聪明。`System.gc()` 在 release 里通常被忽略,debug 下也只是触发一次回收,不会减总占用。**永远不要在生产代码调用**。

**坑 2:大量短期对象 → GC 频繁**。
```kotlin
fun process(items: List<Item>) {
    items.forEach { item ->
        val temp = item.copy(updatedAt = now())   // 每次循环新对象,GC 压力大
        save(temp)
    }
}
```
热路径循环里少 new 对象,用对象池或者批处理。

**坑 3:`Bitmap` 当成普通对象**。Bitmap 一张 1000×1000 的 RGB_8888 = 4 MB——Dalvik Heap 装几张就涨。**用 Coil 等库自动管理,或者用完 `recycle()`**(API 11 之前的 Bitmap 在 native 堆,新版在 Dalvik 堆,recycle 主要是早释放)。

**坑 4:`String` 加号拼接**。`"a" + "b" + "c" + var1 + var2` 在循环里每次创建新 String → 内存。`StringBuilder` 或 Kotlin 字符串模板 `"$a$b$c$var1$var2"` 更好。

**坑 5:认为 R8 不会破坏代码**。反射 / 序列化 / JNI 边界的类被 R8 改名 → 运行时 NoClassDefFoundError。**release build 必测**,且 `proguard-rules.pro` 给反射边界写 keep 规则。

**坑 6:JNI 在循环里调用频繁**。每次 JNI 几百 ns 开销,1000 次循环就是几百微秒。批处理 / 一次传 buffer。

**坑 7:`finalize()` 写资源清理**。ART 不保证 finalize 被调用,即便调用也可能延迟很久。**资源清理用 `Closeable.use {}` / `try-with-resources`,不要靠 finalize**。

**坑 8:JIT 与 AOT 冲突**。装 release 包后 Profile 没生效,启动还是慢——可能是用户刚装,系统还没 idle 充电触发 dex2oat。`adb shell cmd package compile -m speed -f com.notedx` 强制编译验证。

**坑 9:用 Java Reflection 取私有 SystemServer 字段**。AOSP 内部 API 不稳定,且 R8 / Hidden API 限制会让 release 直接崩。除非真正必要(且做兼容性兜底),不要用反射访问 framework 私有 API。

**坑 10:认为字节码可以随便改**。运行时改 DEX(动态加载 / 热修复)是危险操作——R8 已 inline 的代码热修复改不到、不同设备 AOT 状态不同、Play Store 审核会拒。**99% 的应用不需要热修复**,有重大 bug 走 Play Store 灰度发版。

---

第一篇结束(01-06)。下一篇 `07-Activity 生命周期与 Task Back Stack.md`,讲 Android "四大组件"的第一个——Activity 的 7 个生命周期回调、Task 与 Back Stack 的关系、`launchMode`(standard / singleTop / singleTask / singleInstance)、配置变化重建机制、SavedInstanceState 的"两层保存"。
