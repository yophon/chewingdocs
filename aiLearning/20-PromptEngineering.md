# Prompt Engineering

Prompt Engineering 不是"咒语学",也不是"玄学调参"。它就是一件事:**用尽量少的话,把任务、约束、输入、输出格式讲清楚,让模型一次就给对**。这一篇把 2026 年还在用、且经过实战的 prompt 套路梳理一遍,后面 21-25 篇所有应用层技术都建立在这之上。

> 一句话先记住:**Prompt 是程序的"接口规约"**,不是聊天。把它当成你给一个聪明但记性不好的实习生写的工单。

---

## 一、四条原则:明确、具体、样例、persona

写 prompt 之前先校准心态。LLM 不是搜索引擎,**它会根据你给的上下文"猜"你想要什么**——你说得越含糊,它猜得越离谱。

| 原则 | 反例 | 正例 |
| --- | --- | --- |
| 明确(任务) | 帮我写点东西 | 写一段 100 字以内的产品介绍,卖点是续航 |
| 具体(约束) | 短一点 | 不超过 80 个汉字,3 句话以内 |
| 样例(few-shot) | 输出 JSON | 输出 JSON,格式参考下面这个例子:`{"title": "...", "tags": [...]}` |
| persona(角色) | 你回答一下 | 你是一名 10 年经验的 iOS 工程师,从工程视角回答 |

> 5 年工程师视角:**写 prompt 跟写函数注释是同一个肌肉**。你能给一个新同事讲清楚的任务,模型大概率也能干。讲不清的,模型也干不了。

实操上,一个稳定可用的 prompt 模板大概长这样:

```
[角色]:你是 ___
[任务]:你要做 ___
[输入]:用户提供的内容如下:<input>...</input>
[要求]:
- ...
- ...
[输出格式]:JSON,结构为 {...}
```

把这五块结构化下来,80% 的"模型不听话"问题自动消失。

---

## 二、System Prompt 的作用与放置

System Prompt 是给模型的"长期人设和规则",和用户每轮的输入分开。**它不是普通消息,而是模型在每一轮 reply 前都会优先参考的上下文**。

| 放 system prompt | 放 user message |
| --- | --- |
| 角色设定(你是 X 工程师) | 本轮要处理的具体输入 |
| 全局约束(永远输出中文) | 本轮的具体要求 |
| 输出格式规范(永远输出 JSON) | 一次性的临时指令 |
| 风格(简洁、用 markdown) | —— |
| 安全护栏(不回答 X 类问题) | —— |

Anthropic SDK 写法:

```python
from anthropic import Anthropic

client = Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system="你是一名资深 Python 工程师。回答必须:1) 中文 2) 代码块标语言 3) 不超过 200 字。",
    messages=[
        {"role": "user", "content": "怎么把 list 去重还保留顺序?"}
    ]
)
print(message.content[0].text)
```

OpenAI SDK 写法:

```python
from openai import OpenAI

client = OpenAI()

resp = client.chat.completions.create(
    model="gpt-5",
    messages=[
        {"role": "system", "content": "你是一名资深 Python 工程师。回答必须:1) 中文 2) 代码块标语言 3) 不超过 200 字。"},
        {"role": "user", "content": "怎么把 list 去重还保留顺序?"},
    ],
)
print(resp.choices[0].message.content)
```

> 经验:**system prompt 不要写小作文**。300-800 字是甜点区。再长边际收益急剧下降,而且会吃 context。

---

## 三、Few-shot:用例子教模型

零样例(zero-shot)不行的时候,给一两个例子(few-shot)往往直接救场。这背后的机制叫 **In-Context Learning**——模型在 attention 里"认出"输入和样例的相似性,然后照葫芦画瓢。

### 一个最朴素的分类例子

```python
prompt = """
把下面的客服留言分类到 [bug, feature_request, billing, other] 之一。

例子 1
留言:登录页面输入正确的密码也提示密码错误
分类:bug

例子 2
留言:能不能支持夜间模式?
分类:feature_request

例子 3
留言:这个月怎么扣了我两次钱?
分类:billing

现在分类下面这条:
留言:{user_input}
分类:
"""
```

### Few-shot 的几条经验

1. **样例要和真实输入分布一致**。你训练时的客服留言全是英文,样例却给中文,模型会学到一个错误的隐含规则。
2. **样例数量 1-5 条最实用**。再多边际收益小,而且占 context。
3. **样例之间用清晰的分隔**。`例子 1`、`---`、XML 标签都行,关键是**模型一眼能看出"这是几条独立样本"**。
4. **难度要覆盖**。如果只给"贼明显"的例子,遇到边界 case 模型还是会翻车。

> 反直觉提醒:**Few-shot 比改 system prompt 通常更有效**。一句"按下面格式输出"远不如直接贴一个示例输出。

---

## 四、Chain of Thought:让模型"想一下再答"

**CoT 的核心:让模型把推理过程写出来,而不是直接给结论**。这件事最早由 Google 论文提出(2022 Wei et al.),后来发现是 LLM 类任务里最强的几个 trick 之一。

### 经典 zero-shot CoT(一句话魔法)

```
问题:一个班 30 人,男生比女生多 4 人,问男生几人?
回答:Let's think step by step.
```

或者中文版:

```
让我们一步一步思考:
```

光加这一句,数学题正确率能从 18% 飙到 79%(原论文数据,GPT-3 时代)。**今天的 Claude / GPT-5 已经在 RLHF 阶段被训练成默认 CoT**,但你显式要求它写过程,效果还是更稳。

### few-shot CoT(更可控)

```
Q: Roger 有 5 个网球,又买了 2 罐,每罐 3 个,他现在有多少个?
A: Roger 一开始有 5 个。买了 2 罐 × 3 个 = 6 个。所以 5 + 6 = 11 个。答案是 11。

Q: 食堂原本 23 个苹果,用了 20 个做午餐,又买了 6 个,现在有多少?
A:
```

模型大概率会模仿这个"列步骤再给答案"的格式。

### 2026 年的现状:Reasoning Model 把 CoT 内化了

| 模型 | CoT 形式 |
| --- | --- |
| Claude Sonnet 4.6 / Opus 4.7 | 支持 `extended thinking` 参数,模型先自己想再回答 |
| GPT-5 | reasoning model,内部 CoT,API 暴露 reasoning tokens |
| Gemini 2.5 Pro | thinking mode,默认开启 |

调用 Anthropic 的 extended thinking:

```python
message = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=4096,
    thinking={"type": "enabled", "budget_tokens": 2000},
    messages=[{"role": "user", "content": "证明 sqrt(2) 是无理数"}],
)
```

> 经验:**简单任务别开 thinking**——慢、贵、收益不大。**复杂推理 / 多约束 / 数学 / 规划类任务再开**。

---

## 五、Self-Consistency:多次采样投票

CoT 是"想一遍",Self-Consistency 是"想 N 遍取众数"。

### 思路

```
同一个 prompt + 较高 temperature(0.7-1.0)
    ↓
跑 N 次(常见 N=5~20)
    ↓
解析每次的最终答案
    ↓
取出现次数最多的那个
```

### 代码示意

```python
from collections import Counter

def self_consistency(prompt: str, n: int = 5) -> str:
    answers = []
    for _ in range(n):
        resp = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            temperature=0.8,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text
        answers.append(extract_answer(text))  # 自己写抽取函数
    return Counter(answers).most_common(1)[0][0]
```

### 适用场景

| 任务 | 适合 Self-Consistency? |
| --- | --- |
| 数学题、单选题(答案离散) | 适合 |
| 代码补全 | 不太适合(答案太多样,投票没意义) |
| 自由问答 | 不适合 |
| 抽取式 NLP(NER、关系抽取) | 适合 |

> 代价提醒:**N 倍 token 消耗**。生产上少用,评测和高价值场景才划算。

---

## 六、ReAct 的萌芽:Reason + Act

CoT 让模型"会想",但模型"想"完之后只能输出文字——它**没办法去做事**。ReAct(Reason + Act)的核心思想:**让 CoT 的每一步可以选择调一个外部工具**。

```
Thought: 我需要查一下苹果今天的股价
Action: search_stock(symbol="AAPL")
Observation: $192.34
Thought: 现在我可以回答用户了
Final Answer: 苹果今天收盘 192.34 美元
```

ReAct = CoT + Tool Use。**这是从 Prompt Engineering 跨进 Agent 的关键一步**。

具体怎么写、怎么循环、Anthropic 的 tool_use 块如何处理,21 篇细讲,26 篇做完整 Agent。这里只埋一个伏笔:**当你下次写 prompt 写到"如果模型能查一下数据库就好了",就该看 21 了**。

---

## 七、结构化输出

应用层接 LLM,**99% 的场景需要结构化输出**——你后面要 JSON.parse、要塞数据库、要走业务逻辑。让模型乖乖输出合法 JSON 是一个独立技能。

### 方案 A:JSON Mode(OpenAI 风格)

```python
resp = client.chat.completions.create(
    model="gpt-5",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": "你输出 JSON。schema: {title: str, tags: str[]}"},
        {"role": "user", "content": "苹果发布了新 iPhone,屏幕更大续航更好"},
    ],
)
```

更强的版本是 **Structured Outputs / JSON Schema**——直接给 schema,模型保证 100% 合 schema:

```python
resp = client.chat.completions.create(
    model="gpt-5",
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "article",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["title", "tags"],
                "additionalProperties": False,
            },
        },
    },
    messages=[...],
)
```

### 方案 B:XML 标签(Anthropic 心法)

Claude 在训练时见过非常多 XML,**用 XML 标签包数据效果非常好**:

```python
prompt = """
请抽取下面这篇新闻的关键信息,输出在 <result> 标签里。

<news>
{article}
</news>

<result>
<title>...</title>
<entities>
  <entity type="person">...</entity>
  <entity type="org">...</entity>
</entities>
</result>
"""
```

然后用正则或 BeautifulSoup 解析 `<result>` 块。**比让模型直接吐 JSON 更稳**(Claude 偶尔会在 JSON 里加注释或漏逗号,XML 几乎不会出错)。

### 方案 C:Tool Use 兜底

让模型"调用"一个 tool,tool 的参数 schema 就是你想要的输出结构。Anthropic 官方推荐的最稳妥的结构化抽取做法。21 篇详细讲。

---

## 八、Prompt 失效的几种形式与对策

不管你怎么写,prompt 总会失效。先认得这几种典型病。

| 症状 | 根因 | 对策 |
| --- | --- | --- |
| 模型不按格式输出 | 格式描述太抽象 | 给完整示例输出(few-shot) |
| 漏掉某个约束 | 约束藏在长 prompt 中间 | 重要约束放最前/最后,或用 `## 重要` 标注 |
| 输出多了无关解释("以下是答案:...") | 模型默认要"礼貌" | 明确说"直接给结果,不要前言" |
| 中文场景输出英文 | system 里没明确语言 | system 加"永远用简体中文回复" |
| 模型拒绝(过度安全) | prompt 触发了护栏 | 改写措辞、加上工作场景背景 |
| 不一致(同样输入不同输出) | temperature 太高 | 业务场景设 temperature=0 |
| 长输入被忽略中间 | "Lost in the middle" 现象 | 重要内容放开头或结尾;太长就 RAG |

> 这一节的内容到了 24 篇(Context Engineering)会上一个台阶——**当 prompt 长到 5K token 以上,你需要的是"上下文工程",不再是"提示词工程"**。

---

## 九、Anthropic 的 prompt engineering 心法

Anthropic 官方文档的几条心法,**和很多博主教你的"咒语学"完全相反**,但实践证明非常对:

### 1. 直接、明确,不要绕

| 不推荐 | 推荐 |
| --- | --- |
| 也许你可以试着考虑一下... | 请做 X |
| 我希望你扮演一个... | 你是一个... |
| 不要做 X | 请做 Y |

### 2. 给原因,不要光给指令

```
不好:输出必须不超过 100 字。
好  :输出必须不超过 100 字,因为这条消息会显示在手机推送里,超长会被截断。
```

模型理解"为什么"之后,**对边界 case 的判断会更接近你的预期**。

### 3. 让 Claude 思考,而不是只回答

显式说"先列出你的思路,再给最终答案"——比单纯加 "think step by step" 更可控。

### 4. 用 XML 结构化你的 prompt

```
<task>分类客服留言</task>
<input>{留言内容}</input>
<categories>bug, feature_request, billing, other</categories>
<output_format>只输出类别名,不要解释</output_format>
```

### 5. Iterate(改一点跑一点)

**不要一次性写完整 prompt**。先写最简版本跑 5 个样例,看在哪些 case 翻车,再针对性加约束/加样例。Prompt 是"调"出来的,不是"想"出来的。

> 一个真实经验:**很多团队的"复杂 prompt"里 60% 的内容是无效的甚至有害的**——历史上为了 fix 某个 bug 加的,后来 bug 不存在了,约束还在,反而干扰别的 case。定期重构你的 prompt。

---

## 十、踩坑/选型建议

1. **Prompt 不是越长越好**。模型有"中间被忽略"现象,长 prompt 还烧钱。**先从 200 字写起,只在确实必要时再加**。
2. **避免负面指令**(不要做 X)。模型对"不要"的服从度远不如"要做 Y"。能正面表述就正面表述。
3. **业务核心场景 temperature 设 0**(或 0.1)。除非你做创意类(写文案、起名),否则随机性没好处只有坏处。
4. **不要把"全靠 prompt 解决一切"当目标**。当 prompt 写到 2K+ 字还频繁出错,该上 RAG(22 篇)或微调(18 篇)了。
5. **Few-shot > 改写规则**。能给一个例子的,不要写三句解释。
6. **结构化输出优先用 Tool Use 或 JSON Schema**,而不是"求模型乖一点"。
7. **不同模型的 prompt 不通用**。在 Claude 上调好的 prompt 直接迁到 GPT-5 通常掉 5-15% 准确率,**每个模型至少重新调一轮**。
8. **多语言项目里,prompt 用英文写一般更稳**(英语训练语料多),但**输出指令要明确"用中文回答"**。
9. **不要在 prompt 里写"你必须 100% 准确"**。这种话只会让模型紧张,没有实际效果。
10. **保留你的 prompt 历史**。每次改动都用 git 记录,配合 eval(32 篇)看准确率变化,不要凭感觉。

---

下一篇:`21-FunctionCalling与ToolUse.md`,讲怎么让模型不只能"说",还能"调 API"——这是从 prompt 跨向 Agent 的第一步。
