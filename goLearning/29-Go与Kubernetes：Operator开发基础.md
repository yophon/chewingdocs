# Go 与 Kubernetes：Operator 开发基础

> **一句话导读**：Operator 的本质是把运维经验写进 Kubernetes 控制循环，让系统持续把“实际状态”修正到“期望状态”。

## 一、为什么需要 Operator

Kubernetes 原生资源已经能管理 Deployment、Service、ConfigMap、Secret、Job 等通用对象。普通无状态服务用这些资源足够了。但遇到有状态系统或复杂运维流程时，单靠 YAML 很难表达完整逻辑：

- Redis/MySQL/Elasticsearch 集群扩缩容。
- 主从切换、故障恢复、备份恢复。
- 证书轮换、配置滚动、版本升级。
- 根据业务状态创建多个下游资源。
- 对外暴露一个更贴近业务的声明式 API。

Operator 就是一个运行在集群里的控制器。用户提交一个自定义资源，例如 `RedisCluster`，Operator 监听它的变化，然后创建 StatefulSet、Service、Secret、PVC 等资源，并持续维护它们。

## 二、Kubernetes 控制器心智

Kubernetes 是声明式系统。用户声明“我希望是什么样”，控制器负责不断调谐。

```text
期望状态：用户提交的 Custom Resource
      |
      v
Reconcile Loop
      |
      | 读取当前实际状态
      | 对比差异
      | 创建、更新、删除资源
      v
实际状态逐步接近期望状态
```

控制器不是事件处理器。它不能假设每个事件只处理一次，也不能假设事件不会丢。正确心智是：每次 Reconcile 都读取最新状态，然后做幂等修正。

Operator 开发的几个关键词：

- **CRD**：CustomResourceDefinition，扩展 Kubernetes API。
- **CR**：Custom Resource，用户创建的自定义资源实例。
- **Controller**：监听资源变化并执行调谐。
- **Reconcile**：控制循环的核心函数。
- **OwnerReference**：声明资源归属，让 K8s 能做级联删除。
- **Status**：记录实际状态，供用户和其他系统观察。
- **Finalizer**：删除前执行清理逻辑。

## 三、用 Kubebuilder 初始化项目

Kubebuilder 是官方生态里最常用的 Operator 脚手架，底层使用 `controller-runtime`。

安装后初始化：

```bash
kubebuilder init \
  --domain example.com \
  --repo github.com/example/redis-operator
```

创建 API 和控制器：

```bash
kubebuilder create api \
  --group cache \
  --version v1alpha1 \
  --kind RedisCluster
```

生成的关键文件：

```text
api/v1alpha1/rediscluster_types.go       # 定义 CRD 的 Spec 和 Status
internal/controller/rediscluster_controller.go
config/crd/                              # CRD YAML
config/rbac/                             # RBAC 权限
config/manager/                          # Operator Deployment
```

常用命令：

```bash
make manifests   # 生成 CRD/RBAC
make generate    # 生成 deepcopy
make install     # 安装 CRD 到当前集群
make run         # 本地运行 controller
make docker-build IMG=example/redis-operator:v0.1.0
make deploy IMG=example/redis-operator:v0.1.0
```

## 四、定义自定义资源

一个简化的 RedisCluster API：

```go
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type RedisClusterSpec struct {
	// Replicas is the desired number of redis pods.
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=3
	Replicas int32 `json:"replicas,omitempty"`

	// Image is the redis image.
	// +kubebuilder:default="redis:7.2"
	Image string `json:"image,omitempty"`

	// StorageSize is the requested PVC size, for example "10Gi".
	// +kubebuilder:validation:Pattern=`^[0-9]+(Mi|Gi)$`
	StorageSize string `json:"storageSize,omitempty"`
}

type RedisClusterStatus struct {
	ReadyReplicas int32              `json:"readyReplicas,omitempty"`
	Phase         string             `json:"phase,omitempty"`
	Conditions    []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Replicas",type=integer,JSONPath=`.spec.replicas`
// +kubebuilder:printcolumn:name="Ready",type=integer,JSONPath=`.status.readyReplicas`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
type RedisCluster struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   RedisClusterSpec   `json:"spec,omitempty"`
	Status RedisClusterStatus `json:"status,omitempty"`
}
```

用户提交的 YAML：

```yaml
apiVersion: cache.example.com/v1alpha1
kind: RedisCluster
metadata:
  name: demo
spec:
  replicas: 3
  image: redis:7.2
  storageSize: 10Gi
```

CRD 字段设计要保守。`spec` 是用户期望，`status` 是系统观察结果。不要让用户手动写 status，也不要把临时运行数据塞进 spec。

## 五、Reconcile 关键实现路径

一个控制器的核心逻辑通常是：

1. 读取 CR。
2. 如果 CR 不存在，说明已删除，直接返回。
3. 处理 finalizer。
4. 构造期望的子资源，例如 StatefulSet、Service。
5. 查询实际子资源是否存在。
6. 不存在就创建，存在就比较并更新。
7. 读取子资源状态，更新 CR status。
8. 必要时 requeue。

示例骨架：

```go
func (r *RedisClusterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx)

	var cluster cachev1alpha1.RedisCluster
	if err := r.Get(ctx, req.NamespacedName, &cluster); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if cluster.ObjectMeta.DeletionTimestamp.IsZero() {
		if !controllerutil.ContainsFinalizer(&cluster, redisFinalizer) {
			controllerutil.AddFinalizer(&cluster, redisFinalizer)
			return ctrl.Result{}, r.Update(ctx, &cluster)
		}
	} else {
		if controllerutil.ContainsFinalizer(&cluster, redisFinalizer) {
			if err := r.cleanupExternalResources(ctx, &cluster); err != nil {
				return ctrl.Result{}, err
			}
			controllerutil.RemoveFinalizer(&cluster, redisFinalizer)
			return ctrl.Result{}, r.Update(ctx, &cluster)
		}
		return ctrl.Result{}, nil
	}

	sts := buildStatefulSet(&cluster)
	if err := controllerutil.SetControllerReference(&cluster, sts, r.Scheme); err != nil {
		return ctrl.Result{}, err
	}

	var existing appsv1.StatefulSet
	err := r.Get(ctx, types.NamespacedName{Name: sts.Name, Namespace: sts.Namespace}, &existing)
	if apierrors.IsNotFound(err) {
		log.Info("creating StatefulSet", "name", sts.Name)
		if err := r.Create(ctx, sts); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
	}
	if err != nil {
		return ctrl.Result{}, err
	}

	if needsUpdate(&existing, sts) {
		existing.Spec = sts.Spec
		if err := r.Update(ctx, &existing); err != nil {
			return ctrl.Result{}, err
		}
	}

	cluster.Status.ReadyReplicas = existing.Status.ReadyReplicas
	cluster.Status.Phase = phaseOf(&cluster, &existing)
	if err := r.Status().Update(ctx, &cluster); err != nil {
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}
```

构造 StatefulSet：

```go
func buildStatefulSet(cluster *cachev1alpha1.RedisCluster) *appsv1.StatefulSet {
	labels := map[string]string{
		"app.kubernetes.io/name":       "redis",
		"app.kubernetes.io/instance":   cluster.Name,
		"app.kubernetes.io/managed-by": "redis-operator",
	}

	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cluster.Name,
			Namespace: cluster.Namespace,
			Labels:    labels,
		},
		Spec: appsv1.StatefulSetSpec{
			ServiceName: cluster.Name,
			Replicas:   ptr.To(cluster.Spec.Replicas),
			Selector: &metav1.LabelSelector{
				MatchLabels: labels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{
						Name:  "redis",
						Image: cluster.Spec.Image,
						Ports: []corev1.ContainerPort{{
							Name:          "redis",
							ContainerPort: 6379,
						}},
					}},
				},
			},
		},
	}
}
```

真实项目里不要直接用 `existing.Spec = desired.Spec` 覆盖一切。要考虑哪些字段由用户管理、哪些字段由 Kubernetes 默认化、哪些字段更新会触发重建。

## 六、Watch、RBAC 与权限

控制器需要声明它管理哪些资源：

```go
func (r *RedisClusterReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&cachev1alpha1.RedisCluster{}).
		Owns(&appsv1.StatefulSet{}).
		Owns(&corev1.Service{}).
		Complete(r)
}
```

`For` 表示监听主资源，`Owns` 表示监听由它拥有的子资源。当 StatefulSet 状态变化时，也会触发对应 RedisCluster 的 Reconcile。

RBAC 注释示例：

```go
// +kubebuilder:rbac:groups=cache.example.com,resources=redisclusters,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=cache.example.com,resources=redisclusters/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=cache.example.com,resources=redisclusters/finalizers,verbs=update
// +kubebuilder:rbac:groups=apps,resources=statefulsets,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch;create;update;patch;delete
```

权限要最小化。不要为了省事给 Operator cluster-admin，生产集群里这会扩大事故半径。

## 七、Status、Condition 与事件

Operator 不只是创建资源，还要让用户知道现在发生了什么。`status.conditions` 是 Kubernetes 里表达状态的通用方式。

```go
meta.SetStatusCondition(&cluster.Status.Conditions, metav1.Condition{
	Type:               "Ready",
	Status:             metav1.ConditionFalse,
	Reason:             "WaitingForReplicas",
	Message:            "waiting for redis replicas to become ready",
	ObservedGeneration: cluster.Generation,
	LastTransitionTime: metav1.Now(),
})
```

同时可以记录 Event：

```go
r.Recorder.Event(&cluster, corev1.EventTypeNormal, "Created", "created StatefulSet")
```

用户排查时会用：

```bash
kubectl get rediscluster demo
kubectl describe rediscluster demo
kubectl get events --sort-by=.lastTimestamp
```

`status` 更新也会触发 watch，要避免因为 status 写入造成无意义的循环。可以先比较是否真的变化，再更新。

## 八、排错与优化

Operator 常见问题：

- **Reconcile 一直循环**：通常是每次都 Update 资源，即使内容没变化。需要做 diff 或使用 server-side apply。
- **权限不足**：看 controller 日志里的 `forbidden`，检查 RBAC 是否包含对应 group/resource/verb。
- **CRD 字段不生效**：忘记 `make manifests` 或没有重新安装 CRD。
- **删除卡住**：finalizer 没有成功移除，检查清理逻辑是否一直报错。
- **OwnerReference 不工作**：子资源 namespace、scheme 或 controller reference 设置不正确。
- **状态覆盖用户变更**：控制器更新 spec 时没有做字段边界，误覆盖了其他控制器或用户管理的字段。

本地调试常用：

```bash
make install
make run
kubectl apply -f config/samples/cache_v1alpha1_rediscluster.yaml
```

测试方面，controller-runtime 提供 envtest，可以在本地启动 API Server 和 etcd 测控制器逻辑：

```go
func TestRedisClusterReconcile(t *testing.T) {
	// 使用 envtest 安装 CRD，创建 RedisCluster，
	// 调用 Reconcile 后断言 StatefulSet 和 Status 是否符合预期。
}
```

生产里还要关注 workqueue 指标、Reconcile 错误率、单次 Reconcile 耗时、API Server 请求量。控制器写得不好，可能对 API Server 造成很大压力。

## 九、生产取舍

不是所有自动化都适合写成 Operator。

适合 Operator 的场景：

- 需要长期持续调谐，而不是一次性脚本。
- 需要把复杂系统抽象成 Kubernetes API。
- 需要响应资源状态变化自动修复。
- 需要跨多个 K8s 资源维护一致性。

不适合的场景：

- 只执行一次的部署动作，用 Helm、Job 或 CI 脚本就够。
- 逻辑依赖大量外部系统但缺少幂等设计。
- 团队还没有能力维护 CRD 兼容性和控制器升级。

CRD 一旦被用户使用，就变成 API，需要像产品接口一样维护兼容性。字段命名、默认值、版本升级、废弃策略都要慎重。

## 十、总结

Operator 是 Kubernetes 扩展能力的核心形态。用 Go 和 controller-runtime 写 Operator，本质是在实现一个可靠的控制循环：读取期望状态，观察实际状态，幂等地修正差异，并把结果写回 status。

写好 Operator 的关键不是会调用 `client.Create`，而是理解声明式 API、幂等 Reconcile、OwnerReference、Finalizer、Status、RBAC 和可观测性。做到这些，你写出来的控制器才不会只是“能跑的脚本”，而是真正能在集群里长期值守的自动化系统。
