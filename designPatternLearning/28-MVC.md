# MVC:Model、View、Controller 到底分什么

MVC 经常被讲成三句话:Model 管数据,View 管页面,Controller 管逻辑。这个说法太粗,也容易误导。很多项目最后会变成 Controller 又厚又乱,Model 只剩数据库字段,View 里塞业务判断,名义上叫 MVC,实际只是文件夹分层。

先把边界说清楚:MVC 是应用架构模式,不是 GoF 设计模式。GoF 模式主要解决类和对象协作的局部结构,MVC 解决的是一个应用如何把输入、状态和展示分开。

## 一、问题

没有 MVC 时,常见坏味道是 UI、业务状态、用户输入混在一起:

```ts
button.onclick = async () => {
  const user = await fetchUser(input.value);
  if (user.vip) {
    page.innerHTML = "<b>VIP</b>";
  } else {
    page.innerHTML = "<span>Normal</span>";
  }
};
```

这段代码小的时候没问题,但一旦要测试业务规则、替换页面、复用数据逻辑,就会很难。

变化点是"展示形式和输入方式会变化"。稳定点是"业务状态和业务规则应该相对独立"。

## 二、模式

MVC 的基本分工:

- Model:业务状态和业务规则,不应该依赖具体 UI
- View:展示 Model,接收用户可见的交互
- Controller:处理输入,调用 Model,选择 View 或更新 View

一个简化结构:

```text
User Input -> Controller -> Model
                     \-> View
```

在服务端 Web 里,Controller 接收 HTTP 请求,调用业务逻辑,返回模板或 JSON。View 可能是服务端模板,也可能是前端页面。Model 不等于数据库表,它应该表达业务状态和规则。

## 三、示例

以一个极简 TypeScript 服务端结构为例:

```ts
class UserModel {
  constructor(public name: string, public points: number) {}

  level() {
    return this.points >= 1000 ? "vip" : "normal";
  }
}

class UserController {
  async show(id: string) {
    const row = await userRepo.findById(id);
    const user = new UserModel(row.name, row.points);
    return renderUserView(user);
  }
}

function renderUserView(user: UserModel) {
  return `<h1>${user.name}</h1><p>${user.level()}</p>`;
}
```

这里 `level` 不应该写在 HTML 模板里,也不应该散落在 Controller 里。它属于 Model 的业务语义。

## 四、MVC 的不同版本

MVC 在不同生态里含义不完全一样。

经典桌面 MVC 里,View 可能观察 Model,Model 变化后通知 View。Controller 处理用户输入。

服务端 Web MVC 里,Controller 接收请求,Model 处理状态,View 渲染响应。一次请求结束后,View 通常不会持续观察 Model。

前端框架里,传统 MVC 边界经常被组件、状态管理、响应式系统重塑。React/Vue 项目不一定直接叫 MVC,但仍然会遇到同一个问题:状态、输入、展示怎么分。

所以不要背某个唯一版本。你要看它在当前技术栈里保护的变化点是什么。

## 五、落地判断

MVC 适合解决这些问题:

- 页面输入和业务状态混在一起
- Controller 里开始堆业务规则
- View 里出现大量业务判断
- 同一业务能力要被多种入口复用

判断边界时可以问三句话:

- 这段代码没有 UI 时还成立吗?成立就更靠近 Model
- 这段代码只负责把数据变成可见结构吗?是就更靠近 View
- 这段代码在翻译输入并协调调用吗?是就更靠近 Controller

## 六、代价与误用

MVC 的代价是需要维护边界。小页面硬拆三层,会让代码变啰嗦。但项目变大后,没有边界更贵。

常见误用:

第一,把 Model 当成数据库表。真正的业务规则没有地方放,最后全进 Controller。

第二,Controller 变成上帝对象。鉴权、事务、业务规则、数据组装、渲染选择全写在一个方法里。

第三,View 里写业务判断。模板里可以有展示判断,但不应该决定业务规则。

第四,把 MVC 和 GoF 模式混为一类。MVC 是应用架构切分,不是单个对象协作模式。

## 七、一句话总结

MVC 的核心不是三个文件夹,而是把业务状态、用户输入和展示输出分开。Model 不等于表,Controller 不等于业务层,View 不应该承载业务决策。
