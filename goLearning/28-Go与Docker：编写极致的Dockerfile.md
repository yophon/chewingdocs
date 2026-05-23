# Go 与 Docker：编写极致的 Dockerfile

> **一句话导读**：Go 天然适合容器化，但真正好用的镜像不只是“小”，还要构建快、可复现、安全、可观测、适配生产运行环境。

## 一、为什么 Go 特别适合 Docker

Go 编译后通常得到一个独立二进制文件，不需要在运行镜像里安装 Go SDK。相比解释型语言或 JVM 应用，Go 镜像可以做到：

- 运行时依赖少，镜像体积小。
- 启动速度快，适合弹性扩缩容。
- 容器内进程模型简单，一个二进制就是主进程。
- 跨平台编译方便，CI 里容易产出 linux/amd64、linux/arm64 镜像。

但“能跑起来”的 Dockerfile 和“适合生产”的 Dockerfile 差距很大。生产镜像要同时考虑构建缓存、证书、时区、非 root 用户、信号处理、健康检查、漏洞扫描和调试便利性。

## 二、基础心智：构建环境和运行环境分离

Go Dockerfile 的标准做法是多阶段构建：

```text
builder stage
  |
  | go mod download
  | go build
  v
runtime stage
  |
  | 只复制二进制、证书、必要配置
  v
small production image
```

这样可以把 Go 编译器、模块缓存、源码等全部留在 builder 阶段，最终运行镜像只包含运行所需文件。

最小镜像不是唯一目标。`scratch` 极小，但没有 shell、CA 证书、时区数据、用户信息，排错成本高；`distroless` 比 `scratch` 稍完整，安全性和生产可用性更平衡；`alpine` 有包管理器和 shell，但 musl libc、证书、时区等细节要处理好。

## 三、推荐 Dockerfile：缓存友好、安全默认值

假设项目入口是 `cmd/api/main.go`：

```dockerfile
# syntax=docker/dockerfile:1.7

FROM golang:1.22-alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates tzdata git

ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOFLAGS="-mod=readonly"

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build \
      -trimpath \
      -ldflags="-s -w -buildid=" \
      -o /out/api \
      ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

WORKDIR /app

COPY --from=builder /out/api /app/api

EXPOSE 8080
USER nonroot:nonroot

ENTRYPOINT ["/app/api"]
```

几个关键点：

- `COPY go.mod go.sum ./` 放在源码前面，最大化利用依赖缓存。
- BuildKit 的 `--mount=type=cache` 能缓存模块和编译产物，CI 里也能明显加速。
- `CGO_ENABLED=0` 产出静态二进制，更适合 `distroless/static` 或 `scratch`。
- `-trimpath` 去掉本地路径，增强构建可复现性。
- `-ldflags="-s -w"` 减小二进制体积，但会减少调试符号。
- `USER nonroot` 避免容器内进程默认 root。

构建：

```bash
DOCKER_BUILDKIT=1 docker build -t my-api:dev .
docker run --rm -p 8080:8080 my-api:dev
```

## 四、版本信息注入

生产排错时，经常需要知道当前容器到底跑的是哪个 commit。可以在构建时注入版本信息。

Go 代码：

```go
package version

var (
	Version = "dev"
	Commit  = "none"
	BuiltAt = "unknown"
)
```

Dockerfile：

```dockerfile
ARG VERSION=dev
ARG COMMIT=none
ARG BUILT_AT=unknown

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build \
      -trimpath \
      -ldflags="-s -w -buildid= \
        -X github.com/example/app/internal/version.Version=${VERSION} \
        -X github.com/example/app/internal/version.Commit=${COMMIT} \
        -X github.com/example/app/internal/version.BuiltAt=${BUILT_AT}" \
      -o /out/api \
      ./cmd/api
```

构建命令：

```bash
docker build \
  --build-arg VERSION=1.4.2 \
  --build-arg COMMIT="$(git rev-parse --short HEAD)" \
  --build-arg BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t my-api:1.4.2 .
```

如果追求完全可复现构建，`BUILT_AT` 这类时间戳要谨慎，因为它会让每次构建产物不同。

## 五、`.dockerignore` 比你想象的重要

Docker 构建上下文会被发送给 Docker daemon。没有 `.dockerignore` 时，`.git`、测试数据、临时文件、构建产物都可能进入上下文，拖慢构建并带来泄密风险。

```gitignore
.git
.github
.idea
.vscode
tmp
dist
bin
coverage.out
*.log
.env
node_modules
vendor
```

是否忽略 `vendor` 取决于你的构建策略。如果项目要求离线构建并提交 vendor，就不要忽略它，并在 Dockerfile 中使用 `-mod=vendor`。

## 六、Alpine、distroless 和 scratch 的取舍

### 1. Alpine

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /out/api /app/api
USER 65532:65532
ENTRYPOINT ["/app/api"]
```

优点是有 shell 和包管理器，排错方便；缺点是镜像里工具更多，攻击面更大，而且 musl 与 glibc 差异在 CGO 场景可能踩坑。

### 2. distroless

```dockerfile
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/api /app/api
ENTRYPOINT ["/app/api"]
```

优点是比 Alpine 更适合生产最小运行时，有 CA 证书和非 root 用户版本；缺点是没有 shell，容器内临时排错不方便。

### 3. scratch

```dockerfile
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /out/api /api
USER 65532:65532
ENTRYPOINT ["/api"]
```

优点是极致小；缺点是很多东西都要自己复制，例如证书、时区、用户文件。除非你非常明确需求，否则生产上更推荐 distroless。

## 七、CGO 场景：不是所有 Go 程序都能静态跑

如果使用 SQLite、Kafka 某些 C 客户端、图像处理库、系统认证库，可能依赖 CGO。此时 `CGO_ENABLED=0` 可能编译失败，或者功能不可用。

CGO 场景可以选择 Debian slim：

```dockerfile
FROM golang:1.22-bookworm AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .

RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 GOOS=linux go build -trimpath -o /out/api ./cmd/api

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -r -u 10001 appuser
USER appuser

COPY --from=builder /out/api /app/api
ENTRYPOINT ["/app/api"]
```

生产取舍是：CGO 能带来某些库能力，但镜像、交叉编译和运行时依赖都会更复杂。

## 八、健康检查与优雅退出

容器编排系统会频繁启动、停止和替换容器。Go 服务要正确处理 SIGTERM，否则滚动发布时可能中断正在处理的请求。

```go
srv := &http.Server{
	Addr:              ":8080",
	Handler:           router,
	ReadHeaderTimeout: 3 * time.Second,
	ReadTimeout:       10 * time.Second,
	WriteTimeout:      10 * time.Second,
	IdleTimeout:       60 * time.Second,
}

go func() {
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}()

quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit

ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
_ = srv.Shutdown(ctx)
```

Dockerfile 可以有 `HEALTHCHECK`：

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["/app/api", "healthcheck"]
```

但在 Kubernetes 里，通常用 `livenessProbe`、`readinessProbe`、`startupProbe` 管理健康检查，不一定需要 Dockerfile 的 `HEALTHCHECK`。

## 九、排错与优化

常见问题：

- **HTTPS 请求失败**：运行镜像缺少 CA 证书。给 Alpine 安装 `ca-certificates`，或使用 distroless。
- **容器时间不对**：缺少时区数据，或者程序没有明确使用 UTC。服务端日志建议默认 UTC。
- **二进制跑不起来**：构建架构与运行节点不一致，例如在 arm64 Mac 构建 amd64 集群镜像。
- **scratch 中找不到用户**：`USER nonroot` 需要基础镜像里有用户；scratch 里可以用数字 UID/GID。
- **镜像很大**：检查是否把源码、`.git`、测试数据、Go build cache 复制进 runtime stage。
- **构建很慢**：检查 Dockerfile 层顺序、BuildKit cache、go mod 下载是否每次失效。

查看镜像层：

```bash
docker history my-api:dev
```

多架构构建：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t registry.example.com/my-api:1.4.2 \
  --push .
```

漏洞扫描可以接入 Trivy、Grype 或镜像仓库自带扫描。Go 依赖也要配合 `govulncheck`：

```bash
govulncheck ./...
```

## 十、生产取舍

一份好的 Go Dockerfile 要平衡这些目标：

- **小体积**：减少分发时间和攻击面。
- **可调试**：出问题时能通过日志、指标、临时 debug 镜像定位。
- **安全**：非 root、少依赖、及时更新基础镜像。
- **可复现**：固定 Go 版本、固定基础镜像版本、可追踪 commit。
- **构建速度**：合理利用层缓存和 BuildKit cache。

生产里不建议永远使用 `latest` 标签。基础镜像、应用镜像都应该使用明确版本，并在 CI 中定期更新和扫描。

## 十一、总结

Go 容器化的关键不是把镜像压到几 MB，而是让镜像成为稳定、可追踪、可安全运行的交付单元。多阶段构建负责隔离编译环境和运行环境，缓存设计负责提高 CI 效率，distroless/nonroot/证书/时区/优雅退出负责生产可用性。

记住一条实用标准：最终镜像只放运行所需内容，进程不用 root，版本能追踪，服务能优雅退出，构建能稳定复现。做到这些，你的 Go Dockerfile 就已经达到了生产级。
