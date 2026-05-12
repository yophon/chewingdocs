# Devcontainer 与 Remote dev:把"代码 / 运行时 / 文件系统 / IDE UI"四件事拆开来选

工程师对「远程开发」最大的误解,是把它当成「**是用云,还是用本地**」这种二选一——以为「我有 MacBook M4 / 32G / 1TB,本地够用,远端开发是没钱买电脑的人才用的**」。**这种想法在 2026 之前可能还成立,2026 之后已经过时**。真相是:**一线工程师每天的工作,早就横跨「本地、容器、远端 dev box、Codespaces、Claude Code 远端 sandbox」五种环境**,问题从来不是「云 vs 本地」,而是「**这次任务,我把代码、运行时、文件系统、IDE UI 这四件事分别放在哪**」——这四个东西在哪儿,就是这次开发的"形状"。**把这四件事拆开来选**,你就不会再纠结「Devcontainer 好还是 Codespaces 好」这种伪问题,因为你知道它们的差别**只在这四个变量的部署位置上**。

> 一句话先记住:**远端开发不是"我用云还是用本地",是"代码、运行时、文件系统、IDE UI"四件事的部署位置——选哪种远端,看你最关心这四件事的哪一项**。SSH+tmux 把四件事全部留在远端,你只是个键盘;VS Code Remote SSH 把 UI 切回本地,其他三件留远端;Devcontainer 把运行时塞进容器,代码 / 文件系统 / UI 看你怎么 mount;Codespaces 全部上云,本地只剩浏览器或 thin client。**这四件事的部署组合,决定了你的开发体验、性能、网络依赖、成本结构**——这才是真问题。

这一篇拆开来讲:**本地开发的极限在哪 / 「四件事」框架 / 四种 remote dev 模式逐个走 / 文件系统差异表 / dotfiles 与 remote dev 联动 / 四个真实工作流 case / performance 考虑 / secret 处理 / Claude Code 在 remote dev 的位置 / 反对的写法**。看完你能在 5 分钟内判断:今天这个任务该走哪条路,而不是默认所有事都开 VS Code。

---

## 一、为什么 2026 之后本地开发不够了

### 1.1 本地开发的四种典型痛点

```
痛点 1:跨语言 / 跨 OS 环境装麻烦
   ─ 项目 A:Node 20 + Python 3.11 + Postgres 16
   ─ 项目 B:Node 18 + Python 3.10 + Postgres 14
   ─ 项目 C:Go 1.22 + Redis 7
   ─ 同一台 mac 要装这三个组合,nvm / pyenv / brew formula 各种串戏
   ─ 24 篇讲的 mise 能解决语言版本,但解决不了「Postgres 16 和 14 都装」
   ─ 解决不了「macOS 没原生支持的 Linux 工具」
   ─ 现实:周一为 A 改环境,周二切去 B 项目,环境全错,再花 2 小时切回

痛点 2:笔记本算力跟不上
   ─ MacBook M4 32G 算"高配",但你的同事的公司 dev box 是:
     ─ 256 GB RAM
     ─ 64 cores
     ─ 8 TB NVMe
     ─ 400 Gbps 内网
   ─ 编译一个 monorepo:笔记本 8 分钟,dev box 90 秒
   ─ 跑一次全量集成测试:笔记本 12 分钟,dev box 2 分钟
   ─ 一天编译 / 跑测试 10 次,笔记本累计浪费 1 小时,远端只浪费 8 分钟
   ─ 如果你每天 SSH 进 dev box 写代码,你比本地党快 1 小时

痛点 3:新员工 onboarding 一周配环境
   ─ "请按 README 装环境":Xcode CLI / brew / mise / pgsql / redis / 1Password CLI / kubectl / kubeconfig / VPN / ...
   ─ 一周下来,新人还在装环境,没产出 1 行代码
   ─ "我能不能直接用一个能跑的环境?"——本地 setup 的根本性瓶颈
   ─ 这是 Devcontainer / Codespaces 主张要解决的核心问题

痛点 4:数据 / secret 不能落本地
   ─ 公司合规要求:客户数据不能下载到笔记本
   ─ 项目密钥不能存本地磁盘
   ─ 但你又要在 dev 环境跑接近真实的数据
   ─ 解法:dev 环境跑在公司 dev box / 公司云 / Codespaces,
          代码 / 数据都在公司网络内,本地只有 IDE UI
```

**这四个痛点共同结论**:**「我用本地」的工作流,在 2026 已经只是一种选择,不再是默认选择**——很多场景下,你**应该**把工作流的某一部分(或全部)放到远端去。问题只是放哪、怎么放。

### 1.2 一个反直觉:你早就在用 remote dev,只是没意识到

```
你今天的工作流里,这些都属于 remote dev:

   ─ ssh 进堡垒机看日志           → SSH + tmux 模式
   ─ Cursor Remote SSH 连公司 dev → VS Code Remote SSH 模式
   ─ Codespaces 试用一下         → Codespaces 模式
   ─ docker-compose up + 本地 IDE → 半个 Devcontainer
   ─ Claude Code 远端 sandbox    → 极简 remote dev

   你已经在用,只是没系统化思考"我为什么这么用"
```

**这一篇就是把这些"日常都在用、但从没系统化"的姿势,理一遍——你才能开始优化它**。

---

## 二、「四件事」框架:remote dev 的根本变量

不去比较具体工具,先建一个心智框架——**任何一种"开发环境"都可以被拆成四个独立变量**:

```
┌────────────────────────────────────────────────────────────────┐
│  开发环境的四件事(部署位置可独立选)                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. 代码(source files)                                       │
│     - 你正在编辑的 .py / .ts / .rs                             │
│     - 通常在 git working tree 里                              │
│                                                                │
│  2. 运行时(runtime)                                          │
│     - Node / Python / Postgres / Redis 这些进程               │
│     - 包括 linter / formatter / LSP server                    │
│                                                                │
│  3. 文件系统(filesystem)                                     │
│     - node_modules / .venv / target / build 这些产物           │
│     - 占磁盘 / IO 频繁                                         │
│                                                                │
│  4. IDE UI(界面 + 输入)                                      │
│     - 你看到的窗口 + 键盘 mapping                              │
│     - LSP 渲染 / debug UI / git GUI                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**这四件事可以独立部署**——这就是为什么 remote dev 有那么多变种。把它画成一张组合表:

```
┌─────────────────┬────────┬──────────┬───────────┬───────────┐
│ 模式             │ 代码    │ 运行时    │ 文件系统    │ IDE UI    │
├─────────────────┼────────┼──────────┼───────────┼───────────┤
│ 纯本地           │ 本地    │ 本地     │ 本地       │ 本地       │
│ SSH + tmux       │ 远端    │ 远端     │ 远端       │ 远端(终端) │
│ VS Code Remote   │ 远端    │ 远端     │ 远端       │ 本地       │
│ Devcontainer 本地│ 本地    │ 容器     │ 本地 mount │ 本地       │
│ Devcontainer 远端│ 远端    │ 容器     │ 远端       │ 本地       │
│ Codespaces       │ 云      │ 云       │ 云         │ 本地 / 云  │
└─────────────────┴────────┴──────────┴───────────┴───────────┘
```

**看着这张表你就懂了**:

- VS Code Remote SSH 和 Codespaces 的差别,本质上只在「代码 / 运行时 / 文件系统」是在「你公司的 server」还是「GitHub 的云」——其他完全一样
- 本地 Devcontainer 和远端 Devcontainer 的差别,只在文件系统 mount 不同
- SSH + tmux 和 VS Code Remote SSH 的差别,只在 IDE UI 在哪边渲染

**选 remote dev 模式的本质,就是在这张表里挑一行**。挑哪一行,看你最在乎四件事里的哪一个。

---

## 三、四种 Remote dev 模式逐个走

### 3.1 模式 1:SSH + tmux + Neovim(经典)

```
┌─────────────────────────────────────────────────┐
│  你的 Mac                                        │
│    ┌────────────────┐                           │
│    │  Terminal      │ ← 你看到的全部              │
│    │  (本地)        │                           │
│    └────────┬───────┘                           │
│             │ ssh                                │
└─────────────┼───────────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────┐
   │  远端 Linux server            │
   │   ┌──────────────────────┐    │
   │   │  tmux session       │    │
   │   │   ┌──────────────┐  │    │
   │   │   │ Neovim       │  │    │
   │   │   │ ssh shell    │  │    │
   │   │   │ Claude Code  │  │    │
   │   │   └──────────────┘  │    │
   │   └──────────────────────┘    │
   │  (代码 + 运行时 + 文件系统 +  │
   │   IDE UI 全在这台机器上)      │
   └──────────────────────────────┘
```

**特点**:**本地只是个键盘和屏幕**——所有东西都在远端,本地只跑一个 SSH client。

**优点**:

- **零依赖**:任何远端 Linux 都能用,装个 ssh 就行,不需要 vscode-server
- **网络延迟最低**:只传字符,几百 bytes,200ms 延迟都能用
- **关 IDE 不影响**:tmux 持续运行,你电脑炸了远端任务还在跑
- **远端配置完全在远端**:不用同步,远端就是本体

**缺点**:

- **没有 IDE UX**:Neovim 的 LSP 跟 VS Code 比有差距(20-21 篇细讲),跳定义 / refactor / debug 都更费手
- **要求你会 tmux + Neovim / Helix**:GUI 党直接拒接

**真实场景**:

- 半夜服务器告警,SSH 进生产机查 / 改 / 重启
- 在公司 dev box 上跑长时间训练,自己关电脑下班
- 极简环境(distroless / Alpine / 没装 vscode-server 的 pod)
- Claude Code 长任务挂在远端 tmux pane

**这个模式是本系列前 25 篇默认的 mental model**——01-21 篇你学的所有东西(zsh / fzf / tmux / Neovim / Helix / ssh)在这条路上最直接发挥。

### 3.2 模式 2:VS Code Remote SSH(也含 Cursor)

```
┌──────────────────────────────────────────────────────────────┐
│  你的 Mac                                                     │
│    ┌─────────────────┐                                       │
│    │  VS Code / Cursor│ ← UI 全在本地                         │
│    │  本地 UI 渲染    │                                       │
│    └────────┬────────┘                                       │
│             │ ssh(Remote SSH 扩展自动配的)                  │
└─────────────┼────────────────────────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │  远端 Linux server                │
   │    ┌─────────────────────────┐    │
   │    │  vscode-server           │    │
   │    │  (Node 进程,本地启动时    │    │
   │    │   自动 scp 上去)         │    │
   │    └─────────────────────────┘    │
   │       │                          │
   │       │ 跑你的代码 + LSP + debug   │
   │       ▼                          │
   │    ┌─────────────────────────┐    │
   │    │  你的项目目录             │    │
   │    │  ~/projects/xxx          │    │
   │    └─────────────────────────┘    │
   └──────────────────────────────────┘
```

**特点**:**UI 在本地,其他全在远端**——VS Code 本体跑在你 mac 上,但通过一条 SSH 连接,把"打开文件 / 改文件 / 跑 terminal / 装扩展 / debug" 全部委托给远端的 `vscode-server`(一个 Node 进程,VS Code 自动 scp 到远端机器上跑)。

**配置只需要两步**:

```bash
# 1. 装扩展(VS Code Marketplace)
"Remote - SSH" (ms-vscode-remote.remote-ssh)

# 2. 配 ~/.ssh/config(15 篇讲过的)
cat >> ~/.ssh/config <<EOF
Host devbox
  HostName 10.0.1.100
  User ubuntu
  IdentityFile ~/.ssh/id_ed25519
  ForwardAgent yes
EOF
```

打开 VS Code → Command Palette → `Remote-SSH: Connect to Host` → 选 `devbox` → 新窗口连上去 → 远端 host 在状态栏左下角显示。

**优点**:

- **UI 体验 = 本地**:键盘 mapping、主题、字体、所有 VS Code 体验都本地,只是文件树和 terminal 是远端的
- **LSP / debug / refactor 全自动远端**:你点跳定义,vscode-server 在远端跑 LSP,把结果传回本地渲染
- **扩展可选「本地」或「远端」**:Prettier 在远端跑(跑你远端的代码),Vim 模拟器在本地跑(只管 UI)
- **支持 Cursor**:Cursor 是 VS Code fork,Remote SSH 扩展完全继承,Cursor 自己的 AI 功能也能远端用

**缺点**:

- **VS Code 锁定**:这是 VS Code Remote 协议,不是开放标准,JetBrains 有自己的(Gateway,做得没这个好),Vim 用不了
- **关网就断**:UI 在本地、状态在远端的连接,断网就要重连,有时候 vscode-server 会卡在「starting」
- **vscode-server 吃远端内存**:Node 进程跑 LSP,500MB-2GB,远端 server 内存小的话扛不住
- **vscode-server 启动慢**:第一次连一台新机器,要 scp + 安装,可能要 30-90 秒

**Cursor 版本说明**:Cursor 用同一套机制,但有自己的 cursor-server。装扩展时认准 `Remote - SSH`(同一个),Cursor 自动加载。

**真实场景**:

- 公司有 Linux dev box(高配),日常开发主战场
- 自己的代码 monorepo 太大,本地 build 慢,远端有 SSD + 64 核
- 远端 GPU(训模型),本地 IDE 改代码,远端跑 train

### 3.3 模式 3:Devcontainer(本地 Docker 或远端)

```
┌──────────────────────────────────────────────────────────────┐
│  你的 Mac                                                     │
│    ┌──────────────────┐                                      │
│    │  VS Code / Cursor │ ← UI 在本地                          │
│    └────────┬─────────┘                                      │
│             │                                                 │
│             ▼                                                 │
│    ┌──────────────────────────────┐                          │
│    │  Docker Desktop / Colima       │                          │
│    │    ┌───────────────────────┐   │                          │
│    │    │  devcontainer         │   │                          │
│    │    │   ┌─────────────────┐ │   │                          │
│    │    │   │ Python 3.12     │ │   │                          │
│    │    │   │ Node 20         │ │   │                          │
│    │    │   │ Postgres 16     │ │   │                          │
│    │    │   │ ─────────────── │ │   │                          │
│    │    │   │ /workspace ←── mount(host: ~/code/myapp)         │
│    │    │   │ /home/vscode    │ │   │                          │
│    │    │   └─────────────────┘ │   │                          │
│    │    └───────────────────────┘   │                          │
│    └──────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

**特点**:**运行时塞进 Docker 容器**——代码可以本地(mount)或远端,文件系统通过 mount 映射,IDE UI 本地。容器内是干净的 Linux,装着这个项目所有需要的东西。

**核心文件:`.devcontainer/devcontainer.json`**

一份真能跑的最小例子:

```jsonc
{
  "name": "Python Dev",
  // 用现成的 image,不写 Dockerfile
  "image": "mcr.microsoft.com/devcontainers/python:3.12",

  // features 是 devcontainer 规范的"插件":往 image 里加东西
  "features": {
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },

  // 容器跑起来后自动装项目依赖
  "postCreateCommand": "pip install -r requirements.txt && pre-commit install",

  // VS Code 这个项目需要的扩展(进容器自动装)
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "charliermarsh.ruff",
        "tamasfe.even-better-toml"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "[python]": {
          "editor.defaultFormatter": "charliermarsh.ruff"
        }
      }
    }
  },

  // 容器里跑的服务,自动把这些端口映射回本地
  "forwardPorts": [8000, 5432],

  // 远端用户名(避免容器内 root 写出来的文件本地 root 才能改)
  "remoteUser": "vscode"
}
```

**这个文件 commit 进 git 仓库**——新人 `git clone` 之后,VS Code 弹窗:「Reopen in Container」,点一下,**5 分钟后他的开发环境跟你完全一样**。

**CLI 也能用**(不一定要 VS Code):

```bash
# 装(Node 包)
npm install -g @devcontainers/cli

# 在项目根目录跑
cd myapp/
devcontainer up --workspace-folder .         # 启动容器
devcontainer exec --workspace-folder . bash  # 进容器
```

**这套 CLI 是微软出的,跟 VS Code 用同一个 devcontainer.json 文件**——意思是 Vim 用户也能用 Devcontainer,只是没自动 IDE 集成。

**优点**:

- **项目 commit 进 git**:`.devcontainer/` 跟代码同步,新人无配置
- **环境跟生产一致**:容器是 Linux,你 Mac 上跑出来的 build 行为跟 prod 一致(prod 也是 Linux)
- **多项目隔离**:项目 A 的容器跟项目 B 的容器完全独立,版本撞不到一起
- **dotfiles 自动注入**:devcontainer.json 可以指定你的 dotfiles repo,容器跑起来自动 clone + install
- **跨平台**:Mac / Windows / Linux 上的 Docker Desktop 行为一致(在 dev 环境里)

**缺点**:

- **Docker 加层**:macOS 上 Docker Desktop 本身要 8GB+ 内存,Apple Silicon 上虽然原生但仍然有开销
- **文件系统 IO 慢**(macOS):mount 是 VirtioFS / gRPC FUSE,跨虚拟机边界读小文件比本地慢 3-10 倍(node_modules / .venv 撞到这一项,慢得明显)
- **学习曲线**:写 devcontainer.json 跟写 Dockerfile 不一样,有自己的规范
- **不是所有工具都能容器化**:GUI 工具、依赖 macOS Keychain 的工具进不去容器

**性能优化(macOS)**:

```jsonc
// devcontainer.json 里
{
  // 让 node_modules / .venv 这些"产物"不 mount,只在容器内
  // 避免 IO 慢
  "mounts": [
    "source=myapp-node-modules,target=/workspace/node_modules,type=volume",
    "source=myapp-venv,target=/workspace/.venv,type=volume"
  ]
}
```

把高频 IO 的目录用 named volume 而不是 bind mount,**编译 / install 时间能砍 60-80%**。

### 3.4 模式 4:GitHub Codespaces / Gitpod / Coder

```
┌──────────────────────────────────────────────────────────────┐
│  你的 Mac / iPad / Chromebook                                 │
│    ┌────────────────┐                                        │
│    │  浏览器          │ 或者本地 VS Code 客户端                  │
│    │  (Web IDE)      │ (Remote SSH-like, 但远端是 GitHub 云的) │
│    └────────┬───────┘                                        │
└─────────────┼────────────────────────────────────────────────┘
              │ HTTPS
              ▼
   ┌──────────────────────────────────┐
   │  GitHub Codespaces 云              │
   │    ┌──────────────────────┐       │
   │    │  你的代码 + 工具链      │       │
   │    │  (从你 repo + 你的     │       │
   │    │   devcontainer.json)  │       │
   │    │  跑在云上的容器          │       │
   │    └──────────────────────┘       │
   └──────────────────────────────────┘
```

**特点**:**全部上云**——本地只剩浏览器(或一个 thin 客户端),代码 / 运行时 / 文件系统 / 大部分 UI 都在云上。**这是远端的极致版**。

**两种主流选择**:

| 工具 | 谁的 | 特点 | 价格 |
| --- | --- | --- | --- |
| **GitHub Codespaces** | GitHub | 跟 GitHub 一体化,SSO 直接通,认 devcontainer.json | 每月 60-120 核小时免费(Pro);多余 $0.18/核小时 |
| **Gitpod** | Gitpod | 开源,自托管 / SaaS 两种 | SaaS 每月 50 小时免费;Enterprise 自托管按 license |
| **Coder** | Coder | 企业自建,无 SaaS | License 按工程师人数 |

**GitHub Codespaces 启动一个 codespace 长这样**:

1. 你的 repo 有 `.devcontainer/devcontainer.json`
2. 在 GitHub 网页或 VS Code 里点「Open in Codespace」
3. GitHub 后台:起一台云 VM → pull image → 跑你 devcontainer 配置
4. 3-5 分钟后,VS Code 浏览器版打开,你在云上的容器里
5. 关浏览器,容器自动 suspend(不收费 idle 时间)
6. 30 天没用,自动删除

**优点**:

- **零本地依赖**:iPad / Chromebook / 网吧机器都能用
- **随时随地**:出差 / 多设备 / 临时帮看一下 PR
- **企业 SSO 自动通**:公司 GitHub 账号通,云上 dev box 也通,**离职第一天自动失效**
- **资源弹性**:云上能选 4 核 / 8 核 / 16 核 / 32 核,贵的项目临时升一档跑大编译
- **跨地域**:你飞到北美出差,选个就近 region 的 codespace,延迟比连国内 dev box 低

**缺点**:

- **贵**:免费额度够小项目,大项目跑 24/7 一个月几百刀
- **网速依赖**:虽然只传 VS Code 协议(几十 KB/s 平时),但低延迟连接才舒服;200ms+ 难受
- **代码上云**:**合规敏感的代码不能放 Codespaces**(GitHub-managed),要的话选 Coder 自建
- **长期方案得算成本**:VS Code Remote SSH 公司 dev box 一次性投入服务器钱 + 电费,Codespaces 是 SaaS 月付,**用得多比自建贵**

**真实场景**:

- 数字游民 / 多设备党:Mac + iPad + 公司 Mac 三个设备,Codespaces 是同一个环境
- 出差 / 临时调试:酒店 wifi,直接浏览器开 codespace,5 分钟搞定
- 开源项目贡献:点「Open in Codespace」,马上就能改、跑测试,不用本地 clone + 装环境
- 教学 / 演示:发一个 codespace 链接,对方一键就在环境里

### 3.5 一张图汇总四种模式

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│              代码         运行时        文件系统       IDE UI    │
│  ─────────────────────────────────────────────────────────────  │
│  SSH+tmux    远端         远端         远端          远端(终端) │
│              └─────────────┴────────────┴───────────┘           │
│              "本地只是个键盘"                                    │
│                                                                 │
│  VS Code     远端         远端         远端          本地        │
│  Remote SSH  └─────────────┴────────────┘           ┘           │
│              "UI 在本地,其他在远端"                             │
│                                                                 │
│  Devcontainer 本地  ─────  容器  ─── 本地 mount      本地        │
│  (local)                                                        │
│              "运行时容器化,其他本地"                            │
│                                                                 │
│  Devcontainer 远端  ───── 远端容器  ──── 远端         本地        │
│  (remote)                                                        │
│              "运行时容器化 + 整个容器在远端"                     │
│                                                                 │
│  Codespaces   云    ───── 云  ─── 云  ── 浏览器 / 本地          │
│              └─────────────┴────────────┘                       │
│              "全部上云"                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**这五行就是 remote dev 的"全景"**——后面所有的选型,都是在这五行里挑一行。

---

## 四、文件系统差异:四种模式在「文件 IO」上的真相

文件系统是 remote dev 里最容易被忽视、但**直接决定使用体验**的一个维度。把四种模式的「文件 IO 路径」逐个画出来:

```
┌──────────────────────────────────────────────────────────────────┐
│  SSH(纯)                                                       │
│    本地终端  ──(只传字符)──→  远端文件                          │
│    特点:文件不动,你只是在远端编辑                                │
│    问题:本地编辑器要看远端文件?要 scp 一份回来,编完再传回去   │
│    适合:Neovim 直接在远端跑、tmux 包住一切                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  VS Code Remote SSH                                              │
│    本地 UI  ─(VS Code 协议)─→  远端文件系统                     │
│    特点:打开一个文件,VS Code 协议传过来一段 buffer,本地编辑     │
│         保存时传回去,LSP 跑在远端,跳定义结果传回                │
│    问题:网络抖动会卡(50ms 内顺,200ms+ 难受)                  │
│    适合:你想要 VS Code UI + 远端计算                            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Devcontainer(本地 Docker,bind mount)                          │
│    本地文件  ←(bind mount)→  容器内 /workspace                  │
│    特点:文件物理上在 mac 上,容器通过 mount 访问                 │
│    问题:macOS 上 IO 慢——mount 跨虚拟机边界                      │
│    举例:node_modules 装 5 分钟(本地 90 秒)                    │
│    缓解:high-IO 目录用 named volume,不 bind                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Devcontainer(远端 server 上跑)                                │
│    远端文件  ←(原生 IO)→  容器                                │
│    特点:文件在远端 Linux 原生磁盘,容器在远端跑                  │
│    问题:你电脑跟远端的网络延迟(VS Code Remote 协议路径)        │
│    优势:文件 IO 跟 Linux 原生一样快                             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Codespaces                                                      │
│    云端文件  ←(原生 IO)→  云端容器                              │
│    UI                ─(浏览器 / VS Code 协议)→  云端           │
│    特点:文件在云端 NVMe,容器在云端,IO 原生                    │
│    问题:你的网到云端的延迟                                       │
└──────────────────────────────────────────────────────────────────┘
```

**结论**:

```
要 IO 快:
   - 远端 Linux / 云上原生最快
   - macOS Devcontainer bind mount 最慢
   - 用 named volume 缓解 macOS 慢

要编辑流畅:
   - 终端编辑:延迟 < 200ms 都行
   - VS Code Remote 协议:延迟 < 100ms 舒服
   - 浏览器 Codespaces:延迟 < 100ms 舒服

要离线工作:
   - SSH+tmux / VS Code Remote / Codespaces 全部要联网
   - 本地 Devcontainer 是唯一能离线干活的远端形态
```

**这是 remote dev 性能模型的最大单一变量**。

---

## 五、Dotfiles 与 Remote dev:让你的工作流跟随你过去

22 篇讲了 dotfiles 心智。**Remote dev 是 dotfiles 真正发挥威力的地方**——因为每次新开一台远端 / 一个新容器,本质都是「一台新机器」。

### 5.1 VS Code Remote SSH 的 dotfiles 同步

```
VS Code Remote SSH 自动同步两件事:
   1. settings.json(用户级,你本地的)→ 自动应用到远端 vscode-server
   2. 扩展:选「Install in SSH: devbox」,远端装一份

   不会自动:zsh / tmux / Neovim 配置(那是 shell 层,VS Code 不管)
```

**手动同步 shell 层的 dotfiles**:

```bash
# 在远端跑一次
cd ~
git clone https://github.com/youname/dotfiles
cd dotfiles
./install.sh         # 你的 chezmoi / stow / 裸脚本(22 篇讲过)
```

22 篇推荐过 chezmoi 的话,**一行命令**:

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply youname
```

### 5.2 Devcontainer 的 dotfiles 注入(规范化的)

Devcontainer 规范支持「自动 clone + install dotfiles」——**这是 Devcontainer 最被低估的功能之一**。

**两种配置方式**:

**方式 A:用户全局设置(VS Code)**

```jsonc
// ~/.config/Code/User/settings.json
{
  "dotfiles.repository": "https://github.com/youname/dotfiles",
  "dotfiles.targetPath": "~/dotfiles",
  "dotfiles.installCommand": "install.sh"
}
```

**所有的** devcontainer 跑起来都自动 clone 你 dotfiles → 跑 `install.sh`——**你新进一个容器,30 秒后 zsh / tmux / Neovim 跟你家电脑一模一样**。

**方式 B:项目级(devcontainer.json)**

```jsonc
{
  "image": "...",
  "remoteUser": "vscode",
  "containerEnv": {
    "DOTFILES_REPO": "https://github.com/youname/dotfiles"
  },
  "postCreateCommand": "git clone $DOTFILES_REPO ~/dotfiles && ~/dotfiles/install.sh"
}
```

**注意**:**install.sh 必须做防御性编程**——容器里很多工具不存在(brew、mac 专有的、不同 Linux 发行版的包名),你的 install.sh 在 mac 上跑得好好的,进容器一脚踩雷。

```bash
#!/usr/bin/env bash
# install.sh - 防御性写法
set -euo pipefail

# 检测 OS
case "$(uname -s)" in
  Darwin*) os="mac" ;;
  Linux*)  os="linux" ;;
  *)       os="unknown" ;;
esac

# 检测包管理器
if command -v brew &>/dev/null; then
  pm="brew"
elif command -v apt &>/dev/null; then
  pm="apt"
elif command -v apk &>/dev/null; then
  pm="apk"   # Alpine
else
  pm="none"
fi

# 装东西时按可用性来
install_tool() {
  local tool=$1
  if [ "$pm" = "brew" ]; then
    brew install "$tool" 2>/dev/null || echo "skip $tool"
  elif [ "$pm" = "apt" ]; then
    sudo apt install -y "$tool" 2>/dev/null || echo "skip $tool"
  fi
}

# 复制配置(这部分跨平台一致)
ln -sf "$PWD/zsh/.zshrc" ~/.zshrc
ln -sf "$PWD/tmux/.tmux.conf" ~/.tmux.conf

# 装可选工具(容器里可能没,跳过即可)
install_tool fzf
install_tool ripgrep
install_tool neovim
```

**这种"跨 mac / Linux / 容器"的 install.sh 是 dotfiles 工程化的真正考验**——本地能跑还不够,远端 dev box(可能 Ubuntu)、容器(可能 Alpine 或 Debian slim)都要能跑。

### 5.3 Codespaces 的 dotfiles

跟 Devcontainer 一样,**走 GitHub 用户级 dotfiles 配置**:

```
GitHub.com → Settings → Codespaces → Automatically install dotfiles
   ✓ 启用
   Repository: youname/dotfiles
```

之后,**你创建的所有 Codespaces 都自动 clone + install**。新人入职给他一个 codespace 链接,他第一次开,**dotfiles 同时跟上来**——这才叫真正的「一键复现」。

---

## 六、四个典型工作流 Case

不抽象讨论,拿四个真实场景说清楚「该用哪种模式」。

### 6.1 Case 1:个人项目,Mac 本地——Devcontainer 在本地 Docker

```
背景:你周末搞个开源副业项目,Python + FastAPI + Postgres
机器:MacBook Pro M3, 24G
诉求:
   - 不想污染本地 Python(已经装了 3.11、3.12、3.13)
   - Postgres 容器一起开关,不用本地 brew 装
   - 想试 Python 3.13 但还在 3.12 项目上保留
   - 离线咖啡馆也能写代码

最佳形态:本地 Devcontainer
```

**.devcontainer/devcontainer.json**:

```jsonc
{
  "name": "fastapi-side",
  "image": "mcr.microsoft.com/devcontainers/python:3.13",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "postCreateCommand": "pip install -e '.[dev]' && pre-commit install",
  "forwardPorts": [8000, 5432],
  "remoteUser": "vscode",

  "customizations": {
    "vscode": {
      "extensions": ["ms-python.python", "charliermarsh.ruff"]
    }
  },

  // 加速 IO
  "mounts": [
    "source=fastapi-side-venv,target=/workspace/.venv,type=volume"
  ]
}
```

加一个 `docker-compose.yml`(配合 Postgres):

```yaml
services:
  app:
    image: mcr.microsoft.com/devcontainers/python:3.13
    volumes:
      - ..:/workspace:cached
    command: sleep infinity
    depends_on: [db]

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]
```

**workflow**:VS Code 打开项目 → Reopen in Container → 容器跑起来,Postgres 也跑起来 → 写代码 → 关 VS Code,容器停。下次打开,2 秒恢复。

**好处**:本地 Mac 干净,所有 Python / Postgres 在容器里,**离线可用**(本地 Docker 不需要网)。

### 6.2 Case 2:公司有 dev box(Linux 高配)——VS Code Remote SSH + tmux

```
背景:公司给配了一台 Linux 高配 dev box(64 cores, 256G)
诉求:
   - 主战场就是这台,代码、build、跑测试都在这
   - 自己 Mac 只是个键盘 + 屏幕
   - 长任务(big build / training)挂在远端,自己下班不影响
   - 想用 VS Code 体验,但要保留 tmux 的 detach 能力

最佳形态:VS Code Remote SSH + tmux 并用
```

**workflow**:

```
平时:
   ─ VS Code 启动 → Remote SSH 连 devbox → 写代码、跑测试
   ─ debugger / LSP / refactor 都在 VS Code 里点
   ─ 顺手要跑长任务 → 在 VS Code 的 terminal 里 tmux attach my-build
   ─ 看 tmux 里的输出
   
要下班 / 离开 / 关电脑:
   ─ tmux 里的长任务自动继续(detach 之后不死)
   ─ VS Code 关掉:vscode-server 自动 suspend,远端进程不影响
   ─ 长任务跑完,你电脑都不用开,只是远端日志在累积
   
明早 / 出差:
   ─ 任意 Mac 打开 → VS Code Remote SSH 连 devbox → 恢复
   ─ tmux attach 看昨晚的输出
   ─ 工作流连续性 100%
```

**ssh config**(15 篇讲过):

```
Host devbox
  HostName 10.0.1.100
  User you
  IdentityFile ~/.ssh/id_ed25519
  ServerAliveInterval 60       # 防止网络空闲断连
  ServerAliveCountMax 3
  ControlMaster auto           # 复用连接,VS Code 多个 channel 共享一条 SSH
  ControlPath ~/.ssh/cm-%r@%h:%p
  ControlPersist 10m
```

### 6.3 Case 3:出差 / iPad / 多设备——Codespaces

```
背景:你出差 1 周,只带了 iPad + 蓝牙键盘
   或者:你有 Mac 公司 + Mac 家 + Linux 桌面三台机器,想要环境一致
诉求:
   - 不在乎本地算力
   - 网络稳定就行
   - 多设备同一份"开发环境"
   - 公司项目能走 SSO

最佳形态:GitHub Codespaces
```

**workflow**:

```
iPad / 网吧机器 / 任何浏览器:
   ─ 打开 github.com/myorg/myrepo
   ─ 「Open in Codespace」(自动用你最近的 codespace,或者新开一个)
   ─ 几秒钟,VS Code Web 在浏览器里跑
   ─ 你公司 GitHub SSO 自动通,代码权限自动有
   ─ devcontainer.json + dotfiles 自动加载,环境跟你 Mac 上一样
   
关浏览器 / iPad 没电:
   ─ Codespace suspend,你的代码状态保留
   
明天去公司用 Mac:
   ─ VS Code 客户端版,Codespace 列表里点你昨天那个
   ─ 客户端版的 UI 比浏览器更顺(键盘 mapping、字体)
   ─ 同一个 codespace,所以代码状态完全一致
```

**Codespaces 的成本算账**:

```
GitHub Pro 用户:每月 60 核小时免费(2 核机器 30 小时 / 4 核机器 15 小时)
   超出:$0.18/核小时

   每天 4 小时用 4 核 codespace,一个月:
      4 * 22 * 4 = 352 核小时
      免费 60,付费 292,= $52.56/月

   要长期当主力开发环境(每天 8 小时):
      8 * 22 * 4 = 704 核小时
      付费 644,= $115.92/月
      
   一年 $1391——快赶上一台 dev box 了,自建反而便宜
```

**这就是 Codespaces 长期方案要算成本的原因**——临时 / 出差 / 多设备超值,主力开发 24/7 跑就贵了。

### 6.4 Case 4:服务器排错——ssh + tmux + Neovim

```
背景:凌晨告警,K8s pod 持续 OOM,要进生产机查
诉求:
   - 进 pod 看现场
   - pod 里没装 vscode-server(distroless)
   - 防火墙限制了奇怪的工具
   - 网络不稳定

最佳形态:SSH + tmux + Neovim
```

**workflow**:

```
你电脑 → ssh 进堡垒机 → ssh 进 K8s node → kubectl exec 进 pod
   或者:本地 → ssh 远端 dev box → 跳板

在 dev box 上:
   ─ tmux new -s incident
   ─ window 1: ssh prod-node-3,跑 kubectl logs -f
   ─ window 2: kubectl exec into pod, top / pidof / strace
   ─ window 3: Neovim 改一个临时 patch,scp 进 pod
   ─ window 4: 跑监控 query 看趋势

关电脑:tmux session 保留,长 grep 一直跑
明早:tmux attach,继续昨晚的现场
```

**这就是 VS Code Remote 救不了的场景**:pod 里装不上 vscode-server,跳板多跳 VS Code 不支持。**SSH + tmux 是这种场景的最后一道防线**——也因此本系列 16-17 篇讲 tmux 那么细。

---

## 七、Performance 考虑(不浪漫,但决定每天舒不舒服)

### 7.1 三个性能维度

```
1. 网络延迟(对 VS Code Remote / Codespaces / SSH 终端)
   ─ < 50ms:跟本地无感
   ─ 50-100ms:能用,偶尔卡
   ─ 100-200ms:难受,字符回显有迟滞感
   ─ > 200ms:不能正经开发,只能跑命令看输出
   
   小 trick:VS Code Remote 协议比 SSH 终端"看起来"延迟更高,
            因为它要把 LSP 结果传回来渲染,
            实际场景下 100ms 比 SSH 多 30% 难受感。

2. 文件 IO(对 Devcontainer / 容器化任何场景)
   ─ macOS bind mount:小文件读 1-5MB/s(极慢)
   ─ Linux 原生:几十 GB/s
   ─ 容器内 named volume:接近 Linux 原生
   ─ Codespaces NVMe:几个 GB/s

   实际影响:
      ─ Mac Devcontainer 装 node_modules:5 min
      ─ Linux 原生:30 sec
      ─ Codespaces:30 sec
      
   差距 10 倍——直接决定"我愿不愿意每天用"

3. 计算资源(影响 build / test 时间)
   ─ MacBook M4 32G:够日常,大编译慢
   ─ 公司 dev box 64 核:大编译快 5-10×
   ─ Codespaces 大档(16 核):比 mac 快 2-3×,比 dev box 慢
   ─ AWS EC2 c7i.48xlarge:几乎随用随放,贵
   
   你时间值钱的话,一天 10 次大 build,本地慢的累计成本就出来了
```

### 7.2 macOS 上 Devcontainer 的"该用 / 不该用"

```
该用:
   ─ 项目本身 IO 不重(单文件代码、小 Python 项目)
   ─ 主要瓶颈是"环境隔离",不是"IO 速度"
   ─ 你愿意用 named volume 处理高 IO 目录
   
不该用:
   ─ JS 大型 monorepo(node_modules 几 GB,bind mount 让你哭)
   ─ 媒体处理 / ML(本地 GPU 进不去容器,且 IO 是瓶颈)
   ─ 你 mac 内存 < 16GB(Docker Desktop 自己就吃 8GB)
   
替代:
   ─ 远端 Devcontainer(放到 Linux dev box 上跑)
   ─ 或者 mise + brew 本地直跑(24 篇)
   ─ 或者 Codespaces
```

### 7.3 网络延迟 vs Codespaces 选 region

```
你在中国 → GitHub Codespaces region:
   ─ Southeast Asia (Singapore): 70-150ms
   ─ East Asia (Hong Kong): 50-100ms(挂梯子)
   ─ US West (Oregon): 200-300ms
   ─ US East: 250-400ms
   
   选 SE Asia 或 East Asia,日常可用
   选 US,只适合跑命令看输出,不适合长时间 UI 操作
```

**这就是 Codespaces 在国内"不友好"的根源**——region 离得远,延迟不可接受。Coder 自建 / 国内云厂商的类似产品可以缓解,但 ecosystem 不一样。

---

## 八、Secret 处理:不要把密钥进 image

### 8.1 三种 secret 处理姿势

```
❌ 错误姿势 1:写进 Dockerfile / devcontainer.json
   ─ "ENV API_KEY=xxx"
   ─ 进 git,所有人能看
   ─ 进 image,凡是 docker pull 的人都有
   ─ image 上传到 registry,泄漏放大

❌ 错误姿势 2:postCreateCommand 里 curl 一份下来
   ─ "postCreateCommand": "curl -sSL https://internal/secrets > .env"
   ─ 看起来不进 image,但 .env 留在容器内
   ─ 跨 dev / 容器重建,你不记得这个 .env 哪来的
   
✓ 正确姿势 1:Devcontainer secrets(2024 新)
   ─ devcontainer.json 里:
     "secrets": {
       "OPENAI_API_KEY": {"description": "OpenAI 的 key"}
     }
   ─ VS Code 启动容器时弹窗让你输,本地 keychain 加密存
   ─ 容器内作为 env 可用,但不进 git、不进 image
   
✓ 正确姿势 2:Codespaces secrets
   ─ GitHub.com → Settings → Codespaces → Secrets
   ─ 加 key/value,标记哪些 repo 可用
   ─ 自动作为 env 注入,不进 git
   
✓ 正确姿势 3:.env mount(不进 git)
   ─ 项目根:.env(in .gitignore)
   ─ devcontainer.json:
     "mounts": ["source=${localWorkspaceFolder}/.env,target=/workspace/.env,type=bind"]
   ─ 团队成员各自维护 .env(从 1Password / SSO secrets manager 拷)
```

### 8.2 团队级 secret 流程

```
新人入职:
   1. SSO 进公司 1Password / Vault
   2. 拿到 "myapp-dev-env" 这份 secret
   3. 本地 .env 写好(或 1Password CLI 自动注入)
   4. .env 不进 git
   5. devcontainer.json mount 进去
   
.env 内容更新:
   ─ secret manager 更新 → 工程师重拉 → 重启容器
   ─ 不是 Docker image 更新,所以不影响 prod
```

**核心原则**:**image 是公共制品,可以放在 git / registry;secret 是私人凭证,只在你本地 / 你的 secret manager 里**。两者绝对不混。

---

## 九、Claude Code 在 Remote dev 里的位置

29 篇会专讲「终端 + Claude Code 工作流」,但这里先把它跟 remote dev 的关系点一下——**因为很多人对 Claude Code 在 remote dev 里"该跑在哪"完全没概念**。

```
┌─────────────────────────────────────────────────────────────────┐
│  四种 remote dev 模式下,Claude Code 跑在哪                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SSH + tmux:                                                    │
│     ─ Claude Code 跑在远端 tmux 的一个 pane 里                   │
│     ─ 你在本地终端 attach,看输出                                │
│     ─ tmux detach 之后,Claude Code 继续跑                       │
│     ─ 你电脑炸了,Claude 还在远端干活                            │
│     ─ 这是"长任务挂远端"的最干净玩法                            │
│                                                                 │
│  VS Code Remote SSH:                                            │
│     ─ Claude Code VS Code 插件能跑在远端 vscode-server          │
│     ─ context 是远端代码                                         │
│     ─ 你 close VS Code,Claude 跟着挂                            │
│     ─ 想长跑还得自己开 tmux 包一层                              │
│                                                                 │
│  Devcontainer:                                                  │
│     ─ Claude Code 跑在容器内                                     │
│     ─ context = 容器内代码                                       │
│     ─ Claude 装的工具 = 容器内工具(不污染本地)                 │
│     ─ 这是"项目隔离 Claude" 的最干净玩法                         │
│                                                                 │
│  Codespaces:                                                    │
│     ─ Claude Code 跑在云容器内                                   │
│     ─ 你浏览器关掉,云容器 suspend,Claude 跟着 suspend          │
│     ─ 适合临时任务,不适合 24h 长跑                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**最重要的认知**:**Claude Code 是一个进程,它跟着哪个父进程,父进程死它就死**。

- VS Code 插件 → Claude 跟着 VS Code 死
- tmux pane → Claude 跟着 tmux session 生死(tmux session detach 不死,kill server 才死)
- Codespaces 浏览器 → Codespace suspend 时 Claude 也 suspend

**所以"Claude Code 长任务挂着自己下班"的唯一正确解法是 tmux**——这是 SSH + tmux 这种"看起来 1990 年代"的方案,在 2026 仍然不可替代的原因之一。29 篇会细讲。

---

## 十、反对的写法

这一篇结尾,把几种**常见错误用法**列出来——见到就是搞错了:

```
❌ 强行所有项目上 Devcontainer
   ─ 本地能跑得好好的小项目,硬上 Devcontainer
   ─ 多一层 Docker,IO 变慢,Mac 内存吃光
   ─ 5 个本地 Python 包写个脚本,根本不需要容器
   ─ 原则:本地能搞定,别折腾;团队 onboarding 成本 > 2 小时,才考虑

❌ 用 SSHFS / VS Code Remote 两种混合
   ─ 把远端文件 sshfs mount 到本地,然后本地 VS Code 编辑
   ─ 两个协议干扰:LSP 看的是本地文件(慢),实际改的是远端
   ─ 还不如直接 VS Code Remote SSH

❌ Devcontainer + 本地 IDE 同时编辑
   ─ Devcontainer 跑着,你又开本地 IDE 改同一个文件
   ─ 文件冲突,容器内 watcher 看不到,build 出问题
   ─ 选一个,要么进容器,要么不开

❌ Codespaces 24/7 跑
   ─ 把它当 dev box 用,每月 $200+
   ─ 公司发钱给你 dev box,不要钱;你自己跑 Codespaces 24/7,自掏 $2000/年
   ─ 临时用 / 出差 OK,主力开发不划算

❌ vscode-server 反复装在每个新远端
   ─ 同一个用户身份 / 同一个 vscode-server 版本就够了
   ─ 每次连不同 host 装一次,远端磁盘吃光

❌ Devcontainer 把 secret 写进 devcontainer.json
   ─ 进 git → 全公司能看 → 离职员工还有 key
   ─ 用 devcontainer secrets 或 .env mount

❌ 把 dotfiles install.sh 写得只能在 mac 上跑
   ─ 进容器一脚踩雷:brew 不存在 / mac-specific 工具 / Keychain 不在
   ─ 防御性编程:OS 检测、命令存在检测、可选工具跳过

❌ 远端 dev 但 git config 不在远端
   ─ 你在远端 commit,但 user.email 是 root@hostname
   ─ commit 历史脏了,GitHub commit 不显示头像
   ─ dotfiles 一定要把 git config 同步过去

❌ 期望 Devcontainer 解决"复现到一模一样"
   ─ Devcontainer 用 image tag,tag 同样 image 内容可能不同(latest 漂移)
   ─ "绝对可复现"是 Nix 的领域,Devcontainer 是"差不多"
   ─ 团队场景 Devcontainer 够,科学计算 / 合规追溯用 Nix

❌ ssh devbox 不用 ControlMaster
   ─ VS Code Remote 一会儿开一条 SSH,一会儿 LSP 又开一条
   ─ 每次握手 1-2 秒,体验差
   ─ 15 篇讲过的 ControlMaster + ControlPersist 必加
```

**这十条踩坑你避开,team 里 remote dev 的 ROI 自然出来**——避不开,工具再先进也救不了。

---

## 十一、看完应该能

```
□ 在白板上画出第二节那张「四件事拆开」的表
□ 不再纠结"Devcontainer 好还是 Codespaces 好",而是问
   "这次任务,这四件事我各放哪"
□ 写一个能跑的 .devcontainer/devcontainer.json,包含 features +
   postCreateCommand + extensions + forwardPorts
□ 在 macOS 上把高 IO 目录改成 named volume,把 node_modules
   装速度从 5 分钟降到 30 秒
□ 写一个跨 mac / Linux / Alpine 都能跑的 dotfiles install.sh
□ 给团队新人能讲清楚:你这次选 Devcontainer 而不是 Codespaces,
   是为了什么(成本 / 网络 / 离线 / IO)
□ 知道 Claude Code 在四种模式下分别"绑在哪个进程",
   挂的时候为什么挂、挂了怎么办
□ 知道 SSH + tmux 这种"古老"方案,在哪种场景仍然是最好选择
   (生产排错 / 长任务挂远端 / 极简环境)
```

如果上面这 8 条你都做到,**这一篇就值了**。

---

## 十二、下一篇预告:27 - Shell 脚本工程化

26 讲了「**远端开发的形态**」——下一篇拐进「**shell 脚本工程化**」,看起来好像换了主题,但其实是同一条线:

```
你已经会用 Devcontainer / Codespaces / dotfiles 让"工作流"可复现
   ─ install.sh 也是工作流的一部分
   ─ 你的 devcontainer postCreateCommand 也是脚本
   ─ 你跑 CI 也是 shell 脚本
   ─ 你的告警 runbook 也是 shell 脚本

但这些脚本,9 成是"半坏"的:
   ─ 没 set -euo pipefail
   ─ 没 shellcheck
   ─ rm -rf $VAR/foo 一抖就删 /
   ─ 没测试,不能放心改

27 篇讲:
   ─ set -euo pipefail / IFS 三件套(每条配真实事故)
   ─ shellcheck 静态分析
   ─ shfmt 格式化
   ─ bats 单元测试
   ─ trap 清理
   ─ 100 行边界:超过就该换 Python
   ─ 一份 30 行工程化模板
```

**核心论断**:**shell 脚本是 dev workflow 里"最常见但最被低估"的工程产物**——不工程化,你的 dotfiles / Devcontainer / CI 全是上面盖着一层"半坏"的脚本。这层不整,工作流就漂。
