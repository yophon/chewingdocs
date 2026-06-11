# chewingdocs

按主题整理的工程知识库。目标不是堆 API 手册，而是把工程师常用的知识拆成一组可连续阅读的系列：先建立心智模型，再进入工具、架构、排障、选型和真实工程取舍。

当前内容覆盖 Web、AI、AI Infra、后端、系统设计、分布式、网络、操作系统、DevOps / SRE、数据工程、音视频工程、算法、程序员数学、Git、终端工程、Go、Rust、Flutter、Android、iOS、Godot、解释器、安全、Claude Code、设计模式、云服务等方向。

在线阅读：<https://yophon.github.io/chewingdocs/>

## 内容结构

表格里的篇数只统计正式章节，不包含各系列的 `00-写作计划.md`。

[series-table:start]: #

| 系列 | 篇数 | 入口 |
| --- | ---: | --- |
| AI 学习 | 41 | [aiLearning](aiLearning/01-AI学习路线总览.md) |
| AI Infra | 30 | [aiInfraLearning](aiInfraLearning/01-AI工程链总览.md) |
| 后端学习 | 66 | [backendLearning](backendLearning/01-后端学习路线总览.md) |
| 前端学习 | 50 | [webLearning](webLearning/01-前端学习路线总览.md) |
| 设计模式 | 50 | [designPatternLearning](designPatternLearning/01-设计模式总览.md) |
| 云服务与互联网基础常识 | 42 | [cloudBasicsLearning](cloudBasicsLearning/01-云服务与互联网基础常识总览.md) |
| 系统设计 | 30 | [systemDesign](systemDesign/01-系统设计总览.md) |
| 分布式系统 | 30 | [distributedLearning](distributedLearning/01-分布式系统总览.md) |
| 网络 | 40 | [networkLearning](networkLearning/01-网络学习路线总览.md) |
| 操作系统 | 28 | [osLearning](osLearning/01-OS总览与心智.md) |
| DevOps / SRE | 34 | [devopsLearning](devopsLearning/01-DevOps-SRE总览.md) |
| 数据工程 | 32 | [dataEngineering](dataEngineering/01-数据工程总览.md) |
| 音视频工程 | 30 | [mediaTechLearning](mediaTechLearning/01-音视频工程总览与心智.md) |
| 算法 | 33 | [algorithmLearning](algorithmLearning/01-算法总览与工程师心智.md) |
| 程序员的数学 | 30 | [mathForCS](mathForCS/01-程序员的数学总览.md) |
| Git | 22 | [gitLearning](gitLearning/01-Git总览与心智.md) |
| 终端工程 | 30 | [terminalLearning](terminalLearning/01-终端工程总览.md) |
| Go | 30 | [goLearning](goLearning/01-Go学习路线总览.md) |
| Rust | 30 | [rustLearning](rustLearning/01-Rust学习路线总览.md) |
| 移动端通用知识 | 23 | [mobileCommonLearning](mobileCommonLearning/01-移动端通用知识总览.md) |
| Flutter | 43 | [flutterLearning](flutterLearning/01-状态管理总览.md) |
| Android 原生开发 | 22 | [androidNativeLearning](androidNativeLearning/01-现代Android的一棵树.md) |
| Android 平台基础 | 22 | [androidPlatformLearning](androidPlatformLearning/01-Android的世界观.md) |
| iOS 原生开发 | 27 | [iosNativeLearning](iosNativeLearning/01-原生iOS的一张地图.md) |
| Godot 游戏开发 | 30 | [godotLearning](godotLearning/01-Godot4.6与2D独立游戏心智总览.md) |
| 解释器 | 31 | [interpreterLearning](interpreterLearning/01-解释器总览.md) |
| 安全 | 30 | [securityLearning](securityLearning/01-安全总览.md) |
| Claude Code | 30 | [claudeLearning](claudeLearning/01-Claude-Code总览与心智.md) |
| 杂项 | 1 | [杂项](杂项/源站IP暴露路径与Cloudflare防护说明.md) |

[series-table:end]: #

更多规划见：[未来系列规划](未来系列规划.md)。快变内容维护见：[版本复查清单](版本复查清单.md)。
按角色阅读见：[学习路径](学习路径.md)。贯穿项目见：[项目实战](项目实战.md)。

## 推荐读法

- **刚开始补基础**：先看「云服务与互联网基础常识」和「网络」，再按方向进入后端、前端或移动端。
- **后端 / 架构方向**：后端学习 → 数据库与缓存 → 系统设计 → 分布式系统 → DevOps / SRE。
- **AI 工程方向**：AI 学习 → 数据工程 → AI Infra → Evaluation / Agent / 推理服务相关章节。
- **工程内功方向**：操作系统 → 网络 → 算法 → 程序员的数学 → Git → 终端工程。
- **代码设计方向**：设计模式 → DDD / 架构模式 → 重构、反模式和真实代码评审。

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
- `版本复查清单.md` 记录快变系列的复查周期、官方来源和更新口径。
- 系列章节导航由 VitePress sidebar 自动生成，不再维护单独的 `目录.md` 页面。
- `docs/.vitepress/dist/` 是 VitePress 构建产物，不需要手动维护。
