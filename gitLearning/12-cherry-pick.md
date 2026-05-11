# cherry-pick 选择性合并

merge 是"把整条分支合进来",rebase 是"把整条分支搬过去",cherry-pick 是"**只挑某一个 commit** 应用到当前位置"。听上去像精细版的 merge,实际用法和场景都不一样——cherry-pick 的核心场景是**hotfix 跨分支传播**:线上发现 bug,在 main 修了,要把这个 fix 也带到 release/v1.x 分支。这是 cherry-pick 一招就能干的事,merge 干不了(会带过来 main 上别的不该带的 commit)。

> 一句话先记住:**cherry-pick 把某个 commit 的 diff 拿过来,在当前分支上重新做一遍**。新生成一个 commit,内容相同、hash 不同——和 rebase 单个 commit 完全是同一个机制。**cherry-pick 是 rebase 的"单 commit 版本"**。

---

## 一、最简 cherry-pick

```bash
git switch release/v1.x          # 切到要"接收"这个 commit 的分支
git cherry-pick a3f5b2c          # 把 a3f5b2c 这个 commit 应用过来
```

git 把 a3f5b2c 的 diff 提取出来、应用到当前分支、生成新 commit。

```
原:
A → B → C → D       ← main
        ↘
         E          ← release/v1.x

cherry-pick D 之后:
A → B → C → D       ← main
        ↘
         E → D'     ← release/v1.x
```

D' 是 D 的"复刻"——同样的 diff、同样的 message、新 hash。

---

## 二、典型场景:hotfix 反向传播

最常见的工作流:

```
main:        A → B → C → D(fix bug)→ E
release/1.x: A → B → C
                     ↑
              v1.0.0 在这,生产用的是这个版本
```

bug 在 main 修了,但**生产跑的是 v1.0.0**。直接 merge main 进 release 会把 D / E 全带过去,而 E 可能是不该进 v1.0 的新功能。

正确做法:

```bash
git switch release/1.x
git cherry-pick D       # 只把那个 fix commit 拿过来
git tag -a v1.0.1 -m "Patch release: fix bug"
git push origin release/1.x v1.0.1
```

**这是 release / hotfix 工作流的核心招式**——长期维护多个版本的项目天天用。

---

## 三、批量 cherry-pick

### 3.1 多个 commit

```bash
git cherry-pick A B C            # 三个 commit 顺序应用
```

### 3.2 范围语法

```bash
git cherry-pick A^..C            # 从 A 到 C 都应用(注意 A^,因为 A..C 不含 A)
git cherry-pick A..C             # 应用 A 之后到 C(不含 A,含 C)
```

`A..C` 不含 A;要含 A 用 `A^..C`(`^` = parent)。

### 3.3 中途出冲突

cherry-pick 像 rebase,出冲突会停:

```
error: could not apply a3f5b2c... fix bug
hint: Resolve all conflicts manually, mark them as resolved with
hint: "git add <conflicted_files>", then run "git cherry-pick --continue".
```

解决方式:

```bash
# 1. 编辑冲突文件
# 2. add(不要 commit)
git add src/a.ts
# 3. 继续
git cherry-pick --continue

# 或者放弃这一个,跳过
git cherry-pick --skip

# 或者完全撤销
git cherry-pick --abort
```

---

## 四、`-x`:留下"来源"标记

```bash
git cherry-pick -x a3f5b2c
```

效果:新 commit 的 message 自动加一行 "(cherry picked from commit a3f5b2c)"。

```
fix: handle null in upload

(cherry picked from commit a3f5b2cabd...)
```

**强烈建议跨分支 cherry-pick 都加 `-x`**——半年后看到这条 commit,一眼能找到原始来源,追问题快得多。

> 跨长期分支(release / hotfix)做 cherry-pick **必加 `-x`**——审计可追溯。同 PR 内挑 commit 不必加。

---

## 五、`-e`:edit message

```bash
git cherry-pick -e a3f5b2c
```

应用后打开编辑器让你改 message。常用场景:**原 commit message 写得不合规,顺便整理**。

---

## 六、`-n`(`--no-commit`):应用但不 commit

```bash
git cherry-pick -n A B C
```

把 A / B / C 的改动叠加到当前 staging 和 working dir,**不生成 commit**。

之后你可以:

- 自己写一个汇总 commit
- 修改一些细节再 commit
- 跟其他改动合一起 commit

**典型场景**:把一系列零碎 commit 集中合成一个大 commit。

---

## 七、`-s`(`--signoff`):加 Signed-off-by

跨分支 cherry-pick 时签署:

```bash
git cherry-pick -s -x a3f5b2c
```

适合开源项目要求 DCO 的场合——cherry-pick 之后**重新签署**(原签署是别人的,你 cherry-pick 后变成你在转交)。

---

## 八、cherry-pick merge commit

merge commit 有两个 parent,cherry-pick 默认不知道选哪边的 diff:

```
error: commit M is a merge but no -m option was given.
```

需要指定 mainline:

```bash
git cherry-pick -m 1 <merge-commit>     # 选第一个 parent 当 base
git cherry-pick -m 2 <merge-commit>     # 选第二个 parent 当 base
```

`-m 1` 通常对——意思是"以这个 merge 的主分支视角,看它带来了什么"。

> cherry-pick merge commit **比较少见**,通常是想"把某个 PR 的整体合进来"——但更稳的做法是直接 cherry-pick 这个 PR 里的几个原子 commit。

---

## 九、cherry-pick 的限制和坑

### 9.1 不会自动跟踪"已 cherry-pick"

A 分支 cherry-pick 了 main 的 D。后来 A 想合回 main,git **不知道 D 已经在 A 里了**——它会再尝试合一遍,大概率冲突。

**对策**:用 `git cherry` 看哪些已经过去了:

```bash
git cherry main feature
# - a3f5b2c   feature 比 main 多的(用 + 标)
# + d8e9f0a   feature 比 main 多的
```

`-` 标的是"等价的 commit 已经在 main 上了"(比较 patch ID 来判断,不只是看 hash)。

### 9.2 不适合大量 commit

cherry-pick 100 个 commit 慢且容易出错。**100 个 commit 是 rebase 的活,不是 cherry-pick 的**。

### 9.3 历史会"断裂"

cherry-pick 出来的 commit 没有原 commit 在祖先链上,**bisect / blame 追到一半会"断"**——只看到 D' 而不是原 D。**记得用 `-x` 留来源,这能补救**。

---

## 十、cherry-pick vs merge vs rebase 对比

| 维度 | cherry-pick | merge | rebase |
| --- | --- | --- | --- |
| 量级 | 单个 / 几个 commit | 整条分支 | 整条分支(重写) |
| 历史 | 复制一份新 hash | 保留分叉 | 重写新 hash |
| 跨分支选 | ✅ 最强 | ❌ | ❌ |
| 团队共享场景 | OK(目标分支允许 merge) | OK | ❌ 公共分支别 rebase |
| 典型用途 | hotfix 反向传播 | 完整 feature 合 main | 整理本地历史 / pull |

> 选错了会很丑:用 merge 做 hotfix 传播,会带过去一堆不该带的 commit;用 cherry-pick 做整 feature 合并,失去原始拓扑信息。**操作前问自己"我要的是单点还是整条"——单点 cherry-pick,整条 merge / rebase**。

---

## 十一、常见组合用法

### 11.1 跨分支挑文件改动

只想要某个 commit 里**某个文件**的改动,不要其他?

```bash
git checkout <commit> -- path/to/file
# 用那个 commit 里的版本覆盖工作区文件,然后 commit
```

(这其实是 `restore --source`,不是 cherry-pick——但功能更精细。)

### 11.2 把别人 PR 的某个 commit 拿来用

```bash
git remote add their-fork git@github.com:them/repo.git
git fetch their-fork
git log their-fork/their-branch --oneline    # 找到要的 commit hash
git cherry-pick <hash>
```

### 11.3 把多个 hotfix commit 整理后传到 release

```bash
git cherry-pick -n <fix1> <fix2> <fix3>     # 三个改动叠在 staging
git commit -m "patch: aggregate hotfixes for v1.0.1"
```

---

## 十二、踩坑提醒

1. **不加 `-x` 跨分支 pick**——半年后追溯不到原 commit,审计困难
2. **大批量 cherry-pick 当 rebase 用**——慢且容易出错,该用 rebase
3. **pick 完忘了 push**——本地有 hotfix,生产还没修
4. **A 分支 pick 了 main 又 merge 回 main**——重复合,可能冲突
5. **不知道 `git cherry`**——分不清哪些 commit 已经传过去,反复尝试
6. **cherry-pick merge commit 不指定 `-m`**——报错懵半天
7. **在 detached HEAD 做 cherry-pick**——后续切分支后新 commit 漂浮,要先建分支
8. **冲突时用 `git commit` 而不是 `--continue`**——破坏 cherry-pick 进度

---

下一篇:`13-撤销操作三剑客.md`,讲 `reset` / `revert` / `checkout` 的精确差别、`reset` 三种模式、什么时候 revert 什么时候 reset、撤销 push 出去的 commit 的正确做法。
