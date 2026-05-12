# 终端 + Claude Code 工作流:用得好和用得烂差 5 倍生产力

打开你身边任何一个用 Claude Code 的同事,看他怎么用的。**九成是这样**:

```
他打开 VS Code,在底部 Terminal 里跑一个 claude
界面就停在那个 terminal 标签页里
他切到代码 tab 看文件 → 切回 terminal 给 Claude 指令 → 切到代码看改动
Claude 跑长任务时,他盯着进度条等 5 分钟
任务跑了 20 分钟,他不小心关了 VS Code → Claude 没了 → 任务报废
他重新开 Claude,从头描述刚才的任务 → 又是 20 分钟
晚上下班,Claude 跑着 refactor,他犹豫:要不要让它继续跑?关了它就死了
最后:关电脑,Claude 死,明早重来
```

**另一个同事完全不同**:

```
她在 tmux 一个名为 "claude" 的 session 里跑 Claude
左 pane 是 Claude,右 pane 是她自己的 shell(git / 跑测试 / 看日志)
她用 fzf 选一批文件,xargs 喂给 Claude:"重构这些 controller 的错误处理"
Claude 跑起来,她切到另一个 pane 看 git log
6 点下班,Claude 跑到一半 → 她笔记本合盖 → Claude 跑在远端 dev box 的 tmux 里
明早 8 点 ssh 进去 tmux attach,看 Claude 跑完了 280 个文件
她 review diff,过的 commit,不过的让 Claude 重做
中午前完成的工作量,昨天前一个同事一整天做不完
```

**这两个人用的同一个 Claude Code**——区别不在 Claude,**在他们怎么把 Claude 嵌进自己的终端工作流**。这个差距通常是 3-5 倍生产力,而且会因为 AI 工具能力越强而越大——**前者只能拿到 Claude 能力的 30%,后者拿到 90%**。

> 一句话先记住:**Claude Code 不是 VS Code 插件,是一个终端原生的工具——它的最佳搭档是 tmux(管会话)+ fzf(选输入)+ 远端机器(跑长任务),不是 IDE 集成**。**你越懂终端,Claude 越像一个会写代码的同事;你越不懂,Claude 就只是一个高级聊天框**。

这一篇拆开讲:**Claude Code 的"形态"和心智(它是个 CLI、它有 session、它会跑很久)、tmux + Claude 的五种工作流方案、fzf 喂文件给 Claude、多 instance 并行、git worktree + Claude、长任务的完成信号、CLAUDE.md 示例(40-60 行)、slash/hooks/agents 在工作流里的位置、跟 IDE 怎么混合、真实工程师一天、跨机器(本地 + dev box)的工作流、反对的写法、看完应该能、下一篇预告**。**这是 terminalLearning 系列的工作流总成**——把前面所有篇(tmux / fzf / ssh / Justfile)的能力,全部串起来接到 Claude 上。

---

## 一、Claude Code 的"形态":它到底是个什么

要把 Claude Code 接好,先理清它是个什么东西。**它不是 IDE 插件**,也**不是网页聊天框**——它是一个**跑在你 shell 里的 CLI 程序**。

### 1.1 几个事实

```
□ Claude Code 是一个 Node.js 程序,名字叫 `claude`
□ 它跑在你的 shell 里,接 stdin/stdout,raw mode 接管 tty
□ 它读你的环境变量(ANTHROPIC_API_KEY、PATH、HOME、CWD)
□ 它读 ~/.claude/settings.json 和 ./.claude/settings.json
□ 它在当前目录开一个 "session" — 这次对话的记忆
□ 它通过工具(Bash / Edit / Read / WebFetch / MCP)动手做事
□ 它的输出是流式的(token by token),不是一次性返回
□ 你可以同时跑多个 instance(不同终端 pane 不同目录)
□ 长任务(refactor / 大批量改 / 跑测试)可能跑几分钟到几小时
```

### 1.2 一张图:Claude 在你机器上的位置

```
┌──────────────────────────────────────────────────────────┐
│                  你的笔记本 / 远端 dev box                │
│                                                          │
│   ┌───────────────────────────────────────────────┐     │
│   │ tmux session "dev"                            │     │
│   │                                               │     │
│   │   ┌─────────────────┐   ┌─────────────────┐  │     │
│   │   │ pane 1: claude  │   │ pane 2: shell   │  │     │
│   │   │                 │   │                 │  │     │
│   │   │ > refactor 200  │   │ $ git status    │  │     │
│   │   │   files...      │   │ $ rg "TODO"     │  │     │
│   │   │ Working...      │   │ $ just test     │  │     │
│   │   │                 │   │                 │  │     │
│   │   └────────┬────────┘   └─────────────────┘  │     │
│   │            │                                  │     │
│   │            │ 调工具                            │     │
│   │            ↓                                  │     │
│   │   ┌─────────────────────────────────────────┐│     │
│   │   │ Bash / Read / Edit / WebFetch / MCP    ││     │
│   │   └─────────────────────────────────────────┘│     │
│   └───────────────────────────────────────────────┘     │
│            ↑                                             │
│            │ ssh / detach 任何时间                       │
└────────────│─────────────────────────────────────────────┘
             │
             │
        ┌────┴────┐
        │ 你 在哪 │  ← 笔记本合盖 / SSH 进来 / 换一台机器
        └─────────┘  Claude 不在乎,它在 tmux 里继续跑
```

**关键观察**:**Claude Code 是一个进程,这个进程跑在哪、活多久,完全是你的安排**。

```
你把它跑在 VS Code Terminal 里 → VS Code 一关,Claude 死
你把它跑在 SSH 直连终端里      → SSH 断,Claude 死
你把它跑在 tmux pane 里        → detach 也活着,attach 回来继续看

  ★ 第三种是唯一适合长任务的方式
```

### 1.3 三种生命周期的对照

```
┌──────────────────────────────────────────────────────────┐
│            "5 分钟任务"   "30 分钟任务"   "一晚上任务"      │
├──────────────────────────────────────────────────────────┤
│ VS Code 内      OK        勉强            完全不行         │
│ 直连 SSH        OK        勉强(怕断)    完全不行         │
│ tmux + 本地     OK        OK              OK(本地不死)   │
│ tmux + 远端     OK        OK              OK ★最稳        │
└──────────────────────────────────────────────────────────┘
```

**结论**:**任务时长 > 15 分钟,必须 tmux**。任务时长 > 1 小时且你笔记本要合盖,**必须远端 tmux**。

---

## 二、心智:把 Claude Code 当一个团队成员

**不要把 Claude Code 当工具**——把它当一个**已经入职、需要交接、能自己干活但需要上下文**的同事。

```
工具的特征:
   - 你输入 → 它输出
   - 你不操作,它什么都不做
   - 它没有状态,每次重新开始

同事的特征:
   - 你给目标 → 它自己拆任务
   - 你不在,它可以继续干
   - 它有记忆(这个项目、这次对话)
   - 它会问你不清楚的问题
   - 它会主动汇报进度

  Claude Code 在第二类
```

### 2.1 这种心智下的工作流原则

```
原则 1:它能独立工作时,不打扰你
   ── 你让它 refactor 200 个文件,它不必每改一个问你
   ── 你的工作流要支持"它在跑、你在别的事"

原则 2:你可以随时回头看进度
   ── 不能"丢出去就丢了",要能 attach 回来
   ── tmux + 流式输出 + 可滚动 buffer

原则 3:它需要明确的目标和约束
   ── 不是"帮我搞一下" → 是 "把这 50 个 controller 的错误处理
     从 try-catch + console.log 改成 Result<T, E> 模式,
     带单元测试,不破坏现有 API"
   ── 这种交接质量决定 Claude 能不能独立干

原则 4:你要 review 它的产出
   ── 它是同事,不是上司,它的 PR 你要看
   ── 不要 "Claude 改完直接 commit"
```

**这四条是 Claude Code 在终端里的工作流地基**。后面的五种方案都是在这套心智上展开的。

---

## 三、方案 1:tmux 一个 session,Claude 在一个 pane 里跑

最基础的姿势,**也是日常 80% 场景**。

### 3.1 起一个 dev session

```bash
# 进入项目根
cd ~/code/myapp

# 起 tmux session,起名为 dev(用项目名也行)
tmux new-session -s myapp

# 在 session 里,水平 split:左 60% 给 claude,右 40% 给 shell
# C-b %         (vertical split,Ctrl-B 然后 %)
# C-b ←/→       切 pane
# 左 pane:
claude

# 切到右 pane:
# C-b →
# 然后正常 git / rg / just test
```

**结果**:你在一个 tmux 里同时看 Claude 和自己的 shell,**Claude 跑长任务时你切右 pane 干别的事**。

### 3.2 Justfile 一键起 dev 环境

把 27 / 28 篇的 Justfile 接进来。在项目根加一段 recipe:

```just
# Justfile

# 起开发 session:tmux + claude + 你的 shell
dev:
    #!/usr/bin/env bash
    set -e
    
    SESSION="dev-$(basename $(pwd))"
    
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "Session $SESSION exists, attaching..."
        tmux attach -t "$SESSION"
        exit 0
    fi
    
    tmux new-session -d -s "$SESSION" -c "$(pwd)"
    tmux split-window -h -t "$SESSION" -c "$(pwd)"
    tmux select-pane -t "$SESSION":0.0
    tmux send-keys -t "$SESSION":0.0 "claude" C-m
    tmux attach -t "$SESSION"

# 关掉这个项目的 session
dev-kill:
    tmux kill-session -t "dev-$(basename $(pwd))" 2>/dev/null || true
```

```bash
$ just dev               # 起一个新 session 或 attach 已有的
$ just dev-kill          # 关掉
```

**这一段 recipe 让"开始工作"变成 `just dev`**——3 秒进入"Claude + 你的 shell + tmux"全套配置。

### 3.3 配 tmux-resurrect:重启后恢复

如果你 17 篇看过 tmux 工作流配置,会装 tmux-resurrect / tmux-continuum:

```bash
# ~/.tmux.conf 片段
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'
```

```
笔记本重启 / tmux 进程死后:
   tmux 自动重建上次的 session 布局
   pane 数量、位置都恢复
   
注意:resurrect 不能恢复 pane 里跑的进程的状态
   Claude 的 session 内存会丢(因为 claude 进程是新的)
   但你的 tmux 布局 / 路径 / 历史 / 在哪个 pane 都恢复
```

**最佳实践**:**笔记本日常重启 OK,但「Claude 长任务」要么本地不关机,要么放远端**。

---

## 四、方案 2:Claude Code 跑远端 dev box + 本地 attach

**真正的杀手锏**——这是让笔记本合盖、Claude 跑一晚上的姿势。

### 4.1 远端 dev box 架构

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  你的笔记本                  │   ssh   │  远端 dev box / cloud VM     │
│  (合盖也无所谓)              │ ───────▶│                              │
│                              │         │  ┌────────────────────────┐  │
│  iTerm / Ghostty             │         │  │ tmux session "claude"  │  │
│   ↓                          │         │  │                        │  │
│   ssh dev                    │         │  │  > claude              │  │
│   ↓                          │         │  │    Working on refactor │  │
│   tmux attach -t claude      │         │  │    140/200 files done  │  │
│                              │         │  │    ...                 │  │
│                              │         │  └────────────────────────┘  │
└──────────────────────────────┘         └──────────────────────────────┘
                                                ↑
                                                │ Claude 跑一晚上
                                                │ 你不在也活着
                                                └ 远端机不睡觉
```

### 4.2 一次性配置 ssh + tmux

15 篇 ssh 深用 + 16/17 篇 tmux 配过的话,这一步就是几行:

```ssh
# ~/.ssh/config
Host dev
    HostName dev-box.example.com
    User work
    IdentityFile ~/.ssh/id_ed25519
    ForwardAgent yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

然后:

```bash
# 在远端启动一个永久 tmux session
$ ssh dev
[dev]$ tmux new-session -s claude -d -c ~/code/myapp
[dev]$ tmux send-keys -t claude "claude" C-m
[dev]$ exit

# 本地一行 attach
$ ssh dev -t "tmux attach -t claude"
```

**做成 alias** 更顺手:

```zsh
# ~/.zshrc
alias claude-remote='ssh dev -t "tmux attach -t claude || tmux new -s claude -c ~/code/myapp"'
```

```bash
$ claude-remote          # 一键进远端 Claude
```

### 4.3 真实场景:让 Claude 跑一晚上

```
17:30  下班前你在远端 tmux 里给 Claude 一个任务:
       "把 src/ 下所有 controller 的错误处理重构成 Result 模式,
        每改一个跑该模块测试,失败立刻停,把 progress 记到
        REFACTOR_LOG.md"

17:35  Claude 开始读代码、做 plan、改文件
       你在远端 tmux 看了 5 分钟,确认 plan 合理
       Ctrl-B D detach,关掉本地 SSH,笔记本合盖,走人

晚上    Claude 在远端跑了 6 小时,改了 180 个文件
       每改一个跑测试,失败的 3 个回滚
       REFACTOR_LOG.md 累计 200 行

次日 09:00  ssh dev -t "tmux attach -t claude"
            Claude 输出:"Done. 180/183 successful. See REFACTOR_LOG.md"
            你 cat REFACTOR_LOG.md 看哪些回滚了
            review diff,commit 通过的,让 Claude 重做失败的 3 个

整夜睡觉 = 一个工作日的工作量
   ── 这是 Claude Code + 远端 tmux 的真正威力
```

**关键点**:**这个工作流的所有"魔法"都来自 tmux + ssh,而不是 Claude 本身的某个特性**——Claude 在哪个 shell 里都一样,但你的 shell 在哪、活多久,决定了 Claude 能干多大的事。

### 4.4 注意事项

```
□ 远端机要够大:Claude refactor 时 Node 进程 + 跑测试 + grep 
  大批文件可能 4-8GB 内存
□ 远端机不要 idle shutdown:云厂商有"X 小时无活动自动关机"功能,
  Claude 跑测试有 CPU 但 SSH 无人 attach,要确认这种判定不会触发
□ API key 要在远端的 ~/.zshrc(或 ~/.claude/settings.json)里
  不要 forward 本地 env(SSH 不 forward 这个)
□ ssh agent forwarding 共享 GitHub key,Claude 远端能 git push
  ssh -A 或 config 里 ForwardAgent yes
□ tmux session 长时间运行,buffer 会涨大,有时要 clear-history
  C-b :clear-history
```

---

## 五、方案 3:fzf 选文件喂给 Claude

12 篇讲了 fzf 心智——把它嵌进 Claude 的工作流,**选文件给 Claude 看比手敲路径快 10 倍**。

### 5.1 一个函数 `claude-this`

```zsh
# ~/.zshrc

# 用 fzf 选多个文件,把路径列表喂给 claude
claude-this() {
    local files
    files=$(fd --type f --hidden --exclude .git \
        | fzf --multi \
              --height 60% \
              --preview 'bat --color=always --line-range :100 {}' \
              --prompt 'Send files to Claude > ' \
              --header 'TAB to mark, ENTER to send')
    
    [ -z "$files" ] && return
    
    # 把选中文件的路径喂给 Claude 当 prompt
    local prompt
    prompt=$(echo "$files" | sed 's/^/- /')
    prompt="Read these files and explain the architecture:

$prompt"
    
    echo "$prompt" | claude
}
```

```bash
$ claude-this
# 弹出 fzf,Tab 标记多个文件,Enter
# Claude 拿到一个 prompt:
#   Read these files and explain the architecture:
#   - src/auth/login.ts
#   - src/auth/session.ts
#   - src/auth/middleware.ts
```

**这套姿势比"手敲 @ 文件名"快 10 倍**。

### 5.2 进阶变种:按 prompt 模板组合

```zsh
claude-refactor() {
    local files
    files=$(fd --type f -e ts -e tsx \
        | fzf --multi --prompt 'Files to refactor > ')
    [ -z "$files" ] && return
    
    local task
    task=$(gum input --placeholder "What refactoring?")
    [ -z "$task" ] && return
    
    local prompt
    prompt="Refactor the following files:

$(echo "$files" | sed 's/^/- /')

Task: $task

Requirements:
- Don't break existing tests
- Keep public API stable
- Add a one-line commit message at the end"
    
    echo "$prompt" | claude
}
```

```bash
$ claude-refactor
# fzf 选文件 → gum input 输入任务 → 组装 prompt 喂给 Claude
```

**这是"半结构化任务"的 1 秒起步姿势**——选文件 + 一句任务,Claude 就拿到完整 prompt。

### 5.3 把 fzf 嵌进 Claude 自己

也可以反过来:**Claude 在跑过程中,通过 hook 或 slash command 调 fzf 让你选**:

```bash
# .claude/commands/pick-files.sh
#!/usr/bin/env bash
fd --type f | fzf --multi
```

```markdown
# .claude/commands/pick-files.md
---
description: Pick files via fzf and pass to next prompt
---

Run `bash .claude/commands/pick-files.sh` and use the output as targets for the next task.
```

```
你在 Claude 里输入:
   /pick-files
   接下来对这些文件做 X

Claude 调 fzf → 你选 → Claude 拿到列表
```

**这种集成是 Claude Code 在 IDE 里做不到的**——VS Code 嵌入式 Claude 没法调系统 fzf。

---

## 六、方案 4:多 instance 并行

Claude Code 可以跑多个 instance —— 不同 tmux session 跑不同项目的 Claude,或者同一项目的不同任务。

### 6.1 典型场景:三 instance

```
┌──────────────────────────────────────────────────────────────────┐
│ tmux session: project-a                                          │
│   pane 1: claude (refactoring branch)                            │
│   pane 2: shell (git, tests)                                     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ tmux session: project-a-review                                   │
│   pane 1: claude --resume <session-id>                           │
│           ── 让 Claude 在另一个分支 review 上面那个 Claude 的产出 │
│   pane 2: shell                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ tmux session: project-b                                          │
│   pane 1: claude (写文档)                                        │
│   pane 2: shell                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**心智**:**一个 instance 写代码 + 一个 instance review + 一个 instance 写文档**——三个 Claude 在不同上下文同时干。

### 6.2 切换:`tmux switch-client`

```bash
# 列所有 session
C-b s

# 直接切到某个 session
$ tmux switch-client -t project-b

# 配 prefix + 数字直接切
# .tmux.conf
bind 1 switch-client -t project-a
bind 2 switch-client -t project-a-review
bind 3 switch-client -t project-b
```

### 6.3 重要:不要在同一个项目同时改

```
危险姿势:同一个 git repo 两个 Claude instance 同时改文件

  instance 1: 改 src/auth.ts
  instance 2: 改 src/auth.ts(同时)
  → 冲突 / 互相覆盖 / 一个的改动被另一个吃掉

正解:
  □ 不同项目:OK
  □ 同项目读不同子目录:OK(但你心里要清楚)
  □ 同项目改同子目录:坚决不要,或用 git worktree(下一节)
```

---

## 七、方案 5:Claude + git worktree

**让 Claude 在 git worktree(平行分支)里干活,不污染主工作目录**——这是高级姿势,适合"大重构"或"试验性改动"。

### 7.1 git worktree 速成

```bash
# 在主 repo 里创建一个 worktree,放在 ../myapp-refactor
$ cd ~/code/myapp                   # 主工作目录
$ git worktree add ../myapp-refactor refactor-branch

# 现在两个目录同时存在
~/code/myapp              # main 分支
~/code/myapp-refactor     # refactor 分支(同一个 .git)

# 两边可以独立编辑,不互相影响
```

### 7.2 在 worktree 里跑 Claude

```bash
$ cd ~/code/myapp-refactor
$ claude
> refactor src/auth/* to use Result<T, E> pattern
```

**Claude 改的是 refactor 分支的文件**,你主工作目录的 main 分支不受影响。

### 7.3 完事 merge / 丢弃

```bash
# 进 worktree 看 Claude 改了什么
$ cd ~/code/myapp-refactor
$ git log --oneline
$ git diff main

# 满意:merge 回 main
$ cd ~/code/myapp
$ git merge refactor-branch

# 不满意:丢弃整个 worktree
$ git worktree remove ../myapp-refactor
$ git branch -D refactor-branch
```

**这套姿势让 Claude 大改不必担心污染主工作目录**——你 main 分支随时能 `pnpm dev` 验证,Claude 的实验在另一个目录里独立进行。

### 7.4 配 Justfile 一键 worktree

```just
# Justfile

# 在 ../<project>-<branch> 创建 worktree 并起 Claude
worktree branch:
    #!/usr/bin/env bash
    set -e
    project=$(basename "$(pwd)")
    target="../${project}-{{branch}}"
    
    if [ -d "$target" ]; then
        echo "Worktree $target exists"
    else
        git worktree add "$target" -b "{{branch}}"
    fi
    
    # 在新 worktree 里起 tmux + claude
    SESSION="${project}-{{branch}}"
    tmux new-session -d -s "$SESSION" -c "$target"
    tmux send-keys -t "$SESSION" "claude" C-m
    tmux attach -t "$SESSION"

worktree-remove branch:
    #!/usr/bin/env bash
    project=$(basename "$(pwd)")
    tmux kill-session -t "${project}-{{branch}}" 2>/dev/null || true
    git worktree remove "../${project}-{{branch}}"
    git branch -D "{{branch}}" || true
```

```bash
$ just worktree refactor-auth         # 一键开 worktree + Claude
$ just worktree-remove refactor-auth  # 一键清理
```

---

## 八、长任务的完成"信号"

Claude 跑 30 分钟的任务,你不会盯屏幕。**你需要"完成通知"**。

### 8.1 hook:Stop 事件发通知

`~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/notify.sh"
          }
        ]
      }
    ]
  }
}
```

`~/.claude/hooks/notify.sh`:

```bash
#!/usr/bin/env bash
# macOS 桌面通知
osascript -e 'display notification "Claude finished a task" with title "Claude Code" sound name "Glass"'

# Linux:
# notify-send "Claude Code" "Finished a task"

# 远端机:用 ntfy.sh 推到手机
# curl -d "Claude finished refactor" ntfy.sh/your-topic-name
```

```bash
$ chmod +x ~/.claude/hooks/notify.sh
```

**Claude 每次完成一轮响应,你的桌面 / 手机弹个通知**——不必盯屏幕。

### 8.2 推手机:ntfy.sh

```bash
#!/usr/bin/env bash
# ~/.claude/hooks/notify.sh
# 推到 ntfy.sh,手机装 ntfy app 订阅 your-topic 就能收到
curl -d "Claude task done" "https://ntfy.sh/claude-<your-name>"
```

```
你在远端 dev box 让 Claude 跑一晚上
手机睡前 mute,设了"Claude" 这个 topic 允许通知
凌晨 3 点 Claude 完成 → 推送但不响铃
明早起来看一眼:"哦,跑完了"
8 点 ssh attach 看结果
```

### 8.3 监控:watch + tmux capture-pane

如果你不想用 hook,**远程 watch 一个 tmux pane 的输出**:

```bash
# 每 30 秒抓一次 pane 内容,grep 是否出现完成关键词
watch -n 30 'ssh dev "tmux capture-pane -p -t claude" | tail -20'
```

或写到日志,本地 tail -f:

```bash
$ ssh dev "tmux capture-pane -p -t claude" >> ~/claude-log.txt
$ tail -f ~/claude-log.txt
```

---

## 九、CLAUDE.md:项目记忆

**项目根放一个 CLAUDE.md,Claude 启动时自动读**——这是"项目说明书 + 风格规范 + 禁忌"。

### 9.1 一份 50 行模板

```markdown
# 项目说明

## 项目是什么
- 内部 CRM 系统,服务销售 + 售后 ~200 人 DAU
- 后端 monorepo(本仓库),前端在 myapp-frontend

## 技术栈
- 语言:TypeScript strict、Python 3.12
- 后端:NestJS + Postgres 16 + Redis + RabbitMQ
- 部署:K8s on EKS,镜像走 GHCR
- 监控:Datadog + Sentry

## 目录结构
- apps/api/     主后端 API
- apps/worker/  消费 MQ 的 worker
- packages/db/  Drizzle schema(改这里 = 改数据库)
- packages/shared/  跨服务共享类型
- scripts/      ops 脚本(不要往这堆任务,任务用 Justfile)

## 约定
- commit message:conventional commits(feat: / fix: / refactor:)
- 数据库改动一律走 migration
- 新 API 走 tRPC,不要再写 REST
- 测试用 vitest,不要 jest
- Python 部分用 ruff + pytest,不要 black + unittest

## 命令(用 just)
- just dev          起 tmux + claude + 你的 shell
- just test         跑测试
- just lint         lint 检查
- just migrate      跑数据库 migration
- just deploy <env> 部署

## 地雷区
- apps/api/src/auth/        鉴权,改前先 plan
- packages/db/schema/       schema 改 = migration,慎重
- apps/worker/src/billing/  付费,合规要 review

## 不在本项目处理
- 用户认证:走 Okta SSO
- 邮件:走 notification-service
- 支付:Stripe webhook 在 apps/api/src/webhooks/stripe.ts

## Claude 行为偏好
- 改 schema 必须先 plan
- 不要主动 commit,改完让我 review
- 生成的 commit message 不要带 Co-Authored-By
- 测试要写到 *.spec.ts,放在被测文件同目录
```

### 9.2 用户级 vs 项目级

```
~/.claude/CLAUDE.md            个人偏好(语气、习惯、跨项目通用)
./CLAUDE.md                    项目级(技术栈、约定、地雷)
```

**优先级**:**项目级胜出**——LLM 距离任务更近的指令更可信。

### 9.3 反面教材:CLAUDE.md 写法

```markdown
# ❌ 反例 1:空泛
我们用 TypeScript,请帮我写好代码,谢谢。
   → 没信息量,Claude 仍要靠 grep 猜约定

# ❌ 反例 2:堆个人喜好
请用驼峰命名,函数名用动词开头,行尾不要分号,
我喜欢用 const 不喜欢 let,请永远不要用 var,
还有我个人喜欢这样写 if 语句...
   → 这些是 linter 的活,不是 CLAUDE.md 的活

# ✅ 正例:事实 + 约束 + 禁区
- 技术栈用什么(事实)
- 命令怎么跑(约束)
- 哪里改不得(禁区)
- 不在本项目做的(边界)
```

**CLAUDE.md 是「让 Claude 跳过盲目 grep」的捷径**——写事实,不写偏好。

---

## 十、slash 命令 / hooks / agents:工作流意义点名

这些 claudeLearning 系列有详细文档,这里只点**工作流里它们的位置**。

### 10.1 slash commands

```
/clear           清当前 session 上下文(任务切换时用)
/init            读项目结构,生成 CLAUDE.md 初稿
/<custom>        你的自定义 prompt 模板
```

```
工作流意义:
   把 "frequent prompt" 模板化
   "review 这次改动 + 跑测试 + 写 commit message" → /review
   "审一下这个 PR 的安全" → /security-review
   
   你重复输入 5 次以上的 prompt,做成 slash command
```

### 10.2 hooks

```
PreToolUse / PostToolUse 等  生命周期事件,自动跑脚本

工作流意义:
   "Edit 文件后自动跑 prettier"      → PostToolUse hook
   "Claude 完成响应桌面通知"          → Stop hook
   "禁止读 .env 文件"                  → PreToolUse hook + 拒绝
   
   任何 "每次 X 一定要 Y" 的诉求,用 hook
```

### 10.3 sub-agents

```
让 Claude 在子上下文派发任务给另一个 Claude

工作流意义:
   主 Claude 负责 high-level 计划
   子 Claude 负责具体执行(read code、改文件)
   主 Claude 不被子任务的 context 噪音污染
   
   适合:大重构 / 多步骤研究任务
```

**这三件事在 claudeLearning 04-08 篇详细讲,这里只让你知道工作流里它们的位置**——你**不需要**为了用 Claude Code 立刻全部上,但**你应该知道遇到什么场景去查哪一篇**。

---

## 十一、和 IDE 怎么混合

不是非此即彼——**混合模式**才是大多数人的姿势。

### 11.1 三种典型混合

```
模式 A:VS Code 主 + 终端 Claude 辅
   ── 你 90% 时间在 VS Code 看代码
   ── tmux 里另起 Claude 跑长任务
   ── 写代码: VS Code;让 Claude 干: tmux Claude
   适合:从 IDE 党温和过渡

模式 B:本地 VS Code 看 + 远端 Claude 跑
   ── VS Code 本地打开项目,看代码、debug
   ── ssh dev,远端 tmux 跑 Claude
   ── Claude 改完 push,本地 git pull 看 diff
   适合:跑 GPU / 长任务 / 跨机器

模式 C:终端原生,Claude + Neovim
   ── tmux 一个 session,Neovim + Claude pane
   ── 全程不打开 VS Code
   ── 远端机器同样无缝
   适合:深度终端工作流,通常 SRE / 远程工程师
```

### 11.2 VS Code 集成 Claude Code 的限制

```
VS Code 里嵌入 Claude 的姿势:
   - 装 VS Code 扩展 (Anthropic 官方或 Cline 之类)
   - 或在底部 Terminal 直接跑 claude

限制:
   ✗ VS Code 一关,嵌入式 Claude 死,长任务报废
   ✗ 远端 VS Code Remote 在堡垒机 / 容器后失效
   ✗ 多窗口并行差(VS Code 是单一窗口体验)
   ✗ 跨机器同步配置麻烦(VS Code settings 本地化重)

适合:
   ✓ 单机本地编辑场景
   ✓ 重 IDE 功能(debug UI / refactor UI)的场景
   ✓ 不需要长任务的"对话式"使用
```

### 11.3 一个推荐姿势

```
日常 dev:
   - 本地 Neovim / VS Code 编辑代码
   - 本地 tmux 一个 session,Claude 在 pane 里
   - 长任务(refactor / 数据处理):远端 tmux

CI / batch:
   - GitHub Actions 里跑 claude -p "审一下这次 PR"
   - cron 里跑 claude 做定期任务

调研 / 探索:
   - 本地 tmux + Claude,fzf 选文件喂
```

**不要把 Claude 锁在一个使用姿势里**——它是一个 CLI,**适合什么姿势就用什么姿势**。

---

## 十二、真实工程师一天

把上面所有东西串起来,**一个使用 Claude + tmux + fzf + 远端的真实工程师一天**:

```
09:00  到公司,打开笔记本
       $ just dev
       → tmux session 起来,左 pane Claude,右 pane 你的 shell
       → /clear,告诉 Claude 今天要做什么
       → Claude:"读 spec.md 和 src/auth/*,理解现状"
       → 它读了 20 分钟

10:00  Claude 提出 plan(slash plan-mode):
       "重构 auth 模块,3 个 phase,各 phase 后跑测试"
       你看 plan,改了两处,确认。
       Claude 开始 phase 1,改了 30 个文件,跑测试,过了。
       你在右 pane 跑 git log 看 diff,review,OK。

12:00  Claude 启动 phase 2(大改,可能 1 小时)
       你 detach tmux,去吃饭

13:00  回来 `just dev` attach,看 Claude 跑到一半
       通知:phase 2 完成,但 3 个测试失败
       你看失败的测试:Claude 改了一个 API signature,old callsite 没改完
       你和 Claude 说:"修一下 callsites"
       Claude 用 rg 找 callsite,改了,过

14:00  Claude phase 3 启动,你切右 pane,刷 Slack、看 PR
       Claude 在左 pane 默默改

15:30  Claude 完成所有 phase
       你 review 完整 diff,过的 commit,不过的 ask Claude 改

17:00  下班前:让 Claude 跑一个 batch 任务
       "把 200 个 controller 加 OpenTelemetry tracing,
        每改一个跑 lint + 测试,失败回滚,日志写 OTEL_LOG.md"
       
       这个任务 Claude 估计要 4-6 小时。
       你 ssh dev,把任务搬到远端 tmux(同样的 prompt),
       detach,关本地 tmux,合电脑,走人。

21:00  在家吃完饭看了眼手机:ntfy 推送说 Claude 完成
       打开笔记本,$ ssh dev -t "tmux attach -t claude"
       看到 OTEL_LOG.md 累计 200 行,180 成功,20 回滚
       你今天就到这,明早 review 详细日志

次日 09:00  ssh attach,看回滚的 20 个为什么失败
            Claude 解释:"这 20 个用了非标准 error 包装"
            你说:"按非标准包装的姿势加 OTEL"
            Claude 重做,过 18 个,2 个手动改
            10:00 完成,commit,push

总产出:
   一个 controller refactor + 一个 200 文件 OTEL 批量任务
   你的"在场"时间:5 小时(plan、review、决策、修复)
   你的"不在场" Claude 跑:11 小时
   ── 这就是终端 + Claude Code 的真实威力
```

**这一天的核心**:**Claude 在跑的时候你不被绑住**——能去吃饭、能下班、能睡觉,**Claude 在远端 tmux 里继续干**。

---

## 十三、反对的写法

### 13.1 反对 1:把 Claude Code 当 IDE 插件

```
✗ 永远只在 VS Code 底部 Terminal 跑 claude
✗ 离开 VS Code 就不会用 Claude
✗ Claude 长任务要靠"不要关 VS Code"维持

→ 你的 Claude 能力被 VS Code 的进程模型绑住
→ 离开 VS Code = 离开 Claude
```

**改**:**至少会一种 tmux + claude 的姿势,知道 detach / attach**。

### 13.2 反对 2:同一项目多 instance 并发改

```
✗ 一个 Claude 改 src/auth.ts,另一个 Claude 同时改 src/auth.ts
✗ 一个 Claude 改 main,另一个 Claude 改 main(不在 worktree)
   → 改动互相覆盖 / 冲突 / 一个吃掉另一个

→ 不知道哪个改动是哪个的
→ 你 review diff 时看到自己也搞不清楚的状态
```

**改**:**同项目同时改一定用 git worktree 隔离;不用 worktree 就别开两个 Claude**。

### 13.3 反对 3:长任务不 attach 不看

```
✗ 让 Claude 跑一晚上,完全不看进度
✗ 8 小时后回来发现 Claude 第一小时就卡住了,白等 7 小时

→ Claude 是同事,不是黑盒
→ 它会问问题、会遇到错误、会卡住
```

**改**:**长任务每 1-2 小时 attach 一次,或配 hook 桌面通知 + 中间状态写 log**。

### 13.4 反对 4:CLAUDE.md 不写 / 写得乱

```
✗ 没 CLAUDE.md → Claude 每次都 grep 猜约定,慢
✗ CLAUDE.md 200 行 → Claude context 被吃太多 token

→ 中间状态:50 行,事实 + 约束 + 禁区,够了
```

**改**:**50-100 行,写本节模板的内容,半年回头修一次**。

### 13.5 反对 5:Claude 改完不 review 直接 commit

```
✗ Claude 写了一段代码 → 直接 commit
✗ 没人看 diff
✗ 上 prod 才发现 Claude 改了一个不该改的地方

→ Claude 是同事,你是 reviewer
→ 同事的 PR 你不看,出事谁负责?
```

**改**:**Claude 写完一定 `git diff` 看;大改一定本地跑 test;别让 Claude 直接 push main**。

### 13.6 反对 6:hook / slash / agents 一个不用

```
✗ 重复输入 "review this PR" 10 次 → 没做 /review slash
✗ Claude 改文件后忘了跑 prettier 5 次 → 没做 PostToolUse hook
✗ 大重构丢一个 Claude 上下文炸了 → 没用 sub-agents

→ Claude Code 的"工程化"层全部没用
→ 你用 Claude 的姿势停留在"对话框"
```

**改**:**每写 5 次同样的 prompt,做成 slash;每错过 3 次自动化,加 hook**。

### 13.7 反对 7:不知道远端 dev box 这套姿势

```
✗ 大任务都跑本地,笔记本不敢关
✗ 跨机器迁移 dotfiles 都没,远端没 claude / tmux 配置
✗ ssh 进去就是裸的 bash,没 zsh / 别名 / fzf

→ 你被"必须本地"框住了
→ Claude 的可调度时间 = 你笔记本开机时间
```

**改**:**配一台远端 dev box(EC2 / 自家小机器都行),dotfiles 同步,tmux + claude 长驻**。

### 13.8 反对 8:Claude 改一会儿 / context 没清

```
✗ 一个 session 跑了 8 小时,从 "refactor auth" 到 "改 deploy 脚本"
✗ 中间没 /clear,context 累计 200K token
✗ Claude 越来越慢,越来越糊涂

→ Claude 的"短期记忆"是它的工作内存,糊了它就糊
```

**改**:**任务切换时 /clear;一个大任务做完 /clear;不要一个 session 跑一整天混合任务**。

---

## 十四、跨机器 Claude 工作流:本地 + dev box

把"本地适合什么、远端适合什么"分清楚。

### 14.1 分工表

```
┌─────────────────────────────────────────────────────────────┐
│  本地笔记本 适合                                              │
├─────────────────────────────────────────────────────────────┤
│  ✓ 小改、单文件修改、看代码                                   │
│  ✓ 写代码思路、写 plan、review diff                          │
│  ✓ 跑 IDE 看完整代码                                          │
│  ✓ 短任务(< 10 分钟)                                         │
│  ✓ 演示给同事看                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  远端 dev box 适合                                            │
├─────────────────────────────────────────────────────────────┤
│  ✓ 长任务(refactor、批量改 200 个文件)                      │
│  ✓ 跑全套测试(本地 5 分钟,大机 1 分钟)                     │
│  ✓ 笔记本合盖也要继续跑                                       │
│  ✓ 训练 / 大数据处理(GPU / 大内存)                          │
│  ✓ 跨地点工作(在咖啡馆笔记本,主力 dev box 在公司)            │
│  ✓ 团队共享(同事可以 attach 同一 tmux)                      │
└─────────────────────────────────────────────────────────────┘
```

### 14.2 ssh agent forwarding:共享 GitHub key

```ssh
# ~/.ssh/config
Host dev
    HostName dev.example.com
    User work
    ForwardAgent yes      # ← 远端 git 操作复用本地 key
```

```bash
# 本地
$ ssh-add ~/.ssh/id_ed25519

# 远端
[dev]$ git push           # 复用了本地的 GitHub key,不用远端再配
```

### 14.3 API key 共享

**Anthropic API key 不能 forward**(SSH 不 forward env),要么写远端 `.zshrc`,要么用 1Password CLI / pass / 各种密钥管理工具:

```bash
# 远端 ~/.zshrc
export ANTHROPIC_API_KEY=$(op read "op://Work/Anthropic/api_key")
```

**注意安全**:远端机如果是公司共享的,API key 写明文 .zshrc 风险高。**最好用密钥管理工具按需读取**。

### 14.4 dotfiles 跨机一致

22 篇讲过 chezmoi / Nix。**远端机一行命令拉下你本地的全套配置**:

```bash
[dev]$ sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply your-github/dotfiles
```

这之后远端机的 `.zshrc` / `.tmux.conf` / `.config/nvim` / `.claude/settings.json` 跟本地一致——**Claude Code 在远端的"体验"和本地一样**。

---

## 十五、看完应该能

```
□ 能解释为什么 Claude Code 不适合永远跑在 VS Code Terminal 里
  (举得出 3 个场景)

□ 能用 just + tmux 一行命令起 "Claude + 你的 shell" 工作 session

□ 能在远端 dev box 上让 Claude 跑一晚上,笔记本合盖也活着

□ 能用 fzf 选一批文件喂给 Claude,带 prompt 模板

□ 知道什么时候用 git worktree 隔离 Claude 的改动

□ 配过 Stop hook 发桌面通知 / 推手机(完成信号)

□ 写过一份 50 行的 CLAUDE.md,事实 + 约束 + 禁区

□ 能给团队一份"混合 IDE + 终端 Claude"的姿势建议

□ 反对的写法你都能 3 秒认出来:
  ── IDE 党、并发改、长任务不看、不写 CLAUDE.md、改完不 review
```

如果上面这 9 条你都能做到,**这一篇就值了**——你就完成了从「会用 Claude Code」到「把 Claude Code 嵌进工程能力」的转型。

---

## 十六、节奏建议:今天就动一下

```
第一步(15 分钟):写一个 just dev recipe,起 tmux + claude + 你的 shell
                  (本篇方案 1)

第二步(30 分钟):写一个 claude-this fzf 函数,选文件喂 prompt
                  (本篇方案 3)

第三步(1 小时):  配 Stop hook 桌面通知(本篇第八节)

第四步(30 分钟):写一份项目 CLAUDE.md(本篇第九节)

第五步(2 小时):  配一台远端 dev box(云 VM 或公司开发机),
                  dotfiles 拉下,验证 ssh attach 远端 claude 流畅

第六步:           接下来一周,所有 > 15 分钟的 Claude 任务
                  全部走远端 tmux,本地只做 review

总耗时:首次配置 < 4 小时,长期受益每天 1-2 小时
```

---

## 十七、踩坑提醒(总结 + 30 篇前瞻)

```
1. 把 Claude Code 当 IDE 插件用                → 改 tmux 用
2. 长任务跑本地不 detach                       → 上远端 tmux
3. 同项目并发两个 Claude 改同文件              → 用 worktree
4. 没 CLAUDE.md / CLAUDE.md 200 行             → 50 行刚好
5. 改完不 review 直接 commit                   → 永远 git diff
6. 没用 hook / slash / agents                  → 重复 5 次就做成自动化
7. ssh 没配,每次都打长命令                    → 15 篇 ssh config
8. 远端没 dotfiles 同步                        → 22 篇 chezmoi
9. session context 永不清                      → 任务切换 /clear
10. API key 写明文 + 共享机器                  → 用密钥管理工具
11. 一个 instance 干所有事(refactor + 文档)  → 多 instance 多 session
12. 桌面通知没配,盯屏幕等                     → Stop hook
```

**这 12 条是本系列从 01 到 29 篇沉淀下来的"Claude + 终端"工作流要点**——做到一半就比同行强。

---

## 十八、下一篇预告

下一篇:**`30-现代终端的未来.md`**——这一篇讲了「Claude Code 怎么嵌进终端工作流」,**下一篇讲整套终端工程的未来**:

```
2026 年的现代终端模拟器战国:
   - Warp:Rust + GPU + AI 集成,赌的是"重新发明终端 UX"
   - Ghostty:Mitchell Hashimoto(Hashicorp 创始人)亲手做,
     赌的是"GPU + 极简快"
   - WezTerm:Lua 可编程,赌的是"可扩展的 cross-platform"
   - Kitty:Python 配置,GPU 加速,赌的是"老派 Unix 风的现代化"
   - iTerm2 / Alacritty:老牌选手,各有受众

各自赌的是哪条路?
   - GPU 渲染是不是分水岭?
   - AI 集成进终端 vs Claude Code 这种 CLI 工具,哪个赢?
   - tmux 在新一代终端的 floating / panes 内置后还有意义吗?
   - 选型该看什么?

读完这一篇,你对"未来 5 年的终端长什么样"有判断力。
然后整套 terminalLearning 30 篇收尾——
你建立的就不再是"我会用终端",而是
"我能把工作流系统化、可复现、跨机迁移、并接入 AI 时代"。
```

**这是 terminalLearning 系列的倒数第二篇,29 篇的尽头是接到 AI 时代,30 篇的尽头是看到终端的下一站**。看完整套你就完成了从 GUI 党 / IDE 党到「**终端工作流工程师**」的整体转型。
