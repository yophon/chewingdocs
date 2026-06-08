# App 从代码到用户手机的全过程

App 上线不是 `build` 一下就结束。真正的链路从代码开始,到用户设备完成安装和更新才算结束。

一句话先记住:**移动端发布 = 编译、打包、签名、上传、审核、分发、安装、监控的一条生产链路。**

---

## 一、完整链路

```text
源码
  -> 依赖恢复
  -> 编译
  -> 资源处理
  -> 打包
  -> 签名
  -> 符号表 / mapping 归档
  -> 上传商店 / 渠道
  -> 审核
  -> 灰度 / 分阶段发布
  -> 用户下载
  -> 安装 / 覆盖更新
  -> 崩溃和性能监控
```

每一步都可能独立出事故。

---

## 二、Android 这条链

```text
Kotlin / Java / Dart
  -> class / dex
  -> resource table
  -> manifest merge
  -> APK / AAB
  -> signing
  -> zipalign / optimize
  -> Play / 国内渠道 / 官网
```

Android 的核心约束:

- `applicationId` 决定应用身份
- release 签名决定能不能覆盖更新
- `versionCode` 必须递增
- target SDK 会被商店政策约束
- 多渠道分发会放大签名和版本管理复杂度

---

## 三、iOS 这条链

```text
Swift / Objective-C / Dart
  -> Mach-O binary
  -> .app bundle
  -> entitlements
  -> code signing
  -> .xcarchive
  -> IPA / App Store upload
  -> TestFlight / App Store
```

iOS 的核心约束:

- Bundle ID 决定应用身份
- Team ID 决定归属
- certificate + private key 决定本机能不能签
- Provisioning Profile 决定能签哪个 App、用哪些能力、发到哪里
- build number 必须递增

---

## 四、Debug、Profile、Release

| 模式 | 用途 | 特点 |
| --- | --- | --- |
| Debug | 开发调试 | 慢、体积大、有调试能力 |
| Profile | 性能测试 | 接近 release,保留 profiling 能力 |
| Release | 发布 | 优化、混淆、签名、体积最小 |

发布前必须测 release。很多问题只在 release 出现:

- R8 / ProGuard 混淆导致反射崩溃
- 资源压缩误删
- iOS entitlements 不匹配
- release 签名下三方 SDK 校验失败
- debug 环境变量没切到 production

---

## 五、符号表和 mapping

发布产物要配套保存:

| 平台 | 文件 | 用途 |
| --- | --- | --- |
| Android | mapping.txt | 混淆后还原 Java / Kotlin 堆栈 |
| Android | native symbols | 还原 NDK / so 崩溃 |
| iOS | dSYM | 还原 crash 堆栈 |
| Flutter | split debug info | 还原 Dart 堆栈 |

没有这些文件,线上崩溃只能看到乱码堆栈。

发布流程里要把它们上传到 Sentry、Firebase Crashlytics、Bugly 或内部平台。

---

## 六、商店和渠道不是同一回事

```text
App Store       iOS 主分发入口
TestFlight      iOS 内测入口
Google Play     Android 国际主渠道
国内应用市场     华为 / 小米 / OPPO / vivo / 荣耀 / 应用宝等
官网 APK         自有分发
企业分发         公司内部分发
```

渠道越多,越需要统一:

- 版本号规则
- 签名资产
- 渠道包生成
- 上架材料
- 回滚和下架流程
- 渠道后台账号权限

---

## 七、安装和覆盖更新

覆盖更新需要同时满足:

```text
同一个应用身份
签名兼容
版本号更高
安装来源允许
```

Android:

```text
applicationId 相同 + 签名兼容 + versionCode 更高
```

iOS:

```text
Bundle ID 相同 + 同一 App 记录 + build 更高
```

不要以为"文件名一样"就是同一个 App。移动端认的是包身份和签名。

---

## 八、什么时候会出事故

典型事故:

1. debug 包测完直接发版,release 包崩溃。
2. Android keystore 换了,老用户无法覆盖升级。
3. iOS profile 没包含 Push / Associated Domains,线上能力失效。
4. versionCode / build number 没递增,商店拒收。
5. mapping / dSYM 没上传,线上 crash 无法定位。
6. 国内渠道包混用,用户装到了错误渠道版本。
7. CI 和本地打包环境不一致,同一 commit 产物不同。

---

## 九、检查清单

- [ ] 是否明确 debug / profile / release 用途
- [ ] release 包是否真机跑过核心流程
- [ ] Android applicationId 是否最终确定
- [ ] iOS Bundle ID 是否最终确定
- [ ] versionCode / build number 是否递增
- [ ] release 签名材料是否可恢复
- [ ] mapping / dSYM / native symbols 是否归档
- [ ] 商店和渠道账号是否明确负责人
- [ ] 上架后是否能看到 crash 和性能数据

---

## 十、心智模型

```text
代码只是输入
签名决定身份
商店决定分发
版本号决定升级
符号表决定排障
监控决定上线后能不能维护
```

下一篇 03 讲包名、Bundle ID、版本号与构建号。
