# Zellij vs tmux:声明式 layout、内置 floating、该不该迁移

tmux 是终端复用器的事实标准,这一点没人能否认——你 SSH 进 2026 年任何一台 Linux 服务器,`tmux --version` 大概率有;你打开 macOS 上的任何一个工程师的电脑,`brew list | grep tmux` 八成中招;你刷 GitHub「awesome-tmux」,star 5 万,plugin 上千。**但「事实标准」不代表「好用」**——tmux 的入门体验在 2026 年看是反人类的:prefix 默认是 Ctrl-B(食指够不到 B),`prefix + "` 横切 `prefix + %` 竖切(看不出方向),状态栏默认是绿底黑字的 `[0] 0:bash*`(看着像 1995 年的产物),copy-mode 默认是 emacs 键位(vi 党愣住),复制完不通系统剪贴板(要 `prefix + ]` 才能粘 tmux 内)。**新人第一次打开 tmux,30 秒内决定"算了,我用 VS Code 内置 terminal 点窗格"**。

2021 年 Zellij 出现,Rust 写的现代 multiplexer,瞄准的就是这个空档:**"装完就有 hint 栏告诉你按键在哪、Ctrl-P 切 pane / Ctrl-T 切 tab 这种模态键代替 prefix、KDL 声明式 layout、Alt-f 一键 floating pane"**。**第一次打开 Zellij,新人 30 秒上手;第一次打开 tmux,新人 30 秒放弃**。这是 UX 上的代差,不是功能上的对垒。

**那 tmux 还该不该学**?这一篇就是来回答这个问题的。结论先抛出来:**Zellij 是给"学不动 tmux 又需要 multiplexer"的工程师准备的;tmux 仍然是生态最深、远端默认装、插件最齐的事实标准**。**两个都装 + 频繁切换 = 两边都不流畅**——选一个,投入半年,内化成肌肉记忆,这才是 multiplexer 的正确姿势。

这一篇拆开讲:**Zellij 是什么、Zellij 解决的真问题、两边在体验/性能/生态/远端/可读性 7 个维度的真实差异、Zellij 基础用法 + KDL 声明式 layout 的杀手特性、floating pane 这种 tmux 学不来的体验、session 模型差异、何时选 Zellij、何时继续 tmux、为什么"混用最糟"、WezTerm 的内置 multiplexer 是不是 multiplexer 的下一站、反对的写法**。**不抄 Zellij 官网**——官网在那儿,这里只讲"为什么"和"什么时候不要选 Zellij"。

> 一句话先记住:**Zellij 是给"学不动 tmux 又需要 multiplexer"的工程师的;tmux 仍是生态最深的选择。混用没意义,选一个用到底——你的肌肉记忆值钱,别拿来给两套不兼容的键位分账**。

---

## 一、Zellij 是什么,为什么它存在

### 1.1 一句话定位

```
Zellij = "2021 年从零设计的 tmux"——
        - Rust 写,没内存安全坑
        - 默认开 hint 栏,所有快捷键随时在屏幕底部可见
        - 模态键(Ctrl-P pane / Ctrl-T tab / Ctrl-S scroll)代替 prefix
        - KDL 声明式 layout,跟 docker-compose 之于 docker run 一样
        - 内置 floating pane,Alt-f 一键浮窗
        - WebAssembly 插件系统(Rust 写,编译成 WASM)
        - 默认行为对新人友好(zellij 命令直接 attach,而不是新建)
```

它的"心智模型"和 tmux 一样:**session → tab → pane** 三层。**但它在每一层都重新做了 UX**——不是改进,是重做。**Zellij 不是 tmux 的功能升级,是 tmux 的 UX 重写**。

### 1.2 Zellij 诞生背景:tmux 不改的代价

tmux 是 2007 年开源的,作者 Nicholas Marriott 当时的目标是**替代 GNU screen**——所以它继承了 screen 的 prefix 模型(screen 的 prefix 是 Ctrl-A,tmux 改成 Ctrl-B 避开 GNU readline 的"行首")、screen 的 session/window/pane 概念、screen 的 ASCII 状态栏。

**这个继承在 2007 年是对的**——screen 用户能无痛切换。**但 2026 年的工程师从来没用过 screen**,对他们来说 prefix 是"莫名其妙的两步操作",状态栏是"丑陋的 1990s",window 和 tab 这种区分(tmux 叫 window,iTerm/VS Code 叫 tab)是"概念冲突"。

**tmux 18 年不改默认行为**——因为它的所有用户都已经"内化"了这套配置,改默认就是背叛存量。这就是工具的"路径依赖":**新用户嫌弃,但老用户不让改**。

Zellij 不背这个包袱:**2021 年从零写,默认配置就是"新用户最舒服"**——Ctrl-P 切 pane 用户一眼能看见,Alt-f 开浮窗不需要 prefix,状态栏自带颜色和图标。**它的好用是"装完即用",不是"配 200 行 conf 之后才好用"**。这一点和 fish vs bash/zsh 的关系很像:fish 的卖点也是"默认就好",和 bash 比是 UX 重做。

### 1.3 Zellij 不是 tmux 的功能超集

很多新人以为 "Zellij 比 tmux 新,所以功能多",**这是错误的**。Zellij 和 tmux 在功能上**基本对等**——session/tab/pane、detach/attach、scrollback、复制粘贴、自定义键位、插件系统,两边都有。**Zellij 的差异不在功能,在 UX**:

```
功能              tmux        Zellij
─────────────────────────────────────────────
multiplexer       ✓           ✓
session detach    ✓           ✓
tab / window      ✓           ✓
pane split        ✓           ✓
copy mode         ✓           ✓
plugin system     ✓ (shell)   ✓ (WASM)
status bar        ✓ (手配)    ✓ (默认开)
hint bar          ✗           ✓ (核心特性)
floating pane     ✓ (popup)   ✓ (Alt-f 原生)
declarative cfg   ✗           ✓ (KDL)
remote shipping   ✓ (常装)    ✗ (服务器少)
```

**功能没差多少,UX 差一代**——这是评估 Zellij 的关键。如果你已经把 tmux 配舒服了,**Zellij 给你的边际收益不大**;如果你是 multiplexer 新人,**Zellij 给你的体验差异是数量级的**。

---

## 二、关键体验差异:7 个维度的对照

把两边的差异拆成 7 个维度,逐个对照——

```
                 tmux                Zellij
─────────────────────────────────────────────────────
学习曲线          陡(prefix 心智)    缓(hint 栏可见)
性能              ★★★★★              ★★★★(略重)
生态(插件)      ★★★★★(TPM)        ★★(WASM,新)
声明式 layout     ★(脚本)            ★★★★★(KDL)
floating pane     prefix B-,简陋     内置体验好
ssh 远端 attach   ★★★★★ 经典         ★★★ 也支持
配置可读          ★★(纯命令)        ★★★★(KDL)
```

### 2.1 学习曲线

```
              tmux                          Zellij
学习曲线      陡(prefix 心智)              缓(hint 栏可见)

新人第一天    "Ctrl-B 是啥,B 在哪"          "底部 status bar 写得很清楚"

第一周        勉强记住 5 个 prefix 命令      已经能流畅切 pane / tab

第一个月      开始写 .tmux.conf,改 prefix    已经在写 KDL layout

半年          内化,反而觉得"prefix 真香"     用得很顺,但插件少有点空
```

**核心差异在"hint 栏"**——Zellij 默认底部一条状态栏,实时显示**当前模式下所有可用快捷键**。tmux 没有这个,你要么背快捷键、要么 `Ctrl-B ?` 查,**前者要 1 个月、后者打断流**。Zellij 的 hint 栏是 multiplexer UX 上"最大的发明",**这一项就能让上手成本降到 tmux 的 1/3**。

### 2.2 性能

```
              tmux              Zellij
内存(空 session) ~5 MB              ~30 MB
CPU(空闲)        极低              略高(Rust runtime)
启动速度          < 100ms           ~300ms
渲染速度          原生 C            Rust + crossterm,略重
```

tmux 是 C 写的,内存占用和 CPU 几乎可以忽略;Zellij 是 Rust 写的,**略重**但完全在可接受范围。**对单机本地用户,这个差异无感**;对资源极小的环境(ARM 嵌入式、Alpine 容器、内存只有 512MB 的小 VPS)tmux 仍是首选。**绝大多数应用工程师不会被 30MB 内存差打到**——你的 Slack 客户端吃 800MB,你 Chrome 一个 tab 200MB,Zellij 30MB 是噪音。

### 2.3 生态(插件)

```
              tmux                              Zellij
插件管理器      TPM(tmux plugin manager)        zellij plugin(WASM)
官方插件数      200+                              ~20
社区插件数      上千                              50-100
主题数          150+(Catppuccin / Dracula 全有)  10-20
插件语言        shell script                      Rust + WASM
插件成熟度      高(2007 至今 18 年沉淀)          低(2021 起,4 年)
```

**tmux 的生态比 Zellij 多 10 倍**。tmux-resurrect(session 持久化)、tmux-continuum(自动保存)、Catppuccin tmux theme、tmuxinator(layout 启动)、vim-tmux-navigator(vim 和 tmux 切换无缝)——**这些 tmux 用户视为日用的东西,Zellij 要么没有、要么刚起步**。

**Zellij 的 WASM 插件系统在技术上更先进**(类型安全、沙箱化、可分发),**但成熟度差 5-10 年**。你想要 tmux-resurrect 那种"完美还原 session 状态(包括每个 pane 当前工作目录、当前进程、scrollback)"的体验,Zellij 现在还做不到那么稳——它有 session resurrection,但范围更小、bug 更多。

**这是 Zellij 当前最大的"软肋"**——技术上更先进,但生态还没养起来。

### 2.4 声明式 layout

```
              tmux                              Zellij
layout 表达    shell 脚本                       KDL 配置文件

例子:        tmux new -d -s dev               layout {
              tmux split-window -h               pane command="nvim"
              tmux split-window -v               pane split_direction="horizontal" {
              tmux send-keys "nvim" Enter        pane command="cargo" args="run"
              ...                                  pane
                                                 }
                                              }

可读性         ★(全是命令调用)                ★★★★★(声明式,一眼明白)
版本控制       ★(脚本里 hardcode 路径)        ★★★★(配置文件)
团队共享       难(每人改一遍)                  易(check in KDL,一致)
```

**Zellij 的 KDL layout 是它最大的杀手特性**——你把工作台描述成一份"配置文件",而不是"启动脚本"。这跟 docker-compose vs `docker run --network ... --port ... --volume ...` 的差别一样:**声明式 vs 命令式**。

**tmux 不是不能做声明式 layout**——你可以装 tmuxinator(Ruby 写,YAML 描述)或 tmuxp(Python 写)。**但这些都是"外挂",不是 tmux 原生**;Zellij 的 KDL 是原生的、官方支持的、不需要额外装东西。

### 2.5 floating pane

```
              tmux                              Zellij
默认是否支持    ✗(3.2+ 有 popup,3.0 之前没)    ✓(Alt-f 内置)
配置代价        高(要写 display-popup 命令)     低(开箱即用)
体验            粗糙(popup 不带边框,可控性差)  舒适(浮窗带边框,可拖拽大小)
```

**Zellij 的 floating 是 tmux 学不来的体验**。tmux 的 popup 是 3.2 才加的(2021),功能上能用,但 UX 很粗糙——你 `tmux display-popup -E "htop"` 弹一个 htop 出来,**没有边框、没有标题、退出就消失**,基本就是"在终端里嵌一个全屏窗口"。

Zellij 的 floating 是**原生 pane**——你 Alt-f 把当前 pane 转成 floating,移动、resize、关闭都和普通 pane 一样,**这才叫 floating pane**。**这一项 tmux 短期追不上**——它的架构里 pane 是"占满 split 区域的矩形",改成"浮在上面"要重做渲染。

### 2.6 ssh 远端 attach

```
              tmux                              Zellij
远端支持       ★★★★★(几乎所有 Linux 默认装)    ★★★(要手装)
ssh 进堡垒机   `tmux attach` 一键               `zellij` 命令不一定有

容器 exec      `tmux a -t work`                 装不上(Alpine 的 musl 偶有问题)

公司开发机     多人共享一个 session              可以但生态薄

mosh + tmux    经典组合                          mosh + zellij 可以但少见
```

**这是 Zellij 最大的硬伤**——服务器侧的事实标准是 tmux,不是 Zellij。**你 SSH 进任何一台 Ubuntu/CentOS/Alpine,`tmux --version` 大概率有,`zellij --version` 大概率没**。

要在远端用 Zellij,你要么:
1. 静态链接的 binary,scp 过去
2. `cargo install zellij`(编译 5-10 分钟,Ubuntu 还要先装 build-essential)
3. 用 `cargo binstall`(预编译 binary)

**任何一条都比 `apt install tmux` 麻烦**。如果你的工作 80% 在远端(SRE、AI infra、ML 训练),**这条就足以让你选 tmux**。

### 2.7 配置可读

```
tmux .tmux.conf                       Zellij config.kdl
─────────────────────────────────────────────────────────
set -g prefix C-a                     keybinds {
unbind C-b                              normal {
bind C-a send-prefix                      bind "Ctrl b" { SwitchToMode "pane"; }
bind | split-window -h                  }
bind - split-window -v                  pane {
bind h select-pane -L                     bind "h" { MoveFocus "Left"; }
bind j select-pane -D                     bind "l" { MoveFocus "Right"; }
bind k select-pane -U                   }
bind l select-pane -R                 }

★★(纯命令,没结构)                   ★★★★(嵌套块,清晰)
```

**KDL 比 tmux 的命令式配置可读性高一档**——尤其是配置复杂之后,KDL 的嵌套结构让"哪些 binding 属于哪个 mode"一目了然;tmux 的 .tmux.conf 长到 200 行之后,就是一锅命令字面量,新人看不懂、自己半年后也看不懂。

---

## 三、Zellij 基础用法:30 分钟从零到流畅

### 3.1 装

```bash
# macOS
brew install zellij

# Linux(预编译 binary)
curl -L https://github.com/zellij-org/zellij/releases/latest/download/zellij-x86_64-unknown-linux-musl.tar.gz | tar xz
sudo mv zellij /usr/local/bin/

# 用 cargo(编译,慢)
cargo install zellij

# 检查
zellij --version
# zellij 0.42.x
```

### 3.2 启动:第一次跑

```bash
$ zellij
# 自动开一个 default session
# 底部有 status bar 显示所有快捷键
```

**第一次打开你会看到底部这条**:

```
Ctrl + g  LOCK    p  PANE    t  TAB    n  RESIZE    s  SCROLL    o  SESSION    q  QUIT
```

**这就是 hint 栏**——每个字母对应一个"模式",Ctrl + p 进入 pane 模式,**进入后 hint 栏会变,显示 pane 模式下的所有快捷键**。**新人不需要查文档,屏幕就是文档**。

### 3.3 模态切换:Zellij 的核心交互

```
Zellij 不用 tmux 那种 "prefix 然后字母" 的两步操作,而是用"模式":

Ctrl-p   →  进入 PANE 模式
   h / l / j / k  →  切 pane
   n              →  新 pane(竖切)
   d              →  新 pane(横切)
   x              →  关闭 pane
   ESC            →  退出 pane 模式

Ctrl-t   →  进入 TAB 模式
   1-9            →  跳到 N 号 tab
   n              →  新 tab
   r              →  重命名 tab
   x              →  关闭 tab

Ctrl-s   →  进入 SCROLL 模式
   j / k          →  上下滚动
   PgUp/PgDn      →  快速滚动
   /              →  搜索

Ctrl-o   →  进入 SESSION 模式
   d              →  detach
   w              →  列出所有 session

Ctrl-n   →  进入 RESIZE 模式
   h/j/k/l        →  调 pane 大小

Alt-f    →  toggle floating(不需要进模式,直接切)
```

**模式 vs prefix 的本质差异**:
- tmux:`prefix + 字母` = 两次按键,**每次都要重按 prefix**
- Zellij:**进入模式后停留**,直到 ESC 退出,**模式内连续操作只按一个字母**

**适用场景的差异**:
- 你想切 1 个 pane:tmux 和 Zellij 都是 2 步,差不多
- 你想连续切 4 个 pane:tmux 是 `prefix h prefix h prefix h prefix h`(8 步),Zellij 是 `Ctrl-p h h h h ESC`(6 步)
- 你想 split + 切 + split:tmux 是 `prefix | prefix l prefix -`(6 步),Zellij 是 `Ctrl-p n l n ESC`(5 步)

**模式的好处**:连续操作时按键少;**坏处**:你要记得"现在在哪个模式",ESC 漏按会按错键。**两边各有取舍**。

### 3.4 第一份 ~/.config/zellij/config.kdl

```kdl
// ~/.config/zellij/config.kdl

// 默认 shell
default_shell "zsh"

// 主题(内置十几个,Zellij 0.40+ 自带)
theme "catppuccin-mocha"

// 鼠标支持
mouse_mode true

// 自动复制到系统剪贴板(macOS / Linux 都自动适配)
copy_command "pbcopy"     // macOS
// copy_command "xclip -selection clipboard"  // Linux X11
// copy_command "wl-copy"                     // Linux Wayland

// 滚动历史
scroll_buffer_size 50000

// 默认 layout(启动时用)
default_layout "compact"

// 键位重定义(可选,大部分人用默认就行)
keybinds {
  normal {
    // 直接按 Ctrl-f 切 floating(不进模式)
    bind "Ctrl f" { ToggleFloatingPanes; }
  }
}
```

**这一份配置 ~30 行**,**90% 的用户改不到 100 行**——这是 KDL 相比 tmux 配置的另一个优势:**默认就好用,改少量就够**。**不要抄网上 500 行的 zellij dotfiles,那等于把 Zellij 当 tmux 用**。

---

## 四、KDL 声明式 layout:Zellij 的杀手特性

这一节是这篇文章的"重头戏"——**KDL layout 是选 Zellij 唯一最强的理由**。

### 4.1 什么是 KDL

KDL(Cuddly Document Language,2021)是一个声明式配置语言,**长得像 HTML / Lisp / Rust 的混血**:

```kdl
person name="Alice" age=30 {
  email "alice@example.com"
  email "alice@work.com"
  address {
    street "123 Main St"
    city "Springfield"
  }
}
```

**比 JSON 多了注释和无引号字符串,比 YAML 多了结构化嵌套,比 TOML 多了表达力**。Zellij 选 KDL 是有道理的:**multiplexer 的配置本质上是嵌套结构(layout 嵌套 layout,pane 嵌套 pane),KDL 比 YAML 表达这种嵌套更清楚**。

### 4.2 一份完整的 layout 文件

把 nvim + cargo run + cargo watch test + Claude Code 跑在一个 layout 里:

```kdl
// ~/.config/zellij/layouts/dev.kdl

layout {
  // 顶部 tab 栏
  pane size=1 borderless=true {
    plugin location="zellij:tab-bar"
  }

  // 主工作区:左 nvim,右上 cargo run,右下 cargo watch test
  pane split_direction="vertical" {
    // 左:nvim 占 60%
    pane size="60%" {
      command "nvim"
      args "."
    }
    // 右:占 40%,纵向再分
    pane split_direction="horizontal" {
      pane {
        command "cargo"
        args "run"
      }
      pane {
        command "cargo"
        args "watch" "-x" "test"
      }
    }
  }

  // 底部 status 栏
  pane size=2 borderless=true {
    plugin location="zellij:status-bar"
  }
}
```

**启动方式**:

```bash
zellij --layout dev
# 或者
zellij --layout ~/.config/zellij/layouts/dev.kdl
```

**一行命令,工作台就位**——nvim 在左、cargo run 跑在右上、cargo watch test 跑在右下、顶部 tab 栏、底部 status 栏。**这是 tmuxinator 在 tmux 里能勉强做到的事,但 Zellij 是原生**。

### 4.3 这份 layout 的每段在做什么

```kdl
layout {                              // 整个 layout 的根
  pane size=1 borderless=true {       // 第 1 个 pane:固定 1 行高,无边框
    plugin location="zellij:tab-bar"  // 装 tab-bar 这个内置插件
  }

  pane split_direction="vertical" {   // 第 2 个 pane:垂直分割(左右)
    pane size="60%" {                 // 左 pane,占 60% 宽
      command "nvim"                  // 启动命令
      args "."                        // 命令参数(当前目录)
    }
    pane split_direction="horizontal" { // 右 pane,水平分割(上下)
      pane { command "cargo"; args "run"; }
      pane { command "cargo"; args "watch" "-x" "test"; }
    }
  }

  pane size=2 borderless=true {       // 第 3 个 pane:固定 2 行高,无边框
    plugin location="zellij:status-bar"
  }
}
```

**核心概念**:
- `pane` 是一个矩形区域,可以是终端(有 command)或插件(有 plugin)
- `split_direction="vertical"` = 左右分;`"horizontal"` = 上下分
- `size` 可以是百分比(`"60%"`)或固定行数(`size=1`)
- `borderless=true` 表示这个 pane 不要边框(用于状态栏)
- 嵌套 pane 实现复杂 layout

### 4.4 多个 tab 的 layout

```kdl
// 三个 tab:dev / logs / db
layout {
  tab name="dev" focus=true {
    pane split_direction="vertical" {
      pane command="nvim"
      pane command="bash"
    }
  }

  tab name="logs" {
    pane command="tail" args="-f" "/var/log/app.log"
  }

  tab name="db" {
    pane command="psql" args="-d" "myapp"
  }
}
```

**一键起 3 个 tab,各自有自己的 pane**。这种"项目工作台"在 tmux 里需要写 50 行 shell 脚本,在 Zellij 里 15 行 KDL。

### 4.5 layout 的真实价值:团队共享

```
工程师 A 写的 layout            check in 到 repo
   ↓
工程师 B clone 仓库
   ↓
zellij --layout ./project.kdl
   ↓
B 的工作台和 A 一模一样
```

**这是 tmux 永远做不到的事**——tmux 的 layout 散在每个人的 .tmux.conf 里,**每人都不一样**。Zellij 的 layout 是"项目级别"的,**可以 check in,团队共享**。

**对 onboarding 新人**:"clone 这个 repo,运行 `zellij --layout ./onboarding.kdl`"—— 30 秒后新人的屏幕就是和你一样的工作台。**这种 onboarding 体验,tmux 装 tmuxinator + 手抄 YAML + 改 ~/.tmuxinator/* 才能勉强做到**。

### 4.6 当前目录 / 环境变量

```kdl
layout {
  pane split_direction="vertical" {
    pane {
      cwd "src/api"                    // 这个 pane 的工作目录
      command "go"
      args "run" "main.go"
    }
    pane {
      cwd "src/web"
      command "npm"
      args "run" "dev"
    }
  }
}
```

**这就是 layout 真正吃香的地方**——把"启动一个项目所需的所有终端"用一份文件描述,**任何人 clone 后一行命令进入完整工作环境**。

---

## 五、floating pane:tmux 短期追不上的体验

### 5.1 什么是 floating pane

```
普通 pane(tiled):
   ┌─────────┬─────────┐
   │         │         │
   │  pane 1 │  pane 2 │
   │         │         │
   └─────────┴─────────┘

floating pane:
   ┌─────────────────────┐
   │  pane 1             │
   │      ┌──────────┐   │
   │      │ floating │   │   ← 浮在上面,可以拖拽 / resize
   │      │  pane    │   │
   │      └──────────┘   │
   └─────────────────────┘
```

**Zellij 的 Alt-f 一键切换 floating**——把当前 pane 转成 floating,或者从 floating 转回 tiled。

### 5.2 实际场景

**场景 1:跑临时命令不破坏 layout**

```
你 zellij --layout dev 起来了一个 4-pane 的开发工作台
突然想跑一下 `htop` 看下资源占用

传统做法(tmux):
   - 在某个 pane 里 htop,看完关掉
   - 但那个 pane 的工作就被打断了
   - 或者 prefix + c 新开 window,看完关掉,工作台被切走

Zellij 做法:
   - Alt-n 新开一个 pane,Alt-f 变成 floating
   - 在 floating pane 里跑 htop
   - 看完 Alt-w 关掉,工作台没动
```

**场景 2:Claude Code 临时输入**

```
你工作台 4 个 pane:nvim、test、logs、Claude Code
突然想问 Claude 一个问题,但又不想切到 Claude pane(切走 nvim 焦点)

Zellij:Alt-f 新开 floating,在里面 claude 起一个临时 chat
       问完关掉,nvim 焦点没动

tmux:  prefix + B 弹 popup(3.2+),功能上能用但 UX 粗糙
       popup 不带可拖拽边框,resize 麻烦
```

**场景 3:debug 时看一下 git log**

```
你在写代码,突然想确认上一个 commit 改了什么
不想切 pane,不想新开 tab

Zellij:Alt-f → 进 floating → git log -p → 看完 Alt-w
       全程不影响主工作区
```

### 5.3 tmux 的 display-popup

tmux 3.2 加了 `display-popup -E`,**功能上能开 popup**,但和 Zellij 的 floating 有几个差异:

```
tmux display-popup                       Zellij floating
─────────────────────────────────────────────────────────
启动                                     启动
  tmux display-popup -E "htop"             Alt-n + Alt-f

弹出位置                                 弹出位置
  屏幕中央(固定)                          最后位置(可记忆)

resize                                   resize
  -w 80% -h 80%(启动时配)                 Alt-n + Alt-+/- 实时

多个 popup                               多个 floating
  ✗(同时只能一个)                         ✓(可以多个)

边框                                     边框
  默认没有                                 默认有,有标题

转 tiled                                 转 tiled
  ✗(关掉就没了)                          Alt-f 切换
```

**tmux 的 popup 是"临时弹窗",Zellij 的 floating 是"独立 pane"**——前者用完即抛,后者是工作台的一等公民。**这一项 Zellij 短期内 tmux 追不上**。

---

## 六、session 模型:Zellij 默认更对新人友好

### 6.1 两边的 session 模型对比

```
tmux                                  Zellij
─────────────────────────────────────────────────
daemon(tmux server)                   daemon(zellij server)
   ↓                                       ↓
session 1, 2, 3...                      session 1, 2, 3...
   ↓                                       ↓
window 1, 2, 3...                       tab 1, 2, 3...
   ↓                                       ↓
pane 1, 2, 3...                         pane 1, 2, 3...

attach 行为差异:
tmux                                  zellij
   tmux new -s work                        zellij -s work       (create or attach)
   tmux attach -t work                     zellij attach work
   tmux                                    zellij              (attach to last)

默认 zellij 命令的语义:
   - 有 default session → attach 它
   - 没有 → 创建 default 并 attach

默认 tmux 命令的语义:
   - 总是新建(0, 1, 2...)
   - attach 要显式 `tmux a -t name`
```

**Zellij 的默认更对新人友好**:你 `zellij` 直接进了上次的工作,不用记 session 名;tmux 的默认是"新开",新人很容易开 5 个空 session 都不知道。

### 6.2 detach / attach

```bash
# tmux
Ctrl-B d              # detach
tmux attach -t work   # attach
tmux ls               # list sessions

# Zellij
Ctrl-o d              # detach
zellij attach work    # attach
zellij list-sessions  # list
```

**功能完全对等**——这是 multiplexer 的核心,两边都做得很稳。

### 6.3 远端 attach 的差异

```
ssh user@server                          ssh user@server
tmux a -t work                           zellij attach work
   ↓                                        ↓
工作了 4 小时                             工作了 4 小时
   ↓                                        ↓
SSH 掉                                    SSH 掉
   ↓                                        ↓
重新 ssh user@server                      重新 ssh user@server
tmux a -t work                           zellij attach work
   ↓                                        ↓
原样恢复 ★★★★★                            原样恢复 ★★★★★
```

**这一层两边完全对等**——只要远端有 zellij/tmux daemon 在跑,attach 就是无缝的。**唯一的差异**:**远端有没有装 Zellij**——这就是上一节说的"Zellij 最大的硬伤"。

---

## 七、何时选 Zellij,何时继续 tmux

### 7.1 选 Zellij 的场景

```
□ 你从来没用过 multiplexer,2026 年从零开始
   - 上手成本是 tmux 的 1/3
   - 默认配置就好用
   - 不用花一周学 prefix 心智

□ 你培训团队新人 / onboarding
   - hint 栏让新人不用问"按什么键"
   - KDL layout 可以 check in,团队共享
   - 新人 30 分钟有完整工作台

□ 你喜欢声明式配置
   - KDL 比 .tmux.conf 可读 10 倍
   - 团队工作流可以版本化
   - 项目级 layout 是 docker-compose 之于 docker run

□ 你做本地开发为主,远端 SSH 少
   - 80% 时间在本地,Zellij 装一次就好
   - 不用担心"远端没装"的问题

□ 你重度依赖 floating pane
   - htop / 临时命令 / Claude chat 都用 floating
   - tmux 的 popup 体验差 5 倍
```

### 7.2 选 tmux 的场景

```
□ 你已经会 tmux(沉没成本 + 生态)
   - 已经把 .tmux.conf 调舒服了
   - tmux-resurrect / Catppuccin theme 都装好了
   - 迁移到 Zellij 边际收益不大

□ 你做远端 SRE / AI infra
   - 80% 工作在远端,Zellij 装麻烦
   - 远端机器 tmux 默认装的概率高 20 倍
   - SSH 进堡垒机直接 `tmux a` 是肌肉记忆

□ 你重度依赖插件
   - tmuxinator(layout 启动)
   - tmux-resurrect / tmux-continuum(session 持久化)
   - vim-tmux-navigator(vim 和 tmux 切换)
   - Catppuccin / Dracula / Gruvbox 主题
   - 这些 Zellij 短期内补不齐

□ 你的团队已经在用 tmux
   - 团队 dotfiles 都是 .tmux.conf
   - 一起 onboarding 时用 tmux 一致
   - 迁移成本(每人重新学习)> 切换收益

□ 你的环境资源极小
   - ARM 嵌入式 / Alpine 容器
   - tmux 5MB vs Zellij 30MB,差 6 倍
   - 资源紧张时 tmux 更友好
```

### 7.3 决策树

```
你之前用过 tmux 吗?
   └─ 用过,且配舒服了
      └─ 你 80% 时间在远端吗?
         ├─ 是 → 继续 tmux
         └─ 否
            └─ 你想试 Zellij 吗?
               ├─ 想 → 试用 1 周,值得就切,否则回 tmux
               └─ 不想 → 继续 tmux,这条 Zellij 没必要

   └─ 没用过,或没配明白
      └─ 你 80% 时间在远端吗?
         ├─ 是 → 学 tmux(远端的事实标准)
         └─ 否 → 学 Zellij(上手快 3 倍)
```

**这个决策树回答了"该不该迁移"**——大多数应用工程师本地为主,**Zellij 是更合理的选择**;SRE / AI infra 远端为主,**tmux 仍是事实标准**。**两边都装 + 频繁切换,是最差的方案**(下一节展开)。

---

## 八、混用问题:为什么"两个都装"反而最糟

### 8.1 肌肉记忆的成本

```
学一个 multiplexer 到"肌肉记忆"流畅:
   - 第 1 周:勉强能用,要看 cheatsheet
   - 第 1 个月:基本流畅,常用操作不查
   - 第 3 个月:开始写自己的 layout,深度内化
   - 第 6 个月:操作快到自己都不知道按了什么键

两个 multiplexer 都学到这个程度:
   - 需要的时间不是 2x,是 4-5x
   - 因为两套键位会互相干扰
   - 你 tmux 用了 prefix + l,Zellij 用了 Ctrl-p l,半年后你想切 pane,手指先 prefix 后 Ctrl-p 都按
   - 关键时刻按错键 → 看屏幕反应 → 重按 → 失败 → 烦躁
```

**肌肉记忆是个"原子操作"——它不会被切换得很好**。学语言可以同时学两门(中文 + 英文 + 日文),**因为它们之间没有键位冲突**;但 vim vs emacs / tmux vs Zellij,**键位是同一套键盘**,**冲突是不可避免的**。

### 8.2 实际看到的"混用悲剧"

```
工程师 X 的电脑:
   - 本地装了 Zellij(听说新潮)
   - 远端用 tmux(服务器默认装)
   - 本地 zellij 的 prefix 是 Ctrl-p
   - 远端 tmux 的 prefix 是 Ctrl-a

X 本地工作:
   想切 pane,按 Ctrl-p h
   - 在 Zellij 里:正确,切到左 pane
   - 在 tmux 里:Ctrl-p 是 readline 的"上一个命令",h 是普通字符
   - X 经常忘了自己在哪边,按错键

X 远端工作:
   想 detach,按 Ctrl-o d
   - 在 Zellij 里:正确,detach
   - 在 tmux 里:Ctrl-o 没绑,d 不是 prefix 后的命令
   - X 又按错了

半年后:X 既没把 Zellij 学到流畅,也没把 tmux 学到流畅
       两边都是"勉强能用",关键时刻还是要查 cheatsheet
```

**这是混用最大的代价**——**两边都没到肌肉记忆**。

### 8.3 那"本地 Zellij + 远端 tmux"行不行

这是网上常见的建议——"本地用 Zellij 体验好,远端用 tmux 因为装了"。**听起来合理,但实操不行**:

```
理论:本地 Zellij 满足 UX 需求,远端 tmux 满足兼容性
实操:
   - 你本地工作占 X%,远端工作占 (100-X)%
   - 如果 X = 50,你两边各练一半,都不流畅
   - 如果 X = 80,你远端 20% 时也别扭(因为远端键位没练熟)
   - 如果 X = 20,你本地 Zellij 也没用熟(每天就用 1-2 小时)

   要么你大部分时间都在一边,要么就别想"混用各取所长"
```

**真相**:**多 multiplexer 就是失败方案**。**选一个,投入半年,内化成肌肉记忆**。

### 8.4 我的建议:选一个用到底

```
推荐路径 1(80% 本地工程师):
   - 学 Zellij,本地为主
   - 远端机器临时用 tmux 时,只用最基本的 attach / detach,不深入
   - 接受"远端体验差"作为代价

推荐路径 2(80% 远端工程师 / SRE):
   - 学 tmux,远端为主
   - 本地也用 tmux,保持肌肉记忆一致
   - 接受"本地 UX 不如 Zellij"作为代价

推荐路径 3(已经会 tmux):
   - 继续 tmux,不要折腾
   - Zellij 的 KDL layout 值得羡慕,但不值得迁移
   - 沉没成本 + 生态优势,tmux 是稳的
```

**关键判断**:**你 80% 时间在哪边,就选哪边的工具**。本地为主选 Zellij(享 UX),远端为主选 tmux(享生态)。**不要"各取所长",会两边都差**。

---

## 九、WezTerm 的 multiplexer 模式:还要不要 tmux/Zellij

2026 年新的变量:**WezTerm 内置 multiplexer**——它既是终端模拟器,又是 multiplexer,**你装 WezTerm 之后理论上不需要 tmux/Zellij**。

### 9.1 WezTerm 的 multiplexer 长什么样

```
WezTerm
   ├─ Tab(类似 tmux window)
   │  └─ Pane(split 出来的窗格)
   │
   ├─ Domain(类似 multiplex server)
   │  ├─ Local domain(本机)
   │  └─ SSH domain(远端机器)
   │
   └─ Workspace(类似 tmux session)
```

**WezTerm 自己就是 multiplexer**——split 窗格、tab、workspace、远端 attach,全部内置。**而且它的远端 multiplex 比 tmux 更进一步**:你 SSH 到远端机器,**远端不需要装 tmux**,WezTerm 在远端跑一个 mux server,**所有窗格管理在客户端**。

### 9.2 WezTerm vs tmux 的差异

```
              tmux                          WezTerm mux
─────────────────────────────────────────────────────────
窗格管理       tmux daemon                   WezTerm 客户端

远端依赖       远端要装 tmux                  远端只要 WezTerm mux server

配置           .tmux.conf                    Lua(wezterm.lua)

图形           ASCII / Sixel                 GPU 渲染 + 图像协议

GUI / 字体     在终端模拟器                   自己就是终端模拟器

detach         ✓                             ✓
```

**WezTerm 的卖点**:**字体 / 图形 / 主题 / multiplexer 全在一个程序里,不用 tmux**。

### 9.3 那为什么 WezTerm 没杀死 tmux

```
原因 1:WezTerm 远端 mux 体验还不够稳
   - tmux 的 detach/attach 稳了 18 年
   - WezTerm 的 mux 是 2021 后的功能,bug 还有

原因 2:WezTerm 锁定了终端模拟器
   - 你用 WezTerm mux,必须 WezTerm 客户端
   - 你想用 iTerm2 / Alacritty / Ghostty,WezTerm mux 不能用
   - 而 tmux 跟终端模拟器解耦,任何终端都能用

原因 3:服务器侧依然 tmux 是默认
   - 别人的机器你不能要求装 WezTerm mux
   - tmux 几乎所有 Linux 装好了

原因 4:配置门槛
   - tmux .conf 比 wezterm.lua 简单
   - 你想用 mux 还要写 Lua
```

**结论**:**WezTerm mux 是"备选项",不是"主流方案"**。如果你已经选定 WezTerm 作为终端模拟器,**可以试一下它的 mux 模式,看看够不够用**;但**不要因为 WezTerm 有 mux 就放弃 tmux/Zellij**——前者绑定客户端,后者跨终端模拟器。

**简单粗暴的判断**:**WezTerm mux 适合"我永远只用 WezTerm 一个终端"的人**——这种人比想象的少。

---

## 十、反对的写法

这一节列我看到的"做错了"的几种姿势——

### 10.1 看新就跳 tmux → Zellij

```
反面教材:
   工程师 A 用了 5 年 tmux,配置 200 行,所有插件齐全
   听说 Zellij 新,周末花了 4 小时迁移
   - .tmux.conf 200 行 → 重新写 KDL
   - tmux-resurrect → Zellij 没对应方案,session 持久化没了
   - Catppuccin theme → Zellij 内置的不太一样
   - vim-tmux-navigator → 没有对应 plugin
   - 团队其他人还在 tmux,共享 layout 用不上

3 个月后,A 偷偷切回 tmux
   - Zellij 体验确实好,但生态短板让他无法工作
   - 沉没成本 + 团队不一致 = 切换的隐性代价远超预期
```

**教训**:**已经会 tmux 的工程师,不要因为"Zellij 看起来更现代"就迁移**——切换成本 = 200 行 conf 重写 + 5 年插件依赖重建 + 团队协作摩擦 + 3 个月不顺手。**你节省的"上手时间"是 0(你已经会 tmux),你失去的是 5 年沉淀**。

**只有一种情况你该迁移**:**你的工作模式发生根本变化**——比如以前 80% 远端,现在 80% 本地。否则别动。

### 10.2 Zellij + tmux 都装 + 频繁切换

(已在第八节展开,不再重复)

**核心**:**你的肌肉记忆是稀缺资源,不要分给两个工具**。

### 10.3 在 server 上装 Zellij 看新

```
反面教材:
   工程师 B 在公司开发机上装了 Zellij,觉得本地用着爽,远端也想要
   - cargo install zellij,编译 12 分钟
   - 装完一周,公司开发机重装(更新)
   - Zellij 又没了
   - B 重装,继续 12 分钟编译
   - 一个月内重装 3 次,B 烦了

教训:服务器上 tmux 仍然是默认
   - 你装 Zellij 在服务器,每次重装都要装一遍
   - 团队其他人 ssh 进同一台机器,tmux 用着,你 Zellij 用着,冲突
   - 服务器是"共享的、临时的、被重置的",别投入个人偏好
```

**服务器是公共空间,本地是私人空间**——前者用最大公约数(tmux),后者可以装自己喜欢的(Zellij)。**别用个人偏好污染服务器**。

### 10.4 抄"我的 Zellij dotfiles"几百行

```
反面教材:
   工程师 C 装了 Zellij,觉得不爽,Google 搜 "zellij dotfiles"
   找到一份 500 行 KDL,抄回来
   - 主题被改了 → 看不懂自己的颜色
   - 键位被改了 → hint 栏说的和实际按的对不上
   - layout 不是自己工作流 → 启动出来不对劲

2 周后,C 删了配置,回到默认
```

**教训**:**Zellij 的卖点之一就是"默认好用"**——你抄别人的 500 行配置,**等于把 Zellij 当 tmux 用**,失去 Zellij 自己的优势。**Zellij 配置应该极简**——30-50 行解决 80% 需求,**改 100 行就是过度配置**。

### 10.5 "Zellij 装上就完了不学心智"

```
反面教材:
   工程师 D 装了 Zellij,看 hint 栏按键就能用
   - 不知道有 KDL layout
   - 不知道 floating pane
   - 不知道 session 模型
   - 用了 1 年还是 "Ctrl-p 切 pane,Ctrl-t 切 tab"
   - 工作流和 tmux 没区别,Zellij 的优势没用上

教训:Zellij 的"易用"是入口低,不是终点低
   - 进门 30 秒,但要用好还是要学心智
   - 不学 layout / floating / 多 tab,Zellij 就是"好看一点的 tmux"
```

**易用 ≠ 不学**——所有工具都有上限,Zellij 的上限在 KDL layout 和 floating,**不学这些等于浪费它的卖点**。

### 10.6 用 tmux 但不写 .tmux.conf

```
反面教材:
   工程师 E 装了 tmux,觉得 prefix Ctrl-B 不顺手
   但不写 .tmux.conf 改,而是"忍着用"
   - 每次按 Ctrl-B 食指都要抬一下,一天上百次
   - copy-mode 用 emacs 键位,vi 习惯的 E 总按错
   - 默认状态栏丑,但不改

3 年后,E 仍然觉得 tmux 难用,迁去 Zellij

教训:tmux 默认配置是反人类的,不改你不知道它能多好
   - 改 prefix + 改 split 键 + 改 copy-mode + 改状态栏,1 小时
   - 这 1 小时让 tmux 从"难用"变成"真香"
   - 不改就放弃,等于没用过 tmux
```

**tmux 必须改默认配置**——这是它的"原罪"。不改你永远看不到 tmux 的好。**这也是为什么 Zellij 一开始就好用,而 tmux 要花时间配置**。

---

## 十一、看完这一篇你应该能

- **决定该不该从 tmux 迁移到 Zellij**——给出明确的"是 / 否",不再"两个都想用"
- **画一张 Zellij vs tmux 的 7 维度对照表**——学习曲线 / 性能 / 生态 / layout / floating / 远端 / 可读
- **写一份 30 行的 Zellij KDL layout**——nvim + watch test + logs 三 pane,启动一行命令
- **解释为什么"两个都装 + 切换"是最差的方案**——肌肉记忆冲突 / 半年都不流畅
- **辨别"看新就跳"的成本**——5 年 tmux 不要为 Zellij 重写
- **判断服务器是否该装 Zellij**——99% 的答案是不该(服务器是公共空间)
- **看到 WezTerm mux 时知道它是备选不是主流**——绑定客户端 + 远端不稳
- **解释 tmux 配置必须改默认才好用**——不改 .tmux.conf 等于没用过 tmux

---

## 十二、下一篇预告

这一篇讲的是 multiplexer 的"工具选择",**下一篇 `19-modal-editing的本质.md` 进入编辑器层** ——

```
vim 用户被嘲笑"键盘玄学"
真相是:modal editing 不是快捷键技巧
       是"把编辑文本做成一种语言"
       
你说"删一个单词"(dw)
而不是按"鼠标选中单词 + 按 delete"

下一篇你会学到:
   - 命令 = 动词 + 范围 的可组合语法
   - text object(iw / ip / i" / it)是 modal editing 的"名词"
   - Helix 把"范围 → 动作"翻过来的反 vim 设计
   - modal editing 在 IDE / 浏览器 / Obsidian 里的渗透
   - 为什么"学 vim 三天放弃"是认知误区
```

**这一篇 + 下一篇 + 20 (Neovim 配置) + 21 (Helix) = 编辑器层完整答案**。Multiplexer 决定"工作台",编辑器决定"打字的速度上限"——前者一周内化,后者一年内化,**都是终端工程师的硬通货**。
