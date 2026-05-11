# Memory 与 CLAUDE.md

如果说 settings 决定 Claude Code 怎么"运转",memory 决定它怎么"理解你的项目"。**没有 CLAUDE.md 的项目,Claude 每次都从零开始猜你的代码风格、技术选型、约定**;有了一份好的 CLAUDE.md,它一开始就知道这个项目用什么、怎么写、有哪些地雷。

> 一句话先记住:**memory 是"项目的口袋说明书",每次会话开始自动注入到 LLM 上下文**。settings 管行为、skill 管能力、memory 管"事实背景"——这三件事别混。

---

## 一、Memory 的两层

```
~/.claude/CLAUDE.md           ← 用户级 memory(所有项目都看)
<project>/CLAUDE.md           ← 项目级 memory(本项目)
<project>/.claude/MEMORY.md   ← 项目级 memory(更隐蔽位置,等价)
```

**作用**:每次启动 session 时,这些文件的内容会自动注入到系统 prompt 里——LLM 无需调任何工具就能看到。

| 层 | 适合放什么 |
| --- | --- |
| 用户级 `~/.claude/CLAUDE.md` | 个人偏好、跨项目通用约定(语气、习惯) |
| 项目级 `CLAUDE.md` | 项目独有的事实(技术栈、架构、地雷) |

**优先级**:两层都注入,内容相加。如果冲突,**项目级胜出**(LLM 在距离当前任务更近的指令上更相信)。

---

## 二、好 CLAUDE.md 长什么样

下面是一份能直接抄的项目 CLAUDE.md 模板。

```markdown
# 项目说明

## 项目是什么
- 公司内部的客户管理系统(CRM)
- 主要用户是销售团队和售后,~200 人 DAU
- 后端 monorepo,前端在另一个 repo

## 技术栈
- 语言:TypeScript(strict)、Python(3.12+)
- 后端:NestJS + Postgres + Redis + RabbitMQ
- 前端:Next.js 15 + tRPC + Tailwind
- 数据库:Postgres 16,主库 + 一个 read replica
- 部署:K8s,镜像走 GitHub Container Registry
- 监控:Datadog + Sentry

## 目录结构(重点)
- `apps/api/` —— 主后端
- `apps/worker/` —— 异步 worker(消费 MQ)
- `packages/db/` —— Drizzle schema(改这里 = 改数据库)
- `packages/shared/` —— 跨服务共享类型 / utils

## 约定
- commit message 走 conventional commits(`feat:`、`fix:`、`refactor:`)
- PR 必须有"为什么"段,不只描述"做了什么"
- 数据库改动一律走 migration,不在 prod 直接改
- API 全部走 tRPC,新接口不要再写 REST
- 前端按 colocation 组织,组件就近放在 feature 文件夹

## 命令速查
- 起 dev:`pnpm dev`
- 跑测试:`pnpm test`
- 跑 lint:`pnpm lint`
- 跑迁移:`pnpm db:migrate`
- 部署 staging:`gh workflow run deploy-staging.yml`

## 地雷区(改这里要小心)
- `apps/api/src/auth/`:鉴权核心,改前先 plan
- `packages/db/schema/`:schema 改动 = migration,不能直接 push
- `apps/worker/src/jobs/billing/`:付费相关,合规要走 review

## 不在本项目处理
- 用户认证 = SSO 走 Okta,本项目不管 password
- 邮件发送 = 走另一个服务 `notification-service`
- 支付 = Stripe,callback 在 `apps/api/src/webhooks/stripe.ts`

## CLAUDE 行为偏好
- 改 schema 必须先 plan
- 提交 commit 不要带 `Co-Authored-By` 行
- 写测试用 vitest 不用 jest
- 不要 `console.log` 调试,用 pino logger
```

**这份模板的精华**:

1. **"是什么 / 用什么"** ——技术栈一句话讲清
2. **"在哪改"** ——目录结构和重点文件
3. **"别动哪"** ——地雷区单独列
4. **"该怎么写"** ——约定和风格
5. **"行为偏好"** ——给 LLM 的特殊指令

> 这份 5 分钟读完的 md,**让 Claude 在每个新 session 都"已经熟悉项目"**。

---

## 三、@import:把其他 md 链进来

CLAUDE.md 里可以用 `@path/to/file.md` 引用其他 markdown,启动时也会自动展开:

```markdown
# CLAUDE.md

## 项目说明
@docs/architecture.md

## 部署流程
@docs/deploy.md

## 数据库 schema
@packages/db/README.md
```

**用处**:

- 复用已有文档(架构图、部署 runbook),不用重写一遍给 LLM
- 把超长 CLAUDE.md 拆成几个分模块的小文件
- 团队的"通用部分"放 monorepo 根,各 sub-package 的 CLAUDE.md 引共用部分

```
monorepo/
├── CLAUDE.md             # 引共用 + 总体约定
├── docs/
│   ├── architecture.md
│   └── deploy.md
├── apps/api/CLAUDE.md    # 后端专有,引用 ../../docs/architecture.md
└── apps/web/CLAUDE.md    # 前端专有
```

> @import 是 monorepo 项目的最佳实践——**总览放根 CLAUDE.md,每个 sub-app 自己的 CLAUDE.md 加专属信息**。Claude Code 在哪个 cwd 启动,会按目录链找到对应的 CLAUDE.md。

---

## 四、什么该写,什么不该写

### 该写

| 类型 | 例子 |
| --- | --- |
| **技术栈事实** | 用 NestJS 不是 Express,用 Drizzle 不是 Prisma |
| **目录约定** | feature folder、shared 包位置、生成代码位置 |
| **工具链命令** | dev / test / lint / migrate 命令(LLM 自己猜不准) |
| **地雷区** | 改前要小心的核心模块、生产风险点 |
| **不做范围** | 别的服务负责的部分,本项目不管 |
| **风格强约定** | commit 格式、PR 模板、命名 |
| **历史决策** | "为什么用 X 不用 Y"(避免 LLM 想改回去) |

### 不该写

| 类型 | 为什么 |
| --- | --- |
| **大段教程** | LLM 已经会的东西不用教(React 怎么用、Postgres 怎么 query) |
| **临时性 TODO** | 写到 issue / PR / linear,不是 memory |
| **个人 vs 团队混杂** | 个人偏好放用户级,项目事实放项目级 |
| **机密 / 密钥** | CLAUDE.md 提交进 git,任何敏感信息都不该进来 |
| **过期信息** | 半年没更新的"新加 feature TODO" 让 LLM 误以为现状 |
| **重复的 settings** | 该 hook 的事别在 memory 里念三遍——LLM 不会真做 |

> 黄金原则:**memory 写"事实",不写"愿望"**。"我们用 Drizzle"是事实(LLM 看完就知道);"以后要换 Drizzle"是愿望(LLM 会困惑现在用什么)。

---

## 五、Memory 与 settings / skill / hook 的分工

容易混淆的"我该把这条规则写在哪":

| 规则类型 | 写在哪 |
| --- | --- |
| "用 vitest 不用 jest" | **CLAUDE.md**(事实) |
| "禁止 `rm -rf`" | **settings.json `permissions.deny`** |
| "提交前一定跑测试" | **Hook**(`PreToolUse` 拦 `git commit`) |
| "审 PR 时按这套清单" | **Skill**(场景激活) |
| "我喜欢简短回答" | **用户级 CLAUDE.md** |
| "改 schema 要先 plan" | **CLAUDE.md + 可选 hook** |

> 决策思路:**这是"事实背景"还是"行为约束"?事实进 memory,约束按强度分**——强约束 hook,中等 skill,可选偏好 memory。

---

## 六、`/init` 自动生成 CLAUDE.md

第一次进项目可以直接:

```
/init
```

Claude 会扫描项目,**自动生成一份 CLAUDE.md 草稿**——技术栈、目录、命令、约定它都能读出来八九不离十。生成完你审一遍、补地雷区和历史决策,就能用。

> 比从零写省 30 分钟。**新项目第一件事就是 `/init`**。

---

## 七、`#` 快捷写入 memory

会话中如果有"这件事我希望以后 Claude 一直记得",输:

```
# 不要用 console.log,用 pino logger
```

`#` 开头的消息会被识别成"添加 memory",Claude 会问"加到 user memory 还是 project memory",写到 CLAUDE.md。

**用法**:对话中突然意识到一个重要约定,**用 `#` 立刻沉淀**——别等到 session 结束忘了。

---

## 八、用户级 memory 怎么写

`~/.claude/CLAUDE.md` 是跨所有项目的——写得太具体会污染所有项目。**适合放的内容**:

```markdown
# 我的偏好

## 代码风格
- 偏好简洁,不喜欢过度抽象
- 命名宁可长不要缩写
- 异步函数返回 result 类型,不抛异常(Rust style)

## 沟通
- 直接给结论,不需要客套
- 命令和 diff 不需要重复总结
- 中文回复

## 学习偏好
- 给"地雷"或"踩坑"段我会很感兴趣
- 例子用真实场景,不要 foo/bar 占位
- 不要重复确认"你的意思是不是 X"——直接做

## 跨项目通用
- commit 不带 `Co-Authored-By: Claude` 这行
- 不写表情符号
- README 不主动建,除非要求
```

> 用户级 memory 写"你这个人是怎么想的",项目级写"这个项目是什么样的"。**两个职责清楚,LLM 才不困惑**。

---

## 九、维护 CLAUDE.md 不让它腐化

CLAUDE.md 最大的风险是**不更新**。半年前的描述误导 LLM 比没有 CLAUDE.md 还糟。

实践:

1. **每次大重构后第一件事**:更新 CLAUDE.md(改了哪些技术栈、新加了哪些模块、淘汰了哪些约定)
2. **新人 onboarding 用它**——发现新人看完仍然问的问题 = CLAUDE.md 缺这条
3. **长度控制在两屏内**——超出说明没好好删旧的;**信息密度比信息量重要**
4. **半年 audit 一次**——逐条问"这条还成立吗",过期的删

---

## 十、踩坑

1. **CLAUDE.md 不写**——"用 Claude Code 没用啊"——大概率是没 CLAUDE.md。补一份立刻好转
2. **写成大段历史 / 故事**——"这个项目 2022 年 X 干了 Y..." LLM 不需要背景小说,要的是事实
3. **写得像 README**——README 给人看,CLAUDE.md 给 LLM 看;**README 帮你 onboarding,CLAUDE.md 帮 Claude onboarding**
4. **机密写进去**——CLAUDE.md 进 git,team token、生产 URL 等不要写
5. **跨项目通用 vs 项目独有混着写**——后者写到用户级 memory 污染所有项目
6. **不维护**——半年没改的 CLAUDE.md 有误导风险;**重构后要更新**
7. **写满了"应该"和"将来"**——LLM 不知道现状,会困惑
8. **太长**——3000 字的 CLAUDE.md 是给真人写的;**LLM 看完上下文已经满了**,精简到 500-1000 字
9. **`#` 沉淀的 memory 太琐碎**——重要约定才沉淀;"今天我累了" 这种别 `#`
10. **monorepo 不分层**——所有信息塞进根 CLAUDE.md,前端后端都看到对方的细节,**不该看的信息也是干扰**

---

下一篇:`11-IDE集成与statusline.md`,讲 VSCode / Cursor / JetBrains 集成、`/ide` 的作用、status line 自定义脚本(完整可用例子)、output style、`/install-github-app` 自动化场景。
