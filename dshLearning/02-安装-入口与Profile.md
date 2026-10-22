# 安装、入口与 Profile

01 篇说过,运行中的 dsh 是一棵按层组装的插件树,而 profile 决定这棵树怎么组装。这一篇把它落到操作上:有哪几种安装方式、`dsh` 这个命令怎么解析参数、五个随附 profile 各是什么、Web UI 有哪些启动参数,以及 dsh 往你机器上的哪个目录写了什么。

> 一句话先记住:**`dsh` 只有一个启动器,所有入口都是"启动某个 profile"。profile 是一叠 bundle 加上你自己的 patch,所有用户数据都在 `$DSH_HOME`(默认 `~/.dsh`)这一个目录下**。

---

## 一、四种安装方式

| 方式 | 你得到什么 | 前置条件 | 适合 |
| --- | --- | --- | --- |
| **npx** | npm 包 `@deepseek-ai/dsh` 提供的 `dsh` 命令 | Node.js 22.19+ 或 24+ | 最快试用,服务器上跑 Web UI |
| **从源码** | 仓库 checkout + `pnpm dsh` | Node.js、pnpm、Git | 读源码、改插件、跟最新提交 |
| **Python wheel** | `deepseek-harness-sdk`,自带对应平台的运行时和 `dsh` 命令 | Python 3.10+ | 在 Python 程序里嵌入 dsh |
| **Desktop** | Electron 应用,内置运行时 | macOS 或 Windows | 不想装 Node、要原生窗口 |

### 1.1 npx

```bash
npx @deepseek-ai/dsh web
```

默认行为:

- 在 `http://127.0.0.1:3080` 启动 Web UI,只监听本机回环地址
- 本地启动时自动用默认浏览器打开;打开的 URL 带一次性的进程 token,浏览器拿到签名 cookie 后再跳回不带 token 的地址
- **通过 SSH 启动时只打印 URL、不开浏览器**(检测到非空的 `SSH_CONNECTION` 或 `SSH_TTY`),因为本地转发地址由 SSH 客户端或编辑器掌握
- 加 `--no-open` 只起服务、不开浏览器

Node 版本以仓库为准:根 `package.json` 的 `engines` 写的是 `^22.19.0 || >=24.0.0`,`docs/development.md` 说 CI 覆盖 22.19、24、26。

两个实用建议:

```bash
# 锁定版本,避免 npx 每次拉到不同的预览版
npx @deepseek-ai/dsh@0.2.1-rc.2 web

# 下文所有 dsh 命令,用 npx 时都写成 npx @deepseek-ai/dsh ...
npx @deepseek-ai/dsh --version
```

官方文档只给了 npx 这一种 npm 用法,没有写全局安装。想要一个常驻的 `dsh` 命令,可以用 Desktop 的"Manage dsh Command"(见 1.4)。

### 1.2 从源码运行

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm dsh <参数>` 直接用 `node --import tsx/esm` 跑 `apps/cli/src/bin.ts`,**不会自动构建**。它只检查前端产物在不在,不检查新不新:改了代码忘记 `pnpm run build`,浏览器里跑的可能还是旧代码。插件开发的热重载循环见 18 篇。

### 1.3 Python wheel

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

- 安装时会一起装上匹配平台的运行时 wheel(`deepseek-harness-sdk-runtime-<platform>-<arch>`)和 `dsh` 命令,**正常使用不需要系统 Node.js**
- 支持平台:Linux x64、Linux arm64、macOS 14+(arm64)、Windows x64
- SDK 默认启动 `dsh --profile sdk`,官方的最小示例用 `sdk-minimal`
- **每次启动都必须显式给出 Harness home**(`dsh_home` 参数或非空的 `DSH_HOME`),SDK 故意不去找 `~/.dsh`
- wheel 里也打包了完整的 `web` profile 和前端资源,需要浏览器界面时可以对着同一个 `DSH_HOME` 跑 `dsh web`

SDK 的 API、会话恢复和事件见 27 篇。TypeScript SDK(`@deepseek-ai/dsh-sdk-client`)同样是解析同版本的 `dsh` 依赖再选 `sdk` profile。

### 1.4 Desktop

Desktop 是包在完整 Web 应用外面的一层 Electron 壳:

- **只发行 macOS(arm64、x64)和 Windows x64**,打包文档原话 "Linux is not a supported Desktop release target"
- 自带 dsh 运行时、pnpm,以及一套 Python / Node 发行版,不依赖系统里的 Node
- 后端监听 `127.0.0.1` 上由系统分配的端口,不会和 `dsh web` 的 3080 冲突
- 独占保留的 `$DSH_HOME/profiles/desktop`;**和 npm 版共享 `$DSH_HOME` 下的会话等产品数据,但插件、依赖、lockfile 互不共享**
- 关闭主窗口只是隐藏,后台任务继续跑;Windows 从托盘找回,彻底退出用 Quit

想在终端里也有 `dsh` 命令:应用菜单 **Manage dsh Command…**(在 **Check for Updates…** 下面)提供 Install / Repair / Remove。macOS 会创建 `/usr/local/bin/dsh`,Windows 写进当前用户的 PATH。这个命令用的是 Desktop 内置的运行时,版本跟着 Desktop 走。**卸载 Desktop 前先 Remove**,卸载程序不会帮你删这个注册。

Desktop 的分析事件属于数据外发的一部分,见 06 篇。

---

## 二、`dsh` 启动器的语法

```text
dsh [--profile] <name> [启动器参数] [应用参数...]
dsh plugin --profile <name> <pnpm 参数...>
```

### 2.1 启动器参数

| 参数 | 作用 |
| --- | --- |
| `--profile <name>` | 启动 `$DSH_HOME/profiles/<name>`;`dsh web` 是 `dsh --profile web` 的简写 |
| `--from-default-profile <template>` | 用随附模板**重建**一个自定义 profile,再启动(见 3.3) |
| `--patch <path>` | 额外叠一层 patch,可重复,按出现顺序生效 |
| `--dump-config` | 打印组装后的完整插件树,然后退出 |
| `--dump-default-config` | 只打印 bundle 层,不含你的 patch |
| `--dump-config-schema` | 打印插件配置的 JSON Schema |
| `-V` / `--version` | 打印版本 |

### 2.2 启动器参数和应用参数的分界

启动器只解析自己认识的参数,**遇到第一个不认识的 token,从它开始全部原样交给被启动的应用**:

```bash
dsh --profile web --port 8080        # --port 属于 web 应用
dsh --profile headless "跑一遍测试"   # 任务文本属于 headless 应用
dsh --profile web --help             # web 应用自己的帮助
dsh --help                           # 启动器自己的帮助
```

所以启动器参数必须写在前面。`dsh web --port 8080 --patch x.yml` 里的 `--patch` 已经落在应用参数里,不会被当作 patch。另外,`plugin` 只有紧跟在 `dsh` 后面才是插件管理子命令;要启动一个名叫 `plugin` 的 profile,得写 `dsh --profile plugin`。

### 2.3 退出与信号

- 参数错误、配置解析失败、必需插件启动失败:非零退出。必需插件失败时会在 `$DSH_HOME/logs/` 写一份 `startup-<时间戳>-<uuid>.log` 并打印路径。报告不脱敏,分享前先检查
- 第一次 `SIGINT` / `SIGTERM` 给插件树最多 5 秒优雅退出;`SIGTERM` 退出码 0,`SIGINT` 退出码 130;第二次信号立即强制退出

---

## 三、Profile

### 3.1 五个随附 profile

| profile | 叠的 bundle | 做什么 | 补丁热重载 |
| --- | --- | --- | --- |
| `web` | `dsh-base` + `dsh-web-app` | 浏览器 UI | 开启 |
| `headless` | `dsh-base` + `dsh-headless` | 跑一个任务,stdout 输出最终答案后退出 | 只在启动时应用 |
| `sdk` | `dsh-base` + `dsh-sdk-app` | 通过 stdio JSON-RPC 服务 SDK 客户端 | 只在启动时应用 |
| `sdk-minimal` | 只有 `dsh-sdk-minimal` | 精简的独立 SDK 树 | 只在启动时应用 |
| `acp` | `dsh-base` + `dsh-acp-app` | 通过 stdio 提供 ACP 服务 | 只在启动时应用 |

- 这五个名字**第一次使用时会从模板自动初始化**,其他不存在的名字会直接报错,并提示用 `dsh plugin --profile <name> add <package>` 初始化
- `desktop` 是 Electron 保留名,CLI 拒绝启动它,也拒绝对它做 config dump
- `sdk-minimal` 是例外:它不叠 `dsh-base`,只有持久 shell、`read_image` 和 `working_directory` 三个工具,**固定 `danger-full-access`,不挂审批服务**,只该在一次性的 checkout 或容器里用
- 所有基于 base 的 profile 都把**启动时所在的目录**当作默认工作区根,加载适用的 `AGENTS.md` / `CLAUDE.md`(07 篇)

headless 的常用参数先列一下,详细的事件流和退出码在 27 篇:

```bash
dsh headless "run the tests"                       # 最终答案打到 stdout
echo "run the tests" | dsh headless                # 从 stdin 读任务
dsh headless --json "run the tests"                # 换成 NDJSON 事件流
dsh headless --session-id session-… "continue"     # 续上已有会话
```

### 3.2 profile 目录里有什么

```text
$DSH_HOME/profiles/web/
├── package.json        # dsh.profile.bundles 列出叠哪些 bundle;dependencies 是外部插件
├── cordis.patch.yml    # 你自己的 patch 层,Settings 页面的改动也写在这里
└── node_modules/       # dsh plugin(pnpm)装进来的外部插件
```

随附的 bundle(`dsh-base`、`dsh-web-app` 等)总是从当前这份 dsh 安装里解析,不会装进 profile 目录;profile 自己的 `node_modules` 只放外部插件。插件安装和 `dsh plugin` 的细节见 20 篇。

### 3.3 自定义 profile

两种方式:

```bash
# 方式一:从随附模板复制一个新 profile 并启动
dsh rescue --from-default-profile web
dsh rescue            # 以后直接启动,不要再带 --from-default-profile

# 方式二:用 dsh plugin 初始化一个只叠 dsh-base 的 profile
dsh plugin --profile tui add <package>
```

`--from-default-profile` 的语义在 `v0.2.1-alpha.2` 之后的版本里变过:以前目标已存在就拒绝,**现在每次都整体替换**——旧目录连同 `package.json` 依赖、`node_modules` 和 `cordis.patch.yml` 一起删掉。目标名不能是五个随附名字(不区分大小写)。复制只拷模板当时的 bundle 列表,不记录"继承自哪个模板"。

### 3.4 不启动,先看树

```bash
dsh --profile web --dump-default-config          # 只有 bundle 层
dsh --profile web --patch ./extra.yml --dump-config   # 加上 profile、home 和 --patch 层
dsh --profile web --dump-config-schema           # 各插件配置的 JSON Schema
```

- `--dump-config` 会在注释里标出每一行来自哪个文件、被哪些叠加层改过,找不到目标的 patch 会在 stderr 报出来
- 三个 dump 参数互斥,都不接受应用参数;dump 会初始化缺失的 profile 文件
- `--dump-config-schema` 会 **import 每个插件模块**去读 schema,只对你已经信任的插件用

四层叠加、按行 id 整体替换、启动失败策略,是 11 篇的主题。

---

## 四、Web profile 的启动参数

| 参数 | 作用 |
| --- | --- |
| `--host <ip>` | 监听一个具体的本机 IPv4 / IPv6 地址;**通配地址被拒绝**,`--host 0.0.0.0` 直接报用法错误 |
| `--port <port>` | 端口,默认 3080;`0` 让系统挑一个空闲端口 |
| `--no-open` | 不打开浏览器 |
| `--public-url <url>` | 对外宣告的 HTTP(S) 根地址(反向代理后面用);**只是宣告,不授予信任** |
| `--trusted-host <authority>` | 额外接受的 Host / Origin,可重复 |
| `--tls-cert <file>` + `--tls-key <file>` | 用你提供的证书链和未加密私钥直接服务 HTTPS;两个必须一起给 |

```bash
dsh web --no-open --port 8080
dsh web --tls-cert ./server-chain.pem --tls-key ./server-key.pem
dsh web --host 10.0.0.7 --public-url https://app.example/ --trusted-host app.example
```

几条安全相关的事实:

- 启动时打印的 URL 带进程凭证,**只发给你想授权的人**
- 非回环地址且没开 TLS 时走明文 HTTP,启动时会警告
- dsh 不申请、不续期、不监视证书;换证书要重启或重载监听
- `--public-url` 和 `--trusted-host` 都不保护端口本身,端口要靠网络层限制

放到公网、挂反向代理、接 GitHub webhook 的完整做法见 28 篇。

---

## 五、`$DSH_HOME` 目录布局

### 5.1 位置

解析顺序:插件配置里显式给的路径 > `$DSH_HOME` > `~/.dsh`。`$DSH_HOME` 为空或全是空格时视为未设置。

### 5.2 里面有什么

```text
~/.dsh/
├── profiles/
│   ├── web/  headless/  sdk/  sdk-minimal/  acp/   # 随附 profile,首次使用时生成
│   ├── desktop/                                    # Desktop 专用,CLI 不碰
│   └── <自定义>/
├── cordis.patch.yml      # home 级 patch,所有 profile 共享,优先级高于 profile 自己的 patch
├── .env                  # home 级环境变量层
├── .credentials.yaml     # 凭证存储(03 篇)
├── sessions/             # 会话 JSONL 日志(07、17 篇)
├── storages/             # JSON 键值存储:工作区、会话列表投影缓存等
├── attachments/v1/       # 图片等附件,内容寻址,不进会话日志
├── cache/                # 可再生的缓存
├── logs/                 # startup-*.log 启动诊断报告
└── .anonymous-user-id    # 遥测用的匿名 id(06 篇)
```

Desktop 还会在首次需要时把内置的 Python / Node 运行时装到 `dsh-runtimes/dsh-primary-runtime`。另外有一个**不在 `$DSH_HOME` 里**的根:`~/.agents`(可用 `$DSH_AGENTS_HOME` 改),放和其他 agent 工具共享的用户级 `AGENTS.md` 和 `skills/`。

### 5.3 两个 `.env` 的规矩

- 启动目录的 `.env` 优先于 `$DSH_HOME/.env`,两者都低于你在 shell 里导出的环境变量
- **决定进程如何启动的变量不能写在文件里**:`PATH`、`DSH_*`、`XDG_*` 等会被拒绝,必须导出。所以 `DSH_HOME` 本身没法写进 `.env`
- 代理变量(`HTTP_PROXY` 等)只接受 home 级 `.env`,项目里的 `.env` 写了会拒绝启动(03 篇)

### 5.4 两个 `cordis.patch.yml`

profile 级的那份是"这个 profile 的个人配置",Web 的 Settings 页面也写这份;home 级的那份是"这台机器的偏好",对所有 profile 生效且优先级更高。home 级 patch 覆盖了的行,Settings 页面会拒绝写入。空文件或只有注释的 patch 会让启动失败,想停用这一层就写 `[]`。

---

## 踩坑

1. **`dsh web --port 8080 --patch x.yml` 报错或 patch 不生效**——`--port` 是第一个应用参数,它后面的 `--patch` 也交给了 web 应用,不会被当作 patch。启动器参数一律写在前面
2. **反复执行 `dsh rescue --from-default-profile web`**——`v0.2.1-alpha.2` 之后的版本每次都会删掉旧目录、插件和 patch。重建一次之后去掉这个参数
3. **`--host 0.0.0.0` 想让局域网访问**——通配地址被拒绝,给一个具体的本机地址,并配合 `--trusted-host`
4. **以为 `--public-url` 就能从外网访问**——它只改宣告的地址,不授予信任,浏览器看到的 authority 还要用 `--trusted-host` 放行
5. **SSH 到服务器上 `dsh web`,浏览器没弹**——这是设计行为,用打印出来的 URL 配合端口转发
6. **把 `DSH_HOME` 写进 `.env`**——`DSH_*` 不接受来自文件,要在 shell 里导出
7. **Python SDK 报找不到 home**——SDK 不会默认用 `~/.dsh`,必须传 `dsh_home` 或设置 `DSH_HOME`
8. **在 Linux 上找 Desktop 安装包**——Linux 不是 Desktop 的发行目标,用 npx 或源码跑 `dsh web`
9. **源码改了但界面没变**——`pnpm dsh` 不会自动构建,也不检查产物是否过期,先 `pnpm run build`
10. **卸载 Desktop 后终端里还有 `dsh`**——卸载程序不移除命令注册,卸载前先 **Manage dsh Command… → Remove**

---

## 源码与文档索引

- `README.md`
- `apps/cli/README.md`
- `apps/cli/reference/README.md`
- `docs/cli-help.md`
- `packages/bundle/web-app/README.md`
- `packages/boot/app-boot/README.md`
- `apps/desktop/README.md`
- `apps/desktop/packaging/README.md`
- `docs/user/guide/python-sdk.md`
- `packages/util/home-paths/README.md`
- `docs/upgrade-guide/v0.2.1-alpha.2/from-default-profile-replaces-target/guide.md`
- `package.json`

---

下一篇:`03-模型-凭证与网络.md`,讲 DeepSeek 原生路由与账号登录、reasoning effort,pi-ai 第三方目录与自定义模型 API,凭证存在哪、谁优先,以及怎么让 dsh 走代理。
