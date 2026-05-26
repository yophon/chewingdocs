# 布局:Stack、Grid 与 Layout 协议

SwiftUI 的布局系统跟 UIKit Auto Layout 完全是两套——前者是"父问子需要多大,子告诉父,父分配空间",后者是"约束求解器"。这一篇讲清 **proposal-response 心智**、Stack 家族、Grid、LazyStack、`Spacer` 的真实行为、`Layout` 自定义协议入门。

> 一句话先记住:**SwiftUI 布局是"父提议尺寸,子返回我要多大,父再给最终位置"的三步循环——`HStack` 把可用宽度分给子视图,每个子视图说"我要这么多",`HStack` 再决定每个的实际宽度与 x 坐标。理解这套循环,布局问题就再没有玄学。**

---

## 一、proposal-response 模型

```
父视图
  │
  │ ProposedViewSize(width: 320, height: 200)   ← "你大概有这么大空间"
  ↓
子视图(`sizeThatFits` 等价行为)
  │
  │ CGSize(width: 200, height: 80)              ← "我想要这么大"
  ↓
父视图
  │
  │ 决定子视图最终的 frame 与位置
  ↓
渲染
```

每个 View 在布局期接收**父提议的尺寸**(`ProposedViewSize`,可能是 `nil` / `infinity` / 具体数值的组合),返回**自己想要的尺寸**。父视图收到所有子的回答后,综合可用空间分配最终位置。

`ProposedViewSize` 三种特殊值:

| 值 | 含义 |
| --- | --- |
| `nil` | "你自己说了算"——子视图按自然尺寸返回 |
| `.zero` | "你尽可能小"——子视图返回最小可能尺寸 |
| `.infinity` | "你尽可能大"——子视图返回最大可能尺寸 |

`Text("Hi")` 默认按文字自然尺寸;`Spacer()` 在父提议 infinity 时返回 infinity;`Color.red` 默认按提议返回(撑满父空间)。

> 这套模型最反直觉的点:**SwiftUI 不像 Auto Layout 那样"求解约束"。它是单向自顶向下问尺寸,所以不会有"约束冲突"这种 bug,但会有"我以为它会撑满,结果它只占自然大小"这类问题——通常用 `frame(maxWidth: .infinity)` 解决。**

---

## 二、HStack / VStack / ZStack:三种基本组合

```swift
HStack { Text("A"); Text("B"); Text("C") }     // 横排
VStack { Text("A"); Text("B"); Text("C") }     // 纵排
ZStack { Color.red; Text("Hello") }            // 层叠(后写的在上)
```

三个 Stack 的核心参数:

```swift
HStack(alignment: .top, spacing: 8) { ... }
VStack(alignment: .leading, spacing: 12) { ... }
ZStack(alignment: .topLeading) { ... }
```

- **`alignment`**:垂直方向上(对 HStack 而言)子视图的对齐方式——`.top` / `.center` / `.bottom` / `.firstTextBaseline`。
- **`spacing`**:子视图之间的间隔。不写时 SwiftUI 用默认间距(根据语义计算)。

HStack 分配宽度的规则:**先满足所有"固定"或"自然"宽度的子视图,剩下的宽度按"flexible"子视图比例分**:

```swift
HStack {
    Text("固定")                       // 自然宽度
    Spacer()                           // 占满剩余
    Text("固定")                       // 自然宽度
}
// "固定" 文字撑自然宽,中间 Spacer 把剩下吃光
```

```swift
HStack {
    Color.red.frame(maxWidth: .infinity)
    Color.blue.frame(maxWidth: .infinity)
    Color.green.frame(maxWidth: .infinity)
}
// 三个 Color 平分宽度,因为它们都声明 "最大宽度无穷"
```

---

## 三、Spacer 不是固定大小,是"弹性空间"

`Spacer()` 在父提议 infinity 时返回 infinity,在父提议有限时返回提议值。它**不是"插一个 8pt 的空白"**,是"占据所有剩余空间"。

```swift
HStack {
    Text("L")
    Spacer()
    Text("R")
}
// L 和 R 被推到两端,中间全是 Spacer 撑开
```

```swift
HStack {
    Spacer()
    Text("居中")
    Spacer()
}
// 文字水平居中
```

**多个 Spacer 平分剩余空间**:

```swift
HStack {
    Spacer()
    Text("A")
    Spacer()
    Spacer()
    Text("B")
    Spacer()
}
// A 在左 1/3 位置,B 在右 1/3 位置
```

Spacer 有最小尺寸参数,常用于强制某个最小间隔:

```swift
HStack {
    Text("L")
    Spacer(minLength: 40)   // 至少 40pt 间隔
    Text("R")
}
```

---

## 四、frame:声明视图的"理想尺寸"

`frame` 是布局系统里最常用的 modifier,但**它的语义不是"我就是这么大"**,是"我建议子视图按这个大小,然后我自己也按这个大小返回":

```swift
Text("Hi").frame(width: 100, height: 40)      // 给 Text 提议 100×40
```

`maxWidth: .infinity` 表示"尽可能大":

```swift
Text("Hi")
    .frame(maxWidth: .infinity)
    .background(.yellow)
// Text 仍然是自然宽度,但它"声明能伸到 infinity",所以背景撑满父宽
```

`frame` 还有 `minWidth` / `minHeight` / `idealWidth` / `idealHeight`,但实际工程中 99% 只用 `width/height` 与 `maxWidth/maxHeight`:

```swift
// 常见场景:按钮要撑满宽度
Button("提交") { ... }
    .frame(maxWidth: .infinity)
    .buttonStyle(.borderedProminent)

// 头像固定尺寸
Image("avatar")
    .resizable()
    .frame(width: 48, height: 48)
    .clipShape(.circle)

// 卡片限制最大宽度
VStack { ... }
    .frame(maxWidth: 600)        // 宽屏 iPad 上不要拉太宽
    .padding()
```

---

## 五、fixedSize:打破"撑满"默认

某些场景子视图明明声明了自然大小,父视图还是把它撑大。比如 `Text` 默认会换行填满给的空间:

```swift
VStack {
    Text("一段很长的文字,默认在 VStack 里会按 VStack 宽度换行,行数变多。")
}
.frame(width: 200)
// Text 会换 3-4 行
```

要让 Text **按自己自然单行宽度,绝不换行**,加 `fixedSize`:

```swift
Text("...").fixedSize(horizontal: true, vertical: false)
// 横向不接受父建议,按自然宽度返回(可能超出父空间)
```

`fixedSize` 是布局里的"反向开关",告诉父视图"忽略你的提议,我按自然尺寸说话"。常见于:`Toggle` 标签、按钮里的图标 + 文字组合。

---

## 六、padding 与 background 顺序敏感

Modifier 在 SwiftUI 是**外层包内层**,顺序极其重要:

```swift
Text("Hi")
    .padding()
    .background(.yellow)
// 先 padding 一圈再画 yellow,所以黄色背景包到 padding 边缘

Text("Hi")
    .background(.yellow)
    .padding()
// 先画 yellow 再 padding,所以黄色背景只在文字周围,padding 在外
```

```swift
Text("Hi")
    .padding(20)
    .background(.yellow)
    .padding(10)
    .background(.red)
// 红 → 10pt → 黄 → 20pt → 文字
```

这是 Modifier 链的核心心智:**每个 modifier 包裹之前的整个组合,生成一个新的 View**。08 篇会专门讲。

---

## 七、Grid:二维对齐布局(iOS 16+)

`Grid` 是 iOS 16 引入的二维布局,**列宽自动对齐**:

```swift
Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 6) {
    GridRow {
        Text("用户名")
        TextField("", text: $username)
    }
    GridRow {
        Text("密码")
        SecureField("", text: $password)
    }
    GridRow {
        Text("邮箱")
        TextField("", text: $email)
    }
}
```

每行有两列,**第 1 列宽度按所有行第 1 列内容的最大宽度对齐**,第 2 列同理。这正好对应"标签 + 输入框"的表单常见布局。

`Grid` 不是 LazyGrid——它**一次性测量所有子视图**,行数少(< 50)时用 Grid,行数多用 LazyVGrid:

```swift
let columns = [
    GridItem(.adaptive(minimum: 100))    // 列宽不小于 100,自动决定列数
]

ScrollView {
    LazyVGrid(columns: columns, spacing: 12) {
        ForEach(items) { item in
            Card(item: item)
        }
    }
}
```

`GridItem` 三种 mode:
- `.fixed(width)`:固定列宽
- `.flexible(min:max:)`:弹性,有上下限
- `.adaptive(minimum:)`:自适应列数,容器里塞下尽量多列

---

## 八、List 是布局,也是数据驱动

```swift
List(notes) { note in
    NoteRow(note: note)
}

// 或者用 Section + 多种内容
List {
    Section("最近") {
        ForEach(recent) { NoteRow(note: $0) }
    }
    Section("归档") {
        ForEach(archived) { NoteRow(note: $0) }
    }
}
```

`List` 内部是 lazy 的——只渲染可见 row。它**自带很多系统行为**:

- `swipeActions` 左右滑动按钮
- `onDelete` / `onMove` 编辑模式
- `listRowSeparator` / `listRowBackground` 自定义分隔与背景
- 与 `EditButton` 配合的多选

```swift
List {
    ForEach(notes) { note in
        NoteRow(note: note)
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) {
                    delete(note)
                } label: {
                    Label("删除", systemImage: "trash")
                }
            }
    }
    .onDelete(perform: delete)
}
```

`List` 与 `ScrollView { LazyVStack { ... } }` 的区别:
- `List`:系统样式、自带 row 行为、性能好但样式定制有限
- `ScrollView + LazyVStack`:完全自定义样式、自己处理 row 行为、灵活但要自己写更多

iOS 主流 App 列表用 `List`,定制视觉强的 feed 流用 `LazyVStack`。

---

## 九、ScrollView 与 LazyVStack / LazyHStack

`ScrollView` 是滚动容器,**内部默认是 VStack 行为**——所有子视图被立刻创建。子视图多时改用 Lazy:

```swift
ScrollView {
    LazyVStack(spacing: 8) {
        ForEach(items) { item in
            ItemCard(item: item)
        }
    }
}
```

`LazyVStack` 只在子视图即将可见时创建。`ForEach(0..<10000)` 在 LazyVStack 里没问题,在普通 VStack 里会卡。

`ScrollView` + `ScrollViewReader` 控制滚动位置:

```swift
ScrollViewReader { proxy in
    ScrollView {
        LazyVStack {
            ForEach(messages) { msg in
                MessageRow(msg: msg).id(msg.id)
            }
        }
    }
    .onChange(of: messages.last?.id) { _, newID in
        if let newID {
            withAnimation { proxy.scrollTo(newID, anchor: .bottom) }
        }
    }
}
```

iOS 17+ 还有更简单的 `.scrollPosition` modifier,直接绑定一个可观察的滚动位置。

---

## 十、自定义 Layout 协议

iOS 16 引入的 `Layout` 协议让你写完全自定义的布局算法:

```swift
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: maxWidth, height: currentY + lineHeight)
    }
    
    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var currentX: CGFloat = bounds.minX
        var currentY: CGFloat = bounds.minY
        var lineHeight: CGFloat = 0
        
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX {
                currentX = bounds.minX
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            sv.place(at: CGPoint(x: currentX, y: currentY), proposal: ProposedViewSize(size))
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

// 使用
FlowLayout {
    ForEach(tags, id: \.self) { tag in
        Text(tag).padding(6).background(.tertiary).clipShape(.capsule)
    }
}
```

`Layout` 协议有两个核心方法:
- **`sizeThatFits`**:接父提议、返回自己要的大小
- **`placeSubviews`**:在父分配的 bounds 内,决定每个子视图的位置

`cache` 用于缓存测量结果,避免重复计算(advanced)。

业务里 90% 用内建 Stack / Grid 够了,只在 chip 流、瀑布流、自定义网格这种内建容器实现不了的场景才上 Layout。

---

## 十一、与 Flutter Flex / Web Flex 对照

| 概念 | SwiftUI | Flutter Flex | CSS Flexbox |
| --- | --- | --- | --- |
| 主轴 | HStack 横 / VStack 纵 | Row / Column | flex-direction |
| 主轴对齐 | spacing + Spacer | mainAxisAlignment | justify-content |
| 交叉轴对齐 | alignment | crossAxisAlignment | align-items |
| 弹性占满 | `frame(maxWidth: .infinity)` | `Expanded` / `Flexible` | flex: 1 |
| 间隔 | spacing + Spacer + padding | SizedBox / Spacer | gap |
| 包裹换行 | 自定义 Layout / FlowLayout | Wrap | flex-wrap |

**SwiftUI 与 Flutter Flex 最像**——都是 proposal-based,Spacer / Expanded 思路一致;**与 CSS Flex 差别最大**——CSS 是 constraint-based + 二阶段(min-content → fr 分配),SwiftUI 是单阶段提议-响应。

---

## 十二、踩坑

1. **`Spacer` 不撑开**——HStack / VStack 里没问题,但 `ZStack` 里 Spacer 没意义(没主轴)。
2. **`frame(maxWidth: .infinity)` 文字仍然居中**——`frame` 改变了 frame 大小,但 `Text` 默认在 frame 里居中。要左对齐加 `.frame(maxWidth: .infinity, alignment: .leading)`。
3. **List 套 LazyVStack 想要双层 lazy**——List 本身就是 lazy,套 LazyVStack 没意义,反而把 List 的 row 行为弄坏。
4. **`ScrollView { VStack { ... } }` 卡死**——子视图数量过百时改 LazyVStack。
5. **`Spacer` 在 Grid 里乱跳**——Grid 是二维表格布局,Spacer 这种弹性占位在 Grid 里行为复杂,通常不应该混用。
6. **`fixedSize` 用错方向**——`fixedSize(horizontal:true,vertical:false)` 横向不接受提议,纵向接受。两个都 true 等于完全按自然尺寸返回。
7. **`padding(.zero)` 期望去掉默认 padding**——SwiftUI 的默认 padding 是 modifier 自带的,不能用 `padding(.zero)` 撤销,要换 modifier。
8. **`alignment` 与 `frame` 的 alignment 混淆**——HStack 的 `alignment` 是子视图在 stack 内的交叉轴对齐;`frame(alignment:)` 是内容在 frame 内的对齐。两者作用对象不同。
9. **iPad 上界面被拉得很宽,文字一行很长**——加 `.frame(maxWidth: 600)` 或者用 `NavigationSplitView` 三栏布局。
10. **`.background` 占空间**——`.background` 不参与布局测量,只画在原视图后面。需要占空间的"背景"用 `.overlay` 或包一层 ZStack。

---

下一篇 `08-Modifier链与样式系统.md`,讲 Modifier 顺序敏感为什么会导致 bug、`ViewModifier` 自定义、`ButtonStyle` / `LabelStyle` / `ToggleStyle` 把样式与逻辑解耦的工程意义、`PrimitiveButtonStyle` 完全自定义按钮行为、与 CSS 样式系统的差异。
