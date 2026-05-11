# Go 与 Kubernetes：Operator 开发基础

> **导读**：Kubernetes (K8s)、Docker、Prometheus 全是用 Go 写的。如果你想在云原生领域玩转甚至扩展基础设施，Go 是唯一的门票。

## 一、什么是 Operator？
Kubernetes 原生提供了 Pod, Deployment, Service 等资源。但如果你的业务是一个分布式数据库集群（如 Redis Cluster / MySQL MHA），普通的 Deployment 无法处理主从切换、数据备份等复杂运维逻辑。
**Operator 就是一个运行在 K8s 里的“机器人”**。你把运维知识写成代码（控制器），它时刻监听 K8s 集群状态，自动帮你扩容、备份和处理故障。

## 二、K8s 的声明式 API 机制
K8s 不是命令式的（请帮我新建 3 个 Pod），而是声明式的（我希望系统里存在 3 个 Pod 并且状态正常）。
Operator 的核心是 **Reconciliation Loop（调谐循环）**：
1. 观察（Observe）当前的系统实际状态。
2. 分析（Analyze）实际状态与期望状态的差异。
3. 行动（Act）执行创建/删除/更新，让实际状态趋近期望状态。

## 三、开发利器：Kubebuilder
官方提供了 `kubebuilder` 这个脚手架工具。

1. **初始化项目**：
`kubebuilder init --domain mycompany.com --repo github.com/my/operator`

2. **创建自定义资源 (CRD) 与控制器**：
`kubebuilder create api --group db --version v1alpha1 --kind RedisCluster`
这会为你生成两个核心文件：
- `api/v1alpha1/rediscluster_types.go`: 你在这里定义用户可以在 YAML 里填什么参数。
- `controllers/rediscluster_controller.go`: 你在这里编写核心逻辑，即上述的“调谐循环”。

3. **编写 Reconcile 函数**
在这个函数里，你会使用 Go 调用 `client.Get()` 获取用户的期望配置，然后用 `client.Create()` 通过 K8s API 自动去拉起实际的 StatefulSet 容器组。

掌握了用 Go 写 Operator，你就从“使用云”的工程师，进化成了“改造云”架构师。
