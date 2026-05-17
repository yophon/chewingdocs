# Vercel / Netlify / Firebase / Supabase 免费套餐怎么看

## 一句话解释

Vercel、Netlify、Firebase、Supabase 的免费套餐,本质上是让小项目低门槛使用前端托管、Serverless、认证、数据库、存储和实时能力,但每个平台限制的维度完全不同。

它们最容易被混在一起比较成"哪个更便宜"。这其实问错了。Vercel 和 Netlify 更偏前端部署与边缘工作流,Firebase 和 Supabase 更偏后端能力与数据层。你要先判断自己需要的是"把网站部署出去",还是"给应用补一套后端基础设施"。

---

## 放在系统哪里

这四类服务通常分别站在不同位置:

```text
用户浏览器
  -> CDN / Frontend Hosting: Vercel / Netlify
  -> Serverless Functions / Edge Functions
  -> Backend Services: Firebase / Supabase
  -> Database / Auth / Storage / Realtime
```

Vercel 常见位置:

- Next.js 和现代前端应用部署
- 静态页面、SSR、ISR、API Routes、Edge Functions
- 图片优化、预览部署、团队协作

Netlify 常见位置:

- 静态站和 Jamstack 应用部署
- 构建、表单、函数、边缘逻辑、预览环境
- 和 Git 工作流结合较紧

Firebase 常见位置:

- Auth、Firestore / Realtime Database、Storage、Cloud Functions
- 移动端和 Web App 的后端服务
- Google 生态里的分析、推送、托管和云函数

Supabase 常见位置:

- Postgres 数据库、Auth、Storage、Realtime、Edge Functions
- 想用 SQL、关系模型和开源生态的小团队
- 快速搭建 SaaS 后端和管理后台

---

## 常见套餐/使用限制

### 查看方法

看这些平台的免费套餐时,不要只看首页写的 Free。建议按功能拆:

1. 先确认免费计划是否允许商业使用、团队使用和生产使用
2. 看 Usage / Limits / Pricing / Fair use / Quotas 页面
3. 分开查 Hosting、Functions、Database、Storage、Auth、Bandwidth、Build、Logs
4. 查超额后行为:自动计费、暂停、限流、降级、只读,还是要求升级
5. 查预览环境、团队成员、私有项目、审计日志这些协作功能是否受限
6. 查数据导出、备份、区域选择、迁移和删除项目的限制
7. 对核心功能做一次压测或小流量演练,看真实用量会落在哪些计费项上

免费套餐不是一张总表,而是一堆功能额度的组合。对小团队来说,最重要的是找出"最先撞到的那一项"。

### 常见限制维度

Vercel 常见限制维度:

- 构建次数和构建分钟
- Serverless / Edge Functions 调用、运行时间、并发
- 带宽和数据传输
- 图片优化次数和缓存行为
- ISR / SSR 带来的动态渲染成本
- 预览部署、团队成员、项目数量和协作功能
- 日志保留、分析、监控和安全能力

Vercel 适合 Next.js、前端优先、重视预览部署和开发体验的团队。不适合把大量长任务、重计算、稳定后台队列和复杂数据库逻辑都塞进函数里。风险点是 SSR、图片优化和函数调用会在流量上涨时一起放大。

Netlify 常见限制维度:

- 构建分钟和并发构建
- 带宽和请求量
- Functions / Edge Functions 调用与运行限制
- 表单提交、Identity、Large Media 等附加功能
- 预览环境、团队协作和访问控制
- 日志、分析和支持等级

Netlify 适合静态站、文档站、营销站、Jamstack 应用和 Git 驱动发布。不适合重后端、强实时、大量动态 API 或复杂状态服务。风险点是构建资源、带宽、表单/函数等附加功能容易被忽略。

Firebase 常见限制维度:

- Firestore / Realtime Database 读写次数、存储、索引
- Auth 用户、登录方式和安全规则
- Storage 容量、下载流量、对象操作
- Cloud Functions 调用、运行时间、冷启动、区域
- Hosting 带宽、部署和缓存
- 日志、监控、分析、项目配额

Firebase 适合移动端、实时协作、快速验证产品、弱运维团队和 Google 生态项目。不适合复杂关系查询、强 SQL 需求、对云厂商绑定敏感的项目。风险点是 NoSQL 数据模型和安全规则一开始设计错,后面迁移成本很高;读写次数也可能因为页面结构不合理被放大。

Supabase 常见限制维度:

- Postgres 存储、CPU、内存、连接数
- 数据库备份、保留时间、恢复能力
- Auth 用户、邮件发送、第三方登录
- Storage 容量、下载流量、对象操作
- Realtime 连接数、消息量、频道数量
- Edge Functions 调用、运行时间和日志
- 项目暂停、休眠、区域和团队协作限制

Supabase 适合想用 Postgres、SQL、关系数据、RLS 权限和开源生态的小团队。不适合完全不懂数据库设计却直接暴露复杂查询的项目,也不适合把免费数据库当成高并发生产集群。风险点是连接数、慢查询、RLS 规则、备份恢复和免费项目暂停策略。

---

## 小团队建议

选这些平台时,先按应用形态判断:

- 纯静态站、文档、博客、营销页:优先看 Netlify、Cloudflare Pages、Vercel
- Next.js 产品、需要预览部署和 SSR/ISR:优先看 Vercel,同时控制动态渲染
- 移动 App、实时数据、快速后端:可以看 Firebase
- SaaS、管理后台、关系数据、SQL 查询:可以看 Supabase
- 前端部署和后端数据分开:Vercel / Netlify + Supabase / Firebase 是常见组合

保守建议:

- 能静态化就静态化,不要默认 SSR
- 能缓存就缓存,不要让所有请求打到函数和数据库
- 登录态页面和公开页面分开设计
- 数据库访问必须走权限规则和服务端校验
- 免费套餐上线前必须看超额行为
- 核心数据必须确认备份、导出和迁移路径
- 不要把测试环境、预览环境和生产环境混在一个数据库里

一个简单判断:

```text
如果你最关心"部署体验",看 Vercel / Netlify.
如果你最关心"后端能力",看 Firebase / Supabase.
如果你最关心"长期可迁移",优先选择标准协议、SQL、可导出数据和清晰边界.
```

---

## 一句话总结

Vercel、Netlify、Firebase、Supabase 的免费套餐不能只比价格,要按 Hosting、Functions、Database、Storage、Auth、Build、Bandwidth、Logs 分开看,并提前确认适合场景、不适合场景、超额行为和迁移路径。
