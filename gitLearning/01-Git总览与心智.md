# Git 总览与心智

学 git 的最大障碍不是"命令记不住",是**心智模型没建起来**。一个用了五年 git 的人,如果还把它当"带历史的网盘",那遇到 rebase / cherry-pick / detached HEAD 就会瞬间懵。这一篇不教命令,只讲一件事:**git 到底是什么**。建对模型,后面 21 篇都是顺水推舟;模型错了,记再多命令也是临时记忆。

> 一句话先记住:**git 是一棵 commit 组成的有向无环图(DAG),分支只是指向某个 commit 的指针**。这一句听上去很学院派,但 git 95% 的"反直觉行为"都源于这个事实——`reset` 不删 commit、rebase 重写历史、reflog 永远救得回、HEAD 可以 detached……都因为这是图,不是文件夹。

---

## 一、git 不是 SVN,不是网盘

很多人对 git 的初始印象是"高级一点的 SVN",这个印象会让你**永远学不会 git**。

| 维度 | SVN(集中式) | Git(分布式) |
| --- | --- | --- |
| 历史存哪 | 中央服务器 | **每台机器都有完整历史** |
| 离线工作 | 不能 commit | 全部能干,只 push 时联网 |
| 分支 | 路径,新建很贵 | **指针,新建几乎免费** |
| 合并 | 中心化串行 | DAG,任意两点可合 |
| 心智 | "目录树 + 版本号" | **"提交图 + 引用"** |

**最要命的差别**:SVN 的版本号是 1, 2, 3, 4 这种全局递增数字,而 git 没有"版本号",有的是 commit 的 SHA-1 哈希(`a3f5b2c...`)。这不是设计风格的差异,这是**整个数据模型的差异**——git 没有"线性历史"这个概念,它只有"图"。

> 如果你脑子里 git 的心智还是"主分支是一条直线,大家往上加",那你 80% 的协作冲突会想不通。**真正的 git 是一张随时分叉、随时合并的图**,主分支只是图上一条特别长的路径而已。

---

## 二、git 的核心数据模型:四种对象

git 底层只有四种对象,理解了这四种,git 命令背后干的事都看得见。

```
blob    →  文件内容(只存内容,不存文件名)
tree    →  目录(包含一组 blob + 子 tree + 文件名)
commit  →  快照 + parent 指针 + 作者 + 时间 + 信息
tag     →  指向某个 commit 的"带名字的引用"(annotated tag)
```

每个对象都用**自身内容的 SHA-1 哈希**作为唯一 ID。这个设计有几个直接后果:

1. **任何人在任何机器上算同一段内容,得到的哈希一定相同**——所以 git 可以无中心同步
2. **改动任何一个 commit,它的哈希就变了,它后面所有 commit 哈希也都变**——所以 rebase 会"重写"
3. **只要哈希在硬盘上,对象就还在**——所以 reflog / fsck 能救回看似删掉的东西

> 这就是为什么 git 哈希看起来又长又丑(`a3f5b2c4d8e9...`)——它不是版本号,它是**内容的指纹**。SVN 的 r123 是人编的,git 的 a3f5b2c 是数学算出来的,**不可能撞、不可能假**。

---

## 三、commit 不是 diff,是快照

最普遍的误解:"git commit 存的是这次改了什么"。**错**。git commit 存的是**这次提交时整个项目的快照**——一个 tree 对象,指向所有文件当时的内容。

```
commit a3f5b2c
├── tree   →  整个项目此刻的目录树
├── parent →  上一次 commit 的哈希(可能多个,merge commit)
├── author / committer / date
└── message
```

那 diff 怎么来的?**git 现算的**——拿当前 commit 的 tree,跟 parent 的 tree,递归比 blob 哈希,不一样的就是 diff。这个设计听起来"浪费空间",但配合 git 的 packfile 压缩,实际上比 SVN 的 diff 链快得多——**因为读取任何一个版本都是 O(1),不用顺着 diff 一路重放**。

| 维度 | "存 diff"模型(SVN) | "存快照"模型(Git) |
| --- | --- | --- |
| 读历史版本 | 从最近版本反推 diff,慢 | 直接读 tree,O(1) |
| 占用空间 | 看上去小 | 靠压缩,实际更小 |
| 心智 | "时间线 + 增量" | "森林 + 指针" |

**这件事还推出一个关键事实**:git 的 commit 是**不可变的**。改了就是新 commit、新哈希。所谓"修改 commit"(`commit --amend`)其实是**生成一个新 commit 替换掉旧指针**——旧 commit 还躺在硬盘上,所以才有 reflog 能救。

---

## 四、分支与 HEAD:指针,不是文件夹

到这里就可以理解 git 最简洁也最强大的设计:**分支是指向某个 commit 的可变指针**。

```
            ┌──── main ────┐
            ↓               ↓
A ──→ B ──→ C ──→ D ──→ E ──→ F
                     ↑
                   feature

HEAD → main(我现在在 main 分支)
```

- `main`、`feature`、`bugfix-x` 都是文件,内容就一行,是某个 commit 的哈希
- `HEAD` 也是个文件,内容是 "我现在在哪个分支"(或"detached 在哪个 commit")
- `git checkout feature` 干的事:把 HEAD 改成指向 feature,工作区内容刷成 feature 指向的 commit

这件事的副作用极其优雅:

- **新建分支 = 写一个 41 字节的文件**,所以分支随便建,不像 SVN 要复制整个目录
- **删分支 = 删那个文件**,commit 本身一个不少地留着
- **切分支 = 改 HEAD + 刷工作区**,毫秒级

> 永远记住:**分支不"包含" commit,分支"指向" commit**。一个 commit 可以同时被多个分支指向(merge / 多分支共享祖先);一个 commit 也可以不被任何分支指向(reflog 才找得到)。

---

## 五、git 三层工作区:working / staging / repo

git 的另一个反直觉设计:文件改动经过**三层**才进入历史。

```
工作区 (working dir)
       ↓ git add
暂存区 (staging / index)
       ↓ git commit
仓库   (repo / .git)
```

| 区 | 是什么 | 你操作的命令 |
| --- | --- | --- |
| 工作区 | 你眼睛看到的目录 | 直接 vim / IDE 改 |
| 暂存区 | "下次 commit 要进去什么"的清单 | `git add` / `git rm` |
| 仓库 | 已经永久记录的历史 | `git commit` / `git reset` |

**为什么要 staging?** SVN 没有这一层,改了直接 commit。git 加这一层是因为:**真实工作里你一次会同时改 5 个文件,但只想把其中 3 个打成一个有意义的 commit**。staging 让你**精挑细选哪些改动凑成一个原子提交**——这是 git 工程师文化的核心:**commit 应该是有逻辑边界的小单元,不是"工作了一下午"的乱炖**。

> 没用过 `git add -p`(交互式逐块 add)的人,等于没用过 git 的精细 commit 能力。这一招后面 04 篇会专门讲。

---

## 六、为什么 rebase / cherry-pick / reflog 都不神秘

把上面五件事串起来,git 那些"高级"操作都自然了:

| 操作 | 实际干了什么 |
| --- | --- |
| `git merge` | 把两个 commit 合并成一个新 commit(两个 parent) |
| `git rebase` | 把一串 commit **重新写一遍**,基于另一个 commit 当 parent。新 commit 哈希全变,旧的留在 reflog |
| `git cherry-pick X` | 拿 X 这个 commit 的 diff,在当前分支上**重新做一遍**,生成新 commit |
| `git reset --hard X` | 把当前分支指针挪到 X,工作区刷成 X 的快照。**老 commit 哈希还在,只是没指针了** |
| `git revert X` | **新建一个反向 commit**,效果是抵消 X(不动历史) |
| `git reflog` | 显示所有 HEAD / 分支指针的移动记录,即使 commit 没分支指了也能找到 |

> 一旦你看清"分支是指针、commit 是不可变快照、reflog 记录所有指针动作",git 就再没有黑魔法了。**rebase 不是危险——它是"重写一段历史的清晰命令";`reset --hard` 不会丢数据——只要哈希还在 reflog 里就找得回**。

---

## 七、用 git 的两种心态

学 git 的人有两种,两种人差别不在命令熟练度,在**心态**:

**A. "git 是危险的,我别动太多"**
- 只用 add / commit / push / pull
- 不敢 rebase,怕"丢提交"
- 出事了第一反应是删仓库重 clone
- 永远学不会 git

**B. "git 是图操作工具,我能精确控制每一步"**
- rebase / cherry-pick 当家常便饭
- 出事了先 `git reflog`
- 能写出干净的 commit 历史让别人 review 时省时间
- 半年后能给别人解释 detached HEAD

> 转变的关键是**信任 reflog**。reflog 默认保留 90 天,意味着**90 天内你做的任何操作都能撤销**。一旦相信这件事,你就敢动 git 了——动得越多,熟得越快。

---

## 八、本系列的整体地图

```
01     总览(这篇)
02-05  基础:配置 → 三层模型 → add/commit → log
       这一段是"会用 git" 的全部,优先级最高

06-10  分支与协作:branch / merge / rebase / push / tag
       这一段是"和别人 git" 的核心,缺一不可

11-15  应急与整理:stash / cherry-pick / reset / reflog / gitignore
       这一段是"出事时救命",每篇对应一个真实事故场景

16-22  工程化:submodule / hooks / worktree / 工作流 / 大仓库 / 安全
       这一段是"团队 / 大项目"层面,按需看
```

**优先级**:01-10 每篇都建议看;11-15 按需,但 14 reflog 强烈推荐;16 之后看团队规模。

---

## 九、踩坑提醒(总览版,后面每篇细讲)

1. **把 git 当 SVN 用**——只用 commit / push / pull,永远摸不到 git 真正的好
2. **怕 rebase**——rebase 不会丢东西,丢东西的是不会用 reflog 的人
3. **不读 git status**——很多事故源于"我以为现在干净了,其实还有未 commit 的改动"
4. **commit message 写 "fix"** ——一个月后你和同事都看不懂这是修了什么
5. **不分支直接在 main 上工作**——团队协作大忌,审 PR / rebase / 回滚都做不了
6. **乱用 `git push --force`**——强推到共享分支会把别人的提交覆盖,**`--force-with-lease` 永远比 `--force` 安全**
7. **不知道 reflog**——上面说过,就是这一招让 git 成为"敢动的工具"
8. **submodule 用一次哭三天**——除非真的需要,否则别上 submodule(详见 16 篇)
9. **不写 .gitignore**——node_modules / .env / dist 进了 git 之后清不掉,污染历史
10. **认为合并冲突很神秘**——其实就是两个改动碰一起了,看 diff 就懂(详见 07 篇)

---

下一篇:`02-安装配置与三层config.md`,讲 git config 的 system / global / local 三层、`.gitconfig` 怎么写最有用的别名、为什么有人改 commit 一直显示成别人。
