# 部署与 CI/CD:Docker、GitHub Actions、Vercel / Cloudflare

代码写完只是一半。部署 = **让代码 24 小时跑在真实流量上 + 改了一行能 10 分钟内安全上线**。

这一篇分两条线:

```
1. 部署 — 把代码送到服务器
   静态站(Vercel / Cloudflare Pages / Netlify)
   全栈应用(Vercel / Cloudflare Workers / Railway / Fly)
   自建服务器(VPS + Docker + Nginx)

2. CI/CD — 自动化流水线
   GitHub Actions(默认)
   测试、Lint、类型、build、deploy 串起来
   PR 自动 preview
```

---

## 一、部署四种方案

```
方案                    | 复杂度 | 适合
Vercel / Netlify       | ⭐    | 前端静态站、Next.js
Cloudflare Pages/Workers | ⭐⭐  | 边缘网站、全球分发
PaaS(Railway/Fly/Render) | ⭐⭐  | 全栈中小项目,要数据库
Docker + VPS           | ⭐⭐⭐⭐ | 完全控制、企业、自托管
```

**新人 / 小项目**:Vercel 或 Cloudflare,**不要折腾自建**。
**有定制需求 / 多服务**:Docker + VPS 或 Kubernetes。

---

## 二、Vercel:Next.js / 前端最佳

### 1. 部署一个 Next.js

```
GitHub 仓库 → Vercel Import → 选仓库 → 一键部署
```

**就这样**。每次 push 自动 build + deploy,**PR 自动 preview**(临时 URL)。

### 2. 配置

```
环境变量    : Vercel Dashboard 加(分 Production / Preview / Development)
域名       : 加自己域名,Vercel 自动 HTTPS / CDN
区域       : Edge / 多区域可选
```

### 3. `vercel.json`

```json
{
  "buildCommand": "pnpm build",
  "framework": "nextjs",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://my-api.com/:path*" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

99% 不用写,Next.js 项目零配置。

### 4. Vercel 适合 / 不适合

```
适合
  Next.js / Nuxt / SvelteKit / Astro / Remix
  静态 / SSR / Edge function 混合
  小到中型项目

不适合 / 注意
  长任务(单次请求 > 60s)
  超大流量(贵)
  WebSocket(支持但有限)
  自定义运行时
```

价格:免费档够个人项目;团队 $20/月起;商业项目数据传输费可能很贵(注意大文件 / 视频)。

---

## 三、Cloudflare:边缘平台

```
Cloudflare Pages       静态站,跟 Vercel 类似
Cloudflare Workers     Serverless 函数,V8 isolate(冷启动 < 5ms)
Cloudflare D1          SQLite 边缘数据库
Cloudflare R2          S3 兼容存储,免出口费
Cloudflare KV          KV 边缘存储
Cloudflare Durable Objects   有状态边缘对象
```

### 1. 部署 Hono 到 Workers

```bash
pnpm create hono my-api
cd my-api
# 选 cloudflare-workers 模板
pnpm install
pnpm dev
pnpm deploy        # 内置 wrangler
```

```toml
# wrangler.toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "..."
```

### 2. Cloudflare 优势

- **全球边缘**:300+ 节点,用户就近访问
- **免费档很慷慨**:每天 10 万请求免费
- **零冷启动**(V8 isolate)
- **价格透明** + 流量出口免费(R2 / Workers 流量)

### 3. 限制

- **不是 Node 完整运行时**:很多 npm 包不能用(用 nodejs_compat 兼容部分)
- **请求时间限制**:Workers 50ms CPU(免费)/ 30s(付费);单次响应 6MB
- **数据库**:D1 是 SQLite,小项目够用,大数据量看 Hyperdrive(代理 Postgres)

### 4. 适合

- 全栈应用(Next.js / Hono / Remix on Workers)
- API 网关 / BFF
- 边缘渲染(SSR)
- 静态站点(Pages)

**Cloudflare 是 2025 增长最快的边缘平台**,值得学。

---

## 四、PaaS:Railway / Fly / Render

适合**需要长跑后端进程 + 数据库**的项目,但不想搞 Docker / Kubernetes。

### Railway

```bash
# 一键部署 GitHub 仓库
# 自动检测语言 / 框架,build + run
```

```
优点    : UI 简单,价格透明($5 起步)
缺点    : 自动检测有时不准,要手动改 Dockerfile
适合    : Node 全栈、Python、Go 中小项目
```

### Fly.io

```bash
fly launch          # 自动生成 Dockerfile + fly.toml
fly deploy
fly scale count 3   # 加副本
```

```
优点    : 全球部署、便宜、有持久卷、支持任何 Docker
缺点    : 学习曲线略陡(要懂 Docker)
适合    : 需要全球部署的全栈应用、Go/Rust 服务
```

### Render

类似 Heroku 替代品,UI 友好。免费档有,但休眠让你头疼。

---

## 五、Docker:容器化基础

### 1. 为什么 Docker

```
"在我机器上能跑" → "在容器里能跑"
所有依赖、环境变量、运行时都打包进镜像。任何机器跑同一镜像,行为一致。
```

### 2. 一个 Node.js 应用的 Dockerfile

```dockerfile
# 多阶段构建,产物镜像小
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
USER nodejs
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t my-app .
docker run -p 3000:3000 -e DATABASE_URL=... my-app
```

### 3. `.dockerignore`(必加)

```
node_modules
.git
.env*
dist
*.log
.next
.cache
```

不写这个,镜像会带上几百 MB 的 node_modules 和 .git。

### 4. 多阶段构建好处

```
deps    : 装依赖(缓存层)
builder : 编译(包含 dev deps)
runner  : 最终镜像(只 production 文件)
```

最终镜像可以只有 100MB,不是 1GB。

### 5. docker-compose(本地开发)

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:pass@db:5432/app
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

```bash
docker compose up -d
docker compose down
docker compose logs -f app
```

**本地一键起 Postgres + Redis + 你的服务**,新人入职 5 分钟开发环境齐活。

---

## 六、自建服务器:VPS + Docker + Nginx

### 1. 选 VPS

```
DigitalOcean    : 入门首选,$6 起,文档多
Hetzner         : 性价比之王,$5 起,德国
Vultr / Linode  : 类似 DO
腾讯云 / 阿里云  : 国内备案
```

### 2. 基本部署流程

```bash
# 1. SSH 上去
ssh root@your-vps

# 2. 装 Docker
curl -fsSL https://get.docker.com | sh

# 3. 装 Nginx(或用 Caddy 自动 HTTPS)
apt install -y caddy

# 4. 配 Caddy(自动 HTTPS,免折腾)
cat > /etc/caddy/Caddyfile <<EOF
your-domain.com {
  reverse_proxy localhost:3000
}
EOF
systemctl reload caddy

# 5. 跑你的容器
docker run -d --name app --restart=always -p 3000:3000 -e DATABASE_URL=... your-image
```

**Caddy 自动申请 / 续期 HTTPS 证书**,比 Nginx + certbot 简单 10 倍。

### 3. 部署更新

```bash
# 拉新镜像
docker pull your-registry/your-image:latest

# 替换容器
docker stop app && docker rm app
docker run -d --name app --restart=always -p 3000:3000 ... your-image:latest
```

写成脚本或用 watchtower 自动:

```bash
docker run -d --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower --interval 300
```

### 4. 端口规划

> 这条是从我自己的部署反思来的:**多个服务别共用端口,blog 在 80,新服务用 8080**。

```
80     Caddy / Nginx
443    HTTPS
8080   你的应用 1
8081   你的应用 2
5432   Postgres(只内部访问,不要公网开)
6379   Redis(同上)
```

---

## 七、CI/CD:GitHub Actions

GitHub Actions = 在 GitHub 仓库里跑自动化任务,**每次 push / PR 都跑**。

### 1. 第一个 workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

push 到 main 或开 PR 时自动跑。**任一步失败就显示 ❌**。

### 2. 加 E2E

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm playwright install --with-deps
      - run: pnpm build
      - run: pnpm playwright test
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

失败时自动上传 Playwright 报告。

### 3. 部署到 Vercel(自动)

Vercel 集成 GitHub 后**自动监听 push**,不需要 workflow。但你也可以手动:

```yaml
  deploy:
    needs: [test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install -g vercel
      - run: vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### 4. 构建 Docker + 推到 Registry

```yaml
  docker:
    needs: [test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

镜像推到 GitHub Container Registry(ghcr.io),免费私有仓。

### 5. 部署到 VPS(SSH)

```yaml
  deploy:
    needs: [docker]
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            docker pull ghcr.io/${{ github.repository }}:latest
            docker stop app || true
            docker rm app || true
            docker run -d --name app --restart=always -p 8080:3000 \
              --env-file /etc/app/.env \
              ghcr.io/${{ github.repository }}:latest
```

**push 到 main → 自动 build → 自动 push 镜像 → 自动 SSH 重启容器**。

### 6. Secrets

```
GitHub repo → Settings → Secrets → Actions
添加:VERCEL_TOKEN / SSH_HOST / SSH_KEY / DATABASE_URL ...
```

代码里用 `${{ secrets.NAME }}` 引用。**永远不要把 secret 写在代码或 yaml 里**。

---

## 八、CI/CD 实战策略

### 1. 流水线分层

```
PR 阶段(快速反馈):
  Lint(<10s)
  Typecheck(<30s)
  Unit test(<2min)
  Build check(<2min)

合并到 main 后:
  Integration test
  E2E test
  Build Docker
  Deploy preview

发布到生产:
  人工审批
  Deploy production
  健康检查
```

### 2. 监控部署成功

```yaml
- name: Health check
  run: |
    for i in {1..30}; do
      if curl -f https://your-app.com/health; then
        exit 0
      fi
      sleep 2
    done
    exit 1
```

部署后等服务起来,**curl /health 验证**。失败就触发回滚 / 报警。

### 3. 蓝绿 / 滚动部署

```
蓝绿:同时跑两套(旧 v1 + 新 v2),切流量到 v2,出问题切回
滚动:一个个替换实例,出问题部分回滚
```

Vercel / Cloudflare 自动蓝绿。Docker swarm / K8s 内置滚动。

### 4. 数据库迁移在哪跑

```
推荐:CI/CD 里,部署新代码前
  pnpm prisma migrate deploy
  → 部署新代码

不推荐:应用启动时跑(并发实例可能同时跑迁移,冲突)
```

---

## 九、监控 / 报警

### 错误监控

```bash
pnpm add @sentry/nextjs
# 或 @sentry/node / @sentry/react
```

```ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
```

错误自动上传,Sentry 自动分组、聚合、报警。**生产必装**。

### 性能监控

- **Vercel Analytics**:Web Vitals 自动采集
- **Datadog / New Relic**:全栈监控,贵但全
- **PostHog**:产品分析 + 错误,开源可自托管

### 日志

```ts
import pino from 'pino';
const log = pino();

log.info({ userId: '...' }, 'login');
log.error(err, 'something failed');
```

结构化 JSON 日志,生产用 logflare / Datadog / CloudWatch 收集。

### 健康检查

```ts
app.get('/health', (c) => c.json({
  status: 'ok',
  uptime: process.uptime(),
  db: dbStatus,
}));
```

负载均衡 / 编排器靠这个判断节点活性。

---

## 十、回滚策略

**部署最重要的特性:能快速回滚**。

```
方案
  Vercel / Cloudflare:控制台一键 rollback 到任意版本
  Docker:docker run 旧 tag 即可
  K8s:kubectl rollout undo
  Git:revert commit + 重新部署

关键:
  - 每次 build 打 git sha 的 tag,能精确回到任意版本
  - 数据库迁移要可回滚(或向前兼容,见 37 篇)
  - 部署后保留旧版本一段时间(至少 24h)
```

---

## 十一、常见 Trap

### Trap 1:DNS 没生效就当成生效

> 这个我自己踩过:更新 DNS 后立刻测,以为部署成功,实际是缓存的旧 IP。

```bash
# 本地清缓存:
sudo dscacheutil -flushcache    # macOS
sudo systemd-resolve --flush    # Linux

# 验证生效:
dig your-domain.com
nslookup your-domain.com 8.8.8.8    # 用公共 DNS

# 全球验证:
https://www.whatsmydns.net/
```

**新域名 / 新解析,等 5~30 分钟全球生效**。不要立刻在本地测就以为成了。

### Trap 2:secret 写到代码 / 镜像里

```dockerfile
# ❌
ENV API_KEY=sk-xxxxx

# ✅ 运行时注入
docker run -e API_KEY=$API_KEY ...
```

镜像是公开的(GHCR public)就被全网爬到。**永远运行时注入 secret**。

### Trap 3:CI 缓存把环境带过去

```yaml
- uses: actions/setup-node@v4
  with:
    cache: pnpm        # 缓存 pnpm store
```

但**不要缓存 node_modules**,锁文件改了缓存就脏。pnpm store 是按 hash 的,缓存友好。

### Trap 4:push 到 main 立刻部署 = 危险

```yaml
on:
  push:
    branches: [main]
```

合错代码立刻上线。**生产部署应该有人工审批**:

```yaml
environment:
  name: production
  url: https://your-app.com
```

GitHub 的 environment 可以配审批人,部署前要 click approve。

### Trap 5:静态资源没缓存策略

```
HTML        : Cache-Control: no-cache(每次问)
JS/CSS hash : Cache-Control: public, max-age=31536000, immutable(永久缓存)
图片        : 长缓存
```

文件名带 hash(Vite/Next 默认),所以可以永久缓存。改了内容 hash 变,新 URL 自然 miss。

### Trap 6:CI 跑得太久,反馈慢

- 拆 job 并发跑(test / lint / typecheck 一起)
- 缓存依赖
- 跳过不相关的(改文档不跑 E2E)

```yaml
on:
  pull_request:
    paths-ignore:
      - 'docs/**'
      - '*.md'
```

---

## 十二、心智模型

```
2025 部署四级跳:

  级别 1:静态站
    Vercel / Cloudflare Pages,push 自动部署,5 分钟上线

  级别 2:全栈应用
    Vercel + Postgres(Neon/Supabase),零运维

  级别 3:边缘 / 全球
    Cloudflare Workers + D1 / Hyperdrive,Hono / Next.js Edge

  级别 4:自主可控
    VPS + Docker + Nginx/Caddy + GitHub Actions

CI/CD 三大原则:
  - 每次提交都跑测试,断了立刻知道
  - main 自动部署 preview,生产人工审批
  - 部署后健康检查 + 能秒回滚

监控三件套:
  - Sentry 错误
  - Web Vitals 性能
  - pino 结构化日志
```

---

## 十三、推荐学习路径

1. 先用 Vercel 部署一个 Next.js,体验"push 即上线"
2. 写一个 GitHub Actions 跑测试
3. 写一个 Dockerfile,本地 docker run 起来
4. 买个 $5 VPS(Hetzner/DO),docker run 部署一次
5. CI/CD 串起来:push → test → build → deploy

每一步都做一遍,**部署技能就齐了**。再大的项目也是这些组件的组合。

---

## 十四、参考速查

```bash
# Vercel
vercel              # 部署到 preview
vercel --prod       # 部署到 production
vercel logs         # 看日志

# Docker
docker build -t app .
docker run -p 3000:3000 -e KEY=val app
docker compose up -d
docker logs -f app

# GitHub CLI(手动触发 / 看运行)
gh workflow run ci.yml
gh run list
gh run view <id> --log

# DNS 验证
dig your-domain.com
curl -I https://your-domain.com
```

下一篇 39 进入第三层:Web 性能优化(Web Vitals、代码分割、懒加载、渲染管线)。
