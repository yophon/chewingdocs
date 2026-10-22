# 启动装配:Bundle、Profile 与 Patch

09、10 篇用一个手写的 `cordis.yml` 讲 Cordis:列几行插件,Loader 按依赖把它们挂起来。真实的 dsh 进程不是这样来的。你敲下 `dsh web` 时,没有哪个文件完整写着"web 版 dsh 由哪些插件组成";这棵插件树是启动时从**几层 patch** 叠出来的。02 篇从用户角度讲过 profile 和 `$DSH_HOME` 的目录布局,这一篇拆开看它怎么拼装、按什么规则覆盖、出错时怎么处理。

读完这篇,你应该能回答三个问题:某一行配置是从哪一层来的;我写的 patch 为什么没生效(或者生效得太彻底);某个插件起不来时,dsh 是报错退出还是继续运行。

> 一句话先记住:**运行中的 dsh = 一个空列表 + 按顺序叠上去的 patch 层**:bundle 的 patch → profile 的 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch`。patch 按行 `id` 定位,**整块替换** `config`,不做深合并。想知道最终挂了什么,别猜,跑 `--dump-config`。

---

## 一、三个名词

| 名词 | 是什么 | 在哪声明 |
| --- | --- | --- |
| **bundle** | 一个 npm 包,发布一组 Cordis 配置行和它们挂载的代码 | 包的 `package.json` 里 `dsh.bundle.patch`,指向一个或一组 patch 文件 |
| **profile** | 一个具名组合,存在 Harness home 里:选哪些 bundle、装了哪些额外插件、用户自己的覆盖 | `$DSH_HOME/profiles/<name>/package.json` 里 `dsh.profile.bundles` |
| **patch** | 对配置行的一组操作:插入、按 id 覆盖、禁用 | YAML 列表,bundle 和 profile 各自带一份 |

bundle 的声明(`packages/bundle/headless/package.json`):

```json
{
  "name": "@deepseek-ai/dsh-headless",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

`patch` 也可以是一个有序数组,`dsh-web-app` 就列了五个文件:`./cordis.patch.yml` 之后是 `./presets/standard.patch.yml`、`ptc`、`minimal`、`cordis` 四个预设文件。

一个自定义 profile 最少只要这样一个 `package.json`(`packages/bundle/base/README.md`):

```json
{
  "name": "my-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base"]
    }
  }
}
```

profile 目录里还有这些东西:

| 文件 | 作用 |
| --- | --- |
| `package.json` | profile 清单 + 通过 `dsh plugin` 装的树外插件依赖 |
| `cordis.patch.yml` | 用户自己的 patch 层 |
| `cordis.yml` | 根配置,**每次启动都被重写成空列表 `[]`**,不要编辑 |
| `node_modules/` | pnpm 装的树外插件 |
| `compatibility.json` | 可选,版本豁免记录(见 6.2) |

根 `cordis.yml` 之所以存在,只是因为 Loader 需要一个真实文件把 base URL 锚定在 profile 目录。源码注释写得很清楚:整个组合都是 patch 层,而 Loader 的回写机制可能把组合后的行"烤"进这个文件,下次启动就会重复插入,所以每次都重写(`apps/cli/src/profile-boot.ts`)。

---

## 二、随包发布的 bundle 和 profile

### 2.1 六个 bundle

| bundle | 角色 |
| --- | --- |
| `@deepseek-ai/dsh-base` | 共享核心:模型、工具、持久化、sandbox 与 approval、设置、凭证、遥测 |
| `@deepseek-ai/dsh-web-app` | 浏览器界面层,外加 agent 预设注册表和四个预设声明 |
| `@deepseek-ai/dsh-headless` | 一次性任务 runner,不起 Host、HTTP 和浏览器 |
| `@deepseek-ai/dsh-sdk-app` | SDK 的 JSON-RPC stdio 服务 |
| `@deepseek-ai/dsh-acp-app` | 只做自动化的 ACP stdio 服务 |
| `@deepseek-ai/dsh-sdk-minimal` | **独立的**完整最小树,不叠在 base 上 |

### 2.2 五个 profile 模板

| profile | 组合 | 配置变更 |
| --- | --- | --- |
| `web` | base + web-app | 运行中热重载 |
| `headless` | base + headless | 只在启动时应用 |
| `sdk` | base + sdk-app | 只在启动时应用 |
| `sdk-minimal` | sdk-minimal 单独一个 | 只在启动时应用 |
| `acp` | base + acp-app | 只在启动时应用 |

这五个名字第一次使用时自动从模板初始化。其他不存在的 profile 会直接报错,并提示你跑 `dsh plugin --profile <name> add <package>`;`dsh --profile <name> --from-default-profile <template>` 可以把一个自定义 profile 重置成某个模板的新副本。`desktop` 是 Electron 应用保留的名字,CLI 拒绝启动它。

### 2.3 base 插了什么

`packages/bundle/base/cordis.patch.yml` 是**一个 `insert`,一次插入 96 行**。按领域归一下类(都是行 id):

| 领域 | 代表行 |
| --- | --- |
| 模型 | `llm`、`llm-deepseek`、`llm-deepseek-account`、`llm-pi-ai`、`llm-retry`、`token-meter` |
| 会话 | `session`、`session-persistence-jsonl`、`session-query-sqlite`、`session-log-deepseek`、`session-telemetry-otel` |
| 工具与管线 | `tools`、`tool-bash` / `tool-pwsh`、`tool-fs`、`tool-web`、`spill-local`、`spill-policy`、`tool-result-pruner` |
| 提示词与上下文 | `system-prompt`、`agent-instructions`、`skill`、`compaction-basic` |
| 安全 | `sandbox`、`sandbox-policy`、`bash-sandbox` / `pwsh-sandbox`、`fs-sandbox`、`approval`、`permission` |
| 主循环与子代理 | `agent`、`agent-loop`、`ptc-runtime`、`subagent`、`goal`、`plan-mode` |
| 框架与管理 | `timer`、`hmr`、`plugin-manager`、`config-editor`、`settings`、`credentials` |

文件头注释有两句值得记住:**行序不携带加载语义**(激活靠服务可用性,分组只是给人看的);**随模式变化的值不放在 base**,base 里这类行只保留中性默认,由各模式 bundle 重述完整配置。比如 base 的 `system-prompt` 行是 `personaPrefix: ''`,web、headless、acp 各自再覆盖一次。

平台差异也写在行上:`bash-sandbox` 和 `tool-bash` 带 `disabled: !!js process.platform === 'win32'`,`pwsh-sandbox` 和 `tool-pwsh` 用相反的表达式,所以每台机器上恰好只有一套 shell 工具。

---

## 三、四层叠加

`packages/boot/app-boot/src/profile-context.ts` 的 `readProfilePatches()` 就是这几行:

```text
空列表 []                         ← profiles/<name>/cordis.yml
 ← 1. 各 bundle 的 patch          ← 按 dsh.profile.bundles 顺序,bundle 内按 dsh.bundle.patch 的文件顺序
 ← 2. profile 的 cordis.patch.yml
 ← 3. $DSH_HOME/cordis.patch.yml  ← 机器级偏好,所有 profile 共享
 ← 4. --patch <path>              ← 命令行覆盖层,可重复,按出现顺序
 ← (5) DSH_TELEMETRY_DISABLED 非空时,追加一条禁用 session-telemetry-otel 行的 patch
```

几点容易误会的地方:

- **后面的层赢**,按行计算。注意第 3 层排在第 2 层后面:**home 级的 patch 比 profile 级的优先级高**。理由是机器级偏好应该对每个 profile 生效
- 第 5 步是启动器自动加的,遥测开关的完整说明在 06 篇。它不影响默认开启的 session log 上传
- bundle 名先从 dsh 安装目录解析,再从 profile 的 `node_modules` 解析。所以内置 bundle 永远和当前运行的 `dsh` 同一版本
- 所有层在**同一个 Include 层级**上作为兄弟 patch 列表依次应用。dsh 修改了 Include 的 patch 算法(`vendor/README.md` 第 11 条):`insert` 进来的行会立刻被索引,后面的层才能按 id 改到前面层插入的行

`docs/architecture.md` 还提到一种针对预设的 patch,在预设声明的 `config.plugins` 里按同样的层序应用;本篇只讲按行 id 覆盖整个预设的做法(第八节),更细的形式请对照你所用版本的文档。

---

## 四、patch 语义

### 4.1 三种操作

```yaml
# 插入新行(不带 id:追加到根列表)
- insert:
    - id: tool-str-replace-editor
      name: '@deepseek-ai/dsh-tool-str-replace-editor'
      config:
        maxOutputChars: 16000

# 按 id 覆盖一行的配置
- id: system-prompt
  config:
    personaPrefix: You are a careful reviewer.

# 禁用一行
- id: hmr
  disabled: true
```

第一段来自 base README,是打开默认不挂的 `str_replace_editor` 工具的官方写法。

### 4.2 规则(`vendor/include/src/index.ts` 的 `applyEntryPatches`)

| 情况 | 结果 |
| --- | --- |
| `insert` 不带 `id` | 追加到根列表 |
| `insert` 带 `id`,目标是分组行 | 追加进该分组的 `config` 子列表;目标不存在或不是分组,警告并跳过 |
| 非 insert 的 patch 没写 `id` | 警告,当作空操作 |
| `id` 找不到目标 | stderr 警告,继续启动 |
| 写了 `name` 但和目标的 `name` 不一致 | 视为断言失败,警告并跳过这条 patch |
| 其余字段(`config`、`disabled`、`isolate`、`inject`……) | **逐个整体替换**目标的同名字段 |

最后一行就是"整块替换":你在 patch 里写的 `config` 会**完全取代**下层的 `config`,没写到的字段不会保留下层的值,而是退回插件 schema 的默认值。base、web-app 的 README 和 patch 注释反复强调这一点:覆盖一行时,要重述你想保留的每个字段。

另外两条文件级规则:**空文件或只有注释的 patch 文件会让启动失败**,想表达"这一层什么也不做"就写 `[]`;`insert` 行里的 `./`、`../` 相对路径按 patch 文件所在目录解析,也可以写绝对路径或 file URL。

### 4.3 一个真实的 bundle patch

`packages/bundle/headless/cordis.patch.yml` 全文 43 行,把四种用法都用上了(节选):

```yaml
- id: system-prompt
  config:
    personaPrefix: >-
      You are a coding agent powered by the {{model}} model.

- id: tools
  config:
    mode: !!js process.env.DSH_TOOLS_MODE

- insert:
    - id: headless-startup
      name: '@deepseek-ai/dsh-headless/startup'
    - id: headless-runner
      name: '@deepseek-ai/dsh-headless'
      inject: [headlessStartup]
      config:
        task: !!js ctx.headlessStartup.task
        sessionId: !!js ctx.headlessStartup.sessionId
        json: !!js ctx.headlessStartup.json

- id: hmr
  disabled: true

- id: credentials
  disabled: true
```

对照 10 篇:`headless-runner` 行写了 `inject: [headlessStartup]`,所以它 `config` 里的 `!!js ctx.headlessStartup.task` 会等 `headless-startup` 提供的服务就绪后才求值。`credentials`、`authorization`、`deepseek-account` 三行被禁用,注释说明一次性任务用启动时的凭证,不用交互式凭证存储。

---

## 五、看清最终组合:三个 dump

```bash
dsh --profile web --dump-default-config
dsh --profile web --patch ./extra.yml --dump-config
dsh --profile web --dump-config-schema
```

| 参数 | 包含哪些层 | 输出 |
| --- | --- | --- |
| `--dump-default-config` | 只有 bundle 层;不接受 `--patch` | 可加载的 YAML |
| `--dump-config` | bundle + profile + home + `--patch` | 可加载的 YAML,注释标出每行来自哪个文件、被哪些层改过;`!!js` 原样保留不求值;找不到目标的 patch 在 stderr 上带层标签报告 |
| `--dump-config-schema` | 同 `--dump-config` | JSON Schema 2020-12,描述条目列表和 patch 列表,`x-cordis` 里带诊断 |

三个参数互斥,都不接受 app 参数,都会顺手初始化缺失的 profile 文件,但不启动插件树。`--dump-config-schema` 有一点要特别注意:它会**导入**组合里每个模块来读 schema,等于执行插件代码。只对你已经信任的 profile 跑。

`docs/architecture.md` 的建议是:dump 出来的任何一行,都可以用你自己的 patch 替换。

---

## 六、启动顺序

### 6.1 从敲命令到插件树就绪

按 `apps/cli/src/bin.ts` 和 `apps/cli/src/profile-boot.ts` 的执行顺序:

1. **解析参数**:启动器只认自己的参数,遇到第一个不认识的 token 起,后面全部原样交给 profile,插件通过 `ctx.cmdlineArgs` 读。`dsh --profile web --port 8080` 里的 `--port` 属于 web 应用
2. **加载 `.env` 层**:当前目录的 `.env` 高于 `$DSH_HOME/.env`,两者都低于真实环境变量。`PATH`、`DSH_*`、`XDG_*` 这类决定启动方式的变量不接受从文件读;四个代理变量只从 home 的 `.env` 读,不从当前目录读(03 篇)
3. **安装代理**:按环境快照设置 `fetch` 的代理
4. **加载 profile**:必要时先按 `--from-default-profile` 重置;解析 bundle,逐个检查 bundle 自己的 `engines.dsh`。读不了或不兼容的 bundle 被**跳过**并在启动时打印一次;profile 和用户 patch 的错误则直接让启动失败
5. **重写根 `cordis.yml`** 为空列表
6. **计算运行时模块解析表**:从安装目录和所选 bundle 的依赖图算出一张不可变的表,在任何配置行挂载之前装进 Node 的 ESM 和 CommonJS 解析器
7. **读入 `--patch` 文件**,内容在这次运行里冻结
8. **boot**:先在根 context 上 provide `profileContext`、启动环境快照、`pluginPackages`、`cmdlineArgs`;再挂载根 Include,应用组合好的 patch。导入每个插件之前做版本准入检查
9. Loader 按服务可用性激活各行;启动审计通过后标记应用就绪,HMR 从这时起才开始处理变更

SIGINT 和 SIGTERM 都会先卸载整棵树再退出:SIGINT 退出码 130,SIGTERM 是 0。

### 6.2 `engines.dsh` 准入

- 插件或 bundle 的 `package.json` 声明了 `engines.dsh`,就**只看它**,忽略 peer 依赖
- 没声明时,所有对 `@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-*` 的 peer 依赖范围都必须匹配
- 两者都没有,不做约束;预发布版本参与范围匹配
- 被拒的普通行变成一个脱离的 `disabled: true` 行,模块不会被导入;被拒的 bundle 整个跳过
- 精确版本的豁免记在 profile 的 `compatibility.json`,由 Plugin Manager 管理(20 篇)

app-boot README 明说:**这些检查不是针对恶意代码的沙箱**,只防版本不匹配。

### 6.3 必需与可选:失败了怎么办

启动审计把配置行分成两类。**必需行**的全局列表是:`agent-loop`、`webserver`、`web-runtime`、`modules`、`connection`、`headless-runner`、`acp`、`sdk-jsonrpc-server`。profile 里没有、或者被显式禁用的必需行不参与审计。

| 失败类型 | 可选行 | 必需行 | 之后的配置热重载 |
| --- | --- | --- | --- |
| 根配置或 patch 文件缺失、读不了、格式错 | 停止启动 | 停止启动 | 拒绝这次修改,运行中的配置不变 |
| 模块导入失败、`apply` 抛错、配置校验失败、`!!js` 求值抛错 | 警告,继续 | 停止启动 | 报错,其他插件照常,修正后可激活 |
| inject 的服务一直没有 | 警告,继续等 | 停止启动 | 继续等,补上 provider 后激活 |
| HTTP 端口绑定失败 | 警告,没有这个端点继续跑 | 停止启动 | 进程继续,修正配置后恢复 |
| `apply` 之外的游离异步任务产生未处理 rejection,或同步回调抛未捕获异常 | 致命:卸载整个应用,非零退出 | 同左 | 同左 |

"停止启动"意味着卸载已挂载的插件、退出码 1。CLI 会打印失败插件、原始堆栈、pending 插件和缺失的服务,并把完整诊断写到 `$DSH_HOME/logs/startup-<timestamp>-<uuid>.log`。这份日志**不做脱敏**,原始错误里可能带配置值或凭证,分享前先检查。

注意表格最后一列:运行中的配置热重载**不会**重新做必需行审计,也**不会**整体回滚一次更新。

---

## 七、运行中改配置:谁会重载

- **web**:base 的 `hmr` 行在有 `profileContext` 时启用,配置是 `root: []`。它监视 profile 的 `package.json`(只在 `dsh.profile.bundles` 列表变化时重载)、profile 的 patch 和 home 的 patch,有变化就**把所有层重新组合一遍**,在一个串行队列里应用,成功后发 `app-boot/config-reload` 事件
- **headless、sdk、acp**:各自的 bundle 把 `hmr` 行禁用了,改配置要重启;`sdk-minimal` 干脆没有这一行
- **`--patch` 文件**:启动时读一次就冻结,运行中改它不会生效
- 想让 web 也监视源码,在 profile patch 里覆盖 `hmr` 行:

```yaml
- id: hmr
  disabled: false
  config:
    root: ["."]
```

插件开发时怎么配合 `--patch` 和 HMR 迭代,在 18 篇。

---

## 八、agent 预设:插件树里的插件树

04 篇从用户角度讲过 Standard、PTC、Minimal 和 Creator 四个预设。装配层面,它们是 `dsh-web-app` 插进来的普通配置行:

- 一行 `agent-preset-registry`(提供 `ctx.agentPresets`,`config.default: standard`)
- 四行 `@deepseek-ai/dsh-agent-preset` 声明:`preset-standard`、`preset-ptc`、`preset-minimal`、`preset-cordis`(Creator),各在 `presets/*.patch.yml` 里
- 同时 web-app 把 base 在 Host 层挂的一批模型工具行(`tool-bash`、`tool-fs`、`tool-jobs`……)禁用掉,改由各预设在自己的 `plugins` 列表里挂

每个声明的 `config` 有 `id`、`plugins`(一个普通的 Cordis 条目列表)和可选的 `name`、`description`、`order`。注册表为每个声明的每个修订版本**急切地**创建一个作用域和一棵内存里的 Loader 树,选中这个预设的 agent 绑定到这棵树上,树里插件的注册通过作用域只对这些 agent 可见。定义改了,新会话用新版本,已经在跑的 agent 保留原来的修订(`packages/preset/agent-preset-registry/README.md`)。

预设里如果要**提供**服务,provider 和所有消费方必须放进同一个 `cordis:group` 并声明 `isolate`。Minimal 预设里的压缩就是这么写的:

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
```

改一个内置预设,就按它的行 id 写覆盖,整块替换 `config`,所以要重述 `id`、`order` 和完整的 `plugins` 列表;新增预设则用 `insert` 插一行声明,打包成 bundle 安装(20 篇)。注册表 README 特别提醒:**预设不是安全沙箱**,YAML 和插件都能执行 Host 代码。

---

## 踩坑

1. **覆盖一行时只写了想改的那个字段**——整个 `config` 被替换,其他字段退回插件默认值,bundle 设的值全丢。重述要保留的字段,改完跑 `--dump-config` 核对
2. **以为 profile 的 `cordis.patch.yml` 优先级最高**——home 级 `$DSH_HOME/cordis.patch.yml` 排在它后面,`--patch` 又排在两者之后
3. **直接编辑 profile 目录里的 `cordis.yml`**——每次启动都被重写成 `[]`,改动不会留下。改 `cordis.patch.yml`
4. **想清空一层 patch,留了个空文件**——空文件或纯注释文件会让启动失败,写 `[]`
5. **patch 的 id 写错了却没发现**——只在 stderr 打一行警告,启动照常。`--dump-config` 会带层标签列出没匹配上的 patch
6. **在 patch 里给 `webserver` 写死 `port: 8080`**——原来的 `!!js ctx.webStartup.port ?? 3080` 被整块替换掉,命令行的 `--port` 从此不起作用
7. **运行中改 `--patch` 文件等着它热重载**——覆盖层每次运行只读一次;headless、sdk、acp 更是连 HMR 都没开
8. **在 base 组合上再挂一个 `dsh-fs-local`**——和 `fs-sandbox` 重复注册 `ctx.fs`,profile 直接加载失败。Windows 上切换 shell 也一样,两组行要成对地一关一开
9. **对来路不明的插件跑 `--dump-config-schema`**——它会导入模块、执行代码;`engines.dsh` 准入也只防版本不匹配,不防恶意代码
10. **改了预设定义,期待当前会话立刻换上**——已经在跑的 agent 保留原来的修订,新开一个会话验证

## 源码与文档索引

- `packages/bundle/README.md`、`packages/bundle/base/README.md`、`packages/bundle/base/cordis.patch.yml`
- `packages/bundle/headless/cordis.patch.yml`、`packages/bundle/acp-app/cordis.patch.yml`
- `packages/bundle/web-app/package.json`、`packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/presets/minimal.patch.yml`
- `packages/boot/app-boot/README.md`(Profiles、Startup and reload failures 两节)
- `packages/boot/app-boot/src/profile-context.ts`
- `apps/cli/README.md`、`apps/cli/reference/README.md`
- `apps/cli/src/bin.ts`、`apps/cli/src/profile-boot.ts`、`apps/cli/src/args.ts`
- `vendor/include/src/index.ts`(`applyEntryPatches`)
- `docs/architecture.md`
- `packages/boot/hmr/README.md`、`packages/boot/plugin-manager/README.md`
- `packages/preset/agent-preset/README.md`、`packages/preset/agent-preset-registry/README.md`

---

下一篇:`12-Agent-Loop-turn-step与可替换的主循环.md`,讲 turn 与 step、inbox、`agent/*` waterfall 和 AgentFactory 接缝,以及主循环为什么能整个换掉。
