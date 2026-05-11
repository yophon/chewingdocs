# log 与历史查看

`git log` 默认输出很丑、信息密度极低,所以**90% 的人只用 `git log` 看个最近 commit message,然后开 GitHub 网页看更精细的**。这件事亏大了——`git log` 可能是 git 里**参数最丰富的命令**,搞熟之后,90% 的"我想知道历史"问题不用打开浏览器。这一篇讲清楚 `log` / `show` / `diff` / `blame` 这四件套**真正能干什么**。

> 一句话先记住:**`git log` 是查询 commit 图的 SQL,`git show` 看一个 commit、`git diff` 看任意两点之间、`git blame` 看每行最后被谁改的**。会用这四件,你就不需要 GitHub 网页 UI 了。

---

## 一、`git log` 默认输出的问题

```
commit a3f5b2c4d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3
Author: Qiji Xin <qiji@example.com>
Date:   Tue May 5 14:23:45 2026 +0800

    fix: handle null in upload handler

commit ...
```

**信息密度问题**:一个 commit 占 5 行,屏幕只能看 4 个。每个 commit 90% 都是 hash + 邮箱重复,真正的信息(message)就一行。

把它改成单行:

```bash
git log --oneline
# a3f5b2c fix: handle null in upload handler
# d8e9f0a feat(auth): add SSO login
# ...
```

一屏立刻能看 30 个。**搭配几个常用 flag** 信息密度还能再翻倍。

---

## 二、log 必学的几组参数

### 2.1 显示分支拓扑(找分叉点)

```bash
git log --oneline --graph --all --decorate
# 简写:git log --oneline --graph --all
```

输出:

```
* a3f5b2c (HEAD -> main, origin/main) fix: handle null
* d8e9f0a feat(auth): add SSO login
* | b1c2d3e (feature/x) wip on x
| * 4f5a6b7 hotfix on main
|/
* 8c9d0e1 chore: bump deps
```

`--graph` 画出分支拓扑、`--decorate` 标注分支名 / tag、`--all` 显示所有分支(不只当前)。**alias 成 `git lg` 之后日常用 100 次**。

### 2.2 按作者 / 时间过滤

```bash
git log --author="Qiji"             # 谁写的
git log --author="Qiji|Wang"        # 多人(正则)
git log --since="2 weeks ago"       # 时间相对
git log --since="2026-04-01" --until="2026-04-30"   # 绝对范围
git log --grep="bug"                # message 含关键字
git log --grep="bug" -i             # 不区分大小写
```

### 2.3 按内容过滤(最强大、最少人用)

```bash
git log -S "deprecatedAPI"          # 找出"添加或删除"了 deprecatedAPI 的 commit
git log -G "regex.*pattern"         # 找出 diff 里匹配正则的 commit
git log -p -- src/auth.ts           # 看某个文件的所有改动 + diff
git log --follow -p -- src/auth.ts  # 文件改过名也能追到祖先
```

> `git log -S` 是**追代码祖先的杀手锏**。"这个怪函数是谁加的、什么时候加的、为什么加的?" → `git log -S "怪函数名"` 一秒定位。

### 2.4 按文件 / 路径

```bash
git log -- src/                  # 只看 src/ 下的 commit
git log -- src/a.ts              # 只看 a.ts 的 commit
git log --stat -- src/a.ts       # 加上每次改了多少行
git log --follow -- src/a.ts     # 追到改名前的历史
```

`--` 之前是 git 选项,之后是路径。**这个分隔符很重要**——避免 git 把文件名当成分支名解析。

### 2.5 限制数量与跳过

```bash
git log -5                       # 最近 5 个
git log -5 --skip=10             # 跳过最近 10 个,再取 5 个
git log @{u}..HEAD               # 我本地比远程多几个 commit(还没 push 的)
git log HEAD..@{u}               # 远程比我多几个(还没 pull 的)
git log main..feature            # feature 比 main 多哪些 commit
```

`A..B` 是 git 的 commit 范围语法——**B 上面但 A 上没有的 commit**。日常用得最多的两个:

| 范围 | 含义 |
| --- | --- |
| `@{u}..HEAD` | 我本地领先远程的(待 push) |
| `HEAD..@{u}` | 远程领先我的(待 pull) |

> `@{u}` 是 "upstream" 缩写,指当前分支的远程对应分支。**这两条命令是协作时的"我和远程谁更先"一秒答案**。

---

## 三、最实用的 log 自定义格式

```bash
git log --pretty=format:"%h %ad | %s%d [%an]" --date=short
# a3f5b2c 2026-05-05 | fix: handle null (HEAD -> main) [Qiji Xin]
# d8e9f0a 2026-05-04 | feat(auth): add SSO       [Qiji Xin]
```

`--pretty=format:` 占位符:

| 占位 | 意思 |
| --- | --- |
| `%h` | 短 hash |
| `%H` | 长 hash |
| `%an` | 作者名 |
| `%ae` | 作者邮箱 |
| `%ad` | 作者时间 |
| `%ar` | 作者时间(相对,如"2 hours ago") |
| `%s` | subject |
| `%b` | body |
| `%d` | 引用(分支名 / tag) |
| `%C(red)`、`%C(reset)` | 颜色 |

设成 alias:

```ini
[alias]
    lg = log --pretty=format:"%C(yellow)%h%C(reset) %C(blue)%ad%C(reset) | %s%C(red)%d%C(reset) [%C(green)%an%C(reset)]" --date=short --graph --all
```

---

## 四、`git show`:看某一个 commit

```bash
git show                  # 最后一次 commit
git show HEAD~3           # HEAD 往前 3 个
git show a3f5b2c          # 任何 commit hash
git show HEAD --stat      # 只看哪些文件改了多少行
git show HEAD:src/a.ts    # 看那次 commit 时 a.ts 的内容(不是 diff,是文件)
git show v1.2.3           # 看某个 tag(annotated tag 显示作者+message,light tag 直接 show commit)
```

> `git show HEAD:path/to/file` 是**调试历史版本最快的方式**——比 checkout 整个 commit 看一眼再切回来快 10 倍。

---

## 五、`git diff` 的对比模型

`git diff` 不是只比 working vs staging。它能比**任意两点**:

```bash
git diff                       # working vs staging
git diff --cached              # staging vs HEAD
git diff HEAD                  # working vs HEAD(所有未提交改动)
git diff a3f5b2c d8e9f0a       # 任意两个 commit
git diff main..feature         # 两条分支
git diff main...feature        # 三个点!从 fork point 到 feature(只看 feature 的独立改动)
git diff main feature -- src/  # 只看 src/ 下的差异
git diff --stat main feature   # 只看每文件改了多少行
git diff --name-only main feature  # 只列文件名
```

**`..` vs `...` 的差别**(这是 git 最容易踩的混淆):

```
       *   ← 我们要比什么?
      / 
     A     ← fork point
    / \
   B   C  
   |   |
  main feature

git diff A..B    →  从 A 到 B 的所有 diff(简单的两点比)
git diff A...B   →  从 fork point 到 B(只看 feature 自己加的)
```

99% 时间你比"feature 分支单独加了什么"用三个点 `main...feature`——只看 feature 自己的改动,不会受到 main 上 review 期间新增 commit 的干扰。

---

## 六、`git blame`:追每行最后改自谁

```bash
git blame src/a.ts
# a3f5b2c (Qiji Xin    2026-05-05 14:23:45)  function foo() {
# d8e9f0a (Wang        2026-04-12 09:11:00)    return null;
# ...
```

每行前面是:**最后改这行的 commit hash + 作者 + 时间**。

加点 flag:

```bash
git blame -L 10,30 src/a.ts        # 只看 10-30 行
git blame -w src/a.ts              # 忽略空格变化(避免格式化提交污染 blame)
git blame -C src/a.ts              # 检测代码从别处复制过来,blame 到原始来源
git blame -CC src/a.ts             # 跨文件检测
git blame --reverse a3f5b2c..HEAD src/a.ts   # 从老到新追这行什么时候被改
```

> blame 的灵魂用法:**找到一行可疑代码** → `git blame -L 行号,行号 file` → 拿到 commit hash → `git show <hash>` 看当时 commit message 和上下文。**90% 的"这是干嘛的代码"问题用这个套路十秒解决**。

---

## 七、`git reflog`:HEAD 移动史

`reflog` 不是 commit 历史,是**你本地这个分支指针的所有移动记录**。详见 14 篇,这里只演示:

```bash
git reflog
# a3f5b2c HEAD@{0}: commit: fix: handle null
# d8e9f0a HEAD@{1}: rebase finished: returning to refs/heads/main
# 4f5a6b7 HEAD@{2}: rebase: onto main
# 8c9d0e1 HEAD@{3}: checkout: moving from main to feature
```

每条都是一次 HEAD 移动。**reflog 默认保留 90 天**,意味着这 90 天里你做的任何"看起来丢东西"的操作都能找回:

- 不小心 `reset --hard` 了:reflog 找到之前的 hash,`git reset --hard <hash>`
- 不小心删分支:reflog 找到那分支最后指的 hash,`git checkout -b 救回来 <hash>`

> reflog 是 git 里最像"时光机"的功能。**学会 reflog 之后你就敢动 git 了**——出事前的状态永远还在。

---

## 八、`git shortlog`:统计向

```bash
git shortlog -sn                       # 每人提交数量,排序
git shortlog -sn --since="1 month ago" # 这个月每人多少 commit
git shortlog --no-merges -sn -e        # 带 email、不算 merge commit
```

输出:

```
   42  Qiji Xin
   18  Wang
   12  Li
```

> 写"这个月谁干了什么"周报时一秒生成。

---

## 九、几个少人知但好用的

### 9.1 `git log --merges` / `--no-merges`

```bash
git log --merges        # 只看 merge commit
git log --no-merges     # 不看 merge commit,只看普通提交(干净)
```

### 9.2 `git log --first-parent`

只跟随 merge commit 的第一个 parent(主线),适合 trunk-based 工作流的"主线 log"。

### 9.3 `git log --left-right A...B`

```bash
git log --left-right --oneline main...feature
# < a3f5b2c (在 main 上)
# > d8e9f0a (在 feature 上)
```

`<` 标 main 独有的、`>` 标 feature 独有的——**review PR 时一眼看出双方各跑了什么**。

### 9.4 `git log --graph --simplify-by-decoration`

只显示有分支 / tag 装饰的 commit,**画"分支拓扑骨架"用**。仓库大了之后比 `--all` 清爽得多。

---

## 十、踩坑提醒

1. **看 log 只敢用 GitHub 网页**——`git log --oneline --graph --all` + `git lg` alias 之后再也不开浏览器
2. **不会 `git log -S`**——找代码祖先永远手翻 GitHub blame 一层层点
3. **`..` 和 `...` 不分**——比 PR diff 误用两个点会包含 main 上的"非自己改动"
4. **`git blame` 看到一行就骂作者**——多数情况"骂错人"——可能只是格式化或 rename 顺带改了那行;用 `-w -C` 能消除这层噪声
5. **不知道 reflog**——出 git 事故第一反应是删仓库重 clone(本来 reflog 30 秒就能救)
6. **log 默认进 pager 退不出来**——按 `q`;或者设 `core.pager "less -F -X"` 让短的不分页
7. **`git log -- file` 忘了 `--`**——文件名跟分支名重名时会报错或拿错东西

---

下一篇:`06-分支与切换.md`,讲分支的本质(指针)、`branch` / `checkout` / `switch` / `restore` 的关系、为什么 2.23 之后要分两个新命令。
