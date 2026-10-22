# 接入新模型:编写 LlmAdapter

15 篇从内核角度讲了 LLM 层:`LlmAdapter` 契约、`StreamChunk` 协议、DeepSeek 的线协议扩展和 token meter。这一篇站在 adapter 作者的位置,把那份契约落到代码上:什么时候真的需要写 adapter,`stream()` 怎样产出一串合法的 chunk,错误、取消和重试怎么配合,以及为了不破坏缓存前缀,adapter 这一层要注意什么。概念不再重复,重点是实现上的正确性。

和 Claude Code 对照:Claude Code 换模型靠环境变量和网关,模型协议是固定的。dsh 的模型提供方本身就是插件,`ctx.llm.registerAdapter()` 注册一个路由,主循环就能用它。

> 一句话先记住:**adapter 只做翻译**。它把提供方无关的 `GenerateOptions` 变成一次提供方请求,再把响应翻译成严格有序的 `StreamChunk`。重试、上下文压缩、日志、审批都不归它管,它要做的是给每种失败一个稳定的错误码,让管这些事的插件能按码路由。

---

## 一、先确认要不要写

| 你的情况 | 做法 |
| --- | --- |
| 用 DeepSeek 官方模型 | 内置 `dsh-llm-deepseek`,不用写(03 篇) |
| pi-ai 目录里已有的提供方 | `dsh-llm-pi-ai`,在 Models 页或 `llm-pi-ai` 配置里加凭证 |
| OpenAI 兼容网关、自托管的 OpenAI 兼容服务 | `dsh-llm-pi-ai` 的自定义路由:写 `api`(如 `openai-completions`、`openai-responses`、`anthropic-messages`)、`baseURL` 和 `models`,不用写代码。仓库没有 Ollama 专门文档,这类服务按 OpenAI 兼容服务接 |
| 私有协议、特殊鉴权、自定义请求字段 | 写 adapter |
| 后续请求需要回传响应 id、签名等原生元数据 | 写 adapter,用 `finish.replayState` |
| 要把 reasoning effort 映射成提供方的特殊参数,pi-ai 的 `compat` 不够用 | 写 adapter |

pi-ai 自定义路由能覆盖大多数"OpenAI 兼容"场景,先试它。下文假设你确实需要自己的 adapter。

---

## 二、骨架与注册

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. options.messages → 提供方格式  2. 发起流式请求  3. 响应 → StreamChunk
  }
}

export interface Config { apiKey: string; providers: string[] }
export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(config.providers, new MyAdapter())
}
```

`stream()` 是唯一必须实现的方法。可选覆盖:

| 方法 | 用途 |
| --- | --- |
| `listModels(provider)` | 给模型选择器列出模型。核心路由接受未列出的 model id,但 GUI 这类按目录选择的入口可能要求在列表里 |
| `resolveModel(provider, model, signal?)` | 一次返回精确的模型元数据:`context.contextWindow`、`reasoning`(有序的 effort 列表和可选默认值)、`defaultMaxTokens`、`systemPromptUpdate`、`toolUpdate`。异步查询要遵守 `signal` |
| `providerInfo(provider)` | 路由的显示名,`id` 必须等于路由名 |
| `providerRetryPolicy(provider)` | 这个路由自己的重试策略,不覆盖就用默认值 |

注册规则:`registerAdapter()` 是 effect,插件卸载时路由自动释放,HMR 安全;**一个路由只能有一个 adapter**,重复注册抛 `DUPLICATE_ADAPTER`;一次注册多个路由是全有或全无;路由名不能为空,至少注册一个。

`resolveModel` 里的 `reasoning` 很关键:服务会校验调用方显式给的 effort,不在列表里的在 `stream()` 之前就被拒绝。省略 `reasoning` 等于声明这个模型没有可选的 reasoning effort。effort id 是不透明的字符串,由 adapter 映射成提供方的参数;提供方支持关闭推理时,`off` 也应该出现在列表里。

---

## 三、怎么被选中

`GenerateOptions.provider` 选 adapter,`GenerateOptions.model` 原样交给 adapter,不需要为每个模型注册。基于 base 的 profile(web、headless 等)里,新建 agent 的默认模型来自 `agent-default-model` 这一行(base 默认是 `deepseek-official` / `deepseek-flash`)。把它指向你的路由:

```yaml
- insert:
    - id: llm-acme
      name: '/absolute/path/to/llm-acme.ts'
      config:
        baseURL: https://llm.example.com/v1
        apiKey: !!js process.env.ACME_API_KEY
        providers: [acme]
        models: [acme-chat]
- id: agent-default-model
  config:
    provider: acme
    model: acme-chat
```

patch 整体替换 `config`,所以 `provider` 和 `model` 两个键都要写。官方 llm-adapter 文档另给了一种写法:在 `@deepseek-ai/dsh-agent-loop` 的 `config.agents` 里写 `{ id, provider, model }`,那是启动时创建的 agent,适合自己从零组合的配置;base 里 `agents` 是空数组。

在 Web 里按会话切换模型时,选择器读的是 `listModels()`,所以要让你的模型出现在列表里。

---

## 四、chunk 协议:实现纪律

每一条都是两个参考 adapter 验证过、消费方会依赖的规则:

| 规则 | 实现要点 |
| --- | --- |
| 每个 `block-start` 都有对应的 `block-end` | `block-end` 带完整组装好的块,消费方不用自己拼 delta |
| `index` 从 0 开始,按首次出现的顺序分配 | 同一个块的所有 delta 复用同一个 index;不同块的 delta 可以交错 |
| 工具参数全程是原始 JSON 字符串 | 片段放 `argumentsDelta`;提供方给的是解析后的对象,就在 `block-end` 时重新 stringify |
| `tool-call-delta` 每次都带 `id` | 很多提供方只在第一个片段给 id,要自己记住。`name` 可选 |
| `usage` 在 `finish` 之前 | 稳妥做法是把 usage 和 finish 都缓冲到提供方的流结束标记再发,防止尾部还有只含 usage 的片段 |
| `finish` 之后什么都不发 | `finish` 是最后一个 chunk |
| 用量计数不相交 | `inputTokens` 只算未命中缓存的输入,缓存命中放 `cacheReadTokens` / `cacheWriteTokens`;提供方把命中算进总 prompt 数时要减出来。`reasoningTokens` 已包含在 `outputTokens` 里 |
| 截断要如实报告 | 输出达到上限就 `finish { kind: 'max-tokens' }`。主循环的组装器会丢掉这次响应里的所有工具调用,因为被截断的调用不能安全执行 |
| 空响应不是成功 | 正常 `stop` 却没有任何内容块,改成 `finish { kind: 'error' }`,码用 `EMPTY_RESPONSE`,默认会被重试 |

---

## 五、错误、取消与归因

### 5.1 两条合法的错误路径

| 路径 | 适用 | 写法 |
| --- | --- | --- |
| 从 `stream()` **抛出** | 传输、协议失败 | `throw new LlmError(message, code, { status, providerRetryAfterMs, requestId, cause })` |
| 以 `finish` **结束流** | 提供方在流中返回的错误 | `{ type: 'finish', reason: { kind: 'error', failure: { message, code } } }`,或 `kind: 'aborted'` |

两种路径最终都归一成同一个 `LlmFailure`,`LlmRuntime.stream()` 会把抛出的异常规范化成终止的 error / aborted finish。但主循环**不会**把普通 `Error` 自动转换成有意义的码,所以要抛就抛 `LlmError`,带稳定的 code。`LlmError` 构造时会校验:message 和 code 非空、`status` 是 100 到 599 的整数、`providerRetryAfterMs` 是正数。

### 5.2 用对错误码

重试、压缩这些恢复插件只按 code 路由,不解析错误文字。仓库里约定俗成的码:

| 情况 | code | 默认重试 |
| --- | --- | --- |
| 限流(429) | `RATE_LIMIT` | 是 |
| 服务端错误(5xx) | `SERVER` | 是 |
| 网络失败 | `TRANSPORT` | 是 |
| 流空闲超时 | `TIMEOUT` | 是 |
| 空响应 | `EMPTY_RESPONSE` | 是 |
| 鉴权失败(401 / 403) | `AUTH` | 否 |
| 额度用尽 | `QUOTA` | 否 |
| 上下文超长 | `CONTEXT_WINDOW_EXCEEDED` | 否,交给压缩的溢出恢复 |
| 调用方取消 | `ABORTED` | 否 |
| 流在结束标记前断开 | `STREAM_CLOSED` | 否 |
| 提供方表达不了某个请求选项 | `UNSUPPORTED_OPTION` | 否 |
| 提供方表达不了某种内容块 | `UNSUPPORTED_CONTENT`(DeepSeek adapter 的用法) | 否 |

"默认重试"那一列来自 `retry-policy.ts` 里的 `DEFAULT_RETRYABLE_CODES`,由 `dsh-llm-retry` 在 `agent/request-error` 上执行。上下文超长用 `isContextWindowExceededError(detail)` 判断再报 `CONTEXT_WINDOW_EXCEEDED`,两个 DeepSeek adapter 都这样做。提供方不支持某个 `GenerateOptions` 字段(比如没有 stop sequences)时,**抛 `UNSUPPORTED_OPTION`,不要悄悄丢掉**。pi-ai adapter 就因为无法跨提供方保证 `stop`,一律拒绝它。

### 5.3 一次调用就是一次尝试

- **关掉 SDK 自带的重试**。adapter 的一次 `stream()` 对应一次提供方请求,重试由 agent 层开一个新的持久化尝试来做。直接调用 `ctx.llm.stream()` 的代码只有一次尝试
- **转发 `options.signal`**,传给 `fetch` 或 SDK。取消发生时报 `ABORTED`,不要报成 `TRANSPORT`
- **给流加空闲看门狗**。两个内置的远程 adapter 都有 `streamIdleTimeoutMs`(默认 5 分钟),只在 `next()` 等待时计时,超时报 `TIMEOUT`
- **每个 HTTP 请求都合并 `attributionHeaders()`**。它目前只产出一个 `user-agent`,格式是 `deepseek-harness/<版本> (+<仓库地址>)`,里面没有密钥和会话信息。仓库要求用线级测试证明请求里确实带了它

---

## 六、replayState:需要回传原生元数据时

有些提供方要求后续请求带上上一次响应的 id、签名之类的原生数据。做法是在成功的 `finish` 上附带 `replayState`:

```ts
yield { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { id: responseId }, blocks: perBlockMeta } }
```

- `response` 放响应级数据,`blocks` 可选,每个已发出的块一项,顺序和块的首次出现顺序一致。组装器丢掉某个块时会同步丢掉同位置的那一项,长度对不上整个 envelope 作废
- 主循环把它存到助手消息的 `source.replayState`。之后的请求里,**只有历史路由和目标路由当前属于同一个 adapter 实例**时,`LlmRuntime` 才把它交还给你
- 交还时要校验。用不了就降级成提供方无关的转换并给出诊断,不要让请求失败。也不要只凭 provider / model 名字推断原生回放
- 只放最小的无损 JSON 投影

---

## 七、为 KV Cache 着想

16 篇讲的是 harness 侧怎么保住缓存前缀,adapter 这一层也有几件事:

- **如实上报缓存用量**。不相交的 `cacheReadTokens` 让 token meter 和用户能看到命中率
- **只在模型真的支持时声明 `systemPromptUpdate: 'in-history'` / `toolUpdate`**。声明了,主循环会把变化后的 system prompt 或新增的工具追加在已缓存的历史之后;没声明,system prompt 的变化会合并回第一条 system 消息,工具变化则让每次请求重新声明完整的工具列表,都从改动处开始失去前缀复用。声明错了,模型会读不懂请求
- **序列化保持确定**。同样的历史要产出同样的请求字节。会话 id 这类信息可以按 `GenerateOptions.sessionId` 映射成模型看不到的传输元数据(header 等),不要塞进消息内容
- **换 provider 或 model 就是换缓存域**,adapter 不需要为此做任何事

---

## 八、骨架实现:一个 OpenAI 兼容端点

下面是一个**假想的** OpenAI Chat Completions 兼容端点的 adapter。harness 侧的类型和规则都核对过;线上格式按 OpenAI 的惯例写,接你自己的提供方时以它的文档为准。生产实现还应该加空闲看门狗,用 `eventsource-parser` 之类的库解析 SSE(`llm-deepseek` 就是这样做的)。

```ts
import {
  attributionHeaders, CONTEXT_WINDOW_EXCEEDED_CODE, EMPTY_RESPONSE_CODE, isContextWindowExceededError,
  LlmAdapter, LlmError, ToolCallId, type ContentBlock, type GenerateOptions, type LlmModelInfo,
  type LlmResolvedModelInfo, type RequestMessage, type StreamChunk,
} from '@deepseek-ai/dsh-llm'

interface AcmeConfig { baseURL: string; apiKey: string; models: string[]; contextWindow: number }

const text = (blocks: readonly ContentBlock[]) => blocks.map((b) => {
  if (b.type === 'text') return b.text
  if (b.type === 'reasoning' || b.type === 'tool-call') return ''
  throw new LlmError(`Acme cannot represent ${b.type}`, 'UNSUPPORTED_CONTENT')
}).join('')

function toWire(messages: readonly RequestMessage[], system?: string): unknown[] {
  const out: unknown[] = system ? [{ role: 'system', content: system }] : []
  for (const m of messages) {
    if (m.role === 'system') { const t = text(m.content); if (t) out.push({ role: 'system', content: t }) }
    else if (m.role === 'user') out.push({ role: 'user', content: text(m.content) })
    else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: text(m.content) })
    else if (m.role === 'assistant') {
      const calls = m.content.flatMap(b => b.type === 'tool-call'
        ? [{ id: b.id, type: 'function', function: { name: b.name, arguments: b.arguments } }] : [])
      out.push({ role: 'assistant', content: text(m.content), ...calls.length ? { tool_calls: calls } : {} })
    } else throw new LlmError(`Acme cannot represent ${m.role} messages`, 'UNSUPPORTED_CONTENT')
  }
  return out
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder()
  let buf = ''
  for await (const bytes of body) {
    buf += decoder.decode(bytes, { stream: true })
    for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
}

export class AcmeAdapter extends LlmAdapter {
  constructor(private readonly config: AcmeConfig) { super() }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.models.map(id => ({ provider, id, name: id })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: this.config.contextWindow } })
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    try {
      const res = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}`, ...attributionHeaders() },
        body: JSON.stringify({
          model: options.model,
          messages: toWire(options.messages, options.system),
          ...options.tools?.length ? { tools: options.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {},
          ...options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {},
          ...options.temperature !== undefined ? { temperature: options.temperature } : {},
          ...options.stop?.length ? { stop: options.stop } : {},
          stream: true,
          stream_options: { include_usage: true },
        }),
        ...options.signal ? { signal: options.signal } : {},
      })
      if (!res.ok || res.body === null) {
        const detail = await res.text().catch(() => '')
        const code = res.status === 401 || res.status === 403 ? 'AUTH' : res.status === 429 ? 'RATE_LIMIT'
          : isContextWindowExceededError(detail) ? CONTEXT_WINDOW_EXCEEDED_CODE : res.status >= 500 ? 'SERVER' : `HTTP_${res.status}`
        throw new LlmError(detail || `Acme HTTP ${res.status}`, res.ok ? EMPTY_RESPONSE_CODE : code, res.ok ? {} : { status: res.status })
      }

      type Open = { index: number; kind: 'text' | 'tool-call'; id?: ToolCallId; name?: string; acc: string }
      const blocks: Open[] = []
      const tools = new Map<number, Open>()            // 提供方的 tool index → 我们的块
      let textBlock: Open | undefined
      let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined
      let finish: string | undefined
      let done = false

      for await (const data of sseData(res.body)) {
        if (data === '[DONE]') { done = true; break }
        let chunk
        try { chunk = JSON.parse(data) } catch (e) { throw new LlmError('Acme sent malformed JSON', 'MALFORMED_RESPONSE', { cause: e }) }
        if (chunk.usage) usage = chunk.usage           // 先存着,结束时再发
        const choice = chunk.choices?.[0]
        if (!choice) continue
        if (typeof choice.delta?.content === 'string' && choice.delta.content) {
          if (!textBlock) {
            textBlock = { index: blocks.length, kind: 'text', acc: '' }
            blocks.push(textBlock)
            yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
          }
          textBlock.acc += choice.delta.content
          yield { type: 'text-delta', index: textBlock.index, text: choice.delta.content }
        }
        for (const call of choice.delta?.tool_calls ?? []) {
          let b = tools.get(call.index)
          if (!b) {
            if (!call.id || !call.function?.name) throw new LlmError('Acme tool call without id or name', 'MALFORMED_RESPONSE')
            b = { index: blocks.length, kind: 'tool-call', id: ToolCallId(call.id), name: call.function.name, acc: '' }
            blocks.push(b)
            tools.set(call.index, b)
            yield { type: 'block-start', index: b.index, blockType: 'tool-call' }
          }
          const piece: string = call.function?.arguments ?? ''
          b.acc += piece
          yield { type: 'tool-call-delta', index: b.index, id: b.id!, argumentsDelta: piece }
        }
        if (choice.finish_reason) finish = choice.finish_reason
      }
      if (!done) throw new LlmError('Acme stream ended before [DONE]', 'STREAM_CLOSED')

      for (const b of blocks) {
        yield { type: 'block-end', index: b.index, block: b.kind === 'text'
          ? { type: 'text', text: b.acc }
          : { type: 'tool-call', id: b.id!, name: b.name!, arguments: b.acc } }   // 原始 JSON 字符串
      }
      if (usage) {
        const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
        yield { type: 'usage', usage: { inputTokens: (usage.prompt_tokens ?? 0) - cached, outputTokens: usage.completion_tokens ?? 0, ...cached ? { cacheReadTokens: cached } : {} } }
      }
      if (blocks.length === 0 && finish !== 'length') {
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'Acme returned no content', code: EMPTY_RESPONSE_CODE } } }
        return
      }
      yield { type: 'finish', reason: finish === 'tool_calls' ? { kind: 'tool-calls' } : finish === 'length' ? { kind: 'max-tokens' } : { kind: 'stop' } }
    } catch (error) {
      if (options.signal?.aborted) throw new LlmError('Acme request aborted', 'ABORTED', { cause: error })
      if (error instanceof LlmError) throw error
      throw new LlmError('Acme transport failed', 'TRANSPORT', { cause: error })
    }
  }
}
```

对照第四、五节看这段代码:

- **块的 index 按首次出现分配**,工具调用的 id 在第一个片段记下,后续 delta 复用
- **`block-end`、`usage`、`finish` 都等到 `[DONE]` 之后才发**,保证 usage 在 finish 前、finish 是最后一个
- **没等到 `[DONE]` 就断流报 `STREAM_CLOSED`**,不把半截响应当成正常结束
- **developer 消息直接报 `UNSUPPORTED_CONTENT`**:它承载工具增减,而这个 adapter 没有在 `resolveModel` 里声明 `toolUpdate`。显式失败比静默丢掉好,真遇到时再按提供方能力实现
- **图片块同样显式失败**。要支持图片,参考 `llm-deepseek` 的 `images.ts` 和 `imageRequestTarget()`
- **最外层 catch 把取消、已分类的错误和其他异常分开**,结构和 `llm-deepseek` 的 `adapter.ts` 一致
- **提供方在流中发来的错误事件,这个骨架没有处理**。真实实现应该把它映射成 `finish { kind: 'error', failure }`,也就是 5.1 的第二条路径
- 插件入口和第二节相同:`ctx.llm.registerAdapter(config.providers, new AcmeAdapter(config))`

---

## 九、测试

- **用 `BlockAssembler` 检查 chunk 序列**:它是主循环折叠 chunk 用的同一个实现,也从 `@deepseek-ai/dsh-llm` 导出。把 adapter 产出的 chunk 逐个 `push()` 进去,断言 `blocks()`、`usage`、`finish`、`replayState`,能直接发现 index 错乱、参数拼接错误
- **对照两个参考实现**:`packages/llm/llm-deepseek`(直接 HTTP,SSE 用 `eventsource-parser` 分帧,线类型、序列化、传输、翻译分文件)和 `packages/llm/llm-pi-ai`(包一个 LLM 库)。同一份契约在两种结构上的实现
- **线级测试**:断言请求里带了 `user-agent` 归因头、`signal` 被转发、错误被映射成正确的 code
- **故障注入**:`packages/test-support/llm-mock-server` 是一个可编排的 HTTP/SSE 服务,能脚本化断连、卡住、畸形片段、限流、5xx。注意它说的是 Messages 兼容的 `/v1/messages`,适合 Messages 协议的 adapter;OpenAI 风格的端点要自己写 SSE fixture
- **真实提供方验证**:按 `docs/testing.md` 的要求,adapter 的覆盖范围、真实提供方检查和发布入口都有明确规定

---

## 踩坑

1. **pi-ai 自定义路由能解决却自己写 adapter**——OpenAI 兼容网关和自托管服务先试 `llm-pi-ai` 的 `api` + `baseURL` + `models`
2. **抛普通 `Error`**——主循环不会替你转成有意义的码,重试和压缩都按 code 路由。抛 `LlmError(message, code)`
3. **usage 在 finish 之后到达**——提供方尾部还会发只含 usage 的片段。把 usage 和 finish 缓冲到流结束标记再发
4. **工具参数在 adapter 里 `JSON.parse` 后再传**——参数全程是原始 JSON 字符串,解析和校验是工具层的事
5. **只在第一个 `tool-call-delta` 带 id**——协议要求每个 delta 都带,自己记住
6. **空响应当成功返回**——报 `finish { kind: 'error' }` + `EMPTY_RESPONSE`,让默认重试接手
7. **SDK 自带重试没关**——一次 `stream()` 应该只有一次提供方请求,否则和 agent 层的重试叠加
8. **不支持的选项静默丢弃**——比如提供方没有 stop sequences,抛 `UNSUPPORTED_OPTION`
9. **取消被报成 `TRANSPORT`**——`TRANSPORT` 默认会重试,用户点了取消反而重发请求。先检查 `options.signal?.aborted`
10. **随手声明 `systemPromptUpdate: 'in-history'`**——模型读不懂中途出现的 system 消息时,声明错误会让请求语义出错

---

## 源码与文档索引

- `docs/user/develop/practice/llm-adapter.md`
- `docs/cookbook/adding-an-llm-adapter.md`
- `docs/subsystems/llm-streaming.md`(StreamChunk、The adapter contract、TokenUsage、BlockAssembler)
- `packages/llm/llm/src/types.ts`(`StreamChunk`、`GenerateOptions`、`LlmResolvedModelInfo`、`ReplayEnvelope`)
- `packages/llm/llm/src/index.ts`(`LlmAdapter`、`LlmError`、`registerAdapter()`)
- `packages/llm/llm/src/error.ts`、`packages/llm/llm/src/retry-policy.ts`、`packages/llm/llm/src/attribution.ts`
- `packages/llm/llm-deepseek/src/adapter.ts`、`packages/llm/llm-deepseek/src/transport.ts`、`packages/llm/llm-deepseek/src/serialize.ts`
- `packages/llm/llm-pi-ai/README.md`
- `packages/core/agent-default-model/README.md`、`packages/bundle/base/cordis.patch.yml`
- `packages/test-support/llm-mock-server/README.md`

---

下一篇:`22-Skills与MCP.md`,讲 SKILL.md 的格式与发现路径,以及 dsh 的 MCP client 怎么配置 stdio 和 streamable-http 两种 server、有哪些限制。
