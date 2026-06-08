# Deep Link、Universal Links、App Links 与跳转归因

深链不是简单打开 App。深链是从外部世界进入 App 内部页面的路由协议。

一句话先记住:**深链 = 外部 URL 到 App 内部路由的映射,可信深链还要域名和签名校验。**

---

## 一、三类链接

| 类型 | 示例 | 特点 |
| --- | --- | --- |
| Custom Scheme | `myapp://users/1` | 简单,但容易被别的 App 抢 |
| Universal Links | `https://example.com/users/1` | iOS 可信深链 |
| App Links | `https://example.com/users/1` | Android 可信深链 |

现代项目优先用 HTTPS 深链。

---

## 二、为什么不用纯 scheme

Custom Scheme 问题:

- 不唯一,别的 App 也能注册同 scheme
- 浏览器兼容体验不稳定
- 安全校验弱
- 未安装 App 时 fallback 麻烦

适合:

- 内部调试
- 老项目兼容
- 第三方 SDK 回调

正式分享链接用 Universal Links / App Links。

---

## 三、iOS Universal Links

需要:

```text
App 开启 Associated Domains
entitlements 添加 applinks:example.com
网站托管 apple-app-site-association
文件里声明 Team ID + Bundle ID + paths
```

示意:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAMID.com.example.app"],
        "components": [{ "/": "/users/*" }]
      }
    ]
  }
}
```

文件必须通过 HTTPS 可访问。

---

## 四、Android App Links

需要:

```text
AndroidManifest intent-filter
assetlinks.json
包名
签名证书 SHA-256
域名 HTTPS 可访问
```

`assetlinks.json` 示例:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.app",
      "sha256_cert_fingerprints": ["AA:BB:..."]
    }
  }
]
```

签名指纹必须是 release 签名。

---

## 五、路由映射

不要在页面里散写解析逻辑。

集中定义:

```ts
type AppRoute =
  | { name: 'userDetail'; userId: string }
  | { name: 'orderDetail'; orderId: string }
  | { name: 'invite'; code: string };

export function parseDeepLink(url: string): AppRoute | null {
  const u = new URL(url);

  if (u.pathname.startsWith('/users/')) {
    return { name: 'userDetail', userId: u.pathname.split('/')[2] };
  }

  return null;
}
```

外部链接一定要校验参数。

---

## 六、未安装 fallback

HTTPS 链接天然有 fallback:

```text
已安装 App -> 打开 App
未安装 App -> 打开网页
```

网页里可以:

- 展示内容
- 引导下载
- 保留邀请参数
- 做归因统计

不要让未安装用户看到空白页。

---

## 七、归因

归因要记录:

```text
utm_source
utm_medium
campaign
invite_code
channel
click_id
```

安装前后衔接:

```text
用户点链接
  -> 落地页记录 click
  -> 用户安装 App
  -> 首次打开上报设备 / 归因信息
  -> 服务端匹配
```

移动端安装归因受隐私政策和平台限制影响,不要假设永远能精确归因到个人。

---

## 八、什么时候会出事故

1. iOS AASA 文件路径错误,Universal Links 不生效。
2. Android assetlinks 用了 debug 签名指纹。
3. 换 release keystore 后没更新 SHA-256。
4. 多环境共用域名,dev 包抢正式链接。
5. App 内路由还没初始化,深链参数丢了。
6. 未安装 fallback 页面没处理邀请参数。

---

## 九、检查清单

- [ ] 是否优先使用 HTTPS 深链
- [ ] iOS Associated Domains 是否配置
- [ ] AASA 文件是否 HTTPS 可访问
- [ ] Android assetlinks 是否使用 release SHA-256
- [ ] 多环境域名是否隔离
- [ ] 深链参数是否集中解析和校验
- [ ] 未安装 fallback 是否可用
- [ ] 归因参数是否保留
- [ ] 换签名后是否更新 App Links

---

## 十、心智模型

```text
Scheme 解决能打开
Universal Links / App Links 解决可信打开
域名文件证明这个 App 能处理这个 URL
签名指纹证明 Android 包身份
路由解析决定打开 App 后去哪
```

下一篇 15 讲本地存储、Keychain / Keystore 与敏感数据。
