# Android 的世界观:Linux + AOSP + ART + APK 心智

> 一句话:**Android 不是"一个 App 平台",是一个**完整的操作系统——Linux 内核之上盖了一层 Java/Kotlin 运行时和系统服务,你写的 App 是这套系统里的一个**沙箱进程**。理解这件事,从 Activity 生命周期到 Binder IPC 才有正确的心智锚点。

---

## 一、Android 不是 Windows 也不是 iOS

很多人对 Android 的初始印象是"运行 App 的手机系统",这个印象会让你**看不懂为什么 Activity 生命周期这么复杂、为什么 Service 后台被杀、为什么 Binder 到处都是**。

| 维度 | Windows | iOS | Android |
| --- | --- | --- | --- |
| 内核 | NT | XNU(Mach + BSD) | **Linux** |
| 应用容器 | EXE / UWP / 沙箱 | App + sandbox(seatbelt) | **每个 App 一个 Linux UID 沙箱进程** |
| 主要 IPC | COM / RPC | XPC / Mach port | **Binder**(独有) |
| UI 主线程模型 | Win32 消息循环 | RunLoop | **Looper + MessageQueue** |
| 应用包格式 | EXE / MSIX | IPA(签名容器) | **APK / AAB**(zip + DEX + 资源) |
| 字节码 / 原生 | x86 / ARM 原生 | LLVM Bitcode → ARM | **DEX 字节码,ART 跑** |

**心智差别最大的是 IPC 与进程模型**:

- Windows / iOS 的 App 也是进程,但跨进程通信复杂,所以"系统调用"接近 system call
- Android 把"调用系统服务"包装成"调用一个本地对象的方法",底层走 Binder 自动跨到 system_server 进程——你写 `notificationManager.notify(...)` 这一行,实际跨进程到了另一个进程

这件事是 Android 整个 SDK 设计的基础。后面 04 篇 Binder 会展开。

---

## 二、Android 的五层结构

从下到上:

```
┌──────────────────────────────────────────────────────┐
│  Android Applications                                │  ← 你的 App / 系统 App(Phone / Settings / Camera)
├──────────────────────────────────────────────────────┤
│  Java/Kotlin Framework API                           │  ← android.* / androidx.*(Activity / View / ...)
├──────────────────────────────────────────────────────┤
│  System Services(SystemServer 进程)                 │  ← AMS / WMS / PMS / InputManagerService / ...
├──────────────────────────────────────────────────────┤
│  Native Libraries + Android Runtime(ART)            │  ← libc / libbinder / libui / SurfaceFlinger / 你的 DEX
├──────────────────────────────────────────────────────┤
│  Linux Kernel + Android-specific drivers             │  ← Binder driver / ashmem / wakelock / Low Memory Killer
└──────────────────────────────────────────────────────┘
```

**每一层的关键认识**:

1. **Linux 内核**——是标准 Linux,但加了 Android 独有的 Binder driver、ashmem(匿名共享内存)、低内存杀手(LMK)、wakelock。**Android 的进程隔离用的就是 Linux 的 UID/sandbox 机制**。

2. **Native 层 + ART**——`libc` 兼容 POSIX 但是 Bionic libc 不是 glibc;`SurfaceFlinger` 是渲染合成的最终落点;**ART** 是 Android 自己的 JVM,跑 DEX 字节码(不是 Java class)。

3. **系统服务**——一个进程叫 `system_server`,里面跑了**几十个系统服务**:AMS(Activity Manager)/ WMS(Window Manager)/ PMS(Package Manager)/ Notification / Power / Location / ConnectivityManager。**你 App 进程的所有"看似本地"的 SDK 调用,大量都是通过 Binder 跨到这个 system_server**。

4. **Framework API**——`android.app.Activity` / `android.view.View` 这些类的实现散落在 Framework 源码里,本质是"调用系统服务的 Java 客户端"。

5. **App 层**——你写的代码,在自己进程跑。

读完本系列,你应当能看着上面这张图说出"我点击按钮调 `startActivity(intent)`,这一行代码经过哪几层、跨了几次进程"——这就是 Android 平台心智。

---

## 三、Android 是 Linux,但又不是普通 Linux

Android 在 Linux 之上重新设计了"应用模型"——传统 Linux 应用通过 `fork` + `exec` 启动,Android **不是**:

**典型 Linux**:
```
shell$ ./myapp           # fork + exec
       myapp 进程从零启动,加载 ELF,运行 main()
```

**Android**:
```
开机 → init → 启动 Zygote 进程(预加载 ART + 大量系统类)
                ↓
       Zygote 持续 listening
                ↓
       用户点 App 图标 → AMS 通过 socket 让 Zygote fork 一个子进程
                ↓
       fork 出来的子进程已经预加载了所有系统类(Copy-on-Write 共享)
                ↓
       AMS 让这个新进程 setUid 到目标 App 的 UID
                ↓
       新进程开始跑你的 Application.onCreate() / Activity.onCreate()
```

**关键设计**:**Zygote 是所有 App 进程的"妈妈"**。一旦 Zygote 启动并预加载了 ART runtime 和系统类,后续 fork 出来的 App 进程都共享这些预加载好的内存(Copy-on-Write)——**这是 Android 启动一个 App 比启动一个普通 Linux 应用快得多的根本原因**。

这件事影响后面很多设计:
- **每个 App 进程都跑一份 ART**,而不是共享一个 ART 实例(Java 服务器的模型)
- **进程死了所有状态丢光**(没有 daemon 持久化),所以 ViewModel 才需要 SavedStateHandle
- **进程可以随时被杀**(内存压力),所以 Activity 生命周期才设计成可以"任意点死/任意点活"

03 篇会展开 Zygote / 进程模型。

---

## 四、Android 上没有 Java,但有 DEX + ART

```
你写的 Kotlin / Java 源码
     ↓ (kotlinc / javac)
JVM 字节码(.class 文件)
     ↓ (d8 / dexer)
DEX 字节码(.dex 文件,Dalvik EXecutable)
     ↓
打进 APK
     ↓
安装时:dex2oat 工具把 DEX 编译为机器码(.oat 文件,AOT)
     ↓
运行时:ART 加载 OAT,直接执行机器码;不命中的部分用解释器 + JIT
```

**关键认识**:

1. **APK 里没有 .class 文件,只有 .dex**——DEX 是寄存器模型(JVM 是栈模型),专门为移动端优化。一个 DEX 文件可以容纳多个类,体积比一堆 .class 小。

2. **JVM 字节码与 DEX 字节码是两种东西**——Android 不直接跑 JVM 字节码,所有 JVM 字节码都要转换。这是 d8/dexer 干的事。

3. **ART 替代了 Dalvik**(Android 5.0 起)——Dalvik 是早期 Android 的虚拟机,纯 JIT;ART 是新一代,有 AOT(安装时编译)+ JIT(运行时编译热路径)+ Baseline Profile(02 / 21 篇)。

4. **Android 也有 Native 代码(.so)**——通过 JNI 调用。但应用层 99% 是 DEX,只有图像处理 / 游戏引擎 / 加密用 .so。

06 篇会展开 ART 的 GC / AOT / JIT。

---

## 五、APK:Android App 的物理载体

APK(Android Package)是个 zip 文件,改后缀解压能看到:

```
NotedX.apk
├── AndroidManifest.xml      ← 应用清单(声明组件、权限、Activity、Service 等)
├── classes.dex              ← 主 DEX(可能有 classes2.dex / classes3.dex,叫 multidex)
├── resources.arsc           ← 编译后的资源索引(string / dimension / color / layout 引用)
├── res/                     ← 资源文件(布局 XML、图片、字符串)
├── assets/                  ← 原样保留的资源(不经编译)
├── lib/
│   ├── arm64-v8a/*.so       ← native 库(按 ABI 拆分)
│   └── armeabi-v7a/*.so
├── META-INF/
│   ├── MANIFEST.MF          ← 文件哈希清单
│   ├── CERT.SF              ← 签名信息
│   └── CERT.RSA             ← 签名公钥与证书
└── kotlin/                  ← Kotlin metadata
```

**安装过程**:

1. PackageManager(PMS,系统服务)接到 APK
2. 解析 AndroidManifest,把组件信息(Activity/Service/Receiver)注册到系统
3. 给 App **分配一个唯一 UID**(从 10000 开始)
4. dex2oat 把 DEX 编译为机器码,放在 `/data/dalvik-cache/`
5. APK 复制到 `/data/app/<package_name>/base.apk`
6. App 的"数据目录" `/data/data/<package_name>/` 创建(权限 700,只有自己 UID 可读)

**App 安装后的物理位置**:
```
/data/app/com.notedx-1/base.apk           # APK 本体
/data/data/com.notedx/files/              # Context.filesDir
/data/data/com.notedx/databases/          # Room / SQLite 数据库
/data/data/com.notedx/shared_prefs/       # SharedPreferences
/data/data/com.notedx/cache/              # Context.cacheDir
```

02 篇会展开 APK / 安装 / 签名。

---

## 六、AOSP:Android 是开源的

**AOSP**(Android Open Source Project)是 Google 维护的 Android 开源代码库。AOSP 包含:

- Linux 内核(Android 分支)
- Bionic libc
- ART
- 所有系统服务(`frameworks/base/services/` 下面)
- 默认系统 App(Phone / Settings / Camera / Launcher)
- SDK 构建工具

**手机厂商基于 AOSP 改**——三星 OneUI、小米 HyperOS、华为 EMUI / HarmonyOS 都基于 AOSP 改造。Google Pixel 是最接近原生 AOSP 的手机。

**国内厂商通常会改的部分**:

- 通知中心 / 桌面 Launcher / 主题
- 推送通道(替代 GMS 推送)
- 应用权限管理(常常比 AOSP 更严)
- 后台限制(更激进的电池优化)
- 内置应用商店 / 系统服务

**为什么这对应用开发者重要**?——**同一份 APK 在不同厂商手机上行为可能不同**。AOSP 上能跑的代码,vivo 可能因为后台限制不工作;Pixel 上的网络栈是标准 OkHttp,华为可能拦截某些域名;Pixel 上的 NotificationChannel 行为是标准的,小米可能默认折叠你的通知。这些是 Android 工程的现实复杂度。

读 AOSP 源码:[https://cs.android.com/](https://cs.android.com/) 是 Google 提供的代码搜索。本系列后面引用 AOSP 源码都从这里。

---

## 七、Android 版本号 / API Level / 代号

```
Android 4.4 KitKat        API 19   (2013)
Android 5.0 Lollipop      API 21   (2014)  ART 取代 Dalvik
Android 6.0 Marshmallow   API 23   (2015)  运行时权限
Android 7.0 Nougat        API 24   (2016)
Android 8.0 Oreo          API 26   (2017)  NotificationChannel、后台限制
Android 9.0 Pie           API 28   (2018)
Android 10.0              API 29   (2019)  分区存储
Android 11.0              API 30   (2020)
Android 12.0              API 31   (2021)  Material You / 启动屏 API
Android 13.0              API 33   (2022)  通知权限、按 App 设置语言
Android 14.0              API 34   (2023)  前台服务 type 强制
Android 15.0              API 35   (2024)  edge-to-edge 强制
Android 16.0              API 36   (2025)
```

**重要变更节点**:

- **API 21**——ART 取代 Dalvik(性能提升关键)
- **API 23**——危险权限改为运行时申请(以前是安装时全给)
- **API 26**——后台启动 Service 严格限制(`startService` 在 App 不可见时直接抛异常,推动 WorkManager 诞生)
- **API 28**——加密强制(`cleartextTraffic` 默认 false,HTTPS 才能用)
- **API 29**——分区存储(`READ_EXTERNAL_STORAGE` 大部分场景不再有用)
- **API 33**——通知权限运行时申请、Per-App 语言
- **API 35**——edge-to-edge 强制(必须主动处理 system bar 内边距)

每个版本都有"行为变更"——你 App 的 `targetSdk` 决定它**按哪个版本行为运行**。后续 22 章会反复回到这些节点。

---

## 八、本系列的整体地图

```
01     世界观(这篇)
02-06  Android OS 平台:APK / 沙箱 / Binder / 系统服务 / ART
       这是"Android 是什么"的根基,任何应用开发问题都能在这里找答案

07-11  四大组件:Activity / Fragment / Service / Receiver / Provider
       Android 应用与系统对话的契约 API,Compose 时代仍然每个都要懂

12-13  主线程心智:Handler / Looper / ANR / 异步演化
       为什么 Android 主线程这么"娇贵",AsyncTask 怎么死的

14-17  View 系统:绘制三阶段 / XML / 自定义 View / 资源
       Compose 之下,View 仍然是物理实现。读老代码 / 自定义 View 必修

18-19  数据持久化(旧路径):SharedPreferences / SQLite / ContentResolver
       Room / DataStore 的"祖宗",且老开源项目仍在大量使用

20-22  安全与排障:权限 / 签名 / Sandbox / 内存泄漏 / 性能工具
       从能写代码 → 能修线上 Bug 的鸿沟,本节填平
```

**优先级**:
- 想懂 Compose 之下到底发生了什么 → 01-06 必看
- 维护老项目 → 07-19 全看
- 想会排查线上 Bug → 12-13 + 20-22

---

## 九、踩坑提醒(总览版)

1. **把"Android 应用"和"Android 系统"当一回事**——你的 App 是 Android 系统里的一个**沙箱进程**,大部分 Android 行为是系统决定的,不是你 App 决定的(后台限制 / 进程被杀 / Activity 生命周期)。
2. **以为 Java 在 Android 上和服务器一样**——Android 上是 DEX + ART,不是 .class + HotSpot。GC 策略、内存模型、AOT 时机全部不同。
3. **把所有问题归因于"Android 慢"**——99% 慢都是你 App 慢,不是 Android 慢。Profile 之前别下结论。
4. **认为 Activity 是"屏幕"**——Activity 是**一个与系统协商生命周期的契约**,不是 UI。它可以没有 UI(`Theme.NoDisplay`),也可以有多个 UI(Fragment / Compose 子树)。
5. **以为 Service 是"后台线程"**——Service 是"在主线程跑、生命周期跟着 AMS"的组件,跟"后台线程"没关系。Service 里依然不能阻塞主线程。
6. **以为 manifest 里声明权限就有权限**——危险权限必须运行时弹窗申请(API 23+),manifest 声明只是"允许我去申请"。
7. **以为 IPC 慢可以无视**——Android 上你天天调系统服务,每次都跨进程。设计不当(频繁调 `WindowManager` / `PackageManager`)会显著拖慢启动。
8. **以为 Linux 知识不重要**——Android 是 Linux,`/proc/<pid>/` 能看到你 App 的内存、文件描述符、线程;`adb shell` 就是个 Linux shell。Linux 基础每天都用。
9. **以为系统服务都是"普通 Java 类"**——它们是 Binder 服务,可能在 system_server 跑,可能在其他独立进程(Camera / Audio)跑。你调的是"代理对象"。
10. **以为"现代 Android 不用懂这些"**——Compose / Kotlin / Hilt 是上层封装,**下面的 Activity / Looper / Binder / View 一个都没消失**。封装漏了你就得自己懂。

---

下一篇 `02-APK 解剖.md`,把 APK 完全拆开:Manifest 语法、DEX 文件格式、resources.arsc 怎么编译、签名方案 v1/v2/v3/v4 各自意义、安装时操作系统做了什么。读完你能从一份 APK 解出"这个 App 声明了什么、签名属于谁、要哪些权限"。
