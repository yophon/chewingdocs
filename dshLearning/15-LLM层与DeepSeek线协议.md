# LLM 层与 DeepSeek 线协议

12 篇讲主循环时,每个步骤(step)里都有一句"调用模型";13、14 篇讲模型返回的工具调用怎么执行。这一篇补上中间那一层:**loop 和模型厂商之间到底隔着什么**。dsh 在这里放了一个与厂商无关的服务 `ctx.llm`,所有厂商细节都关在 adapter 里;DeepSeek 官方路由走的是 Anthropic 兼容的 Messages 协议,另外再带几个 dsh 自己定义的请求头和请求体字段。

用户视角的模型选择、凭证和 reasoning effort 在 03 篇讲过,怎么亲手写一个 adapter 留到 21 篇。这里只讲机制:契约长什么样、一次调用经过哪些环节、DeepSeek 线上到底发了什么。

> 一句话先记住:**`ctx.llm` 只定义一套中立的词汇——请求是 `GenerateOptions`,响应是封闭的 `StreamChunk` 流。一次 adapter 调用永远只是一次厂商请求,重试、压缩、图片卸载这些恢复动作都在 loop 层通过会话事件完成**。

---

## 一、一个服务,多个 adapter

### 1.1 包的分工

| 包 | 作用 | base bundle 行 id |
| --- | --- | --- |
| `dsh-llm` | `ctx.llm` 服务:adapter 注册表 + 流式调用 API,本身没有配置、不含任何厂商线协议代码 | `llm` |
| `dsh-llm-deepseek` | DeepSeek Messages 传输库(请求构造、SSE 翻译、Files API) | 被下面两个插件引用 |
| `dsh-llm-deepseek-api-key` | 注册路由 `deepseek-official`,用 API key | `llm-deepseek` |
| `dsh-llm-deepseek-account` | 注册路由 `deepseek-account`,用账号登录授权 | `llm-deepseek-account` |
| `dsh-llm-pi-ai` | 基于 pi-ai 的多厂商 adapter,也能接自定义网关 | `llm-pi-ai` |
| `dsh-llm-retry` | 重试执行器,本身无配置 | `llm-retry` |
| `dsh-token-meter` | 回放日志估算上下文压力 | `token-meter` |
| `dsh-deepseek-llm-api-extensions` | DeepSeek 请求体扩展字段的注册表 | `deepseek-llm-api-extensions` |

路由规则很简单:`GenerateOptions.provider` 选 adapter,`model` 原样交给那个 adapter。adapter 的 `listModels()` 只是**建议性目录**——核心路由接受目录之外的模型 id,只有 GUI 选择器要求模型在目录里。同一路由被两个 adapter 注册会直接报 `DUPLICATE_ADAPTER`,而且是全有或全无。

### 1.2 一次请求长什么样

```ts
interface GenerateOptions {
  provider: string            // 路由,选中 adapter
  model: string
  reasoningEffort?: ReasoningEffortId
  messages: RequestMessage[]  // loop 构造的请求:首条 system 角色消息就是 system prompt
  system?: string             // 只给一次性调用者用,loop 构造的请求不设
  tools?: ToolSchema[]
  toolHistory?: ToolHistory   // 会话折叠出的工具变更历史,用于路由投影
  temperature?: number
  maxTokens?: number
  stop?: string[]
  signal?: AbortSignal
  sessionId?: SessionId
  purpose?: 'compaction' | 'session-title'
}
```

两点值得注意:

- **采样参数只有 `temperature` / `maxTokens` / `stop`**,没有 `tool_choice`、`top_p`。这是刻意的,词汇只在有真实生产者时才增长
- **loop 构造的请求是深冻结的**。每次调用都经过 `llm/stream` waterfall,listener 可以读、可以短路,但改 loop 请求会直接抛错——因为请求必须能从会话日志重建(17 篇)

---

## 二、Adapter 契约

### 2.1 只有 `stream()` 是必须的

```ts
abstract class LlmAdapter {
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk> // 唯一必需
  providerInfo(provider: string): LlmProviderInfo
  providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined
  listModels(provider: string): Promise<readonly LlmModelInfo[]>       // 默认空目录
  resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
  prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>
  imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined
}

// 注册:返回 disposer,还带一个原子替换路由的 replace()
const handle = ctx.llm.registerAdapter(['my-route'], new MyAdapter())
```

### 2.2 resolveModel:正确性相关的元数据

目录是建议性的,但有些元数据会影响请求是否正确,这些由 `resolveModel()` 按精确的 provider/model 返回:

| 字段 | 作用 | 谁在用 |
| --- | --- | --- |
| `context.contextWindow` | 上下文容量 | 压缩阈值计算(16 篇) |
| `defaultMaxTokens` | 调用方没给 `maxTokens` 时的默认输出上限 | 请求物化 |
| `reasoning.efforts` / `defaultEffort` | 该模型可选的 effort,按强度递增 | effort 校验,不支持的值直接拒绝、不做降级 |
| `systemPromptUpdate` | 唯一取值 `'in-history'`:模型把任意位置最新的 system 消息当作完整 system prompt | loop 决定 system prompt 变化时"追加"还是"改写"(16 篇) |
| `toolUpdate` | `'addition-only'` 或 `'in-history'`:中途增删工具的方式 | 工具声明投影 |

字段缺失表示"未知或由厂商决定",不表示非法。

### 2.3 prepareCall:把一次调用钉在一个 adapter 上

loop 不直接调 `stream()`,而是先 `ctx.llm.prepareCall()`:同一个 adapter 注册要贯穿"解析模型元数据 → 写 `request/header` 日志 → 发请求"三个环节。这样 HMR 中途换了 adapter,也不会出现"用 A 的能力描述去调 B 的端点"。返回的 `PreparedLlmCall` 只能 `stream()` 一次,重用或配置不匹配报 `INVALID_PREPARED_CALL`。

---

## 三、StreamChunk:封闭的流协议

### 3.1 七种 chunk

```ts
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: ToolCallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason; replayState?: ReplayEnvelope }
```

这是一个**封闭**联合:消费方的 `switch` 以 `assertNever` 结尾,新增一种 chunk 会让所有该处理它的地方编译失败。`index` 把交错到达的 delta 关联到各自的块,`block-end` 直接携带组装好的完整块。

### 3.2 每个 adapter 必须遵守的规则

| 规则 | 含义 |
| --- | --- |
| `usage` 在 `finish` 之前,`finish` 之后什么都不发 | 两者都要等到厂商的流结束标记再发 |
| 工具参数全程是原始 JSON 字符串 | 厂商给的是解析后的对象,就在 `block-end` 重新序列化 |
| 两条错误路径,一种 `LlmFailure` | 传输/协议错误从 `stream()` 抛出;厂商的流内错误用 `finish` 结束,`kind` 为 `error` 或 `aborted`,附带 `failure` |
| 一次调用 = 一次厂商请求 | adapter 关掉底层库的重试 |
| 厂商卡住要在传输层兜底 | 两个远程 adapter 都有 `streamIdleTimeoutMs`,默认 5 分钟,超时映射为 `TIMEOUT` |
| 空回复是可重试错误 | `stop` 结束却没有任何内容块,映射为 `EMPTY_RESPONSE` |
| 每个 HTTP 请求带 `User-Agent` | 由 `attributionHeaders()` 生成,只含公开的产品信息(见 6.2) |

`LlmFailure` 是可序列化的中立结构:`message`、`code`、可选的 `status`、`providerRetryAfterMs`、`requestId`。不管 adapter 怎么失败,`ctx.llm.stream()` 都会把它规整成一个终止的 `finish`,消费方只按 `code` 路由。

### 3.3 BlockAssembler

`BlockAssembler` 是唯一一份把 chunk 折回 `ContentBlock` 的共享实现。loop 一边把原始 chunk 记进日志,一边把同样的 chunk 喂给 assembler,结束后读 `blocks()` / `usage` / `finish`。几个关键决定:

- **`max-tokens` 结束时丢弃所有工具调用**——被截断的调用执行起来不安全;回放元数据里同位置的条目同步裁掉,内容和元数据不会对不上
- 被取消的流用 `interruptedBlocks()` 只保留已收到的文本和推理,不保留工具调用(否则就得伪造一个结果)
- 原始 chunk 流以紧凑形式嵌在 `assistant/message` 或 `assistant/attempt` 事件里,17 篇再讲

---

## 四、错误码与重试:恢复发生在 loop 层

### 4.1 规范错误码

| code | 典型原因 | 默认谁来处理 |
| --- | --- | --- |
| `CONTEXT_WINDOW_EXCEEDED` | 上下文超限,两个 DeepSeek adapter 统一识别 | `compaction-basic` 压缩后重试(16 篇) |
| `IMAGE_OFFLOAD_REQUIRED` | 保留的图片超出路由预算 | `compaction-image-offload` 卸载最旧的图片后重试 |
| `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT` | 瞬时故障 | `dsh-llm-retry` 默认重试 |
| `AUTH`、`QUOTA`、`INVALID_REQUEST`、`HTTP_<status>` | 凭证、额度、请求本身有问题 | 默认不重试,轮次以错误结束 |
| `MISSING_CREDENTIAL`、`INVALID_CREDENTIAL`、`UNSUPPORTED_REASONING_EFFORT` | 发请求之前就能判断的配置错误 | 不发网络请求直接失败 |

### 4.2 恢复走 `agent/request-error`

失败的尝试先作为 `assistant/attempt` 记入日志、关闭失败的步骤,然后进入 `agent/request-error` waterfall。当前的监听者正好是上表的三个:`llm-retry`、`compaction-basic`、`compaction-image-offload`。某个 listener 修好之后返回 `{ kind: 'retry' }`,loop 就在**同一个打开的轮次里**基于同一份日志重跑这个步骤;没人处理,结构化的失败就成为轮次的错误。

重试策略挂在每个 provider 的配置上,执行器只有一个:

```yaml
- name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    retryPolicy:
      mode: normal        # 或 always:不限次数,直到成功、取消或插件卸载
      maxRetries: 3
- name: '@deepseek-ai/dsh-llm-retry'
```

不写 `retryPolicy` 就是 normal 模式:对 `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT` 最多重试 5 次,退避从 500 ms 到 10 秒,10% 抖动;厂商给了合法的 `Retry-After` 且落在策略范围内就用厂商的。每次重试**先写 `llm/retry` 事件再开始等待**,真正开始前再写 `llm/retry-started`,所以崩溃时不会留下一个看不见的待重试任务。这些事件对模型不可见。

直接调 `ctx.llm.stream()` 的代码(比如自己写的一次性调用)永远是单次尝试——裸流没法把已经吐出的 chunk 持久地切开。

---

## 五、DeepSeek adapter:Anthropic 兼容的 Messages 协议

### 5.1 端点与鉴权

- 默认根地址 `https://api.deepseek.com/anthropic`;显式 `baseURL` 优先,其次 `$DEEPSEEK_BASE_URL`
- 模型请求打到 `/v1/messages`,图片上传打到 `/v1/files`(地址本身以 `/v1` 结尾时复用)
- 请求头带 `anthropic-version: 2023-06-01`;API key 走 `x-api-key`,账号令牌走 `x-dsh-auth-token`(不加 Bearer)
- 所有请求拒绝重定向,凭证不会被带到别的源
- **只支持 Messages 协议,配置里没有 `protocol` 字段**。从旧配置迁移时如果报 `protocol is not configurable`,把 `protocol` 从 `llm-deepseek` 行的 config 里删掉

`deepseek-official` 只用配置的 API key,`deepseek-account` 只用账号授权,两条路由互不回退。

### 5.2 默认模型与常用配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `models` | `deepseek-flash`(DeepSeek-V4.1-Flash,文本+图片)和 `deepseek-v4-pro`(纯文本) | 显式列表会**整体替换**默认目录 |
| `defaultContextWindow` | `1,000,000` | 两个默认模型都是 1M 上下文 |
| `maxTokens` | `256,000` | 单次请求输出上限 |
| `thinking` | `enabled` | 设成 `disabled` 会把所有请求锁在 `off` |
| `reasoningEffort` | `high` | 可选 `off` / `low` / `high` / `max` |
| `streamIdleTimeoutMs` | `300,000` | 单次读流的最长空闲时间 |
| `retryPolicy` | normal,5 次 | 由 `dsh-llm-retry` 执行 |

默认目录里只有 `deepseek-flash` 声明了 `systemPromptUpdate: in-history` 和 `toolUpdate: addition-only`;`deepseek-v4-pro` 两者都没声明。这直接决定了 16 篇讲的缓存行为。

### 5.3 reasoning effort 怎么上线

`low` / `high` / `max` 开启 thinking,序列化为 `output_config.effort`;adapter 自有的 `off` 不发 effort,而是发 `thinking.type: disabled`。不支持的值在发请求前就报 `UNSUPPORTED_REASONING_EFFORT`。显式的 `temperature` 会被转发,但 thinking 开启时 DeepSeek 接受却忽略它的取值。

### 5.4 推理回传与 replay 签名

**之前每一轮的推理内容都会原样回传**,不管那一轮有没有调用工具。Messages 协议的 thinking 块带签名,adapter 把模型 id 和 thinking 签名存进 `finish` 携带的 `ReplayEnvelope`,随助手消息一起落进日志。下次请求时,只有当历史消息的 provider 和目标 provider 当前由**同一个 adapter 实例**持有,`LlmRuntime` 才把这份私有状态交给它;回放状态无效时只打一条警告、去掉签名,保留文本和工具历史。代价是每个带推理的轮次都会让后续请求的输入变长。

### 5.5 图片

图片默认先用 Files API 上传,请求里引用 file id,上传和带 file id 的模型请求都加 `anthropic-beta: files-api-2025-04-14`。上传失败或超时,**整个请求**改为内联 base64,一个请求里不会混用两种形式。保留图片超出 `maxRequestFilesBytes`(128 MiB)或 `maxImagesPerRequest`(600)时报 `IMAGE_OFFLOAD_REQUIRED`;卸载按固定的字节或数量"台阶"从最旧的图片开始,避免每来一张新图就改写一次前缀。

### 5.6 中途变更 system prompt 与工具

- 声明了 `in-history` 的模型:保留最初的顶层 system,之后新的 system 快照放在对应的 user / tool-result 轮次之后发送;未声明的模型用最新快照作为顶层 system
- 工具变更以 `developer` 消息里的 `tool-addition` / `tool-removal` 块记录,发到线上变成 system 角色的 `tool_addition` / `tool_removal` 块,延迟加载的声明带 `defer_loading`;只要请求里出现这类块就加 beta 头 `mid-conversation-tool-changes-2026-07-01`
- `addition-only` 只读新增块,所以被移除的工具会从声明列表里删掉;`in-history` 还读移除块,被移除的工具保留声明

为什么要这么绕,16 篇专门讲。

### 5.7 usage 映射

`TokenUsage` 的各项**互不重叠**:`inputTokens` 只算未命中缓存的输入,`cacheReadTokens` / `cacheWriteTokens` 单列,计费输入是三者之和;`reasoningTokens` 只是说明,已经包含在 `outputTokens` 里。DeepSeek Messages 的映射:

```text
input_tokens                 -> inputTokens
output_tokens                -> outputTokens
cache_read_input_tokens      -> cacheReadTokens
cache_creation_input_tokens  -> cacheWriteTokens
```

---

## 六、dsh 自己的线协议扩展

### 6.1 原则:不进模型输入

dsh 在 DeepSeek Messages 请求上额外加了几个请求头和请求体字段。它们都在 `messages`、system prompt、工具 schema **之外**,所以不增加模型输入 token,也不改变模型看到的前缀。但它们会发到解析出的 `baseURL`,**包括你配置的网关**。pi-ai 路径不发这些。

### 6.2 请求头

| 请求头 | 何时出现 | 值 |
| --- | --- | --- |
| `user-agent` | 每个厂商 HTTP 请求,包括 Files API | `product/version (+url)`,默认产品名 `deepseek-harness` |
| `x-deepseek-harness-user-id` | 每个通过鉴权的模型请求 | 当前 Harness home 的稳定匿名 UUID |
| `x-deepseek-harness-session-id` | 请求带会话 id 时 | 会话 id |
| `x-deepseek-harness-compact` | `purpose` 为 `compaction` 的请求 | 字面量 `1` |

凭证校验失败发生在解析匿名 id 之前,所以未授权的请求既不发这些头,也不会创建身份文件。

### 6.3 请求体扩展字段

`ctx.deepseekLlmApiExtensions` 是一个注册表,每个顶层字段只允许一个贡献者,字段名用保留前缀 `dsh_`。流程是一个小事务:

1. adapter 先序列化完整的基础请求体(包括确切的 `messages`)
2. 各贡献者基于这份不可变的请求体准备自己的字段;准备失败的字段本次省略,其他照发;与基础字段撞名则请求失败,报 `REQUEST_EXTENSION`
3. 端点返回 2xx 后、读 SSE 之前,执行 `accept()`;传输失败和非 2xx 不算接受

base bundle 默认挂了两个贡献者,都是**默认开启**:

```json
{
  "dsh_plugin_packages": {
    "version": 1,
    "packages": [{ "name": "@deepseek-ai/dsh-example", "version": "0.1.1-rc.2" }]
  }
}
```

- **`dsh_plugin_packages`**(`dsh-plugin-package-inventory-deepseek`):当前激活的、由 Loader 加载的完整插件包清单,每个请求重新读取
- **`dsh_session_log`**(`dsh-session-log-deepseek`):会话日志的一段连续后缀。字段里有 `afterSeq` / `throughSeq` / `events`,单次最多 `maxBytes`(默认 8 MiB);端点 2xx 后在本会话追加一条 `session-log-deepseek/delivery-accepted` 事件作为水位线,下次从水位线之后接着发。崩溃可能导致重发,但不会出现序号空洞

按仓库文档的说法,`dsh_session_log` 可能包含会话工作目录、system prompt 快照、用户和助手内容、工具参数和结果、压缩摘要等。**这对隐私意味着什么、怎么关,见 06 篇**,这里只讲机制。

> 文档把这些扩展描述为 `deepseek-official` 路由的行为。从源码看,`deepseek-account` 路由与它共用同一个传输注册函数,大概率也会带上;文档没有明说,以你所用版本的实际行为为准。

---

## 七、pi-ai adapter:其他厂商与自定义网关

`dsh-llm-pi-ai` 的配置面只有一个 `providers` 字典,每个 key 就是一条路由名,每条路由可以有自己的 `apiKeyEnv` 和 `retryPolicy`。已安装的 pi-ai 厂商提供端点、协议和模型目录的默认值,自定义路由可以手写这些值,OpenAI 兼容的自托管服务也走这里。它可以和 DeepSeek adapter 同时挂载,路由名不冲突即可。用户侧怎么配见 03 篇。

---

## 八、Token meter:回放出来的上下文压力

`ctx.tokenMeter` 不调模型,只回放持久化的日志:

```text
const { totalTokens, surfaceTokens, nodes } = ctx.tokenMeter.measure(session)
const price = ctx.tokenMeter.estimateMessage(message)
```

`measure()` 返回一个不可变的 `TokenMeasurement`:

| 字段 | 含义 |
| --- | --- |
| `logRevision` | 这次测量消费了多少条持久事件,等于下一条未读事件的 seq |
| `baseline` | `usage`:最近一次成功调用的请求信封与当前一致,直接复用厂商报告的 usage 做锚点;`estimated`:没有可复用的锚点,整个信封自己估 |
| `surfaceDeltaTokens` | 当前 surface 相对锚点的有符号变化,压缩后可以是负数 |
| `totalTokens` | 请求 + 响应的压力 |
| `surfaceTokens` / `nodes` | surface 上每个节点的价格,按位置排序 |

估算用固定启发式:**每 4 个字符算 1 个 token** 再加角色和块的开销。仓库自己也承认,中日韩文本和 JSON schema 会被严重低估。图片则由 adapter 的 `imageRequestPricing` 按路由定价(DeepSeek 按它公布的视觉 token 规则算),这里的"定价"指 token 数而不是金额。挂了 `ctx.sessionProjections` 时还会注册 `tokenUsage`、`contextPressure`、`contextBreakdown` 三个 projection 给界面用。占用率只是参考值,真正做决定的压缩逻辑直接读 `measure()`。

> 旁注:DeepSeek 还给 web 能力提供了两种搜索后端。`dsh-web-search-deepseek`(注册名 `deepseek-official`)走 Messages 接口的原生搜索,每次搜索相当于一次完整模型调用;`dsh-web-deepseek-api`(`deepseek-search-api` / `deepseek-fetch-api`)直接调 `https://api.deepseek.com/v1/tools` 下的 Search / Fetch API,不额外调模型。shipped profile 默认用前者加本地 HTTP 抓取,在插件设置里打开 "Use the new Web Search API" 切到后者。模型侧的 `web_search` 工具在 `dsh-tool-web` 里。

---

## 踩坑

1. **以为 adapter 会自己重试**——一次调用就是一次厂商请求。要重试就挂 `dsh-llm-retry`;直接调 `ctx.llm.stream()` 的代码永远单次尝试
2. **用厂商的报错文本判断上下文溢出**——按 `CONTEXT_WINDOW_EXCEEDED` 这个 code 路由,两个 DeepSeek adapter 已经把各种报错归一了
3. **在 `llm/stream` listener 里改 loop 发出的请求**——请求是深冻结的,改了会抛错;它的内容必须是会话日志的纯函数
4. **给 `llm-deepseek` 配 `protocol: openai`**——没有这个字段,只支持 Messages。报 `protocol is not configurable` 就删掉它
5. **自定义 `models` 时只写了一个模型**——显式列表整体替换默认目录,`deepseek-flash` 的 in-history / addition-only 声明也跟着没了。只改一项时用路径编辑
6. **以为 effort `off` 会发 `effort: off`**——实际发的是 `thinking.type: disabled`;部署策略 `thinking: disabled` 时,任何非 `off` 的 effort 在加载时就被拒绝
7. **以为扩展字段只到 DeepSeek 官方**——它们发往解析出的 `baseURL`,配了网关就到网关。会话日志上传默认开启,关闭方法见 06 篇
8. **always 模式配上就不管了**——它对鉴权、额度、无效请求这类永久性错误也无限重试,每次重试都是一次计费请求
9. **把 token meter 的占用率当账单**——4 字符/token 的启发式对中文偏差很大;已完成请求以厂商报告的 usage 为准

---

## 源码与文档索引

- `docs/subsystems/llm-streaming.md`
- `packages/llm/llm/README.md`
- `packages/llm/llm/src/types.ts`
- `packages/llm/llm-deepseek/README.md`
- `packages/llm/llm-deepseek/src/adapter.ts`
- `packages/llm/llm-deepseek/src/models.ts`
- `packages/llm/llm-deepseek/src/translate.ts`
- `docs/deepseek-llm-api-wire-extensions.md`
- `packages/llm/llm-retry/README.md`
- `docs/subsystems/token-meter.md`
- `packages/llm/llm-pi-ai/README.md`
- `packages/web/web-search-deepseek/README.md`

---

下一篇:`16-上下文工程与KV-Cache纪律.md`,讲 dsh 怎样围绕 provider 的前缀缓存组织 system prompt、运行时上下文和工具表,以及压缩的触发阈值与策略。
