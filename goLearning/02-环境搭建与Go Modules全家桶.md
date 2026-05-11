# 环境搭建与Go Modules全家桶

> **导读**：`go mod`：极简而强大的包管理

在开始编写 Go 代码之前，我们需要搭建一个现代化的 Go 开发环境。与其他语言（如 Python 的 pip/venv、Node.js 的 npm/node_modules）相比，Go 的包管理和环境配置在 Go 1.11 引入 `Go Modules` 之后变得极其简单和优雅。

本章将带你快速搞定开发环境，并深入理解 Go 的工程结构体系。

---

## 一、环境安装与配置

### 1.1 安装 Go 编译器

Go 的安装非常简单，你可以直接从 [Go 官方网站](https://go.dev/dl/) 下载对应的安装包，或者使用包管理工具安装：

**macOS (推荐使用 Homebrew):**
```bash
brew install go
```

**Linux (Ubuntu/Debian):**
```bash
wget https://golang.google.cn/dl/go1.21.x.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.x.linux-amd64.tar.gz
# 然后将 /usr/local/go/bin 添加到 ~/.bashrc 或 ~/.zshrc 的 PATH 中
```

安装完成后，在终端验证：
```bash
go version
# 输出示例: go version go1.21.0 darwin/amd64
```

### 1.2 配置核心环境变量

Go 语言有几个非常重要的环境变量（可以通过 `go env` 查看）：

- `GOROOT`: Go 的安装目录。一般不需要手动配置，编译器会自动找到。
- `GOPATH`: 早期 Go 的工作目录（存源码、编译产物等）。现在主要用于存放全局下载的第三方包（在 `GOPATH/pkg/mod` 下）。
- `GOPROXY`: **非常关键**。由于网络原因，国内拉取某些库（如 `golang.org/x/...`）会很慢或失败。必须配置代理。

**国内环境必配（七牛云或阿里云代理）**：
```bash
go env -w GO111MODULE=on
go env -w GOPROXY=https://goproxy.cn,direct
```

> `GO111MODULE=on` 强制开启 Go Modules 模式，彻底抛弃旧时代的 GOPATH 模式。

### 1.3 IDE 推荐与配置

开发 Go 最推荐的两款 IDE：

1. **GoLand (JetBrains)**: 开箱即用，体验最好，无需折腾插件，对重构和代码跳转支持极佳。
2. **VS Code**: 轻量级，需要安装官方的 `Go` 插件。安装后，按 `Ctrl+Shift+P` (或 `Cmd+Shift+P`)，输入 `Go: Install/Update Tools`，全选并安装所有辅助工具（如 `gopls`, `dlv` 等）。

---

## 二、Go Modules 全家桶

### 2.1 什么是 Go Modules？

在 Go 1.11 之前，Go 所有的项目代码和依赖都必须放在 `$GOPATH/src` 目录下，这导致多项目依赖不同版本的同一个包时会产生灾难（依赖地狱）。

`Go Modules` 解决了这个问题，它允许你在任何目录下创建项目，并在项目根目录生成一个 `go.mod` 文件来记录依赖版本。

### 2.2 初始化第一个项目

让我们在任意目录（不需要在 GOPATH 下）创建一个新项目：

```bash
mkdir hello-go
cd hello-go

# 初始化模块，模块名通常是你的代码仓库地址
# 如果不发布，叫什么都可以，例如 "hello" 或 "github.com/yourname/hello"
go mod init hello-go
```

执行后，目录下会多出一个 `go.mod` 文件：
```go
module hello-go

go 1.21
```

### 2.3 编写 Hello World

创建一个 `main.go` 文件：

```go
package main // 声明这属于 main 包，编译后会生成可执行文件

import "fmt" // 引入标准库 fmt 用于格式化输出

func main() {
    fmt.Println("Hello, Go Modules!")
}
```

运行代码：
```bash
go run main.go
```

### 2.4 引入第三方依赖

我们来试着引入一个第三方库，比如大名鼎鼎的日志库 `logrus`。

修改 `main.go`：
```go
package main

import (
    "github.com/sirupsen/logrus"
)

func main() {
    logrus.Info("Hello, this is a log from logrus!")
}
```

**此时代码会报错，因为我们还没下载这个库。** 我们只需要运行：

```bash
go mod tidy
```

**`go mod tidy` 是你以后每天都会用到的命令**。它的作用是：
1. 扫描代码中的 `import`。
2. 下载缺失的第三方包。
3. 移除 `go.mod` 中不需要的包依赖。

运行后，你会发现多了一个 `go.sum` 文件，它记录了所有依赖包及其传递依赖的哈希值，确保你的代码在任何机器上编译出的结果都是一致的（防篡改）。

---

## 三、常用 Go 命令速查手册

Go 的工具链非常纯粹且内置完备，你不需要像前端那样安装 webpack、jest、eslint 等一堆工具。

- `go run main.go`：编译并直接运行（开发时用）。
- `go build`：编译当前目录下的包，生成可执行二进制文件（部署时用）。
- `go test ./...`：运行当前项目下的所有单元测试。
- `go fmt ./...`：格式化代码（终结了缩进和换行的圣战，大家都必须长一样）。
- `go get package@version`：手动获取或更新某个特定版本的依赖包。

---

## 四、面试常问与深入思考

- **问题 1：`go.mod` 和 `go.sum` 需要提交到 Git 仓库吗？**
  - **需要。** `go.mod` 定义了项目的依赖，`go.sum` 确保了依赖包的校验和一致性，两者都必须提交，这样其他人在 clone 你的代码时才能得到完全一致的环境。

- **问题 2：`vendor` 目录是干什么的？现在还需要吗？**
  - `vendor` 目录用于把所有的依赖包源码直接拷贝到项目目录下（早期 GOPATH 时代的做法）。在 Go Modules 时代，大部分情况不需要 `vendor`。但如果你的内网 CI/CD 环境无法连接外网，你可以执行 `go mod vendor` 把依赖打包进项目并提交。

## 五、小结

1. 安装 Go 并配置 `GOPROXY=https://goproxy.cn,direct` 是国内开发的第一步。
2. `go mod init <module-name>` 用于初始化新项目。
3. `go mod tidy` 是解决所有依赖问题的万能钥匙，经常跑一跑。
4. Go 的工具链非常强大，自带构建、测试、格式化等所有工程所需能力。

---
*下一篇：`03-基础语法速通.md`，带你领略 Go 极简的变量、控制流语法。*
