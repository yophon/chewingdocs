# add 与 commit 基础

`git add` + `git commit` 是 git 用得最多的两条命令,也是**最容易用得粗糙**的两条。一个团队的 git 历史质量高低,基本只看一件事:**commit 是不是有逻辑边界、message 是不是说人话**。这一篇不教你怎么打这两条命令(谁都会),教你怎么**让你 commit 出来的东西半年后还能用**——能 review、能 cherry-pick、能 revert、能 bisect。

> 一句话先记住:**一个 commit 就是一份"说得清楚的最小改动单元"**。说不清楚 = 它不该是一个 commit。把握不住边界、message 写不出来,那不是 git 问题,是**你的工作没拆好**——硬 commit 出去就是给未来挖坑。

---

## 一、`git add` 的几种姿势

```bash
git add foo.txt          # 加单个文件
git add src/             # 加整个目录(递归)
git add .                # 加当前目录所有改动(慎用)
git add -A               # 加整个 repo 所有改动(包括删除)
git add -u               # 只加已跟踪文件的修改/删除,不管新文件
git add -p               # 交互式,逐个 hunk 选(强烈推荐)
git add -i               # 交互式菜单(老式,基本被 -p 替代)
git add -N foo.txt       # 标记"我打算跟踪它",但内容还不进 staging
```

`add .` vs `add -A` vs `add -u` 的差别(在不同 git 版本里行为略有不同,2.x 之后趋同):

| 命令 | 新文件 | 修改 | 删除 |
| --- | --- | --- | --- |
| `add .` | ✅ | ✅ | ✅(2.0+) |
| `add -A` | ✅ | ✅ | ✅ |
| `add -u` | ❌ | ✅ | ✅ |

> 99% 时间该用 `git add -p`。**实在懒,用 `git add -u` 比 `git add .` 安全**——前者不会把意外的新文件(临时下载、IDE 缓存)拉进 git。

---

## 二、commit 的几种姿势

```bash
git commit                     # 打开编辑器写 message
git commit -m "fix: ..."       # 一行 message,适合简单提交
git commit -am "..."           # 等价于 add -u + commit,跳过 staging(慎用)
git commit --amend             # 修改最后一次 commit(改 message 或追加内容)
git commit --no-verify         # 跳过 pre-commit hook(慎用,见 17 篇)
git commit --allow-empty -m    # 空 commit(用于触发 CI)
git commit -s                  # 加 Signed-off-by(很多开源项目要求)
git commit -S                  # GPG 签名 commit(见 22 篇)
```

**`commit -am` 是新人最爱的捷径,也是最容易踩雷的**——它跳过 staging 一次性提交所有跟踪文件的改动,意味着你**没机会用 `--cached` 检查、没机会 `add -p` 精细挑选**,凡是已跟踪文件的所有改动一律打包。短期省事,长期出事故。

---

## 三、原子提交(atomic commit):最重要的工程纪律

**一个 commit 解决一件事**——这是 git 工程师文化里铁律级的规矩。

| 反例(非原子) | 正例(原子) |
| --- | --- |
| "重构 + 修 bug + 加日志" 一起 commit | 拆成三个 commit |
| "改了 50 个文件,message 是 update" | 按逻辑拆成 5 个 commit |
| "先 commit 了再说,反正 squash 时再整理" | commit 时就拆好,别欠债 |

**为什么这件事重要**:

1. **revert**:线上出事要 revert,原子 commit 一条 `git revert <hash>` 搞定;非原子 commit 要么改不干净要么误伤
2. **bisect**:用 git bisect 找 regression(详见 18 篇),非原子 commit 二分一半压根不能编译
3. **cherry-pick**:hotfix 要 pick 到 release 分支,原子 commit 直接 pick;非原子的要先手动剥离
4. **review**:reviewer 一次盯一个逻辑变更思路连贯;混在一起没人看得下去

> **原子 commit 不是洁癖**,是给未来的自己和同事留余地。**当下省 1 分钟拆 commit,事故时多花 30 分钟救火**——这笔账永远不划算。

---

## 四、commit message 的标准写法

工业界事实标准是 **Conventional Commits**(详见 20 篇),最小形式:

```
<type>(<scope>): <subject>

<body>

<footer>
```

`type` 常用一组:

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `refactor` | 重构(不改外部行为) |
| `perf` | 性能优化 |
| `test` | 加测试 |
| `docs` | 文档 |
| `chore` | 杂活(改依赖、改 CI 配置等) |
| `style` | 格式化(空格、换行、不改逻辑) |
| `revert` | 回滚某个 commit |

完整例子:

```
feat(auth): add SSO login via Okta

Existing login still works. Okta button shows up only when
the OKTA_CLIENT_ID env var is set, so dev environments are
unaffected. Token storage shares the same JWT helper as 
password login.

Closes #1234
```

**短 subject 行的硬规则**:

- 不超过 50 字(72 是上限)
- 用**祈使句现在时**:`add` / `fix` / `update`,不是 `added` / `fixes`
- 首字母小写(社区习惯)
- 末尾**不加句号**

> 写不出 subject 行 = 这个 commit 没拆干净。**测试自己 commit 边界的最快办法是逼自己用一句话总结它**——总结不出来就回去拆。

---

## 五、message 的"为什么"比"做了什么"重要

**做了什么**(what)在 diff 里都看得见;**为什么**(why)只有 commit message 能记。

差对比:

❌ **没用的 message**(diff 里全有)

```
fix: change config

- max_size = 100
+ max_size = 200
```

✅ **有用的 message**(讲清楚 why)

```
fix(upload): bump max_size 100→200 to fit invoice PDFs

Customer X complained their PDFs (avg 150KB) were rejected.
We checked storage cost — at projected volumes the bump 
adds ~$20/mo, OK'd by finance on 2026/04/30.
```

> 这条 message 半年后被 `git blame` 翻出来,**你根本不需要再去翻邮件 / Slack 找当时为什么改**——commit message 自己讲清楚了。

---

## 六、`commit --amend`:正确用法和滥用

`--amend` **修改最后一次 commit**——把当前 staging 的内容追加进上一次 commit,生成一个新 commit 替换掉。

正确用途:

- 提交后发现 message 写错:`git commit --amend -m "新 message"`
- 提交后发现漏了一个文件:`git add 漏的.txt && git commit --amend --no-edit`
- 提交后发现写错一行:改完代码 → `git add . && git commit --amend --no-edit`

**滥用警告**:

```bash
# ⚠️ 危险:把已经 push 出去的 commit amend 了再 push
git commit --amend
git push --force        # 把别人 pull 走的 commit 哈希改了
```

amend **改了 commit 哈希**(因为 commit 内容变了)。如果这个 commit 已经 push 给别人,**别人本地是旧哈希,你 force push 之后他下次 pull 会满地找不到**。

**铁律**:**只 amend 没 push 出去的 commit;已 push 的别 amend**——要改就老老实实新加一个 fixup commit。

> 团队协作的 git 事故 80% 跟"对已经 push 的东西做了 history 重写"有关。amend / rebase / reset 都属于这类操作——只对**自己本地、还没 push** 的 commit 用。

---

## 七、空 commit 与签名相关

**空 commit**(`--allow-empty`):没有任何文件改动也能产生一个 commit。看上去没用,实际场景:

- 触发 CI 重跑(改了配置但代码没变)
- 在新仓库标记一个 baseline
- 测试 hook 是否生效

**`-s` Signed-off-by**:开源项目(Linux 内核、Kubernetes 等)要求每个 commit 末尾有 Signed-off-by 行,声明你有权提交这个代码(DCO)。`git commit -s` 自动追加。

**`-S` GPG 签名**:对 commit 加密签名,GitHub 显示 "Verified" 标。详见 22 篇。

---

## 八、`git commit -v`:写 message 时看 diff

写 message 写到一半忘了自己改了啥?

```bash
git commit -v
```

它会在编辑器底下追加 `# 注释` 形式的完整 diff——你边写 message 边能看 diff。**强烈建议把这个设成默认**:

```bash
git config --global commit.verbose true
```

设了之后 `git commit` 就自动等同于 `git commit -v`。

> 这是 git 里少见的"小改动大幅提升体验"——开了之后再也不会写完 message 提交才发现"哦原来那行 console.log 没删"。

---

## 九、commit 之后查看自己刚做了什么

```bash
git show HEAD             # 最后一次 commit 的 message + diff
git show HEAD --stat      # 只看哪些文件改了多少行
git log -1 -p             # 等价于 show HEAD
git diff HEAD~1 HEAD      # 等价于 show HEAD 的 diff 部分
```

发现 commit 错了立刻撤:

```bash
git reset --soft HEAD^    # 撤销 commit,改动留在 staging,马上重提交
git reset HEAD^           # 同上,改动回到 working dir
```

---

## 十、踩坑提醒

1. **`git commit -am` 习惯**——跳过 staging,什么都打包,失去精细控制
2. **commit message 一律 `update`**——半年后看就是天书
3. **大杂烩 commit**——重构 + bug fix + 加日志一起,导致 revert / bisect 都炸
4. **amend 已 push 的 commit**——队友本地哈希错位,force push 会覆盖别人改动
5. **commit 之前不看 `git diff --cached`**——临时 log、TODO、密钥进 commit
6. **不写 body 只写 subject**——丢失了"为什么"的关键信息
7. **`git add .` 当肌肉记忆**——`.env` / 编辑器临时文件 / 密钥被一起 add
8. **commit 后才发现没 add 进来**——下次用 `commit -v` 边看 diff 边写

---

下一篇:`05-log与历史查看.md`,讲 `git log` 的 80% 你没用过的参数、`git diff` 的对比模型、`git blame` 怎么用来追祖先、和 `git show` 的本质。
