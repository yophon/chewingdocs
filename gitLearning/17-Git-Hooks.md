# Git Hooks

git hook 是 git 在某些事件发生时自动跑的脚本——commit 之前、push 之前、merge 之后等等。**hook 是 git 自动化的核心**——团队规则不靠"大家记得手动跑测试"维持,靠 hook 自动卡住。这一篇讲 git 的几个生命周期 hook、客户端 vs 服务端的差别、husky / lefthook / pre-commit 等主流工具,和一些常见的 hook 设计反模式。

> 一句话先记住:**hook 就是 `.git/hooks/` 目录下的可执行脚本**——名字必须是规定好的几个,git 在对应事件时自动跑;非零退出码就阻止操作继续。**hook 是确定性的**,跟 LLM / memory / 提醒不一样,**配置好就一定跑**。

---

## 一、最基础:第一个 hook

```bash
ls .git/hooks/
# applypatch-msg.sample
# commit-msg.sample
# post-update.sample
# pre-applypatch.sample
# pre-commit.sample
# pre-push.sample
# pre-rebase.sample
# pre-receive.sample
# prepare-commit-msg.sample
# update.sample
```

每个 `.sample` 是 git 给的样例。**改名去掉 `.sample` 就生效**:

```bash
cp .git/hooks/pre-commit.sample .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
# 编辑 .git/hooks/pre-commit
```

最简的 pre-commit:

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit

echo "Running tests before commit..."
npm test || exit 1
```

之后每次 `git commit` 都会先跑测试,失败就阻止 commit。

> hook 必须**可执行**(`chmod +x`),否则 git 静默忽略——这是头号坑。

---

## 二、客户端 hooks(每个开发者本地)

| hook | 时机 | 典型用途 | 阻止? |
| --- | --- | --- | --- |
| `pre-commit` | commit 前 | lint、format、跑测试、扫密钥 | ✅ |
| `prepare-commit-msg` | commit message 编辑器打开前 | 自动填模板、加 issue 号 | ❌ |
| `commit-msg` | message 写完后 | 校验 message 格式 | ✅ |
| `post-commit` | commit 完成后 | 通知、统计 | ❌ |
| `pre-rebase` | rebase 前 | 防止 rebase 共享分支 | ✅ |
| `post-checkout` | checkout 后 | 装依赖(`npm install`)、编辑器同步 | ❌ |
| `post-merge` | merge 后 | 同上 | ❌ |
| `pre-push` | push 前 | 跑 e2e 测试、检查分支命名 | ✅ |

**最常用的两个:`pre-commit` 和 `pre-push`**。

---

## 三、`pre-commit`:挡掉低级错误

典型 pre-commit 脚本:

```bash
#!/usr/bin/env bash
# 拿到所有 staged 文件
files=$(git diff --cached --name-only --diff-filter=ACM)

# 1. 跑 lint(只对 staged 文件)
echo "$files" | grep '\.ts$' | xargs eslint || exit 1

# 2. 跑 format
echo "$files" | grep '\.ts$' | xargs prettier --check || exit 1

# 3. 扫密钥
if echo "$files" | xargs grep -E "(API_KEY|SECRET|PASSWORD)" --include="*.ts"; then
  echo "Possible secrets in staged files"
  exit 1
fi

# 4. 跑测试
npm test || exit 1
```

**典型保障**:

- 不让坏代码 commit
- 不让密钥进仓库
- 不让格式不一致的文件混入

> pre-commit **必须快**——commit 应该是几秒级动作,卡 30 秒每次大家就开始 `--no-verify` 跳过。**重的检查放 pre-push 或 CI**,pre-commit 只放秒级的。

---

## 四、`commit-msg`:校验 message 格式

强制 Conventional Commits 格式:

```bash
#!/usr/bin/env bash
# .git/hooks/commit-msg
# $1 是 commit message 文件路径

regex='^(feat|fix|docs|style|refactor|perf|test|chore|revert)(\(.+\))?: .{1,72}'

if ! grep -qE "$regex" "$1"; then
  echo "Commit message must match Conventional Commits"
  echo "Example: feat(auth): add SSO login"
  exit 1
fi
```

之后写"update some stuff"会被打回去,逼着写规范 message。

---

## 五、`pre-push`:最后的防线

push 是出去给别人看的,**这里跑慢一点的检查值得**:

```bash
#!/usr/bin/env bash
# .git/hooks/pre-push

protected_branch="main"
current_branch=$(git symbolic-ref HEAD | sed 's|refs/heads/||')

# 1. 禁止直接 push main
if [ "$current_branch" = "$protected_branch" ]; then
  echo "Direct push to $protected_branch is forbidden — use a PR"
  exit 1
fi

# 2. 跑 e2e 测试
npm run test:e2e || exit 1

# 3. 跑 type check
tsc --noEmit || exit 1
```

> 服务端的"禁止 push main"靠 GitHub branch protection 才是硬保障(详见 19 / 20 篇);客户端 pre-push 是**第一道软提醒**——能挡住一些手滑。

---

## 六、客户端 hook 的根本问题:**不进 git**

**`.git/hooks/` 不在 git 跟踪范围内**——你写好的 hook,队友不会自动有。这就是为什么团队需要**hook 管理工具**——它们的核心功能就是"把 hook 配置进 git、自动同步到队友"。

主流工具:

| 工具 | 语言 | 特点 |
| --- | --- | --- |
| [husky](https://typicode.github.io/husky/) | JS | npm 生态最流行 |
| [lefthook](https://github.com/evilmartians/lefthook) | Go(yaml 配) | 多语言、并行、快 |
| [pre-commit](https://pre-commit.com/) | Python | 多语言、生态丰富、CI 友好 |
| [overcommit](https://github.com/sds/overcommit) | Ruby | Ruby 系常用 |

---

## 七、husky + lint-staged 实战(JS 生态)

最普及的组合:

```bash
npm install -D husky lint-staged
npx husky init
```

`husky init` 自动:

- 创建 `.husky/` 目录(进 git!)
- 配 git 用 `.husky/` 而不是 `.git/hooks/`(`core.hooksPath`)

`.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

`package.json`:

```json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{md,json}": ["prettier --write"]
  }
}
```

**lint-staged 的好处**:**只对 staged 文件跑**——不会因为某 legacy 文件不合规阻止你 commit 一个完全没碰那文件的改动。

> 现代 JS 项目几乎都用这套。**新项目 `npx husky init` 是 day-1 动作**——比上线后再补 hook 强 100 倍。

---

## 八、跳过 hook:`--no-verify`

每个 hook 都能用 `--no-verify` 跳过:

```bash
git commit --no-verify -m "WIP"
git push --no-verify
```

**滥用警告**:`--no-verify` 是给紧急情况留的逃生口。**习惯性 `--no-verify` 等于没 hook**——团队规则名存实亡。

防护策略:

1. 让 hook **够快**(秒级)——不快就不会有人想跳
2. 让 hook **报错信息清楚**——大家知道哪儿不合规,愿意修而不是绕
3. **服务端 hook 兜底**——客户端跳了,服务端拒收

---

## 九、服务端 hooks(GitHub / GitLab / Gitea)

服务端 hook 跑在 git server 上,客户端**没法跳过**——是真正的硬保障。

| hook | 时机 | 用途 |
| --- | --- | --- |
| `pre-receive` | push 到达 server,处理前 | 校验 commit 格式、签名、文件变动 |
| `update` | 同上,但每个 ref 单独跑 | 同上,更细粒度 |
| `post-receive` | 接收完成后 | 触发 CI、通知 |

但**自托管 git server**(自己搭 gitea / gogs / 裸 git)才能写这些 hook。**用 GitHub / GitLab / Bitbucket 的话,服务端 hook 是它们内置的功能**——叫"分支保护规则"和"webhook"。

### 9.1 GitHub Branch Protection

仓库 Settings → Branches → Branch protection rules:

- 要求 PR 才能合并(禁直接 push)
- 要求 CI 通过
- 要求 N 个人 review approval
- 禁止 force push
- 禁止删除分支
- 强制签名 commit
- 强制 message 格式(部分高级版)

**这是真正能保住 main 分支的硬墙**——客户端 hook 都是辅助。

### 9.2 GitHub Actions / GitLab CI

CI 是最强大的"服务端 hook"——push / PR 触发任意逻辑:

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - run: npm run lint
```

**CI 是 hook 的终极形态**——既能挡 PR(check 失败拒合)、又能并行跑、又能跨 OS / 跨 Node 版本。

---

## 十、几种 hook 的常见反模式

### 10.1 hook 太慢

pre-commit 跑 5 分钟测试 → 大家全 `--no-verify` → 没人遵守 → hook 等于不存在。

**对策**:pre-commit 只跑秒级(format / lint / 几个单测),完整测试放 pre-push 或 CI。

### 10.2 hook 太严格阻止合理操作

commit-msg 不让没 issue 号 → 但 chore commit 没 issue 号是合理的 → 反复手动绕。

**对策**:hook 应该**鼓励默认正确做法**,而不是**强制每次都正确**。规则要给例外的口。

### 10.3 client hook 当唯一防线

hook 在客户端,谁都能跳。把它当**唯一**防线 = 假的防线。

**对策**:客户端 hook + 服务端 branch protection / CI 双保险——前者快速反馈,后者真正卡住。

### 10.4 hook 不进 git

写在 `.git/hooks/` 没人能用 = hook 不存在。

**对策**:用 husky / lefthook / pre-commit 把 hook 配置进 git。

---

## 十一、几个值得装的 hook 工具

### 11.1 commitlint

校验 commit message 是 Conventional Commits:

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
echo "module.exports = { extends: ['@commitlint/config-conventional'] };" > commitlint.config.js
```

`.husky/commit-msg`:

```bash
npx commitlint --edit "$1"
```

### 11.2 gitleaks

扫密钥:

```bash
brew install gitleaks
```

加进 pre-commit:

```bash
gitleaks protect --staged
```

之后任何 staged 文件含 API key / token / private key 都被挡。**密钥泄漏是头号事故,gitleaks 防 80%**。

### 11.3 conventional-changelog

根据 commit message 自动生成 CHANGELOG。详见 20 篇。

---

## 十二、踩坑提醒

1. **hook 没 `chmod +x`**——git 静默不跑,debug 半小时
2. **hook 太慢**——大家 `--no-verify` 跳过,等于没 hook
3. **hook 写死路径**——队友机器路径不一样,跑不起来
4. **hook 没考虑 Windows**——`#!/usr/bin/env bash` 在 Windows Git Bash 能跑,但 PowerShell 不行
5. **客户端 hook 当唯一防线**——能跳,不靠谱;必须服务端兜底
6. **commit-msg 太严**——chore / merge commit 都过不了,反弹
7. **hook 修改文件不重新 add**——pre-commit 跑了 prettier 改了文件,但 staging 还是旧的;**lint-staged 自动处理这件事**
8. **hook 进 .git/hooks 而不是 husky 目录**——队友没有,等于个人 hook

---

下一篇:`18-Worktree与bisect.md`,讲 worktree 的"一个仓库多个工作区"机制、bisect 的二分查找 regression、两个高级但救命的工具。
