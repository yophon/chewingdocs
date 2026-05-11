# Memory 记忆系统

LLM 本身是无状态的——每次调用都是全新对话，昨天说过的话它完全不记得。**记忆系统**就是给 LLM 补上"记得"的能力。

> 一句话先记住：记忆不是让模型"真的记住"，而是在每次调用时把"应该记得的内容"塞进 context。

---

## 一、记忆的四种类型

| 类型 | 类比 | 存在哪 | 特点 |
| --- | --- | --- | --- |
| **In-context（短期）** | 工作记忆 | system/user prompt | 最快，但受 context window 限制 |
| **External（外部长期）** | 笔记本 | 数据库 / 向量库 | 容量无限，需检索 |
| **Summary（摘要）** | 会议纪要 | 压缩后写回 prompt | 节省 token，信息有损 |
| **Parametric（参数）** | 本能反应 | 模型权重（微调）| 持久，但更新成本高 |

大多数应用只需要前三种组合。

---

## 二、短期记忆：直接塞进 context

最简单的记忆——把历史对话原样带上：

```python
from anthropic import Anthropic

client = Anthropic()
history = []  # [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]

def chat(user_msg: str) -> str:
    history.append({"role": "user", "content": user_msg})
    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system="你是一个助手，记住我们整个对话。",
        messages=history,
    )
    reply = response.content[0].text
    history.append({"role": "assistant", "content": reply})
    return reply
```

**问题**：聊久了 context 爆掉。解法：截断、摘要、或滑动窗口。

---

## 三、摘要记忆：压缩历史

当 history 超过阈值，用模型把旧对话压缩成摘要，只保留摘要 + 最近 N 轮：

```python
def summarize(history: list) -> str:
    summary_prompt = "请把以下对话压缩成200字以内的摘要，保留重要事实：\n"
    for msg in history:
        summary_prompt += f"{msg['role']}: {msg['content']}\n"
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",  # 用快模型做摘要
        max_tokens=300,
        messages=[{"role": "user", "content": summary_prompt}],
    )
    return resp.content[0].text

WINDOW = 10
def compress_if_needed(history: list) -> list:
    if len(history) <= WINDOW:
        return history
    summary = summarize(history[:-WINDOW])
    new_start = {"role": "user", "content": f"[对话摘要] {summary}"}
    return [new_start] + history[-WINDOW:]
```

---

## 四、外部长期记忆：向量检索

适合跨会话记忆（"上次你说你住上海"）。做法：

```
存：把重要事实 → embedding → 写入向量库
取：每次对话前，用当前问题检索相关记忆 → 塞进 system prompt
```

```python
import chromadb
from anthropic import Anthropic

client = Anthropic()
db = chromadb.Client()
collection = db.get_or_create_collection("user_memory")

def remember(fact: str, user_id: str):
    """存一条事实"""
    # 用 Claude 的 embedding（或 OpenAI / sentence-transformers）
    collection.add(
        documents=[fact],
        ids=[f"{user_id}_{hash(fact)}"],
        metadatas=[{"user_id": user_id}],
    )

def recall(query: str, user_id: str, top_k: int = 3) -> list[str]:
    """检索相关记忆"""
    results = collection.query(
        query_texts=[query],
        n_results=top_k,
        where={"user_id": user_id},
    )
    return results["documents"][0]

def chat_with_memory(user_msg: str, user_id: str) -> str:
    memories = recall(user_msg, user_id)
    memory_str = "\n".join(f"- {m}" for m in memories)
    system = f"你是助手。以下是关于用户的记忆：\n{memory_str}"
    resp = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    return resp.content[0].text
```

---

## 五、结构化记忆：Key-Value 档案

比向量检索更精确，适合存用户档案（姓名、偏好、历史行为）：

```python
import json

class UserProfile:
    def __init__(self, path: str):
        self.path = path
        try:
            self.data = json.load(open(path))
        except FileNotFoundError:
            self.data = {}

    def update(self, key: str, value):
        self.data[key] = value
        json.dump(self.data, open(self.path, "w"), ensure_ascii=False)

    def to_prompt(self) -> str:
        if not self.data:
            return "暂无用户档案。"
        return "\n".join(f"- {k}: {v}" for k, v in self.data.items())
```

---

## 六、记忆的写入时机

记忆不是所有内容都要存，要有筛选：

| 策略 | 说明 |
| --- | --- |
| **模型判断** | 每轮结束后问模型"这段对话有什么值得记住的？" |
| **规则提取** | 正则 / 关键词匹配（用户说了名字、偏好等）|
| **人工标注** | 用户主动说"记住这个：..." |
| **事件触发** | 任务完成时自动存结果 |

---

## 七、Memory 系统设计的三个坑

**坑 1：记忆污染**。存了错误信息后一直用，越来越偏。解法：给记忆加有效期和置信度，支持覆盖。

**坑 2：检索噪音**。Top-K 检索回来的记忆不一定相关，塞进 prompt 反而干扰。解法：加 relevance score 阈值，低分不用。

**坑 3：隐私泄漏**。多用户场景下记忆串库。解法：所有记忆绑定 `user_id`，检索时严格过滤。

---

## 八、完整架构一张图

```
用户输入
   │
   ├─ 检索外部记忆（向量库）──→ 相关事实
   ├─ 读取结构化档案（KV）──→ 用户信息
   └─ 压缩历史（摘要）──→ 对话背景
              │
              ▼
        组装 System Prompt
              │
              ▼
          LLM 调用
              │
              ▼
         助手回复
              │
              ├─ 提取新记忆 ──→ 写入向量库 / KV
              └─ 追加到 history
```

---

## 九、选型建议

| 场景 | 推荐方案 |
| --- | --- |
| 单轮对话 App | 不需要记忆 |
| 多轮聊天机器人 | In-context + 摘要压缩 |
| 跨会话的个人助理 | 向量库 + 结构化档案 |
| 企业知识问答 | 向量库（RAG）|
| 个性化推荐 | 结构化档案 + 行为日志 |
