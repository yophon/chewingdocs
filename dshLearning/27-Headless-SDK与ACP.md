# Headless、SDK 与 ACP

02 篇列过五个 profile:`web`、`headless`、`sdk`、`sdk-minimal`、`acp`。除了 `web`,另外四个都没有界面,都走 stdin / stdout,是把 dsh 嵌进别的系统的入口。这一篇按"谁持有这个 dsh 进程"来讲:脚本和 CI 每次起一个、跑完就走(headless);你的程序长期持有一个子进程、按 JSON-RPC 驱动(SDK);另一个 agent 或自动化程序按标准协议把它当后端(ACP)。

Claude Code 系列的无人值守篇反复强调过一句话:无人值守的关键是"没人回答弹窗时会发生什么"。dsh 也一样,而且答案更硬:**headless 和 SDK 里根本没有审批应答者**,需要人批准的调用一律失败。

> 一句话先记住:**headless 是"一个任务一次进程",SDK 是"你的程序持有一个 dsh 子进程",ACP 是"按标准 ACP v1 给别的程序当 agent 后端"**。前两者没有人能批准任何东西,上线前先用 `DSH_PERMISSION_MODE` 和隔离环境把边界定死;只有 ACP 会把审批请求转发给客户端。

---

## 一、四个无界面入口怎么选

| profile | 进程模型 | 协议 | 审批请求去哪 | 适合 |
| --- | --- | --- | --- | --- |
| `headless` | 一次一个任务,答完退出 | 参数 / stdin 进,文本或 NDJSON 出 | 无人应答,失败关闭 | 脚本、CI、外部 cron |
| `sdk` | 长驻子进程,多会话 | JSON-RPC over stdio | 无人应答,失败关闭 | 自己的程序里嵌完整 dsh |
| `sdk-minimal` | 同上,独立的极简组合树 | 同一套 JSON-RPC | 没有审批服务,`danger-full-access` | benchmark、一次性容器 |
| `acp` | 长驻子进程,多会话 | ACP v1 over stdio | `session/request_permission` 转给客户端 | 外部 agent 调用、测试驱动、自动化控制器 |

几个共同点:**都没有监听端口**;stdout 都是协议专用的,诊断一律走 stderr;`headless`、`sdk`、`acp` 都叠在 `dsh-base` 上,和 Web 共用同一套底座(模型适配器、持久化、沙箱和默认权限预设),`sdk-minimal` 是唯一不继承 base 的。

---

## 二、headless:一个任务一次进程

### 2.1 基本用法

```bash
dsh --profile headless "跑测试,修掉失败的用例"
dsh headless "跑测试,修掉失败的用例"        # profile 简写,名字必须紧跟 dsh
```

任务来自位置参数(多个词用空格拼接),省略或给一个单独的 `-` 时从 stdin 读:

```bash
{ echo "总结这些改动:"; git diff --stat; } | dsh --profile headless
```

注意**给了位置参数就不读 stdin**,想把管道内容喂进去,整段 prompt 都要放在管道里。空白的位置参数、空管道都会在启动 agent 前报用法错误。

工作目录就是你执行命令的目录,新会话会记录它。headless 不挂 Host、HTTP server 和浏览器,**不开任何端口**,跑完自己退出。

### 2.2 默认输出:stdout 只有最终答案

- **stdout**:只有最后一条非空的 assistant 文本。中间的工具输出不打印
- **stderr**:provider 返回的 reasoning 增量以 `dsh: reasoning:` 开头实时写出;失败时写 `dsh: <code>: <message>`
- 没有 reasoning 的成功运行,stderr 为空

reasoning 进 stderr 意味着**重定向和 CI 日志会保留大量可能敏感的模型输出**,在共享日志系统里要注意落到受控的位置。

### 2.3 `--json`:NDJSON 事件流

加 `--json` 后,stdout 换成每行一个 JSON 事件,stderr 只留 `dsh:` 诊断:

| `type` | 字段 | 什么时候 |
| --- | --- | --- |
| `session` | `sessionId`、`cwd` | 第一行,告诉你这次用的会话 id |
| `status` | `phase`:`turn_start` / `step_start` / `step_end` / `turn_end`,带 `turn`、`step`;`step_end` 可能带 `usage`,`turn_end` 带 `reason` | turn 和 step 边界 |
| `text` / `thinking` | `text` | assistant 消息提交时 |
| `tool_call` | `callId`、`tool`、`input` | 工具调用 |
| `tool_result` | `callId`、`status`(`completed` / `error`)、`result` | 工具结果 |
| `final` | `text` | 最后一行,内容和默认模式的答案相同 |
| `error` | `message` | runner 在 turn 之外失败、或用法错误时,代替 `final` |

```json
{"type":"session","sessionId":"session-…","cwd":"/srv/repo"}
{"type":"status","phase":"turn_start","turn":1}
{"type":"tool_call","callId":"…","tool":"bash","input":{"description":"Run tests","command":"pnpm test"}}
{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"completed"}}
{"type":"final","text":"…"}
```

几条要读懂的约定:

- **`text` / `thinking` 是按提交的消息发的,不是逐 token**。被重试或丢弃的尝试不会进流。想看实时进度只有默认模式下 stderr 的 reasoning
- **长度有上限**:除 `final` 外,每个字符串上限 8 KiB(带 `truncated` 标记),每行上限 32 KiB,嵌套 64 层以上会被截断。所以**它是投影,不是会话日志的无损副本**,要完整记录去读会话日志(17 篇)
- **turn 内失败依然以 `final` 结尾**(常常是空的),不会出 `error` 事件。判断成败要看**退出码和 `turn_end` 的 `reason`**,别看有没有 `final`
- profile 自己的插件加载失败时,runner 还没挂上,只有 loader 的 stderr,stdout 一行都没有

### 2.4 `--session-id`:续接上一次

```bash
id=$(dsh --profile headless --json "开始审查 auth 模块" | jq -r 'select(.type=="session").sessionId')
dsh --profile headless --session-id "$id" "现在专注数据库查询"
```

默认每次都是新的 `session-<uuid>`。`--session-id` 采用一个**已持久化**的会话,不存在就直接失败,不会悄悄开一个空会话。拒绝的情况还有:记录的工作目录和当前不一致、会话是子代理或 fork 出来的、它用的 agent preset 不在这个 profile 里、同一进程里已经有活的 agent 占着这个 id。**换了目录续接会失败**,CI 里要在同一个检出路径下跑。

### 2.5 退出码与信号

| 情况 | 退出码 |
| --- | --- |
| 最后一个 `turn/end` 是 `completed` | `0` |
| aborted、error、没有任何 turn、没有 assistant 消息 | `1` |
| 用法错误、会话 id 不可用、Agent 创建失败 | `1` |
| `SIGTERM`(supervisor 正常停止) | `0` |
| `SIGINT`(Ctrl+C) | `130` |

第一次信号开始优雅退出,插件树最多有 **5 秒**完成清理;第二次信号立即强退。如果正常结束时卡在清理阶段,第一次 Ctrl+C 就直接退出。

**启动失败**时(必需插件激活失败),stderr 列出失败和挂起的插件,最后一行 `Full diagnostics:` 指向 `$DSH_HOME/logs/startup-<时间戳>-<uuid>.log`,退出码 1。报告里的原始错误**不脱敏**,可能含配置或凭证值,分享前先看一遍。

### 2.6 凭证:只认环境变量和 `.env`

headless profile 关掉了托管凭证库和账号登录:API key 按"启动环境 → 当前目录 `.env` → `$DSH_HOME/.env`"的顺序解析,**GUI 里保存的 key 和登录状态都被忽略**,需要已保存登录的 provider 会失败。导出一个空值的环境变量会遮住 `.env` 里的值,要 `unset` 掉。

确实要用已保存的凭证,在 `$DSH_HOME/profiles/headless/cordis.patch.yml` 里把三行打开:

```yaml
- id: credentials
  disabled: false
- id: authorization
  disabled: false
- id: deepseek-account
  disabled: false
```

### 2.7 权限:没有人能批准

headless 继承 base 的权限配置:新会话默认 `workspace-write` 预设,approval policy 为 `ask`。问题在于 headless **没有组合任何审批应答者**,`ask` 请求落空后按 `unavailable` 失败关闭。所以在 headless 里:

- 沙箱内能做的(工作区写入、读、联网,见 05 篇)照常执行
- 需要审批的调用(比如申请在沙箱外重跑)**一律不会被批准**,agent 只会拿到失败结果
- `DSH_PERMISSION_MODE` 改的是进程级默认:`read-only`、`workspace-write`、`danger-full-access`。设成 `danger-full-access` 时 approval 变成 `never`,注意 **`never` 是自动拒绝,不是自动批准**;此时沙箱关闭,命令能改运行用户能碰到的任何路径,**只在一次性容器里这么做**

实践上:CI 里保持默认的 `workspace-write`,把任务设计成在工作区内就能完成;需要更多权限时扩大容器边界,而不是关掉沙箱。05 篇有三个预设和各平台沙箱后端的细节。

### 2.8 一个 CI 例子

下面的 GitHub Actions 片段只用了上面核实过的参数。安装方式见 02 篇,版本锁定见 31 篇:

```yaml
name: dsh-nightly-triage
on:
  schedule:
    - cron: "0 15 * * 1-5"
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Run dsh headless
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          DSH_HOME: ${{ runner.temp }}/dsh-home
        run: |
          printf -- "- id: session-log-deepseek\n  config:\n    enabled: false\n" > "$RUNNER_TEMP/ci.cordis.yml"
          npx -y @deepseek-ai/dsh@<锁定的版本> --profile headless \
            --patch "$RUNNER_TEMP/ci.cordis.yml" --json \
            "运行测试,列出失败用例及可能原因,不要修改任何文件" > events.ndjson
          jq -r 'select(.type=="final").text' events.ndjson > summary.md
```

几个设计点:

- **`DSH_HOME` 指向临时目录**,不和机器上的其他 profile、会话、凭证混用
- **用 `--patch` 关掉 session log 上传**:base 默认把完整会话日志随请求发给 `deepseek-official` 路由(06 篇),CI 里处理的代码是否允许外发要先想清楚
- **`--patch` 是启动器参数**,必须写在任务文本之前
- 会话日志落在 `$DSH_HOME` 下,需要留档就把这个目录作为 artifact 上传

---

## 三、SDK:你的程序持有一个 dsh 子进程

### 3.1 `sdk` 与 `sdk-minimal`

| | `sdk` | `sdk-minimal` |
| --- | --- | --- |
| 组合 | `dsh-base` + `dsh-sdk-app` | 独立完整树,不含 base |
| 工具 | base 的完整默认工具(`read`、`write`、`edit` 等) | 只有持久化 shell(Linux / macOS 是 `bash`,Windows 是 `pwsh`,超时 300 秒)、`read_image`、`working_directory` |
| 权限 | `workspace-write` + `ask`(无人应答) | **固定 `danger-full-access`,不挂审批服务** |
| 指令文件 | 加载 `AGENTS.md` / `CLAUDE.md` | 不加载 |
| 设置、托管凭证、遥测 | 有 | 没有托管凭证、设置和 OTel;**session log 上传仍默认开启** |
| 会话 | 标准会话存储 | 未压缩的原始 JSONL,在 `$DSH_HOME/sessions` |

`sdk-minimal` 的 shell 能改运行进程看得见的任何路径,**必须在一次性检出或容器里用**。它的 session log 上传用 `session-log-deepseek.enabled: false` 关闭。

### 3.2 Python SDK

```bash
python -m pip install deepseek-harness-sdk
```

它会装上同版本、对应平台的 `deepseek-harness-runtime-bin` wheel,里面打包了 `dsh` 命令和原生运行时,**正常使用不需要系统 Node.js**。用户指南列的平台是 Linux x64 / arm64、macOS 14+ arm64、Windows x64(runtime 包的 README 额外列了 macOS x64,以实际发布为准),Python 3.10+。

```python
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(
    dsh_home="/abs/path/isolated-dsh-home",
    cwd="/abs/path/workspace",
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    profile="sdk-minimal",
) as harness:
    result = harness.run("检查仓库并修复失败的测试", session_id="example-001")

print(result.final_response, result.finish_reason)
```

要点:

- **必须显式给 Harness home**(`dsh_home` 或子进程环境里的 `DSH_HOME`),SDK 故意不读 `~/.dsh`
- 默认 profile 是 `sdk`,仓库里的 `python/sdk/examples/minimal.py` 和用户指南选的是 `sdk-minimal`
- 子进程懒启动,在 `with` 退出前复用;握手默认 30 秒超时,普通 turn 不设上限,除非给 `request_timeout_seconds`
- `run()` 返回 `RunResult(session_id, final_response, finish_reason, events, notifications)`;`finish_reason` 是最后一个 `turn/end` 的 `kind`,比如 `completed`、`max-tokens`、`error`
- `harness.resume_session(saved_id)` 恢复持久化会话(要用同一个 home 和工作区),不会恢复 shell、浏览器等外部进程
- 定制走 profile:持久的用 `dsh plugin --profile sdk add …` 和 profile 的 `cordis.patch.yml`,单次的传 `patches=(...)`

### 3.3 TypeScript SDK

`@deepseek-ai/dsh-sdk-client` 提供同样的两层:

```ts
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

await using harness = new DeepSeekHarness({
  profile: 'sdk',
  patches: ['./automation.cordis.yml'],
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
})
const result = await harness.run('say hi')
console.log(result.finalResponse)
```

`DeepSeekHarness.run()` 的 `finalResponse` 是"这段活动区间里最后一条提交的 assistant 文本",**不是因果上属于这条 prompt 的回答**,中途插进来的消息也可能贡献输出。底层的 `HarnessClient` 提供 `prompt()`(立即返回 message id)、`subscribe()` 和 `request('session/wait', …)`,适合要自己管理活动边界的程序。和 Python 版不同,TS 客户端不带打包好的运行时,要能解析到同版本的 `@deepseek-ai/dsh` 或显式给 `dshBin`。

### 3.4 协议要点与限制

SDK 协议是 stdio 上的换行分隔 JSON-RPC:

| 方法 / 通知 | 作用 |
| --- | --- |
| `initialize` | 就绪边界,校验 provider / model / reasoning effort 后才接受 prompt |
| `session/prompt` | 排入一条用户消息,立即返回 `{ messageId }` |
| `session.event` / `session.status` | 服务端推送的持久事实和 agent 生命周期变化 |
| `session/resume` | 恢复持久化会话,不重放历史通知 |
| `session/wait` | 等子代理和由此触发的根 turn 都结束 |
| `session/working-directory/get` / `set` | 读写会话目录 |
| `shutdown` | 清理后退出 0 |

限制要心里有数:**没有取消方法**,放弃一个 turn 只能关掉进程;**服务端到客户端的请求没有实现**,所以 SDK 里没有审批回调,这和 Claude Agent SDK 的 `can_use_tool` 不同;协议版本没有协商,预发布阶段不承诺兼容。

另外,仓库根的 `BENCHMARK.md` 还写着运行 "`jsonrpc-agent` minimal variant",这是旧名字,现在对应的是 `sdk-minimal` profile。

---

## 四、ACP:标准协议的 agent 后端

### 4.1 定位

`dsh --profile acp` 在 stdio 上提供 ACP(Agent Client Protocol)v1 服务。包 README 的定位很明确:**automation-only**,面向进程外子代理、测试驱动和脚本化控制器;DSH 自己的展示卡片、计划、标题、todo、终端视图和 elicitation 都不上线。24 篇讲的 `@deepseek-ai/dsh-subagent-acp` 就是仓库自带的客户端,用它把另一个 dsh 当子代理调用。

任何 ACP v1 客户端理论上都能连上来,但编辑器里常见的 plan、mode、命令、终端、客户端文件系统操作这里都不支持,接编辑器之前先确认你要的交互在下表里。

### 4.2 支持什么

| 调用 | 说明 |
| --- | --- |
| `initialize` / `authenticate` | ACP v1;不需要认证 |
| `session/new` | 绝对路径的 `cwd`,可附带 stdio 或 Streamable HTTP 的 MCP server |
| `session/list` / `session/resume` / `session/close` | 跨进程重启的持久会话;resume 不重放历史 |
| `session/set_config_option` | 切换 `model`、`reasoning_effort` |
| `session/prompt` / `session/cancel` | 每个会话同时只有一个 prompt |
| `session/update` | 提交后的消息与思考、工具生命周期、配置变化、上下文用量 |
| `session/request_permission` | **审批请求转给客户端**,一次性 allow / reject |

不支持:`session/load`、删除、fork、额外目录、SSE 传输的 MCP、modes、commands、plans、terminals、客户端文件系统、elicitation。MCP 只用工具,不用 resources 和 prompts。

### 4.3 两个安全含义

- **ACP 客户端是受信任的控制器**:`session/new` 里给的 stdio MCP 条目会以绝对命令和环境变量直接执行,HTTP 条目带着你给的 URL 和 header 连接。谁能连上这个 stdio,谁就能让 dsh 跑任意命令
- **审批是客户端答的**:客户端可以自动回答 allow。用 ACP 时,"谁在批准"取决于你的客户端实现,不是 dsh

默认路由在 `acp-app` 里是 `deepseek-official` + `deepseek-v4-flash`,用 patch 替换 `dsh-acp` 行的整个 config 可以改。

---

## 五、和 Claude Code 对照

| | Claude Code | dsh |
| --- | --- | --- |
| 一次性运行 | `claude -p "…"` | `dsh --profile headless "…"` |
| 事件流 | `--output-format stream-json` | `--json`,按提交的消息发,有长度上限 |
| 续接 | `--resume <session_id>`、`--continue` | `--session-id <id>`,限同一目录、同一 preset |
| 结构化输出 | `--json-schema` | 无对应参数 |
| 无人审批 | `--allowedTools`、`--permission-mode auto` / `dontAsk`、`--permission-prompts none` | 没有应答者,`ask` 失败关闭;用 `DSH_PERMISSION_MODE` 选预设 |
| 干净可复现运行 | `--bare` 跳过自动发现 | 每个 profile 就是确定的组合树;`DSH_HOME` 指向独立目录 |
| 程序内嵌 | Claude Agent SDK(Python / TS) | Python `deepseek-harness-sdk`、TS `@deepseek-ai/dsh-sdk-client` |
| 审批回调 | `can_use_tool` | 不支持(服务端到客户端请求未实现) |
| 中断 | `ClaudeSDKClient.interrupt()` | SDK 无取消方法;ACP 有 `session/cancel` |
| 标准协议 | 无 | ACP v1(自动化用途) |

两边的共同教训:**脚本里的 agent 一定要事先决定权限边界**。不同的是,Claude Code 给了一整套放行规则和分类器,dsh 现阶段只给了三个预设加沙箱,剩下的靠隔离环境兜底。

---

## 踩坑

1. **headless 里一堆调用失败,agent 说"权限被拒"**——没有审批应答者,`ask` 落空即失败。把任务设计在 `workspace-write` 能完成的范围内,或在一次性容器里换预设
2. **以为 `DSH_PERMISSION_MODE=danger-full-access` 只是"自动批准"**——它同时关掉沙箱,approval 变成 `never`(自动拒绝)。只在一次性容器里用
3. **用"有没有 `final` 事件"判断成功**——turn 内失败也会以空 `final` 结尾。看退出码和 `turn_end.reason.kind`
4. **把 `--json` 输出当完整记录**——字符串 8 KiB、每行 32 KiB 封顶,它是投影。完整记录读会话日志
5. **GUI 里登录过,headless 却报凭证错误**——headless 只读环境变量和 `.env`。导出了空变量还会遮住 `.env`
6. **CI 换了检出路径后 `--session-id` 续接失败**——会话记录的 cwd 必须一致
7. **`--patch` 写在任务文本后面**——它是启动器参数,任务文本之后的都交给 app。顺序是 `dsh --profile headless --patch x.yml "任务"`
8. **Python SDK 找不到配置和会话**——它从不读 `~/.dsh`,必须显式给 `dsh_home`
9. **在宿主机上直接跑 `sdk-minimal`**——它固定 `danger-full-access`,shell 能改任何可见路径。用一次性检出或容器,且记得它仍默认上传 session log
10. **以为 ACP 客户端只是"显示器"**——它能在 `session/new` 里注入 MCP 命令,还替你回答审批。只让受信任的程序连接

## 源码与文档索引

- `apps/cli/README.md`
- `apps/cli/reference/README.md`
- `docs/cli-help.md`
- `packages/bundle/headless/README.md`、`packages/bundle/headless/cordis.patch.yml`
- `packages/bundle/headless/src/json-stream.ts`
- `packages/bundle/base/cordis.patch.yml`
- `packages/interaction/user-approval/README.md`
- `docs/user/guide/python-sdk.md`、`python/sdk/README.md`、`python/sdk-runtime/README.md`
- `packages/sdk/client/README.md`、`packages/sdk/server/README.md`、`packages/sdk/protocol/README.md`
- `packages/bundle/sdk-app/README.md`、`packages/bundle/sdk-minimal/README.md`
- `packages/acp/acp/README.md`、`packages/bundle/acp-app/README.md`
- `BENCHMARK.md`

---

下一篇:`28-Webhook-GitHub审查与公网部署.md`,讲实验性的 webhook 怎么把外部事件变成新会话、GitHub PR 审查的配置,以及把 Web UI 放到公网时的反向代理、TLS 和信任配置。
