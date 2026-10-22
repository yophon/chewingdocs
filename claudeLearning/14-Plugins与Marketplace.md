# Plugins 与 Marketplace

前面四篇讲的 skills、hooks、MCP、子代理,单独使用时都放在 `.claude/` 或 `~/.claude/` 里。问题出在**复用和分发**:第二个仓库也要同样的一套配置、新同事入职要装一遍、某个 skill 改了要通知所有人更新。插件就是解决这件事的:**把一组 skills、子代理、hooks、MCP server 打包成一个可安装、可更新的单元**。

> 一句话先记住:**插件是打包层,不是新能力**。它里面装的还是 skills、hooks、MCP 这些东西;它解决的是"怎么让别人一条命令装上、你改了他们自动收到"。只给自己一个仓库用的配置,不需要做成插件。

---

## 一、插件里能装什么

一个插件是一个目录,通常带一个清单文件 `.claude-plugin/plugin.json`:

| 组件 | 目录 / 文件 | 说明 |
| --- | --- | --- |
| **Skills** | `skills/<名字>/SKILL.md` | 调用时是 `/插件名:skill名` |
| **命令** | `commands/*.md` | skills 的旧格式,新插件用 `skills/` |
| **子代理** | `agents/*.md` | 不支持 `hooks`、`mcpServers`、`permissionMode` 字段 |
| **Hooks** | `hooks/hooks.json` | 格式和 settings 里的 `hooks` 一样 |
| **MCP server** | `.mcp.json` | 插件启用期间自动连接 |
| **LSP server** | `.lsp.json` | 给 Claude 提供类型错误和跳转定义 |
| **可执行文件** | `bin/` | 自动加进 Bash 工具的 PATH |
| **默认设置** | 根目录的 `settings.json` | 只有 `agent` 和 `subagentStatusLine` 两个 key 生效 |
| **主题、output style** | 对应目录 | — |
| **Monitors** | `monitors/monitors.json` | 整个会话期间后台运行的 shell 命令,输出作为通知送达 Claude |
| **Channels** | 一个 MCP server + 清单里的 `channels` 条目 | 让外部系统往会话里推送消息(18 篇) |
| **Mod** | hooks 模块 | 用 JavaScript 改造 Claude Code 的界面和行为(15 篇) |

---

## 二、什么时候需要插件

| 情况 | 做法 |
| --- | --- |
| 只给自己用,一个项目 | 放 `.claude/`,不需要插件 |
| 只给自己用,所有项目 | 放 `~/.claude/`,不需要插件 |
| 一个仓库的团队共享 | 提交 `.claude/`,通常也不需要插件 |
| **多个仓库要同一套配置** | 做成插件 |
| **分发给别的团队或公开** | 做成插件,放进 marketplace |
| 想用别人做好的一整套 | 装插件 |

---

## 三、安装插件

### 3.1 从市场安装

```
/plugin                                              # 打开面板,Discover 标签页浏览
/plugin install commit-commands@claude-plugins-official
```

在会话里,`/plugin install` 不会立刻装,而是打开插件详情让你先看:**它会装哪些命令、子代理、skills、hooks、MCP / LSP server**;官方市场的插件还会显示**上下文成本**——每一轮固定占用多少 token、调用时再加多少。看完再选作用域。

### 3.2 三种作用域

| 作用域 | 生效范围 |
| --- | --- |
| **user** | 你在这台机器的所有项目 |
| **project** | 写进提交的 `.claude/settings.json`,团队所有人都启用(但每个人仍需在自己机器上安装) |
| **local** | 只有你,只在这个仓库 |

在终端、Desktop 本地会话、VS Code 扩展里按 user 作用域装的插件,三者共享。**云端会话不加载你本地 settings 里的插件**。

### 3.3 在 shell 里装(适合脚本)

```bash
claude plugin install formatter@your-org --scope project

# 还没添加市场时,一条命令里同时添加
claude plugin install deploy-helper --marketplace your-org/plugins
```

在 shell 里装的插件下次启动生效,已打开的会话里跑 `/reload-plugins`。

### 3.4 管理

`/plugin` 的 Installed 标签页:空格启用 / 停用,回车看详情、立即更新、卸载;**Not used recently** 分组列出最近没用过的插件。shell 里也有 `claude plugin enable / disable / uninstall`。

> 启用的插件**在每个会话里都生效**,不只是你用它的时候:它能被自动调用的 skills、子代理的描述每轮都占上下文;它的 MCP server 随会话运行;它的 hooks 在每个匹配事件上触发。**不用的插件停用掉**,不必卸载。

---

## 四、Marketplace:插件的目录

marketplace 是一个带 `.claude-plugin/marketplace.json` 的仓库或目录,**它是一份目录清单,不是托管商店**:列出有哪些插件、每个去哪里取。

### 4.1 Anthropic 的三个市场

| | 官方 | 社区 | 演示 |
| --- | --- | --- | --- |
| 仓库 | `anthropics/claude-plugins-official` | `anthropics/claude-plugins-community` | `anthropics/claude-code` |
| 市场名 | `claude-plugins-official` | `claude-community` | `claude-code-plugins` |

**官方市场在你第一次启动交互会话时自动添加**。官方和社区这两个名字只认 `github.com/anthropics/` 下的仓库,第三方仓库冒用这些名字会被拒绝。除此之外的所有市场——包括你同事和你公司发布的——都算第三方。

### 4.2 添加其他市场

```
/plugin marketplace add your-org/plugins           # GitHub 仓库
/plugin marketplace add your-org/plugins#v1.2.0    # 钉到某个 tag
/plugin marketplace add https://gitlab.example.com/group/marketplace.git
/plugin marketplace add ./local-marketplace        # 本地目录
/plugin marketplace add https://example.com/marketplace.json
```

非 GitHub 的地址**要带 `https://` 前缀**,否则会被当成 GitHub 的 `owner/repo` 简写。

### 4.3 更新

市场可以开启自动更新,Claude Code 会在后台更新从这个市场装的插件。注意:**自动更新意味着你审查过的文件可能在你不知情时改变**。对第三方市场的插件,权衡一下是否要开自动更新。

---

## 五、几个值得装的插件类型

- **代码智能(LSP)插件**:为 TypeScript、Python、Go、Rust、Swift、Ruby 等语言接入语言服务器,让 Claude 改完代码立刻看到类型错误、按符号跳转定义和引用,而不是读整个文件。插件本身不含语言服务器,要另外安装(比如 `rust-analyzer`)。**只在终端会话生效**,云端会话不启动语言服务器
- **安全类**:`security-guidance` 在 Claude 写代码时提示安全问题;`claude-security` 做多 agent 的漏洞扫描(22 篇)
- **开发辅助**:`skill-creator` 帮你写 skill 并做对照评测;`plugin-dev` 帮你搭建和检查插件

---

## 六、自己写一个插件

### 6.1 最小插件

```bash
mkdir -p my-first-plugin/.claude-plugin my-first-plugin/skills/hello
```

`my-first-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "my-first-plugin",
  "description": "A greeting plugin to learn the basics",
  "version": "1.0.0",
  "author": { "name": "Your Name" }
}
```

`my-first-plugin/skills/hello/SKILL.md`:

```markdown
---
name: hello
description: 友好地问候用户
disable-model-invocation: true
---
热情地问候用户,并问问今天能帮上什么忙。
```

校验并试用:

```bash
claude plugin validate ./my-first-plugin
claude --plugin-dir ./my-first-plugin
# 会话里:/my-first-plugin:hello
```

几条规则:

- **`name` 是必需的**,会成为所有 skill 和子代理的前缀,不能有空格
- **只有 `plugin.json` 放在 `.claude-plugin/` 里**,其他组件放在插件根目录下。组件放进 `.claude-plugin/` 不会加载
- `version` 可选。写了就会把用户钉在这个版本上,直到你改它

### 6.2 开发时不需要市场

| 方式 | 用法 |
| --- | --- |
| 单次加载目录或 zip | `claude --plugin-dir ./my-plugin --plugin-dir ./other.zip` |
| 加载一整个插件文件夹 | `--plugin-dir ./plugins`,每个带清单的子目录都作为一个插件 |
| 从 URL 加载 zip | `--plugin-url https://ci.example.com/build/plugin.zip` |

用 `--plugin-dir` 加载的目录是受保护路径,Claude 改它要经过你确认。

### 6.3 把现有的 `.claude/` 配置转成插件

已经在某个项目的 `.claude/` 里攒了一套 skills、子代理、hooks,想复用到其他仓库:建一个插件目录,把这些文件复制到对应的位置(`skills/`、`agents/`、`hooks/hooks.json`),加上清单即可,内容不用改写。

### 6.4 让用户填配置

清单里声明 `userConfig`,用户安装时会弹出对话框填写(比如 API 地址、团队名)。插件里用 `${CLAUDE_PLUGIN_ROOT}` 引用插件安装目录,用 `${CLAUDE_PLUGIN_DATA}` 引用跨版本更新仍保留的持久数据目录(适合放安装的依赖和缓存)。

---

## 七、发布

| 方式 | 适合 |
| --- | --- |
| **直接发目录或 zip** | 给几个人用,不需要发布流程 |
| **自己的 marketplace** | 团队或组织内部分发,用户加一次市场就能持续收到更新 |
| **提交到 Anthropic 的目录** | 公开给所有人,审核通过后在 claude.ai 和 Cowork 上也能用 |

自建 marketplace 的最小清单:

```json
{
  "name": "my-marketplace",
  "description": "Plugins for my team",
  "owner": { "name": "Your Name" },
  "plugins": [
    {
      "name": "my-first-plugin",
      "source": "./plugins/my-first-plugin",
      "description": "A greeting plugin to learn the basics"
    }
  ]
}
```

推到 git 仓库,同事 `/plugin marketplace add your-org/your-marketplace` 一次,之后就能按名字安装。插件之间还可以声明依赖和版本范围。

---

## 八、评测:插件真的有用吗

```bash
claude plugin eval init   # 交互式生成测试用例和评分器
claude plugin eval        # 运行
```

`claude plugin eval` 用一组真实的 prompt 跑你的插件,每个用例配一个或多个评分器(比如"是否调用了某个 skill"、"输出是否满足某个标准"),并且会**和不加载插件的基线对比**,让你看到插件到底带来了多少提升。可以接进 CI,在插件改动或新模型发布时防止退化。注意每次评测都是真实的模型调用,会消耗额度。

---

## 九、安全:装插件等于运行别人的代码

**插件可以以你的用户权限在你的机器上执行任意代码**:

| 组件 | 风险 |
| --- | --- |
| hooks、monitors | 以你的完整权限运行 shell 命令,**不受权限规则和沙箱约束** |
| mod | 在 Claude Code 里以你的权限运行 JavaScript |
| stdio MCP server、LSP server | 作为本地进程运行 |
| `bin/` 里的可执行文件 | 被加进 PATH |
| skills、子代理 | 作为指令进入上下文,影响 Claude 用已有工具做什么 |
| 自动更新 | 你审过的文件可能被替换 |

注意区别:**Claude 调用插件的 MCP 工具、运行 `bin/` 里的程序,这些是工具调用,受你的权限规则约束;但插件自己的 hooks、monitors、server 进程是直接运行的,不受约束**。

安装前:

1. 在 `/plugin` 详情里看清它会装哪些组件,尤其是 hooks 和 MCP server
2. 第三方插件去看源码,特别是 hooks 里的命令
3. 不确定的先用 local 作用域在一个仓库里试
4. 不再信任的插件立刻卸载

组织可以在 managed settings 里设置市场白名单、拦截某些市场、强制安装某些插件、禁止单次会话加载插件。

---

## 十、排查

- **插件装了但 skill 不见了**:看是不是停用了;跑 `/reload-plugins`
- **组件路径找不到**:组件是不是放进了 `.claude-plugin/` 里
- **在 marketplace 根目录用 `--plugin-dir`,`plugins/` 下的插件没加载**:直接指向插件目录,或指向插件文件夹
- **SKILL.md 的 frontmatter 有问题**:`claude plugin validate` 能找出解析失败的文件
- **想知道插件从哪加载、哪个 settings 文件启用了它**:查官方的插件加载参考

---

## 十一、踩坑

1. **只给一个仓库用的配置也做成插件**——徒增维护。放 `.claude/` 就够了
2. **组件放进了 `.claude-plugin/`**——只有清单放那里
3. **装了一堆插件从不清理**——它们的描述每轮都占上下文,MCP server 一直在跑
4. **不看详情直接装第三方插件**——hooks 以你的完整权限运行,不受沙箱约束
5. **第三方市场开了自动更新就不管了**——你审过的代码可能被悄悄换掉
6. **以为云端会话也有本地插件**——不加载,需要单独配置
7. **装了 LSP 插件却没装语言服务器**——插件只告诉 Claude Code 怎么启动它
8. **在插件的子代理里写 `hooks` / `mcpServers`**——出于安全原因被忽略
9. **自建市场的地址漏了 `https://`**——被当成 GitHub 简写
10. **插件改了不评测**——用 `claude plugin eval` 和基线对比,确认改动真的有提升

---

下一篇:`15-Mods改造Claude-Code的界面与行为.md`,讲 mod 是什么、能画哪些界面元素、怎么响应事件和拦截工具调用,以及怎么让 Claude 帮你写一个 mod。
