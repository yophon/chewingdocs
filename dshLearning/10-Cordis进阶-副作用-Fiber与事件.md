# Cordis 进阶:副作用、Fiber 与事件

09 篇讲了 Cordis 的"空间"一面:插件挂在 context 上,通过服务名找到彼此,`inject` 决定谁先谁后。这一篇讲"时间"一面:插件会被卸载、重载、热替换,它注册过的东西怎么跟着消失;插件实例在生命周期里处于什么状态;插件之间不靠服务、只靠事件怎么协作。最后讲配置怎么从 `cordis.yml` 流进插件,以及这一切怎么让热重载成为可能。

这一篇的大部分内容在 `docs/cordis-tutorial/` 的 02、04、05、06 章里都有可运行的例子。下面以机制为主,遇到教程和 primer 说法不一致的地方,以 `vendor/cordis` 的源码为准。

> 一句话先记住:**通过 Cordis API 做的注册都是挂在 fiber 上的 effect,插件卸载时按相反顺序自动撤销**。热重载、按会话挂插件树、换 provider,全都建立在"卸载一定能收拾干净"这个前提上。但它只收拾进程里的注册,收拾不了已经发生在外部世界的事。

---

## 一、可回收的注册

### 1.1 effect:装上时给出拆的方法

Cordis 自己不管理的资源(定时器、连接、文件监视器),用 `ctx.effect()` 包起来,返回一个 disposer。改编自 `docs/cordis-tutorial/02-lifecycle-and-effects.md`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}
```

effect 的函数体在注册时立刻执行,返回的 disposer 在两种情况下运行,先到者为准:你手动调用 `ctx.effect()` 的返回值,或者所属 fiber 卸载。重复调用 disposer 是空操作。effect 体也可以是 generator,每 `yield` 一个 disposer 就登记一个(`docs/cordis-api/fiber.md`)。

### 1.2 大部分注册本来就是 effect

日常很少需要自己写 `ctx.effect()`,因为内置的注册 API 已经是 effect:

| 注册 | 卸载时发生什么 |
| --- | --- |
| `ctx.on(event, listener)` | 监听器被移除 |
| `ctx.plugin(child)` | 子插件随父插件一起卸载 |
| `super(ctx, key)` / `ctx.provide()` | 服务被注销,依赖它的插件跟着卸载 |
| `ctx.tools.register(...)` 等 harness 注册表 | 注册表把 disposer 挂到**调用方**插件上,工具随之注销 |

最后一行是 dsh 的约定:`ToolRuntime.register()` 内部就是把插入操作包成一个按作用域登记的 effect(`packages/core/tools/src/index.ts`)。提示词片段、模型适配器、命令也是同样的模式。

### 1.3 顺序和并发

- disposer **按注册的相反顺序**启动
- 多个**异步** disposer 会并发运行。几个清理步骤必须串行时,把它们放进同一个 disposer 里依次 `await`
- `fiber.dispose()` 会等所有清理(包括异步的)完成后才 resolve,并递归卸载它挂载的子插件
- dsh 的本地修改(`vendor/README.md` 第 6 条)禁止在 UNLOADING 状态下新建 effect,防止清理过程中"溜出去"的注册;对已经 DISPOSED 的 fiber 调用 `effect()` 会抛 `INACTIVE_EFFECT`

### 1.4 它让什么变得安全,又收拾不了什么

因为卸载一定会撤销注册,下面这些操作才是安全的:

- **热重载**:卸载旧插件、加载新代码,旧代码注册的工具和监听器不会残留
- **换 provider**:卸掉一个 `shell` 实现,所有依赖方干净地对着新实现重启(09 篇)
- **按会话的插件树**:agent 预设给某个会话挂一组工具,预设被替换或释放时这组注册整体撤销(11 篇)

但 effect 只管**进程内的注册**。下面这些已经发生的事,任何 disposer 都撤不回:

- 模型通过 Bash 跑过的命令、写过的文件、发出去的网络请求
- 已经追加进会话日志的事件(会话是 append-only 的事实源,17 篇)
- 插件激活失败后的半成品状态。`vendor/README.md` 写明 Loader 对条目、分组、树的修改是"急切的、非事务的",失败时**不会**恢复之前的插件或配置

---

## 二、Fiber:插件实例的状态机

每个被加载的插件实例都有一个 fiber,`ctx.plugin()` 返回的就是它,插件内部通过 `ctx.fiber` 拿到自己的。状态迁移:

```text
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

| 状态 | 含义 |
| --- | --- |
| `PENDING` | 已声明,但某个 inject 的服务还不存在 |
| `LOADING` | `apply` 正在执行 |
| `ACTIVE` | `apply` 执行完毕 |
| `FAILED` | `apply` 抛错,或配置校验失败 |
| `UNLOADING` | disposer 正在运行 |
| `DISPOSED` | 全部拆除完毕 |

fiber 上还有几个常用方法:`fiber.await()` 等当前生命周期工作结束并重新抛出启动错误;`fiber.restart()` 用当前配置卸载再加载;`fiber.update(config)` 先校验新配置,再经过 `internal/update` waterfall 决定怎么重启(HMR 和 volatile 字段就是在这里接管的)。

### 2.1 查 PENDING

PENDING 是合法状态,provider 可能稍后才挂上,所以 Cordis 不会为它报错。`docs/cordis-tutorial/06-composition-and-hmr.md` 给了一个诊断插件:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

在 dsh 里不用自己写:启动时可选插件停在等待状态会打一条警告;必需插件起不来时,启动报错会列出 pending 插件和缺的服务(11 篇)。Web 的 Creator 预设还挂了 `cordis_inspect_list` / `cordis_inspect_query` 两个工具,让模型自己查运行中的插件树。

---

## 三、类型化事件

### 3.1 声明、派发、监听

服务适合直接调用;事件让一个插件宣布某件事,而不必知道谁在听。声明方式和 09 篇的服务一样是声明合并,只是合并进 `Events` 接口:

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

// 派发方
ctx.emit('stats/report', 'tool_call', 1)

// 监听方:ctx.on 是 effect,插件卸载时自动移除
ctx.on('stats/report', (name, count) => {
  console.log(`[stats] ${name} -> ${count}`)
})
```

事件名按 `namespace/action` 命名。监听方要拿到类型,需要一行 `import type {} from '<声明所在模块>'` 把声明合并引进来,运行时什么也不导入。

`ctx.on` 的第三个参数可以是 `{ prepend: true }`(排到已有监听器前面)或 `{ global: true }`(无视 context 过滤)。dsh 的很多事件用派发时的 `this` 做过滤,文档里标作 "Scope-filtered dispatch":比如 `approval/request` 的 `this` 是 `Scoped<Agent>`,只挂在某个 agent 作用域上的监听器只会收到那个 agent 的请求。

### 3.2 五种派发模式

派发模式是事件公开约定的一部分,harness 事件在源码里用 `@mode` 标注,生成的子系统页上每个事件标题后面都写着模式。下表按 `vendor/cordis/src/events.ts` 的实现整理:

| 模式 | 调用 | 框架是否 await | 返回值 |
| --- | --- | --- | --- |
| `emit` | `ctx.emit(name, ...args)` | 否,同步调用,监听器返回的 promise 不等也不收集 | 无 |
| `parallel` | `await ctx.parallel(...)` | 是,所有监听器并发,`Promise.allSettled` 后有失败就抛 `AggregateError` | 无 |
| `serial` | `await ctx.serial(...)` | 是,按顺序逐个 await | 第一个非 `null` / `false` / `undefined` 的返回值,并停止后续 |
| `bail` | `ctx.bail(...)` | 否,`serial` 的同步版 | 同上 |
| `waterfall` | `ctx.waterfall(...args, next)` | 否,同步组合 | 最外层监听器的返回值 |

dsh 里各模式的分布大致是(按 0.2.1-rc.2 的 `docs/subsystems/*.md` 英文页统计):`emit` 约 60 个、`waterfall` 17 个、`parallel` 3 个、`serial` 2 个(`agent/created`、`agent/turn-stopping`),`bail` 没有出现。典型例子:

- `tools/result`(emit):工具结果产生时广播,观察者用
- `session/flush`(parallel):持久化检查点,所有监听器都跑完调用方才继续
- `agent/request`、`approval/request`、`tools/pre-execute`(waterfall):可以包装、改写或直接给出答案的决策点

### 3.3 waterfall:环绕式中间件

waterfall 是拦截能力的来源。每个监听器收到参数和一个 `next()` 续体:调用 `next()` 把控制交给下一个监听器(最后是派发方传入的默认行为);不调用就**短路**,后面的监听器和默认行为都不会执行。改编自 `docs/cordis-tutorial/04-events.md`:

```ts
// 监听器 1:包装下游结果
ctx.on('demo/transform', async (input, next) => {
  const downstream = await next()
  return downstream.toUpperCase()
})

// 监听器 2:自己拿主意时短路
ctx.on('demo/transform', async (input, next) => {
  if (input.includes('blocked')) return '** blocked **'
  return next()
})

await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words')
// → '** BLOCKED **'
```

先注册的在外层。要排到最外层,用 `prepend: true`。

**关于"是否 await"的说法分歧**:`docs/cordis-primer.md` 的表把 waterfall 标成"不 await",教程却写 `await ctx.waterfall(...)`。两者其实不矛盾,看源码就清楚:`waterfall()` 只是同步地把监听器串成一条 `next` 链,然后返回最外层监听器的返回值,框架自己不 await 任何东西。harness 的 waterfall 事件签名都是 `next: () => Promise<T>`,监听器是 async 函数,所以返回值是 promise,调用方要 `await`。换句话说,**异步与否由事件签名决定,不由派发模式决定**。

由此得出仓库的硬规矩:**只观察或只做标注的 waterfall 监听器必须调用 `next()`**。一个忘了调 `next()` 的日志监听器会悄无声息地吞掉所有下游行为,包括默认实现。

---

## 四、配置:从 `cordis.yml` 到 `apply`

### 4.1 Schemastery 校验

插件导出一个和接口同名的 `Config` schema,Loader 在 `apply` 之前校验,校验失败 fiber 进入 FAILED,插件不会带着半套配置启动。改编自 `docs/cordis-tutorial/05-config.md`:

```ts
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})
```

Cordis 接受任何 Standard Schema 校验器,所以导出一个普通对象当 `Config` 是不行的。dsh 自己的包统一用 Schemastery,常见写法是 `import z from '@deepseek-ai/schemastery'`。

### 4.2 volatile 字段:改值不重启

用 `.volatile()` 标记"每次操作时现读"的字段。改它不会重新挂载插件,值通过一个稳定引用的 `.get()` 读:

```ts
export const Config = Schema.object({
  greeting: Schema.string().default('Hello').volatile(),
})

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  ctx.on('loader/volatile-update', () => {
    console.log(config.greeting.get())
  })
}
```

只改了 volatile 字段时,Loader 校验新值、写进运行中的引用,并向这个插件实例发一次 `loader/volatile-update`(带变更路径);同时改了普通字段,则走正常的重新挂载。dsh 里的例子是 `agent-preset-registry` 行的 `selectedDefault`:用户在界面上换默认预设,不用重启注册表。插件作者视角的写法在 20 篇。

### 4.3 `!!js` 表达式

dsh 用的 Loader 支持 `!!js` 标签,**只在两个位置生效**:

| 位置 | 什么时候求值 | 对着谁求值 | 例子 |
| --- | --- | --- | --- |
| `config` 里的值 | 该行声明的 inject 全部就绪之后 | 这个插件自己的 context | `port: !!js ctx.webStartup.port ?? 3080` |
| `disabled` | 每次决定挂不挂载时 | Loader 的 context | `disabled: !!js process.platform === 'win32'` |

`name`、`id`、`inject` 等其他元数据保持字面量,写成 `!!js` 只会被当成一个普通的真值。第一行例子来自 `dsh-web-app` 的 `webserver` 行,它在同一行写了 `inject: [webStartup]`,保证求值时 `ctx.webStartup` 已经存在;`disabled` 支持 `!!js` 是 dsh 的本地修改(`vendor/README.md` 第 18 条)。

---

## 五、`cordis.yml`:配置文件就是插件树

### 5.1 行字段

| 字段 | 作用 |
| --- | --- |
| `id` | 这一行的稳定身份,Loader 靠它区分"改了一行"和"删一行加一行" |
| `name` | 模块说明符:相对路径、npm 包名,或 `cordis:group` 这类内置名 |
| `config` | 传给插件的配置;对分组行来说是子条目列表 |
| `disabled` | 保留条目但不挂载;改回来,插件和所有等它服务的插件重新加载 |
| `group` | 标记为分组,`config` 里的子列表作为一个整体加载和卸载 |
| `inject` | 给这一行追加必需服务,常用来让 `config` 里的 `!!js` 能读到某个服务 |
| `isolate` | 给这一行(通常是分组)一份独立的同名服务 |

### 5.2 `isolate`:同名服务各用一份

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'
```

再写一个同样结构、`timeoutMs: 60000` 的 `group-b`,两组插件各自看到自己组里的 Bash 实例,互不影响(`docs/user/develop/framework/service.md`)。`isolate` 的值写 `true` 是只属于这一行的作用域;写一个字符串标签,则所有用同一标签的行共享一个作用域(`vendor/loader/src/config/isolate.ts`)。代码里对应的 API 是 `ctx.isolate(name, label?)`。

dsh profile 里分组通常写成内置名 `cordis:group`。11 篇会看到:agent 预设里如果要**提供**服务,provider 和它的消费方必须放进同一个带 `isolate` 的分组。

### 5.3 不写 `id` 的代价

没有 `id` 的条目每次读文件都会分到一个新生成的 id。于是配置文件任何一处改动之后,它都算"删了又加",即使自己那几行没变也会重新挂载。dsh 自带的 bundle 每一行都写了 `id`,你的 patch 也应该这样。

---

## 六、HMR:把卸载和加载拼成热替换

有了"卸载一定收拾干净"和"加载按依赖进行",热替换就是卸载旧实例、加载新代码。dsh profile 里负责这件事的是 `@deepseek-ai/dsh-hmr`(服务 key 仍是 `hmr`),它取代了 vendored 的 `@deepseek-ai/cordis-plugin-hmr`,并把模块替换、Include 刷新和 profile 配置变更放进同一个串行队列。

| 配置 | 默认 | 含义 |
| --- | --- | --- |
| `root` | `["."]` | 监视源码的根目录;`[]` 只保留显式的配置文件监视 |
| `ignored` | `["**/node_modules", "**/.*", "cache", "data"]` | 排除的路径 |
| `debounce` | `100` | 合并模块变更的毫秒数 |
| `base` | context 的 base URL | 模块监视的基准目录 |

两个前提:HMR inject 了 `timer` 服务做防抖,没挂 timer 插件它就一直 PENDING;它通过 logger 服务输出,没有控制台 exporter 就看不到它的日志。

在教程的组合里,保存 `hello.ts` 会看到 `hmr reload plugin at hello.ts`,旧实例卸载、新代码的 `apply` 重新执行。编辑配置文件本身也会被捕获:Loader 按 `id` 对比条目,只挂载、卸载或重新配置变了的那些。

base bundle 给 HMR 配的是 `root: []`,也就是**默认只热重载配置,不监视源码**;headless、SDK、ACP 直接禁用了这一行。profile 级的热重载怎么工作、怎么打开源码监视,在 11 篇和 18 篇。几条已知限制(`packages/boot/hmr/README.md`):

- 模块替换依赖 Node loader 的内部接口
- 只沿静态 import 追踪;动态 `import()` 拿到的旧模块,下次调用时才会求值新文件
- 替换后导入或启动失败的插件保持失效,README 写明**不会恢复旧版本**,要等文件或依赖修好

---

## 七、接回 harness

`docs/cordis-tutorial/07-into-the-harness.md` 用上面全部的模式,往真实的 harness 服务上挂了一个工具和一个观察者:

```ts
// greet-tool.ts 与 tool-logger.ts 都声明 inject = ['tools']
ctx.tools.register(defineTool({ name: 'greet', /* parameters、output、execute */ }))

ctx.on('tools/result', (exec, result) => {
  console.log(`[tool-logger] ${exec.name}`)
})
```

组合里还要列上 `@deepseek-ai/dsh-system-prompt`,因为 `dsh-tools` inject 了 `systemPrompt`,否则工具注册表自己就停在 PENDING。对照前面几节:`inject` 等注册表就绪,`register()` 的 disposer 挂在调用方插件上,`tools/result` 是 emit 事件,观察者不影响结果。两个插件互不知道对方存在,只靠注册表服务和事件连在一起。`defineTool` 的完整写法在 19 篇,工具管线上的那几个 waterfall 在 13 篇。

---

## 踩坑

1. **waterfall 监听器里只打日志、忘了调 `next()`**——下游监听器和默认行为全被吞掉,而且没有任何报错。只观察的监听器必须 `return next()`
2. **以为 primer 表里的"waterfall 不 await"意味着不能 await**——框架只是不替你 await;harness 的 waterfall 签名是异步的,调用方要 `await` 返回的 promise
3. **用 `emit` 派发、指望拿到监听器的返回值或等它们执行完**——emit 不收集也不等待。要等全部完成用 `parallel`,要第一个答案用 `serial`
4. **在 `apply` 里直接 `setInterval`、开连接,不包 effect**——插件卸载或热重载后它们还在跑,而且越重载越多。Cordis 不管理的资源一律放进 `ctx.effect()`
5. **几个异步 disposer 之间有先后依赖**——它们会并发执行。放进同一个 disposer 里按顺序 `await`
6. **以为插件卸载能"撤销"它做过的事**——effect 只回收进程内的注册;跑过的命令、写过的文件、追加过的会话事件都撤不回,失败的激活也不会自动回滚
7. **在 `name`、`inject` 里写 `!!js`**——只有 `config` 和 `disabled` 会求值,其他字段里的表达式被当成普通真值,行为出乎意料
8. **`config` 里的 `!!js` 读了一个服务,却没在这一行写 `inject`**——求值时服务可能还不存在。像 `webserver` 行那样同时写上 `inject: [webStartup]`
9. **patch 里的行不写 `id`**——每次改配置文件它都会被当成新行重新挂载;也没法被后面的层按 id 覆盖(11 篇)
10. **开了 HMR 以为改源码会自动生效**——dsh 默认的 HMR 是 `root: []`,只重载配置。要监视源码得在 profile patch 里给 `hmr` 行配 `root`

## 源码与文档索引

- `docs/cordis-tutorial/02-lifecycle-and-effects.md`、`docs/cordis-tutorial/04-events.md`、`docs/cordis-tutorial/05-config.md`
- `docs/cordis-tutorial/06-composition-and-hmr.md`、`docs/cordis-tutorial/07-into-the-harness.md`
- `docs/cordis-primer.md`
- `docs/cordis-api/events.md`、`docs/cordis-api/fiber.md`、`docs/cordis-api/inherited.md`
- `vendor/cordis/src/events.ts`、`vendor/cordis/src/fiber.ts`
- `vendor/loader/src/config/entry.ts`、`vendor/loader/src/config/isolate.ts`
- `vendor/README.md`(本地修改第 6、8、18、22 条)
- `docs/user/develop/framework/service.md`
- `packages/boot/hmr/README.md`
- `docs/subsystems/approval.md`、`docs/subsystems/session.md`(事件模式示例)
- `packages/bundle/web-app/cordis.patch.yml`(`webserver` 行)

---

下一篇:`11-启动装配-Bundle-Profile与Patch.md`,讲一个运行中的 dsh 是怎么拼出来的:bundle → profile → home → `--patch` 四层叠加、按行 id 整体替换、`--dump-config`,以及启动失败策略。
