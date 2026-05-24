# Dotfiles 心智与方案:别再"裸 git symlink",上 chezmoi / home-manager

工程师对「dotfiles」最常见的认知是:把 `.zshrc` `.tmux.conf` `.vimrc` 这几个文件 commit 到一个 git 仓库,**写个 install.sh 做 symlink,完事**。这套做法在 2010 年是行业标准,在 2026 年是反模式——**因为它把"配置同步"这一件事当成了 dotfiles 的全部**,而真实的 dotfiles 工程要同时处理「配置 + 软件清单 + 密钥 + 跨机差异 + 历史回滚」**五件事**,**前一种做法只解决了其中 1/5**。剩下 4 件事你都在用"手工 + 临时脚本"去补,**每换一台机器,你都要把这 4 件事重新走一遍**——而工程师 5 年内至少会面对 3-5 台机器(新 Mac / 公司机 / 服务器 / 容器 / VM / 同事临时借的环境),**累加下来就是上百小时的纯重复劳动**,**还伴随着把 SSH key 误传上 GitHub、不同机器配置漂移、半年后自己改了什么忘了** 这一系列灾难。

> 一句话先记住:**dotfiles 不是「把 .zshrc commit 到 git」——是「配置 + 软件清单 + 密钥 + 跨机差异 + 历史回滚」五件事的统一工程**。**选 chezmoi(模板 + secret 集成)或 home-manager(声明式 + 不可变)**,**别再继续裸 git + symlink** 这种 2010 年范式。**你不是没时间做这件事,是不知道做了 ROI 巨大**——一次性投入 8-20 小时,后面 10 台机器每台省 8 小时,**ROI 是 4-8 倍**,且每次"换机器"从一周降到 30 分钟。

这一篇拆开来讲:**dotfiles 在解决什么问题、5 个主流方案怎么选、为什么主推 chezmoi、新机器怎么 30 分钟引导完、secret 怎么处理、常见的几个坑**。**不写"我的 dotfiles 长什么样"**——你抄不走别人的牙刷。

---

## 一、为什么必须把 dotfiles 工程化

### 1.1 一个工程师 5 年的机器换手频率

```
新工程师入职第一年:
   - 一台公司发的 MacBook                      → +1 台
   - 一台云上的开发机(EC2 / Devbox)            → +1 台
   - 几台 SSH 上去的生产 / 测试机                → +N 台
   - 自己买的副机(笔记本 / Mini PC)            → +1 台

第二年到第三年:
   - 公司给的 Mac 升级(M1 → M3 → M4)          → +1-2 台
   - 公司开发机重装                              → +1 次
   - 跳槽换公司                                  → 全部重来

第四到第五年:
   - 跳槽 1-2 次                                 → 每次新机器
   - 临时帮人 onboarding                         → +N 次
   - 容器化开发(devcontainer)                  → 每个项目一个

5 年内你"配 dotfiles"的次数:>= 10 次
```

**每次"从零手动配"的时间成本**:

```
装 brew / apt + 一堆 CLI:          1 小时
装 Nerd Font + 终端模拟器:         30 分钟
装 zsh / oh-my-zsh / 框架 + 主题:  1 小时
装 Neovim + plugin manager:        2 小时(plugin 兼容总要 debug)
装 tmux + 配置:                    1 小时
装 mise / nvm / pyenv / rbenv:    1-2 小时
SSH config 重写:                   30 分钟
git config 全局:                   15 分钟
各种小工具(fzf / ripgrep / bat): 30 分钟
调整快捷键 / 切默认 shell:         30 分钟
─────────────────────────────────────────
单机一次:                          6-10 小时
10 次累加:                         60-100 小时

而 dotfiles 工程化的一次性投入:    8-20 小时
ROI = 4-6 倍,且每次"换机器"从一周降到 30 分钟
```

**这就是 dotfiles 工程化的本质**:**把"会换机器"当成常态来设计**,而不是"每次换机器都当一次性事件"。**前者是工程,后者是手艺**——手艺会失传,工程能复利。

### 1.2 不工程化 dotfiles 的 3 个真实事故

**事故 1:SSH 私钥误进公开仓库**

```
工程师 A 把 ~/.ssh/ 整个目录 commit 到 dotfiles repo,推到 GitHub
3 小时后,GitHub 自动扫描发现密钥,发邮件警告
但攻击者比你快,密钥已经被脚本爬走
公司 EC2 被挖矿,损失 ¥几万 + 安全合规事故
```

这件事的根因是**没有 secret 处理机制**——你把所有配置当成"文本"看待,**没有区分哪些可以公开、哪些必须加密**。chezmoi / yadm / Nix 都内建 secret 管理,**裸 git 没有**。

**事故 2:同事 onboarding 一周没配完**

```
新人 B 入职,你给他你的 dotfiles repo URL
告诉他"clone 下来跑 install.sh"
install.sh 200 行:
  - 假设 macOS 在 /usr/local 装 brew(他是 Apple Silicon,brew 在 /opt/homebrew)
  - 假设你的 dotfiles 在 ~/dotfiles(他放在 ~/code/dotfiles)
  - 假设你装了 nvm 11(他没装,脚本崩了)
  - 假设你的 zshrc 引用了 ~/work-aliases.sh(他没有这文件)

新人花了一周才让 zsh 不报错,Neovim 还是用不了
他放弃,问"我能不能用 VS Code"
```

根因是**脚本没考虑跨机器差异**——所有"假设"都在你自己机器上为真,在别人机器上全部为假。**模板化(chezmoi templates)/ 声明式(Nix)的存在就是为了消除这种"假设"**。

**事故 3:三台机器配置漂移,自己都不知道**

```
工程师 C 自己有 3 台机器:工作 Mac / 家里 Mac / 公司 Linux 开发机
最初 dotfiles 都一样,但
  - 工作 Mac 改了 zshrc 加了个 alias(忘了同步)
  - 家里 Mac 升级了 zsh-autosuggestions 的版本(忘了 push)
  - Linux 开发机加了几个 PATH(临时,后来忘了)

半年后他出差,要在公司开发机里跑一段脚本
这段脚本依赖那个工作 Mac 加的 alias
他不知道为什么不行,debug 一晚上
```

根因是**没有"主备同步"心智**——你以为 dotfiles 是一份配置,实际成了 3 份分叉。chezmoi 的 `chezmoi diff` / Nix 的"声明式"都是解决这个问题的工具。

---

## 二、dotfiles 真正要解决什么(五件事)

把 dotfiles 工程拆成五件事,**每一件都是独立的工程问题**:

```
┌──────────────────────────────────────────────────────────────┐
│  事 1:配置同步                                                │
│    ~/.zshrc, ~/.tmux.conf, ~/.config/nvim/, ~/.gitconfig ...  │
│    跨机器保持一致,版本可追溯                                  │
│                                                              │
│  事 2:软件清单                                                │
│    brew / apt 装了哪些包                                       │
│    Mac 的 cask GUI 应用                                        │
│    npm / cargo 装了哪些全局工具                                │
│                                                              │
│  事 3:密钥 / 凭证                                             │
│    SSH key、API token、AWS credentials                        │
│    不能进 git(或必须加密)                                    │
│                                                              │
│  事 4:跨机差异                                                │
│    工作 Mac vs 家用 Mac:不同 git email / 不同 prompt 颜色     │
│    macOS vs Linux:brew 路径 / 字体路径 / Homebrew Cask 不存在 │
│    hostname driven:不同主机走不同分支                          │
│                                                              │
│  事 5:历史回滚                                                │
│    昨天改了一行 zshrc,今天 shell 启动失败,要能回退           │
│    新机器引导失败,要能继续从中间步骤跑                          │
└──────────────────────────────────────────────────────────────┘

裸 git + symlink 只解决了"事 1",其他 4 件全靠手工
chezmoi 把这 5 件事都做成了一套工具的内建能力
home-manager(Nix)更进一步,连"配置 + 包"做成同一份声明
```

**任何 dotfiles 方案,先看它怎么处理这 5 件事**——只解决"事 1"的方案,**就是 2010 年的范式**。

---

## 三、5 个主流方案对比

2026 年还活着的 dotfiles 方案有 5 个,**学习曲线和能力天差地别**。先上一张对比表(后面每行展开):

```
                  裸 git+symlink   stow         yadm         chezmoi       home-manager
──────────────────────────────────────────────────────────────────────────────────────
学习曲线          低              低           低           中             高
依赖              git             GNU stow     git          chezmoi 二进制 Nix 全家桶
secret 集成       手动            手动         git-crypt    1Password/age 手动
模板能力          无              无           少           strong         strong(用 Nix)
跨 OS 差异        手工脚本        手工脚本     少            原生            原生
软件清单          无              无           无           run_* 脚本     全部声明
不可变            否              否           否           半声明          全声明
回滚              git revert      git revert   git revert   git revert     nix rollback
社区主流度        ★★★             ★★            ★             ★★★★          ★★★
适合              < 5 个文件      simple 党    极简党        主推            硬核 + Nix 党
```

**结论提前给**:

```
你装的文件 ≤ 5 个                              → 裸 git + symlink 也行,但建议直接上 chezmoi
你不想学新工具,只想 "git clone + 一键 link"   → GNU stow
你想要全套(配置 / secret / 跨机)中等学习曲线 → chezmoi(本篇主推)
你已经在用 Nix,或想要"完全不可变"             → home-manager
```

---

### 3.1 裸 git + symlink(初级,2010 范式)

**思路**:把 dotfiles 放进一个 git 仓库,然后写脚本把每个文件 symlink 到 `$HOME` 下应有的位置。

**目录结构**:

```
~/dotfiles/
├── .zshrc
├── .tmux.conf
├── .gitconfig
├── .config/
│   └── nvim/
│       └── init.lua
└── install.sh
```

**install.sh** 最小可用版本(30 行):

```bash
#!/usr/bin/env bash
# 极简 dotfiles install.sh
# 用法:cd ~/dotfiles && ./install.sh

set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 要 symlink 的文件列表
files=(
  ".zshrc"
  ".tmux.conf"
  ".gitconfig"
)

# 备份并 symlink
for f in "${files[@]}"; do
  target="$HOME/$f"
  source="$DOTFILES_DIR/$f"

  # 如果是已存在的真文件,备份
  if [[ -e "$target" && ! -L "$target" ]]; then
    mv "$target" "$target.backup.$(date +%Y%m%d-%H%M%S)"
    echo "Backed up existing $f"
  fi

  ln -sf "$source" "$target"
  echo "Linked $f -> $source"
done

# 处理 ~/.config 子目录(需要单独 mkdir -p)
mkdir -p "$HOME/.config"
ln -sf "$DOTFILES_DIR/.config/nvim" "$HOME/.config/nvim"
echo "Linked .config/nvim"

echo ""
echo "Done. Restart your shell."
```

**优点**:

- **零依赖**——只要 git 和 bash 就能跑
- **可读性极高**——所有逻辑就在那 30 行里
- **新人学习成本接近 0**——只要懂 git 和 symlink

**缺点**:

- **secret 自己想办法**——SSH key / API token 不能进 git,要么手动 copy,要么用第三方加密
- **跨 OS 差异要写 if**——macOS 装 brew、Linux 装 apt,install.sh 要分支
- **没模板**——`~/.gitconfig` 想根据不同机器写不同 email?**只能维护多个 gitconfig 文件**
- **包清单没了**——你装了 30 个 brew 包,这个仓库不记录
- **新机器引导仍是手工**——你要先装 brew、再 git clone、再跑 install.sh,**还是 3 步**

**适用场景**:你只有 3-5 个配置文件,**完全不需要跨机差异和 secret**——比如自用副机偶尔配一下。**正式工作机不推荐**。

---

### 3.2 GNU stow(2012 经典)

**思路**:把每个工具的配置放在一个**子目录**里,**目录结构和 `$HOME` 镜像**;然后 `stow <tool>` 命令自动建立 symlink。

**目录结构**:

```
~/dotfiles/
├── zsh/
│   └── .zshrc                # 对应 ~/.zshrc
├── tmux/
│   └── .tmux.conf            # 对应 ~/.tmux.conf
├── nvim/
│   └── .config/
│       └── nvim/
│           └── init.lua      # 对应 ~/.config/nvim/init.lua
└── git/
    └── .gitconfig            # 对应 ~/.gitconfig
```

**用法**:

```bash
# 安装 GNU stow
brew install stow             # macOS
# 或 apt install stow         # Debian/Ubuntu

# 在 ~/dotfiles 下
cd ~/dotfiles
stow zsh                      # 自动建 ~/.zshrc symlink
stow tmux                     # 自动建 ~/.tmux.conf symlink
stow nvim                     # 自动建 ~/.config/nvim symlink
stow git                      # 自动建 ~/.gitconfig symlink

# 卸载某个工具的配置
stow -D zsh                   # 删 ~/.zshrc symlink

# 一次性 stow 所有(简单粗暴)
stow */
```

**优点**:

- **声明式**——目录结构就是 symlink 拓扑,**不需要写 install.sh**
- **细粒度**——`stow zsh` 只装 zsh 那部分,**不必一键全装**
- **零依赖业务逻辑**——GNU stow 一个工具,没有你自己写的脚本

**缺点**:

- **仍然不解决 secret / 模板 / 跨 OS**——和裸 git 一个级别
- **目录嵌套深时容易混乱**——`nvim/.config/nvim/...` 这种镜像结构,刚开始要适应
- **依赖 GNU stow**——比裸 git 多一个依赖(虽然只是一个包)

**适用场景**:你的 dotfiles **20 个文件以内**,**不需要模板和 secret**——比如开源项目维护者发自己的 dotfiles 教学。**生产工作机不够用**。

---

### 3.3 chezmoi(2026 主推)

**思路**:`chezmoi` 把 dotfiles 放在 `~/.local/share/chezmoi/`(独立 source 目录,**不是 $HOME 本身**),**所有文件可以模板化**,**secret 内建集成主流密码管家**,**跨 OS / 跨主机差异原生支持**。

**安装**:

```bash
# macOS
brew install chezmoi

# Linux(一行)
curl -fsLS get.chezmoi.io | sh
sudo mv ./bin/chezmoi /usr/local/bin/

# 或装到 ~/.local/bin
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/.local/bin"
```

**最小工作流**:

```bash
# 1. 在新机器上一行命令引导
chezmoi init --apply https://github.com/yourname/dotfiles

# 2. 修改 ~/.zshrc 的"源版本"(不是直接改 ~/.zshrc!)
chezmoi edit ~/.zshrc

# 3. 看看 source 和 target 的差异
chezmoi diff

# 4. 把改动应用到 $HOME
chezmoi apply

# 5. 加一个新文件到 dotfiles 管理
chezmoi add ~/.config/ghostty/config

# 6. 推到远端
chezmoi cd                      # 进入 source 目录
git add . && git commit -m "..." && git push
exit                            # 回到原目录
```

**chezmoi 的关键概念**:

```
target:    $HOME 下你实际看到的文件(~/.zshrc)
source:    chezmoi 管理的源文件(~/.local/share/chezmoi/dot_zshrc.tmpl)
state:     chezmoi 记录的"上次 apply 时是什么样"(~/.config/chezmoi/chezmoiState.boltdb)
data:      跨机器变量(~/.config/chezmoi/chezmoi.toml)
template:  .tmpl 后缀的文件,可以用 Go template 语法
```

**目录结构(chezmoi 视角)**:

```
~/.local/share/chezmoi/        # source 目录
├── .chezmoidata.yaml           # 全局数据(所有机器共享)
├── .chezmoi.toml.tmpl          # 首次 init 时问的问题模板
├── dot_zshrc.tmpl              # 渲染到 ~/.zshrc(dot_ 前缀 = .)
├── dot_tmux.conf               # 渲染到 ~/.tmux.conf
├── dot_gitconfig.tmpl          # 模板化的 gitconfig
├── dot_config/
│   ├── nvim/
│   │   └── init.lua
│   └── ghostty/
│       └── config
├── private_dot_ssh/            # private_ 前缀 = 0600 权限
│   └── config.tmpl
├── run_once_install-packages.sh.tmpl   # 一次性脚本(只在 hash 变时跑)
├── run_onchange_brew-bundle.sh.tmpl    # 内容变化时跑
└── .chezmoiignore              # 忽略某些文件
```

**关键的目录约定**:

```
dot_xxx               → ~/.xxx
private_dot_xxx       → ~/.xxx,权限 0600
empty_dot_xxx         → ~/.xxx,允许空文件
xxx.tmpl              → 用模板渲染
encrypted_dot_xxx     → 加密存储,apply 时解密
run_once_xxx.sh       → 一次性脚本,hash 不变就不重跑
run_onchange_xxx.sh   → 内容变化时重跑
.chezmoiignore        → 不应用的文件列表
```

#### 3.3.1 模板能力(chezmoi 的核心杀招)

**例 1:.gitconfig 跨机器不同 email**:

`dot_gitconfig.tmpl`:

```text
[user]
    name = {{ .name }}
    email = {{ .email }}

[core]
    editor = nvim
    autocrlf = false

{{- if eq .chezmoi.os "darwin" }}
[credential]
    helper = osxkeychain
{{- else if eq .chezmoi.os "linux" }}
[credential]
    helper = store
{{- end }}

[init]
    defaultBranch = main
```

`.chezmoi.toml`(每台机器各自的,不进 git):

```toml
# 工作 Mac:
[data]
    name = "Your Name"
    email = "you@company.com"

# 家里 Mac:
[data]
    name = "Your Name"
    email = "you@personal.com"
```

**首次 init 时 chezmoi 会问你这些数据**——通过 `.chezmoi.toml.tmpl`:

`.chezmoi.toml.tmpl`:

```text
{{- $email := promptString "email" -}}
{{- $name := promptString "name" -}}

[data]
    email = {{ $email | quote }}
    name = {{ $name | quote }}
```

**例 2:.zshrc 根据 OS 走不同分支**:

`dot_zshrc.tmpl`:

```text
# 通用配置
export EDITOR=nvim
export PAGER=less

# OS 特定
{{- if eq .chezmoi.os "darwin" }}
# macOS
eval "$(/opt/homebrew/bin/brew shellenv)"
alias ls='ls -G'
{{- else if eq .chezmoi.os "linux" }}
# Linux
[[ -f /home/linuxbrew/.linuxbrew/bin/brew ]] && \
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
alias ls='ls --color=auto'
{{- end }}

# 主机特定
{{- if eq .chezmoi.hostname "work-mbp" }}
# 工作机
export AWS_PROFILE=work
{{- else if eq .chezmoi.hostname "home-mbp" }}
# 家用机
export AWS_PROFILE=personal
{{- end }}

# 通用别名
alias g='git'
alias ll='ls -lah'
```

**chezmoi 自动注入的变量**(部分):

```
.chezmoi.os                  → "darwin" / "linux" / "windows"
.chezmoi.arch                → "amd64" / "arm64"
.chezmoi.hostname            → 机器名
.chezmoi.username            → 当前用户
.chezmoi.osRelease.id        → "ubuntu" / "arch" / "fedora"
.chezmoi.osRelease.versionID → "22.04" / 等
```

**这一套模板能力是 chezmoi 区别于 stow / yadm 的最大武器**——你不再维护"3 份 zshrc",而是**一份 zshrc 模板 + 几行 if**。

#### 3.3.2 secret 集成

chezmoi 内建支持多种 secret 后端:

```
1Password   →  {{ (onepasswordRead "op://Personal/GitHub Token/password") }}
Bitwarden   →  {{ (bitwarden "item" "github-token").login.password }}
gopass      →  {{ gopass "github/token" }}
LastPass    →  {{ (lastpass "GitHub Token").password }}
keepass     →  {{ keepassxc "GitHub Token" }}
age         →  encrypted_dot_xxx,加密文件,key 在本地
gpg         →  类似 age
```

**例:`.envrc` 里需要 GitHub Token**:

`dot_envrc.tmpl`:

```text
export GITHUB_TOKEN={{ (onepasswordRead "op://Personal/GitHub Token/credential") | quote }}
export ANTHROPIC_API_KEY={{ (onepasswordRead "op://Personal/Anthropic/api-key") | quote }}
```

**chezmoi apply 时**会现场从 1Password 取出来,**渲染到 ~/.envrc**;**git 仓库里只有模板,没有明文**。

**用 age 加密文件**:

```bash
# 1. 生成 age key
age-keygen -o ~/.config/age/key.txt

# 2. 配 chezmoi 用 age
chezmoi edit-config
# 加:
# encryption = "age"
# [age]
#   identity = "~/.config/age/key.txt"
#   recipient = "age1xxxxx..."

# 3. 加密一个文件
chezmoi add --encrypt ~/.aws/credentials

# 此时 source 里多了一个 encrypted_private_dot_aws/credentials.age
# 内容是密文,可以安全推到 GitHub
```

**关键**:age key 自己**不要进 git**——单独放在 `~/.config/age/` 下,用 macOS Keychain / 1Password 的"附件"或加密 USB 保管。

#### 3.3.3 run scripts(包安装)

**`run_once_install-packages.sh.tmpl`** 是 chezmoi 处理"软件清单"的方式:

```text
#!/usr/bin/env bash
# run_once_install-packages.sh.tmpl
# 首次 apply 时跑,后续 hash 不变就不重跑

set -euo pipefail

{{- if eq .chezmoi.os "darwin" }}
# macOS
if ! command -v brew &> /dev/null; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
brew bundle --file=- <<EOF
brew "git"
brew "neovim"
brew "tmux"
brew "ripgrep"
brew "fzf"
brew "starship"
brew "mise"
cask "ghostty"
cask "1password"
EOF
{{- else if eq .chezmoi.os "linux" }}
# Linux(以 Ubuntu 为例)
sudo apt update
sudo apt install -y \
  git neovim tmux ripgrep fzf curl
# starship / mise 单独装(apt 没有)
curl -sS https://starship.rs/install.sh | sh
curl https://mise.run | sh
{{- end }}

echo "Packages installed."
```

**`run_onchange_xxx.sh`** 类似,但**内容变化时重跑**——适合"Brewfile 改了就重新 bundle"。

#### 3.3.4 chezmoi 工作流完整图

```
                           远端 GitHub repo
                                │
                       chezmoi update / git pull
                                ▼
       ┌─────────────────────────────────────────────┐
       │   source 目录 (~/.local/share/chezmoi/)     │
       │   ├── dot_zshrc.tmpl                        │
       │   ├── dot_config/...                        │
       │   ├── run_once_install-packages.sh.tmpl    │
       │   └── .chezmoiignore                        │
       └─────────────────────────────────────────────┘
                                │
                  chezmoi apply (渲染 + 加密 + 写盘)
                                ▼
       ┌─────────────────────────────────────────────┐
       │   target 目录 ($HOME)                       │
       │   ├── .zshrc          ← 渲染后的            │
       │   ├── .config/...                            │
       │   └── .ssh/config     ← 0600 权限           │
       └─────────────────────────────────────────────┘
                                │
                                │  你直接编辑 ~/.zshrc 不会进 source
                                │  必须 chezmoi edit ~/.zshrc
                                ▼
                        chezmoi diff 看差异
                                │
                        chezmoi cd → git push
```

**几个反直觉点要记住**:

1. **你直接改 ~/.zshrc 不会被 chezmoi 记录**——必须 `chezmoi edit ~/.zshrc` 改 source
2. **`chezmoi apply` 是单向的(source → target)**——不会把 target 的改动同步回 source
3. **要把 target 的手工改动捞回 source**,用 `chezmoi re-add`
4. **不 commit 不 push,远端不会知道**——chezmoi 本身不自动 push

---

### 3.4 yadm(替代选项)

**思路**:**把 `$HOME` 直接当成 git 工作树**——`yadm` 本质是一个伪装的 git,**所有命令前面加 `yadm`**(`yadm add` / `yadm commit` / `yadm push`)。

**目录结构**:

```
$HOME/                          # 这里就是 git 工作树
├── .zshrc                      # 直接被 git 跟踪
├── .tmux.conf
├── .config/
│   └── nvim/init.lua
└── ...

实际 git 仓库:~/.config/yadm/repo.git/(独立)
```

**用法**:

```bash
# 安装
brew install yadm

# 新机器引导
yadm clone https://github.com/yourname/dotfiles

# 加文件
yadm add ~/.zshrc

# 提交
yadm commit -m "..."
yadm push
```

**优点**:

- **学习成本接近 0**——你已经会 git,把 git 换成 yadm 就是
- **不需要 install.sh / symlink**——文件就在 `$HOME` 原位
- **支持 alternates(跨主机不同文件)**:`.zshrc##os.Darwin` / `.zshrc##os.Linux` / `.zshrc##class.work`
- **secret 用 git-crypt 集成**(标准做法)

**缺点**:

- **没有模板**——只能用 alternates 文件名分支,**没有 chezmoi 那种 `{{ if }}`** 灵活
- **`$HOME` 是 git 工作树这件事略反直觉**——`yadm status` 会显示**所有** $HOME 下的文件(几千个),要靠 `.yadmignore` 过滤
- **社区比 chezmoi 小**——长期维护性略弱

**适用场景**:你**只想用 git 思维做 dotfiles**,**不想学新概念**——yadm 是最贴近 git 的方案。**比裸 git symlink 好很多,但比 chezmoi 弱一档**。

---

### 3.5 home-manager(Nix 生态,25 篇专讲)

**思路**:**声明式 + 不可变**——用 Nix 语言写一份配置,**一条命令把"配置 + 包"都装上**,**任意时刻可以回滚到上一个 generation**。

**最小例子**(`~/.config/home-manager/home.nix`):

```nix
{ config, pkgs, ... }: {
  home.username = "yourname";
  home.homeDirectory = "/Users/yourname";
  home.stateVersion = "24.05";

  # 装这些包
  home.packages = with pkgs; [
    ripgrep
    fzf
    neovim
    tmux
    starship
  ];

  # 配 zsh
  programs.zsh = {
    enable = true;
    enableCompletion = true;
    syntaxHighlighting.enable = true;
    shellAliases = {
      ll = "ls -lah";
      g = "git";
    };
    initExtra = ''
      eval "$(starship init zsh)"
      eval "$(mise activate zsh)"
    '';
  };

  # 配 git
  programs.git = {
    enable = true;
    userName = "Your Name";
    userEmail = "you@example.com";
  };
}
```

**应用**:

```bash
home-manager switch
```

**这一条命令做了**:

1. 装上声明的所有包(ripgrep / fzf / neovim / tmux / starship)
2. 生成 `~/.zshrc`、`~/.gitconfig`
3. 记录到一个新 generation(可以 `home-manager generations` 看历史)
4. 失败时**整体回滚**——不会有"装了一半"状态

**回滚**:

```bash
# 看所有 generations
home-manager generations
# 41   2026-05-11 14:33:18   /nix/store/...-home-manager-generation
# 40   2026-05-10 09:21:50   /nix/store/...-home-manager-generation
# ...

# 回到第 40 个
/nix/store/...-home-manager-generation/activate
```

**优点**:

- **最强的"完全可复现"**——同一份 home.nix 在任何 Nix 机器上都能跑出**完全一致**的环境
- **配置 + 包统一**——不需要单独维护 Brewfile
- **原子化 + 可回滚**——失败不污染系统
- **声明式**——你描述"想要什么",不是"怎么装"

**缺点**:

- **学习曲线最陡**——Nix 语言、derivation、flake 这些概念要学,**第一个月很痛**
- **生态相对小**——某些工具的 Nix 包可能滞后官方一个版本
- **macOS 上要装 Nix(单独工程)+ home-manager**——比 chezmoi 多一层 setup
- **不适合新手**——劝退率很高

**适用场景**:你**已经在用 Nix**,或**完全无法忍受"环境不一致"**——home-manager 是"配置工程"的最终答案,但**入门成本高,本系列 25 篇专讲**。

---

## 四、为什么这一篇主推 chezmoi

**chezmoi 在 2026 是 dotfiles 工程的"中间路线"**——比裸 git / stow 强 100 倍,比 Nix home-manager 学起来容易 10 倍:

```
                  能力     学习成本   生态/社区   2026 主流度
裸 git+symlink   ★         ★          ★★★        ★★★(在退潮)
GNU stow         ★★        ★          ★★         ★★(经典但弱)
yadm             ★★★       ★          ★          ★★(在萎缩)
chezmoi          ★★★★      ★★★        ★★★★       ★★★★(主流上升)
home-manager     ★★★★★     ★★★★★      ★★★        ★★★(硬核圈子)
```

**chezmoi 的杀招**:

1. **一行 init**:`chezmoi init --apply https://github.com/yourname/dotfiles` ——新机器 5 分钟搞定
2. **模板能力强**:Go template + 内建变量,**任意复杂的跨机差异都能表达**
3. **secret 内建多后端**:1Password / Bitwarden / age / gpg ——**不需要再装 git-crypt**
4. **run script 处理软件清单**:Brewfile / apt 包都能集成进 run_once_xxx.sh
5. **diff / re-add 工作流**:**保护你不被 apply 误覆盖手工改动**
6. **跨平台**:macOS / Linux / Windows / FreeBSD 都能跑(WSL 也行)

**chezmoi 的代价**:

- **要学一套新词汇**:source / target / dot_ / private_ / run_ / template ——**第一周需要查文档**
- **模板语法是 Go template**:不熟悉 Go 的人**前几天会觉得别扭**
- **chezmoi 本身要装**:多一个二进制依赖,**虽然只是 10MB**

**结论**:**chezmoi 是"工作机的合理上限"**——除非你硬核到要 Nix,**chezmoi 已经覆盖 95% 的 dotfiles 工程需求**。

---

## 五、新机器一键引导脚本(强 ROI)

dotfiles 工程化最直接的回报是「**新机器引导**」——一行命令,30 分钟,新机器变成你家。

**最小可用引导脚本**:

```bash
#!/usr/bin/env bash
# bootstrap.sh - 新机器一键引导
# 用法:在新机器上跑
#   curl -fsLS https://raw.githubusercontent.com/yourname/dotfiles/main/bootstrap.sh | bash

set -euo pipefail

echo "=== Step 1: Detect OS ==="
OS="$(uname -s)"
ARCH="$(uname -m)"
echo "OS: $OS / Arch: $ARCH"

echo ""
echo "=== Step 2: Install package manager ==="
case "$OS" in
  Darwin)
    if ! command -v brew &> /dev/null; then
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # Apple Silicon: brew 装到 /opt/homebrew
      if [[ "$ARCH" == "arm64" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      else
        eval "$(/usr/local/bin/brew shellenv)"
      fi
    fi
    ;;
  Linux)
    # 假设 Debian/Ubuntu;Arch 走 pacman 的话另写
    if command -v apt &> /dev/null; then
      sudo apt update
      sudo apt install -y curl git build-essential
    fi
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

echo ""
echo "=== Step 3: Install chezmoi ==="
if ! command -v chezmoi &> /dev/null; then
  case "$OS" in
    Darwin)
      brew install chezmoi
      ;;
    Linux)
      sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/.local/bin"
      export PATH="$HOME/.local/bin:$PATH"
      ;;
  esac
fi

echo ""
echo "=== Step 4: Init dotfiles ==="
chezmoi init --apply https://github.com/yourname/dotfiles

echo ""
echo "=== Step 5: Verify ==="
echo "Done. New shell:"
echo "  exec \$SHELL"
echo ""
echo "Or close this terminal and open a new one."
```

**这套脚本配合 chezmoi 的 `run_once_install-packages.sh.tmpl`**,在新机器上跑下来:

```
+ 5 分钟:brew / apt + chezmoi 装好
+ 10-15 分钟:chezmoi apply 跑完,包都装上、配置都到位
+ 5 分钟:你打开新 shell,验证 zsh 启动、tmux 颜色、nvim 插件加载

总耗时:20-30 分钟,全自动
```

**对比"手工配 6-10 小时"——ROI 直接 12-20 倍**。

**进阶**:把这一行命令写进**新员工 onboarding 文档**:

```markdown
## 新机器 setup(30 分钟)

1. 打开终端,跑:
   ```
   curl -fsLS https://raw.githubusercontent.com/yourname/dotfiles/main/bootstrap.sh | bash
   ```

2. 等 20 分钟。

3. 退出终端、重开。验证:
   - `zsh` 是默认 shell
   - `tmux` 起得来,prefix 是 Ctrl+a
   - `nvim` 进去插件能装

如果有问题,看 troubleshooting.md。
```

**新人从"配一周"变成"喝杯咖啡的时间"**——这就是 dotfiles 工程化对团队的价值。

---

## 六、跨机差异处理(chezmoi 视角)

一个工程师典型的跨机差异:

```
机器               OS         hostname          用途         需要的差异
─────────────────────────────────────────────────────────────────────────
work-mbp           macOS arm  work-mbp          工作         email=company / proxy / AWS_PROFILE=work
home-mbp           macOS arm  home-mbp          家用         email=personal / 个人 dot
linux-dev          Ubuntu     linux-dev         云开发机     无 GUI / brew 路径不同 / 包略不同
container-devbox   Linux      ephemeral-xxx     容器         极简,只装核心 5 个工具
server-prod        Linux      *.prod.internal   生产 SSH     不要全套配置,只 zshrc + 几个 alias
```

**用 chezmoi 处理这种差异的工作流**:

#### 6.1 用 hostname 区分

`dot_zshrc.tmpl`:

```text
# 通用
export EDITOR=nvim
alias g='git'

{{- if eq .chezmoi.hostname "work-mbp" }}
# 工作机专用
export AWS_PROFILE=work
export HTTP_PROXY=http://proxy.company.com:8080
alias deploy='kubectl --context=work-prod'
{{- else if eq .chezmoi.hostname "home-mbp" }}
# 家用机
alias deploy='echo "no deploy at home"'
{{- end }}
```

#### 6.2 用"机器分类"区分(class)

如果你的机器分类不是"hostname",而是"工作 / 家用 / 服务器"这种**类别**:

`.chezmoi.toml`(每台机器单独配):

```toml
# 工作机的 .chezmoi.toml
[data]
    class = "work"

# 家用机
[data]
    class = "personal"

# 服务器
[data]
    class = "server"
```

模板里:

```text
{{- if eq .class "work" }}
# 工作机配置
{{- else if eq .class "personal" }}
# 家用机配置
{{- else if eq .class "server" }}
# 服务器(极简)
{{- end }}
```

#### 6.3 用 OS 区分

```text
{{- if eq .chezmoi.os "darwin" }}
# macOS
eval "$(/opt/homebrew/bin/brew shellenv)"
{{- else if eq .chezmoi.os "linux" }}
# Linux
[[ -f /home/linuxbrew/.linuxbrew/bin/brew ]] && \
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
{{- end }}
```

#### 6.4 完全跳过某些机器

`.chezmoiignore`(也支持模板):

```text
{{- if eq .class "server" }}
# 服务器不需要这些
dot_config/nvim/
dot_config/ghostty/
dot_tmux.conf
{{- end }}

{{- if not (eq .chezmoi.os "darwin") }}
# 非 macOS 不需要 cask
Brewfile.cask
{{- end }}
```

**这套机制让你"一份 dotfiles 适配所有机器"**——不是"5 个分叉的仓库"。

---

## 七、secret 处理的几种姿势

**dotfiles 里的 secret 是头号雷区**——一次推错就完蛋。**4 种主流姿势,按推荐度排**:

### 7.1 (强推)1Password / Bitwarden + chezmoi 模板

`dot_envrc.tmpl`:

```text
export GITHUB_TOKEN={{ (onepasswordRead "op://Personal/GitHub Token/credential") | quote }}
export ANTHROPIC_API_KEY={{ (onepasswordRead "op://Personal/Anthropic API/credential") | quote }}
export AWS_ACCESS_KEY_ID={{ (onepasswordRead "op://Work/AWS/access-key-id") | quote }}
export AWS_SECRET_ACCESS_KEY={{ (onepasswordRead "op://Work/AWS/secret-access-key") | quote }}
```

**优点**:secret **完全不进 git**(连加密都不进),**1Password 是 single source of truth**;新机器装上 1Password CLI(`op`),`chezmoi apply` 自动取。

**缺点**:依赖 1Password subscription(或 Bitwarden 自建)。

### 7.2 (备选)age 加密 + key 单独保管

```bash
# 1. 配置 age
chezmoi edit-config
# 加:
# encryption = "age"
# [age]
#   identity = "~/.config/age/key.txt"
#   recipient = "age1xxxx..."

# 2. 加密一个 secret 文件
chezmoi add --encrypt ~/.aws/credentials
```

source 里多一个:

```
~/.local/share/chezmoi/encrypted_private_dot_aws/credentials.age
```

**这个 .age 文件是密文,可以推 GitHub**。

**关键**:**age key 本身永远不进 git**——单独存在 `~/.config/age/key.txt`,用 1Password 当备份(把 key.txt 内容存成一条 secure note)。

### 7.3 (yadm 路线)git-crypt

```bash
# 在 dotfiles repo 里
cd ~/dotfiles
git-crypt init
# 标记需要加密的文件
echo ".aws/credentials filter=git-crypt diff=git-crypt" >> .gitattributes
git-crypt add-gpg-user your@gpg.key
git add .aws/credentials
git commit -m "Add aws creds (encrypted)"
```

clone 新机器后:

```bash
git-crypt unlock
```

**优点**:git 原生集成。**缺点**:GPG key 管理是另一个工程,**比 age 麻烦**。

### 7.4 (兜底)完全不进仓库

最简单的:**根本不让 secret 跟 dotfiles 走**。

`.chezmoiignore`:

```
.aws/
.ssh/id_*
.gnupg/
```

用一个独立的脚本(本地保管,不进 git)同步 secret:

```bash
#!/usr/bin/env bash
# sync-secrets.sh - 这个脚本永远不进 git
# 手动从 1Password 拷贝到本地

mkdir -p ~/.aws
op read 'op://Work/AWS/credentials' > ~/.aws/credentials
chmod 600 ~/.aws/credentials
```

**适合场景**:你嫌 chezmoi 模板复杂,**接受手动同步**。

### 7.5 反对的姿势

```
✗ 把 ~/.ssh/id_rsa 推到 GitHub(哪怕 private repo)
✗ 在 .zshrc 里硬编码 export GITHUB_TOKEN=ghp_xxxx
✗ 用 base64 encode 当"加密"
✗ 觉得 "git rm + push" 能擦掉历史(完全不行,要 git-filter-repo + rotate)
```

**如果误推了 secret**:

```bash
# 1. 立即 rotate(到 GitHub / AWS / 1Password 重置那个 key)
# 2. 清 git 历史
git filter-repo --path .ssh/id_rsa --invert-paths
# 3. 强推
git push --force
# 4. 通知有 clone 的人重新 clone
```

**rotate 比清历史更重要**——GitHub 的爬虫几秒就把你的 secret 抓走,清历史只是亡羊补牢。

---

## 八、常见的坑

### 8.1 把 `.git/config` 提进 dotfiles

你 `chezmoi add ~/repo/.git/config`——**把另一个仓库的 git 配置带过去了**,包括 user.email 可能是别人的、remote 是别人的 GitHub URL。

**解法**:**永远只管 `~/.gitconfig`(global),不管单个 repo 的 .git/config**;`.chezmoiignore` 里加:

```
**/.git/
```

### 8.2 secret 误进 git 历史

前面讲了,**rotate + git-filter-repo**。

**预防**:用 pre-commit hook:

```bash
# .git/hooks/pre-commit
#!/usr/bin/env bash
# 阻止常见 secret 进 git

if git diff --cached | grep -E "(ghp_[a-zA-Z0-9]{36}|sk-ant-[a-zA-Z0-9]+|AKIA[A-Z0-9]{16})"; then
  echo "BLOCKED: detected secret in diff"
  exit 1
fi
```

或装 `gitleaks` 之类工具。

### 8.3 `chezmoi apply` 不看 diff 直接跑

你在 ~/.zshrc 里手工加了一行 alias 没同步回 source,过几天 `chezmoi apply` **直接覆盖** ~/.zshrc——alias 丢了。

**解法**:**养成 `chezmoi diff` 习惯**:

```bash
# 标准工作流
chezmoi diff       # 看 source 和 target 的差异
chezmoi apply      # 确认后再 apply
```

或用 `chezmoi merge ~/.zshrc` 三路合并。

### 8.4 dotfiles 仓库一万行

你抄了 awesome-dotfiles 里 5 个项目,**合并到自己仓库 1 万行**——半年后你完全不知道每行干嘛。

**解法**:**抄逻辑不抄文件**——看人家 zshrc 怎么组织,**自己重写一份 200 行的**。

### 8.5 模板里写了 `{{ .Email }}` 但变量未定义

chezmoi apply 报:

```
template: dot_gitconfig.tmpl:3:13: executing "dot_gitconfig.tmpl" at <.Email>: 
  map has no entry for key "Email"
```

**解法**:在 `.chezmoi.toml.tmpl` 里 `promptString` 问一次,或在 `.chezmoidata.yaml` 给默认值:

```yaml
# .chezmoidata.yaml
email: "default@example.com"
```

### 8.6 模板里大小写错

Go template 区分大小写:`{{ .email }}` vs `{{ .Email }}` 是两个变量。

**习惯**:**全 lowercase**——`email` / `name` / `class` / `hostname`,避免和 chezmoi 自带的 `.chezmoi.xxx` 混。

### 8.7 把 ~/.config/nvim 整个 add 进去,plugin 目录也带上

```bash
chezmoi add ~/.config/nvim
# 但 lazy-nvim / packer 的 plugin 目录在 ~/.config/nvim/lazy/ 里
# 这些是装出来的依赖,不应该 commit
```

**解法**:`.chezmoiignore`:

```
.config/nvim/lazy/
.config/nvim/lazy-lock.json    # 看你想不想锁版本
.config/nvim/.netrwhist
```

**chezmoi 也支持 `chezmoi add --recursive` 时只挑特定文件**:

```bash
chezmoi add ~/.config/nvim/init.lua
chezmoi add ~/.config/nvim/lua
```

---

## 九、反对的写法

这一节列我**反复见过**的反模式:

### 9.1 dotfiles 仓库一万行抄出来的

GitHub 上 5k star 的 awesome-dotfiles **是别人的牙刷**——别人有别人的工作流。**直接抄你 80% 不用**:

```
那人的 zsh 配 100 个 alias —— 你只用过 5 个
那人 prompt 显示 8 个状态 —— 你只在乎 git 状态
那人 source 30 个工具 init —— 你只装了 5 个
那人的 nvim 100 个插件 —— 你 80% 不会触发
```

**解法**:**抄逻辑不抄文件**——看人家 zshrc 怎么组织(模块化、setopt 选择、PATH 拼接),**自己写一份 200 行的**。

### 9.2 secret 写明文进 git

```zsh
# .zshrc
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
export AWS_SECRET_KEY=xxxxxxxxxxxx
```

git push 一次 = 全网公开。**这条永远是 dotfiles 里最常见的灾难**。

**解法**:**第 7 节的 4 种姿势**,任选其一。

### 9.3 没有 install.sh / 引导脚本

你的 dotfiles 仓库 README 写:

```
1. clone 这个仓库
2. 装 brew
3. 装 zsh / oh-my-zsh
4. ... (10 步)
```

**新机器还是手工跑**——dotfiles 工程的价值少了一半。

**解法**:**至少有一个 bootstrap.sh**(第 5 节那种)——一行 curl 一行 sh,30 分钟全自动。

### 9.4 一个仓库装"全部",没有分层

```
yourname/dotfiles
├── .zshrc
├── .vimrc
├── .config/nvim/
├── infrastructure/terraform/      ← 这是基础设施,不该在 dotfiles
├── notes/
├── secrets-encrypted/             ← secret 单独仓库更好
├── kubernetes-manifests/          ← 这是另一回事
├── 100 个 utility scripts/
└── (5000 个文件)
```

**dotfiles 是"个人开发机配置",不是"我所有数字资产"**。

**解法**:**职责分仓**:

```
yourname/dotfiles               # 配置 + 包清单
yourname/scripts                # utility scripts
yourname/notes                  # 笔记
yourname/infrastructure          # 真基础设施
```

### 9.5 chezmoi 不看 diff 就 apply

第 8.3 节讲过——**养成习惯**:`chezmoi diff` 再 `chezmoi apply`。

### 9.6 把 plugin 锁文件 / 缓存当 dotfiles 管

```
chezmoi add ~/.config/nvim/lazy-lock.json   # 这个是 plugin 版本锁
chezmoi add ~/.zsh_history                  # 历史命令,不该在 dotfiles
chezmoi add ~/.cache/                       # 缓存!
```

**解法**:`.chezmoiignore`:

```
.cache/
.zsh_history
.local/state/
.config/*/cache/
**/__pycache__/
```

### 9.7 把 mac 系统 plist 也塞进去

```
chezmoi add ~/Library/Preferences/com.apple.Terminal.plist
chezmoi add ~/Library/Preferences/com.googlecode.iterm2.plist
```

**plist 是二进制 + macOS 特定**——跨机不通用,跨 OS 不通用,**diff 也看不懂**。

**解法**:**用工具自己的导出格式**:

```bash
# iTerm2:Settings → General → Preferences → Save Current Settings to Folder
# 选 ~/dotfiles/iterm2/
# 这样存出来的是可读 plist

# Ghostty:本来就是文本配置
chezmoi add ~/.config/ghostty/config
```

### 9.8 把 dotfiles 跟个人项目混一个 monorepo

```
yourname/personal
├── dotfiles/                # 你的 dotfiles
├── side-projects/           # 副业代码
├── learning-notes/          # 学习笔记
└── (混合 200 个目录)
```

**chezmoi 假设一个仓库就是 dotfiles**——你混着 monorepo,**bootstrap 脚本要 cd 到子目录,模板路径全部错**。

**解法**:**dotfiles 独立仓库**——chezmoi / yadm / home-manager 都假设这一点。

---

## 十、迁移指南:从裸 git 到 chezmoi

如果你已经有一个裸 git + symlink 的 dotfiles 仓库,**迁到 chezmoi 怎么做**:

### 10.1 备份

```bash
mv ~/dotfiles ~/dotfiles.bak-2026-05
```

### 10.2 init 一个空的 chezmoi

```bash
chezmoi init
# 这会生成 ~/.local/share/chezmoi/(空)
```

### 10.3 把每个文件 chezmoi add

```bash
# 一个个加,边加边决定要不要模板化
chezmoi add ~/.zshrc
chezmoi add ~/.tmux.conf
chezmoi add ~/.gitconfig
chezmoi add ~/.config/nvim
# ...
```

### 10.4 改成模板(需要的)

```bash
# 把 ~/.gitconfig 改成模板(.tmpl 后缀)
chezmoi chattr +template ~/.gitconfig
# 然后编辑,加 {{ .email }} 等
chezmoi edit ~/.gitconfig
```

### 10.5 配置 .chezmoi.toml.tmpl

每台机器首次 init 会问的问题:

```text
{{- $email := promptString "email" -}}
{{- $class := promptStringOnce . "class" "class (work/home/server)" "work" -}}

[data]
    email = {{ $email | quote }}
    class = {{ $class | quote }}
```

### 10.6 推到 GitHub

```bash
chezmoi cd
git init
git add .
git commit -m "Initial chezmoi setup"
gh repo create yourname/dotfiles --private --source=. --push
```

### 10.7 在另一台机器验证

```bash
# 别的机器
chezmoi init --apply https://github.com/yourname/dotfiles
```

**跑通这一步,迁移就成功了**。

---

## 十一、看完这一篇,你应该能

- **讲清楚 dotfiles 工程要解决的 5 件事**(配置 / 软件 / secret / 差异 / 回滚)——而不是"把 .zshrc commit 到 git"
- **在 5 个方案里选出适合自己的一个**——裸 git / stow / yadm / chezmoi / home-manager
- **在新机器上一行命令引导 dotfiles**——`chezmoi init --apply ...`(或类似)
- **用 chezmoi 模板处理跨 OS / 跨主机差异**——不是维护"3 份 zshrc"
- **正确处理 secret**——1Password / age / 不进 git,**绝对不能明文 export 在 zshrc**
- **写一份 bootstrap.sh**——新机器 30 分钟自动化引导
- **看到 GitHub 上 5k star 的 dotfiles**,**第一反应是"抄逻辑不抄文件"**

### 11.1 自查清单

读完这一篇,做一遍:

```
□ 你的 dotfiles 仓库存在吗?如果没有,今天创建
□ 用的是 5 个方案里的哪个?是裸 git 吗?
□ 跑 grep -r "ghp_\|sk-ant-\|AKIA" ~/dotfiles,确认没有 secret 明文
□ 仓库里有 bootstrap.sh 吗?能在新机器一行跑通吗?
□ 装了 chezmoi 吗?(brew install chezmoi)
□ chezmoi init 试一次,把至少 .zshrc 和 .gitconfig 纳管
□ 改一行 .zshrc(用 chezmoi edit),走一遍 diff → apply 流程
□ 加一个 1Password 引用的 secret 模板(GitHub Token)
□ 找一台备用机 / VM,跑一次 chezmoi init --apply 你的 repo,验证能复刻
```

**做完这 9 条,你的 dotfiles 工程化就过线了**——剩下的是迭代和长期维护。

---

## 十二、下一篇预告

下一篇:**`23-包管理器对比.md`**——讲 **brew / apt / pacman / dnf / Nix** 的选型 + Brewfile 工作流。

dotfiles 解决"配置 + secret",但"软件清单"(brew 装哪些包、apt 装哪些包)**是另一个工程**——下一篇拆开来讲:

- **三层包管理器架构**:系统级 / 语言级 / 多版本工具(为什么不该混)
- **brew 实战**:Formula / Cask / Brewfile / `brew bundle`
- **apt / pacman / dnf**:Linux 发行版的差异
- **Nix 简介**:跨平台 + 不可变 + 函数式(25 篇专讲)
- **跨平台 install.sh**:一份脚本 macOS + Linux 都跑
- **GUI 应用怎么管**:macOS cask vs Linux flatpak/snap
- **更新策略**:`brew upgrade` 频率 / 包冲突解决

读完 23 篇,**你不仅有 chezmoi 管配置,还能把"装哪些软件"也工程化**——配合 chezmoi 的 `run_once_install-packages.sh.tmpl`,**新机器引导从"装 + 配"变成一行命令**。
