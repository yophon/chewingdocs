# submodule 与 subtree

git 的"嵌套仓库"功能有两种实现:**submodule** 和 **subtree**。两者解决同一个问题——"我的项目里要包含另一个 git 项目"——但**实现思路天差地别**,坑也不一样。这一篇讲清楚两者的差别,以及第三种工业界更主流的选择:**monorepo 一把梭,别折腾嵌套**。

> 一句话先记住:**submodule = 我的仓库里记一个"另一个仓库的某 commit hash"指针,代码不在我这,要 init 才下来**。**subtree = 把另一个仓库的内容**真复制进我的仓库**,合并进我的历史**。前者轻、坑多、协作复杂;后者重、稳、简单。**90% 场景该用 subtree 或 monorepo,别上 submodule**。

---

## 一、submodule:外部仓库的"指针"

### 1.1 加 submodule

```bash
git submodule add git@github.com:org/lib.git vendor/lib
git status
# new file:   .gitmodules
# new file:   vendor/lib
git commit -m "add lib as submodule"
```

`.gitmodules` 文件:

```ini
[submodule "vendor/lib"]
    path = vendor/lib
    url = git@github.com:org/lib.git
```

而 `vendor/lib` **看上去是个目录**,但 git 把它当成一个**特殊的"提交对象"**——记着"这个 submodule 此刻指向 lib 仓库的哪个 commit"。

```bash
git ls-tree HEAD vendor/lib
# 160000 commit a3f5b2c4... vendor/lib
```

`160000` 是 git 给 submodule 用的特殊 mode——**不是 blob、不是 tree,而是 commit 引用**。

### 1.2 clone 含 submodule 的仓库

新人 clone 父仓库,**默认 submodule 是空的**:

```bash
git clone <parent-repo>
ls vendor/lib    # 空目录!

# 必须额外:
git submodule init
git submodule update
# 或一步:
git submodule update --init --recursive

# 或 clone 时一起:
git clone --recurse-submodules <parent-repo>
```

> "这个项目我 clone 完跑不起来,缺一堆文件"——80% 是没 init submodule。**这个体验已经够坑了**,后面还有更多。

### 1.3 更新 submodule 到最新

```bash
cd vendor/lib
git pull origin main           # submodule 内部就是个独立 git 仓库,可以正常操作
cd ..
git add vendor/lib             # 父仓库要 add 这个"指针变动"
git commit -m "bump lib to latest"
```

或一行:

```bash
git submodule update --remote vendor/lib
```

### 1.4 submodule 的"detached HEAD"

进 submodule 默认是 detached HEAD:

```bash
cd vendor/lib
git status
# HEAD detached at a3f5b2c
```

因为父仓库记的是 commit hash 不是分支名。在 submodule 里改代码要先 `git switch -c branch`,否则 commit 漂浮(详见 06 篇)。

---

## 二、submodule 的坑——为什么大家都讨厌它

### 2.1 状态不直观

`git status` 在父仓库里看 submodule 的方式很奇怪:

```
modified:   vendor/lib (new commits)
modified:   vendor/lib (modified content)
modified:   vendor/lib (modified content, untracked content)
```

每种状态都不一样——有时是 submodule 里有新 commit、有时是 working dir 改了、有时是有 untracked。

### 2.2 协作灾难

队友 A 在 submodule 里 commit 了 D:

```
父:  → C (lib → 老 hash)
A:   → C → D' (lib → 新 hash,新 commit)
```

A push 父仓库,**但 submodule 内的新 commit 没 push**——队友 B 拉 A 的父仓库,init submodule,**报错"找不到那个 hash"**。

**正确流程应该是 A 先 push submodule,再 push 父**。但**没有 git 机制强制这件事**——99% 的事故来自这。

### 2.3 切分支噩梦

父仓库切分支时,submodule **不会自动切**——它还停在原来的 commit。

```bash
git switch other-branch
# vendor/lib 还是原来的 commit,可能完全和 other-branch 期望的对不上
git submodule update     # 必须手动同步
```

设 `submodule.recurse = true` 缓解:

```bash
git config --global submodule.recurse true
```

之后大部分命令(checkout / switch / pull)会自动同步 submodule。**但仍然不是万能**——细节处依然坑。

### 2.4 删 submodule 流程极其繁琐

```bash
# 1. 取消注册
git submodule deinit -f vendor/lib

# 2. 从 git 历史移除
git rm -f vendor/lib

# 3. 删 .git/modules 里的残留
rm -rf .git/modules/vendor/lib

# 4. 改 .gitmodules(如果只有这一个 submodule 直接删,否则删条目)
git add .gitmodules

# 5. commit
git commit -m "remove submodule"
```

**5 步,不能少**。少一步下次会出鬼问题。

---

## 三、subtree:把外部代码"合"进来

`git subtree` 是另一种思路:**把另一个仓库的内容直接合并到我的仓库的某子目录里**——代码就在,不需要 init 不需要 update。

### 3.1 加 subtree

```bash
git subtree add --prefix=vendor/lib git@github.com:org/lib.git main --squash
```

`--prefix` 指目标子目录、最后一个参数是要合的分支、`--squash` 把 lib 的全部历史压成一个 commit。

之后 `vendor/lib` 里就有 lib 的代码——**就是普通文件**,没 submodule 那种特殊状态。

### 3.2 拉 lib 的更新

```bash
git subtree pull --prefix=vendor/lib git@github.com:org/lib.git main --squash
```

### 3.3 把改动推回 lib

```bash
git subtree push --prefix=vendor/lib git@github.com:org/lib.git my-feature
```

---

## 四、subtree vs submodule 对比

| 维度 | submodule | subtree |
| --- | --- | --- |
| 仓库大小 | 父仓库轻(只存 hash) | 父仓库重(带 lib 全部历史) |
| clone 步骤 | 必须额外 init | 一次 clone 完事 |
| 协作友好 | ❌ 容易忘 push,队友拉爆 | ✅ 一切都在父仓库里 |
| lib 改动同步 | 双向方便 | 双向能做但更繁 |
| 学习成本 | 高(状态、命令、坑都多) | 低(普通 git 命令) |
| 历史保留 | 完整(在 lib 仓库) | 可选 squash |
| 适合场景 | 真的 vendor 第三方,改动很少 | 想用别人代码、可能小改 |

> 一条主观但**广泛认同的建议**:**没强需求别上 submodule**。subtree 99% 场景够用,且队友幸福度高 10 倍。submodule 留给"真的需要独立 versioning 的 vendor"——大多数项目不该走这条路。

---

## 五、第三种选择:monorepo

如果 lib 是**你团队自己写的**(不是第三方),为什么要分两个仓库?

**直接把 lib 和 app 放一个仓库**:

```
my-monorepo/
├── packages/
│   ├── lib/
│   │   └── package.json
│   └── app/
│       └── package.json
├── package.json
└── pnpm-workspace.yaml    # 或 turbo.json / nx.json
```

工具支持(pnpm workspace / yarn workspace / nx / turbo / lerna):

- `lib` 和 `app` 各自独立编译、测试
- `app` 可以 `import lib`(走 workspace 链接)
- 改 `lib` 立刻在 `app` 里看到

**好处**:

- 一个 PR 同时改 `lib` 和 `app`,review 一起、CI 一起跑
- 没 submodule / subtree 的协作复杂性
- 大改重构跨包 atomic

**坏处**:

- 仓库变大(可控,看 21 篇大仓库优化)
- 不适合"lib 要给外部用户"的开源项目(那种 lib 必须独立仓库)

> Google / Meta / Microsoft 都是 monorepo,Linux 内核也是某种意义上的 monorepo。**只有"必须分仓库才能版本化 / 给外部用"的场景才用 submodule / subtree**。内部项目、内部库,monorepo 是默认。

---

## 六、典型 submodule 场景(确实需要时)

不是说 submodule 永远不该用,这些场景它合理:

1. **vendor 第三方代码 + 偶尔有自己 patch**:你不想 fork 维护,但需要打补丁。submodule 指你的 fork 仓库,你的 fork 跟踪 upstream
2. **某个组件必须有独立版本号、独立发布周期**:比如内部 SDK 给多个项目共用,各项目锁不同版本
3. **真的"我只想引用,不想合并到我的历史"**:比如文档站引用一个示例项目

绝大多数场景**这些理由都站不住**——上面三个里有两个 monorepo + workspace + 版本号管理可以替代。

---

## 七、submodule 的几个常用命令汇总

```bash
# 加
git submodule add <url> <path>

# 初始化(clone 后第一次)
git submodule update --init --recursive

# 拉所有 submodule 最新
git submodule update --remote --recursive

# 看所有 submodule 状态
git submodule status

# 在每个 submodule 跑命令
git submodule foreach 'git status'
git submodule foreach --recursive 'git pull origin main'

# 删
git submodule deinit -f <path>
git rm -f <path>
rm -rf .git/modules/<path>
```

---

## 八、subtree 的几个进阶用法

### 8.1 提取一个目录到独立仓库

`git subtree split` 把仓库的某个子目录变成独立的 commit 链:

```bash
git subtree split --prefix=packages/lib --branch=lib-extracted
git push git@github.com:org/lib.git lib-extracted:main
```

**典型用途**:monorepo 里的 lib 想拆出来变独立仓库——这一招完整保留 lib 的历史。

### 8.2 不 squash 保留完整历史

```bash
git subtree add --prefix=vendor/lib <url> main    # 不带 --squash
```

完整历史合进父仓库——**lib 每个 commit 都进了父仓库的 log**。**通常不推荐**,除非你真的需要这种全息历史。

---

## 九、嵌套仓库的 .gitignore 互动

submodule 内部有自己的 .gitignore——**和父仓库无关**。父仓库 .gitignore 不影响 submodule 内部。

`.gitmodules` 文件**应该**进 git(团队共享 submodule 配置),但 `.git/modules/` 不进——它是本地 metadata。

---

## 十、踩坑提醒

1. **clone 完忘 init submodule**——项目跑不起来,文件神秘缺失
2. **submodule 内 commit 忘 push**——队友拉父仓库报错"找不到 hash"
3. **submodule 不 push 就 push 父**——同上,队友灾难
4. **切父仓库分支不同步 submodule**——状态错位,跑出怪 bug
5. **subtree 用了 squash 之后忘了它合时是 squash**——再 pull 时不一致
6. **真该用 monorepo 上了 submodule**——内部项目用 submodule 自找苦吃
7. **submodule 在 detached HEAD 改代码**——commit 漂浮,要先 switch -c
8. **删 submodule 步骤少一步**——`.git/modules` 里残留,下次 add 同名报错

---

下一篇:`17-Git-Hooks.md`,讲 git hooks 的工作机制、pre-commit / pre-push 等几个生命周期、husky + lint-staged 套件、和服务端 hook 的差别。
