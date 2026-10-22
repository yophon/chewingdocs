# 从 Claude Code 迁移

第三层的最后一篇换个角度:如果你的团队已经在用 Claude Code,仓库里有 CLAUDE.md、`.claude/skills`、`settings.json` 里的 hooks,也许还写过几个 mod,迁到 dsh 时哪些能直接带走,哪些要改,哪些根本没有对应物?

这一篇不重复两边的概念。Claude Code 侧的细节以 Claude Code 系列为准(Memory、Skills、Hooks、MCP、子代理、插件、Mods 各篇),dsh 侧的细节分别在 07、22、24、05、20 篇。这里只做映射和取舍。

> 一句话先记住:**指令文件和 SKILL.md 基本能直接带走,hooks 和 mods 只能靠实验性的桥带走一部分,权限规则、子代理定义、`.mcp.json`、插件市场要手工改写**。还有一条反向路线:不迁,把 Claude Code 当成 dsh 的子代理来调用。

---

## 一、总表

| Claude Code | dsh 里的对应 | 状态 | 详见 |
| --- | --- | --- | --- |
| 各层目录的 `CLAUDE.md` / `CLAUDE.local.md` | `dsh-agent-instructions` 默认就读 | 原生 | 07 |
| `AGENTS.md` | 同上,和 `CLAUDE.md` 并列的候选文件 | 原生 | 07 |
| `~/.claude/CLAUDE.md` | 不读;用户级只读 `$DSH_HOME/AGENTS.md` 和 `<agentsHome>/AGENTS.md` | 手工 | 07 |
| `.claude/CLAUDE.md`、`.claude/rules/`、`@path` 导入 | 不解释 | 手工 | 本篇二 |
| `.claude/skills/<名字>/SKILL.md` | 格式兼容,但这个路径不扫 | 搬家或软链 | 22 |
| `.claude/commands/*.md` | 改写成 `disable-model-invocation: true` 的 skill | 手工 | 本篇三 |
| skill 的 `allowed-tools`、`context: fork`、`model`、`$ARGUMENTS`、`` !`命令` `` | 不支持 | 无 | 22 |
| settings 里的 `hooks` / `hooks.json` | `@deepseek-ai/dsh-hooks-claude-code`,支持 30 个事件里的 7 个 | 桥(实验性) | 本篇四 |
| Codex 的 `hooks.json` | `@deepseek-ai/dsh-hooks-codex`,支持 10 个里的 5 个 | 桥(实验性) | 本篇四 |
| Mods | `@deepseek-ai/dsh-experimental-claude-code-mods` | 桥(alpha) | 本篇五 |
| `.claude/agents/*.md` | agent 预设(Cordis 行) | 手工 | 24 |
| `.mcp.json`、`claude mcp add` | 每个 server 一行 `dsh-mcp-client` | 手工 | 22 |
| `permissions` 的 allow / deny / ask 规则 | 权限预设 + `tools/pre-execute` 策略 | 手工 | 05、13 |
| 权限模式 | sandbox mode × approval policy | 手工 | 05 |
| 插件与 marketplace | bundle、`dsh plugin`、插件市场 | 手工 | 20 |
| Dynamic workflows | `workflow` 工具,`meta` 字段沿用同一套词汇 | 概念对应 | 25 |
| Agent teams | 实验性 agent team bundle | 概念对应 | 25 |

---

## 二、原生能带走的:指令文件

dsh 的 `dsh-agent-instructions` 默认挂在 base bundle 里(预算 `maxBytes: 65536`),候选文件名就是为兼容准备的:

| 配置项 | 默认值 |
| --- | --- |
| `instructionFileCandidates` | `['AGENTS.md', 'CLAUDE.md']` |
| `localInstructionFileCandidates` | `['AGENTS.local.md', 'CLAUDE.local.md']` |
| `projectRootMarkers` | `['.git']` |

从项目根一路读到会话工作目录,由宽到窄;读写更深目录里的文件后,那里的指令文件在下一次请求时补进来。和 Claude Code 不一样的几处:

- **两个都在时两个都读**。Claude Code 在 `AGENTS.md` 和 `CLAUDE.md` 都存在时只读 `CLAUDE.md`;dsh 两个都注入,只有去掉首尾空白后内容完全相同时才只渲染一次。两份内容不同又互相矛盾,模型就会看到两套说法
- **用户级文件换了位置**。`~/.claude/CLAUDE.md` 不读,用户级链条是 `$DSH_HOME/AGENTS.md`,再是 `$DSH_AGENTS_HOME/AGENTS.md`(默认 `~/.agents/AGENTS.md`)
- **`.claude/rules/` 和 `@path` 导入都不解释**。Claude Code 里常见的单行 CLAUDE.md `@AGENTS.md`,在 dsh 里只是一行字面文字,无害但没有导入效果
- **`.claude/CLAUDE.md` 不在候选里**,候选文件是在每一级目录本身里找的

最省事的做法:把内容收拢到 `AGENTS.md`,CLAUDE.md 留那一行 `@AGENTS.md` 给 Claude Code 用。两边都能读到同一份内容,dsh 这边只多一行噪音。加载链、预算和截断规则见 07 篇。

---

## 三、SKILL.md:格式兼容,路径不兼容

### 3.1 搬到 dsh 扫描的目录

dsh 扫 `.dsh/skills` 和 `.agents/skills`,不扫 `.claude/skills`。推荐把真身放在 `.agents/skills`,给 Claude Code 留一个软链——dsh 仓库自己就是这么维护的:

```bash
mkdir -p .agents
git mv .claude/skills .agents/skills
ln -s ../.agents/skills .claude/skills
```

Windows 上创建软链需要开发者模式或管理员权限,做不到时可以在 `skill-filesystem` 的 `customSkillDirs` 里直接指向 `.claude/skills` 的绝对路径。

### 3.2 逐个检查 frontmatter

| Claude Code 写法 | 在 dsh 里 |
| --- | --- |
| 不写 `name`,用目录名 | **必须写 `name`**,否则整个 skill 被跳过 |
| `name` 含大写或下划线 | 必须是 kebab-case 小写 |
| `when_to_use` | 不识别;dsh 的字段叫 `whenToUse`,而且不进模型目录,要并进 `description` |
| `disable-model-invocation` / `user-invocable` | 兼容,写法完全一样 |
| `allowed-tools`、`disallowed-tools`、`model`、`effort`、`context`、`agent`、`paths`、`hooks`、`shell`、`argument-hint`、`arguments` | 静默忽略 |
| 正文里的 `$ARGUMENTS`、`$0`、`` !`命令` `` | 原样作为文字交给模型 |

依赖 `` !`git diff` `` 做动态注入的 skill,要改写成"先运行 `git diff` 再……"的指令,让模型自己去跑。

### 3.3 `.claude/commands` 改成 skill

Claude Code 的命令文件已经并入 skills,dsh 只认 skill。一个 `deploy.md` 命令改成这样:

```markdown
---
name: deploy
description: 部署到生产环境
disable-model-invocation: true
---
把用户在 /deploy 后面指定的目标部署到生产:
1. 跑完整测试
2. 构建
3. 推送并验证
```

`disable-model-invocation: true` 后模型看不到它,只能由用户在消息里写 `/deploy` 触发。没有参数替换,`/deploy staging` 里的 `staging` 留在用户消息里,所以正文要写成"用户指定的目标",而不是 `$ARGUMENTS`。

---

## 四、Hooks 桥:`dsh-hooks-claude-code`(实验性)

### 4.1 安装与挂载

v0.2.1-alpha.1 之后的版本里 CLI 不再自带 hooks 桥,要和它的 peer 一起装进 profile(`docs/upgrade-guide/v0.2.1-alpha.1/experimental-package-composition/guide.md`):

```bash
dsh plugin --profile web add @deepseek-ai/dsh-hooks-claude-code @deepseek-ai/dsh-hook-protocol
```

装上不等于挂上,还要在 patch 里插一行:

```yaml
- insert:
    - id: hooks-claude-code
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: /abs/path/to/repo/.claude/settings.json
        projectDir: /abs/path/to/repo
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `configPath` | 必填 | `hooks.json`,或带 `hooks` 键的 settings 文件 |
| `pluginRoot` | — | 替换命令里的 `${CLAUDE_PLUGIN_ROOT}` |
| `projectDir` | 会话工作目录 | 替换 `${CLAUDE_PROJECT_DIR}` 并设置同名环境变量 |
| `defaultTimeoutMs` | `600000` | hook 没写超时时用,和 Claude Code 的默认一致 |
| `stderrSummaryMaxChars` | `500` | 写进会话日志的 stderr 摘要长度 |

### 4.2 支持的 7 个事件

| 事件 | 能做什么 | 主要缺口 |
| --- | --- | --- |
| `SessionStart` | 附加上下文 | 只认 JSON 的 `additionalContext`,纯 stdout 不算;分离运行,可能赶不上第一次请求 |
| `UserPromptSubmit` | 阻断提示、附加上下文 | 纯 stdout 不算;默认超时是 600 秒而不是 Claude Code 的 30 秒 |
| `PreToolUse` | `deny`、`ask` | `allow` 不能预先放行;`updatedInput` 只记日志不生效;`additionalContext` 被忽略 |
| `PostToolUse` | 阻断反馈、附加上下文 | `updatedToolOutput` 不支持;`tool_response` 被压成文本 |
| `Stop` | 阻断以强制再跑一步 | **没有连续阻断上限**,`stop_hook_active` 永远是 `false` |
| `SubagentStart` | 给进程内子代理附加上下文 | `agent_type` 固定是 `general-purpose` |
| `SubagentStop` | 只能观察 | 不能阻断,也不能回灌上下文 |

`PreToolUse` 返回 `ask` 时交给 dsh 的 `ctx.approval`。会话审批策略是 `never` 时,这等于自动拒绝(05 篇)。

### 4.3 必须改的地方

- **matcher 匹配的是 dsh 的工具名**。payload 里的 `tool_name` 就是 dsh 注册的名字:`bash`(Windows 上标准预设用 `pwsh`)、`read`、`edit`、`write`、`glob`、`grep`。`Edit|Write` 这种纯字母加竖线的 matcher 按字面精确匹配,**大小写不同就匹配不上**,要改成 `edit|write`
- **参数名大多一致**:`edit` 的 `file_path` / `old_string` / `new_string`,`write` 的 `file_path` / `content`,`bash` 的 `command`,用 `jq -r '.tool_input.file_path'` 的脚本多半不用改
- **`transcript_path` 永远是空字符串**:dsh 的会话日志默认是 Zstandard 压缩的,hook 脚本读不了。依赖它做归档的 hook 要换思路
- **只跑 command 类型**:`http`、`prompt`、`agent`、`mcp_tool` 被跳过;`if`、`async`、`once`、`statusMessage` 不生效
- **串行执行**,按配置顺序一个个跑,不像 Claude Code 那样并行和去重
- **一个进程只有一份配置**:启动时读一次,没有用户 / 项目 / 插件 / managed 分层,也不热加载。相对路径从启动 dsh 的目录解析

### 4.4 Codex 用户

`@deepseek-ai/dsh-hooks-codex` 是同一套思路,同样需要 `@deepseek-ai/dsh-hook-protocol`。支持 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop` 五个点;非 shell 工具的参数会被压成 `{ command }`,`transcript_path` 是 `null`。

---

## 五、Mods 桥:`dsh-experimental-claude-code-mods`(alpha)

### 5.1 怎么跑一个 mod

Claude Code 的 mod 是带 `.claude-plugin/plugin.json` 和 `hooks/hooks.json` 的插件目录(Claude Code 系列的 Mods 篇)。这个桥**不读这两个文件**,而是用 `defineMod` 把 mod 的 `register` 函数包成一个 Cordis 插件:

```ts
import { defineMod, type ModOn } from '@deepseek-ai/dsh-experimental-claude-code-mods'

declare const register: (on: ModOn, options: Readonly<Record<string, unknown>>) => void

export default defineMod({ name: 'token-weather', version: '0.1.0', root: import.meta.dirname, register })
```

```yaml
- name: '@deepseek-ai/dsh-experimental-claude-code-mods'
- name: './mods/blast-radius/index.ts'
- name: './mods/token-weather/index.ts'
  config:
    history: 12
```

先挂桥,再按链的顺序挂 mod。源码仓库里有一个现成的 overlay,从源码运行时用 `pnpm dsh web --patch ./packages/experimental/claude-code-mods/cordis.source.patch.yml` 挂上桥和博客里的三个示例 mod。`.ts` 的 hooks 模块只有在启动器做转译时才能加载,源码启动可以,构建后的安装不行。

### 5.2 兼容到什么程度

兼容基线是 **Claude Code 2.1.287**,完整差异表在 `docs/subsystems/claude-code-mods.md`。要点:

| 方面 | 这个桥 |
| --- | --- |
| 会触发的事件 | `session.start`、`session.end`(只对根 agent)、`prompt.submit`、`turn.start`、`turn.complete`、`tool.call`、`command.run`、`ui.render`,以及 `$` 调用对应的 op 事件 |
| 其他事件 | 能注册,永不触发,加载时警告;`classic.*` 直接拒绝 |
| `tool.call` | 在 dsh 的权限决定**之后**运行;改写参数或改道到别的工具会被跳过并报告,`{ deny }`、`{ result }`、改结果仍然有效 |
| `ui.render` | 只有 `AbovePrompt` 这一条信息带;没有 Pane |
| `$` 命名空间 | `$.model`、`$.agent`、`$.config`、`$.settings`、`$.mcp`、`$.audio`、`$.telemetry`、`$.turn` 都拒绝 |
| 隔离 | **不加沙箱**,mod 以进程的全部权限运行,`$.env` 能读写 harness 的环境变量 |
| 热加载 | 没有;也没有 `claude plugin validate` / `test` 命令,测试用 `createModTestKit` |
| 工具名 | 内置别名表 `Bash`↔`bash`、`Edit`↔`edit`、`Task`↔`subagent`、`TodoWrite`↔`todo_write` 等,可用 `toolAliases` 补充 |

Anthropic 仓库里的官方 mod(`diff`、`agents-md`、`sec-default`、`telemetry`)在文档里都被评估为**跑不起来**。把这个桥当成接口兼容的演示,不要当生产迁移路径。

---

## 六、要手工改写的

### 6.1 权限规则

dsh 没有 `Bash(npm test)` 这样的 allow / deny 规则列表。权限由两个独立旋钮决定:sandbox mode 和 approval policy,打包成权限预设,默认表里是 `workspace-write`(`workspace-write` + `ask`)和 `danger-full-access`(`danger-full-access` + `never`)。审批结果只有 `allowed-once`,**没有"以后都允许"**。

| Claude Code 里的需求 | dsh 的做法 |
| --- | --- |
| 限制能改哪里 | 选 sandbox mode(05 篇) |
| 某类命令一律禁止 | hooks 桥的 `PreToolUse` deny,或写一个 `tools/pre-execute` 策略插件(13、19 篇) |
| 某类命令一律放行 | 没有规则列表可写;要么换更宽的权限预设,要么接受逐次审批 |
| `bypassPermissions` | 只在隔离环境里用 `danger-full-access` |

### 6.2 子代理定义

`.claude/agents/*.md` 的 frontmatter + 系统提示,在 dsh 里对应一个 `@deepseek-ai/dsh-agent-preset` 行:`plugins` 列表决定工具,`dsh-persona` 决定身份。没有 Markdown 格式的入口,见 24 篇。

### 6.3 MCP 与插件

`.mcp.json` 里的每个 server 手工改成一行 `dsh-mcp-client`,只支持 stdio 和 streamable-http,依赖 OAuth 的远程 server 要自己在 `headers` 里带 token(22 篇)。Claude Code 插件里的 skills、hooks、MCP 拆开分别迁移;要整体分发,做成 dsh 的 bundle(20 篇)。

---

## 七、反向路线:保留 Claude Code,让 dsh 调它

不想迁,或者某些任务就是更适合 Claude Code,可以装 `@deepseek-ai/dsh-subagent-claude-code` 这个可选 bundle。它给每个 agent 加一个全局工具 `subagent_claude_code`,每次委派启动一个全新的、无人值守的 Claude Code 会话:

- 走官方 Agent SDK,运行时随 bundle 锁定在平台对应的版本,**不会退回去用你机器上的 `claude`**
- 认证和 settings 用 Claude Code 自己的:它按子会话的工作目录读宿主机正常的用户、项目、本地 settings,所以项目 `.claude/settings.json` 里的权限规则和 hooks 在子会话里照常生效,不受第四节那些限制
- `permissionMode` 默认 `dontAsk`,不能弹窗问人
- 一次性执行,只回传最终答案,不能追问或恢复

配置细节和 Codex 版本见 24 篇。

---

## 八、迁移清单

1. 指令文件收拢到 `AGENTS.md`,检查 `~/.claude/CLAUDE.md` 里的个人约定,搬到 `$DSH_HOME/AGENTS.md`
2. skills 搬进 `.agents/skills` 并软链回去,逐个补 `name`、改掉 `$ARGUMENTS` 和 `` !`命令` ``
3. `.claude/commands` 改写成 `disable-model-invocation: true` 的 skill
4. hooks 先列清单:7 个支持的事件里的 command hook 走桥,matcher 改成 dsh 工具名;其他事件的 hook 评估是否需要原生插件
5. 权限规则按第六节翻译成权限预设和 pre-execute 策略
6. `.mcp.json` 逐条改写,把 token 放进 `env` 或 `headers`
7. 在 Web 的会话里确认 skill 目录、工具列表、hook 日志都符合预期

---

## 踩坑

1. **hook 的 matcher 写着 `Edit|Write`,一次都没触发**——dsh 的工具名是小写的 `edit`、`write`,纯字母 matcher 按字面精确匹配。Windows 上 shell 工具叫 `pwsh`,`Bash` matcher 也匹配不上
2. **`PreToolUse` 返回 `allow` 想免审批**——桥里 `allow` 不预先放行,只有 `deny` 和 `ask` 生效
3. **`Stop` hook 无条件阻断**——没有 Claude Code 那样的连续阻断上限,`stop_hook_active` 永远是 `false`,会每一步都强制续跑。脚本要自己计数限流
4. **hook 脚本读 `transcript_path` 归档会话**——永远是空字符串
5. **SessionStart hook 用 `echo` 输出上下文**——纯 stdout 不被消费,改成输出带 `hookSpecificOutput.additionalContext` 的 JSON
6. **在一个 dsh 进程里开多个仓库的会话,期待各用各的 hooks**——桥一个进程只读一份 `configPath`,不按项目分层
7. **CLAUDE.md 和 AGENTS.md 内容不同,以为只会读一个**——dsh 两个都注入,冲突的说法会同时出现在上下文里
8. **搬过来的 skill 不出现**——多半是没写 `name`,或名字不是 kebab-case,日志里有警告
9. **把 mods 桥当生产方案**——alpha、无沙箱、只有一条信息带,官方 mod 基本跑不起来
10. **以为装了包就生效**——0.2.1 起安装和挂载分开,hooks 桥还要手动装 `@deepseek-ai/dsh-hook-protocol` 并插入配置行

---

## 源码与文档索引

- `packages/context/agent-instructions/README.md`
- `packages/skill/skill-filesystem/README.md`
- `packages/skill/skill-filesystem/src/index.ts`
- `packages/experimental/hooks-claude-code/README.md`
- `packages/experimental/hooks-claude-code/src/index.ts`
- `packages/experimental/hook-protocol/src/matcher.ts`
- `packages/experimental/hooks-codex/README.md`
- `packages/experimental/claude-code-mods/README.md`
- `docs/subsystems/claude-code-mods.md`
- `docs/upgrade-guide/v0.2.1-alpha.1/experimental-package-composition/guide.md`
- `docs/subsystems/permission-presets.md`
- `packages/subagent/subagent-claude-code/README.md`

---

下一篇:`24-子代理-spawn-fork与外部Agent.md`,讲 dsh 的子代理怎么由"委派工具 + provider"组成、spawn 和 fork 的区别、agent 预设怎样充当子代理类型,以及怎么把 Claude Code、Codex 当子代理调用。
