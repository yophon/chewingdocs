# DeepSeek Harness 总览与心智

Claude Code 系列讲的是怎么把一个闭源 harness 用到顶:权限、hooks、skills、子代理、SDK,都是在一个固定的主循环外面加配置。DeepSeek Harness(下文简称 `dsh`)走的是另一条路。它是 DeepSeek 在 2026 年 8 月公开的开源 agent harness,MIT 协议,**主循环本身也是一个插件,可以换掉**。仓库还把每个子系统的设计都写成了文档。

这一篇先建立整体心智:dsh 由什么组成、有哪些使用形态、和 Claude Code 的关系、现在成熟到什么程度,以及这个系列怎么读。

> 一句话先记住:**dsh 没有可以打补丁的"内核"。模型适配器、工具注册表、会话日志,连 agent loop 本身都是插件;你用到的每一项能力,都对应 profile 里的一行配置。**

---

## 一、dsh 是什么

| 项目 | 现状(2026 年 10 月) |
| --- | --- |
| 全名 / 命令 | DeepSeek Harness / `dsh` |
| 仓库 | `deepseek-ai/deepseek-harness`,MIT 协议 |
| 本系列基线 | `0.2.1-rc.2`(2026-10-17,commit `687f282e8`) |
| 状态 | developer preview,README 原话 "THERE WILL BE COMPATIBILITY-BREAKING CHANGES" |
| 运行时 | Node.js 22.19+ 或 24+,TypeScript monorepo,pnpm 管理 |
| 插件框架 | Cordis,以 `@deepseek-ai/cordis` 的名字 vendored 在 `vendor/cordis`,带本地修改 |
| 默认模型 | `deepseek-flash`(DeepSeek-V4.1-Flash)和 `deepseek-v4-pro`(DeepSeek-V4-Pro),上下文 1M |

README 对自己的定位只有一句:**everything-is-a-plugin architecture, powered by Cordis**,中文 README 写作"一切皆插件"。网上流传的 "Agent = Model + Harness" 出自第三方文章,仓库里没有这个说法,本系列不使用它。

Cordis 是一个独立的开源插件框架,README 引用了它的设计论文 *A Programming Paradigm for Spatiotemporal Composability*。它的来龙去脉和用法放在 09、10 篇。

---

## 二、"一切皆插件"到底是什么意思

### 2.1 没有特权内核

`docs/architecture.md` 开头就把话说死了:产品的每个部分都是插件,包括模型适配器、工具注册表、会话日志和 agent loop 本身,所以每一个都能从配置里替换;**没有需要打补丁的特权内核**,扩展 dsh 的方式就是在其他插件旁边再挂一个插件,插件卸载时它注册的东西会自动回收。

这和 Claude Code 的心智差别很大:

| | Claude Code | dsh |
| --- | --- | --- |
| 主循环 | 产品内置,不可替换 | `@deepseek-ai/dsh-agent-loop` 插件,可替换(见 12 篇) |
| 扩展点 | settings、hooks、skills、插件、MCP,挂在固定循环外 | 服务、事件、可回收的注册,任何部件都能换 |
| 改行为的方式 | 改配置文件、写 hook | 加 / 换 / 禁用插件树里的一行 |

### 2.2 运行中的 dsh 是一棵插件树

你启动的不是一个"程序",而是一棵在启动时按层组装出来的插件树:

```text
空的根
  ← profile 依次列出的 bundle(比如 dsh-base、dsh-web-app)
  ← profile 自己的 cordis.patch.yml
  ← $DSH_HOME/cordis.patch.yml(本机级,所有 profile 共享)
  ← 命令行 --patch 叠加文件
```

- **bundle**:一包 Cordis 配置行和它们挂载的代码,比如 `dsh-base` 提供模型适配器、工具、持久化、沙箱与审批策略、设置、凭证、遥测
- **profile**:一个有名字的组合,住在 `$DSH_HOME/profiles/<name>`,列出它叠哪些 bundle,再加上你自己的 patch
- **patch**:按行 id 整体替换某一行的配置,或者插入新行

想看自己机器上启动的到底是哪棵树:

```bash
dsh --profile web --dump-config
```

打印出来的每一行,都可以被你自己的 patch 替换。层的叠加规则和失败策略见 11 篇;profile 的日常用法见 02 篇。

### 2.3 核心骨架与 `ctx.*` 服务

插件之间不直接 import 彼此的实现,而是通过 Cordis 的 `ctx` 上的服务通信。核心骨架只有几个包:

| 包 | 负责 | `ctx` 服务 | 细讲 |
| --- | --- | --- | --- |
| `core/session` | 仅追加的 `SessionEvent` 日志和内存存储 | `ctx.sessions` | 17 篇 |
| `core/system-prompt` | system prompt 分段和工具 schema 组装 | `ctx.systemPrompt` | 16 篇 |
| `core/tools` | 分作用域的工具注册表和受保护的执行管线 | `ctx.tools` | 13 篇 |
| `core/agent` | `Agent` 接口、存活 agent 注册表、`agent/*` 事件 | `ctx.agents` | 12 篇 |
| `core/agent-loop` | 实现上述接口的默认驱动 | `ctx.agentLoop` | 12 篇 |
| `llm/llm` | 消息与流的词汇表,以及适配器接缝 | `ctx.llm` | 15 篇 |

外围还有一圈能力服务:`ctx.shell`、`ctx.fs`、`ctx.sandbox`、`ctx.credentials`、`ctx.commands`、`ctx.jobs`、`ctx.goals` 等。仓库把这种"服务定义 + 实现 + 使用方"三件套叫做 **seam**:比如 `dsh-shell` 定义 shell 服务,`dsh-bash-local` / `dsh-bash-sandbox` 提供实现,`dsh-tool-bash` 把它包装成模型能调的 `bash` 工具。换掉实现,所有用它的地方一起变。

### 2.4 turn、step 与三类事件

两个词贯穿整个系列:

- **step**:一次模型请求,加上这次回复里调用的工具
- **turn**:零个或多个 step,从拿到输入开始,到模型和工具都停下为止

事件是扩展点,分三类:

| 类别 | 例子 | 用途 |
| --- | --- | --- |
| 会话事件 | `user/message`、`tool/call`、`turn/end` | 写进日志的持久事实,重启后还在 |
| agent 事件 | `agent/pre-step`、`agent/request` | 观察或拦截正在进行的工作 |
| 能力事件 | `fs/*`、`tools/*`、`telemetry/*` | 给某个能力挂策略,不用 import 主循环 |

用户层(01–08 篇)只需要知道有这三类;怎么监听、怎么拦截在 10、12、13 篇。

---

## 三、使用形态

同一套插件树,通过不同的 profile 变成不同的产品形态:

| 形态 | 入口 | 适合 | 细讲 |
| --- | --- | --- | --- |
| Web UI | `dsh web`,默认 `http://127.0.0.1:3080` | 日常交互的主界面 | 02 篇 |
| Desktop | Electron 应用,macOS 和 Windows | 不想装 Node、要原生窗口 | 02 篇 |
| headless | `dsh headless "任务"` | 脚本、CI,一次性任务 | 27 篇 |
| SDK | Python `deepseek-harness-sdk`,TypeScript `@deepseek-ai/dsh-sdk-client`,走 `sdk` / `sdk-minimal` profile | 嵌进自己的程序 | 27 篇 |
| ACP | `dsh --profile acp` | 编辑器、自动化客户端接入 | 27 篇 |

注意两点:

1. **官方发行版没有自带终端 TUI**。文档里出现的 `dsh --profile tui` 只是"用 `dsh plugin` 装一个第三方插件当 profile"的示例。习惯了 Claude Code 终端交互的读者,在 dsh 里的主战场是 Web UI 或 Desktop
2. 所有形态共用 `$DSH_HOME`(默认 `~/.dsh`)里的会话、凭证和设置,目录结构见 02 篇

---

## 四、和 Claude Code、Codex CLI 的位置

### 4.1 粗略对照

| 维度 | Claude Code | dsh |
| --- | --- | --- |
| 源码 | 闭源 | MIT 开源,子系统文档齐全 |
| 主循环 | 固定 | 插件,可整体替换 |
| 模型 | 围绕 Claude 设计 | DeepSeek 原生适配器 + pi-ai 目录里的几十家提供商 + 自定义 OpenAI / Anthropic 兼容网关(03 篇) |
| 主界面 | 终端、IDE 扩展等 | Web UI、Desktop |
| 互相调用 | — | 可选 bundle 把 Claude Code、Codex 当子代理调用(24 篇) |

Codex CLI 同样是开源的 coding agent。dsh 文档里没有系统的横向对比,三者以及 OpenCode 等其他开源 harness 的选型放在 30 篇,那一篇会另做调研,不只依赖 dsh 自己的说法。

### 4.2 互操作:能复用多少 Claude Code 的东西

| 你已有的 | dsh 里的对应 | 状态 |
| --- | --- | --- |
| `CLAUDE.md` / `AGENTS.md` | `dsh-agent-instructions` 加载适用的指令文件链,渲染预算 65,536 字节 | 默认开启,见 07 篇 |
| Claude Code 的 command hooks | `@deepseek-ai/dsh-hooks-claude-code` 读取现有 `hooks.json` 或 settings | experimental,见 23 篇 |
| Claude Code mods | `claude-code-mods` 把 mod 当插件跑 | experimental,见 23 篇 |
| 把 Claude Code / Codex 本身当工人 | `@deepseek-ai/dsh-subagent-claude-code`、`@deepseek-ai/dsh-subagent-codex` | 可选 bundle,见 24 篇 |
| Skills | `SKILL.md` 发现路径包括共享的 `~/.agents/skills` | 见 22 篇 |

"experimental" 在 dsh 里有明确含义:`packages/experimental/` 下的包整体都在评估中,行为和 API 可能变,也可能被撤回。用之前对照你的版本重新核对。

---

## 五、成熟度与风险

### 5.1 它明确说自己不安全、不稳定

- **README**:developer preview,一定会有破坏兼容性的变更
- **SAFETY.md**:没有经过安全审计,不能当作安全或可用于生产的软件;沙箱、审批弹窗和权限控制能降低风险,但**不保证隔离**;不要把它当作不受信任工作负载的唯一安全控制
- SAFETY.md 给的建议:最小权限运行;优先用一次性虚拟机、容器或专用环境;备份它能碰到的文件;运行前审查插件、配置和命令

### 5.2 变化有多快

光是 0.2.1 这一个小版本,`docs/upgrade-guide/` 下就有 34 份升级指南:`v0.2.1-alpha.1` 22 份、`alpha.2` 10 份、`alpha.3` 和 `alpha.4` 各 1 份。其中不乏影响默认行为的变更,比如 `alpha.2` 之后的版本把"存储的 key 优先于环境变量"改成了默认(03 篇)。注意升级指南目录名是变更**之前**的版本:`v0.2.1-alpha.2/` 下记录的是从 alpha.2 升到下一个版本时的变化。

实际含义:

- 本系列的命令、配置字段、默认值都标了仓库路径,**升级后按路径逐条核对**
- 团队使用要锁版本,升级前读对应版本的升级指南(31 篇)
- 包的公开 API 仍是 pre-stable

### 5.3 默认开着的几件事

这几项不读文档很容易忽略,开工前至少知道它们存在:

| 默认行为 | 一句话 | 细讲 |
| --- | --- | --- |
| 会话日志上传 | base bundle 默认把完整会话日志以 `dsh_session_log` 字段增量发给 `deepseek-official` 路由,可能包含工作目录、提示词、工具参数和结果 | 06 篇 |
| OTel 反馈上传 | 默认 `FEEDBACK_ONLY`,你主动给反馈时上传会话前缀 | 06 篇 |
| 权限预设 | 新会话默认 `workspace-write`:写操作限制在工作区和临时目录,**读和网络不限制** | 05 篇 |

关会话日志上传的入口是 Web 的 **设置 → 通用设置 → 在使用官方模型 API 时上传 Session Log**(英文界面 Settings → General → Upload Session Log),或者把对应行的 `enabled` 设成 `false`;`DSH_TELEMETRY_*` 环境变量管不到它。

### 5.4 插件就是代码

dsh 的扩展性来自"插件可以做任何事",风险也来自这里:插件、预设里的 YAML 都能在宿主进程里执行代码;MCP server 是沙箱之外的可执行程序,所以默认一个都不启用。装第三方插件前,把它当作要在你机器上运行的程序来审查。

---

## 六、怎么读这个系列

```text
用 dsh → 读懂 dsh 内核 → 扩展 dsh → 多 Agent 与无人值守 → 选型与落地
```

| 层 | 篇目 | 回答的问题 |
| --- | --- | --- |
| 用 dsh | 01–08 | 装好、配好、安全地用起来 |
| 读懂内核 | 09–17 | 一个 harness 由哪些部件组成、怎么拼起来 |
| 扩展 dsh | 18–23 | 加工具、接模型、做分发、从 Claude Code 迁移 |
| 多 Agent 与无人值守 | 24–29 | 子代理、workflow、定时任务、嵌进别的系统 |
| 选型与落地 | 30–31 | 该不该用、团队里怎么用 |

建议的读法:

- **只想用起来**:01–04 顺读,**05、06 必读**(权限和数据外发),07、08 按需
- **想看懂一个真实 harness 的内部**:读完 01–02 直接跳 09,第二层是本系列的重心
- **要写插件**:第二层至少读 09、11、13,再进第三层
- **要在团队或服务器上部署**:05、06、11、27、28、31

和 Claude Code 系列的分工:概念不重复,只做对照;从 Claude Code 迁移的具体问题集中在 23 篇。

---

## 踩坑

1. **把 dsh 当成"开源版 Claude Code"**——它的主界面是 Web / Desktop,没有官方终端 TUI;它的卖点是整棵插件树可替换,而不是复刻某个产品的交互
2. **引用 "Agent = Model + Harness" 当官方定位**——仓库里没有这句话,官方说法是 everything-is-a-plugin, powered by Cordis
3. **照着网上旧教程敲命令**——0.2.1 一个小版本就有 34 份升级指南,以你安装版本的 `docs/` 和包 README 为准
4. **默认配置下直接打开重要仓库**——SAFETY.md 明说没有安全审计;先放进一次性环境,读完 05 篇再决定权限
5. **以为不用 DeepSeek 官方 API 就没有数据外发**——会话日志上传挂在 `deepseek-official` 路由上,经网关转发的请求也算;遥测还有独立的 OTel 通道。逐项看 06 篇
6. **以为 `workspace-write` 等于"只能碰工作区"**——它只限制写,读和网络默认不受限
7. **把 experimental 包用进生产流程**——hooks 桥、mods 桥、agent team、worktree、webhook 都在 `packages/experimental/`,随时可能变或撤回
8. **随手装来路不明的插件**——插件和预设 YAML 都在宿主进程里执行代码,预设也不是安全沙箱

---

## 源码与文档索引

- `README.md` / `README.zh.md`
- `SAFETY.md`
- `docs/architecture.md`
- `docs/glossary.md`
- `packages/README.md`
- `packages/experimental/README.md`
- `apps/cli/README.md`
- `apps/cli/reference/README.md`
- `docs/upgrade-guide/`
- `vendor/README.md`

---

下一篇:`02-安装-入口与Profile.md`,讲 npx、源码、Python wheel 和 Desktop 四种安装方式,`dsh` 启动器的语法,web / headless / sdk / sdk-minimal / acp 五个 profile,以及 `$DSH_HOME` 的目录布局。
