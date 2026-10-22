# 能力扩展包:浏览器、Computer Use、LSP 与 SSH

dsh 仓库里有一批"让 agent 多长一只手"的能力:操作浏览器、操作桌面、按语义跳转代码、把文件和进程搬到远程机器上。它们和 22 篇的 MCP、24 篇的外部子代理一样,都是在不改主循环的前提下扩展 agent 能碰到的世界。但和那些不同,这批能力**大多不在任何发布的 bundle 里**,要你自己装包、自己写 patch 组装,而且每个都带着明确的平台限制。

这一篇不逐个讲参数,而是回答三个问题:哪些开箱就有、哪些要手动组装、组装之前要先确认哪些限制。

> 一句话先记住:**先分清三档**。Web 默认就有的:附件、交付物、Office 预览;装了但默认关的:语音输入、思考过程翻译(还有 26 篇的 Git 工作树);要自己装包、写 patch 的:浏览器、Computer Use、LSP、SSH。语音、翻译、浏览器、Computer Use 都是实验性的;LSP、SSH 不在 experimental 目录下,但同样不在任何发布的组合里。组装前先查平台。

---

## 一、总表

| 能力 | 主要包 | 状态 | 平台 | 关键限制 |
| --- | --- | --- | --- | --- |
| 浏览器 | `dsh-browser-use` + 三选一 provider | 实验性,需手动组装 | 只支持 Chromium | 一个进程只能挂一个 provider;登录状态不随会话恢复 |
| Computer Use | `dsh-computer-use` + Cua Driver provider | 实验性,需手动组装 | 以上游 Cua Driver 为准;`cua-macos` 要求 macOS 14+,Windows 开发中 | 多个会话共享同一个桌面;取消撤不回已发出的输入 |
| LSP | `dsh-lsp` + `dsh-lsp-stdio` + `dsh-tool-lsp` | 需手动组装 | 取决于你配置的语言服务器 | 服务器被完全信任,不进沙箱 |
| SSH | `dsh-ssh` + `fs-ssh` / `subprocess-ssh` / `sandbox-ssh` | 需手动组装,headless 或自定义 profile | 两端都必须是 Linux 或 macOS | 不支持 Windows,不自动重连;Web 工作区界面不认远程路径 |
| 交付物 | `dsh-tool-present`、`dsh-workspace-changes` | Web 默认开启 | — | 变更摘要只在会话存活期间留在 Host |
| 附件 | `dsh-attachment-local` | base 默认开启 | — | 内容寻址存储在 `$DSH_HOME/attachments/v1` |
| Office 转 PDF | `dsh-office-to-pdf` | Web 默认开启 | 依赖预编译引擎 | 只在 Host 上转换,只用于预览,没有模型工具 |
| 语音输入 | `dsh-experimental-voice-input-bundle` | 实验性,随安装附带,默认关闭 | 本地 CPU 推理 | 首次使用要下载模型 |
| 思考过程翻译 | `dsh-experimental-cot-translation-bundle` | 实验性,随安装附带,默认关闭 | — | 思考内容会发给 Bing / Google 等外部服务 |

表里的包名都省略了 `@deepseek-ai/` 前缀。所有实验性条目在升级前都要对照你版本的包 README 再核对一遍。

---

## 二、手动组装的通用步骤

这四类能力的组装方式相同,和 20 篇讲的插件分发是同一套机制:

1. **装包**:`dsh plugin --profile <name> add <包…>`。profile **不会自动装 peer**,所以服务包和 provider 包要一起装
2. **挂载**:装包不等于挂载。这些包没有声明自己的 bundle 层,需要你在 profile 的 `cordis.patch.yml` 或 `--patch` 文件里用 `- insert:` 加行
3. **检查**:`dsh --profile <name> --dump-config` 看组合结果,未匹配的 patch 目标会打在 stderr
4. **重启**:改完重启 profile 再试。headless、sdk、acp 模板的 patch 只在启动时读取;Web 虽然会热重载 patch,新装包之后重启一次最稳妥

```bash
dsh plugin --profile web add @deepseek-ai/dsh-browser-use @deepseek-ai/dsh-experimental-browser-use-playwright-mcp
dsh --profile web --dump-config | less
```

放在哪一层也要想清楚:顶层 `- insert:` 是给整个组合加;只想让某个 Web agent preset 拥有这个能力,就把行放进那个 preset 的插件列表(preset 的配置方式见 04、20 篇)。包 README 里的最小配置大多是按自定义 profile 写的,挂进 Web 之前先 `--dump-config` 确认依赖的服务都在。

浏览器和 Computer Use 的 provider 在文档里明确是"已发布的实验性 npm 包,需要显式激活"。LSP 和 SSH 的文档只描述了在自定义组合里怎么挂,本篇核对了包名,没有核对它们在 npm 上的发布状态。

---

## 三、浏览器

### 3.1 三个 provider,只能选一个

| provider | 包 | 做法 |
| --- | --- | --- |
| Playwright MCP | `dsh-experimental-browser-use-playwright-mcp` | Playwright 的浏览器控制 MCP 工具 |
| Chrome DevTools MCP | `dsh-experimental-browser-use-chrome-devtools-mcp` | DevTools 级别的检查和控制 |
| Stagehand | `dsh-experimental-browser-use-stagehand-native` | 原生浏览器操作 + AI 辅助的 act / observe / extract |

`dsh-browser-use` 本身只做一件事:**占住唯一的 provider 位置**。挂第二个 provider(哪怕是同一个包的另一个实例)会激活失败。它不提供任何统一的浏览器操作接口,工具 schema、渲染、图片支持都由 provider 自己定,而且**工具 schema 跟着上游依赖走,没有 DSH 的稳定性承诺**。

```yaml
- insert:
    - id: browser-use
      name: '@deepseek-ai/dsh-browser-use'
    - id: browser-provider
      name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
      config:
        mode: launch
        headless: true
```

`mode: attach` 加 `endpoint` 可以连到一个已有浏览器(HTTP(S) 调试地址或 WS(S) 端点),此时沿用它现有的标签页和登录状态。

### 3.2 一个会话一个浏览器

- **launch 模式**:浏览器属于启动它的那个会话,跨 turn 复用;会话运行时销毁时关闭。**重新加载或 fork 会话会得到全新的浏览器,登录状态不从会话日志恢复**
- **attach 模式**:外部浏览器同一时间只给一个会话用,其他会话会被拒绝;清理时只断开连接,浏览器继续运行。这种独占只在同一个 provider 实例内有效,别的进程和你自己仍然能改同一个页面
- **只支持 Chromium**,Firefox 和 WebKit 不可选
- **provider 加载时不接管已经活着的会话**,要在创建或恢复会话之前挂好
- MCP 连接启动失败会让会话创建或恢复失败;断开后不重试,要新建会话或卸载后重新恢复
- **取消撤不回已经发给浏览器的点击和跳转**

### 3.3 Stagehand 的额外代价

Stagehand 的 AI 辅助操作用的是**它自己单独配置的原生模型**,不走 DSH 的模型路由。固定的 SDK 只接受 OpenAI、Anthropic、Google、Groq、Cerebras 目录里的模型,**不支持 DeepSeek 端点和 `baseURL` 覆盖**;即使只做导航,`model` 也是必填的。这意味着页面内容会发给另一家模型服务,用量也不进 DSH 的会话统计。

---

## 四、Computer Use

### 4.1 provider

| provider | 包 | 运行方式 |
| --- | --- | --- |
| Cua Driver MCP | `dsh-experimental-computer-use-cua-driver-mcp` | 通过 MCP 连接你已经装好的 `cua-driver` 可执行文件 |
| Cua Driver native | `dsh-experimental-computer-use-cua-driver-native` | 随 npm 依赖安装的原生运行时,跑在 DSH Host 进程里 |
| macOS 原生 | `dsh-experimental-cua-macos` | Swift helper 直接调 macOS 框架,只能从源码组装 |

和浏览器一样,`dsh-computer-use` 只占一个 provider 位置。MCP 版的最小配置:

```yaml
- insert:
    - id: computer-use
      name: '@deepseek-ai/dsh-computer-use'
    - id: computer-provider
      name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp'
      config:
        command: cua-driver
        args: [mcp]
```

截图要进模型,还需要附件存储和一条声明了图片输入的模型路由。

### 4.2 平台与权限

- **桌面权限归启动 DSH 的那个应用**:native provider 不安装权限应用、不改系统授权;MCP provider 把安装和权限交给 Cua Driver 自己
- native 运行时和 Host 共享进程,**原生崩溃会带走整个 Host**。想让 Cua Driver 独立承担权限和执行,用 MCP 版
- `cua-macos` **要求 macOS 14 及以上**,需要辅助功能和屏幕录制两项权限;**Windows 支持还在开发中**,发布的 profile 都不挂它。它的后台输入依赖私有的 SkyLight 符号,系统更新可能让它失效,每个目标系统版本都要验证

### 4.3 共享桌面

**一个注册的 provider 不会为某个会话预留桌面**。多个会话、多个 DSH 进程、你自己的鼠标键盘都在操作同一个桌面,"观察—操作—验证"的完整流程要调用方自己协调,同一时间只跑一个 computer use 任务。工具返回成功只代表输入已发出,不代表应用真的按预期响应了,要重新观察再继续。

---

## 五、LSP:按语义跳转代码

模型面只有一个 `lsp` 工具,四种操作:`goToDefinition`、`findReferences`、`goToImplementation`、`hover`,参数是 `file_path`、`line`、`character`(从 1 开始)。工具自己的提示会让模型平时优先用搜索和读文件,文本匹配有歧义或改动前需要精确定位时才用 LSP。

```yaml
- insert:
    - id: lsp
      name: '@deepseek-ai/dsh-lsp'
    - id: lsp-stdio
      name: '@deepseek-ai/dsh-lsp-stdio'
      config:
        servers:
          typescript:
            command: typescript-language-server
            args: ['--stdio']
            extensionToLanguage:
              '.ts': typescript
    - id: tool-lsp
      name: '@deepseek-ai/dsh-tool-lsp'
```

行为要点:

- 语言服务器**懒启动**,每个工作区一个进程常驻复用;每次查询都从 `ctx.fs` 读当前内容、打开、查询、关闭,不保留文档状态
- 工作区根是会话当前目录;切目录影响后续查询,不改已经启动的服务器的根
- 没有 provider 处理某个扩展名时返回 `LSP_UNAVAILABLE`,schema 不变
- `servers` 里任何一项可执行文件解析失败,**所有** provider 都注册不上

安全边界写得很直白:**provider 完全信任你配置的服务器,不加任何沙箱**,服务器拿到的是当前执行环境的完整文件和进程权限。它会拒绝工作区之外的查询源文件,但结果位置可以指向外面。传给服务器的环境变量会先清洗,名字里带 `KEY`、`PASSWORD`、`SECRET`、`TOKEN` 的以及所有 `DSH_*` 都不转发。

---

## 六、SSH:把文件和进程搬到远程

### 6.1 它是什么

SSH 包族让**文件系统、普通进程、终端和沙箱执行都发生在一台 POSIX 远程主机上**,而 harness 本身、模型请求和会话存储留在本机。它实现的是现有的 `ctx.fs`、`ctx.subprocess`、`ctx.sandbox` 接口,**不增加任何 SSH 专用的模型工具**:模型照常用 bash、文件工具、LSP、PTC,只是它们背后的世界换成了远程机器。

| 包 | 作用 |
| --- | --- |
| `dsh-ssh` | 连接、helper 身份校验、传输生命周期(`ctx.ssh`) |
| `dsh-fs-ssh` | 远程文件读取和受保护的原子写入 |
| `dsh-subprocess-ssh` | 可执行文件查找、进程、控制流、终端 |
| `dsh-sandbox-ssh` | 远程端的文件效果约束 |

### 6.2 前提和限制

- **两端都必须是 Linux 或 macOS**,不支持 Windows 端点
- 本地 `ssh` 要支持连接复用和 Unix socket 转发,服务器要允许转发;主机别名、凭证、known_hosts 要事先配好。它开启 `BatchMode`、严格校验主机密钥、关闭 agent 转发,**没有交互式认证**
- 远程要预先装好 helper(可执行文件归档,或 helper 脚本加对应的 Node),并配置 `helperHash` 做摘要校验;helper 要放在工作区和可写临时目录之外
- **不自动部署、不重连、不重放**:SSH 断开会让挂起的操作失效,客户端如实报告"结果未确认",不会为了重放一个可能已经执行过的动作而重连
- **Web 工作区界面仍假设能直接访问 Host 文件系统**,只替换 provider 并不能让它认识远程路径。官方建议用 headless 或自己的组合

配置字段的核心是 `host`(已有的 OpenSSH 别名)、`launch`、`helper`、`workspace`、`helperHash`,其余是超时和帧大小上限,完整列表见包 README。

---

## 七、Web 默认就有的三样

### 7.1 交付物

- **`present` 工具**:模型用它声明"这几个文件是最终交付物",包括用 shell 生成的文件。它只记录路径和可选描述,不复制内容,用户在界面里用默认应用打开源文件。Web 的 `standard`、`cordis`、`ptc` 三个 preset 都挂了它
- **turn 变更摘要**:`dsh-workspace-changes` 在每个顶层 turn 开始和结束时给工作区拍 git 快照,再加上文件工具编辑前后的整文件副本,算出改了哪些文件、各加删多少行,并提供每个文件的前后对比。会话日志里只记一条 `workspace/changes` 事件,**摘要和对比内容留在 Host 上,会话销毁后就没了**。没有 git 仓库时只列文件工具的编辑

### 7.2 附件

图片和通用文件不进会话日志正文。Host 接受一条用户消息时,先把图片持久化到 `$DSH_HOME/attachments/v1`,再追加事件;事件里只有内容寻址的引用和元数据,没有 base64、临时路径或 URL。附件 id 目前是 `sha256:<摘要>` 的形式,但文档明确要求消费方不要解析它。备份或迁移会话时,这个目录要一起带走(17 篇)。

### 7.3 Office 转 PDF

Web 侧栏预览 `doc`、`docx`、`xls`、`xlsx`、`ppt`、`pptx` 时,Host 用 LibreOffice 引擎转成 PDF 再显示。它**只在 Node Host 上转换**,浏览器里没有转换引擎;**没有模型工具,不写会话事件**,源文件和 PDF 都不进会话存储。引擎来自预编译的 `@deepseek-ai/libreoffice-kit`,它**不会去找系统里装的 LibreOffice,也不会在运行时下载引擎**。缺字体时预览会提示。

---

## 八、默认关闭的两个界面增强

两者都在插件页的官方分组里,打开开关即可,发布的 profile 默认关闭:

- **语音输入**:麦克风按钮在模型选择器和发送键之间,录完插入到输入框草稿,不会自动发送。识别用本地的 SenseVoice 模型在 Host CPU 上跑,**首次使用要下载模型**(INT8 权重约 239 MB,FP32 约 938 MB),默认从 Hugging Face 或 HF-Mirror 获取并校验 SHA-256。原生包覆盖 macOS arm64 / x64、Linux glibc arm64 / x64、Windows x64。识别本身不写会话事件
- **思考过程翻译**:展开思考内容时把它翻译成界面语言。默认用 Bing,可选 Google,另有付费的 `deepseek-flash` 路由。**被翻译的思考内容会发给所选服务,可能包含私有代码和对话细节**,Bing 和 Google 的匿名端点也不保证可用性和额度。原文不变,翻译结果存在会话里复用

对照 06 篇的隐私清单,翻译这一项属于"开了才外发"的类型,团队环境里要单独评估。

---

## 九、和 Claude Code 对照

| | Claude Code | dsh |
| --- | --- | --- |
| 浏览器 | Claude in Chrome 扩展,共享你浏览器的登录状态;需要 claude.ai 账号登录 | 三选一的实验性 provider,手动组装;launch 模式不带登录状态,attach 模式可沿用 |
| 支持的浏览器 | Chrome、Edge 和多种 Chromium 内核浏览器 | 只支持 Chromium |
| Computer Use | 研究预览,CLI 只支持 macOS,Desktop 支持 macOS 和 Windows | Cua Driver MCP / native 以上游为准;`cua-macos` 要求 macOS 14+,Windows 开发中 |
| 开启方式 | 装 Chrome 扩展;computer use 在内置 server 列表里点 Enable | 装包 + 写 patch |
| 代码语义导航 | 装代码智能(LSP)插件,内置 `LSP` 工具生效 | `dsh-tool-lsp` + 自配语言服务器 |
| 不在本机执行 | 云端会话,整个会话跑在托管环境里 | SSH 包族只把文件和进程换到远程,harness 和会话存储留在本机 |

整体差异和前几篇一致:**Claude Code 把这些做成了开关,dsh 把它们做成了零件**。零件的好处是能换、能看懂、能自己接;代价是平台适配、权限和安全边界都要自己确认。

---

## 踩坑

1. **以为装了包就能用**——装包不等于挂载,还要写 `- insert:` patch;peer 不会自动装,服务包和 provider 包要一起加
2. **同时挂两个浏览器 provider 想对比效果**——一个进程只有一个 provider 位置,第二个直接激活失败
3. **在 Firefox 或 Safari 上用浏览器能力**——只支持 Chromium
4. **会话恢复后发现网站要重新登录**——launch 模式的浏览器状态不随会话保存。需要沿用登录状态就用 attach 模式连一个专用的浏览器 profile
5. **用 Stagehand 却以为页面只发给 DeepSeek**——它的 AI 操作走单独配置的 OpenAI / Anthropic 等模型,不支持 DeepSeek 端点
6. **两个会话同时跑 computer use**——它们共享一个桌面,provider 不做互斥。一次只跑一个,或在外部协调
7. **在 Windows 上找 `cua-macos`**——只有 macOS 14+ 的实现,Windows 支持还在开发
8. **把 LSP 服务器当成沙箱里的工具**——它被完全信任,拿到执行环境的完整权限。只配置你信任的服务器可执行文件
9. **在 Web 界面里用 SSH 组合**——Web 工作区界面仍假设本地文件系统。用 headless 或自定义组合,并且两端都得是 Linux / macOS
10. **打开思考过程翻译后忘了评估数据外发**——被翻译的思考内容会发给 Bing / Google 等服务,团队环境先按 06 篇的思路过一遍

## 源码与文档索引

- `docs/subsystems/browser-use.md`、`packages/browser-use/browser-use/README.md`
- `packages/experimental/browser-use-playwright-mcp/README.md`、`packages/experimental/browser-use-chrome-devtools-mcp/README.md`、`packages/experimental/browser-use-stagehand-native/README.md`
- `docs/subsystems/computer-use.md`、`packages/experimental/computer-use-cua-driver-mcp/README.md`、`packages/experimental/computer-use-cua-driver-native/README.md`、`packages/experimental/cua-macos/README.md`
- `docs/subsystems/lsp.md`、`packages/lsp/lsp-stdio/README.md`、`packages/lsp/tool-lsp/README.md`
- `docs/subsystems/ssh.md`、`packages/ssh/README.md`、`packages/ssh/ssh/README.md`
- `docs/subsystems/deliverables.md`、`packages/deliverables/tool-present/README.md`、`packages/deliverables/workspace-changes/README.md`
- `docs/subsystems/attachment.md`
- `docs/subsystems/office-to-pdf.md`、`packages/document/office-to-pdf/README.md`
- `docs/subsystems/voice-input.md`、`packages/experimental/voice-input-bundle/README.md`、`packages/experimental/speech-to-text-sensevoice/README.md`
- `docs/subsystems/translation.md`、`packages/experimental/cot-translation-bundle/README.md`
- `packages/bundle/base/cordis.patch.yml`、`packages/bundle/web-app/cordis.patch.yml`、`apps/cli/package.json`

---

下一篇:`30-Harness选型.md`,进入第五层「选型与落地」,把 dsh 放回 harness 全景里,和 Claude Code 以及其他开源 harness 比较该在什么场景下选谁。
