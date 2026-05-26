# Modifier 链与样式系统

SwiftUI 的 modifier 链是 90% 新人踩坑的源头——"为什么 padding 加了没效果"、"为什么 background 包不住"、"为什么 ButtonStyle 写了不生效"。这一篇讲透:**modifier 顺序敏感的根本原因、`ViewModifier` 自定义、`ButtonStyle` / `LabelStyle` / `ToggleStyle` 把样式与逻辑解耦、`PrimitiveButtonStyle` 完全自定义按钮行为**。

> 一句话先记住:**每个 `.someModifier(...)` 不是"改这个 View 的属性",而是"把这个 View 包成一个新的 View"。链式调用从上到下,外层每加一个就再包一层。理解这个,所有"为什么顺序不一样结果不同"的疑问立刻消失。**

---

## 一、Modifier 是包装,不是属性

```swift
Text("Hi")
    .padding()                  // 包一层 _PaddingLayout
    .background(.yellow)        // 再包一层 _BackgroundStyleModifier
    .clipShape(.rect(cornerRadius: 8))   // 再包一层 _ClipShape
```

每个 modifier 的返回类型都是 `some View`,且**类型与原视图不同**。`Text("Hi")` 的真实类型是 `Text`,加了 padding 后是 `ModifiedContent<Text, _PaddingLayout>`,再加 background 是 `ModifiedContent<ModifiedContent<Text, _PaddingLayout>, _BackgroundStyleModifier<...>>`。

外层包内层,**每次包装都按当前组合作为整体**。这就是"顺序敏感"的根本:

```swift
Text("Hi")
    .padding()
    .background(.yellow)
// 顺序:文字 → padding(扩大尺寸)→ yellow(画在扩大后的范围)
// 视觉:黄色背景覆盖到 padding 边缘
```

```swift
Text("Hi")
    .background(.yellow)
    .padding()
// 顺序:文字 → yellow(画在文字范围)→ padding(扩大尺寸)
// 视觉:黄色背景只在文字范围,外面是透明 padding
```

两段代码语义完全不同——前者"带黄色背景的按钮", 后者"黄色文字气泡 + 外圈留白"。

> 这套机制让 SwiftUI 的 modifier 链像函数组合:`view |> padding |> background`。函数式视角看更直观——modifier 是 `(View) -> View` 的函数,链式调用是函数复合。

---

## 二、常用 modifier 的"是否影响布局"

```swift
// 影响布局尺寸:
.padding(...)          // 扩大
.frame(...)            // 设置 / 扩大
.fixedSize()           // 锁自然尺寸
.offset(...)           // 不影响布局,只画在偏移位置
.position(...)         // 改变绝对位置,不影响布局

// 不影响布局,只影响绘制:
.foregroundStyle(...)  // 颜色 / 渐变
.background(...)       // 画在背后
.overlay(...)          // 画在前面
.shadow(...)           // 阴影
.opacity(...)          // 透明度
.scaleEffect(...)      // 视觉缩放(不影响布局)
.rotationEffect(...)   // 视觉旋转
.blur(...)             // 模糊

// 改变行为,不影响布局:
.disabled(true)
.onTapGesture { ... }
.allowsHitTesting(false)
```

**`offset` 与 `position` 的区别**:`offset(x:y:)` 是"在原有布局位置基础上偏移",`position(x:y:)` 是"绝对放在 (x, y)"。后者很少用,通常只在 ZStack 内做特殊定位。

---

## 三、Order 经典坑:`.frame` 与 `.background`

```swift
// ❌ 想要"红色按钮撑满宽度"
Button("提交") { ... }
    .background(.red)
    .frame(maxWidth: .infinity)
// 红色背景只在按钮自然尺寸范围,外面 frame 是透明
```

```swift
// ✅
Button("提交") { ... }
    .frame(maxWidth: .infinity)
    .background(.red)
// frame 先扩到全宽,然后红色背景画在全宽范围
```

口诀:**先 frame 再 background**(基本所有场景)。

`buttonStyle(.borderedProminent)` 这种系统样式会自带背景,顺序要小心:

```swift
Button("提交") { ... }
    .buttonStyle(.borderedProminent)
    .frame(maxWidth: .infinity)
// .borderedProminent 内部已经画了背景,frame 在外面扩展不会扩展背景
// 想要全宽按钮:在 button label 上 .frame(maxWidth: .infinity)
```

```swift
// ✅ 正确写法
Button {
    ...
} label: {
    Text("提交").frame(maxWidth: .infinity)   // 让 label 内容撑宽
}
.buttonStyle(.borderedProminent)
```

---

## 四、自定义 ViewModifier

重复 modifier 链可以提炼成 `ViewModifier`:

```swift
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(.regularMaterial)
            .clipShape(.rect(cornerRadius: 12))
            .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }
}

// 使用
VStack { ... }
    .cardStyle()
```

`ViewModifier` 协议要求实现 `body(content:)`,`content` 参数代表"被这个 modifier 包装的 View"。`extension View` 加便捷方法是约定。

带参数的 modifier:

```swift
struct ShakeEffect: ViewModifier {
    var trigger: Bool
    func body(content: Content) -> some View {
        content.offset(x: trigger ? -8 : 0)
            .animation(.easeInOut(duration: 0.1).repeatCount(3, autoreverses: true), value: trigger)
    }
}

extension View {
    func shake(_ trigger: Bool) -> some View {
        modifier(ShakeEffect(trigger: trigger))
    }
}
```

**何时该写 ViewModifier**:重复 3 次以上的 modifier 链;或者参数化的视觉效果(shadow level、card variant)。一次性的就别封装。

---

## 五、ButtonStyle:把"长什么样"与"做什么事"分开

UIKit 时代,`UIButton` 是个庞然大物——视觉 + 行为 + 状态 + accessibility 全在一个类里。SwiftUI 把这件事拆了:**`Button` 本身只管行为(action),`ButtonStyle` 管视觉**。

```swift
Button("提交") { handleSubmit() }
    .buttonStyle(.borderedProminent)
    .controlSize(.large)
```

系统提供的样式:`.plain` / `.bordered` / `.borderedProminent` / `.borderless`。自定义 ButtonStyle:

```swift
struct PillButtonStyle: ButtonStyle {
    var color: Color = .blue
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(
                Capsule().fill(color.opacity(configuration.isPressed ? 0.6 : 1.0))
            )
            .foregroundStyle(.white)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

// 使用
Button("订阅") { ... }
    .buttonStyle(PillButtonStyle(color: .pink))
```

`Configuration` 包含两件事:
- **`label`**:你写的 button label(任何 View)
- **`isPressed`**:当前是否被按下(可以加按压动画)

这套分离的好处:**Button 的事件处理(包括 accessibility / 长按 / 键盘等)由系统负责,你只画样子**。直接写 `Text("提交").onTapGesture { ... }` 就会失去所有这些——只是个能点的文字,不是按钮。

---

## 六、PrimitiveButtonStyle:完全自定义行为

普通 `ButtonStyle` 只能改样式,不能改"什么算点击"。要完全自定义行为(比如双击触发、长按取消、滑动确认),用 `PrimitiveButtonStyle`:

```swift
struct LongPressConfirmStyle: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding()
            .background(.red)
            .foregroundStyle(.white)
            .clipShape(.capsule)
            .onLongPressGesture(minimumDuration: 1.0) {
                configuration.trigger()   // 手动触发原 button 的 action
            }
    }
}

Button("长按删除") {
    delete()
}
.buttonStyle(LongPressConfirmStyle())
```

`configuration.trigger()` 是触发 button 原本的 action。`PrimitiveButtonStyle` 给你完全控制权——你可以从手势、定时器、外部事件触发,不一定要 tap。

---

## 七、LabelStyle / ToggleStyle / 其他 style 协议

`Label` 是"图标 + 文字"组合,`LabelStyle` 决定怎么排:

```swift
Label("收藏", systemImage: "star.fill")
    .labelStyle(.titleAndIcon)   // 默认:图标 + 文字
    .labelStyle(.iconOnly)        // 只图标
    .labelStyle(.titleOnly)       // 只文字
```

自定义 LabelStyle 让图标在文字上方:

```swift
struct VerticalLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack(spacing: 4) {
            configuration.icon
            configuration.title.font(.caption)
        }
    }
}

Label("收藏", systemImage: "star.fill")
    .labelStyle(VerticalLabelStyle())
```

ToggleStyle:

```swift
Toggle("通知", isOn: $enabled)
    .toggleStyle(.switch)   // 系统开关(默认)
    .toggleStyle(.button)   // 按钮形态
```

类似的还有 `PickerStyle` / `ProgressViewStyle` / `MenuStyle` / `GroupBoxStyle` / `DatePickerStyle`,模式一致:协议 `makeBody(configuration:) -> some View`。

---

## 八、Environment 控制视觉:`.controlSize` / `.tint` / `.font`

很多视觉属性通过 environment 一次性影响一片视图:

```swift
VStack {
    Button("A") { }
    Button("B") { }
    Button("C") { }
}
.buttonStyle(.borderedProminent)
.controlSize(.large)
.tint(.purple)
.font(.headline)
// 三个按钮全是大号、紫色、headline 字体
```

`.tint` 是系统的"主题色",`Button` / `Toggle` / `ProgressView` 都会响应。`.font` 设置后,所有 `Text` 在此环境下继承(除非自己覆盖)。

`.environment(\.someKey, value)` 自定义环境注入(06 篇讲过)。

```swift
// 整个表单都用 .leading 对齐
Form { ... }
    .environment(\.multilineTextAlignment, .leading)
```

---

## 九、与 CSS 样式系统的对照

| 概念 | SwiftUI | CSS |
| --- | --- | --- |
| 应用样式 | `.modifier()` 链 | class / inline style |
| 主题色 | `.tint(.purple)` 环境 | `--primary` CSS 变量 |
| 字体继承 | `.font(.headline)` 环境 | `inherit` |
| 顺序敏感 | 严格(包装语义) | cascade(specificity) |
| 媒体查询 | `@Environment(\.dynamicTypeSize)` 等 | media query |
| 组件样式 | `ButtonStyle` 协议 | `:host` / shadow DOM |
| 状态样式 | `configuration.isPressed` | `:hover` / `:active` |

**SwiftUI 的样式系统更接近"函数组合"而不是"CSS cascade"**。每个 modifier 是显式的、有顺序的、有副作用的;CSS 是声明的、按 specificity 合并的。SwiftUI 没有 "样式表" 概念,样式直接绑在视图描述上。

---

## 十、shape 与 stroke / fill 组合

形状(`Rectangle` / `Circle` / `Capsule` / `RoundedRectangle`)是 View,可以 fill / stroke / 双层叠加:

```swift
Circle()
    .fill(.blue)
    .frame(width: 40, height: 40)

Circle()
    .stroke(.gray, lineWidth: 2)

// fill + stroke 组合
ZStack {
    Circle().fill(.blue.opacity(0.2))
    Circle().stroke(.blue, lineWidth: 2)
}

// 渐变填充
Rectangle()
    .fill(.linearGradient(colors: [.purple, .pink], startPoint: .top, endPoint: .bottom))
```

`.clipShape(_:)` 把视图按形状裁剪:

```swift
Image("avatar")
    .resizable()
    .clipShape(.circle)

VStack { ... }
    .clipShape(.rect(cornerRadius: 12))
```

iOS 17+ 的 `RoundedRectangle` 推荐写法是 `.rect(cornerRadius:)`(`Shape` 简化语法)。

---

## 十一、踩坑

1. **`padding` 加了但视觉上没变化**——通常因为父布局已经把你撑满,padding 改变的是子尺寸建议,但外层布局没给更多空间。检查父布局是否 `frame(maxWidth: .infinity)`。
2. **`background` 不撑全宽**——`frame(maxWidth: .infinity)` 应该在 `background` 之前。
3. **`Button` 加 `.onTapGesture`**——会覆盖 Button 自己的 tap 行为,导致 button accessibility / 长按 / 键盘等失效。Button 的事件改写应该在 button action 里,不要外面再加手势。
4. **`scaleEffect` / `rotationEffect` 期望影响布局**——它们只改绘制不改布局,周围视图不会因为它放大而被推开。要影响布局用 `frame`。
5. **`offset` 把视图移出可见区**——offset 不改父尺寸,所以视觉上看不见了但点击区域还在原位置。配合 `clipped()` 可避免。
6. **`background` / `overlay` 想要在父视图位置画**——它们画在被它修饰的视图上,不是父视图。要画整页的背景在最外层 ZStack 里加 `Color.gray.ignoresSafeArea()`。
7. **`.foregroundColor` 是 deprecated**——iOS 15+ 改用 `.foregroundStyle`,支持渐变、Material、半透明等。
8. **`buttonStyle(.borderedProminent)` 套 frame 期望按钮全宽**——`.borderedProminent` 是按 label 自然尺寸 + 内边距画的。要全宽,在 label 上 `.frame(maxWidth: .infinity)`。
9. **ViewModifier 自定义带状态**——`ViewModifier` 是值类型,内部不能有 `@State`。要有内部状态,在 modifier 里包一个有 `@State` 的 wrapper View。
10. **`.disabled(true)` 子视图仍然可点**——`.disabled` 是 environment 传播的,但某些第三方手势包不会响应。系统组件都会响应。

---

下一篇 `09-动画与共享元素.md`,讲 `withAnimation` 显式动画与隐式动画的边界、`Animation.spring` / `easeInOut` 选哪个、`transaction` 控制动画上下文、`matchedGeometryEffect` 共享元素过渡、`PhaseAnimator` 与 `KeyframeAnimator` (iOS 17+)、`TimelineView` 时间驱动动画。
