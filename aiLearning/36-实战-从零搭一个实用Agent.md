# 实战：从零搭一个实用 Agent

前面 35 篇讲了理论和各个模块，这一篇把它们全用上——搭一个能实际干活的 Agent：**个人研究助手**，能联网搜索、读文件、做摘要、记住历史。

---

## 一、目标功能

```
用户输入任意问题
   │
   ├─ 需要实时信息 → 搜索网络
   ├─ 需要读文件   → 读取本地文件
   ├─ 需要计算     → 执行 Python 代码
   └─ 普通问答     → 直接回答
          │
          ▼
   给出答案，并记住本次对话
```

---

## 二、项目结构

```
research_agent/
├── agent.py          # 主 Agent 循环
├── tools.py          # 工具实现
├── memory.py         # 对话历史管理
└── main.py           # 入口（命令行交互）
```

---

## 三、工具层（tools.py）

```python
import os
import json
import subprocess
import tempfile
from pathlib import Path

# 工具定义（Claude API 格式）
TOOLS = [
    {
        "name": "web_search",
        "description": "搜索网络获取最新信息。当需要实时数据、新闻、或模型训练截止日期后的信息时使用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
                "num_results": {"type": "integer", "description": "返回结果数量，默认3", "default": 3},
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_file",
        "description": "读取本地文件内容。支持 .txt .md .py .json .csv 等文本文件。",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "文件的绝对路径或相对路径"},
                "max_chars": {"type": "integer", "description": "最多读取字符数，默认5000", "default": 5000},
            },
            "required": ["path"],
        },
    },
    {
        "name": "run_python",
        "description": "执行 Python 代码并返回输出。用于数学计算、数据处理等。不能访问网络和文件系统。",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "要执行的 Python 代码"},
            },
            "required": ["code"],
        },
    },
    {
        "name": "save_note",
        "description": "把重要信息保存到笔记文件。用于用户要求记录的内容。",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "笔记标题"},
                "content": {"type": "string", "description": "笔记内容"},
            },
            "required": ["title", "content"],
        },
    },
]


def run_tool(name: str, inputs: dict) -> str:
    """执行工具，返回字符串结果"""
    try:
        if name == "web_search":
            return _web_search(inputs["query"], inputs.get("num_results", 3))
        elif name == "read_file":
            return _read_file(inputs["path"], inputs.get("max_chars", 5000))
        elif name == "run_python":
            return _run_python(inputs["code"])
        elif name == "save_note":
            return _save_note(inputs["title"], inputs["content"])
        else:
            return f"[错误] 未知工具: {name}"
    except Exception as e:
        return f"[工具执行出错] {name}: {e}"


def _web_search(query: str, num_results: int) -> str:
    # 真实场景接 SerpAPI / Tavily / Bing Search API
    # 这里用 Mock 演示结构
    mock_results = [
        {"title": f"关于'{query}'的搜索结果1", "url": "https://example.com/1", "snippet": f"这是关于{query}的详细说明..."},
        {"title": f"关于'{query}'的搜索结果2", "url": "https://example.com/2", "snippet": f"{query}的最新进展..."},
    ][:num_results]
    return json.dumps(mock_results, ensure_ascii=False, indent=2)


def _read_file(path: str, max_chars: int) -> str:
    p = Path(path).expanduser()
    if not p.exists():
        return f"[错误] 文件不存在: {path}"
    if not p.is_file():
        return f"[错误] 不是文件: {path}"
    content = p.read_text(encoding="utf-8", errors="ignore")
    if len(content) > max_chars:
        content = content[:max_chars] + f"\n\n[截断，原文件 {len(content)} 字符，只读了前 {max_chars} 字符]"
    return content


def _run_python(code: str) -> str:
    # 在受限环境运行代码
    restricted_code = f"""
import sys, math, json, statistics
# 禁止网络和文件访问（生产环境用 sandbox）
{code}
"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(restricted_code)
        tmp_path = f.name

    try:
        result = subprocess.run(
            ["python3", tmp_path],
            capture_output=True, text=True, timeout=10
        )
        output = result.stdout or result.stderr or "(无输出)"
        return output[:2000]  # 限制长度
    except subprocess.TimeoutExpired:
        return "[错误] 代码执行超时（10s）"
    finally:
        os.unlink(tmp_path)


def _save_note(title: str, content: str) -> str:
    notes_dir = Path("~/notes").expanduser()
    notes_dir.mkdir(exist_ok=True)
    filename = notes_dir / f"{title.replace(' ', '_')}.md"
    filename.write_text(f"# {title}\n\n{content}\n", encoding="utf-8")
    return f"已保存到 {filename}"
```

---

## 四、记忆层（memory.py）

```python
import json
from pathlib import Path

class ConversationMemory:
    def __init__(self, max_turns: int = 20, summary_threshold: int = 15):
        self.history: list[dict] = []
        self.max_turns = max_turns
        self.summary_threshold = summary_threshold

    def add_user(self, content):
        self.history.append({"role": "user", "content": content})

    def add_assistant(self, content):
        self.history.append({"role": "assistant", "content": content})

    def get_messages(self) -> list[dict]:
        return self.history

    def should_compress(self) -> bool:
        return len(self.history) > self.summary_threshold * 2

    def compress(self, summary: str):
        """用摘要替换旧历史，保留最近 max_turns 条"""
        recent = self.history[-self.max_turns:]
        self.history = [
            {"role": "user", "content": f"[历史摘要]\n{summary}"},
            {"role": "assistant", "content": "已了解历史对话背景。"},
        ] + recent

    def save(self, path: str):
        Path(path).write_text(json.dumps(self.history, ensure_ascii=False, indent=2), encoding="utf-8")

    def load(self, path: str):
        p = Path(path)
        if p.exists():
            self.history = json.loads(p.read_text(encoding="utf-8"))
```

---

## 五、主 Agent 循环（agent.py）

```python
import anthropic
from tools import TOOLS, run_tool
from memory import ConversationMemory

client = anthropic.Anthropic()

SYSTEM_PROMPT = """你是一个实用的个人研究助手。

你有以下工具：
- web_search：搜索实时网络信息
- read_file：读取本地文件
- run_python：执行 Python 代码做计算
- save_note：保存重要笔记

工作原则：
1. 优先用知识直接回答，工具只在真正需要时用
2. 搜索前先明确搜索目标，避免无效搜索
3. 复杂任务先规划步骤再执行
4. 答案要简洁，重点突出
"""

MAX_STEPS = 15


class ResearchAgent:
    def __init__(self, memory: ConversationMemory):
        self.memory = memory

    def run(self, user_input: str) -> str:
        self.memory.add_user(user_input)

        step = 0
        while step < MAX_STEPS:
            response = client.messages.create(
                model="claude-opus-4-7",
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=self.memory.get_messages(),
            )
            step += 1

            # 结束
            if response.stop_reason == "end_turn":
                final_text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        final_text += block.text
                self.memory.add_assistant(response.content)
                return final_text

            # 工具调用
            if response.stop_reason == "tool_use":
                self.memory.add_assistant(response.content)

                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        print(f"  → 调用工具: {block.name}({block.input})")
                        result = run_tool(block.name, block.input)
                        print(f"  ← 结果: {result[:100]}{'...' if len(result) > 100 else ''}")
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result,
                        })

                self.memory.add_user(tool_results)

        return "[Agent 达到最大步数限制，请重试或拆分任务]"
```

---

## 六、入口（main.py）

```python
from agent import ResearchAgent
from memory import ConversationMemory
import anthropic

HISTORY_FILE = ".conversation_history.json"

def summarize_history(history: list) -> str:
    """用快速模型压缩历史"""
    client = anthropic.Anthropic()
    text = "\n".join(
        f"{m['role']}: {m['content'] if isinstance(m['content'], str) else '[工具调用]'}"
        for m in history[-20:]
    )
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": f"请将以下对话压缩成200字以内摘要：\n\n{text}"}],
    )
    return resp.content[0].text


def main():
    memory = ConversationMemory()
    memory.load(HISTORY_FILE)

    agent = ResearchAgent(memory)

    print("个人研究助手已启动（输入 'exit' 退出，'clear' 清空历史）")
    print("-" * 50)

    while True:
        try:
            user_input = input("\n你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        if not user_input:
            continue
        if user_input.lower() == "exit":
            break
        if user_input.lower() == "clear":
            memory.history.clear()
            print("历史已清空。")
            continue

        print("\n助手: ", end="", flush=True)
        answer = agent.run(user_input)
        print(answer)

        # 历史过长时压缩
        if memory.should_compress():
            print("\n[自动压缩历史中...]")
            summary = summarize_history(memory.history)
            memory.compress(summary)

        memory.save(HISTORY_FILE)


if __name__ == "__main__":
    main()
```

---

## 七、运行方式

```bash
# 安装依赖
pip install anthropic

# 设置 API Key
export ANTHROPIC_API_KEY="your-key-here"

# 启动
python main.py
```

交互示例：
```
你: 帮我算一下 1 到 100 的和

  → 调用工具: run_python({'code': 'print(sum(range(1, 101)))'})
  ← 结果: 5050

助手: 1 到 100 的和是 **5050**。

你: 读一下我桌面上的 README.md 文件

  → 调用工具: read_file({'path': '~/Desktop/README.md'})
  ← 结果: # 项目说明...

助手: 文件内容如下：...
```

---

## 八、这套架构涵盖了什么

| 模块 | 对应篇章 |
| --- | --- |
| Tool Use / Function Calling | 第 21 篇 |
| Agent 循环（ReAct） | 第 26 篇 |
| 记忆压缩 | 第 25 篇 |
| Context 管理 | 第 24 篇 |
| 模型选型（Haiku 做摘要） | 第 31 篇 |
| 错误处理 / 超时 | 第 26 篇 |

---

## 九、下一步可以加什么

| 功能 | 怎么加 |
| --- | --- |
| 真实联网搜索 | 接 Tavily / SerpAPI，替换 `_web_search` |
| 向量记忆 | 用 ChromaDB 存历史，语义检索（第 23、25 篇）|
| 多 Agent 分工 | 加专门的 WriterAgent、ResearchAgent（第 28 篇）|
| 流式输出 | `client.messages.stream(...)` 代替 `create` |
| Web UI | 用 Streamlit / Gradio 包一层 |
| Eval 测试集 | 写测试用例验证 Agent 质量（第 32 篇）|

这是一套可以直接拿去改的基础框架——把工具换成你业务里的 API，就变成了你自己的 AI 助手。
