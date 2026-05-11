# rebase 深入

rebase 是 git 里最强大也最被误解的命令。误解的来源就一句话——"rebase 会改历史"。听上去吓人,但**理解之后你会发现**:rebase 不会"丢"任何东西(reflog 全留着),它只是把一段 commit **复制一份重新接到另一个位置**。学会 rebase 之后,你的 PR 历史会从"丑陋的 merge 合集"变成**线性的、能讲故事的、能 review 的提交链**。

> 一句话先记住:**rebase 是"把这一串 commit 在另一个 base 上重新做一遍"**。本质是一系列 cherry-pick——拿你 commit 的 diff、在新 base 上重新生成新 commit。新 commit 哈希都不一样了,所以叫"改历史"。**改的是哈希,不是改成另一个内容**。

---

## 一、rebase 到底在干嘛

来看场景:你在 feature 分支上做了 D / E 两个 commit;期间 main 也加了 F:

```
A → B → C → F          ← main
        ↘
         D → E         ← feature(HEAD)
```

你想"把 feature 接到 main 最新位置"。两条路:

**A. merge**(07 篇讲过):

```bash
git switch feature
git merge main
```

结果:

```
A → B → C → F ───→ M    ← feature
        ↘         ↗
         D → E ──┘
```

新建一个 merge commit M,**保留分叉**。

**B. rebase**:

```bash
git switch feature
git rebase main
```

结果:

```
A → B → C → F → D' → E'    ← feature
```

**没有分叉,完全线性**。D / E 被复制成 D' / E'(新 hash),原来的 D / E 还在 reflog 里(没指针指,90 天后被 GC)。

> rebase 的视觉效果像"把 feature 这条侧支拔起来,重新插到 F 后面"。**改的不是 commit 内容,是它在图上的位置**。

---

## 二、最简 rebase 流程

```bash
# 切到要"被移动"的分支
git switch feature

# 把当前分支 rebase 到 main 上
git rebase main
```

如果没冲突:**几秒搞定**,你看到 "Successfully rebased and updated"。

如果有冲突:

```
CONFLICT (content): Merge conflict in src/a.ts
error: could not apply abc1234... your commit message
hint: Resolve all conflicts manually, mark them as resolved with
hint: "git add <conflicted_files>", then run "git rebase --continue".
```

解冲突的步骤(和 merge 类似,但**重要差别**):

```bash
# 1. 编辑冲突文件,删 marker
# 2. add(注意!不要 commit)
git add src/a.ts
# 3. 继续 rebase,git 自动接着应用下一个 commit
git rebase --continue
```

`<<<<<<< HEAD` 这边是**已经 rebase 过去的"新 base 上的内容"**(不是你原来的 commit);`>>>>>>> abc1234` 才是**你正在 rebase 的那个 commit**。这跟 merge 时正反两边正好相反——别看错了。

中途想撤销:

```bash
git rebase --abort        # 完全回到 rebase 之前的状态
```

跳过某个 commit(罕见用):

```bash
git rebase --skip
```

---

## 三、interactive rebase:改老 commit 的瑞士军刀

```bash
git rebase -i HEAD~5
```

意思是"对最近 5 个 commit 做交互式 rebase"。git 弹出编辑器:

```
pick  a3f5b2c first commit
pick  d8e9f0a second commit
pick  4f5a6b7 typo
pick  8c9d0e1 fix typo of typo
pick  e1f2a3b another commit

# Commands:
# p, pick   = use commit
# r, reword = use commit, but edit the message
# e, edit   = use commit, but stop for amending
# s, squash = use commit, but meld into previous (combines messages)
# f, fixup  = like "squash", but discard this commit's log message
# d, drop   = remove commit
```

把 `pick` 改成不同动作就实现不同操作:

| 动作 | 干啥 |
| --- | --- |
| `pick` | 保留 |
| `reword` | 保留但改 message |
| `edit` | 暂停在这个 commit,让你改内容(amend) |
| `squash` | 合进上一个 commit,**保留两边 message** |
| `fixup` | 合进上一个 commit,**丢弃自己 message** |
| `drop` | 删掉这个 commit |
| 调整顺序 | 直接拖动行,改顺序就改了 |

把上面 5 个 commit 整理成 2 个:

```
pick  a3f5b2c first commit
pick  d8e9f0a second commit
fixup 4f5a6b7 typo                  ← 合进 second
fixup 8c9d0e1 fix typo of typo      ← 合进 second
pick  e1f2a3b another commit
```

保存退出后 git 自动按你的指令重写。**最后只剩 3 个 commit,历史干净**。

> interactive rebase 是**整理 PR 历史的核心工具**——本地写代码时随便 commit `wip / fix / typo`,push 之前用 `rebase -i` 整理成 3-5 个有逻辑边界的 commit。

---

## 四、`--onto`:三角 rebase

最强大也最少人会用的形式。场景:

```
A → B → C            ← main
    ↘
     D → E           ← old-feature
         ↘
          F → G      ← new-feature
```

你在 `new-feature` 上做了 F / G,但它现在挂在 `old-feature` 上(后者已废弃)。你想把 F / G **直接接到 main**——不带 D / E。

```bash
git rebase --onto main old-feature new-feature
```

参数读法:**把 `new-feature` 这条分支,从 `old-feature` 这个点之后,搬到 `main` 上**。

结果:

```
A → B → C → F' → G'   ← new-feature
    ↘
     D → E             ← old-feature(没动)
```

> `--onto` 是 git 里"小命令大威力"的代表。掌握之后,**分支移植 / 切片 / 拆 PR 都用一条命令**。

---

## 五、rebase 的 golden rule

**永远不要 rebase 已经 push 出去的 commit**——除非你 100% 确定没人在用那段历史。

为什么:rebase 改了 commit 哈希,push 上去就**强行改写了远程历史**。别人本地是旧哈希,下次 pull 会:

- 要么 git 报错拒绝合并
- 要么 git 把旧 commit 当成"新 commit"再合一遍,**生成奇形怪状的拓扑**

**安全的 rebase 范围**:

- 完全本地、还没 push 的 commit(随便 rebase)
- 你私人的 feature 分支,只有你一个人用(可以 rebase + force push)

**不要 rebase 的地方**:

- main / develop 等公共分支
- 别人也在 push 的共享分支

> 不破规则的话 rebase 跟 merge 一样安全。一破规则**事故等级直接拉到"全队工作流被搅乱"**。这条规则是 git 协作的硬底线,所有团队都遵守。

---

## 六、`push --force-with-lease`:rebase 后的安全推法

rebase 完私人分支需要 force push(否则 git 拒绝,因为远端 hash 不一样)。

```bash
git push --force                  # ❌ 危险:无脑覆盖远端
git push --force-with-lease       # ✅ 安全:只在远端"还是我上次 fetch 时看到的状态"才覆盖
```

`--force-with-lease` 的判断:

- **远端 hash 和我本地认为的远端 hash 一样** → 推
- **远端被别人推过新 commit 了**(我没 fetch 过) → 拒绝,提示"远端变了"

防止"我 rebase 时队友刚 push 了一个新 commit,我 force 覆盖了他"。

```ini
[alias]
    please = push --force-with-lease
```

**所有 force push 都用 `git please`**——避免无脑 `--force` 灭顶之灾。

---

## 七、`pull --rebase`

`git pull` 默认是 `fetch + merge`。这意味着每次 pull 远程有新东西、本地有未 push commit 时,产生一个 merge commit:

```
A → B → C → F        ← origin/main
        ↘     ↘
         D → E → M   ← main(本地)
```

M 这个 merge commit 是**纯噪声**——你只是想拉最新内容,不是想表达"分支合并"。

设 `pull.rebase=true`(02 篇讲过):

```bash
git config --global pull.rebase true
```

之后 `git pull` 等于 `fetch + rebase`:

```
A → B → C → F → D' → E'    ← main
```

**线性、干净、零 merge commit 噪声**。

> 这个设置一改,git 历史质量立刻提升一档。**反对它的唯一理由是"我习惯看到 merge commit"**——但绝大多数团队都同意线性历史好看。

---

## 八、`autosquash`:更快地整理

写代码时发现某个 commit 有 typo,你想"修复后合进那个原 commit":

```bash
# 改完代码之后:
git commit --fixup=<那个原 commit hash>
# 或:
git commit --squash=<那个原 commit hash>
```

git 自动生成 `fixup! 原 message` 形式的 commit。然后 rebase 时:

```bash
git rebase -i --autosquash HEAD~10
```

git 自动把 `fixup!` commit 排到对应原 commit 下方并标 fixup,**省去你手工拖动**。

设默认:

```ini
[rebase]
    autosquash = true
```

之后 `rebase -i` 总会自动 autosquash。

---

## 九、rebase vs merge:什么时候用哪个

| 场景 | 推荐 |
| --- | --- |
| 个人 feature 分支,要合进 main | **rebase + squash 或 rebase + 几个原子 commit** |
| 公共分支拉最新进度 | `pull --rebase` |
| 长期 feature 分支(几周),期间多人协作 | merge,因为多人就不能 rebase 了 |
| 把一个 PR revert | merge(留 merge commit 好 revert 整 PR) |
| 想保留"这个 feature 是独立做的"信息 | merge `--no-ff` |
| 想要超干净的线性历史 | rebase + squash merge |

**典型团队工作流**:

1. feature 分支上随意 commit
2. PR 之前 `git rebase -i HEAD~N` 整理成几个有逻辑的 commit
3. PR review 期间 main 有更新 → `git rebase main`(force-with-lease)
4. 合 PR 时 squash 或 merge,看团队规范

---

## 十、interactive rebase 的几个进阶招

### 10.1 `exec`:在 rebase 中跑命令

```
pick  a3f5b2c commit 1
exec  npm test                     # 跑测试,失败就停下让你修
pick  d8e9f0a commit 2
exec  npm test
```

或一行命令:

```bash
git rebase -i --exec "npm test" HEAD~5
```

**每个 commit 之后跑一次测试,确保中间任何 commit 都能编译 / 通过测试**——这是"原子 commit + bisect 友好"的硬保障。

### 10.2 `break`:在某个 commit 暂停

```
pick  a3f5b2c commit 1
break                             ← 这里停下,让我手工干点事
pick  d8e9f0a commit 2
```

跑到 break 时 git 暂停,你随便操作完 `git rebase --continue`。

### 10.3 改老 commit 的作者 / 时间

```bash
git rebase -i HEAD~5
# 把要改的标 edit
# 到那个 commit 时:
git commit --amend --author="新名字 <新邮箱>" --date=now
git rebase --continue
```

---

## 十一、踩坑提醒

1. **rebase 公共分支**——破了 golden rule,搅乱全队
2. **`push --force` 一把梭**——队友未 fetch 的 commit 被覆盖,改用 `--force-with-lease`
3. **rebase 中途冲突,误用 `git commit` 而不是 `git rebase --continue`**——产生孤立 commit,搞乱进度
4. **冲突 marker `HEAD` / 名字读反**——rebase 时 HEAD 是新 base 那边,不是你原来分支
5. **interactive rebase 改了一行没保存退出**——以为没事,实际上 git 接收的是空脚本,会报错或全 drop
6. **rebase 一长段反复出现同一冲突**——开 `rerere` 一次解了之后自动应用
7. **rebase 完忘了 push --force-with-lease**——下次 push 报错"远程比本地新",误以为别人加了什么
8. **rebase merge commit**——默认会展平 merge commit 里的 commit,通常不是你想要的;用 `--rebase-merges` 保留 merge 拓扑

---

下一篇:`09-远程仓库与push-pull-fetch.md`,讲 remote 是什么、`fetch` / `pull` / `push` 的精确差别、为什么 fetch 比 pull 安全、tracking branch 和 upstream 的关系。
