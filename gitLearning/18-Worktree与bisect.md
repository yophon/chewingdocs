# Worktree 与 bisect

这两个命令长期被低估——`worktree` 解决"我想同时开两个分支干不同事"、`bisect` 解决"哪个 commit 引入了这个 bug"。两者都不是日常命令,但**关键时刻一招回血**。掌握之后,git 的"高级功能感"才真正打开。

> 一句话先记住:**`worktree` 是"一个 .git,多个工作区"** ——不再 stash 来 stash 去切分支。**`bisect` 是 git 帮你二分定位 regression**——给一个"好" commit 一个"坏" commit,git 自动 checkout 中间点,你测试,告诉它好坏,几次迭代精确锁定罪魁祸首。**两者都不流行,但学会的人离不开**。

---

## 一、worktree:一个仓库多工作区

### 1.1 痛点

你在 `feature` 分支写代码,正在改一半。突然要紧急 review 别人的 PR,需要切到 `pr-456` 分支跑起来。怎么办?

**老办法**:

```bash
git stash
git switch pr-456
# review
git switch feature
git stash pop
```

或:

```bash
git commit -m "wip"
git switch pr-456
# review
git switch feature
git reset --soft HEAD^
```

两种都**打断了 feature 分支的工作环境**——node_modules 可能要重装、IDE 索引重建、本地服务重启……

**worktree 的解法**:**给 pr-456 开一个独立目录**,两个分支在硬盘上同时存在。

### 1.2 创建 worktree

```bash
# 在仓库目录下
git worktree add ../my-repo-pr456 pr-456
# 这会:
# 1. 在 ../my-repo-pr456 创建一个新目录
# 2. checkout pr-456 分支到那个目录
# 3. 那个目录共享同一个 .git/objects(节省空间)
```

之后:

```bash
cd ../my-repo-pr456
# 这里就是 pr-456 分支的完整工作区
ls           # 包括 node_modules / .env / 可独立跑
```

**两边互不影响**——你在 `feature` 改代码,对面 `pr-456` 一样能跑、能改、能 commit。

### 1.3 worktree 列表与删除

```bash
git worktree list
# /path/to/my-repo            a3f5b2c [main]
# /path/to/my-repo-pr456      d8e9f0a [pr-456]

git worktree remove ../my-repo-pr456    # 删除 worktree(不删分支)
git worktree prune                       # 清理已删除目录的 worktree 记录
```

### 1.4 worktree 的限制

- **同一个分支不能同时在两个 worktree**——避免两边 commit 冲突
  - 想看老分支?基于 commit 建临时分支或 detach
- **删 worktree 之前先确保分支不在那**(用 `worktree list` 确认)
- 共享同一个 `.git/objects`,所以一个 worktree 里 commit、其他 worktree 立刻能看到那个 commit

### 1.5 典型用法场景

| 场景 | 怎么做 |
| --- | --- |
| 紧急 review 一个 PR | `git worktree add ../review-pr branch-pr` |
| 同时跑两个版本对比性能 | 两个 worktree,分别在不同 commit |
| 长跑 bisect 过程中要做别的 | 主 worktree 做日常,bisect 在另一个 worktree |
| 同时维护多个 release 分支 | 每个 release 一个 worktree |
| Claude Code 的隔离 worktree | 在 worktree 里让 AI 改,主 worktree 不受影响 |

> Claude Code 的 EnterWorktree / ExitWorktree 工具就是基于这个机制——**主仓库不受 AI 改动影响,worktree 里随便折腾,确认无误后合回主仓库**。详见 claudeLearning/05。

### 1.6 临时 worktree 看老 commit

```bash
git worktree add --detach ../tmp-old a3f5b2c
cd ../tmp-old
# 这里是 a3f5b2c 那个 commit 的样子,可以跑、可以测
cd -
git worktree remove ../tmp-old
```

**比 `git checkout a3f5b2c` 然后 `git checkout main` 切回来安全**——不会动主 worktree。

---

## 二、bisect:二分查找罪魁祸首

### 2.1 痛点

"上周代码还好,今天发现某功能挂了——是中间哪个 commit 引入的?"

中间可能有 50 个 commit。一个个手动 checkout 测试要 50 次。**bisect 用二分,只需要 log₂(50) ≈ 6 次**。

### 2.2 基本流程

```bash
# 1. 启动 bisect
git bisect start

# 2. 标记当前 HEAD 是"坏的"
git bisect bad

# 3. 标记一个已知好的 commit(比如一周前)
git bisect good a3f5b2c
# 或 git bisect good HEAD~50

# 4. git 自动 checkout 中间点,你测试
#    Bisecting: 24 revisions left to test after this (roughly 5 steps)
npm test    # 或手动跑你要测的功能

# 5. 根据测试结果告诉 git
git bisect good          # 这个 commit 没问题
# 或
git bisect bad           # 这个 commit 有问题

# 6. git 继续二分,你重复 4-5
# ... 几轮之后:
# a3f5b2c4d8e9f0a1b2c3d4e5 is the first bad commit
# commit a3f5b2c4d8e9f0a1b2c3d4e5
# Author: ...
# Date: ...
# 
#     fix: handle null in upload     ← 罪魁祸首

# 7. 退出 bisect,回到原来 HEAD
git bisect reset
```

> 5-6 次迭代,精确找到第一个引入 bug 的 commit。**比 50 个 commit 一个个回滚强 10 倍**。

---

### 2.3 自动化 bisect:`git bisect run`

如果你能写一个脚本判断"这个 commit 好 or 坏"(脚本退出 0 = 好,非 0 = 坏),让 git 全自动:

```bash
git bisect start HEAD a3f5b2c    # 一行带上 bad 和 good
git bisect run npm test
# 或自定义脚本:
git bisect run ./test-script.sh
```

git 自动:checkout → 跑脚本 → 看退出码 → 标好坏 → 继续。**全程无人值守**。

```bash
# test-script.sh
#!/usr/bin/env bash
npm install --silent || exit 125    # 125 = 跳过(无法判断)
npm test feature/upload || exit 1   # 1 = 坏
exit 0                               # 0 = 好
```

退出码:

| 码 | 意思 |
| --- | --- |
| 0 | 好 |
| 1-124 / 126-127 | 坏 |
| 125 | 跳过(commit 自身有编译问题等无法判断) |
| 128+ | 终止 bisect |

### 2.4 bisect 的进阶

**跳过某些 commit**(无法编译):

```bash
git bisect skip       # 当前的跳过
git bisect skip a3f5b2c..d8e9f0a    # 跳过一段
```

**用 term 替换 good/bad**(语义更清楚):

```bash
git bisect start --term-old=fast --term-new=slow
git bisect slow      # = bad
git bisect fast      # = good
```

适合"哪个 commit 让性能下降"——"slow"比"bad"准确。

---

## 三、bisect + worktree:终极组合

bisect 过程中你想边查边写代码?**用 worktree 隔离**:

```bash
# 主 worktree:正常开发
cd /path/to/main-worktree

# 开个 bisect 专用 worktree
git worktree add ../bisect-tmp main
cd ../bisect-tmp
git bisect start HEAD a3f5b2c
git bisect run npm test
# bisect 在这里跑,主 worktree 不受影响

# 完事:
git bisect reset
cd -
git worktree remove ../bisect-tmp
```

**两边同时干活**——你在主 worktree 写代码,bisect 在另一个 worktree 全自动找 bug。

---

## 四、worktree 的最佳实践

### 4.1 worktree 命名

```bash
# 好的命名(后缀对应分支)
git worktree add ../myproject-pr456 pr-456
git worktree add ../myproject-hotfix-1.0 hotfix/1.0.x

# 差的命名
git worktree add ../tmp some-branch    # 一个月后忘了"tmp"是什么
```

### 4.2 worktree 集中放一个目录

```
~/repos/
├── myproject/                  ← 主仓库
└── myproject-worktrees/
    ├── pr456/
    ├── hotfix-1.0/
    └── experiments/
```

或者用 git 推荐的 bare repo 方案:

```
~/repos/myproject/
├── .bare/                      ← bare 仓库
├── main/                       ← worktree
├── feature-x/                  ← worktree
└── pr456/                      ← worktree
```

### 4.3 worktree 和 IDE

VS Code / IntelliJ 都把 worktree 当独立项目处理——**两边各自有自己的 IDE 索引、运行配置、终端**。**完美隔离**。

---

## 五、bisect 的最佳实践

### 5.1 写得动的"测试脚本"

bisect run 的脚本越简单越好——**复杂的脚本本身可能有 bug**,导致 bisect 结果错。

最小可行脚本:

```bash
#!/usr/bin/env bash
npm install --silent || exit 125
npm run build || exit 125
node -e "require('./dist').uploadFile('test.txt')" || exit 1
exit 0
```

### 5.2 提交粒度决定 bisect 友好度

**原子 commit 让 bisect 高效**——每个 commit 都能编译 / 跑;非原子 commit 中间状态可能压根编译不过,bisect 大量 skip。

**这就是 04 篇强调"原子 commit"的另一个理由**——bisect 友好度。

### 5.3 找到 commit 之后

bisect 完了告诉你"a3f5b2c 是第一个坏 commit"。下一步:

1. `git show a3f5b2c` 看那个 commit 改了什么
2. 找到引入 bug 的具体改动
3. 修 bug、写 test、commit
4. 留 commit message:`fix: <bug>; introduced in a3f5b2c`

> bisect 结果告诉你**哪个 commit**,但你还要看 diff **找哪一行 / 哪个改动**。bisect 是定位手段,不是修 bug 手段。

---

## 六、worktree 与 bisect 的小坑

### 6.1 worktree 和 submodule

worktree + submodule 组合有边界条件——submodule 在每个 worktree 是独立的状态。**用得少,出问题搜文档**。

### 6.2 bisect 会污染 reflog

bisect 期间 git 反复 checkout,reflog 里全是 `bisect` 的条目。**结束后 `git reflog | grep -v bisect` 找清晰记录**。

### 6.3 bisect 中断恢复

bisect 中途机器关机 / 终端断了?重连后 git 还记得你的 bisect 状态:

```bash
git bisect log       # 看进度
# 继续标 good / bad
```

### 6.4 错标了怎么办

```bash
git bisect log > saved.txt    # 保存进度
git bisect replay saved.txt   # 重放(可以编辑文件改正错标)
```

---

## 七、踩坑提醒

1. **不知道 worktree**——切分支永远 stash 来 stash 去
2. **删了 worktree 目录但没 `worktree remove`**——`git worktree list` 残留
3. **worktree 里 checkout 主分支同分支**——git 拒绝(同分支不能两 worktree),但报错信息可能让人困惑
4. **bisect 不写 test 脚本手动测**——50 个 commit 测得腰酸背疼
5. **bisect 完忘 reset**——还在 detached HEAD,以为代码丢了
6. **commit 不够原子,bisect 大量 skip**——精度下降到几个 commit 范围
7. **bisect 找到 commit 就当 root cause**——commit 是位置,bug 在 diff 里某一行
8. **worktree 移动 / 重命名目录**——git 找不到了,要手动改 `.git/worktrees/<name>/gitdir`

---

下一篇:`19-工作流模型.md`,讲 GitFlow / GitHub Flow / Trunk-Based / Release Branch 几种主流工作流的取舍、什么团队规模选哪种、为什么大厂越来越偏 trunk-based。
