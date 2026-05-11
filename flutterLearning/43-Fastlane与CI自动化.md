# Flutter Fastlane 与 CI/CD 自动化

19 简单提过 fastlane / GitHub Actions。这一篇是"打包发布"的工程化扩展:从 git push 到上架,全自动。

---

## 一、CI/CD 的目标

```
开发者 push          → CI 触发
        ↓
跑 lint / test       → 不过就停
        ↓
构建 Android + iOS   → 签名 / 混淆 / symbols
        ↓
上传 Firebase / TestFlight / Play Internal
        ↓
通知群:测试包 + 二维码 + changelog
        ↓
人工验证 → 一键灰度 / 发布生产
```

每一步全部脚本化,**没人手工开 Xcode**。

---

## 二、Fastlane 是什么

Ruby 写的一套"上架自动化工具",iOS / Android 都覆盖:
- iOS:打包、签名管理(match)、证书 / Profile 自动化、上传 TestFlight / App Store、提交审核
- Android:打包、上传 Play Console、灰度发布

```bash
# 安装
brew install fastlane              # macOS
gem install fastlane               # 任何
# 或在项目里 Bundler 锁版本(推荐)
echo "source 'https://rubygems.org'\ngem 'fastlane'" > Gemfile
bundle install
```

每端独立目录:

```
ios/fastlane/
  Fastfile
  Appfile
  Matchfile
android/fastlane/
  Fastfile
  Appfile
```

---

## 三、iOS Fastlane

### 1. 初始化

```bash
cd ios && bundle exec fastlane init
```

按提示填 Apple ID。生成:

```
ios/fastlane/Appfile
ios/fastlane/Fastfile
```

### 2. 证书 / Profile 自动化:match

`match` 把证书 / profile 加密存到 git 私库,团队共享。

```bash
cd ios && bundle exec fastlane match init
# 选 git,填私库地址
```

`Matchfile`:

```ruby
git_url("git@github.com:yourorg/certs.git")
storage_mode("git")
type("appstore")
app_identifier(["com.example.myapp"])
username("you@example.com")
```

```bash
bundle exec fastlane match appstore           # 拉证书 + 安装
bundle exec fastlane match development
bundle exec fastlane match adhoc
```

**最大好处**:新员工 `match appstore` 一句,环境就配好了。CI 同样用 `match` 拉证书。

### 3. Fastfile 一例

```ruby
default_platform(:ios)

platform :ios do

  before_all do
    setup_ci if ENV['CI']                         # CI 模式自动配 keychain
  end

  desc "拉证书"
  lane :certs do
    match(type: "appstore", readonly: true)
  end

  desc "构建并上传 TestFlight"
  lane :beta do
    match(type: "appstore", readonly: true)

    sh("flutter build ipa --release --export-options-plist=#{Dir.pwd}/ExportOptions.plist")

    upload_to_testflight(
      ipa: "../build/ios/ipa/Runner.ipa",
      skip_waiting_for_build_processing: true,
      changelog: ENV['CHANGELOG'] || "Bugfixes",
    )

    slack(message: "iOS beta 已上传 ✅", channel: "#release") if ENV['SLACK_URL']
  end

  desc "上架 App Store"
  lane :release do
    match(type: "appstore", readonly: true)
    sh("flutter build ipa --release")

    upload_to_app_store(
      ipa: "../build/ios/ipa/Runner.ipa",
      submit_for_review: true,
      automatic_release: true,
      force: true,
      skip_metadata: false,
      skip_screenshots: true,
      precheck_include_in_app_purchases: false,
      submission_information: { add_id_info_uses_idfa: false },
    )
  end
end
```

跑:

```bash
cd ios && bundle exec fastlane beta
cd ios && bundle exec fastlane release
```

### 4. 元数据自动化

App Store 文案 / 截图也能脚本化:

```
ios/fastlane/metadata/
  zh-Hans/
    description.txt
    keywords.txt
    promotional_text.txt
  en-US/
    ...
ios/fastlane/screenshots/
  zh-Hans/
    iPhone67/01_home.png
    iPhone67/02_detail.png
  en-US/
    ...
```

```bash
bundle exec fastlane deliver           # 上传文案 + 截图
bundle exec fastlane snapshot          # 自动跑 UI 测试生成截图
```

---

## 四、Android Fastlane

### 1. 初始化

```bash
cd android && bundle exec fastlane init
```

### 2. 上传 Play Console

需要服务账号 JSON(Play Console → API access → 创建服务账号 → 下载 key.json):

```ruby
default_platform(:android)

platform :android do
  desc "构建 AAB"
  lane :build do
    sh("flutter build appbundle --release")
  end

  desc "上传到内部测试"
  lane :internal do
    build
    upload_to_play_store(
      json_key: "play-key.json",
      aab: "../build/app/outputs/bundle/release/app-release.aab",
      track: "internal",
      release_status: "draft",
      skip_upload_apk: true,
    )
  end

  desc "上架生产 灰度 10%"
  lane :rollout do
    build
    upload_to_play_store(
      json_key: "play-key.json",
      aab: "../build/app/outputs/bundle/release/app-release.aab",
      track: "production",
      rollout: "0.1",
      skip_upload_apk: true,
    )
  end
end
```

```bash
cd android && bundle exec fastlane internal
cd android && bundle exec fastlane rollout
```

---

## 五、GitHub Actions 串起来

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

env:
  FLUTTER_VERSION: '3.24.0'
  RUBY_VERSION: '3.2'

jobs:
  ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: ${{ env.FLUTTER_VERSION }}
          cache: true

      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: ${{ env.RUBY_VERSION }}
          bundler-cache: true
          working-directory: ios

      - name: 准备 SSH(给 match 拉证书私库)
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.MATCH_SSH_PRIVATE_KEY }}

      - run: flutter pub get

      - run: flutter analyze
      - run: flutter test

      - name: Fastlane beta
        working-directory: ios
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          APP_STORE_CONNECT_API_KEY_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          APP_STORE_CONNECT_API_KEY_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          APP_STORE_CONNECT_API_KEY_KEY: ${{ secrets.ASC_KEY }}
          CHANGELOG: ${{ github.event.head_commit.message }}
        run: bundle exec fastlane beta

  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: ${{ env.FLUTTER_VERSION }}
          cache: true

      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: ${{ env.RUBY_VERSION }}
          bundler-cache: true
          working-directory: android

      - name: 准备签名
        env:
          KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          KEY_PROPS: ${{ secrets.KEY_PROPERTIES }}
          PLAY_KEY: ${{ secrets.PLAY_JSON_KEY }}
        run: |
          echo "$KEYSTORE_BASE64" | base64 -d > android/upload-keystore.jks
          echo "$KEY_PROPS" > android/key.properties
          echo "$PLAY_KEY" > android/play-key.json

      - run: flutter pub get
      - run: flutter test

      - name: Fastlane internal
        working-directory: android
        run: bundle exec fastlane internal
```

要点:
- `secrets` 里放敏感数据(keystore base64、密码、ASC API Key)
- ASC API Key 比 Apple ID + 密码更安全,**首选**
- 缓存 Flutter SDK 加速
- `tags: v*` 才触发,避免每次 push 都打包

---

## 六、Codemagic 替代方案

不愿意维护 yaml 的小团队,**Codemagic** 几乎零配置:

- UI 上传证书 / keystore / Play API key
- UI 选择 trigger(push / tag / 定时)
- 一键开 TestFlight / Play 上传
- 免费 500 分钟/月

`codemagic.yaml`(可选,定制):

```yaml
workflows:
  release:
    name: Release
    instance_type: mac_mini_m2
    environment:
      flutter: stable
      vars:
        APP_STORE_CONNECT_KEY_ID: $ASC_KEY_ID
        APP_STORE_CONNECT_ISSUER_ID: $ASC_ISSUER_ID
        APP_STORE_CONNECT_PRIVATE_KEY: $ASC_PRIVATE_KEY
    triggering:
      events: [tag]
    scripts:
      - flutter pub get
      - flutter test
      - flutter build ipa --release
    artifacts:
      - build/ios/ipa/*.ipa
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
```

适合**不想管 CI 的团队**,缺点是定制空间小、底层不可控。

---

## 七、Bitrise

类似 Codemagic,UI 拼步骤,生态成熟。中大团队也常用。

---

## 八、自托管 GitHub Runner

Mac mini 跑 iOS 构建,省 macos GitHub 时间费(macOS runner 是 Linux 的 10 倍贵)。

```bash
# 在自家 Mac 上
mkdir actions-runner && cd actions-runner
curl -O -L https://github.com/actions/runner/releases/download/v2.x/actions-runner-osx-x64-2.x.tar.gz
tar xzf actions-runner-osx-x64-*.tar.gz
./config.sh --url https://github.com/yourorg/yourrepo --token XXX
./run.sh
```

`runs-on: [self-hosted, macOS]`。

---

## 九、版本号自动化

每次发版手动改 pubspec 的版本号烦,自动化:

```ruby
# Fastfile
lane :bump do
  yaml = YAML.load_file('../../pubspec.yaml')
  cur = yaml['version']
  parts = cur.split('+')
  new_build = parts[1].to_i + 1
  new_ver = "#{parts[0]}+#{new_build}"
  sh("sed -i '' 's/^version: .*/version: #{new_ver}/' ../../pubspec.yaml")
end
```

或用 git tag 推算:

```bash
# 当前 tag = v1.2.3,build_number = git rev-list --count HEAD
flutter build apk --release \
  --build-name=$(git describe --tags --abbrev=0 | sed 's/v//') \
  --build-number=$(git rev-list --count HEAD)
```

CI 里做:

```yaml
- run: |
    BUILD_NUM=$(git rev-list --count HEAD)
    BUILD_NAME=$(git describe --tags --abbrev=0 | sed 's/v//')
    flutter build appbundle --release \
      --build-name=$BUILD_NAME \
      --build-number=$BUILD_NUM
```

---

## 十、Changelog 自动化

`git_log` plugin 抽 commit:

```ruby
lane :changelog do
  notes = changelog_from_git_commits(
    pretty: "- %s",
    merge_commit_filtering: 'exclude_merges',
  )
  sh("echo '#{notes}' > CHANGELOG.md")
end
```

或用 [conventional commits](https://www.conventionalcommits.org/) + `standard-version` / `git-cliff`(Rust 写的速度快):

```bash
cargo install git-cliff
git cliff --tag v1.2.3 -o CHANGELOG.md
```

提交规范化:

```
feat: 新增 ...
fix: 修复 ...
chore: ...
```

CI 自动生成 release notes 给 TestFlight / Play 内测描述。

---

## 十一、上架后自动化:崩溃符号上传

混淆后崩溃日志看不懂(回顾 19),symbol 上传必须自动化:

### Crashlytics

```yaml
- run: |
    flutter build apk --release --obfuscate --split-debug-info=symbols
    firebase crashlytics:symbols:upload --app=$APP_ID symbols
```

### Sentry

```yaml
- run: |
    flutter build apk --release --obfuscate --split-debug-info=symbols
    sentry-cli upload-dif symbols
```

iOS 同理(`build/ios/symbols`)。

---

## 十二、灰度发布脚本化

### Play Console 分阶段

```ruby
lane :rollout_5 do
  upload_to_play_store(track: 'production', rollout: '0.05', ...)
end

lane :rollout_50 do
  upload_to_play_store(track: 'production', rollout: '0.5', ...)
end

lane :rollout_100 do
  upload_to_play_store(track: 'production', rollout: '1.0', ...)
end
```

工作流:`v1.2.0` 推 → 5% → 观察一天 → 50% → 观察 → 100%。出问题 `halt_rollout`。

### App Store Phased Release

```ruby
upload_to_app_store(
  phased_release: true,
  ...
)
```

---

## 十三、自动化测试集成

每次 PR / push:

```yaml
- run: flutter analyze
- run: flutter test --coverage
- run: dart format --set-exit-if-changed .
- run: flutter test integration_test/    # 真机 / 模拟器
```

集成测试在云真机:**Firebase Test Lab**(Android)/ **AWS Device Farm** / **BrowserStack**。

```bash
gcloud firebase test android run \
  --type instrumentation \
  --app build/app/outputs/apk/debug/app-debug.apk \
  --test build/app/outputs/apk/androidTest/debug/app-debug-androidTest.apk \
  --device model=Pixel6,version=33,locale=en
```

---

## 十四、Slack / 企业微信通知

```ruby
slack(
  message: "🚀 #{lane_context[SharedValues::LANE_NAME]} 完成",
  channel: "#mobile-release",
  default_payloads: [:lane, :test_result, :git_branch, :git_author],
  attachment_properties: {
    fields: [
      {title: 'Build', value: ENV['BUILD_NUMBER']},
    ],
  },
)
```

或 webhook 直接 curl:

```ruby
sh("curl -X POST -H 'Content-Type: application/json' -d '{\"text\":\"上传成功\"}' #{ENV['WEBHOOK_URL']}")
```

---

## 十五、本地开发也用 Fastlane

```ruby
lane :dev do
  sh("flutter run --flavor dev")
end

lane :clean do
  sh("flutter clean && cd ios && pod install")
end
```

把繁杂命令封装成 `fastlane dev`,新人入职 5 分钟跑起项目。

---

## 十六、密钥管理

**绝不能进 git** 的:
- iOS:`.p12`、`provisioning profile`、`AuthKey_xxx.p8`
- Android:`keystore.jks`、`key.properties`、`play-key.json`
- Firebase:`google-services.json` 看情况(里面包含 API key)

存哪:
- 团队:1Password / Bitwarden / AWS Secrets Manager
- CI:GitHub Secrets / Codemagic Environment Variables
- 单人:本地 + iCloud 加密备份

iOS 用 fastlane match,**所有人共享 git 私库 + 单一密码**,最优雅。

---

## 十七、典型工作流

### 个人项目 / 小团队

```
git push origin main
   ↓
GitHub Actions 跑 lint + test
   ↓
git tag v1.2.3 && git push --tags
   ↓
Actions 自动:build + Fastlane TestFlight + Play Internal + Slack 通知
   ↓
内测同事装包,反馈
   ↓
没问题 → fastlane rollout(灰度)
```

### 中大团队

```
PR 进 main 必须过:lint / test / 集成测 / size check
   ↓
develop 合到 release/v1.2 分支(release branch flow)
   ↓
release 分支推 → 自动 internal 包
   ↓
QA 跑测试用例
   ↓
release/v1.2 合到 main + tag → 自动上架灰度
   ↓
监控 crashlytics 崩溃率,降阈值则 halt rollout
```

---

## 十八、心智模型

```
CI/CD 解决三类问题
  ├─ 重复劳动     (打包 / 上传 / 通知)
  ├─ 人为失误     (忘改版本号 / 错传 keystore)
  └─ 沟通成本     (changelog 自动 / 群通知自动)

工具组合
  签名管理: fastlane match
  打包上传: fastlane(beta / release / rollout)
  CI:     GitHub Actions / Codemagic / 自托管 Mac
  通知:    slack / 企微 webhook
  灰度:    Play / App Store 分阶段 + Remote Config(回顾 39)
  监控:    Crashlytics / Sentry(回顾 36 / 39)

判断 CI 做得好不好的标准
  ✅ 新人 30 分钟内能在自家电脑跑 fastlane beta
  ✅ 发版只需要 push 一个 tag
  ✅ 凌晨 12 点崩溃率告警自动停灰度
  ✅ 没人手动开 Xcode / Play Console 上传
```

**一句话**:Flutter 项目从能跑到能持续发版,**fastlane + GitHub Actions 是中小团队的最优解**。配置一次,享受无数次。

---

## 十九、和已学知识的串联

- 19 打包发布:本篇是 19 的"自动化"延伸
- 36 错误处理:Sentry / Crashlytics 符号自动上传
- 39 Firebase:FCM、Crashlytics、Remote Config 全部能 fastlane plugin 操作
- 38 Web / 桌面:Web 用 Cloudflare Pages / Vercel,Desktop macOS 用 notarytool
- 40 实战:三类项目都依赖这套 CI 才能持续发版
- 17 国际化:metadata 文案多语言自动同步
- 11 DI:不同 flavor(dev / staging / prod)注入不同实现,fastlane 用 `--flavor` 切

至此,前 43 篇覆盖:**语言 → 框架 → 工程 → 实战 → 自动化**全链路。下一步靠真实项目把这些知识落地。
