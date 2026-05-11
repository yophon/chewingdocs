# Docker Compose

单个容器用 `docker run` 够了。但实际项目是**一组服务**：Spring Boot + MySQL + Redis + ES。Docker Compose 用一个 YAML 文件描述整套环境，`docker compose up` 一键启动。

---

## 一、为什么需要 Compose

手动 `docker run` 多个容器的问题：

- 启动顺序、网络互通要手动处理
- 环境变量、卷挂载命令越来越长
- 没有统一的生命周期（启停、日志）

Compose 解决了这一切：**声明式描述 → 一条命令管理整个栈**。

---

## 二、compose.yml 基本结构

```yaml
version: "3.9"           # 可省略，Compose V2 已不需要

services:
  app:                   # 服务名（随意）
    build: .             # 或 image: xxx
    ports:
      - "8080:8080"
    environment:
      SPRING_PROFILES_ACTIVE: dev
    depends_on:
      db:
        condition: service_healthy
    networks:
      - backend

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: demo
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

volumes:
  mysql_data:

networks:
  backend:
    driver: bridge
```

---

## 三、常用命令

```bash
docker compose up -d          # 后台启动所有服务
docker compose up -d app      # 只启动某个服务
docker compose down           # 停止并删除容器（保留 volume）
docker compose down -v        # 同时删除 volume（数据清空）
docker compose ps             # 查看服务状态
docker compose logs -f app    # 跟踪某服务日志
docker compose exec app bash  # 进入容器
docker compose restart app    # 重启
docker compose pull           # 拉取最新镜像
docker compose build --no-cache  # 强制重新构建
```

---

## 四、完整实战示例

Spring Boot + MySQL + Redis + Nginx 的本地开发环境：

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    networks:
      - frontend

  app:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://db:3306/demo?useSSL=false&serverTimezone=Asia/Shanghai
      SPRING_DATASOURCE_USERNAME: demo
      SPRING_DATASOURCE_PASSWORD: demo123
      SPRING_REDIS_HOST: redis
      SPRING_REDIS_PORT: 6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - frontend
      - backend

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: demo
      MYSQL_USER: demo
      MYSQL_PASSWORD: demo123
      TZ: Asia/Shanghai
    volumes:
      - mysql_data:/var/lib/mysql
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-uroot", "-proot"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - backend

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass redis123
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "redis123", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - backend

volumes:
  mysql_data:
  redis_data:

networks:
  frontend:
  backend:
```

---

## 五、环境变量管理

### `.env` 文件

Compose 自动加载项目根目录的 `.env`：

```env
# .env
MYSQL_ROOT_PASSWORD=root
MYSQL_DATABASE=demo
APP_PORT=8080
```

```yaml
# compose.yml
services:
  db:
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
```

**不要把 `.env` 提交 git**，用 `.env.example` 提供模板。

### 多环境配置

```bash
docker compose -f compose.yml -f compose.prod.yml up -d
```

`compose.prod.yml` 只写和开发环境的**差异部分**（覆盖合并）：

```yaml
# compose.prod.yml
services:
  app:
    image: myregistry/app:v1.2.0   # 生产用固定镜像，不 build
    deploy:
      replicas: 3
```

---

## 六、Volume 详解

```yaml
volumes:
  # 具名卷（推荐）：Docker 管理，数据存在 /var/lib/docker/volumes/
  mysql_data:

  # 绑定挂载：宿主机目录 ↔ 容器目录
  # 适合开发时热重载代码
services:
  app:
    volumes:
      - ./src:/app/src          # 绑定挂载
      - app_build:/app/build    # 具名卷
```

| 类型 | 持久化 | 性能 | 用途 |
| --- | --- | --- | --- |
| 具名卷 | ✅ | 好 | 数据库数据、生产数据 |
| 绑定挂载 | ✅（宿主机） | 取决于平台 | 开发热重载、配置文件 |
| tmpfs | ❌（内存） | 极快 | 临时缓存、敏感数据 |

---

## 七、网络详解

同一 Compose 项目的服务在同一网络里，**直接用服务名互相访问**：

```java
// Spring Boot 里直接用服务名
spring.datasource.url=jdbc:mysql://db:3306/demo
spring.redis.host=redis
```

多网络隔离：只有加入同一 network 的服务才能互通。上面的例子里，`nginx` 只在 `frontend`，看不到 `db` 和 `redis`。

---

## 八、健康检查与依赖顺序

`depends_on` 只保证**容器启动顺序**，不保证**服务就绪**。MySQL 容器启动后还要几秒初始化，这段时间 Spring Boot 连不上会报错。

解决方案：`depends_on` + `condition: service_healthy`：

```yaml
depends_on:
  db:
    condition: service_healthy   # 等 healthcheck 通过才起动
  redis:
    condition: service_healthy
```

---

## 九、常见坑

| 坑 | 原因 | 解法 |
| --- | --- | --- |
| 服务间用 `localhost` 连不通 | 容器内 localhost 是自己 | 用服务名 |
| 端口冲突 | 宿主机端口已被占用 | 改 ports 左边 |
| 数据库没初始化 | init.sql 只执行一次（首次创建 volume） | 删 volume 重建 |
| 镜像没更新 | 本地有旧镜像缓存 | `docker compose pull` 或 `--build` |
| 日志乱 | 多服务日志混在一起 | `docker compose logs -f 服务名` |

---

## 十、小结

| 场景 | 推荐 |
| --- | --- |
| 本地开发环境 | `docker compose up -d`，绑定挂载代码目录 |
| CI 运行集成测试 | compose 起全套依赖，测完 `down -v` 清理 |
| 生产小规模（1~2 台） | `compose.prod.yml` 覆盖，配合 Watchtower 自动更新 |
| 生产大规模 | 升级 K8s（下一章） |

> 经验法则：**开发用 Compose，生产用 K8s**。Compose 足够轻量，K8s 足够强壮，中间没有灰色地带。
