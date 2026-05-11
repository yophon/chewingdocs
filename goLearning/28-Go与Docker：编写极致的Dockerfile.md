# Go 与 Docker：编写极致的 Dockerfile

> **导读**：Go 程序的最终产物是一个完全独立的静态二进制文件。这意味着它运行时完全不需要安装 Go 环境、Python 解释器或 JVM，非常适合容器化。

## 一、为什么 Go 适合 Docker？
传统 Java/Python 应用的镜像动辄几百兆甚至上 GB，而一个复杂的 Go 微服务镜像，可以**极致压缩到不到 10MB**。部署极快，扩容极快。

## 二、多阶段构建 (Multi-Stage Build)
这是编写 Go Dockerfile 的绝对标准做法。我们在第一阶段使用臃肿的 Go 镜像进行编译，在第二阶段把编译好的二进制文件直接扔到一个极小的基础镜像（如 Alpine 或 Scratch）中运行。

```dockerfile
# 第一阶段：编译 (builder)
FROM golang:1.21-alpine AS builder

# 设置国内代理和开启 Module
ENV GO111MODULE=on \
    GOPROXY=https://goproxy.cn,direct

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download

# 拷贝源代码并编译
COPY . .
# CGO_ENABLED=0 禁用 CGO，保证生成完全静态链接的二进制，这样才能在任意极简系统中运行
RUN CGO_ENABLED=0 GOOS=linux go build -o myapp ./cmd/api/main.go

# 第二阶段：运行环境
# Alpine 是只有 5MB 的轻量级 Linux
# 追求极致甚至可以使用 FROM scratch (一个完全空无一物的镜像)
FROM alpine:latest

# 更新证书，否则发 HTTPS 请求会报错
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app
# 只从 builder 阶段把编译好的那个二进制文件拷过来
COPY --from=builder /build/myapp .

EXPOSE 8080
# 启动命令
CMD ["./myapp"]
```

## 三、Docker 构建加速技巧
上面的 Dockerfile 里，我们把 `COPY go.mod go.sum ./` 放在拷贝全量代码之前，是为了**利用 Docker 的层缓存 (Layer Cache)**。只要模块依赖不变，Docker 就会直接复用 `go mod download` 这一层的缓存，极大地加快后续的反复构建速度。
