# Cordis 入门:插件、Context 与服务

第一层的八篇都站在用户这边:装好、配好模型、管住权限和数据外发、用好会话和 plan。从这一篇开始拆内核。01 篇说过 dsh 的官方定位是 "everything-is-a-plugin, powered by Cordis",这句话落到实处,就是 dsh 进程里几乎没有"写死的核心":模型适配器、工具注册表、会话日志,连 agent loop 本身都是挂在同一个 context 上的插件。想读懂后面任何一个子系统,得先认识这个插件框架。

如果你读过 Claude Code 系列,可以这样对照:Claude Code 的主循环和工具管线在闭源程序里,hooks、MCP、skills、插件都是挂在这个固定核心外面的扩展点;dsh 反过来,核心本身就是一组可以替换的插件。

> 一句话先记住:**dsh 的每个能力都是挂在同一个 context 上的 Cordis 插件,插件之间只通过 `ctx.<key>` 这样的服务名和事件找到彼此**。谁来提供 `ctx.tools`、`ctx.llm`,由配置决定,不由 `import` 决定。

---

## 一、为什么一个 harness 要建在插件框架上

`docs/architecture.md` 的说法很直接:产品的每一部分都是插件,"包括模型适配器、工具注册表、会话日志和 agent loop 本身",所以每一部分都能从配置替换;**没有一个需要打补丁的特权核心**,扩展 dsh 的方式就是在其他插件旁边再挂一个插件。

| 维度 | Claude Code | dsh |
| --- | --- | --- |
| 扩展方式 | settings 里配 hooks、MCP、skills、插件 | 往插件树里加一行,或替换某一行 |
| 能不能换主循环 | 不能,在闭源程序里 | 能,`agent-loop` 只是一行配置(12 篇) |
| 能不能换工具管线、会话存储 | 不能 | 能,`tools`、`sessions` 都是服务(13、17 篇) |
| 怎么看到全貌 | 看文档 | `dsh --profile web --dump-config` 打印整棵树(11 篇) |

这种结构换来三样东西,后面几篇会分别展开:

- **一处替换,全局生效**:文件系统和子进程的 provider 换成远程沙箱,Bash、PTY、LSP 跟着一起换过去,不用 fork 任何 provider。仓库把这种"可替换能力"叫 capability seam(能力 seam),写法在 18 篇
- **按会话换组合**:不同 agent 预设挂不同的工具和提示词,一个进程里同时跑好几套组合(11 篇)
- **热重载**:插件卸载时自己的注册会被回收,所以可以在进程不停的情况下替换插件代码(10 篇)

代价也要说清楚:概念多了一层;插件"没加载"时经常一声不吭(第七节);而且 dsh 还是 developer preview,框架层本身也在升级。

---

## 二、Cordis 是什么、从哪来

### 2.1 vendored,而不是 npm 依赖

Cordis 是一个 TypeScript 插件框架。dsh 没有从 npm 装它,而是把源码复制进仓库的 `vendor/` 目录,统一改名到 `@deepseek-ai` scope 下。`vendor/README.md` 给的理由是让 harness "完全拥有自己的框架层(可审计、可打补丁、版本锁定)"。

| 目录 | npm 名 | 上游 | 版本 |
| --- | --- | --- | --- |
| `vendor/cordis` | `@deepseek-ai/cordis` | `cordis`(cordiverse/cordis 的 `packages/core`) | 4.0.0-rc.7 |
| `vendor/loader` | `@deepseek-ai/cordis-plugin-loader` | `@cordisjs/plugin-loader` | 1.0.0-rc.5 |
| `vendor/include` | `@deepseek-ai/cordis-plugin-include` | `@cordisjs/plugin-include` | 1.0.4 |
| `vendor/hmr` | `@deepseek-ai/cordis-plugin-hmr` | `@cordisjs/plugin-hmr` | 1.0.15 |
| `vendor/schemastery` | `@deepseek-ai/schemastery` | `schemastery` | 3.18.0 |

另外还有 `cosmokit`、`group`、`timer`、`logger-console` 几个基础包。

### 2.2 24 处本地修改

同一份 README 维护了一张**本地修改清单**,要求"每一处和上游的分歧都必须列出"。在 0.2.1-rc.2 里一共 24 条,和本系列关系最大的几条:

- 第 6 条:`fiber.ts` 生命周期加固,补了三处重入式卸载的缺口(10 篇)
- 第 11 条:把 Include 的 patch 算法导出成纯函数 `applyEntryPatches`,让 `dsh --dump-config` 和真正挂载用同一套算法(11 篇)
- 第 18 条:行的 `disabled` 字段支持 `!!js` 表达式(10 篇)
- 第 22 条:配置的 volatile 字段,改值不重启插件(10 篇)

`vendor/cordis-rc11-upgrade-plan.md` 里还有一份升级到 rc.11 的计划,状态是 "proposed"。也就是说**你读到的 Cordis 行为以仓库里的 vendored 版本为准**,上游文档和 npm 上的 `cordis` 不一定一致,升级 dsh 后要重新核对。

### 2.3 出处

`vendor/cordis/LICENSE` 是 MIT,版权行写的是 "Copyright (c) 2021-present Shigma"。仓库根目录的 `README.md` 引用了一篇描述 Cordis 设计的论文:*A Programming Paradigm for Spatiotemporal Composability*。除此之外,仓库没有交代 Cordis 的更多来历,本系列也不做推测。

---

## 三、五个核心概念

`docs/cordis-primer.md` 把插件作者需要的 Cordis 知识压缩成五条:

| 概念 | 一句话 | 在 dsh 里的样子 |
| --- | --- | --- |
| **插件** | 挂进 context 的一个单元:函数、带 `apply` 的对象,或 `Service` 子类 | `dsh-tool-bash`、`dsh-agent-loop` 都是插件 |
| **Context 是服务仓库** | 服务占住一个稳定的 `ctx.<key>`,别人按 key 找它,不 import 实现 | `ctx.tools`、`ctx.llm`、`ctx.sessions` |
| **用 `inject` 声明依赖** | 声明了的服务全部就绪才启动,加载顺序靠依赖表达 | `AgentLoop` 要等 6 个服务 |
| **类型化事件** | 用 TypeScript 声明合并注册事件名,按五种模式派发 | `tools/result`、`agent/request` |
| **注册是可回收的副作用** | 提示词片段、工具、适配器、监听器都通过 effect 安装,卸载时自动撤销 | 插件卸载,它注册的工具跟着消失 |

primer 末尾还有一条实践规则:**行为按领域装进插件**——工具管线的事件属于 `ctx.tools`,模型流式输出属于 `ctx.llm`,运行中的 agent 协调属于 `ctx.agents`;拦截和策略用事件,直接调用能力用服务方法。

前三条是本篇的内容,后两条在 10 篇。

---

## 四、三种插件形态

`docs/cordis-tutorial/01-first-plugin.md` 列出了 Cordis 接受的三种形态:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. 函数插件
export function apply(ctx: Context) {}

// 2. 对象插件:带 apply 方法的对象
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. 类插件:Service 子类
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}
```

| 形态 | 什么时候用 |
| --- | --- |
| 函数 | 默认选择:注册几个工具、挂几个监听器 |
| `{ apply }` 对象 | 需要把 `name`、`inject`、`Config` 和 `apply` 打包成一个值传给 `ctx.plugin()` |
| `Service` 子类 | 要对外暴露一个服务,让别的插件通过 `ctx.<key>` 调用 |

被 `cordis.yml` 加载的模块,通常用**具名导出**表达插件:`name`(可选的显示名,用于诊断)、`inject`、`Config`、`apply`。Loader 把整个模块当成一个对象插件来用。

插件跑起来时,Cordis 调用 `apply(ctx, config)`;类插件则用 `new MyService(ctx, config)` 构造。在代码里也可以手动挂载:`ctx.plugin(heartbeat)` 返回一个 **fiber**,是这个插件实例的运行时句柄,生命周期在 10 篇。

---

## 五、Context 与 `ctx.<key>`

### 5.1 context 是个代理

每个插件拿到的 `ctx` 都是它自己的子 context,注册的东西都记在这个插件的 fiber 名下。`docs/cordis-api/context.md` 的描述是:context 是一个 proxy,普通的属性读取会经过服务解析器;`extend()`、`isolate()`、`intercept()` 派生子 context,不修改父 context。

内置在每个 context 上的成员(`docs/cordis-api/inherited.md`):

| 成员 | 用途 |
| --- | --- |
| `ctx.on` / `ctx.once`,`ctx.emit` / `parallel` / `serial` / `bail` / `waterfall` | 事件(10 篇) |
| `ctx.plugin` / `ctx.inject` | 加载插件、声明依赖 |
| `ctx.effect` | 注册可回收的副作用(10 篇) |
| `ctx.get` / `set` / `provide` / `accessor` / `mixin` | 底层服务存取 |
| `ctx.extend` / `isolate` / `intercept` | 派生子 context |
| `ctx.root` / `fiber` / `registry` / `reflect` / `events` / `logger` | 运行时句柄 |
| `ctx.timer`、`ctx.loader` | timer 插件和 Loader 提供 |

### 5.2 读服务要先声明

这一点和直觉不同:**`ctx.xxx` 读服务,前提是当前插件(或它的祖先插件)在 `inject` 里声明了它**。代理会沿 fiber 链往上找已声明服务的快照,一直找到根都没有,就抛:

```text
cannot get property "agents" without inject
```

这句报错在仓库里有一份真实的事故复盘(`docs/postmortem/0001-acp-default-export-drops-inject.md`),第七节的踩坑会细说。可选依赖要换一种读法:

```ts
export function apply(ctx: Context) {
  // 没有 provider 时是 undefined,插件照常运行
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

---

## 六、服务:提供与声明

### 6.1 一个最小服务

改编自 `docs/cordis-tutorial/03-services.md`。提供方 `greeter.ts`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

消费方 `consumer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

组合起来:

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

教程里用 `node --import tsx ../../vendor/cordis/bin.js` 在仓库的 `tmp/cordis-tutorial` 目录跑,输出 `Hello, world!`。把两行对调,输出不变。

### 6.2 运行时和编译期各管一半

- **运行时**:`super(ctx, 'greeter')` 把实例注册在 `greeter` 这个名字下,从此任何插件都能通过 `ctx.greeter` 拿到它。注册本身是一个 effect,提供方卸载,服务随之移除
- **编译期**:`declare module '@deepseek-ai/cordis'` 是 TypeScript 的声明合并,把 `greeter` 加进 `Context` 接口,让 `ctx.greeter` 有类型。它**不生成任何代码**,不写它服务照样能用,只是消费方失去类型检查

不想写类时,也可以用底层的 `ctx.provide(name, value)` 注册一个值。dsh 启动器就是这么做的:在挂载任何配置行之前,先 `provide('profileContext', ...)`,把 profile 位置等启动信息交给插件树(`apps/cli/src/profile-boot.ts`)。

### 6.3 命名

服务名在一个应用里是**一个扁平命名空间**。harness 占用了 `tools`、`llm` 这类短名字,你自己的服务要加前缀或起有辨识度的名字。同一作用域里重复注册同一个名字会直接抛错(`Service` 的构造函数内部走的也是 provide)。想让两组插件各用一份同名服务,要靠 10 篇的 `isolate`。

---

## 七、`inject`:依赖决定加载顺序

### 7.1 PENDING 直到依赖到齐

`inject` 列出插件**必需**的服务。Cordis 会把插件停在 PENDING 状态,直到列表里每个服务都存在,所以 `apply` 里读到的 `ctx.greeter` 一定是就绪的。`cordis.yml` 里的条目**并发启动**,行的先后不保证任何加载顺序。

把上面例子里的 `./greeter.ts` 删掉,consumer 就停在 PENDING:不报错、不输出,进程安静地以 0 退出。10 篇会讲怎么查这种状态。

### 7.2 依赖在运行期持续跟踪

`inject` 不是只在启动时检查一次。运行中如果某个必需服务消失(provider 被卸载或热替换),**所有依赖它的插件也会被卸载**,服务回来时再重新加载。配合 10 篇的可回收注册,这保证了没有插件会拿着一个已经不存在的服务继续跑。

这也是配置里能换 provider 的原因:卸掉 `dsh-bash-local` 这一行、挂一个别的 `shell` provider,所有 inject 了 `'shell'` 的插件会干净地对着新实现重启。

### 7.3 两种写法和一个简写

```ts
// 数组形式:只声明需要哪些服务
export const inject = ['tools', 'systemPrompt']

// 对象形式:服务名 → 给这个插件用的 intercept 配置
export const inject = { tools: {} }
```

`ctx.inject(deps, callback)` 是 `ctx.plugin({ inject, apply: callback })` 的简写,适合在一个插件内部开一块"依赖到齐才执行"的区域,依赖变化时这块会被卸载、重跑。

### 7.4 dsh 里的真实例子

默认主循环 `AgentLoop` 是一个 `Service` 子类,依赖写在 `static inject` 上(`packages/core/agent-loop/src/index.ts`):

```ts
export class AgentLoop extends Service implements AgentFactory {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt', 'sessionProjections']
  // ...
}
```

工具注册表 `ToolRuntime` 只依赖一个服务:`static inject = ['systemPrompt']`,因为工具的 schema 要并进系统提示词。

反过来的例子也有:`AgentLoop` **故意没有** inject `sessionPersistence`。按事故复盘的解释,inject 它会让不需要持久化的演示组合永远 PENDING,等一个永远不会加载的存储后端;所以它把持久化当成可选服务,用 `ctx.get('sessionPersistence')` 读。什么时候写进 `inject`、什么时候用 `ctx.get()`,判断标准就是"没有它,我还能不能工作"。

---

## 八、dsh 里的真实服务

在 `packages/` 下(不含测试)用 `super(ctx, '<key>')` 注册的服务名有 100 多个。主干部分:

| `ctx` key | 类 / 包 | 详见 |
| --- | --- | --- |
| `agents` | `AgentRegistry`,`packages/core/agent` | 12 篇 |
| `agentLoop` | `AgentLoop`,`packages/core/agent-loop` | 12 篇 |
| `sessions` | `SessionStore`,`packages/core/session` | 17 篇 |
| `systemPrompt` | `SystemPrompt`,`packages/core/system-prompt` | 16 篇 |
| `tools` | `ToolRuntime`,`packages/core/tools` | 13 篇 |
| `llm` | `LlmRuntime`,`packages/llm/llm` | 15 篇 |
| `tokenMeter` | `packages/llm/token-meter` | 15 篇 |
| `compaction` | `packages/compaction/compaction` | 16 篇 |
| `ptcRuntime` | `packages/ptc-runtime/ptc-runtime` | 14 篇 |
| `sessionPersistence` | `packages/session/session-persistence` | 17 篇 |
| `spillStore` | `packages/spill/spill` | 13 篇 |
| `sandbox`、`approval` | `packages/sandbox/sandbox`、`packages/interaction/user-approval` | 05、13 篇 |
| `shell`、`fs` | `packages/shell/shell`、`packages/fs/fs` | 18 篇 |
| `agentPresets` | `packages/preset/agent-preset-registry` | 11 篇 |

几点说明:

- `packages/core/scope` 是 core 里唯一**没有** ctx key 的包,它是一个纯函数库,给注册表和主循环提供按 agent 划分作用域的原语(`docs/subsystems/core.md`)
- 扩展插件应该依赖 `agents`,**不要**直接依赖 `agentLoop`,这样主循环才能保持可替换(12 篇)
- 完整的服务名、公开方法和源码位置,生成在各子系统页的 `cordis-surface` 区段里(比如 `docs/subsystems/core.md` 的 "Cordis API" 一节),仓库明确要求不要另外维护一份静态清单

---

## 踩坑

1. **以为 `cordis.yml` 里的行序就是加载顺序**——条目并发启动,顺序只由 `inject` 决定。需要"先 A 后 B",就让 B inject A 提供的服务
2. **插件什么也不打印,也不报错**——大概率停在 PENDING,某个 inject 的服务没人提供。教程里的典型例子是 HMR 插件 inject 了 `timer`,没挂 timer 插件就永远等着。检查方法在 10 篇
3. **没写 `inject` 就直接读 `ctx.xxx`**——会抛 `cannot get property "xxx" without inject`。必需的服务写进 `inject`,可选的用 `ctx.get('xxx')`
4. **在服务方法里用 `this.ctx.xxx` 读可选服务**——事故复盘的第二个根因:跨插件调用服务方法时,代理从服务自己的 fiber 开始只往**祖先**方向找,兄弟分支上的服务找不到,同样抛 without inject。可选服务一律 `ctx.get()`
5. **插件模块末尾多写一行 `export default apply`**——Loader 的 `unwrapExports` 优先取 `default`,拿到的是一个光秃秃的函数,同模块的具名导出 `inject`、`Config`、`name` 全丢了。dsh 的 ACP 桥就因为这一行在接上真实编辑器时崩溃,单测覆盖率 100% 也没发现
6. **只写了 `declare module` 就以为服务注册了**——声明合并只管类型。运行时注册靠 `super(ctx, key)` 或 `ctx.provide()`
7. **给自己的服务起名 `tools`、`shell`**——扁平命名空间,同一作用域里撞名会直接抛 `service "tools" has been registered at <...>`,插件加载失败。加前缀;确实要换掉内置实现,就禁用原来那一行再挂你的(11 篇)
8. **以为 `inject` 只在启动时检查**——provider 卸载时依赖方会被整个卸载、之后重新加载。插件内部状态要能接受被重来一遍
9. **照着上游 cordis 的文档或 npm 版本写插件**——dsh 用的是带 24 处修改的 vendored rc.7,`disabled: !!js`、volatile 字段这类行为上游没有。以 `docs/cordis-api/` 和 `vendor/README.md` 为准

## 源码与文档索引

- `docs/cordis-primer.md`
- `docs/cordis-tutorial/index.md`、`docs/cordis-tutorial/01-first-plugin.md`、`docs/cordis-tutorial/03-services.md`
- `docs/cordis-api/context.md`、`docs/cordis-api/service.md`、`docs/cordis-api/registry.md`、`docs/cordis-api/inherited.md`
- `vendor/README.md`、`vendor/cordis/LICENSE`、`vendor/cordis-rc11-upgrade-plan.md`
- `vendor/cordis/src/reflect.ts`
- `docs/architecture.md`
- `docs/subsystems/core.md`
- `docs/postmortem/0001-acp-default-export-drops-inject.md`
- `packages/core/agent-loop/src/index.ts`、`packages/core/tools/src/index.ts`
- `README.md`

---

下一篇:`10-Cordis进阶-副作用-Fiber与事件.md`,讲可回收的注册为什么让热重载安全、fiber 的状态机、五种事件派发模式,以及配置、`cordis.yml` 行字段与 HMR。
