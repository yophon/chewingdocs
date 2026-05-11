# .gitignore 详解

`.gitignore` 看上去傻——一个文本文件,一行一个 pattern。但**真实工程里它是事故频发地带**:`node_modules` 还是被 commit 了、`.env` 已经在历史里清不掉了、IDE 临时文件污染所有 PR、Mac 的 `.DS_Store` 让 Linux 同事抓狂。这一篇讲清楚 .gitignore 的匹配规则、三层忽略机制、已跟踪文件的撤回办法、和"明明写了为什么没生效"。

> 一句话先记住:**.gitignore 只对"git 还不知道的文件"生效**——已经被 git 跟踪过的文件,后写 .gitignore 也没用,要先 `git rm --cached` 让 git 忘记。这是 90% 的"我写了 .gitignore 怎么还在追"的根源。

---

## 一、最基础的 .gitignore

```gitignore
# 注释,以 # 开头

# 直接列文件名:匹配仓库里所有同名的(任何深度)
.DS_Store
Thumbs.db

# 通配符:*
*.log
*.tmp
*.pyc

# 目录(末尾加 / 强调是目录)
node_modules/
dist/
build/
__pycache__/

# 排除某个文件不被忽略(! 反向规则)
*.log
!important.log

# 仓库根目录开始的精确路径(以 / 开头)
/secrets.json     # 只忽略仓库根的,不影响子目录的同名

# 任意层级匹配(默认行为)
secrets.json      # 任何子目录里的 secrets.json 都忽略
```

---

## 二、匹配规则全解

git 用 `gitignore` 风格的 glob:

| 模式 | 匹配什么 |
| --- | --- |
| `*.log` | 任何 `.log` 结尾文件,**所有目录** |
| `/*.log` | 仅根目录的 `.log` 文件 |
| `dir/` | 任何叫 `dir` 的目录(及其内容) |
| `dir/*.log` | 任何 `dir/` 里的 `.log` 文件 |
| `**/dir/` | 任何路径下的 `dir` 目录(`**` 跨多层) |
| `dir/**` | `dir` 里**所有**子文件 / 子目录(递归) |
| `?` | 单个字符通配 |
| `[abc]` | 字符类(a 或 b 或 c) |
| `[a-z]` | 字符范围 |
| `!pattern` | 反向规则,**取消**之前的忽略 |

**关键陷阱**:

- 一个 pattern **不带 `/`** 的话,**任何深度**都匹配
  - `node_modules` 匹配 `./node_modules` 和 `./packages/x/node_modules`
- 一个 pattern **带 `/`** 在末尾,只匹配目录
  - `dist/` 匹配 `./dist` 但不匹配文件 `dist`
- `!` 排除规则**只能取消已被忽略的文件**——已被忽略的目录里的文件**用 `!` 取消不了**(除非它们的目录没被忽略)

后面的"`!` 失效"陷阱细讲。

---

## 三、`!` 反向规则的坑

错误示范:

```gitignore
node_modules/
!node_modules/some-package/important.txt
```

**这个 `!` 没用**——因为 `node_modules/` **整个目录**被忽略了,git 根本不会扫描它内部,`!` 取消不了。

正确做法:**目录别完全 ignore,只 ignore 里面的内容**:

```gitignore
node_modules/*
!node_modules/some-package/
!node_modules/some-package/important.txt
```

逐级"打洞"。

> 一条铁律:**`!` 不能从已被忽略的目录里挖文件出来**。要么从一开始就别整个 ignore 那目录,要么写多级反向规则一层层放行。

---

## 四、`.gitignore` 的三层

git 查 ignore 规则**从近到远**:

```
1. <repo>/.gitignore                        ← 仓库根、子目录都可以有
2. <repo>/.git/info/exclude                 ← 仓库本地,不进 git
3. ~/.config/git/ignore                     ← 全局(用户级)
```

每层的用途:

| 层 | 干啥 | 进 git? |
| --- | --- | --- |
| `.gitignore`(仓库) | 团队共享的忽略规则 | ✅ 进 git |
| `.git/info/exclude` | **只你这个仓库本地**的私人忽略 | ❌ |
| `~/.config/git/ignore` | **你这台机器所有仓库**的私人忽略 | ❌ |

> **个人 IDE 配置(`.idea/`、`.vscode/`)、操作系统垃圾(`.DS_Store`、`Thumbs.db`)**应该放 global 那层——队友的 IDE / OS 不一定跟你一样,**他们的 IDE 配置不是你 commit 的事**。仓库 .gitignore 写的是"和这个项目相关的、所有人都该忽略的"。

设全局 ignore:

```bash
git config --global core.excludesFile ~/.config/git/ignore
```

```gitignore
# ~/.config/git/ignore
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp
.env.local
```

---

## 五、子目录 .gitignore

仓库根的 `.gitignore` 不是唯一一个——**每个子目录都可以有自己的 `.gitignore`**,只对该目录及子目录生效。

```
repo/
├── .gitignore           ← 全局规则
├── docs/
│   └── .gitignore       ← 只对 docs/ 生效
└── src/
    └── .gitignore       ← 只对 src/ 生效
```

子目录规则**叠加**(不是覆盖)父目录,但能用 `!` 在子里反向取消父里的规则。

> 大型 monorepo 里子 .gitignore 很常见——每个 package 自己管自己。**别全堆进根 .gitignore**,会让根 .gitignore 变长难维护。

---

## 六、最常见的"我写了为什么没生效"

90% 的情况:**那个文件已经被 git 跟踪了**。

```bash
# 写完 .gitignore 之后:
git status
# Changes not staged for commit:
#   modified: .env       ← 怎么还在?
```

**因为 `.env` 之前被 commit 过**——git 已经记住它,后续 .gitignore 对它无效。

修复:

```bash
# 1. 让 git "忘记"这个文件(从 staging / 历史的"已跟踪"状态移除,但工作区文件保留)
git rm --cached .env

# 2. commit 这个"删除"
git commit -m "chore: stop tracking .env"

# 3. 之后 .gitignore 对它就生效了
```

**但**:**这不会从历史里清掉 `.env`**——之前 commit 过的 `.env` 内容还在历史里能查。如果 `.env` 含密钥,后续要走"从历史清密钥"的流程(详见 22 篇)。

---

## 七、调试 .gitignore:为什么这个文件被忽略 / 没忽略

```bash
git check-ignore -v src/a.log
# .gitignore:5:*.log  src/a.log
```

输出告诉你:`a.log` 被 `.gitignore` 第 5 行的 `*.log` 规则忽略。

```bash
git check-ignore -v src/a.ts
# (无输出)         ← 没被任何规则忽略
```

```bash
git check-ignore -v --no-index <文件>
# 即使没在 git 历史里也能 check
```

> `git check-ignore -v` 是排查 .gitignore 的**唯一靠谱办法**。"我以为它该被忽略"靠肉眼看 .gitignore 经常错——直接跑 check-ignore 看 git 实际怎么解析。

---

## 八、常见语言 / 框架的 .gitignore 模板

[gitignore.io](https://gitignore.io)(现在叫 toptal/gitignore)能根据你的技术栈生成 .gitignore:

```bash
# CLI 工具:
npx gitignore node,macos,vscode,react

# 或浏览器搜:gitignore.io node macos vscode
```

GitHub 也维护一份官方模板库:[github.com/github/gitignore](https://github.com/github/gitignore)。

**新仓库 `git init` 之后第一件事就是抓一份 .gitignore**——比上线后才发现忘 ignore 强 100 倍。

---

## 九、忘 ignore 导致密钥泄漏的应急

**最严重的 .gitignore 事故**:`.env` 没 ignore,API key 进了仓库,被 push 到 GitHub 公开 repo。

### 9.1 立刻轮换 key

**第一步**——而不是删 commit。**key 已经泄漏,假设它已被爬走**。立刻去对应平台改 key。

### 9.2 从历史里清(详见 22 篇)

```bash
# 用 git-filter-repo(推荐,比 filter-branch 快几十倍)
pip install git-filter-repo
git filter-repo --path .env --invert-paths

# 或 BFG Repo-Cleaner
java -jar bfg.jar --delete-files .env
```

清完后强制 push 覆盖远端:

```bash
git push --force --all
git push --force --tags
```

**这个操作改写历史,所有 fork / 克隆都得重新 clone**。事故公告必发。

### 9.3 `.gitignore` 加上,养成习惯

```gitignore
.env
.env.*
!.env.example
```

`.env.example` 留着——给团队示例(只放 key 的 placeholder,真 key 在每人本地 `.env`)。

> 密钥泄漏不是 git 操作问题,是**整个开发流程问题**。除了 .gitignore,加 pre-commit hook 扫描密钥(`gitleaks` / `git-secrets`)是黄金搭档,详见 17 篇。

---

## 十、`git rm --cached` 的精确语义

```bash
git rm <file>             # 工作区删 + git 删
git rm --cached <file>    # 工作区留 + git 删(让 git 忘记)
git rm -r dir/            # 递归删目录
git rm --cached -r dir/   # 让 git 忘记整个目录,工作区留着
```

`--cached` 适用场景:

- 之前误 commit 的文件,加了 .gitignore 后让 git 忘记
- 把"以前是 git 跟踪的"变成"git 不再跟踪"
- 大文件迁移到 LFS 之前(详见 21 篇)

---

## 十一、几个值得 ignore 的特殊文件

```gitignore
# 操作系统
.DS_Store        # macOS
Thumbs.db        # Windows
desktop.ini      # Windows

# 编辑器
.idea/           # IntelliJ / WebStorm
.vscode/         # 但有时会有团队共享配置 → 特殊处理(见下)
*.swp            # vim
*.swo

# 编译产物
dist/
build/
out/
target/          # Rust / Java
*.pyc            # Python
__pycache__/

# 依赖
node_modules/
vendor/          # PHP / Go modules / 等

# 环境
.env
.env.*
!.env.example

# 日志、缓存
*.log
.cache/
.next/           # Next.js
.nuxt/           # Nuxt

# 测试
coverage/
.nyc_output/
```

**`.vscode/` 的特殊处理**:有些团队希望 commit 部分 VS Code 配置(`extensions.json` 推荐插件、`settings.json` 编辑器规则),但不 commit 个人偏好。常见写法:

```gitignore
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
!.vscode/launch.json
```

---

## 十二、踩坑提醒

1. **写了 .gitignore 文件还是 track**——已被 git 知道的不会因 .gitignore 退场,要 `git rm --cached`
2. **`!` 想从被忽略目录挖出文件**——挖不出来,要逐级开洞
3. **commit 了 `.env`** ——立刻轮换密钥,然后清历史
4. **个人 IDE 配置 commit 进仓库**——队友 IDE 不同,污染 PR
5. **`/` vs 不带 `/` 不分**——`secrets.json` 和 `/secrets.json` 行为不同
6. **不用 `check-ignore` 调试**——肉眼看一屏 .gitignore 找规则
7. **`node_modules/some-thing` 拼成 `node_modules/`**——一个简短规则把一切都盖了
8. **没装 global ignore 配 `.DS_Store`**——每个仓库都重复添加同样规则

---

下一篇:`16-submodule与subtree.md`,讲 submodule 的"指向另一个仓库的指针"机制、用法噩梦、subtree 作为替代方案、什么时候彻底放弃 submodule 用 monorepo。
