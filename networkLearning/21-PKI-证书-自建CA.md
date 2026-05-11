# PKI 证书 自建 CA

前面 18 / 19 / 20 三篇反复提到"证书"、"CA"、"证书链"、"SAN"、"OCSP"——**这一篇彻底讲透**。证书不是密码学,**是密码学的基础设施**(PKI = Public Key Infrastructure):**用一套层级化的签名机制,让"陌生人之间能基于一个共同信任的根来验证身份"**。**TLS 之所以能在公网上跑通,99% 靠 PKI**——你浏览器里那 100 多个根 CA 决定了"你信谁"。这一篇从 X.509 字段到 Let's Encrypt ACME,从自建 CA 到 mkcert 调试,把整条链路讲通。

> 一句话先记住:**证书 = 公钥 + 身份信息 + CA 签名**——CA 用自己的私钥签了"这个公钥确实属于这个域名/这个身份"。**信任的根本来自"根 CA 列表预装在操作系统/浏览器"**——没装就不信,装了就盲信(所以根 CA 私钥被偷过几次,引发了 CT 这套全网公开账本机制)。**生产 9 成 SSL 报错就 3 类**:**证书过期、SAN 不匹配、证书链不全**——这一篇结束你看到这些错误能立刻定位。

---

## 一、X.509 证书结构

### 1.1 一张证书长什么样

```bash
openssl x509 -in cert.pem -noout -text
```

典型输出:

```
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number:
            04:3f:9a:7c:...
        Signature Algorithm: ecdsa-with-SHA256
        Issuer: C=US, O=Let's Encrypt, CN=R3
        Validity
            Not Before: Apr 15 00:00:00 2026 GMT
            Not After : Jul 14 23:59:59 2026 GMT
        Subject: CN=www.example.com
        Subject Public Key Info:
            Public Key Algorithm: id-ecPublicKey
            Public-Key: (256 bit)
            pub:
                04:8a:b2:c3:...
            ASN1 OID: prime256v1
            NIST CURVE: P-256
        X509v3 extensions:
            X509v3 Subject Alternative Name:
                DNS:www.example.com, DNS:example.com
            X509v3 Extended Key Usage:
                TLS Web Server Authentication
            X509v3 Key Usage: critical
                Digital Signature
            Authority Information Access:
                OCSP - URI:http://r3.o.lencr.org
                CA Issuers - URI:http://r3.i.lencr.org/
            X509v3 CRL Distribution Points:
                Full Name:
                  URI:http://r3.c.lencr.org/24.crl
            CT Precertificate SCTs:
                Signed Certificate Timestamp:
                    Version   : v1
                    Log ID    : ...
                    Timestamp : Apr 15 00:00:01.234 2026 GMT
                    Signature : ...
    Signature Algorithm: ecdsa-with-SHA256
         30:46:02:21:...
```

### 1.2 关键字段解读

| 字段 | 作用 |
| --- | --- |
| **Version** | X.509 v3 是当前唯一在用的版本 |
| **Serial Number** | CA 唯一编号(每张证书唯一) |
| **Signature Algorithm** | CA 用什么算法签的(`ecdsa-with-SHA256` / `sha256WithRSAEncryption`) |
| **Issuer** | 谁签的(上一级 CA 的 Subject) |
| **Validity** | 有效期(2026 年公网证书最长 397 天,Let's Encrypt 默认 90 天) |
| **Subject** | 证书属于谁(`CN=www.example.com`,但 CN 已弃用,看 SAN) |
| **Subject Public Key Info** | 公钥本体 + 算法 |
| **SAN(Subject Alternative Name)** | 真正的"这张证书可用于哪些域名"列表 |
| **EKU(Extended Key Usage)** | serverAuth / clientAuth / codeSigning |
| **AIA(Authority Information Access)** | OCSP 地址 + CA 中间证书下载地址 |
| **CRL Distribution Points** | 吊销列表的 URL |
| **CT SCTs** | Certificate Transparency 的"日志凭证" |
| **Signature** | CA 的签名 |

### 1.3 SAN:CN 已死

```
2017 年起:Chrome 完全不再认 CN 字段
            必须看 X509v3 Subject Alternative Name
2026 年:  浏览器 / curl / Go / Java 都强制 SAN

例子(SAN 含多个域名):
  DNS:example.com
  DNS:www.example.com
  DNS:*.api.example.com
  IP:1.2.3.4
  URI:spiffe://prod/sa/checkout
```

**SAN 类型**:
- `DNS:` — 域名(可带通配符 `*.example.com`,但只匹配一级)
- `IP:` — IP 地址(很少用,需要专门申请)
- `URI:` — 任意 URI(SPIFFE 用)
- `email:` — 邮箱(S/MIME 邮件加密)

> 踩坑提醒:**通配符证书 `*.example.com` 不匹配 `example.com`,也不匹配 `a.b.example.com`**——只匹配同一级。要全覆盖,SAN 里必须显式列 `example.com` 和 `*.example.com` 两条。

### 1.4 EKU:服务端 / 客户端 / 代码签名

```
TLS Web Server Authentication      → HTTPS 服务端
TLS Web Client Authentication      → HTTPS 客户端 / mTLS
Code Signing                       → exe / 驱动签名
Email Protection                   → S/MIME
Time Stamping                      → 时间戳服务
```

**一张证书可以同时有多个 EKU**——但生产建议"专用专签",清晰。

---

## 二、证书链:为什么需要中间 CA

### 2.1 三层结构

```
Root CA (根)         自签名,在浏览器信任库里
   │
   ├── Intermediate CA (中间)     由 Root 签
   │      │
   │      └── Leaf (叶子)        由 Intermediate 签
   │             │
   │             └── 你的服务器
```

### 2.2 为什么不让根直接签叶子

```
1. 安全隔离:
   根 CA 私钥要离线保存(空气隔绝)
   日常签证书的是中间 CA
   中间 CA 泄露,可吊销重发,根不动

2. 灵活性:
   不同业务用不同中间 CA(LE 有 R3 / R10 / E1 等)
   一个中间 CA 出问题不影响其他业务

3. 历史遗产:
   根 CA 信任名单更新极慢(Windows / Android 几年才推一次)
   新签的叶子证书必须能被老设备验
   → 用老根 + 新中间 + 新叶子
```

**Let's Encrypt 实际链**:

```
ISRG Root X1                    (Let's Encrypt 自己的根,2015 年签)
  ├── Let's Encrypt R3          (RSA 中间)
  └── Let's Encrypt E1          (ECDSA 中间,2020 才出)
        └── 你网站的叶子
```

### 2.3 验证流程

```
浏览器收到服务端发的证书链:[leaf, intermediate]

1. 验证 leaf:用 intermediate 的公钥验 leaf 的签名 ✓
2. 验证 intermediate:用 root 的公钥验 intermediate 的签名 ✓
3. 检查 root 在不在本地信任库里 ✓
4. 检查 leaf 的 SAN 是否匹配请求的域名 ✓
5. 检查 leaf 的有效期 ✓
6. 检查 leaf 的吊销状态(可选)✓

任何一步失败 → 红色警告 / 拒绝连接
```

### 2.4 服务端发证书链的规则

```
✓ 必须发:    leaf + 所有 intermediate
✗ 不发也行:  root(浏览器本地有,发了浪费 1KB)
✗ 千万别发:  其他无关证书
```

> 经验法则:**如果你的网站在浏览器没事,但 curl / Go / Java 报"unable to verify certificate",90% 是中间 CA 没发**——浏览器有 AIA 自动补全,curl 没有。

---

## 三、证书链不全:最常见的 SSL bug

### 3.1 症状

```
curl https://api.example.com/
curl: (60) SSL certificate problem: unable to get local issuer certificate

Java:
javax.net.ssl.SSLHandshakeException: PKIX path building failed: 
  unable to find valid certification path to requested target

Go:
x509: certificate signed by unknown authority
```

**浏览器一切正常**——因为浏览器有 AIA(Authority Information Access)字段会自动去下中间证书。**命令行工具大多没有这个能力**。

### 3.2 排查

```bash
# 查服务端发了几张证书
openssl s_client -connect api.example.com:443 -servername api.example.com 2>/dev/null \
  </dev/null | grep "s:\|i:"

# 输出应该至少 2 行(叶子 + 中间):
# s:CN = api.example.com               ← subject(叶子)
# i:C = US, O = Let's Encrypt, CN = R3 ← issuer(中间)
# s:C = US, O = Let's Encrypt, CN = R3 ← subject(中间)
# i:C = US, O = ISRG, CN = ISRG Root X1← issuer(根)

# 如果只有 1 行 s/i,就是缺中间证书
```

### 3.3 修复

**Nginx**:

```nginx
# 错误:只有叶子
ssl_certificate /etc/nginx/leaf.crt;

# 正确:fullchain(叶子 + 中间)
ssl_certificate /etc/nginx/fullchain.pem;
```

`fullchain.pem` = `cat leaf.crt intermediate.crt > fullchain.pem`(顺序重要,叶子在前)。

**Let's Encrypt 用 certbot**:

```bash
certbot certonly --webroot -w /var/www -d example.com
# 生成在 /etc/letsencrypt/live/example.com/
# 用 fullchain.pem 不要用 cert.pem
```

> 踩坑提醒:**`/etc/letsencrypt/live/{domain}/cert.pem` 只是叶子,不要用**——必须 `fullchain.pem`。

---

## 四、Certificate Transparency:全网公开账本

### 4.1 为什么需要

**历史教训**:**CA 误签 / 被攻陷**。

```
2011 DigiNotar 被黑     → 攻击者签了 *.google.com,中间人攻击伊朗用户
2015 CNNIC 误签         → 给 MCS Holdings 签了能签任何域名的中间 CA
2018 Symantec 体系崩    → Google 拒不再信任 Symantec 整个 CA 体系
```

**问题**:CA 签了一张证书,**域名所有者根本不知道**。**Google 急了——搞了 CT**。

### 4.2 CT 怎么工作

```
CA 签证书前:
1. 把证书提交到 CT log(只追加的公开日志)
2. CT log 返回 SCT(Signed Certificate Timestamp)
3. CA 把 SCT 嵌入证书(或用 OCSP/TLS 扩展发)

浏览器验证证书时:
1. 检查证书里有 SCT
2. (Chrome 强制)拒绝没有 SCT 的证书

域名所有者:
1. 监控 CT log(crt.sh / Cert Spotter 等)
2. 发现"我没申请的证书出现了" → 立刻吊销
```

### 4.3 实战:监控自己域名的 CT

```bash
# 查 example.com 的所有签发记录
curl -s "https://crt.sh/?q=example.com&output=json" | jq '.[].name_value' | sort -u
```

**或注册告警服务**:Cert Spotter、Facebook CT Monitoring、Sectigo Web Monitoring——**任何新签证书 5 分钟内推送邮件**。

### 4.4 CT 的副作用:暴露内部域名

```
你给 internal-api.company.com 签了 LE 证书
→ 自动进 CT log
→ 攻击者扫 crt.sh 一搜全暴露

防护:
  内部用自建 CA(不进 CT log)
  或用通配符 *.internal.company.com 隐藏具体子域
```

> 经验法则:**CT 是公网"明账本",优势:防 CA 作恶;代价:暴露所有子域**——内部服务别用公网 CA。

---

## 五、吊销机制:CRL vs OCSP

### 5.1 CRL(Certificate Revocation List)

```
CA 维护一个"被吊销证书"列表(就是一堆序列号)
浏览器定期下载,每次验证时查表

问题:
- 列表越来越大(几 MB),下载慢
- 更新频率低(几小时一次),滞后
- 浏览器实际上"软失败"——CRL 下不到时直接放行,等于没用
```

### 5.2 OCSP(Online Certificate Status Protocol)

```
每次验证证书,浏览器问 CA 的 OCSP Responder:
  "证书序列号 X 还有效吗?"
CA 回:"还有效" / "已吊销"

问题:
- 多一次网络请求,延迟 +100-300ms
- 浏览器查 OCSP → CA 知道"谁正在访问哪个站",隐私问题
- OCSP server 挂 → 浏览器又"软失败"
```

### 5.3 OCSP Stapling:服务端缓存

**方案**:**让服务端定期向 CA 查 OCSP,把响应"钉"在 TLS 握手里发给客户端**。

```
服务端启动:
  每小时查一次 OCSP,缓存响应

握手时:
  ServerHello 后多发一个 CertificateStatus 消息
  内容 = OCSP 响应(带 CA 签名,客户端能验)

客户端:
  无需再查 OCSP,握手中拿到了
  → 性能 +200ms 提升,隐私也保护了
```

**Nginx 配置**:

```nginx
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/nginx/intermediate.pem;
resolver 8.8.8.8 1.1.1.1 valid=300s;
```

### 5.4 CRLite / 短期证书:更激进的方向

```
Mozilla 的 CRLite:
  把所有 CA 的吊销列表压缩成 Bloom Filter
  几 MB 装下整个 Web 的吊销状态
  浏览器本地查,不联网

短期证书路线(LE / Cloudflare):
  90 天 / 7 天的证书
  根本不需要吊销 — 反正快过期
```

**未来方向**:**短期证书 + 自动轮换 = 干掉吊销**。

---

## 六、Let's Encrypt + ACME 协议

### 6.1 Let's Encrypt 是什么

```
2015 年免费 CA,Mozilla / EFF / Cisco 等支持
2026 年签发量占公网证书 60%+
全自动化,90 天有效期,逼着你自动续
```

### 6.2 ACME 协议:自动签发

**RFC 8555**——`certbot` / `acme.sh` / cert-manager 都基于这个。

**核心流程**:

```
1. 注册账号(生成账号密钥)
2. 提交订单:"我要一张 example.com 的证书"
3. CA 返回 challenge:"证明你拥有这个域名"
   - HTTP-01: 在 http://example.com/.well-known/acme-challenge/<token> 放文件
   - DNS-01:  在 _acme-challenge.example.com TXT 加记录
   - TLS-ALPN-01: TLS 握手时返回特殊证书
4. 客户端完成 challenge
5. CA 验证 challenge 通过
6. 客户端提交 CSR
7. CA 签发证书
```

### 6.3 三种 challenge 怎么选

```
HTTP-01:
  最简单,80 端口要开
  不能签通配符 *.example.com
  
DNS-01:
  能签通配符
  需要 DNS API(自动改 TXT 记录)
  适合 Route53 / Cloudflare / Aliyun DNS

TLS-ALPN-01:
  443 端口直接验
  适合不能改 80 端口的场景
  支持的客户端少
```

### 6.4 实操:certbot 一行签证书

```bash
# 自动模式:certbot 临时起 80 端口验证
sudo certbot certonly --standalone -d example.com -d www.example.com

# 已有 nginx 跑着,用 webroot 模式
sudo certbot certonly --webroot -w /var/www/html -d example.com

# 通配符,DNS-01,Cloudflare 插件
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials ~/.cf.ini \
  -d '*.example.com' -d example.com

# 续期(60 天后自动)
sudo certbot renew
```

**生成的文件**:

```
/etc/letsencrypt/live/example.com/
├── cert.pem        ← 叶子(别用)
├── chain.pem       ← 中间链
├── fullchain.pem   ← 叶子 + 链(Nginx 用这个)
└── privkey.pem     ← 私钥
```

### 6.5 acme.sh:更轻量

```bash
curl https://get.acme.sh | sh
~/.acme.sh/acme.sh --issue --dns dns_cf -d '*.example.com'
~/.acme.sh/acme.sh --install-cert -d example.com \
  --key-file       /etc/nginx/key.pem  \
  --fullchain-file /etc/nginx/fullchain.pem \
  --reloadcmd     "nginx -s reload"
```

**`acme.sh` 是 shell 写的,无 python 依赖**——容器场景常用。

### 6.6 cert-manager:K8s 路线

```yaml
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
    - http01:
        ingress:
          class: nginx
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: example-tls
spec:
  secretName: example-tls
  dnsNames:
    - example.com
    - www.example.com
  issuerRef:
    name: letsencrypt-prod
    kind: Issuer
```

申请、续期、Secret 注入全自动。

---

## 七、自建 CA:完整步骤

适合**内部服务 / 测试环境 / mTLS 内部 CA**。

### 7.1 创建根 CA

```bash
mkdir -p ~/myca && cd ~/myca

# 根私钥(ECDSA P-384,长寿命用强一点)
openssl ecparam -name secp384r1 -genkey -out root.key

# 自签根证书(20 年)
openssl req -new -x509 -days 7300 -key root.key -out root.crt \
  -subj "/C=CN/O=MyCompany/CN=MyCompany Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"
```

### 7.2 创建中间 CA

```bash
# 中间私钥
openssl ecparam -name prime256v1 -genkey -out int.key

# 中间 CSR
openssl req -new -key int.key -out int.csr \
  -subj "/C=CN/O=MyCompany/CN=MyCompany Issuing CA"

# 用根签中间(5 年)
openssl x509 -req -days 1825 -in int.csr \
  -CA root.crt -CAkey root.key -CAcreateserial \
  -out int.crt \
  -extfile <(printf "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign")
```

`pathlen:0` 限制中间 CA 不能再签出新的中间 CA(只能签叶子)。

### 7.3 签叶子证书

准备 CSR(`server.cnf`):

```ini
[req]
default_bits       = 256
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = req_ext

[dn]
CN = api.internal.com

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = api.internal.com
DNS.2 = api.internal
IP.1  = 10.0.0.42
```

签发:

```bash
openssl ecparam -name prime256v1 -genkey -out server.key
openssl req -new -key server.key -out server.csr -config server.cnf

openssl x509 -req -days 90 -in server.csr \
  -CA int.crt -CAkey int.key -CAcreateserial \
  -out server.crt \
  -extfile server.cnf -extensions req_ext \
  -extfile <(printf "extendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE")
```

**服务端发的应该是 server.crt + int.crt**(fullchain),浏览器/curl 信任 root.crt。

### 7.4 让客户端信任你的根

```bash
# Linux (Debian / Ubuntu)
sudo cp root.crt /usr/local/share/ca-certificates/myca.crt
sudo update-ca-certificates

# Linux (RHEL / CentOS)
sudo cp root.crt /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust

# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain root.crt

# Windows (PowerShell)
Import-Certificate -FilePath root.crt -CertStoreLocation Cert:\LocalMachine\Root
```

---

## 八、mkcert:本地开发神器

自建 CA 流程繁琐,本地开发 / 测试有更好的工具:**mkcert**。

```bash
# 安装
brew install mkcert        # macOS
apt install mkcert         # Ubuntu

# 一次性把 mkcert 的根 CA 装进系统/浏览器信任库
mkcert -install

# 给本地域名签证书(秒级)
mkcert localhost 127.0.0.1 ::1 dev.local

# 输出:
# ./localhost+3.pem
# ./localhost+3-key.pem
```

**直接用 fullchain.pem + key.pem 配 nginx,本地浏览器无任何警告**。

> 经验法则:**本地开发 / Docker compose / 本机 demo 全用 mkcert**——别再 self-signed 然后到处点"忽略警告"。

---

## 九、踩坑提醒(Top 10 SSL 报错)

### 9.1 证书过期

```
NET::ERR_CERT_DATE_INVALID
x509: certificate has expired or is not yet valid
```

**修**:`certbot renew` / 把 cron 续期任务跑起来。

### 9.2 SAN 不匹配

```
NET::ERR_CERT_COMMON_NAME_INVALID
x509: certificate is valid for foo.com, not bar.com
```

**修**:重新签证书,SAN 加上访问的域名;或者用 SNI + 多证书。

### 9.3 链不全

```
unable to get local issuer certificate
```

**修**:nginx 用 `fullchain.pem` 而非 `cert.pem`(详见第三节)。

### 9.4 系统时间错

```
x509: certificate has expired or is not yet valid (... before)
```

服务器系统时钟比真实时间晚 → 证书"还没生效"。**修**:NTP 校时。

### 9.5 客户端没装根 CA

```
unknown authority
```

**修**:把自建 CA 根证书装进客户端信任库(详见 7.4)。

### 9.6 通配符层数不对

```
*.example.com → 不匹配 a.b.example.com
```

**修**:要么 SAN 加 `*.b.example.com`,要么扁平化子域。

### 9.7 EKU 不对(mTLS)

```
TLS handshake error: tls: client didn't provide a certificate / unsupported usage
```

**修**:客户端证书 EKU 必须含 `clientAuth`。

### 9.8 OCSP stapling 配错

```
nginx 启动报 ssl_stapling failed: no resolver
```

**修**:加 `resolver 8.8.8.8 valid=300s;`。

### 9.9 中间 CA 弃用

```
2024 LE 把 R3 换成 R10/R11
旧客户端没更新中间证书路径报错
```

**修**:certbot 自动会拿新链,**别手动复制中间证书**。

### 9.10 证书私钥不匹配

```
SSL: Private key does not match the certificate public key
```

**修**:检查 cert 和 key 是不是一对(用下面命令对比 modulus):

```bash
openssl x509 -in cert.pem -noout -modulus | sha256sum
openssl rsa  -in key.pem  -noout -modulus | sha256sum
# 两个 hash 必须一样

# ECDSA 的话:
openssl x509 -in cert.pem -noout -pubkey | sha256sum
openssl ec   -in key.pem  -pubout 2>/dev/null | sha256sum
```

---

## 十、一些有用的命令速查

```bash
# 看证书内容
openssl x509 -in cert.pem -noout -text

# 看远程服务器的证书
openssl s_client -connect example.com:443 -servername example.com </dev/null \
  | openssl x509 -noout -text

# 看证书指纹
openssl x509 -in cert.pem -noout -fingerprint -sha256

# 看证书有效期
openssl x509 -in cert.pem -noout -dates

# 看 CSR 内容(申请的还没签)
openssl req -in req.csr -noout -text

# 把 PFX/P12 拆成 PEM
openssl pkcs12 -in cert.pfx -out cert.pem -nodes

# 把 PEM 合成 PFX(给 Windows / Java 用)
openssl pkcs12 -export -in fullchain.pem -inkey key.pem -out cert.pfx

# DER ↔ PEM 转换
openssl x509 -in cert.der -inform DER -out cert.pem -outform PEM
openssl x509 -in cert.pem -inform PEM -out cert.der -outform DER

# 验证证书链(本地)
openssl verify -CAfile root.crt -untrusted intermediate.crt leaf.crt
```

---

## 十一、testssl.sh / SSL Labs:在线测自家站

```bash
# 装
brew install testssl
docker pull drwetter/testssl.sh

# 测
testssl.sh https://www.example.com
docker run --rm drwetter/testssl.sh https://www.example.com

# 关键检查项:
# - 协议版本(只允许 TLS 1.2 / 1.3)
# - 套件强度
# - 证书链完整性
# - HSTS / OCSP stapling
# - 各种已知漏洞(Heartbleed / POODLE / CRIME...)
```

**SSL Labs 在线版**:https://www.ssllabs.com/ssltest/

**目标 A+ 评分**——拿到 A+ 基本意味着配置干净。

---

## 十二、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 能读懂 X.509 证书每个字段 | 必修 |
| ✅ 知道 CN 已死,看 SAN | 必修 |
| ✅ 能解释根 / 中间 / 叶子三级链 | 概念 |
| ✅ 知道服务端必须发"叶子+中间",别发根 | 配置 |
| ✅ 90% SSL 报错三类:过期 / SAN 错 / 链不全 | 排错 |
| ✅ 会用 certbot 或 acme.sh 自动签 LE 证书 | 实战 |
| ✅ 会自建 CA 签内部证书 | 实战 |
| ✅ 知道 mkcert 是本地开发首选 | 工具 |
| ✅ 理解 CT log 既是防 CA 作恶又会暴露内部域 | 安全 |
| ✅ 知道 OCSP Stapling 配置 | 性能 |

---

## 十三、小结

PKI 看起来复杂,**抓住三件事就清晰**:

```
1. 证书 = 公钥 + 身份 + CA 签名
   验证 = 用 CA 公钥验签

2. 信任 = 你信哪几个根 CA
   操作系统 / 浏览器自带一份(几百个)
   自建 CA = 你自己往这份名单里塞

3. 部署 = 自动化的死活
   90 天证书 + cron + cert-manager = 永远不过期
   2026 年没人手动续证书
```

**TLS 17-21 这五篇汇总一下**:

- **17 密码学基础**:对称 / 非对称 / Hash / HMAC / 密钥交换 五大原料
- **18 TLS 1.2**:把原料组装成 2 RTT 握手,细节多
- **19 TLS 1.3**:重构,1 RTT 全握 + 0 RTT 复用,删一半功能
- **20 mTLS**:双向认证,微服务零信任的工程载体
- **21 PKI**:证书 / CA / ACME / 自建,把 TLS 真正运维起来

**记住三件事**:

1. **证书过期 / SAN 不匹配 / 链不全**——9 成 SSL 报错就这三类
2. **2026 年 Let's Encrypt + cert-manager / acme.sh 自动化**——别再手动签
3. **内部用自建 CA,公网用公共 CA**——别让 internal-* 子域进 CT log

下一篇:`22-HTTP-1.1-深度.md`——回到应用层,讲 HTTP/1.1 这个 1997 年的协议**为什么撑了 25 年**、**Keep-Alive / Pipelining 怎么省 RTT**、**队头阻塞为什么逼出了 HTTP/2**、**Chunked Transfer-Encoding 是怎么玩的**(`Transfer-Encoding: chunked` 那个奇怪的格式怎么解析)、**Content-Length / Connection / Host 三大头怎么协作**——你以为 1.1 简单,实际上每个 HTTP 服务器作者都被它的细节坑过。
