# OAuth2 / OIDC / SSO 深入

7 章 Spring Security 解决"我自己的系统怎么登录",这一章解决"**多个系统怎么共享登录、第三方系统怎么帮我管登录、企业 IDP 怎么接进来**"。

OAuth2 / OIDC / SSO 看着是三个词,其实是同一栈的不同层:**OAuth2 管授权,OIDC 在 OAuth2 上加了认证,SSO 是工程产物**。这一章把概念、流程、Keycloak 实操、企业 RBAC/ABAC 一次讲透。

---

## 一、为什么"自己写登录"撑不到企业级

```
单系统:用户 → 自己的登录页 → 自己 DB → 颁 token
   ↓ 业务长大
多系统:每个产品都自己登录?用户被迫记 5 套密码
   ↓
SSO:登录一次,各产品都认
   ↓ 接第三方
OAuth2:用户授权我访问他在另一个系统的资源(微信头像、Google 联系人)
   ↓ 加身份信息
OIDC:在 OAuth2 上,我还想知道"这个 token 代表谁"
   ↓ 企业接入
SAML / 企业 IDP:对接 ADFS / Okta / Azure AD,员工用统一账号
```

**核心认知**:

- **OAuth2 ≠ 登录**——它是"授权",回答"能不能让 A 代表 B 去访问 C 的某资源"
- **OIDC = OAuth2 + ID Token**——你想知道"用户是谁"必须用 OIDC,不是裸 OAuth2

> 经验法则:**只要见到"我们用 OAuth2 做登录"的描述,八成实现了 OIDC 但没意识到**。社交登录(微信/GitHub)是典型 OIDC 流程。

---

## 二、OAuth2 的四个角色

```
   [Resource Owner]     ← 用户(资源的主人)
        │
        │ 授权
        ▼
   [Authorization Server]  ← 授权服务器(发 token)
        │
        │ 验证后给 Access Token
        ▼
       [Client]   ← 第三方应用(想拿数据的)
        │
        │ 带 Access Token 访问
        ▼
   [Resource Server]   ← 资源服务器(数据所在)
```

**例子**:你授权"语雀"读你的"GitHub Issues"。
- Resource Owner:你
- Authorization Server:GitHub OAuth 服务
- Client:语雀
- Resource Server:GitHub API

授权完,语雀拿到 Access Token,直接调 `api.github.com/issues`。

---

## 三、四种授权类型(Grant Type)

| 类型 | 适用 | 是否还推荐 |
| --- | --- | --- |
| **Authorization Code** | Web 应用、有后端的 SPA | ✅ 必须用 |
| **Authorization Code + PKCE** | SPA / 移动端 / 公开客户端 | ✅ 现代标配 |
| **Client Credentials** | 服务到服务(M2M) | ✅ 后端互调 |
| **Resource Owner Password** | 拿用户名密码换 token | ❌ OAuth 2.1 已废 |
| **Implicit** | 早期 SPA(直接跳 token 到 URL) | ❌ OAuth 2.1 已废 |
| **Device Code** | 电视、IoT 等无键盘设备 | ✅ 特殊场景 |
| **Refresh Token** | 续期 access token | ✅ 配合上面用 |

> **OAuth 2.1**(2024+)正式把 Implicit 和 Password 拉黑——千万别在新系统用。

---

## 四、Authorization Code + PKCE(必须掌握)

这是现代 Web/SPA/移动端的标准流程:

```
1. SPA 生成 code_verifier(随机串) → 算 code_challenge = SHA256(code_verifier)
   
2. SPA 跳转到 IDP:
   GET /authorize?
       response_type=code
       &client_id=spa-app
       &redirect_uri=https://app.com/cb
       &code_challenge=xxx
       &code_challenge_method=S256
       &scope=openid profile
       &state=随机串(防 CSRF)
       
3. 用户登录 + 同意授权
   
4. IDP 回跳:https://app.com/cb?code=AUTH_CODE&state=xxx
   
5. SPA 用 code + code_verifier 换 token:
   POST /token
       grant_type=authorization_code
       code=AUTH_CODE
       code_verifier=原始随机串
       redirect_uri=...
       
6. IDP 验证 SHA256(code_verifier) == code_challenge → 颁 access_token + id_token + refresh_token
```

**为什么要 PKCE**:授权码可能在浏览器跳转过程中被截获(同一台机器上的恶意 App、网络中间人)。**有 PKCE,即便 code 被偷,没有 verifier 也换不出 token**。

> 经验法则:**所有"公开客户端"(SPA / 移动 App / 桌面 App)必须用 PKCE**。"机密客户端"(后端 Web 服务,有 client_secret)即便不要求,加上也没坏处。

---

## 五、Token 的三种格式与验证

OAuth2 标准没规定 access token 长什么样,实际上常见三种:

| 类型 | 格式 | 验证方式 |
| --- | --- | --- |
| **Opaque Token**(不透明) | 随机串 | 调 `/introspect` 端点问 IDP |
| **JWT** | 自包含,Base64 三段 | 本地用公钥验签,无需查 IDP |
| **PASETO** | JWT 替代品 | 本地验,更安全的算法选择 |

### JWT 长这样

```
eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSIsImV4cCI6MTcwMH0.SiGNature

│           │      │                                  │
│           │      │                                  └─ 签名(私钥签的)
│           │      └─ Payload(claims,base64,可读)
│           └─ Header(算法、kid)
```

JWT 验证 = **拿 IDP 公布的公钥(JWK)验签 + 检查 exp / iss / aud**。Spring Security 用 `@EnableResourceServer` 几行配置就能跑。

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://idp.example.com/realms/myrealm
          # Spring 自动从 issuer 拉 OIDC discovery 配置 + JWKS
```

```java
@RestController
public class Api {
    @GetMapping("/me")
    public Object me(@AuthenticationPrincipal Jwt jwt) {
        return Map.of(
            "sub",   jwt.getSubject(),
            "email", jwt.getClaimAsString("email"),
            "roles", jwt.getClaimAsStringList("roles")
        );
    }
}
```

> 经验法则:**短 access token + 长 refresh token**——access 5~30 分钟,refresh 几天到几周。短 access 的好处是吊销账号即时生效(等 token 自然过期),不用维护吊销名单。

---

## 六、OIDC = OAuth2 + ID Token

OIDC 在 OAuth2 上加了一个核心产物:**ID Token**(也是 JWT 格式)。

```
access_token  →  访问资源用(对 Resource Server)
id_token      →  告诉 Client "用户是谁"(对 Client 自己)
refresh_token →  续期用
```

```json
// id_token 解码后
{
  "iss": "https://idp.example.com",
  "sub": "user-uuid-123",
  "aud": "spa-app",
  "exp": 1700000000,
  "iat": 1699999700,
  "email": "user@example.com",
  "name": "张三",
  "picture": "https://..."
}
```

OIDC 提供 `/userinfo` 端点,带着 access token 调,拿到用户详细信息。

**关键端点(每个 OIDC IDP 都暴露)**:

```
.well-known/openid-configuration   → discovery,告诉你下面这些 endpoint 在哪
/authorize                          → 授权
/token                              → 换 token
/userinfo                           → 用户信息
/jwks                               → JWT 验签公钥
/logout                             → 单点登出
```

> 经验法则:**OIDC 集成永远先访问 `.well-known/openid-configuration`**——所有 endpoint、签名算法、支持的 scope 都自包含。Spring Security / Keycloak / Auth0 SDK 都靠这个自动发现。

---

## 七、SSO 三种实现路线

### 1. CAS(Central Authentication Service)

老牌 SSO 协议,2002 年的产物,流程简单:

```
用户访问 App1 → 跳 CAS Server → 登录 → 生成 ST → 跳回 App1
用户访问 App2 → 跳 CAS Server → 已登录,直接生成 ST → 跳回 App2
```

适合**老企业内部系统、闭源**——简单、稳定,但没"授权"语义。

### 2. SAML 2.0

XML based,企业 IDP(ADFS / Okta / Ping)主推。**重、但企业生态完善**。

```
[SP] 应用 → 跳 IDP → 登录 → IDP 签 SAMLResponse(XML 断言)→ 浏览器 POST 回 SP
```

> 经验法则:**做 toB SaaS 的话,SAML 几乎是必须**——大企业客户的 IT 一句话:"对接我们 ADFS",你没得选。

### 3. OIDC(现代主流)

JSON / JWT,流程 OAuth2 那套,**移动端/SPA/IoT 都能用,SAML 没这个能力**。

新项目首选 OIDC,有遗留 SAML 客户的话靠 Keycloak 这种"协议网关"做转换。

---

## 八、Keycloak 实战:开源 IDP 王者

Keycloak 是 RedHat 开源的 IDP,**OAuth2 / OIDC / SAML / 用户管理 / 角色 / 联邦登录** 全部内置,启动一个容器就能用。

```bash
docker run -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:26.0 \
  start-dev
```

打开 `http://localhost:8080`,几步配出一个 OIDC IDP:

```
1. 创建 Realm(租户/隔离单位)
2. 创建 Client(对应你的应用):
   - Client ID
   - 选 OpenID Connect
   - Valid Redirect URIs
   - 启用 Authorization Code + PKCE
3. 创建 User:测试账号
4. 创建 Role:admin / user / vip
5. Role Mapping:把用户加到 role
```

Spring Boot 接入(把第五节那个配置写上 issuer-uri 就完事)。**社交登录**:Realm → Identity Providers → 加 Google/GitHub → 用户在登录页就多了"Google 登录"按钮。

### 联邦(Federation)

企业内部已有 LDAP / AD?Keycloak 可以作为"前置网关":用户在 Keycloak 登录,Keycloak 去后端 LDAP 验。**业务系统只看到 Keycloak,不需要懂 LDAP**——这是把老系统接入现代 OIDC 体系的标准姿势。

---

## 九、RBAC vs ABAC vs ReBAC

| 模型 | 决策依据 | 典型 |
| --- | --- | --- |
| **RBAC** | 角色 | 用户是 admin,允许 |
| **ABAC** | 属性(用户/资源/环境) | 用户部门 == 资源部门,允许 |
| **ReBAC** | 关系图 | 用户是文档协作者,允许 |
| **PBAC** | 策略(代码/规则) | OPA / Cedar 写规则 |

### RBAC(最常见)

```
User ── 多对多 ── Role ── 多对多 ── Permission
```

```sql
SELECT 1 FROM user_role ur
JOIN role_permission rp ON rp.role_id = ur.role_id
WHERE ur.user_id = ? AND rp.permission_code = 'order:delete'
```

```java
@PreAuthorize("hasAuthority('ORDER_DELETE')")
public void delete(Long id) { ... }
```

### ABAC(灵活但复杂)

```
"销售只能看自己客户的订单"
"5 万以上订单需要主管审批"
"只能在工作时间访问"
```

这种"维度多"的规则用 RBAC 表达就是几百个角色,用 ABAC 就一条规则:

```text
# OPA Rego 规则
allow {
    input.user.dept == input.resource.dept
    input.action == "read"
}
allow {
    input.user.role == "manager"
    input.action == "approve"
    input.resource.amount < 100000
}
```

### ReBAC(Google Zanzibar 派)

文档协作场景:**"用户 X 是不是文档 Y 的查看者"** 这种"关系图"查询。Auth0 的 OpenFGA、Permify、Authzed 都是这一派。

> 经验法则:
>
> - 后台管理系统:**RBAC** 起手就够,加点资源维度
> - SaaS 多租户 + 行级隔离:**RBAC + 数据维度过滤**
> - 文档/项目/协作类:**ReBAC**(关系数据爆炸,RBAC 表达不了)
> - 复杂业务规则:**ABAC + OPA** 把策略外置

---

## 十、单点登出(Single Logout)的坑

SSO 容易,**SLO(单点登出)难**——A 系统点登出,B/C/D 都得登出。

OIDC 提供两种 SLO:

| 类型 | 工作方式 |
| --- | --- |
| **Front-Channel** | 浏览器跳转到每个 RP 的 logout endpoint(有用户感知) |
| **Back-Channel** | IDP 直接 server-to-server 通知每个 RP(无感) |

实际工程里,**多数项目只做"清自家 cookie",不去通知别的应用**——因为每个 App 都拿短期 access token,登出后过几分钟 token 自然过期就完事。

> 经验法则:**别一上来就做完整 SLO**——成本高、坑多。改用"短 token + 主动吊销列表(Redis)"通常更划算。

---

## 十一、Token 安全实战

### 1. 存哪儿

| 场景 | 推荐 |
| --- | --- |
| Web App(有后端) | **Cookie**(HttpOnly + Secure + SameSite=Lax) |
| SPA(纯前端) | **内存**(刷新页面要重登或用 refresh token);**绝对别 localStorage** — XSS 会偷 |
| 移动 App | iOS Keychain / Android Keystore |
| 桌面 App | OS 安全存储(macOS Keychain / Windows DPAPI) |

### 2. CSRF 与 token

- **Cookie 存 token + 表单提交** → 必有 CSRF 风险,要 SameSite=Strict 或 CSRF Token
- **Header 带 Bearer token** → 没 CSRF 问题(浏览器不会自动加 Authorization header)

### 3. 撤销

JWT 自包含,**默认撤不掉**(非要等过期)。三种破法:

- **短过期**:5~15 分钟,撤后等几分钟生效
- **吊销名单**:Redis 存撤销的 jti,每次验 token 查一次
- **改 jti 黑名单 + token 版本号**:用户改密码时升级版本,旧 token 全失效

---

## 十二、企业级常见架构

### "API 网关做认证 + 业务服务做授权"

```
                ┌─────────────┐
   外部 → │  API 网关    │ ── 验 JWT,解出 sub / roles,塞 header
                └──────┬──────┘
                       ▼
         ┌──────────────────────────┐
         │   业务服务(信任 header)   │ ← 不再验 JWT,直接读 X-User-Id
         └──────────────────────────┘
```

优点:**业务服务不用每个都接 OAuth**,网关统一管。
注意:业务服务的入口必须只接受网关来的流量(NetworkPolicy / mTLS)。

### "BFF + OIDC"(SPA 主推)

```
SPA(无 token) ── HTTP-only Cookie ──▶ BFF
                                        │ 服务端持有真 access_token
                                        ▼
                                   各资源服务
```

SPA 不持有 token,**XSS 偷不到**;BFF 自己保存,需要时调下游。这是 2024+ 的安全主流模式。

---

## 十三、常见踩坑

1. **用 Implicit / Password 流程**:OAuth 2.1 已废,生产严禁
2. **SPA 把 token 存 localStorage**:XSS 直接偷
3. **没用 PKCE**:授权码被劫持就完蛋
4. **不验 `aud`**:用 A 系统的 token 能访问 B 系统
5. **不验 `iss`**:接受任何 IDP 颁的 token
6. **JWT 用 HS256 + 共享密钥分发到各服务**:任一服务泄密所有人完蛋,用 RS256 公私钥
7. **access token 太长(几小时几天)**:撤销不了账号
8. **refresh token 不轮转(rotate)**:被偷的 refresh 永久有效
9. **OIDC 拿 `sub` 当主键**:跨 IDP 切换时 sub 变了,业务全乱;应该自己映射成内部 user_id
10. **角色硬编码在代码里**:每加角色发版,RBAC 应该数据驱动
11. **没区分 access_token / id_token 用途**:把 id_token 当 access 调资源 → 资源服务正确做法是拒绝
12. **Keycloak realm 划分错**:同一公司多产品共享一 realm 还是各自一 realm? 拆细了用户跨不了,合并了租户隔不开
13. **CSRF 在 Cookie 模式下没做**:漏防护
14. **logout 只清 cookie 不通知 IDP**:用户以为登出了,实际 IDP 端 session 还在
15. **企业 SAML 客户来了才发现没接**:SaaS 项目早做 SAML 适配,别等大客户卡你

---

## 十四、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ Authorization Code + PKCE 起手 | 公开客户端必须 |
| ✅ JWT 用 RS256/ES256 | 别用 HS256 共享密钥 |
| ✅ Spring Security `resourceserver.jwt.issuer-uri` | 自动发现 + JWKS |
| ✅ access 短 + refresh 长 + 轮转 | 平衡安全与体验 |
| ✅ Web 用 HttpOnly Cookie | SPA 用 BFF 模式或内存 |
| ✅ 验 iss / aud / exp 三件套 | 缺一就有漏洞 |
| ✅ 后台 RBAC + 业务 ABAC | 复杂规则外置到 OPA |
| ✅ Keycloak 起家,真到云用 Auth0 / Cognito | 自托管的运维成本要算 |
| ✅ SaaS 早接 SAML | 大客户必要求 |
| ✅ M2M 调用用 Client Credentials | 别用用户 token 调内网 |

---

## 小结

OAuth2 / OIDC 看着复杂,**核心就一句话**:**"用户授权第三方代表自己访问受保护资源"**。其他都是为这件事服务的工程细节。

记住三件事:

1. **OAuth2 ≠ 登录,OIDC = OAuth2 + 身份信息**——做"登录"必须用 OIDC
2. **公开客户端必须 PKCE,Implicit 和 Password 已废**
3. **Keycloak 是开源 IDP 的事实标准**——自托管首选,云上选 Auth0 / Cognito 省心

下一章我们把 Redis 单点缓存升级成"**多级缓存 + 缓存一致性**"——18~20 章只讲了 Redis,Caffeine / Cache-Aside / Write-Through / 一致性策略全是空白,这是性能的下一层。
