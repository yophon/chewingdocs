# 包名、Bundle ID、版本号与构建号

移动端最不能乱改的东西,不是应用名和图标,而是应用身份和版本身份。

一句话先记住:**包名 / Bundle ID 决定是不是同一个 App,版本号 / 构建号决定能不能更新。**

---

## 一、Android applicationId

Android 线上身份看 `applicationId`:

```kotlin
android {
    defaultConfig {
        applicationId = "com.example.app"
        versionCode = 42
        versionName = "1.3.0"
    }
}
```

`applicationId` 一旦上线,不要改。

改了就变成另一个 App:

```text
com.example.app      旧 App
com.example.app.new  新 App
```

用户无法覆盖升级,商店也会按新应用处理。

---

## 二、iOS Bundle ID

iOS 线上身份看 Bundle Identifier:

```text
com.example.app
```

它绑定:

- Apple Developer 后台的 App ID
- App Store Connect 的 App
- Provisioning Profile
- entitlements
- 推送、App Groups、Associated Domains 等能力

Bundle ID 改了,基本就是新 App。

---

## 三、包名和展示名不是一回事

| 概念 | 能否改 | 影响 |
| --- | --- | --- |
| 应用展示名 | 可以 | 用户看到的名称 |
| 图标 | 可以 | 用户看到的图标 |
| Android applicationId | 上线后不要改 | 应用身份 |
| iOS Bundle ID | 上线后不要改 | 应用身份 |
| Android namespace | 可调整 | 代码 / R 类命名空间 |
| iOS Product Name | 可调整 | 构建产物名 |

不要因为改品牌名就顺手改包名。

---

## 四、Android versionCode / versionName

```text
versionCode  给系统和商店比较大小,必须递增
versionName  给用户看,可以是 1.2.3
```

例子:

```text
versionName = 1.4.0
versionCode = 104000
```

规则可以设计成:

```text
major * 100000 + minor * 1000 + patch * 10 + build
```

但最重要的是:**永远递增**。

---

## 五、iOS version / build

iOS 有两个值:

```text
CFBundleShortVersionString  用户看到的版本,如 1.4.0
CFBundleVersion             build number,每次上传要递增
```

同一个 version 可以有多个 build:

```text
1.4.0 (101)
1.4.0 (102)
1.4.0 (103)
```

TestFlight 常见做法是 build 递增,正式版再提升 version。

---

## 六、多端版本规则

不要让 Android 和 iOS 完全自由发挥。

推荐:

```text
产品版本:1.8.0
Android versionName:1.8.0
iOS version:1.8.0
Android versionCode:自动递增
iOS build:自动递增
```

内部记录:

```text
release 1.8.0
  Android versionCode 108023
  iOS build 230
  commit abc1234
```

发版后要能追溯到 commit。

---

## 七、多环境身份

开发、预发、生产建议用不同身份:

```text
Android:
  com.example.app.dev
  com.example.app.staging
  com.example.app

iOS:
  com.example.app.dev
  com.example.app.staging
  com.example.app
```

好处:

- 可同时安装
- 推送证书 / token 不混
- 三方登录白名单不混
- 测试不会误打生产

代价:

- 每个环境都要配置推送、深链、登录、支付等能力
- iOS 每个 Bundle ID 都要 App ID / profile

---

## 八、三方平台白名单

这些平台经常绑定包名和签名指纹:

- 微信登录 / 支付
- 支付宝
- Google Sign-In
- Firebase
- 华为 / 小米 / OPPO / vivo 推送
- 地图 SDK
- 广告归因
- App Links / Universal Links

换包名或换签名后,要同步所有平台。

这就是为什么包身份和签名不能随便动。

---

## 九、什么时候会出事故

1. 改公司名时顺手改了包名,老用户不能升级。
2. iOS build 没递增,App Store Connect 拒收。
3. Android versionCode 比线上低,渠道拒收。
4. dev / prod 用同一个包名,测试包覆盖了正式包。
5. 换签名后微信登录失败,因为开放平台指纹没更新。
6. App Links 使用旧签名指纹,线上深链失效。

---

## 十、检查清单

- [ ] applicationId / Bundle ID 是否最终确定
- [ ] 是否区分 dev / staging / prod
- [ ] versionCode / build 是否自动递增
- [ ] 版本号是否能追溯到 commit
- [ ] 三方平台白名单是否记录包名和指纹
- [ ] App Links / Universal Links 是否按环境配置
- [ ] 渠道包是否能区分版本和渠道

---

## 十一、心智模型

```text
应用身份:applicationId / Bundle ID
签名身份:keystore / certificate
版本身份:versionCode / build number
能力身份:entitlements / fingerprints / platform config
```

这些身份稳定,发版才稳定。

下一篇 04 讲移动端打包与签名管理。
