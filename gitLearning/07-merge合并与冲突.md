# merge 合并与冲突

merge 是 git 协作的核心动作,也是新人**最怕的那个动作**。怕的本质不是 merge 难,是**冲突 marker 看不懂、不知道怎么解、不知道解完接着干什么**。这一篇彻底打掉这个恐惧——merge 就是把两个 commit 的 diff 叠一起放进新 commit;冲突就是"叠一起的两段在同一行"——看 diff、留对的、删 marker、commit,完事。

> 一句话先记住:**merge 永远不会偷偷改你东西**——产生冲突时它把决定权留给你。冲突 marker `<<<<<<< ======= >>>>>>>` 把两边内容并排摆给你看,你选哪边或写新的,然后 commit——这就是全部。**git 冲突解决从来不需要"高级技巧",只需要清楚的头脑**。

---

## 一、merge 的三种情形

### 1.1 Fast-forward(可快进)

main 没动,feature 比 main 多几个 commit:

```
A → B → C       ← main
        ↘
         D → E  ← feature
```

`git merge feature` 直接把 main 指针移到 E,**不新建 merge commit**:

```
A → B → C → D → E      ← main, feature
```

历史**完全线性**——这是最干净的合并结果。

### 1.2 Three-way merge(三方合并)

main 和 feature 都各自动了:

```
A → B → C → F          ← main
        ↘
         D → E         ← feature
```

`git merge feature` 必须新建 merge commit M(两个 parent):

```
A → B → C → F ─→ M     ← main
        ↘       ↗
         D → E ┘       ← feature
```

历史**保留分叉**——能看出"feature 是独立做的"。

### 1.3 冲突合并(conflicting merge)

两边都改了**同一文件的同一行**(或一边删了另一边改了):

```
main:    foo = 1
feature: foo = 2
```

git 不知道你想要哪个,**停下来问你**。这就是"冲突"。

> merge 三种情形发生的概率大致是 4 : 4 : 2——大部分 PR 不会有冲突;有了也通常 1-2 处。**"冲突很难解"是被传谣的**。

---

## 二、最简 merge 流程

```bash
# 切到要"接收改动"的分支
git switch main

# 拉一下,确保 main 是最新
git pull

# 合并 feature 进来
git merge feature
```

可能的结果:

| 结果 | 你做什么 |
| --- | --- |
| `Already up to date.` | feature 没新东西 |
| `Fast-forward` | 已合,无新 commit |
| `Merge made by the 'ort' strategy.` | 新建了 merge commit,合好了 |
| `CONFLICT (...)` | 出冲突,见下面第三节 |

合完看一眼:

```bash
git log --oneline --graph -10
```

---

## 三、冲突 marker 怎么读

冲突文件里 git 会插入一段标记:

```
<<<<<<< HEAD
const TIMEOUT = 1000;
=======
const TIMEOUT = 5000;
>>>>>>> feature
```

逐行解读:

```
<<<<<<< HEAD              ← 我"当前所在那边"的开始
const TIMEOUT = 1000;     ← 当前分支(main)的内容
=======                   ← 分隔线
const TIMEOUT = 5000;     ← 要合进来那边(feature)的内容
>>>>>>> feature           ← 结束
```

你的任务:**手工编辑这段,留下你想要的最终代码,把 marker 全删掉**。比如选 5000:

```
const TIMEOUT = 5000;
```

或者选两边都不要,写个新的:

```
const TIMEOUT = parseInt(process.env.TIMEOUT) || 3000;
```

**完事四步**:

```bash
# 1. 编辑冲突文件,留对的、删 marker
# 2. 标记已解决(实际是 add 进 staging)
git add src/config.ts
# 3. 检查所有冲突都解了
git status     # 不应该再有 "Unmerged paths"
# 4. 完成合并
git commit     # 默认会带一段 "Merge branch 'feature' ..." 的 message
```

> **解冲突不是猜——是想清楚"两边分别想表达什么"**。如果 main 的 1000 是为了快速失败、feature 的 5000 是为了适配慢网络——那合理结果可能是 5000(因为最新需求);也可能是按环境分开。**搞不清楚就问那个加 5000 的人**。

---

## 四、merge 中途想撤销

冲突解到一半发现"算了不合了"?

```bash
git merge --abort       # 完全撤销 merge,回到 merge 前状态
```

**这是安全网**——任何时候都能放弃 merge 重来。**`--abort` 是 merge 操作的"反悔键"**,记住这一条就敢动 merge。

---

## 五、merge 的几种策略(`-s`)

```bash
git merge -s recursive feature       # 默认,2.30 之前
git merge -s ort feature             # 默认,2.34+(更快)
git merge -s ours feature            # 强制保留我这边,完全忽略 feature 的内容
git merge -s theirs feature          # ❌ 不存在,见下
```

注意:`-s ours` 是"保留我这边的所有内容,但记下'已合并 feature'这个事实"。**不是常用操作**——典型场景是"丢弃一条侧支但记下它合过"。

想"对方优先",用:

```bash
git merge -X theirs feature   # 注意是大写 X,且 X 是策略选项,不是 strategy
```

`-X ours` / `-X theirs` 在**有冲突时偏向哪边**——没冲突的部分两边都要。

| 选项 | 行为 |
| --- | --- |
| `-s ours` | 完全丢弃 feature,只记一笔 merge |
| `-X ours` | 有冲突时选 main 那边,无冲突的还是合 |
| `-X theirs` | 有冲突时选 feature 那边 |

> `-X theirs` 是**自动化批量合 dependabot PR** 的常见招——明知"对方都是版本号 bump,冲突时一律选新的"。

---

## 六、`--no-ff`、`--ff`、`--ff-only`

|  | 行为 |
| --- | --- |
| `--ff`(默认) | 能 fast-forward 就 fast-forward,否则三方合并 |
| `--no-ff` | **永远新建 merge commit**,即使能 fast-forward |
| `--ff-only` | **只允许 fast-forward**,不行就报错 |

什么时候用哪个:

```bash
# 个人开发,不想要 merge commit 噪声
git merge feature

# 团队规范要求每个 PR 都留一个 merge commit(为了清晰拓扑)
git merge --no-ff feature

# 严格 trunk-based,要求"feature 必须 rebase 到最新 main 才能合"
git merge --ff-only feature   # 不行就报错,提示 rebase
```

> 团队大了之后`--no-ff` 是常见选择——每个 PR 都有自己的 merge commit,**revert 整个 PR 一行 `git revert -m 1 <merge-commit>` 就行**。fast-forward 会"摊平"这个边界,要 revert 整 PR 反而麻烦。

---

## 七、Squash merge

**把 feature 的 N 个 commit 压成一个 commit 进 main**:

```bash
git switch main
git merge --squash feature       # 把 feature 的 diff 合进 staging,但不 commit 也不更新分支指针
git commit -m "feat: ..."        # 自己写一个汇总 commit
```

**结果**:

```
A → B → C → F → S          ← main
        ↘
         D → E              ← feature(没动)
```

S 是一个**普通 commit**(只有一个 parent),包含 feature 全部改动,**但 D / E 不在 main 的祖先链里**。

| 优点 | 缺点 |
| --- | --- |
| main 历史超干净:每个 PR 一个 commit | feature 上的精细历史丢了(D / E 找不到) |
| 适合"feature 内部 commit 都是 wip" | revert 时只能整体 revert |
| 易 cherry-pick(就一个 commit) | 协作时 feature 分支别人也在用会很乱 |

> GitHub 的 "Squash and merge" 按钮就是这个。**99% 个人 / 小团队 PR 都用 squash 就行**——main 历史等于"一个 PR 一个 commit",日后看清爽极了。

---

## 八、Octopus merge(多分支同时合)

```bash
git merge feature1 feature2 feature3
```

一次合多个分支。**仅用于大批"非冲突的小改动"**,有冲突就报错,不能交互式解决。

**几乎没人用**——典型场景只有 Linux 内核这种**子树合并**特别多的项目。日常工作可以忘掉。

---

## 九、几个解冲突的工具

### 9.1 `git mergetool`

调用图形化合并工具(vimdiff / meld / kdiff3 / VS Code):

```bash
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'
git mergetool                  # 出冲突后跑这条
```

**比手工编辑 marker 快**——左中右三栏看 base / mine / theirs,点选合成。

### 9.2 IDE 集成

VS Code 装"GitLens"或者直接用内建 merge editor:每个 conflict block 上方有 "Accept Current / Incoming / Both" 按钮——一键解。

### 9.3 `rerere`(重用已解的冲突)

设过 `git config --global rerere.enabled true` 之后:

- 第一次解某个冲突,git 记下来
- 下次同样冲突再出现(rebase 一长串 commit 时常发生),git 自动应用之前的解法

**节省 80% 的"重复解同一个冲突"的痛苦**。

---

## 十、merge commit 的 message 怎么写

默认 merge commit message:

```
Merge branch 'feature' into main
```

如果你用 `--no-ff` 或者远端的 PR merge,**最好带上**:

- 这个 PR 解决什么问题
- PR 编号
- 跟谁有关

```
Merge branch 'feature/auth-okta' into main

Implement Okta SSO. Fall back to password login if 
OKTA_CLIENT_ID is unset. Closes #1234.

Reviewed-by: Wang
```

> GitHub 的 "Create a merge commit" 选项默认会带上 PR 标题和 commits 列表——直接用就行。

---

## 十一、踩坑提醒

1. **冲突时不看 marker 就 `git add` 提交**——marker 字符进了代码,编译报错,丢人
2. **不知道 `--abort`**——卡在冲突里不敢动,删仓库重来
3. **merge 完不看 log**——以为合了,实际上漏 commit / 没 commit
4. **拿到冲突就慌**——冲突 marker 是"git 把决定权留给你",不是 git 在抽风
5. **squash merge 之后还以为 feature 分支可以继续用**——squash 没把 feature 标记为 merged,后续 `merge --no-ff` 会重复合一遍
6. **强行 `-X theirs` 解决一切冲突**——有时候 ours 是对的,无脑选 theirs 会把自己的 fix 弄丢
7. **大量冲突一边解一边 `git add`**——半天不 commit,中途网断 / 关机 / 切分支可能丢解的进度;**解一个 add 一个,但 commit 等全部解完**

---

下一篇:`08-rebase深入.md`,讲 rebase 的"重写历史"本质、interactive rebase 改老 commit、`onto` 三角参数、rebase 和 merge 的取舍、为什么 "golden rule of rebase" 那么严格。
