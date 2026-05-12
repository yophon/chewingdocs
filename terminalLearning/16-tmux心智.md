# tmux 心智:为什么这个 1990 年代的 daemon 你 2026 年还必须吃下

你打开 VS Code Remote SSH,代码补全、跳转、Git diff 全部就位;你打开 Cursor,Claude 在侧边栏帮你改代码,看起来"远端开发已经够好了"。**所以为什么还要学 tmux?** 这是 2026 年新一代工程师最普遍的反应——「**那个布满奇怪快捷键的老古董,prefix C-b 还要双手按,session / window / pane 三个名字搞不清,我用 IDE 不就完了**」。**这种想法直接判你死刑**:你一定会在某个深夜远端跑 Claude Code 长任务、ssh 断线、合盖出门、被传染的服务器需要 attach 看现场的时候,**发现 IDE 在那一刻把你扔进沟里**。tmux 这个 2007 年的 daemon——更早的祖宗 `screen` 是 1987 年的——**之所以 20 年没死,是因为它解决的根本问题在 2026 年比 2007 年更严重,而不是更轻**:**任何长任务、任何远端 session、任何"我电脑关了它还在跑"的场景,IDE 都无能为力,只剩 tmux**。

> 一句话先记住:**tmux 是一个 server,你的 ssh 会话只是"瞥它一眼"——这个根本设计让 tmux 不依赖你的终端连接,断网、关窗、合盖、SSH 客户端崩,除了机器 reboot 之外它都活着**。这就是 tmux 跟"分屏工具""窗口管理器""终端模拟器多 tab"完全不在一个抽象层级的原因——**它不在你的客户端这一侧,它在你的工作要跑下去的那一侧**。学会 detach / attach,你的工作流从此跟"你坐在哪台电脑前"解耦——你今早在公司 ssh 进生产机起 `work` session,中午合盖出门,晚上家里 ssh 同一台机 `tmux attach -t work`,**看到的是上午留下来的现场**:窗格还在、tail 还在跑、Claude Code 还没退出、vim 里光标还在那一行。**这种"无缝接续"和"分屏"完全不是同一件事**。

04 篇讲过 session / pty / 进程组 / SIGHUP 的内核底子——**这一篇不再重复**(没看的回头补,这一篇直接预设你懂)。这里只讲一个问题:**tmux 这个抽象层为什么必须吃下,它的 server / session / window / pane 心智图怎么建,以及为什么"用鼠标拖拽 iTerm 多窗口"永远代替不了它**。

---

## 一、开篇冲突:为什么 IDE Remote 救不了你

### 1.1 IDE 党的反驳

```
"我有 VS Code Remote SSH,远端开发已经够好"
"我有 Cursor,Claude 帮我写代码,我用 IDE 就行"
"分屏 iTerm2 / WezTerm / Ghostty 自带,装 tmux 干嘛"
"prefix key 反人类,我学不会"
"session / window / pane 三个词我都搞不清楚谁套谁"
```

每一条单独看都"有道理",合起来就是"为什么我还在 2026 年用一个 1990 年代的工具"——**正确答案是:你不是在用 1990 年代的工具,你是在用一个 1990 年代就把"工作流不绑死在客户端"这件事想清楚了的工程范式**。这种范式在 IDE 时代被很多人遗忘,**但 IDE 解不了的那一类问题正在变多,不是变少**。

### 1.2 五个 IDE Remote 救不了你的真实场景

```
场景 1:你 ssh 进 GPU 机器跑训练,网络断了
  - IDE Remote:vscode-server 进程跟着 ssh 一起死
  - 训练进程是 vscode-server 的孙子,SIGHUP 传到 → 死
  - 你重连上去,训练没了,checkpoint 也没存
  - 解法只有:把训练放进 tmux

场景 2:你给 Claude Code 一个长任务,合盖回家
  - Claude 在 IDE 进程里跑,IDE 一关 Claude 一起死
  - 重启 IDE,Claude 不记得做到哪
  - 解法只有:Claude 在 tmux pane 里跑,合盖不影响

场景 3:你 ssh 进堡垒机 → 跳板 → 生产机,要看 4 个面板
  - VS Code Remote 不支持多跳(它就只支持一跳 ProxyJump 配好的)
  - 你只能开 4 个 iTerm 窗口分别 ssh
  - 4 个窗口里登的密码、跳的路径、跑的命令都互相不知道
  - 解法只有:远端开一个 tmux session,4 个 pane 各自登

场景 4:同事 ssh 进来跟你 pair debugging,但你已经登过了
  - 普通 ssh:两个独立 session,各看各的
  - 你说"你看左边那个文件",他不知道是哪个
  - 解法只有:tmux attach -t shared,你们共享同一屏,我打你看,他打我看

场景 5:你跑了一晚上的脚本,中间出了点错,你不在
  - IDE 跑的脚本,中间报错 IDE 关了,日志没保存
  - 第二天回来看不到中间发生了什么
  - 解法只有:tmux + history-limit 100000,所有滚动历史都在
```

这五个场景,**任何一个你这辈子会撞上至少 10 次**——你不学 tmux,每一次都要付一次"工作丢失"的代价。**学 tmux 的成本:1 周肌肉记忆 + 1 小时配置;不学的代价:每年损失 50-200 小时**。

### 1.3 tmux 解决的两件事(不是分屏)

```
分屏 tmux 顺手能做,但不是它的核心价值

tmux 的真正核心是两件事:

  ① 会话持久化(persistence)
     你的"工作环境"挂在 tmux server 上,不挂在你的终端
     你 ssh 进来 attach,看到上次离开的样子
     你 ssh 出去 detach,环境继续跑
     断网、关窗、合盖、IDE 崩——都不影响
  
  ② 客户端-服务端解耦(decoupling)
     tmux server 跑在那台机器上(本机或远端)
     谁都能 attach,谁都能 detach,可以多人同时 attach
     "工作环境"和"看工作环境的人"分开
     不绑死在某个终端窗口、某条 ssh 连接、某台电脑

这两件事一组合,你的工作流就跟"客户端"解耦了
这就是 tmux 50 万 GitHub star 的真正原因
```

**如果你装 tmux 只是为了分屏——别装,iTerm2 / Ghostty 内置的分屏对你够用**。tmux 的钱花在 ① 和 ② 上才回本。

---

## 二、tmux 是个 server,你的 ssh 只是 client

### 2.1 那张救命架构图

把 tmux 想成一个**两层架构**,跟你写 Web 应用是一模一样的:

```
                  ┌────────────────────────────────────┐
                  │           tmux server              │
                  │       (一个 daemon 进程)            │
                  │                                    │
                  │   ┌─────────┐  ┌─────────┐         │
                  │   │ session │  │ session │  ...    │
                  │   │  work   │  │  infra  │         │
                  │   └─────────┘  └─────────┘         │
                  │                                    │
                  │   socket: /tmp/tmux-$UID/default   │
                  └────────────────────────────────────┘
                              ▲     ▲
                              │     │
                  attach      │     │   attach
                              │     │
                  ┌───────────┘     └───────────┐
                  │                             │
            ┌──────────┐                  ┌──────────┐
            │ client A │                  │ client B │
            │ (你的    │                  │ (同事的  │
            │  iTerm)  │                  │  iTerm)  │
            └──────────┘                  └──────────┘
              一个 tmux                    一个 tmux
              进程                          进程
```

**重点**:

```
tmux server:
   - 长期运行的 daemon 进程
   - 持有所有的 pty / 进程组 / window / pane
   - 通过本地 UNIX socket 跟 client 通信
   - 它死了所有 session 才死(默认就只有"最后一个 client 退出后立刻死"
     这一条政策,但通过 last-session 和长 attach 可以不死)
   - 实际死的时机:
     * 最后一个 session 被 kill
     * 系统重启
     * 主动 tmux kill-server

tmux client:
   - 你每次敲 tmux / tmux attach 时启动的进程
   - 是个"瘦客户端":渲染界面 + 转发输入
   - 不持有任何 session / pane 状态
   - client 死了 server 不死
```

这个架构跟 Chrome 是 `browser process + N renderer process`、Docker 是 `dockerd + docker CLI`、Kubernetes 是 `kube-apiserver + kubectl` 是同一类——**control plane / data plane 分离**。**你 SSH 进去敲 `tmux` 时,你是 client,server 已经在那儿了**。

### 2.2 一段实验:亲眼看 server 和 client

```bash
$ ssh server
$ tmux new -s work               # 第一次 new,会自动 fork 一个 server
$ ps aux | grep tmux
yophon  12300 ... tmux: server (...)      ← server (daemon)
yophon  12350 ... tmux new -s work        ← client(你这个进程)

# 现在你按 prefix + d (detach)
[detached (from session work)]
$ ps aux | grep tmux
yophon  12300 ... tmux: server (...)      ← server 还在!
# 注意 client 那条没了

$ tmux ls                         # 列所有 session
work: 1 windows (created Mon May 12 09:30:00 2026)

$ tmux attach -t work             # 重新 attach
# 进入 work session,看到上次离开的样子
```

这段实验是 tmux 的全部魔法:**你的工作环境(`work` 这个 session)挂在 server 进程里,跟你这个 client 进程没关系**。

```
关键事实:
  - 你 ssh 出去:server 不死,session 继续
  - 你电脑关掉:server 不死(在远端机上)
  - 远端机器没重启:你下次 ssh 进来,session 还在
  - 你 tmux kill-server:server 死,所有 session 一起死(全杀)
  - 远端机器重启:server 死,所有 session 一起死(系统级重启)
```

### 2.3 session 数据流转的细节

很多人到这一步还会问:"那 server 死了我的工作不就没了?"——**对**。tmux server 不持久化到磁盘,**所有 session 状态都在内存**。机器重启 = session 全没。

```
持久化的层级(由低到高):
  
  ①  tmux session 状态(window / pane 结构)
      → 默认不持久化,机器重启就没
      → 17 篇会讲 tmux-resurrect + tmux-continuum
        把"窗格结构"周期性保存到磁盘
  
  ②  pane 内运行的进程
      → 完全不持久化(进程在 server 内存里)
      → tmux-resurrect 只能保存进程的命令行,
        重启后重新跑一遍命令(很多程序状态丢失)
  
  ③  滚动历史(history-limit)
      → 默认 2000 行,17 篇会调到 100000
      → 这个也不持久化
```

**tmux 的"持久化"承诺只到"机器不重启"这一层**——server 进程不死的范围内,session 永远在。**这跟数据库的持久化不是一码事**——别拿生产数据塞 tmux pane 里跑然后期望它跨重启。

---

## 三、三层抽象:Session / Window / Pane

新人最大的混乱点在这一层:**session、window、pane 这三个英文名字到底谁套谁,谁是谁的父亲**。把它一图打通:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       tmux server (一个进程)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────── Session: work ─────────────────────────┐  │
│  │ (这个 session 是一件事:写后端代码)                            │  │
│  │                                                               │  │
│  │  ┌── Window 1: editor ──┐  ┌── Window 2: server ──┐  ...     │  │
│  │  │                      │  │                      │           │  │
│  │  │  ┌────────────────┐  │  │  ┌────────────────┐  │           │  │
│  │  │  │   pane 0:vim   │  │  │  │ pane 0: server │  │           │  │
│  │  │  │   main.go      │  │  │  │ go run ...     │  │           │  │
│  │  │  │                │  │  │  └────────────────┘  │           │  │
│  │  │  ├────────────────┤  │  │  ┌────────────────┐  │           │  │
│  │  │  │   pane 1:term  │  │  │  │  pane 1: tail  │  │           │  │
│  │  │  │   $ tests      │  │  │  │  tail -f log   │  │           │  │
│  │  │  └────────────────┘  │  │  └────────────────┘  │           │  │
│  │  │ (此 window 2 pane)   │  │ (此 window 2 pane)   │           │  │
│  │  └──────────────────────┘  └──────────────────────┘           │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────── Session: infra ────────────────────────┐  │
│  │ (这个 session 是另一件事:维护基础设施)                       │  │
│  │  ┌── Window 1: prod ─────┐  ┌── Window 2: staging ──┐         │  │
│  │  │  pane 0: kubectl ...  │  │  pane 0: ssh stage    │         │  │
│  │  │  pane 1: htop          │  │  ...                  │         │  │
│  │  └───────────────────────┘  └───────────────────────┘         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

逐层解释:

### 3.1 Session(会话):一件事

**Session 是顶层容器**。它对应**一件独立的工作流**。

```
你应该这样想 session:
  - work     一个 session = 我在写后端代码这件事
  - infra    一个 session = 我在维护生产环境这件事
  - notes    一个 session = 我在写技术博客这件事
  - claude   一个 session = 我跑 Claude Code 长任务这件事
  - sre      一个 session = 我做事故排查这件事

不应该这样想 session:
  ✗ "我开一个新 terminal" → 那是 window 干的事
  ✗ "我开一个新 tab"      → 那是 window 干的事
  ✗ "我开一个分屏"        → 那是 pane 干的事
```

**核心判断**:**做完一件事之后,session 是不是可以整个砍掉?** 如果是,这就是一个合理的 session;如果你在一个叫 `work` 的 session 里同时塞了"写代码 + 维护生产 + 跑长任务",**这不是 session,这是 session 大杂烩**。

```bash
$ tmux new -s work               # 新建一个名叫 work 的 session
$ tmux ls                        # 列所有 session
work: 1 windows ...
infra: 3 windows ... (attached)
$ tmux attach -t work            # attach 到指定 session
$ tmux kill-session -t old       # 杀掉一个 session
$ tmux rename-session new        # 给当前 session 重命名(prefix + $)
```

### 3.2 Window(窗口):一件事里的一个上下文

Window 是 session 内的次级容器,**像浏览器的 tab**:

```
window 的合理用法:
  在 work session 里:
     window 1 = editor    (vim 在写代码)
     window 2 = server    (跑 dev server + tail 日志)
     window 3 = git       (lazygit / git log 等)
     window 4 = ai        (Claude Code 跑长任务)
     window 5 = notes     (临时写笔记)
  
  在 infra session 里:
     window 1 = prod
     window 2 = staging  
     window 3 = monitoring   (htop / dstat / nload)
```

**为什么不是 session?** 因为这几件事**是同一件大事("写后端")的不同上下文**——你随时在它们之间切。**为什么不是 pane?** 因为它们各自占满整个屏幕更好用——vim 不想被挤到半屏。

```bash
# window 操作(在 session 内):
prefix + c              新建 window
prefix + 1 2 3 ...      跳到第 N 个 window
prefix + n / p          下一个 / 上一个
prefix + ,              改 window 名
prefix + &              杀掉 window(会问"yes/no")
prefix + w              列出所有 window 选择(像 fzf)
```

### 3.3 Pane(窗格):同一窗口的分屏

Pane 是 window 内的最细粒度——**就是分屏**。

```
pane 的合理用法(同一 window 内):
  editor 这个 window:
     pane 0 = vim 写代码        (左)
     pane 1 = 跑测试 / REPL     (右)
  
  server 这个 window:
     pane 0 = dev server (前台)  (上)
     pane 1 = tail -f log        (下)
```

**Pane 是"你想同时看两件事"时才用**——一个 pane 编辑 / 一个 pane 跑测试,左右对照。**Pane 不是"我开一个新 terminal"**——那是 window 干的。

```bash
prefix + |  或 prefix + %       垂直分割(自定义 |,默认 %)
prefix + -  或 prefix + "       水平分割(自定义 -,默认 ")
prefix + h / j / k / l          在 pane 间跳(vim 风格,需要自定义)
prefix + 方向键                  默认 pane 跳转
prefix + z                       zoom(把当前 pane 全屏 / 还原)
prefix + x                       杀掉 pane
prefix + q                       显示每个 pane 的编号(短暂)
prefix + {  或 prefix + }       前后交换 pane
prefix + Space                   循环 layout(主-副 / 等分 / 等等)
```

### 3.4 三层心智的"语义边界"

```
                  独立性               同屏可见性          频繁切换性
─────────────────────────────────────────────────────────────────────
Session         一件事(高)           不同屏(低)         不频繁(低)
                跨 session 切是"换 hat"
                
Window          同事不同上下文(中)   不同屏(低)         中等
                同 session 切 window 是"在同一件事的不同部分跳"
                
Pane            同上下文不同视角(低)  同屏(高)           频繁(高)
                pane 内切是"我同时看两件事"
```

**判断准则**:

```
要不要新 session?   "这是不是一件独立的事?如果 session 整个删了,我能不能接受?"
要不要新 window?    "这是不是同一件事的另一个上下文?需不需要满屏跑?"
要不要新 pane?      "我是不是要同时看这两个东西?"
```

**90% 的新人错误用法**:**所有东西都丢一个 session 里**——work 里有 dev server、又有运维 SSH、又有 Claude 长任务、又有读邮件 —— **这种 session 一旦挂了,5 件事一起死**。**正确做法是按"事"切 session**:work / infra / claude / notes 分开,server 死的时候只死一件事,其他 session 不受牵连。

---

## 四、prefix key 的设计哲学

新人对 tmux 最大的抱怨:**"为什么要双键?直接按快捷键不行吗?"**

### 4.1 为什么必须有 prefix

**tmux 跑在终端里,终端里所有按键都要先经过 shell / 程序**——如果 tmux 想要"独占"快捷键(比如直接按 Ctrl-T 切 window),**那 vim 的 Ctrl-T(回到上一个 tag)就废了,Emacs 的 C-x 全废了,bash 的 C-r 也废了**。终端按键空间是**共享的**,tmux 不能独占。

**prefix 的本质是"模式切换"**:

```
没有 prefix 时:
   你的按键 → 终端 → 当前前台进程(vim / shell / Claude / ...)
   
按了 prefix 之后(短暂的"tmux 模式"):
   你的按键 → 终端 → tmux 拦截这一个 key
   tmux 处理完一个 key 后,自动退出 "tmux 模式"
   下一个按键又回到正常流程
```

这跟 vim 的 modal(normal / insert)是同一个心智——**用一个前缀切到"工具模式",做一件事,自动切回去**。

### 4.2 默认 prefix 是 Ctrl-B,为什么大家都改

```
默认:Ctrl-B
   - 食指要伸到键盘中央偏左
   - 跟 readline 的 Ctrl-B(光标左移一字符)冲突
   - 跟 emacs 的 Ctrl-B 冲突
   - 大拇指按 Ctrl + 食指按 B,手势别扭

常见改法:
   ① Ctrl-A     screen 的默认,跟 readline 的"行首"冲突
                但 readline Ctrl-A 用得少(Home 键够了)
                按起来最舒服:大拇指 Ctrl + 食指 A 自然落
   
   ② Ctrl-Space 跟 IDE 的"补全"冲突(VS Code / IntelliJ 默认)
                如果你 IDE 党不要选
   
   ③ ` (反引号)单键无 modifier,按起来最快
                但反引号在 shell 里是命令替换,经常误输入
                适合"反引号已经不用"的人
   
   ④ 不改        坚持 Ctrl-B 也可以,熟了就熟了
                但 99% 的成熟用户都改了
```

**强烈建议**:**Ctrl-A**(除非你重度 emacs 用户)。**Ctrl-A 是工程界的事实标准**,几乎所有 tmux 教程、所有 dotfiles 仓库默认都是 Ctrl-A。**学了 Ctrl-A 之后跨电脑切换,你在别人机器上也能用**(很多人也是 Ctrl-A)。

### 4.3 双击 prefix 把 prefix 传给程序

改完 prefix 之后,还要解决**"我真的想给程序发 Ctrl-A 怎么办"**(比如 bash 的"光标移到行首"或 vim 的某些插件)。

```bash
# 在 .tmux.conf 里:
set -g prefix C-a
bind C-a send-prefix       # 按两次 Ctrl-A 把 Ctrl-A 真的发出去
```

这样:**Ctrl-A 单独按 = 进入 tmux 模式**,**Ctrl-A 双击 = 把 Ctrl-A 发给当前程序**。

### 4.4 prefix 是"安全门",不是"麻烦"

新人嫌 prefix 麻烦是因为**没体会过它防住的事故**:

```
没有 prefix(假设 tmux 直接绑 Ctrl-W 是关 pane):
   - 你在 vim 里按 Ctrl-W(切 window 子模式)
   - vim 看不到 Ctrl-W,因为 tmux 拦截了
   - 你的 pane 没了
   - vim 的快捷键全废
   - 装一个 emacs?Ctrl-X 也被 tmux 抢
   - 装 Claude Code?Ctrl-N(下一条消息)被 tmux 抢

有 prefix:
   - 你 vim 里按 Ctrl-W → 正常切 vim 子模式
   - 你想关 tmux pane → prefix + x
   - 所有终端程序的快捷键 100% 保留
   - tmux 跟程序"不抢键"
```

**prefix 的本质是"租用一个 key namespace"**——你借一个 key(C-a)给 tmux,作为回报,**tmux 不抢任何其他 key**。这笔交易非常划算。

---

## 五、基础操作的"语义分组"

**不抄快捷键大全,讲心智**。tmux 的快捷键看似乱(prefix 后面跟一堆字母),但分组后只有**三类**——session 操作 / window 操作 / pane 操作,加上 copy-mode 一类工具操作。

### 5.1 Session 类

```
Session 操作(整个工作流级别的事):

  tmux new -s work                  # 命令行:新建一个叫 work 的 session
  tmux ls                           # 命令行:列所有 session
  tmux attach -t work               # 命令行:attach 到 work
  tmux kill-session -t work         # 命令行:杀掉 work
  
  prefix + d                        # session 内:detach(干净退出但保活)
  prefix + s                        # session 内:交互式选 session 切换
  prefix + $                        # session 内:重命名当前 session
  prefix + (    prefix + )          # session 内:上/下一个 session
```

**为什么这么分组?** 因为 session 是"件事的容器"——**你新建 / 列 / 切换 / 杀掉 session,本质上是在切换工作流**,这跟 vim 的 buffer 切换、Chrome 的窗口切换是同一类操作。

### 5.2 Window 类

```
Window 操作(同一件事内的次级上下文):

  prefix + c                        # 新建 window
  prefix + n   /   prefix + p       # 下一个 / 上一个 window
  prefix + 1   ... prefix + 9       # 跳到第 N 个 window
  prefix + ,                        # 给 window 改名
  prefix + &                        # 杀掉 window(会问 y/n)
  prefix + w                        # 列出 window(交互式选)
  prefix + .                        # 把 window 移到另一个 index
```

**为什么这么分组?** 因为 window 像浏览器的 tab——**你创建一个、跳来跳去、改名字、关掉**,跟 browser tab 操作完全一对一映射。

### 5.3 Pane 类

```
Pane 操作(同一 window 的分屏):

  prefix + |        垂直分割(自定义,默认 %)
  prefix + -        水平分割(自定义,默认 ")
  prefix + h/j/k/l  在 pane 间跳(自定义 vim 风格)
  prefix + 方向键   默认 pane 跳转
  prefix + z        zoom 当前 pane 到全屏(再按一次还原)
  prefix + x        杀掉 pane
  prefix + q        瞬间显示每个 pane 的编号
  prefix + {  / }   交换 pane 位置
  prefix + Space    循环切换 layout
```

**为什么这么分组?** 因为 pane 是"屏幕上的一块"——**创建、移动、放大、关掉**,这跟窗口管理器里的 split 操作一一对应。

### 5.4 工具类

```
copy-mode / 进入工具模式:

  prefix + [        进入 copy-mode(可以滚屏 / 选文本 / 搜索)
  prefix + ]        粘贴上次 copy-mode 选中的文本
  prefix + :        进入命令模式(直接敲 tmux 命令)
  prefix + ?        显示当前所有 keybindings
  prefix + t        显示一个全屏的时钟(无用但好玩)
  prefix + r        重新加载 .tmux.conf(自定义,默认无)
```

**这一组是 tmux 的"次级界面"**——copy-mode 是最重要的(下一节单独讲)。

### 5.5 三组速记表

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   "$()"  ←  session  (s 头 / $ 改名 / 括号切)  │
│       d, s, $, (, )                            │
│                                                 │
│   ",cnw&"  ←  window  (c 创 / n 下 / ,改名)    │
│       c, n, p, 1-9, ,, &, w                    │
│                                                 │
│   "|-hjkl z x" ← pane  (|分 / hjkl 跳 / z 缩)  │
│       |, -, h, j, k, l, z, x, q, Space         │
│                                                 │
└─────────────────────────────────────────────────┘

15-20 个快捷键,就是 tmux 日常的全部
```

**有人会贴一张 100 多个快捷键的表"tmux 全键位"——别背,90% 一辈子不用**。日常就这 15-20 个,3 天内化,1 周熟练。

---

## 六、状态栏的语义

打开 tmux 之后底部那一条**状态栏(status line)**是 tmux 的"仪表盘"——很多人觉得它丑,但它的信息密度是设计过的:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          [屏幕内容]                                      │
│                                                                         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ [work]  1:editor* 2:server- 3:git  4:claude         "host" 14:30 5月12  │
└─────────────────────────────────────────────────────────────────────────┘
   ↑       ↑       ↑                                   ↑
   ↑       ↑       ↑                                   右:hostname / 时间 / 日期
   ↑       ↑       window 列表(* = 当前,- = 上次)
   ↑       window 自动编号
   左:session 名([work])
```

**关键字段**:

```
左侧(status-left):
   [work]    当前 session 名,告诉你"现在在哪件事"

中间(status-window-list):
   1:editor* 2:server- 3:git 4:claude
   - 数字是 window 的 index
   - 冒号后是 window 名(自动用当前命令名 / 你 prefix + , 改的名)
   - *  表示当前 window
   - -  表示上次访问的 window(prefix + l 跳回)
   - !  表示这个 window 有 activity(有输出,需要看)
   - #  表示这个 window 有 bell(很多人关掉了)
   - Z  表示当前 window 处于 zoom 状态(一个 pane 占满)

右侧(status-right):
   "host" 14:30 5月12
   - 主机名(尤其重要:你不知道自己在哪台机器上)
   - 时间(很多人用 tmux 时全屏,屏幕上没系统时钟)
   - 日期(可选,不常用)
```

**状态栏是 tmux 给你的"我现在在哪"提示**——`[work]` 告诉你 session,`1:editor*` 告诉你 window,主机名告诉你机器。**这三件事在你 attach / detach / ssh 多机时极其重要**——不然你不知道自己刚按的命令到底打在哪里。

**状态栏可改**——17 篇专讲怎么改(简化 / 加 cpu mem / 改颜色)。**这一篇心智先建立:状态栏不是装饰,是仪表盘**。

---

## 七、copy-mode:tmux 学习曲线最陡的一步

新人在 tmux 里最容易卡死的事:**怎么向上滚屏看历史**。

```
你 ssh 进生产机,跑了一段 grep,输出 50 屏
你按 PageUp ... 没反应
你滚轮 ... 没反应(默认 mouse off)
你按 Ctrl-Up ... 没反应
你 Cmd + 向上 ... iTerm 自己滚了一下但 tmux 没动
你试图复制选中文本 ... 选不到
```

**为什么这么折磨人?** 因为 tmux 拦截了 pty 的输出——**屏幕上你看到的所有内容,实际上是 tmux 的内部 buffer**,你的终端模拟器看到的只是"tmux 当前帧"。你想滚屏,**必须告诉 tmux "我要看历史 buffer 了"**——这就是 copy-mode。

### 7.1 进入 copy-mode

```
prefix + [           进入 copy-mode

进入之后,左上角(或右上角,看版本)会显示 [copy]
   你的按键不再发给前台进程,而是给 tmux 内部的"光标"
   
此时你可以:
   k / j  或  方向键    上下移动(滚屏)
   h / l                左右移动
   PageUp / PageDown    翻页
   /  + 关键字 + Enter  向下搜索
   ?  + 关键字 + Enter  向上搜索
   n  / N                下一个 / 上一个匹配
   g  / G                跳到 buffer 顶 / 底
   
选取:
   v(vi 模式) 或 space(emacs 模式)   开始选取(进入 visual)
   移动光标选中文本
   y(vi 模式) 或 enter                复制选中文本到 tmux buffer
   
退出 copy-mode:
   q  或 esc                          回到正常模式
```

### 7.2 emacs vs vi 默认

**tmux 默认 copy-mode 是 emacs 键位**——`Ctrl-N` 下、`Ctrl-P` 上、`Ctrl-V` 翻页、`Ctrl-Space` 选取。**大多数 vim 用户立刻改成 vi**:

```bash
# .tmux.conf:
setw -g mode-keys vi
```

改完之后:`h j k l` 移动、`v` 选取、`y` 复制——**跟 vim 的视觉模式一模一样**。

### 7.3 复制到系统剪贴板

tmux 默认的 `y`(yank)只复制到 **tmux 自己的 buffer**(`prefix + ]` 才能粘回 tmux)。**真正有用的是复制到系统剪贴板**(让你能 Cmd-V 粘到别的程序):

```bash
# macOS:
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"

# Linux X11:
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "xclip -selection clipboard"

# Linux Wayland:
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "wl-copy"
```

**配置完之后,copy-mode 里 y 直接进系统剪贴板**——你按 Cmd-V 就能在任何程序里粘贴。**没这一行配置,90% 的 copy 操作都白做**。

### 7.4 鼠标可不可以替代

很多人问:"为什么不直接用鼠标选?"——**可以,但有大坑**。

```bash
# .tmux.conf:
set -g mouse on
```

开启之后:**滚轮直接进 copy-mode 滚动**、**鼠标可以拖动 pane 分界线**、**鼠标可以点击切 pane**。

**但**:**鼠标选取的"行为"在 tmux 里和你想的不一样**——

```
你在普通终端里:
   鼠标拖选 → 选中的文字进系统剪贴板(终端模拟器干的)
   
你在 tmux + mouse on:
   鼠标拖选 → 选中的文字进 tmux buffer(tmux 拦截了选取事件)
   选中之后,松开鼠标 → tmux 立刻退出 copy-mode → 选中的内容到 tmux 内部
   你 Cmd-V 粘不到别的程序!
```

**解法**:**配置 copy-mode 的鼠标行为**——松开鼠标时把内容 pipe 到 pbcopy:

```bash
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"
```

**没配这一行,mouse on 就是个坑——你看似选中了,实际没法复制出去**。17 篇会一并贴出。

### 7.5 为什么这是"最陡的一步"

```
copy-mode 不是"功能",是"模式切换"——
   你必须意识到"我现在在 copy 模式 / 我现在在正常模式"
   一个模式下的按键,在另一个模式下完全不同
   
对从来没用过 vim / modal editor 的人,这就是认知门槛
   "为什么我按 j 不是输入 j,而是光标下移?"
   "为什么我按 y 不是输入 y,而是复制?"
   
扛过这一步,你就建立了"modal 思维"
   这套思维下一步可以扩展到 vim / Neovim / Helix(19-21 篇)
   tmux copy-mode 是你进入 modal 世界的入口
```

**这个学习曲线值不值?** 值——一旦你内化 copy-mode,**你滚屏 / 搜索 / 复制的速度比鼠标快 5-10 倍**,而且**所有终端 + tmux + vim 共用同一套 hjkl + / 搜索心智**。

---

## 八、session 的生命周期 / 命名工作流

把 session 当成"长期挂载的工作流",**命名很重要**。

### 8.1 一个 session 一件事

```
推荐的 session 列表:

  work       写后端代码这件事
  infra      维护生产基础设施
  notes      写文章 / 笔记
  claude     跑 Claude Code 长任务
  sre        事故排查
  dotfiles   配置自己的 dotfiles
  
不推荐:
  ✗ session 1, session 2, session 3 (无意义命名)
  ✗ ssh1, ssh2, ssh3 (按"连了哪台机器"分)
  ✗ tmp, test, foo (临时命名永久化)
```

**判断准则**:**3 个月后你回来,看到这个 session 名,是不是马上知道里面在干什么?** 是,合格;不是,改名。

### 8.2 session 的生命周期

```
出生:
   tmux new -s work
   或者用 tmuxinator / tmuxp / 自定义脚本一键起多窗格
   (17 篇会讲)

attach / detach 循环:
   工作中:
      attach 进来 → 干活 → detach 出去(prefix + d)
      attach 进来 → 干活 → detach 出去
      ...
   
   server 重启之间它一直在(可能几天到几周)

死亡:
   ① 主动:tmux kill-session -t work
   ② 间接:整个 server 死(kill-server / 机器重启)
   ③ 进程级:session 里的所有 window 都 exit 之后,session 自动消失
```

**session 不是越长寿越好**——长期挂着的 session 会**积累垃圾**(没用的 window、僵尸进程、跑了 1000 行历史的临时命令)。**每周一次 spring cleaning**:看一眼 `tmux ls`,把不用的 session kill 掉。

### 8.3 "屏幕共享":同一 session 多人 attach

tmux 的另一个被低估的能力:**多 client 同时 attach 同一个 session**——所有人看到的屏幕完全一致,**所有人的键盘都能输入**(协作模式)。

```bash
# 你 ssh 进 server,起一个 session:
$ tmux new -s pair

# 同事也 ssh 进同一台 server,attach:
$ tmux attach -t pair

# 现在你俩看的是同一个屏幕,你打的字他能看见,他打的字你能看见
# 这是天然的"屏幕共享 + 协作编辑",不需要任何视频会议软件
```

**真实用法**:

```
- 远程 pair programming (你写代码他看你写)
- 远程 debugging      (你出问题让 senior attach 来看)
- 远程教学           (你跑命令给学生看,学生也能跑给你看)
- 灾难应急           (事故时 SRE 多人共同登一台机器协作)
```

**注意安全**:**多人 attach = 多人有完整的 shell 控制权**——你能跑的命令他都能跑。**不要在生产敏感机器上随便让人 attach**。如果只想"看不能操作",用 tmux 的 readonly 模式(`tmux attach -t pair -r`)。

### 8.4 把"开新机器"变成"attach"

这是 tmux 心智的最高境界:

```
传统的 ssh 工作流:
   ssh server
   cd /work/project
   vim main.go
   # 工作中...
   ^D 退出 → 一切消失
   下次再 ssh,从头来:cd /work/project; vim main.go; ...

tmux 工作流:
   ssh server
   tmux attach -t work     # 直接 attach 上次留下的 work session
   # 看到 vim 还开着 main.go,光标还在那一行
   # tail 还在前台跑
   # Claude Code 还在等输入
   # 一切如初
   
   "工作"不再有"开始"和"结束",只有"暂停"和"继续"
```

**这种工作流的核心**:**长期挂载的 session = 你的"工作快照"**——你换电脑、换地点、换 IDE,只要远端机器没重启,你的 session 在那儿。**这才是 tmux 的灵魂**。

---

## 九、嵌套 tmux:常见痛点

**90% 用 tmux 一年以上的人都遇到过嵌套问题**:

```
你在本地电脑跑 tmux(prefix C-a)
然后 ssh 进远端机器,远端也跑 tmux(prefix C-a)
现在你按 prefix:
   本地 tmux 拦截 → 你给远端的命令到不了
   你的 ssh 远端 tmux 根本收不到 prefix
   两套 tmux 抢同一个键
```

### 9.1 嵌套的本质

```
本地 tmux client (你坐的 iTerm)
       ↓
本地 tmux server(本地 daemon)
       ↓ (其中一个 pane 跑着 ssh)
ssh 隧道
       ↓
远端 tmux client (ssh 隧道里跑的)
       ↓
远端 tmux server(远端 daemon)
       ↓
远端 vim / Claude / shell
```

**问题**:**你的按键先到本地 tmux,被它拦截**——它根本不知道你是要给"我"的命令还是要给"远端的 tmux"。

### 9.2 三种解法

**解法 1:本地不用 tmux,只远端用**

最干净。**如果你 95% 的 tmux 工作都在远端,本地就别套一层**。本地直接 iTerm 多 tab + 远端 tmux,完全够用。

**解法 2:远端用不同 prefix**

```bash
# 远端机器的 ~/.tmux.conf:
set -g prefix C-b               # 远端用 Ctrl-B(默认)
unbind C-a                       # 解除 Ctrl-A
bind C-b send-prefix             # 双击 C-b 把 C-b 发出去

# 本地:用 C-a(我们之前改的)
# 远端:用 C-b(回到默认)

# 这样你按 C-a → 本地 tmux 接,按 C-b → 透传到远端 tmux 接
```

**这是最实用的解法**——本地远端各用一套,互不冲突。

**解法 3:本地把 prefix 透传**

```bash
# 本地的 .tmux.conf:
bind-key -n C-a send-prefix     # 单击 C-a 透传给远端
bind-key C-a send-prefix         # prefix + C-a 也透传
```

但这样**本地 tmux 就用不了 prefix 了**——只能远端用。这种解法很少用。

### 9.3 实际推荐

```
如果你 80% 时间在远端:
   本地不开 tmux,iTerm 多 tab 就好
   远端 tmux 用你最熟的 prefix(C-a)
   
如果你本地远端都重度用:
   本地 prefix C-a,远端 prefix C-b
   远端 .tmux.conf 重写 prefix
   
如果你经常多层 ssh:
   本地 C-a,第一跳 C-b,第二跳 ` (反引号)
   每多一层换一个 key,从外到里
```

**记号**:**外层 tmux 总是"先吃"prefix,所以越外层的 prefix 越好按,越内层的越偏门**——和你的"日常按多少次"成反比。

---

## 十、tmux vs screen vs Zellij

简短对比,**给选型一个清晰判断**。

```
┌──────────────────────────────────────────────────────────────────┐
│  工具      │  年代   │  状态        │  默认装  │  设计哲学         │
├────────────┼─────────┼──────────────┼──────────┼──────────────────┤
│  screen    │  1987   │  几乎停更    │  几乎所有 │  能用就行         │
│            │         │              │  Linux   │                  │
│                                                                   │
│  tmux      │  2007   │  活跃        │  否(brew │  显式 server      │
│            │         │              │  install)│  / 现代键位       │
│                                                                   │
│  Zellij    │  2020   │  活跃        │  否       │  开箱即用 / 声明式│
│            │         │              │          │  layout / Rust   │
└──────────────────────────────────────────────────────────────────┘
```

### 10.1 screen:应急用

```
何时用 screen:
  - 你 ssh 进一台陌生 Linux,没装 tmux,也没法 sudo
  - 你只想 "detach 一下" 跑长任务,不需要分屏
  - 你修复一个 1995 年的服务器,只有 screen

screen 的优点:
  ✓ Linux 几乎默认装(/usr/bin/screen)
  ✓ 极简,几乎没配置成本
  ✓ 同样支持 detach / attach
  
screen 的缺点:
  ✗ 几乎停更
  ✗ 配置语法奇怪
  ✗ 分屏体验差
  ✗ 没有 copy-mode 的 vi 模式
  ✗ 状态栏定制能力弱
  ✗ 不支持现代键位
  ✗ 几乎没插件生态

实用建议:平时学 tmux,看见 screen 也认识
        生产机如果只有 screen,知道 detach 是 Ctrl-A + d
        长期 screen 用户应该迁到 tmux
```

### 10.2 tmux:主流

```
何时用 tmux(几乎所有现代场景):
  - 你需要 detach / attach
  - 你需要分屏
  - 你需要会话持久化
  - 你需要远端长任务
  - 你需要 pair programming / 屏幕共享
  - 你的 .tmux.conf 想 sync 到所有机器

tmux 的优点:
  ✓ 活跃维护(最近一次大版本 2024 还有)
  ✓ 配置文件清晰(.tmux.conf 语法直接)
  ✓ 插件生态成熟(TPM 一行安装)
  ✓ copy-mode 支持 vi 键位
  ✓ 状态栏高度可定制
  ✓ 现代键位友好
  ✓ 大部分 dotfiles 仓库以 tmux 为默认
  ✓ 文档 / Stack Overflow 答案极多

tmux 的缺点:
  ✗ 默认配置需要改(prefix C-b / 复制操作 / 分屏键)
  ✗ 学习曲线在 copy-mode / mouse on 的协调
  ✗ 嵌套时的 prefix 冲突
  ✗ 状态恢复需要插件(tmux-resurrect),且不能恢复进程内部状态

实用建议:2026 默认就是它,本系列也以它为例
```

### 10.3 Zellij:声明式新秀

```
何时用 Zellij:
  - 你愿意"花一个学习曲线换一个更好的默认"
  - 你受不了 tmux 的 50 个 prefix 快捷键
  - 你喜欢声明式配置(KDL)
  - 你想要"开箱即用"的状态栏 / 浮动窗口
  
Zellij 的优点:
  ✓ 开箱即用(默认配置可用,几乎不用改)
  ✓ 状态栏 + 浮动窗口内置
  ✓ 声明式 layout(yaml/KDL 描述窗格结构)
  ✓ Rust 写的,性能好
  ✓ keybinding 提示常驻底部(对新人友好)
  
Zellij 的缺点:
  ✗ 生态远不如 tmux(2020 起步,生态薄)
  ✗ 不少高级场景缺失(SSH 共享 attach 不如 tmux 成熟)
  ✗ 自定义余地小(强约定的代价)
  ✗ 不少机器没装(brew install zellij 才有)
  ✗ 部分插件功能 tmux 已有的,Zellij 还在做

实用建议:Zellij 是潜力股,但 2026 还不到取代 tmux 的程度
        18 篇会专讲 Zellij vs tmux 怎么选
        如果你刚学 multiplexer,可以两个都试 1 周再选
```

### 10.4 选型结论

```
默认:tmux

例外:
  - 远端机器只有 screen,你只是临时 detach → screen
  - 你试过 tmux 想换 Zellij,有意识地评估 → Zellij(看 18 篇)
  - 你坚持只用终端模拟器的内置分屏 → 那就不学 tmux
    (但你失去了 detach / attach,长任务自己想办法)
```

---

## 十一、反对的写法

讲完正确的,**列出几条常见错误**——见到了就知道是错。

### 11.1 用 tmux 当窗口管理

```
错的:
  打开 tmux 就是为了"分 4 个窗格,左上 vim,右上 server,左下 git,右下 tail"
  用 tmux 替代 i3 / yabai / Hyprland 的窗口管理
  
错在哪:
  - tmux 是终端 multiplexer,不是 OS 窗口管理器
  - tmux 管的是"终端里的窗格",不是"屏幕上的窗口"
  - 你的浏览器、Slack、Spotify 这些非终端程序,tmux 完全不管
  - 你想"窗口管理",用 i3 / yabai(macOS)/ Hyprland(Wayland)
  
正确认知:
  - tmux 管终端窗格
  - i3 / yabai 管 OS 窗口
  - 这两个东西可以叠加,但功能不重叠
```

### 11.2 鼠标 + iTerm 多 tab 替代 tmux

```
错的:
  "我有 iTerm,Cmd-T 开新 tab,Cmd-D 分屏,Cmd-1/2/3 切 tab,够用了"
  
错在哪:
  - iTerm 的 tab / split 都跟"客户端"绑死
  - 关掉 iTerm 窗口 / 重启 Mac → 全没
  - 你 ssh 进远端,iTerm 的 tab 在远端没用(那是本地的)
  - 长任务跑在 iTerm tab 里,iTerm crash → 长任务死
  - 你想从家电脑接续公司电脑的 4 个 tab → 做不到
  
正确认知:
  - iTerm 的 tab / split = 视觉容器(本地)
  - tmux 的 window / pane = 工作流容器(可远端,可持久)
  - 两个层次,iTerm 是"我看哪台机",tmux 是"那台机上挂了什么"
```

### 11.3 不学 copy-mode,只用鼠标滚动

```
错的:
  装 tmux 之后开了 mouse on
  以为这样滚轮就能滚 buffer
  滚轮一滚发现自动进 copy-mode 了,但不会用 / / n
  搜索历史还是用 grep + 重新跑命令
  
错在哪:
  - mouse on 只是让你"用鼠标进 copy-mode",不是"用鼠标就行了"
  - 真正的复制 / 搜索还是要用 hjkl + / 这套键位
  - 不学 copy-mode 等于失去 tmux 滚屏 / 搜索 / 复制能力的 80%
  
正确认知:
  - copy-mode 是 tmux 学习曲线的核心,扛过去就值
  - 一天用熟,一周内化
  - 不学的代价:每次想看上一屏都得 detach + scrollback,反人类
```

### 11.4 一个 session 塞所有事

```
错的:
  打开 tmux 之后再也不开新 session
  所有 window 全在 "0" 这个默认 session 里
  
错在哪:
  - session 是"件事的容器",一个 session 塞 5 件事 = 5 件事互相干扰
  - 一件事的 vim 崩了,所有 session 里其它的 window 跟着重排
  - 想关一件事,只能 kill window 一个个杀
  - prefix + s 切 session 体验完全用不上
  
正确认知:
  - 一件事一个 session,session 是"工作流颗粒度"
  - prefix + s / tmux ls / tmux attach -t X 之间的切换才是 tmux 的常态
```

### 11.5 抄一长串 .tmux.conf 不知道一半干嘛

```
错的:
  GitHub 搜 "tmux config",找 star 多的,直接 cp 到自己的 ~/.tmux.conf
  200 行配置,自己看不懂一半
  
错在哪:
  - 别人的配置匹配别人的工作流,不匹配你
  - 你不知道哪一行干啥,出问题改不动
  - 200 行里 80% 你这辈子不会用(tmux-yank-buffer / tmux-fingers / ...)
  - 启动慢、维护痛、上手累
  
正确认知:
  - 17 篇会给一份 40-60 行的生产级配置,每行说清楚作用
  - 抄要抄到"我能解释每一行",抄不动的删
  - 工作 1 个月以上之后再看要不要加复杂配置
```

---

## 十二、看完这一篇你应该能

- **在白板上画出 tmux 的 server / client 架构图**,讲清楚为什么 ssh 断了 server 不死
- **区分 session / window / pane 三层抽象**,讲清楚什么时候新建 session、什么时候新建 window、什么时候新建 pane
- **解释 prefix key 的设计动机**——为什么必须双键,为什么大家都改 Ctrl-A
- **讲出 copy-mode 是什么、为什么必须学 hjkl + v + y**,以及不学的代价是"鼠标滚屏在 mouse on 下也不能复制到系统剪贴板"
- **用一句话说清楚 detach / attach 的工程意义**:工作流和客户端解耦,断网 / 关窗 / 合盖不影响远端长任务
- **判断 tmux vs screen vs Zellij 该选哪个**——默认 tmux,应急 screen,潜力 Zellij(18 篇细讲)
- **避开 5 个常见错误**:把 tmux 当窗口管理 / 鼠标 + iTerm 多 tab 替代 / 不学 copy-mode 只用鼠标 / 一个 session 塞所有事 / 抄一长串 .tmux.conf

如果上面这 7 条你都能做到,**这一篇的心智图就建立了**。

---

## 十三、下一篇预告

这一篇讲了 **tmux 是什么(心智)**——server / client 架构 / 三层抽象 / prefix / copy-mode。**心智建好了,下一篇 17 讲"工程化配置"**——把心智落到 `.tmux.conf` 文件里:

```
17 篇:tmux 工作流配置
  - 一份 50 行的生产级 .tmux.conf,每行说清作用
  - prefix 改 Ctrl-A,base-index 改 1,history 改 100000
  - copy-mode 改 vi 模式 + 通系统剪贴板
  - 分屏 | / -,pane 跳 hjkl,继承 cwd
  - TPM 插件管理 + tmux-resurrect / tmux-continuum 持久化
  - 状态栏定制(极简风 / 加 cpu mem)
  - tmuxinator / tmuxp / smug 一键起 session
  - fzf + tmux 联动
  - 远端 + 本地嵌套工作流
```

读完 17 篇,你能在一台干净的新机器上 **30 分钟内**:

```
□ tmux 装好,prefix 改 Ctrl-A
□ .tmux.conf 50 行到位
□ TPM 装上,关键插件就绪
□ copy-mode 通系统剪贴板
□ tmux-resurrect 自动保存 / 恢复
□ tmuxinator 一行命令起 work session(3 窗格,自动 cd)
```

这两篇是这套系列的**生产力护城河**——内化之后,你的"工作流"才真正脱离 IDE 和客户端,变成一套**跨机器、跨时间、跨网络**的工程能力。**从下一篇开始动手**。

---

**附录:这一篇命令速查**

```bash
# Session
tmux new -s work                  # 新建 session
tmux ls                           # 列所有 session
tmux attach -t work               # attach
tmux kill-session -t work         # 杀 session
tmux kill-server                  # 全杀(慎用)
prefix + d                        # detach
prefix + s                        # 选 session
prefix + $                        # 改 session 名
prefix + (  /  )                  # 上/下 session

# Window
prefix + c                        # 新建 window
prefix + n / p                    # 下/上 window
prefix + 1 ... 9                  # 跳到第 N
prefix + ,                        # 改 window 名
prefix + &                        # 杀 window
prefix + w                        # 选 window

# Pane
prefix + |                        # 垂直分(自定义)
prefix + -                        # 水平分(自定义)
prefix + h/j/k/l                  # 跳 pane(自定义)
prefix + z                        # zoom
prefix + x                        # 杀 pane
prefix + q                        # 显示编号
prefix + Space                    # 切 layout

# copy-mode
prefix + [                        # 进入
prefix + ]                        # 粘贴
hjkl / 方向键                     # 移动
/  + word                         # 向下搜
v                                 # 选(vi)
y                                 # 复制(到 tmux buffer)
q  / esc                          # 退出

# 调试 / 一些有用的
tmux list-keys                    # 看所有 keybinding
prefix + ?                        # 看所有 keybinding (交互)
tmux source ~/.tmux.conf          # 重新加载配置
prefix + :                        # 进命令模式
```
