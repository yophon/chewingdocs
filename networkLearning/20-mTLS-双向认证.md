# mTLS 双向认证

上两篇 18 / 19 讲的 TLS 都是**单向认证**:**只验证服务端身份**(浏览器看证书是不是真的 Google),**客户端身份不验**(谁都能访问)。这在公网 Web 是合理的——**用户身份用 Cookie / Token 在应用层处理**,不需要每个浏览器都装个证书。但**到了微服务、到了零信任、到了 API 网关之间**,情况完全反过来:**调用方也是机器,身份必须强校验,而且不能用账号密码**——**mTLS(mutual TLS)** 才是答案。

> 一句话先记住:**mTLS = TLS 握手时双方都出证书,双方都验对方**。**单向 TLS 只回答"你是不是这个域名"——mTLS 回答"我是 service-A,你是 service-B,我们都拿得出 CA 签的证书"**。**零信任网络的核心机制就是 mTLS**——所有内部流量必须加密 + 双向认证,连 K8s 集群里两个 Pod 互相调都要走 mTLS。**真正的难点不是 TLS 协议,而是几万个证书的自动签发、轮换、吊销**——这就是 SPIFFE / Istio / cert-manager 解决的问题。

---

## 一、单向 TLS vs mTLS:握手差异

### 1.1 单向 TLS(普通 HTTPS)

```
Client                                Server
  │                                     │
  │  ClientHello                        │
  │ ─────────────────────────────────→  │
  │                                     │
  │                              ServerHello
  │                              Certificate (服务端证书)
  │                              ServerKeyExchange
  │                              ServerHelloDone
  │ ←─────────────────────────────────  │
  │                                     │
  │ (验证服务端证书)                      │
  │                                     │
  │  ClientKeyExchange                  │
  │  Finished                           │
  │ ─────────────────────────────────→  │
```

**只有服务端发了 Certificate**——客户端是匿名的。

### 1.2 mTLS:服务端要求客户端证书

```
Client                                Server
  │                                     │
  │  ClientHello                        │
  │ ─────────────────────────────────→  │
  │                                     │
  │                              ServerHello
  │                              Certificate (服务端证书)
  │                              ServerKeyExchange
  │                              CertificateRequest (!)  ← 关键
  │                              ServerHelloDone
  │ ←─────────────────────────────────  │
  │                                     │
  │  Certificate (客户端证书)             │
  │  ClientKeyExchange                  │
  │  CertificateVerify (用客户端私钥签)   │
  │  Finished                           │
  │ ─────────────────────────────────→  │
  │                                     │
  │                              (验证客户端证书)
  │                                     │
  │                              Finished
  │ ←─────────────────────────────────  │
```

**多了三个东西**:
1. 服务端发 `CertificateRequest`(说"请你也给我一张证书")
2. 客户端发 `Certificate`(自己的证书)
3. 客户端发 `CertificateVerify`(用客户端私钥签 transcript hash,证明私钥确实在自己手里)

**TLS 1.3 mTLS 也是这个模式**——只是握手都加密了,Certificate 和 CertificateVerify 都在加密信道里发。

---

## 二、为什么需要 mTLS

### 2.1 单向 TLS 的认证盲区

```
公网 HTTPS:
  服务端有证书 → 客户端知道自己连的是 google.com
  客户端没证书 → 服务端不知道你是谁
  → 用户身份靠 应用层 Cookie / OAuth token / API key

够用吗?
  Cookie 被盗 → 攻击者可以伪装用户
  API key 写死在客户端 → 反编译就泄露
  Bearer token 在 HTTP 头里 → 中间人能抓(虽然 TLS 防了)
```

### 2.2 微服务场景:必须强身份

```
service-A → service-B
  问题 1: service-B 怎么知道调用方是 service-A?
            HTTP header? 头能伪造
            IP 白名单? IP 在 K8s 是动态的
            Bearer token? token 怎么发?怎么轮换?
  
  问题 2: service-A 怎么知道连到的是真 service-B?
            DNS 可能被劫持(K8s 内部 DNS 投毒过)
            一个网关劫持所有流量

  解法:    双方都用 CA 签的证书
            身份就是证书里的 SAN: spiffe://prod/sa/service-a
            互相验证 → 互相信任 → 流量加密
```

### 2.3 零信任(Zero Trust)架构

```
传统边界安全:
  防火墙隔出"内网"
  内网 = 可信任
  外网 = 不可信任

零信任:
  没有"内网可信"这个假设
  每一次调用都必须证明身份
  网络位置不代表身份
```

**零信任的工程载体就是 mTLS**——配合 SPIFFE 身份、配合 OPA 鉴权,组成"BeyondCorp"模式。

> 经验法则:**任何 K8s 生产集群,2026 年都应该全集群 mTLS**——服务网格(Istio / Linkerd)默认开。**没开 mTLS = 内网随便横向移动**。

---

## 三、mTLS 的身份模型

### 3.1 服务端证书 vs 客户端证书:有什么不同

**协议层面**:**没有任何不同**——都是 X.509 证书,都是 RSA / ECDSA / Ed25519 私钥,都是 CA 签发。

**用途上**:
```
服务端证书:
  CN / SAN = 域名(www.example.com)
  EKU = serverAuth (1.3.6.1.5.5.7.3.1)
  
客户端证书:
  CN / SAN = 服务身份 / 用户邮箱 / SPIFFE URI
  EKU = clientAuth (1.3.6.1.5.5.7.3.2)
```

**EKU(Extended Key Usage)** 字段告诉 TLS 实现"这张证书是给客户端用的还是服务端用的"——配错了,握手直接失败。

### 3.2 SPIFFE:微服务的身份标准

**SPIFFE = Secure Production Identity Framework For Everyone**——CNCF 项目。

```
SPIFFE ID 格式:
  spiffe://<trust-domain>/<workload-identifier>

例子:
  spiffe://prod.company.com/ns/payments/sa/checkout
  spiffe://prod.company.com/ns/orders/sa/order-svc
```

**SPIFFE ID 编码在证书的 SAN 扩展(URI 类型)里**:

```
X509v3 Subject Alternative Name:
    URI:spiffe://prod/ns/payments/sa/checkout
```

**好处**:
- 跨语言、跨平台、跨云的统一身份
- 一眼看出"这是哪个 namespace 的哪个 service account"
- 鉴权策略可以基于 SPIFFE ID 写

### 3.3 SPIRE:SPIFFE 的实现

```
SPIRE Server:    给每个 workload 签证书的 CA
SPIRE Agent:     每台机器上跑,负责把证书塞给 workload

工作流:
1. Workload 启动,通过 Unix socket 向 Agent 请求证书
2. Agent 验证 workload 身份(基于 selectors:容器 ID、SELinux label、UID 等)
3. Agent 从 Server 拿对应 SPIFFE ID 的证书,转给 workload
4. Workload 拿到 SVID(SPIFFE Verifiable Identity Document)
   = X.509 证书 + 私钥
5. 证书有效期短(默认 1 小时),Agent 自动续
```

**核心创新**:**workload 自己不需要知道自己的身份是怎么来的**——SPIRE Agent 通过"它在哪个机器、什么进程、什么 K8s pod"等环境特征来判定身份。

---

## 四、Istio / Linkerd:自动 mTLS

### 4.1 Istio 的实现

```
Istio 默认在每个 Pod 注入 sidecar (Envoy)
Envoy 负责所有出入流量
两个服务之间通信:
  app-A 发 HTTP → 本地 Envoy → mTLS → 远端 Envoy → app-B
   ↑              ↑                                  ↓
 应用层裸 HTTP   sidecar 自动加密              对端 sidecar 解密

应用代码完全不知道有 mTLS,业务代码零改动
```

**证书来源**:**Istio 自带 Citadel(后来叫 Istiod)做 CA**,基于 K8s ServiceAccount 签证书。SPIFFE ID 形如:

```
spiffe://cluster.local/ns/default/sa/bookinfo-productpage
```

**配置开 mTLS**:

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT          # 强制 mTLS,拒绝明文
```

### 4.2 Linkerd 的实现

**思路一样,但更轻量**:
- sidecar 是 Rust 写的 linkerd2-proxy(比 Envoy 小一个数量级)
- 默认就开 mTLS,无需配置
- 证书 24 小时轮换,根 CA 365 天轮换

```bash
linkerd viz tap deploy/web
```

**输出会显示每个连接是否 TLS**——一眼看出 mTLS 工作没。

### 4.3 性能开销

```
裸 HTTP:                   100 μs P50
HTTP + Linkerd mTLS:       150 μs P50  (+50 μs)
HTTP + Istio mTLS:         300 μs P50  (+200 μs Envoy 比 linkerd2-proxy 重)
```

**单跳延迟开销 50-200μs**——绝大多数业务接受。

---

## 五、调试 mTLS:命令行实操

### 5.1 用 curl 做 mTLS 客户端

```bash
curl --cert client.crt \
     --key client.key \
     --cacert ca.crt \
     https://api.internal.com:8443/healthz
```

参数:
- `--cert`:客户端证书
- `--key`:客户端私钥
- `--cacert`:用什么 CA 验证服务端证书

**常见错误**:
```
curl: (58) unable to set private key file
  → key 文件路径错 / 没读权限

curl: (35) error:14094416:SSL routines:ssl3_read_bytes:sslv3 alert certificate unknown
  → 服务端不认你的客户端证书(CA 不对 / 证书过期 / EKU 错)

curl: (35) error:14094412:SSL routines:ssl3_read_bytes:sslv3 alert bad certificate
  → 服务端拒绝(权限 / 黑名单)
```

### 5.2 用 openssl s_client 做 mTLS

```bash
openssl s_client -connect api.internal.com:8443 \
  -cert client.crt \
  -key client.key \
  -CAfile ca.crt \
  -servername api.internal.com
```

输出关注:
```
Acceptable client certificate CA names
/CN=Internal CA           ← 服务端告诉你"我接受这些 CA 签的客户端证书"
                            如果你的 client.crt 不是被这个 CA 签的,握手必败

Client Certificate Types: RSA sign, ECDSA sign
Requested Signature Algorithms: ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:...
```

### 5.3 用 openssl s_server 做服务端

调试时本地起一个 mTLS 服务器:

```bash
openssl s_server -cert server.crt \
  -key server.key \
  -CAfile ca.crt \
  -Verify 1 \              # 1 = require client cert
  -accept 8443

# -Verify 是大写,小写 -verify 是 "request but not require"
```

然后 `curl --cert client.crt ...` 测——能直接看到 ssl handshake 全过程。

### 5.4 验证证书 EKU

```bash
openssl x509 -in client.crt -noout -text | grep -A1 "Extended Key Usage"

# 输出应该是:
# X509v3 Extended Key Usage:
#     TLS Web Client Authentication
```

如果 EKU 写的是 `TLS Web Server Authentication`——那它是张服务端证书,做客户端用握手会失败。

### 5.5 看证书的 SPIFFE ID

```bash
openssl x509 -in svid.crt -noout -text | grep -A2 "Subject Alternative Name"

# X509v3 Subject Alternative Name:
#     URI:spiffe://prod.company.com/ns/payments/sa/checkout
```

---

## 六、证书生命周期:mTLS 真正的难点

### 6.1 为什么短证书

```
长期证书(10 年):
  泄露后窗口期长
  吊销靠 CRL / OCSP — 复杂、有滞后
  
短期证书(1 小时):
  即使私钥泄露,1 小时后自动失效
  根本不需要 CRL / OCSP
  → 更安全
  
代价:
  必须有自动轮换机制
  Workload 必须能"无停机重新加载证书"
```

**SPIFFE / Istio 的标准实践:1 小时证书,Agent 提前 30 分钟续**。

### 6.2 证书轮换的几种姿势

```
方案 1:重启 Pod
  最粗暴,有损发布
  仅适合非关键服务

方案 2:进程内热加载(SIGHUP / 文件 watch)
  Nginx 默认行为
  go tls.Config 用 GetCertificate 回调动态加载
  ✓ 推荐

方案 3:连接池级别复用(SPIRE Workload API)
  workload 进程持续从 Unix socket 拿新证书
  应用 lib 自动处理
  ✓ 最优雅

方案 4:Sidecar 拦截
  应用零代码改,sidecar 处理一切
  ✓ Istio / Linkerd 路线
```

### 6.3 cert-manager:K8s 生态的 CA 管控

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-internal-tls
spec:
  secretName: api-internal-tls
  duration: 24h           # 1 天证书
  renewBefore: 8h         # 提前 8h 续
  issuerRef:
    name: internal-ca
    kind: ClusterIssuer
  dnsNames:
    - api.internal.com
```

cert-manager 自动:
1. 生成私钥
2. 向 ClusterIssuer 申请签名
3. 把证书 + 私钥写到 K8s Secret
4. 续期前重新走一遍

**Secret 更新后,Pod 通过 volume mount 自动看到新文件**——配 nginx-ingress 这类支持热加载的网关,做到无感轮换。

---

## 七、mTLS 怎么做鉴权:不止"知道身份"

mTLS 解决了"你是谁"的问题——但**"你能干什么"**(authorization)是另一层。

### 7.1 简单粗暴:CN 白名单

```nginx
location /admin {
    if ($ssl_client_s_dn !~ "CN=admin@company.com") {
        return 403;
    }
    proxy_pass http://backend;
}
```

**够用但脆**——证书一变 SAN 写法就崩。

### 7.2 SPIFFE ID + OPA / RBAC

Istio 的 AuthorizationPolicy:

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: orders-allow
spec:
  selector:
    matchLabels:
      app: orders
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/checkout/sa/checkout-svc"]
    to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/orders/*"]
```

**只有 spiffe://cluster.local/ns/checkout/sa/checkout-svc 这个身份能访问 orders 的 /api/orders/\* 路径**。

### 7.3 把 SPIFFE ID 透传到应用层

Envoy 把对端的 SPIFFE ID 作为 HTTP header 注入:

```
x-forwarded-client-cert: By=spiffe://...;Hash=...;URI=spiffe://prod/ns/checkout/sa/checkout
```

应用代码读这个 header 做更细的业务鉴权。

> 经验法则:**mTLS 提供"传输层身份",应用层做"业务鉴权"**——别在 TLS 层做权限管理,粒度太粗。

---

## 八、mTLS 的性能开销

### 8.1 握手开销(每次新连接)

```
单向 TLS 1.3:        1 次 ECDHE + 1 次签名验证      ~500μs
mTLS 1.3:           1 次 ECDHE + 2 次签名验证 + 1 次签名生成  ~1ms
```

**+0.5 ms 开销** — 对长连接可忽略,对短连接(每次 fork-exec curl)有影响。

### 8.2 数据传输开销

```
握完手之后:        全是对称加密,跟单向 TLS 一模一样
                  ChaCha20 / AES-GCM 5 GB/s,几乎不感知
```

### 8.3 sidecar 开销

```
Envoy:              CPU +10-20%,内存 +50MB,延迟 +200μs
linkerd2-proxy:     CPU +5%,    内存 +10MB, 延迟 +50μs
```

**Sidecar 开销 ≫ TLS 协议开销**——优化重点应该是 sidecar 选型,而不是 TLS 调参。

### 8.4 优化手段

```
1. 长连接 + 连接池
   把握手成本摊薄到几十万次请求

2. Session Resumption / 0-RTT (谨慎)
   见 19 篇 TLS 1.3

3. 选用 ECDSA P-256 / Ed25519 证书
   比 RSA 2048 签名快 20 倍

4. 用 linkerd 替 istio
   sidecar 开销小 4 倍

5. eBPF 跳过 sidecar 数据路径
   Cilium 的方案,见 33 篇
```

---

## 九、自建 mTLS:从零搭一套

完整 PKI 见 21 篇,这里给最小可运行 demo。

### 9.1 建一个 CA

```bash
# 生成 CA 私钥
openssl ecparam -name prime256v1 -genkey -out ca.key

# 自签 CA 证书(10 年)
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/CN=Internal CA"
```

### 9.2 签服务端证书

```bash
# 服务端私钥 + CSR
openssl ecparam -name prime256v1 -genkey -out server.key
openssl req -new -key server.key -out server.csr \
  -subj "/CN=api.internal.com"

# CA 签
openssl x509 -req -days 365 -in server.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt \
  -extfile <(printf "subjectAltName=DNS:api.internal.com\nextendedKeyUsage=serverAuth")
```

### 9.3 签客户端证书

```bash
openssl ecparam -name prime256v1 -genkey -out client.key
openssl req -new -key client.key -out client.csr \
  -subj "/CN=service-a"

openssl x509 -req -days 30 -in client.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt \
  -extfile <(printf "extendedKeyUsage=clientAuth")
```

### 9.4 起 mTLS 服务器(Nginx)

```nginx
server {
    listen 8443 ssl http2;
    server_name api.internal.com;

    ssl_certificate     /etc/nginx/server.crt;
    ssl_certificate_key /etc/nginx/server.key;

    ssl_client_certificate /etc/nginx/ca.crt;
    ssl_verify_client on;          # 强制验证客户端证书
    ssl_verify_depth 2;

    location / {
        # 把客户端身份传给后端
        proxy_set_header X-Client-CN $ssl_client_s_dn;
        proxy_set_header X-Client-Verify $ssl_client_verify;
        proxy_pass http://localhost:8080;
    }
}
```

### 9.5 测试

```bash
# 不带证书 → 失败
curl https://api.internal.com:8443/      # SSL alert: certificate required

# 带证书 → 成功
curl --cert client.crt --key client.key --cacert ca.crt \
     https://api.internal.com:8443/healthz
```

---

## 十、踩坑提醒

1. **EKU 写错** —— 客户端证书写成 serverAuth,握手莫名其妙失败,排错 2 小时
2. **CA 链不全** —— 服务端只发叶子,客户端验不过(下一篇 21 详细讲)
3. **证书 SAN 不含 DNS 名** —— 现代浏览器 / Go / curl 都不再认 CN 字段,只看 SAN
4. **客户端证书过期没轮换** —— 整条调用链断,告警涌入运维群
5. **CA 私钥放业务机器** —— CA 是命根子,要用 HSM 或独立机器隔离
6. **同一个 mTLS CA 给所有环境** —— prod / staging / dev 必须独立 CA,泄露隔离
7. **业务用客户端 CN 做鉴权** —— CN 可被申请方填任意值,要用 SAN URI(SPIFFE ID)
8. **mTLS 配在 LB 层但回源 HTTP** —— LB 后面到应用是裸明文,等于半个 mTLS
9. **健康检查不带证书** —— K8s liveness probe 没配 mTLS,readiness 全失败
10. **跨集群 mTLS 没考虑根 CA 信任**  —— 多集群间通信要 federation 把根 CA 互信
11. **`ssl_verify_client optional` 而非 `on`** —— 没证书也能连,变成"半 mTLS",形同虚设
12. **以为 mTLS 取代了应用层鉴权** —— mTLS 答"是谁",鉴权答"能干啥",两件事

---

## 十一、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 能画 mTLS 握手时序(对比单向 TLS) | 必修 |
| ✅ 知道 EKU 区分 serverAuth / clientAuth | 必修 |
| ✅ 理解 SPIFFE ID 是什么、放在 SAN URI | 概念 |
| ✅ 知道 Istio / Linkerd 默认开 mTLS | 工程 |
| ✅ 会用 `curl --cert --key` 调试 mTLS | 实战 |
| ✅ 会用 `openssl s_client -cert -key` 调试 | 实战 |
| ✅ 知道短期证书 + 自动轮换是 mTLS 灵魂 | 运维 |
| ✅ 区分"身份认证"和"业务鉴权" | 思维 |

---

## 十二、小结

mTLS 不是新协议,是**用 TLS 解决"双向身份认证 + 全程加密"的工程范式**:

```
单向 TLS 解决:      你怎么相信你访问的是真的 google.com
mTLS 解决:         google 怎么相信请求方是合法的 service-X
零信任 + mTLS:    内网每一跳都强身份 + 全加密,假设网络不可信
SPIFFE / SPIRE:   给所有 workload 签发统一格式的身份证
Istio / Linkerd:  Sidecar 自动注入 mTLS,业务零改动
cert-manager:    K8s 里管理证书生命周期的标准答案
```

记住三件事:

1. **mTLS 协议简单,运维难**——99% 的踩坑在证书生命周期
2. **必用短期证书 + 自动轮换**——别再用 1 年期"长寿"证书
3. **mTLS 给身份,鉴权另说**——别在 TLS 层做权限管理

下一篇:`21-PKI-证书-自建CA.md`——这一篇 mTLS 频频提到"证书"、"CA"、"证书链"、"SAN"、"OCSP",下一篇彻底讲透**X.509 证书结构**(每个字段是什么、怎么读)、**证书链怎么验证**(根 / 中间 / 叶子)、**Certificate Transparency**(防 CA 误签的"全网公开账本")、**CRL vs OCSP** 两种吊销机制为什么都不太好用、**Let's Encrypt + ACME 协议**怎么 90 天自动续、**自建 CA 全流程**(`openssl ca` + 配 CSR + 签证书)、**mkcert** 本地开发神器,以及最经典的三个踩坑:**证书过期 / 名字不匹配 / 链不全**——这一节学完,你看到任何 SSL/TLS 报错都能秒判。
