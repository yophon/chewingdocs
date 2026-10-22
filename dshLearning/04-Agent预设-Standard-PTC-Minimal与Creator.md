# Agent 预设:Standard、PTC、Minimal 与 Creator

前三篇讲的都是进程级的东西:装哪个 profile、接哪个模型。真正决定"这个 agent 能做什么"的,是会话级的 **agent 预设**。在 Web UI 里新建任务时,输入框旁边有一个模式选择器,选的就是预设。Claude Code 里没有完全对应的概念:它的工具集基本固定,能调的是权限和子代理定义;dsh 的预设则是**一棵为这次会话单独挂载的插件子树**,工具、人设、上下文注入、压缩策略都在里面。

> 一句话先记住:**选预设就是选模型能看到的工具和工作方式。预设在任务开始时确定,只影响之后新建的会话;它不是安全边界,能不能真的执行由权限和沙箱决定**。

---

## 一、预设是什么

### 1.1 一次会话一棵子树

`dsh-web-app` bundle 用 `presets/` 下的四个 patch 文件各插入一行 `@deepseek-ai/dsh-agent-preset` 声明,由 `dsh-agent-preset-registry`(`ctx.agentPresets`)统一管理:

| 预设 id | 中文界面 | 英文界面 | 排序 | 声明文件 |
| --- | --- | --- | --- | --- |
| `standard` | 标准模式 | Standard mode | 1(默认) | `presets/standard.patch.yml` |
| `ptc` | PTC 模式 | PTC mode | 2 | `presets/ptc.patch.yml` |
| `minimal` | 极简模式 | Minimal mode | 3 | `presets/minimal.patch.yml` |
| `cordis` | 创造模式 | Creator mode | 4 | `presets/cordis.patch.yml` |

注意 Creator 的内部 id 是 `cordis`,文档、日志和 patch 里看到的都是这个名字。

几个关键事实:

- **宿主共享一个 agent loop**,每个 agent 只看到自己所选预设里的工具、prompt 分段和 skills。一个进程里可以同时跑标准模式和 PTC 模式的会话
- 每个预设声明在启动时就会挂载成独立的作用域和插件树;修改声明会产生新版本,**已有会话继续用旧版本,新会话才用新版本**
- 会话日志记下所选的预设 id,重启恢复时按这个 id 找当前定义,找不到就拒绝恢复
- 声明、作用域和版本回收的机制属于启动装配和 Cordis 的范围,见 11 篇和 09 篇

### 1.2 只有 Web 和 Desktop 有预设

预设是 `dsh-web-app` 的一部分。headless、sdk、acp 三个 profile 不经过预设,直接使用 `dsh-base` 里进程级的工具行(内容大致相当于标准模式);web bundle 则把这些进程级工具行禁用,交给预设接管。所以下文的界面操作只适用于 Web 和 Desktop。

---

## 二、四个预设各挂了什么

### 2.1 总览

下表按 `packages/bundle/web-app/presets/*.patch.yml` 整理,工具名是模型实际看到的名字:

| 能力 | 工具 / 命令 | standard | ptc | minimal | cordis |
| --- | --- | --- | --- | --- | --- |
| 指令文件 | 加载 `AGENTS.md` / `CLAUDE.md`,上限 65,536 字节 | ✓ | ✓ | — | ✓ |
| 时间上下文 | 注入当前时间 | ✓ | ✓ | — | ✓ |
| Shell | `bash`(Windows 上是 `pwsh`) | 普通 | 普通 | **持久**,超时 300 秒 | 普通 |
| 文件 | `read` `write` `edit` `read_image` | ✓ | ✓ | 仅 `read_image` | ✓ |
| 检索 | `glob` `grep` | ✓ | ✓ | — | ✓ |
| 后台任务 | `job_list` `job_output` `job_kill` | ✓ | ✓ | — | ✓ |
| 定时提醒 | `schedule_create` 等 4 个 | ✓ | ✓ | — | ✓ |
| Skills | `skill` | ✓ | ✓ | — | ✓,外加插件开发 skills |
| Goal | `/goal`,`create_goal` `get_goal` `update_goal` | ✓ | ✓ | — | ✓ |
| Plan mode | `exit_plan_mode` | ✓ | ✓ | — | ✓ |
| 上下文压缩 | 自动压缩 + `/compact` | ✓,加工具结果裁剪 | 同左 | ✓ | 同 standard |
| 子代理 | `subagent` `subagent_fork` `send_message` `interrupt_agent` `list_agents` | ✓ | ✓ | — | ✓ |
| Workflow | `workflow` | ✓ | **禁用** | — | ✓ |
| 协作 | `ask_user_question` `todo_write` | ✓ | ✓ | — | ✓ |
| 联网 | `web_search` `web_fetch` | ✓ | ✓ | — | ✓ |
| 交付文件 | `present` | ✓ | ✓ | — | ✓ |
| 运行时检查 | `cordis_inspect_list` `cordis_inspect_query` | — | — | — | ✓ |
| 插件管理 | `plugin_manager` `plugin_market` | 禁用 | 禁用 | — | 通过 profile 启动时启用 |
| 工具呈现 | | 跟随部署 | **固定 PTC** | 跟随部署 | 跟随部署 |

另外两点:

- 宿主层的 `working_directory`(查看或切换会话目录)不属于任何预设,四个预设都能用
- 在插件页开启子代理的模型选择后,新会话的 `subagent` 工具会多出 `provider` / `model` 等参数和一个 `list_subagent_models` 工具(24 篇)

### 2.2 standard:标准模式

默认预设,人设前缀是 <code v-pre>You are a coding agent powered by the {{model}} model.</code>,其中 <code v-pre>{{model}}</code> 会替换成当前模型。它把 dsh 的日常能力几乎全挂上了:文件读写、检索、shell、后台任务、skills、plan、goal、子代理、workflow、todo、联网。

界面说明:"处理代码、文件和资料,适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。"

这些能力分别在后面的章节展开:plan / goal / todo 见 08 篇,子代理见 24 篇,workflow 见 25 篇,后台任务和定时提醒见 26 篇,skills 见 22 篇。

### 2.3 ptc:PTC 模式

和标准模式只有两处不同:

1. 多了一行 `@deepseek-ai/dsh-agent-tool-presentation`,`mode: ptc`。模型**只看到 `run_code` 一个可直接调用的工具**,外加一份从其余工具生成的 SDK;它写 TypeScript 程序,在程序里循环、分支、并发地调用工具
2. `workflow-ptc` 和 `workflow` 两行被禁用,PTC 模式下没有 `workflow` 工具

PTC 这个缩写在仓库的用户文档(`docs/`)里没有展开;Web UI 预设帮助对话框的文案把它解释为 Programmatic Tool Calling,"即通过程序调用工具"。同一份文案还说明了两点:程序里的每次工具调用**仍会被记录,也仍受工具权限约束**;工具返回的数据先交给程序筛选、计算、合并,再把结果交给模型。

PTC 模式需要宿主里有 PTC 运行时(base bundle 默认挂了 `@deepseek-ai/dsh-ptc-runtime-node`);没有的话,这个预设在挂载时就被拒绝,而不是等到第一次请求才失败。`run_code`、生成的 SDK、子调用怎么走完整管线,是 14 篇的内容。

### 2.4 minimal:极简模式

极简模式刻意做减法:

- 人设是固定的完整 system prompt:`You are a helpful software engineer assistant.`(`complete: true`),**不注入运行时上下文,不加载 `AGENTS.md` / `CLAUDE.md`**
- 工具只有持久 shell(`bash` 或 `pwsh`,状态跨调用保留,单次超时 300 秒)、`read_image` 和宿主层的 `working_directory`
- 保留自动压缩和 `/compact`,没有工具结果裁剪

界面说明是"适合测试和对比其基础表现",帮助对话框也强调:它适合作为实验和对照测试的基线,"工具少,不代表对新手更容易"。Python SDK 的 `sdk-minimal` profile 用的是同一套思路(02 篇)。

### 2.5 cordis:创造模式(Creator)

在标准模式的基础上增加三样东西:

- `@deepseek-ai/dsh-tool-cordis`:`cordis_inspect_list`、`cordis_inspect_query` 两个只读的运行时检查工具,让 agent 能看到当前插件树
- `skill-filesystem` 额外挂载 `@deepseek-ai/dsh-agent-preset` 包里的 `skills/`:`agent-experience`、`cordis-plugin-development`、`editing-cordis-compositions`、`cordis-composition-reference`
- `plugin_manager` 和 `plugin_market` 两个工具在通过 profile 启动时启用(其他预设里是禁用的)。`plugin_manager` 的每个动作都要求 `danger-full-access` 权限,或者对这一次调用单独审批

它的用途是"用对话定制 DSH":让 agent 写插件、加界面、组合工具和提示词做出新的预设。插件开发和 Creator 的完整流程见 20 篇。

---

## 三、什么时候换

| 场景 | 选 | 理由 |
| --- | --- | --- |
| 日常改代码、修 bug、整理资料 | standard | 能力最全,默认就是它 |
| 批量处理一堆文件或数据,再筛选、去重、统计 | ptc | 中间结果留在程序里,只把汇总交给模型 |
| 测模型的"裸"能力、做 A/B 对照 | minimal | 变量最少,不受指令文件和辅助工具影响 |
| 给 dsh 加工具、加界面、做自己的预设 | cordis | 带插件开发 skills 和插件管理工具 |

帮助对话框里有一句值得记住:"标准模式也能编写脚本、批量处理文件;PTC 改变的是工具调用方式,批量任务并不必须使用 PTC。"速度和 token 用量取决于具体任务。

### 3.1 进程级开关 `DSH_TOOLS_MODE`

```bash
DSH_TOOLS_MODE=ptc dsh web
```

- 取值 `native` 或 `ptc`,其他值在启动时报错;不设就是 `native`
- `web` 和 `headless` 两个 bundle 的 `tools` 行读取它。patch 注释明确写着这是 **TEMPORARY workaround**,等 Web 界面能按会话选择呈现方式后会移除
- 在 Web 里,它决定"跟随部署"的预设(standard、minimal、cordis)用哪种呈现;`ptc` 预设不受它影响,永远是 PTC
- headless 没有预设,想让 headless 任务用 PTC,目前只能靠它

---

## 四、在界面里切换、设默认、定制

### 4.1 切换与默认

- **新建任务时**在模式选择器里选("选择新任务使用的 Agent 预设")。预设**在任务开始时确定**,会话头部显示的是"本任务的 Agent 预设"
- **设置 → Agent 预设** 里,每张卡片有 **设为新任务默认** 和 **查看配置**。默认值写进 `agent-preset-registry` 这一行的 `selectedDefault` 字段,保存在当前 profile 的 `cordis.patch.yml`;部署默认是 `standard`
- **查看配置** 以只读 YAML 显示这个预设挂了哪些插件,`!!js` 条件也原样显示,是核对工具清单最快的办法
- **设置 → 通用设置 → 显示代码工作视图** 默认开启。关掉后,新建任务的菜单只剩标准模式、创造模式和自定义预设;已保存的内置 PTC 或极简默认值会被重置为标准模式,已有会话不受影响

### 4.2 改预设的内容:界面里不行

这一点仓库文档有出入。`packages/bundle/web-app/README.md` 写着 Agent 预设页面可以"编辑预设的子插件",但更具体的几处都说不能:

- `ui-agent-preset` 的 README:设置页"什么都不编辑",创作统一引导到创造模式
- `agent-preset-registry` 的 README:注册表不写任何声明,也不接受回传的 YAML
- `plugin-manager` 的 README:Agent 预设的行在 Web 里保持只读,插件管理器不能编辑预设的组合

以 0.2.1-rc.2 的实际行为为准:**界面只能选和看,不能改**。要定制有两条路。

**路一:让创造模式帮你做。** 设置 → Agent 预设 里的"让 Agent 帮我创建预设模式",或插件页 **添加插件** 菜单里的"让 Agent 创建插件",都会开一个创造模式任务。注册表 README 给出的官方形态是:新预设或对内置预设的覆盖,做成一个 bundle patch(插入一行 `@deepseek-ai/dsh-agent-preset`,或按行 id 覆盖已有声明),再用 `plugin_manager` 装进 profile。

**路二:自己写 patch。** 预设声明就是普通的 Cordis 配置行,按通用的 patch 机制可以在 profile 的 `cordis.patch.yml` 里插入。比如加一个只读调研预设:

```yaml
- insert:
    - id: preset-reader
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: reader
        name: 只读调研
        description: 只读文件和检索,不写文件、不跑命令
        order: 5
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: You are a coding agent powered by the {{model}} model.
          - id: agent-instructions
            name: '@deepseek-ai/dsh-agent-instructions'
            config:
              maxBytes: 65536
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
            config:
              write: false
              edit: false
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
```

写之前知道三件事:

- 这条路是 patch 机制本身允许的,但官方用户文档推荐的是路一。叠加规则、按行 id 替换的细节见 11 篇
- **覆盖内置预设会替换整个子插件列表**,以后 dsh 升级给内置预设加了新工具,你的覆盖版本不会自动合并,要自己跟进
- 预设里如果要放服务行(而不只是工具),需要用 `cordis:group` 加 `isolate` 隔离,就像内置预设里的 `planning`、`compaction` 那样(09、11 篇)

### 4.3 预设同时也是子代理类型

`subagent` 工具可以让子代理用另一个预设:配置 `agentPreset` 指定默认值,配置 `allowedAgentPresets` 后模型可以通过 `agent_preset` 参数自己挑。只有进程内的 spawn 支持这一点,fork 和外部后端会拒绝。这让"定义一个只读审查预设,再让主 agent 派子代理用它"成为可能,细节见 24 篇。

---

## 踩坑

1. **以为切了只读预设就安全了**——预设决定模型看得到哪些工具,不是安全边界;YAML 和插件都能执行宿主代码。帮助对话框原话:"实际可执行的操作仍由权限设置决定"。边界看 05 篇
2. **会话进行到一半想换预设**——预设在任务开始时确定,新建任务再选
3. **改了预设定义,老会话没变化**——已有会话继续用旧版本,只有新会话用新定义
4. **在设置页找不到编辑预设内容的地方**——0.2.1-rc.2 的界面只能设默认和查看配置,定制走创造模式或手写 patch。`web-app` README 里"可以编辑"的说法和其他几份文档不一致
5. **覆盖了 `standard` 之后,升级没拿到新工具**——覆盖会替换整个子插件列表,不会自动合并内置预设的后续变化
6. **找不到 PTC 和极简模式**——**设置 → 通用设置 → 显示代码工作视图** 被关了。打开后菜单里才有这两个
7. **headless 里想选预设**——headless、sdk、acp 不经过预设;要 PTC 用 `DSH_TOOLS_MODE=ptc`
8. **长期依赖 `DSH_TOOLS_MODE`**——patch 注释标明这是临时方案,之后会移除,升级时核对
9. **在极简模式里纳闷 agent 不遵守 `AGENTS.md`**——极简模式不加载指令文件,也不注入运行时上下文
10. **PTC 模式下让 agent 跑 workflow 脚本**——PTC 预设禁用了 `workflow` 工具,需要 workflow 就换标准模式

---

## 源码与文档索引

- `packages/bundle/web-app/presets/standard.patch.yml`
- `packages/bundle/web-app/presets/ptc.patch.yml`
- `packages/bundle/web-app/presets/minimal.patch.yml`
- `packages/bundle/web-app/presets/cordis.patch.yml`
- `packages/bundle/web-app/cordis.patch.yml`
- `packages/bundle/web-app/README.md`
- `packages/preset/agent-preset-registry/README.md`
- `packages/preset/agent-preset/README.md`
- `packages/core/agent-tool-presentation/README.md`
- `packages/client/ui-agent-preset/README.md`
- `packages/client/ui-agent-preset/src/client/locales.ts`
- `packages/client/ui-agent-preset/src/client/guide-locales.ts`

---

下一篇:`05-权限-审批与沙箱.md`,讲 sandbox mode 和 approval policy 两个维度、三个权限预设、各平台的沙箱后端,为什么默认不限制读和网络,以及提权重试怎么审批。
