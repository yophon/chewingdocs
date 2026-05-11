# reflog 找回丢失提交

reflog 是 git 给"我刚才好像把代码搞丢了"这种事故准备的安全网。**90% 的"git 事故"都能用 reflog 救回**——前提是你知道有 reflog 这东西。这一篇专门讲 reflog 的工作机制、几种典型救援场景、以及什么时候 reflog 也救不回(罕见但存在)。

> 一句话先记住:**reflog 是"HEAD 和分支指针所有移动的本地日志"**——`reset` / `rebase` / `checkout` / `commit --amend` / 删除分支……每一次都留痕。即使 commit 没分支指了,reflog 还指着,**90 天内一行命令救回**。学会 reflog 之后,git 操作的胆子能大十倍。

---

## 一、reflog 是什么

```bash
git reflog
# a3f5b2c (HEAD -> main) HEAD@{0}: commit: fix: ...
# d8e9f0a HEAD@{1}: rebase finished: returning to refs/heads/main
# 4f5a6b7 HEAD@{2}: rebase: onto main
# 8c9d0e1 HEAD@{3}: checkout: moving from main to feature
# e1f2a3b HEAD@{4}: commit: ...
```

每一行是一次 HEAD 移动:

- 左边是当时 HEAD 指的 commit
- `HEAD@{N}` 是"N 步之前的 HEAD"
- 后面是动作描述(commit / rebase / checkout / reset / merge / amend ...)

reflog 实际存在 `.git/logs/HEAD`(还有 `.git/logs/refs/heads/*` 每个分支单独的)。

**关键认知**:**reflog 是本地的、不会 push 到远端、每个仓库独立**。reflog 只能救你**自己**的事故,救不了别人在自己机器上做的。

---

## 二、reflog 默认保留多久

```
默认配置:
- 可达对象的 reflog 条目:保留 90 天(gc.reflogExpire = 90 days)
- 不可达对象的 reflog 条目:保留 30 天(gc.reflogExpireUnreachable = 30 days)
```

"不可达"指那个 commit 已经没有任何分支 / tag 指向它。也就是说:

- 如果你只是 reset 了一下,被 reset 掉的 commit 没有分支指了 → 30 天后被 GC
- 如果删除了一个分支,那分支上的独有 commit → 30 天后被 GC

但**reflog 条目本身是按 90 天**——只要你这 90 天里 `git reflog` 还能看到记录,通常对象也还能找回。

**调整**:

```bash
git config --global gc.reflogExpire "180 days"
git config --global gc.reflogExpireUnreachable "180 days"
```

> 单仓库出过事故的话,**先别做任何 git 操作**——立刻 `git reflog` 截图保留。reflog 不会因为正常 git 操作消失,但每次 `git gc` 跑都会清过期的;**操作越多越容易冲掉关键记录**。

---

## 三、最典型场景:`reset --hard` 救回

```bash
# 你刚才:
git reset --hard HEAD~5    # 倒退 5 个 commit,本地 5 个 commit 看不见了

# 救援:
git reflog
# ...
# a3f5b2c HEAD@{1}: reset: moving to HEAD~5
# d8e9f0a HEAD@{2}: commit: ...           ← 这是 reset 之前的 HEAD,要回到这
# ...

git reset --hard d8e9f0a    # 或 git reset --hard HEAD@{2}
```

**完事**。5 个 commit 全回来,3 秒救援。

---

## 四、删错分支救回

```bash
# 不小心删了:
git branch -D feature-x

# 救援:
git reflog | grep "feature-x"
# d8e9f0a HEAD@{12}: checkout: moving from feature-x to main

# 或者用更精准的:
git reflog show feature-x   # 注意:删了之后这个可能不再有效

# 直接基于那 commit 重建分支:
git switch -c feature-x d8e9f0a
```

**或者用更暴力的搜法**——`git fsck`:

```bash
git fsck --lost-found
# Checking object directories: 100% (256/256), done.
# dangling commit a3f5b2c4d8e9...
# dangling commit ...
```

`dangling commit` 是"没分支 / tag 指着但还没被 GC"的 commit。

```bash
git show <dangling-commit-hash>    # 看是不是你要的
git switch -c rescue <hash>
```

> `fsck --lost-found` 是**核武器级救援**——reflog 找不到时它兜底。但输出可能有几十几百个 dangling commit(中间状态),要一个个 `git show` 看。

---

## 五、`commit --amend` 错了救回

```bash
# 你刚 amend 了上一次 commit,但发现改错了:
git commit --amend -m "wrong message"

# 救援:
git reflog
# 73a4b6c HEAD@{0}: commit (amend): wrong message
# d8e9f0a HEAD@{1}: commit: original correct message    ← 原来的 commit 还在

# 把分支移回去:
git reset --hard d8e9f0a    # 或 HEAD@{1}
```

**关键认知**:`--amend` 不是"修改" commit,是"**生成新 commit 替换分支指针**"。原 commit 在 reflog 里还能找到。

---

## 六、rebase 出错救回

rebase 一长串 commit,中途解冲突解错了,完事发现"咦不对啊":

```bash
git reflog
# ...
# 73a4b6c HEAD@{0}: rebase finished: returning to refs/heads/feature
# (一堆 rebase 中间步骤)
# d8e9f0a HEAD@{20}: rebase (start): checkout main      ← rebase 开始之前

git reset --hard d8e9f0a   # 或 HEAD@{20}
```

**rebase 之前的 commit 链一字不漏地回来**。所以 rebase 不可怕——出错回 reflog,3 秒撤销。

---

## 七、push --force 把别人 commit 覆盖了救回

这是**别人**把你 commit 覆盖了:

```
本地: A → B → C → D    ← feature(你刚 push 完)
远端: A → B → C → D    ← origin/feature

队友: A → B → C → D'   ← 他 force push 了 D' 覆盖你 D

你拉:
git pull
本地: A → B → C → D'   ← 你 D 的工作"消失了"
```

但你**本地 reflog 里 D 还在**:

```bash
git reflog
# 73a4b6c HEAD@{0}: pull: ...
# d8e9f0a HEAD@{1}: commit: D 那次 commit
# ...

# 拿 D 出来 cherry-pick 或基于它建分支:
git switch -c rescue d8e9f0a
git cherry-pick d8e9f0a    # 或者直接 reset --hard 然后 force push 回去(看团队规则)
```

> 这就是为什么 reflog 是协作中**最大的防身工具**——队友的 force push 杀不了你 reflog 里的 commit。**前提是你这台机器之前 fetch 过、pull 过那个 commit**——纯粹"在远端被覆盖,你从没拿到过"那是真的拿不回。

---

## 八、reflog 命令集

```bash
git reflog                       # HEAD 的 reflog
git reflog show <branch>         # 某分支的 reflog
git reflog show stash            # stash 的 reflog
git reflog show --all            # 所有 ref 的 reflog
git reflog -10                   # 最近 10 条
git reflog --since="1 day ago"   # 时间过滤
git reflog --grep-reflog="reset" # 描述里含 reset 的

# 删除 reflog 条目(慎用)
git reflog delete HEAD@{5}
git reflog expire --expire=now --all   # 立刻清所有 reflog ⚠️ 救命药都没了

# 强制 GC
git gc --prune=now --aggressive
```

---

## 九、什么情况 reflog 也救不回

reflog 不是绝对安全网。这些情况它真的救不回:

### 9.1 工作区从未 commit 过的改动

reflog 记录的是 **commit 和 ref 移动**,**不记录工作区状态**。

```bash
# 你改了 a.ts 一整天,没 commit
git checkout main           # 切分支,git 警告:你有未 commit 改动
# 强制切:
git checkout -f main        # 工作区直接没了
```

**reflog 救不了**。这种改动从未变成 commit,git 不知道它存在。

**对策**:**养成至少每小时 `git stash` 或 `git commit -m "wip"` 的习惯**。

### 9.2 `git clean -fd`

`git clean` 删的是文件系统层面的文件——和 git 历史无关,**不进 reflog**。

**对策**:`git clean -n` 先看再 `-f`。

### 9.3 reflog 已过期 + commit 已 GC

90 天后过期 + `git gc` 跑完,对象真的从 `.git/objects/` 删掉。

**对策**:出事故立刻救援,别拖。

### 9.4 仓库被 `rm -rf .git` 或硬盘损坏

reflog 在 `.git` 里,`.git` 没了什么都没。

**对策**:**push 是最好的备份**——push 出去的 commit 即使本地 `.git` 没了,在远端还在。

> 一条铁律:**写完代码要么 commit + push,要么 stash**。两件事都不做,纯靠工作区,任何意外都能让你丢东西。

---

## 十、reflog 与 GC 的关系

git 的 `git gc`(garbage collect)清理那些"没人指向 + reflog 过期"的对象:

```bash
git gc                       # 普通清理
git gc --aggressive          # 大力清理(慢)
git gc --prune=now           # 立刻清过期对象
```

通常你不需要手动跑——git 会在某些操作后自动触发。**默认设定下不会清近期 reflog 里的对象**。

**安全姿势**:出事故时**别跑 `git gc`**。先救援。

---

## 十一、reflog 的几个进阶用法

### 11.1 用 reflog 时间引用

```bash
git show HEAD@{1}                  # 上一次 HEAD 位置
git show HEAD@{2.hours.ago}        # 2 小时前
git show HEAD@{yesterday}          # 昨天
git show main@{1}                  # main 分支的上一次位置
```

`@{N}` 和 `@{时间}` 都可以。

### 11.2 `git reset --hard ORIG_HEAD`

git 在某些操作(merge / rebase / pull)前会把 HEAD 备份到 `ORIG_HEAD`:

```bash
git merge feature           # 合错了
git reset --hard ORIG_HEAD  # 撤回到 merge 之前
```

**等价于 `HEAD@{1}`**,但语义更清楚。

### 11.3 reflog 也写入 `git log`

```bash
git log -g                  # 走 reflog 顺序的 log,而不是 commit 祖先链
```

**最大用法**:看一系列已被 detached / orphaned 的 commit。

---

## 十二、怎么"信任 reflog"

新手畏惧 git 的根源是不信任"出事能救"。要建立这种信任:

1. **故意造一次事故**,然后用 reflog 救。比如:

```bash
git commit -m "test"
git reset --hard HEAD~3
git reflog
git reset --hard HEAD@{1}
# 看到 commit 回来了——以后就敢动 git 了
```

2. **把 reflog 加进日常**——出 git 怪事时第一反应是 `git reflog`,而不是删仓库重 clone

3. **设长 reflog 保留期**(180 天)——多留点缓冲

> reflog 救援能力强到什么程度?**Linus Torvalds 的工作流就是"敢做大重构,出错 reflog 撤"**——他写 git 当然信任 reflog。普通开发者只要敢开第一次,后面就习惯了。

---

## 十三、踩坑提醒

1. **不知道 reflog**——出事第一反应是删仓库重 clone(本可以 30 秒救回)
2. **出事故后还在做 git 操作**——reflog 容量被冲淡,关键记录可能被挤出
3. **以为 reflog 能救工作区改动**——救不了,只能救 commit 级别的事故
4. **以为 reflog 能救 push --force 给别人覆盖的 commit**——只能救你**本地** reflog 里有的
5. **`git clean -fdx` 之前没看 dry-run**——文件系统层面删除,不进 reflog
6. **设 `gc.reflogExpire=0`**——reflog 没了,救命药没了
7. **跨仓库以为能拿 reflog**——reflog 仓库本地,新 clone 没 reflog
8. **从不 push 当备份**——本地仓库挂了什么都没,push 是最好的兜底

---

下一篇:`15-gitignore详解.md`,讲 .gitignore 的匹配规则、几种忽略层级、`git rm --cached` 移除已跟踪、为什么有些文件 .gitignore 写了还是被 commit。
