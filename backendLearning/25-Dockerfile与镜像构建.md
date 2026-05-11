# Dockerfile 与镜像构建

Dockerfile 是**用代码描述镜像构建步骤**的文本文件。写好 Dockerfile 的目标只有两个：**构建成功** 和 **镜像尽可能小**。

---

## 一、Dockerfile 指令速查

| 指令 | 作用 | 示例 |
| --- | --- | --- |
| `FROM` | 指定基础镜像 | `FROM eclipse-temurin:21-jre` |
| `WORKDIR` | 设置工作目录（自动创建） | `WORKDIR /app` |
| `COPY` | 宿主机 → 镜像 | `COPY target/app.jar .` |
| `ADD` | 同 COPY，支持解压 tar + 远程 URL（一般用 COPY） | `ADD app.tar.gz /app` |
| `RUN` | 构建时执行命令（每条产生一层） | `RUN apt-get install -y curl` |
| `ENV` | 设置环境变量 | `ENV PORT=8080` |
| `ARG` | 构建参数（仅构建期可见） | `ARG VERSION=1.0` |
| `EXPOSE` | 声明容器监听端口（文档用，不自动映射） | `EXPOSE 8080` |
| `ENTRYPOINT` | 容器启动命令（不易被覆盖） | `ENTRYPOINT ["java", "-jar"]` |
| `CMD` | ENTRYPOINT 的默认参数 / 容器默认命令 | `CMD ["app.jar"]` |
| `VOLUME` | 声明挂载点 | `VOLUME /data` |
| `USER` | 切换用户 | `USER appuser` |
| `HEALTHCHECK` | 健康检查 | 见下文 |

---

## 二、ENTRYPOINT vs CMD

```dockerfile
ENTRYPOINT ["java", "-jar"]
CMD ["app.jar"]
```

运行时：`docker run myapp`→ 执行 `java -jar app.jar`
覆盖 CMD：`docker run myapp other.jar` → 执行 `java -jar other.jar`
覆盖 ENTRYPOINT：`docker run --entrypoint /bin/sh myapp`

> 经验法则：**ENTRYPOINT 定命令，CMD 定默认参数**。如果整个命令都想被覆盖，只用 CMD 也可以。

Shell 形式 vs Exec 形式：

```dockerfile
# Shell 形式（不推荐）：PID 1 是 /bin/sh，信号传递有问题
CMD java -jar app.jar

# Exec 形式（推荐）：PID 1 是 java，能正确收到 SIGTERM
CMD ["java", "-jar", "app.jar"]
```

---

## 三、镜像层缓存

Dockerfile 每条 `RUN / COPY / ADD` 都产生一层。**只要该层及之前的指令没变，就命中缓存**——这是构建速度的关键。

```dockerfile
# ❌ 坏写法：pom.xml 没变但 src 变了，也要重新 mvn package
COPY . .
RUN mvn package

# ✅ 好写法：先复制 pom.xml 安装依赖（缓存），再复制源码
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests
```

---

## 四、多阶段构建（核心技能）

多阶段构建解决一个核心问题：**编译工具链不应该进生产镜像**。

### Spring Boot 多阶段构建

```dockerfile
# 阶段一：构建
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

# 阶段二：运行（只有 JRE，无 Maven、源码）
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

构建结果对比：
- 不用多阶段：~800 MB（含 JDK + Maven + 源码）
- 多阶段：~180 MB

### ElysiaJS (Bun) 多阶段构建

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/index.ts --outfile=dist/index.js --target=bun

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "dist/index.js"]
```

---

## 五、镜像瘦身技巧

### 1. 选对基础镜像

| 后缀 | 说明 | 大小参考 |
| --- | --- | --- |
| 无后缀 | Debian full | ~500 MB |
| `-slim` | Debian 精简版 | ~100 MB |
| `-alpine` | Alpine Linux | ~5 MB |
| `-distroless` | Google 出品，无 shell | 极小 |

> 注意：Alpine 用 musl libc，某些 JVM 或 native 库有兼容问题，Java 应用优先用 `-slim` 而非 Alpine。

### 2. 合并 RUN 减少层

```dockerfile
# ❌ 每条 RUN 一层，中间层删除的文件依然占用镜像空间
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# ✅ 一条 RUN，缓存 + 清理在同一层生效
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*
```

### 3. .dockerignore

和 `.gitignore` 同理，排除不必要内容：

```
node_modules
target
.git
*.md
*.log
.env
```

### 4. 不以 root 运行

```dockerfile
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser
```

---

## 六、健康检查

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1
```

K8s 有自己的 liveness/readiness probe，`HEALTHCHECK` 主要给 Docker 原生和 Compose 用。

---

## 七、JVM 容器化注意事项

JVM 默认读取宿主机内存计算堆大小，容器场景下会 OOM。

```dockerfile
# 推荐：让 JVM 自动感知容器内存限制
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

或者直接在 Compose / K8s 里通过环境变量注入，Dockerfile 里只留占位：

```dockerfile
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

---

## 八、常用基础镜像参考

| 场景 | 推荐镜像 |
| --- | --- |
| Java 17/21 运行 | `eclipse-temurin:21-jre-alpine` |
| Java 构建 | `maven:3.9-eclipse-temurin-21` |
| Bun 运行 | `oven/bun:1-alpine` |
| Node 运行 | `node:20-alpine` |
| Nginx 静态 | `nginx:alpine` |
| 数据库工具镜像 | 各官方镜像（`mysql:8`、`postgres:16-alpine`、`redis:7-alpine`） |

---

## 给新手的建议

1. **从多阶段构建开始**，不要图省事把编译工具留进去
2. **先把 `.dockerignore` 配好**，再 `docker build`，否则每次都把 `node_modules` 塞进去
3. **构建慢？先看缓存命中率**——把 `COPY pom.xml` / `COPY package.json` 提到源码复制之前
4. **生产镜像 `docker image ls` 看大小**，超过 500 MB 的都值得优化
