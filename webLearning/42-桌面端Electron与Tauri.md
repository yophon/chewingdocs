# 桌面端:Electron 与 Tauri

用 Web 技术写桌面应用 = **HTML/CSS/JS 写界面 + 一个壳子让它能在 Windows / macOS / Linux 跑**。

```
2013 Electron(GitHub Atom 编辑器拆出来)
  → VS Code / Slack / Discord / Notion / Figma Desktop / 1Password / WhatsApp
  → 几乎所有"看起来像原生但很像网页"的桌面 App

2022 Tauri(Rust 写的更轻量替代)
  → 体积小 10x,内存少 50%,正在快速崛起
```

---

## 一、为什么 Web 技术做桌面

```
优点:
  - 复用 Web 团队 / 代码 / UI 库
  - 跨平台一份代码(macOS / Win / Linux)
  - 迭代快(Web 工具链)
  - UI 灵活(随便改 CSS)

缺点:
  - 体积大(Electron 100MB+ 起,捆绑 Chromium)
  - 内存高(每个窗口一个 Chromium 实例)
  - 启动慢
  - 需要每个平台单独签名 / 公证
  - "不够原生"(动效 / 触觉反馈 / 系统集成不如 Swift / Kotlin)
```

**适合**:
- 内部工具 / 中等复杂度的 SaaS 桌面端
- 想要"跨平台一份代码 + 像 Web 一样迭代快"
- 团队都是 Web 工程师

**不适合**:
- 重度图形 / 游戏(用 Unity / Unreal)
- 要求小体积 / 低内存(用 Tauri 或原生)
- 系统级工具(VPN / 防病毒,要原生)

---

## 二、Electron:成熟方案

### 1. 架构

```
Main Process(主进程,Node.js)
  ├─ 创建窗口
  ├─ 系统 API(文件 / 通知 / 菜单)
  └─ 应用生命周期

  ↕ IPC(进程通信)

Renderer Process(渲染进程,Chromium)
  ├─ 跑你的 HTML / JS(就是网页)
  ├─ 默认沙箱,不能直接 Node
  └─ 通过 preload 脚本暴露的 API 跟主进程通信
```

每个窗口 = 一个 renderer 进程(独立 Chromium)。

### 2. 第一个 Electron App

```bash
pnpm create electron-vite my-app
cd my-app
pnpm install
pnpm dev
```

或手动:

```bash
pnpm add -D electron
```

```ts
// main.ts(主进程)
import { app, BrowserWindow } from 'electron';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL('http://localhost:5173');     // 开发期 Vite
  // win.loadFile('dist/index.html');         // 生产期
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

```ts
// preload.ts(桥接层,运行在 renderer 但能访问 Node)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  saveFile: (data: string) => ipcRenderer.invoke('save-file', data),
  onMenu: (cb: (action: string) => void) => ipcRenderer.on('menu', (_, a) => cb(a)),
});
```

```ts
// renderer(你的 React/Vue 代码)
window.api.saveFile('hello');
window.api.onMenu((action) => console.log(action));
```

```ts
// main 处理 IPC
import { ipcMain, dialog } from 'electron';

ipcMain.handle('save-file', async (_, data) => {
  const r = await dialog.showSaveDialog({ defaultPath: 'untitled.txt' });
  if (!r.canceled) await fs.writeFile(r.filePath!, data);
});
```

### 3. 安全模型(2024+ 默认)

```
contextIsolation: true        renderer 不能直接拿 Node 全局
nodeIntegration: false        renderer 没 require / process
sandbox: true                  renderer 在沙箱(更严)
preload                      唯一桥接,显式暴露 API
```

**永远不要 `nodeIntegration: true`**,等于把 Node 暴露给所有打开的网页代码,XSS 直接拿到系统权限。

### 4. 系统 API 实战

```ts
// 文件系统
import { dialog, shell } from 'electron';

const r = await dialog.showOpenDialog({ properties: ['openFile'] });
shell.openPath('/path');
shell.openExternal('https://example.com');

// 通知
import { Notification } from 'electron';
new Notification({ title: 'Hi', body: 'message' }).show();

// 全局快捷键
import { globalShortcut } from 'electron';
globalShortcut.register('CommandOrControl+Shift+I', () => { ... });

// 系统托盘
import { Tray, Menu } from 'electron';
const tray = new Tray('icon.png');
tray.setContextMenu(Menu.buildFromTemplate([
  { label: '退出', click: () => app.quit() },
]));

// 自定义协议
app.setAsDefaultProtocolClient('myapp');    // myapp:// 链接打开你的应用

// 自动启动
app.setLoginItemSettings({ openAtLogin: true });
```

### 5. 菜单

```ts
import { Menu } from 'electron';

const menu = Menu.buildFromTemplate([
  {
    label: 'File',
    submenu: [
      { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => ... },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ],
  },
  { label: 'Edit', submenu: [{ role: 'copy' }, { role: 'paste' }] },
]);
Menu.setApplicationMenu(menu);
```

### 6. 打包

```bash
pnpm add -D electron-builder
```

```json
// package.json
{
  "build": {
    "appId": "com.example.myapp",
    "mac": { "category": "public.app-category.productivity" },
    "win": { "target": "nsis" },
    "linux": { "target": "AppImage" }
  },
  "scripts": {
    "build": "vite build && electron-builder"
  }
}
```

```bash
pnpm build       # 当前平台
pnpm electron-builder --mac --win --linux    # 全平台(需要不同 OS 或 CI)
```

输出:`.dmg` / `.exe` / `.AppImage` 等。

### 7. 自动更新

```ts
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();
autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});
```

需要把更新文件放 GitHub Releases / S3 / 自服务器,electron-builder 自动生成 manifest。

### 8. 签名 / 公证

发布到正式渠道:
- **macOS**:必须 Apple Developer 证书签名 + Notarize(送给苹果审核病毒)。Apple Silicon 还要 ARM64 二进制。
- **Windows**:EV 代码签名证书(防 SmartScreen 警告),几百美元一年
- **Linux**:无强制签名

不签名用户会看到大警告。

---

## 三、Tauri:Rust 写的轻量替代

### 1. 心路

```
Electron:把整个 Chromium 打包进去 → 100MB+ 安装包
Tauri:用系统自带 WebView(macOS WKWebView / Win Edge / Linux WebKitGTK)
       + Rust 后端
       → 安装包 5-10MB,内存少一半
```

### 2. 第一个 Tauri App

```bash
# 装 Rust 和系统依赖(参考官方文档)

pnpm create tauri-app
# 选 frontend(React / Vue / Svelte / vanilla)
cd my-app
pnpm install
pnpm tauri dev
```

```
src/                你的前端(React / Vue / ...)
src-tauri/          Rust 后端
  src/main.rs        入口
  tauri.conf.json    配置
  Cargo.toml         依赖
```

### 3. Rust 写"命令"暴露给前端

```rust
// src-tauri/src/main.rs
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, read_file])
        .run(tauri::generate_context!())
        .expect("failed to run");
}
```

```ts
// 前端调用
import { invoke } from '@tauri-apps/api/tauri';

const msg = await invoke<string>('greet', { name: 'Alice' });
const content = await invoke<string>('read_file', { path: '/x.txt' });
```

### 4. 内置 API(不用写 Rust)

```ts
import { open, save } from '@tauri-apps/api/dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/api/fs';
import { sendNotification } from '@tauri-apps/api/notification';
import { register } from '@tauri-apps/api/globalShortcut';
import { open as openShell } from '@tauri-apps/api/shell';

const path = await open();
await writeTextFile(path, 'hello');
sendNotification({ title: 'Hi', body: '...' });
```

### 5. 安全模型

`tauri.conf.json` 严格白名单:

```json
{
  "tauri": {
    "allowlist": {
      "fs": { "readFile": true, "scope": ["$HOME/docs/*"] },
      "dialog": { "open": true, "save": true },
      "notification": { "all": true },
      "shell": { "open": true }
    }
  }
}
```

**默认所有 API 关闭**,逐个开启。比 Electron 默认安全得多。

### 6. 打包

```bash
pnpm tauri build
```

产出:`.dmg` / `.msi` / `.deb` / `.AppImage`。**比 Electron 小 10 倍**(我自己测过 5MB vs 80MB)。

签名 / 公证流程跟 Electron 类似(macOS 证书 / Windows EV 证书)。

### 7. Tauri vs Electron 对比

| 维度 | Electron | Tauri |
| --- | --- | --- |
| 安装包大小 | 80~150MB | 5~15MB |
| 内存占用 | 200~500MB | 60~150MB |
| 启动速度 | 慢(几秒) | 快(< 1s) |
| 后端语言 | Node.js | Rust |
| WebView | 自带 Chromium | 系统 WebView |
| 跨平台一致性 | ⭐⭐⭐⭐⭐(都 Chromium) | ⭐⭐⭐(不同 WebView 略差异) |
| 生态 / 社区 | 极大 | 增长中 |
| 学习成本 | 低(JS/Node) | 中(要学一点 Rust) |
| 安全默认值 | 历史包袱 | 默认严 |
| 适合 | 复杂大型 App | 新项目 / 轻量 / 性能敏感 |

### 8. WebView 不一致问题

```
macOS Safari 18 WebKit
Windows Edge Chromium(2020+ 默认装)
Linux WebKitGTK(版本各异)

→ 跨 OS 个别 CSS / API 行为不一致
```

要求严格一致 → Electron(都是 Chromium)
能容忍小差异 → Tauri 体积优势压倒

---

## 四、其他方案

### Neutralino.js

更轻量,**几 MB**。前端类似 Tauri,但后端用 C++。社区小。

### NW.js

Electron 之前的方案,基本被 Electron 取代。现在很少用。

### Proton Native / NodeGUI

不是 WebView,是用 JS 调原生控件。**性能好但 UI 受限**(不像 Web 那样自由)。

### Wails(Go)

Tauri 的 Go 版本。Go 团队适合。

### Capacitor(Ionic)

主要做移动端,但也能做桌面。下一篇 43 讲。

---

## 五、桌面应用必学的概念

### 1. 多窗口

```ts
// Electron
new BrowserWindow({ width: 800, height: 600, parent: mainWindow });

// Tauri
import { WebviewWindow } from '@tauri-apps/api/window';
new WebviewWindow('settings', { url: 'settings.html' });
```

设置窗口、关于窗口、子窗口。

### 2. 持久化

```
LocalStorage     最简,几 MB
IndexedDB        大数据(41 篇)
SQLite           Tauri 推荐:tauri-plugin-sql
                 Electron:better-sqlite3
文件             直接写到 app data 目录
electron-store   Electron 的 JSON 存储库
```

存储位置(各 OS 标准目录):
- macOS:`~/Library/Application Support/<appName>`
- Windows:`%APPDATA%/<appName>`
- Linux:`~/.config/<appName>`

```ts
// Electron
import { app } from 'electron';
const userData = app.getPath('userData');

// Tauri
import { appDataDir } from '@tauri-apps/api/path';
const dir = await appDataDir();
```

### 3. 文件关联 / 协议

让你的 App 打开特定后缀文件 / `myapp://` 链接:

```json
// Electron-builder
"fileAssociations": [
  { "ext": "myproject", "name": "MyApp Project", "icon": "icon.icns" }
]
```

### 4. 系统集成

```
托盘(menubar / system tray)
菜单(应用菜单 / 上下文菜单)
全局快捷键
通知(原生)
开机自启
拖拽文件进 App
打印
剪贴板
```

Electron / Tauri 都有 API。

### 5. 离线 / 网络

桌面 App 通常**离线优先**:
- 数据本地存
- 同步到云(可选)
- 网络请求要处理离线状态

---

## 六、性能优化

### 1. 减少 Webview 数量

每个窗口 = 一个 WebView 实例,内存大涨。**能用一个窗口就别开多个**。

### 2. 主进程别阻塞

主进程是单线程,**重活会卡所有窗口**。重活扔 worker_threads 或 Tauri 的 Rust 异步函数。

### 3. 包体积

- 别全量打包 node_modules(electron-builder 默认会清理)
- 资源压缩(图片 WebP / SVG)
- 依赖审计:`pnpm dlx electron-bundler-analyzer`

### 4. 启动速度

- 主窗口先显示空壳,内容懒加载
- preload 脚本越小越好(主进程启动等它)
- Splash screen(应用启动画面)

### 5. 内存

- 关闭不用的窗口
- IndexedDB / SQLite 替代内存数组
- DevTools 看 renderer 进程的 heap(跟普通 Web 一样)

---

## 七、跟 Web 的差异(易踩坑)

### 1. 没有 CORS 限制

App 跑在 `file://` 或自定义协议下,**fetch 任何地址都行**。

### 2. 没有"页面刷新"概念

刷新会丢内存状态。**重要数据要持久化**。

### 3. 路由用 hash 或 memory router

Electron 加载 `file://` 协议,history mode 不工作。
- React Router:用 `<HashRouter>` 或 `<MemoryRouter>`
- Vue Router:`createWebHashHistory()`

### 4. 调试

```
DevTools 打开:Cmd+Opt+I / Ctrl+Shift+I
主进程调试:--inspect 启动 Electron + Chrome DevTools 连
```

### 5. 多平台差异

```
macOS    : Cmd 是主修饰键,菜单永远在顶栏,关窗口 ≠ 退出
Windows  : Ctrl 是主修饰键,菜单在窗口内,关最后一个窗口 = 退出
Linux    : 各发行版不一样,小心 fonts / 系统主题
```

测试要在三个平台都跑。

---

## 八、安全 checklist

- [ ] `contextIsolation: true`
- [ ] `nodeIntegration: false`
- [ ] `sandbox: true`(尽量)
- [ ] preload 显式暴露,**永远不要 `expose全部 ipcRenderer`**
- [ ] CSP 头限制资源源
- [ ] 不加载远程 URL 进 BrowserWindow(用 fetch 取数据,内容渲染本地)
- [ ] 验证所有 IPC 输入(就当不可信)
- [ ] 自动更新走 HTTPS + 签名
- [ ] 依赖定期 audit
- [ ] 不用 `webview` tag(已弃)
- [ ] Tauri 的 allowlist 只开真用的

Electron 有过几次大漏洞,**严格 follow 官方 security checklist**:https://www.electronjs.org/docs/latest/tutorial/security

---

## 九、发布

### 渠道

```
自己网站下载             小项目,简单,但用户要绕过系统警告
Mac App Store           需要 sandbox,功能受限
Microsoft Store         (可选)
Snap / Flatpak / AUR    Linux
Homebrew Cask           macOS 命令行用户喜欢
GitHub Releases         开源 + 自动更新源
```

### CI/CD

```yaml
# 跨平台 build,需要 macOS / Windows / Linux runner
matrix:
  os: [macos-latest, windows-latest, ubuntu-latest]
runs-on: ${{ matrix.os }}
```

GitHub Actions / CircleCI 都支持。macOS 的签名要把证书 base64 后存 secret,build 时解码。

---

## 十、心智模型

```
桌面 = 网页 + 一个壳子(壳里有 Node 或 Rust 后端)

Electron(Chrome + Node):
  生态最大,稳,但重(100MB+)
  适合:VSCode / Slack / Discord 这种"重量级 SaaS 桌面端"

Tauri(系统 WebView + Rust):
  10x 小,内存少一半,默认安全
  适合:新项目 / 轻量工具 / 性能敏感

通用三段:
  Main 进程   做系统 API / 窗口管理
  IPC         主进程 ↔ 渲染进程通信(必经 preload)
  Renderer    跑你的 React/Vue,就是网页

关键:
  - 持久化:SQLite / 文件,而不是内存
  - 路由:HashRouter / MemoryRouter
  - 安全:contextIsolation + 显式 expose
  - 多窗口少用,内存大
  - 签名 / 公证不能省(否则用户警告)
```

---

## 十一、推荐学习路径

1. **决定 Electron 还是 Tauri**:
   - Web 团队 + 不在乎包大小 → Electron
   - 想要轻量 / 学一点 Rust → Tauri
2. **跑通 hello world**(2 小时):
   - Electron:`pnpm create electron-vite`
   - Tauri:`pnpm create tauri-app`
3. **写一个真实 toy 项目**:Markdown 编辑器 / Todo / 截图工具
4. **打包 + 签名**到三个平台
5. 加自动更新 + 系统集成

---

## 十二、参考资源

- Electron 官方:https://www.electronjs.org
- Electron 安全 checklist:https://www.electronjs.org/docs/latest/tutorial/security
- electron-vite:https://electron-vite.org
- electron-builder:https://www.electron.build
- Tauri 官方:https://tauri.app
- Tauri 实战:https://tauri.app/v1/guides/
- Awesome Electron:https://github.com/sindresorhus/awesome-electron
- Awesome Tauri:https://github.com/tauri-apps/awesome-tauri

下一篇 43 讲跨端:React Native 与 Capacitor。
