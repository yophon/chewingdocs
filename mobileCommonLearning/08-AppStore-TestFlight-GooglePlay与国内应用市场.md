# App Store、TestFlight、Google Play 与国内应用市场

移动端分发不是一个按钮。不同商店和渠道的规则、审核、灰度、账号权限都不一样。

一句话先记住:**商店是分发入口,渠道是运营现实;移动端发版必须按渠道治理。**

---

## 一、几个入口

| 入口 | 作用 |
| --- | --- |
| App Store | iOS 正式分发 |
| TestFlight | iOS 内测 / 外测 |
| Google Play | Android 国际主渠道 |
| Google Play Internal / Closed / Open testing | Android 测试轨道 |
| 国内应用市场 | 华为、小米、OPPO、vivo、荣耀、应用宝等 |
| 官网 APK | 自有 Android 分发 |
| 企业分发 | 公司内部安装 |

每个入口都要单独管理账号、权限、材料、版本和发布记录。

---

## 二、App Store

App Store 关注:

- Bundle ID
- 版本号和 build
- 隐私信息
- 权限用途
- 截图和描述
- 内购 / 订阅合规
- Sign in with Apple 要求
- 审核问题回复

正式包通常流程:

```text
Archive
  -> Upload to App Store Connect
  -> TestFlight 验证
  -> 填写版本信息
  -> Submit for Review
  -> Approved
  -> Manual / Automatic release
```

上架前必须用 TestFlight 真机跑核心流程。

---

## 三、TestFlight

TestFlight 适合:

- 内部 QA
- 外部小规模测试
- 审核前验证
- 回归 release 包行为

注意:

- TestFlight 包接近正式环境,但仍不是 App Store 正式分发。
- 外部测试也可能需要审核。
- build 有有效期。
- 推送、IAP、登录等要按沙盒 / 生产边界测试。

不要把 debug 包给测试人员长期使用。测试发布链路就要测 TestFlight。

---

## 四、Google Play

Google Play 常见轨道:

```text
Internal testing
Closed testing
Open testing
Production
```

现代新项目通常:

```text
AAB
Play App Signing
Internal testing
staged rollout
```

注意:

- 版本号 `versionCode` 必须递增。
- target SDK 会受政策约束。
- 权限、数据安全、广告 ID 等材料要填。
- 生产发布可以分阶段扩大比例。

---

## 五、国内应用市场

国内渠道的特点:

- 渠道多
- 审核口径不完全一致
- 签名变更需要人工处理
- 软件著作权、ICP备案、隐私政策、权限说明经常被要求
- 厂商推送、联运、加固、广告 SDK 可能引入额外审核点

常见渠道:

```text
华为 AppGallery
小米应用商店
OPPO 软件商店
vivo 应用商店
荣耀应用市场
应用宝
百度手机助手
360 手机助手
```

国内项目必须有渠道台账。

---

## 六、渠道台账

至少记录:

```text
渠道名
后台地址
账号归属
负责人
应用 ID / 包名
当前线上版本
签名指纹
审核材料
上次发版时间
特殊规则
客服 / 工单入口
```

没有台账,离职或事故时会直接失控。

---

## 七、官网 APK

官网 APK 适合:

- 国内无 Play 环境
- 企业客户下载
- 灰度内测
- 特定渠道需求

但风险高:

- 用户可能安装旧包
- 下载链接可能被替换
- 没有商店审核兜底
- 签名泄漏后伪造包风险更大

官网 APK 必须配:

- HTTPS
- 文件 hash
- 版本号展示
- 下载来源提示
- 后端异常版本拦截

---

## 八、什么时候会出事故

1. App Store 审核过了,但 TestFlight 没测核心支付流程。
2. Google Play target SDK 不达标,临近截止才发现。
3. 国内某渠道拒审,但没人知道账号在哪。
4. 官网 APK CDN 被旧版本缓存。
5. 同一版本不同渠道包行为不一致。
6. 渠道上传了错包,用户覆盖到错误环境。

---

## 九、检查清单

- [ ] App Store Connect 账号和权限是否清楚
- [ ] Play Console 账号和权限是否清楚
- [ ] 国内渠道后台是否有台账
- [ ] 每个渠道当前版本是否记录
- [ ] 是否统一使用 release 包测试
- [ ] 官网 APK 是否有 hash 和可信来源说明
- [ ] 审核材料是否集中维护
- [ ] 渠道特殊规则是否记录

---

## 十、心智模型

```text
App Store 管 iOS 正式分发
TestFlight 管 iOS 测试分发
Google Play 管 Android 国际分发和签名托管
国内渠道需要逐个治理
官网 APK 是自担风险的分发
```

下一篇 09 讲灰度发布、分阶段发布与回滚策略。
