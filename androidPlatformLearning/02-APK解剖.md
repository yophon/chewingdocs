# APK 解剖:Manifest / DEX / 资源 / 签名

> 一句话:**APK 是一个 zip 文件,但它每个组成部分都对应 Android 系统的一个子系统——Manifest 是与 AMS 的契约,DEX 是 ART 的输入,resources.arsc 是资源系统的索引,签名是身份证**。读懂 APK = 读懂 Android 应用安装与运行的底层。

---

## 一、把 APK 当 zip 拆开

```bash
cp NotedX.apk NotedX.zip
unzip NotedX.zip -d NotedX-extracted/
tree -L 2 NotedX-extracted/
```

典型结构:

```
NotedX-extracted/
├── AndroidManifest.xml          ← 二进制 XML
├── classes.dex                  ← 主 DEX
├── classes2.dex                 ← multidex(可能多个)
├── resources.arsc               ← 编译后的资源索引
├── res/                         ← XML 布局(也是二进制)、可能未编译的图片
│   ├── drawable/
│   ├── layout/
│   └── ...
├── assets/                      ← 原样文件
├── lib/
│   ├── arm64-v8a/libxxx.so
│   └── armeabi-v7a/libxxx.so
├── META-INF/
│   ├── MANIFEST.MF              ← 每个文件的 SHA 摘要
│   ├── CERT.SF                  ← 签名信息
│   └── CERT.RSA                 ← 证书
└── kotlin/                      ← Kotlin metadata
```

**AndroidManifest 和 XML 布局是"二进制 XML"**(AAPT 编译过),直接 `cat` 看不到文本。要看用 `aapt`:

```bash
aapt dump xmltree NotedX.apk AndroidManifest.xml
```

或者用 `apktool` 完整反编译:

```bash
apktool d NotedX.apk -o NotedX-decoded/
```

`apktool` 把二进制 XML 还原为可读文本、把 resources.arsc 还原为 `res/values/*.xml`。**逆向分析 / 审计第三方 SDK 全靠 apktool**。

---

## 二、AndroidManifest:与 AMS 的契约

`AndroidManifest.xml` 是 APK 里**唯一可以独立被系统读取**的部分——PackageManager 安装时不解压 DEX,只解析 manifest 就能知道这 App 是什么。

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.notedx"                              <!-- 包名,App 全局唯一标识 -->
    android:versionCode="1"                           <!-- 整数,Play Store 用来判断"是不是更新" -->
    android:versionName="0.1.0">                      <!-- 字符串,用户看的版本号 -->

    <uses-sdk
        android:minSdkVersion="26"                    <!-- 最低 Android 8.0 -->
        android:targetSdkVersion="35" />              <!-- 按 Android 15 行为运行 -->

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />

    <queries>                                          <!-- API 30+ 必须声明:你 App 想看到哪些其他 App -->
        <package android:name="com.google.android.youtube" />
        <intent>
            <action android:name="android.intent.action.SEND" />
            <data android:mimeType="image/*" />
        </intent>
    </queries>

    <application
        android:name=".NotedXApp"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:theme="@style/Theme.NotedX">

        <activity
            android:name=".MainActivity"
            android:exported="true">                  <!-- API 31+ 必须显式 exported -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".SyncService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />

        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
```

**Manifest 是系统的"应用名片"**:

- AMS 读它知道有哪些 Activity / Service / Receiver / Provider
- PMS 读它知道权限要求、最低 SDK、签名信息
- Launcher 读 `<intent-filter android:action="MAIN">` 决定哪些 App 显示在桌面
- 系统设置读 `<application android:label>` 显示 App 名

**`<queries>`**(API 30+ 新)——你 App 想"查看"或"调用"其他 App,必须先在 manifest 声明。这是 Google 收紧"App 偷窥其他 App 安装情况"的隐私强化。漏写的话 `PackageManager.queryIntentActivities()` 返回空。

**`exported`**(API 31+ 强制)——有 intent-filter 的组件必须显式声明 `exported=true|false`。漏写编译报错。

---

## 三、解析 AndroidManifest 的命令

```bash
# 查看 manifest 完整内容
aapt2 dump xmltree NotedX.apk --file AndroidManifest.xml

# 只看权限
aapt dump permissions NotedX.apk

# 只看 Activity / Service
aapt dump xmltree NotedX.apk AndroidManifest.xml | grep -E "activity|service"

# 包名、版本号、签名
aapt dump badging NotedX.apk | head -20
```

输出 `aapt dump badging`:
```
package: name='com.notedx' versionCode='1' versionName='0.1.0' platformBuildVersionName='15'
sdkVersion:'26'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
application-label:'NotedX'
launchable-activity: name='com.notedx.MainActivity'  label='NotedX'
```

---

## 四、DEX:Android 的字节码格式

`.dex` 文件包含**编译过的类字节码**。一个 DEX 可以容纳多个类,大型 App 用 multidex 拆成 classes.dex / classes2.dex / classes3.dex。

```bash
# 查看 DEX 里有多少类
dexdump -h NotedX-extracted/classes.dex | grep -E "Method count|class_defs_size"

# 反编译 DEX 到 Java 伪代码(逆向工程常用)
# 用 jadx-gui 或 jadx 命令行
jadx -d output-dir NotedX.apk
```

**DEX 格式特点**:

1. **寄存器机器**(JVM 是栈机器)——指令直接引用寄存器,典型操作如 `add-int v0, v1, v2`。比 JVM 字节码更接近实际 CPU,执行效率更高。
2. **共享常量池**——一个 DEX 内所有类的字符串 / 类名 / 方法名共享一个池。比一堆 .class 文件省空间。
3. **65536 方法数限制**——单个 DEX 文件方法引用数最多 65536。所以才需要 multidex 拆分。

**multidex 的代价**:启动时把多个 DEX 全部加载到内存。Android 5.0+ 原生支持 multidex,4.x 需要 `androidx.multidex` 库。**目前 minSdk ≥ 21 的项目不必特意配置 multidex**。

**Proguard / R8 的去重**:R8 是 AGP 自带的代码优化器,它在打包时做 shrink + obfuscate + inline。**经过 R8 的 DEX 体积通常缩小 30-50%**,且类名 / 方法名变成 `a.b.c` 这种短名。

---

## 五、resources.arsc:资源系统的二进制索引

`resources.arsc` 是**已编译的资源表**——把 `res/values/strings.xml`、`res/values/colors.xml`、`res/values-zh/strings.xml` 等编译为一份扁平的、按 ID 索引的二进制表。

资源 ID 形如 `0x7f010001`,**类型 + 索引**:

- `0x7f`:package id(自己 App 是 7f,framework 是 01)
- `01`:资源类型(string / drawable / layout / ...)
- `0001`:类型内的索引

`R.string.app_name` 在编译期被替换为常量 `0x7f110001`。运行时 `getResources().getString(0x7f110001)` 查 resources.arsc 拿到 "NotedX"。

**多语言**:resources.arsc 内部按 locale 索引——同一个 ID `0x7f110001` 在 `zh-CN` locale 下查到"NotedX",在 `en-US` 查到"NotedX"(英文)。**运行时系统按当前 locale 选择**——你的代码 `getString(R.string.app_name)` 不感知差异。

查看 resources.arsc 命令:

```bash
aapt2 dump resources NotedX.apk | head -50
```

---

## 六、APK 签名:身份证

Android 强制要求 **每个 APK 必须签名**——没签名装不上。签名的作用:

1. **身份认证**——同包名同签名才能更新;别人不能用同样的 `com.notedx` 包名发版本(签名不同 PMS 拒绝)
2. **代码完整性**——任何文件被改动签名失败
3. **同 UID 共享**——同签名的两个 App 可以声明 `sharedUserId` 共享 UID(几乎不用)

**签名方案历史**:

| 方案 | 引入版本 | 算法 | 验证位置 |
| --- | --- | --- | --- |
| **v1**(JAR signature) | Android 1.0 | SHA-1 + RSA(改进可选 SHA-256) | META-INF/ |
| **v2** | Android 7.0 (API 24) | APK 整体哈希 | APK 文件末尾的"Signing Block" |
| **v3** | Android 9.0 (API 28) | 同 v2 + 支持密钥轮换 | 同 v2 |
| **v4** | Android 11 (API 30) | 与 v2/v3 配合 + 增量更新 | 单独的 `.apk.idsig` 文件 |

**实操**:新 App 用 `apksigner` 默认开启 v2 + v3。v1 是兼容老系统的兜底,API 24 以下设备才用。

```bash
# 给 APK 签名
apksigner sign --ks notedx-release.jks --out NotedX-signed.apk NotedX-unsigned.apk

# 验证签名
apksigner verify --print-certs NotedX-signed.apk
# 输出:
# Signer #1 certificate DN: CN=NotedX, O=NotedX Inc
# Signer #1 certificate SHA-256 digest: 1234567890abcdef...
```

**SHA-256 指纹**——上架 Play / 配 App Links 都要用。

---

## 七、安装时操作系统做了什么

```
adb install NotedX.apk
   ↓
PackageInstallerService 接到 APK
   ↓
1. 验证签名(签名方案 v2/v3 直接 hash APK 比对)
2. 解析 AndroidManifest 看包名、版本号、权限、组件
3. 如果是更新:检查签名是否匹配现有版本
4. 检查 minSdkVersion 是否满足
   ↓
PMS 分配 UID(从 10000 开始,系统 App 0-9999)
   ↓
mkdir /data/data/com.notedx          # 数据目录,权限 700,属主 UID=10042
mv NotedX.apk /data/app/com.notedx-1/base.apk
   ↓
dex2oat /data/app/com.notedx-1/base.apk  # AOT 编译为 OAT(机器码)
   ↓
注册组件到 system_server 的 AMS / PMS 索引
   ↓
广播 ACTION_PACKAGE_ADDED
   ↓
Launcher 收到广播,刷新桌面图标
```

**关键认识**:

- **每个 App 是一个独立 UID**——`/data/data/com.notedx/` 的权限是 700 + 属主 UID=10042,其他 App(不同 UID)读不了。这是 Android Sandbox 的物理基础。
- **dex2oat 是安装时的 AOT 编译**——把 DEX 字节码翻译成 ARM 机器码,启动时 ART 直接跑机器码。
- **更新和首装的差别**——更新会保留 `/data/data/<package>/`,首装新建。

03 / 20 篇会展开 UID / sandbox / 权限。

---

## 八、App Bundle (AAB):新格式

APK 是一份"完整成品",所有架构 / 屏幕密度 / 语言都打包进去——浪费空间。

AAB 是 Google 2018 引入的"未拼接的 APK":你上传一份 AAB,Google 服务端**根据每个用户的设备生成定制 APK**(只含他设备需要的 ABI、屏幕密度、语言)。

```
NotedX.aab(开发者上传)
   ↓
Google Play 拆分
   ↓
针对用户 A(arm64 + xxhdpi + 中文):
   base.apk + split_arm64_v8a.apk + split_xxhdpi.apk + split_zh.apk
针对用户 B(armv7 + hdpi + 英文):
   base.apk + split_armeabi_v7a.apk + split_hdpi.apk + split_en.apk
```

**典型 30-50% 体积减少**。Play Store 自 2021 起强制 AAB 上传。

`bundletool` 可以模拟拆分:

```bash
bundletool build-apks --bundle=app-release.aab --output=app.apks --connected-device
bundletool install-apks --apks=app.apks
```

---

## 九、查看一份陌生 APK 的快速命令

```bash
# 1. 基本信息
aapt dump badging mystery.apk

# 2. 完整权限列表
aapt dump permissions mystery.apk

# 3. 所有 Activity / Service / Receiver
aapt dump xmltree mystery.apk AndroidManifest.xml | grep -E "activity|service|receiver|provider"

# 4. 签名指纹
apksigner verify --print-certs mystery.apk

# 5. DEX 反编译为 Java
jadx -d mystery-decoded mystery.apk

# 6. 完整反编译(包括资源)
apktool d mystery.apk -o mystery-full
```

逆向分析一个第三方 SDK / 一个竞品 APK,这套命令足以拿到 80% 的信息。

---

## 十、Multi-APK / Split / Instant Apps

**Multi-APK**:一份 App 用多个 APK 上架(主 APK + 不同 ABI 的扩展)——AAB 出现后基本不用了。

**Split APK**:AAB 的产物。**Dynamic Feature**(`com.android.dynamic-feature`)允许把 feature 模块拆成"按需下载"——用户点某个高级功能才下相关代码。极少数大型 App 用(Netflix / Uber)。

**Instant Apps**:Play Store 的"试用模式"——用户不安装就能跑你 App 的一个子集。需要把 base + instant feature 模块都做 < 15MB。**少数大型 App 适用**,普通 App 不必碰。

---

## 十一、踩坑

**坑 1:多份 keystore 同包名同时上架**。生产签名一旦丢,**这个包名永远不能更新**——你只能用新包名重新发版,丢全部用户。永远备份 keystore,且用 Play App Signing(由 Google 托管真正的发布签名)。

**坑 2:`exported` 漏写**。API 31+ 编译报错。即便 API 30 及以下能过,也要显式声明——`exported=true` 是"对外开放"的强声明,默认应当 `false`。

**坑 3:`<queries>` 漏声明**。API 30+ 不声明,`PackageManager.queryIntentActivities()` 返回空。常见症状:微信分享意图查不到、`canHandle` 总是 false。

**坑 4:Manifest 里写错权限名**。`android.permission.CAMERA` 错写成 `android.permission.Camera` 不会编译报错,但运行时申请失败。**永远 import `android.Manifest.permission.CAMERA` 用常量**。

**坑 5:Multidex 主 DEX 不包含 Application 类**。API 21 以下 multidex 模式下,Application 类必须在 classes.dex(不能在 classes2.dex)。否则启动崩。AGP 一般自动处理,但自定义 multidex.keep 时要注意。

**坑 6:版本号同步**。`versionCode` 上传 Play 必须递增,不能重复。CI 应当自动递增(基于 git commit count)。`versionName` 是用户可见,跟语义化版本走。

**坑 7:DEX 方法数超限**。65536 限制好像很多,但 RxJava + Guava + 各种 SDK 几个就爆。**默认开启 multidex**,且 R8 默认会做 inline 减少方法数。

**坑 8:`assets/` 与 `res/` 混淆**。`res/` 是编译过的资源,通过 `R.xxx` ID 访问;`assets/` 是原样文件,通过 `AssetManager.open(path)` 读。**字体 / 大文件 / 数据预置文件用 assets,UI 资源用 res**。

**坑 9:`/data/data/` 不可访问问题**。你 App 进程内 `Context.filesDir` 拿到的就是 `/data/data/com.notedx/files/`,可读可写;但 ADB shell 默认非 root 时**无权限读其他 App 的 data 目录**——`adb shell run-as com.notedx` 才能切到 App UID 访问自己的 data。

**坑 10:`AndroidManifest.xml` 写了 `tools:` 属性以为生产生效**。`xmlns:tools="..."` 是给 lint / AAPT 用的"开发工具属性"(`tools:replace` / `tools:targetApi`),**编译时被去掉**,运行时不存在。常见误用:`tools:exported="true"` 写错地方。

---

下一篇 `03-进程、Sandbox 与 UID 模型.md`,把"每个 App 一个 UID 沙箱"这件事彻底讲清楚:Zygote 怎么 fork、UID 怎么分配、`/data/data/` 权限、Application 类的生命周期、多进程 App(`android:process` 标签)、`ProcessLifecycleOwner` 与"全局进程级状态"。
