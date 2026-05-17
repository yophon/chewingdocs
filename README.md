# chewingdocs

按主题整理的技术学习文档库，覆盖 Web、AI、AI Infra、后端、系统设计、分布式、网络、操作系统、DevOps、数据工程、算法、程序员数学、Git、终端工程、Go、Rust、Flutter、解释器、安全、Claude Code、设计模式、云服务等方向。

在线阅读：<https://yophon.github.io/chewingdocs/>

## 内容结构

| 系列 | 篇数 | 入口 |
| --- | ---: | --- |
| AI 学习 | 41 | [aiLearning](docs/aiLearning/01-AI学习路线总览.md) |
| AI Infra | 30 | [aiInfraLearning](docs/aiInfraLearning/01-AI工程链总览.md) |
| 后端学习 | 66 | [backendLearning](docs/backendLearning/01-后端学习路线总览.md) |
| 前端学习 | 50 | [webLearning](docs/webLearning/01-四大框架总览.md) |
| 设计模式 | 50 | [designPatternLearning](docs/designPatternLearning/目录.md) |
| 云服务与互联网基础常识 | 42 | [cloudBasicsLearning](docs/cloudBasicsLearning/01-云服务与互联网基础常识总览.md) |
| 系统设计 | 30 | [systemDesign](docs/systemDesign/01-系统设计总览.md) |
| 分布式系统 | 30 | [distributedLearning](docs/distributedLearning/01-分布式系统总览.md) |
| 网络 | 40 | [networkLearning](docs/networkLearning/01-网络学习路线总览.md) |
| 操作系统 | 28 | [osLearning](docs/osLearning/01-OS总览与心智.md) |
| DevOps / SRE | 34 | [devopsLearning](docs/devopsLearning/01-DevOps-SRE总览.md) |
| 数据工程 | 32 | [dataEngineering](docs/dataEngineering/01-数据工程总览.md) |
| 算法 | 28 | [algorithmLearning](docs/algorithmLearning/01-算法总览与工程师心智.md) |
| 程序员的数学 | 30 | [mathForCS](docs/mathForCS/01-程序员的数学总览.md) |
| Git | 22 | [gitLearning](docs/gitLearning/01-Git总览与心智.md) |
| 终端工程 | 30 | [terminalLearning](docs/terminalLearning/01-终端工程总览.md) |
| Go | 30 | [goLearning](docs/goLearning/01-Go学习路线总览.md) |
| Rust | 30 | [rustLearning](docs/rustLearning/01-Rust学习路线总览.md) |
| Flutter | 43 | [flutterLearning](docs/flutterLearning/01-状态管理总览.md) |
| 解释器 | 30 | [interpreterLearning](docs/interpreterLearning/01-解释器总览.md) |
| 安全 | 30 | [securityLearning](docs/securityLearning/01-安全总览.md) |
| Claude Code | 30 | [claudeLearning](docs/claudeLearning/01-Claude-Code总览与心智.md) |

更多规划见：[未来系列规划](docs/未来系列规划.md)。

## 本地预览

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

然后打开 <http://127.0.0.1:8000/>。

## 构建与发布

本地严格构建：

```bash
mkdocs build --strict
```

发布到 GitHub Pages：

```bash
mkdocs gh-deploy --force --clean
```

仓库也配置了 GitHub Actions，推送到 `main` 后会自动部署文档站点。

## 目录说明

- 根目录下的 `*Learning/` 是各主题原始 Markdown 文档。
- `docs/` 是 MkDocs 的站点源目录，其中多数主题目录是指向根目录系列的软链。
- `mkdocs.yml` 是站点配置。
- `site/` 是本地构建产物，不需要提交。
