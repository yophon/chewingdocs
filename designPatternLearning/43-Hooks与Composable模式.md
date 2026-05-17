# Hooks与Composable模式:逻辑复用的新默认

前端逻辑复用曾经有很多绕法:Mixin、Render Props、HOC、继承基类.它们都能复用,但很容易让数据来源变得不透明.一个组件明明只写了几行,状态却从 mixin、父组件、包装组件里冒出来,调试时像拆套娃.

Hooks / Composable 的核心价值是:**把一段有状态逻辑封装成普通函数,让调用点直接暴露依赖和返回值**.

---

## 一、问题:逻辑复用和组件树耦合在一起

例如多个页面都要处理分页查询:

```ts
function OrderPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const orders = useQuery(["orders", page, keyword], () =>
    api.getOrders({ page, keyword })
  );

  return <OrderTable data={orders.data ?? []} onPageChange={setPage} />;
}
```

下一个页面也要同样逻辑,复制一份.再下一个页面要加防抖、错误提示、URL 同步,重复逻辑就开始发散.

变化点是"不同资源的查询参数、接口、展示方式",稳定点是"分页、筛选、加载、错误、刷新这些交互模型".

---

## 二、模式:把状态逻辑抽成可组合函数

React 里通常叫 Hook,Vue 里通常叫 Composable.结构大致相同:

```text
useXxx / useXxxModel
  -> 接收稳定依赖或配置
  -> 内部管理状态和副作用
  -> 返回状态 + 命令
```

TypeScript 示例:

```ts
type PageResult<T> = {
  items: T[];
  total: number;
};

function usePagedQuery<T>(queryFn: (page: number) => Promise<PageResult<T>>) {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["paged", queryFn, page],
    queryFn: () => queryFn(page),
  });

  return {
    page,
    setPage,
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    refresh: query.refetch,
  };
}
```

页面使用:

```ts
function OrderPage() {
  const orders = usePagedQuery((page) => api.getOrders({ page }));

  return (
    <OrderTable
      data={orders.items}
      page={orders.page}
      total={orders.total}
      loading={orders.loading}
      onPageChange={orders.setPage}
    />
  );
}
```

复用的是"分页查询模型",不是 UI.

---

## 三、Hooks / Composable 适合封装什么

适合封装:

- 有状态的业务逻辑:选择、筛选、分页、编辑会话.
- 外部资源接入:请求、WebSocket、localStorage、媒体查询.
- 副作用生命周期:订阅、计时器、键盘事件.
- 页面 ViewModel:把接口数据整理成 UI 需要的形状.

不适合封装:

- 只有一行的普通表达式.
- 只为隐藏 if-else 的函数,但没有复用或隔离价值.
- UI 结构本身,那应该是组件.
- 业务规则核心,那可能应该进 domain service,避免绑死框架运行时.

一个有用的命名习惯:

```text
useAuth          -> 应用级上下文
useOrdersQuery   -> 服务端状态
useOrderEditor   -> 编辑会话
useOrderPageModel -> 页面编排模型
```

名字要暴露它管理的状态边界.

---

## 四、落地判断:依赖要显式,返回要稳定

一个好的 Hook / Composable 有两个特征:

**第一,依赖显式**.不要在内部偷偷读太多全局状态.

```ts
// 不好:内部暗中依赖当前路由和全局用户
function useOrders() {}

// 更好:关键变化点从参数传入
function useOrders(params: { userId: string; status?: string }) {}
```

**第二,返回稳定的业务语义**.页面不应该知道太多接口字段.

```ts
function useOrderEditor(orderId: string) {
  const order = useOrderQuery(orderId);
  const mutation = useSaveOrderMutation();

  return {
    loading: order.isLoading,
    draft: order.data,
    canSave: order.data?.status === "draft",
    save: mutation.mutate,
  };
}
```

这更像页面的 ViewModel,让组件面对的是"能不能保存",不是"订单状态字段等于什么字符串".

---

## 五、代价与误用

Hooks / Composable 最大的误用是"把所有东西都抽成 useXxx".抽完以后页面只剩:

```ts
const a = useA();
const b = useB();
const c = useC(a, b);
```

看起来干净,实际依赖关系散落在多个函数里.抽象没有减少复杂度,只是把复杂度搬走了.

常见问题:

- 闭包过期:回调捕获了旧状态.
- 依赖数组错误:副作用执行次数不符合预期.
- 返回对象不稳定:导致子组件频繁渲染.
- 违反调用规则:条件分支里调用 Hook.
- 过度框架绑定:业务规则难以在非 UI 环境测试.

替代方案:

- 无状态纯逻辑,用普通函数.
- 跨页面业务流程,用 service 或 use case.
- 复杂有限状态,用状态机.
- 只复用 UI,用组件而不是 Hook.

---

## 六、一句话总结

> **Hooks / Composable 是逻辑复用的新默认,但不是抽象的借口**.它适合封装有状态逻辑和副作用边界,核心标准是依赖清楚、返回语义稳定、测试成本没有被抬高.
