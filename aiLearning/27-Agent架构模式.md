# Agent 架构模式

ReAct 解决了"LLM 能用工具"的问题，但真实场景的复杂任务需要更精细的架构。这一篇讲五种主流 Agent 架构模式，以及怎么选。

---

## 一、五种架构速览

| 模式 | 核心思路 | 适合场景 |
| --- | --- | --- |
| **ReAct** | 边想边干，一步一步走 | 简单工具调用任务 |
| **Plan-Execute** | 先全部规划，再逐步执行 | 多步骤、有依赖的复杂任务 |
| **Reflection** | 执行后反思，失败就重来 | 需要高质量输出 |
| **Tree of Thoughts** | 并行探索多条路径 | 解题/规划类，需要搜索 |
| **Multi-Agent** | 多个专家协作 | 任务可以分工的大型系统 |

---

## 二、Plan-Execute：先规划后执行

**问题**：ReAct 每步只看当前，容易"鼠目寸光"，走了一半发现方向错了。

**解法**：第一步让模型生成完整计划，之后按计划执行，执行中允许重新规划。

```python
import anthropic
import json

client = anthropic.Anthropic()

def plan(task: str) -> list[str]:
    """让模型生成执行计划"""
    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system="你是一个任务规划专家。把用户的任务拆解为具体的执行步骤，返回 JSON 数组格式，每项是一个步骤描述。",
        messages=[{"role": "user", "content": f"任务：{task}\n\n请返回步骤列表，格式：[\"步骤1\", \"步骤2\", ...]"}],
    )
    text = response.content[0].text
    # 提取 JSON
    start = text.find("[")
    end = text.rfind("]") + 1
    return json.loads(text[start:end])

def execute_step(step: str, context: str) -> str:
    """执行单个步骤"""
    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system="你是一个执行专家。根据已有上下文，执行指定步骤并返回结果。",
        messages=[{"role": "user", "content": f"上下文：{context}\n\n当前步骤：{step}\n\n请执行并返回结果："}],
    )
    return response.content[0].text

def plan_execute_agent(task: str) -> str:
    steps = plan(task)
    print(f"计划：{steps}")

    context = f"任务：{task}\n\n"
    for i, step in enumerate(steps):
        print(f"\n执行步骤 {i+1}: {step}")
        result = execute_step(step, context)
        context += f"\n步骤{i+1}（{step}）结果：{result}"

    # 汇总
    final = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"基于以下执行过程，给出最终总结：\n\n{context}"}],
    )
    return final.content[0].text
```

---

## 三、Reflection：失败后反思重来

**思路**：执行完之后加一个"评审"步骤，如果质量不够，告诉 Agent 哪里不对，重新生成。

```python
def reflect(task: str, output: str) -> dict:
    """评审输出，返回 {ok: bool, feedback: str}"""
    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=512,
        system="你是一个严格的质量审查员。判断输出是否完整准确地完成了任务。",
        messages=[{
            "role": "user",
            "content": f"任务：{task}\n\n输出：{output}\n\n请判断：1.是否完成任务？2.有何不足？\n返回格式：{{\"ok\": true/false, \"feedback\": \"...\"}}"
        }],
    )
    text = response.content[0].text
    start = text.find("{")
    end = text.rfind("}") + 1
    return json.loads(text[start:end])

def reflection_agent(task: str, max_retries: int = 3) -> str:
    attempt = 0
    feedback = ""
    while attempt < max_retries:
        # 生成输出
        prompt = task if not feedback else f"{task}\n\n上次的问题：{feedback}，请改进："
        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        output = response.content[0].text

        # 反思
        review = reflect(task, output)
        print(f"第{attempt+1}次尝试，评审结果：{review}")

        if review["ok"]:
            return output

        feedback = review["feedback"]
        attempt += 1

    return output  # 超过重试次数，返回最后一次结果
```

---

## 四、Tree of Thoughts：多路径搜索

适合有明确评分标准的任务（解数学题、写代码、路径规划）。**同时**生成多个候选方案，评分后选最好的继续展开。

```
                  任务
                 / | \
               A   B   C     ← 第一层：3个方案
              /\   |   /\
            A1 A2  B1 C1 C2  ← 第二层：继续展开
                   |
                  B1a         ← 找到最优路径
```

实现上需要：
1. **生成器**：给定当前状态，生成 N 个候选下一步
2. **评估器**：给每个候选打分（可以是另一个 LLM 调用）
3. **搜索策略**：BFS（广度优先）或 MCTS（蒙特卡洛树搜索）

适合场景：代码生成（多个实现方案打分）、数学解题、创意写作（多个风格评分）。

---

## 五、Subagent 模式：把任务委托出去

主 Agent 负责规划和协调，把子任务分配给专门的 Subagent：

```python
class ResearchAgent:
    """专门负责搜索和信息收集"""
    def run(self, query: str) -> str: ...

class WriterAgent:
    """专门负责写作和总结"""
    def run(self, outline: str, research: str) -> str: ...

class OrchestratorAgent:
    """协调者，分配任务"""
    def __init__(self):
        self.researcher = ResearchAgent()
        self.writer = WriterAgent()

    def run(self, task: str) -> str:
        # 1. 规划
        outline = self._plan(task)
        # 2. 委托研究
        research = self.researcher.run(outline)
        # 3. 委托写作
        result = self.writer.run(outline, research)
        return result
```

---

## 六、如何选择架构

```
任务复杂度？
├─ 简单（1-3步工具调用）→ ReAct 够了
│
├─ 中等（多步骤、有依赖）→ Plan-Execute
│
├─ 需要高质量（反复打磨）→ Reflection
│
├─ 有搜索空间（多方案）→ Tree of Thoughts
│
└─ 大型、可分工 → Multi-Agent（第28篇）
```

**经验法则**：先用最简单的 ReAct，出了问题再升级架构。过度设计会带来调试噩梦。

---

## 七、各模式对比

| 维度 | ReAct | Plan-Execute | Reflection | ToT |
| --- | --- | --- | --- | --- |
| 实现复杂度 | 低 | 中 | 中 | 高 |
| Token 消耗 | 低 | 中 | 中~高 | 高 |
| 适合任务类型 | 开放任务 | 结构化任务 | 质量敏感 | 搜索任务 |
| 可控性 | 中 | 高 | 高 | 中 |
| 出错恢复 | 弱 | 中 | 强 | 中 |

---

## 八、关键细节

**系统提示是架构的核心**。不同角色（规划者、执行者、评审者）的 system prompt 决定了整个流程质量。不要偷懒用同一个 prompt 做所有角色。

**状态传递要显式**。Agent 之间传信息靠的是 prompt 中的文本，不要假设模型"知道上下文"——把所有必要信息都明确写进去。

**评估比架构更重要**。没有 eval 的 Agent 系统，你不知道换了架构是变好了还是变坏了（详见第32篇）。
