# 28-App Bundle、签名与上架

> 一句话导读:`.aab` 不是"另一种 .apk",它是把按 ABI、屏幕密度、语言切片的能力交还 Play Store,让玩家下到的包小一截;签名也不再是你本地一把 `.jks` 走天下,而是 Play App Signing 拿走 master key,你只管 upload key——这一篇把这两件事和灰度发布、`bundletool` 本地复现、16 KB 对齐自检串成一条上架流水线。

到这一篇,前 27 篇做完的 NotedX 已经是一个能跑、能联网、能在系统里申请权限、性能基线被 Macrobenchmark 验过、混淆后包体瘦下来的现代 Android 应用。但要让它真的进到玩家手机上,中间还隔着 Play Console 的一整套发布机制——`.aab` 取代了 `.apk` 的分发地位、Play App Signing 改变了签名所有权模型、Internal / Closed / Open / Production 四条 track 决定了"先放给谁试",再叠加灰度推送、`versionCode` 单调递增、16 KB page size 兼容自检、本地 `bundletool` 反演—— 这套东西并不复杂,但每一步都有"忘了做就上不了架或者上了架被拒"的坑。这一篇按发布前 → 发布中 → 发布后的顺序把它们串起来。

中国大陆开发者还要面对 Play Store 不可达的现实:华为应用市场、小米、OPPO、vivo、应用宝、TapTap 各家的审核规则、签名要求都不一样。本篇主线是 Play Store,末尾会用一节简短交代国内分发渠道的差异在哪、为什么不能照搬 Play 的流程,但不会展开任何一家的 SDK 集成。

## 1. 机制定位

`.apk` 是 Android 从一开始就有的安装包格式,所有给玩家的字节都在一个文件里:一份 manifest、所有 ABI 的 `.so`、所有屏幕密度的资源、所有语言的字符串。Play Store 早期就是把同一个 `.apk` 推给所有设备,导致一个 30MB 的 APK 里至少一半是这台设备永远用不到的代码和资源。

**App Bundle(`.aab`)解决的是"分发尺寸"问题。** 你上传的 `.aab` 是一个把 base module、各种 `feature` module、所有切片信息一并打包的中间产物,Play Store 拿到它之后按设备实际需要生成"split APK"组合:目标设备是 `arm64-v8a` + `xxhdpi` + 中文,就只下发这三套切片对应的 APK。统计上同一个项目从 APK 切到 AAB 通常能省 15-40% 的下载尺寸。

**Play App Signing 解决的是"密钥灾难"问题。** 旧时代你本地有一把 `.jks` keystore,丢了就完了——所有未来更新都签不上去,只能换包名重发,所有历史评分清零。Play App Signing 让 Google 帮你保管 app signing key(master key),你本地只持有 upload key——丢了上传密钥,联系 Google 把 upload key 重置就行,master key 一直安全。从 2021 年 8 月起新上架 App 强制使用 Play App Signing,所以这一节不是"是否启用"的选择题,而是"用哪种方式启用"。

**四条发布通道解决的是"上架风险"问题。** Internal testing 给团队内最多 100 人秒级分发;Closed testing 给预先报名的邮箱列表(也可以基于 Google Group);Open testing 给所有人可选加入的 beta;Production 才是真正全量。叠加 Staged rollout(灰度比例,1%→5%→20%→50%→100%),你才有机会在炸到 1% 玩家时及时 halt rollout 而不是炸到全量。

新手最常见的失控写法,是绕过这套机制——本地签个 release APK,直接 Production 100%,然后第二天发现新版本启动崩了 30%,只能熬夜出 hotfix。这一篇要做的就是把"如果出问题"前置变成"先在一个可控小集合验证",而不是"上线后再赌运气"。

## 2. Android 心智

要做对这一步,先理清几个易混的概念。

**`versionCode` 是整数,单调递增,Play Store 用它判断"哪一份更新"。** 任何上传到同一个 `applicationId` 的 `.aab`,`versionCode` 都必须严格大于之前所有上传过的版本——包括早期撤回的 internal track 上传。一旦你上传过 `versionCode=10000`,后续就不能再上 `9999` 或 `10000`,只能 `10001`+。`versionName` 是字符串("1.0.0"),给玩家看的,可以重复,Play Store 不靠它做比较。常用做法是把 `versionCode` 与 CI build number 或者 commit count 绑定,每次构建自增,人手不直接编辑。

**`applicationId` 是身份,`package` 是代码。** `AndroidManifest.xml` 里的 `package` 与 Gradle `applicationId` 在新版 AGP 已经解耦——`applicationId` 才是 Play Store 用来识别"这是哪个 App"的唯一键。一旦在 Play Console 上架,这个 ID 永远绑定该上架记录,不能换。本地调试常用做法是设 `applicationIdSuffix ".debug"`,让 debug 与 release 能同时装在一台设备上;Play Store 上架的永远是不带 suffix 的 release variant。

**两种签名密钥:upload key 与 app signing key。** 开启 Play App Signing 后:你本地用 upload key 签 `.aab`,上传后 Play Store 用 app signing key 重签发到玩家设备的 split APK。两把 key 一辈子不一样。玩家拿到的安装包是用 app signing key 签的,所以 SHA-256 与 OAuth client、Google Maps API key、Firebase fingerprint 这些配置都要用 **app signing key** 的指纹,不是你本地 upload key 的指纹。Play Console → Setup → App signing 里能查到 app signing key 的 SHA-1 / SHA-256。

**`signingConfig` 永远不要把密码硬编码进 `build.gradle.kts`。** 写进去就会进 Git,出去就是灾难。规范做法:`keystore.properties`(在 `.gitignore` 里),或者 `~/.gradle/gradle.properties` 全局,或者 CI 用 base64 把 `.jks` 注进环境变量后解码。下一节的代码示例直接给规范实现。

**Internal App Sharing vs Internal testing 是两回事。** 前者是上传后立刻拿到一个 share link,任何被授权的账号点开就能装,不走 review、不上 track,适合"我现在就要把这个 build 给 QA"。后者是 Internal track,Play Console 内部 review 几小时到一天,给 testers email list。日常迭代多用 Internal App Sharing。

**`bundletool` 是 Google 出的官方 CLI,用来本地"反演" Play Store 生成 split APK 的过程。** 给一个 `.aab` + 设备 spec / 实机 adb 连接,它生成 `.apks` 包(里面是 split APK 集合),再用 `install-apks` 推到设备。这是验证"我这个 AAB 在真实设备上装下来到底长什么样"的唯一可靠途径,不要赌"上传 Play Store 后再看"。

**16 KB page size 是 Android 15 引入的硬约束。** 从 2025 年 11 月开始,新上传到 Play Store 的 App 必须支持 16 KB 内存页。如果你的项目里有原生 `.so`(自己写的 NDK / 第三方含 native 的 SDK,比如某些图像处理库、ML SDK、加密库),旧版 NDK 编出来的 `.so` 段对齐是 4 KB,在 16 KB 设备上 mmap 会失败,App 直接崩。AGP 8.5+ + NDK r27 默认输出 16 KB 对齐,但你引用的预编译 `.so` 不在你控制范围,要主动检查。下一节给检查命令。

## 3. 工程实现

### 3.1 `signingConfig` 与 release 构建

把签名信息放 `keystore.properties`(在仓库 `.gitignore` 里):

```properties
# keystore.properties (NEVER commit)
storeFile=../keystore/notedx-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

`app/build.gradle.kts`:

```kotlin
// app/build.gradle.kts
import java.util.Properties
import java.io.FileInputStream

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        load(FileInputStream(keystorePropsFile))
    }
}

android {
    namespace = "com.example.notedx"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.notedx"
        minSdk = 26
        targetSdk = 35
        // CI 注入:每次构建自增,人手不直接编辑
        versionCode = (System.getenv("CI_BUILD_NUMBER") ?: "1").toInt()
        versionName = "1.0.${versionCode}"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        create("release") {
            // 只有 keystore.properties 存在才填,CI 也能用环境变量替代
            if (keystorePropsFile.exists()) {
                storeFile = rootProject.file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            } else {
                storeFile = file(System.getenv("UPLOAD_KEYSTORE_PATH") ?: return@create)
                storePassword = System.getenv("UPLOAD_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("UPLOAD_KEY_ALIAS")
                keyPassword = System.getenv("UPLOAD_KEY_PASSWORD")
            }
            enableV1Signing = false   // 老 v1 JAR 签名,不需要
            enableV2Signing = true
            enableV3Signing = true    // APK Signature Scheme v3,Play 要求
            enableV4Signing = true    // 增量安装优化,可选
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // R8 的 mapping 文件由 Play Console 自动接收(见 30 篇 CI)
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    bundle {
        language {
            // 允许 Play Store 按语言切片(玩家只下载系统语言的字符串)
            enableSplit = true
        }
        density {
            enableSplit = true
        }
        abi {
            enableSplit = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
```

第一次生成 upload keystore(本地一次,后续都不会再做):

```bash
keytool -genkey -v \
    -keystore keystore/notedx-upload.jks \
    -alias upload \
    -keyalg RSA -keysize 4096 \
    -validity 36500 \
    -storetype JKS
```

`-validity 36500` ≈ 100 年,Play 推荐至少 25 年,过期之后想换 upload key 要走 reset 流程。这把 keystore 自己冷备一份(加密压缩到云盘 + 离线 U 盘),丢了的话还能找 Google reset upload key——但不要赌。

### 3.2 构建并本地验证 `.aab`

```bash
# 构建 release AAB
./gradlew :app:bundleRelease

# 输出在 app/build/outputs/bundle/release/app-release.aab
```

下载 `bundletool`(GitHub release 一个 `.jar`),用它把 AAB 反演成"模拟当前设备的 APK 集合":

```bash
# 1. 把 AAB 转成 .apks(给当前已连接的真机用)
bundletool build-apks \
    --bundle=app/build/outputs/bundle/release/app-release.aab \
    --output=app-release.apks \
    --connected-device \
    --ks=keystore/notedx-upload.jks \
    --ks-key-alias=upload

# 2. 装到真机:bundletool 自动选当前设备需要的 split
bundletool install-apks --apks=app-release.apks

# 3. 看看 Play Store 真发给"一个典型设备"的下载尺寸
bundletool get-size total --apks=app-release.apks
```

`get-size total` 会输出一个 MIN / MAX 范围,这是"按 ABI + density + language 切片后,玩家实际要下的字节数",比直接看 `.aab` 文件大小靠谱得多。

如果你想模拟某个虚拟设备(比如低端 32 位机),先给 spec:

```bash
# device-spec.json
{
  "supportedAbis": ["armeabi-v7a"],
  "supportedLocales": ["zh-CN"],
  "screenDensity": 240,
  "sdkVersion": 26
}
```

```bash
bundletool build-apks \
    --bundle=app/build/outputs/bundle/release/app-release.aab \
    --output=app-release-low.apks \
    --device-spec=device-spec.json \
    --ks=keystore/notedx-upload.jks \
    --ks-key-alias=upload

bundletool get-size total --apks=app-release-low.apks
```

这样你能提前看到"低端机用户实际下载多大",而不是等 Play Console 反馈。

### 3.3 16 KB page size 自检

如果你的项目纯 Kotlin / Compose、没用任何含 native `.so` 的第三方 SDK,这一步可以跳——但要"主动确认无 `.so`",不是默认无。

检查 AAB 里所有 `.so` 的段对齐:

```bash
# 把 AAB 解包成 ZIP
unzip -o app/build/outputs/bundle/release/app-release.aab -d aab-unpacked

# 用 readelf 看每个 .so 的 LOAD 段对齐是不是 16384 (0x4000)
find aab-unpacked -name "*.so" -print0 | while IFS= read -r -d '' f; do
    align=$(readelf -lW "$f" | awk '/LOAD/ { print $NF; exit }')
    printf "%-12s %s\n" "$align" "$f"
done
```

期望输出每行 `0x4000`(16 KB)。出现 `0x1000`(4 KB)的 `.so` 就是不兼容的——要么联系 SDK 厂商升级,要么自己用 NDK r27+ 重新编。Google 官方还有一个 [16 KB 兼容性 APK Analyzer 检测脚本](https://developer.android.com/guide/practices/page-sizes),CI 里可以集成。

AGP 8.5+ 默认在 manifest 里写入 `android:extractNativeLibs="false"` + `useLegacyPackaging false`,告诉 PackageManager `.so` 不抽出到磁盘、直接从 APK mmap—— 16 KB 设备上 mmap 要求段对齐到页大小,这就是为什么 4 KB 对齐的旧 `.so` 会在 16 KB 设备上崩。

### 3.4 上传到 Play Console 并走 Staged Rollout

第一次上架的流程:Play Console → Create App → 填基本信息 → Setup → App signing 选 "Let Google manage and protect your app signing key"(默认就是这个,2021 后没得选)→ 上传你的 upload certificate(从 `.jks` 导出 `.pem`)→ 然后才能进 Production → Create new release。

后续每次发版:

1. 把 `app-release.aab` 拖进 Internal testing → Create new release → Save → Review → Start rollout to Internal testing。几分钟后 Internal testers 能在 Play Store 看到更新。
2. Internal 通过后,从 Internal 提升(promote)到 Closed → Open → Production。每一步都可以加新 tester / 调整 release notes。
3. Production 阶段开 Staged rollout:1% → 跑一两天看 Crashlytics / Play Vitals 没爆炸 → 5% → 20% → 50% → 100%。任何一步发现回归(ANR 率、Crash 率、关键流程转化率掉),立即 Halt rollout——新版本停止下发,已下载的玩家不会被回滚(Play Store 没法回退用户已装版本),但新用户和未更新的老用户拿到的还是旧版本。

Play Console UI 上没法暴露的两件事:

- **Halt rollout 不能撤销。** 一旦 halt,这个版本就废了,必须出新 `versionCode` 再发。所以发现问题别犹豫,先 halt 再修。
- **Staged rollout 期间不能再提一个更高 `versionCode` 上 Production。** 必须先把当前 rollout 推到 100% 或 halt,才能上下一版。这意味着你的 hotfix 流程要先 halt 上一版,再发新版,而不是"在 5% rollout 期间塞个 hotfix 进去"。

### 3.5 国内分发渠道边界(简要)

Play Store 在中国大陆不可达,所以面向国内用户的 App 不能只走 Play Store。主流渠道有华为应用市场、小米应用商店、OPPO 软件商店、vivo 应用商店、应用宝(腾讯)、TapTap(游戏向)、酷安等。它们与 Play Store 的主要差异在:

- **打包格式**:全部仍是 `.apk`,不接受 `.aab`。你需要从同一个工程里同时产出 release `.apk` 和 release `.aab`,不能只走 AAB。常见做法是 `./gradlew assembleRelease bundleRelease` 一次出齐。
- **签名所有权**:各家全部要求"开发者自己持有签名密钥",没有 Play App Signing 这种"Google 托管 master key"的机制。你的 `.jks` 要冷备到三份以上的物理介质,因为丢了就只能换包名重发。
- **审核风格**:Play Store 主要看政策合规(权限、内容、Data Safety),国内渠道还要看实名认证、版号(游戏)、隐私协议本地化、SDK 合规自查清单(《App 收集使用个人信息合规自评指南》)。每家都有不同的审核周期,从 1 天到 5 天不等。
- **更新机制**:Play Store 是统一更新通道;国内你 App 内的"版本检查 → 下载新 APK → 调起安装"逻辑必须自己实现,且 Android 8+ 要 `REQUEST_INSTALL_PACKAGES` 权限,各家应用市场对这个权限的拦截程度还不一样。

工程上的常见做法是把"渠道差异"集中在一个 `flavor` 维度里:

```kotlin
android {
    flavorDimensions += "store"
    productFlavors {
        create("googlePlay") { dimension = "store" }
        create("huawei")     { dimension = "store" }
        create("xiaomi")     { dimension = "store" }
        // ... 按需加
    }
}
```

每个 flavor 在 `src/<flavor>/AndroidManifest.xml` 里注入对应渠道号 meta-data,推送 SDK 在运行时按 manifest 拿到的 channel 选不同实现。具体每家 SDK 的集成本系列不展开,基本结论是:**国内分发的复杂度主要来自渠道数 × SDK 集成,不来自 Android 平台本身。Play Store 这一篇讲的所有"AAB + Play App Signing + Staged Rollout"心智在国内是不直接适用的,你需要的是另一套"多渠道打包 + 自实现热更新 + 自研 OTA"的工程方法。**

## 4. 调参与验收

**`versionCode` 怎么算。** 推荐方案:`versionCode = 主版本号 * 10000 + 次版本号 * 100 + 修订号`(例如 1.2.3 → 10203),或者直接用 CI build number。前者直观但 99 个修订号就要进位;后者粗暴但永远单调。新手别手动 +1,迟早某次合并把数字打架。

**bundle splits 全开 vs 只开部分。** 默认 ABI / density / language 三轴都开,玩家下载尺寸最小。但如果你的应用要"分发给一个 root 过的设备让玩家手动 sideload",`.aab` 切片之后没法直接装,要 `bundletool` 转 APK 才行。给非 Play 渠道分发就要单独做 `assembleRelease` 出 APK。

**bundletool `get-size total` 给出的 MIN/MAX。** MIN 是最小切片(armeabi-v7a + ldpi + 单语言),MAX 是覆盖一台典型设备的最大组合(arm64-v8a + xxxhdpi + en + zh)。Play Console "App size" 看到的数字大致在 MIN 和 MAX 之间。一个健康的 Kotlin + Compose App release AAB(MIN-MAX)经验值是 8MB-20MB;超过 30MB 就要看是不是图片资源没压缩 / Lottie / 多份 native `.so` / 字体文件过大。

**Staged rollout 比例选哪个起点。** 用户基数 < 10 万:从 5%-10% 开始,粒度太细没意义(1% 都没人遇得到 bug)。用户基数 100 万+:从 1% 开始,1% 已经够大。每个台阶停留至少 24 小时,跨越周末再升一档。

**verdict:这一篇完成的标志。**

- 本地能产 release `.aab`,签名指纹与 Play Console 上传的 upload certificate 一致。
- `bundletool build-apks --connected-device` 能直接装到一台真机,启动正常。
- `bundletool get-size total` 显示的 MAX 比对应的 universal APK 小至少 15%。
- 任意一个 `.so`(如果有)通过 `readelf` 检查都是 0x4000 对齐。
- AAB 上传到 Play Console Internal track,Internal testers 能在 Play Store 看到更新。

## 5. 踩坑

**第一次上传后才发现 `applicationId` 写错。** Play Store 一旦录入这个 ID 就锁定,改 ID 等同于上架一个全新 App,所有评分、下载量、用户配置归零。Internal testing 上传前一定要确认 ID 是最终对外用的。

**`versionCode` 已经超过了 `2100000000`。** Play Store 上限是 `Integer.MAX_VALUE` 也就是 `2,147,483,647`,看起来很大,但如果你每天 CI 自增 100 次,十几年也会撞到。常见做法是不要无脑自增,而是用 `主版本 × 10000 + buildNumber` 的合成方案,留几位给主版本号也避免单调撞顶。

**Play App Signing 启用后想用回旧的 keystore 给 .apk 签。** 不可能。一旦 Play 接管 app signing key,所有玩家拿到的 APK 都是 Play 签的,你本地那把 `.jks` 只能再用来签 upload。如果你想自己分发 APK(给 alpha tester 直接下载安装),拿 Play Console "App bundle explorer" 里 "Signed, universal APK" 下载下来,那才是用 app signing key 签好的,玩家覆盖安装不会因为签名不一致被拒。

**OAuth / Maps API / Firebase 配置忘了换 app signing key 指纹。** 上线后玩家登录失败、地图灰屏、推送收不到——99% 是这个。Setup → App signing 复制 SHA-1 / SHA-256,贴到对应平台 console。

**16 KB 兼容检查只看自己写的 `.so`,漏了第三方 AAR。** AAR 里的 `.so` 经常被忽略。检查时把 `aab-unpacked` 整个 find,不要只 find `src/main/jniLibs`。一些常见踩坑库:旧版 OpenCV、某些图像滤镜 SDK、加密 SDK、TensorFlow Lite 老 nightly。升级版本号一般能解决,不能就开 issue 等。

**`bundletool` 报 `Cannot fetch device spec` 当连了一台 root + Magisk 设备。** 某些 root 框架修改了 `getprop` 输出,bundletool 拿不到 ABI / density。用 `--device-spec=...` 显式指定,或在干净设备上测。

**Internal App Sharing 上传无审核,但有效期 60 天。** 给 QA 用很方便,但别误以为它是"永久"链接——一个月后 link 失效,要重新上传新版。重要里程碑包(给投资人 / 发行)别只放 Internal App Sharing,Closed track 更稳。

**`bundle { language { enableSplit = true } }` 与 App-level localization 冲突。** 启用 language split 之后,玩家系统语言不在 App 已 ship 的语言列表里时,Play Store 下发的是 base module 的默认语言(通常是英语)。如果你又在 App 内做"手动切换语言到日语"(per-app language preferences),而日语 string 在玩家系统不是日语时根本没被下载,切换会 fallback 到英语。解决:把 `application/config/language` 关闭 split,或者用 Play Asset Delivery 显式按需下载语言包,或者接受 fallback。

**首次 Staged rollout 1% 看到 crash 暴增,以为是新版本崩了,其实是旧版本崩。** Play Vitals 默认按 vitals dashboard 全量统计,不是只看新版本。看 ANR / Crash 趋势时,filter 选到 "this release" 才是新版本独有的数据。否则你看到的可能是上一个版本累积下来的崩溃报告。

**Crashlytics 上线后才发现 R8 mapping 没传。** Crashlytics 默认从 Firebase Gradle plugin 把 mapping 自动上传到 Firebase 后台。如果你 mapping 是手动管理的(没用 Firebase plugin)或者 CI 用了别的渠道,记得在 release pipeline 里加一步上传—— 30 篇 CI workflow 会给出完整步骤。

**`enableV1Signing = true` 在 minSdk ≥ 24 时是无效的浪费。** v1 JAR 签名是给 Android 6 及以下用的。minSdk = 26 就不需要 v1,只保留 v2 + v3,签名速度还更快。但 v4 在 Android 11+ 才生效,留着没坏处。

**`signingConfigs` 块写在 `buildTypes` 块下面。** Kotlin DSL 是声明顺序敏感的——`buildTypes.release.signingConfig = signingConfigs.getByName("release")` 这一行要求 `signingConfigs` 块已经声明完成。如果你按"喜欢的顺序"写,IDE 会报红或者 Gradle 同步失败。保守写法是 `signingConfigs` 永远在 `buildTypes` 上面。

**`useSupportLibrary = true` 在 Compose-only 项目里没必要。** 这是 vector drawable 兼容包,纯 Compose 项目不引 `androidx.appcompat` 也能跑。留着无害但浪费几 KB,洁癖时可以删。

## 手动验证

- [ ] `./gradlew :app:bundleRelease` 产出 `app-release.aab`,无警告。
- [ ] `keytool -printcert -jarfile app-release.aab` 输出的 SHA-256 等于 Play Console 上 upload certificate 的 SHA-256。
- [ ] `bundletool build-apks --connected-device --bundle=...` + `install-apks` 安装到真机,App 正常启动,显示版本号 `versionName`。
- [ ] `bundletool get-size total` 显示 MAX 比 universal APK(`./gradlew assembleRelease`)的 `.apk` 文件大小小至少 15%。
- [ ] `find aab-unpacked -name "*.so"` 列出的所有 `.so`,`readelf -lW` 看到 LOAD 段 Align 都是 `0x4000`。
- [ ] AAB 上传 Internal testing → opt-in 一个 tester 邮箱 → 该邮箱在 Play Store 能搜到并安装。
- [ ] 提一份 Production Staged rollout 1% → 看 Play Console "Releases overview" 显示 "Rolling out to production – 1%" → 故意 Halt rollout → 状态切到 "Halted"。
- [ ] 把 `keystore.properties` 加进 `.gitignore`,`git status` 不再列出该文件;CI 用 `UPLOAD_KEYSTORE_PATH` 等环境变量替代,本地与 CI 都能成功签名。
