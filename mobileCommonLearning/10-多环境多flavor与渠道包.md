# 多环境、多 flavor 与渠道包

移动端项目不能只靠一个包跑天下。开发、测试、预发、生产、渠道都需要清晰边界。

一句话先记住:**flavor 的本质是同一套代码生成不同身份、配置和资源的 App。**

---

## 一、为什么要多环境

至少有:

```text
dev       开发自测
staging   QA / 预发
prod      正式生产
```

每个环境可能不同:

- API base URL
- 包名 / Bundle ID
- 应用名
- 图标
- 推送配置
- 第三方登录配置
- 支付沙盒 / 正式
- 日志级别

不要用一个正式包连测试环境。

---

## 二、Android flavor

示例:

```kotlin
android {
    flavorDimensions += "env"

    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "App Dev")
        }
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "App")
        }
    }
}
```

构建:

```bash
./gradlew assembleDevRelease
./gradlew bundleProdRelease
```

---

## 三、iOS scheme / configuration

iOS 常见拆法:

```text
Scheme: Dev / Staging / Prod
Configuration: Debug / Release
xcconfig:不同环境变量
Bundle ID:com.example.app.dev / com.example.app
```

示例:

```text
API_BASE_URL = https://api-staging.example.com
PRODUCT_BUNDLE_IDENTIFIER = com.example.app.staging
```

iOS 每个 Bundle ID 都要配置对应 App ID、profile、capabilities。

---

## 四、Flutter flavor

Flutter 走底层平台 flavor:

```bash
flutter build apk --flavor dev -t lib/main_dev.dart
flutter build appbundle --flavor prod -t lib/main_prod.dart
flutter build ios --flavor prod -t lib/main_prod.dart
```

常见入口:

```text
lib/main_dev.dart
lib/main_staging.dart
lib/main_prod.dart
```

但真正的包名、签名、图标、应用名仍然要在 Android / iOS 工程里配置。

---

## 五、渠道包

国内 Android 常见渠道:

```text
huawei
xiaomi
oppo
vivo
honor
yingyongbao
official
```

渠道包常用于:

- 统计安装来源
- 渠道 SDK
- 不同市场材料
- 官网包和商店包区分

不要让渠道影响核心业务逻辑。渠道只应该影响分发和统计。

---

## 六、配置注入

推荐集中配置:

```ts
type AppConfig = {
  env: 'dev' | 'staging' | 'prod';
  apiBaseUrl: string;
  sentryDsn?: string;
  enableDebugPanel: boolean;
};
```

运行时读取:

```text
build config
Info.plist
AndroidManifest meta-data
remote config
```

高风险开关不要只靠本地配置,要有服务端 remote config。

---

## 七、命名规则

清晰命名:

```text
App Dev
App Staging
App
```

图标也要区分:

```text
dev:带 DEV 角标
staging:带 STG 角标
prod:正式图标
```

测试人员必须一眼看出自己装的是哪个环境。

---

## 八、什么时候会出事故

1. staging 包用了 prod Bundle ID,覆盖了正式包。
2. dev 包连 production API,测试数据污染生产。
3. 推送 token 混到正式环境,用户收到测试推送。
4. 渠道包用了错误签名,无法覆盖更新。
5. 支付沙盒和正式配置混用。

---

## 九、检查清单

- [ ] dev / staging / prod 是否有独立包身份
- [ ] 应用名和图标是否区分环境
- [ ] API base URL 是否随环境切换
- [ ] 推送、登录、支付是否按环境配置
- [ ] prod 包是否禁止 debug panel
- [ ] 渠道包是否只影响分发和统计
- [ ] CI 构建命令是否明确 flavor
- [ ] 测试报告是否标明环境和渠道

---

## 十、心智模型

```text
环境解决开发和生产隔离
flavor 解决同代码多身份构建
渠道包解决分发来源
remote config 解决上线后开关
命名和图标解决人为误装
```

下一篇 11 讲上架审核、隐私材料与合规清单。
