# Harness 选型:dsh、Claude Code 与其他开源 harness

前 29 篇把 dsh 从安装一路用到多 Agent 和无人值守,中间还拆开了 Cordis、主循环、工具管线和会话日志。本站的 Claude Code 系列走的是另一条路:把一个闭源、成熟的 harness 用到顶。这一篇把两者放回同一张地图,再加上 2026 年讨论最多的三个开源 harness——OpenAI Codex CLI、OpenCode 和 Pi,按开放程度、扩展模型、安全模型、多 Agent、无人值守、数据默认值、互操作和成熟度逐项对比,最后给出选型建议和组合用法。

dsh 的事实以仓库 commit `687f282e8`(`0.2.1-rc.2`)为准,Claude Code 以本站 Claude Code 系列为准,其他三家来自各自的官方文档和仓库,访问时间 2026-10(见文末外部资料)。dsh 仓库里**没有**和其他 harness 的对照文档,所以下面所有比较都是本篇自己核对的。这几家都在快速迭代,**表里的每一格只代表这个时间点**。

> 一句话先记住:**选 harness 先问"你要用它,还是要改它"**。只想每天把活干完,成熟度和默认安全性最重要;想研究、改造或编排 agent,开放程度和扩展层级才是关键。dsh 的长处在后者,短板在前者。

---

## 一、五个对象

| Harness | 一句话定位 | 许可 | 状态(2026-10) |
| --- | --- | --- | --- |
| **dsh** | DeepSeek 开源的 agent harness,"everything-is-a-plugin",连主循环都是插件 | MIT | developer preview,`0.2.1-rc.2`;仓库里 20 个 release tag 全部带 alpha / rc 后缀 |
| **Claude Code** | Anthropic 的 harness,终端、IDE、桌面、云端背后是同一个内核 | 闭源商业产品 | 成熟产品,本站基线 2.1.30x;部分功能仍是研究预览或实验性 |
| **Codex CLI** | OpenAI 的终端 coding agent,主体在仓库的 `codex-rs` 目录(Rust) | Apache-2.0 | 活跃迭代,npm / Homebrew / 安装脚本分发 |
| **OpenCode** | 开源 coding agent,主打模型无关,TUI 之外还有 `serve`、`web`、`acp` 等形态 | MIT | 活跃迭代,官方文档 2026-10-20 仍在更新 |
| **Pi** | 刻意极简的 harness,核心很小,功能靠 TypeScript 扩展长出来 | MIT | Pi 1.0,版权署名 Earendil Inc. & Contributors |

GitHub star 数各来源互相矛盾,本篇不引用,也不建议拿它做选型依据。

---

## 二、开放程度与模型绑定

| | 源码 | 能改到哪一层 | 模型 |
| --- | --- | --- | --- |
| **dsh** | 全部开源,子系统、持久化变更都有文档 | 模型适配、工具注册、会话存储、主循环都能通过配置替换 | DeepSeek 原生适配(Anthropic 兼容的 Messages API);第三方走 pi-ai 目录;Custom model API 支持 OpenAI Chat Completions / Responses / Anthropic Messages 三种协议 |
| **Claude Code** | 闭源 | 只能在扩展点上加东西 | Claude 系列,经 Anthropic API、Bedrock / Google Cloud / Foundry 或组织网关 |
| **Codex CLI** | 开源,可 fork | 扩展走 hooks、MCP、skills、plugins;本篇没查到替换主循环的接缝 | OpenAI 为主;`model_providers` 接自定义提供方,`--oss` 接 Ollama / LM Studio,另有内置 `amazon-bedrock` provider |
| **OpenCode** | 开源,可 fork | 插件可以加工具、拦截工具调用 | 基于 AI SDK 和 Models.dev,文档称 75+ 提供方,含本地模型,DeepSeek 有单独章节 |
| **Pi** | 开源,可 fork | 扩展可以加工具、命令、事件处理和 TUI 部件 | 官网列出 15+ 提供方(Anthropic、OpenAI、Google、Bedrock、Ollama、OpenRouter 等) |

两点值得单独说:

- **"模型无关"不等于"每个模型都一样好用"**。dsh 对 DeepSeek 的支持是一等的:原生适配器把 DeepSeek 的缓存命中指标映射进用量统计,上下文按保住 KV cache 前缀的纪律组织(16 篇)。第三方模型能用,但拿不到这些专门优化
- **dsh 和 Pi 共享了一层**。dsh 的第三方模型目录来自 `@earendil-works/pi-ai`(`packages/llm/llm-pi-ai/package.json` 里是 `^1.1.0`,仓库 `patches/` 下还带一个本地补丁),也就是 Pi monorepo 里的模型访问层。两个项目在模型接入这一层走的是同一个库

---

## 三、扩展模型:插件挂在哪一层

| | 扩展单位 | 运行位置 | 能碰到什么 |
| --- | --- | --- | --- |
| **dsh** | Cordis 插件(服务、事件、可回收的副作用),用 bundle 打包 | 与 Host 同进程 | 一切:`ctx.llm` 上的适配器、`ctx.tools` 上的工具、会话存储,以及 `ctx.agentLoop` 这个默认驱动本身 |
| **Claude Code** | CLAUDE.md、skills、hooks、MCP、subagents,用 plugins 打包;mods 改界面和行为 | command hook 和本地 MCP server 是独立进程;mods 以你的权限运行 | 都挂在固定的主循环周围 |
| **Codex CLI** | hooks(`hooks.json` 或 `config.toml`)、MCP、skills、plugins、自定义 agent(TOML) | hooks 是外部命令 | 生命周期节点;项目级 hooks 只在项目受信任时加载 |
| **OpenCode** | JS / TS 插件,本地目录或 npm 包 | 同进程 | 事件订阅、`tool.execute.before` / `after`、自定义工具(可覆盖同名内置工具)、替换压缩 prompt;文档没有描述替换主循环 |
| **Pi** | TypeScript 扩展,packages 打包扩展、skills、prompt 和主题 | 同进程 | 工具、命令、快捷键、事件、TUI;核心只保留最小功能 |

### 3.1 "主循环可替换"到底意味着什么

dsh 的 `docs/architecture.md` 写得很直接:模型适配器、工具注册表、会话日志和 agent loop 本身都是插件,"there is no privileged core to patch"。12 篇讲过 AgentFactory 这个接缝:默认的 `@deepseek-ai/dsh-agent-loop` 只是通过 `ctx.agents.setFactory()` 注册进来的一个实现,换一个驱动,其余的工具管线、会话日志、审批照样能用。

这带来两件事:

- **好处**:研究"不同的循环策略对结果有什么影响"时,只换一个插件,其余部件不动。这在闭源的 Claude Code 里做不到,在其他开源 harness 里通常要改源码
- **代价**:同进程插件和 Host 同权。Plugin Manager 的 README 明说"installed Host code executes in-process outside the workspace sandbox",app-boot 的兼容性检查也写明"These checks are not a sandbox against malicious package code"。OpenCode 和 Pi 的同进程插件同理,Claude Code 的 mods 也一样"以你的权限运行"

> 扩展层级越深,装一个第三方插件的信任成本越高。**能换主循环的插件,也能读你的凭证文件**。

---

## 四、安全模型

| | 文件写边界 | 读与网络默认 | 审批 | 平台后端 |
| --- | --- | --- | --- | --- |
| **dsh** | `read-only` / `workspace-write` / `danger-full-access`,新会话默认 `workspace-write` | **读和网络都不限制**;`web_fetch` 只拒绝非公网目标 | `ask` / `never`,`never` 是自动拒绝;预设 read-only、workspace-write、danger-full-access,另有实验性 Auto review | Linux bwrap / Landlock,macOS Seatbelt,Windows ACL 受限令牌(报告 `partial`) |
| **Claude Code** | Bash 沙箱默认关;开启后写限于工作目录等 | 开启后网络走本机代理,允许列表初始为空;读默认大部分放行 | 六种权限模式,auto mode 用分类器审查,allow / ask / deny 规则 | macOS / Linux / WSL2;原生 Windows 不经沙箱 |
| **Codex CLI** | 同名三档;版本控制目录默认 `workspace-write` + `on-request`,其他目录 `read-only` | `workspace-write` 下网络默认关 | `on-request` / `never` / granular,可选 `auto_review` 审阅者 | macOS Seatbelt,Linux bwrap + seccomp,Windows 有原生实现,WSL2 用 Linux 实现 |
| **OpenCode** | 权限文档只描述应用层规则,没有提到 OS 沙箱 | 大多数工具默认 `allow`,`.env` 默认拒读 | `allow` / `ask` / `deny`,可按工具和参数模式写 | — |
| **Pi** | 不内置沙箱和审批弹窗 | — | 官方建议放进容器,或用扩展自己做确认流程 | — |

### 4.1 名字相同,语义要逐个核对

dsh 的三个 sandbox mode 和 Codex 用的是同一组字符串,dsh 的 Codex 子代理 bundle 也直接把 Codex 的 `approvalPolicy`、`sandbox` 映射过去。但几处语义不能照搬:

| 看起来一样的东西 | dsh | Codex CLI |
| --- | --- | --- |
| `workspace-write` 下的网络 | 不限制 | 默认关 |
| `never` | 每次审批请求确定性地返回 `rejected` | 不向人请求审批,执行失败交回给模型 |
| Windows 沙箱 | ACL 受限令牌,自己报告 `partial` enforcement | 有原生实现 |

另外 dsh 的 `SAFETY.md` 写明项目"has not undergone a security audit",沙箱和审批"do not guarantee isolation"。05 篇的结论在这里同样成立:**dsh 的沙箱是降低风险的一层,不是隔离边界**。

---

## 五、多 Agent 与编排

| | 子代理 | 脚本化编排 | 团队协作 |
| --- | --- | --- | --- |
| **dsh** | spawn(全新子会话)、fork(带父历史);外部子代理可以是 ACP agent、Codex、Claude Code 或另一个 dsh | workflow 脚本:`agent()` / `parallel()` / `pipeline()` | 实验性 Agent Team(Lead + 队友 + 共享任务板);实验性 worktree、ralph |
| **Claude Code** | Subagents | Dynamic workflows | Agent teams(实验性,默认关);agent view(研究预览) |
| **Codex CLI** | 默认开启;内置 `default` / `worker` / `explorer`,自定义 agent 放 `.codex/agents/` | 本篇没查到对应的脚本编排层 | — |
| **OpenCode** | 主 agent `build` / `plan`,子代理 `general` / `explore` / `scout`,可用 Markdown 或 JSON 自定义 | — | — |
| **Pi** | 官网列为刻意不内置(用 tmux 或扩展) | — | — |

dsh 在这一维度最特别的不是"有子代理",而是**子代理的后端是可插拔的**:同一个委派接口背后可以是进程内的新会话,也可以是另一个产品(24 篇)。这让它天然适合当编排层。

---

## 六、无人值守与嵌入

| | 一次性命令 | 程序化接入 | 编辑器 / 协议 | CI 与事件 |
| --- | --- | --- | --- | --- |
| **dsh** | `dsh --profile headless "<task>"`,`--json` 事件流,完成退出 0、否则 1 | TS SDK(`sdk` profile,stdio JSON-RPC)、Python SDK | `acp` profile | 实验性 webhook 与 GitHub 审查 overlay;对话里创建定时提醒 |
| **Claude Code** | `claude -p` | Agent SDK(本身就是 Claude Code) | IDE 扩展 | GitHub Actions 与 Code Review;channels、云端定时任务处于研究预览 |
| **Codex CLI** | `codex exec`,`--json` 输出 JSONL,`--output-schema` | Codex SDK | app-server 协议(dsh 的 Codex 子代理就走它) | `openai/codex-action` |
| **OpenCode** | `opencode run` | `opencode serve`(HTTP API) | `opencode acp` | `opencode github` |
| **Pi** | print / JSON 模式 | RPC(stdin / stdout)、SDK | — | — |

注意默认权限在无人值守时的差别:`codex exec` 默认 `read-only` 沙箱;`claude -p` 默认 Manual,没人回答弹窗,需要授权的调用被拒;dsh headless 沿用 `workspace-write` + `ask`,没有人回答审批时同样不会放行。27 篇讲过 dsh 的退出码和 `--json` 事件。

---

## 七、数据与隐私默认值

这是几家默认值差别最大、也最容易被忽略的一维。06 篇有完整清单,这里只列选型时必须知道的:

| | 默认会外发的东西(模型请求本身之外) | 怎么关 |
| --- | --- | --- |
| **dsh** | **完整会话日志增量上传**:`dsh_session_log` 字段随 `llm-deepseek` 路由的请求发出,**包括经配置网关的请求**,内容可含 cwd、提示词、工具参数和结果;`dsh_plugin_packages` 插件清单;匿名用户 id 和会话 id 请求头;用户主动反馈后的 OTel 上传(`FEEDBACK_ONLY`);Desktop 的产品分析事件(没有界面开关) | Web 设置 → 通用 → 在使用官方模型 API 时上传 Session Log,或把 `session-log-deepseek` 行的 `enabled` 设为 `false`;`DSH_TELEMETRY_*` **管不到**会话日志 |
| **Claude Code** | 本站系列没有展开数据保留细节 | 零数据保留等合规选项按组织合同和官方文档核对;云端会话和托管的 Code Review 在启用零数据保留或 HIPAA 配置的组织不可用 |
| **Codex CLI** | 官方文档称 OpenTelemetry 导出默认关(`exporter = "none"`),`log_user_prompt` 默认 `false` | — |
| **OpenCode** | 本篇未核实到会话分享的当前默认值;配置文档写明启动时会自动下载更新 | `autoupdate: false` 或 `"notify"` |
| **Pi** | 本篇未核实 | — |

dsh 走 Custom model API(pi-ai 路由)时,`docs/deepseek-llm-api-wire-extensions.md` 写明 `llm-pi-ai` 不实现这些线协议扩展,会话日志字段不会附加。**"换个模型"和"换个数据出口"在 dsh 里是同一件事**,31 篇会把它整理进团队的数据基线。

---

## 八、互操作:dsh 可以把别的 harness 当零件

| 方向 | 怎么接 | 要点 |
| --- | --- | --- |
| dsh 调 Claude Code | `@deepseek-ai/dsh-subagent-claude-code` | 走官方 Agent SDK,运行时按平台钉死,不回退到本机的 `claude`;`permissionMode` 默认 `dontAsk`;只把最终文本带回父会话 |
| dsh 调 Codex | `@deepseek-ai/dsh-subagent-codex` | 走官方 app-server 协议;`permissionMode` 默认 `never`,另有 `approve-for-me` 和必须显式选择的 `dangerously-bypass-approvals-and-sandbox` |
| dsh 调任意 ACP agent | `subagent-acp` | 独立子进程,权限请求按配置策略自动回答 |
| 编辑器调 dsh | `acp` profile | stdio 上跑 ACP |
| 复用指令文件 | `dsh-agent-instructions` | 同时读 `AGENTS.md` 和 `CLAUDE.md`(及 `.local.md`),内容相同只渲染一次,默认预算 65,536 字节 |
| 复用 skills | `dsh-skill-filesystem` | 默认扫描 `.dsh/skills`、`.agents/skills`、`~/.agents/skills` 等;`.claude/skills` 不在默认根里,要用 `customSkillDirs` 加 |
| 复用 hooks / mods | 实验性 `dsh-hooks-claude-code`、`dsh-hooks-codex`;alpha 阶段的 Claude Code mods 桥 | 23 篇讲哪些能直接复用 |

装两个外部子代理 bundle:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-subagent-claude-code @deepseek-ai/dsh-subagent-codex
```

装完要重启 profile。两者各自用原生的配置和认证,**它们的执行不经过 dsh 的沙箱**,边界由 Claude Code / Codex 自己的权限模式和沙箱决定。

---

## 九、成熟度与生态

| | 成熟度信号 | 生态 |
| --- | --- | --- |
| **dsh** | README 大写警告 "THERE WILL BE COMPATIBILITY-BREAKING CHANGES";仓库共 42 份升级指南,其中 34 份属于 0.2.1 的四个 alpha;agent team、worktree、webhook、hooks 桥、mods 桥、浏览器 / Computer Use、Auto review、插件市场都标着实验性 | GitHub topic `dsh-plugin`、Discussions、Discord;插件市场需要先打开实验性 bundle,且不内置任何索引源;文档极细,是学习 harness 内部结构的好材料 |
| **Claude Code** | 成熟产品,多端覆盖;新功能常以研究预览或实验性先发布 | 官方插件市场,plugins / skills / hooks / MCP 生态成熟,但内核闭源 |
| **Codex CLI** | 配置也在演进:文档写明 `untrusted` 审批策略已退役,`codex exec` 不再支持 `--full-auto` | hooks、MCP、plugins、skills |
| **OpenCode** | 文档持续更新 | npm 插件、大量提供方 |
| **Pi** | 已到 1.0,但立场也在变:官网现在写 MCP 内置,与早期"不内置 MCP"相反 | packages 可从 npm 或 git 安装 |

---

## 十、怎么选

### 10.1 适合选 dsh

- **要研究或改造 harness 本身**:主循环、工具管线、上下文组装、会话存储都能换,文档细到每个子系统,第二层(09-17 篇)就是这样读出来的
- **主力模型是 DeepSeek**:原生适配、缓存命中统计、围绕 KV cache 前缀组织上下文,这是第三方 harness 接 DeepSeek 时拿不到的
- **需要模型无关、同进程、有类型的扩展**,而不是外挂脚本和 hook 命令
- **想把 Claude Code、Codex 或其他 ACP agent 当零件编排**,委派的任务和结果统一记录在 dsh 的会话日志里
- **能接受在 VM / 容器里运行,并愿意跟着升级指南走**

### 10.2 暂时不该选 dsh

- **需要稳定**:不能接受每个小版本都可能有 breaking change
- **有严格的数据驻留要求,但没人逐条配置出口**:会话日志默认上传、插件清单、Desktop 分析事件都要一项项关
- **主要在原生 Windows 上工作并要求完整沙箱**:Windows 后端自报 `partial`;SSH 包也不提供 Windows 端点
- **需要组织级强制策略**:截至这个 commit,文档里没有类似 Claude Code managed settings 的强制层,profile、home patch、`--patch` 都在用户手里
- **团队没人愿意读源码和升级指南**

### 10.3 按需求快速定位

| 你最在意 | 优先考虑 | 理由 |
| --- | --- | --- |
| 每天稳定地把活干完,用 Claude 模型 | Claude Code | 成熟、多端、权限和沙箱体系完整 |
| OpenAI 生态,默认沙箱严格 | Codex CLI | 默认断网的 `workspace-write`,`exec` 默认只读 |
| 一个产品化的模型无关 agent | OpenCode | 提供方多,插件、ACP、HTTP 服务齐全;安全靠应用层规则,建议自己加隔离 |
| 极简、自己搭一切 | Pi | 核心小,扩展自由;安全完全自理 |
| 改造 harness、DeepSeek 一等支持、编排别的 agent | dsh | 一切皆插件,子代理后端可插拔 |

---

## 十一、组合用法

不必只选一个。几种实际可行的组合:

1. **Claude Code 当日常主力,dsh 当研究和编排平台**。日常开发、PR 审查留在 Claude Code;在独立的 VM 里用 dsh 试新的循环策略、上下文策略,或跑多 agent 实验
2. **dsh 当编排层,Claude Code / Codex 当子代理**。dsh 的主 agent 负责拆任务和汇总,真正改代码的步骤通过 `subagent_claude_code` 或 `subagent_codex` 工具委派出去,各自用原生权限运行。适合想比较不同 agent 在同一任务上的表现
3. **一份指令文件,多个 harness 共用**。项目约定写在 `AGENTS.md`;Claude Code 在没有 `CLAUDE.md` 时也会读它,OpenCode 先读 `AGENTS.md` 再回退到 `CLAUDE.md`,dsh 两者都读并对相同内容去重。skills 放 `.agents/skills`,dsh 默认能发现
4. **CI 分工**。稳定的 PR 审查用成熟方案;dsh headless 先只跑非关键、可丢弃结果的任务(31 篇讲推广节奏)

组合 2 的委派在父会话里只留任务和最终文本,子代理的推理、工具调用和 diff 不进父日志。需要审计子代理细节时,要去看 Claude Code / Codex 自己的记录。

---

## 踩坑

1. **把 dsh 的 `never` 当成"全自动"**——dsh 里 `never` 是每次审批确定性拒绝。想少弹窗要调 sandbox mode 或预设,而不是把审批设成 `never`
2. **从 Codex 带来"workspace-write 会断网"的直觉**——dsh 的 `workspace-write` 只管文件写,读和网络都不限制
3. **以为"换成模型无关的 harness"就换掉了数据出口**——dsh 走 `llm-deepseek` 路由(含网关)默认上传完整会话日志,`DSH_TELEMETRY_*` 管不到它。按 06 篇逐项确认
4. **把同进程插件当成沙箱里的代码**——dsh、OpenCode、Pi 的插件和 harness 同权,兼容性检查也不是安全检查。第三方插件按装软件的标准审
5. **以为外部子代理继承 dsh 的沙箱**——Claude Code / Codex 子代理用各自的原生权限和沙箱,dsh 的 sandbox mode 包不到它们
6. **拿 star 数或单一评测选型**——各来源数字互相矛盾。看许可、扩展层级、默认安全和数据默认值
7. **把 Pi / OpenCode "没有 OS 沙箱"当成一票否决**——这是设计取舍。放进容器或 VM 跑,和给 dsh、Claude Code 加外层隔离是同一件事
8. **一次性把团队整体切到 dsh**——它仍是 developer preview。先组合使用,按 31 篇的节奏推广
9. **照抄本篇的表格当长期结论**——五家都在快速迭代。每次选型前按下面的索引和外部资料重新核对

---

## 源码与文档索引

- `README.md`(developer preview 声明、MIT、社区入口)
- `SAFETY.md`(未经安全审计、沙箱局限、建议用 VM / 容器)
- `docs/architecture.md`(一切皆插件、profile 与 bundle、Where new behavior goes 表)
- `apps/cli/reference/README.md`(profile、headless 退出码、默认 `workspace-write`、会话日志与 OTel、外部子代理 bundle 安装)
- `docs/subsystems/sandbox.md`、`docs/subsystems/permission-presets.md`、`docs/subsystems/approval.md`
- `packages/bundle/base/cordis.patch.yml`(三个权限预设、`DSH_PERMISSION_MODE`、遥测行)
- `packages/sandbox/sandbox-local/README.md`(各平台后端与 `partial` enforcement)
- `packages/experimental/auto-review/README.md`
- `docs/subsystems/subagent.md`、`packages/subagent/README.md`
- `packages/subagent/subagent-claude-code/README.md`、`packages/subagent/subagent-codex/README.md`、`packages/subagent/subagent-acp/README.md`
- `docs/subsystems/workflow.md`、`docs/subsystems/agent-team.md`
- `packages/bundle/headless/README.md`、`packages/bundle/acp-app/README.md`
- `docs/deepseek-llm-api-wire-extensions.md`、`packages/session/session-log-deepseek/README.md`
- `packages/llm/llm-pi-ai/package.json`、`packages/llm/llm-pi-ai/README.md`、`THIRD_PARTY_NOTICES.md`
- `packages/context/agent-instructions/README.md`、`packages/skill/skill-filesystem/README.md`
- `packages/experimental/hooks-claude-code/README.md`、`packages/experimental/hooks-codex/README.md`、`packages/experimental/claude-code-mods/README.md`
- `packages/boot/plugin-manager/README.md`、`packages/boot/app-boot/README.md`
- `packages/ssh/ssh/README.md`(不提供 Windows 端点)
- `docs/upgrade-guide/`(按版本统计升级指南数量)

## 外部资料

访问时间均为 2026-10。

- [openai/codex 仓库](https://github.com/openai/codex)(许可、安装方式)
- [Codex: Agent approvals & security](https://learn.chatgpt.com/codex/agent-approvals-security)(sandbox mode、审批策略、平台后端、网络与遥测默认值)
- [Codex: Non-interactive mode](https://learn.chatgpt.com/codex/noninteractive)(`codex exec`、`--json`、GitHub Action)
- [Codex: Subagents](https://learn.chatgpt.com/codex/subagents)
- [Codex: Advanced configuration](https://learn.chatgpt.com/codex/config-advanced)(自定义提供方、`--oss`、hooks)
- [anomalyco/opencode 仓库](https://github.com/anomalyco/opencode)
- [OpenCode: Providers](https://opencode.ai/docs/providers/)
- [OpenCode: Permissions](https://opencode.ai/docs/permissions/)
- [OpenCode: Plugins](https://opencode.ai/docs/plugins/)
- [OpenCode: Agents](https://opencode.ai/docs/agents/)
- [OpenCode: CLI](https://opencode.ai/docs/cli/)
- [OpenCode: Rules](https://opencode.ai/docs/rules/)
- [OpenCode: Config](https://opencode.ai/docs/config/)
- [pi.dev 官网](https://pi.dev/)
- [earendil-works/pi 仓库](https://github.com/earendil-works/pi)

---

下一篇:`31-团队落地-安全基线-版本锁定与私有化.md`,讲团队采用 dsh 时的安全基线、数据基线、版本锁定、共享配置、私有模型网关、共享部署、可观测性和推广节奏,最后给一页检查清单。
