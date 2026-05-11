# 远程仓库与 push / pull / fetch

到这一篇之前的所有命令都是在**本地**操作 git。但 git 是分布式的——分布的关键就是 remote。这一篇讲清楚:remote 到底是什么、`fetch` / `pull` / `push` 各自精确干什么、为什么大多数人 `pull` 用错了、什么是 "remote-tracking branch"、`origin/main` 和 `main` 到底什么关系。

> 一句话先记住:**remote 是另一个 git 仓库的网络地址**。`fetch` = 把远程的对象拉下来但**不动你的工作分支**;`pull` = `fetch` + `merge`(或 rebase);`push` = 把本地对象推到远程。**`fetch` 永远安全,`pull` 永远会改你工作区**——这条记住能避开 80% 的"我 pull 完代码不见了"事故。

---

## 一、remote 是什么

```bash
git remote -v
# origin  git@github.com:user/repo.git (fetch)
# origin  git@github.com:user/repo.git (push)
```

`origin` 是一个**别名**,指向某个远程仓库的 URL(SSH 或 HTTPS)。clone 来的仓库默认有一个叫 `origin` 的 remote 指向你 clone 那个仓库。

remote 不是必须叫 `origin`——只是约定。一个本地仓库可以有**多个 remote**:

```bash
git remote add upstream git@github.com:original/repo.git
git remote -v
# origin   git@github.com:myfork/repo.git
# upstream git@github.com:original/repo.git
```

典型 fork 工作流:**`origin` 指你的 fork、`upstream` 指原仓库**——拉新内容从 upstream pull,推自己改动到 origin。

```bash
git remote add <name> <url>           # 加
git remote rename <old> <new>         # 改名
git remote remove <name>              # 删
git remote set-url <name> <new-url>   # 换地址(常用:HTTPS 换 SSH)
git remote show origin                # 详细信息(包括跟踪关系)
```

---

## 二、remote-tracking branches

clone 完之后看分支:

```bash
git branch -a
# * main
#   remotes/origin/main
#   remotes/origin/dev
#   remotes/origin/feature
```

`remotes/origin/main` 是**远程跟踪分支**(remote-tracking branch),它是**远程那个分支在本地的"镜像"**——存在 `.git/refs/remotes/origin/main`。

| 概念 | 是什么 |
| --- | --- |
| `main`(本地分支) | 你能 commit 到的、可改的本地工作分支 |
| `origin/main`(远程跟踪分支) | 远程 main 在你**最后一次 fetch 时**的快照,**只读** |
| 远程仓库的 main | 真正的远程,要联网才能查看 |

`origin/main` **不会自动更新**——只有你 `fetch` 时它才同步。这就是为什么有时 `git status` 说"和远程同步"但实际远程已经有新东西了——你没 fetch。

> `origin/main` 是 git 给你的"上次见到的远端样子"。**它不是远端实时状态**——是你本地缓存的远端镜像。明白这件事,后面 fetch / pull 的差别就一目了然。

---

## 三、`git fetch`:只拉,不合

```bash
git fetch                  # 拉默认 remote(origin)所有分支
git fetch origin           # 同上,显式
git fetch origin main      # 只拉 origin 的 main 分支
git fetch --all            # 拉所有 remote(多 remote 时)
git fetch --prune          # 同时清理本地已不存在于远端的 remote-tracking 分支
```

`fetch` 干的事:

1. 联网,从远程下载新 object(commit / tree / blob)到本地 `.git/objects/`
2. 更新 remote-tracking 分支(`origin/main` 等)指向最新

**不会**:

- 改你本地的工作分支(`main`)
- 改你的 staging / working dir
- merge 任何东西

所以 `fetch` 是**完全安全**的——拉来看看、对比下,什么都不会被它意外改。

```bash
git fetch
git log --oneline main..origin/main      # 远程比我多哪些 commit
git log --oneline origin/main..main      # 我比远程多哪些 commit
```

> "我应不应该 pull?"——先 fetch,再用上面两条看清楚再决定 merge 还是 rebase。**`fetch` + 检查 + 手工合,比直接 pull 可控**。

---

## 四、`git pull`:fetch + merge(或 rebase)

```bash
git pull                   # = fetch + merge(默认)
git pull --rebase          # = fetch + rebase(推荐设默认)
git pull --ff-only         # = fetch + 只能 fast-forward,否则报错
```

`pull` 是**把 fetch 和合并打包成一个动作**。这件事方便,也是**最常见的事故源**:

- 你的本地有未 commit 改动 → pull 可能产生奇怪 merge state
- 你的本地有 commit 没推 → pull --merge 产生 merge commit,污染历史
- 远程有 force push 过 → pull 可能把你 commit 摊到奇怪位置

**安全的 pull 习惯**:

```bash
git config --global pull.rebase true       # 设默认 rebase
git config --global pull.ff only           # 不 ff 就报错(更严格)
```

**金标准**:

```bash
# 拉之前确保工作区干净
git status              # 没有 unstaged 改动?有就先 stash 或 commit
git fetch               # 看清楚远程有什么
git log HEAD..origin/main --oneline  # 远端有几个新 commit
git pull --rebase       # 确认无误再合
```

> `git pull` 不是错,是**滥用 `git pull` 不看上下文**才是错。新人最稳的做法是直接禁用 `pull`,只用 `fetch + 手工 merge / rebase`——彻底掌控发生了什么。

---

## 五、`git push`

```bash
git push                          # 推当前分支到 upstream
git push origin main              # 显式推 main 到 origin
git push origin feature           # 推 feature 到 origin/feature
git push -u origin feature        # 第一次推,顺便设 upstream
git push --all origin             # 推所有分支(慎用)
git push --tags origin            # 推所有 tag(默认 push 不推 tag,见下)
git push origin --delete feature  # 删远程的 feature 分支
git push origin :feature          # 等价于上一行(老式语法)
```

`push` 的核心规则:**只能 fast-forward**——除非你 force。

```
远端: A → B → C
本地: A → B → C → D → E      → push:OK,远端变成 A→B→C→D→E

远端: A → B → C → F          ← 别人推过 F
本地: A → B → C → D → E      → push:报错,因为远端不是本地的祖先
```

报错时 git 提示你 "Updates were rejected because the remote contains work that you do not have locally"——意思是**先把远端的 F 拿下来再 push**:

```bash
git pull --rebase     # 拉 F 进来,把 D / E 重接到 F 后面
git push              # 现在能推了
```

---

## 六、`push --force` 与 `--force-with-lease`

08 篇讲过,但这里再强调:

```bash
git push --force                 # ❌ 无脑覆盖远端,任何远端新 commit 都被吃掉
git push --force-with-lease      # ✅ 只在"远端 = 我上次 fetch 时看到的"才覆盖
```

**典型 force push 场景**(都是合法的):

- rebase 完个人分支,要把整理后的 commit 推上去
- 改 commit message(amend)后推
- 删除某个误推的 commit

**永远禁止 force push 的地方**:

- main / develop / 任何团队共享分支
- 公开仓库的所有保护分支

GitHub / GitLab 都支持"分支保护规则"(branch protection),在 main 上禁掉 force push——**必装**。

---

## 七、tag 不随 push 走

默认 `git push` **不推 tag**。要推 tag:

```bash
git push origin v1.2.3            # 推单个 tag
git push origin --tags            # 推所有本地 tag
git push origin --follow-tags     # 只推那些"指向已 push commit 的 annotated tag"
```

**推荐设默认**:

```bash
git config --global push.followTags true
```

之后 `git push` 自动推那些"安全"的 tag(指向已 push 的 commit 的 annotated tag),不会推没用的临时 tag。

详见 10 篇。

---

## 八、`git fetch --prune`:剪掉远端已不存在的分支

```bash
git branch -r
# origin/main
# origin/feature-x       ← 远端早就删了,本地 remote-tracking 还在
# origin/old-branch      ← 同上
```

久了之后 `branch -r` 出来一堆"鬼分支"。

```bash
git fetch --prune        # 一次清掉所有"远端已删"的 remote-tracking
```

**永久生效**:

```bash
git config --global fetch.prune true
```

之后每次 fetch 自动 prune。**强烈建议设上**——保持 `branch -r` 干净。

---

## 九、`git remote update` 和 `git remote prune`

```bash
git remote update            # 等价于 git fetch --all
git remote prune origin      # 单独 prune 某个 remote(不 fetch)
git remote show origin       # 看 origin 详细状态(分支跟踪、push/fetch 配置)
```

`remote show` 输出:

```
* remote origin
  Fetch URL: git@github.com:user/repo.git
  Push  URL: git@github.com:user/repo.git
  HEAD branch: main
  Remote branches:
    main          tracked
    feature       tracked
    stale-branch  stale (use 'git remote prune' to remove)
  Local branches configured for 'git pull':
    main    merges with remote main
  Local refs configured for 'git push':
    main    pushes to main    (up to date)
```

**最实用的"我和远程到底什么关系"全息图**——出协作问题先跑这条。

---

## 十、shallow clone 与 partial clone

仓库太大时:

```bash
git clone --depth=1 <url>           # shallow:只下最近 1 个 commit 的历史
git clone --depth=50 <url>          # 最近 50 个
git clone --filter=blob:none <url>  # partial:不下载 blob,用到再拉(2.19+)
git clone --single-branch <url>     # 只克隆默认分支
```

**典型场景**:

- CI 跑测试,只需要最新代码 → `--depth=1`
- monorepo 太大,本地只想看部分 → `--filter=blob:none --sparse`

shallow clone 限制:

- 不能 push(2.5 之前)/ 不便 push(2.5+ 限制少了但仍有边界条件)
- 不能 fetch 超出 depth 的历史(可以 `git fetch --unshallow` 转回完整)

详见 21 篇。

---

## 十一、HTTPS vs SSH 切换

clone 完发现 URL 不对(HTTPS 想换成 SSH):

```bash
git remote set-url origin git@github.com:user/repo.git
```

**全局策略**(所有 GitHub HTTPS 自动改 SSH):

```ini
# ~/.gitconfig
[url "git@github.com:"]
    insteadOf = https://github.com/
```

之后**任何** `git clone https://github.com/...` 都自动转 SSH。

> 02 篇讲了 SSH key 配置。配置好了之后**所有 GitHub 操作都不再输密码**——比 HTTPS 用 token 优雅。

---

## 十二、远程操作的精确语义

```bash
git push origin local-branch:remote-branch   # 把本地 local-branch 推到远端 remote-branch
git push origin HEAD                          # 推当前分支到同名远端分支
git push origin HEAD:main                     # 把当前分支推到远端 main(不管你本地叫啥)
git push origin :remote-branch                # 删远端 remote-branch(空冒号语法)
```

`<src>:<dst>` 是 git 的"refspec"语法——一边写本地名、一边写远端名。**90% 时间用不到**,知道有这语法就行。

---

## 十三、踩坑提醒

1. **`git pull` 不看 status**——本地有改动也能 pull,出 merge state 弄不清楚
2. **`pull` 默认 merge 不开 rebase**——历史里全是 "Merge branch 'main' of github.com/..." 噪声
3. **`push --force` 共享分支**——覆盖队友的 commit,需要 reflog 救
4. **不开 `fetch.prune`**——本地 `branch -r` 一堆鬼分支
5. **设了 upstream 错的分支**——`git push` 推到错的远端,改用 `git push -u origin 正确分支`
6. **多 remote 不分清**——push / pull 混用 origin 和 upstream,搞乱 fork 同步
7. **shallow clone 之后想看老历史**——要 `git fetch --unshallow` 转完整
8. **HTTP 没配 credential helper**——每次 push 输 token

---

下一篇:`10-tag与版本发布.md`,讲 lightweight tag vs annotated tag、semantic versioning、tag 怎么 push、release 工作流。
