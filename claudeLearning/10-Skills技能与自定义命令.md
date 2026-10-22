# Skills 技能与自定义命令

当你发现自己第三次把同一段说明、同一份检查清单、同一套多步骤流程粘贴进对话时,就该把它写成一个 skill 了。skill 是一个带 frontmatter 的 Markdown 文件:**你可以用 `/名字` 直接调用它,Claude 也可以在任务相关时自动加载它**。

这一篇也是原来"Slash Commands"那一篇的去处:**自定义斜杠命令已经并入 skills**。`.claude/commands/deploy.md` 和 `.claude/skills/deploy/SKILL.md` 都会生成 `/deploy`,用法完全一样,旧的命令文件继续能用;skill 只是多了支持文件目录、调用控制、自动加载等能力。

> 一句话先记住:**skill 是"按需加载"的知识和流程**。平时上下文里只有它的一行描述,用到时才把全文装进来。所以它适合放那些"有时候需要、但每次都写一遍很烦"的东西——这正是 CLAUDE.md 不适合放的东西。

---

## 一、第一个 skill

```bash
mkdir -p ~/.claude/skills/summarize-changes
```

`~/.claude/skills/summarize-changes/SKILL.md`:

```markdown
---
description: 总结未提交的改动并标出风险。用户问改了什么、要提交信息、或要审 diff 时使用。
---

## 当前改动

!`git diff HEAD`

## 要求

用两三条要点总结上面的改动,再列出你注意到的风险:缺少错误处理、硬编码的值、需要更新的测试。diff 为空就说没有未提交的改动。
```

两种用法:

- **让 Claude 自动用**:问一句"我改了什么?",它按描述匹配到这个 skill
- **直接调用**:`/summarize-changes`

`` !`git diff HEAD` `` 是**动态上下文注入**:Claude Code 先执行命令,用输出替换这一行,再把内容交给 Claude。它拿到的是真实的 diff,而不是自己去猜。

---

## 二、skill 放在哪

| 位置 | 路径 | 生效范围 |
| --- | --- | --- |
| 企业 | managed settings 目录下的 `.claude/skills/<名字>/SKILL.md` | 组织部署到的所有机器 |
| 个人 | `~/.claude/skills/<名字>/SKILL.md` | 你在这台机器上的所有项目 |
| 项目 | `.claude/skills/<名字>/SKILL.md` | 这个仓库,提交后团队共享 |
| 嵌套 | `<子目录>/.claude/skills/<名字>/SKILL.md` | 在该子目录内启动,或 Claude 开始处理那里的文件时 |
| 插件 | `<插件>/skills/<名字>/SKILL.md` | 启用插件的地方,命令名是 `/插件名:skill名` |
| claude.ai 账号 | 在账号里启用的 skills | 云端会话、Cowork,以及用该账号登录的终端会话 |
| 旧格式 | `.claude/commands/<名字>.md` | 同项目 skill;子目录用 `:` 连接,如 `/frontend:component` |

**重名时谁生效**:企业 > 个人 > 项目;skill 和 `.claude/commands/` 同名时 skill 生效;你的 skill 和内置命令或内置 skill 同名时,你的会替换掉它(但它的别名仍然指向内置的);插件 skill 带命名空间,不会冲突。

**改了立即生效**:Claude Code 会监视 skill 目录,增删改 `SKILL.md` 不用重启。会话开始时不存在的顶层 skills 目录,创建后要跑一次 `/reload-skills`。

---

## 三、两类内容

### 3.1 参考型:让 Claude 知道

```markdown
---
name: api-conventions
description: 本项目的 API 设计规范。编写或修改 HTTP 接口时使用。
---
写接口时:
- 路径用复数名词,不用动词
- 错误统一返回 { code, message, details }
- 所有入参用 zod 校验
```

内容和你的对话放在一起,Claude 边工作边参照。

### 3.2 任务型:让 Claude 去做

```markdown
---
name: deploy
description: 部署到生产环境
disable-model-invocation: true
---
把 $ARGUMENTS 部署到生产:
1. 跑完整测试
2. 构建
3. 推送到部署目标
4. 验证部署成功
```

这类通常是**有副作用、你想自己掌握时机**的流程,所以加 `disable-model-invocation: true`,只能由你 `/deploy` 触发。

> **正文要短**。skill 一旦加载,内容会留在上下文里跨轮次存在,每一行都是持续的 token 成本。写"做什么",不要写"为什么这样做"的长篇解释。

---

## 四、谁能调用

| frontmatter | 你能调用 | Claude 能调用 | 上下文里有什么 |
| --- | --- | --- | --- |
| (默认) | 能 | 能 | 描述一直在,调用时加载全文 |
| `disable-model-invocation: true` | 能 | 不能自己调 | **描述也不在**,调用时加载全文 |
| `user-invocable: false` | 不能 | 能 | 描述一直在,调用时加载全文 |

- **有副作用的流程**(提交、部署、发消息)→ `disable-model-invocation: true`。Claude 试图自己调用会被拦下,并被告知不要用别的方式复现这些步骤
- **背景知识**(某个老系统怎么工作)→ `user-invocable: false`。用户敲 `/legacy-system-context` 没有意义,但 Claude 需要时应该知道

### 名字写在哪里决定了是否执行

| 写法 | 结果 |
| --- | --- |
| `/deploy staging`(消息开头) | 直接执行 |
| `准备好了就 /deploy 到 staging`(在文字中间) | 不直接执行;相当于你**授权**它在这次回复里可以调用 |

只想提到这个 skill 又不想授权,就别带斜杠。

---

## 五、frontmatter 常用字段

| 字段 | 作用 |
| --- | --- |
| `name` | 命令名,默认取目录名 |
| `description` | **最重要的字段**:做什么、什么时候用。Claude 靠它决定是否加载 |
| `when_to_use` | 补充触发场景,和 description 合计最多 1,536 字符 |
| `argument-hint` | 自动补全时的参数提示,如 `[issue-number]` |
| `arguments` | 命名参数,如 `[issue, branch]`,正文里用 `$issue`、`$branch` |
| `disable-model-invocation` / `user-invocable` | 调用控制 |
| `allowed-tools` | 本次调用期间免授权的工具 |
| `disallowed-tools` | 本次调用期间禁用的工具 |
| `model` / `effort` | 本轮使用的模型和 effort,不写入 settings |
| `context: fork` + `agent` | 在子代理里运行(见第八节) |
| `paths` | 只在处理匹配文件时自动激活 |
| `hooks` | 调用时注册的 hooks |
| `shell` | 注入命令用 `bash`(默认)还是 `powershell` |

几个细节:

- frontmatter 必须从文件**第一行**的 `---` 开始,否则整个文件都被当作正文
- YAML 解析失败时,skill 仍会加载但字段全部为空——`/名字` 能用,但 Claude 无法按描述匹配。用 `--debug` 看解析错误
- **写错的字段名会被静默忽略**,不会报错

---

## 六、参数与变量

| 变量 | 含义 |
| --- | --- |
| `$ARGUMENTS` | 调用时传入的全部参数 |
| `$0`、`$1` 或 `$ARGUMENTS[0]` | 按位置取参数(从 0 开始,支持 shell 风格引号) |
| `$name` | `arguments` 里声明的命名参数 |
| `${CLAUDE_SKILL_DIR}` | 这个 skill 所在目录,用来引用随 skill 附带的脚本 |
| `${CLAUDE_PROJECT_DIR}` | 项目根目录 |
| `${CLAUDE_SESSION_ID}` | 当前会话 ID |
| `${CLAUDE_EFFORT}` | 当前 effort 等级 |

```markdown
---
name: fix-issue
description: 修复一个 GitHub issue
argument-hint: [issue-number]
disable-model-invocation: true
---
按团队规范修复 GitHub issue #$0:
1. 用 `gh issue view $0` 读 issue
2. 实现修复并补测试
3. 提交,提交信息引用 #$0
```

`/fix-issue 123` 会把 `$0` 替换成 `123`。正文里没有任何占位符时,参数会以 `ARGUMENTS: <值>` 追加在末尾。

---

## 七、动态上下文与工具预授权

### 7.1 `` !`命令` `` 注入

```markdown
---
name: pr-summary
description: 总结一个 PR 的改动
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---
## PR 信息
!`gh pr view --json title,body,author`

## 改动
!`gh pr diff`

## 任务
总结这个 PR 做了什么、影响哪些模块、有哪些值得审查者注意的地方。
```

注入的命令在 Claude 看到内容**之前**运行,和 Claude 自己的 shell 命令一样受 2 分钟超时和输出上限约束;用 `${CLAUDE_SKILL_DIR}` 引用路径,不要依赖当前目录。

### 7.2 `allowed-tools`

```yaml
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)
```

在调用这个 skill 的**那一轮**里免授权使用这些工具,你发下一条消息时就失效(skill 内容还留在上下文里,但授权没了)。

> **安全提醒**:`allowed-tools` **不受目录信任机制约束**。仓库里自带的 skill 可以给自己授予很宽的工具权限,在不熟悉的仓库里跑 Claude Code 之前,先看看 `.claude/skills/` 里的 `allowed-tools`。组织可以用 `allowManagedPermissionRulesOnly` 让项目和个人 skill 的 `allowed-tools` 失效。

`allowed-tools` 里的 Bash 规则也支持 `${CLAUDE_SKILL_DIR}`,可以精确放行 skill 自带的脚本:

```yaml
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)
```

---

## 八、在子代理里运行:`context: fork`

```markdown
---
name: deep-research
description: 深入调研代码库里的某个主题
context: fork
agent: Explore
---
深入调研 $ARGUMENTS:
1. 找到相关文件
2. 阅读并分析代码
3. 给出带具体文件引用的结论
```

加了 `context: fork`,Claude Code 会启动一个 `agent` 指定类型的子代理(Explore、Plan、general-purpose,或你自己定义的),把 skill 内容作为它的任务。效果是:**大量的阅读和搜索发生在子代理的上下文里,主对话只收到结论**。

要点:

- 子代理**看不到你的对话历史**,所以 skill 里要写清楚完整的任务。只有指导原则、没有具体任务的 skill 不适合 fork
- 默认**在后台运行**,你可以继续干别的,结果完成后出现在对话里;设 `background: false` 则等它完成
- 后台运行的 fork 做的文件修改**不在你的检查点里**,回退撤不回
- Explore 和 Plan 不加载 CLAUDE.md,需要的信息都写进 skill

skill 和子代理还有另一种组合方向:**在子代理定义里用 `skills` 字段预加载 skill**,把 skill 当成子代理的参考资料(13 篇)。

---

## 九、内置 skills

Claude Code 自带一批 skill,和内置命令一起列在 `/` 菜单里。常用的几个:

| skill | 作用 |
| --- | --- |
| `/code-review` | 审查当前 diff 的正确性问题,可指定深度(22 篇) |
| `/simplify` | 审查改动中可以简化、复用、提效的地方并直接修 |
| `/verify` | 构建并运行你的应用,确认改动真的生效 |
| `/run` | 启动并操作你的应用,看改动跑起来的样子 |
| `/batch` | 在整个代码库里并行做大规模改动 |
| `/debug` | 打开调试日志,读日志排查问题 |
| `/doctor` | 安装和配置体检;`/doctor prompt-audit` 审查指令文件 |
| `/loop` | 让一个 prompt 按间隔重复运行(18 篇) |
| `/claude-api` | Claude API 开发参考,带迁移、成本优化等子命令 |
| `/update-config` | 用自然语言修改 settings |
| `/fewer-permission-prompts` | 扫描历史记录,给常用的只读命令生成放行规则 |

不想要可以用 `disableBundledSkills` 整体关掉,或者在 `skillOverrides` 里单独关。

---

## 十、管理:可见性、成本与效果

### 10.1 不改文件也能调整可见性

别人写的 skill(比如仓库里提交的)不想改它的文件,用 settings 的 `skillOverrides`:

```json
{
  "skillOverrides": {
    "legacy-context": "name-only",
    "deploy": "off"
  }
}
```

可选值:`"on"`、`"name-only"`(只列名字不列描述)、`"user-invocable-only"`(Claude 看不到,`/` 菜单里能用)、`"off"`。插件的 skill 不受它影响,要用 `/plugin` 管理。

### 10.2 找出没用的 skill

每个能被 Claude 自动调用的 skill,描述都会**在每一轮占用上下文**,不管用没用到。`/skill-doctor` 会列出每个 skill 的上下文成本和使用频率,标出从没被调用过的;`/skills` 里按 `t` 可以按 token 数排序。

### 10.3 验证 skill 真的有效

"它触发了"只说明 Claude 找到了它,不说明它做对了。靠谱的验证是**对照实验**:准备几条真实的 prompt,在新会话里分别在开启和关闭这个 skill 的情况下运行,比较结果。官方的 `skill-creator` 插件把这个流程自动化了:管理测试用例、每个用例独立运行、按断言打分、汇总有无 skill 的通过率和 token 开销、对两个版本做盲测、调优描述的触发率。

```
/plugin install skill-creator@claude-plugins-official
```

---

## 十一、写好 description

description 决定 Claude 会不会在对的时候想起这个 skill:

| 不好 | 好 |
| --- | --- |
| "代码审查" | "按团队清单审查 PR:安全、性能、测试覆盖。用户要求审 PR、review 代码或检查改动时使用" |
| "数据库相关" | "本项目的 PostgreSQL schema 和查询规范。编写 SQL、设计表结构或排查慢查询时使用" |
| "部署" | (有副作用的,干脆加 `disable-model-invocation: true`,description 写给人看即可) |

原则:**先写做什么,再写什么时候用,带上用户会自然说出的关键词**。描述太泛会误触发,太窄会想不起来;几个 skill 描述互相重叠,Claude 可能选错。

---

## 十二、skill 与其他扩展的分工

| 需求 | 选 |
| --- | --- |
| 每次都要知道的约定 | CLAUDE.md |
| 有时需要的参考资料、可复用的流程 | **Skill** |
| 必须每次执行、不靠模型自觉 | Hook |
| 接外部系统的工具 | MCP(skill 可以教 Claude 怎么用好这些工具) |
| 需要隔离上下文的子任务 | Subagent,或 `context: fork` 的 skill |
| 跨仓库复用、分发给别人 | 打包成 Plugin |

---

## 十三、踩坑

1. **description 写得太泛或太窄**——要么误触发,要么永远想不起来。写清楚做什么和触发场景
2. **有副作用的 skill 允许 Claude 自动调用**——它可能"觉得代码准备好了"就去部署。加 `disable-model-invocation: true`
3. **正文写成长篇大论**——加载后每一轮都在付 token。只写要做什么
4. **重要指令放在 skill 末尾**——上下文压缩后超长的 skill 会被截断,截断保留开头
5. **只有原则没有任务的 skill 用 `context: fork`**——子代理拿到一堆原则却不知道要干什么,空手而回
6. **以为 `allowed-tools` 在整个会话有效**——只在调用的那一轮有效
7. **不审查仓库里的 skill 就开工**——`allowed-tools` 不受信任机制约束,可能给自己授了很大的权限
8. **frontmatter 字段拼错**——静默忽略,不报错。行为不对时先查拼写
9. **skill 越装越多不清理**——每个描述每轮都占上下文。定期跑 `/skill-doctor`
10. **觉得"它调用了 skill"就等于"skill 有用"**——用开关对照的方式验证效果

---

下一篇:`11-Hooks钩子系统.md`,讲 hook 的事件类型、五种 hook 写法(命令、HTTP、MCP 工具、prompt、子代理)、输入输出协议,以及常见的拦截、格式化、通知用例。
