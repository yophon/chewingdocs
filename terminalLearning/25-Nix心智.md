# Nix 心智:可复现的尽头,代价是一门新语言

每年都有几个时刻,你在 HN / Reddit 看到这样的标题:**「Why I switched my whole dev setup to Nix」**、**「我用 NixOS 五年,机器从未重装过」**、**「Nix flake 让我的同事十分钟搭好开发环境」**。你心想,**"该试试了"**——结果打开 Nix 官方文档,第一页就被术语炸开:**Nix / NixOS / Nixpkgs / Flakes / Channels / Home Manager / nix-darwin / nix-shell / nix develop / experimental-features**……翻了三遍,你不知道**「我作为 macOS / Linux 用户,到底装什么、用什么、忽略什么」**。

**两周后,80% 的工程师退回 brew + mise**——不是他们没毅力,**是 Nix 这套生态的"入门曲线"实在反人类**。

但与此同时,**另外 20% 真正坚持下来的人,五年后没换过工作流**——他们的 dotfiles 是一份 `flake.nix`,新机器装 Nix → `nix run` 一行,**5 年前的环境分毫不差地复活**。他们看你还在重装 nvm / pyenv,**就像 2010 年还在自己编译 nginx 的人看用 Docker 的人**——**"这件事我十年前就解决了"**。

这一篇要回答的核心问题:**Nix 这个坑,你 / 你团队 该不该入**?

> 一句话先记住:**Nix 是 2026 年最强的可复现工具——函数式 + 声明式 + 内容寻址 + 不可变,装的东西就是一棵纯函数树,新机器装出的版本和你一模一样。代价是学一门 DSL + 换一套心智 + 接受文档烂——80% 工程师两周后放弃,这不是你的错**。

24 篇讲了 mise 解决「项目级版本管理」**——一个 `.mise.toml` 让团队 Node / Python 版本对齐**。但 mise 不解决「**这台机器的系统包是什么、跨 OS 装的版本是否一致、5 年后能不能复刻**」。**Nix 解决这一切**——代价是把"装东西"这件 30 年的老事重做一遍。

这一篇拆开讲:**Nix 想解决的 5 个问题**、**4 个核心概念**(不可变 store / 配置即代码 / 原子升级 / 声明式)、**三种用法**(只 Nix / NixOS / nix-darwin)、**Nix DSL 速通**、**flakes 速通**、**home-manager + nix-darwin 各一份配置**、**Nix vs mise + chezmoi 全方位对比**、**入门路径**(怎么不踩坑)、**Nix 在 2026 的现实**(优缺点)、**该不该学 Nix 的判定**、**替代方案**、**反对的写法**——读完你能判断:**Nix 这门手艺,你这两个月该不该投入**。

---

## 一、Nix 想解决的 5 个问题

理解 Nix 之前,先理解它要替代的世界——**brew / apt / pip / npm 这些"传统包管理器"留给我们 30 年的 5 个老问题**。

### 1.1 问题 1:同一个 `brew install python` 装出不同版本

```
你 2024 年 1 月在 Mac 上跑:
   brew install python
   ──> 装到 Python 3.12.1
   写好一段脚本,跑通,commit

同事 2024 年 6 月在他 Mac 上跑:
   brew install python
   ──> 装到 Python 3.12.4
   跑你的脚本,某个 typing 行为变了,挂

你 2024 年 12 月新买 Mac,brew install python:
   ──> 装到 Python 3.13.1
   跑同一段脚本,某个 stdlib 内容删了,挂
```

**问题根因**:**brew 仓库的"当前版本"是动态的**——同样的 `brew install python` 命令,**在不同时间、不同机器装出的版本不一样**。**这就是"在我电脑能跑"的根源**——你的电脑装的不是 Python,是「这一刻 brew 仓库里的 Python」。

**Nix 的反应**:**版本由 `flake.lock` 写死**,任何时间任何机器跑 `nix build`,**装出来的 Python 二进制一字节都不差**——因为 lock 文件里记录的是「这个 Python 派生(derivation)的内容寻址哈希」,**全球唯一**。

### 1.2 问题 2:跨 OS 不一致

```
你的团队:
   - macOS 用 brew(包名 postgresql 是版本 16)
   - Ubuntu 用 apt(包名 postgresql 是版本 14)
   - Alpine 用 apk(包名 postgresql 是版本 15)
   - Arch 用 pacman(包名 postgresql 是版本 17)
   
四套发行版,四套版本,四套包名,四套配置目录
你写文档:"装 Postgres 14",4 个工程师装出 4 个版本
```

**Nix 的反应**:**Nixpkgs 是一个统一仓库**,在 macOS / Linux 上跑同一份 `nix run nixpkgs#postgresql_16`,**装的二进制是同一个**(都是 Nix 从源码编译或预编译的二进制),不依赖 OS 包管理器。

### 1.3 问题 3:依赖冲突 + 多版本共存

```
你同时要:
   - 项目 A:需要 Python 3.10(因为 TensorFlow 1.x 只支持 3.10)
   - 项目 B:需要 Python 3.12(因为新特性 generic)
   - 项目 C:Node 14 + 一个 Postgres 12 CLI
   - 全局工具:某个 CLI 用 Python 3.13 写的

5 个 Python 版本想同时装,brew 怎么办?
   brew install python@3.10  python@3.11  python@3.12  python@3.13
   ──> 装是装上了,但只有一个能"link"成 /opt/homebrew/bin/python
   ──> 其他要 brew link --force,改 .zshrc PATH,手忙脚乱
```

**Nix 的反应**:**所有版本天然共存**——每个版本住在 `/nix/store/HASH-python-3.10.14/`、`/nix/store/HASH-python-3.12.7/`,**用 hash 区分,没有"link 冲突"这个概念**。要哪个版本,**直接引用对应 hash**。

### 1.4 问题 4:rollback 困难

```
某天你 brew upgrade,把 PostgreSQL 14 升到 16
PostgreSQL 16 的初始化方式变了,你的本地数据库挂
你想回 14:
   brew uninstall postgresql
   brew install postgresql@14
   ──> 这是一个全新装,数据库目录可能丢
   ──> 之前的版本痕迹被删了,你回不到"升级前那个状态"
```

**Nix 的反应**:**每次系统改动都生成一个新 generation**(代际),**旧 generation 完全保留**。回滚就是切到上一个 generation:

```bash
# 看历史
nix-env --list-generations
# 1   2024-10-15 10:23:11
# 2   2024-11-02 14:55:01
# 3   2024-12-08 09:42:30   (current)

# 回到 2
nix-env --switch-generation 2
# 一行,系统瞬间回到那个时刻的状态
```

**这是 Nix 最让人破防的设计**——**整台机器都有版本控制,像 git 一样**。

### 1.5 问题 5:环境污染

```
brew install something
   ──> 把 something 装到 /opt/homebrew/Cellar/something/X.Y.Z/
   ──> 软链到 /opt/homebrew/bin/something
   ──> 但 something 又装了 5 个依赖到 /opt/homebrew/Cellar/...
   ──> 这些依赖被全局用了,卸 something 不会卸它们
   
半年后 brew list:
   500 个包,你不知道有 200 个是"过时但没被卸的依赖"
   brew cleanup 清半天,还是不干净

pip install:
   全局 site-packages 满是过期的 lib
   卸了又怕影响别人
   
现状:你的 ~ 目录 / /usr/local / /opt 是一个"积累了 5 年灰尘的房间"
```

**Nix 的反应**:**整个 store 是不可变的**,删一个包就是删 `/nix/store/HASH-name/` 这个目录,**精确、彻底、原子**。**Nix 的 garbage collector 知道"什么不再被任何 generation 引用",一行 `nix-collect-garbage -d` 清干净**。

---

## 二、Nix 的 4 个核心概念

理解了"它要解决什么",接下来理解"它怎么解决的"——**4 个核心心智**。

### 2.1 概念 1:不可变 store(内容寻址)

```
传统 brew / apt:
   /opt/homebrew/bin/python    ──> 一个符号链接,指向当前版本
   升级 = 替换这个链接的目标
   
Nix:
   /nix/store/3v8x...-python-3.12.7/bin/python    ← 32 字符哈希
   /nix/store/m4qz...-python-3.10.14/bin/python   ← 另一个哈希
   /nix/store/k1ya...-python-3.13.0/bin/python    ← 又一个
   
   每个版本独占一个目录,目录名包含:
      - 内容 hash(根据这个包的所有 input 算出来,任何依赖变了 hash 就变)
      - 包名 + 版本
   
   /nix/store 是只读的、不可变的、内容寻址的
```

**为什么这样设计**:**让"同一个 hash = 同一个二进制"这个等式始终成立**。两台机器上,只要 hash 相同,**字节级完全一致**。**这就是"可复现"的物理基础**。

```
传统升级 = 覆盖文件,旧的消失
Nix 升级 = 新装一个 hash 目录,旧的还在,只是软链不指向它了
        = "升级"和"安装"是同一件事
        = "卸载"是"软链不再指向 + 没有 generation 引用它"
        = "回滚"是"软链指向旧 hash"
        = "GC"是"没有 generation 引用的 hash 目录被删"
```

**这套机制干净、对称、纯函数式**——每一步操作都是「**只增不改**」。

### 2.2 概念 2:配置即代码(declarative)

```
传统 brew + dotfiles:
   "我装了什么"分散在:
      - brew list   (实际装了什么)
      - Brewfile    (我希望装什么)
      - ~/.gitconfig (一个手写文件)
      - ~/.zshrc    (一个手写文件)
      - ~/.config/nvim/* (一堆 lua)
      - cron / launchd 服务
   
   总之"机器当前状态"和"我希望的状态"是两件事
   靠 Brewfile + chezmoi + 手动维护勉强对齐
```

**Nix 的做法**:**一份 `configuration.nix` / `flake.nix` 描述「我希望机器是什么样的」**,系统按这份描述配置:

```nix
# flake.nix(简化)
{
  description = "My machine";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";

  outputs = { self, nixpkgs }: {
    # 这里声明 "我希望系统是这样的"
    homeConfigurations.me = {
      packages = with nixpkgs; [
        git
        neovim
        ripgrep
        fd
        fzf
        bat
        zsh
      ];
      
      programs.git = {
        enable = true;
        userName = "Me";
        userEmail = "me@example.com";
      };
      
      programs.zsh.enable = true;
    };
  };
}
```

**一行 `nix run home-manager -- switch`,系统对齐**——装上 7 个包、改 ~/.gitconfig、改 ~/.zshrc,全部按声明执行。**改一行声明,再 switch,系统就变了**。

**这跟 Ansible / Terraform / Kubernetes 是一个范式**——**声明式而非命令式**。你说"我要这个状态",工具负责"怎么从当前到这个状态"。

### 2.3 概念 3:原子更新 + rollback

```
你改 flake.nix,加了一个包,跑 nix run home-manager -- switch:

   生成 generation 5(在新位置准备好新状态)
        ↓
   原子切换 symlink(/run/current-system 指向 generation 5)
        ↓
   旧的 generation 4 还在,没动
        
现在你出问题:
   nix-env --switch-generation 4
   ──> 软链切回去,旧状态瞬间复活
   ──> 不是"卸载新包再装旧包",是"切指针"
```

**这就是"代际(generation)"**——**整台机器是不可变的版本控制对象**。

NixOS 启动菜单(Linux):

```
GRUB:
   ▸ NixOS - Generation 47   (latest)
     NixOS - Generation 46
     NixOS - Generation 45
     ...
     NixOS - Generation 1    (initial install)
```

**Boot 的时候你能直接选老 generation**——升级搞挂内核?**重启选上一代,系统活回来**。

### 2.4 概念 4:声明式 vs 命令式

这是最大的心智冲击,**单独讲清楚**:

```
命令式包管理(brew / apt):
   "我做这些动作来改变系统"
   
   brew install neovim           ← 动作
   brew install --cask ghostty   ← 动作
   echo "alias g=git" >> ~/.zshrc ← 动作
   defaults write com.apple.dock orientation right  ← 动作
   ...
   
   动作的累积 = 当前系统状态
   "系统现在是什么样"取决于"过去 N 次动作的累加"
   永远不知道现在的状态是怎么来的(动作的历史在 shell history 里)


声明式包管理(Nix / NixOS):
   "我描述我希望系统是什么样的"
   
   programs.neovim.enable = true;          ← 描述
   programs.ghostty.enable = true;         ← 描述
   programs.zsh.shellAliases.g = "git";    ← 描述
   targets.darwin.defaults."com.apple.dock".orientation = "right";  ← 描述
   ...
   
   描述 = 当前系统状态
   "系统现在是什么样" = 描述文件直接告诉你
   "怎么来的" = git log
```

**命令式是过程,声明式是状态**。**Nix 是这两个范式的差别**——一旦理解,你看 brew 就像在看「忘记动作就找不回来的状态」。

---

## 三、Nix 的三种用法

Nix 有 3 个层级,**入坑前一定要分清,选最浅的开始**。

### 3.1 层级 1:只装 Nix(macOS / Linux 用户)

```
在你现有的 OS 上,只装 Nix 这个包管理器。
   不动你的 macOS / Ubuntu / Arch
   不动你的 brew / apt
   只在 /nix/store 多一个目录,$PATH 里多一段
   
   能用 Nix 做的:
      - nix run nixpkgs#hello       (跑某个包,不装)
      - nix profile install nixpkgs#ripgrep   (装到用户 profile)
      - nix develop                 (进入项目专属 devShell)
      - flake.nix 给项目定义可复现环境

   入门门槛:★★(装 Nix + 学几个命令)
```

**适合**:**90% 想试 Nix 的工程师**。**就这个层级**。不要往下跳。

### 3.2 层级 2:Nix + home-manager(管 dotfiles + 用户包)

```
在层级 1 之上,装 home-manager。
   home-manager 是一个 Nix 模块,管:
      - 你的用户级 dotfiles(.zshrc / .gitconfig / .config/nvim)
      - 你的用户级包(per-user 装包)
   
   你写一份 home.nix,描述"我的用户环境长什么样"
   home-manager switch 一行,环境对齐
   
   入门门槛:★★★(学 Nix DSL + home-manager 模块)
```

**适合**:**已经在层级 1 玩 1-2 个月,想把 dotfiles 也用 Nix 管的人**。

### 3.3 层级 3:NixOS(整盘装 NixOS)/ nix-darwin(管 macOS 系统)

```
NixOS (Linux):
   整个 OS 都用 Nix 描述
   /etc/nixos/configuration.nix 是这台机器的"定义"
   重装就是装 NixOS + 拷贝这个文件 + 一行 nixos-rebuild switch
   
nix-darwin (macOS):
   把 macOS 的系统级配置也用 Nix 描述
   ~/.config/nix-darwin/darwin-configuration.nix
   darwin-rebuild switch 应用配置
   能改 macOS 默认设置(defaults write)、装 brew cask、设服务

   入门门槛:★★★★★(NixOS 是"换 OS",nix-darwin 是"接管 macOS 系统设置")
```

**适合**:**已经在层级 2 玩半年以上、想"整台机器声明式"的极客**。**绝大多数人不需要走到这里**。

### 3.4 这一篇的主推路径

```
本篇主推:
   层级 1:Nix(包管理器,装在 macOS / Linux 上)
        ↓
   层级 2:home-manager(管 dotfiles)
        ↓ (可选,半年后)
   层级 3:nix-darwin(macOS 系统级)
        或 NixOS(Linux 整盘装)

不推荐:
   ✗ 上来直接装 NixOS(陡 + 全 OS 一起换)
   ✗ 用 macOS,把所有东西丢给 nix-darwin(GUI 应用不好管)
   ✗ 在团队里强推 Nix(没人 review 你的 nix 配置)
```

---

## 四、Nix DSL 速通

Nix 是**函数式表达式语言**,语法陌生但概念简单。**6 个语法点搞定**:

### 4.1 字面量

```nix
# 字符串
"hello"
''
  multi-line
  string
''   # 双单引号

# 数字
42
3.14

# 布尔
true
false

# null
null

# 列表(空格分隔)
[ 1 2 3 ]
[ "a" "b" "c" ]

# 属性集(类似 JS object)
{
  name = "alice";
  age = 30;
}
```

### 4.2 函数(单参数,curry)

```nix
# 一元函数
x: x + 1

# 多元函数(其实是 curry)
x: y: x + y

# 调用
(x: x + 1) 5    # = 6

# 命名参数(属性集解构)
{ name, age }: "${name} is ${toString age}"

# 调用
({ name, age }: "${name} is ${toString age}") { name = "alice"; age = 30; }
```

### 4.3 let / in 局部变量

```nix
let
  x = 1;
  y = 2;
in
  x + y     # = 3
```

### 4.4 with(类似 JavaScript 的 with,作用域注入)

```nix
let
  pkgs = { hello = "world"; foo = "bar"; };
in
  with pkgs; [ hello foo ]    # = [ "world" "bar" ]
  # 等同于 [ pkgs.hello pkgs.foo ]
```

**在 Nix 配置里经常看到 `with pkgs; [...]`**,意思是「打开 `pkgs` 这个属性集的命名空间」,**写包名不用 `pkgs.` 前缀**。

### 4.5 import / 函数即文件

```nix
# 一个 .nix 文件就是一个表达式,可以 import
let
  helpers = import ./helpers.nix;
in
  helpers.someFunction "arg"
```

### 4.6 mkShell / mkDerivation(实际写 flake 用到的)

```nix
# 一份 shell.nix(项目专属开发环境)
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    python312
    rust-bin.stable.latest.default
    postgresql_16
  ];
  
  shellHook = ''
    echo "Welcome to dev environment"
    export DATABASE_URL="postgres://localhost/dev"
  '';
}
```

**解释**:

```
{ pkgs ? import <nixpkgs> {} }: ...
   这是一个函数:
   - 参数 pkgs,默认值是 "import <nixpkgs> {}"(取 nixpkgs 仓库)
   - 函数体是 pkgs.mkShell { ... }

mkShell { buildInputs = ...; shellHook = ...; }
   调用 mkShell 函数,传一个属性集:
   - buildInputs:这个 shell 里要可用的包
   - shellHook:进入 shell 时跑的 bash 脚本
```

**用法**:

```bash
nix-shell      # 进入这个 shell(老姿势)
nix develop    # 用 flake 时(新姿势)
```

**至此你看 Nix 表达式不再陌生了**——`{ ... }` 是属性集,`x: ...` 是函数,`with ...` 是命名空间。

---

## 五、flakes 速通

flakes 是 Nix 2021 加的实验功能,**2026 已经事实标准**。**新项目无脑用 flake**。

### 5.1 为什么要 flakes

```
传统 nix-shell:
   shell.nix 依赖 <nixpkgs>,这是个 channel(滚动更新)
   ──> 你的 shell.nix 今天跑出 Python 3.12.4
   ──> 半年后再跑,可能是 3.12.7
   ──> 跟 brew install python 一样不可复现

flakes:
   flake.nix + flake.lock
   ──> flake.lock 锁定具体的 nixpkgs 版本(到 commit 级)
   ──> 任何机器、任何时间跑同一个 flake,产出完全相同
```

**flake = Nix 的 package.json + lock 文件**。

### 5.2 最小 flake.nix

```nix
{
  description = "My dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_22
            python312
            postgresql_16
            ripgrep
            fzf
          ];
          
          shellHook = ''
            echo "Dev shell ready (Node $(node --version), Python $(python --version))"
          '';
        };
      });
}
```

**用法**:

```bash
# 项目根
cd ~/my-project

# 写 flake.nix(上面那段)
# 进入 dev shell
nix develop
# 现在 PATH 里有 node 22 / python 3.12 / postgres 16 / rg / fzf

# 退出
exit

# 改 flake 后,生成 lock 文件
nix flake lock
git add flake.nix flake.lock
git commit -m "feat: add nix dev shell"
```

### 5.3 flake.lock 锁文件

```json
{
  "nodes": {
    "nixpkgs": {
      "locked": {
        "lastModified": 1719842600,
        "rev": "abc123...def789",
        "type": "github",
        "owner": "NixOS",
        "repo": "nixpkgs",
        "ref": "nixos-24.05"
      }
    },
    "flake-utils": { ... }
  },
  "version": 7
}
```

**所有 input(nixpkgs / flake-utils)都锁到具体 commit hash**。**5 年后跑同一个 flake,装出的 Node 22 是同一个二进制**。

### 5.4 升级 input

```bash
# 升级所有 input 到最新
nix flake update

# 只升级 nixpkgs
nix flake lock --update-input nixpkgs

# 看 input 状态
nix flake metadata
```

### 5.5 nix develop 是 dev container 替代

**24 篇看了 mise [tasks] 是轻量任务运行器**。**flake 的 `devShells` 是轻量 dev container**:

```
传统 dev container(VS Code):
   .devcontainer/devcontainer.json + Dockerfile
   一个 Docker 镜像,几 GB,启动慢
   要装 Docker
   只在 VS Code 里方便

nix develop:
   flake.nix(几十行)
   不要 Docker,直接在 host 上跑
   启动毫秒级(Nix store 内容已经装好)
   任何编辑器都行(终端、Vim、Cursor)
   跨平台:Linux + macOS 同一份 flake
```

**26 篇会专讲 Devcontainer**,这里只点:**Nix devShell 是"轻量 + 跨编辑器"的 dev 环境替代品**。

---

## 六、home-manager:声明式 dotfiles

home-manager 是 Nix 生态里**最实用的工具之一**——**用 Nix 描述你的 dotfiles**。

### 6.1 home-manager 解决什么

```
传统 dotfiles 仓库:
   ~/.zshrc           (一份手写的 bash 脚本)
   ~/.gitconfig       (一份手写的 ini)
   ~/.tmux.conf       (一份手写的 tmux 配置)
   ~/.config/nvim/init.lua (lua 配置)
   ~/.config/starship.toml
   ...
   
   用 chezmoi / stow / 裸 git 把这些同步到多台机器
   
痛点:
   - 这些是"被部署的产物",不是"我希望的描述"
   - .zshrc 里抄 oh-my-zsh 一段 + 自己写的 + 临时改的,混在一起
   - 改完不知道改对了没,要 source 一次试
   - 新机器装完,可能某个 brew install 没装,某个 alias 没生效
```

**home-manager 的做法**:**用 Nix 描述每个工具的配置,生成对应的 dotfile**:

```nix
# home.nix
{ config, pkgs, ... }:

{
  home.username = "me";
  home.homeDirectory = "/Users/me";
  home.stateVersion = "24.05";

  # 装这些包到用户级
  home.packages = with pkgs; [
    ripgrep
    fd
    bat
    eza
    fzf
    jq
    httpie
    tmux
    neovim
    starship
  ];

  # 配置 git
  programs.git = {
    enable = true;
    userName = "Me";
    userEmail = "me@example.com";
    aliases = {
      st = "status";
      ci = "commit";
      co = "checkout";
    };
    extraConfig = {
      core.editor = "nvim";
      pull.rebase = true;
      init.defaultBranch = "main";
    };
  };

  # 配置 zsh
  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;
    
    shellAliases = {
      ll = "eza -la";
      g = "git";
      v = "nvim";
      cat = "bat";
    };
    
    history = {
      size = 100000;
      path = "${config.xdg.dataHome}/zsh/history";
    };
    
    initContent = ''
      eval "$(mise activate zsh)"
    '';
  };

  # 配置 starship 提示符
  programs.starship = {
    enable = true;
    settings = {
      add_newline = false;
      character = {
        success_symbol = "[➜](bold green)";
        error_symbol = "[➜](bold red)";
      };
    };
  };

  # 配置 tmux
  programs.tmux = {
    enable = true;
    prefix = "C-a";
    mouse = true;
    keyMode = "vi";
    extraConfig = ''
      set -g default-terminal "screen-256color"
      bind | split-window -h
      bind - split-window -v
    '';
  };
}
```

**用法**:

```bash
# 装 home-manager(一行)
nix run home-manager -- init --switch

# 改了 home.nix 之后
home-manager switch
# 一行生效:
#   - 装/卸包(包列表对齐)
#   - 改 ~/.zshrc / ~/.gitconfig / ~/.tmux.conf (内容对齐)
#   - 服务启动/停止(launchd / systemd)
```

### 6.2 home-manager 的杀手特性

```
1. 每次 switch 生成一个 generation
   home-manager generations
   ──> 看历史 + 切回去
   
2. 包和配置原子化
   要么全装好,要么不变
   ──> 不会出现 "包装了但配置没改" 的中间状态

3. 跨平台
   同一份 home.nix 在 macOS / Linux 都跑

4. 模块化
   imports = [ ./modules/zsh.nix ./modules/git.nix ];
   ──> 拆成多个文件维护

5. 跟 nix-darwin / NixOS 无缝集成
   把 home-manager 嵌入到 system config 里
```

### 6.3 chezmoi vs home-manager

**22 篇讲了 chezmoi**(dotfiles 模板工具)。**home-manager 是更激进的替代**:

```
                    chezmoi              home-manager
心智                  模板渲染 + 文件部署    声明式 + Nix 表达式
描述能力              字符串模板            完整函数式语言
管包                  无(配合 brew)        有(Nix 装包)
跨平台                ★★★★(挺好)         ★★★★★(完美)
学习曲线              ★★(简单)            ★★★★★(陡)
启动慢                无                    无
社区生态              新                    完整
GUI 友好              一般                  差(主要是 CLI 包)
适用场景              个人 dotfiles + brew   团队 + 跨 OS + 全声明
```

**结论**:**chezmoi 是 70 分方案,够大多数人**;**home-manager 是 95 分方案,陡,但是真终极**。

---

## 七、nix-darwin:管 macOS 系统级

如果你只用 macOS、想"系统级也声明式",**nix-darwin** 是答案。

### 7.1 nix-darwin 能管什么

```
- 系统级包(/run/current-system/sw/bin/)
- 系统级服务(launchd)
- macOS defaults(defaults write 一类)
- 字体(系统级字体)
- 用户(/etc/passwd)
- shells(/etc/shells)
- brew bundle(让 Nix 调用 brew 装 cask)
- home-manager(嵌入)
```

### 7.2 最小 darwin-configuration.nix

```nix
# ~/.config/nix-darwin/flake.nix
{
  description = "My macOS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs, home-manager }: {
    darwinConfigurations."my-mac" = nix-darwin.lib.darwinSystem {
      system = "aarch64-darwin";
      modules = [
        ({ pkgs, ... }: {
          # 系统级包
          environment.systemPackages = with pkgs; [
            git
            vim
            curl
          ];

          # 让 nix-darwin 管 brew cask
          homebrew = {
            enable = true;
            brews = [ ];
            casks = [
              "ghostty"
              "raycast"
              "slack"
              "1password"
            ];
            onActivation.cleanup = "uninstall";  # 不在列表里的 cask 自动卸
          };

          # macOS 系统默认设置
          system.defaults = {
            dock = {
              autohide = true;
              orientation = "right";
              show-recents = false;
            };
            finder = {
              AppleShowAllExtensions = true;
              ShowPathbar = true;
            };
            NSGlobalDomain = {
              AppleShowAllExtensions = true;
              InitialKeyRepeat = 14;
              KeyRepeat = 1;
              "com.apple.keyboard.fnState" = true;
            };
          };

          # 字体
          fonts.packages = with pkgs; [
            (nerdfonts.override { fonts = [ "JetBrainsMono" ]; })
          ];

          # zsh 全局开启
          programs.zsh.enable = true;

          # 用户
          users.users.me = {
            name = "me";
            home = "/Users/me";
          };

          # state version(锁)
          system.stateVersion = 5;
        })

        # 把 home-manager 也挂进来
        home-manager.darwinModules.home-manager
        {
          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.users.me = import ./home.nix;
        }
      ];
    };
  };
}
```

**用法**:

```bash
# 第一次装
nix run nix-darwin -- switch --flake ~/.config/nix-darwin#my-mac

# 之后改了 flake.nix 或 home.nix
darwin-rebuild switch --flake ~/.config/nix-darwin#my-mac

# 一行:
#   - 装/卸系统包
#   - 装/卸 brew cask
#   - 应用 macOS defaults
#   - 装字体
#   - home-manager 也一并 switch
```

**重装 Mac 的步骤**:

```bash
# 新 Mac 到手,装完系统后:
# 1. 装 Nix
sh <(curl -L https://nixos.org/nix/install)

# 2. 拉 dotfiles repo
git clone git@github.com:me/dotfiles.git ~/.config/nix-darwin

# 3. 一行复刻
nix run nix-darwin -- switch --flake ~/.config/nix-darwin#my-mac

# 等 5-15 分钟,机器变回你的样子
# - 所有包装好
# - 所有 cask 装好
# - 所有系统设置改好
# - 所有 dotfiles 部署
# - 字体装好
```

**这才是"换机不换工作流"的真正终点**。

---

## 八、Nix vs mise / brew + chezmoi 全方位对比

```
┌─────────────────────┬─────────┬──────────────────────┐
│                     │   Nix   │   brew + chezmoi+mise │
├─────────────────────┼─────────┼──────────────────────┤
│ 可复现度             │   ★★★★★ │   ★★★(取决于 brew    │
│                     │         │   当前仓库状态)      │
│ 跨平台一致           │   ★★★★★ │   ★★★(macOS-centric, │
│                     │         │   Linux 用 apt)      │
│ rollback             │   ★★★★★ │   ★(brew 没有,      │
│                     │         │   chezmoi 用 git)    │
│ 学习曲线             │   ★★★★★ │   ★★(普通)         │
│   (陡)             │         │                      │
│ 社区 / 文档          │   ★★(零散  │   ★★★★(主流)      │
│                     │   + 双轨)│                      │
│ GUI 应用生态         │   ★(差)│   ★★★★(brew cask)   │
│ 启动延迟             │   ★★(eval│   ★★★★★(快)        │
│                     │   慢)   │                      │
│ secret 管理         │   ★★★(sops│   ★★★★(用 mise)    │
│                     │   -nix)  │                      │
│ 团队推广难度          │   ★★★★★ │   ★★(易)           │
│   (难)             │         │                      │
│ 长期复利              │   ★★★★★ │   ★★★(中)          │
│                     │         │                      │
│ "新机器复刻"时间      │   10-30  │   1-3 小时           │
│                     │   分钟   │                      │
│ 5 年后还能跑同结果   │   ✓       │   ✗(brew 不锁版本)  │
└─────────────────────┴─────────┴──────────────────────┘
```

**翻译这张表**:

```
你是不是这样:
   ✓ 一台 Mac 用 5 年,不换 OS
   ✓ 个人开发,没团队
   ✓ 不要 patch 级可复现
   ✓ 想要 GUI 应用、cask 生态
   ──> brew + chezmoi + mise 完全够

你是不是这样:
   ✓ 团队跨 macOS + Linux 开发
   ✓ 每年换 2-3 次机器(公司发的 / 跳槽 / 远端机)
   ✓ 要"5 年后还能复刻今天环境"
   ✓ 能接受 2-4 周陡坡
   ✓ 函数式心智不排斥
   ──> Nix 是值的
```

---

## 九、入门路径:不踩坑的 5 步

**绝大多数失败案例都是「一上来就 NixOS / 一上来就 flake-parts 全家桶」**。**正确路径如下**:

### 9.1 步骤 1:在 macOS / Linux 装 Nix(无 NixOS)

```bash
# 用 Determinate Systems 的安装器(比官方好,带 flakes 默认开)
curl --proto '=https' --tlsv1.2 -sSf -L \
  https://install.determinate.systems/nix | sh -s -- install

# 验证
nix --version
# nix (Nix) 2.24.x

# 试一下 nix run
nix run nixpkgs#hello
# Hello, world!
```

**这一步**:**只装 Nix,不动其他**。**用 1-2 周熟悉 `nix run` / `nix profile` / `nix search`**。

### 9.2 步骤 2:给一个项目写 flake.nix

挑你常用的一个项目,**写 flake.nix 当 devShell**:

```nix
# flake.nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_22
            python312
            postgresql_16
          ];
        };
      });
}
```

```bash
nix flake lock     # 生成 lock
git add flake.nix flake.lock
git commit -m "feat: add nix dev shell"

# 进入 dev shell
nix develop
```

**这一步**:**flake 当项目工具(替代部分 mise)**。**用 1 个月感受"5 年后还能跑出同一个 Python"**。

### 9.3 步骤 3:加 home-manager(管 dotfiles)

```bash
# 装 home-manager
nix run home-manager -- init --switch
```

写最小的 `~/.config/home-manager/home.nix`:

```nix
{ config, pkgs, ... }:
{
  home.username = "me";
  home.homeDirectory = "/Users/me";
  home.stateVersion = "24.05";

  home.packages = with pkgs; [
    ripgrep
    fd
    fzf
    bat
  ];

  programs.git = {
    enable = true;
    userName = "Me";
    userEmail = "me@example.com";
  };
}
```

```bash
home-manager switch
# rg / fd / fzf / bat 装好
# ~/.gitconfig 生成
```

**这一步**:**dotfiles 用 home-manager 管**。**用 2 个月把 zsh / tmux / nvim / starship 都迁过来**。

### 9.4 步骤 4(可选):nix-darwin / NixOS

**只有当步骤 3 跑了 3-6 个月、彻底理解 Nix 心智后,再考虑这一步**。

```bash
# macOS:
nix run nix-darwin -- switch --flake ~/.config/nix-darwin

# Linux:
# 整盘装 NixOS,/etc/nixos/configuration.nix
sudo nixos-rebuild switch
```

**这一步**:**整机声明式,新机器 30 分钟复刻**。

### 9.5 步骤 5(可选):团队推广

```
注意:
   团队推广 Nix 比个人难 10 倍
   一定要有 1-2 个 nix 老手帮做 review / 救火
   否则团队每个人陷"Nix DSL 不会写"的泥潭

推广策略:
   1. 先内部出一份 flake.nix 模板(devShell)
   2. 让 1-2 个项目先用,看反馈
   3. CI 用 cachix(避免每次重 build)
   4. 半年后再讨论 home-manager / nix-darwin
```

---

## 十、Nix 在 2026 的现实

**优点已经讲了**。**缺点必须讲清楚**——这是 80% 工程师两周后退回 brew 的原因。

### 10.1 文档烂(双轨混乱)

```
Nix 文档的现状:
   - 老姿势:nix-env / nix-channel / configuration.nix(2010+ 老资料)
   - 新姿势:nix profile / flakes(2021+,事实标准)
   - 官方文档同时有两套,新人懵
   - 第三方教程也是两套混着

你 Google "nix shell.nix tutorial":
   ──> 一半教 shell.nix(老)
   ──> 一半教 flake.nix(新)
   ──> 两者并不兼容
   ──> 你不知道 2026 该信哪个
```

**经验**:**只学 flakes,不学 channels / nix-env**——**老姿势在死,别浪费时间**。

### 10.2 DSL 错误信息差

```
Nix 表达式语言的错误:
   error: cannot coerce a function to a string
   
   at /nix/store/.../source/flake.nix:42:7:
            41|   
            42|       hello;
              |       ^
            43|     ];

   ──> 这条错误对新人毫无意义
       要么去 Discord 问,要么读 nix 源码,要么放弃
```

**社区在改善**:Nix Language Server (nil / nixd) 渐渐成熟,**配 Neovim / VS Code 能有补全 + 跳转**。但**错误信息这一关至少要 1-2 年**。

### 10.3 启动慢(eval 慢)

```
nix flake show
   ──> 第一次:nix 解析 nixpkgs 全部表达式
   ──> 5-30 秒(取决于机器)
   ──> 解析后缓存,后续快

nix build:
   ──> eval(算 hash)+ fetch + build
   ──> 复杂 flake 第一次构建 1-5 分钟
```

**经验**:**配 cachix 共享 binary cache**——团队第一次 build,后续机器拉 cache,**秒级**。

### 10.4 包不在 nixpkgs 怎么办

```
brew 用户习惯:brew install something,99% 能装到
nix 用户现实:nix profile install nixpkgs#something
   ──> 70% 能装到
   ──> 不在 nixpkgs 的:
        a. 你自己写一个 derivation(packaging,门槛高)
        b. 找社区 overlay(碰运气)
        c. 用 nix-shell -p 偷懒(临时)
```

**经验**:**90% 主流包都在 nixpkgs**。**真正缺包的工程师 packaging 一两次就会**。

### 10.5 GUI 应用生态差

```
Nix 的强项是 CLI 工具
   ──> ripgrep / fd / fzf / neovim / git 等,完美
GUI 应用是弱项
   ──> Slack / Chrome / Spotify 等,nixpkgs 有,但不如 brew cask 主流
   ──> macOS 上推荐 nix-darwin 用 homebrew 模块装 cask
```

**经验**:**Nix 装 CLI,brew cask 装 GUI**(nix-darwin 帮你统一调度)。

### 10.6 谁在用 Nix(2026 现状)

```
认真在用 Nix 的:
   ✓ Determinate Systems(出 Nix 商业化的公司)
   ✓ Anthropic / OpenAI 部分团队
   ✓ Cachix
   ✓ Garnix.io
   ✓ tweag(Modus 子公司)
   ✓ 几个游戏公司(Risk of Rain 2 的工作室)
   ✓ 学术界(可复现的实验)
   ✓ Haskell / Rust 社区高比例

主流互联网公司:
   ✗ 不流行(brew + Docker 路线更省心)
   
大厂中:
   ✓ Shopify 内部用 Nix(部分)
   ✓ Replit(部分)
   
个人开发者:
   增长快,但绝对数量小
```

---

## 十一、谁该学 Nix

**判定**:

```
该学 Nix 的人:
   ✓ 团队跨 OS(Linux + macOS)开发
        ──> 跨平台一致是刚需,Nix 是唯一答案
   ✓ 极度看重可复现(科研 / 学术 / SRE)
        ──> 5 年后还要跑同一个实验
   ✓ 喜欢函数式心智
        ──> Haskell / Rust 用户更容易上
   ✓ 不怕 2-4 周陡坡
        ──> 学习曲线接受
   ✓ 有 1-2 个老手帮 review 配置
        ──> 团队推广必备
   ✓ 自己机器要"一行命令复刻"
        ──> nix-darwin / NixOS 给最高境界

不该学 Nix 的人(现阶段):
   ✗ 一台机器自用 + 不换 OS
        ──> brew + chezmoi 完全够
   ✗ 时间紧 + 需要立刻产出
        ──> 学 Nix 浪费 2-4 周
   ✗ 团队没人懂 Nix
        ──> 没人 review,你写的 nix 是单点
   ✗ 主要在写 GUI 应用 / 前端
        ──> Nix 强项是 CLI,前端用 mise 就够
   ✗ 学 Haskell / 函数式抽象会反感
        ──> Nix DSL 是函数式,排斥就是排斥
   ✗ 团队是 Windows / WSL2 主力
        ──> WSL2 上跑 Nix 别扭
```

**最直白的建议**:

```
个人 + macOS:    用 brew + mise + chezmoi(够)
个人 + 跨平台:   学 Nix(投入 1 个月)
团队 + 跨平台:   团队领导推 Nix(投入 3-6 个月,先试点)
团队 + 单平台:   brew + mise + chezmoi(性价比高)
科研 / 学术:     学 Nix(可复现是刚需)
SRE / Infra:     学 Nix devShell(项目级,值)
```

---

## 十二、替代方案速对

如果你看完不想学 Nix,**这些是替代方案**:

```
解决 "可复现 dev env":
   ✓ Docker / Devcontainer(26 篇)
     - 优:主流,任何团队都能上
     - 劣:启动慢,内存大,只在容器里"复现"

   ✓ Nix flake devShell
     - 优:轻量,跨编辑器,5 年后还能复刻
     - 劣:陡坡

   ✓ Vagrant(过时,VM 太重)
     - 不推荐

解决 "多版本工具":
   ✓ mise(24 篇)
     - 90% 工程师够
   ✓ Nix
     - 跨平台一致 + patch 级
   ✗ 单独的 nvm / pyenv / rbenv
     - 应该死了

解决 "声明式 dotfiles":
   ✓ chezmoi(22 篇)
     - 模板 + git,够大多数人
   ✓ home-manager(Nix)
     - 终极方案
   ✓ stow / 裸 git
     - 轻量,不模板化

解决 "secret 管理":
   ✓ mise + 1Password / vault(24 篇)
     - 简单
   ✓ sops-nix(Nix 生态)
     - 复杂但完整
   ✗ .env + git-crypt
     - 老姿势,不推荐
```

---

## 十三、反对的写法

```
1. 还没装就抄 awesome-nix 一千行 flake
   ──> 那些配置是别人三年沉淀,你拿来用全是坑
   ──> 从最小 flake.nix 起步,逐行加自己懂的

2. 上来就 NixOS
   ──> 陡坡 + 全 OS 一起换
   ──> 失败率 95%,先 Nix → home-manager → 再看

3. 旧 nix-channels + flakes 混着用
   ──> 双轨混乱,问题难定位
   ──> 只用 flakes(把 nix-channels 删干净)

4. 用 nix profile install 装所有东西
   ──> 这是命令式,违背 Nix 哲学
   ──> 装包应该写进 home.nix / flake.nix,然后 switch

5. 期待 Nix 处理 GUI 应用像 brew cask 一样顺
   ──> Nix 强项是 CLI,GUI 用 brew cask 配合(nix-darwin 调度)
   ──> 不要逼 Nix 装 Photoshop

6. 不锁 nixpkgs 版本
   ──> flake.lock 必须 commit 进 git
   ──> 不锁就是"在我电脑能跑"重演

7. 团队没人懂 Nix 就硬上
   ──> 一个人维护的 Nix 配置 = 单点
   ──> 这个人离职,配置变天书
   ──> 至少 2 个人懂才推

8. 一上来就 flake-parts / devshell / nci / 全套
   ──> 这些是 Nix 生态的"高级语法糖"
   ──> 还没掌握基础 flake 就上 flake-parts,跌跌撞撞
   ──> 先纯 flake-utils,等心智牢了再上 flake-parts

9. 没装 Cachix 就 build 大项目
   ──> 没 cache 的 nix build 极慢(从源码编译)
   ──> 公司团队必装 Cachix

10. 学 Nix 不看官方 nix.dev
    ──> nix.dev 是 2024+ 的正版文档,只学 flakes
    ──> 老资料(nixos.org/manual 老版)害人

11. 装 Nix 装错(用 SCM 安装)
    ──> 官方安装器(尤其旧版)在 macOS 上很容易出问题
    ──> 用 Determinate Systems 的安装器,稳

12. 期望 nix shell -p 替代日常 brew install
    ──> -p 是临时,关掉就没
    ──> 装包要进 home.nix 然后 switch

13. flake.nix 写 1000 行不拆模块
    ──> 维护噩梦
    ──> 拆 modules/zsh.nix / modules/git.nix / modules/dev/python.nix
```

---

## 十四、看完这一篇你应该能

- **在白板上画 brew / mise / Nix 三者的对比图**,讲清楚为什么 Nix 才叫"可复现"
- **写一份最小的 `flake.nix`**(项目 devShell),`nix develop` 跑通
- **解释 generation / rollback / 内容寻址三个概念**,讲清楚 Nix 为什么能做到这些
- **判断"我团队 / 我自己该不该上 Nix"**——用第十一节那 6+6 条对照
- **理解 Nix 在 2026 的真实位置**:粉丝多 / 主流不流行 / 增长稳 / 文档差
- **挑选入门路径**(只 Nix → 加 home-manager →(可选)nix-darwin / NixOS),不一上来就 NixOS
- **避开 13 条反对的写法**,不掉坑

如果上面 7 条你都能做到,**这一篇就值了**——**而且你已经比 90% 听过 Nix 但没真装过的工程师懂得多**。

---

## 十五、下一篇预告

**`26-Devcontainer与Remote-dev.md`**——这一篇讲了「**Nix:把环境装在 host**」,**下一篇讲「Devcontainer:把环境装在容器**」。两条路解决同一问题,**取舍点不同**:

```
Nix 路线:
   - host 上跑,毫秒级启动
   - 跨 OS 一致
   - 学曲线陡(2-4 周)
   - 适合: 个人 / 跨平台团队 / 极致可复现

Devcontainer 路线:
   - Docker 容器里跑
   - 跨平台靠 Docker 抽象
   - 学曲线缓(VS Code Remote 一键)
   - 适合: 团队 / Windows + Mac 混合 / 主流姿势
```

下一篇讲清楚:

```
- Devcontainer 是什么(VS Code 的 .devcontainer/ 怎么用)
- 一份完整的 devcontainer.json + Dockerfile
- VS Code Remote / Cursor Remote / Codespaces 三件套
- SSH Remote 替代:在远端机器开发,本地编辑器只是 UI
- 为什么 Devcontainer 是企业团队的主流(GitHub Codespaces 推动)
- Devcontainer vs Nix devShell 的取舍
- 在公司里推 Devcontainer 怎么做
- 跟 Claude Code 的接合(容器内跑 Claude / 容器外跑 Claude)
```

读完 22-26 这五篇,**你对"可复现开发环境"的所有主流方案都建立了判断**——chezmoi / brew / mise / Nix / Devcontainer 各自的位置、什么时候选谁。**新机器 30 分钟复刻不再是口号,是你能写到 PR 模板里的一行命令**。
