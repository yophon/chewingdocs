# ssh 深用:config / ProxyJump / 端口转发 / 密钥管理 / mosh

90% 的工程师每天都在用 `ssh`,但**这 90% 的人对 ssh 的全部认知就一句**:`ssh user@host`。**这是行业里最普遍、也最容易被忽视的「技能债」**——你每天敲 50 次 ssh,但你从来没读过自己的 `~/.ssh/config`,你的 key 散在 `~/.ssh/` 下叫 `id_rsa` / `id_rsa_old` / `prod.pem` / `aws.pem`,你连 prod 要先 `ssh bastion`、再 `ssh -i ~/.ssh/prod.pem ubuntu@10.0.x.x`,本地连云上 RDS 要打开 4 个终端跳着开,key 文件直接放在硬盘上(没 passphrase、没 agent、没 Keychain),网络一断 vim 半天的工作就丢。**这套日常你已经习惯了**,但稍微深一点的工程师看你这么用 ssh,**就像看一个写代码不用 IDE 跳转、全靠 `grep` 找定义的人**。

> 一句话先记住:**ssh 的生产力不在命令行,在 `~/.ssh/config`——一份好 config 能让所有跳板、端口转发、密钥都变成 `ssh prod-db` 一行**。命令行那些 `-i`、`-p`、`-J`、`-L`、`-D`、`-o ...` 不是日常用法,是 config 写不下时才用的逃生口。**还在每次 `ssh -i ~/.ssh/key.pem -p 2222 ubuntu@xxx.xxx.xxx.xxx` 敲完整串的人,默认就把生产力打了 5 折**。

这一篇把 ssh 拆成 6 件事讲透:`~/.ssh/config` 的工程化、ProxyJump 跳板、三种端口转发(`-L` / `-R` / `-D`)、密钥管理(从 ed25519 到 1Password agent)、known_hosts 工程、mosh 替代——再加上**替代 ssh 的现代方案**(Tailscale / Session Manager / Cloudflare Tunnel / Teleport)的选型,和一组**反对的写法**。看完你应该能写出一份**生产可用的 70 行 config**,并把团队新人的"上手 ssh"从 3 天压到 30 分钟。

---

## 一、为什么 ssh 必须工程化

### 1.1 三个让命令行党破防的真实场景

**场景 1:凌晨告警,你要进堡垒机后面的 prod DB,翻 4 个备忘录**

```
02:30  告警:某个微服务 5xx 飙升
02:31  你打开终端,要 SSH 进堡垒,再跳到 db 机器看连接池
       但你不记得:
         - 堡垒机 IP(翻 Notion)
         - 堡垒机用户名(查公司 wiki)
         - 堡垒机端口是不是 22(被改成 2222 你忘了)
         - 用哪把 key(`id_rsa_company` 还是 `id_ed25519_prod`?)
         - DB 机器的内网 IP(翻 Confluence)
         - DB 机器的用户名(`dba` 还是 `root`?)
       
02:38  花 8 分钟翻完资料,开始连
02:39  ssh -i ~/.ssh/id_ed25519_company -p 2222 ops@bastion.company.com
       Enter passphrase: ...   ← 你 passphrase 又输错一次
02:40  连进堡垒,然后:
       ssh -i ~/.ssh/prod_db.pem dba@10.20.30.40
       Permission denied (publickey)   ← key 没在堡垒上,只在本地
02:41  你想起来应该 ssh -A 转发 agent,Ctrl+D 退出重连
02:43  终于进去了
02:44  开始查问题
```

**这场景的核心不是「你网络不熟」**——是**你的 ssh 没有工程化**,所以每次都要重新拼一遍。这种事故里 14 分钟全部在和 ssh 搏斗,不是和故障搏斗。**对照组**:同事一行 `ssh prod-db`,直接进。差别不是技能,是**有没有写过 config**。

**场景 2:本地连云上 RDS 调一个 ORM 问题,翻了 4 个 GUI 工具**

```
你要本地拿 DBeaver 连云上 PostgreSQL 看一条慢查询
但 RDS 只在 VPC 内部可达,不能从公网直连
你的方案:
  - 打开 DBeaver,新建连接
  - 翻文档:DBeaver 怎么配 SSH Tunnel?
  - 跟着教程点开 SSH 选项卡,填 bastion 信息
  - 填错了几次,DBeaver 还卡死了一次
  - 30 分钟后终于连上

  下次换 IDEA 的 DataGrip,你又得重做一次
  下次换 TablePlus,你又得重做一次
  每个 GUI 都自己实现一套 ssh tunnel UI,各做各的烂
```

**这是典型的「在 GUI 里重新发明 ssh」**。**真正的工程师姿势**:在 `~/.ssh/config` 写一行 `LocalForward 5432 db.internal:5432`,后台一个 `ssh -fN bastion`,**任何**桌面工具(DBeaver / DataGrip / TablePlus / psql / 你写的 Python 脚本)都通过 `localhost:5432` 连,**统一一次,跨工具复用**。

**场景 3:火车上调代码,过隧道一断,vim 进度全没**

```
高铁上,你 ssh 进开发机写代码,vim 编辑了 30 分钟
进隧道:连接断了 30 秒
出隧道:vim 进程已经被 sshd 杀掉,文件没保存的部分全丢
你重连,只能从上次 :w 开始
```

**这个问题 1990 年代就有人解决了**——**mosh**(MIT 2012 年开源)就是为弱网设计:UDP + 本地回显 + 漫游,**断网 30 秒、切 WiFi、过隧道都不掉**。但 95% 的工程师没装,因为「我没遇到这个问题啊」——**实际上你天天遇到,只是你已经习惯了**(每次断了重连一遍,觉得是常态)。

### 1.2 这三个场景的共同点

```
不是"ssh 命令不够强"          —— ssh 本身的能力 20 年前就够
不是"你不会用 ssh"             —— 你天天用
不是"没有替代方案"             —— 全部都是 ssh 一行 config 的事

是"你的 ssh 没有工程化":
   —— 没写 config,每次重新拼
   —— 不用 agent / 不用 Keychain,密钥管理全靠肉记
   —— 不知道有端口转发,只会开终端
   —— 不知道有 ControlMaster,连接复用没开
   —— 不知道有 mosh,弱网就重连
```

**ssh 工程化的本质**:**让"我和远端机器的关系"从"每次重新建立"变成"一行 config 维护"**。和 dotfiles 一样——**把一次性的人力劳动,变成可声明、可复用、可传承的配置**。

---

## 二、`~/.ssh/config` 的心智:声明式主机簿

### 2.1 这个文件到底是什么

```
~/.ssh/config 不是"一堆 flag 缩写",它是"声明式的主机簿":

   每个 Host 块声明一台机器的"身份":
      - 它的真实地址、端口、用户、key 在哪
      - 怎么去(直连?跳板?)
      - 连上之后做什么(端口转发?保活?)

   声明完之后,ssh xxx / scp / rsync / git / 任何 ssh 客户端
   都通过这个 Host 名字调用,不再写完整 IP / port / key
```

**和「shell 别名」的关键差别**:
- alias 只是字符串替换,**只对 `ssh` 命令本身有效**
- `~/.ssh/config` 是 ssh 协议的一部分,**所有用 libssh 的程序都尊重它**(rsync、scp、git、vscode-remote、ansible)

**这是一份 config 能值回票价的根本原因**:**写一次,全工具栈生效**。

### 2.2 匹配规则:顺序 + 通配符

```
Host 段从上到下顺序匹配:
   - 第一个匹配上的设置生效
   - 之后匹配上的同名设置被忽略
   - 不同名的设置叠加

通配符:
   *        匹配任意字符
   ?        匹配单个字符  
   !pattern 排除模式(只能和别的模式一起用)

例子:
   Host *.prod              ← 任何 *.prod 都匹配
   Host !bastion *          ← 除了 bastion 之外的所有 host
   Host db1 db2 db3         ← 三个名字共用一组设置
```

**关键心智**:**特殊配置写在前,兜底通配符写在后**——这样特殊的会被先匹配上,不会被通配兜底覆盖。

### 2.3 一份生产可用的 70 行 config

```bash
# ~/.ssh/config
# 顺序:特殊 host > 跳板 > 跨跳板 > git remote > 通配兜底

# ============ 1. 跳板机(单独声明,后面跨机引用) ============
Host bastion
    HostName        bastion.company.com
    User            ops
    Port            22
    IdentityFile    ~/.ssh/id_ed25519_company
    IdentitiesOnly  yes                        # 只用这一把 key,不用 agent 里其它的

# ============ 2. 通过 bastion 跳的 prod 机器 ============
Host prod-*
    ProxyJump       bastion                    # 自动走 bastion,无感
    User            ops
    IdentityFile    ~/.ssh/id_ed25519_company
    IdentitiesOnly  yes

Host prod-web1
    HostName        10.20.1.11
Host prod-web2
    HostName        10.20.1.12
Host prod-db
    HostName        10.20.2.10
    User            dba                         # 覆盖上面 prod-* 的 ops
    LocalForward    5432 localhost:5432         # 顺便把 DB 端口拉本地

# ============ 3. 开发机(直连,有端口转发) ============
Host devbox
    HostName        dev.company.com
    User            myname
    IdentityFile    ~/.ssh/id_ed25519_company
    IdentitiesOnly  yes
    LocalForward    8080 localhost:8080         # 跑在 devbox 的 web 服务拉本地看
    LocalForward    9090 localhost:9090         # Prometheus
    RemoteForward   2222 localhost:22           # 把本地 22 反向暴露给 devbox

# ============ 4. GitHub / GitLab 分账户 ============
Host github.com
    HostName        github.com
    User            git
    IdentityFile    ~/.ssh/id_ed25519_personal  # 个人账户

Host github-work
    HostName        github.com                  # 也是 github.com,但用不同 key
    User            git
    IdentityFile    ~/.ssh/id_ed25519_company   # 公司账户
# git remote set-url origin git@github-work:company/repo.git

Host gitlab.internal.company.com
    HostName        gitlab.internal.company.com
    User            git
    IdentityFile    ~/.ssh/id_ed25519_company
    ProxyJump       bastion                     # 内网 GitLab 走 bastion

# ============ 5. 临时 / 一次性 host(EC2 短期机器) ============
Host scratch
    HostName        1.2.3.4                     # 临时 EC2,IP 换了就改这一行
    User            ec2-user
    IdentityFile    ~/.ssh/aws-scratch.pem
    StrictHostKeyChecking accept-new            # 反正每次 IP 不一样,自动接受

# ============ 6. 全局兜底(放最后!) ============
Host *
    # 身份与安全
    AddKeysToAgent       yes                    # ssh 连接时自动把 key 加到 agent
    UseKeychain          yes                    # macOS:passphrase 存 Keychain(Linux 无效)
    HashKnownHosts       yes                    # known_hosts 里的 hostname 哈希化
    StrictHostKeyChecking accept-new            # 默认:第一次见自动接受,改了仍拒绝
    VisualHostKey        yes                    # 第一次连接时画 ASCII 指纹图

    # 保活与重连
    ServerAliveInterval  60                     # 每 60 秒发一次 keepalive
    ServerAliveCountMax  3                      # 连续 3 次无响应(180 秒)再断开

    # 连接复用(同一台 host 第二次连接秒开)
    ControlMaster        auto
    ControlPath          ~/.ssh/cm/%r@%h:%p
    ControlPersist       10m                    # 最后一个连接断后,主连接再保持 10 分钟

    # TERM 与 locale(防止远端 vim 颜色坏、locale 错乱)
    SetEnv               LC_ALL=en_US.UTF-8

    # 安全:默认禁用 agent 转发(需要时单独 host 段开)
    ForwardAgent         no
```

**这份 config 完整可用,带注释 70 行**。**每一行如果删掉会怎样**,逐段说:

| 行 | 删掉后果 |
| --- | --- |
| `IdentitiesOnly yes` | agent 里所有 key 都被尝试,服务器配 `MaxAuthTries 3` 时会被锁 |
| `ProxyJump bastion` | 退化成「先 ssh bastion 再 ssh target」两步 |
| `ControlMaster + ControlPath + ControlPersist` | 同一台 host 每次都重新握手(1-2 秒),开 5 个 pane 就是 5 次握手 |
| `ServerAliveInterval / CountMax` | 网络抖一下连接就死,vim 半天的工作丢 |
| `AddKeysToAgent yes` | 每次输 passphrase |
| `UseKeychain yes`(macOS) | macOS 上 passphrase 不存 Keychain,每次重启都要重新输 |
| `HashKnownHosts yes` | known_hosts 明文,泄露后等于公开主机列表 |
| `StrictHostKeyChecking accept-new` | 默认是 `ask`,每次新 host 弹「yes/no」交互 |

**这一段一旦内化,你看任何 ssh config 都像看 Go 函数签名一样,一眼能读懂在声明什么**。

### 2.4 ControlMaster 单独说

这个开关 90% 的人没开,但**它是 ssh 体验的"前后差距最大"开关**:

```
没开 ControlMaster:
   $ tmux 6 个 pane,每个都 ssh devbox
   每个 pane: TCP 握手 + KEX + 认证 = 1-2 秒
   6 个 pane 同时建立 = 6-10 秒抖动
   
开了 ControlMaster auto + ControlPersist 10m:
   第一个 ssh devbox: 正常握手 1-2 秒,主连接建立
   后续 ssh devbox: 复用主连接,瞬间 (~50ms)
   ControlPath socket 文件维持 10 分钟
   
   附赠效果:scp / rsync / git push 同主机时也复用,不重新握手
```

**注意**:`ControlPath` 路径里要有 `%r@%h:%p`(user/host/port),不然不同 user 会被错误复用。**而且 `~/.ssh/cm/` 这个目录要自己 `mkdir -p`**,ssh 不会自动建。

---

## 三、ProxyJump:替代 ProxyCommand 的现代写法

### 3.1 老写法 vs 新写法

```
老写法(OpenSSH < 7.3,2016 年之前):
   ssh -o "ProxyCommand=ssh -W %h:%p bastion" target
   或 config 里:
      Host target
          ProxyCommand ssh -W %h:%p bastion

新写法(OpenSSH ≥ 7.3,2025 默认):
   ssh -J bastion target
   或 config 里:
      Host target
          ProxyJump bastion
```

**为什么换**:
- `ProxyJump` 是 ssh **协议级别**支持,bastion 上**不需要装 nc**(老 ProxyCommand 用 `-W` 时已经不需要,但更早的 `nc %h %p` 写法需要)
- ProxyJump 走的是 **direct-tcpip channel**(协议内通道),比 ProxyCommand 起一个 ssh 子进程更轻
- 语法更短,易读

### 3.2 多跳:`-J host1,host2`

```
本地 → bastion-外网 → bastion-内网 → 目标

ssh -J bastion-public,bastion-internal target-host

config:
   Host target-host
       ProxyJump bastion-public,bastion-internal
```

**多跳的代价**:每跳一次都要握手 + 认证,延迟叠加。**3 跳以上你应该考虑 Tailscale 之类的 mesh 网络**(后面第十节)。

### 3.3 ProxyCommand 仍然有用的场景

```
1. 走非 ssh 的 transport
   - Cloudflare Access:cloudflared 起一个本地 socket,ssh ProxyCommand 走它
   - AWS SSM:走 Session Manager(后面第十节)
   ProxyCommand sh -c "cloudflared access ssh --hostname %h"

2. 自定义 nc-like 工具(老的、特殊网络)
   ProxyCommand nc -X 5 -x proxy.company.com:1080 %h %p   # 走 SOCKS5

3. 一次性脚本拼接,不想用 -J
   ProxyCommand ssh user@gateway 'socat - TCP:%h:%p'
```

**90% 场景用 `ProxyJump`,10% 用 `ProxyCommand`**——记住这个比例就够。

---

## 四、端口转发:三种各管一摊

ssh 的端口转发是**最被低估的功能之一**——它让你不需要 VPN 也能临时把任何机器变成"本地的一部分"。三种各管一摊,**这一节的 ASCII 图你要能在白板上默写**。

### 4.1 本地转发 `-L`:把远端服务拉到本地

**场景**:你想从笔记本连云上 RDS,但 RDS 只允许 VPC 内访问。

```
本地  ←→  ssh tunnel  ←→  bastion  ←→  RDS

$ ssh -L 5432:db.internal:5432 bastion
            ↑    ↑           ↑     ↑
            │    │           │     └─ 远端目标的端口
            │    │           └─────── 远端目标的 host(从 bastion 看出去)
            │    └─────────────────── 远端目标在本地映射到的 port
            └──────────────────────── 本地监听的 port

然后本地:
   $ psql -h localhost -p 5432 -U dba mydb
   实际请求路径:
   localhost:5432 → ssh → bastion → db.internal:5432

ASCII 图:
   ┌──────────────┐                           ┌──────────────┐
   │  你的笔记本  │                           │   bastion    │
   │              │   加密 ssh 隧道           │              │
   │ localhost:   │  ◀────────────────────▶  │              │
   │   5432       │                           │              │
   └──────┬───────┘                           └──────┬───────┘
          │                                          │
          │  psql 连 localhost:5432                  │
          │                                          ▼
          ▼                                  ┌──────────────┐
        进入                                 │ db.internal  │
        ssh tunnel                            │     :5432    │
                                              └──────────────┘
```

**config 写法**:

```
Host bastion
    HostName        bastion.company.com
    LocalForward    5432 db.internal:5432
    LocalForward    6379 cache.internal:6379    # 顺便 Redis 也拉
```

之后 `ssh bastion` 自动开转发,**所有桌面工具都可以连 `localhost:5432`**。

**后台跑不开 shell**:

```
ssh -fN -L 5432:db.internal:5432 bastion
   -f  fork 到后台
   -N  不开远端 shell(只做转发,纯隧道)
```

### 4.2 远程转发 `-R`:把本地服务暴露到远端

**场景**:你笔记本上跑了个 demo(`localhost:3000`),想让公司服务器上的同事能访问。

```
本地  ←→  ssh tunnel  ←→  server  ←→  同事 curl server:8080

$ ssh -R 8080:localhost:3000 server
            ↑    ↑          ↑
            │    │          └── 本地的 host:port(从你机器看)
            │    └───────────── 本地的 port  
            └────────────────── 远端监听的 port(server 上的 8080)

ASCII 图:
   ┌──────────────┐                           ┌──────────────┐
   │  你的笔记本  │                           │   server     │
   │              │   加密 ssh 隧道           │              │
   │ localhost:   │  ◀────────────────────▶  │ 0.0.0.0:8080 │
   │   3000       │                           │ (公开监听)   │
   └──────────────┘                           └──────┬───────┘
                                                     │
                                                     │ 同事 curl
                                                     ▼
                                              ┌──────────────┐
                                              │ 同事的电脑   │
                                              └──────────────┘
```

**坑**:默认情况下,server 上的 `-R 8080` 只监听在 `127.0.0.1`,**同事访问不到**。要在 server 的 `/etc/ssh/sshd_config` 里加:

```
GatewayPorts yes        # 允许 -R 监听到 0.0.0.0
```

**替代方案 ngrok / Cloudflare Tunnel**:不想动 sshd 配置时,用这俩更方便——但本质是同一个东西的 SaaS 版。

### 4.3 动态转发 `-D`:起一个 SOCKS5 代理

**场景**:你出差,要"假装"自己在公司内网,临时用浏览器访问内网管理后台。

```
$ ssh -D 1080 bastion
         ↑
         本地起的 SOCKS5 proxy port

然后浏览器(或任何应用)设 SOCKS5 proxy = localhost:1080
所有流量经过 ssh tunnel 出去,从 bastion 出网

ASCII 图:
   ┌──────────────┐                           ┌──────────────┐
   │  你的笔记本  │                           │   bastion    │
   │              │                           │              │
   │  浏览器      │   ssh tunnel(SOCKS5)    │   出口        │
   │   ↓          │  ◀────────────────────▶  │   → 内网     │
   │ localhost:   │                           │   → 互联网   │
   │   1080       │                           │              │
   │  (SOCKS5)    │                           │              │
   └──────────────┘                           └──────────────┘
```

**chrome 配 SOCKS5 启动**:

```bash
google-chrome --proxy-server="socks5://localhost:1080"
```

**`-D` 和 VPN 的差别**:
- `-D` 走 ssh,只在你显式开 ssh 连接时有,断开就没
- `-D` 不影响系统的默认路由,只有用了 proxy 的应用才走
- VPN 是系统级,所有流量都走,即使你不想

**临时翻墙 / 临时进内网**,`-D` 是最轻量级方案。

### 4.4 三种对照表(必背)

```
┌─────────┬─────────────────────┬──────────────────────────────────┐
│  flag   │  方向                │  典型场景                          │
├─────────┼─────────────────────┼──────────────────────────────────┤
│  -L     │  远端服务 → 本地     │  本地连云上 DB / Redis            │
│  -R     │  本地服务 → 远端     │  把本地 demo 暴露给同事 / 内网回连 │
│  -D     │  本地 SOCKS5 → 远端  │  临时翻墙 / 临时进内网            │
└─────────┴─────────────────────┴──────────────────────────────────┘

记忆法:
   L = Local 监听一个 port(把远端服务拉过来)
   R = Remote 监听一个 port(把本地服务推过去)
   D = Dynamic 万能 SOCKS5(我不知道要访问哪些 IP)
```

---

## 五、密钥管理:从 ed25519 到 1Password

### 5.1 算法选型(2026 默认 ed25519)

```
RSA 2048    ─→ 已弱,不要再用(NIST 已不推荐)
RSA 3072    ─→ 兼容性最好,但慢、密钥长
RSA 4096    ─→ 反向更慢,没解决根本问题(同算法)
ECDSA       ─→ 历史上曾推荐,因 P-256 曲线被 NSA 后门质疑,现冷
ed25519     ─→ ★ 默认 ★
              短(秘钥 ~70 字节)、快、安全模型干净
              OpenSSH 6.5+(2014)就有,2026 兼容性已无问题
sk-ed25519  ─→ 硬件 key 版(YubiKey / FIDO2),需要物理设备触摸
```

**生成**:

```bash
ssh-keygen -t ed25519 -C "you@host" -f ~/.ssh/id_ed25519_company
   -t  算法
   -C  comment(随便写,通常是邮箱或用途)
   -f  输出路径
   提示输 passphrase:输!不要空 passphrase

ssh-keygen -t ed25519-sk -O resident -O application=ssh:github
   YubiKey 版:私钥不能从设备导出,每次签名要按键
```

**永远不要**:
- 不输 passphrase(私钥落盘 = 私钥被窃 = 玩完)
- 多机共用同一把私钥(丢一把全军覆没)
- 把 `id_rsa` 这个名字当工厂默认,不分用途

### 5.2 命名约定

```
~/.ssh/
├── config
├── known_hosts
├── id_ed25519_personal       ← 个人 GitHub
├── id_ed25519_personal.pub
├── id_ed25519_company        ← 公司账户
├── id_ed25519_company.pub
├── id_ed25519_aws_prod       ← AWS prod 账户
├── id_ed25519_aws_prod.pub
└── cm/                       ← ControlMaster sockets
```

**命名规则**:`id_<算法>_<用途/账户>`。**一个 key 一个用途**——丢一把不慌,只换那一份。

### 5.3 ssh-agent:passphrase 只输一次

```
没 agent:
   每次 ssh 都要 passphrase。开 6 个 tmux pane = 输 6 次。
   你忍不住,就开始用空 passphrase。然后私钥裸奔。

用 agent:
   $ eval $(ssh-agent)
   $ ssh-add ~/.ssh/id_ed25519_company
   Enter passphrase: ...   ← 只输一次
   Identity added: ~/.ssh/id_ed25519_company

   之后这台机器上所有 ssh 都从 agent 拿解密好的 key
   关机或 agent 进程退出就清空(更安全)
```

**Agent 工作机制**:agent 是个常驻进程,持有"已解密"的私钥,ssh 客户端通过 `$SSH_AUTH_SOCK` 这个 socket 文件向 agent 请求签名(私钥本体不离开 agent)。

### 5.4 macOS Keychain 集成

macOS 默认就有 ssh-agent 启动(`ssh-agent` 自动跑),但 passphrase 重启就忘——**让 Keychain 替你记住**:

```bash
# 加密钥时一并存到 Keychain
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_company

# 重启后,~/.ssh/config 的全局兜底已经有:
#   UseKeychain yes
#   AddKeysToAgent yes
# 第一次 ssh 时自动从 Keychain 取 passphrase,无感
```

**注意**:`UseKeychain` 这个选项 **只 macOS 有**,Linux 上写了被 ssh 忽略(不报错,但也没用),所以 dotfiles 跨平台同步无问题。

### 5.5 1Password / Bitwarden SSH Agent(2026 推荐)

**这是 2022 年才出现的、改变密钥管理范式的方案**。

```
传统:
   私钥文件存 ~/.ssh/,passphrase 存 Keychain
   私钥本体还在硬盘上,被偷盘 = 被偷 key

1Password SSH Agent:
   私钥存在 1Password vault(加密 + 同步)
   1Password 本身充当 ssh-agent
   ssh 通过 ~/.1password/agent.sock 向它请求签名
   私钥永远不落盘,且 Touch ID / 主密码守门
```

**config**:

```
Host *
    IdentityAgent ~/.1password/agent.sock
```

**好处**:
- 私钥不在硬盘上,被 malware 偷盘也偷不到
- 跨机器同步靠 1Password 自己,新机器登录 1Password 就有所有 key
- Touch ID 解锁,每次 ssh 触一下指纹(轻度)或直接复用解锁状态
- 团队场景:1Password Business 共享 vault,新人入职拉一个 vault 就有所有 key

**坏处**:
- 锁在 1Password 生态(切走得迁)
- 1Password 没启动 = 没 key 用
- 服务器端不变(还是公钥认证),只是客户端密钥管理换了

Bitwarden / 内置工具基本同理,**2026 默认推荐就是这套**——尤其团队场景。

### 5.6 ssh-copy-id:把公钥推到服务器

新机器,要把你的公钥加到远端 `authorized_keys`:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_company.pub user@host
   # 这一步等价于:
   #   cat ~/.ssh/id_ed25519_company.pub | ssh user@host \
   #     "mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
   #      cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# 推完测试一下能不能 key 登录:
ssh -o PasswordAuthentication=no user@host
```

---

## 六、known_hosts 工程

`~/.ssh/known_hosts` 是 ssh 防 **MITM(中间人攻击)** 的核心——但 99% 的工程师对它的态度是「弹了警告就 `ssh-keygen -R` 删了」。**这一节讲怎么把它用对**。

### 6.1 它是怎么工作的

```
第一次 ssh new-host:
   server 发它的 host key
   client 检查 ~/.ssh/known_hosts 里有没有这台 host 的记录
   没有 → 提示 yes/no 或自动接受(看 StrictHostKeyChecking)
   接受后写入 known_hosts

之后每次 ssh new-host:
   server 发的 host key 必须匹配 known_hosts 里的记录
   不匹配 → REMOTE HOST IDENTIFICATION HAS CHANGED! → 拒绝连接
```

### 6.2 HashKnownHosts:hostname 哈希化

```
未哈希(默认 OpenSSH 在某些发行版上):
   bastion.company.com,1.2.3.4 ssh-ed25519 AAAA...
   github.com ssh-ed25519 AAAA...

   ↑ 谁拿到这个文件 = 拿到你所有机器列表

哈希(HashKnownHosts yes):
   |1|abc123def...|xyz456ghi...= ssh-ed25519 AAAA...
   |1|qrs789tuv...|mno012pqr...= ssh-ed25519 AAAA...

   ↑ 单向哈希,谁拿到也看不出 hostname
```

**为什么这事重要**:malware 拿到你笔记本 = 拿到 known_hosts = 拿到你的"机器簿"+"key 列表"——**横向移动地图直接送给攻击者**。哈希了至少这一步要 brute-force。

### 6.3 三档严格性

```
StrictHostKeyChecking yes
   ★ 最严:host key 不在 known_hosts 直接拒绝
   不允许"第一次见就接受"
   适合:CI、自动化(预先 ssh-keyscan 灌入)

StrictHostKeyChecking accept-new  ← 推荐
   第一次自动接受并写入,之后必须匹配
   OpenSSH 7.6+(2017)才有这一档
   适合:个人交互场景

StrictHostKeyChecking ask         ← 旧默认
   第一次弹"yes/no"问

StrictHostKeyChecking no
   ★ 不要用 ★
   第一次自动接受,即使后续不匹配也只警告不拒绝
   实质上等于关掉 MITM 防御
```

**永远不要在生产或个人配置写 `no`**——这是把 ssh 加密协议最关键的一层防御扔掉。

### 6.4 CI / 脚本里的"首次连接弹 yes/no" 怎么破

```
CI 里要 ssh,但 known_hosts 是空的,弹 yes/no 阻塞构建。
错的解法:
   StrictHostKeyChecking no   ← 把 MITM 防御关了

对的解法:
   1. ssh-keyscan 提前抓 host key,塞进 image / CI 缓存
   
   $ ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
   $ ssh-keyscan -t ed25519 bastion.company.com >> ~/.ssh/known_hosts
   
   2. 或把已知的 known_hosts 文件作为 secret / config 注入到 CI
   
   3. CI 里:StrictHostKeyChecking yes(因为已经预填)
```

**GitHub Actions 的官方推荐**就是这套(`webfactory/ssh-agent` action 内部就是 ssh-keyscan)。

### 6.5 服务器换 host key,怎么处理

```
服务器重装系统,host key 重新生成。
你 ssh 连过去:
   @@@@@ REMOTE HOST IDENTIFICATION HAS CHANGED! @@@@@

正确处理:
   1. 先确认是不是合法重装(问运维 / 看 ticket)
   2. 拿到新 fingerprint 的独立来源(运维公示 / wiki)
   3. 比对客户端看到的 fingerprint 和官方公示
   4. 一致才删旧记录、接受新 host key:
   
      $ ssh-keygen -R old-host         # 删旧记录
      $ ssh-keyscan old-host >> ~/.ssh/known_hosts   # 加新记录
      或直接 ssh,新 host key 自动接受(走 accept-new)

错误处理:
   ssh-keygen -R old-host;ssh old-host   ← 不核 fingerprint 就接受
   = 把"REMOTE HOST IDENTIFICATION HAS CHANGED"的警告当噪音
   = 真有 MITM 时也会被忽略
```

---

## 七、mosh:网络不稳的救星

### 7.1 mosh 的设计

```
ssh 的本质                          mosh 的本质
─────────────────────────          ──────────────────────────
TCP 连接,字符流转发                UDP + SSP(State Synchronization Protocol)
每个字符往返一次才显示              本地预测显示,服务端最终确认
连接断 = session 死                 客户端 IP 变了 = 漫游,session 不死
高延迟 = 卡顿打字                   高延迟 = 本地立刻显示,后台同步
不能跨 NAT 重连                     UDP + 滚动 session,Wi-Fi 切了不掉
```

**两个杀手特性**:
1. **断网重连不死**:UDP 没有"连接"概念,只要 session token 在,你切 WiFi、过隧道、笔记本合盖再开,session 都活着
2. **本地回显**:每打一个字立刻显示在本地(预测),服务端确认后修正——**100ms 延迟的链路上,体感和 0 延迟差不多**

### 7.2 装法

```
两边都要装(server + client):
   server: brew install mosh / apt install mosh
   client: brew install mosh / apt install mosh

server 要开放 UDP 60000-61000(每个 session 用一个 port)
   AWS / GCP security group 加规则:UDP 60000-61000

mosh 内部还是用 ssh 做认证 + 启动 mosh-server:
   $ mosh user@host
   实际发生:
     1. ssh user@host 启动 mosh-server,拿到 token + UDP port
     2. ssh 断开
     3. 本地 mosh-client 用 UDP + token 和 mosh-server 通信
```

### 7.3 mosh 的局限

```
不支持:
   - 端口转发(-L / -R / -D 全部不支持)
   - scp / rsync(它们走 ssh,mosh 不参与)
   - X11 forwarding
   - ControlMaster

不支持的原因:mosh 协议是为"交互式终端"设计,不是通用 transport

所以工作流变成:
   - 长时间交互:mosh prod-web
   - 端口转发:ssh -fN -L ... (后台跑一个 ssh,只为转发)
   - scp / rsync:ssh 跑
```

### 7.4 什么时候用 mosh

```
✓ 火车 / 飞机 / 弱网(机场 4G 抖动)
✓ 远程工作 / 笔记本带着走,合盖再开
✓ 高延迟链路(中国 → 美国 200ms,本地回显救命)
✓ 服务器 ssh 端口经常被防火墙杀连接(UDP 不容易被发现)

✗ 你公司服务器 sshd 配置不让装第三方 / UDP 不通
✗ 严重审计场景(mosh 不被某些堡垒机集成)
✗ 一次性短任务(开 mosh-server 比 ssh 重)
```

### 7.5 sshfs:挂载远端文件(顺带提)

**sshfs = ssh + FUSE filesystem**——把远端目录挂成本地目录,本地 `ls` / `vim` 看起来在本地,实际所有读写都通过 ssh。

```bash
sudo apt install sshfs                              # Linux 装
mkdir ~/remote-server
sshfs user@host:/var/log ~/remote-server            # 挂载
ls ~/remote-server                                  # 实际读远端 /var/log
vim ~/remote-server/app.log                         # 实际编辑远端
fusermount -u ~/remote-server                       # Linux 卸载
umount ~/remote-server                              # macOS 卸载
```

**macOS 的痛**:sshfs 依赖 FUSE,macOS 没自带要装 macFUSE。**macFUSE 需要 kernel extension**——Apple 自 macOS 11+ 加大 kext 限制,装要 Recovery 模式放开签名验证,M 系列 Mac 要把 kext 信任改成 "Reduced Security" **降级整机安全等级**。**99% 工程师装一次就放弃**。

**性能局限**:适合**偶尔编辑几个配置 / 浏览目录**,不适合**IDE 索引**(每个文件 stat 一次,RTT 累计成几分钟)、**大目录 ls**、**写入密集型**。

**替代方案**(都比 sshfs 强):
- **VS Code Remote / Cursor Remote**——通过 ssh 直接编辑远端,有 indexer 协议,**性能好一个量级**
- **rsync 双向同步**(见 11 节)——本地编辑 rsync 推上去
- **JetBrains Gateway**——JetBrains 的 Remote 方案

**结论**:Linux 上还能用 sshfs 凑合,**macOS 上建议跳过**直接上 VS Code Remote。

---

## 八、跳板机模式工程

### 8.1 标准跳板机架构

```
┌─────────────┐
│  你的笔记本  │
│ + 公司 SSO   │
└──────┬──────┘
       │ ssh + SSO 双因素(或 hardware key)
       ▼
┌─────────────────────────────────────┐
│         bastion(跳板机)            │
│  - 唯一公网入口                      │
│  - SSO 强制(LDAP / Okta / Google)  │
│  - 所有 session 录像(asciinema)    │
│  - 短时凭证(每 8 小时刷新)         │
└──────┬──────────────────────────────┘
       │ 内网,key 认证
       ▼
┌─────────────────────────────────────┐
│        prod-web / prod-db / ...      │
│  - 只允许 from bastion 的内网 IP    │
│  - 不开公网                          │
└─────────────────────────────────────┘
```

### 8.2 client 侧:一行 `ProxyJump` 覆盖

```
Host bastion
    HostName    bastion.company.com
    User        ops
    IdentityFile ~/.ssh/id_ed25519_company

Host prod-*
    ProxyJump   bastion
    User        ops
    IdentityFile ~/.ssh/id_ed25519_company
```

新机器加入,只加一行 `Host prod-newbox / HostName 10.x.x.x`——**ProxyJump 自动继承**。

### 8.3 server 侧:bastion 的硬性约束

```
/etc/ssh/sshd_config:
   PermitRootLogin            no
   PasswordAuthentication     no               # 强制 key
   PubkeyAuthentication       yes
   AuthorizedKeysFile         /etc/ssh/authorized_keys/%u   # 集中管理,不放用户 home
   AllowAgentForwarding       no               # 禁止 agent 转发(避免 key 链式攻击)
   MaxSessions                10
   MaxAuthTries               3
   LoginGraceTime             30
   ClientAliveInterval        300
   AllowUsers                 ops
```

**bastion 的核心是"不让 key 沉淀在它身上"**——
- 用户 key 通过 ProxyJump 协议通道转发(不在 bastion 落地)
- 用户在 bastion 上不能开 agent 转发
- 用户在 bastion 上不能存自己的 private key

### 8.4 审计:session 录像

```
bastion 上每个 session 启动时自动录制:
   - asciinema rec /var/log/sessions/$(date +%s)_$USER.cast
   - 或商业方案:Teleport / Boundary

回放:
   $ asciinema play /var/log/sessions/xxx.cast

事故复盘 / 合规审计的硬通货——"你 02:30 进了 prod-db,做了什么"。
```

---

## 九、agent forwarding 的安全坑

```
ForwardAgent yes 看起来很方便:
   你 ssh bastion,然后在 bastion 上 git clone(用你的 key)
   不用再把 key 放到 bastion 上

实际上:
   你 ssh bastion 时,bastion 上的 sshd 进程能通过 $SSH_AUTH_SOCK
   反过来访问你本地的 agent,签任何东西
   
   如果 bastion 被入侵 → 攻击者拿你的 agent 签名 → 横向打到所有 host

正确做法:
   1. 默认 ForwardAgent no(本文 §2.3 兜底已经写了)
   2. 真要在 bastion 上用 git,改用 ProxyJump:
      git clone git@github-via-bastion:org/repo.git
      其中 Host github-via-bastion 走 ProxyJump bastion
      认证用本地 agent,bastion 只做 transport
   3. 如必须 -A,只对特定可信 host 段开
```

**ProxyJump 出现之后,90% 的 agent forwarding 场景都被替代了**——它是更安全的方案。

---

## 十、替代 ssh 的现代方案

ssh 35 岁了。在云原生 / 零信任时代,一些场景出现了更好的方案——不是说 ssh 该死,而是**在某些子场景里,新工具能省掉你写 ssh config 的 80% 工作**。

### 10.1 选型对照表

```
┌────────────────────┬─────────────────┬──────────────────────┐
│      方案          │     强在哪      │     弱在哪 / 不适合   │
├────────────────────┼─────────────────┼──────────────────────┤
│ ssh + bastion      │ 任何平台 / 通用 │ 配置 / 跳板心智成本   │
│  (本文核心)        │ Linux 原生支持   │ key 管理重           │
├────────────────────┼─────────────────┼──────────────────────┤
│ Tailscale SSH      │ 基于 WireGuard   │ 锁 Tailscale 生态    │
│                    │ 零 key 管理      │ 控制平面是 Tailscale │
│                    │ 跨子网穿透       │  (虽然有 Headscale)  │
├────────────────────┼─────────────────┼──────────────────────┤
│ AWS SSM Session    │ 完全无 SSH 端口  │ 只 AWS 内             │
│  Manager           │ IAM 控权 + 审计   │ 体验比 ssh 慢        │
│                    │ Bastion 都不需   │ 转发功能弱            │
├────────────────────┼─────────────────┼──────────────────────┤
│ Cloudflare Tunnel  │ 内网不开公网口   │ 锁 Cloudflare        │
│  + Access          │ 零信任策略       │ 走 cloudflared 代理  │
├────────────────────┼─────────────────┼──────────────────────┤
│ Teleport           │ 企业级审计       │ 重,自部署 / 商业版   │
│                    │ 多协议(ssh /    │ 团队 < 30 人不划算    │
│                    │  k8s / db)       │                       │
└────────────────────┴─────────────────┴──────────────────────┘
```

### 10.2 Tailscale SSH(WireGuard mesh)

**核心点子**:每台机器装 Tailscale,自动组成 mesh 网络,所有机器互相直连(用 WireGuard 协议),**用 Tailscale 的身份(基于 SSO)替代 ssh key**。

```
传统:
   key 管理 + bastion + ProxyJump = 一套复杂工程

Tailscale SSH:
   tailscale up         # 每台机器装,SSO 登录
   tailscale ssh prod   # 直接连,身份是 SSO 用户
   
   - 不需要 key
   - 不需要公网入口
   - SSO 撤销 = 立刻断
   - WireGuard 比 ssh 加密快
```

**适合**:小团队、AI 公司、远程团队、不想自建 bastion。

**不适合**:大企业(合规要求自控控制平面,虽然 Headscale 可以自部署)、跨多个云的复杂网络。

### 10.3 AWS SSM Session Manager

**核心点子**:EC2 不开 22 端口,通过 AWS API + IAM 来连——**纯走 AWS 控制平面,EC2 完全私有**。

```
$ aws ssm start-session --target i-0123456789abcdef
进入 EC2 shell。
没有 ssh,没有 key,没有 port 22。
IAM policy 控制谁能连哪台,审计走 CloudTrail。
```

**ssh config 集成**(让 `ssh i-0123456789abcdef` 走 SSM):

```
Host i-* mi-*
    ProxyCommand sh -c "aws ssm start-session --target %h \
        --document-name AWS-StartSSHSession --parameters portNumber=%p"
```

**适合**:全 AWS、合规严格、不想暴露 22 端口。
**不适合**:多云、需要复杂端口转发(SSM 的转发体验不如 ssh)。

### 10.4 Cloudflare Tunnel + Cloudflare Access

**核心点子**:内网服务用 cloudflared 主动出网到 Cloudflare,**不开任何入网口**;用户连接走 Cloudflare(认证 + 零信任策略),Cloudflare 把流量转给隧道。

```
内网机器:
   cloudflared tunnel run mytunnel

用户:
   cloudflared access ssh --hostname server.example.com
   或:ssh ProxyCommand 调 cloudflared

特点:
   - 内网零入网口(纯出网)
   - Cloudflare Access 集成 Okta / Google SSO
   - 无固定 IP 也能暴露服务
```

**适合**:动态 IP / 家庭服务器 / 没固定网关、需要零信任。

### 10.5 Teleport

企业级 ssh + database access + Kubernetes + audit 的统一方案。**小团队不划算**(部署复杂、运维重),**大企业值得**(把"跳板机 + 审计"做成一个产品)。

### 10.6 怎么选

```
1-3 人小团队 / 个人项目        → ssh + 一行 Tailscale
                                  (Tailscale 比 bastion 便宜得多)

10-30 人,中型团队             → ssh + bastion + ProxyJump
                                  (本文模式,可控、便宜)

全 AWS / 严格合规              → ssh + SSM Session Manager
                                  (干掉 22 端口的烦恼)

需要内网零入网口              → Cloudflare Tunnel + Access
                                  (尤其家庭 lab / 动态 IP)

50+ 人企业 / 合规重            → Teleport
                                  (一套统一审计 / 凭证管理)

跨多个云                       → ssh + bastion(基础设施中立)
                                  + Tailscale(机器互通)
```

**这一节的核心**:**ssh 不是非用不可,但放弃 ssh 之前要清楚自己换到了什么**——多数替代品是把"自己写 config"换成了"绑定某个供应商的 SaaS",代价不同。

---

## 十一、scp / sftp / rsync:文件传输三件套

### 11.1 scp 已过时,但仍在用

```
传统:
   $ scp file user@host:/path/
   $ scp -r dir user@host:/path/
   $ scp user@host:/remote/file ./

为什么过时:
   - OpenSSH 8.0(2019)文档明确说 scp 协议陈旧、易出非预期行为
   - 不支持增量传输(改动一个字节也全文重传)
   - 不支持 resume(传到一半断 = 重头来)
   - 通配符行为反直觉

但还活着:
   - 简单一次性传:还用
   - OpenSSH 9.0+ 已经把 scp 底层换成 sftp 协议(scp -O 用旧协议)
```

### 11.2 sftp:交互式 + 脚本化

```
$ sftp user@host
sftp> ls
sftp> get file
sftp> put localfile
sftp> mkdir new
sftp> exit

或脚本化:
$ sftp user@host <<EOF
   put file
   ls /remote/
EOF

GUI 客户端(Cyberduck / Transmit)走的也是 sftp 协议
```

### 11.3 rsync over ssh:推荐默认

```
$ rsync -av --progress src/ user@host:/dest/
     ↑       ↑
     │       进度条
     archive 模式:递归 + 保留权限 / 时间 / 链接

特性:
   - 增量传输(只传变化的部分)
   - 断点续传(--partial)
   - 删除目标侧不存在于源的文件(--delete,慎用)
   - 排除模式(--exclude='*.pyc')
   - 走 ssh,自动用你 ~/.ssh/config 的 host 名

实战:
   # 本地同步到 prod
   rsync -avh --progress --delete \
         --exclude='node_modules/' --exclude='.git/' \
         ./build/ prod-web:/var/www/site/

   # 大目录 + 网络抖,加 partial + resume
   rsync -avh --partial --progress \
         /local/huge/ devbox:/data/huge/

   # 拷完删源(典型 dump 上传场景)
   rsync -avh --remove-source-files /tmp/dump/ archive:/backup/
```

**经验法则**:**任何 `scp -r` 的场景换成 `rsync -avh`,只赚不亏**——多打 5 个字符,换增量 + 进度 + 续传。

---

## 十二、常见陷阱速查

### 12.1 文件权限

```
$ ssh devbox
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
Permissions 0644 for '~/.ssh/id_ed25519' are too open.

修复:
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/id_ed25519
   chmod 644 ~/.ssh/id_ed25519.pub
   chmod 600 ~/.ssh/config
   chmod 600 ~/.ssh/known_hosts
```

### 12.2 TERM 不对,vim 颜色坏

```
$ ssh devbox
$ vim file.py
   颜色全错,Tab 显示成奇怪字符

原因:终端模拟器 TERM=xterm-256color,但 ssh 传到远端
      远端没这个 terminfo 条目,降级到 vt100

修复:
   ~/.ssh/config 加:SetEnv TERM=xterm-256color
   或 server 上:tic -x <terminfo>(安装缺的 terminfo)
   或本地终端模拟器换 TERM=screen-256color(更兼容)
```

### 12.3 agent 里 key 太多,服务器拒绝

```
$ ssh prod-host
Received disconnect: Too many authentication failures

原因:agent 有 10 把 key,ssh 默认全部尝试
      服务器 MaxAuthTries 3,前 3 把不对就被踢

修复:
   IdentitiesOnly yes(配合 IdentityFile 指定那一把)
```

### 12.4 网络中断后僵尸 session

```
你 ssh 进 devbox,合上笔记本走了
打开笔记本:ssh 还卡在那,但其实早断了
半小时后才显示"Connection closed"

修复:全局兜底加:
   ServerAliveInterval 60         # 每 60 秒探活一次
   ServerAliveCountMax 3          # 3 次失败(180 秒)主动断开
```

### 12.5 ssh 启动慢(GSSAPI 拖时间)

```
$ ssh user@host
... 5 秒后才看到密码提示 ...

原因:client 尝试 GSSAPI / Kerberos,DNS 反查超时

修复:
   GSSAPIAuthentication no
   或服务器侧 sshd_config:UseDNS no
```

### 12.6 sshd_config 改了不生效

```
你改了 sshd_config,但 sshd 还是旧行为。

原因:没重启 sshd 或没 reload

修复:
   sudo systemctl reload sshd
   或:sudo systemctl restart sshd

   ★ 重启前先开第二个 ssh 连接备份 ★
   万一新配置打错,你还有一条活的连接能修
```

### 12.7 ProxyJump 走不通

```
$ ssh -J bastion target
target: Host key verification failed for "target" via jumphost.

原因:client 没见过 target 的 host key
      ProxyJump 模式下,host key 验证还是 client ↔ target 直接做
      不会通过 bastion 代理

修复:
   ssh-keyscan target >> ~/.ssh/known_hosts(本地预灌)
   或第一次连接走 accept-new(全局兜底已经写了)
```

---

## 十三、反对的写法

```
✗ 同一个私钥跑遍所有服务
  → 每个用途一把 key,丢一把不慌
  → ~/.ssh/id_ed25519_personal / _company / _aws_prod / _aws_test
  
✗ 私钥进 git 仓库
  → 私钥永远不进任何仓库,包括 private repo
  → 公钥(.pub)可以进
  → 团队共享私钥 = 没有共享,等于公开
  
✗ 用 password authentication
  → 永远禁用,改用 key
  → /etc/ssh/sshd_config: PasswordAuthentication no
  → 即使你觉得密码 24 位也够强,brute force 会让你成为日志噪音源
  
✗ StrictHostKeyChecking no
  → 中间人攻击门户大开
  → CI 里改用 ssh-keyscan 预填 known_hosts + StrictHostKeyChecking yes
  
✗ 把 22 端口暴露公网
  → bastion 之外的机器不要开 22 给公网
  → 哪怕暴露,也加 fail2ban / sshguard 防暴力扫描
  
✗ root 直接登录
  → PermitRootLogin no
  → 用普通账户 + sudo,审计日志能区分谁干的
  
✗ 不用 ssh-agent / 不用 Keychain
  → 要么没 passphrase(私钥裸奔),要么每次输(被迫用空 passphrase)
  → 必装 agent + Keychain / 1Password,passphrase 输一次
  
✗ ssh -A 默认开
  → ForwardAgent yes 全局默认 = bastion 入侵就横扫
  → 默认 no,只对可信 host 段单独开
  
✗ 把 ssh key 拷到每台机器的 ~/.ssh/
  → 你以为你在"省事",实际在散布私钥
  → 永远只在你笔记本上有私钥,远端通过 ProxyJump 代理签名
  
✗ 用 scp 同步大目录
  → 改 rsync -avh --progress,增量 + 续传 + 进度,只赚不亏
  
✗ 在远端机器上 git clone(把 key 落到远端)
  → 永远在本地 git clone,然后 rsync 同步过去
  → 或用 ProxyJump 让远端的 git 走本地 agent 签名
  
✗ 把 ~/.ssh/config 当随便丢的草稿,不纳入 dotfiles
  → 这份文件每行都是你的工程资产
  → chezmoi / yadm 纳管,新机器一行同步
  
✗ 不设 ServerAliveInterval
  → 网络一抖就丢 session,vim 半小时白干
  → 60 / 3 是 2026 的默认配置
  
✗ 不用 ControlMaster
  → tmux 6 个 pane 同时 ssh = 6 次完整握手 = 10 秒抖动
  → ControlMaster auto + ControlPersist 10m 是 2026 默认
```

---

## 十四、看完这一篇你应该能

- **写出一份生产可用的 70 行 `~/.ssh/config`**——带 ControlMaster、AddKeysToAgent、UseKeychain(macOS)、HashKnownHosts、accept-new、ProxyJump、SetEnv,每一行都讲得清楚为什么
- **解释 ssh 三种端口转发(`-L` / `-R` / `-D`)的方向和典型场景**——能在白板上画 ASCII 图,不查文档
- **设计一个 bastion 模式**——client 侧一行 `ProxyJump bastion` 覆盖所有 prod-*;server 侧 sshd_config 的硬性约束(禁 root、禁密码、禁 agent forward、强制 key、session 录像)
- **完成一次密钥管理改造**——把 RSA 2048 换成 ed25519,按用途拆 key,接上 ssh-agent + Keychain 或 1Password,做到"私钥不裸奔、新机器迁移有路径"
- **判断什么时候用 ssh、什么时候用 Tailscale / SSM / Cloudflare / Teleport**——用第十节的选型表能给团队定一份"远程访问标准"
- **用 rsync 替换 scp**,理解为什么 `rsync -avh --progress --partial` 是默认姿势
- **避开本文第十三节的 14 条反对写法**——这些每条都是事故源
- **给团队新人写一份「ssh 上手 checklist」**:5 分钟生 key、10 分钟改 config、5 分钟测 ProxyJump、5 分钟测 LocalForward,30 分钟内能 `ssh prod-db` 干活

---

## 十五、下一篇预告

下一篇:**`16-tmux心智.md`**——进入 multiplexer 层。这一篇讲了「**你和远端的关系**」,下一篇讲「**你在远端的工作台**」。

```
ssh 进去之后,你下一个问题就是:
   - 任务跑一半,我要离开,session 怎么不死?
   - 我要同时开 5 个 shell 看不同的东西,怎么不开 5 个 ssh?
   - Claude Code 跑 4 小时长任务,我电脑炸了它还在吗?
   - 一台 devbox 上,我和同事能不能共享一个 session?

tmux 就是回答这一切的工具——session / window / pane 三层心智,
detach / attach 解决"任务挂在远端"的问题,
和 ssh 配起来:ssh devbox 进去,tmux a 接上你昨天没干完的活,
笔记本合盖、网络断、电脑炸都不影响——
这就是"工作流和单台机器解耦"的工程实现。
```

看完 16-17 两篇,你的工作模式会发生质变——**你不再是"ssh 进去敲命令的人",你是"长期挂在远端的工作台,本地只是接入终端"**。配合本文的 ssh 工程化,**你换机器、换网络、换地点都不影响你的工作流**。

`ssh` 是"跨过去",`tmux` 是"过去之后住下来"——这两个加起来,才是远程工作的最小可行基建。
