# 安装配置与三层 config

git 装上之后,99% 的人会跑两条 `git config --global user.name` / `user.email` 然后就完事——这两条一年都不会再碰。但 git config 真正的设计是**三层覆盖**,理解这件事之后,你才能干一些专业活:**这个项目用工作邮箱、那个项目用个人邮箱**;**全公司统一 commit 模板**;**这个仓库强制走 https 那个走 ssh**。

> 一句话先记住:**git config 是 system → global → local 三层,后者覆盖前者**。和大多数 Unix 工具的"配置覆盖"一致——`/etc/gitconfig` 是兜底、`~/.gitconfig` 是你这台机器的、仓库内 `.git/config` 是这个项目的。出问题排查永远从 local 看起,一层层往外。

---

## 一、装 git

| 平台 | 命令 |
| --- | --- |
| macOS(brew) | `brew install git` |
| macOS(自带) | `xcode-select --install`(装 Command Line Tools 顺带带 git) |
| Ubuntu / Debian | `sudo apt install git` |
| Arch | `sudo pacman -S git` |
| Windows | 装 [Git for Windows](https://git-scm.com/download/win),自带 Git Bash |

装完验证:`git --version`。最低**要求 2.23+**(switch / restore 命令、`--force-with-lease`、partial clone 在这之后逐渐成熟),建议 2.40+。

> macOS 自带的 git 经常是老版本,**强烈建议 brew 装一个新的**,然后 `which git` 看 PATH 是不是优先用了 brew 的。

---

## 二、三层 config 详解

```
最外层(兜底)
  /etc/gitconfig            ← system,管理员配,所有用户共享
       ↓ 覆盖
  ~/.gitconfig 或 ~/.config/git/config   ← global,你这台机器的所有仓库
       ↓ 覆盖
  <repo>/.git/config        ← local,只对这个仓库
最里层(优先)
```

对应的命令:

```bash
git config --system  user.name "..."   # 写 /etc/gitconfig,通常要 sudo
git config --global  user.name "..."   # 写 ~/.gitconfig
git config --local   user.name "..."   # 写当前仓库的 .git/config(默认)
git config -l        # 看所有层级合并后的最终值
git config -l --show-origin  # 看每条来自哪一层(排错神器)
```

> `--show-origin` 是 git 调试的祖传神器——出现"我明明设过这个怎么不生效"的时候,这条命令一秒看清是被哪一层覆盖了。

---

## 三、最少必备的 global 配置

刚装上 git,这一组是底线:

```bash
# 身份(这个不配,commit 会报错或挂错名字)
git config --global user.name  "你的真名 / 团队认识的 ID"
git config --global user.email "你提交时想暴露的邮箱"

# 默认编辑器(写 commit message 用)
git config --global core.editor "vim"        # 或 "code --wait" / "nvim"

# 默认主分支名(2026 之后大多数仓库都用 main)
git config --global init.defaultBranch main

# pull 默认行为:rebase 而不是 merge(合并提交链,避免 merge commit 污染历史)
git config --global pull.rebase true

# push 默认行为:只推当前分支,不要全推
git config --global push.default current

# 中文文件名不转义(macOS / Linux 必备)
git config --global core.quotepath false

# 自动转换换行符(跨平台协作)
# macOS / Linux:
git config --global core.autocrlf input
# Windows:
git config --global core.autocrlf true
```

这些里面**最容易被忽视但收益最大的**是 `pull.rebase = true`:它让 `git pull` 从默认的 "fetch + merge" 变成 "fetch + rebase",**不再产生 merge commit 污染分支历史**。这一改,你的 git log 立刻干净一倍。

---

## 四、邮箱与身份的"坑"

**最常见的事故**:你在公司电脑上提了私人项目,commit 显示成 `you@company.com`;反过来私人电脑提公司项目挂上 `me@personal.com`。GitHub 一看 contributor graph 全乱了,公司可能还涉合规问题。

正确做法:**不在 global 设邮箱,只设名字**;邮箱用 `includeIf` 按目录区分。

```ini
# ~/.gitconfig
[user]
    name = Qiji Xin

[includeIf "gitdir:~/work/"]
    path = ~/.gitconfig-work

[includeIf "gitdir:~/personal/"]
    path = ~/.gitconfig-personal
```

```ini
# ~/.gitconfig-work
[user]
    email = qiji@company.com
[core]
    sshCommand = ssh -i ~/.ssh/id_ed25519_work
```

```ini
# ~/.gitconfig-personal
[user]
    email = me@personal.com
[core]
    sshCommand = ssh -i ~/.ssh/id_ed25519_personal
```

这样:克隆到 `~/work/xxx` 自动用工作邮箱、克隆到 `~/personal/xxx` 自动用个人邮箱。**不用每次 `git config --local` 手动设**。

> `includeIf` 是 git 2.13+ 加的功能,知道的人不多但是**有多机身份的人必装**。配合 `sshCommand` 还能强制每个目录用不同的 SSH key,GitHub 多账号问题一招解决。

---

## 五、最值得装的几个 alias

`alias` 写在 `[alias]` 段,本质是 shell 别名(可以 `!` 开头跑外部命令)。

```ini
# ~/.gitconfig
[alias]
    # 状态简短模式
    s = status -sb

    # 一行一 commit 的图形化 log(最常用的可视化)
    lg = log --oneline --graph --decorate --all

    # 看上次 commit 改了什么
    last = log -1 --stat

    # 当前分支的 commit(从分叉点到 HEAD)
    me = log --oneline @{u}..HEAD

    # 撤销最后一次 commit,但保留改动在工作区
    undo = reset --soft HEAD^

    # 把所有当前改动暂存,准备 stash
    save = stash push -u -m

    # 强推时强制用 lease(只覆盖你预期看到的那个版本)
    please = push --force-with-lease

    # 列出所有别名(避免设了忘了)
    aliases = config --get-regexp ^alias\\.
```

用法:`git lg`、`git s`、`git me`、`git undo`、`git please`。

> 别 alias 太多。**每个 alias 都是一个未来排障时的"我不知道这命令干啥"**——只 alias 真正每天用 5 次以上的命令。

---

## 六、其他几个值得知道的配置

```bash
# 大小写敏感(macOS / Windows 默认不敏感,会出诡异 bug)
git config --global core.ignorecase false

# rerere:记住你解决过的冲突,下次同样冲突自动解(高级但救命)
git config --global rerere.enabled true

# 颜色输出
git config --global color.ui auto

# diff 用更聪明的算法
git config --global diff.algorithm histogram

# fetch 时自动剪掉远端已删除的分支
git config --global fetch.prune true

# log 的 commit message 不分页(短的时候)
git config --global core.pager "less -F -X"

# Windows 上启用 longpaths(避免路径太长报错)
git config --system core.longpaths true   # Windows 专用
```

**`rerere`(reuse recorded resolution)** 这个名字奇葩、知名度低、但功能很强:你在 rebase 一长串 commit 时同一个冲突会出现 N 次,启用 rerere 后,**第一次解了它就记下来,后面重复出现自动应用**。

---

## 七、SSH key 与 https 二选一

git 跟 GitHub / GitLab 通信有两种:

| 协议 | 配置 | 优点 | 缺点 |
| --- | --- | --- | --- |
| HTTPS | 用户名 + token / credential helper | 防火墙友好 | 每次要带 token,需要 credential helper |
| SSH | 公钥 / 私钥 | 配好之后**永远不用输密码** | 防火墙严的网络可能 22 端口被封 |

**生成 SSH key**(2026 推荐 ed25519):

```bash
ssh-keygen -t ed25519 -C "your@email.com"
# 一路回车,默认存 ~/.ssh/id_ed25519
# 把 ~/.ssh/id_ed25519.pub 加到 GitHub Settings → SSH Keys
```

**已经 clone 了 https 想换 ssh**:

```bash
git remote set-url origin git@github.com:user/repo.git
```

**HTTPS 想免输 token**(macOS):

```bash
git config --global credential.helper osxkeychain
# 第一次输 token 后会被钥匙串记住
```

> 个人电脑用 SSH;**CI / 服务器用 HTTPS + 短期 token**,SSH 在 CI 里管理 deploy key 反而麻烦。

---

## 八、检查 / 排错

出问题时三连:

```bash
git config -l --show-origin              # 配置在哪一层
git remote -v                            # 远程仓库地址
git config --show-scope --show-origin user.email   # 看 email 来自哪
```

最常见的问题:

| 症状 | 原因 |
| --- | --- |
| 提交显示成不认识的名字 | `--global` 设错或被 local 覆盖 |
| `pull` 一直冒 merge commit | 没设 `pull.rebase=true` |
| Windows 同事改完代码 diff 全是格式 | `core.autocrlf` 不一致 |
| 大写小写改名 git 看不到 | `core.ignorecase=true`(默认) |
| 中文文件名变 `\xxx\xxx` | `core.quotepath=true`(默认) |

---

## 九、踩坑提醒

1. **`--global` 设了邮箱忘了改**——给客户/公司项目混淆身份,合规风险
2. **不知道 `--show-origin`**——出现"我明明设了"的时候找不到被哪层覆盖
3. **alias 太多**——日后切机器或者别人帮你看屏幕,所有命令变成谜
4. **没装 brew git 用了 macOS 自带的**——版本卡在 2.30 之前,partial clone / sparse checkout 都用不了
5. **`autocrlf` 设错**——跨平台协作时换行符冲突,diff 全是看不见的字符
6. **default branch 还是 master**——2020 之后大多数平台默认 main,留着 master 是噪声
7. **SSH 一个 key 撞所有账号**——GitHub 多账号必须用 `IdentityFile` + 不同主机别名

---

下一篇:`03-三层工作区模型.md`,讲 working / staging / repo 这个 git 最关键的心智模型,以及为什么 `git add` 不是"添加文件"而是"快照当下的内容"。
