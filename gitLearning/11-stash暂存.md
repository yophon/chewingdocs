# stash 暂存

stash 的应用场景就一句话:**"我现在改了一半,但临时要切去干别的"**——比如要紧急 fix 线上 bug、要切去 review 别人的 PR、要 pull 但本地有未 commit 改动。stash 就是 git 的"暂存柜":把当前改动存起来、工作区还原干净、回头还能拿出来继续。听上去简单,但 90% 的人只用 `stash` / `stash pop` 这两条,**stash 还有 7-8 个非常实用的进阶用法**。

> 一句话先记住:**stash 是个栈,push 进去、pop 出来**。但它内部其实是一个 commit(放在 `refs/stash`),所以 stash 列表不止能 pop 最新的——可以按编号挑、可以查 diff、可以按文件挑、可以应用到不同分支。**stash 是 commit 的小弟**。

---

## 一、最常见用法:存 + 取

```bash
# 改了一堆,但要切去干别的
git stash                  # 把所有未 commit 改动暂存,工作区还原干净

# 切去干别的事 ...
git switch hotfix
# ... 干完事

# 切回来,把刚才的改动恢复
git switch feature
git stash pop              # 把最近一次 stash 应用到工作区,然后从 stash 列表删掉
```

`stash` 暂存什么:

- 已跟踪文件的所有未 commit 改动(working + staging)
- **不暂存** untracked 新文件(默认)
- **不暂存** ignored 文件

要把 untracked 也存:

```bash
git stash -u               # untracked 也存
git stash -a               # 连 ignored 也存(罕见)
```

> **新文件忘存**是 stash 最常见的坑——你以为存了所有改动,切回来发现新增的文件还留在原分支(更糟:你切到新分支后这文件**还在那**,因为它不属于任何分支)。**养成 `stash -u` 习惯**或者用 `git stash --include-untracked` 别名。

---

## 二、push vs pop vs apply

```bash
git stash push -m "wip on auth"    # 等价于 git stash, 但带 message
git stash pop                       # 应用 + 从列表删除
git stash apply                     # 应用 + 留在列表
git stash drop                      # 不应用,直接从列表删
```

`pop` vs `apply`:

| 命令 | 应用 | 删 stash |
| --- | --- | --- |
| `pop` | ✅ | ✅ |
| `apply` | ✅ | ❌(留着) |

**什么时候用 apply 而不是 pop**:

- 要把同一个 stash 应用到**多个分支**
- 担心应用后冲突,想保留 stash 作为 fallback
- 想试一下,不行 reset 完再 apply

**安全做法**:**先 apply,确认无误再 drop**——比 `pop` 失败时 stash 已被弹出但有冲突难处理强。

---

## 三、stash 列表

```bash
git stash list
# stash@{0}: WIP on feature: a3f5b2c last commit
# stash@{1}: WIP on main: d8e9f0a another commit
# stash@{2}: On hotfix: emergency fix wip
```

列表是个**栈**——最新的 stash 编号 0,越老越大。

操作指定 stash:

```bash
git stash show stash@{1}              # 看 stash@{1} 改了什么(简略 stat)
git stash show stash@{1} -p           # 看完整 diff
git stash apply stash@{1}             # 应用编号 1 那个,而非最新
git stash pop stash@{1}               # 同上,但 pop 之后从列表删
git stash drop stash@{1}              # 删除编号 1
git stash clear                       # 清空所有 stash(慎用)
```

> stash 编号不稳定——drop 一个之后,后面的编号都往前移。**长期保留某个 stash 不靠 stash@{N},要 `git stash branch` 转成正经分支**(下面第六节)。

---

## 四、`stash -p`:精细化 stash

只想暂存改动的**一部分**?

```bash
git stash push -p
```

git 会逐 hunk 问你存不存,**和 `git add -p` 完全一样**(详见 03 篇)。

| 按键 | 意思 |
| --- | --- |
| `y` | 这块存 |
| `n` | 不存 |
| `s` | 切小一点 |
| `q` | 退出 |

典型场景:**你 fix 了 bug A 又顺手改了 bug B,想把 B 暂存,只留 A 在工作区**——`stash -p`,只勾 B 相关的 hunk。

---

## 五、按文件 stash

```bash
git stash push -m "wip" -- src/a.ts src/b.ts    # 只 stash 这两个文件
```

`--` 后面跟路径,只 stash 指定路径。其他文件留在工作区不动。

---

## 六、把 stash 转成分支:`git stash branch`

```bash
git stash branch new-branch          # 基于 stash 创建分支
git stash branch new-branch stash@{2}    # 基于指定 stash
```

干啥:

1. 基于 stash 当时**所基于的那个 commit**(不是当前 HEAD)新建分支
2. 切过去
3. 应用 stash
4. 从列表删除 stash

**最强场景**:你 stash 之后,base 分支改了好多,直接 `pop` 会冲突——`stash branch` 在原始 base 上还原 stash,**完全无冲突**。

> stash 长期未用?用 `stash branch` **把它"正规化"成分支保留**——比 `stash@{N}` 当历史档案靠谱多了。

---

## 七、`stash --keep-index`:存工作区不存暂存区

罕见但有用:

```bash
git add src/a.ts                  # 准备 commit a.ts
# 工作区还有 b.ts 的改动,但你想先单独测 a.ts 的 commit
git stash --keep-index            # 把没 add 的暂存,保留 add 过的在工作区
# 跑测试,验证 a.ts 没问题
git commit -m "feat: a"
git stash pop                     # 把 b 拿回来继续
```

干啥:**stash 工作区改动,但保留 staging 区不动**——只把没 add 的存走。**做"先 commit 一部分,再继续工作"时的精细化操作**。

---

## 八、stash 内部:它就是个 commit

```bash
git log refs/stash --oneline
# 看 stash 的"提交历史"
```

每次 `stash` 实际上**生成一个特殊的 commit**(可能两个,把 staging 和 working 分别存),`refs/stash` 这个 ref 指向最新的。所以:

- stash 不会丢——除非你 `drop` / `clear`
- stash 可以**任意时间**应用,即使切了别的分支
- stash diff 可以用所有 git diff 工具看

`stash@{0}` 这语法是 reflog 风格——`refs/stash` 的第 0 个历史就是最新 stash;`@{1}` 是上一个;依此类推。

---

## 九、什么时候不该用 stash

stash 不是万金油。这些场景**别用 stash**:

| 场景 | 该用 |
| --- | --- |
| 一段较大改动想保留几天 | **新建分支 commit**(不是 stash) |
| 不同人协作的改动 | **commit + push**(stash 是本地的) |
| 长期搁置的实验 | **`wip/xxx` 分支**(stash 列表会被忘) |
| 改了多个独立逻辑想分开存 | **多次 commit + rebase 整理**(stash 不擅长分逻辑) |
| 担心电脑坏掉丢东西 | **commit + push**(stash 只在本地) |

> stash 是"几小时内的临时容器",不是"几天 / 几周的归档"。**长于半天的改动该 commit**——`commit` 之后 reflog 永远救得回,stash 的历史更不稳定。

---

## 十、常见组合用法

### 10.1 pull 之前临时存

```bash
git stash
git pull
git stash pop
```

如果 `pull.rebase=true` 设了之后,pull 自带 stash autostash:

```bash
git config --global rebase.autoStash true
```

之后 `pull --rebase` 会自动 stash + rebase + pop。**几乎完美的 pull 自动化**。

### 10.2 切分支前 stash

```bash
git stash
git switch other-branch
# ... 干完事
git switch original-branch
git stash pop
```

(注意:大多数情况下 git 允许你直接切分支,只要工作区改动不和目标分支冲突——不用 stash 也行。但有冲突时 git 会拒绝切,这时候 stash。)

### 10.3 多 stash 顺序应用

```bash
git stash list
# stash@{0}: feat A wip
# stash@{1}: feat B wip
# stash@{2}: feat C wip

git stash apply stash@{2}    # C 先应用
# 解决 C
git stash apply stash@{1}    # B 后应用
# ... 一个个来
```

> 但如果有这种"多个 stash 累积"的需求,**很可能你应该用分支而不是 stash**。

---

## 十一、踩坑提醒

1. **不带 `-u` 忘新文件**——untracked 新文件没存进 stash,切分支后留在原地造成污染
2. **stash 多了忘清理**——`stash list` 一屏屏,自己也忘了哪个是哪个
3. **依赖 stash@{N} 当长期归档**——drop 一个其他编号全乱;**长期改用分支保存**
4. **`pop` 出冲突慌了**——pop 失败 stash 还在,先 `git reset --hard` 撤销失败的 pop,再 `apply` 试,或 `stash branch` 转分支
5. **以为 stash 会推到远端**——stash 是**本地**的,`git push` 不会推
6. **stash 后切分支删 stash**——`stash drop` 之后 30 天 reflog 也找不太回来(stash 的 reflog 比普通 commit 短)
7. **stash 时不写 message**——一周后看 list 一堆 "WIP on main",不知道哪个是哪个;**养成 `stash push -m "..."` 习惯**

---

下一篇:`12-cherry-pick.md`,讲 cherry-pick 的"挑选 commit 重做"语义、批量 cherry-pick、解冲突、什么时候用 cherry-pick 不该用 merge。
