# Dynamic Workflows

子代理、skills、agent teams 都有一个共同点:**由 Claude 一轮一轮地决定接下来做什么**,所有结果都要回到某个上下文窗口里。这在几个、十几个任务的规模下没问题;到了"审计整个代码库的 300 个路由"、"把 500 个文件从 JS 迁到 TS"这种规模,Claude 的回合制编排和上下文就撑不住了。

dynamic workflow 的思路是**把编排计划写成代码**:Claude 为你的任务写一段 JavaScript 脚本,脚本里用循环、分支、并发去派发几十上百个子代理,运行时在后台执行它,中间结果存在脚本变量里而不是塞进上下文。

> 一句话先记住:**workflow 把"计划"从 Claude 的脑子里搬进了脚本**。脚本决定下一步做什么,所以它能稳定地跑到几百个 agent 的规模、能被保存和复用、还能内建质量模式——比如让一组 agent 去对抗性地核实另一组 agent 的发现。

---

## 一、它和其他方式的区别

| | Subagents | Skills | Agent teams | **Workflows** |
| --- | --- | --- | --- | --- |
| 是什么 | Claude 派出的工人 | Claude 遵循的指令 | 一个 lead 带一群队友 | 运行时执行的脚本 |
| 谁决定下一步 | Claude,逐轮 | Claude,按指令 | lead,逐轮 | **脚本** |
| 中间结果在哪 | Claude 的上下文 | Claude 的上下文 | 共享任务清单 | **脚本变量** |
| 什么可以复用 | 工人定义 | 指令 | 团队定义 | **编排本身** |
| 规模 | 每轮几个 | 同子代理 | 少数长期运行的队友 | **每次几十到几百个 agent** |
| 中断后 | 重启这一轮 | 重启这一轮 | 队友继续跑 | **同一会话内可恢复** |

什么时候该用:

- 任务需要的 agent 数量超出一次对话能协调的范围
- 同一个步骤要在大量对象上重复(每个文件、每个接口、每条记录)
- 希望发现的问题在报给你之前**先被交叉核实**
- 希望把编排固化成一个可读、可重跑的脚本

在付费计划、Anthropic API、Bedrock、Google Cloud、Foundry 上都可用;Pro 计划需要在 `/config` 里打开 Dynamic workflows。

---

## 二、先跑一个内置的:`/deep-research`

```
/deep-research Node.js 的权限模型在 v20 和 v22 之间有什么变化?
```

1. Claude Code 先问你是否允许运行这个 workflow
2. 它在后台展开:从几个角度并行搜索、抓取并交叉核对找到的来源、对每条结论投票
3. 你可以继续干别的;用 `/workflows` 打开进度视图,看每个阶段、每个 agent 在做什么
4. 完成后,一份带引用的报告出现在会话里,**没通过交叉核验的结论已经被过滤掉**;因为限流等原因没能核验的,会标为"未核实"而不是"已驳斥"

### 进度视图

| 按键 | 作用 |
| --- | --- |
| `↑` / `↓` | 选择阶段或 agent |
| `Enter` / `→` | 深入到阶段,再到某个 agent 的详情(提示、最近的工具调用、结果) |
| `Esc` / `←` | 退回上一层 |
| `f` | 按状态过滤 agent |
| `p` | 暂停 / 恢复整个运行 |
| `x` | 停止选中的 agent;焦点在运行本身时停止整个 workflow |
| `r` | 重启选中的 agent |
| `s` | 把这次运行的脚本保存成命令 |

输入框下方的任务面板里也有一行进度摘要。

---

## 三、让 Claude 为你的任务写 workflow

### 3.1 在 prompt 里要

在消息里带上关键词 `ultracode`,或者直接说"用 workflow 来做":

```
ultracode: 审计 src/routes/ 下每个接口是否缺少鉴权检查
```

关键词会被高亮,Claude 会写一个 workflow 脚本而不是逐轮推进。按 `Option+W` / `Alt+W` 可以取消这次的高亮。

**这个关键词只在你亲手输入的 prompt 里有效**:`-p` 传入的 prompt、定时任务的 prompt、转发进会话的 webhook 或 PR 评论里出现的 `ultracode`,都不会触发——防止外部内容替你做出"跑一个大规模 workflow"的决定。

### 3.2 整个会话交给 Claude 决定:ultracode 模式

```
/effort ultracode        # 本会话开启
/effort ultracode off    # 关闭
claude --effort ultracode   # 启动即开启,并把 effort 设为 xhigh
```

开启后,Claude 会为每个实质性任务规划 workflow,一个请求可能变成连续几个 workflow:一个理解代码、一个做改动、一个验证。开启 ultracode 就等于你已经同意了大规模运行,所以:大规模警告不再显示、子代理并发上限不再生效、auto mode 下首次启动 workflow 不再询问。**做完大任务记得关掉**。

### 3.3 运行前审批

CLI 里每次运行前会显示计划的阶段,让你选择:

- **Yes, run it**
- **Yes, and don't ask again**(只对按名字运行的已保存 / 内置 / 插件 workflow 提供)
- **View raw script**:先看脚本;`Ctrl+G` 在编辑器里打开
- **No**

| 权限模式 | 什么时候问你 |
| --- | --- |
| Auto | 只在第一次启动时;ultracode 开启时完全不问 |
| Manual、accept edits | 每次都问(除非选过"不再询问") |
| Bypass | 不问 |
| `claude -p`、Agent SDK | 不弹窗,走正常的权限求值:需要 allow 规则 `Workflow` 或 `Workflow(<名字>)`、auto mode、hook 批准等 |

workflow 派出的子代理照常受你的权限规则约束。

---

## 四、适合 workflow 的任务形态

| 形态 | prompt 示例 |
| --- | --- |
| **多文件审计同一个问题** | "用 workflow 审计 src/routes/ 下每个路由处理函数是否缺少鉴权,报告前对每个发现做对抗性核实" |
| **修到检查通过为止** | "用 workflow 跑 `npx tsc --noEmit`,持续修复报错直到类型检查通过,或连续两轮没有进展" |
| **并行迁移大量文件** | "用 workflow 把 src/components/ 下每个组件从 JavaScript 迁到 TypeScript,每个文件在独立的副本里改" |
| **逐文件审查后汇总** | "用 workflow 审查这个 PR 改动的每个文件的正确性问题,再把各文件的发现合并成一份排好序的总结" |
| **多来源调研** | "用 workflow 调研三家竞品怎么做限流:并行阅读它们的公开文档和最近的更新日志,然后对比" |
| **找到列表不再增长为止** | "用 workflow 找出不稳定的测试:反复跑测试套件,记录偶发失败的,连续两轮没有新发现就停" |

共同特征:**大量同构的子任务 + 明确的汇总或终止条件**。

---

## 五、脚本长什么样

```javascript
export const meta = {
  name: 'audit-routes',
  description: 'Audit every route handler for missing auth checks',
}

const found = await agent('List every .ts file under src/routes/.', {
  schema: {
    type: 'object',
    required: ['files'],
    properties: { files: { type: 'array', items: { type: 'string' } } },
  },
})

const audits = await pipeline(found.files, file =>
  agent(`Audit ${file} for missing authentication checks.`, { label: file }),
)

return audits.filter(Boolean)
```

几个基本元素:

| 函数 | 作用 |
| --- | --- |
| `agent(prompt, opts)` | 派一个子代理;带 `schema` 时返回符合结构的 JSON 而不是文字 |
| `pipeline(items, fn)` | 对列表里每一项跑一个 agent |
| `parallel(tasks)` | 同时跑一组任务,等全部完成 |
| `phase(title)` | 给后面的 agent 分组,在进度视图里显示为一个阶段 |
| `log(msg)` | 在进度视图上方显示一条消息 |
| `args` | 调用已保存的 workflow 时传进来的输入 |

一些规则:

- `export const meta` 必须是第一条语句,而且是纯字面量
- 脚本是普通 JavaScript,支持顶层 `await`,**不能 `import`**
- 脚本本身**不能直接访问文件系统和 shell**,读写文件、跑命令都交给 agent
- `Date.now()`、`Math.random()` 会抛错——这样恢复运行时能重放出完全相同的 agent 调用
- 被停止或遇到不可恢复错误的 `agent()` 返回 `null`,所以结果常用 `.filter(Boolean)` 过滤
- 带 `schema` 的输出校验失败会重试,默认最多五次

改脚本前,先运行内置的 `/workflow-authoring` skill 加载脚本编写参考,或者直接让 Claude 改。

---

## 六、保存与复用

在 `/workflows` 里选中一次运行,按 `s` 保存:

| 位置 | 范围 |
| --- | --- |
| `.claude/workflows/` | 项目里,克隆仓库的人都能用 |
| `~/.claude/workflows/` | 你自己的所有项目 |

保存后就是一个 `/<名字>` 命令,出现在 `/` 补全里。项目和个人重名时项目的优先。可以传入参数:

```
运行 /triage-issues 处理 issue 1024、1025 和 1030
```

Claude 会把列表作为结构化数据传进去,脚本里直接用 `args`。要跨团队分发,把脚本放进插件的 `workflows/` 目录,命令名带插件前缀,如 `/acme-tools:release-audit`。

---

## 七、运行机制与限制

- 脚本在**隔离环境**里运行,中间结果不进 Claude 的上下文
- 每次运行的脚本都写到会话目录下的一个文件里,可以打开看 Claude 写的编排逻辑
- 同一次运行里配置相同的 agent(同模型、同 effort、同工具、同 schema、同工作目录)**共享 prompt 缓存**;并发启动时会先放第一个,等它开始响应后再放其余的,让它们读到已缓存的前缀
- 运行在**同一会话内可以恢复**:暂停的按 `p` 继续;停止的可以让 Claude 用同一个脚本重新启动,已完成的 agent 结果会被复用

| 限制 | 数值 |
| --- | --- |
| 运行中不能向你提问 | 只会因 agent 的授权弹窗和用量上限而暂停;需要阶段之间人工签字,就把每个阶段做成单独的 workflow |
| 并发 agent | 默认最多 16 个(CPU 少时更少),`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` 调整 |
| 单次 `parallel()` / `pipeline()` | 最多 4,096 项,超过直接报错而不是悄悄截断 |
| 每次运行 agent 总数 | 1,000 个,防止失控循环 |

---

## 八、成本控制

一次 workflow 会派出很多 agent,**用量可能远超在对话里逐步完成同样的任务**。几个控制手段:

1. **先在小范围试跑**:一个目录而不是整个仓库,一个窄问题而不是一个大问题。`/workflows` 视图里能看到每个 agent 的 token 用量
2. **注意大规模警告**:计划超过 25 个 agent 或预计超过 150 万 token 时,进度行会显示 `Large workflow` 警告(只是提示,不会阻止)
3. **设规模指引**:`/config` 里的 Dynamic workflow size,或 `"workflowSizeGuideline"`:

| 值 | Claude 目标 agent 数 |
| --- | --- |
| `small` | 少于 5 |
| `medium`(默认;Pro 默认 `small`) | 少于 10 |
| `large` | 少于 50 |
| `unrestricted` | 按任务需要 |

这是给 Claude 的建议,不是硬上限;你在 prompt 里明确要求更大的规模时会覆盖它。

4. **给不需要最强模型的阶段指定小模型**:描述任务时直接说"检索阶段用 Haiku"
5. **不想用就关掉**:`/config` 里关 Dynamic workflows,或 `"disableWorkflows": true`,或 `CLAUDE_CODE_DISABLE_WORKFLOWS=1`

---

## 九、踩坑

1. **小任务也用 workflow**——几个文件的事,逐轮推进更省也更快
2. **一上来就在整个仓库上跑**——先在一个目录上试,看清楚用量再放大
3. **ultracode 开着做日常小改动**——每个请求都可能变成一串 workflow。做完大任务就关
4. **以为 PR 评论里的 `ultracode` 会触发 workflow**——只有你亲手输入的才算,这是有意的安全设计
5. **在脚本里写 `import` 或直接读文件**——不支持,这些工作交给 agent
6. **在脚本里用 `Date.now()` 或随机数**——会抛错,时间戳通过 `args` 传进去
7. **需要中途人工确认**——workflow 运行中不能问你,把阶段拆成几个 workflow
8. **`-p` 里跑 workflow 没配权限**——没有弹窗,要用 allow 规则或 auto mode 放行 `Workflow`
9. **跑完就扔**——好用的编排按 `s` 保存,下次直接 `/名字`
10. **不看核验结果就采信**——"未核实"和"已驳斥"是两回事,报告里的标注要看清

---

下一篇:`18-无人值守-headless-channels与定时任务.md`,讲 `claude -p` 非交互模式、channels 往会话里推送事件、`/loop` 和会话内定时任务、Monitor 工具,以及从链接启动会话。
