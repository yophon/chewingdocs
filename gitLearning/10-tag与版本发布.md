# tag 与版本发布

tag 是 git 里**用得最少但价值最高**的 ref——一个项目可能有几百个 commit、十几个分支,但 tag 通常只有几十个,每个对应一次发布。理解 tag 的人能用一行命令打一个 release;不懂的人会去 GitHub 网页点 "Draft a new release" 然后手填一堆字段。这一篇讲 tag 的两种类型、semantic versioning、和发布工作流。

> 一句话先记住:**tag 是不可变的"指向某 commit 的有名字引用"**。和分支的差别就一个字——**分支会动,tag 不会**。打了 `v1.0.0` 之后,这个名字永远指向当时那个 commit,即使后续 main 跑了 100 个 commit。**tag 是 git 给"版本"的稳定锚**。

---

## 一、两种 tag

### 1.1 Lightweight tag(轻量)

```bash
git tag v1.0.0
git tag v1.0.0 a3f5b2c    # 在指定 commit 上打 tag
```

本质:`.git/refs/tags/v1.0.0` 里写一个 commit hash。**就这一行**。

特点:

- 没有作者、时间、message
- 不能签名
- 适合**临时 / 内部标记**

### 1.2 Annotated tag(注解)

```bash
git tag -a v1.0.0 -m "Release v1.0.0: initial public release"
git tag -a v1.0.0 a3f5b2c -m "..."   # 显式 commit
```

本质:**一个独立的 git 对象**(像 commit 一样有自己的 hash),包含:

- 标记的 commit
- 创建者(name + email)
- 时间
- message
- 可选 GPG 签名

特点:

- 完整的元数据
- 可签名(`git tag -s`)
- **正式发布必用**

| 比较 | Lightweight | Annotated |
| --- | --- | --- |
| 可签名 | ❌ | ✅ |
| 有 message | ❌ | ✅ |
| `git show <tag>` 显示 | 直接是 commit | tag 信息 + commit |
| 推荐场景 | 个人临时标 | **所有正式发布** |

> **正式发布永远用 annotated**——`git tag -a v1.0.0 -m "..."`。lightweight 留给临时标记或本地调试。这条是工程纪律,不是个人偏好。

---

## 二、tag 的基本操作

```bash
# 列出所有 tag
git tag                     # 所有
git tag -l "v1.*"           # glob 过滤
git tag --sort=-creatordate # 按创建时间倒序

# 看某个 tag
git show v1.0.0             # tag 信息(annotated 显示 message + commit)
git show v1.0.0 --stat      # 只看每文件改了多少行

# 删 tag
git tag -d v1.0.0           # 删本地
git push origin --delete v1.0.0   # 删远程

# 移动 tag(慎用)
git tag -f v1.0.0 a3f5b2c   # 强制改 tag 指向(会改对象 hash)
git push origin v1.0.0 --force    # 推到远程
```

**tag 和 push 的关系**(09 篇讲过):**默认 `git push` 不推 tag**——

```bash
git push origin v1.0.0       # 推单个 tag
git push origin --tags       # 推所有 tag
git push --follow-tags       # 推已 push commit 上的 annotated tag(推荐)
```

设默认:

```bash
git config --global push.followTags true
```

---

## 三、Semantic Versioning(SemVer)

工业界事实标准的版本号规则,**v 主版本.次版本.修订**:

```
v1.0.0
 │ │ └─ PATCH:bug fix(向后兼容)
 │ └─── MINOR:新功能(向后兼容)
 └───── MAJOR:破坏性改动(不向后兼容)
```

什么时候哪个加 1:

| 改了 | 升级 |
| --- | --- |
| 修了一个 bug,行为没变 | PATCH(`v1.0.0` → `v1.0.1`) |
| 加了一个新功能,旧 API 仍能用 | MINOR(`v1.0.0` → `v1.1.0`) |
| 删了/改了 API,旧 client 会挂 | MAJOR(`v1.0.0` → `v2.0.0`) |

**预发布版本**:

```
v1.0.0-alpha.1
v1.0.0-beta.2
v1.0.0-rc.1       ← release candidate
```

预发布版**优先级低于正式版**——`v1.0.0-rc.1 < v1.0.0`。

> SemVer 不是"建议",是 npm / Cargo / Go modules 等所有现代包管理器的硬规则。**乱打版本号会让用户的依赖解析炸**——你以为只是 `v1.0.1` 修个 typo,实际上你改了 API,用户升级后炸,他们告 PR 给你。

---

## 四、`v` 前缀的争议

历史上 `v1.2.3` 比 `1.2.3` 更常见,但**不是强制**。

| 派 | 理由 |
| --- | --- |
| 带 `v`(主流) | 一眼看出是版本号,不和数字混 |
| 不带 `v`(npm 系) | 直接和 package.json 的 `version` 字段对得上,不用做转换 |

**npm 包的标准是不带 v**(因为 `package.json` 里 version 字段不带);**其他生态(Go modules、git 通用习惯)带 v**。**项目内部统一就行**,但选定后不要换。

---

## 五、tag 的发布工作流

最简流程:

```bash
# 1. 确认要打 tag 的 commit(通常是 main 最新)
git switch main
git pull
git log -1

# 2. 打 annotated tag
git tag -a v1.2.0 -m "Release v1.2.0

- feat: SSO login
- fix: upload timeout
- chore: bump deps"

# 3. 推 tag 到远程
git push origin v1.2.0
```

**带 GitHub Release**(自动化版):

```bash
# 装 gh CLI
gh release create v1.2.0 \
  --title "v1.2.0" \
  --notes "Release notes here..." \
  --target main \
  ./dist/binary.tar.gz   # 顺便上传产物
```

**自动化 changelog**(从 commit 提取):

```bash
# 上一个 tag 之后所有 commit
git log v1.1.0..HEAD --oneline

# 按 conventional commits 自动生成 changelog(用 release-please / standard-version 等工具)
npx standard-version
```

> Conventional Commits + 工具自动生成 changelog 是现代发布工作流的标配。**手写 changelog 是浪费**——只要 commit message 写规范了,changelog 自动出。详见 20 篇。

---

## 六、签名 tag(GPG)

正式发布**强烈建议签名**(详见 22 篇):

```bash
# 配 GPG key 之后
git tag -s v1.0.0 -m "Release v1.0.0"

# 验证别人的签名 tag
git tag -v v1.0.0
```

签名后:

- GitHub 在 Release 页显示 "Verified" 标
- 用户能验证 tag 真是你打的、内容没被篡改
- 供应链安全的核心一环

> 大型开源项目(Linux 内核、Tailscale、Kubernetes)的 tag 全部 GPG 签名。**个人小项目不强求,但企业 / 公开发布必装**——一旦 release 被恶意替换,签名是唯一兜底。

---

## 七、tag 不会动:这件事的好处

```
v1.0.0  → commit a3f5b2c
v1.1.0  → commit d8e9f0a
v1.2.0  → commit 4f5a6b7
```

打了之后:

- 用户 `git checkout v1.0.0` 永远看到当时的代码
- 三年后回来 review v1.0.0 还是同一份
- 包管理器解析 "1.0.0" 永远拿到同一份

这件事的反面:**别 force-push 改 tag**。除非真的打错了:

```bash
# 改 tag 指向(确定要改的话)
git tag -f v1.0.0 <new-commit>
git push origin v1.0.0 --force
```

但凡 v1.0.0 已经被人下载、被 CI 用过、被生产部署引用过,**改 tag 等于改一段已经在外面跑的版本**——这是**供应链投毒级别的危险动作**。

> 业界惯例:**打错的 tag 不改,新打一个**。`v1.0.0` 错了就 `v1.0.1` 修,把 `v1.0.0` 标记 deprecated 但不动它。

---

## 八、tag 和分支的关系

打 tag 不影响任何分支:

```
A → B → C        ← main(HEAD)
        ↑
       v1.0.0
```

后续 main 继续跑:

```
A → B → C → D → E    ← main
        ↑
       v1.0.0
```

`v1.0.0` 还是指 C。如果要在 v1.0.0 之上做 hotfix(详见 19 篇):

```bash
git switch -c hotfix/1.0.x v1.0.0    # 从 v1.0.0 拉一个 hotfix 分支
# 改代码 ...
git tag -a v1.0.1 -m "..."           # 打新 tag
git push origin v1.0.1
```

**这是 release 分支模型的核心动作**——基于老 tag 做 hotfix,打补丁版本号。

---

## 九、tag 命名约定

| 模式 | 用途 |
| --- | --- |
| `v1.2.3` | 标准 SemVer release |
| `v1.2.3-alpha.1` | alpha 预发布 |
| `v1.2.3-rc.1` | release candidate |
| `2026-05-08` | 日期型(date-based,内部部署常见) |
| `v1.2.3+build.123` | 带 build metadata(SemVer 允许) |
| `release/2026-Q2` | 季度发布 |

**禁忌**:

- 别用空格 / 特殊字符
- 别用 `master` / `head` / `dev` 这些保留词
- 别 tag 和分支同名(`git checkout x` 时 git 不知道你要哪个)

---

## 十、常见 release 自动化模式

**简易版**(手工):

```bash
# 写好代码,合 PR 进 main 之后:
git switch main && git pull
git tag -a v1.2.3 -m "..."
git push --follow-tags
```

**自动化**(GitHub Actions):

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*
          generate_release_notes: true
```

push 一个 `v*` tag 自动跑 build + 上传 + 发 Release。

**全自动化**(release-please / semantic-release):

- 看 conventional commits,自动决定下一个版本号
- 自动生成 changelog
- 自动打 tag、发 Release、推 npm
- 你只负责 commit message 写对

---

## 十一、踩坑提醒

1. **打 lightweight tag 当正式 release**——没作者、没时间、没 message,半年后看 tag 像孤魂野鬼
2. **`git push` 不带 tag**——本地打了 tag 没推,别人看不到
3. **改已发布的 tag**——供应链事故,绝对禁忌(打错就新打一个)
4. **版本号乱跳**(直接从 v1.0.0 → v3.0.0)——破坏 SemVer 期望,用户工具炸
5. **MAJOR 改了没通知**——破坏性变动埋伏,用户升级后挂
6. **tag 名字带特殊字符**——`v 1.0.0`(带空格)、`V1.0.0`(大写)、`1.0.0`(无 v 不一致)
7. **tag 和分支同名**——`git checkout x` 不知道选哪个
8. **不签名**——发布被替换,无法验证

---

下一篇:`11-stash暂存.md`,讲 stash 的工作机制、`stash push` / `pop` / `apply` 差别、`stash -p` 精细暂存、什么时候不该用 stash。
