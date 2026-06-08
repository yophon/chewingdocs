# Android keystore、AAB、APK 与签名轮换

Android 发布最怕两件事:签名丢了,签名泄漏了。

一句话先记住:**Android 更新链路强依赖签名兼容,release keystore 是生产资产,不是本地配置文件。**

---

## 一、APK 和 AAB

| 产物 | 说明 |
| --- | --- |
| APK | 可直接安装,官网和部分渠道常用 |
| AAB | Android App Bundle,上传 Google Play 后由商店生成 APK |

AAB 的好处:

- 按设备拆分 ABI、语言、屏幕密度
- 用户下载更小
- Play Console 发布主流路径

但国内渠道和官网分发仍然经常需要 APK。

---

## 二、签名类型

Android 有多代签名方案:

| Scheme | 说明 |
| --- | --- |
| v1 | JAR signing,老系统兼容 |
| v2 | APK 全文件签名,Android 7+ |
| v3 | 支持签名轮换 lineage,Android 9+ |
| v4 | 增量安装相关 |

现代 release 包通常会同时包含多个 scheme,由构建工具处理。

你不需要手写这些,但要知道:**签名轮换依赖 v3 lineage,不是换个 keystore 直接发。**

---

## 三、Google Play App Signing

Google Play 有两类 key:

```text
App signing key   真正给用户安装包签名,Google 托管
Upload key        你上传 AAB 时使用,可重置
```

如果丢的是 upload key:

```text
可以走 Play Console 重置上传密钥
不影响用户更新
```

如果自己管理 app signing key 且丢失:

```text
无法从证书 / APK 还原私钥
通常无法无缝更新
```

新项目优先使用 Play App Signing。

---

## 四、国内渠道的现实

国内没有统一托管兜底。

常见渠道:

```text
华为
小米
OPPO
vivo
荣耀
应用宝
百度
360
官网 APK
```

每个渠道对签名变更的流程、材料、人工审核都不同。不要等 keystore 丢了才去问客服。

至少提前记录:

- 应用名
- 包名
- 当前线上版本
- 原签名 MD5 / SHA1 / SHA256
- 新签名 MD5 / SHA1 / SHA256
- 软著 / 营业执照 / 授权材料
- 各渠道后台账号和负责人

---

## 五、签名轮换

签名泄漏但旧签名仍在手里时,可以评估 signing lineage:

```text
旧签名 -> 授权新签名
新包带完整签名历史
系统识别新旧签名连续
```

风险:

- Android 9+ 才开始支持 v3 轮换
- 老系统不一定识别
- 厂商 ROM 和国内渠道需要实测
- 三方 SDK 对签名指纹的校验可能不认 lineage

如果旧签名已经丢失,就无法生成 lineage。

---

## 六、三方平台同步

换签名或轮换后,检查:

- 微信开放平台
- 支付宝开放平台
- Firebase / Google Sign-In
- 华为 AGC
- 厂商推送
- 地图 SDK
- 广告归因
- App Links `assetlinks.json`

很多平台绑定证书指纹。签名变了,登录、支付、深链可能全部失效。

---

## 七、官网 APK

官网 APK 风险更高:

- 没有商店托管
- 用户可能从旧链接下载
- CDN / 下载页可能被替换
- 签名泄漏后攻击者可伪造同包名更新包

官网分发必须做:

- HTTPS
- 文件 hash
- 下载包签名校验说明
- 版本号校验
- 后端拦截异常版本 / 异常签名指纹

---

## 八、什么时候会出事故

1. keystore 只在一个人电脑上。
2. 密码写在聊天记录里。
3. 换签名后国内渠道拒绝覆盖。
4. 签名泄漏后攻击者伪造升级包。
5. App Links 没更新 SHA-256 指纹。
6. 轮换签名只测 Android 13,没测 Android 8 用户。

---

## 九、检查清单

- [ ] 是否使用 Play App Signing
- [ ] upload key 是否可重置
- [ ] release keystore 是否至少两份加密备份
- [ ] 签名指纹是否记录
- [ ] 国内渠道是否有签名变更材料
- [ ] 三方平台是否盘点签名依赖
- [ ] 官网 APK 是否有 hash 和异常版本拦截
- [ ] 签名轮换是否覆盖旧系统和渠道实测

---

## 十、心智模型

```text
Play App Signing 让 Google 托管发布签名
国内渠道需要你自己治理签名资产
签名轮换不是换文件,是签名历史链
签名变更会牵动所有依赖指纹的平台
```

下一篇 06 讲 iOS 证书、私钥、Provisioning Profile 与 Archive。
