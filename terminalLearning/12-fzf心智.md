# fzf 心智:模糊匹配是 UI 模式,不是工具

你能找出一台工程师笔记本上**最被低估的 30KB 二进制文件**吗?不是 git、不是 rg、不是 jq——是 `fzf`。一个 Go 写的、不到 4MB 的小程序,**装上后用 5 年和不装,生产力差 2 倍**——这不是夸张,这是我反复在团队里看到的真实差距。**没装 fzf 的人**每天在终端里做这些事:写 `find . -name "*.go" | head -100 | grep handler | xargs vim`、按 `Ctrl+R` 反向搜历史、`docker ps` 后复制容器 ID 再贴回 `docker exec` 命令、`git branch` 看一眼分支名再 `git checkout feature/long-branch-name-1234`、`brew search redis` 翻三屏找包名再 `brew install`。**装了 fzf + 内化了它的人**,**上面这些动作全部是「敲两个字符 + Enter」**——他们不是"打字快",他们是**用了一种完全不同的 UI 模式**。

终端最大的瓶颈不是带宽、不是命令复杂度,**是你脑子里那个「我大概知道,但叫不出名字」的状态**——你知道某个分支大概叫 feature/auth-x、某个容器大概叫 backend-blah、某个文件大概在 src/handlers 下面,**但你不想敲全名,也不想翻屏对**。`grep | head` 解决不了这个——它需要你**先把答案敲对**。fzf 解决的正是这个心智断层:**让你边敲边过滤,看到了就 Enter**。

> 一句话先记住:**fzf 不是工具,是 UI 模式——任何命令的输出都能塞给它,瞬间变成"边打字边过滤"的交互式选择器。学会 `cmd | fzf | xargs cmd2` 这个三段式,生产力立刻翻倍**。

这一篇拆开来讲:**fzf 到底是什么(不是文件搜索器,不是历史命令工具)**、**三段式心智模型**、**10 个能让你少敲 80% 字符的真实场景**、**怎么把 fzf 包成函数变成日常肌肉记忆**、**fzf-tab 怎么让 zsh 的 TAB 补全升级成模糊匹配**、以及**这个 UI 模式的边界在哪里(它不是 IDE)**。

---

## 一、fzf 是什么 / 不是什么

90% 工程师对 fzf 的认知停在「**装了之后 Ctrl+R 变好用**」——这只是 fzf 顺手送的一个 binding,**完全没碰到核心**。fzf 的核心不是它自带的 binding,而是它本身的**程序契约**:

```
契约:
   stdin → fzf → stdout
   读什么:任意行(每行一个候选项)
   做什么:全屏 TUI,显示候选项 + 输入框,实时模糊匹配过滤
   返回什么:用户按 Enter 时,把选中的那一行写到 stdout
```

**就这么简单**。fzf 不知道你喂给它的是文件名、是分支名、是 docker 容器、是 SSH 主机——**它只看到行**。这是它最强大的设计:**它是 UI 层,数据来自任何命令**。

### 1.1 fzf 是什么

```
是                                  解释
─────────────────────────────────────────────────────────────
TUI 程序                            装在终端里,占满终端窗口
stdin/stdout 友好                   能塞进 Unix 管道
模糊匹配算法                        Smith-Waterman 变种,
                                    打字「fz」匹配「fuzzy」「filezilla」「foo-z」
按键交互式                          上下方向选、Tab 多选、Enter 输出
预览窗口                            可选,边滚动边调用外部命令显示
shell 集成                          装完默认绑 Ctrl-R / Ctrl-T / Alt-C
```

### 1.2 fzf 不是什么

```
不是                                为什么
─────────────────────────────────────────────────────────────
文件搜索器                          找文件是 fd 的事
                                    fzf 显示 fd 的输出,不自己找
历史命令工具                        找历史是 atuin / Ctrl-R 的事
                                    fzf 是 UI 层,可以接管 Ctrl-R
代码搜索器                          找代码是 rg 的事
                                    fzf 显示 rg 的输出
编辑器                              你选完它就退出
                                    打开编辑还是 vim / nvim 的事
IDE 跳转                            它不懂语法
                                    跳函数定义用 LSP / ast-grep
```

**最常见的误解**:看到别人 `fzf` 一键找文件,以为 fzf "会搜文件"。**不**——别人是 `fd | fzf` 或者用了 fzf 默认的 `FZF_DEFAULT_COMMAND=fd`,**fd 在搜文件,fzf 只是在显示和过滤 fd 的输出**。这个区分弄清楚了,你才能解锁后面所有的玩法。

### 1.3 fzf 的核心是 UI 层

**记住这张图,这是这一篇的全部**:

```
任何命令的输出           ──┐
                            │   ┌─────────┐
fd / git branch / docker ps │──▶│   fzf   │──▶ 选中那一行
kubectl / brew / history    │   │ (UI 层) │     (输出到 stdout)
ssh config / make targets   │   └─────────┘
任何 stdin 行流          ──┘         │
                                      │
                                      ▼
                              后续命令拿去用:
                              vim "$(...)"
                              xargs git checkout
                              $(...)
```

任何**产生行**的命令都能当 fzf 的数据源。fzf 不关心你喂的是什么,它只对行做模糊过滤——**所以学会 fzf 的回报是「你以前学的所有 CLI 工具立刻乘 2」**:fd 配 fzf 就是模糊文件跳转,git 配 fzf 就是模糊分支切换,kubectl 配 fzf 就是模糊 pod 选择。

---

## 二、三段式心智模型

**学不学得会 fzf,看你能不能内化这张图**:

```
┌─────────────┐      ┌──────────┐      ┌──────────────┐
│   数据源    │ ───▶ │   fzf    │ ───▶ │  后续命令    │
│ (任意 cmd)  │      │  (UI层)  │      │ (xargs / $()) │
└─────────────┘      └──────────┘      └──────────────┘
      ↑                   ↑                    ↑
   产生候选行         交互式过滤           拿选中的行做事

数据源举例           fzf 给你选什么         后续命令做什么
─────────────────────────────────────────────────────────────
fd                   选哪个文件             vim / cat / less
git branch           选哪个分支             git checkout
git log --oneline    选哪个 commit          git show / git revert
docker ps            选哪个容器             docker exec / docker logs
kubectl get pods     选哪个 pod             kubectl logs / kubectl exec
brew search          选哪个包               brew install
history              选哪条历史             重新执行
ls ~/.ssh/known_hosts 选哪个主机           ssh
make -p              选哪个 target          make
npm scripts          选哪个 script          npm run
```

**这张图比下面的所有命令都重要**——任何时候你在终端里想「我大概知道我要哪个,但叫不上全名」,**就该想到这三段式**:**前面找一个能产生候选行的命令,中间夹 fzf,后面拿选中的行做事**。

### 2.1 三段式的退化形式

不是每次都需要严格三段——退化形式也合法:

```bash
# 一段:数据源就在 fzf 默认里(装完会用 $FZF_DEFAULT_COMMAND)
fzf                             # 选一个文件名输出到 stdout(没接后续)

# 两段:数据源 + fzf,没有后续命令(只是看选什么)
docker ps | fzf

# 三段:完整管道
docker exec -it "$(docker ps --format '{{.Names}}' | fzf)" bash

# 函数化:把三段包起来,塞进 .zshrc
gco() {
  git checkout "$(git branch | fzf | tr -d '* ')"
}
```

退化到一段时,fzf 用 `$FZF_DEFAULT_COMMAND` 当数据源(默认 `find`,**装完后该改成 `fd`**,后面讲)。

---

## 三、装 fzf 与最小验证

```bash
# macOS
brew install fzf

# Linux (Debian/Ubuntu)
sudo apt install fzf

# Linux (Arch)
sudo pacman -S fzf

# 任意系统(从二进制装最新)
git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
~/.fzf/install
```

**关键一步**——装 shell 集成(把 Ctrl-R / Ctrl-T / Alt-C 三个 binding 绑上):

```bash
# macOS Homebrew
$(brew --prefix)/opt/fzf/install

# 然后会问你:
# - Enable fuzzy auto-completion? (y/n)   → y
# - Enable key bindings?                  → y
# - Update shell configuration files?     → y
```

这一步会在 `.zshrc` 末尾追加几行:

```zsh
# Auto-generated by fzf install
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
```

`~/.fzf.zsh` 里 source 了两个文件:

```
$(brew --prefix)/opt/fzf/shell/completion.zsh    # 模糊补全(打 vim **<TAB>)
$(brew --prefix)/opt/fzf/shell/key-bindings.zsh  # Ctrl-R / Ctrl-T / Alt-C
```

最小验证:

```bash
ls | fzf                  # 选一行 ls 输出,按 Enter 看输出
echo -e "a\nb\nc" | fzf   # 三行候选
fzf                       # 默认数据源(没改前是 find,慢)
```

进去之后:

```
按键              做什么
──────────────────────────────────────────────────
Ctrl-J / Ctrl-K   下一项 / 上一项(类 vim)
方向键 ↑↓         同上
Tab               多选(--multi 模式才有效)
Enter             确认输出选中行
Esc / Ctrl-C      退出,不输出
Ctrl-A / Ctrl-E   输入框行首 / 行尾
Ctrl-W            删一个词
Ctrl-U            清空输入
```

---

## 四、fzf 自带的 3 个 binding

装完 shell 集成,默认有三个全局 binding,**这三个 binding 已经能改变你 50% 的终端体验**——但它们也只是 fzf 能力的冰山一角。

### 4.1 Ctrl-R:模糊搜历史

按下 `Ctrl-R`,屏幕变成这样:

```
> docker
  342  docker exec -it backend bash
  339  docker logs -f frontend
  337  docker compose up -d
  334  docker ps --format '{{.Names}}'
  330  docker pull redis:7
  328  docker stop $(docker ps -q)
  4/12423 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> docker_
```

**对比原生 Ctrl-R**:原生只能精确匹配子串、一次只看一条、要按 Ctrl-R 翻历史。**fzf 接管后**:模糊匹配、一屏看 10 条、上下方向键选、`!docker` 排除 docker、`'redis` 精确包含 redis(查询语法见后)。

**注意**:这不是「替代 atuin」——atuin 把历史推到 SQLite,跨机器同步、按 session/dir 过滤,**比 fzf-history 强一档**。**但 fzf-history 是零依赖、装上立刻有**。两者关系在 09 篇细讲。

### 4.2 Ctrl-T:在当前命令行插入选中的文件路径

正在打 `vim ` 但忘了文件名:

```
$ vim _
   按下 Ctrl-T
> src/handlers
  src/handlers/auth.go
  src/handlers/user.go
  src/handlers/order.go
  src/main.go
  src/config/db.go
  Tab 多选
  Enter 把选中的文件名插到当前位置
$ vim src/handlers/auth.go src/handlers/user.go
```

**威力**:你不需要离开正在敲的命令——`mv `、`cp `、`docker cp `、`kubectl cp ` 全部受益。

### 4.3 Alt-C:cd 到选中的目录

`Alt-C`(macOS 是 Option+C,iTerm/Ghostty 里要把 Option 设成 Meta 才生效)弹出目录候选,Enter 后 cd 过去:

```
   按下 Alt-C
> handler
  src/handlers
  src/handlers/internal
  test/handlers
  Enter
$ cd src/handlers
```

**对比传统 cd**:你不需要记 `src/handlers/internal` 的全路径——只要记得「handler」三个字符。

### 4.4 修改默认数据源

装完默认 Ctrl-T / Alt-C 用 `find`(慢、不 ignore .gitignore)。**第一件该做的事**是改用 fd:

```bash
# 加进 .zshrc(放在 source ~/.fzf.zsh 之前)
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
```

**改完之后**:Ctrl-T / Alt-C 立刻快 5-10 倍,而且默认 ignore `.git` 目录。这一行配置可能是终端工作流里**性价比最高的 10 秒投资**。

---

## 五、fzf 的预览(`--preview`)

**没有预览的 fzf 只能算 70 分**——预览是 fzf 真正改变 UI 模式的关键。

```bash
fzf --preview 'bat --color=always {}'
```

`{}` 是 fzf 替你填的占位符——**当前高亮那一行的内容**。每次你上下移动高亮,fzf 就**重新跑一次预览命令**,把 `{}` 替换成当前行。

屏幕变成:

```
┌─────────────────┬───────────────────────────────────────┐
│ > handler       │ // src/handlers/auth.go               │
│   auth.go       │ package handlers                      │
│   user.go       │                                       │
│   order.go      │ import (                              │
│   main.go       │     "context"                         │
│   config.go     │     "net/http"                        │
│                 │                                       │
│ 5/240           │ func AuthHandler(w http.ResponseWriter,│
│                 │     r *http.Request) {                │
│                 │     ...                               │
└─────────────────┴───────────────────────────────────────┘
   左边 fzf 列表       右边 bat 预览 (跟着高亮滚动)
```

### 5.1 预览窗口的位置和大小

```bash
fzf --preview 'bat --color=always {}' --preview-window=right:60%
fzf --preview 'bat --color=always {}' --preview-window=down:50%
fzf --preview 'bat --color=always {}' --preview-window=down:50%:wrap
fzf --preview 'bat --color=always {}' --preview-window=hidden       # 默认隐藏,后面绑键切
```

`right:60%` = 右边 60% 宽,默认是 50% 右边。

### 5.2 预览不是 fzf 跑代码,是 fzf 调外部命令

**关键认知**:预览窗口里跑的不是 fzf 自己——是 fzf 派的 subshell。**`{}` 是 fzf 替你做的占位符**,实际跑的命令是:

```bash
# 你写
fzf --preview 'bat --color=always {}'

# fzf 实际跑(每次高亮变化)
sh -c 'bat --color=always /Users/you/src/handlers/auth.go'
```

所以预览里你可以跑任何命令:`cat`、`head`、`bat`、`eza --tree`、`git log`、`docker inspect`、`kubectl describe`、`jq`——**fzf 不挑**。

### 5.3 占位符语法

```
{}              当前高亮行的全部
{1} {2} {3}     当前行按分隔符 split 后的第 1/2/3 个字段
{q}             用户当前输入的 query 字符串
{+}             多选时所有选中的行
```

`--delimiter ':'` 配 `{1}` `{2}` 是 rg 联动的关键(下面讲)。

### 5.4 预览切换键

预览窗口太大挡视线?**默认隐藏,按 `?` 切**:

```bash
fzf --preview 'bat --color=always {}' \
    --preview-window 'hidden' \
    --bind '?:toggle-preview'
```

按 `?` 切预览开关。这是个高频技巧。

---

## 六、十个真实场景

**这是这一篇的核心**——把 fzf 三段式套进日常,你会发现你以前敲的 50% 命令都是浪费。

### 场景 1:模糊找文件并 vim 打开

```bash
vim "$(fd | fzf --preview 'bat --color=always {}')"
```

**解释**:`fd` 列所有文件 → `fzf` 模糊选 + bat 预览 → `$()` 取选中那一行 → `vim` 打开。

### 场景 2:切换 git 分支(超高频)

```bash
git checkout "$(git branch | fzf | tr -d '* ')"
```

**解释**:`git branch` 列分支(当前分支前有 `*`) → `fzf` 选 → `tr -d '* '` 去掉星号和前导空格 → `git checkout` 切。**这个命令一旦用过就回不去了**——再也不用 `git checkout feature/long-branch-name-12345`。

### 场景 3:进 docker 容器

```bash
docker exec -it "$(docker ps --format '{{.Names}}' | fzf)" bash
```

**解释**:`docker ps --format '{{.Names}}'` 只输出容器名 → `fzf` 选 → `docker exec -it ... bash` 进去。**对比传统**:`docker ps` 看 ID、复制、粘到 exec 后面——三步变一步。

### 场景 4:看 k8s pod 的日志

```bash
kubectl logs -f "$(kubectl get pods -o name | fzf)"
```

**解释**:`kubectl get pods -o name` 输出 `pod/foo-abc` 这种格式 → `fzf` 选 → `kubectl logs -f` 跟着看。**多个 namespace 时**:加 `--all-namespaces` 然后让 fzf 显示完整路径。

### 场景 5:历史命令重跑(atuin 之外的备选)

```bash
print -z "$(history | fzf | sed 's/^ *[0-9]* *//')"
```

**解释**:`history` 列历史 → `fzf` 选 → `sed` 去掉前面的编号 → `print -z` 把命令塞回 zsh 命令行编辑(不执行,等你 Enter)。**`print -z` 是 zsh 独有的「往命令行插一行」**——比 `eval` 安全,你可以先看再 Enter。

### 场景 6:cd 到深层目录

```bash
cd "$(fd -t d . | fzf --preview 'eza --tree --level=2 {}')"
```

**解释**:`fd -t d` 列所有目录(d=directory) → `fzf` 选 + eza 预览这个目录的树状结构 → `cd` 过去。**对比 Alt-C**:这条多了预览,适合你不确定目录里有什么时用。

### 场景 7:批量删除分支

```bash
git branch | fzf -m | xargs git branch -d
```

**解释**:`git branch` 列分支 → `fzf -m`(multi-select,Tab 多选)→ `xargs git branch -d` 批量删。**清理本地 stale 分支神器**。

### 场景 8:用 rg + fzf 找代码并跳转

```bash
rg --line-number --no-heading --color=always . \
  | fzf --ansi \
        --delimiter=: \
        --preview 'bat --color=always {1} --highlight-line {2}' \
        --preview-window 'right:60%:+{2}-/2'
```

**解释**:
- `rg --line-number` 输出 `file:line:content`
- `fzf --ansi` 保留 rg 的颜色
- `--delimiter=:` 把每行按 `:` 切成 `{1}` `{2}` `{3}`
- `--preview 'bat ... {1} --highlight-line {2}'` 预览 {1}(文件)并高亮 {2}(行号)
- `--preview-window '...:+{2}-/2'` 预览滚到 {2} 这一行(在窗口中央)

**这一条命令替代了 IDE 的全局搜索**——700 行的代码片段在 fzf 里实时过滤。

### 场景 9:brew install 选包

```bash
brew install $(brew search '' | fzf -m)
```

**解释**:`brew search ''` 列所有包(几万个) → `fzf -m` 多选 → `brew install` 批量装。**注意**:`brew search ''` 可能很慢,可以先 `brew search redis | fzf` 缩小范围。

### 场景 10:ssh 已知主机

```bash
ssh "$(awk '/^Host / && $2 !~ /[*?]/ {print $2}' ~/.ssh/config | fzf)"
```

**解释**:`awk` 从 ssh config 里抽出 `Host xxx` 行的主机名(排除带通配符的) → `fzf` 选 → `ssh` 连。**配合 15 篇的 ssh config 用,跳 jump host 也是一键的事**。

### 场景 11(送的):git log 浏览

```bash
git log --oneline --color=always \
  | fzf --ansi --preview 'git show --color=always {1}' \
        --bind 'enter:execute(git show {1} | less -R)'
```

**解释**:`git log --oneline` 输出 `commit-hash message` → fzf 选 → 右边预览 `git show` → Enter 时跑 `git show | less` 看完整 diff。**`--bind 'enter:execute(...)'` 是 fzf 0.30+ 的新能力**——选中后不退出 fzf,而是跑一个命令。

### 场景 12(再送一个):npm scripts 模糊跑

```bash
# package.json 的 scripts 字段
npm run $(jq -r '.scripts | keys[]' package.json | fzf)
```

**解释**:`jq` 抽 scripts 的 keys → fzf 选 → npm run。**比 `npm run` 然后翻一屏脚本快 5 倍**。

---

## 七、包成函数,塞进 .zshrc

上面这些命令**每次都敲不可能**——**包成函数,起一个三字母名,塞进 .zshrc**,这才是日常使用方式。

```zsh
# ─────── v: 用 fzf 选一个文件用 nvim 打开 ───────
v() {
  local file
  file=$(fd -t f --hidden --exclude .git \
    | fzf --preview 'bat --color=always {}' \
          --preview-window 'right:60%:wrap')
  [ -n "$file" ] && nvim "$file"
}

# ─────── gco: git checkout 模糊版 ───────
gco() {
  local branch
  branch=$(git branch --all \
    | grep -v HEAD \
    | sed 's/^[ *] //' \
    | sed 's|remotes/origin/||' \
    | sort -u \
    | fzf --preview 'git log --oneline --color=always {}')
  [ -n "$branch" ] && git checkout "$branch"
}

# ─────── fcd: fuzzy cd ───────
fcd() {
  local dir
  dir=$(fd -t d --hidden --exclude .git \
    | fzf --preview 'eza --tree --level=2 --color=always {}')
  [ -n "$dir" ] && cd "$dir"
}

# ─────── dex: docker exec 模糊 ───────
dex() {
  local container
  container=$(docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' \
    | fzf --header='Name  Image  Status' \
          --preview 'docker inspect $(echo {} | cut -f1)' \
    | cut -f1)
  [ -n "$container" ] && docker exec -it "$container" bash
}

# ─────── kex: kubectl exec 模糊 ───────
kex() {
  local pod
  pod=$(kubectl get pods -o name | fzf --preview 'kubectl describe {}')
  [ -n "$pod" ] && kubectl exec -it "$pod" -- bash
}

# ─────── klog: kubectl logs 模糊 ───────
klog() {
  local pod
  pod=$(kubectl get pods -o name | fzf --preview 'kubectl logs --tail=50 {}')
  [ -n "$pod" ] && kubectl logs -f "$pod"
}

# ─────── frg: ripgrep + fzf,选中后用 nvim 打开并跳到行号 ───────
frg() {
  local result
  result=$(rg --line-number --no-heading --color=always "${1:-}" \
    | fzf --ansi --delimiter=: \
          --preview 'bat --color=always {1} --highlight-line {2}' \
          --preview-window 'right:60%:+{2}-/2')
  [ -n "$result" ] && nvim "$(echo "$result" | cut -d: -f1)" \
                           "+$(echo "$result" | cut -d: -f2)"
}
```

**为什么包函数**:
1. 起一个三字母名(`v` / `gco` / `fcd`/ `dex` / `kex` / `klog` / `frg`),**肌肉记忆**。
2. **加 `[ -n "$file" ] && ...`**——Esc 退出 fzf 时返回空,直接 `nvim ""` 会报错。
3. 默认参数、preview、preview-window 配齐——**每次都最佳体验**。

把上面这段塞进 `~/.config/zsh/fzf-functions.zsh`,在 `.zshrc` source 一下,**从此以后这 7 个函数是你终端的「快捷键」**。

---

## 八、fzf-tab:让 zsh 的 TAB 补全升级

**这是 zsh 用户的杀手锏**——`fzf-tab` 这个插件用 fzf 接管 zsh 的 TAB 补全:**任何命令的 TAB,补全候选都用 fzf 展示**。

### 8.1 装

```zsh
# zinit 一行
zinit light Aloxaf/fzf-tab

# antidote 加进 .zsh_plugins.txt
Aloxaf/fzf-tab

# 手动 git clone
git clone https://github.com/Aloxaf/fzf-tab ~/.zsh/fzf-tab
echo 'source ~/.zsh/fzf-tab/fzf-tab.plugin.zsh' >> ~/.zshrc
```

### 8.2 装完之后

```
$ git checkout <TAB>
   ↓ 不是默认那种「显示一坨候选,你再敲字符过滤」
   ↓ 而是 fzf 直接弹出来:
> feat
  feature/auth-improvement
  feature/oauth2-login
  feat/billing-page
  4/35
```

任何命令 + TAB 都模糊:`cd <TAB>` / `kill <TAB>`(进程) / `ssh <TAB>`(主机)/ `git branch <TAB>` / `docker exec <TAB>` / `kubectl logs <TAB>` / `make <TAB>` / `npm run <TAB>`。**只要 zsh 的补全系统认得**,fzf-tab 就接管。

### 8.3 配预览

fzf-tab 配预览的 zstyle 一行:

```zsh
# .zshrc(在 source fzf-tab 之后)
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza --tree --color=always --level=2 $realpath'
zstyle ':fzf-tab:complete:*:*' fzf-preview 'less ${(Q)realpath}'
zstyle ':fzf-tab:complete:git-checkout:*' fzf-preview 'git log --color=always --oneline $word'
```

**`$realpath` 是 fzf-tab 给你的变量**——当前高亮的那个补全候选的真实路径。

### 8.4 fzf-tab vs 普通菜单补全

```
zsh 菜单补全(zstyle ':completion:*' menu select)
   ↓
   方向键选,选项变成蓝色高亮
   ↓
   候选 50+ 时,要 Tab 翻页,看不到全貌

fzf-tab
   ↓
   直接弹 fzf 全屏窗口,所有候选一屏
   ↓
   边打字边过滤,即使 1000 个候选也能即时找
```

**结论**:**安装 fzf-tab 是 zsh 用户的免税**——零学习成本,所有 TAB 立刻强化。

---

## 九、fzf 与 ripgrep 的联动:实时搜代码

上面场景 8 写了一个一次性的 `rg | fzf`,**但 fzf 还有个更强的玩法:边输入边重新搜**。

### 9.1 基本版(一次 rg)

```bash
rg --line-number --color=always '' \
  | fzf --ansi \
        --delimiter : \
        --preview 'bat --color=always {1} --highlight-line {2}' \
        --bind 'enter:become(nvim {1} +{2})'
```

**关键点**:
- `rg ''` 输出所有行,fzf 在里面过滤
- `--bind 'enter:become(nvim {1} +{2})'` 是 fzf 0.38+ 的杀手:**选中后直接 exec `nvim file +line`**,不返回 shell
- `become` 不同于 `execute`——`become` 是用 nvim **替换** fzf 进程,nvim 退出后回 shell;`execute` 是跑完命令回 fzf

### 9.2 高级版(每次输入触发 rg 重跑)

```bash
INITIAL_QUERY="${*:-}"
RG_PREFIX="rg --column --line-number --no-heading --color=always --smart-case"

fzf --ansi --disabled --query "$INITIAL_QUERY" \
    --bind "start:reload:$RG_PREFIX {q}" \
    --bind "change:reload:sleep 0.1; $RG_PREFIX {q} || true" \
    --delimiter : \
    --preview 'bat --color=always {1} --highlight-line {2}' \
    --preview-window 'right,60%,border-left,+{2}+3/3,~3' \
    --bind 'enter:become(nvim {1} +{2})'
```

**讲一遍**:
- `--disabled`:**关掉 fzf 自己的过滤**——所有过滤交给 rg
- `--bind 'start:reload:$RG_PREFIX {q}'`:启动时跑一次 rg
- `--bind 'change:reload:...'`:**每次输入变化,重跑 rg**(`sleep 0.1` 是防抖)
- `{q}` 是 fzf 当前 query

**效果**:fzf 变成一个**实时搜代码 IDE**——你敲 `auth`,rg 立刻搜 `auth`,fzf 显示;你改成 `authz`,rg 重跑搜 `authz`,fzf 刷新。**这条命令替代了上百个 IDE 的"全局搜索"功能**。

### 9.3 包成函数

```zsh
# rg + fzf + nvim,边输入边搜
rfv() {
  RG_PREFIX="rg --column --line-number --no-heading --color=always --smart-case"
  : | fzf --ansi --disabled --query "${*:-}" \
          --bind "start:reload:$RG_PREFIX {q}" \
          --bind "change:reload:sleep 0.1; $RG_PREFIX {q} || true" \
          --delimiter : \
          --preview 'bat --color=always {1} --highlight-line {2}' \
          --preview-window 'right,60%,border-left,+{2}+3/3,~3' \
          --bind 'enter:become(nvim {1} +{2})'
}

# 用法
rfv                    # 进去边打边搜
rfv "func.*Handler"    # 带初始 query 进
```

**塞进 .zshrc**,这是我每天用最多的一个函数。

---

## 十、多选 + 批处理

`fzf -m` 或 `fzf --multi` 是多选模式,Tab 切换选中。**多选解锁批处理工作流**。

```bash
# 1. 批量删除分支
git branch | fzf -m | xargs -L1 git branch -D

# 2. 批量打开文件
fd | fzf -m | xargs nvim

# 3. 批量 git add
git status -s | fzf -m | awk '{print $2}' | xargs git add

# 4. 批量装 brew 包
brew search '' | fzf -m | xargs brew install

# 5. 批量删 docker 容器
docker ps -a --format '{{.Names}}' | fzf -m | xargs docker rm -f

# 6. 批量 kill 进程
ps aux | fzf -m --header-lines=1 | awk '{print $2}' | xargs kill -9
```

**注意**:
- `xargs -L1`:每行一个参数(`git branch -D` 一次接一个分支)
- `xargs nvim`:所有参数一次给 nvim(打开多个 buffer)

### 10.1 多选的 UI

```
┌─────────────────────────────────────────┐
│   branch-a                              │
│ > branch-b           ← Tab 选中(▶)    │
│   ▶ branch-c                            │
│   ▶ branch-d                            │
│   branch-e                              │
│  2/5 (2 selected)                       │
│ > _                                     │
└─────────────────────────────────────────┘
   Tab 切换选中 / Ctrl-A 全选 / Ctrl-D 反选
```

---

## 十一、配置 FZF_DEFAULT_OPTS

`FZF_DEFAULT_OPTS` 是所有 fzf 调用的默认 flag——**配一次,处处生效**。

```bash
# .zshrc 或 .zprofile
export FZF_DEFAULT_OPTS="
  --height=40%
  --layout=reverse
  --border=rounded
  --info=inline
  --prompt='❯ '
  --pointer='▶'
  --marker='✓'
  --preview-window=right:50%:hidden
  --bind='?:toggle-preview'
  --bind='ctrl-a:select-all'
  --bind='ctrl-d:deselect-all'
  --bind='ctrl-y:execute-silent(echo -n {2..} | pbcopy)'
  --color=fg:#c0caf5,bg:#1a1b26,hl:#ff9e64
  --color=fg+:#c0caf5,bg+:#292e42,hl+:#ff9e64
  --color=info:#7aa2f7,prompt:#7dcfff,pointer:#7dcfff
  --color=marker:#9ece6a,spinner:#9ece6a,header:#9ece6a
"
```

逐行讲:

| 选项 | 做什么 |
| --- | --- |
| `--height=40%` | fzf 占终端高度 40%(不是全屏)——大屏不刺眼 |
| `--layout=reverse` | 输入框在上,候选在下(顶部输入更顺手) |
| `--border=rounded` | 圆角边框 |
| `--info=inline` | 候选数 `4/240` 显示在输入框右边,不占独立一行 |
| `--prompt='❯ '` / `--pointer='▶'` | 自定义指针图标 |
| `--preview-window=right:50%:hidden` | 默认隐藏预览 |
| `--bind='?:toggle-preview'` | `?` 切预览 |
| `--bind='ctrl-a:select-all'` | Ctrl-A 全选 |
| `--bind='ctrl-y:execute-silent(echo -n {2..} | pbcopy)'` | Ctrl-Y 复制选中行第 2 段往后到 macOS 剪贴板 |
| `--color=...` | 配色,这里用 Tokyo Night 调色板 |

**还要配数据源**:

```bash
# 默认数据源(fzf 不接管道时用什么命令产生候选)
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'

# Ctrl-T 用什么命令
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_CTRL_T_OPTS="--preview 'bat --color=always {} | head -100'"

# Alt-C 用什么命令(目录)
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
export FZF_ALT_C_OPTS="--preview 'eza --tree --color=always --level=2 {}'"

# Ctrl-R 历史预览
export FZF_CTRL_R_OPTS="
  --preview 'echo {}'
  --preview-window 'down:3:hidden:wrap'
  --bind 'ctrl-/:toggle-preview'
  --bind 'ctrl-y:execute-silent(echo -n {2..} | pbcopy)+abort'
  --header 'Press CTRL-Y to copy, CTRL-/ to toggle preview'
"
```

**改了这一节,fzf 立刻像换了一个工具**——配色舒服、预览好用、键位顺手。

---

## 十二、fzf 的查询语法

fzf 不是只能模糊匹配——**输入框里可以用一套小型查询语法**:

```
查询              意思
─────────────────────────────────────────────────────────────
foo bar           包含 foo 和 bar(顺序不限,模糊)
'foo              精确包含 foo(开头单引号表示精确)
^foo              以 foo 开头
foo$              以 foo 结尾
!foo              不包含 foo
!^foo             不以 foo 开头
foo | bar         包含 foo 或包含 bar
'.go$ !test       以 .go 结尾,且不含 test
```

**实战例子**:

```
# 找 src/ 下的 Go 文件但排除 test
$ fd | fzf
> ^src/ '.go$ !test

# 在 git log 里找 fix 或 hotfix
$ git log --oneline | fzf
> 'fix | 'hotfix
```

`'`、`^`、`$`、`!`、`|` 这五个**记住就有 50% 收益**——尤其 `!`(排除),配上 `'`(精确),能在 10000 行候选里精准捞出几条。

### 12.1 切换模式键

```
按键              做什么
────────────────────────────────────────────
Ctrl-S            切「精确 vs 模糊」全局开关
Alt-Z             切「不区分大小写 / 智能 / 区分」
```

默认是模糊 + 智能大小写(`smart-case`,有大写时区分大小写,否则不区分)——**绝大多数时候不需要切**。

---

## 十三、fzf vs ripgrep+jq vs LSP:边界在哪

**这三个工具看起来像"都能找东西",其实定位完全不同**:

```
工具         定位                          典型场景
─────────────────────────────────────────────────────────────
fzf          人工选择(UI 模式)              「我大概知道,边敲边过滤」
rg + jq      脚本输入(parse 已知数据)        「我已经知道要什么,只是过滤数据」
LSP / ast-grep 代码符号(理解语法)           「跳到 fn AuthHandler 的定义」
```

**判断该用哪个的 3 个问题**:

1. **要的是「选一个」还是「过滤一批」?** 选一个 → fzf;过滤一批喂下游 → rg + jq
2. **数据规模多大?** 1 万行内 fzf 顶得住;10 万行起 fzf 卡,先 rg 过滤再喂 fzf
3. **要懂语法吗?** 「找所有调用 Foo 的地方」要懂语法 → LSP / ast-grep;**fzf 不懂任何语法**

### 13.1 三者不冲突,常常组合

```bash
# 1. rg 过滤大数据,fzf 选一行,LSP 不参与
rg "func.*Handler" --files-with-matches | fzf | xargs nvim

# 2. jq 过滤 JSON 出候选,fzf 让人选
kubectl get pods -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name)"' | fzf

# 3. LSP 在 fzf 之外(nvim 里 gd / gr)
nvim "$(fd | fzf)"        # fzf 选文件
                            # 进 nvim 后用 LSP 跳定义、找引用
```

**结论**:**fzf 是 UI 模式,rg/jq 是数据流,LSP 是语法层**——三个维度,组合使用才是终极姿势。

---

## 十四、反对的写法

这一节列**反复见过**的反模式:

### 14.1 用 fzf 当文本编辑器

```bash
# 错的:在 fzf 里改东西
fzf  # 然后想编辑选中的那行 → fzf 不是编辑器
```

**解法**:fzf 选完输出到 stdout,**编辑用 nvim / sed**——`nvim "$(... | fzf)"`。

### 14.2 fzf 处理 10 万行 stdin

```bash
# 错的:把整个 /usr 的文件喂进去
find /usr | fzf

# 卡到等几秒才有响应——fzf 是 Go 写的有上限的
```

**解法**:**先用 rg / fd 过滤再喂 fzf**:

```bash
fd . /usr --type f | grep -v '.gz$' | fzf
# 或者直接限定路径
fd . /usr/local --type f | fzf
```

经验值:**1 万行以内 fzf 体感 0 延迟,10 万行有可感延迟,100 万行卡住**。

### 14.3 把 fzf 当 IDE 跳函数定义

```bash
# 错的:rg "func Foo" | fzf,以为是跳定义
rg "func Foo" | fzf
```

**解法**:**跳函数定义用 LSP**(`gd` in nvim)、**找引用用 LSP `gr` 或 ast-grep**——fzf 不懂 `func Foo {}` 和注释里的 `// func Foo` 区别,LSP 懂。

### 14.4 嵌套 fzf 三层

```bash
# 错的:fzf 套 fzf 套 fzf
fzf_choose_repo() {
  cd "$(ls ~/code | fzf)" && \
  vim "$(fd | fzf)" && \
  git checkout "$(git branch | fzf)"
}
```

**这是设计问题**——三次模糊选,**用户根本记不住状态**。一两层就够,**三层意味着你的工作流没设计**。

**解法**:**拆成 3 个独立函数**,各自单独用——`cdr` 进 repo、`v` 选文件、`gco` 切分支。

### 14.5 给 fzf 喂未过滤的 git log

```bash
# 错的:大仓库 50000 个 commit
git log | fzf
```

**解法**:**限定范围**:

```bash
git log --oneline -1000 | fzf       # 最近 1000 个
git log --oneline --since='1 month' | fzf  # 最近一个月
git log --oneline --author=$(git config user.email) | fzf  # 只看自己的
```

### 14.6 用 `fzf` 替代「明知道答案的命令」

```bash
# 错的:你知道分支叫 main,但你还是
git checkout "$(git branch | fzf)"
```

**fzf 是给「我大概记得,但不想敲全名」的场景用的**——**你 100% 确定答案时,直接敲完整命令**(配 zsh 历史前缀搜索 / atuin 的 inline 模式比 fzf 快)。

### 14.7 在 fzf 预览里跑慢命令

```bash
# 错的:预览里跑会跑很久的命令
fzf --preview 'go test ./{}/...'    # 每次高亮变化都跑测试
fzf --preview 'kubectl describe pod {} | head -1000 | yq ...'
```

预览命令应该**毫秒级返回**——fzf 每次高亮变化都重跑。**慢命令会让 fzf 看起来"卡"**。

**解法**:预览只用 `cat` / `bat` / `head` / 简单 `git show` / `kubectl describe`——**任何超过 100ms 的命令都不该进预览**。

---

## 十五、性能与排错

### 15.1 fzf 启动慢

```bash
# 测启动时间
time fzf <<< "test"
# real    0m0.005s   ← 正常
```

如果 > 100ms,**几乎一定是 FZF_DEFAULT_COMMAND 慢**——`find /` 这种全盘扫描会拖几秒。换 fd 立刻好。

### 15.2 fzf 在 tmux 里花屏

**症状**:fzf 退出后终端残留字符。

**原因**:tmux + 某些终端的组合下,`alt-screen` 切换有 bug。

**解法**:

```bash
# 强制 fzf 不用 alt-screen
export FZF_DEFAULT_OPTS="$FZF_DEFAULT_OPTS --no-mouse"

# 或者用 tmux 的 popup(fzf 0.34+)
export FZF_TMUX=1
export FZF_TMUX_OPTS='-p 80%,60%'   # tmux popup 80% 宽 60% 高
```

### 15.3 Alt-C / Ctrl-T 不生效

**通常是终端没把 Option 当 Meta**:

- **iTerm2**:Preferences → Profiles → Keys → Left/Right Option key: `Esc+`
- **Ghostty**:`option-as-alt = true`(config 里)
- **Terminal.app**:Preferences → Profiles → Keyboard → "Use Option as Meta key" ✓

不改的话 macOS 的 Option-C 是 `ç`,不是 fzf 接到的 Alt-C。

### 15.4 fzf 接管不了 zsh 的 TAB

**通常是 fzf-tab 加载顺序错**——必须在 `compinit` **之后**、其他补全插件**之前**加载:

```zsh
autoload -Uz compinit
compinit
# fzf-tab 必须在 compinit 之后
zinit light Aloxaf/fzf-tab
# zsh-autosuggestions 之类的在 fzf-tab 之后
zinit light zsh-users/zsh-autosuggestions
```

---

## 十六、看完这一篇你应该能

1. **不再把 fzf 当成"按 Ctrl-R 模糊搜历史的工具"**——它是 UI 模式,任何 stdin 都能喂。
2. **看到 `cmd | fzf | xargs cmd2` 这个三段式就能反应过来**:数据源 + UI + 后续命令。
3. **能写至少 5 个自己的 fzf 函数塞进 .zshrc**:`v` 选文件、`gco` 切分支、`fcd` 跳目录、`dex` 进容器、`klog` 看 pod 日志。
4. **能用 `rg + fzf + --bind enter:become` 替代 IDE 的全局搜索**——边输入边重跑 rg、选中后直接 nvim 打开并跳行号。
5. **会配 `FZF_DEFAULT_OPTS` 和 `FZF_DEFAULT_COMMAND`**——把 fzf 调到默认就好用,而不是每次手动加一堆 flag。
6. **知道 fzf 的边界**:不当文本编辑器、不喂 10 万行、不跳函数定义、不嵌三层——**它是 UI 层,语义层留给 LSP**。

---

## 十七、下一篇预告

`13-结构化数据处理.md`——**jq / yq / xsv / miller / dasel**:管道里处理 JSON / YAML / CSV / TSV。

fzf 是「**人选数据**」的 UI 层,但还有一类问题是「**数据选数据**」——`kubectl get pods -o json` 出来一个 5000 行的 JSON,你要从里面抽 `metadata.namespace == "prod"` 且 `status.phase != "Running"` 的所有 pod 名字。这种**结构化过滤、提取、变换**,bash 一行管不过来——这就是 jq / yq 的战场。13 篇讲清楚:

- **jq 的心智模型**:它是一门语言,不是 grep——`.items[] | select(.kind == "Deployment") | .metadata.name` 这种过滤管道
- **yq 的两个流派**:mikefarah/yq(Go 写,语法像 jq)vs kislyuk/yq(Python 写,实际是 jq 套个 YAML 转换),**选哪个**
- **xsv / miller 处理大 CSV**:`xsv frequency` 算列频次、`mlr` 跨格式转换
- **dasel** 想做「一个工具吃所有格式」,**但它的语法选了第三条路,该不该用**
- **jq + fzf 的联动**:`jq -r '.' | fzf` 把 JSON 流变成可选择项
