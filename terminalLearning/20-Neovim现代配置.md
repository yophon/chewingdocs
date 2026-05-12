# Neovim 现代配置:别造 init.lua 的车,从 kickstart / LazyVim 起步

新人 2026 年学 Neovim,**90% 死在两个坑里**——

**坑一**:打开 Google 搜「Neovim config」,翻到那个 8k star 的 dotfiles,**复制人家一千行 init.lua 抄进去**。回家跑一次:**报错 47 个**,某个 plugin 找不到、某个 LSP 没装、某个 keymap 跟自己 zsh alias 撞了。**调一周**,Neovim 还是打不开 Python 文件 LSP 不跑。**实在受不了 git reset --hard,回去用 VS Code**。

**坑二**:还在网上看到老教程,装 `oh-my-vim` 或者 `vim-plug` 或者 `Vundle`——**这三个东西分别是 2013、2014、2015 年的产物**。框架还能用,但用它们等于**主动放弃**最近 5 年 Neovim 生态的全部红利:lazy-load、async、Lua API、`event = "BufReadPost"` 这种声明式延迟、`mason.nvim` 自动装 LSP。**装古董框架等于把自己钉死在 2018 年**。

**2026 该有的样子**:**LazyVim 或 kickstart.nvim 起步,5 分钟开箱、自己改不多、LSP + Tree-sitter 默认在跑**。半年后你需要加一个补全源 / 改一个 keymap,**翻一个 50 行的 Lua 文件就改完**——不再是"看一千行别人配置看一晚上"。**这是 Neovim 配置工程化的本质**:从"从零写一份完美 init.lua"切换到"从一份能用的模板上,改你需要的部分"。

> 一句话先记住:**不要造 init.lua 的车 — fork kickstart.nvim 或装 LazyVim,把"配出能用的 Neovim"这件事从两周压缩到两小时。从零写 init.lua 不是工程能力,是行为艺术**。

这一篇拆开讲:**Neovim 和 vim 到底差什么、三条配置路线(LazyVim / kickstart / NvChad / 从零)的对比、lazy.nvim 包管理器的延迟加载心智、LSP / Tree-sitter / Mason 三件套的分工、8 个必备 plugin、一份能用的目录结构、调试启动慢的方法、格式化 / linter 的现代选择、常见坑、什么时候仍然该用纯 vim**——读完你能在新机器上 30 分钟搭出一个能写代码的 Neovim,**而不是花两周抄完别人的 dotfiles**。

---

## 一、Neovim vs vim:不是 fork 升级,是范式翻新

很多人对 Neovim 的认知停留在「**vim 的一个改良版**」——**这是严重低估**。Neovim 2014 年从 vim 7.4 fork 出来,前几年确实只是"清理代码 + 修 bug",但从 0.5(2021)开始,**Neovim 和 vim 已经是两个东西**。

### 1.1 时间线

```
1991  vi  →  vim 1.0(Bram Moolenaar)
2006  vim 7.0
2014  Neovim fork(原因:vim 单维护者瓶颈 / 老代码难改)
2016  Neovim 1.0
2021  Neovim 0.5  ← 转折点:Lua 一等公民 + LSP 内置
2022  Neovim 0.7  ← Tree-sitter 内置 + lua API 完整
2023  Bram 去世,vim 维护放缓
2024  Neovim 0.10 ← 内置 LSP UI 进一步完善
2026  默认选 Neovim,vim 是兼容场景
```

**2023 年 Bram 去世后,vim 的维护明显放缓**——补丁还在打,但新特性大部分是把 Neovim 已有的功能搬一份过来(vim9script、内置终端、popup window)。**vim 的角色越来越像"低配 Neovim"**——能用、稳、但永远慢一步。

### 1.2 关键能力对照

```
能力                  vim 9.x              Neovim 0.10+
─────────────────────────────────────────────────────────────────
配置语言              VimScript            Lua(VimScript 仍兼容)
                      (vim9script 新加)
LSP 客户端            无内置                vim.lsp 内置
                      (要装 coc.nvim)     (lspconfig 只是配置层)
Tree-sitter           无                    内置,nvim-treesitter 配置层
异步                  job_start             uv.loop(libuv 全套)
                      (功能受限)
内嵌终端              :terminal(后期加)   一等公民
Floating window       vim 8.2 后才有        0.4 起一等公民
插件 API              VimScript 函数        vim.api / vim.fn 全 Lua 暴露
启动速度              ~30ms                 ~30ms(裸),配置后看 lazy-load
社区主力              缓慢                  活跃,核心团队 + 数百 contributor
```

### 1.3 2026 怎么选

```
你是 2026 才开始学 modal editor:
   → Neovim,毫无疑问

你已经用 vim 10 年,有 1500 行 .vimrc:
   → 值得迁,但**不是一周内能完成**——给自己一个月
   → 先把 vim 的 muscle memory 保留,init.lua 用 LazyVim 起步
   → 老的 VimScript 配置 source 一下还能跑,慢慢迁

你只在远端服务器 / 容器内偶尔用:
   → 系统 vim 够用,不要折腾装 Neovim 把容器搞胖
   → 心智:vim 是"任何 Unix 上都有"的最小公分母

你在嵌入式 / Alpine 极小镜像:
   → vim-tiny,几 MB,启动快
   → Neovim + plugin 100MB+,不合适
```

**默认场景**:**本地开发 → Neovim,远端临时活 → 系统自带 vim**。这两种心智不冲突,**两套都会才叫熟练**。

---

## 二、三条配置路线对比

如果你决定了用 Neovim,**第二个决定是:从哪里起步**。市面上有三条主流路线 + 一条"硬核路线",各自服务不同的人群。

### 2.1 LazyVim(发行版)

```
出身:    folke(也是 lazy.nvim / which-key / tokyonight 作者)
定位:    "Neovim 的 IDE 发行版",开箱即用 + 后续可改
启动配置: 一行 git clone,装上就有 LSP / Tree-sitter / 补全 / fuzzy
基础:    建立在 lazy.nvim 之上
学习曲线: 平(开箱)→ 陡(自己改)
适合:    想立刻有 IDE 体验,后续慢慢学 Lua
```

特点:**LazyVim 是一整套预配好的 plugin 集合 + 默认 keymap + 默认 theme**。你装上跟装 VS Code 一样——开箱就有 80% 的 IDE 功能。**改它的时候,你只需要写"override"**,不需要从零定义。

### 2.2 kickstart.nvim(单文件起步)

```
出身:    TJ DeVries(Neovim core team 成员)
定位:    "一个 init.lua 文件",带注释,教学性质
启动配置: 一个 ~600 行的 init.lua,自己 fork 改
基础:    建立在 lazy.nvim 之上
学习曲线: 陡(但每行都有注释,边读边学)
适合:    想真正学懂 Lua 配置的人
```

特点:**kickstart 不是发行版,是教学骨架**。**所有配置在一个文件里**,你 fork 它,**逐行读、逐行改**——读完一遍,你对 Neovim 的所有核心机制(LSP / Treesitter / lazy.nvim / completion)都建立了第一手心智。**适合"我要懂"的人,不适合"我要快"的人**。

### 2.3 NvChad

```
出身:    siduck76(印度独立开发者)
定位:    "好看 + 轻量 + IDE 化"的发行版
启动配置: 跟 LazyVim 类似,git clone 就能用
基础:    自家的 plugin manager(早期)→ lazy.nvim(后期)
学习曲线: 中
适合:    重视 UI 美感、不想自己调主题的人
```

**比 LazyVim 更"成品化"**,默认主题非常好看,**但自定义余地更小**——你想改某个 keymap,得跟它的 `chadrc.lua` 体系配合,比直接改 LazyVim 的 plugin spec 隔了一层抽象。**社区比 LazyVim 小**。

### 2.4 从零写 init.lua(不推荐)

```
出身:    "我要完全控制"的人
定位:    自己造车
启动配置: 一个空的 init.lua,从 0 写起
基础:    无,什么都要自己写
学习曲线: 极陡,平均要 1-3 个月才有能用的配置
适合:    几乎没人,除非你有非常具体的目标
```

**说真的**:你最后还是会装 `lazy.nvim`、`nvim-lspconfig`、`nvim-treesitter`、`nvim-cmp`、`telescope.nvim`、`mason.nvim` 这一套——你想"完全控制",但**你自己写的版本只会更糟**,因为你不知道 LazyVim 帮你处理了多少 edge case(LSP attach 时机、Tree-sitter parser 安装顺序、autocompletion 触发条件……)。**从零写 init.lua 不是"工程能力强",是"对生态不熟"**。

### 2.5 路线对比表

```
                LazyVim     kickstart.nvim   NvChad      从零写
─────────────────────────────────────────────────────────────────
起步时间        5 分钟       10 分钟          5 分钟      2 周-3 月
学完时间        持续         1-2 周           持续         无尽
开箱体验        ★★★★★        ★★★              ★★★★★        无
自定义余地      ★★★★         ★★★★★            ★★★          ★★★★★
教学性          ★★           ★★★★★            ★            ★
社区活跃        ★★★★★        ★★★★             ★★★          —
默认 keymap     有意见        最小              有意见        无
新人推荐度      ★★★★★        ★★★★(动手派)   ★★★★         ★(别)
2026 主流       是            是                依然是       不是
```

**这一篇主推 LazyVim(因为开箱即用 + 可改)和 kickstart.nvim(因为学得透)**——**两个二选一**,不要混着抄。

---

## 三、lazy.nvim:Neovim 包管理器的现代标准

不管你选 LazyVim 还是 kickstart.nvim,**底下跑的都是 lazy.nvim**。**它就是 Neovim 2026 年的包管理器事实标准**——前任 `packer.nvim` 已经停止维护(2023),老一代的 `vim-plug` / `Vundle` 在 Lua 时代已经过时。

### 3.1 lazy.nvim 是什么

```
lazy.nvim:
   - 用 Lua 写的 Neovim 插件管理器
   - 声明式 spec(每个插件是一个 Lua table)
   - 延迟加载(event / cmd / ft / keys 多种触发条件)
   - UI 面板(:Lazy 进去看所有插件状态)
   - 自动 bootstrap(首次启动自动 clone 自己 + 所有插件)
   - 自带 profiler(:Lazy profile 看每个插件耗时)
```

### 3.2 声明式 spec 长什么样

```lua
-- lua/plugins/example.lua
return {
  -- 最简形式:只有仓库名
  "tpope/vim-fugitive",

  -- 带配置的形式
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },  -- 打开文件时才加载
    dependencies = { "williamboman/mason.nvim" },
    config = function()
      require("lspconfig").lua_ls.setup({})
    end,
  },

  -- 按命令触发
  {
    "stevearc/oil.nvim",
    cmd = "Oil",  -- 只在执行 :Oil 时加载
    opts = {},
  },

  -- 按文件类型触发
  {
    "nvim-treesitter/nvim-treesitter",
    ft = { "lua", "python", "go", "rust", "typescript" },
    build = ":TSUpdate",
  },

  -- 按快捷键触发
  {
    "folke/which-key.nvim",
    keys = "<leader>",  -- 按 leader 才加载
    opts = {},
  },
}
```

**每个 plugin 是一个 Lua table**——`opts` 是 setup 参数,`config` 是 setup 函数,`event` / `cmd` / `ft` / `keys` 是延迟触发条件。

### 3.3 延迟加载是关键

**这是 lazy.nvim 比 packer / vim-plug 的最大优势**——**plugin 不是启动时全部 source,而是按需 load**。

```
传统(packer / vim-plug):
   nvim 启动
      ↓
   读 ~/.config/nvim/init.lua
      ↓
   PackerSync / plug#begin
      ↓
   source 所有 plugin 的 plugin.vim       ← 串行,慢
      ↓
   触发 VimEnter,执行所有 config         ← 串行,慢
      ↓
   prompt 出现(500ms+)


lazy.nvim:
   nvim 启动
      ↓
   读 ~/.config/nvim/init.lua
      ↓
   require("lazy").setup(spec)
      ↓
   只 source 真正"需要立即加载"的 plugin  ← 通常 < 10 个
      ↓
   其他 plugin 注册触发条件,不 source
      ↓
   prompt 出现(30-50ms)
      ↓
   你打开第一个 Python 文件
      ↓
   触发 BufReadPre → load nvim-lspconfig / treesitter / cmp
      ↓
   LSP 跑起来
```

**结果**:**LazyVim 装 50+ plugin,启动仍然 < 50ms**。**vim-plug 装 20 个 plugin,启动就 300ms+**。

### 3.4 启动时间目标

```
裸 Neovim(空 init.lua)              ~20ms
LazyVim + 默认 plugin(全部 lazy)     30-60ms
LazyVim + 自己加 20 个 plugin         40-80ms
不会用 lazy-load,plugin 全部立即加载   200-500ms

目标:< 100ms
理想:< 50ms
```

调启动时间的方法在第十一节专讲。

---

## 四、LSP 心智:为什么 Neovim 不再需要 coc.nvim

**LSP(Language Server Protocol)是 Neovim 现代化的核心**——理解了它,你就理解了为什么 vim 时代 coc.nvim 之类的"补全套件"现在全部退场。

### 4.1 LSP 是什么

```
LSP = Language Server Protocol
2016 微软出,给 VS Code 设计的,现在所有编辑器都用

核心心智:
   编辑器(client)              语言服务器(server)
       │                              │
       │  ─── 我打开了 main.py ────▶  │
       │                              │   pyright 启动
       │                              │   解析 AST、建索引
       │                              │
       │  ─── 光标在 line 10 col 5 ─▶ │
       │                              │   做静态分析
       │                              │
       │  ◀──── 这里 hover 提示 ───── │
       │  ◀──── 这里有 diagnostic ── │
       │  ◀──── 补全候选: x,y,z ───  │
       │                              │
       │  ─── go-to-definition? ────▶ │
       │  ◀──── 跳到 utils.py:42 ──── │

协议是 JSON-RPC over stdin/stdout
   client 不需要懂 Python / Go / Rust,只需要懂 LSP 协议
   server 只跑一种语言的分析,但能服务所有支持 LSP 的 client
```

**结果**:**所有编辑器(VS Code / Neovim / Helix / Sublime)用同一套 server**——`pyright` 是 microsoft 写的、`gopls` 是 Google 写的、`rust-analyzer` 是 Rust 社区写的、`lua-language-server` 是 sumneko 写的。

### 4.2 Neovim 的 LSP 三件套

```
┌─────────────────────────────────────────────────────────────┐
│  vim.lsp              <- Neovim 核心,LSP client 协议实现     │
│     ↑                                                       │
│  nvim-lspconfig       <- 配置每种语言怎么连 server           │
│     ↑                                                       │
│  Mason                <- 装 / 管 LSP server 二进制           │
│     ↑                                                       │
│  你                                                          │
└─────────────────────────────────────────────────────────────┘

- vim.lsp:你不用直接碰,Neovim 内置
- nvim-lspconfig:每种语言一份默认配置(怎么启动 server、传什么参数)
- Mason:在 Neovim 内 `:Mason` 命令一键装 / 卸 server
```

### 4.3 最小 LSP 配置

```lua
-- lua/plugins/lsp.lua
return {
  -- Mason:管 LSP / formatter / linter 二进制
  {
    "williamboman/mason.nvim",
    cmd = "Mason",
    opts = {},
  },

  -- mason-lspconfig:把 Mason 装的 server 跟 lspconfig 连起来
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = "williamboman/mason.nvim",
    opts = {
      ensure_installed = { "lua_ls", "pyright", "gopls", "rust_analyzer", "tsserver" },
    },
  },

  -- nvim-lspconfig:LSP 配置层
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      "williamboman/mason-lspconfig.nvim",
      "hrsh7th/cmp-nvim-lsp",  -- 让 LSP 知道补全 client 在哪
    },
    config = function()
      local lspconfig = require("lspconfig")
      local caps = require("cmp_nvim_lsp").default_capabilities()

      lspconfig.lua_ls.setup({ capabilities = caps })
      lspconfig.pyright.setup({ capabilities = caps })
      lspconfig.gopls.setup({ capabilities = caps })
      lspconfig.rust_analyzer.setup({ capabilities = caps })
    end,
  },
}
```

**这段 30 行,你的 Neovim 就有 LSP 了**——打开 `main.py`,光标停在函数名上按 `K` 出 hover,`gd` 跳定义,`gr` 找引用。**和 VS Code 同等体验,只是 UI 在终端里**。

### 4.4 Mason 的存在意义

**装 LSP server 是个脏活**——`pyright` 要 `npm install -g`,`gopls` 要 `go install`,`rust-analyzer` 要下载二进制,`clangd` 是 apt / brew 装的,**每种语言一套**。

**Mason 把这件事统一了**:在 Neovim 里 `:Mason` 进入面板,**i 装、X 卸、U 升级**——所有 server 装到 `~/.local/share/nvim/mason/bin`,Mason 自动加进 PATH。

```
┌── Mason ──────────────────────────────────────────────┐
│                                                       │
│  Installed (7)                                        │
│   lua-language-server      v3.7.4    [LSP]            │
│   pyright                  v1.1.350  [LSP]            │
│   gopls                    v0.15.3   [LSP]            │
│   rust-analyzer            2024-04   [LSP]            │
│   typescript-language-server 4.3.3   [LSP]            │
│   stylua                   v0.20.0   [Formatter]      │
│   ruff                     v0.4.4    [Linter]         │
│                                                       │
│  Available (200+)                                     │
│   ...                                                 │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**不用 Mason 也能用**——直接 `brew install gopls` 然后让 lspconfig 找 PATH,但每台机器手动装一遍累。**Mason 把"装 LSP server"这件事 Neovim 内化了**。

---

## 五、Tree-sitter 心智:不是 LSP,是语法树

**Tree-sitter 是另一个让 Neovim 现代化的关键**——很多人把它跟 LSP 混为一谈,**完全是两件事**。

### 5.1 Tree-sitter 是什么

```
Tree-sitter:
   增量式语法解析器,GitHub 出的(2018)
   把源代码解析成语法树(AST),供编辑器用

vs 老的 syntax highlighting:
   老:    用正则匹配(syntax/python.vim 这种 1500 行正则)
          快但不准,嵌套结构经常乱
   新:    Tree-sitter 解析真正的 AST
          高亮永远对,还能做"选 function 内 body"这种 text object

vs LSP:
   LSP:        语义层,知道 x 是变量,y 是函数,z 是类型
                跨文件、跨项目分析
                跑在外部进程(stdio)
   Tree-sitter: 语法层,只看当前文件
                解析单文件 AST
                跑在 Neovim 进程内(WASM / 动态库)
```

**Tree-sitter 给的是「准确的 syntax 高亮」+「精确的 text object」**——不替代 LSP,但**让 Neovim 知道代码的语法结构**。

### 5.2 Tree-sitter 给你什么

```
1. 准确的高亮
   - 字符串里的 \n 转义符 高亮成转义色
   - JSX 标签里的 props 跟字符串区分
   - SQL 语句嵌在 Python 字符串里也能高亮(injection)

2. text object
   - af / if  =  around function / inside function(整个函数 / 函数内)
   - ac / ic  =  around class  / inside class
   - aa / ia  =  around argument
   - 例:vaf  → 选中整个函数;cif  → 改函数内容(保留签名)

3. 折叠
   - 按语法结构折叠,不再靠缩进或正则

4. structural editing(swap parameters / move function)
   - 高级 plugin 用 Tree-sitter 做这种重构

5. context(粘性 header)
   - 你滚到函数中间,顶部固定显示函数签名
   - 像 IDE 那样,但靠 Tree-sitter
```

### 5.3 最小 Tree-sitter 配置

```lua
-- lua/plugins/treesitter.lua
return {
  {
    "nvim-treesitter/nvim-treesitter",
    event = { "BufReadPost", "BufNewFile" },
    build = ":TSUpdate",  -- 装完后跑 TSUpdate 升级 parser
    opts = {
      ensure_installed = {
        "lua", "vim", "vimdoc",
        "python", "go", "rust",
        "typescript", "tsx", "javascript",
        "html", "css", "json", "yaml", "toml",
        "markdown", "markdown_inline",
        "bash",
      },
      highlight = { enable = true },
      indent = { enable = true },
      incremental_selection = { enable = true },
    },
    config = function(_, opts)
      require("nvim-treesitter.configs").setup(opts)
    end,
  },
}
```

**`ensure_installed` 列你常写的语言**——Tree-sitter 会自动下载 / 编译对应的 parser(WASM 或动态库)。**第一次跑会卡 30 秒装一堆 parser**,之后启动只是加载现成的。

### 5.4 LSP vs Tree-sitter 一图区分

```
你打开 main.py,光标停在变量 user_id 上:

LSP 知道的事:
   - user_id 在第 23 行定义,是 int 类型
   - 跨整个 monorepo 还有 47 处引用
   - 它的初始值来自 request.GET['user_id']
   - hover 时给完整 docstring

Tree-sitter 知道的事:
   - user_id 是一个 identifier 节点
   - 它的父节点是 assignment statement
   - 当前光标所在的函数叫 get_user_profile
   - 当前 class 叫 UserController

两者协作:
   - 高亮(Tree-sitter)+ 类型提示(LSP)
   - text object(Tree-sitter)+ rename symbol(LSP)
   - 折叠(Tree-sitter)+ go-to-definition(LSP)
```

**LSP 是「语义」,Tree-sitter 是「语法」**——**两个都装**,你 Neovim 才齐活。

---

## 六、必备 plugin 8 个

LazyVim 默认全装,kickstart 也基本配齐。如果你从零或者从 LazyVim 改,**这 8 个就是 2026 年的"标配清单"**。

```
plugin                           作用
─────────────────────────────────────────────────────────────────────
1. nvim-lspconfig + mason.nvim   LSP(配置 + 装 server)
2. nvim-treesitter               语法解析,准确高亮 + text object
3. telescope.nvim                fuzzy finder,在 nvim 内部的 fzf
4. nvim-cmp                      补全 UI(LazyVim 默认,新潮派改 blink.cmp)
5. gitsigns.nvim                 git diff 边栏 + hunk 操作
6. trouble.nvim                  diagnostics 列表面板
7. which-key.nvim                按 leader 后弹出快捷键提示
8. nvim-tree.lua / neo-tree.nvim 文件树
```

### 6.1 telescope.nvim:终极 fuzzy finder

```lua
{
  "nvim-telescope/telescope.nvim",
  cmd = "Telescope",
  keys = {
    { "<leader>ff", "<cmd>Telescope find_files<cr>", desc = "Find files" },
    { "<leader>fg", "<cmd>Telescope live_grep<cr>",  desc = "Grep" },
    { "<leader>fb", "<cmd>Telescope buffers<cr>",    desc = "Buffers" },
    { "<leader>fh", "<cmd>Telescope help_tags<cr>",  desc = "Help" },
  },
  dependencies = { "nvim-lua/plenary.nvim" },
  opts = {},
}
```

**Telescope = fzf 在 Neovim 内部的复刻**——找文件、grep、切 buffer、看 help、找 LSP references……所有"列一堆东西然后选一个"的场景都用它。**`<leader>ff` 找文件、`<leader>fg` 在项目里 grep,这两个键位是 Neovim 用户的本能**。

### 6.2 nvim-cmp:补全 UI(及其后继 blink.cmp)

```lua
{
  "hrsh7th/nvim-cmp",
  event = "InsertEnter",
  dependencies = {
    "hrsh7th/cmp-nvim-lsp",    -- 接 LSP 补全源
    "hrsh7th/cmp-buffer",      -- 当前 buffer 词
    "hrsh7th/cmp-path",        -- 文件路径
    "L3MON4D3/LuaSnip",        -- snippet
    "saadparwaiz1/cmp_luasnip",
  },
  config = function()
    local cmp = require("cmp")
    cmp.setup({
      snippet = {
        expand = function(args) require("luasnip").lsp_expand(args.body) end,
      },
      mapping = cmp.mapping.preset.insert({
        ["<Tab>"]    = cmp.mapping.select_next_item(),
        ["<S-Tab>"]  = cmp.mapping.select_prev_item(),
        ["<CR>"]     = cmp.mapping.confirm({ select = true }),
        ["<C-Space>"] = cmp.mapping.complete(),
      }),
      sources = cmp.config.sources({
        { name = "nvim_lsp" },
        { name = "luasnip" },
        { name = "buffer" },
        { name = "path" },
      }),
    })
  end,
}
```

**2024 末 / 2025 出现了 `blink.cmp`**——Rust 写的、更快、更简单的补全引擎,LazyVim 默认在迁。**短期 nvim-cmp 还是主流,长期 blink.cmp 会接班**——你新装,可以直接试 blink。**两个 API 类似,迁移成本不大**。

### 6.3 gitsigns.nvim:git 边栏

```lua
{
  "lewis6991/gitsigns.nvim",
  event = { "BufReadPre", "BufNewFile" },
  opts = {
    signs = {
      add    = { text = "+" },
      change = { text = "~" },
      delete = { text = "_" },
    },
  },
}
```

**屏幕左边栏显示哪些行 + / ~ / -**(对应 git diff),光标停在 hunk 上 `<leader>hp` 看 diff、`<leader>hs` stage hunk、`<leader>hr` reset hunk。**比 VS Code 的 git gutter 信息密度更高**(因为每个 hunk 都能就地操作)。

### 6.4 trouble.nvim:diagnostics 面板

```lua
{
  "folke/trouble.nvim",
  cmd = "Trouble",
  keys = {
    { "<leader>xx", "<cmd>Trouble diagnostics toggle<cr>", desc = "Diagnostics" },
    { "<leader>xX", "<cmd>Trouble diagnostics toggle filter.buf=0<cr>", desc = "Buffer diagnostics" },
  },
  opts = {},
}
```

**把整个项目的 LSP 错误 / 警告列成一个面板**,跳来跳去比 `:lopen` 直观。LazyVim 自带,自己装也行。

### 6.5 which-key.nvim:快捷键提示

```lua
{
  "folke/which-key.nvim",
  event = "VeryLazy",
  opts = {},
}
```

**按 leader 后等 1 秒,弹出菜单展示所有以 leader 开头的快捷键**——新手必备,熟手也好用(快捷键多了自己也记不全)。

```
你按下 <Space>(leader),屏幕底部弹:

   <Space>f → +file        <Space>g → +git
   <Space>x → +diagnostics <Space>l → +lsp
   <Space>b → +buffer      <Space>q → quit
   <Space>w → write        <Space>e → file tree

再按 f:

   <Space>ff → Find files     <Space>fg → Live grep
   <Space>fb → Buffers        <Space>fh → Help
```

### 6.6 nvim-tree / neo-tree:文件树

```lua
-- 选一个,不要两个都装
{
  "nvim-tree/nvim-tree.lua",
  cmd = "NvimTreeToggle",
  keys = {
    { "<leader>e", "<cmd>NvimTreeToggle<cr>", desc = "File tree" },
  },
  opts = {},
}
```

**重要的不是文件树本身,是 `<leader>e` 这种二级快捷键的设计**——LazyVim 用 `neo-tree.nvim`,功能类似。

### 6.7 配置体感

**这 8 个 plugin 装完,你的 Neovim ≈ VS Code**——只是 UI 全在终端。**LazyVim 默认就是这一套**,kickstart 也覆盖大部分。**自己从零写,先确保这 8 个都有,再考虑别的**。

---

## 七、~/.config/nvim 目录结构

500 行单文件 `init.lua` 是反模式——升级痛、找东西要 grep、半年后看不懂。**LazyVim / kickstart 都已经走了"模块化"路线**:

### 7.1 推荐结构

```
~/.config/nvim/
├── init.lua                    # 入口,3-5 行 source 子模块
├── lua/
│   ├── config/
│   │   ├── options.lua         # vim.opt 设置(行号、tab、缩进...)
│   │   ├── keymaps.lua         # vim.keymap.set
│   │   ├── autocmds.lua        # vim.api.nvim_create_autocmd
│   │   └── lazy.lua            # lazy.nvim bootstrap + setup
│   └── plugins/
│       ├── lsp.lua             # nvim-lspconfig + mason
│       ├── treesitter.lua
│       ├── completion.lua      # nvim-cmp / blink.cmp
│       ├── telescope.lua
│       ├── ui.lua              # which-key / lualine / theme
│       ├── editor.lua          # gitsigns / trouble / file tree
│       └── lang/
│           ├── go.lua          # 语言专属(可选)
│           ├── rust.lua
│           └── python.lua
└── lazy-lock.json              # lazy.nvim 自动生成的版本锁,提交进 git
```

**为什么这么分**:
- `config/` 是 Neovim 本身的配置(option / keymap / autocmd)
- `plugins/` 是 plugin spec,**每个文件可以 `return { ... }` 一组相关 plugin**——lazy.nvim 自动扫整个目录
- `lang/` 是按语言隔离的特殊配置(比如 Go 要 `goimports`,Rust 要 `rustaceanvim`)

### 7.2 最小 init.lua

```lua
-- ~/.config/nvim/init.lua

-- 设 leader 必须在 lazy.nvim 加载之前
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

-- 加载基本设置
require("config.options")
require("config.keymaps")
require("config.autocmds")

-- 加载 lazy.nvim + plugins(下面给的 bootstrap)
require("config.lazy")
```

**6 行**——所有重活在 `require()` 的子模块里。

### 7.3 lazy.lua(bootstrap)

```lua
-- ~/.config/nvim/lua/config/lazy.lua

-- bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    "git", "clone", "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- 加载所有 lua/plugins/*.lua
require("lazy").setup({
  spec = { { import = "plugins" } },
  install = { colorscheme = { "tokyonight", "habamax" } },
  checker = { enabled = true, notify = false },
  performance = {
    rtp = {
      disabled_plugins = {
        "gzip", "tarPlugin", "tohtml", "tutor", "zipPlugin",
      },
    },
  },
})
```

**这一段是几乎所有 Neovim 配置的标准 bootstrap**——首次运行自动 clone lazy.nvim,后续直接 prepend rtp 用。**`{ import = "plugins" }` 让 lazy 自动扫 `lua/plugins/` 下所有 `.lua` 文件**。

### 7.4 options.lua 示例

```lua
-- ~/.config/nvim/lua/config/options.lua
local o = vim.opt

-- UI
o.number = true                -- 行号
o.relativenumber = true        -- 相对行号(配合 5j / 3k 跳)
o.signcolumn = "yes"           -- 永远显示 sign column,避免抖动
o.cursorline = true            -- 当前行高亮
o.termguicolors = true         -- 24-bit 颜色

-- 缩进
o.tabstop = 2
o.shiftwidth = 2
o.expandtab = true             -- tab → 空格
o.smartindent = true

-- 搜索
o.ignorecase = true            -- 忽略大小写
o.smartcase = true             -- 但有大写时区分

-- 行为
o.splitright = true            -- 新窗口在右侧
o.splitbelow = true            -- 新窗口在下方
o.scrolloff = 8                -- 光标距屏幕边 8 行就开始滚动
o.sidescrolloff = 8

-- 保存 / 撤销
o.undofile = true              -- 持久化 undo(关闭文件再打开还能 undo)
o.swapfile = false             -- 不要 .swp,git 时代废物

-- 渲染
o.updatetime = 250             -- LSP / gitsigns 触发频率
o.timeoutlen = 300             -- which-key 弹出延迟
```

每一行**删掉会怎样**——比如删 `signcolumn = "yes"`,有 LSP 错误时左侧会突然多一列,**整个屏幕往右抖一下**;删 `undofile`,关文件再打开就 undo 不回去。

### 7.5 keymaps.lua 示例

```lua
-- ~/.config/nvim/lua/config/keymaps.lua
local map = vim.keymap.set

-- 退出
map("n", "<leader>q", ":q<cr>",  { desc = "Quit" })
map("n", "<leader>w", ":w<cr>",  { desc = "Save" })

-- 取消高亮
map("n", "<esc>", "<cmd>nohlsearch<cr>")

-- 窗口跳转(Ctrl + hjkl)
map("n", "<C-h>", "<C-w>h", { desc = "Window left"  })
map("n", "<C-j>", "<C-w>j", { desc = "Window down"  })
map("n", "<C-k>", "<C-w>k", { desc = "Window up"    })
map("n", "<C-l>", "<C-w>l", { desc = "Window right" })

-- 移动选中行
map("v", "J", ":m '>+1<cr>gv=gv", { desc = "Move down" })
map("v", "K", ":m '<-2<cr>gv=gv", { desc = "Move up"   })

-- 缩进保留选区
map("v", "<", "<gv")
map("v", ">", ">gv")

-- 系统剪贴板
map({ "n", "v" }, "<leader>y", '"+y', { desc = "Yank to clipboard" })
map("n",          "<leader>Y", '"+Y', { desc = "Yank line to clipboard" })
```

**所有 plugin 相关的 keymap 留给 plugin spec 里的 `keys = {...}` 字段**——这里只放编辑器本身的核心 keymap。

---

## 八、leader key 和快捷键设计

### 8.1 leader key 选 `<Space>`

```lua
vim.g.mapleader = " "
```

**为什么是空格**:
- 默认是 `\`,小拇指要按,**Helix 也用 space**,跨编辑器一致
- 空格在 normal mode 没有"实用动作"(只是右移一格,跟 `l` 重复),**当 leader 不浪费**
- LazyVim / kickstart / NvChad 全部默认空格

**`,` 也有人用**——但 `,` 在 vim 里是「重复上一次 `f` 反向」,**抢这键会影响 f/F/t/T 重复**,不推荐。

### 8.2 leader 组织

```
<leader>      → leader prefix(空格)

f → file 类
   <leader>ff → find files
   <leader>fg → live grep
   <leader>fb → buffers
   <leader>fh → help

g → git 类
   <leader>gg → lazygit
   <leader>gd → git diff
   <leader>gb → git blame

x → diagnostics
   <leader>xx → trouble panel
   <leader>xn → next diagnostic
   <leader>xp → prev diagnostic

l → LSP
   <leader>la → code action
   <leader>lr → rename
   <leader>lf → format

b → buffer
   <leader>bd → delete buffer
   <leader>bp → previous buffer
   <leader>bn → next buffer

w → window
   <leader>ws → split horizontal
   <leader>wv → split vertical
   <leader>wc → close window

e → file explorer
q → quit / save
```

**这套是 LazyVim 默认的组织**——**记**:**f = file**, **g = git**, **x = diagnostiX**, **l = LSP**, **b = buffer**, **w = window**, **e = explorer**。**which-key 会在你按下 leader 后弹出整张图**,所以你不需要全记,**只需要"猜得到第一层"**。

### 8.3 不要绑的快捷键

```
不要覆盖默认 vim 动作的快捷键:
   ✗ map("n", "j", ...)     ← 你疯了,基础移动键不能改
   ✗ map("n", "<cr>", ...)  ← Enter 在 quickfix 等场景是 confirm
   ✗ map("n", "<esc>", ":w<cr>")  ← esc 是回 normal,不要做"保存"
   ✗ map("n", "<space>...", ...)  ← 别把 space 拿掉,它是 leader

不要绑你不记得的:
   ✗ map("n", "<leader>zxc", "...")  ← 三个键太长,记不住等于没绑
   一般规则:leader + 1-2 个字符
```

---

## 九、补全 / 格式化 / linter:现代选择

### 9.1 补全:nvim-cmp → blink.cmp

```
2020-2024:nvim-cmp 是事实标准
2024+:     blink.cmp 出现,Rust 写,快 + 简单
2026:      LazyVim 默认 blink.cmp,nvim-cmp 仍然主流

你怎么选:
   - 跟 LazyVim 默认:blink.cmp
   - 跟 kickstart 默认:nvim-cmp
   - 都行,不要混装
```

### 9.2 格式化:conform.nvim

**老一代是 `null-ls`(后改名 `none-ls`)**——已经过时,作者主动 archive 了。**2026 现代选择是 `conform.nvim`**。

```lua
-- lua/plugins/format.lua
return {
  {
    "stevearc/conform.nvim",
    event = { "BufWritePre" },
    cmd = { "ConformInfo" },
    keys = {
      { "<leader>lf", function() require("conform").format({ async = true }) end, desc = "Format" },
    },
    opts = {
      formatters_by_ft = {
        lua        = { "stylua" },
        python     = { "ruff_format" },
        go         = { "goimports", "gofmt" },
        rust       = { "rustfmt" },
        javascript = { "prettierd", "prettier", stop_after_first = true },
        typescript = { "prettierd", "prettier", stop_after_first = true },
        json       = { "prettierd", "prettier", stop_after_first = true },
        yaml       = { "prettierd", "prettier", stop_after_first = true },
        markdown   = { "prettierd", "prettier", stop_after_first = true },
      },
      format_on_save = {
        timeout_ms = 500,
        lsp_fallback = true,
      },
    },
  },
}
```

**保存自动格式化** + **不被某种语言格式化器卡死**(timeout 500ms)+ **LSP 回退**(没装 formatter 时用 LSP 的格式化能力)。

### 9.3 linter:nvim-lint

```lua
-- lua/plugins/lint.lua
return {
  {
    "mfussenegger/nvim-lint",
    event = { "BufReadPost", "BufNewFile" },
    config = function()
      require("lint").linters_by_ft = {
        python     = { "ruff" },
        javascript = { "eslint_d" },
        typescript = { "eslint_d" },
        go         = { "golangcilint" },
        sh         = { "shellcheck" },
      }

      vim.api.nvim_create_autocmd({ "BufWritePost", "BufEnter" }, {
        callback = function() require("lint").try_lint() end,
      })
    end,
  },
}
```

**保存时跑 linter,把 diagnostic 显示在 sign column 和 trouble panel 里**。和 LSP 的 diagnostic 共存——LSP 给类型错误,linter 给风格错误。

### 9.4 不要用 ale

`ALE`(Async Lint Engine)是 vim 时代的 linter,Neovim 里仍能用——**但生态已经走了**。现在 LazyVim、kickstart、NvChad 全部用 `conform.nvim` + `nvim-lint`,**ale 是历史选项**。**装就别折腾它**。

---

## 十、AI 集成:Copilot / Codeium / Claude Code

2026 你在 Neovim 里写代码,**AI 是默认的一部分**。三条路:

```
GitHub Copilot:
   - copilot.lua(原生 Lua 实现)
   - 需要订阅 + GitHub 账号
   - 集成最久,稳

Codeium:
   - codeium.vim / codeium.nvim
   - 免费(个人版)
   - 体验跟 Copilot 接近

Claude Code / Cursor 之类:
   - 不内嵌 Neovim,而是"反过来"
   - 让 Claude Code 在 tmux 一个 pane 跑,Neovim 在另一个 pane
   - 你在 Neovim 里写,需要重构时切到 Claude pane 给指令
   - 这是 29 篇专讲的姿势
```

最简单的 Copilot 配置:

```lua
{
  "zbirenbaum/copilot.lua",
  cmd = "Copilot",
  event = "InsertEnter",
  opts = {
    suggestion = { enabled = true, auto_trigger = true },
    panel      = { enabled = true },
  },
}
```

**接通了 GitHub 账号,Insert mode 自动弹建议,Tab 接受**。

---

## 十一、debug 进 nvim:启动慢怎么治

### 11.1 测启动时间

```bash
nvim --startuptime startup.log
```

打开后立即退出,然后看 `startup.log` 末尾的总时间。或者:

```bash
hyperfine --warmup 3 'nvim --headless +q'
```

**目标**:< 100ms,**理想 < 50ms**。

### 11.2 :Lazy profile

启动后输入 `:Lazy profile`:

```
plugin                        time     load reason
─────────────────────────────────────────────────────────────
nvim-treesitter               45ms     event BufReadPost
nvim-lspconfig                32ms     event BufReadPre
telescope.nvim                28ms     key  <leader>ff
nvim-cmp                      22ms     event InsertEnter
gitsigns.nvim                 18ms     event BufReadPre
which-key.nvim                15ms     event VeryLazy
tokyonight.nvim               12ms     start
lualine.nvim                   8ms     event VeryLazy
mason.nvim                     6ms     cmd  Mason
trouble.nvim                   5ms     cmd  Trouble
...
```

**`load reason` 说明触发条件**——`start` 是立即加载,`event` / `cmd` / `keys` 是延迟。

### 11.3 常见慢点

**慢点 1:某个 plugin 没设 lazy 条件**

```lua
-- 慢:
{ "nvim-treesitter/nvim-treesitter" }   -- 启动就 source

-- 快:
{ "nvim-treesitter/nvim-treesitter", event = "BufReadPost" }
```

**慢点 2:colorscheme 启动太慢**

```lua
-- 在 plugin spec 里:
{ "folke/tokyonight.nvim", lazy = false, priority = 1000 }
```

`lazy = false` 让 colorscheme 立即加载(否则首屏会"黑屏一闪");`priority = 1000` 让它先于其他 start plugin 加载。

**慢点 3:Tree-sitter parser 首次编译**

第一次 `:TSUpdate` 会卡 30s 编译 parser,**之后就快**。如果你看到启动卡,先 `:TSUpdate` 等它跑完。

**慢点 4:Mason 启动同步装东西**

`mason-lspconfig` 的 `ensure_installed` 在缺 server 时会下载——**这是首次启动现象**,装完就快了。

### 11.4 一个真实优化案例

我帮人调过一份 nvim 配置,**初始 380ms**:

```
1. tokyonight.nvim         start, 80ms     ← priority 没设
2. nvim-treesitter         start, 75ms     ← 没 lazy
3. nvim-lspconfig          start, 60ms     ← 没 lazy
4. some-ai-plugin          start, 55ms     ← AI plugin 必须立即 init?其实不必
5. nvim-tree.lua           start, 40ms     ← 文件树没必要立即加载
...
```

挨个治:

```
1. 加 priority = 1000          → -50ms(其他 plugin 让位)
2. 加 event = "BufReadPost"    → -65ms
3. 加 event = "BufReadPre"     → -55ms
4. 改 cmd 触发                  → -50ms
5. 改 cmd 触发                  → -35ms
```

**结果:80ms**,**从 380 到 80,快 4.7 倍**。

---

## 十二、常见坑

### 12.1 启动慢 — plugin 没 lazy-load

**症状**:`nvim` 启动 300ms+,打开文件还要等

**根因**:几乎全是 plugin spec 没设 `event` / `cmd` / `ft` / `keys`,默认立即加载

**解法**:`:Lazy profile` 看排前几名,挨个补 lazy 条件

### 12.2 LSP 不工作

**症状**:打开 Python 文件,没有补全 / 没有 hover / `:LspInfo` 显示没有 client attach

**根因**(由频次排序):

```
1. Mason 没装 server         → :Mason 看 pyright 装没装
2. server 在 PATH 但 lspconfig 没配 → lua/plugins/lsp.lua 里加 setup
3. capabilities 没传补全     → 装了 cmp 但 LSP 不通知 cmp
4. root_dir 错               → LSP 在 monorepo 找不到项目根
5. server 自身有 bug         → :LspLog 看 server 输出
```

**排错三连**:

```vim
:LspInfo       " 看当前 buffer 的 LSP client 状态
:Mason         " 看 server 装没装
:LspLog        " 看 server stderr
```

### 12.3 Tree-sitter 高亮坏

**症状**:某个语言突然没高亮 / 高亮乱了

**根因**:Tree-sitter parser 跟 Neovim 版本不匹配(parser 是动态库,Neovim 升级后老 parser 可能 ABI 不兼容)

**解法**:

```vim
:TSUpdate
```

跑完后重启 nvim。**90% 的"Tree-sitter 突然坏了"都是这一招治**。

### 12.4 中文输入法 normal mode 不响应

**症状**:你在 insert mode 切中文输入法打了几个字,按 esc 回 normal mode,**hjkl 不响应**——因为输入法还在中文模式,按 j 被吞掉。

**根因**:输入法在系统层级捕获键盘,Neovim 收到的是 IME 处理过的字符

**解法**:**自动切换输入法**

```lua
-- 进入 normal mode 自动切回英文
vim.api.nvim_create_autocmd("InsertLeave", {
  callback = function()
    -- macOS:用 im-select 切回 ABC
    vim.fn.system("im-select com.apple.keylayout.ABC")
    -- Linux + fcitx5:
    -- vim.fn.system("fcitx5-remote -c")
  end,
})
```

**前提**:装 `im-select`(macOS)/ 确认 `fcitx5-remote` 在 PATH(Linux)。

### 12.5 :checkhealth 不过

```vim
:checkhealth
```

**这是 Neovim 内置的健康检查**——会列出所有"应该装但没装"的依赖:Node.js / Python provider / ripgrep / fd / curl……。**新装 Neovim 第一件事**就是跑一遍 checkhealth,补上缺的二进制。

```
nvim-treesitter
  - ERROR: `tree-sitter` executable not found (parser generation will fail)
   Suggestion: install tree-sitter CLI via `npm install -g tree-sitter-cli`

telescope.nvim
  - WARNING: `rg` not found
   Suggestion: install ripgrep for live_grep

  - WARNING: `fd` not found
   Suggestion: install fd for find_files
```

**对照着补**——`rg` / `fd` 是 telescope 的关键依赖,11 篇专讲。

### 12.6 mason 装的 server 不在 PATH

**症状**:`:Mason` 显示装了 `gopls`,但终端 `which gopls` 找不到

**原因**:Mason 装到 `~/.local/share/nvim/mason/bin/`,只在 Neovim 内部 PATH

**解法**:**别把 Mason 当系统包管理器用**——它给 Neovim 用就够了。需要在 shell 用 `gopls`,自己 `brew install gopls` 或 `go install`。

### 12.7 lazy-lock.json 没提交

**症状**:你在 A 机器配置好,B 机器 git pull 后 plugin 版本对不上,有的 plugin 升级了 breaking,Neovim 突然报错

**根因**:`~/.config/nvim/lazy-lock.json` 是版本锁文件,**必须提交**

**解法**:`.gitignore` 不要忽略 `lazy-lock.json`。**这跟 `package-lock.json` / `Cargo.lock` 是同一回事**。

---

## 十三、vim 仍然在的场景

讲了一大堆 Neovim,**vim 没死**——这些场景下用系统 vim 更对。

```
1. 远端服务器 / 容器内
   - 系统自带 vim,5MB,启动即用
   - Neovim 要装 + plugin manager + plugin,100MB+ 不合适

2. 极简场景
   - vim init.lua,纯心智不配置
   - 临时改个文件,要的就是"打开 - 改 - 保存 - 退出"

3. 跟同事远程协作 share screen
   - 默认 vim 大家都会
   - 你的 LazyVim 一堆自定义 keymap,别人看不懂

4. Alpine / 嵌入式 / distroless
   - vim-tiny 几 MB
   - Neovim 跑不起来

5. 老 SSH 跳板机
   - 装不了新工具,只有 vim
   - 你的 muscle memory 必须能跑在裸 vim 上
```

**心智**:**Neovim 是本机工作站,vim 是出门工具**——两个都要会,**不冲突**。**你的 vim muscle memory 应该在裸 vim 也能用 80%**(基本 `dwip` / `ci"` / `:%s/foo/bar/g` 这些)——剩下 20% 是你 Neovim 里的高级 keymap,远端没有就没有。

---

## 十四、反对的写法

这一节列我**反复见过**的反模式——你或多或少都犯过几条:

### 14.1 从零写 init.lua

```
"我要完全控制,自己写一份完美的 init.lua"
   ↓
两周后:
   ↓
你的配置是一个简陋版 LazyVim
   - LSP 配错 attach 时机
   - 补全自动触发漏了一些
   - Tree-sitter parser 装不全
   - 一堆 edge case 你没处理
   ↓
半年后:
   ↓
完全没动,因为改不动了
```

**解法**:**fork kickstart.nvim,fork 完先用一个月,该改的改、不该改的别动**。等你真懂了所有机制,再考虑从零。**99% 的人不会到那一步**——而且也没必要。

### 14.2 LazyVim + kickstart + NvChad 混着抄

```
今天看 LazyVim 默认 Theme 不错,抄一段过来
明天看 kickstart 的 LSP 配置干净,抄一段过来
后天看 NvChad 的 statusline 好看,抄一段过来
↓
半年后:
↓
plugin spec 重复定义、lazy 触发条件冲突、keymap 互相覆盖
你已经搞不清你的配置是哪个发行版的变种
```

**解法**:**选一个,坚持一个**。要 fork LazyVim,就 fork 完;要 fork kickstart,就 fork 完。**改的时候只看你自己 fork 的那份**,不要再去抄。

### 14.3 抄网上一千行 init.lua

GitHub 上那种 5k star 的个人 dotfiles 看起来很漂亮——**但那是别人的牙刷**:

```
你抄过去:
   - 80% 的 plugin 你这辈子都不会用(他的 orgmode、obsidian.nvim、specific filetype)
   - 他的 keymap 跟你的 muscle memory 不一致
   - 他的快捷键有 200 个,你最终用 20 个
   - 启动慢 3 倍,因为他没用 lazy-load
```

**解法**:**抄逻辑,不抄文件**——看人家某个 plugin 怎么配,**抄那个 plugin 的 spec**,不要 `cp ~/dotfiles/.config/nvim/* ~/.config/nvim/`。

### 14.4 装 50 个 plugin 但一年用 5 个

```
"这个 plugin 看起来很酷,装一下"
   ↓
半年后,LazyVim 装了 80 个 plugin
   ↓
启动从 50ms 涨到 200ms
真在用的只有:LSP / Treesitter / Telescope / Gitsigns / Comment
其他 75 个 plugin 跟着 dotfiles 一起污染十年
```

**解法**:**装 plugin 前,问自己一遍:它替代的工作流是什么?我用了一周还想留吗?**——**两周用不到一次的删掉**。

### 14.5 还在用 packer.nvim / vim-plug / Vundle

```
2026 你还在抄 2020 的教程:
   call plug#begin('~/.vim/plugged')
     Plug 'tpope/vim-fugitive'
     Plug 'preservim/nerdtree'
   call plug#end()
```

**vim-plug** 是 2014 年的,**Vundle** 是 2012 年的,**packer.nvim** 2023 年停止维护——**这三个在 2026 都是古董**。新装一台机器还抄它们,**等于主动放弃** lazy-load / 声明式 spec / 自动 bootstrap 这一整套现代能力。

**解法**:**lazy.nvim**——前任和后继之间没人。

### 14.6 用 ale 做格式化 / linter

```
" 老配置:
let g:ale_linters = {'python': ['ruff', 'mypy']}
let g:ale_fixers  = {'python': ['black', 'isort']}
let g:ale_fix_on_save = 1
```

**ALE 是 vim 时代的**——Neovim 时代被 `conform.nvim`(format)和 `nvim-lint`(lint)替代。**ALE 仍能跑,但生态走了**——LazyVim / kickstart / NvChad 全部用现代选择。

**解法**:**conform.nvim + nvim-lint** 是 2026 的标配。

### 14.7 关掉 lazy-load 想"图省事"

```lua
{ "telescope.nvim", lazy = false }  -- 立即加载
{ "gitsigns.nvim",  lazy = false }
{ "nvim-cmp",       lazy = false }
```

**这是反向操作**——你嫌 lazy 配麻烦,所有 plugin 一刀切设 `lazy = false`。**启动时间从 30ms 飙到 300ms**,然后你抱怨"Neovim 启动太慢"。

**解法**:**默认就让 plugin spec 自己决定**(LazyVim / kickstart 配的都有合理的 event)。**`lazy = false` 只给 colorscheme 和必须立即跑的 plugin**(< 5 个)。

### 14.8 LSP 和补全没接通

```lua
-- LSP 配置(没传 capabilities)
lspconfig.pyright.setup({})

-- nvim-cmp 配置(独立)
cmp.setup({
  sources = { { name = "nvim_lsp" } }
})
```

**结果**:LSP 跑了,补全 UI 在,**但补全里没有 LSP 候选**——因为 LSP 不知道有 cmp 在等它。

**解法**:**`capabilities` 必须从 cmp-nvim-lsp 拿,传给 lspconfig**

```lua
local caps = require("cmp_nvim_lsp").default_capabilities()
lspconfig.pyright.setup({ capabilities = caps })
```

**这一行漏了,补全功能就少一半**——常见到几乎是新手必踩的坑。

### 14.9 设置 leader 在 lazy.setup 之后

```lua
-- 错误:
require("lazy").setup({ ... })
vim.g.mapleader = " "   -- 太晚了!
```

`lazy.nvim` 在 setup 时已经注册了所有 plugin 的 `keys = {...}`——**leader 必须在 setup 前定**,不然 plugin 的 leader 快捷键全部用错的 leader 注册。

**解法**:

```lua
-- 正确:第一行就设
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

require("lazy").setup({ ... })
```

### 14.10 把 plugin 当神奇调料一直加

```
"听说 noice.nvim 很潮,装"
"听说 mini.animate 很酷,装"
"听说 dressing.nvim 必备,装"
↓
加完看不出区别,但启动慢了 50ms
```

**解法**:**每装一个 plugin,问自己:这个 plugin 解决我哪个具体痛点?**——回答不出来就不装。**plugin 的存在不证明你需要它**。

---

## 十五、迁移指南:从 packer / vim-plug 到 lazy.nvim

### 15.1 备份

```bash
mv ~/.config/nvim    ~/.config/nvim.bak-2026
mv ~/.local/share/nvim ~/.local/share/nvim.bak-2026
```

**5 秒**——出问题 `mv` 回来。

### 15.2 fork LazyVim 或 kickstart

```bash
# LazyVim:
git clone https://github.com/LazyVim/starter ~/.config/nvim

# 或 kickstart:
git clone https://github.com/nvim-lua/kickstart.nvim ~/.config/nvim

# 然后改成自己的 git
cd ~/.config/nvim
rm -rf .git
git init
git remote add origin git@github.com:<you>/nvim-config.git
```

### 15.3 启动一次

```bash
nvim
```

**第一次启动会**:
- 下载 lazy.nvim
- 安装所有默认 plugin
- 装 Tree-sitter parser
- 装 LSP server

**全程 30-60s**,看着 UI 跑就行。

### 15.4 把老的 plugin 一个个迁回来

**不要一次全迁**——读你老的 `init.vim` / `init.lua`,**真用的 plugin** 不超过 10 个。挨个找 lazy.nvim 形式的 spec,加到 `lua/plugins/` 下。

### 15.5 把老的 keymap 迁回来

老的 `nnoremap <leader>x ...` 改成 Lua:

```lua
vim.keymap.set("n", "<leader>x", "...")
```

**关键**:**那些你已经一年没用的 keymap,这次不要迁**——清理一次。

### 15.6 一周后删 bak

```bash
rm -rf ~/.config/nvim.bak-2026 ~/.local/share/nvim.bak-2026
```

**保持一周缓冲**——出问题随时回滚。

---

## 十六、看完这一篇你应该能

- **在新机器 30 分钟内搭出能写代码的 Neovim**——LazyVim 或 kickstart 起步,8 个核心 plugin 默认在跑
- **解释 LSP / Tree-sitter / lazy.nvim / Mason 各自的角色**——不是把它们当魔法,是知道四件不同的事
- **写 plugin spec**——`event` / `cmd` / `ft` / `keys` 触发条件选哪个、`config` vs `opts` 区别
- **调启动时间**——`:Lazy profile` 找前 3,挨个治到 < 100ms
- **设计自己的 leader key 体系**——按 `f/g/x/l/b/w/e` 类别组织,which-key 兜底
- **看到 packer / vim-plug / ALE 的教程**,**第一反应是「这不是 2026 的做法」**
- **解释什么时候用 Neovim,什么时候用裸 vim**——本机工作站 vs 出门工具

### 16.1 自查清单

读完这一篇,做一遍这些事:

```
□ 现在你的 Neovim 配置是哪条路线?
□ 启动时间多少?(nvim --startuptime / hyperfine)
□ :Lazy profile 显示的前 3 慢点是什么?
□ LSP 你能配多少种语言?(:LspInfo 在每种文件里看)
□ Tree-sitter parser 装齐了吗?(:TSInstallInfo)
□ Mason 装的 LSP server 有几个?
□ 你 leader 用什么?其下组织能讲清楚吗?
□ 8 个必备 plugin 你都有吗?
□ 启动时间能压到 < 100ms 吗?
```

**做完这 9 条,你的 Neovim 工程化就过关了**——接下来是 21 篇,讲那条"完全不抄 vim 的另一条路":**Helix**。

---

## 十七、下一篇预告

下一篇:**`21-Helix开箱即用.md`**——讲一个**完全不抄 vim 的现代 modal 编辑器**。

Neovim 配完能用要 1-2 周,Helix 装上来就有 LSP + Tree-sitter + 多光标 + 完整快捷键提示 — **0 配置**。**但它没有 plugin 生态,没法做 vim 的"瑞士军刀"**。这种 trade-off 适合谁?

```
- Helix 的 selection-first 心智(范围 → 动词,反 vim 来)
- 装上即用的 LSP / Tree-sitter / multi-cursor / picker
- 配置文件就 20 行 TOML
- vs Neovim 的对比表:哪些场景 Helix 完胜,哪些场景 Helix 仍是减法
- 谁该用、谁不该用、能不能混用
- 2026 Helix 在 modal editor 阵营的位置
```

**读完 21 篇,你能在 Helix 和 Neovim 之间做出选择,而不是被默认主流推着走**。**这就是 modal editor 阵营的两条路:**Neovim 走"可编程瑞士军刀"路线、Helix 走"开箱即用专注编辑"路线**——**没有标准答案,只有"你的工作流匹配哪条"的工程判断**。
