# iOS 证书、私钥、Provisioning Profile 与 Archive

iOS 签名看起来复杂,但核心就一句:账号证明你属于哪个 Team,证书和私钥证明你能签,profile 证明这个 App 可以用哪些能力。

一句话先记住:**iOS 签名 = Team + Bundle ID + certificate/private key + provisioning profile + entitlements。**

---

## 一、几个材料

| 材料 | 作用 |
| --- | --- |
| Apple Developer Account | 开发者账号和团队 |
| Team ID | 团队身份 |
| Bundle ID / App ID | App 身份 |
| Certificate | Apple 签发的证书 |
| Private Key | 本机生成的私钥 |
| `.p12` | 证书 + 私钥导出 |
| Provisioning Profile | App、证书、设备、能力、分发方式的组合 |
| Entitlements | App 声明的系统能力 |

真正能签名的是:

```text
certificate + private key
```

只有 `.cer` 没有私钥,不能签。

---

## 二、Provisioning Profile

Profile 约束:

```text
哪个 App ID
哪个 Team
哪些 certificates
哪些 devices(开发 / Ad Hoc)
哪些 entitlements
哪种 distribution
```

常见类型:

| 类型 | 用途 |
| --- | --- |
| Development | 开发调试 |
| Ad Hoc | 指定设备分发 |
| App Store | 上传 App Store / TestFlight |
| Enterprise | 企业内部分发 |

App Store 场景不需要绑定设备 UDID。

---

## 三、Entitlements

Entitlements 是能力声明:

```text
Push Notifications
Associated Domains
App Groups
iCloud
Sign in with Apple
Keychain Sharing
Background Modes
```

必须同时满足:

```text
项目里声明
Apple Developer 后台启用
Provisioning Profile 包含
```

三者不一致,就会出现:

- Archive 失败
- 上传失败
- 能上传但线上能力不工作

---

## 四、换 Mac 能不能继续发版

App Store 场景通常可以。

条件:

- 有 Apple Developer Team 权限
- 能访问 App Store Connect 里的 App
- Bundle ID 一致
- 使用同一 Team 的有效 Distribution 证书和 App Store profile
- build number 高于线上
- capabilities 配置一致

不必须:

- 原来的 Mac
- 旧私钥
- 旧 `.p12`

但 CI/CD 或手动签名场景仍建议迁移 `.p12` 和 profile。

---

## 五、Xcode 自动签名

适合个人和小团队:

```text
Xcode 登录 Apple ID
选择 Team
Automatically manage signing
Xcode 自动创建 / 下载 profile
Archive
```

优点:

- 简单
- 本地开发少踩坑
- profile 自动更新

缺点:

- CI 不稳定
- 多 target / extension 时不够可控
- 团队协作不容易审计

生产 CI 推荐明确管理证书和 profile。

---

## 六、Archive

Xcode Archive 产物:

```text
.xcarchive
  Products/Applications/App.app
  dSYMs/
  Info.plist
```

Archive 后可以:

- 上传 App Store Connect
- 导出 IPA
- 分发 TestFlight
- 提取 dSYM

每次发布都要保留对应 dSYM,否则 crash 不能符号化。

---

## 七、多 Target

这些通常都有自己的 Bundle ID:

- 主 App
- Notification Service Extension
- Widget Extension
- Watch App
- Share Extension

每个 target 都要匹配:

```text
Bundle ID
profile
entitlements
capabilities
```

不要只检查 Runner / App 主 target。

---

## 八、什么时候会出事故

1. 导入 `.cer` 但没有私钥,签名身份不可用。
2. profile 过期,CI 突然不能打包。
3. Associated Domains 在 entitlements 里有,但 profile 没包含。
4. Widget target 用错 Team 或 Bundle ID。
5. build number 没递增,上传失败。
6. dSYM 没保存,线上 crash 无法符号化。

---

## 九、检查清单

- [ ] Bundle ID 是否和线上一致
- [ ] Team 是否正确
- [ ] Distribution certificate 是否有私钥
- [ ] profile 是否匹配 App Store / Ad Hoc / Enterprise 场景
- [ ] entitlements 是否和后台 capabilities 一致
- [ ] extension target 是否逐个检查
- [ ] build number 是否递增
- [ ] dSYM 是否归档并上传
- [ ] CI 是否能在干净机器签名

---

## 十、心智模型

```text
账号决定 Team
Bundle ID 决定 App
证书 + 私钥决定能不能签
Profile 决定能签什么能力和分发方式
Archive 是发布前的正式产物
```

下一篇 07 讲签名资产备份、迁移、丢失与泄漏应急。
