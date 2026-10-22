# Code Review 与 CI 集成

AI 写代码越来越快,评审就成了瓶颈。Claude Code 现在有一整套审查工具,从"写的时候就自查",到"提交前在本地审一遍",到"PR 上自动审",再到"合并前在云端用一群 agent 深挖"。再加上 GitHub Actions、GitLab CI 集成,Claude 可以作为流水线的一环,响应 `@claude`、定时出报告、把 issue 变成 PR。

> 一句话先记住:**审查要分层,而且每一层都不是保证**。写代码时自查减少问题流到 PR,PR 上的审查抓住漏网的,深度审查用在高风险的合并前。任何一层"没发现问题",都不代表代码没有问题——最终的判断仍然是人的。

---

## 一、审查工具全景

| 工具 | 在哪跑 | 什么时候用 | 计划 |
| --- | --- | --- | --- |
| **security-guidance 插件** | 你的会话里,自动 | Claude 写代码时自查安全问题 | 所有 |
| **`/code-review`** | 你的会话里(后台子代理) | 提交或开 PR 前审自己的改动 | 所有 |
| **`/security-review`** | 你的会话里 | 审当前分支相对默认分支的安全风险 | 所有 |
| **`/code-review ultra`(ultrareview)** | 云端,一群 agent | 高风险改动合并前的深度审查 | 需 claude.ai 账号 |
| **claude-security 插件** | 你的会话里,多 agent | 对整个代码库做漏洞扫描 | 所有付费计划 |
| **Code Review(托管服务)** | Anthropic 基础设施 | 每个 PR 自动审,行内评论 | Team / Enterprise |
| **GitHub Actions / GitLab CI** | 你的 CI runner | 自定义审查流程、`@claude` 交互、定时任务 | 所有 |

---

## 二、本地审查:`/code-review`

### 2.1 基本用法

```
/code-review
```

审查当前分支领先上游的提交加上未提交的改动(没有上游就和 `main` 比),**重点找正确性 bug**。它作为后台子代理运行,有自己的上下文,不会塞满你的对话,结果完成后送达。`/review` 是它的别名。

| 审查对象 | 写法 |
| --- | --- |
| 当前分支和未提交改动 | `/code-review` |
| 最近 15 个提交 | `/code-review HEAD~15..HEAD` |
| 一个分支对另一个 | `/code-review main...my-feature` |
| 单个提交 | `/code-review abc1234^..abc1234` |
| 一个 PR | `/code-review 1234` |
| 一个文件或目录 | `/code-review src/auth` |

### 2.2 参数

| 参数 | 作用 |
| --- | --- |
| `--fix` | 审完直接把修复应用到工作区(按你的权限模式确认) |
| `--comment` | 把结果作为行内评论发到 GitHub PR(GitLab MR 上是一条汇总备注) |
| `--max-findings <n>` / `all` | 报告数量上限,或全部报告 |
| 深度 `low` … `max` | `low` 只报最有把握的,误报少;越高覆盖越广,包含更多不太确定的发现 |

不写深度时会沿用你上次手动指定的等级,并提示你"Reusing high effort"。

两点要注意:

- **它遵守你的 CLAUDE.md,但不读 `REVIEW.md`**(那个文件是给托管服务用的)
- **`--fix` 的修改在后台子代理里完成,不在你的检查点里**,`/rewind` 撤不回。先提交或 stash 再用

### 2.3 安全审查

```
/security-review
```

审查当前分支相对 origin 默认分支的 diff,找注入、鉴权问题、数据泄露等风险。另外有两个插件:

- **security-guidance**:安装后自动生效,Claude 写代码时自查注入、不安全的反序列化等常见漏洞,当场修掉。需要 Python 3.7+
- **claude-security**:对整个代码库做多 agent 漏洞扫描——梳理架构、建立威胁模型、寻找漏洞、独立核实,再把发现变成你审阅后应用的补丁。基于 dynamic workflows,消耗较大

---

## 三、深度审查:ultrareview

```
/code-review ultra              # 当前分支 vs 默认分支
/code-review ultra develop      # 指定对比的 base
/code-review ultra 1234         # github.com 上的 PR
```

它在**云端沙箱里启动一组审查 agent**,和本地 `/code-review` 相比:

- **信噪比更高**:每个报告的问题都被**独立复现和核实**,结果集中在真正的 bug 上,而不是风格建议
- **覆盖更广**:更多 agent 并行探索改动
- **不占本地资源**:你的终端可以继续干别的

启动前会显示审查范围、剩余免费次数和预估费用。Pro / Max 有 3 次免费,之后按改动大小**通常每次 $5 到 $25**,计入 usage credits。只有你手动输入 `/code-review ultra` 才会运行,Claude 不会自己启动它。需要 claude.ai 账号;PR 模式需要你的 Claude 账号连接的 GitHub 账号能读这个仓库。加 `--post` 可以在完成后把结果作为一条评论发到 PR。

> 适合:涉及支付、权限、数据迁移这类**出错代价很高**的合并。日常小改动用本地 `/code-review` 就够了。

---

## 四、托管服务:Code Review

### 4.1 是什么

Team / Enterprise 的组织 Owner 开通后,**Claude 会自动审查 GitHub 仓库里的 PR**,在相关代码行留评论,附一份总结和一个 check run。审查分四步:

1. **Find**:多个 agent 并行检查 diff 和周围的代码
2. **Verify**:核对候选问题,过滤误报
3. **Rank**:去重,按严重程度排序
4. **Post**:发布到 PR 上

几个特点:

- 默认**聚焦正确性**:会让生产环境出问题的 bug,而不是格式偏好或测试覆盖率
- **永远不会批准或阻止 PR**,check run 不会以失败结束
- 模型由服务决定,想调整彻底程度就调"审查等级"
- 不适用于启用了零数据保留或 HIPAA 配置的组织

### 4.2 用 `REVIEW.md` 定制

仓库根目录放一个 `REVIEW.md`,子目录里也可以放来追加针对该路径的检查:

```markdown
# 审查说明

## 这里的 Important 是什么意思
只有会破坏行为、泄露数据或阻碍回滚的问题才标 Important:错误的逻辑、
没有按租户限定的数据库查询、日志或错误信息里的个人信息、不向后兼容的迁移。
风格、命名、重构建议最多是 Nit。

## 限制 Nit 数量
每次审查最多报 5 个 Nit。

## 不要报告
- CI 已经检查的东西:lint、格式、类型错误
- src/gen/ 下的生成文件和所有 *.lock 文件

## 一定要检查
- 新增的 API 路由有集成测试
- 日志里不包含邮箱、用户 ID 或请求体
- 数据库查询按调用者的租户做了限定
```

托管服务同时读 CLAUDE.md 和 REVIEW.md:**项目通用的规则放 CLAUDE.md,只和审查有关的放 REVIEW.md**。

### 4.3 触发与成本

每个仓库可以设审查时机:**每次 push 后**(默认,最贵)、**PR 创建后一次**、**手动**。PR 上的评论命令:

| 命令 | 作用 |
| --- | --- |
| `@claude review` | 现在审一次,不订阅后续 push |
| `@claude review always` | 现在审,并且之后每次 push 都审 |
| `@claude review stop` | 取消订阅 |

按 token 用量计费,走 usage credits,和计划内的额度分开计算。费用随审查等级、改动大小、周边代码复杂度、需要核实的候选问题数量增长。可以设置每月消费上限。

---

## 五、GitHub Actions

### 5.1 快速开通

```
/install-github-app
```

在 Claude Code 里运行,它会:安装 Claude GitHub App、把认证凭证存为仓库 secret(API key 存为 `ANTHROPIC_API_KEY`,订阅令牌存为 `CLAUDE_CODE_OAUTH_TOKEN`)、推一个包含工作流文件的分支、在浏览器里打开一个待创建的 PR。合并后就能用了。需要仓库管理员权限和本机的 `gh`。只支持 github.com;Bedrock、Google Cloud、Foundry 用户需要手动配置。

### 5.2 两种模式

| 模式 | 条件 | 行为 |
| --- | --- | --- |
| **交互模式** | 工作流里**没有** `prompt` | 等待 issue / PR 评论里的 `@claude` |
| **自动模式** | 工作流里**有** `prompt` | 事件触发即运行,不需要 @ |

### 5.3 响应 `@claude`

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

然后在 issue 或 PR 里:

```
@claude 按照 issue 描述实现这个功能
@claude 修掉用户面板组件里的 TypeError
```

`actions: read` 让 Claude 能读 PR 上的 CI 结果。

### 5.4 PR 自动审查(运行一个 skill)

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          plugin_marketplaces: "https://github.com/anthropics/claude-code.git"
          plugins: "code-review@claude-code-plugins"
          prompt: "/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment"'
```

`prompt` 可以是一个 skill:仓库里的 skill 要先 `actions/checkout`;插件里的 skill 用 `plugin_marketplaces` 和 `plugins` 安装后用 `/插件名:skill名` 调用。它会跳过草稿、已关闭、它判断不需要审查的、以及已经有它评论的 PR。

### 5.5 定时任务

```yaml
name: Daily Report
on:
  schedule:
    - cron: "0 9 * * *"
jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: read
      id-token: write
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: "总结昨天的提交和未关闭的 issue"
          claude_args: |
            --model opus
            --allowedTools "mcp__github__list_commits,mcp__github__list_issues"
```

纯文字 prompt 下,Claude 默认没有 shell 和 GitHub API 权限,需要用 `claude_args` 里的 `--allowedTools` 授予。

### 5.6 安全与成本

- **谁能触发**:issue / PR 事件要求触发者有仓库写权限(`allowed_non_write_users` 可以放宽);**机器人账号默认不能触发**(`allowed_bots` 例外),防止机器人互相触发陷入循环
- **凭证永远放 GitHub Secrets**,不要提交进仓库
- **只给工作流需要的权限**,合并前审查 Claude 的改动
- 在仓库根的 CLAUDE.md 里写代码规范和审查标准,Claude 会遵守
- 成本有两部分:GitHub Actions 的 runner 时间和模型 token。用 `--max-turns` 等参数限制,用 `if` 条件避免无关事件启动 runner

---

## 六、GitLab CI/CD

GitLab 集成由 GitLab 维护,目前是 beta,基于 Claude Code CLI 和 Agent SDK 构建,可以在 GitLab CI 作业里以编程方式使用 Claude。`/code-review --comment` 也支持把结果发到 GitLab MR 上。Desktop 和 worktree 功能也支持从 GitLab MR 创建分支。

---

## 七、怎么组合

| 阶段 | 工具 |
| --- | --- |
| 写代码时 | security-guidance 插件自动自查 |
| 提交前 | `/code-review`(必要时 `/security-review`) |
| PR 创建后 | Code Review 托管服务,或 Actions 里的审查工作流 |
| 高风险合并前 | `/code-review ultra` |
| 定期 | claude-security 全库扫描,或定时工作流 |
| PR 上的 CI 失败和评审意见 | auto-fix(19 篇) |

---

## 八、踩坑

1. **"审查没发现问题"就合并**——任何一层审查都不是保证,人仍然要看
2. **`/code-review --fix` 前没提交**——它的修改不在检查点里,撤不回
3. **在 REVIEW.md 里写本地 `/code-review` 的规则**——本地命令只读 CLAUDE.md,不读 REVIEW.md
4. **每个小改动都跑 ultrareview**——每次几美元到几十美元,留给高风险改动
5. **托管 Code Review 保持默认的"每次 push 后"**——费用随 push 次数成倍增长,考虑"PR 创建后一次"
6. **让 Code Review 报 lint 和格式问题**——CI 已经管了,在 REVIEW.md 里写"不要报告"
7. **把 API key 写进工作流文件**——用 GitHub Secrets
8. **定时工作流里 Claude 什么都做不了**——纯文字 prompt 默认没有工具权限,用 `--allowedTools` 授予
9. **允许机器人触发 Claude**——可能陷入互相触发的循环,`allowed_bots` 谨慎配置
10. **以为托管 Code Review 会拦住有问题的 PR**——它从不批准或阻止,要拦就配合分支保护规则

---

第三层到这里结束:并行 agent、workflows、无人值守、云端、多端、浏览器与屏幕、审查与 CI。从下一篇开始进入第四层,**把 Claude 当作能力组件,用 API 写进你自己的产品**。

下一篇:`23-Claude-API入门与模型矩阵.md`,讲 Messages API 的基本用法、2026 年的模型矩阵和价格、认证方式、流式输出、错误处理,以及在 Bedrock、Vertex AI、Foundry 上调用 Claude。
