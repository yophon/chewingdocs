# Skills 技能系统

Skill 是 Claude Code 这两年生态里**信息密度最大**的概念,也是最容易被新手忽视的。它的核心能力一句话:**让 LLM 在合适的时候,自动学会一件本来不会的专业流程**——不用每次重复指令,不用主动 `/xxx`,不用配 hook,**它自己就上手了**。

> 一句话先记住:**Skill = 一段"何时激活"的描述 + 一段"激活后怎么做"的指引 + 可选的脚本 / 资源**。本质上就是"写在文件里的、按需加载的专业 prompt 包"。Anthropic 自己的内置 skill(update-config / fewer-permission-prompts / claude-api / security-review …)就是这套机制最好的范例。

---

## 一、为什么 skill 是"按需加载"

LLM 处理上下文有两个真实约束:

1. **窗口有限**(再大的 200K 也有边界)
2. **指令多了会互相干扰**(20 条指令 LLM 会忘 / 混)

如果你想让 Claude "**会**" 50 件专业的事(写 SQL / 审 PR / 配 Stripe / 用 React Server Components / 做安全审计 ……),**全塞进系统 prompt 是行不通的**——上下文会爆,而且 LLM 在 50 条指令里会迷失。

Skill 解决这个问题的方式叫 **progressive disclosure**(渐进式披露):

```
默认状态:LLM 只知道"有这些 skill 存在 + 它们的简介"
        (一行 description,几乎不占 token)
                ↓
看到匹配场景:LLM 自己决定"我应该激活 X skill"
                ↓
激活之后:Skill 的完整指令 + 资源 才进入上下文
```

> 这是一个**懒加载机制**——平时不读,需要时才读。50 个 skill 静默存在,只有相关的才会被实际调用,**上下文不膨胀,LLM 不混乱**。

---

## 二、SKILL.md 的最小结构

`~/.claude/skills/sql-expert/SKILL.md`:

```markdown
---
name: sql-expert
description: 写或优化 SQL 查询时使用——尤其涉及 join 多表、慢查询分析、索引设计。
---

# SQL Expert

激活之后:

## 你的角色
你现在是 SQL 优化专家。重点放在:
- 正确性优先(不出错的 SQL)
- 性能其次(看 EXPLAIN、考虑索引)
- 可读性最后(CTE、清晰命名)

## 工作流程
1. 看清楚 schema,不知道 schema 先 query 一下 information_schema
2. 写 query 之前先 EXPLAIN
3. 大表 join 必须看执行计划
4. 优化思路:索引 → 改写 → 物化 → 反范式

## 输出格式
- 给出最终 SQL,带注释说明每段意图
- 如果改写过,说明"为什么这样写比 X 快"
- 给一个执行计划要点(EXPLAIN 后预期看到什么)
```

frontmatter:

| 字段 | 含义 |
| --- | --- |
| `name` | skill 名字(也是目录名) |
| `description` | **决定 LLM 何时激活**——是 skill 设计中最重要的一句 |

主体 markdown:激活后注入到 LLM 上下文的内容。

---

## 三、`description` 写法的艺术

skill 能不能被正确激活,**95% 取决于 description**。

### 3.1 烂 description 的反面教材

```yaml
description: 使用 SQL 时使用
description: 数据库相关任务
description: 写 SQL
```

LLM 看到这个一脸懵——"任何涉及数据的对话都要激活吗?"。结果要么过度激活、要么完全不激活。

### 3.2 好 description 的正面例子

```yaml
description: |
  写或优化 SQL 查询时使用——尤其涉及 join 多表、慢查询分析、索引设计。
  当用户问"为什么这查询慢"或"怎么改写这条 SQL"时,优先用此 skill。
  TRIGGER 关键词:EXPLAIN、慢查询、索引、join、查询优化、SQL 性能。
  SKIP:仅 ORM 用法(如 Prisma 写法)、纯 schema 设计、新建表。
```

**结构**:

1. **核心场景**——一句话说清"什么时候用"
2. **TRIGGER 关键词**——LLM 检测匹配的词
3. **SKIP 条件**——避免错误激活

> Claude Code 内置 skill 的 description 都是这个套路。看 Anthropic 自己的 skill 怎么写,直接抄结构。

### 3.3 多关键词覆盖

skill 的 description 不嫌长——**它是 LLM 唯一的"判断依据"**。把所有可能的触发场景都写出来:

```yaml
description: |
  Build, debug, and optimize Claude API / Anthropic SDK apps...
  TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`;
                user asks for the Claude API, Anthropic SDK, or Managed Agents;
                user adds/modifies/tunes a Claude feature
                (caching, thinking, compaction, tool use, batch, files, citations, memory)
                or model (Opus/Sonnet/Haiku) in a file;
                questions about prompt caching / cache hit rate.
  SKIP: file imports `openai`/other-provider SDK,
        filename like `*-openai.py`/`*-generic.py`,
        provider-neutral code, general programming/ML.
```

**关键词、文件名模式、import 名称、用户提问语气**——全是有效信号。

---

## 四、目录结构:不只是一个 SKILL.md

skill 可以有多个文件,主 SKILL.md 可以引用它们。

```
~/.claude/skills/security-review/
├── SKILL.md            # 主入口(必需)
├── checklist.md        # 详细检查清单(SKILL.md 引用)
├── owasp-top-10.md     # 参考资料
└── scripts/
    └── scan-deps.sh    # 配套脚本
```

SKILL.md 里:

```markdown
工作流程:
1. ...
2. 按 @checklist.md 逐项检查
3. 发现可疑依赖跑 ./scripts/scan-deps.sh
4. 不确定的查 @owasp-top-10.md
```

> Skill 的"重型版"会有十几个文件;"轻型版"就是单 SKILL.md。**先写单文件,真有需要再拆**。

---

## 五、Skill 与 Hook、Slash、Subagent 的最终对比

四种扩展机制都讲完了,放一张总图:

| 维度 | Slash Command | Hook | Subagent | Skill |
| --- | --- | --- | --- | --- |
| **谁触发** | 用户主动 `/xxx` | 生命周期事件自动 | 主 Claude 主动调 | LLM 看到场景自动激活 |
| **跑在哪** | 主对话上下文 | harness(Claude 之外) | 独立 fork 的 Claude | 主对话上下文 |
| **能干什么** | prompt 模板 + shell 注入 | 任何脚本 | 整个子任务(读、写、跑) | 注入指令 + 资源,影响主 Claude 行为 |
| **典型例子** | `/review`、`/translate` | 改文件后跑 prettier | 探索代码、做研究 | "审 PR 的标准方法"、"配 settings 的标准方法" |
| **失效原因** | 用户没记得输 | 配置错了 / 脚本 bug | 派错了 / prompt 不清 | description 没写好,LLM 不激活 |

### 决策树:我要让 Claude 干一件事,选哪个?

```
                    要让 Claude 自动做某事
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
        每次都要           按事件        按语义场景
       一定执行?         自动跑?         匹配?
            │               │               │
            ▼               ▼               ▼
          HOOK            HOOK            SKILL
       (强制性)         (响应性)        (智能性)

                    要让人手动触发某事
                            │
                            ▼
                       SLASH COMMAND

                  要让 Claude 干一段子任务
                            │
                            ▼
                        SUBAGENT
```

**例子**:

- "提交前一定跑测试" → **Hook**(强制)
- "我说 `/review` 就审 PR" → **Slash**(我手动触发)
- "看到我在写 SQL 就帮我优化" → **Skill**(看场景智能激活)
- "做完整安全审计" → **Subagent**(独立上下文跑长任务)
- "写 SQL 时按一套标准方法" → **Skill**(主 Claude 自己要按这套方法)

---

## 六、内置 skill 实例分析

Claude Code 自带几个 skill,看它们怎么设计的就知道怎么写自己的。

### 6.1 `update-config`

**作用**:用户说"加个 hook"/"允许 X"/"设置 Y" 时自动激活,帮用户改 settings.json。

description 大致写法:

> 配置 Claude Code harness 的 settings.json。自动化行为(when X / each time / before/after)需要 hook,memory 不能实现。permissions("allow X")、env vars("set X=Y")、hook 故障排查、改 settings.json/settings.local.json 都用此 skill。例子:"allow npm commands"、"add bq permission"、"set DEBUG=true"。

**学到什么**:把"用户可能这么说的话"具体写出来——LLM 看到精确的关键词更容易匹配。

### 6.2 `fewer-permission-prompts`

**作用**:用户抱怨权限确认太多时激活,扫 transcript,把高频被问的命令加进 allowlist。

学到什么:**skill 可以包含一个具体动作流程**(扫 transcript → 总结 → 改 settings),不只是"给 LLM 加点知识"。

### 6.3 `claude-api`

**作用**:用户在写 Anthropic SDK 代码时激活,提供 prompt caching、tool use、模型迁移的最佳实践。

学到什么:**有清晰 SKIP 条件**——OpenAI 代码不激活、provider-neutral 代码不激活。**不该激活时绝不激活**比"该激活时激活"还重要。

---

## 七、写一个完整 skill 例子:PR Reviewer

`~/.claude/skills/pr-review/SKILL.md`:

```markdown
---
name: pr-review
description: |
  审查 Pull Request 时使用。
  TRIGGER:用户说"审一下 PR / 看下 #123 / review this PR / 我开了个 PR";
          用户问"这 PR 有什么问题 / 能合吗 / 测试够吗"。
  关键词:PR、pull request、合并、review、changes、diff。
  SKIP:仅查看单文件改动(用户没有 PR 上下文)、初步探索代码、写新 feature。
---

# PR Reviewer

激活后,按以下流程操作。

## 步骤 1:拉取 PR 信息

如果用户给了 PR 号:
```
gh pr view <number>
gh pr diff <number>
```

如果没给,假设是当前分支的 PR:
```
gh pr view --json number,title,body,baseRefName,additions,deletions,files
gh pr diff
```

## 步骤 2:逐项检查(按 @checklist.md)

每项检查给出:
- ✅ 通过 / ⚠️ 需关注 / ❌ 阻塞
- 一句话说明(发现问题时具体到文件:行号)

## 步骤 3:综合结论

格式:

```
## PR Review: #<number> <title>

**总结**: ✅ 可合并 / ⚠️ 建议修改 / ❌ 不建议合并

**主要问题** (按严重度):
1. ...
2. ...

**建议改进** (可选):
- ...

**测试覆盖**: <评估>
**安全检查**: <评估>
```

## 注意事项
- 不要主动修改任何文件——只报告
- 测试是否跑过看 PR 的 checks 部分
- 大改动(>500 行)默认 ⚠️,要求人工分段审
```

`~/.claude/skills/pr-review/checklist.md`:

```markdown
1. **正确性**:逻辑、边界、空值、错误处理
2. **测试**:有没有覆盖核心路径、是否跑通
3. **性能**:N+1、嵌套循环、不必要 IO
4. **安全**:注入、越权、密钥
5. **API 兼容**:破坏性变更、deprecate 路径
6. **可读性**:命名、抽象、注释
7. **依赖**:新加的包、版本约束
```

用户说 "审一下我刚开的 PR" → Claude 自动激活这个 skill → 按上面流程跑。

---

## 八、Skill 在团队里怎么用

| 类型 | 路径 | 适合场景 |
| --- | --- | --- |
| 个人 skill | `~/.claude/skills/<name>/` | 你的工作偏好 |
| 项目 skill | `.claude/skills/<name>/`(提交进 git) | 团队都该有的专业流程 |

**团队共享 skill 是 Claude Code 最被低估的协作能力**——把"我们公司怎么写代码"封进 skill,新人 clone 项目,**Claude Code 自动按团队规矩干活**:

- 我们的 git commit 风格
- 我们的 PR 描述模板
- 我们的发布流程
- 我们的安全清单

> 没有 skill 之前,这些只能写在 onboarding 文档里靠人记;有 skill 之后,**Claude Code 自动应用,人也少错**。

---

## 九、调试 skill 没激活

按这个清单查:

1. **description 太模糊**——加更多关键词、加 TRIGGER / SKIP
2. **场景不够典型**——你说"看一下"和"审一下"差别巨大,把这两种说法都写进 description
3. **路径错了**—— `~/.claude/skills/xxx/SKILL.md` 必须是 `SKILL.md`(全大写)
4. **frontmatter 错**——`name` 和目录名必须一致
5. **`/skills` 看现有 skill**——能列出来说明被识别;列不出来就是路径或 frontmatter 有问题
6. **手动触发测试**——用户说 "用 pr-review skill" 看能不能强制激活;能就是 description 不准,不能就是装载有问题

---

## 十、踩坑

1. **description 写一句"它是干啥的"**——这是给文档读者看的。**给 LLM 的是"什么时候用我"**,这两件事不一样
2. **没写 SKIP 条件**—— skill 在不该激活时激活,把主对话搞乱
3. **SKILL.md 太长**(几千字)——LLM 看完都迷糊。**主 SKILL.md 短而精,详细内容拆到 @文件里按需引**
4. **skill 里嵌入大量 prompt 体例**(强调多次"你是 X 专家")——LLM 已经被这个 prompt 激活就够了,不要重复 12 遍
5. **skill 里改文件 / 跑命令的 hardcode**——脚本 / 工具的具体调用应该是 LLM 的事,skill 只给指引;真有自动化诉求改写 hook
6. **skill 名和内置冲突**——避开 update-config / fewer-permission-prompts 这种内置名,自己写一个同名的会乱
7. **写了 skill 不告诉团队**——`.claude/skills/` 进了 git 但 README 没提,新人不知道有这能力
8. **skill 越写越多失控**—— 30 个 skill 互相重叠,LLM 选哪个都有道理。**定期 audit,合并 / 删除**
9. **把 hook 该干的事写成 skill**——"每次提交前跑测试"这种确定性事 skill 做不可靠;**强制性的事一律 hook**
10. **不参考内置 skill**——Anthropic 自己的内置 skill 是 best practice 的样本,**先看 `~/.claude/skills/` 有什么内置的,模仿结构**

---

下一篇:`09-Plan-Mode.md`,讲什么是 plan mode、什么时候手动进 / 让 Claude 自己进、ExitPlanMode 工具、plan mode 下 LLM 的工具受限规则、plan 文件长什么样、如何配合 todo / hook 用。
