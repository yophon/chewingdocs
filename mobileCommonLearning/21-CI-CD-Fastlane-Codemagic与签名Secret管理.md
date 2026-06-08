# CI/CD、Fastlane、Codemagic 与签名 Secret 管理

移动端 CI/CD 的难点不只是自动打包,而是把签名、证书、版本号、渠道、测试和上传都做成可重复流程。

一句话:**移动端发版不要依赖某台开发机。**

---

## 一、移动端 CI/CD 要解决什么

目标:

```text
同一份代码能稳定构建
构建环境可复现
签名材料可控
版本号自动递增
测试和检查自动运行
产物可追溯
上传商店可自动化
```

如果只有某个人电脑能打 release 包,项目就是高风险状态。

---

## 二、常见工具

| 工具 | 适合场景 |
| --- | --- |
| GitHub Actions | 通用 CI、开源和轻量团队 |
| GitLab CI | 自建代码仓库和企业流水线 |
| Fastlane | iOS / Android 打包、签名、上传自动化 |
| Codemagic | Flutter / 移动端云构建 |
| Bitrise | 移动端云 CI |
| Jenkins | 自建复杂流水线 |

工具不是重点。重点是流程能复现、密钥能治理、产物能追踪。

---

## 三、一条基础流水线

最小流水线:

```text
拉代码
安装依赖
静态检查
单元测试
生成版本号
注入环境配置
解密签名材料
构建 release 包
上传符号表
上传测试平台 / 商店
归档产物和日志
```

不要跳过:

```text
release 构建检查
符号表归档
签名信息验证
产物 hash 记录
```

CI 产物要能回答"这个包从哪次提交构建出来"。

---

## 四、签名 Secret 怎么放

不要把这些提交到仓库:

```text
Android keystore
keystore 密码
key alias 密码
iOS p12
p12 密码
Provisioning Profile
App Store Connect API Key
Google Play service account json
```

常见做法:

```text
CI Secret 保存密码和 API key
签名文件加密后保存到安全存储
构建时临时解密
构建结束清理工作目录
限制 Secret 访问分支和人员
```

Secret 名称也不要暴露太多业务细节。

---

## 五、Android CI 签名

Android 通常需要:

```text
keystore 文件
store password
key alias
key password
signingConfig
```

构建后要检查:

```text
applicationId 是否正确
versionCode 是否递增
是否 release 签名
是否 minify / shrink 配置符合预期
AAB / APK 是否能安装或上传
签名证书指纹是否符合渠道后台配置
```

国内渠道包还要确认渠道标识没有串。

---

## 六、iOS CI 签名

iOS 通常需要:

```text
p12 证书和密码
Provisioning Profile
Bundle ID
Team ID
exportOptions.plist
App Store Connect API Key
```

构建后要检查:

```text
Bundle ID 是否正确
build number 是否递增
Archive 是否成功
export method 是否正确
entitlements 是否符合能力配置
dSYM 是否归档并上传
```

iOS CI 的核心是让临时 keychain、证书导入、profile 安装都自动化。

---

## 七、版本号策略

推荐规则:

```text
用户可见版本:语义化或产品版本
构建号:CI 自动递增
提交信息:写入产物元信息
渠道:写入构建元信息
```

示例:

```text
versionName / CFBundleShortVersionString = 2.3.0
versionCode / CFBundleVersion = CI build number
git sha = abc1234
channel = appstore / googleplay / huawei
```

不要手改构建号。手工改最容易冲突。

---

## 八、Fastlane 的位置

Fastlane 适合把本地和 CI 的移动端命令统一:

```text
build_android
upload_google_play
build_ios
upload_testflight
upload_symbols
increment_build_number
```

好的 lane 应该:

```text
参数明确
环境隔离
失败立即停止
输出产物路径
不在日志打印 secret
```

Fastlane 不是必须,但它能减少"本地一套、CI 一套"。

---

## 九、什么时候会出事故

常见事故:

```text
开发机能打包,CI 打不出来
CI 日志打印了 keystore 密码
临时分支也能读取生产签名
版本号没递增导致商店拒收
dSYM / mapping 没上传,线上崩溃不可读
国内渠道包 applicationId 正确但渠道号串了
测试环境配置被打进生产包
CI 缓存导致依赖版本漂移
```

CI/CD 事故本质是发布流程不可重复、资产权限不清晰。

---

## 十、检查清单

- [ ] release 包是否能在干净 CI 环境构建
- [ ] 签名文件是否没有提交到仓库
- [ ] Secret 是否限制访问人员和分支
- [ ] CI 日志是否不打印密码、token、证书内容
- [ ] 构建号是否自动递增
- [ ] 产物是否记录 git sha、版本、渠道
- [ ] mapping / dSYM 是否自动上传
- [ ] 构建结束是否清理临时签名材料
- [ ] App Store / Google Play API key 是否有最小权限
- [ ] 生产签名是否不能被任意分支使用

---

## 十一、结论

移动端 CI/CD 最小目标:

```text
任何授权的人
在干净环境
用同一条流水线
构建出可追溯的 release 包
并且不泄漏签名资产
```

能做到这件事,发版风险会下降一个量级。
