# Accessibility 与本地化

iOS 在无障碍 (Accessibility) 和本地化 (Localization) 上的硬要求,远比 Android 严格——VoiceOver 用户、视力低下用户、不读中文的用户都在 Apple 审核员的画像里。**做不到无障碍 = 上架风险;做不到多语言 = 失去全球 70% 用户**。这一篇讲透:**`accessibilityLabel` / `accessibilityHint` / `accessibilityValue`、Dynamic Type、VoiceOver 自检、Reduce Motion / High Contrast、String Catalog (`.xcstrings`)、复数 / 设备变体、`String(localized:)`**。

> 一句话先记住:**SwiftUI 自带的视图(Text / Button / Image)对 VoiceOver / Dynamic Type 已经友好,你只要不破坏它(不要 hardcode font size、不要把 Image 当装饰用、不要自定义手势压死 VoiceOver)就过半了。Xcode 15+ 的 `.xcstrings` 用 SwiftUI 字面量自动抽 key,翻译状态可视化——告别老 `.strings` 时代手维护 key。**

---

## 一、VoiceOver 与 accessibility 三件套

VoiceOver 是 iOS 内置的屏幕阅读器,用户用手指拖动屏幕,VoiceOver 朗读当前元素。**你的视图要被 VoiceOver 正确朗读**,需要三个属性:

- **`accessibilityLabel`**:这个元素是什么(必填,VoiceOver 朗读这个)
- **`accessibilityHint`**:操作后会发生什么(可选,长按延迟后朗读)
- **`accessibilityValue`**:当前的值(对滑块、开关等)

```swift
// SwiftUI 自动从 Text / Button label 推导
Button("收藏") { ... }
// VoiceOver 朗读:"收藏,按钮"

// 图标按钮要补充
Button { ... } label: {
    Image(systemName: "star.fill")
}
.accessibilityLabel("收藏")        // ⚠️ 必加,否则 VoiceOver 念 "图像"

// 自定义视图带值
Slider(value: $volume, in: 0...1)
    .accessibilityLabel("音量")
    .accessibilityValue("\(Int(volume * 100))%")
```

> SwiftUI 比 UIKit 默认 accessibility 友好——Text / Button / Label 都自动有 label。**坑出现在你把 SwiftUI 当画板用**(Image + onTapGesture 自己画按钮,或者 ZStack 套 background hack),这些自定义组合默认没 label,要手动补。

---

## 二、accessibilityElement(children:):合并 / 拆分元素

复杂卡片:VoiceOver 默认会**逐个朗读每个子视图**,用户每个 row 要划过好几次。合并成一个 accessibility element:

```swift
HStack {
    Image(systemName: "doc.text")
    VStack(alignment: .leading) {
        Text(note.title)
        Text(note.dateString).font(.caption)
    }
    Spacer()
    Text("\(note.attachmentCount)")
}
.accessibilityElement(children: .combine)
.accessibilityLabel("\(note.title),\(note.dateString),\(note.attachmentCount) 个附件")
.accessibilityAddTraits(.isButton)
```

`.combine` 把所有子视图合成一个,label 用拼接的;`.ignore` 完全忽略子视图,只用本视图的 label。

---

## 三、Dynamic Type:用户系统字号

iOS 用户在系统设置里能调字号(辅助功能 → 显示与文字大小 → 更大字体),App 应该响应这个偏好。

```swift
Text("Hi").font(.body)            // ✅ 响应 Dynamic Type
Text("Hi").font(.system(size: 16)) // ❌ 写死,不响应
```

SwiftUI 的语义字体(`.largeTitle` / `.title` / `.headline` / `.body` / `.callout` / `.caption`)会自动跟 Dynamic Type 缩放。**永远用语义字体,不要 hardcode size**。

监听用户当前 size:

```swift
@Environment(\.dynamicTypeSize) private var dts

var body: some View {
    Text("Hi")
        .font(dts.isAccessibilitySize ? .largeTitle : .body)
}
```

`isAccessibilitySize` 是用户开了"超大字体"的标志(AX1 - AX5),通常布局要相应改(更大间距、纵向排版、隐藏次要信息)。

```swift
// 同一界面在普通字号 vs 巨大字号下用不同布局
@Environment(\.dynamicTypeSize) private var dts

var body: some View {
    if dts.isAccessibilitySize {
        VStack(alignment: .leading) { content }
    } else {
        HStack { content }
    }
}
```

---

## 四、Reduce Motion / High Contrast

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.accessibilityReduceTransparency) private var reduceTransparency
@Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
@Environment(\.colorSchemeContrast) private var contrast    // .increased 高对比模式
```

**Reduce Motion** 用户讨厌动画(眩晕症),应该禁用大幅动画:

```swift
withAnimation(reduceMotion ? nil : .spring) {
    showDetail.toggle()
}
```

**High Contrast** 用户视力低,系统会全局调高对比度,你的视图 `.foregroundStyle(.primary)` 自动响应。但**自定义颜色要主动检查**:

```swift
let labelColor: Color = contrast == .increased ? .black : .gray
```

**Differentiate Without Color** 用户色盲,不能只靠颜色传递信息——红色错误状态要补一个错误图标:

```swift
HStack {
    if hasError {
        Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(.red)
    }
    Text(message)
        .foregroundStyle(hasError ? .red : .primary)
}
```

---

## 五、SF Symbols 与 Accessibility

SF Symbols 自带 accessibility 名(语义化命名)——`heart.fill` VoiceOver 念 "filled heart"。**装饰性图标要标 `decorative`** 避免 VoiceOver 念出来:

```swift
HStack {
    Image(systemName: "magnifyingglass")
        .accessibilityHidden(true)        // 装饰性,不读
    TextField("搜索", text: $query)
}
```

`.accessibilityHidden(true)` 让 VoiceOver 跳过这个元素。

---

## 六、Localizable.xcstrings(Xcode 15+):新一代翻译

老 `.strings` 文件每种语言一份,key 是字符串,易写错。Xcode 15+ 引入 **String Catalog**(`.xcstrings`),JSON 格式,自动抽取 SwiftUI 字面量:

```
File → New File → String Catalog
```

```swift
Text("Hello")             // Xcode 自动抽 "Hello" 作为 key
Text("\(count) 条笔记")    // 自动抽,带变量

Button("保存") { ... }     // 也自动抽
```

打开 `.xcstrings`,左边是 key,右边是各语言翻译:

| key | en | zh-Hans | ja | es |
| --- | --- | --- | --- | --- |
| Hello | Hello | 你好 | こんにちは | Hola |
| %lld 条笔记 | %lld notes | %lld 条笔记 | %lld件のメモ | %lld notas |

界面里显示 **翻译状态**:Translated / Needs Review / New / Stale。可视化管理,告别老 .strings 时代"翻译丢了不知道"。

---

## 七、复数(Pluralization)

英语 "1 note" vs "2 notes" 是不同的,中文 "1 条笔记" 与 "2 条笔记" 一样。Apple 用 CLDR 规则处理复数:

```swift
Text("\(count) note(s)")  // 默认
// String Catalog 里点这个 key,选 "Vary by Plural",填:
// zero: "No notes"
// one: "1 note"
// other: "%lld notes"
```

中文只有 `other`,英语有 `one` + `other`,俄语有 `one` / `few` / `many` 等多种。Apple 自动按语言规则选。

---

## 八、设备变体(Vary by Device)

同一个 key 在 iPad / Mac 上可能要不同文案(iPad 屏幕大,文字可以详细):

```
"主屏" 
  iPhone: 主屏
  iPad:   主屏幕
  Mac:    主页
```

String Catalog 支持这种 "Vary by Device",生成时 Xcode 根据运行设备选合适版本。

---

## 九、String(localized:) 与 LocalizedStringResource

SwiftUI Text 自动本地化:

```swift
Text("Hello")          // 自动找 Localizable.xcstrings 的 Hello key
```

非 View 上下文(代码里手动构造字符串):

```swift
let localized = String(localized: "Hello")
let withArg = String(localized: "Hello, \(name)")

// LocalizedStringResource 用于跨 App / Extension 传递
let resource = LocalizedStringResource("Hello")
```

`LocalizedStringResource` 是个 wrapper,延迟解析——传给 Widget Extension 或 Intent 时,在目标 process 内解析。AppIntent 的 `title` 就是 `LocalizedStringResource`。

---

## 十、Right-to-Left 与 Layout 方向

阿拉伯语 / 希伯来语用户从右往左阅读,SwiftUI 默认会镜像布局。要让某个视图**永远 LTR**(比如代码块、数字):

```swift
Text("12345")
    .environment(\.layoutDirection, .leftToRight)
```

或者全 App 锁 LTR(只支持 LTR 语言时):

```swift
// 项目 build settings:Right-to-Left Language Support → No
// 或 Info.plist:CFBundleDevelopmentRegion = en + 不加 RTL 语言
```

---

## 十一、Audit:Xcode Accessibility Inspector

Xcode → Open Developer Tool → Accessibility Inspector,可以连真机 / 模拟器扫描当前界面,列出所有 accessibility 元素与可改进项。这是上架前必跑一遍的工具。

**Audit 通常会发现**:
- 图标按钮缺 label
- 装饰性 Image 没标 hidden
- Tap 区域过小(< 44pt)
- 颜色对比度不足

---

## 十二、踩坑

1. **图标按钮不加 `accessibilityLabel`**——VoiceOver 朗读 "image" 或者按钮 ID,完全无意义。审核常被打回。
2. **hardcode 字号 `font: .system(size: 16)`**——不响应 Dynamic Type,用户开了大字号你的字仍然 16pt。永远用语义 font。
3. **错误状态只靠红色**——色盲用户看不出来。加图标 / 文字辅助。
4. **`onTapGesture` 自定义按钮**——失去 button accessibility 一切。用 `Button { }` + `.buttonStyle(...)`。
5. **`.xcstrings` 没翻译就以为有**——Xcode 警告 "Needs Review" 状态,运行时也按 fallback 走,但翻译实际还是 en。Build 之前查 Catalog 状态。
6. **`String(localized: "Welcome \(name)")` 的 `name` 是用户输入**——本地化 catalog 把整个字符串当 key,key 太长。改 `String(localized: "Welcome \(name)", comment: "Greeting for user")`。
7. **复数没用 catalog 的 plural**——`"You have \(count) note\(count == 1 ? "" : "s")"` 这种是反模式,catalog 的 Vary by Plural 才是正解。
8. **`.accessibilityElement(children: .combine)` 合并后 label 不写**——SwiftUI 会拼接所有子文字,有时候顺序或内容很怪。手动写 label。
9. **Reduce Motion 没尊重**——`.matchedGeometryEffect` / 大幅 spring 没条件禁用,前庭功能障碍用户感到不适。审核员若有这方面背景会标。
10. **不测真机 VoiceOver**——模拟器开 VoiceOver 体验差很多,真机三指三击开关 + 实际用一遍是真测试。

---

下一篇 `24-SwiftUI性能与重渲染追踪.md`,讲 SwiftUI 重计算 vs UIKit 重渲染的根本差异、`Self._printChanges()` 追踪 body 重算原因、equatable view、`LazyVStack` 优化、`id(_:)` 滥用的代价、`@Observable` 字段级追踪带来的性能赢面、Instruments SwiftUI template 怎么读。
