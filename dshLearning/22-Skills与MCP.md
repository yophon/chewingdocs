# Skills 与 MCP

19 到 21 篇都在写代码:写工具、打包、接模型。这一篇讲两种**不用写插件代码**就能扩展 dsh 的方式:skill 是一份带 frontmatter 的 Markdown 指令,模型按需加载;MCP 是一个外部进程或服务,它提供的工具被 dsh 当成原生工具挂上去。

概念层面 Claude Code 系列的 Skills 篇和 MCP 篇已经讲过,MCP 协议本身见 aiLearning 系列。这里只讲 dsh 怎么实现、默认开了什么、和 Claude Code 差在哪。

> 一句话先记住:**skill 改变模型"知道怎么做",MCP 改变模型"能调什么"**。在 dsh 里两者都是可选插件:skill 由注册表、provider、`skill` 工具三部分组成,标准预设默认挂好;MCP 是每个 server 一行 `@deepseek-ai/dsh-mcp-client`,**默认一个都不开**,因为每个 server 命令都是跑在沙箱外的可信代码。

---

## 一、Skill 由三部分组成

| 包 | 角色 | 说明 |
| --- | --- | --- |
| `@deepseek-ai/dsh-skill` | 注册表 `ctx.skills` | 合并所有 provider 的目录,同名时选出胜者 |
| `@deepseek-ai/dsh-skill-filesystem` | 本地 provider | 扫描项目、自定义、用户目录,监视变化 |
| `@deepseek-ai/dsh-tool-skill` | 消费者 | 给模型发 skill 目录、注册 `skill` 工具、处理 `/名字` |
| `@deepseek-ai/dsh-skill-office` | 打包 provider | Word / PPT / Excel 流程,只在 Desktop 和 SDK 的 `sdk-app` bundle 里挂载 |
| `@deepseek-ai/dsh-skill-badge` | 实验性打包 provider | 默认禁用,要显式打开 |

base bundle 在 Host 层挂了前三行,headless 等 profile 直接用。`dsh --profile web` 用的 `dsh-web-app` bundle 则把 Host 上的 `skill-filesystem` 和 `tool-skill` 行禁用,改由 `standard`、`ptc` 和 Creator(`cordis`)这几个 **agent 预设**各自挂载,注册表仍留在 Host 层。`minimal` 预设没挂这两行,所以在 web profile 里**切到 minimal 就没有 skill**(预设清单见 04 篇)。

注册表是分层的:Host 行和仓库插件注册进全局层,预设里的 provider 注册进那个预设的层。同名 skill 跨层时**离当前 agent 最近的层直接胜出**,同一层内才比下一节的 rank。

---

## 二、写一个 SKILL.md

### 2.1 两种形态

- **目录包**:`<root>/<名字>/SKILL.md`,目录里可以带 `references/`、`scripts/`、`templates/` 等资源
- **单文件**:`<root>/<名字>.md`

只扫一层。`<root>/group/foo/SKILL.md` 这种嵌套结构**不会被发现**,也不读任何 package 清单。

### 2.2 例子

`.agents/skills/release-notes/SKILL.md`:

```markdown
---
name: release-notes
description: 根据 git 历史起草发布说明。用户要写 changelog、发布说明或版本摘要时使用。
whenToUse: 仅限本仓库的发版流程
metadata:
  owner: platform-team
---

# 起草发布说明

1. 用 `git log --oneline <上个 tag>..HEAD` 列出提交
2. 按 feat / fix / chore 分组,合并重复项
3. 套用本目录下 `templates/release.md` 的格式输出
```

正文里写的 `templates/release.md` 是相对路径。模型加载这个 skill 时会拿到一句"Base directory for this skill: <目录>",自己按需去读,**dsh 不会替它把资源文件列出来或读进来**。

### 2.3 frontmatter 字段

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `name` | 是 | kebab-case,正则 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。**不会从目录名推断** |
| `description` | 是 | 模型靠它决定加载不加载,目录里最多显示 500 字符(`catalogDescriptionMaxLength`) |
| `whenToUse` | 否 | 驼峰写法。会进注册表,但**模型看到的目录里不渲染它** |
| `metadata` | 否 | 任意对象,provider 自用 |
| `disable-model-invocation` | 否 | `true` 时模型看不到、也不能用 `skill` 工具加载 |
| `user-invocable` | 否 | `false` 时用户不能用 `/名字` 调用 |

两个调用开关接受 YAML 布尔值,以及大小写不敏感的 `true/false`、`yes/no`、`on/off`、`1/0`。写错拼法或写成其他类型,**整个 skill 被丢弃并打一条警告**,而不是悄悄放行。旧的驼峰键 `disableModelInvocation`、`modelInvocable`、`userInvocable` 同样会让整个 skill 被拒。

除此之外的键解析器根本不读:Claude Code 的 `allowed-tools`、`context: fork`、`model`、`paths`、`hooks`、`argument-hint` 都被静默忽略。迁移时的完整清单见 23 篇。

### 2.4 谁能调用

| 设置 | 模型目录里 | `skill` 工具 | 用户 `/名字` |
| --- | --- | --- | --- |
| 默认 | 有 | 能 | 能 |
| `disable-model-invocation: true` | 无 | 拒绝 | 能(唯一入口) |
| `user-invocable: false` | 有 | 能 | 当普通文字 |
| 两个都关 | 无 | 拒绝 | 当普通文字,只有可信代码能用 `ctx.skills.get()` 读到 |

---

## 三、发现路径与优先级

本地 provider 按 rank 从小到大扫描,**rank 小的赢**:

| Rank | 来源 | 路径 |
| --- | --- | --- |
| 100 | `project-dsh` | `<项目根>/.dsh/skills` |
| 200 | `project-agents` | `<项目根>/.agents/skills` |
| 300 | `custom` | 配置里的 `customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills`,默认 `$DSH_HOME/skills`,未设时是 `~/.dsh/skills` |
| 500 | `user-agents` | `<agentsHome>/skills`,默认 `$DSH_AGENTS_HOME/skills`,未设时是 `~/.agents/skills` |
| 600 | `bundled` | `bundledSkillDir` 或 `$DSH_BUNDLED_SKILL_DIR`,配置了才有 |

几个细节:

- **项目根 = 最近一个包含 `.git` 的祖先目录**,找不到就用当前 cwd。monorepo 里没有子项目选择
- `user-dsh` 根下的 `.system` 子目录会被跳过
- `includeDefaultRoots: false` 去掉项目和用户这几行,只扫你配置的目录
- **`.claude/skills` 不在扫描列表里**。想和 Claude Code 共用,把 skill 放进 `.agents/skills`,再让 `.claude/skills` 软链过去——dsh 仓库自己就是这么做的

Creator 预设就是用 `customSkillDirs` 把 `@deepseek-ai/dsh-agent-preset` 包里打包的 skills 目录挂进来的(`packages/bundle/web-app/presets/cordis.patch.yml`)。照同样的写法可以挂团队共享的目录:

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    customSkillDirs:
      - /absolute/path/to/team-skills
```

### 3.1 改了立即生效

provider 用 Chokidar 监视已存在的根目录:增删 skill、改 `SKILL.md` 的 frontmatter,下一步就会刷新目录;改 `references/`、`scripts/` 这类资源不算目录变化。还不存在的根目录会被逐级探测,创建后自动接上。模型自己用 `write` / `edit` 改 skill 时会同步失效缓存,不用等监视器。

**正文不缓存**:每次 `skill` 调用都重新读文件,只改正文不会触发目录更新,下一次加载就是新内容。

---

## 四、模型看到什么

### 4.1 目录

第一次模型请求之前,`dsh-tool-skill` 往会话里追加一条持久的 user 角色消息:

```text
<system-reminder>
A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
- `release-notes`: 根据 git 历史起草发布说明。……
</available_skills>
……
</system-reminder>
```

里面只有 `name` 和截断后的 `description`,没有正文、路径、来源。目录变化时**追加一份完整的替换目录**,删光所有 skill 会追加一份空目录来作废旧名字。它是追加在历史末尾的,不改写已有前缀——这正是 16 篇讲的 KV Cache 纪律。

### 4.2 `skill` 工具与 `/名字`

| 入口 | 谁触发 | 结果 |
| --- | --- | --- |
| `skill({ name })` | 模型 | 工具结果里返回 `<skill_content>`,含资源指引和完整正文 |
| `/release-notes` | 用户 | 消息里任意位置、前后有空白的 `/名字` token,把同样的 `<skill_content>` 注入这一步 |

两条路径渲染出同一种格式,目录里也写明了"用户已经注入的 skill 不要再用工具加载一次"。

**没有参数替换,也没有命令注入**:Claude Code 的 `$ARGUMENTS`、`$0`、`` !`git diff` `` 在 dsh 里都是普通文字。用户写在 `/名字` 后面的内容留在原消息里,模型自己读。

### 4.3 错误

名字不合法、skill 不存在、关了模型调用,模型分别收到 `Error: invalid skill name "<name>"`、`Error: skill "<name>" is unknown or no longer available`、`Error: skill "<name>" is not available for model invocation`。frontmatter 写坏的 skill 只在 Host 日志里有一条警告,**模型分不清"不存在"和"写坏了"**。

---

## 五、插件提供 skill

skill 不一定来自磁盘。插件可以在 `apply()` 里同步注册:

```ts
export const inject = ['skills']

export function apply(ctx: Context) {
  ctx.skills.register({
    name: 'oncall-runbook',
    description: '值班排障步骤。用户提到告警、事故、回滚时使用。',
    source: 'runtime',
    content: '1. 先看监控面板……',
  })
}
```

省略的调用开关默认两边都允许。同一层里,项目来源排在 runtime 前面,runtime 排在用户来源前面;同名 runtime 条目先到先得,后来的只得到一条警告。

需要远程目录、鉴权或分页时用 `ctx.skills.registerProvider(control => provider)`:注册必须同步,真正的发现放在 provider 的 `list()` 里异步做,内容变了调 `control.invalidate()`。插件写法本身见 18、19 篇。

---

## 六、MCP:每个 server 一行配置

### 6.1 为什么默认不开

CLI 把 `@deepseek-ai/dsh-mcp-client` 作为依赖带上了,但**不启用任何 server**。`apps/cli/reference/README.md` 的理由是:每个 server 命令都是 agent 沙箱之外的可信可执行代码。05 篇讲的沙箱管不到 stdio server 子进程。

### 6.2 配置

`packages/mcp/mcp-client/README.md` 的原始例子,一个 stdio、一个 Streamable HTTP:

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN

- id: mcp-web
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: web
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

`!!js` 标签在加载配置时求值一段 JS 表达式,这里用来从环境变量读密钥,不把它写死在 YAML 里。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `transport` | 必填 | `stdio` 或 `streamable-http` |
| `serverName` | 必填 | `[A-Za-z0-9_-]{1,32}`,同一作用域内唯一 |
| `command` / `args` / `env` / `cwd` | — | stdio 用 |
| `url` / `headers` | — | streamable-http 用 |
| `toolCallTimeoutMs` | `60000` | 每次 `tools/call` 或资源请求的超时 |
| `maxInstructionBytes` | `32768` | server instructions 上限,超了**直接拒绝这个连接** |
| `failOnStartupError` | `false` | 首次连接失败时是否让插件激活失败 |
| `reconnect.enabled` | `true` | 断线自动重连 |
| `reconnect.initialDelayMs` / `maxDelayMs` | `500` / `30000` | 退避从 500ms 翻倍到 30s |
| `reconnect.maxAttempts` | `10` | 一次断线最多连续失败 10 次,之后移除工具、停止重连 |

### 6.3 写在哪

| 位置 | 范围 |
| --- | --- |
| `dsh web --patch <文件>` | 本次启动 |
| `$DSH_HOME/profiles/<name>/cordis.patch.yml` | 某个 profile |
| `$DSH_HOME/cordis.patch.yml` | 本机所有 profile |

写进 patch 文件时,行要包在 `- insert:` 下面(见第十节的例子)。四层叠加的规则见 11 篇。Host 层的行对所有 agent 可见;放进某个预设的 `plugins` 列表,就只有用那个预设的 agent 能看到。

---

## 七、工具命名、结果与重连

- **命名**:`mcp__<serverName>__<原工具名>`,和 Claude Code、Codex 的形状一样。命名空间取本地配置的 `serverName`,**不信任远端上报的 server 名**。原名不满足 DeepSeek 函数名约束时会归一化,并在末尾追加 12 位十六进制的 SHA-256 哈希防止撞名。名字稳定,会话历史和权限判断在重启后仍然对得上
- **结果**:按块顺序转成文本;当前模型支持图片输入且挂了附件功能时,图片按图片进上下文;音频和嵌入资源只给模型一条诊断文字;server 报 `isError` 时这次调用失败,不会伪装成成功
- **管线**:MCP 工具和原生工具走同一条工具执行管线(13 篇),取消、权限检查、结果记录都一样
- **工具列表变化**:server 通知工具列表变了就重新同步;同步失败保留上一代工具,不会出现"一半新一半旧"
- **断线**:断线期间工具仍在列表里,但调用会失败;重连预算用完后工具被移除,要重载配置或重启才恢复。编辑这一行配置会原地重连

### 7.1 stdio 子进程的环境变量

子进程环境从**清洗过的父进程环境**开始:名字匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的变量和所有 `DSH_*` 变量被删掉,其他照常继承,再叠加你配置的 `env`。所以 server 需要的 token 必须**显式写进 `env`**,指望它从你的 shell 里继承会失败。

---

## 八、资源与 server instructions

**资源**:所有内置 profile 都已挂好 `@deepseek-ai/dsh-mcp-resources`,当前 agent 作用域里有配置好的 server 时,模型多出三个共享工具:

| 工具 | 作用 |
| --- | --- |
| `list_mcp_resources` | 列出某个 server 的资源 |
| `list_mcp_resource_templates` | 列出资源模板 |
| `read_mcp_resource` | 按 URI 读一个资源 |

每次调用都要显式传 `server`,连上 server 时**不会自动拉取任何内容**。二进制内容对模型只显示为描述,完整 JSON 留给程序化调用方(比如 14 篇的 PTC)。

**server instructions**:server 返回的非空 instructions 作为一个带 server 署名的段落进入系统提示,原样字面文本。它在系统提示里,所以 instructions 一变,下一次请求的可复用前缀就变了。

---

## 九、不支持什么:和 Claude Code 对照

| 能力 | Claude Code | dsh |
| --- | --- | --- |
| 传输 | HTTP、stdio,SSE(已弃用)和 WebSocket | 只有 `stdio` 和 `streamable-http` |
| 认证 | 支持 OAuth、`headersHelper` | 源码里没有 OAuth 流程,靠 `headers` 自己带 token |
| 配置来源 | `claude mcp add`、`.mcp.json`、三种作用域 | Cordis patch 行;**不读 `.mcp.json`** |
| 资源 | `@` 引用 | 三个资源工具,按需读 |
| Prompt 模板 | 支持 | 不支持 |
| Elicitation(server 请求用户输入) | 支持 | 不支持 |
| 资源订阅、task 执行扩展 | — | 不支持;要求 task 执行的工具在调用时被拒 |
| 连接超时 | — | 沿用 SDK 的 60 秒默认,没有单独的配置项 |

另外,27 篇的 ACP 入口允许客户端**按会话**挂 MCP server(stdio 或 HTTP),但那条路径只用 MCP 工具,资源和 prompt 没有消费者。

---

## 十、例子:接一个记忆 server

源码仓库的 `apps/cli/config/examples/mcp-memory/` 带了三个默认关闭的参考 overlay:Memorix、MCP 官方的 reference memory、Engram。文档声明它们只是互操作示例,不代表背书。以 Memorix 为例,先按它自己的说明装好可执行文件(dsh 不会替你跑包管理器),再挂上 overlay:

```yaml
# memorix.cordis.yml
- insert:
    - id: memory-memorix
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: memorix
        transport: stdio
        command: memorix
        args: [serve]
        cwd: !!js process.cwd()
```

```bash
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/memorix.cordis.yml"
```

npm 上的 `@deepseek-ai/dsh` 包只发布 `lib/`,不带这个目录,把文件从源码仓库复制到任意位置再传路径即可。想长期生效,把 `insert` 合并进第六节表里的用户 patch 文件,**别直接覆盖**,那里可能已经有别的 patch。

验证方法来自 `docs/user/guide/mcp-memory.md`:在会话 A 里让它记住一个唯一值,新开会话 B(不必重启 Host)问它,确认模型调用了 server 的检索工具。首次发现是异步的,等 `mcp__memorix__*` 工具出现再发第一条消息。

---

## 踩坑

1. **从 Claude Code 搬来的 SKILL.md 没写 `name`**——Claude Code 默认取目录名,dsh 要求 frontmatter 里必须有 `name`,否则整个 skill 被跳过,只在日志里留一条警告
2. **skill 放在 `.claude/skills` 里等它出现**——dsh 不扫这个目录。放进 `.agents/skills` 或 `.dsh/skills`,需要的话反向软链给 Claude Code
3. **用 `when_to_use` 或 `whenToUse` 补充触发场景**——前者不被识别,后者不渲染进模型目录。路由只看 `name` 和 `description`,要写进 description
4. **嵌套目录组织 skill**——只扫一层,`skills/frontend/button/SKILL.md` 不会被发现
5. **正文写得很长**——加载后的正文没有大小上限,会一直留在历史里。标准预设的工具结果修剪器在压缩触发时会把超过 8192 字符的结果剪成头尾两段,官方自带的 skill 都控制在这个长度以内
6. **web profile 里切到 minimal 预设后 skill 全没了**——minimal 没挂 `skill-filesystem` 和 `tool-skill`,这是预设组成决定的,不是 bug
7. **stdio server 读不到 `GITHUB_TOKEN`**——环境变量被清洗了,带 KEY / TOKEN / SECRET / PASSWORD 的名字都会被删,要显式写进 `env`
8. **把远程 server 配成 SSE 或指望 OAuth 弹窗**——只支持 `streamable-http`,认证靠 `headers`
9. **以为 MCP server 跑在沙箱里**——它是 dsh 启动的普通子进程或外部服务,不受 agent 沙箱约束。只接你信任的 server
10. **server 挂了以为工具会自动消失**——断线期间工具还在列表里,调用失败;连续失败 10 次后才移除,之后要重载配置才回来

---

## 源码与文档索引

- `docs/subsystems/skills.md`
- `packages/skill/skill-filesystem/README.md`
- `packages/skill/skill-filesystem/src/index.ts`
- `packages/skill/tool-skill/README.md`
- `packages/bundle/web-app/cordis.patch.yml`
- `packages/bundle/web-app/presets/cordis.patch.yml`
- `docs/subsystems/mcp.md`
- `packages/mcp/mcp-client/README.md`
- `packages/mcp/mcp-resources/README.md`
- `docs/user/guide/mcp-memory.md`
- `apps/cli/config/examples/mcp-memory/memorix.cordis.yml`
- `apps/cli/reference/README.md`

---

下一篇:`23-从Claude-Code迁移.md`,讲一个已经在用 Claude Code 的团队迁到 dsh 时,哪些东西能直接带走、哪些要靠实验性的 hooks 桥和 mods 桥、哪些只能手工改写。
