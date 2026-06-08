# PWA 与 Service Worker:离线支持、推送通知、缓存策略

PWA(Progressive Web App)= **网页能装到桌面 / 手机像 App,能离线跑,能推送通知**。

```
传统网页              PWA                       原生 App
浏览器里跑           可"安装"到设备           App Store 下载
打开慢,耗流量       离线可用,二次访问极快   完整离线
不能推通知           能推通知(Web Push)     能推通知
跨平台一份代码        跨平台一份代码           每平台一份
```

PWA 的核心是 **Service Worker**——一个**在浏览器后台跑的 JS**,能拦截所有请求,自定义缓存策略。

---

## 一、PWA 三件套

```
1. manifest.json     声明 App 元信息(名字、图标、主题色、启动 URL)
2. Service Worker    后台脚本,管离线缓存 / 推送 / 后台同步
3. HTTPS             所有 PWA 能力都要 HTTPS(localhost 例外)
```

### manifest.json

```json
{
  "name": "My App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-mask.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#3b82f6">
<link rel="apple-touch-icon" href="/icon-192.png">
```

满足以下条件,Chrome / Safari 会显示"添加到主屏幕":
- HTTPS
- manifest.json 完整(name / start_url / icons 192 + 512)
- 注册了 Service Worker 且响应 fetch 事件

---

## 二、Service Worker 概念

### 1. 它是什么

```
Service Worker = 后台 JS,跑在跟页面分开的线程
                能拦截所有 HTTP 请求 → 决定是返缓存还是发网络
                甚至页面关了仍可处理推送 / 后台同步
```

### 2. 跟普通 JS 的区别

```
能做                              不能做
拦截 fetch 请求                   碰 DOM(没 window / document)
读写 Cache Storage                同步 API(全异步)
读写 IndexedDB                    操作页面 LocalStorage
监听 push / sync 事件
postMessage 通信
```

### 3. 生命周期

```
注册 → 安装(install)→ 激活(activate)→ 运行
       ↓               ↓              ↓
       缓存核心资源    清旧缓存       拦截 fetch

更新逻辑:
  浏览器每次访问页面,后台对比 SW 文件
  字节有差异 → install 新 SW(此时旧 SW 还在跑)
  所有页面关闭 → 新 SW activate 取代
```

**这导致 SW 更新有"延迟"**:用户改了网站要刷一次才生效。要立即生效用 `skipWaiting()` + `clients.claim()`。

---

## 三、第一个 Service Worker

### 1. 注册

```ts
// 主线程(页面)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('registered', reg))
    .catch(err => console.error('failed', err));
}
```

### 2. SW 文件

```ts
// /sw.js
const CACHE = 'v1';
const ASSETS = ['/', '/index.html', '/main.js', '/style.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  // 清旧版本缓存
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r ?? fetch(e.request))
  );
});
```

这就是一个最简的"离线优先"SW:**所有资源先看缓存,没有再发网络**。

---

## 四、缓存策略(Cache Strategies)

### 1. Cache First(缓存优先)

```ts
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached ?? fetch(e.request))
  );
});
```

**适合**:静态资源(JS/CSS/图)。**优点**:快。**缺点**:更新要靠 SW 版本切换。

### 2. Network First(网络优先)

```ts
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open('v1').then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))   // 网络挂了用缓存
  );
});
```

**适合**:HTML / API 数据。**优点**:总能拿到最新。**缺点**:网络慢用户等。

### 3. Stale-While-Revalidate(SWR)

```ts
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(r => {
        caches.open('v1').then(c => c.put(e.request, r.clone()));
        return r;
      });
      return cached ?? fetched;
    })
  );
});
```

**先返缓存,后台默默更新**。下次访问就是新的。**最常用,平衡速度和新鲜度**。

### 4. Cache Only / Network Only

```ts
// Cache Only
return caches.match(e.request);

// Network Only
return fetch(e.request);
```

特殊场景:登录 API 必须 Network Only,字体可以 Cache Only。

### 5. 不同资源用不同策略

```ts
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API → Network First
  if (url.pathname.startsWith('/api/')) {
    return e.respondWith(networkFirst(e.request));
  }

  // 图片 → Cache First
  if (e.request.destination === 'image') {
    return e.respondWith(cacheFirst(e.request));
  }

  // HTML → Network First(永远新)
  if (e.request.destination === 'document') {
    return e.respondWith(networkFirst(e.request));
  }

  // JS / CSS(带 hash 的)→ Cache First(永久)
  return e.respondWith(cacheFirst(e.request));
});
```

---

## 五、Workbox:别自己写 SW

Google 开源的 SW 库,把上面手写的逻辑封装成"声明式":

```bash
pnpm add -D workbox-cli vite-plugin-pwa
```

### Vite + PWA(最简)

```ts
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'My App',
        short_name: 'App',
        theme_color: '#3b82f6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /\.(png|jpg|svg|webp|avif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
});
```

build 时自动生成 SW,主流框架(Vite / Next / Nuxt / SvelteKit)都有 PWA 插件。**不要手写 SW**,用 Workbox。

### Next.js(@ducanh2912/next-pwa)

```ts
// next.config.js
import withPWA from '@ducanh2912/next-pwa';

export default withPWA({
  dest: 'public',
})({
  /* next config */
});
```

---

## 六、Push 通知(Web Push)

### 1. 流程

```
1. 用户在 PWA 里允许通知
2. 浏览器生成订阅(包含 endpoint URL + 公钥)
3. 客户端把订阅信息发到你后端,存数据库
4. 后端要推时,用 VAPID 私钥签名,POST 到 endpoint URL
5. 浏览器收到推送 → 即使页面关了也唤醒 SW
6. SW 调用 self.registration.showNotification 显示通知
```

### 2. 客户端订阅

```ts
async function subscribe() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  // 发给后端
  await fetch('/api/subscribe', {
    method: 'POST',
    body: JSON.stringify(sub),
  });
}

// 触发(必须用户手势触发,如点按钮)
button.onclick = async () => {
  const perm = await Notification.requestPermission();
  if (perm === 'granted') subscribe();
};
```

### 3. SW 处理推送

```ts
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? { title: '通知', body: '' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const url = e.notification.data?.url ?? '/';
      const existing = clients.find(c => c.url === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
```

### 4. 后端推送

```ts
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:you@example.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

await webpush.sendNotification(subscription, JSON.stringify({
  title: '新消息',
  body: 'Alice 发了一条消息',
  url: '/chat/1',
}));
```

`webpush` 库自动处理 VAPID 签名 + 调用 endpoint。

### 5. 生成 VAPID 密钥

```bash
pnpm dlx web-push generate-vapid-keys
# 输出 publicKey / privateKey
```

公钥配前端,私钥配后端。

### 6. 注意

- **iOS 16.4+ 才支持 Web Push**(且必须装到主屏幕)
- 用户不允许 = 永久禁用,要引导用户去系统设置开
- 推送内容**别太频繁**,用户烦了直接禁

---

## 七、IndexedDB(离线存储数据)

`localStorage` 限制 5-10MB,只能存字符串。**复杂离线数据用 IndexedDB**。

```
IndexedDB:浏览器里的 NoSQL 数据库
- 几百 MB 容量
- 异步 API
- 支持索引、事务
- 可以存 Blob / File
```

原生 API 难用,**用 [Dexie](https://dexie.org)**:

```bash
pnpm add dexie
```

```ts
import Dexie from 'dexie';

const db = new Dexie('MyApp');
db.version(1).stores({
  posts: '++id, title, createdAt',
  drafts: '++id, content',
});

// 增
await db.posts.add({ title: 'Hello', createdAt: new Date() });

// 查
const recent = await db.posts.where('createdAt').above(yesterday).toArray();

// 改
await db.posts.update(1, { title: 'New title' });

// 删
await db.posts.delete(1);
```

---

## 八、Background Sync(后台同步)

用户在离线时操作,等网络恢复**自动重发请求**。

```ts
// 主线程
async function send(data) {
  try {
    await fetch('/api/post', { method: 'POST', body: JSON.stringify(data) });
  } catch {
    // 离线 → 入队
    const sw = await navigator.serviceWorker.ready;
    await saveToIndexedDB(data);
    await sw.sync.register('post-data');
  }
}

// SW
self.addEventListener('sync', (e) => {
  if (e.tag === 'post-data') {
    e.waitUntil(replayQueuedRequests());
  }
});
```

浏览器在网络恢复 + 设备闲时触发 `sync` 事件,**即使页面关了**。

**坑**:Safari 不支持 Background Sync。要兼容用 [Workbox 的 BackgroundSyncPlugin](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync) + 主线程兜底。

---

## 九、其他 PWA 能力(2024+)

```
File System Access API   读写本地文件夹(Chrome only)
Web Share API            调用系统分享面板
Badging API              在 App 图标上加红点
Web Bluetooth / USB      连蓝牙 / USB 设备(Chrome only)
WebAuthn                 指纹 / FaceID 登录
Wake Lock API            防止屏幕熄灭
Storage Access API       cookie 跨站
Window Controls Overlay   自定义标题栏
```

兼容性参差,**Safari 通常落后 1-2 年**。新功能上线先 Chrome,再看 Safari。

---

## 十、PWA 实战:离线 Notes

```
功能:
  写笔记
  支持完全离线
  网络恢复后自动同步
  可装到桌面 / 手机
```

### 架构

```
React + Vite + vite-plugin-pwa
Dexie(IndexedDB)存本地笔记
Background Sync 同步到服务端
```

### 核心逻辑

```ts
// 写笔记
async function createNote(content: string) {
  const id = await db.notes.add({ content, synced: false, createdAt: new Date() });
  trySync();
}

async function trySync() {
  if (!navigator.onLine) return;
  const unsynced = await db.notes.where('synced').equals(false).toArray();
  for (const n of unsynced) {
    try {
      await fetch('/api/notes', { method: 'POST', body: JSON.stringify(n) });
      await db.notes.update(n.id, { synced: true });
    } catch {}
  }
}

// 监听网络恢复
window.addEventListener('online', trySync);
```

UI 显示"未同步"标识,用户对状态可见。

---

## 十一、PWA 调试

### Chrome DevTools

```
Application 面板:
  Manifest        看 manifest.json 解析结果
  Service Workers 看 SW 状态、强制 update / 注销
  Storage         看 Cache / IndexedDB / LocalStorage
  Background Services  看 push / sync 触发记录
```

### Lighthouse 跑 PWA 审计

```
Chrome DevTools → Lighthouse → 选 PWA → Generate report
看 "Installable" 部分,会列缺什么
```

### Cache 不更新?

强制更新:
1. DevTools → Application → Service Workers → "Update on reload"
2. 改 SW 文件的 CACHE 版本号(`v1` → `v2`)
3. `self.skipWaiting()` 在 install 里加上

---

## 十二、常见 Trap

### Trap 1:SW 缓存了旧 HTML 死循环

用户打开网站 → SW 返旧 HTML → 旧 HTML 引用旧 JS hash → 找不到 → 白屏

修复:
- HTML **永远 Network First**(或 SW 不缓存 HTML,只缓存带 hash 的资源)
- 提供"清缓存"按钮:`navigator.serviceWorker.getRegistration().then(r => r?.unregister())`

### Trap 2:没注册 SW 但缓存了

SW 注册一次后**会一直在**,改了不注销代码也还在。开发期清理:DevTools → Application → Unregister。

### Trap 3:HTTPS 必需

PWA 所有能力(SW / Push / Notification)只在 HTTPS 工作。开发用 `localhost`(自动豁免)或 `mkcert` 自签证书。

### Trap 4:iOS 限制多

```
iOS 16+ 才支持 PWA "添加到主屏幕"
iOS 16.4+ 才支持 Push(且必须先添加到主屏幕)
不能后台 Sync
```

iOS 是 PWA 的最大短板。**全功能依赖 PWA 之前先评估目标用户的设备**。

### Trap 5:用户拒绝过通知,浏览器永久记住

不能再次弹窗问。**用按钮触发 + 教程引导**,别页面打开就问(很烦人,Chrome 自动屏蔽)。

### Trap 6:开发期改了 SW 没生效

```
修改 sw.js → 浏览器看到新版本 → 安装 → 等待激活
但旧版本还在跑(因为页面没全关)

强制激活:
  DevTools → Service Workers → skipWaiting
  或 SW 里写 self.skipWaiting()
```

---

## 十三、心智模型

```
PWA = 网页 + 三件套(manifest + SW + HTTPS)→ 类原生体验

Service Worker 是 PWA 的引擎:
  - 拦截所有请求 → 自定义缓存
  - 监听 push → 离线推送
  - 监听 sync → 后台重试

缓存策略选型:
  HTML / API     → Network First(总要新的)
  带 hash 资源    → Cache First(永久缓存)
  图 / 字体      → Stale While Revalidate(快 + 自动新)

存储:
  小数据 / 配置   → localStorage(同步,5MB)
  大数据 / 离线笔记 → IndexedDB(用 Dexie)
  缓存的 HTTP 响应 → Cache Storage(SW)

不要手写 SW,用 Workbox / Vite PWA / Next PWA 插件。
```

---

## 十四、推荐学习路径

1. 用 Vite + vite-plugin-pwa 给现有项目加 PWA
2. 跑 Lighthouse PWA 审计,过 90 分
3. 加离线 fallback 页面
4. 加 IndexedDB(Dexie)存本地数据
5. 选做:Web Push(需要后端 web-push 库)

PWA 适合**重度访问、离线场景多**的应用(笔记、邮件、地图)。**纯营销页 / 一次性访问**的不适合,加了反而拖慢首屏。

---

## 十五、参考资源

- web.dev/learn/pwa:https://web.dev/learn/pwa
- Workbox 文档:https://developer.chrome.com/docs/workbox
- vite-plugin-pwa:https://vite-pwa-org.netlify.app
- MDN Service Worker:https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

下一篇 35 讲浏览器渲染原理:回流、重绘、合成层和 GPU 加速。
