# Commit Message 与 PR 规范

写好 commit message 和 PR 描述是**工程师文化**——不是格式洁癖,是**给未来的自己和同事节省考古时间**。一个项目跑三年之后,git log 是最重要的考古工具——`git blame` 一行 → commit message 讲清楚为什么 → PR 描述链到 issue → 5 分钟定位历史决策。message 写垃圾,这条路就断了。

> 一句话先记住:**好 commit 的 subject 一句话讲"做了什么",body 讲"为什么"**。code 在 diff 里都看得到,**git log 唯一独占的信息是"why"**。这一篇讲 Conventional Commits 详细规则、PR 描述模板、和现代化的自动化工具链。

---

## 一、Conventional Commits 详细规则

工业界事实标准。完整格式:

```
<type>(<scope>)!: <subject>

<body>

<footer>
```

### 1.1 type 全集

| type | 何时用 | 是否影响 SemVer |
| --- | --- | --- |
| `feat` | 新功能 | MINOR |
| `fix` | bug 修复 | PATCH |
| `docs` | 文档 | 不影响 |
| `style` | 格式化(不改逻辑) | 不影响 |
| `refactor` | 重构(不改外部行为) | 不影响 |
| `perf` | 性能优化 | PATCH |
| `test` | 加 / 改测试 | 不影响 |
| `chore` | 杂活(deps、CI 配置) | 不影响 |
| `build` | 构建系统 / 工具链 | 不影响 |
| `ci` | CI 配置 | 不影响 |
| `revert` | 回滚 | 看回滚什么 |

### 1.2 scope(可选)

scope 是改动的"范围",通常对应模块名:

```
feat(auth): add SSO login
fix(upload): handle null file
chore(deps): bump react to 19.0.0
```

scope 不是必填——但 monorepo / 多模块项目里强烈推荐。

### 1.3 `!` 标记 breaking change

```
feat(auth)!: replace JWT with session cookies
```

`!` 在 type / scope 后,意味着**破坏性变动**(SemVer MAJOR)。也可以放 footer:

```
feat(auth): replace JWT with session cookies

BREAKING CHANGE: existing JWT tokens are invalidated.
Users must re-login.
```

### 1.4 subject(标题行)

铁律:

- **祈使句现在时**:`add` / `fix` / `update`,**不是** `added` / `fixes`
- **首字母小写**(社区习惯)
- **不超过 50 字**(72 是上限)
- **不加句号**

❌ 反例:

```
Added a new feature for SSO login.    # 时态 + 大写 + 句号,全错
```

✅ 正例:

```
feat(auth): add SSO login via Okta
```

### 1.5 body(详细描述)

可选,讲"为什么":

```
feat(auth): add SSO login via Okta

Customer X requires Okta SSO. Existing password login still
works — Okta button shows up only when OKTA_CLIENT_ID env
var is set, so dev environments are unaffected.

Token storage shares the same JWT helper as password login.
```

**body 与 subject 之间要有空行**。

### 1.6 footer(元数据)

```
feat(auth): ...

...body...

Closes #1234
Reviewed-by: Wang
Signed-off-by: Qiji Xin <qiji@example.com>
BREAKING CHANGE: existing JWT tokens invalidated
```

常用 footer:

- `Closes #N` / `Fixes #N` / `Resolves #N` — 关 issue(GitHub 自动)
- `Reviewed-by:` — 谁 review 过
- `Signed-off-by:` — DCO 签署
- `Co-authored-by:` — 多人合著(GitHub 显示多 author)
- `BREAKING CHANGE:` — 破坏性变动详细描述

> 这些 footer 不只是给人看——**自动化工具会解析**。`Closes #1234` GitHub 自动关 issue;`BREAKING CHANGE` semantic-release 自动 bump major;`Co-authored-by` GitHub 显示双头像。

---

## 二、好 commit 与差 commit 对比

❌ **差**:

```
update
fix
WIP
asdf
final
final final
final2
```

❌ **稍好但仍差**(没说明白):

```
fix bug
update auth
some changes
```

✅ **好**:

```
feat(auth): add SSO login via Okta
fix(upload): handle null file in multipart parser
docs(readme): document OKTA_CLIENT_ID env var
refactor(db): extract connection pool into separate module
chore(deps): bump react to 19.0.0
```

✅ **更好**(带 body 讲 why):

```
fix(upload): handle null file in multipart parser

Customer X reported uploads silently failing. Root cause:
multipart.parseFile returns null when file size > 100MB,
but the handler called .name on it directly. Added a null
check + better error message.

Tested with 50MB / 200MB / 500MB files locally.

Closes #1234
```

---

## 三、PR 描述模板

PR 是 commit 的"打包"——**PR 描述应该回答 commit message 容纳不下的问题**:

```markdown
## What

简述这个 PR 干了什么(2-3 句)。

## Why

为什么要做这件事。链 issue / RFC / 客户反馈。

## How

技术方案的关键决策。如果有过设计讨论,链文档。

## Test plan

- [ ] 单测:auth.test.ts 增加 SSO 用例
- [ ] e2e:登录流程跑通(本地 + 测试环境)
- [ ] 手动:在 staging 用真实 Okta 测了 5 次

## Screenshots / Videos

(UI 改动必填)

## Related

- Closes #1234
- Linked PR: #5678
- RFC: docs/rfc/sso.md
```

仓库根加 `.github/PULL_REQUEST_TEMPLATE.md`——新建 PR 时 GitHub 自动填模板。

> **不写 PR 描述的人 = 让 reviewer 自己读代码理解意图**。reviewer 不是你,他没你大脑里那段"我为什么这么改"的上下文。**3 分钟写描述,reviewer 省 30 分钟,值**。

---

## 四、PR 大小:**小才是美**

最重要的 PR 纪律:**别开大 PR**。

| PR 大小 | review 质量 | 合并速度 |
| --- | --- | --- |
| < 100 行 | 高 | 快 |
| 100-500 行 | 中 | 中 |
| > 500 行 | 低(reviewer 装样子点 approve) | 慢 |
| > 1000 行 | 几乎没人认真看 | 很慢,常被搁置 |

> 行业经验:**50-200 行的 PR 是甜蜜区**。再大就拆——拆成小 PR 链(stacked PR)、或拆成多次合并的小 PR。**没人喜欢 review 1000 行 PR,合并它的人也不喜欢自己后面 debug 它**。

拆 PR 的工具:

- [Graphite](https://graphite.dev) / [stacked PR](https://github.com/) GitHub 原生支持
- 手动:branch1 → branch2 → branch3,每个基于上一个

---

## 五、Stacked PR(链式 PR)

大改拆成多个 PR,**前一个是后一个的 base**:

```
main ← PR1(基础) ← PR2(中间层) ← PR3(应用)
```

合并顺序:PR1 → PR2 → PR3。每个 PR 单独 review,**审小不审大**。

工具:Graphite / git-spice / sapling。

---

## 六、自动化:从 commit 生成 changelog

工具链:[release-please](https://github.com/googleapis/release-please) / [semantic-release](https://github.com/semantic-release/semantic-release) / [standard-version](https://github.com/conventional-changelog/standard-version)。

它们做的事:

1. 解析 main 上自上次 release 以来所有 commit
2. 按 type 分组("Features" / "Bug Fixes" / "Performance")
3. 看是否有 `BREAKING CHANGE` → 决定 bump major / minor / patch
4. 生成 `CHANGELOG.md`
5. 打 tag、发 GitHub Release

**前提**:**所有 commit 严格遵守 Conventional Commits**——不然解析失败,生成的 changelog 残缺。

CI 集成示例(release-please):

```yaml
# .github/workflows/release.yml
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: node
```

> 设好之后,**你只管写规范 commit + 合 PR,版本号 / changelog / release 全自动**。这是 2026 现代 release 工作流的标准配置。

---

## 七、commitlint:强制 message 格式

不规范的 message 直接挡掉(详见 17 篇 hook):

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

`commitlint.config.js`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
  },
};
```

`.husky/commit-msg`:

```bash
npx commitlint --edit "$1"
```

之后 commit message 不规范 → 直接拒绝 commit。

---

## 八、PR review 文化

### 8.1 review 节奏

| 团队习惯 | 优 | 劣 |
| --- | --- | --- |
| 24 小时内必 review | 节奏快、不堆积 | 给 reviewer 压力大 |
| 每天固定 review 时间(如下班前 30 分) | 集中精力 | PR 等一整天 |
| review 即时(谁有空谁先看) | 快 | 优先级混乱 |

**多数团队推荐**:**24 小时内有第一反馈**(approve / 提问 / 改 request),最终合并 < 48 小时。

### 8.2 review 评论分级

业界惯例(部分团队明文写在 PR 模板里):

| 前缀 | 意思 |
| --- | --- |
| `nit:` | 小毛病,不必改也行(naming / 格式) |
| `suggestion:` | 建议,可改可不改 |
| `question:` | 问问题,不一定要改 |
| `blocking:` | 阻塞合并,必须改 |
| `praise:` | 好评,鼓励的话 |

写"`nit: 这里换个名字更好`" vs "`这里得改`" 给 PR 作者的心理压力差很多——**reviewer 的措辞决定团队心情**。

### 8.3 PR 作者的礼貌

- 自己先看一遍再请 review(自己看不下去的别人也看不下去)
- 描述写清楚(见前面)
- review 反馈尽量快回应(< 1 天)
- 大改之后**告诉 reviewer 改了哪里**,别让他们再读一遍 800 行
- 不同意 reviewer 时**有理有据辩论**,不是冷暴力

> 团队 PR 文化好不好,看一件事:**新人开第一个 PR 的时候,有没有人耐心 review、给建设性反馈**。这是工程师文化的入口。

---

## 九、commit 与 PR 的关系

GitHub squash merge 默认行为:**所有 commit 压成一个**,以 PR 标题为 message。

这件事的隐含意义:**PR 标题应该是 commit message 风格**——同样守 Conventional Commits 规则。

```
PR title: feat(auth): add SSO login via Okta    ← 同 commit subject 规则
```

squash 之后 main 历史就是一连串规范 commit——干净、易看、可自动化。

> 用 squash 的项目里,**精细的 feature 分支 commit 历史不进 main**——所以分支内 commit 可以随意 wip,反正最后压平。这降低开发心智负担,但**前提是 PR 标题写规范**。

---

## 十、踩坑提醒

1. **commit message 写 "update"**——半年后 git blame 翻出来一脸懵
2. **PR 没描述**——reviewer 自己读代码猜意图,review 慢且不准
3. **PR 1000+ 行**——没人认真看,事故后无人负责
4. **不用 Conventional Commits**——release-please 等工具白搭
5. **PR review 评论冷漠**——团队心情差,新人不敢提 PR
6. **squash merge 但 PR 标题随便写**——main 历史还是垃圾
7. **不写 body 只写 subject**——丢失"为什么"
8. **footer 用错**——`Closes #1234` 写成 `closes 1234`,GitHub 不自动关
9. **PR 改完不回应 reviewer**——reviewer 不知道改没改,悬着
10. **大 PR 拒绝拆**——一个个事故、合并慢、review 烂

---

下一篇:`21-大仓库性能与LFS.md`,讲大仓库的性能问题、partial clone / sparse checkout、Git LFS 大文件管理、和 monorepo 性能优化的工业实践。
