# bash / zsh / fish 选型:别问哪个最强,问哪个该哪里用

刚开始认真折腾终端的工程师,**100% 都会问同一个问题**:**"我应该用 zsh 还是 fish?"** 在 HN、知乎、推上每周都有人问,得到的标准答案永远是「看个人喜好」「装 oh-my-zsh 就完事」「fish 更现代」——**这些答案全部是错的**,准确说,**它们回答的不是工程问题,是审美问题**。三个 shell 不是同一道选择题里的三个选项,**它们解决的是不同维度的问题**:bash 是「**脚本和兼容性的最大公约数**」,zsh 是「**POSIX 兼容前提下能玩花活的交互 shell**」,fish 是「**敢扔掉 POSIX 包袱的开箱即用 shell**」。**你不是在它们之间三选一,你是在「写脚本用哪个」「日常用哪个」两件事上各做选择**。

> 一句话先记住:**用 fish 当日常,用 zsh 当 fish 学不动时的 fallback,用 bash 写所有「要给别人跑、要进 CI、要进 Docker」的脚本——三个 shell 各管一段,别试图统一**。反过来也成立:**zsh 是稳妥的个人首选,bash 是脚本的唯一答案,fish 是给不爱写脚本的人**。看完这一篇你应该不再纠结「我换 fish 了原来的 bash 脚本怎么办」——**根本不冲突,shebang 决定脚本由谁解释,SHELL 决定终端由谁解释,两件事不交叉**。

---

## 一、为什么这道题被问错了

### 1.1 「shell」要拆成两件事

新手版本的问题:

```
Q1:我该用 zsh 还是 fish?
Q2:bash 太老了对吧,直接上 fish?
Q3:Mac 装了 zsh 是不是就够了,fish 还有必要吗?
Q4:大家都说 fish 好用,但我看脚本都是 bash,我怎么办?
```

**这 4 个问题共享同一个错误前提**:**「shell」是一个东西**。事实是 shell 至少要拆成两件不同的事:

```
角色 A:交互式 shell(interactive shell)
   你坐在终端前敲命令、看 prompt、按 Tab 补全、按 ↑ 翻历史
   核心指标:补全、提示符、语法高亮、历史搜索、易用性

角色 B:脚本解释器(script interpreter)
   你写 deploy.sh 给 CI 跑、写 Dockerfile 里的 RUN、
   写 systemd 的 ExecStart、写 cron 任务
   核心指标:兼容性、可移植性、POSIX 标准、可预测性
```

**这两件事的 KPI 直接冲突**——交互要的是「敢加新语法、敢破坏兼容」(fish 思路),脚本要的是「别动祖宗规矩、给 Alpine 也得跑」(bash 思路)。**zsh 卡在中间**:它是 bash 的超集 + 大量交互改进,牺牲了一点 POSIX 严谨度换交互体验,但没 fish 那么激进。

### 1.2 「三选一」的错误结论

```
错误 1:全部用 fish
  → ./deploy.sh 写成 fish 语法
  → 同事 git clone 下来跑炸了:他没装 fish
  → CI 镜像里没装 fish,流水线挂了
  → Dockerfile 里 RUN 用 fish 语法,镜像构建失败

错误 2:全部用 bash 当日常
  → 补全要手动装 bash-completion 包
  → 没有语法高亮,敲错命令到回车才知道
  → 历史搜索只有 Ctrl-R 单行,翻半天找不到

错误 3:fish 当日常 + 用 fish 写脚本
  → 个人脚本(自己机器跑)没问题
  → 一旦要分享出去就翻车
```

**正确的拆解**:

```
交互 shell      用什么由 SHELL 环境变量 / chsh 决定
                  「你坐下来用什么」
                  
脚本由谁解释    由文件第一行 #!/usr/bin/env bash 决定  
                  「这个文件给谁解释」
                  
两件事完全独立,不冲突
```

理解这一层,后面所有讨论才有意义。

---

## 二、三个 shell 的历史(短)

```
1979  Bourne shell (sh)        Stephen Bourne @ Bell Labs
                                Unix 标配,后来 POSIX 标准的祖宗

1989  bash                     Brian Fox @ GNU/FSF
                                Bourne-Again Shell,GNU 重写 sh
                                兼容 POSIX,加了 history / 补全雏形
                                → Linux 几乎所有发行版默认

1990  zsh                      Paul Falstad @ Princeton
                                参考 csh / tcsh / ksh / bash
                                目标:兼容 bash + 更强补全 + 更骚 globbing
                                → 2003 Mac OS X 起内置
                                → 2019 macOS Catalina 起默认登录 shell

2005  fish                     Axel Liljencrantz
                                friendly interactive shell
                                明确放弃 POSIX,自己一套语法
                                → 2024 fish 4.0 全 Rust 重写
```

时间线 ASCII:

```
1979 ─── sh ──────────────────────────────────────────────────
1989 ───────── bash ──────────────────────────────────────────
1990 ─────────── zsh ─────────────────────────────────────────
2005 ───────────────────── fish ──────────────────────────────
                                          ┌──── macOS 默认 ────┐
                                          │   bash 3.2 (2007)  │
                                          │   ↓ 2019 切 zsh    │
                                          └────────────────────┘
```

**三个关键节点**:

1. **2007 年 bash 4.0 出来**:Apple 因 GPLv3 拒绝升级,macOS 系统 bash 永远停在 3.2.57——**你 Mac 上的 /bin/bash 是 19 年前的版本**
2. **2019 年 macOS Catalina 切默认 zsh**:Apple 终于受不了 bash 3.2 的烂,换 zsh(MIT-ish 协议,Apple 可装新版)
3. **2024 年 fish 4.0 用 Rust 重写**:启动更快、内存更省,跟 nushell 抢「下一代 shell」位置

---

## 三、核心对比表

```
维度              bash            zsh             fish
─────────────────────────────────────────────────────────────
POSIX 兼容        ★★★★★         ★★★★☆          ★(不兼容)
补全开箱          ★               ★★(要框架)     ★★★★★
补全质量          ★★              ★★★★★          ★★★★(自动)
语法直观度        ★★              ★★★             ★★★★★
启动速度          ★★★★★         ★★★             ★★★★
配置生态(框架)   ★★              ★★★★★          ★★(够用)
脚本可移植性      ★★★★★         ★★★★            ★(基本不可)
学习成本          ★★(POSIX 难)   ★★(兼 POSIX)    ★★★(新语法)
异步 prompt       ❌              ✅              ✅(默认)
内置语法高亮      ❌              ❌(要装插件)    ✅
内置自动建议      ❌              ❌(要装插件)    ✅
─────────────────────────────────────────────────────────────
默认在哪儿        Linux / WSL     macOS / Kali    没默认,得装
镜像里有没有      绝大多数都有    几乎没有         几乎没有
```

读法:

- **bash 强在「无处不在」+「脚本可移植」**——强项不是交互,是脚本和兼容
- **zsh 强在「兼容 bash 还能玩花活」**——交互体验上限高,但要配置
- **fish 强在「开箱即用」+「补全和高亮内置」**——但脚本完全不能移植

**没有哪个 shell 全面胜出**——任何一个都在某维度被另两个甩开。

---

## 四、5 个场景的代码对照

抽象对比不够,直接看同一件事在三个 shell 怎么写。

### 4.1 场景 1:补全

```bash
# bash:默认啥都没有
brew install bash-completion
# .bashrc 里加:
[[ -r "/opt/homebrew/etc/profile.d/bash_completion.sh" ]] && \
  . "/opt/homebrew/etc/profile.d/bash_completion.sh"
# 只给「常见命令」补全,你自己写的 CLI 没补全
```

```bash
# zsh:自带 compinit 框架,但要手动启用
autoload -Uz compinit
compinit
# 只对「装了 _commandname 补全文件的命令」有补全
# brew install zsh-completions 一批,或 oh-my-zsh / zinit 一键开
```

```fish
# fish:什么都不用做,启动就有:
# - 从 man page 自动解析所有命令的 flag 生成补全
# - 从历史命令推断参数偏好
# - 文件名 / 目录名 fuzzy 匹配
# - 按 Tab 弹菜单,按 → 接受灰色建议
# 装一个新 CLI,fish 立刻能补全 --help 列出的 flag
```

**结论**:补全这件事 fish 几乎不需要工程师介入。zsh 上限高但要配置,bash 是「装个 completion 包凑合用」。

### 4.2 场景 2:变量与数组

```bash
# bash
name="Alice"
echo "Hello, $name"
arr=(apple banana cherry)
echo "${arr[1]}"       # banana(bash 0-indexed)
echo "${#arr[@]}"      # 长度
declare -A m           # 关联数组(bash 4+,Mac 系统 bash 没有)
m[foo]=1
```

```bash
# zsh
name="Alice"
arr=(apple banana cherry)
echo $arr[1]           # apple(zsh 1-indexed,跟 bash 反过来)
echo $#arr             # 长度
typeset -A m           # 关联数组
m[foo]=1
# 可 setopt KSH_ARRAYS 切到 0-indexed —— 这种「兼容开关」就是 zsh 的味道
```

```fish
# fish:语法完全不同
set name "Alice"
echo "Hello, $name"
set arr apple banana cherry
echo $arr[1]           # apple(fish 1-indexed)
echo (count $arr)      # 长度
# fish 没有关联数组(直到 4.0 引入有限支持)
```

**关键差异**:

```
变量赋值
  bash/zsh:  name=value      ← 中间不能有空格,经典翻车点
  fish:      set name value  ← 函数式,更清晰

数组下标
  bash:      0-indexed
  zsh:       1-indexed(可切)
  fish:      1-indexed

关联数组
  bash 4+:   ✅                bash 3.2(Mac):❌
  zsh:       ✅
  fish:      4.0 之前没有
```

**这就是为什么 fish 写交互很爽,但脚本完全不能给别人跑**——一个 `set name value` vs `name=value`,所有 bash 脚本搬过来都得改。

### 4.3 场景 3:历史命令搜索

```bash
# bash:Ctrl-R 反向搜索,只能单行匹配
# (reverse-i-search)`gi': git status
# 搜下一个匹配:再按 Ctrl-R
# 体验:勉强能用,跟 2005 年一样
```

```bash
# zsh:Ctrl-R 同 bash,但可装 history-substring-search:
zinit light zsh-users/zsh-history-substring-search
bindkey '^[[A' history-substring-search-up    # ↑ 按前缀过滤
bindkey '^[[B' history-substring-search-down
# 加完后:敲 git 按 ↑,只翻 git 开头的历史
```

```fish
# fish:默认就这样:
# 敲 git 按 ↑ → 自动按前缀过滤
# 边敲边看到灰色「自动建议」就是上次最近的匹配
# → 接受建议,Ctrl-F 接受一个 word
# 不需要任何配置
```

**这就是 fish 的核心卖点**——很多 zsh 用户花一晚上装插件才达到的体验,fish 是默认。

### 4.4 场景 4:提示符(prompt)

```bash
# bash:PS1 是个魔法字符串,转义符晦涩
export PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
# \u 用户,\h 主机,\w cwd,\$ 提示符
# \[ \033[01;32m \] 是 ANSI 颜色,要包在 \[ \] 里避免计算长度出错
```

```bash
# zsh:PROMPT 变量,转义符更人话
export PROMPT='%F{green}%n@%m%f:%F{blue}%~%f$ '
# %n 用户,%m 主机,%~ cwd,%F{color}...%f 颜色,不用包 \[ \]
```

```fish
# fish:用函数,不是字符串
function fish_prompt
    set_color green
    echo -n (whoami)@(hostname)
    set_color blue
    echo -n ':'(prompt_pwd)
    set_color normal
    echo -n '$ '
end
```

**现代做法**:三个 shell 都用 Starship 或类似的「shell 无关 prompt 工具」——07 篇专讲。

### 4.5 场景 5:语法高亮

```bash
# bash:没有内置
# 你敲 gits status 之前不会有提示,Enter 之后才告诉你 command not found
```

```bash
# zsh:装 zsh-syntax-highlighting
zinit light zsh-users/zsh-syntax-highlighting
# 装完后:命令存在绿色 / 不存在红色 / 引号不闭合红色
```

```fish
# fish:什么都不用装
# 命令存在蓝色 / 不存在红色 / 选项青色 / 字符串黄色
# 边敲边高亮,真错了一眼看出
```

**fish 默认就把 zsh 装一晚上插件才能拼出来的体验给你了**。代价 — 它不兼容 POSIX,脚本不能跨平台。

---

## 五、POSIX 兼容这件事到底重要在哪

这一节是这一篇的核心。

### 5.1 /bin/sh 是什么

```
/bin/sh 是符号链接,指向某个「实现 POSIX shell 标准」的程序

不同系统的 /bin/sh 指向:
   Ubuntu / Debian:  → dash      (轻量,严格 POSIX)
   Alpine / busybox: → ash        (busybox 的 sh,最小化)
   macOS:            → bash       (但以 sh 兼容模式运行)
   RHEL / CentOS:    → bash       (sh 兼容模式)

所以 #!/bin/sh 不等于「跑 bash」
也不等于「跑 dash」
而是「跑这台机器上的 POSIX shell」
```

**这一点是无数脚本 bug 的根源**。你在 Mac 上用 `/bin/sh` 调试通过,部署到 Alpine 容器里炸了——**因为 Mac 上 sh 是 bash 兼容模式,Alpine 上 sh 是 busybox ash**。

### 5.2 bashism

bashism = 「bash 有但 POSIX sh 没有」的语法。常见的:

```bash
# bashism 1: 双方括号(zsh 也支持)
[[ -f file && $x = "y" ]]    # bash/zsh 行,sh 不行
[ -f file ] && [ "$x" = "y" ] # POSIX 写法

# bashism 2: here-string
grep foo <<< "$content"      # bash/zsh 行,sh 不行
echo "$content" | grep foo   # POSIX 写法

# bashism 3: process substitution
diff <(ls a) <(ls b)         # bash/zsh 行,sh 不行

# bashism 4: 数组
arr=(a b c)                  # POSIX sh 没有数组

# bashism 5: function 关键字
function foo() { echo hi; }  # POSIX 不让用 function 关键字
foo() { echo hi; }           # POSIX 写法

# bashism 6: ${var,,}(转小写)
echo "${VAR,,}"              # bash 4+
echo "$VAR" | tr '[:upper:]' '[:lower:]'  # POSIX
```

**反例 + 修正**:

```bash
# 反例:写了 #!/bin/sh 但用了 bashism
#!/bin/sh
files=( a.txt b.txt c.txt )         # ← 数组,POSIX 没有
for f in "${files[@]}"; do
    [[ -f $f ]] && cat <<< "$f"     # ← [[ ]] 和 <<<,都是 bashism
done

# 在 macOS 上跑:OK(sh 是 bash 兼容模式)
# 在 Alpine 里跑:syntax error: unexpected "("
```

修复路径 1(改 shebang):

```bash
#!/usr/bin/env bash
# ↑ 显式声明用 bash,bashism 都合法
```

修复路径 2(改语法):

```bash
#!/bin/sh
files="a.txt b.txt c.txt"           # 空格分隔字符串
for f in $files; do                 # POSIX 词分割
    [ -f "$f" ] && echo "$f"
done
```

**两条路径的取舍**:

```
显式用 bash      → 容器要装 bash(scratch / distroless 没有)
                 → 镜像变大几 MB
                 → 但脚本写起来更顺手

严格走 POSIX     → 任何 sh 都能跑(包括 Alpine ash / dash)
                 → 镜像不需要额外包
                 → 但写起来痛苦,数组都没有
```

**实战经验**:

```
1. 个人 / 团队脚本     → #!/usr/bin/env bash + set -euo pipefail
2. Debian 系镜像入口   → bash 自带,用 bash
3. Alpine / distroless → 严格 POSIX,或 RUN apk add bash
4. 嵌入式 / 救援系统   → 严格 POSIX
5. 给别人当 lib 的脚本 → 严格 POSIX
```

### 5.3 fish 在这里的位置

**fish 根本不兼容 POSIX**——语法是另一套。

```fish
# fish 的 if
if test (count $argv) -gt 0
    echo "Has args"
end

# 对比 bash
if [ $# -gt 0 ]; then
    echo "Has args"
fi
```

**fish 团队明确说**:「我们不打算兼容 POSIX,POSIX 是历史包袱」。这是一个工程立场,也是 fish 杀手锏(默认更现代)和阿喀琉斯之踵(脚本生态归零)的同一个根因。

```
fish 脚本    几乎只能给「你自己机器」跑
fish 函数    定义在 ~/.config/fish/functions/*.fish,自动加载
fish 不能    放在 #!/usr/bin/env fish 然后让 CI 跑
            (除非 CI 镜像里装 fish,通常没人这么干)
```

---

## 六、shebang 选择决策表

```
shebang                       适用场景              不适用场景
─────────────────────────────────────────────────────────────
#!/bin/sh                     最大兼容               需要数组 / [[ ]]
                              Alpine / busybox       需要 process sub
                              救援 / 嵌入式系统       
                              
#!/bin/bash                   假设系统 bash 在        macOS bash 3.2
                              /bin/bash              (Apple 永不升)
                              Linux 服务器           
                              
#!/usr/bin/env bash           最常见的现代做法        scratch 镜像
                              找 PATH 里的 bash       (没 env / 没 bash)
                              macOS brew bash 也找到 
                              
#!/usr/bin/env zsh            个人脚本可以            别人机器可能没装
                              用 zsh 特性             给团队用别选这个
                              
#!/usr/bin/env fish           几乎只在自己机器        给同事就翻车
                              玩具 / 个人快脚本       任何要分享的场景
```

**实战推荐**:

```bash
# 团队脚本 / CI / 部署脚本     默认这样开头:
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Alpine / scratch / busybox    默认这样:
#!/bin/sh
set -eu     # POSIX sh 不支持 -o pipefail,要小心

# 个人 ~/bin 下的小工具         可以任性:
#!/usr/bin/env fish             # 反正自己机器
```

**27 篇会专讲 set -euo pipefail / shellcheck / shfmt 这套工程化武器**——这一节先记住 shebang 这个选择本身。

---

## 七、启动速度对比(实测)

这一节给的是 2024-2025 在 M2 Mac 上实测的数字,你自己机器跑出来量级一致。

### 7.1 裸 shell 启动(无任何配置)

```bash
# 测裸启动:--noprofile / --norc 跳过任何配置文件
hyperfine --warmup 3 \
  'bash --noprofile --norc -c "exit"' \
  'zsh -f -c "exit"' \
  'fish --no-config -c "exit"'

# 典型结果:
# bash --noprofile --norc -c "exit"   3.2 ms ± 0.4 ms
# zsh -f -c "exit"                   10.8 ms ± 0.8 ms
# fish --no-config -c "exit"         18.5 ms ± 1.1 ms
#
# bash 比 zsh 快 3 倍,比 fish 快 6 倍
```

**裸启动时,bash 远快于 zsh / fish**。原因:bash 二进制小、初始化少;zsh 默认装一堆 module;fish 启动要做更多(check terminal、解析 universal vars)。

### 7.2 带配置的启动(真实使用)

**实测一些典型组合的启动时间**:

```
配置                                启动时间(ms)
───────────────────────────────────────────────
bash + 简单 .bashrc                    5-10
bash + bash-completion 全开            30-50
                                       
zsh 裸 + .zshrc 简单 prompt           15-30
zsh + oh-my-zsh + 默认主题            250-400  ← 「卡顿可感」
zsh + oh-my-zsh + p10k 默认           350-600
zsh + zinit lazy + p10k 异步           40-80   ← 「秒开」
zsh + Starship                         50-100
                                       
fish 默认 + 简单 abbr                  30-50
fish + tide(异步 prompt)              40-70
fish + Starship                        50-100
```

**几个关键现象**:

```
1. 「oh-my-zsh 全家桶」启动 300ms+
   → 普遍但严重的问题,06 篇专讲怎么破

2. zinit lazy 能把 zsh 拉回 50ms 内
   → 等价于「装了一堆插件但启动时不加载,用到再加载」

3. fish 默认快于 oh-my-zsh 默认
   → fish 的设计选择把「该装的都内置了」
     不用堆插件就达到 oh-my-zsh 的体验

4. Starship 在三个 shell 上差不多
   → Starship 是异步的,主要开销是它自己的二进制启动
```

### 7.3 启动 100ms 慢一点为什么有感

**单次开 shell 100ms 你感觉不到**,但叠加起来:

```
场景 1:tmux 10 个 pane                  10 * 0.3s = 3s
   → 笔记本盖子打开 attach tmux 到 last session
   → 看着 10 个 prompt 一个一个出来,有「电脑卡了」错觉

场景 2:VS Code 内置终端开新 tab         每次 0.3-0.6s
   → 一天开 30 次,白白耗 10-20s

场景 3:CI 里 bash -c "..." 调 100 次    100 * 0.3s = 30s
   → 浪费的 build 时间是真金白银
   → CI 一般用 bash,问题反而小一点

场景 4:tmux popup / lazygit shell out   每次 0.3s
   → 频繁操作时一卡一卡,体验直接崩
```

**所以 06 篇会展开**:zsh 不调优 vs 调优的差距是 5-10 倍,这是「你愿不愿意花一小时」的问题。

---

## 八、macOS 上的特殊情况

macOS 是工程师最大的一个客户群,值得单独一节。

### 8.1 系统 bash 永远是 3.2

```bash
$ /bin/bash --version
GNU bash, version 3.2.57(1)-release (arm64-apple-darwin23)
Copyright (C) 2007 Free Software Foundation, Inc.
                  ↑ 2007 年
```

**为什么 Apple 不升级**:bash 4.0(2009)起切到 GPLv3,GPLv3 比 GPLv2 多了「专利授权 + 反 Tivo 化」条款,Apple 法务认为这些条款跟 Apple 商业模式冲突。所以系统 bash 永远锁在 3.2.57。

**影响**:没有关联数组(`declare -A`)、没有 `${var,,}`、没有 `mapfile` / `readarray`、`printf -v` 有 bug、大量「现代 bash 习惯」不能用。

**Mac 工程师的两种做法**:

```bash
# 做法 1:用 brew 装新 bash,但不替换系统 bash
brew install bash
which -a bash
# /opt/homebrew/bin/bash   ← brew 装的,bash 5.x
# /bin/bash                ← 系统,3.2
# 脚本用 #!/usr/bin/env bash,会找到 brew 的
# 系统脚本继续用 /bin/bash,不受影响

# 做法 2:把 brew bash 加进 /etc/shells,然后 chsh
echo /opt/homebrew/bin/bash | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/bash
# 大部分人不这么干 —— 装新 bash 是为了写脚本,
# 登录 shell 一般直接上 zsh / fish
```

### 8.2 Catalina 起默认 zsh

macOS Catalina(2019)起新用户默认 zsh,Apple 装的是 5.x 挺新,大部分人直接用系统 zsh,不再 brew install zsh。

### 8.3 fish 在 macOS

```bash
brew install fish
echo /opt/homebrew/bin/fish | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/fish
```

注意:macOS 上有些工具(`nvm`、某些 brew formula hook)假设你在 bash / zsh,装 fish 可能要额外配置。06-08 篇会讲怎么解决。

---

## 九、混合用法(本系列推荐)

### 9.1 文件分布

```
~/.zshrc                    # 日常交互 shell 是 zsh
                            # PATH / alias / prompt / 补全等
~/.bashrc                   # 即使日常用 zsh,bash 也留一份
~/.bash_profile             # 偶尔用 bash -l 跑脚本时仍正常

~/Projects/repo1/scripts/   # 项目脚本一律 #!/usr/bin/env bash
   deploy.sh
   build.sh
   
~/.local/bin/               # 你自己的 ad-hoc 小工具
   gitsync       # #!/usr/bin/env bash

fish 用户额外:
~/.config/fish/
   config.fish              # 配置文件
   functions/               # 函数(类似 zsh 的 autoload)
      fish_prompt.fish
   conf.d/                  # 启动时 source 的片段
```

**核心原则**:

```
SHELL 环境变量            决定「你登录时用的是什么」
shebang                   决定「这个脚本由谁解释」
       
两者完全独立。
你可以日常 fish,但所有脚本都跑 bash。
不冲突。
```

### 9.2 切换 shell 的命令

```bash
echo $SHELL                  # 登录默认 shell
ps -p $$                     # 当前实际在跑哪个 shell

chsh -s /bin/zsh             # 改默认 shell
chsh -s /opt/homebrew/bin/fish

fish                         # 临时进 fish(不改默认),exit 退出
```

### 9.3 「我已经在用 zsh,要不要切 fish」

```
不要为了切而切。
   
切 fish 的理由(有 1 条对你就值得试):
   ✓ 你被 zsh 启动慢困扰,试过调优但放弃了
   ✓ 你不想再花一晚上配补全 / 高亮 / 历史
   ✓ 你不写大量 shell 脚本
   ✓ 你被 zsh 配置的复杂度劝退过
   
留在 zsh 的理由:
   ✓ 你已经熟悉 zsh,切换有成本
   ✓ 你需要 bash 兼容(zsh 大部分 bash 脚本能直接跑)
   ✓ 你想在多平台用同一套 shell
       服务器一般装 bash / zsh,fish 要单独装
   ✓ 你的 dotfiles 已经投资在 zsh 上
```

**两个都好,不要在这个问题上花一整个周末**。

---

## 十、真实选型决策树

```
你写大量 shell 脚本(devops / CI / 部署脚本)?
  → 是:bash 必须熟,脚本一律 #!/usr/bin/env bash
        交互可以叠 zsh / fish
  → 否:可以 fish 当日常

你需要丰富补全 + 提示符自定义?
  → 是:zsh + zinit / fish 二选一
  → 否:bash 也够

你要在多 OS 间无缝迁移?
  → 是:zsh(macOS / Linux 都好)
  → Windows-heavy:WSL + bash 优先(脚本统一)

你做 SRE / DevOps / 经常进容器?
  → bash 必须熟,zsh 当个人 shell
```

### 10.1 角色对照

```
角色                  日常交互     脚本默认    说明
─────────────────────────────────────────────────────────────
应用开发(Web/App)    zsh / fish   bash       脚本不多,日常爽就好
DevOps / SRE         zsh         bash       脚本一天好几个,bash 熟透
平台工程              zsh         bash       同上,CI 镜像要熟
数据工程              zsh         bash       主力是 Python/SQL
AI / Agent 工程师     fish 或 zsh  bash       灵活,看个人
学生 / 新人(不写)    fish        bash       fish 上手最快
工程总监 / 架构师      zsh         bash       少自己跑命令,稳定就好
服务器运维 / 嵌入式    bash        sh (POSIX) 经常只装 bash
```

---

## 十一、给「我不会写 shell 脚本」的人

这一类读者占很大一部分,值得单独讲。

```
你的画像:
  - 写应用代码为主(Java/Python/JS/Go),不写 deploy.sh
  - 看见同事写的 set -euo pipefail 你会愣 1 秒
  - 你的「shell 使用」= cd / ls / git / npm / kubectl
  - 你想要「命令好用、补全好用、不卡」就够了
```

**推荐路径**:

```
第一年:     fish 当日常,bash 偶尔接触
            ↓
            fish 的开箱即用让你「shell 不再是负担」
            把精力花在你的本业(写应用)
            
第二年:     发现要写脚本了(自动化某个流程)
            ↓
            学一点 bash(写脚本,不写 fish)
            shebang 用 #!/usr/bin/env bash
            交互照样 fish
            
第三年:     如果已经写很多脚本,可以考虑切 zsh
            ↓
            交互和脚本语法接近,不再两套语法
            (但其实留在 fish 也行)
```

**不推荐新人入门直接学 zsh**:zsh 是「兼容 POSIX 又有自己扩展」的奇怪定位,新人会迷糊「这个语法是 bash 还是 zsh」,迷糊到一定程度后开始抵触 shell。fish 反而清爽:语法是自己一套,见到 fish 语法就知道「这是 fish」。

---

## 十二、反对的写法

### 12.1 反对:「全部 fish 化」

```
错误:    把 ~/Projects/scripts/deploy.sh 第一行改成 #!/usr/bin/env fish
         然后说「fish 比 bash 好读」
         
后果:    
   - CI 镜像没装 fish,流水线 fail
   - Dockerfile 里 RUN ... fish 语法,build fail
   - 同事 clone 下来,他没装 fish,跑炸了
   - 一年后维护的人看不懂 fish,骂你
   
正确:    
   - fish 当日常没问题
   - 脚本永远 #!/usr/bin/env bash
   - SHELL 和 shebang 是两件事
```

### 12.2 反对:「oh-my-zsh 全家桶」

```
错误:    装 oh-my-zsh,把推荐的 50 个插件全开
         主题用 p10k 默认,加 git/k8s/aws/docker/time/battery 一堆段
         
后果:
   - 启动 300-600ms,tmux 10 个 pane 卡爆
   - 90% 插件你根本不用
   - 配置文件几千行,维护变成负担
   - 升级 oh-my-zsh 还可能破坏自定义
   
正确:
   - zsh + zinit + 5-10 个真在用的插件(lazy load)
   - 或者 zsh + Starship + 完全不装框架
   - 06 篇专门讲怎么做
```

### 12.3 反对:「用 bash 当 zsh」

```
错误:    把 zsh 的主题 / 插件 / 补全 copy 到 bash 里
         以为 bash 是 zsh 的弱化版
         
事实:    bash 不是 zsh 的弱化版,语法语义有差异
         bash 没有 zsh 的 hook、vcs_info、zle 编辑器
         硬移植出来的体验半残废
         
正确:    要 zsh 体验就直接装 zsh,bash 留给脚本
```

### 12.4 反对:「shell 选型是宗教」

```
错误:    在 HN / 推 / 知乎上参与「fish 党 vs zsh 党」式口水战
         以为自己用的 shell 是「最优解」
         
事实:    三个 shell 各有定位,没有「最优」
         vim vs emacs / tabs vs spaces 式争论浪费时间
         
正确:    选适合你的场景,然后闭嘴干活
         别人选不一样的,大概率他的场景不一样
```

### 12.5 反对:「不学 bash」

```
错误:    「我用 fish,不用学 bash」
         
事实:    你迟早要写 deploy.sh、Dockerfile RUN、CI workflow
         你迟早要看别人的 bash 脚本
         你迟早要在没有 fish 的服务器 / 容器里干活
         
正确:    交互可以 fish,但 bash 语法必须懂
         至少能读、能改简单脚本
         27 篇会讲脚本工程化最低门槛
```

---

## 十三、看完这一篇,你应该能

1. **拒绝「我该用 zsh 还是 fish?」这道题**——它问错了,正确拆解是「交互 shell 用什么 + 脚本由谁解释」
2. **解释为什么 bash 不能丢**——脚本可移植性、CI/Docker/容器、POSIX 标准、shebang 选择
3. **解释 POSIX 兼容这件事重要在哪**——`/bin/sh` 在不同系统指向不同实现,bashism 会在 Alpine 上炸
4. **看到 `#!/usr/bin/env bash` 和 `#!/bin/sh` 知道差别**——前者用 PATH 里的 bash(可能 brew 装的),后者用系统 POSIX sh
5. **理解启动速度的工程意义**——oh-my-zsh 默认 300ms vs zinit lazy 50ms,tmux 10 pane 直接卡 3 秒
6. **给团队新人推荐 shell 不再瞎给**——写脚本多的给 zsh + bash,不写脚本的给 fish + bash,统一是错的

**一个硬指标**:看完这篇,你应该能在 30 秒内回答下面这个问题:

```
「我刚换了新 Mac,装哪个 shell?」

→ 默认 zsh 已经在,先用着
→ brew install bash 装个新 bash(脚本能用 4+ 特性)
→ 如果你不写大量脚本 + 不爱配置,brew install fish 切过去
→ 不要装 oh-my-zsh —— 06 篇有更好的方案
→ Starship 跨 shell 通用,先不急装,07 篇细讲
```

回答得出来这套,这篇就值了。

---

## 十四、下一篇预告

下一篇:**`06-zsh工程化配置.md`**

讲完「为什么选 zsh」之后,下一篇就讲**「选了 zsh 怎么配才不蠢」**:

- zsh 的 5 类配置文件:`.zshenv` / `.zprofile` / `.zshrc` / `.zlogin` / `.zlogout`,**90% 人写错**
- 框架对比:**oh-my-zsh / prezto / zinit / 不用框架**,什么场景选哪个
- 启动调优:zprof / 异步加载 / lazy load,从 600ms 降到 50ms 的工程路径
- 补全系统(compsys)心智:`autoload -Uz compinit` 后面发生了什么、`_command` 补全文件长什么样
- 不用框架的「最小可跑 .zshrc」——20 行包括 prompt、补全、历史、键位
- 反对:把 .zshrc 写到 3000 行的人是把它当 dotfile 博物馆,不是工程文件

读完 06,你能在新机器上 10 分钟把 zsh 配到「**和你现在用的一样快、一样好用,但启动 50ms 内**」。**这是 fish 一年试图劝你切过去的核心理由——配置的成本——一旦摆平,zsh 的上限是 fish 比不了的(因为 zsh 有 25 年的生态沉淀)**。

但如果你看完 06 觉得「这套调优我不想搞」——**那 fish 确实更适合你**,这没什么丢人的。**工具是工具,工具不是身份**。
