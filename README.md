# chewingdocs

按主题整理的技术学习文档库，覆盖 Web、AI、AI Infra、后端、系统设计、分布式、网络、操作系统、DevOps、数据工程、算法、程序员数学、Git、终端工程、Go、Rust、Flutter、Godot、解释器、安全、Claude Code、设计模式、云服务等方向。

在线阅读：<https://yophon.github.io/chewingdocs/>

## 内容结构

[series-table:start]: #

| 系列 | 篇数 | 入口 |
| --- | ---: | --- |
| AI 学习 | 41 | [aiLearning](aiLearning/01-AI学习路线总览.md) |
| AI Infra | 31 | [aiInfraLearning](aiInfraLearning/01-AI工程链总览.md) |
| 后端学习 | 66 | [backendLearning](backendLearning/01-后端学习路线总览.md) |
| 前端学习 | 51 | [webLearning](webLearning/01-四大框架总览.md) |
| 设计模式 | 51 | [designPatternLearning](designPatternLearning/01-设计模式总览.md) |
| 云服务与互联网基础常识 | 43 | [cloudBasicsLearning](cloudBasicsLearning/01-云服务与互联网基础常识总览.md) |
| 系统设计 | 31 | [systemDesign](systemDesign/01-系统设计总览.md) |
| 分布式系统 | 31 | [distributedLearning](distributedLearning/01-分布式系统总览.md) |
| 网络 | 41 | [networkLearning](networkLearning/01-网络学习路线总览.md) |
| 操作系统 | 29 | [osLearning](osLearning/01-OS总览与心智.md) |
| DevOps / SRE | 35 | [devopsLearning](devopsLearning/01-DevOps-SRE总览.md) |
| 数据工程 | 33 | [dataEngineering](dataEngineering/01-数据工程总览.md) |
| 算法 | 29 | [algorithmLearning](algorithmLearning/01-算法总览与工程师心智.md) |
| 程序员的数学 | 31 | [mathForCS](mathForCS/01-程序员的数学总览.md) |
| Git | 23 | [gitLearning](gitLearning/01-Git总览与心智.md) |
| 终端工程 | 31 | [terminalLearning](terminalLearning/01-终端工程总览.md) |
| Go | 31 | [goLearning](goLearning/01-Go学习路线总览.md) |
| Rust | 31 | [rustLearning](rustLearning/01-Rust学习路线总览.md) |
| Flutter | 43 | [flutterLearning](flutterLearning/01-状态管理总览.md) |
| Android 原生开发 | 23 | [androidNativeLearning](androidNativeLearning/01-现代Android的一棵树.md) |
| Android 平台基础 | 23 | [androidPlatformLearning](androidPlatformLearning/01-Android的世界观.md) |
| iOS 原生开发 | 28 | [iosNativeLearning](iosNativeLearning/01-原生iOS的一张地图.md) |
| Godot 游戏开发 | 31 | [godotLearning](godotLearning/01-Godot4.6与2D独立游戏心智总览.md) |
| 解释器 | 32 | [interpreterLearning](interpreterLearning/01-解释器总览.md) |
| 安全 | 31 | [securityLearning](securityLearning/01-安全总览.md) |
| Claude Code | 31 | [claudeLearning](claudeLearning/01-Claude-Code总览与心智.md) |
| 杂项 | 1 | [杂项](杂项/源站IP暴露路径与Cloudflare防护说明.md) |

[series-table:end]: #

更多规划见：[未来系列规划](未来系列规划.md)。

## 本地预览

```bash
npm ci
npm run docs:dev
```

然后打开终端输出的本地地址，默认路径是 <http://localhost:5173/chewingdocs/>。

## 构建与检查

```bash
npm run docs:check
```

`docs:check` 会执行 VitePress 严格构建。配置中不再忽略死链，链接或路由异常会让构建失败。

## 发布

推送到 `main` 后，GitHub Actions 会运行 VitePress 构建并发布 `docs/.vitepress/dist` 到 GitHub Pages。

## 目录说明

- 根目录下的 `*Learning/` 是各主题 Markdown 文档。
- `docs/.vitepress/` 是 VitePress 配置目录。
- `index.md`、`series.md` 和 `未来系列规划.md` 是站点顶层页面。
- 系列章节导航由 VitePress sidebar 自动生成，不再维护单独的 `目录.md` 页面。
- `docs/.vitepress/dist/` 是 VitePress 构建产物，不需要手动维护。
