# MVVM:ViewModel、数据绑定与响应式 UI

很多界面代码最烦的不是业务复杂,而是同步状态:输入框改了要更新对象,对象改了要刷新按钮,请求中要显示 loading,失败要显示错误,保存成功又要清空表单。手写这些同步逻辑,很容易漏一个分支。

MVVM 的核心就是用 ViewModel 表达页面状态和操作,再通过数据绑定或响应式机制让 View 自动跟随状态变化。它是应用架构模式,不是 GoF 设计模式。

## 一、问题

传统写法经常是命令式更新 UI:

```ts
nameInput.value = user.name;
saveButton.disabled = loading;
errorBox.textContent = error;
```

状态越来越多后,你要记住每次变化时更新哪些控件。变化点是"界面状态和展示规则会变多"。稳定点是"View 应该反映某个可观察状态"。

MVVM 把页面所需状态集中到 ViewModel:

```text
View <-> ViewModel -> Model
```

View 绑定 ViewModel,用户操作调用 ViewModel 的命令,ViewModel 再调用 Model 或服务。

## 二、模式

MVVM 的分工:

- Model:业务数据、领域规则、数据访问
- View:声明界面结构和绑定关系
- ViewModel:面向 View 的状态、命令、派生数据
- Binding/Reactive System:把 ViewModel 变化同步到 View

ViewModel 不是 Model 的复制品。它是为了某个界面组织出来的状态模型,可以包含 loading、error、selected、canSubmit 等 UI 状态。

## 三、示例

用 TypeScript 写一个极简 ViewModel:

```ts
type User = { name: string; points: number };

class UserViewModel {
  user: User | null = null;
  loading = false;
  error = "";

  constructor(private repo: { load(): Promise<User> }) {}

  get level() {
    return (this.user?.points ?? 0) >= 1000 ? "vip" : "normal";
  }

  get canShowUser() {
    return !this.loading && this.user !== null;
  }

  async load() {
    this.loading = true;
    this.error = "";
    try {
      this.user = await this.repo.load();
    } catch {
      this.error = "load failed";
    } finally {
      this.loading = false;
    }
  }
}
```

在 Vue、WPF、SwiftUI、Flutter、Angular 或带 signals 的框架里,View 会绑定这些状态。状态变了,View 自动刷新。不同框架语法不同,但心智类似。

## 四、MVVM 和 MVC/MVP 的边界

MVC 强调 Model、View、Controller 分离,Controller 处理输入并协调更新。

MVP 强调 Presenter 直接指挥 View,View 通常被动。

MVVM 强调 View 绑定 ViewModel,ViewModel 暴露状态和命令,不直接操作具体控件。ViewModel 不应该知道按钮、DOM、Activity 的具体类型。

一句话区分:

- MVC:Controller 接收输入并协调
- MVP:Presenter 调用 View 接口更新界面
- MVVM:View 绑定 ViewModel 状态,响应式刷新

## 五、落地判断

适合 MVVM 的信号:

- 页面状态多,手动同步 UI 容易漏
- 框架支持数据绑定、响应式或可观察状态
- 页面需要清晰表达 loading、error、empty、editing 等状态
- 展示派生数据多,例如 `canSubmit`、`totalPrice`、`isDirty`

不适合的信号:

- 页面只是一次性展示静态数据
- 框架没有绑定能力,强行实现成本太高
- ViewModel 开始承载大量领域规则
- 团队把双向绑定当成任意共享状态

ViewModel 应该面向界面,但业务规则仍应下沉到 Model、领域服务或用例层。比如"按钮是否置灰"可以在 ViewModel,但"用户是否有退款资格"最好在业务层。

## 六、代价与误用

MVVM 的代价主要来自绑定和响应式系统。

常见误用:

第一,ViewModel 变成巨型对象。一个页面所有状态、所有请求、所有弹窗都塞进去,最后很难测试和维护。

第二,双向绑定滥用。任何地方都能改状态,数据流就会变得不可追踪。复杂场景更适合单向数据流或明确 command。

第三,派生状态和源状态混乱。能通过 `totalPrice` 计算出来的值,就不要再单独存一份,否则迟早不同步。

第四,忽略生命周期和取消。页面离开后异步请求返回,仍然更新 ViewModel,可能造成闪烁、泄漏或覆盖新状态。

第五,把 ViewModel 当 DTO。DTO 只是传输数据,ViewModel 要表达界面行为、派生状态和交互命令。

## 七、落地建议

一个可维护的 ViewModel 通常有四类成员:

- 源状态:用户输入、服务端数据、本地选择
- 派生状态:是否可提交、总价、展示文案
- 命令:加载、保存、删除、切换
- 副作用边界:调用 API、导航、弹窗、埋点

其中副作用边界要收敛,不要让响应式计算里偷偷发请求。

## 八、一句话总结

MVVM 的核心是用 ViewModel 承载界面状态和命令,让 View 通过绑定自动反映状态。它适合状态同步复杂的 UI,但要防止 ViewModel 变成新的上帝对象。
