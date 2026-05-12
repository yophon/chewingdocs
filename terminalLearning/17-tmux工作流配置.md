# tmux 工作流配置:50 行生产级 .tmux.conf,每行说清作用

打开 GitHub 搜 "dotfiles tmux",随便找一个 star 多的——你会看到一个 **200-400 行的 `.tmux.conf`**:floating 窗口插件、status bar 三段渲染、CPU / 网速 / 天气全塞进去、6 个主题切换、定制了 30 个 keybinding。**这就是新人最常见的"配置债"陷阱**:抄完之后,**你能解释里面 10% 的行,剩下 90% 是别人的肌肉记忆寄生在你的机器上**。一旦它启动慢了 / 行为怪了 / 跟新版 tmux 不兼容,**你连删哪几行都不知道**。

**真相是:生产级 .tmux.conf 不需要 200 行,50 行足够**。多出来的部分要么是别人的个人审美(状态栏炫技、主题切换、CPU 监控),要么是为某个特定 dotfiles 仓库写的胶水(配合某个 zsh 主题、某个 nvim 插件、某台机器),**移植到你的机器上要么用不到要么坏掉**。**这一篇拆出一份 50 行的生产级 .tmux.conf,每行说清作用**——你看完,要么直接拿走改两个字段就能用,要么有信心自己写一份只有"你需要的功能"的配置。

> 一句话先记住:**.tmux.conf 的好坏,决定你 tmux 是"装了但很少用"还是"每天 8 小时离不开"**。**默认配置 80% 的人改 5 行就停了——再花 1 小时改到 50 行,体验跟那 80% 拉开 5 倍距离**。这 1 小时主要花在四件事上:**prefix 改 Ctrl-A / copy-mode 改 vi 并通系统剪贴板 / 分屏改 |- 并继承当前目录 / tmux-resurrect 让现场重启自动恢复**。这四件做完,tmux 才从"我装了一个分屏工具"变成"我每天的工作台"。

16 篇讲了 **tmux 的心智**(server / client / session / window / pane / copy-mode),这一篇讲**把心智落到配置文件**:**改成符合现代键位 + 自动化工作流的样子**。读完这一篇,你应该能在一台干净的新机器上**30 分钟内**把生产级 tmux 配置起来。

---

## 一、为什么默认配置必须改

### 1.1 默认 tmux 的反人类点(逐项对照)

```
默认配置                                  改完之后
─────────────────────────────────────────────────────────────────────
prefix = Ctrl-B                          prefix = Ctrl-A
   食指够不到 B 键                          食指自然落 A 键

prefix + " 横切 / prefix + % 竖切         prefix + - 横切 / prefix + | 竖切
   " 和 % 跟方向毫无关系                    - 是水平线 / | 是竖线,直观

新 pane 工作目录是 home (~)               新 pane 继承当前 pane 的 cwd
   你刚 cd 进 project,新 pane 又回 ~       cd 一次,新窗格也在 project

prefix + 方向键 切 pane                   prefix + h j k l 切 pane(vim 风格)
   要离开 home row,慢                       不离开 home row

copy-mode 默认 emacs 键                   copy-mode 改 vi 键
   Ctrl-N / Ctrl-P 移动                    h j k l + v + y

复制只在 tmux buffer 里                    复制直接到系统剪贴板(pbcopy)
   prefix + ] 才能粘                       Cmd-V 直接粘到任意程序

windows base-index = 0                    base-index = 1
   prefix + 1 跳第二个窗口                  prefix + 1 跳第一个(跟键盘对齐)

杀窗口后留洞 (1, 2, 4, 5)                自动重新编号 (1, 2, 3, 4)
   prefix + 3 跳到不存在的窗口              永远连续

history-limit = 2000                       history-limit = 100000
   日志多两屏就没了                          够看一天

escape-time = 500ms                        escape-time = 10ms
   vim 按 Esc 卡 500ms 切模式               几乎瞬间响应

TERM = screen                              tmux-256color + truecolor
   颜色少,vim / Neovim 主题难看            256 色 + RGB,主题正常
```

**这 10 条里**,**前 6 条是"键位 + 行为"必须改**(不改你会愤怒离场),**后 4 条是"环境"必须改**(不改你看不出来但实际很掉体验)。**这 10 行配置,就是 tmux 体验 80/20 的那个 20**。

### 1.2 改配置的"投入产出"

```
投入:
  - 第一次配置:1 小时
  - 后续微调:每月 10 分钟
  - 学习成本:配置文件语法 30 分钟
  
产出:
  - 每天 8 小时 tmux,从"勉强能用"到"流畅"
  - 节省大约每天 10-15 分钟的"工具摩擦"
  - 6 个月 ROI ≈ 100 倍

不投入的代价:
  - 永远停留在"装了 tmux 但每次都觉得别扭"
  - 最终回去用 iTerm 多 tab,失去 detach / attach
```

**这就是为什么 17 篇值得专门写**——它不是"配置教程",是**把心智落地的工程动作**。

---

## 二、基本设置:10 行就改一半体验

把这 10 行先放进 `~/.tmux.conf`:

```bash
# ~/.tmux.conf
# ============================================================
# 一、基本设置(必改)
# ============================================================

# 1. 改 prefix:Ctrl-B → Ctrl-A
unbind C-b
set -g prefix C-a
bind C-a send-prefix             # 双击 Ctrl-A 把 Ctrl-A 真发给程序

# 2. 鼠标支持(滚屏 + 选 pane + 调整 pane 边界)
set -g mouse on

# 3. base-index 从 1 开始(键盘上 1 紧邻 0,但 1 比 0 离 Esc 远)
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on       # 关闭 window 后自动重编号

# 4. 增大滚动历史(默认 2000 太小)
set -g history-limit 100000

# 5. 减少 escape 延迟(为 nvim / vim:按 Esc 切 normal 模式)
set -sg escape-time 10

# 6. TrueColor / 256 色支持
set -g default-terminal "tmux-256color"
set -ag terminal-overrides ",xterm-256color:RGB"
set -ag terminal-overrides ",alacritty:RGB"
set -ag terminal-overrides ",*:RGB"

# 7. 不让 tmux 渲染额外的 bell(默认 bell 烦人)
set -g bell-action none
set -g visual-bell off

# 8. 自动重新加载配置(prefix + r)
bind r source-file ~/.tmux.conf \; display "Reloaded ~/.tmux.conf"

# 9. window-status 高亮当前 window 比默认明显
set -g status-interval 5         # 状态栏 5 秒刷一次(默认 15)
```

**逐行解释**:

```
# 1. unbind C-b → set prefix C-a
   - 解除默认 prefix
   - 设新 prefix 为 Ctrl-A(食指自然位)
   - bind C-a send-prefix 让"prefix C-a"把 Ctrl-A 透传给程序
     (重要:不然 bash 的"光标移到行首"快捷键废了)

# 2. set mouse on
   - 滚轮直接进 copy-mode 滚动
   - 鼠标点 pane 直接切换
   - 鼠标拖 pane 边界调整大小
   - 但要注意:mouse on 后选取行为变了,后面会专门配 copy-mode 鼠标行为

# 3. base-index = 1
   - 默认 window 编号从 0 开始,prefix + 1 跳到第 2 个窗口(反直觉)
   - 改成 1 之后,prefix + 1 跳第 1 个窗口
   - pane-base-index 同理(让 pane 也从 1 编号)
   - renumber-windows on 让你 kill 中间 window 后,后面的自动往前补
     (默认会留洞,比如 1, 2, 4, 5,prefix + 3 跳到不存在)

# 4. history-limit 100000
   - 默认 2000 行(滚屏只能看 2000 行历史)
   - 100000 行 ≈ 一天的密集输出
   - 注意:这是每个 pane 单独的 buffer,占内存
     100000 行 × 100 个 pane ≈ 200MB(实际很难超 50MB)

# 5. escape-time 10ms
   - 默认 500ms:tmux 等 500ms 判断是不是"组合键"
   - 后果:vim 按 Esc 切 normal 模式要卡 500ms
   - 改 10ms 之后几乎瞬间(0 太激进会误判)

# 6. default-terminal + terminal-overrides
   - tmux 默认报告自己是 "screen",颜色支持差
   - 改成 "tmux-256color"(2020 之后默认 tmux 自带 terminfo)
   - terminal-overrides 加 RGB:让外层终端(xterm / alacritty)的
     TrueColor 透传给 tmux 内的程序(vim / Neovim 主题)
   - 没这一行,vim 颜色经常不对

# 7. bell-action none + visual-bell off
   - 默认 bell 在 status bar 闪烁,经常误触发
   - 关掉(如果你需要 bell,改成 any 或 current)

# 8. bind r source-file
   - 修改完 .tmux.conf,prefix + r 立刻重新加载
   - 不用退出 tmux 才生效

# 9. status-interval 5
   - 状态栏数据刷新间隔(时间 / CPU 等)
   - 默认 15 秒 → 时间显示一直慢半拍,改 5 秒舒服
```

**这 9 段就是 tmux 配置的"骨架"——上面 10 行配置完,你的 tmux 已经从"难用"变成"可用"**。

---

## 三、分屏快捷键改成直观

默认 `prefix + "` 横切、`prefix + %` 竖切——**这是反人类的两件事**:

```
默认 prefix + " 横切:
  - " 这个键在 Shift + ' 上
  - 跟"水平线"没有任何视觉关联
  
默认 prefix + % 竖切:
  - % 这个键在 Shift + 5 上
  - 跟"竖线"也没有视觉关联
  
改成 - 和 |:
  - | 看起来就是竖线 (vertical bar) → 竖直分割
  - - 看起来就是横线 → 水平分割
  - 跟"方向"直观对应
```

配置:

```bash
# ============================================================
# 二、分屏快捷键
# ============================================================

# 10. 分屏改成直观的 | 和 -,新 pane 继承当前 cwd
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"

# 解除默认的 " 和 %
unbind '"'
unbind %

# 11. 新建 window 也继承当前 cwd(默认是 home)
bind c new-window -c "#{pane_current_path}"
```

**`-c "#{pane_current_path}"` 是关键**——它让**新 pane / 新 window 继承当前 pane 的 cwd**。**没这一行,你每次新建窗格都要重新 `cd /work/project`,这是 90% 用户的痛**。

```
没有 -c 的体验:
   你在 /work/project 干活
   prefix + | 开新 pane → 新 pane 在 ~/
   你 cd /work/project → 重新设环境变量、激活 venv、...
   prefix + c 开新 window → 又在 ~/
   每次都要重 cd

有了 -c 之后:
   你在 /work/project 干活
   prefix + | 开新 pane → 也在 /work/project
   prefix + c 开新 window → 也在 /work/project
   工作流连贯,不需要重新 cd
```

**这一行配置,每天给你省 10-20 次 cd**。

---

## 四、pane 间用 hjkl 跳

默认 `prefix + 方向键` 切 pane——**离 home row 太远**。改成 vim 风格的 hjkl:

```bash
# ============================================================
# 三、Pane 操作
# ============================================================

# 12. 用 hjkl 切 pane(vim 风格)
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# 13. 用 H J K L 调整 pane 大小(大写,带 repeat)
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# 14. 保留 zoom(默认就有,这里说明一下)
# prefix + z = 当前 pane 全屏 / 还原

# 15. prefix + Tab 切到上一个 pane(默认是 ;)
bind Tab last-pane
```

**`-r` 标志**是关键——**让你按一次 prefix 之后,可以连按几次 H/J/K/L 调整大小,不需要再按 prefix**。

```
没有 -r:
   prefix + H        左移 5
   prefix + H        又要按 prefix
   prefix + H        又要按 prefix
   3 次 = 6 次按键
   
有 -r:
   prefix + H H H    左移 15
   3 次 = 4 次按键
```

### 4.1 vim-tmux-navigator:跨 tmux / vim 的 hjkl

如果你用 vim / nvim,**强烈推荐 vim-tmux-navigator**——它让 **tmux 的 pane 切换和 vim 的窗口切换共用一套 hjkl**:

```
你在 vim 里编辑文件,vim 内部分割成两个窗口
你想跳到右边的 vim 窗口 → Ctrl-l(vim-tmux-navigator 接管)
继续按 Ctrl-l → 跳出 vim,到 tmux 右边的 pane
所有 hjkl 跨 tmux / vim 无感切换
```

配置:

```bash
# .tmux.conf (vim-tmux-navigator 的 tmux 端)
is_vim="ps -o state= -o comm= -t '#{pane_tty}' \
    | grep -iqE '^[^TXZ ]+ +(\\S+\\/)?g?(view|n?vim?x?)(diff)?$'"
bind-key -n 'C-h' if-shell "$is_vim" 'send-keys C-h' 'select-pane -L'
bind-key -n 'C-j' if-shell "$is_vim" 'send-keys C-j' 'select-pane -D'
bind-key -n 'C-k' if-shell "$is_vim" 'send-keys C-k' 'select-pane -U'
bind-key -n 'C-l' if-shell "$is_vim" 'send-keys C-l' 'select-pane -R'

# vim/nvim 端也要装 vim-tmux-navigator 插件
```

**这个集成的价值**:**你的 hjkl 心智不再有"现在我在 tmux 还是 vim"的切换**——一套键位,跨工具。**20 篇讲 Neovim 时会再讲一次**。

---

## 五、copy-mode 改 vi + 通系统剪贴板

**这是 tmux 配置最值钱的一段**——默认 copy-mode 是 emacs 键、复制只到 tmux buffer。**改完之后:hjkl + v + y 跟 vim 完全一致,而且 y 直接到系统剪贴板**。

```bash
# ============================================================
# 四、Copy-mode(改 vi 模式 + 系统剪贴板)
# ============================================================

# 16. copy-mode 改 vi 键位
setw -g mode-keys vi

# 17. 选取 / 复制 / 退出键改成 vim 风格
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi V send-keys -X select-line
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle

# 18. y 复制到系统剪贴板(macOS)
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"

# Linux X11:
# bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "xclip -in -selection clipboard"

# Linux Wayland:
# bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "wl-copy"

# 19. 鼠标松开时也复制到系统剪贴板(否则 mouse on 没意义)
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"

# 20. Enter 也复制(很多人习惯)
bind-key -T copy-mode-vi Enter send-keys -X copy-pipe-and-cancel "pbcopy"
```

**逐行解释**:

```
# 16. setw mode-keys vi
   - copy-mode 的"模式"切换成 vi
   - 内部按键 h/j/k/l 移动 / / 搜索 / v 选取 / y 复制 等

# 17-18. 在 copy-mode-vi 表里改键
   - "copy-mode-vi" 是 tmux 的一个 keytable(只在 copy-mode 下生效)
   - v = 开始选取(对应 vim 的 visual 模式)
   - V = 整行选取
   - Ctrl-v = 矩形选取(可选)
   - y = 复制并退出 copy-mode

# 18 最关键:copy-pipe-and-cancel "pbcopy"
   - copy-pipe = 把选中内容 pipe 到一个外部命令
   - "pbcopy"(macOS)/ xclip(Linux X11)/ wl-copy(Wayland)
   - cancel = 复制完后退出 copy-mode 回到正常
   - 没这一行,你 y 复制后内容只在 tmux 内部 buffer,
     去别的程序粘贴(Cmd-V)粘不到!

# 19. MouseDragEnd1Pane
   - 鼠标拖选完成时触发
   - 没这一行,mouse on 之后用鼠标选取,松开后内容只在 tmux buffer
   - 配上 pbcopy,鼠标选完直接到系统剪贴板

# 20. Enter 也复制
   - 大多数人习惯 Enter 确认选取
   - 加这一行兼容那种习惯
```

### 5.1 验证配置生效

```bash
# 在 tmux 里:
$ ls -la            # 输出 N 屏
prefix + [           # 进 copy-mode
hjkl                 # 移动光标
v                    # 选取开始
hjkl                 # 选中文本
y                    # 复制(+退出 copy-mode)

# 在 tmux 外(任意 GUI 程序):
Cmd-V               # 应该粘出刚才选中的内容
```

**如果 Cmd-V 没粘出内容**:**pbcopy 没装 / 路径不对 / SSH 远端没有 pbcopy**。远端机器要装 `xclip` 或 `wl-clipboard`,或者用 OSC 52 协议(后面 section 讲)。

### 5.2 远端机器的剪贴板痛点

**这是 tmux + ssh 用户最大的痛点之一**:你在远端 tmux 里复制了一段文字,**这段文字在远端机器的"剪贴板"里(其实远端没 GUI 也没剪贴板),粘不到本地**。

**解法 1:OSC 52 协议**

OSC 52 是终端模拟器的标准协议,允许程序通过 escape sequence 把内容写到**用户客户端的剪贴板**。tmux 3.2+ 支持:

```bash
# .tmux.conf:
set -g set-clipboard on
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "tmux load-buffer - && tmux save-buffer - | base64 | tmux display-message"
# (具体配置依赖你的终端模拟器是否支持 OSC 52)
```

**iTerm2 / WezTerm / Ghostty / Alacritty 都支持 OSC 52**——远端 tmux 复制的内容直接到本地剪贴板。**配上之后,远端 ssh + tmux 复制粘贴完全无感**。

**解法 2:把内容写到本地共享文件**

用 sshfs 或者 rsync 把远端 buffer 文件 sync 回本地——**笨办法,不推荐**。

**结论**:**用 OSC 52 + 现代终端模拟器**——其余办法都有各种坑。

---

## 六、TPM 插件管理 + 关键插件

到这里你已经有了一份 ~30 行的配置,**已经远超 80% 的用户**。如果还想再进一步,**装 TPM(Tmux Plugin Manager)**——让你能像 vim 一样用插件管理 tmux 的扩展。

### 6.1 装 TPM

```bash
# 一行装 TPM:
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

然后在 `.tmux.conf` 最后加:

```bash
# ============================================================
# 五、插件(TPM)
# ============================================================

# 21. 插件列表
set -g @plugin 'tmux-plugins/tpm'                # TPM 自己
set -g @plugin 'tmux-plugins/tmux-sensible'      # 一组常用 defaults
set -g @plugin 'tmux-plugins/tmux-resurrect'     # 保存 / 恢复 session
set -g @plugin 'tmux-plugins/tmux-continuum'     # 自动定时保存
set -g @plugin 'christoomey/vim-tmux-navigator'  # vim + tmux 共享 hjkl

# tmux-resurrect 配置
set -g @resurrect-capture-pane-contents 'on'     # 保存 pane 内容
set -g @resurrect-strategy-nvim 'session'        # nvim session 也存

# tmux-continuum 配置
set -g @continuum-restore 'on'                   # tmux 启动时自动恢复
set -g @continuum-save-interval '15'             # 15 分钟保存一次

# 22. TPM 初始化(必须放在 .tmux.conf 最后)
run '~/.tmux/plugins/tpm/tpm'
```

**装完之后**:

```bash
# 在 tmux 里:
prefix + I           # 大写 I,Install:下载所有 set @plugin 的插件
prefix + U           # 大写 U,Update:更新所有插件
prefix + alt + u     # Uninstall(被删除的插件)
```

### 6.2 必装的几个插件

**这一节克制——TPM 上有几百个插件,90% 你不需要**。**只装这几个,够用:**

```
1. tmux-resurrect
   功能:保存 session 结构到磁盘,重启 tmux server 后恢复
   救命场景:你 kill-server 之后,prefix + Ctrl-r 一键恢复
   局限:
     ✗ 不能恢复 pane 内运行的程序(只恢复命令行历史)
     ✗ 部分程序(vim / less)可以恢复内部状态,需要配套配置

2. tmux-continuum
   功能:tmux-resurrect 的"自动版"——每 15 分钟自动保存
   救命场景:你不需要记得手动保存
   组合使用:tmux-resurrect 保存 + tmux-continuum 自动 schedule

3. vim-tmux-navigator
   功能:让 tmux 和 vim/nvim 共享 hjkl 切换
   救命场景:你在 vim 内分割了两个窗口,
            想跳到 tmux 隔壁 pane 而不离开 home row

4. tmux-sensible
   功能:一组"大家都改的 defaults"(escape-time / utf-8 / ...)
   救命场景:省你写 5-10 行配置
   (如果你已经手写了那些 default,可以不装)
```

**克制原则**:**装一个插件,问自己"如果它今天 GitHub 仓库被删,我会怎样"——如果"无所谓",这插件就是装着玩;如果"我会很头疼",才是必装**。

### 6.3 不要装的"花活插件"

```
不推荐(让 tmux 变重 / 维护痛苦):

  ✗ tmux-fingers      地址选取(用 fzf-tmux 替代,后面讲)
  ✗ tmux-yank         独立的 yank 插件(我们手写了配置)
  ✗ tmux-thumbs       Rust 版的 fingers(同理)
  ✗ tmux-fzf          一个全功能 fzf 包(太重,自己 alias 一两个就够)
  ✗ tmux-pomodoro     番茄钟(状态栏装饰)
  ✗ tmux-battery      电池(笔记本看右上角更方便)
  ✗ tmux-cpu          CPU 占用(用 htop / btop 更准)
  ✗ tmux-net-speed    网速(用 nload / iftop)
  ✗ Powerline 类      花哨状态栏(启动慢,迁移痛,字体依赖)
  ✗ catppuccin / dracula 主题包  状态栏配色(自己写 5 行 status-style 就够)

判断准则:
  "这个插件解决的问题,用 50 行配置 / 用别的程序行不行?"
  能用就别装,装一个插件就是给自己增加一个依赖。
```

---

## 七、状态栏定制:克制是美德

很多人配 tmux 的 status bar 花掉一晚上——**装 Powerline / Catppuccin / Dracula / Nord 主题,加 CPU、内存、网速、电池、时间、天气、git 分支、k8s 当前 context**——配完发现:**启动慢 1 秒、字体不对豆腐块、迁移到新机器又要折腾一遍**。

**生产级 .tmux.conf 的状态栏应该是极简风**——只显示**会话名 + 窗口列表 + 主机名 + 时间**。其余的丢给 `htop` / `btop` / `lazygit` / `kubectx` 这些专门工具。

### 7.1 极简状态栏

```bash
# ============================================================
# 六、状态栏(极简风)
# ============================================================

# 23. 状态栏基本样式
set -g status on
set -g status-position bottom
set -g status-justify left
set -g status-interval 5

set -g status-style "bg=default fg=default"      # 透明背景

# 24. 左侧:session 名
set -g status-left "#[fg=cyan,bold][#S] #[fg=default]"
set -g status-left-length 40

# 25. 右侧:hostname + 时间
set -g status-right "#[fg=yellow]#h #[fg=default]| #[fg=green]%H:%M #[fg=default]"
set -g status-right-length 60

# 26. window 列表样式
setw -g window-status-format         " #I:#W "
setw -g window-status-current-format "#[fg=black,bg=cyan,bold] #I:#W #[default]"
setw -g window-status-separator      ""

# 27. pane 边框样式
set -g pane-border-style fg=brightblack
set -g pane-active-border-style fg=cyan
```

**预览效果**:

```
─────────────────────────────────────────────────────────────────────
[work]   1:editor  | 2:server | 3:git  4:claude        myhost | 14:30
─────────────────────────────────────────────────────────────────────
        ↑ 当前 window 高亮反白
```

**为什么这样**:

```
✓ 不依赖任何字体(没有 Nerd Font 图标)
✓ 不依赖任何主题(用终端的颜色)
✓ 一眼看清:session 名 / window 列表 / 哪台机 / 几点
✓ 跨平台一致(macOS / Linux 看起来一样)
✓ 启动快(不用算 CPU / 内存)
✓ 5 秒刷一次,几乎实时
```

**不要的**:

```
✗ CPU 占用:用 htop
✗ 内存占用:用 btop
✗ 电池:看笔记本右上角
✗ git 分支:看你的 shell prompt(Starship / Powerlevel10k)
✗ 天气:你需要的话用 wttr.in
✗ Spotify 当前歌:你以为你需要,但其实不需要
```

### 7.2 状态栏的"特例"

如果你**必须**显示某些动态信息(比如 k8s context / 当前 IP),用 `#(command)`:

```bash
set -g status-right "#[fg=red]#(kubectl config current-context 2>/dev/null) #[fg=yellow]#h #[fg=green]%H:%M"
```

**`#(command)` 会每 status-interval 跑一次这个 shell 命令**——上面例子:**每 5 秒跑 `kubectl config current-context`,显示当前 k8s context**。

**注意**:

```
- #(command) 是 shell 命令,每次刷新都跑
- 命令必须很快(<100ms),否则状态栏卡
- kubectl config 这种本地操作够快
- curl 网络请求慢,不要塞进去
```

---

## 八、Session 管理工作流

到这里你已经能配置好单个 session 的体验,**下一步**:**怎么"一键起一个工作流"**——比如 "我打开 work session,自动 cd 到 ~/code/myapp,起 3 个 pane,左 vim 右上 dev server 右下 git"。

### 8.1 三种方案

```
方案 A:tmuxinator(Ruby 写,YAML 配置)
   优点:成熟,文档好
   缺点:依赖 Ruby + bundler,装起来麻烦
   
方案 B:tmuxp(Python 写,YAML 配置)
   优点:跨平台,Python 用户友好
   缺点:依赖 Python
   
方案 C:smug(Go 写,YAML 配置)
   优点:单二进制,跨平台
   缺点:生态相对小

方案 D(推荐):写自己的 shell 脚本
   优点:不依赖任何运行时,完全可控
   缺点:配置语法是自己写的
```

### 8.2 个人脚本方案

`~/.local/bin/work` 一段脚本,**一行命令起完整 work session**:

```bash
#!/usr/bin/env bash
# ~/.local/bin/work

SESSION="work"
PROJECT="$HOME/code/myapp"

# 如果 session 已存在,直接 attach
tmux has-session -t "$SESSION" 2>/dev/null && {
    tmux attach -t "$SESSION"
    exit 0
}

# 否则创建一个新 session,3 个 pane
tmux new-session -d -s "$SESSION" -c "$PROJECT"
tmux rename-window -t "$SESSION:1" "editor"

# Window 1: editor + 测试 / git
tmux send-keys -t "$SESSION:1" "nvim" C-m

# 分一个右侧 pane 跑 git
tmux split-window -h -t "$SESSION:1" -c "$PROJECT"
tmux send-keys -t "$SESSION:1.2" "lazygit" C-m

# Window 2: dev server
tmux new-window -t "$SESSION:2" -n "server" -c "$PROJECT"
tmux send-keys -t "$SESSION:2" "npm run dev" C-m

# Window 3: 日志
tmux new-window -t "$SESSION:3" -n "logs" -c "$PROJECT"
tmux send-keys -t "$SESSION:3" "tail -f ./logs/app.log" C-m

# 默认 attach 到第 1 个 window
tmux select-window -t "$SESSION:1"
tmux attach -t "$SESSION"
```

**用法**:

```bash
$ chmod +x ~/.local/bin/work
$ work     # 第一次:起一个 work session,3 个 window,自动起 nvim / lazygit / dev / logs
$ work     # 再次跑:发现 work 存在,直接 attach
```

**这种"自定义脚本"方案的好处**:

```
✓ 零依赖(只要有 bash 和 tmux)
✓ 跨平台(macOS / Linux 一样跑)
✓ 完全可控(你想加什么逻辑都行)
✓ 跟 dotfiles 一起 sync(就是一个 shell 脚本)
✓ 不需要学第三方工具的 YAML 语法
✗ 写配置时比 YAML 啰嗦
```

**几乎所有"成熟 dotfiles 仓库"都有一组这种脚本**(`work` / `infra` / `notes` / `claude`)——**一行命令起一个工作流**。

### 8.3 tmuxinator(如果你坚持要 YAML)

如果你不想自己写脚本,**tmuxinator** 是最成熟的方案:

```yaml
# ~/.config/tmuxinator/work.yml
name: work
root: ~/code/myapp

windows:
  - editor:
      layout: main-vertical
      panes:
        - nvim
        - lazygit
  - server:
      panes:
        - npm run dev
  - logs:
      panes:
        - tail -f ./logs/app.log
```

```bash
$ tmuxinator start work    # 起 work
$ tmuxinator edit work     # 编辑 work.yml
$ tmuxinator list          # 列所有
```

**对 Ruby 用户友好**,**对其它人略重**——装 tmuxinator 要 `gem install tmuxinator`,需要 Ruby 环境。**推荐顺序:先用自己的 shell 脚本,如果脚本写得太多管不过来,再迁移到 tmuxinator/tmuxp**。

---

## 九、fzf + tmux 联动

**fzf 是终端工程的瑞士军刀**(12 篇专讲),**它和 tmux 联动**之后,**你的"切 session / 切 window / 跳文件 / 查历史"全部变成模糊匹配**。

### 9.1 tm():一个 fzf 切 session 函数

tmux 自带的 `prefix + s` 是个交互式 session 选择器——**但 fzf 比它更强**(模糊匹配 + 预览)。

把这个函数放进 `~/.zshrc`:

```bash
# 模糊匹配选 session 并 attach
tm() {
    local sessions session
    sessions=$(tmux ls 2>/dev/null | awk -F: '{print $1}')
    [ -z "$sessions" ] && {
        echo "no tmux session"
        return 1
    }
    session=$(echo "$sessions" | fzf --height=10 --reverse)
    [ -n "$session" ] && tmux attach -t "$session"
}
```

**用法**:

```bash
$ tm
> work
  infra
  notes
  claude

# 输入 wo → 模糊匹配 work → Enter → attach
```

### 9.2 tn():创建新 session

```bash
tn() {
    local name
    name=${1:-$(basename "$PWD")}
    tmux new-session -d -s "$name" -c "$PWD" 2>/dev/null
    tmux attach -t "$name"
}
```

**用法**:

```bash
$ cd ~/code/myapp
$ tn         # 创建一个名叫 "myapp" 的 session(以当前目录名),attach
$ tn debug   # 或者指定名字
```

### 9.3 fzf-tmux:在 tmux 弹出窗口里跑 fzf

**fzf 自带一个 `fzf-tmux` 命令**——在 tmux 内,它会在一个**浮动 pane** 里跑 fzf,不打扰当前 pane:

```bash
# 用 fzf-tmux 替代 fzf:
files=$(fzf-tmux -p 80%,60%)     # 弹出 80% × 60% 的浮动窗口

# 配合 git checkout 分支选择:
git checkout $(git branch -a | fzf-tmux -p 60%,40% | sed 's/^[ *]*//')
```

**这个浮动 pane 是 tmux 3.2+ 的功能**——`-p 80%,60%` 是位置和大小,**在你的工作 pane 上"浮"一个窗口跑 fzf**,选完关掉,工作 pane 完全不被打扰。

### 9.4 tmux-sessionizer(进阶)

**ThePrimeagen 的 tmux-sessionizer 脚本**广为流传——**用 fzf 在你的项目目录里选一个,自动创建/切换对应的 session**:

```bash
#!/usr/bin/env bash
# ~/.local/bin/tmux-sessionizer

if [[ $# -eq 1 ]]; then
    selected=$1
else
    selected=$(find ~/code ~/work ~/.config -mindepth 1 -maxdepth 2 -type d | fzf)
fi

[ -z "$selected" ] && exit 0
selected_name=$(basename "$selected" | tr . _)
tmux_running=$(pgrep tmux)

if [ -z "$TMUX" ] && [ -z "$tmux_running" ]; then
    tmux new-session -s "$selected_name" -c "$selected"
    exit 0
fi

if ! tmux has-session -t="$selected_name" 2>/dev/null; then
    tmux new-session -ds "$selected_name" -c "$selected"
fi

tmux switch-client -t "$selected_name"
```

绑到一个全局快捷键(在 zshrc 里):

```bash
bindkey -s '^f' 'tmux-sessionizer\n'      # Ctrl-F 在任何时候触发
```

**用法**:**Ctrl-F → fzf 列出所有项目目录 → 选一个 → 自动 attach/创建 session**。

**这是 tmux + fzf 工作流的"终极形态"**——你的所有项目都变成一个键的距离。

---

## 十、持久化 / 恢复

**tmux 默认不持久化**——server 死了 / 机器重启,所有 session 灰飞烟灭。**tmux-resurrect + tmux-continuum 是补这个洞的标配组合**。

### 10.1 tmux-resurrect

```bash
# .tmux.conf:
set -g @plugin 'tmux-plugins/tmux-resurrect'

# 保存 pane 的输出内容(不止结构)
set -g @resurrect-capture-pane-contents 'on'

# nvim 的 session 也保存(需要 nvim 配套 mksession)
set -g @resurrect-strategy-nvim 'session'

# 默认快捷键:
# prefix + Ctrl-s   保存当前 tmux 状态到磁盘
# prefix + Ctrl-r   从磁盘恢复
```

**保存的位置**:`~/.local/share/tmux/resurrect/last`(软链)+ 历史快照。

**保存什么**:

```
✓ Session / window / pane 结构
✓ Window 名字 / pane layout
✓ pane 的当前工作目录
✓ pane 内运行的命令行(只是命令字符串,不是程序状态)
✓ (可选)pane 的 scrollback 内容
✓ (可选)vim / nvim session

不保存什么:
✗ 进程的内存状态(不可能,这超出磁盘持久化能力)
✗ 没有 mksession 的程序(less / htop / btop 等)
✗ 网络连接 / 端口 / 文件描述符
```

**实战教训**:**resurrect 是"现场重建"不是"现场冻结"**——它保存的是"你怎么搭起这个 session 的指令",重启后重新跑一遍。**部分程序(vim / nvim / weechat)有自己的 session 机制可以保存内部状态**。**Claude Code / 长任务这种程序,resurrect 没办法保存中间进度**——你要靠 Claude 自己的 checkpoint。

### 10.2 tmux-continuum

```bash
# .tmux.conf:
set -g @plugin 'tmux-plugins/tmux-continuum'

# 启动 tmux 时自动恢复
set -g @continuum-restore 'on'

# 自动保存间隔(分钟)
set -g @continuum-save-interval '15'
```

**这两个一起用**:

```
tmux-continuum 每 15 分钟自动调 tmux-resurrect 保存
tmux 启动时,@continuum-restore 让 tmux-resurrect 自动恢复
你完全不需要手动按 prefix + Ctrl-s / Ctrl-r
```

**Tmux 启动的 hook**:tmux-continuum 在 tmux server 启动时检测 `@continuum-restore = on`,自动跑一次恢复。**这样机器重启 → tmux server 重启 → continuum 自动恢复 → 你看到的就是 15 分钟前的现场**。

### 10.3 局限性 + 救命方案

```
局限:
  ✗ pane 内程序状态不保存(只重启命令)
  ✗ 跨机器不保存(磁盘存的是本机的 session,不跨 SSH)
  ✗ 偶尔会有"恢复失败"(insert tmux 升级、配置改了等)

救命方案:
  ① 真重要的长任务,放在 Claude 自己的 checkpoint 里(不要全靠 tmux)
  ② vim / nvim 的内容靠 :mksession 或者 nvim-session-manager
  ③ shell 历史靠 atuin(09 篇)跨机器同步
  ④ 长跑进程别只靠 tmux,要么 systemd-unit,要么 nohup + 日志文件
```

---

## 十一、远端 + 本地嵌套工作流

16 篇讲了 tmux 嵌套的心智,**这里给两套实战方案**:

### 11.1 方案 A:本地不开 tmux,只远端开

**这是最常见也最干净的方案**:

```
你的工作流:
   - 本地:iTerm 多 tab(每个 tab ssh 一台远端机器)
   - 远端:每台机器开一个 tmux session
   - detach 本地 = 关 iTerm tab(下次再 ssh 重新 attach)
   
适合人群:
   - 80% 工作在远端
   - 本地只是"显示器 + ssh 客户端"
   - 不需要本地长任务
```

**配置**:**本地不装 tmux**(或者装了不用)。**远端 .tmux.conf 用你最熟的 prefix(C-a)**。

### 11.2 方案 B:本地远端各用一套(不同 prefix)

**适合本地远端都重度用的人**:

```bash
# 本地的 ~/.tmux.conf:
set -g prefix C-a               # 本地 = Ctrl-A

# 远端的 ~/.tmux.conf:
set -g prefix C-b               # 远端 = Ctrl-B(回到默认)
# 或者:
set -g prefix `                  # 远端 = 反引号
```

**这样**:

```
你按 Ctrl-A   → 本地 tmux 接(切本地的 window / pane)
你按 Ctrl-B   → 透传到远端 tmux → 远端 tmux 接
按错了:你不会 detach 错层
```

**dotfiles 工程化的角度**:**本地和远端的 .tmux.conf 不同**——dotfiles 仓库要支持"按机器条件加载不同配置"(22 篇会讲 chezmoi 的模板)。

### 11.3 方案 C:三层嵌套

**少见但可能**:你本地 tmux → ssh 跳板机 tmux → ssh 生产机 tmux。**3 层 tmux**。

```
本地     prefix = C-a       (最常用,按起来最快)
跳板机    prefix = C-b      (中等)
生产机    prefix = `         (最偏门,因为最深)
```

**层数太深时,你应该问自己**:**真有必要三层嵌套吗?** 通常的简化:

```
- 跳板机不开 tmux,只是 ProxyJump 一跳到生产机
  (本地 tmux + 生产 tmux,两层)
  
- 或者:跳板机开 tmux,生产机不开
  (本地 tmux + 跳板机 tmux,本地保留 client 持久化,生产机短连)
```

**16 篇说过**:**嵌套层越深越痛苦,能砍就砍**。

---

## 十二、一份完整的生产级 .tmux.conf

把前面所有片段拼起来,**这就是一份可以直接拿去用的 50 行 .tmux.conf**:

```bash
# ~/.tmux.conf
# ============================================================
# tmux 生产级配置
# 基本设置 + 分屏 + Pane + Copy-mode + 状态栏 + 插件
# ============================================================

# --- 基本设置 -----------------------------------------------
unbind C-b
set -g prefix C-a
bind C-a send-prefix
set -g mouse on
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -g history-limit 100000
set -sg escape-time 10
set -g default-terminal "tmux-256color"
set -ag terminal-overrides ",xterm-256color:RGB"
set -ag terminal-overrides ",*:RGB"
set -g bell-action none
set -g status-interval 5
bind r source-file ~/.tmux.conf \; display "Reloaded"

# --- 分屏 / Window / Pane ----------------------------------
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %
bind c new-window -c "#{pane_current_path}"
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5
bind Tab last-pane

# --- Copy-mode (vi 风格 + 系统剪贴板 macOS) ----------------
setw -g mode-keys vi
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi V send-keys -X select-line
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"
bind-key -T copy-mode-vi Enter send-keys -X copy-pipe-and-cancel "pbcopy"

# --- 状态栏(极简风) ---------------------------------------
set -g status on
set -g status-position bottom
set -g status-justify left
set -g status-style "bg=default fg=default"
set -g status-left "#[fg=cyan,bold][#S] #[fg=default]"
set -g status-left-length 40
set -g status-right "#[fg=yellow]#h #[fg=default]| #[fg=green]%H:%M "
set -g status-right-length 60
setw -g window-status-format " #I:#W "
setw -g window-status-current-format "#[fg=black,bg=cyan,bold] #I:#W #[default]"
setw -g window-status-separator ""
set -g pane-border-style fg=brightblack
set -g pane-active-border-style fg=cyan

# --- 插件(TPM) -------------------------------------------
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @plugin 'christoomey/vim-tmux-navigator'

set -g @resurrect-capture-pane-contents 'on'
set -g @resurrect-strategy-nvim 'session'
set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'

run '~/.tmux/plugins/tpm/tpm'
```

**51 行**(包括注释和空行)。**这就是一份"一辈子够用"的 .tmux.conf**——你可以用 5 年不大改,只在新机器上 `git clone` 一遍就行。

**装完后立刻做**:

```bash
# 1. 启动 tmux
$ tmux

# 2. 装 TPM 的插件
prefix + I        # 大写 I,等几秒钟下完

# 3. 测试 copy-mode
prefix + [
hjkl
v
hjkl 选
y                 # 应该到系统剪贴板,在外面 Cmd-V 验证

# 4. 测试持久化
prefix + Ctrl-s   # 手动保存一次
tmux kill-server  # 杀掉 server
tmux              # 重启
prefix + Ctrl-r   # 应该自动恢复

# 5. 测试 reload
prefix + r        # 应该显示 "Reloaded"
```

5 个测试都通过,你的 tmux 配置就到位了。

---

## 十三、反对的写法

### 13.1 抄 200 行不知道一半含义

```
错的:
  GitHub 上找一个 star 多的 dotfiles,直接 cp 它的 tmux.conf
  配置 200+ 行,自己看不懂 80%
  
错在哪:
  - 别人的配置匹配别人的工作流(他可能在写 Ruby / 用 emacs / 上 vim)
  - 你不知道哪行干啥,改不动也不敢删
  - 出问题 debug 一晚上,根本不知道是哪行的锅
  - 启动慢、迁移痛、维护累
  
正确认知:
  - 50 行起步,有需求再加
  - 每加一行必须能解释作用
  - 不能解释的行删掉
```

### 13.2 装 15 个插件全部启动

```
错的:
  TPM 一装,看见好玩的插件就 set @plugin
  装了 tmux-fingers、tmux-yank、tmux-thumbs、tmux-fzf、tmux-cpu、
       tmux-net-speed、tmux-battery、tmux-weather、catppuccin theme...
  
错在哪:
  - 启动慢(每个插件几十毫秒,15 个加起来 1-2 秒)
  - 维护痛(每个都可能跟新版 tmux 不兼容)
  - 互相冲突(tmux-yank 和你手写的 copy-mode 配置打架)
  - 90% 的插件你装完就忘了
  
正确认知:
  - 必装的就 4 个(resurrect / continuum / vim-tmux-navigator / sensible)
  - 其余的"等我用过 6 个月觉得真的需要"再加
  - 装一个删一个,而不是"装一堆留着备用"
```

### 13.3 mouse on 之后没配 copy-mode 鼠标行为

```
错的:
  set -g mouse on
  没配 MouseDragEnd1Pane 的 copy-pipe-and-cancel
  
错在哪:
  - 你用鼠标拖选,以为复制了
  - 松开鼠标 → tmux 把内容塞进自己 buffer,然后退出 copy-mode
  - 你 Cmd-V → 粘出的是几小时前别的程序复制的内容
  - 你以为是 tmux 坏了,其实是没配
  
正确认知:
  - mouse on 必须配 MouseDragEnd1Pane 那一行
  - 或者:不开 mouse on,只用 prefix + [ + vy 复制(我个人更喜欢)
```

### 13.4 改 prefix 到 Ctrl-Space

```
错的:
  set -g prefix C-Space     (跟 IDE 补全键冲突)
  
错在哪:
  - VS Code / IntelliJ 默认 Ctrl-Space 是"触发自动补全"
  - 你在 IDE 里写代码 → 按 Ctrl-Space 想补全 → 跳到 tmux 模式
  - 你切回 IDE 又试 → 还是跳 tmux → 抓狂
  
正确认知:
  - 改 prefix 之前先想:这个键有没有跟你常用程序冲突?
  - Ctrl-A 很安全(只有 emacs / readline 用,而 readline 的 home 键
    其实是 Home 键够用)
  - 反引号 ` 也很安全(99% 的人不在 shell 里输反引号,Markdown 块用
    三连即可)
  - 千万别用 Ctrl-Space / Ctrl-F / Ctrl-S(IDE / browser / save 都占)
```

### 13.5 状态栏塞太多

```
错的:
  status-right 塞 CPU、内存、电池、网速、IP、git 分支、k8s context、
              当前 AWS profile、当前 GCP project、Spotify 当前歌、
              时间、日期、星期、农历...
  
错在哪:
  - 每个 #() 都是一个 shell 命令,每 5 秒跑一次
  - 状态栏占满,window 名字被截断
  - 你看 status bar 找信息比看 htop 还慢
  - 改宽度 / 改字体 / 改颜色一晚上,工作没干
  
正确认知:
  - 状态栏不是仪表盘,是"我在哪 + 几点"提示
  - CPU 看 htop,k8s context 看 prompt,git 分支看 lazygit
  - status bar 上的信息 ≤ 5 个字段
```

### 13.6 改 prefix 但忘了 send-prefix

```
错的:
  unbind C-b
  set -g prefix C-a
  # 没加 bind C-a send-prefix
  
错在哪:
  - 你按 Ctrl-A 进 tmux 模式 OK
  - 你想让 bash 把光标移到行首(readline 的 Ctrl-A 默认行为)→ 永远做不了
  - 因为 tmux 把 Ctrl-A 全拦截了
  
正确认知:
  - 改 prefix 后必须 bind C-a send-prefix(允许双击 prefix 透传)
  - 这样 Ctrl-A 单击 = tmux 模式,Ctrl-A 双击 = 真发 Ctrl-A
```

---

## 十四、看完这一篇你应该能

- **写出一份 50 行的生产级 .tmux.conf**,每一行能解释作用
- **配好 copy-mode**(vi 键位 + 系统剪贴板 + 鼠标松开复制)
- **装 TPM 和 4 个必备插件**(resurrect / continuum / vim-tmux-navigator / sensible)
- **写一个 `work` shell 脚本一行命令起多窗格 session**(或者用 tmuxinator)
- **配置 fzf 切 session**(tm 函数 + tmux-sessionizer)
- **处理本地远端嵌套**(两层 prefix C-a / C-b)
- **避开 6 个常见错误**:抄 200 行 / 装 15 插件 / mouse on 没配 copy 行为 / prefix 选 Ctrl-Space / 状态栏塞太多 / 改 prefix 忘 send-prefix

如果上面 7 条都能做到,**这一篇就值了**。

---

## 十五、下一篇预告

16 + 17 这两篇是 **tmux 系列**——心智 + 工程化配置。**下一篇 18 篇讲 Zellij**——一个 2020 起步的"声明式 multiplexer 新秀"。

```
18 篇:Zellij vs tmux
  - Zellij 是什么(Rust / 声明式 / 内置浮动窗口)
  - 与 tmux 的对照(开箱即用 vs 配置自由)
  - Zellij 的杀手锏:layouts 声明式 + 内置插件 + status bar 不用配
  - Zellij 的局限:生态薄 / SSH 共享 attach 不成熟 / 配置选项少
  - 该不该迁移?
  - 真实场景对照:新人 tmux 配置 1 小时 vs Zellij 装完就用
  - 选型决策树
```

读完 18 篇,你能给自己回答**"我已经投资了 tmux,要不要切 Zellij"**这个问题——**短答**:**如果你已经 tmux 顺手,不切**;**如果你还没投资 multiplexer 学习曲线,Zellij 也许更香**。具体看 18 篇怎么拆。

---

**附录:这一篇配置速查**

```bash
# 基础
unbind C-b; set -g prefix C-a; bind C-a send-prefix
set -g mouse on
set -g base-index 1; setw -g pane-base-index 1
set -g renumber-windows on
set -g history-limit 100000
set -sg escape-time 10
set -g default-terminal "tmux-256color"
set -ag terminal-overrides ",*:RGB"
bind r source-file ~/.tmux.conf

# 分屏
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
bind c new-window -c "#{pane_current_path}"

# Pane 移动
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# Copy-mode (vi + pbcopy)
setw -g mode-keys vi
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"

# 状态栏
set -g status-style "bg=default fg=default"
set -g status-left "#[fg=cyan,bold][#S] "
set -g status-right "#[fg=yellow]#h | %H:%M"
setw -g window-status-current-format "#[fg=black,bg=cyan,bold] #I:#W "

# 插件
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @plugin 'christoomey/vim-tmux-navigator'
set -g @resurrect-capture-pane-contents 'on'
set -g @continuum-restore 'on'
run '~/.tmux/plugins/tpm/tpm'
```
