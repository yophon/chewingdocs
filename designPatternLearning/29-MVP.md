# MVP:Presenter 为什么适合测试,又为什么少见了

很多 UI 代码难测试,不是因为测试工具差,而是因为业务判断直接写在 View 里。按钮点击后查数据、判断状态、格式化文案、控制显示隐藏,全部混在 Activity、Fragment、WinForm、页面组件里。最后只能靠端到端测试点来点去。

MVP 的出发点是把展示逻辑从 View 里拿出来。它也是应用架构模式,不是 GoF 设计模式。它解决的是 UI 层分工,不是某个局部对象创建或行为替换问题。

## 一、问题

典型坏味道:

```ts
button.onclick = async () => {
  const user = await api.loadUser();
  nameText.textContent = user.name;
  vipBadge.hidden = user.points < 1000;
  errorBox.hidden = true;
};
```

这段代码依赖真实 DOM 或 UI 控件,测试很重。变化点是"展示规则和 UI 技术会变化"。稳定点是"某个用户状态应该展示成什么结果"。

MVP 用 Presenter 承担展示逻辑,View 变成被动接口。

## 二、模式

MVP 的基本分工:

- Model:业务数据和业务能力
- View:只暴露显示接口和用户事件,尽量被动
- Presenter:响应 View 事件,调用 Model,决定让 View 怎么显示

结构上通常是:

```text
View -> Presenter -> Model
View <- Presenter
```

Presenter 持有 View 接口,但不依赖具体 UI 框架。这样 Presenter 可以用假的 View 做单元测试。

## 三、示例

TypeScript 示例:

```ts
interface UserView {
  showName(name: string): void;
  showVipBadge(visible: boolean): void;
  showError(message: string): void;
}

class UserPresenter {
  constructor(
    private view: UserView,
    private repo: { loadUser(): Promise<{ name: string; points: number }> },
  ) {}

  async load() {
    try {
      const user = await this.repo.loadUser();
      this.view.showName(user.name);
      this.view.showVipBadge(user.points >= 1000);
    } catch {
      this.view.showError("load failed");
    }
  }
}
```

测试时不需要启动浏览器:

```ts
const calls: string[] = [];
const view: UserView = {
  showName: name => calls.push(`name:${name}`),
  showVipBadge: visible => calls.push(`vip:${visible}`),
  showError: message => calls.push(`error:${message}`),
};
```

这就是 MVP 的主要收益:把 UI 框架依赖挡在 View 外面,让展示决策可以单测。

## 四、MVP 和 MVC 的边界

MVC 里 Controller 通常处理输入并选择 Model / View,View 可以更主动,不同实现差异很大。

MVP 里 Presenter 更像 View 的幕后控制者。View 尽量薄,只负责把用户动作转发给 Presenter,再按 Presenter 指令更新界面。

简单说:MVC 的 Controller 偏请求/输入协调,MVP 的 Presenter 偏展示逻辑组织。

在 Android 早期、桌面 GUI、复杂表单页面里,MVP 曾经很流行,因为 View 难测,Presenter 可测。

## 五、为什么现在少见了

MVP 少见,不是因为它没价值,而是很多现代 UI 框架改变了问题形状。

React、Vue、SwiftUI、Flutter 等框架把 UI 表达成状态的函数或声明式结构。状态变化后,框架负责刷新界面。很多 Presenter 的工作被组件、Hook、Composable、ViewModel 或状态管理库吸收了。

另外,MVP 容易产生大量接口和转发代码。页面多了以后,`UserView`、`UserPresenter`、`UserContract` 这类样板会很重。

但在遗留 UI、强测试要求、View 很难替换或很难单测的环境里,MVP 仍然有效。

## 六、落地判断

适合 MVP 的信号:

- UI 框架对象很重,难以单元测试
- 页面展示逻辑复杂,但不想放在 View
- 同一展示逻辑要适配多个 View
- 团队能接受 View 接口和 Presenter 的样板

不适合的信号:

- 使用声明式 UI,组件测试已经足够轻
- 页面很简单,拆 Presenter 只增加文件
- 业务逻辑本该在领域层,却被误塞进 Presenter

Presenter 不应该变成业务层。它可以决定"显示哪个文案、哪个按钮可见",但不应该决定"订单能不能退款"这种核心业务规则。

## 七、代价与误用

MVP 的主要代价是样板代码和同步成本。View 接口一变,Presenter 和测试都要跟着变。

常见误用:

第一,Presenter 过厚。它既写展示逻辑,又写业务规则,又拼 SQL,最后只是换了个名字的 Controller。

第二,View 接口太细。每个 label 一个方法,每个小状态一个方法,Presenter 调用像脚本一样脆弱。

第三,忽略生命周期。移动端页面销毁后,Presenter 的异步回调还在更新 View,会导致内存泄漏或崩溃。

第四,为了测试而过度抽象。简单组件用框架自带测试工具就够,不必强行 MVP。

## 八、一句话总结

MVP 的核心是让 View 被动,让 Presenter 承担可测试的展示逻辑。它适合重 UI 和强测试场景,但在现代声明式 UI 中常被 ViewModel、组件状态和响应式机制替代。
