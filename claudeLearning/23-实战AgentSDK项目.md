# 实战 Agent SDK 项目:PR Review Agent

把 19-22 学的拼起来,从零写一个**生产可用的 PR review agent**——CI 触发,自动审 PR,留 review comment。结合 custom tool、subagent、hooks、permission callback,300 行代码端到端跑通。**这一篇就是把"Claude Agent SDK 真能干活"用代码证明给你看**。

> 一句话先记住:**这个 agent 的核心 = 主 Agent 调度 + 三个 subagent(security/perf/style)并行审 + custom tool 给 PR 留 comment + permission callback 兜底**。模式可复刻到任何"自动化代码 / 文档审查"场景。

---

## 一、产品需求

```
触发:GitHub PR 打开 / push 新 commit
流程:
  1. 拉 PR diff
  2. 派 3 个 subagent 并行审(安全 / 性能 / 风格)
  3. 主 agent 综合三方报告,生成最终 review
  4. 留 review comment(GitHub PR review API)
  5. 失败也不阻塞 merge,只是给意见

约束:
  - 单次成本 < $0.50
  - 30 秒内出结论
  - 不主动批准 / 拒绝(只 comment)
  - 不能改任何代码
```

---

## 二、目录结构

```
pr-review-agent/
├── pyproject.toml
├── src/
│   ├── main.py              # 入口
│   ├── tools.py             # custom tools
│   ├── permissions.py       # permission callback
│   ├── prompts.py           # system prompts
│   └── github.py            # GitHub API 封装
├── .github/workflows/
│   └── review.yml           # CI 配置
└── README.md
```

---

## 三、custom tools(`tools.py`)

```python
from claude_agent_sdk import tool
from .github import GitHub

gh = GitHub()  # 内部封装,假设有 PR 操作

@tool(
    name="get_pr_diff",
    description="拉取 PR 的 unified diff(整个 PR,不是单 commit)",
    input_schema={
        "type": "object",
        "properties": {
            "pr_number": {"type": "integer"},
        },
        "required": ["pr_number"],
    },
)
async def get_pr_diff(args, context):
    diff = await gh.fetch_diff(args["pr_number"])
    if len(diff) > 100_000:
        diff = diff[:100_000] + "\n...[diff 过大已截断]..."
    return {"content": [{"type": "text", "text": diff}]}


@tool(
    name="get_pr_metadata",
    description="拉取 PR 元信息:标题 / 描述 / 作者 / 改动文件列表 / +/-行数",
    input_schema={
        "type": "object",
        "properties": {"pr_number": {"type": "integer"}},
        "required": ["pr_number"],
    },
)
async def get_pr_metadata(args, context):
    meta = await gh.fetch_meta(args["pr_number"])
    text = (
        f"#{meta.number} {meta.title}\n"
        f"作者: {meta.author}\n"
        f"+{meta.additions} / -{meta.deletions}\n"
        f"改动文件: {len(meta.files)}\n\n"
        f"描述:\n{meta.body or '(无)'}\n\n"
        f"文件列表:\n" + "\n".join(f"- {f.filename}" for f in meta.files[:30])
    )
    return {"content": [{"type": "text", "text": text}]}


@tool(
    name="leave_review_comment",
    description="在 PR 上留一条整体 review comment(不是 inline)。**这是 agent 唯一被允许的写动作**。",
    input_schema={
        "type": "object",
        "properties": {
            "pr_number": {"type": "integer"},
            "body": {"type": "string", "description": "comment 内容,markdown"},
            "verdict": {
                "type": "string",
                "enum": ["approve", "request_changes", "comment"],
                "description": "approve / request_changes / comment(本 agent 只能 comment)",
            },
        },
        "required": ["pr_number", "body", "verdict"],
    },
)
async def leave_review_comment(args, context):
    if args["verdict"] != "comment":
        return {
            "content": [{"type": "text", "text": "本 agent 只能 verdict=comment"}],
            "is_error": True,
        }
    await gh.create_review(
        pr=args["pr_number"], body=args["body"], event="COMMENT"
    )
    return {"content": [{"type": "text", "text": "已留 review comment"}]}
```

---

## 四、Permission callback(`permissions.py`)

```python
DENYED_PATTERNS = [
    "git push",
    "rm -rf",
    "DROP TABLE",
    "force",
]

async def permission_callback(tool_name, tool_input, context):
    # 1. 全局 deny
    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        for p in DENYED_PATTERNS:
            if p in cmd.lower():
                return {"behavior": "deny", "message": f"命中 deny 规则: {p}"}

    # 2. 限制 leave_review_comment 只能调一次
    if tool_name == "leave_review_comment":
        ctr = context.metadata.get("review_count", 0)
        if ctr >= 1:
            return {"behavior": "deny", "message": "已留过一次 comment"}
        context.metadata["review_count"] = ctr + 1

    # 3. 默认 allow
    return {"behavior": "allow"}
```

---

## 五、System prompts(`prompts.py`)

```python
MAIN_PROMPT = """
你是一个 PR review agent,任务是审查 GitHub PR 并留一条整体 review comment。

工作流程:
1. 用 get_pr_metadata 看 PR 元信息(标题、改动量、文件)
2. 用 get_pr_diff 拉完整 diff
3. **并行**派以下 3 个 subagent(单条消息发 3 个 Task):
   - security-auditor:审查安全风险
   - perf-reviewer:审查性能
   - style-reviewer:审查风格 / 命名 / 可读性
4. 等三个 subagent 都完成,综合给一份 review,格式见下
5. 用 leave_review_comment 留下 review,verdict 总是 "comment"

review 格式:

## 自动 Review #{pr_number}

**改动概要**:<一句话>

**安全检查**:<一句话总结 + 详情>
**性能检查**:<一句话总结 + 详情>
**风格检查**:<一句话总结 + 详情>

**综合建议**:<可合并 / 建议修改 / 不建议合并>

**主要关注点**(按优先级):
1. ...
2. ...

注意:
- 不主动批准 / 拒绝(verdict 永远是 "comment")
- 报告中文,客观、具体到文件:行号
- 总长度 < 1000 字
"""

SECURITY_PROMPT = """
你是安全审查专家。看 PR diff,从以下维度找问题:

1. 注入(SQL / XSS / Command injection)
2. 鉴权 / 越权(IDOR、缺少权限校验)
3. 密钥泄漏(硬编码 API key、token、密码)
4. 危险依赖(已知 CVE 包)
5. 输入校验 / 输出转义

输出 200 字以内的报告,格式:
- 总结(一句话):<风险等级:无 / 低 / 中 / 高>
- 具体问题(列表,每条带文件:行号)

只读,不调用 leave_review_comment 等写工具。
"""

PERF_PROMPT = """
你是性能审查专家。看 PR diff,关注:
1. N+1 查询 / 嵌套循环
2. 不必要的同步 IO
3. 大对象拷贝
4. 缺少缓存的高频路径
5. 阻塞操作放在事件循环

输出 200 字以内,格式同安全。
"""

STYLE_PROMPT = """
你是代码风格审查专家。关注:
1. 命名(过短 / 缩写 / 不一致)
2. 抽象(过度 / 不足 / 重复)
3. 注释(缺失 / 过期)
4. 函数过长(> 100 行)
5. 文件结构

输出 200 字以内,格式同安全。
"""
```

---

## 六、主入口(`main.py`)

```python
import asyncio
import os
import sys
from claude_agent_sdk import query, ClaudeAgentOptions
from .tools import get_pr_diff, get_pr_metadata, leave_review_comment
from .permissions import permission_callback
from .prompts import MAIN_PROMPT, SECURITY_PROMPT, PERF_PROMPT, STYLE_PROMPT


async def review_pr(pr_number: int) -> dict:
    options = ClaudeAgentOptions(
        model="claude-sonnet-4-7",
        system_prompt=MAIN_PROMPT,
        custom_tools=[get_pr_diff, get_pr_metadata, leave_review_comment],
        subagents=[
            {
                "name": "security-auditor",
                "description": "审查安全风险:注入 / 越权 / 密钥泄漏",
                "tools": [],   # 只用主 agent 已经拉好的 diff(在 prompt 里给)
                "model": "claude-sonnet-4-7",
                "system_prompt": SECURITY_PROMPT,
            },
            {
                "name": "perf-reviewer",
                "description": "审查性能问题:N+1 / 阻塞 IO / 缓存",
                "tools": [],
                "model": "claude-haiku-4-5",   # 性能审用便宜模型够
                "system_prompt": PERF_PROMPT,
            },
            {
                "name": "style-reviewer",
                "description": "审查代码风格 / 命名 / 抽象",
                "tools": [],
                "model": "claude-haiku-4-5",
                "system_prompt": STYLE_PROMPT,
            },
        ],
        permission_prompt_callback=permission_callback,
        max_turns=20,
        cwd=os.getcwd(),
    )

    total_cost = 0.0
    final_text = ""
    async for msg in query(
        prompt=f"审查 PR #{pr_number},按 system prompt 流程",
        options=options,
    ):
        if msg.type == "assistant":
            for block in msg.content:
                if block.type == "text":
                    final_text += block.text
                if block.type == "tool_use":
                    print(f"[{block.name}] {block.input}", file=sys.stderr)
        if msg.type == "result":
            total_cost = msg.total_cost_usd
            print(f"[result] cost ${total_cost:.4f}", file=sys.stderr)

    return {"text": final_text, "cost": total_cost}


if __name__ == "__main__":
    pr = int(sys.argv[1])
    result = asyncio.run(review_pr(pr))
    print(result["text"])
```

---

## 七、CI 配置(`.github/workflows/review.yml`)

```yaml
name: pr-review-agent
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with: { python-version: "3.13" }
      - run: pip install -e .
      - run: python -m src.main ${{ github.event.pull_request.number }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

每次 PR 改动自动跑,review 留 comment。

---

## 八、跑一遍真 PR 的预期效果

PR comment 大致这样:

```markdown
## 自动 Review #234

**改动概要**:把 `auth/middleware.ts` 从 callback 改成 async/await,顺带补了
错误处理。新增 12 行,删 8 行,只动了 1 个文件。

**安全检查**:**风险:无**
未发现注入 / 越权 / 密钥泄漏。新加的错误处理把异常吞了再 throw,符合现有约定。

**性能检查**:**总结:小幅改善**
原 callback 嵌套已扁平化,可读性 + 性能都正向。无 N+1 / 阻塞 IO 风险。

**风格检查**:**总结:基本良好**
- `auth/middleware.ts:42` 命名 `ret` 改为 `result` 更清晰
- `auth/middleware.ts:58` 注释还是英文,本仓约定中文

**综合建议**:✅ **可合并**(小幅 nit 可后续修)

**主要关注点**:
1. `auth/middleware.ts:42` 命名建议 ret → result
2. 注释语言一致性
```

**实测成本** ~ $0.05 / PR(中等大小 PR);**耗时** 8-15 秒。

---

## 九、可扩展的几个方向

### 9.1 加 inline review(具体行号 comment)

leave_review_comment 改造支持 inline review API,subagent 报告里附带 file:line,主 agent 转成 inline。

### 9.2 加 skill 包

写一个 `~/.claude/skills/pr-review/` skill,在 Claude Code CLI 里 `/review` 直接触发。**同一个 agent 既能跑 CI 又能在本地用**。

### 9.3 加 cache

system prompt + subagent prompt + tool description 加 cache_control,**第二次审同一仓库 PR 时省 80% 输入 token**。

### 9.4 支持 monorepo 多 codeowner

按改动文件路径选不同的 review subagent(前端 vs 后端 vs 基建)。

### 9.5 加 statistics

记录每个 PR review 的成本 / 耗时 / verdict 分布,半年后有数据 audit。

---

## 十、踩坑

1. **subagent 不并行**——主 prompt 没说"并行调三个 Task",顺序跑慢 3x
2. **permission callback 太宽**——某 hook bug 让 LLM 调 100 次 tool,permission 一律 allow,$50 没了
3. **不限 max_turns**——LLM 来回讨论审查标准跑了 50 轮,贵
4. **不截断 diff**——大 PR 的 diff 几 MB,直接撑爆 context
5. **subagent 用 Opus**——简单 review 子任务给 Sonnet / Haiku 够;**默认 Sonnet,简单子任务 Haiku**
6. **CI 失败阻塞 merge**——business 不允许 review agent 阻塞合并,**永远只 comment**
7. **不监控成本**——某月一个团队的 PR 暴增,账单飞;**按 user / repo 统计**
8. **prompt 不写"不主动 approve / request_changes"**——LLM 偶尔会自作主张点 approve,惹麻烦
9. **不处理 LLM 没调 tool 直接给文本**——LLM 偶尔懒得调 leave_review_comment 直接讲了,你的 CI 看到没 comment 留下;**主循环检查 + 强制再调**
10. **leave_review_comment 没 once-only 限制**——LLM 被搞糊涂会留 5 条 review comment,PR 评论区炸;**permission 里限制只能调 1 次**

---

## 十一、第三层(Agent SDK)结束语

19-23 篇讲完了 Claude Agent SDK 的全部内容:

```
19 总览          为什么 SDK 而不是裸 API
20 内部机制      Agent Loop / Compaction
21 Tool / Subagent  扩展能力
22 长任务         Compaction 与 Checkpoint
23 实战         PR Review Agent 完整例子
```

到这里你已经能写**生产级 Coding Agent / 客服 Agent / 数据 Agent**——所有 Agent 模式都是这套机制的变体。

下一段(24-27)进入 MCP server 开发——AI 系列只讲了协议本身,这里站在"我要写一个 server 给团队 / 全公司用"的角度,讲 server 写法、企业落地、远程化、安全。
