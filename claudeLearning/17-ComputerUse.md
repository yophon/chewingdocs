# Computer Use

aiLearning/38 已经讲过 Computer Use 的概念定位——把"鼠标键盘 + 屏幕"作为统一接口,让 LLM 真的"用电脑"。这一篇是 **Anthropic SDK 视角下"怎么写 Computer Use 应用"**:工具集、循环结构、沙箱建议、典型场景。

> 一句话先记住:**Computer Use = Claude 看屏幕截图 + 控制鼠标键盘 + 跑 bash + 用 text editor**。能力极通用——任何"在电脑上能做的事"它都能尝试。但**脆、慢、贵**——除非真没别的办法,优先选 API、CLI、MCP 解决问题。

---

## 一、四件套工具

Computer Use 由 Anthropic 提供的几个 server tool 组成:

| 工具 | 作用 |
| --- | --- |
| **`computer`** | 截屏、移动鼠标、点击、滚动、按键、打字 |
| **`bash`** | 在沙箱里跑 shell 命令 |
| **`text_editor`** | Claude 能读、写、改文件(view/create/replace/insert/undo) |

```python
tools = [
    {
        "type": "computer_20250124",
        "name": "computer",
        "display_width_px": 1024,
        "display_height_px": 768,
    },
    {"type": "bash_20250124", "name": "bash"},
    {"type": "text_editor_20250124", "name": "str_replace_editor"},
]
```

**重要**:这些是 **Anthropic 后端识别的"server tool"**——你**不需要自己实现工具的 schema**,直接传 type 即可。但**你必须自己实现执行逻辑**(屏幕截图、点击坐标转换、bash 跑命令)。

---

## 二、computer 工具的 actions

`computer` tool 接受 action 字段:

| action | 参数 |
| --- | --- |
| `screenshot` | 无 |
| `mouse_move` | `coordinate: [x, y]` |
| `left_click` | `coordinate: [x, y]` |
| `right_click` | `coordinate: [x, y]` |
| `double_click` | `coordinate: [x, y]` |
| `scroll` | `coordinate: [x, y]`, `scroll_direction: "up"/"down"`, `scroll_amount` |
| `type` | `text: "..."` |
| `key` | `text: "Return"` / `"cmd+a"` / `"Tab"` 等 xdotool 风格 |
| `wait` | `duration: 秒` |

Claude 调一次 `computer({action: "screenshot"})`,你抓屏返回 base64 图;Claude 看完决定下一步动作。

---

## 三、最小骨架

```python
import base64, subprocess
from anthropic import Anthropic

client = Anthropic()

def run_action(name, args):
    """实际执行 LLM 决定的 action,返回 tool_result content。"""
    if name == "computer":
        action = args["action"]
        if action == "screenshot":
            png = subprocess.check_output(["screencapture", "-x", "-t", "png", "-"])
            return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(png).decode()}}]
        elif action == "left_click":
            x, y = args["coordinate"]
            subprocess.run(["cliclick", f"c:{x},{y}"])
            return "clicked"
        elif action == "type":
            subprocess.run(["cliclick", "-w", "20", f"t:{args['text']}"])
            return "typed"
        # ...
    elif name == "bash":
        cmd = args["command"]
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return f"stdout:\n{out.stdout}\nstderr:\n{out.stderr}"
    elif name == "str_replace_editor":
        # 实现 view / create / str_replace / insert / undo_edit
        ...
    raise ValueError(f"unknown {name}")

def computer_use_loop(task: str, max_steps=20):
    messages = [{"role": "user", "content": task}]
    tools = [
        {"type": "computer_20250124", "name": "computer",
         "display_width_px": 1280, "display_height_px": 800},
        {"type": "bash_20250124", "name": "bash"},
        {"type": "text_editor_20250124", "name": "str_replace_editor"},
    ]
    for i in range(max_steps):
        resp = client.messages.create(
            model="claude-sonnet-4-7",
            max_tokens=2048,
            tools=tools,
            messages=messages,
            extra_headers={"anthropic-beta": "computer-use-2025-01-24"},
        )
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason != "tool_use":
            return next((b.text for b in resp.content if b.type == "text"), "")
        results = []
        for block in resp.content:
            if block.type == "tool_use":
                content = run_action(block.name, block.input)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": content})
        messages.append({"role": "user", "content": results})
    raise RuntimeError("max steps")
```

**这就是骨架**——剩下都是补 actions、补错误处理、补 sandbox。

---

## 四、沙箱(强烈建议)

Computer Use 给 LLM "全屏控制权",不在沙箱跑等于把开机密码递给陌生人。**生产部署一律在 VM / Docker 里跑**:

| 沙箱方案 | 一句话 |
| --- | --- |
| **Anthropic 官方 reference** | docker-compose 起 Ubuntu + Xvfb + Firefox,SDK 直接连 |
| **E2B / Modal / Daytona** | 云沙箱服务,API 起 VM 跑 Computer Use |
| **自己 KVM / Proxmox** | 重型方案,适合大规模 |
| **macOS / Windows VM** | 跨平台需求(测试不同 OS) |

**Anthropic 官方 reference 实现**(在 Anthropic 的 GitHub repo `computer-use-demo`):

```bash
docker run -it --rm \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -p 5900:5900 -p 8080:8080 -p 6080:6080 \
  ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest
```

里面带 Ubuntu + xdotool + 一个网页版控制台,**5 分钟跑起来**。第一次玩 Computer Use 强烈建议跑这个,看清楚 LLM 怎么操作。

---

## 五、什么场景适合 Computer Use

### 真适合

- **没有 API、没有 CLI、没有 MCP 的旧系统**——比如 90 年代的 GUI 业务系统
- **跨应用串联**——Claude 在 Excel 里复制 → 切到浏览器粘贴 → 切到 Slack 报告
- **基于截图的测试 / 巡检**——每天截屏看看监控大屏有没有异常
- **没办法只能用 GUI 的工作流**——比如某些政府网站、银行系统

### 不适合(优先用别的)

- **有 API**:用 API
- **有 CLI**:用 Bash 工具或 MCP server
- **有 MCP server**(Notion / GitHub / Slack):用 MCP
- **简单 web 操作**:用 playwright MCP 或 browser-use
- **数据处理**:Python + Pandas
- **写代码**:Claude Code / Coding Agent

> 这条非常重要:**Computer Use 是"最后手段"**。**结构化接口永远比"看截图点像素"可靠 10 倍**。

---

## 六、Computer Use 的脆弱性

写过你就懂:

1. **分辨率敏感**——LLM 算的坐标基于截图分辨率;不一致就点错位置
2. **慢**——每步都要截屏 + LLM 分析 + 控制 + 等动画;一个简单任务 30 秒
3. **贵**——截图(图像 token)、长循环、多步,token 烧得快
4. **不稳定**——网页改个 button 颜色,LLM 找不到了
5. **错了不一定知道**——点错了没反馈,继续按错路径走

> 一个"在网页上买东西"的 demo 经常跑 60 秒、20 步、$1。**这不是夸张,是实测**。

---

## 七、提高 Computer Use 可靠性的几个技巧

### 7.1 给清晰的 task 描述

```
不好:"帮我下单咖啡"
好:"打开 Chrome → 访问 example.com → 登录(帐号 X 密码 Y)
→ 在搜索框输 'latte' → 选第一个 → 加入购物车 → 结账(地址 Z)"
```

写清"打开什么 → 输什么 → 点什么 → 验证什么"。**LLM 自由发挥度越低越稳**。

### 7.2 校验关键步骤

操作完关键节点(登录后、下单后、提交后)让 LLM **截屏验证**当前页面是预期状态。

### 7.3 用 keyboard 不要用 mouse(能用就用)

`Tab` / `Enter` / `cmd+k` / `Esc` 比鼠标点稳定 10 倍——精确,不依赖坐标。

### 7.4 每步加 wait

```python
{"action": "wait", "duration": 1.5}
```

页面动画 / 加载没结束就截图,LLM 看到的不是稳定状态。**关键操作后 wait 1-2 秒**。

### 7.5 设置任务上限

```python
max_steps = 30   # 超过就退出
max_cost = 1.00  # 单任务 token 不超过 $1
```

**永远设上限**——LLM 可能陷入死循环(比如重复登录失败页面)。

---

## 八、和 text_editor / bash 配合

Coding Agent 场景下,**text_editor + bash + computer 协同**可以拼出一个 Claude Code 的简化版:

- text_editor 改代码
- bash 跑 build / test
- computer 截屏看浏览器结果(前端开发)

这正是 Claude Code 内核的雏形——**官方 Coding Agent reference 也是这个组合**。

---

## 九、生产部署的几个建议

1. **永远沙箱**——VM 或专用 Docker,**不要直接跑在你的工作机**
2. **不持久化**——任务跑完销毁 VM,**别复用**(被污染的环境影响下次)
3. **限制网络**——VM 只能访问任务相关网站,不能瞎逛
4. **限制资源**——CPU / RAM / 存储 都给上限,防止 LLM 起一个挖矿
5. **监控**——每个任务录屏 / 录 log;出问题方便复盘
6. **预算上限**——单任务 / 单用户 / 单天 token 上限
7. **任务白名单**——不要让用户输入任意 task,**应用层先检查 task 类型**

---

## 十、踩坑

1. **本地直接跑没沙箱**——某天它把你 ~/Downloads 清了,因为找不到 button 想"先关闭一些 tab 释放屏幕"
2. **不限制 max_steps**——LLM 卡在登录页反复点,一晚上跑出 $50 账单
3. **任务描述太宽泛**——"帮我研究一下 X" 让 Computer Use 自由发挥,30 步还在 Google 搜索页
4. **用 mouse 不用 keyboard**——可靠性差一个量级
5. **不 wait**——加载没好就截图,LLM 看到 loading 页面继续点错位置
6. **截图分辨率不固定**——窗口被用户拖动了,LLM 算的坐标偏了 100 px
7. **没截图验证**——LLM 自以为登录成功,其实在错误页面继续操作
8. **能用 API 不用**——某网站有 REST API,你硬要 LLM 点页面,慢 20 倍 + 不稳定
9. **生产环境一份 token 多用户共享**——一个 LLM 任务跑挂了影响所有人
10. **不监控成本**——Computer Use 任务平均比纯 API 任务贵 5-10 倍,**必须按任务上限**

---

下一篇:`18-BatchAPI与成本优化.md`,讲 Message Batches API(50% 折扣)、什么场景适合批处理、和实时 API 怎么搭配、整套成本优化清单。
