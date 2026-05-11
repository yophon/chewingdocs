# Docker 基础

Docker 把**应用 + 依赖 + 运行环境**打包成一个镜像，在任何机器上跑出一样的结果。"在我机器上好好的"这句话，用 Docker 之后就不存在了。

---

## 一、核心概念

| 概念 | 类比 | 说明 |
| --- | --- | --- |
| **镜像 Image** | 类（Class） | 只读模板，包含代码 + 依赖 + 配置 |
| **容器 Container** | 实例（Instance） | 镜像运行起来的进程，可读写层隔离 |
| **仓库 Registry** | npm / Maven 仓库 | 存镜像，官方是 Docker Hub |
| **卷 Volume** | 外挂磁盘 | 容器生命周期外的持久化存储 |
| **网络 Network** | 虚拟交换机 | 容器间通信 |

---

## 二、安装与验证

```bash
# macOS
brew install --cask docker

# 验证
docker version
docker run hello-world
```

---

## 三、镜像操作

```bash
# 拉取
docker pull nginx:1.25-alpine

# 查看本地镜像
docker images

# 删除镜像
docker rmi nginx:1.25-alpine

# 搜索
docker search redis
```

### 镜像命名规范

```
[registry/][namespace/]name[:tag]

nginx                      # 官方镜像，tag 默认 latest
nginx:1.25-alpine          # 指定 tag（推荐！不要用 latest）
myrepo.io/myapp:v1.2.3     # 私有仓库
```

> 生产**永远不用 `latest`**，tag 固定版本，保证可重现。

---

## 四、容器操作

### 启动与停止

```bash
# 前台运行
docker run nginx

# 后台运行 -d，指定名称 --name，端口映射 -p
docker run -d --name mynginx -p 8080:80 nginx:1.25-alpine

# 查看运行中的容器
docker ps

# 查看所有容器（包括已停止）
docker ps -a

# 停止 / 启动 / 重启
docker stop mynginx
docker start mynginx
docker restart mynginx

# 删除容器（先 stop 再 rm，或 -f 强制）
docker rm -f mynginx
```

### 进入容器

```bash
docker exec -it mynginx sh      # alpine 用 sh
docker exec -it myapp bash      # 完整 Linux 用 bash
```

### 查看日志

```bash
docker logs mynginx             # 全量日志
docker logs -f mynginx          # 跟踪输出（like tail -f）
docker logs --tail 100 mynginx  # 最近 100 行
```

### 查看资源占用

```bash
docker stats                    # 实时监控所有容器
docker top mynginx              # 容器内进程
```

---

## 五、卷（持久化存储）

容器删了，数据就没了。用 **Volume** 把数据存到宿主机或命名卷。

### 命名卷（推荐）

```bash
# 创建卷
docker volume create mydata

# 挂载卷
docker run -d \
  --name mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -v mydata:/var/lib/mysql \
  -p 3306:3306 \
  mysql:8.0

# 查看卷
docker volume ls
docker volume inspect mydata
```

### 绑定挂载（Bind Mount）

```bash
# 把宿主机目录挂进容器（开发常用，生产慎用）
docker run -d \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
  -p 80:80 \
  nginx
```

| | 命名卷 | 绑定挂载 |
| --- | --- | --- |
| 路径 | Docker 管理 | 你指定 |
| 适合 | 生产数据 | 开发时注入配置 |
| 备份 | `docker volume` 命令 | 直接操作目录 |

---

## 六、网络

```bash
# 查看网络
docker network ls

# 创建自定义网络（推荐，容器间用名字通信）
docker network create mynet

# 容器加入网络
docker run -d --name redis --network mynet redis:7-alpine
docker run -d --name app --network mynet myapp

# app 容器内可以直接用容器名访问 redis
# redis://redis:6379
```

### 默认网络

| 网络 | 说明 |
| --- | --- |
| `bridge` | 默认，容器间 IP 通信，宿主机 NAT |
| `host` | 容器共享宿主机网络栈 |
| `none` | 无网络 |
| 自定义 bridge | **推荐**，容器名 DNS 自动解析 |

> 不要用默认 `bridge`，它不支持容器名 DNS。始终创建自定义网络。

---

## 七、常用快捷命令

```bash
# 清理停止的容器 + 悬空镜像 + 未用网络
docker system prune

# 清理包括未用镜像（谨慎！）
docker system prune -a

# 查看磁盘占用
docker system df

# 把容器里的文件复制出来
docker cp mynginx:/etc/nginx/nginx.conf ./nginx.conf

# 查看镜像层
docker history nginx:1.25-alpine
```

---

## 八、一次完整的实验

```bash
# 1. 起 MySQL
docker network create demo
docker run -d --name mysql \
  --network demo \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=testdb \
  -v mysql_data:/var/lib/mysql \
  -p 3306:3306 \
  mysql:8.0

# 2. 起 Redis
docker run -d --name redis \
  --network demo \
  -v redis_data:/data \
  -p 6379:6379 \
  redis:7-alpine

# 3. 进 MySQL 验证
docker exec -it mysql mysql -uroot -proot -e "SHOW DATABASES;"

# 4. 清理
docker rm -f mysql redis
docker network rm demo
docker volume rm mysql_data redis_data
```

---

## 总结

| 操作 | 命令 |
| --- | --- |
| 拉镜像 | `docker pull name:tag` |
| 运行容器 | `docker run -d --name x -p 宿主:容器 image` |
| 进入容器 | `docker exec -it name sh` |
| 查日志 | `docker logs -f name` |
| 持久化 | `-v volume_name:/容器路径` |
| 容器通信 | 创建自定义网络 + `--network` |
| 清理 | `docker system prune` |
