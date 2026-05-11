# Nginx 深度

「装个 Nginx,改两行 `server_name` 和 `proxy_pass` 就能跑」——这是 99% 后端对 Nginx 的认知。但 **Nginx 的真正威力在事件模型和模块体系**:**一个 worker 进程单线程异步,凭什么扛 10W QPS?为什么 master 不干活只看孩子?epoll + 非阻塞 socket 是怎么织在一起的?location 匹配优先级到底什么顺序?upstream 选错算法 P99 抖三倍?proxy_cache 怎么和 upstream 配合?OpenResty 的 lua_module 凭什么把动态路由做到 1ms?**——这些才是写 Nginx 配置的命门。Nginx 从 2004 年 Igor Sysoev 第一行代码,到今天扛着全球 **30%+ Web 流量**(2025 年 W3Techs 数据,加上 Cloudflare/OpenResty 反而过半),**它的配置语言长得像 C 但不是 C,它的事件循环长得像 Apache 但不是 Apache**——你必须把它的内部机制吃透,配置才不再是抄网上的玄学。

> 一句话先记住:**Nginx = master 进程(配置加载/平滑重载/管 worker)+ 多个 worker 进程(每个绑一个 CPU 核 + 跑一份 epoll 事件循环)+ 单线程异步非阻塞**——一个 worker 用一根线程同时管几万个连接,靠的是 **epoll 通知 + 全程 non-blocking syscall + 零内存分配热路径**。**这就是它扛得住 C10K 的全部秘密**:不是多线程的"靠人海",是事件驱动的"一个线程把所有连接 round-robin 切片"。**对比 Apache prefork 一个连接一个进程,Nginx 内存 1/10、QPS 10 倍**——这个性能差就是为什么 2010 年后所有反代都默认 Nginx。

承接上一篇 33-eBPF/XDP/DPDK:你已经知道内核网络栈怎么从内核跳到用户态、零拷贝是怎么省 syscall 的。**Nginx 是这套内核 IO 模型最经典的用户态消费者**——它不绕开内核(那是 DPDK 的事),但**把 epoll 用到了极致**。这一篇起的三章(34-36)讲应用层最重要的工程实战:Nginx、Envoy、LB/CDN——**任何一个写后端 / 做网关 / 当 SRE 的人,这三章都得吃透**。

---

## 一、Nginx 进程模型:master/worker 是怎么配合的

### 1.1 启动时进程拓扑

```
$ nginx                          ← 启动主进程
$ ps -ef | grep nginx
root      1234     1  nginx: master process /usr/sbin/nginx
nobody    1235  1234  nginx: worker process
nobody    1236  1234  nginx: worker process
nobody    1237  1234  nginx: worker process
nobody    1238  1234  nginx: worker process    ← worker_processes 4
nobody    1239  1234  nginx: cache manager process
nobody    1240  1234  nginx: cache loader process
```

**典型 4 worker 配置**:

```
master(root,1 个)
  ├── worker(nobody,N 个,N = CPU 核数)
  ├── cache manager(管 proxy_cache 过期清理)
  └── cache loader(启动时从磁盘 load 缓存索引到内存,完了就退出)
```

### 1.2 master 的职责:它不处理请求

| master 干的事 | master 不干的事 |
| --- | --- |
| 读配置文件、做语法校验 | 接受连接 |
| `fork` worker 子进程 | 处理 HTTP 请求 |
| 监听信号(`HUP` / `USR2` / `WINCH`) | 转发到 upstream |
| 平滑重载配置(`nginx -s reload`) | 写访问日志 |
| 平滑升级二进制(`USR2`,新老 master 共存) | 解析 SSL |
| 收集 worker 退出状态 | 任何 IO |

**master 是"运维管理者"**——拿 root 权限干那些 worker 不能干的事(绑 80/443 端口需要 root,绑完 setuid 到 nobody),然后**把所有数据面工作扔给 worker**。

### 1.3 为什么 worker 数 = CPU 核数

```nginx
worker_processes auto;   # 等于 CPU 核数
worker_cpu_affinity auto;  # 自动把 worker 绑到对应 CPU 核
```

**每个 worker 绑一个 CPU 核**,目标是:

```
1. 减少 CPU 缓存抖动
   worker 1 永远跑在核 0 → L1/L2 cache 一直有用的数据
   
2. 避免 worker 间争抢
   worker 不共享请求,各自独立 epoll
   
3. 避免上下文切换
   N worker on N core,理想情况几乎不切换
```

**反例**:8 核机器配 worker_processes 64?——上下文切换吃光 CPU,反而比 8 worker 慢。

### 1.4 worker 间怎么"分赃"新连接:惊群问题

老内核(Linux 3.9 之前)的痛:**accept 惊群**。

```
8 个 worker 都在 epoll_wait 同一个 listen socket
↓
新连接来了
↓
内核唤醒所有 8 个 worker
↓
8 个 worker 都尝试 accept,但只有 1 个能成功
↓
其他 7 个白醒,浪费 CPU
```

**Nginx 的两种解药**:

```nginx
# 方案 1:accept_mutex(老方案)
events {
    accept_mutex on;        # worker 抢一把锁,谁拿到谁去 accept
    accept_mutex_delay 500ms;
}

# 方案 2:SO_REUSEPORT(Linux 3.9+,2015 年起 Nginx 支持)
http {
    server {
        listen 80 reuseport;   # 内核层面把 listen socket 拆成 N 份,
                               # 每个 worker 一份,内核自动负载均衡
    }
}
```

> 经验法则:**现代 Linux 用 reuseport**——内核帮你分,不用 Nginx 抢锁,**QPS 能涨 20-30%**。**accept_mutex 1.11.3 起默认 off**——因为 reuseport 出现后没必要了。

---

## 二、事件循环:一个 worker 的内心独白

### 2.1 epoll 是怎么用的

每个 worker 启动后做的事(伪代码):

```c
// worker 主循环
int epfd = epoll_create1(0);

// 把 listen socket 加到 epoll
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, ...);

while (1) {
    int n = epoll_wait(epfd, events, MAX_EVENTS, timer_min);
    
    for (int i = 0; i < n; i++) {
        if (events[i].data.fd == listen_fd) {
            // 新连接
            int conn = accept4(listen_fd, ..., SOCK_NONBLOCK);
            epoll_ctl(epfd, EPOLL_CTL_ADD, conn, ...);
        } else {
            // 已有连接有读 / 写事件
            handler(events[i]);   // 永远不能阻塞!
        }
    }
    
    // 处理定时器(超时连接)
    process_timers();
}
```

**关键不变量**:**`handler` 永远不能阻塞**——读不出数据就返回 EAGAIN,写不出去就返回 EAGAIN,**绝不能 `read` 卡住整个 worker**。

### 2.2 一个连接的状态机片段

```
新连接 accept → 加入 epoll(EPOLLIN)
   ↓
epoll 通知 readable
   ↓
ngx_http_init_request → 读 HTTP 请求行 + header
   ↓
读不完?→ 注册定时器 → 让出 CPU(回 epoll_wait)
   ↓
读完了 → 找 location → 转发到 upstream
   ↓
建到 upstream 的连接(同一 worker 异步建)
   ↓
write 请求,read 响应,边收边转给客户端
   ↓
完成 → 关连接(或保留 keepalive)
```

**一个连接在一个 worker 的整个生命周期里反复进出 epoll_wait**——**worker 同时管几万个连接,但任意时刻只活跃地处理一个事件**。

### 2.3 单线程为什么扛得住几万 QPS

```
关键观察:
  网络 IO 是慢的(几十微秒到几毫秒)
  CPU 处理是快的(几微秒)
  
传统多线程:
  一个线程 = 一个连接,大部分时间线程在 sleep 等 IO
  → 浪费内存(每线程 1-2MB 栈)
  → 浪费上下文切换
  
Nginx 单线程异步:
  线程从来不 sleep,有事干就干,没事就 epoll_wait
  → 一个线程顶 1000 个传统线程
  → 内存只占一份
```

**反过来说**:**任何"在 worker 里做 CPU 重活"都是死路**——SSL 握手算密钥、gzip 压缩 100KB 响应、Lua 脚本里跑个 1ms 的循环——**整个 worker 这 1ms 啥也干不了,所有连接都堵着**。**这就是 OpenResty 强调"代码不能阻塞"的根源**(详见七)。

### 2.4 数字感

```
Nginx worker 一秒钟能做多少事:
  epoll_wait 唤醒次数:    几十万次
  HTTP 请求处理:           几万到十几万 QPS(取决于 location 复杂度)
  SSL 握手:                几千次(SSL 是 CPU 重活)
  
对比 Apache prefork 一进程一连接:
  并发连接数极限:          ~10K(每连接 ~2MB,单机内存撑不住更多)
  Nginx 单 worker:         可达 100K+(每连接 ~256B 控制结构)
```

> 经验法则:**Nginx 慢了一定不是"线程不够",是"某个事件 handler 阻塞了"**——找出那个 handler(strace 看 worker 哪里卡),**80% 是 SSL 没用 session 复用 / DNS 同步解析 / 上游 backend 慢**。

---

## 三、核心模块体系:不只是 HTTP

Nginx 内核很小,**几乎所有功能都是模块**——分四类:

```
http          反向代理 / 静态文件 / FastCGI / SSL    (90% 用户只用这个)
stream        TCP/UDP 反向代理(L4 LB,不解 HTTP)
mail          POP3 / IMAP / SMTP 代理
core / event  事件循环、内存池、定时器(底层骨架)
```

### 3.1 stream 模块:做 TCP 反代

L4 反代 MySQL / Redis / 任意 TCP 服务,**不解协议,纯转字节**:

```nginx
stream {
    upstream mysql_backend {
        server 10.0.0.1:3306 weight=2;
        server 10.0.0.2:3306;
        server 10.0.0.3:3306 backup;
    }
    
    server {
        listen 3306;
        proxy_pass mysql_backend;
        proxy_connect_timeout 1s;
        proxy_timeout 1h;       # MySQL 长连接,超时设大
    }
    
    # UDP 也能代:DNS 反代
    server {
        listen 53 udp;
        proxy_pass dns_backend;
        proxy_responses 1;
    }
}
```

**stream 块和 http 块平级,共存于一份 nginx.conf**。`upstream` / `server` / `listen` 在两个模块里语义不同。

### 3.2 mail 模块:几乎没人用

POP3/IMAP/SMTP 的反代——**实际部署里几乎被 Postfix / Dovecot 替代**,知道有这模块就行。

### 3.3 第三方模块怎么加

Nginx 模块**编译时静态链接**(老式),或**运行时动态加载**(`load_module`,1.9.11+):

```bash
# 老办法:编译进二进制
./configure --add-module=/path/to/ngx_brotli
make && make install

# 新办法:动态模块
./configure --add-dynamic-module=/path/to/ngx_brotli
make modules
# 然后 nginx.conf 里
load_module modules/ngx_http_brotli_filter_module.so;
```

> 经验法则:**不要随便编译 Nginx 自定义模块上生产**——出 bug 时社区帮不了你。**90% 需求 OpenResty 的 lua 就够**(七)。

---

## 四、关键配置:那几行决定生死

### 4.1 worker 相关

```nginx
worker_processes auto;              # 自动 = CPU 核数
worker_rlimit_nofile 65535;          # worker 能开的最大 fd 数
worker_cpu_affinity auto;            # 绑核

events {
    worker_connections 65535;        # 单 worker 最大连接数
    use epoll;                        # Linux 默认就是 epoll,显式写更清晰
    multi_accept on;                  # 一次 epoll_wait 唤醒尽量多收 accept
}
```

**单机最大并发连接数 = `worker_processes` × `worker_connections`**(理论值,实际还要乘 0.5 因为反代要建上游连接也吃 fd)。

```
4 worker × 65535 = 262K 并发  (但 fd 上限别超过 worker_rlimit_nofile)
```

### 4.2 IO 相关:sendfile 和 tcp_nopush 是兄弟

```nginx
sendfile on;          # 用 sendfile syscall:磁盘 → 网卡,零拷贝
tcp_nopush on;        # 攒满一个 MSS 再发,大文件场景减少包数
tcp_nodelay on;       # 关掉 Nagle:小包立即发,长连接 keepalive 用
```

**这三行**是教科书级配置,但**很多人不知道为什么三个一起配**:

```
sendfile:
  传统:磁盘 → 内核缓冲区 → 用户态 → 内核 socket buffer → 网卡  (4 次拷贝)
  sendfile:磁盘 → 内核缓冲区 → 网卡                              (1 次 syscall,零拷贝)
  
tcp_nopush(只在 sendfile 开时生效):
  开启后内核会攒满一个 MSS(~1460 字节)再发
  适合发大文件:每个包都是满载,减少包数
  
tcp_nodelay:
  关闭 Nagle 算法
  Nagle:小数据攒一攒再发(默认开,延迟 +200ms)
  对于 keepalive 上的 API 请求(几十字节),要立即发
  
看起来矛盾(nopush 攒、nodelay 不攒)?
  Nginx 在 sendfile 末尾会自动关 TCP_CORK 改 TCP_NODELAY
  → 大文件中间用 nopush 攒,最后一个包用 nodelay 立即发
```

> 经验法则:**这三行抄就行,基本没场景需要关**——**关掉 sendfile 你就回到 90 年代**。

### 4.3 buffer / timeout:经常出锅

```nginx
http {
    client_max_body_size 100m;             # 上传上限,默认 1m
    client_body_buffer_size 128k;          # body 超过这就写磁盘临时文件
    client_header_buffer_size 4k;          # 请求头 buffer
    large_client_header_buffers 4 16k;     # 大请求头(URL 超长)
    
    keepalive_timeout 65s;                 # 客户端 keepalive 超时
    keepalive_requests 1000;               # 一个 keepalive 连接最多服务请求数
    
    send_timeout 60s;                      # 发响应超时(两次写之间)
    client_body_timeout 60s;               # 读 body 超时
    client_header_timeout 30s;             # 读 header 超时
    
    # 反代相关
    proxy_connect_timeout 5s;              # 连 upstream
    proxy_read_timeout 60s;                # 读 upstream
    proxy_send_timeout 60s;                # 写 upstream
    
    proxy_buffering on;                    # 缓冲上游响应
    proxy_buffers 8 16k;                   # 8 个 16KB 的 buffer
    proxy_buffer_size 16k;                 # 第一个响应 buffer(读 header)
}
```

**最常踩坑**:

| 问题 | 可能原因 |
| --- | --- |
| 413 Request Entity Too Large | `client_max_body_size` 默认 1m |
| 502 Bad Gateway 偶发 | `keepalive_requests` 到了 → upstream 关连接 → Nginx 复用了已关连接 |
| 504 Gateway Timeout | `proxy_read_timeout` 不够大,或后端真的慢了 |
| 414 Request-URI Too Large | `large_client_header_buffers` 不够 |
| SSE/WebSocket 一会儿断 | `proxy_read_timeout` 默认 60s,长连接要调成 1h |

---

## 五、location 匹配优先级:面试常考但生产更要懂

### 5.1 五种匹配模式

```nginx
location = /exact { ... }         # = 精确匹配,优先级最高
location ^~ /assets/ { ... }      # ^~ 前缀匹配,匹中后停止找正则
location ~ \.php$ { ... }         # ~  正则匹配,大小写敏感
location ~* \.(jpg|png)$ { ... }  # ~* 正则匹配,不区分大小写
location /api/ { ... }            # 普通前缀匹配
```

### 5.2 匹配顺序(关键!)

```
1. = 精确,命中立刻用
2. ^~ 前缀,记下"最长匹配前缀"
3. 普通前缀,记下"最长匹配前缀"
4. 然后跑正则(~ 和 ~*),按 nginx.conf 中出现顺序,第一个命中就用
5. 没命中正则就用 2/3 里"最长匹配前缀"
```

**举例**:

```nginx
location = /login        { return 200 "exact"; }
location ^~ /assets/     { return 200 "^~"; }
location ~ \.php$        { return 200 "regex php"; }
location ~* \.(jpg|png)$ { return 200 "regex img"; }
location /api/           { return 200 "prefix"; }
location /               { return 200 "root"; }
```

| 请求 | 命中 | 为什么 |
| --- | --- | --- |
| `/login` | "exact" | = 精确 |
| `/assets/x.css` | "^~" | ^~ 命中后跳过正则 |
| `/api/users.php` | "regex php" | ^~ 没命中 → 跑正则 |
| `/img/cat.jpg` | "regex img" | 正则按顺序,php 不匹配,jpg 匹配 |
| `/api/users` | "prefix" | 没正则匹配 → 用前缀最长 `/api/` |
| `/` | "root" | 啥都没匹中 → fallback `/` |

### 5.3 实战陷阱

```nginx
# 陷阱 1:把正则放普通前缀前面以为有用
location /api/ { ... }
location ~ \.php$ { ... }   # 实际优先级:这个先跑,PHP 文件全被它截
                              # 想截 /api/x.php,要写 location ~ ^/api/.*\.php$
                              
# 陷阱 2:^~ 拼写错
location ^/assets/ { ... }   # 没 ~,这就只是普通前缀,不会跳过正则
                              # 静态资源被某个 ~ 正则截走 → 走错 handler

# 陷阱 3:= 路径没考虑斜杠
location = /api { ... }      # 只匹配 /api,不匹配 /api/
                              # 浏览器访问 /api 通常会被 301 加斜杠
```

> 经验法则:**调试 location 命中,加 `add_header X-Hit "loc-name" always;`** 看响应头,比读配置猜快 100 倍。

---

## 六、upstream:LB 算法决定 P99

### 6.1 五种算法

```nginx
upstream backend {
    # 1. 默认轮询
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    server 10.0.0.3:8080;
}

upstream backend2 {
    # 2. 加权轮询
    server 10.0.0.1:8080 weight=3;   # 接 3/5 的请求
    server 10.0.0.2:8080 weight=1;
    server 10.0.0.3:8080 weight=1;
}

upstream backend3 {
    # 3. ip_hash:同一客户端 IP 永远落同一 backend(粘性会话)
    ip_hash;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}

upstream backend4 {
    # 4. least_conn:谁连接最少给谁(适合请求耗时差异大)
    least_conn;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}

upstream backend5 {
    # 5. hash:任意 key 一致性哈希(详见 36 篇)
    hash $request_uri consistent;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}
```

### 6.2 算法选择决策树

```
请求耗时差异大(有的 10ms,有的 1s)?
  → 选 least_conn
  
要会话粘性(老式 session 存内存)?
  → 选 ip_hash(粗暴)或 sticky cookie(商业版)
  
要按 URL 缓存命中率高(CDN 场景)?
  → hash $request_uri consistent
  
都差不多 / 不知道?
  → 默认轮询
```

### 6.3 健康检查 + 重试

```nginx
upstream backend {
    server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;
    # 30s 内失败 3 次 → 标记 down → 30s 后再试
    
    server 10.0.0.2:8080;
    server 10.0.0.3:8080 backup;       # 主全挂时才用
}

server {
    location / {
        proxy_pass http://backend;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 3;        # 最多重试 3 个 upstream
        proxy_next_upstream_timeout 10s;
    }
}
```

**注意**:`max_fails / fail_timeout` 是**被动健康检查**(请求失败才算)。**主动健康检查**(定时 ping `/health`)只在商业版 Nginx Plus / OpenResty 第三方模块里有。

### 6.4 长连接到 upstream:别忘了 keepalive

```nginx
upstream backend {
    server 10.0.0.1:8080;
    keepalive 32;                  # 每 worker 缓存 32 个空闲到上游的 TCP 连接
    keepalive_requests 10000;
    keepalive_timeout 60s;
}

server {
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;       # ← 必须!默认 1.0 不支持 keepalive
        proxy_set_header Connection ""; # ← 必须!清空 Connection 头
    }
}
```

**忘记这三行**,Nginx 每个请求都和 upstream 重建 TCP 连接——**P99 多 1 RTT,QPS 砍半**。

---

## 七、proxy_cache:把 Nginx 变成 CDN 边缘

### 7.1 基本配置

```nginx
http {
    # 定义缓存区
    proxy_cache_path /var/cache/nginx
        levels=1:2                     # 目录两层(避免单目录文件爆)
        keys_zone=my_cache:100m        # 100MB 内存放 key 索引
        max_size=10g                   # 最多 10GB 磁盘
        inactive=1h                    # 1 小时没访问就清
        use_temp_path=off;
    
    server {
        location / {
            proxy_pass http://backend;
            proxy_cache my_cache;
            proxy_cache_valid 200 302 10m;     # 200/302 缓存 10 分钟
            proxy_cache_valid 404 1m;          # 404 缓存 1 分钟(防穿透)
            proxy_cache_key "$scheme$request_method$host$request_uri";
            proxy_cache_use_stale error timeout updating http_500 http_502;
                                  # 后端炸了,继续用过期缓存兜底
            proxy_cache_lock on;          # 同一 key 只放一个请求穿透到后端
            
            add_header X-Cache-Status $upstream_cache_status;
            # MISS / HIT / EXPIRED / STALE / UPDATING / BYPASS
        }
    }
}
```

### 7.2 缓存命中状态

```bash
$ curl -I https://example.com/
< X-Cache-Status: MISS         # 第一次请求,穿透回源
< X-Cache-Status: HIT          # 第二次,命中缓存
< X-Cache-Status: EXPIRED      # 缓存过期了,正在回源刷新
< X-Cache-Status: STALE        # 后端挂了,用过期缓存兜底
< X-Cache-Status: UPDATING     # 别人正在刷新,我用旧的
< X-Cache-Status: BYPASS       # proxy_cache_bypass 命中
```

### 7.3 cache_lock:防止"惊群打挂后端"

```
没有 cache_lock:
  缓存过期瞬间 → 1000 个请求同时穿透到后端 → 后端挂
  
开 cache_lock:
  缓存过期瞬间 → 第一个请求去回源,其他 999 个等
  → 第一个回源完成,999 个直接读新缓存
```

> 经验法则:**任何缓存失效场景都要 cache_lock**——这是"缓存击穿"问题的最简解(详见 backendLearning 缓存章)。

### 7.4 主动 purge / 预热

Nginx 开源版**不支持**主动 purge——只有商业版 Plus 或 OpenResty 的 `lua-resty-cache` 能做。**纯开源版**:

```bash
# 暴力删:直接删文件(不优雅但有效)
rm -rf /var/cache/nginx/<hash 路径>

# 预热:在发布前主动 curl 一遍
for url in $(cat hot_urls.txt); do
    curl -s -o /dev/null https://example.com$url
done
```

---

## 八、限流:limit_req(令牌桶)和 limit_conn

### 8.1 limit_req:按 QPS 限

```nginx
http {
    # 定义限流区:按客户端 IP,平均 10 r/s,内存 10MB
    limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;
    
    server {
        location /api/ {
            limit_req zone=perip burst=20 nodelay;
            # burst=20: 允许瞬时积累 20 个请求(突发桶)
            # nodelay:  桶满立刻拒绝,不排队
            
            proxy_pass http://backend;
        }
    }
}
```

**令牌桶模型**(详见 algorithmLearning/24 限流算法):

```
令牌生成速率:    10 r/s(平均速率)
桶容量:           20(突发容量)
请求来:           取一个 token,有就放行,没就拒绝(或排队)

nodelay:          桶满立刻 503
没 nodelay:       桶满了排队,按 rate 慢慢放(平滑)
```

### 8.2 limit_conn:按并发连接数限

```nginx
http {
    limit_conn_zone $binary_remote_addr zone=conn_perip:10m;
    
    server {
        location /download/ {
            limit_conn conn_perip 5;   # 每个 IP 最多 5 个并发下载
        }
    }
}
```

适合**大文件下载 / WebSocket** 这种长连接场景——按 QPS 限不准,得按并发数。

### 8.3 多维度限流

```nginx
# 同时限 IP 和限服务器总量
limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;
limit_req_zone $server_name        zone=perserver:10m rate=1000r/s;

server {
    location /api/ {
        limit_req zone=perip burst=20;
        limit_req zone=perserver burst=200;   # 两个限制同时生效
        proxy_pass http://backend;
    }
}
```

> 经验法则:**`$binary_remote_addr` 比 `$remote_addr` 省内存**(IPv4 4B vs 字符串 ~16B)——zone 容量按 1MB ≈ 1.6 万 IP 估算。**真实生产里限流 key 应该是登录用户 ID 而非 IP**(IP 后面可能是公司 NAT,误伤一片)。

---

## 九、OpenResty / lua_module:Nginx 的"动态魂"

### 9.1 为什么需要

Nginx 配置是**声明式**——加个 if 都被官方警告"if is evil"。但生产经常需要:

```
1. 动态路由:从 Redis 拿规则决定后端
2. 鉴权:每个请求查 token,过期 401
3. 灰度:5% 流量打到新版本
4. 自定义日志:写到 Kafka 而非文件
5. 复杂限流:按用户等级不同 QPS
```

**这些 if/else 写起来配置 hell。OpenResty = Nginx + LuaJIT + 一堆 lua-resty-* 库**——把 Nginx 变成"可编程网关"。

### 9.2 一段最简 lua

```nginx
location /hello {
    content_by_lua_block {
        ngx.header["Content-Type"] = "text/plain"
        ngx.say("hello, ", ngx.var.remote_addr, " at ", os.date())
    }
}
```

### 9.3 11 个执行阶段

OpenResty 把 Nginx 的请求处理拆成 11 个阶段,每个都能挂 lua:

```
init_by_lua          ← master 启动时(一次,worker 之间共享)
init_worker_by_lua   ← worker 启动时(每 worker 一次,适合起定时器)
ssl_certificate_by_lua  ← 动态选择证书
set_by_lua           ← 计算变量
rewrite_by_lua       ← URL 重写
access_by_lua        ← 鉴权 / 限流
content_by_lua       ← 生成响应
header_filter_by_lua ← 改响应头
body_filter_by_lua   ← 改响应体
log_by_lua           ← 异步打日志(不影响响应延迟)
balancer_by_lua      ← 动态选 upstream
```

### 9.4 实战:动态鉴权

```nginx
location /api/ {
    access_by_lua_block {
        local token = ngx.req.get_headers()["Authorization"]
        if not token then
            ngx.exit(401)
        end
        
        -- 查 Redis(用 lua-resty-redis,连接池复用)
        local redis = require "resty.redis"
        local red = redis:new()
        red:set_timeout(50)   -- 50ms 超时
        red:connect("127.0.0.1", 6379)
        local user_id = red:get("token:" .. token)
        red:set_keepalive(60000, 100)   -- 还回连接池
        
        if not user_id or user_id == ngx.null then
            ngx.exit(403)
        end
        
        -- 把 user_id 传给后端
        ngx.req.set_header("X-User-Id", user_id)
    }
    
    proxy_pass http://backend;
}
```

**关键技巧**:`set_keepalive` 把连接还回池——**OpenResty 一个 worker 维护到 Redis 的连接池,绝不每请求新建**。

### 9.5 lua 不能阻塞

```lua
-- 烂:用了 LuaSocket(底层 BSD socket,会阻塞 worker)
local socket = require "socket"
local tcp = socket.tcp()
tcp:connect("a.com", 80)   -- ★ 整个 worker 卡死!

-- 对:用 cosocket(OpenResty 提供,集成 epoll)
local sock = ngx.socket.tcp()
sock:connect("a.com", 80)  -- 异步,不卡 worker
```

**所有阻塞函数禁用**:`os.execute` / 同步文件 IO / 标准 luasocket / `ngx.sleep` 之外的 sleep——**踩到一个 worker 立刻黑屏**。

### 9.6 数字感

| 操作 | 耗时 |
| --- | --- |
| Lua 跑空函数 | ~0.1 μs |
| 简单 access_by_lua 鉴权(无 IO) | ~10 μs |
| Lua 查本地 Redis(localhost) | ~200 μs |
| Lua 查远程 Redis(同机房) | ~1 ms |
| 写 Kafka 异步日志 | ~5 μs(只是入队) |

> 经验法则:**OpenResty 的限流 / 鉴权 / 路由都在 access 阶段做**——10-50 μs 加在请求路径里,**用户感知不到**。**业务后端动辄几十毫秒,OpenResty 加的几十微秒可以忽略**。

---

## 十、Nginx 调优 Checklist

### 10.1 系统层(操作系统)

```bash
# /etc/sysctl.conf
net.core.somaxconn = 65535             # listen 队列
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535   # SYN 半连接队列
net.ipv4.tcp_tw_reuse = 1              # TIME_WAIT 复用
net.ipv4.tcp_fin_timeout = 30
net.ipv4.ip_local_port_range = 1024 65535   # 临时端口范围(建上游连接用)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
fs.file-max = 1000000

# /etc/security/limits.conf
nginx soft nofile 100000
nginx hard nofile 100000
```

### 10.2 Nginx 配置层

```nginx
worker_processes auto;
worker_rlimit_nofile 100000;
worker_cpu_affinity auto;

events {
    worker_connections 65535;
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    
    # SSL 优化
    ssl_session_cache shared:SSL:50m;        # 50MB 共享缓存
    ssl_session_timeout 1d;
    ssl_session_tickets on;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # gzip 优化
    gzip on;
    gzip_comp_level 4;       # 1-9,4-6 是甜区
    gzip_min_length 1024;    # 小于 1KB 不压
    gzip_types text/plain application/json text/css application/javascript;
    
    # 文件 cache
    open_file_cache max=10000 inactive=60s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
    
    # 日志:用 buffer(异步刷盘)
    access_log /var/log/nginx/access.log main buffer=64k flush=1s;
    
    # 反代默认
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 10.3 上线前 Checklist

| 项 | 命令 | 期望 |
| --- | --- | --- |
| 配置语法 | `nginx -t` | OK |
| 平滑重载 | `nginx -s reload` | 无 downtime |
| worker 数 = 核数 | `ps -ef \| grep worker \| wc -l` | == nproc |
| fd 上限 | `cat /proc/<worker pid>/limits` | 100000+ |
| listen 队列没溢出 | `ss -lnt` 看 Recv-Q | 接近 0 |
| TIME_WAIT 不爆 | `ss -ant \| awk '{print $1}' \| sort \| uniq -c` | < 10K |
| SSL session 复用率 | curl 第二次握手快 | <100ms |
| 长连接 keepalive_requests 没爆 | 看 502 偶发是不是这个 | 调到 10000 |

---

## 十一、踩坑提醒

1. **以为 master 进程也处理请求**——它只管 worker,所有请求 worker 干
2. **worker_connections 调爆但没调 fd 上限**——`ulimit -n` 还是 1024,worker 起不来
3. **proxy_pass 后忘了 `proxy_http_version 1.1` 和清空 Connection**——上游 keepalive 失效,QPS 砍半
4. **location 正则放在前缀前以为有用**——见五,匹配优先级搞反
5. **client_max_body_size 默认 1m**——上传 10MB 文件就 413,经常被新人坑
6. **SSL 不开 session_cache**——每次握手 2 RTT,API 网关 P99 飙升
7. **gzip_types 漏写 application/json**——API 响应没压缩,带宽爆
8. **proxy_buffering off 滥用**——只有 SSE / 大文件流式才该关,普通 API 关了反而慢
9. **OpenResty 在 access_by_lua 里做了同步 HTTP 调用**——worker 黑屏
10. **以为 if 在 location 外能用**——`if` 在 server 级别工作正常,在 location 级别只支持几种条件,用错就玄学 bug,**有一句名言:"if is evil"**
11. **平滑重载后老 worker 不退**——可能有 long polling 连接卡住,看 `worker_shutdown_timeout`
12. **生产开 debug 日志**——单 worker 日志一秒能写几 GB,磁盘瞬间满
13. **没装 stub_status / nginx-vts**——出问题没监控数据,只能 strace
14. **缓存 key 没把 Vary 算进去**——同 URL 但 `Accept-Encoding: gzip` 和不 gzip 应该缓存两份

---

下一篇:`35-Envoy与服务网格.md`,讲为什么云原生时代 Nginx 让位给 Envoy——**xDS 动态配置**(Listener / Route / Cluster / Endpoint 全部从控制面热推,不需要 reload)、**数据面 vs 控制面分离**(Istio = Envoy 数据面 + Pilot/Istiod 控制面)、**Filter Chain**(L4 + L7 任意编排,比 Nginx 的 if 强一千倍)、**SDS 自动签发 mTLS 证书**(每秒滚证书都不带停机)、**Sidecar 模式 vs Gateway 模式的取舍**、**Envoy vs Nginx 的硬指标对比**——以及为什么 Lyft / Google / Stripe 这些一线大厂都从 Nginx 迁到了 Envoy,但你的中小型项目 99% 不需要跟。
