# 源站 IP 暴露路径与 Cloudflare 防护说明

## 核心结论

Cloudflare 主要保护的是通过域名进入的流量。  
如果源站 IP 已经在历史解析、子域、证书、扫描平台或配置文件中暴露，攻击方可以直接访问源站 IP，从而绕过 Cloudflare。

例如域名曾经直接解析到源站：

```text
example.com -> 1.2.3.4
```

后来再套 Cloudflare：

```text
example.com -> Cloudflare IP
```

这只能保护继续通过 `example.com` 访问的人。  
如果攻击方已经知道 `1.2.3.4` 是源站，就可以直接攻击：

```text
1.2.3.4
```

因此准确说法是：

> 不是“套了 Cloudflare 没用”，而是“源站 IP 一旦泄露，仅靠事后套 Cloudflare 不能解决”。

## 攻击方可能从哪里拿到解析记录

### 1. 被动 DNS 数据库

这是最常见的来源之一。

很多安全公司、威胁情报平台、DNS 服务商、CDN 厂商、爬虫节点会长期收集 DNS 查询结果，形成历史解析库。

例如某个时间点存在过：

```text
example.com A 1.2.3.4
```

即使后来改成：

```text
example.com A 104.x.x.x
```

历史库里仍可能保存：

```text
example.com 曾经解析到 1.2.3.4
```

攻击方可以用这些数据查询历史 A 记录、AAAA 记录、CNAME 记录和子域记录。

常见风险包括：

```text
example.com       -> 旧源站 IP
www.example.com   -> 旧源站 IP
api.example.com   -> 源站 IP
admin.example.com -> 源站 IP
test.example.com  -> 源站 IP
```

很多泄露并不是主域泄露，而是子域泄露。

### 2. DNS 缓存和递归解析器记录

域名曾经直连源站时，访问者本地 DNS、运营商 DNS、公共 DNS 解析器都可能缓存过结果。

理论上缓存会按照 TTL 过期，但现实中一些系统、日志、监控平台、安全平台可能会保存更久。  
这些数据也可能被收集进被动 DNS 数据库。

### 3. 证书透明度日志

证书透明度日志，也就是 CT Logs，会公开记录签发过证书的域名。

CT Logs 通常不直接暴露 IP，但会暴露很多子域：

```text
example.com
www.example.com
api.example.com
origin.example.com
panel.example.com
dev.example.com
```

攻击方拿到这些子域后，可以继续查历史解析、扫开放端口、比对证书和页面指纹，从而找到源站。

尤其危险的是这类命名：

```text
origin.example.com
direct.example.com
server.example.com
host.example.com
backend.example.com
admin.example.com
```

这些名字本身就在提示“这里可能是源站”。

### 4. 子域遗漏

很多人只把主域和 `www` 套了 Cloudflare，但忘了其他子域。

例如：

```text
example.com       -> Cloudflare
www.example.com   -> Cloudflare
api.example.com   -> 1.2.3.4
img.example.com   -> 1.2.3.4
admin.example.com -> 1.2.3.4
mail.example.com  -> 1.2.3.4
```

攻击方只要找到任意一个指向同一台服务器的子域，就可能推断源站 IP。

需要重点排查：

```text
A
AAAA
CNAME
MX
TXT
SPF
CAA
NS
```

### 5. 邮件记录泄露

如果 Web 服务和邮件服务在同一台机器上，源站很容易通过邮件记录暴露。

例如：

```text
example.com MX mail.example.com
mail.example.com A 1.2.3.4
```

即使 `www.example.com` 已经套 Cloudflare，`mail.example.com` 仍然暴露了源站 IP。

SPF 记录也可能直接写出服务器 IP：

```text
v=spf1 ip4:1.2.3.4 include:_spf.google.com ~all
```

这里的 `ip4:1.2.3.4` 就是明显泄露。

### 6. 旧 DNS 记录没有清理

DNS 面板中可能残留已经不用的旧记录：

```text
old.example.com
beta.example.com
v1.example.com
cdn-old.example.com
backup.example.com
```

这些记录即使业务上不用，只要仍然解析到源站，就可能被子域枚举工具发现。

### 7. 源站直接响应 HTTP/HTTPS

即使攻击方不知道域名，只要扫到 IP，源站如果直接返回网站内容，就可以被确认。

例如访问：

```text
http://1.2.3.4
https://1.2.3.4
```

如果服务器直接返回站点页面、标题、favicon、证书、跳转地址，就能说明这个 IP 与目标站点有关。

常见暴露点包括：

```text
HTTP Title
Server Header
TLS Certificate
favicon hash
页面内容特征
重定向 Location
错误页品牌信息
```

例如源站返回：

```http
Location: https://www.example.com/login
```

这会直接暴露关联关系。

### 8. TLS 证书复用

如果源站 HTTPS 证书中包含目标域名：

```text
CN=example.com
SAN=www.example.com, api.example.com
```

攻击方扫描公网 IP 的 443 端口时，可以通过证书反查域名。

即使 DNS 已经切到 Cloudflare，只要源站 443 仍对公网开放，并返回包含真实域名的证书，就可能被发现。

### 9. Favicon 和页面指纹

扫描平台可以根据网站图标、标题、HTML 结构、JS 文件、CSS 路径等生成指纹。

如果 Cloudflare 后的网站和源站直连 IP 返回相同内容：

```text
/favicon.ico
/static/app.js
<title>Atlas Admin</title>
```

攻击方可以通过指纹匹配确认源站。

这类方法不依赖历史 DNS。只要源站能被公网访问，就有风险。

### 10. 搜索引擎缓存和互联网扫描平台

一些平台会长期扫描全网 IP，并记录：

```text
开放端口
HTTP 标题
TLS 证书
响应头
favicon
服务版本
历史快照
```

如果源站曾经裸奔过，可能已经被记录。

例如：

```text
1.2.3.4:80   返回 example.com 页面
1.2.3.4:443  证书包含 example.com
1.2.3.4:8080 后台登录页
```

后来再套 Cloudflare，这些历史数据仍可能存在。

### 11. 访问日志、第三方统计和 Webhook

如果网站接入过第三方服务，源站 IP 可能出现在请求链路、日志、报错或配置里。

常见来源包括：

```text
支付回调
Webhook
监控探针
错误上报
CI/CD 部署日志
对象存储回源配置
第三方测速
安全扫描报告
```

某些请求头、日志、调试信息中可能出现真实 IP 或后端地址。

### 12. 反向代理配置错误

套了 Cloudflare 后，如果源站或反向代理配置不当，响应中仍可能泄露内部信息。

例如：

```http
X-Origin-IP: 1.2.3.4
X-Backend-Server: 1.2.3.4
Via: nginx-origin-1
```

错误页也可能暴露：

```text
connect() failed to 1.2.3.4:8080
upstream timed out while connecting to 1.2.3.4
```

这些信息会直接指向后端或源站。

### 13. Git 仓库、配置文件和部署脚本泄露

项目代码或部署文件中可能写有源站地址：

```env
ORIGIN_HOST=1.2.3.4
API_BASE_URL=http://1.2.3.4:8080
SSH_HOST=1.2.3.4
DEPLOY_TARGET=1.2.3.4
```

常见位置包括：

```text
.env
.env.production
docker-compose.yml
nginx.conf
deploy.sh
CI/CD logs
README.md
Terraform 文件
Ansible 文件
```

如果仓库公开、日志泄露、构建产物暴露，攻击方就能拿到。

### 14. 面板、数据库和旁路服务

源站所在机器可能还运行其他服务：

```text
宝塔面板
1Panel
phpMyAdmin
Grafana
Prometheus
Redis
MySQL
MongoDB
SSH
FTP
MinIO
```

攻击方通过扫描这些服务发现 IP，再结合证书、页面标题、端口组合判断它与目标网站有关。

### 15. CDN 回源配置和多 CDN 混用

如果曾经使用过其他 CDN、对象存储或负载均衡，配置里可能留下回源地址。

例如：

```text
旧 CDN 回源：1.2.3.4
对象存储回源：origin.example.com
图片 CDN 回源：img-origin.example.com
```

攻击方查历史 CNAME 或子域时，可能顺着这些记录找到真实源站。

### 16. IPv6 被遗忘

很多人只保护 IPv4，却忘了 AAAA 记录。

例如：

```text
example.com A     -> Cloudflare
example.com AAAA  -> 2400:xxxx::1234
```

这时攻击方可以直接通过 IPv6 访问源站，绕过 Cloudflare。

所以必须同时排查 IPv4 和 IPv6。

### 17. Origin 域名命名太明显

一些常见命名会明显暴露用途：

```text
origin.example.com
real.example.com
direct.example.com
server.example.com
backend.example.com
```

这些域名如果曾经存在或仍然存在，被发现概率很高。

更糟的是，这类域名有时不会开启 Cloudflare 代理，因为使用者觉得“只是自己用”。

### 18. 同 IP 托管多个站点

如果同一台源站上跑多个域名，其中一个没有套 Cloudflare，其他站点也可能被连带暴露。

例如：

```text
site-a.com -> Cloudflare -> 1.2.3.4
site-b.com -> 1.2.3.4
```

攻击方发现 `site-b.com` 后，可能推断 `site-a.com` 的源站也是 `1.2.3.4`。

### 19. 历史迁移记录

域名刚上线、迁移或测试时，经常会短暂直连源站：

```text
example.com -> VPS IP
```

测试完成后再套 Cloudflare。  
这个短暂窗口也可能被扫描器、DNS 数据库或监控平台记录。

### 20. 人为泄露

一些很朴素的泄露也很常见：

```text
截图里露出 IP
群聊里发过服务器地址
工单里贴过域名和 IP
博客教程里写过配置
GitHub issue 里发过 curl 命令
```

攻击方不一定需要复杂技术，有时只是把公开信息拼起来。

## 常见攻击路径

攻击方常见的信息收集链路是：

```text
查历史 DNS
-> 找子域
-> 查证书透明度日志
-> 查邮件、SPF、AAAA、CNAME 记录
-> 扫 80、443、面板端口
-> 比对证书、标题、favicon、页面内容
-> 确认源站 IP
```

## 延展理解：边界不在 DNS，而在回源信任

隐藏源站 IP 不等于源站安全。  
真正要建立的是回源信任边界。

很多人以为套了 Cloudflare 后，安全模型是：

```text
用户 -> Cloudflare -> 源站
```

但真实风险在于，只要源站仍然在公网可达，攻击方就可能绕过 Cloudflare：

```text
攻击者 -> 源站 IP
```

所以 Cloudflare 只是多了一层入口，不代表源站自动变成“只能被 Cloudflare 访问”。

更合理的安全模型应该是：

```text
用户 -> Cloudflare -> 源站
             |
             | 允许
             v

其他公网 IP -> 源站
             |
             | 拒绝
             v
```

也就是说，源站要把 Cloudflare 当作唯一可信入口。  
否则 Cloudflare 只是“推荐入口”，不是“强制入口”。

这里有一个关键点：

> 边界不在 DNS，边界在防火墙和身份校验。

DNS 只能告诉访问者：

```text
example.com 应该访问 Cloudflare
```

但 DNS 不能阻止别人直接访问：

```text
1.2.3.4
```

真正能阻止直连的是：

```text
源站防火墙
云厂商安全组
Nginx / Apache 访问控制
Cloudflare Authenticated Origin Pulls
mTLS
Cloudflare Tunnel
```

一个比较完整的 Cloudflare 防护闭环应该是：

```text
1. DNS 走 Cloudflare
2. 源站 IP 不公开
3. 源站安全组只放行 Cloudflare IP
4. 源站拒绝非 Cloudflare 请求
5. 回源链路使用 HTTPS
6. 校验 Cloudflare 客户端证书
7. 管理端口不暴露公网
```

还要注意：Cloudflare IP 段也不是严格意义上的“身份”，它只是来源范围。

如果只做：

```text
只允许 Cloudflare IP 访问源站
```

这已经比源站裸奔强很多，但仍然不是最强。  
因为理论上，别人也可以把自己的域名接入 Cloudflare，再让 Cloudflare 去请求你的源站。

更严谨的做法，是再加一层“这个请求确实来自我的 Cloudflare 配置”的校验：

```text
Authenticated Origin Pulls
mTLS 客户端证书
自定义回源 Header + 源站校验
Cloudflare Tunnel
```

可以这样理解：

```text
只套 Cloudflare：
别人应该走正门，但后门还开着。

源站只放行 Cloudflare IP：
后门关了，但所有穿 Cloudflare 制服的人都能靠近门口。

Authenticated Origin Pulls / mTLS：
不只看来源范围，还要查身份证明。

Cloudflare Tunnel：
源站没有公网入口，只主动连接 Cloudflare。
```

因此，CDN 防护的核心不是隐藏，而是强制所有流量经过可信入口。

只要源站还有公网可达路径，攻击方就有机会绕过 CDN。  
只有当源站从网络层、应用层、回源身份层都只信任 Cloudflare 时，Cloudflare 才真正从“代理”变成“边界”。

## 补救和防护建议

如果源站 IP 已经暴露，仅仅把 DNS 切到 Cloudflare 不够。建议按下面顺序处理。

### 1. 更换源站 IP

如果旧源站 IP 已经被记录，最直接的补救方式是更换源站 IP。

换 IP 后，不要再让新 IP 通过任何 DNS 记录、日志、面板、证书、子域暴露出去。

### 2. 源站防火墙只允许 Cloudflare 回源

在源站服务器防火墙、安全组或 WAF 上限制：

```text
只允许 Cloudflare IP 段访问 80/443
拒绝其他公网 IP 直接访问 80/443
```

这样即使攻击方知道源站 IP，也无法直接访问 Web 服务。

### 3. 关闭不必要端口

检查公网开放端口，关闭不需要暴露的服务。

重点检查：

```text
22
80
443
3306
5432
6379
8080
8888
9000
9090
```

管理端口应尽量只允许固定办公 IP、VPN 或内网访问。

### 4. 清理所有 DNS 泄露

排查并清理：

```text
主域
www
api
admin
img
static
old
dev
test
mail
origin
backend
```

同时检查：

```text
A
AAAA
CNAME
MX
TXT
SPF
CAA
NS
```

不要只检查主域。

### 5. 避免源站直接返回站点内容

源站直接被 IP 访问时，不应返回真实网站内容。

建议：

```text
未通过 Cloudflare 的请求直接拒绝
默认站点返回 403 或空响应
不在默认站点暴露业务页面
不返回带业务域名的跳转
```

### 6. 校验 Cloudflare 回源身份

可以开启或配置：

```text
Authenticated Origin Pulls
mTLS
Cloudflare Origin Certificate
只信任 Cloudflare 代理来源
```

这样可以降低伪造回源请求的风险。

### 7. 使用 Cloudflare Tunnel

更稳的方式是使用 Cloudflare Tunnel。

Cloudflare Tunnel 可以让源站不直接暴露公网 IP，由源站主动连接 Cloudflare，再由 Cloudflare 转发请求。

这样攻击方即使扫描公网，也更难直接找到 Web 源站。

## 排查清单

可以按下面清单自查：

```text
[ ] 是否更换过已经暴露的源站 IP
[ ] 源站 80/443 是否只允许 Cloudflare IP 段访问
[ ] 是否存在未代理的 A / AAAA 记录
[ ] 是否存在泄露源站的 CNAME
[ ] MX / SPF 是否暴露服务器 IP
[ ] CT Logs 是否暴露敏感子域
[ ] 源站 443 是否返回包含真实域名的证书
[ ] 直接访问源站 IP 是否能看到网站内容
[ ] 源站是否暴露管理面板或数据库端口
[ ] Git 仓库、CI/CD 日志、配置文件是否出现源站 IP
[ ] 是否存在旧子域、测试子域、备份子域
[ ] IPv6 是否被单独暴露
[ ] 同服务器上的其他站点是否未套 Cloudflare
```

## 总结

源站 IP 暴露通常不是单点问题，而是历史 DNS、子域、证书、邮件、扫描平台、配置文件和源站响应共同造成的。

防护的关键不是“把域名套上 Cloudflare”这一件事，而是：

```text
换掉已暴露的源站 IP
限制源站只接受 Cloudflare 回源
清理所有 DNS 和子域泄露
关闭源站直连响应
收紧管理端口和旁路服务
必要时使用 Cloudflare Tunnel
```

只要源站 IP 仍然可以被公网直接访问，Cloudflare 就只能保护通过域名进入的流量，不能阻止攻击方绕过它直接打源站。
