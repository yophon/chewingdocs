# Memory 与 CLAUDE.md

每次新会话,Claude 都是从零开始认识你的项目。它不记得上周你纠正过它"用 pnpm 不用 npm",也不知道测试要先起一个本地 Redis。Memory 机制就是解决这件事的:**把你本来要反复解释的东西写下来,让每个会话一开始就知道**。

Claude Code 有两套互补的记忆:**你写给它的 CLAUDE.md**,和**它自己记下的 auto memory**。

> 一句话先记住:**CLAUDE.md 是上下文,不是强制配置**。它会被读进每一轮请求,Claude 会努力遵守,但不保证。所以它要写得**短、具体、可验证**;必须百分之百执行的事,交给 hook。

---

## 一、两套记忆的分工

| | CLAUDE.md | Auto memory |
| --- | --- | --- |
| **谁写** | 你 | Claude |
| **写什么** | 指令和规则 | 学到的经验和模式 |
| **作用域** | 项目、个人、组织 | 每个仓库一份,所有 worktree 共享 |
| **加载** | 每个会话完整加载 | 每个会话加载 `MEMORY.md` 的前 200 行或 25KB |
| **适合** | 编码规范、工作流、构建命令 | 你的偏好、你给过的纠正、代码里推断不出来的项目背景 |

简单说:**你想引导它的行为,写 CLAUDE.md;让它从你的纠正里自己学,靠 auto memory**。

---

## 二、CLAUDE.md 放在哪

| 作用域 | 位置 | 共享范围 |
| --- | --- | --- |
| **组织** | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`<br>Linux `/etc/claude-code/CLAUDE.md`<br>Windows `C:\Program Files\ClaudeCode\CLAUDE.md` | 机器上所有用户、所有仓库 |
| **个人** | `~/.claude/CLAUDE.md` | 你自己的所有项目 |
| **项目** | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 提交到 git,团队共享 |
| **项目本地** | `./CLAUDE.local.md` | 只有你,记得加进 `.gitignore` |

### 2.1 加载规则

- **向上全部加载**:在 `foo/bar/` 启动,会加载 `foo/bar/CLAUDE.md`、`foo/CLAUDE.md` 以及同级的 `CLAUDE.local.md`
- **拼接,不覆盖**:所有找到的文件都进上下文,顺序从文件系统根往下,离工作目录越近的越靠后
- **子目录按需加载**:工作目录下面的子目录里的 CLAUDE.md 不在启动时加载,而是在 Claude 第一次读、写、改那个目录里的文件时才加载
- **HTML 注释会被剥掉**:`<!-- 给维护者的备注 -->` 不占上下文,适合写给人看的说明

### 2.2 AGENTS.md

仓库里已经为其他编码工具准备了 `AGENTS.md`?不用再写一份 CLAUDE.md:

| 仓库里有 | Claude 读 |
| --- | --- |
| 只有 `AGENTS.md`,工作目录及以上没有 `CLAUDE.md` / `CLAUDE.local.md` | `AGENTS.md` |
| 两个都有 | 只读 `CLAUDE.md` |
| `CLAUDE.md` 里写了 `@AGENTS.md` | 两者都读(通过导入) |

注意:**加一个 `CLAUDE.local.md` 也会让它不再读 `AGENTS.md`**。想两个都读,在 `/config` 里把 **Project instructions** 设成 `claude-md-and-agents-md`。最稳妥的通用写法是放一个只有一行的 CLAUDE.md:

```markdown
@AGENTS.md
```

### 2.3 大仓库里排除别人的 CLAUDE.md

monorepo 里上层目录可能有其他团队的 CLAUDE.md,用 `claudeMdExcludes` 跳过(放在 `settings.local.json` 里只影响你自己):

```json
{
  "claudeMdExcludes": [
    "**/monorepo/CLAUDE.md",
    "/home/user/monorepo/other-team/.claude/rules/**"
  ]
}
```

组织级的 CLAUDE.md 不能被排除。

---

## 三、`.claude/rules/`:把指令按主题和路径拆开

项目一大,单个 CLAUDE.md 就会膨胀。`.claude/rules/` 让你按主题拆成多个文件:

```
your-project/
├── .claude/
│   ├── CLAUDE.md          # 核心说明
│   └── rules/
│       ├── code-style.md
│       ├── testing.md
│       └── security.md
```

**不带 frontmatter 的 rule**:启动时加载,和 `.claude/CLAUDE.md` 同等地位。

**带 `paths` 的 rule**:只在 Claude 处理匹配的文件时才加载,省上下文:

```markdown
---
paths:
  - "src/api/**/*.ts"
---
# API 开发规则

- 所有接口必须做输入校验
- 使用统一的错误响应格式
- 写 OpenAPI 注释
```

`paths` 支持 glob 和花括号展开(`"src/**/*.{ts,tsx}"`),是 rule 唯一读取的 frontmatter 字段。

其他用法:

- **个人 rules**:`~/.claude/rules/` 下的文件对你所有项目生效,先于项目 rules 加载
- **跨项目共享**:`.claude/rules/` 支持符号链接,指向工作目录外的文件时第一次会请你批准

> 带 `paths` 的 rule 在被触发时才进入对话,**上下文压缩时会被一起总结掉**,下次碰到匹配文件再重新加载。一条规则必须一直有效,就别给它加 `paths`。

---

## 四、`@` 导入:引用其他文件

```markdown
项目概况见 @README,可用命令见 @package.json。

# 补充说明
- git 工作流 @docs/git-instructions.md
```

- 相对路径相对于**写导入的那个文件**,不是工作目录
- 最多递归导入四层
- 路径有空格要用反斜杠转义:`@Design\ Docs/api.md`
- **写在反引号里不会被导入**:`` `@README` `` 只是文字
- 项目文件里导入工作目录之外的文件(比如 `@~/.claude/my-notes.md`),第一次会弹窗请你批准——防止别人提交的仓库偷偷读你家目录的文件

一个实用技巧:**多个 worktree 共享个人指令**。`CLAUDE.local.md` 被 git 忽略,只存在于创建它的那个 worktree;改成在 CLAUDE.local.md 或个人 CLAUDE.md 里导入家目录下的一个文件,所有 worktree 就都能用了。

---

## 五、一份好的 CLAUDE.md 长什么样

### 5.1 什么时候往里加东西

把它当成"**本来要反复解释的东西**"的存放处。出现下面情况时加一条:

- Claude **第二次**犯同样的错
- code review 发现了一个 Claude 本该知道的项目约定
- 你在聊天里打了一遍上次会话就打过的纠正
- 新同事入职也需要知道这件事

### 5.2 写什么、不写什么

**写**:Claude 每个会话都需要、但**从代码里推断不出来**的东西。

- 构建、测试、lint 的确切命令
- 团队约定(命名、分层、错误处理方式)
- 地雷区:哪些目录改之前要格外小心、为什么
- 不明显的决定和原因("用 X 不用 Y,因为……")
- 环境前提("测试前要先起本地 Redis")

**不写**:

- **目录结构、依赖列表、架构概览**——Claude 自己读代码就能知道,写进来既占上下文又容易过时。`/doctor` 给 CLAUDE.md 提精简建议时,删的正是这类内容,保留的是坑、原因和约定
- 多步骤流程(部署、发版、排障手册)——放 skill,用到再加载
- 只和某个目录相关的规定——放带 `paths` 的 rule
- 密钥、内网地址等敏感信息

### 5.3 写法

- **具体到可验证**:"用 2 空格缩进"而不是"格式规范一点";"提交前跑 `npm test`"而不是"记得测试";"接口处理函数放 `src/api/handlers/`"而不是"文件放整齐"
- **控制在 200 行以内**:越长越占上下文,遵守度越低。超过 4 MiB 的文件直接跳过
- **用标题和列表组织**,别写成大段落
- **避免互相矛盾**:几个 CLAUDE.md 和 rules 说法冲突时,Claude 可能随便选一个

### 5.4 示例

```markdown
# 项目说明

订单服务。TypeScript + Fastify + PostgreSQL,pnpm workspace。

## 命令

- 安装:`pnpm install`(不要用 npm)
- 测试:`pnpm test`;集成测试需要先 `docker compose up -d postgres redis`
- 类型检查:`pnpm typecheck`,提交前必须通过
- 本地启动:`pnpm dev`,端口 3000

## 约定

- 业务错误抛 `AppError`(见 `src/errors.ts`),不要直接 `throw new Error`
- 金额一律用整数分存储,不用浮点
- 数据库迁移用 `pnpm migrate:new <name>` 生成,不要手写文件名

## 地雷区

- `src/billing/` 对接第三方支付,改动必须加对应的回放测试
- `migrations/` 里已发布的文件不能改,只能新增

## 不要做

- 不要升级 `fastify` 大版本,插件生态还没跟上
- 不要在测试里连真实的支付沙箱
```

不到 30 行,全是读代码推断不出来、但每个会话都用得上的信息。

### 5.5 起步与维护

- **`/init`** 分析代码库生成第一版;已有 CLAUDE.md 时它会提改进建议而不是覆盖
- **`/doctor prompt-audit`** 检查你的 CLAUDE.md、rules、skills、子代理等指令文件:为旧模型写的过时写法、引用了不存在的文件或命令、互相矛盾的内容
- **`/memory`** 列出所有记忆文件的位置,直接打开编辑
- 也可以直接说"把这条加进 CLAUDE.md"

---

## 六、Auto memory:Claude 自己记的笔记

### 6.1 它记什么

工作过程中,Claude 会给自己记四类笔记,类型写在文件的 frontmatter 里:

| 类型 | 内容 |
| --- | --- |
| `user` | 你的角色、专长、工作偏好 |
| `feedback` | 你给过的纠正、你认可过的做法 |
| `project` | 进行中的工作、截止时间、代码和 git 历史里看不出的决定 |
| `reference` | 项目外的信息在哪:issue 跟踪器、仪表盘 |

它**不记**能从代码推断的东西(架构、文件路径、某次调试的修法),也不重复 CLAUDE.md 里已有的内容。不是每个会话都会记,它会判断"以后用不用得上"。

你说"记住:API 测试需要本地 Redis",它会存进 auto memory;想写进 CLAUDE.md,就明确说"加到 CLAUDE.md"。

### 6.2 存在哪、怎么加载

```
~/.claude/projects/<项目>/memory/
├── MEMORY.md            # 索引,每条一行
├── user_role.md
├── feedback_testing.md
└── ...
```

- `<项目>` 由 git 仓库决定,**同一仓库的所有 worktree 和子目录共享一份**
- 每个会话开始只加载 `MEMORY.md` 的前 200 行或 25KB;具体的主题文件 Claude 需要时再用文件工具去读
- `MEMORY.md` 快到上限时,Claude Code 会提醒 Claude 精简:一条一行、细节移到主题文件、合并或删除过时条目
- 写入带 frontmatter 的记忆时会自动记录 `modified` 时间戳,方便判断这条事实还新不新
- 子代理默认不加载主对话的 auto memory(fork 型子代理例外),但子代理可以有自己的持久记忆(13 篇)

### 6.3 开关与审查

- `/memory` 里有开关,会写进 `~/.claude/settings.json` 的 `autoMemoryEnabled`
- 只对某个项目关闭:在项目 settings 里设 `"autoMemoryEnabled": false`
- 环境变量:`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
- 换存储位置:`autoMemoryDirectory`

**记忆文件都是普通 Markdown**,用 `/memory` 打开浏览,错的直接改或删。隔一段时间翻一下,别让过时的"经验"误导它。

---

## 七、CLAUDE.md、rules、skill、hook 怎么分

| 需求 | 放哪 |
| --- | --- |
| 每个会话都要知道的约定和命令 | CLAUDE.md |
| 只在处理某类文件时需要的规定 | 带 `paths` 的 rule |
| 偶尔需要的参考资料、多步骤流程 | Skill(10 篇) |
| 回答风格、篇幅、角色 | Output style(09 篇) |
| 必须每次都执行、不能靠模型自觉的事 | Hook(11 篇) |
| 系统提示级别的指令(脚本场景) | `--append-system-prompt` |

> 判断标准:**这条信息是不是每个会话都需要?**是 → CLAUDE.md;只有某些文件需要 → rule;只有某些任务需要 → skill;必须保证执行 → hook。

---

## 八、排查:它为什么不听 CLAUDE.md

1. **先确认加载了**:`/context` 看 **Memory files** 列表。子目录的 CLAUDE.md 是按需加载的,不在启动列表里,加载时终端会显示一行 `Loaded`
2. **写得够不够具体**:"格式化好一点"它没法执行,"用 2 空格缩进"可以
3. **有没有互相矛盾**:几个 CLAUDE.md、rules 之间说法冲突
4. **是不是和内置指令打架**:你在 CLAUDE.md 里定了提交规范,内置的 git 指令可能和它冲突。把 `includeGitInstructions` 设成 `false`,再自己写
5. **太长了**:超过 200 行启动时会警告,遵守度明显下降
6. **压缩后丢了**:放在项目根 CLAUDE.md 的内容会在压缩后重新注入;带 `paths` 的 rule 和子目录 CLAUDE.md 不会立刻回来
7. **要查到底加载了什么**:用 `InstructionsLoaded` hook 记录每个指令文件何时、为何被加载

---

## 九、踩坑

1. **把目录结构和依赖列表写进 CLAUDE.md**——Claude 自己能读出来,写了只会占上下文、还会过时
2. **CLAUDE.md 写成几百行的百科全书**——遵守度下降。拆到 rules 和 skills
3. **用 CLAUDE.md 做安全约束**——"禁止改 `.env`"是请求,不是保证。用 deny 规则或 hook
4. **会话中途改了 CLAUDE.md 指望立刻生效**——要 `/clear`、`/compact` 或重启
5. **项目里同时有 AGENTS.md 和 CLAUDE.md,以为都会读**——默认只读 CLAUDE.md。用 `@AGENTS.md` 导入
6. **加了 CLAUDE.local.md 后 AGENTS.md 就失效了**——它也算"有 CLAUDE.md"。改 Project instructions 设置
7. **CLAUDE.local.md 在别的 worktree 里不见了**——它被 git 忽略,只在创建它的 worktree 里。改用导入家目录文件
8. **从不看 auto memory 记了什么**——过时或错误的"经验"会一直误导它。定期用 `/memory` 审一遍
9. **指令写得含糊**——"代码要优雅"无法执行。写成可以检查的具体要求
10. **几份指令文件互相矛盾**——Claude 会随机选一个。用 `/doctor prompt-audit` 找出来

---

下一篇:`07-模型-effort与fast-mode.md`,讲模型别名怎么解析、effort 等级怎么选、fast mode 和 advisor 什么时候值得开,以及组织怎么限制可用模型。
