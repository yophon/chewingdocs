# 24 Accessibility 与国际化(Localizable.xcstrings)

> 系列基线:iOS 18 / Swift 6 / Xcode 16 / SwiftUI。本文代码全部通过 Swift 6 严格并发模式编译,不使用 `@unchecked Sendable` 与 force unwrap。涉及 iOS 19+ 的新 API 单独标注。

NotesIsland 上线 App Store 之前还差最后一类「广度」工作:让它对**所有人**都能用。两个互不相关、但都是「让 App 触达更多用户」的工程话题:

- **Accessibility**:让视障 / 听障 / 运动障碍 / 认知障碍用户能完整使用 App,包括 VoiceOver、Dynamic Type、Reduce Motion、High Contrast、Switch Control;
- **国际化(i18n)**:把界面文案从中文扩展到英、日、阿等多语言。Xcode 15 起 Apple 用 **String Catalog (`.xcstrings`)** 整体替代了延用十多年的 `Localizable.strings` + `.stringsdict`,翻译流程从「人肉对齐文件」变成「IDE 里可视化」。

这两件事 Apple 审核团队都看重,VoiceOver 不可用与文案不本地化都是常见 reject 理由。更重要的是,它们在 SwiftUI 下做对的成本比 UIKit 时代低得多,几乎都是给 view 加几个 modifier 的事;**只是默认不做反而会留下大量隐性 bug**。

---

## 一、机制定位

### 1.1 Accessibility 在 iOS 平台的位置

iOS 的辅助功能从 iPhone 第一代就内置在系统层,核心抽象叫 **Accessibility Tree**:每个 UI 元素都有一份「无图形」的描述(label / hint / value / traits / actions),VoiceOver / Switch Control / Voice Control / Full Keyboard Access 都基于这棵树工作。开发者写的 View 默认会自动暴露为节点,但 SDK 没法从一张图标推断「这个按钮是干什么的」,所以**默认状态下,自定义视图、纯图片按钮、复合控件几乎全部对 VoiceOver 不可用**。

UIKit 时代要写 `accessibilityLabel`、`accessibilityHint`、`accessibilityValue`、`accessibilityTraits` 一系列 NSObject 属性,代码侵入大。SwiftUI 把这些做成 modifier:`.accessibilityLabel(_:)` / `.accessibilityHint(_:)` / `.accessibilityValue(_:)` / `.accessibilityAddTraits(_:)`,而且许多文字类 View 默认会用其文字内容当 label,工程心智成本骤降。

更深的设计:SwiftUI 的 `.accessibilityElement(children:)` 让你声明「把一组子视图合并成单一 a11y 节点」或「让 VoiceOver 忽略子节点」,这在 UIKit 里要写一长串 `accessibilityElements` 数组才能做到。

### 1.2 Dynamic Type 与视觉适配

Dynamic Type 是用户在「设置 → 显示与亮度 → 文字大小」里设置的字号偏好,从 `xSmall` 到 `accessibilityXXXLarge`,大字号下普通的 `Text("Hello").font(.system(size: 14))` 完全不会跟随。正确做法是用 `Font.body` / `.title` / `.caption` 这些 **TextStyle**,SwiftUI 会自动放缩;自定义字体也要走 `.custom("...", relativeTo: .body)`。

### 1.3 Reduce Motion / Increase Contrast

`@Environment(\.accessibilityReduceMotion)` / `\.accessibilityDifferentiateWithoutColor` / `\.accessibilityReduceTransparency` / `\.colorSchemeContrast` 是一组系统偏好,任何 View 都能读;在 `withAnimation` 之前判断,可以避免眩晕、可以避免「红绿色盲看不出状态」、可以避免半透明导致的可读性差。

### 1.4 国际化:String Catalog 取代旧路线

Xcode 15 起,Apple 推出 `.xcstrings` 文件格式(String Catalog)。新工程默认使用,旧工程可以右键 `.strings` → Migrate。改动包括:

- 一个 `.xcstrings` 文件覆盖所有语言,翻译状态(新 / 待译 / 待校 / 已校)在 IDE 内可视化;
- 复数处理直接在文件内编辑,不再写独立 `.stringsdict`;
- **设备类型变体**(`device.iphone` / `device.ipad` / `device.mac` / `device.vision`)用同一个 key 不同变体管理;
- Xcode 16 起,build 时自动扫描代码里所有 `String(localized:)` / `LocalizedStringKey` 字面量,把新 key 自动加进 `.xcstrings`,不再需要 `genstrings` 命令行。

API 层面,Swift 5.7 起两个核心类型:

- `String(localized: "Save", bundle: ...)`:直接得到本地化后的 `String`,在**非 SwiftUI**层(网络 / 文件名 / 通知正文)用;
- `LocalizedStringResource("Save", table: nil)`:**带元数据的资源标识符**,可被 `Text` / `Label` 接受,延迟到渲染时本地化(支持跨进程 / Widget / Live Activity 等)。

SwiftUI 里 `Text("Save")` 默认就把字面量当 `LocalizedStringKey`,只要 String Catalog 里有对应 key 就自动本地化。

---

## 二、Apple 平台心智

### 2.1 Accessibility Modifier 速查

| Modifier | 等价 UIKit 概念 | 何时用 |
| --- | --- | --- |
| `.accessibilityLabel("保存")` | `accessibilityLabel` | 图标按钮、自定义控件 |
| `.accessibilityHint("会同步到 iCloud")` | `accessibilityHint` | 操作可能不直观时 |
| `.accessibilityValue("3 颗星")` | `accessibilityValue` | 进度、评分、滑块 |
| `.accessibilityAddTraits(.isButton)` | `accessibilityTraits` | 把视图标识成按钮 / 链接 / 标题 |
| `.accessibilityRemoveTraits(.isImage)` | 同上 | 抑制装饰性图标 |
| `.accessibilityHidden(true)` | `isAccessibilityElement = false` | 装饰元素从 a11y 树移除 |
| `.accessibilityElement(children: .combine)` | 自定义 `accessibilityElements` | 把多个文字合成一个节点 |
| `.accessibilityElement(children: .ignore)` | 同上 | 自定义节点完全替换子节点 |
| `.accessibilityAction(.escape) { }` | `accessibilityPerformEscape` | 两指 Z 字手势:退出 modal |
| `.accessibilityRepresentation { ... }` | iOS 14+ | 把复杂自定义视图用一个简化版描述给 VoiceOver |

### 2.2 Dynamic Type 适配

- 文字一律走 TextStyle:`Font.body` / `Font.callout` / `Font.title3`;
- 自定义字体:`Font.custom("Inter", size: 16, relativeTo: .body)`;
- 容器尺寸不要写死 `frame(height: 44)`,改用 `frame(minHeight: 44)` 或不写;
- 复杂横向布局在 accessibility 字号下会挤压,用 `@Environment(\.dynamicTypeSize)` 判断,大字号时切 vertical 布局;
- iOS 17+ 起 `ViewThatFits` 可以自动在 horizontal 不下时回退 vertical。

### 2.3 VoiceOver 焦点顺序

VoiceOver 默认按视觉左到右、上到下确定阅读顺序。两个常见坑:

- ZStack 叠放的内容会按 z-order 而非视觉顺序读出;用 `.accessibilitySortPriority(_:)` 显式排序,数字大的先读;
- 自定义 layout 协议下,系统拿不到视觉位置,要么实现 layout protocol 的 a11y 支持,要么用 `.accessibilityElement(children: .contain)` + 手动 `accessibilityElements`。

### 2.4 String Catalog 心智

`.xcstrings` 内部是 JSON,顶级结构:

```text
sourceLanguage: "zh-Hans"
strings:
  "save": { "extractionState": "manual", "localizations": { "zh-Hans": ..., "en": ..., "ja": ... } }
  "%lld notes": { "variations": { "plural": { "one": ..., "other": ... } } }
```

「变体」可以嵌套:`device` × `plural`。所以「1 条笔记 / N 条笔记」在 iPhone 与 iPad 上可以用不同措辞(如 iPad 上空间够,写「You have %lld notes」;iPhone 上写「%lld 条笔记」)。

代码里两种基本写法:

- `Text("save")`:`LocalizedStringKey` 自动查表;
- `String(localized: "save")`:返回 `String`,适合通知正文、文件名、错误信息。

带参数:`String(localized: "Hello, \(name)")`,参数占位会按目标语言语序重排。SwiftUI 推荐用 `Text("\(count) notes")` 直接插值,框架内部识别 `count` 类型为 `Int`,自动应用 plural variation。

### 2.5 LocalizedStringResource 何时必须用

`String(localized:)` 立刻本地化为「当前进程的语言」。如果你在主 App 进程构造一段文案,然后传给 **Widget Extension / Live Activity / App Intent / Notification** 等可能在不同 locale 下渲染的目标,就**不能用 String**,要用 `LocalizedStringResource`:

```swift
let resource = LocalizedStringResource("recording.title", defaultValue: "正在录音")
// 传给 ActivityKit / Intent / Notification,这些消费者会在自身渲染时再 localize
```

NotesIsland 把录音 Live Activity 的标题文案用 `LocalizedStringResource` 描述,Widget 渲染进程会按系统语言取对应翻译,不会被主 App 的当前语言污染。

---

## 三、工程实现

### 3.1 笔记列表 VoiceOver 化

```swift
// File: Features/Notes/NoteListView.swift

import SwiftUI

struct Note: Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let body: String
    let updatedAt: Date
    let isStarred: Bool
}

struct NoteListView: View {
    let notes: [Note]
    let onSelect: @MainActor (Note) -> Void

    @Environment(\.dynamicTypeSize) private var dts

    var body: some View {
        List(notes) { note in
            NoteRow(note: note)
                .contentShape(Rectangle())
                .onTapGesture { onSelect(note) }
        }
        .accessibilityIdentifier("note-list")
    }
}

// MARK: - Row

struct NoteRow: View {
    let note: Note

    var body: some View {
        HStack(spacing: 12) {
            // 收藏星标 —— 纯视觉,不读
            Image(systemName: note.isStarred ? "star.fill" : "star")
                .foregroundStyle(note.isStarred ? .yellow : .secondary)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(note.title)
                    .font(.headline)
                    .lineLimit(1)
                Text(note.body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Text(note.updatedAt, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
        // 把行内三段文字 + 星标状态合并成一个 a11y 节点
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            note.isStarred
                ? Text("已收藏的笔记:\(note.title)。摘要:\(note.body)")
                : Text("笔记:\(note.title)。摘要:\(note.body)")
        )
        .accessibilityValue(Text(note.updatedAt, style: .relative))
        .accessibilityHint(Text("双击打开详情"))
        .accessibilityAddTraits(.isButton)
    }
}
```

注意几个关键点:

- 星标用 `.accessibilityHidden(true)` 避免被 VoiceOver 念成「五角星图」,语义直接合进 label 文字「已收藏的笔记」;
- `accessibilityElement(children: .combine)`:把行内的 title / body / time 合并,VoiceOver 一次性读完,而不是「标题」「摘要」「3 分钟前」三次焦点;
- `.accessibilityAddTraits(.isButton)` 提示用户「这是可点的」,VoiceOver 读完会补一句「按钮」。

### 3.2 大字号下自适应布局

```swift
// File: Features/Pro/ProPriceCard.swift

import SwiftUI

struct ProPriceCard: View {
    let title: String
    let price: String
    let note: String

    @Environment(\.dynamicTypeSize) private var dts

    var body: some View {
        ViewThatFits(in: .horizontal) {
            horizontalLayout
            verticalLayout
        }
        .padding()
        .background(.thinMaterial, in: .rect(cornerRadius: 16))
    }

    private var horizontalLayout: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(note).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(price).font(.title2).bold()
        }
    }

    private var verticalLayout: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            Text(price).font(.title2).bold()
            Text(note).font(.caption).foregroundStyle(.secondary)
        }
    }
}
```

`ViewThatFits` 会先量「水平版」是否能放下,放不下就回退「垂直版」。在 `accessibilityXXXLarge` 字号下,horizontal 自动塞不下,系统主动切到 vertical,无需写 `if dts >= .accessibilityLarge` 这种分支。

### 3.3 Reduce Motion 适配

```swift
// File: Features/Notes/NoteAddedToast.swift

import SwiftUI

struct NoteAddedToast: View {
    let text: String
    @Binding var isPresented: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if isPresented {
                Text(text)
                    .padding()
                    .background(.regularMaterial, in: .capsule)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? .none : .spring(duration: 0.3), value: isPresented)
    }
}
```

`accessibilityReduceMotion` 为 true 时切到淡入淡出,避免飞入式动画引发眩晕用户不适。

### 3.4 字符串目录与代码

```swift
// File: Features/Notes/NoteCountLabel.swift

import SwiftUI

struct NoteCountLabel: View {
    let count: Int

    var body: some View {
        // 直接插值,SwiftUI 自动应用 plural variation
        Text("\(count) notes")
    }
}

// 在通知正文里用 String(localized:)
enum NoteNotifications {
    static func savedBody(title: String) -> String {
        String(localized: "已保存笔记「\(title)」")
    }
}

// 在 Live Activity / Intent 里用 LocalizedStringResource
struct OpenNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "打开 NotesIsland"
    static let description = IntentDescription("跳转到指定笔记")

    @Parameter(title: "笔记 ID") var noteID: String

    func perform() async throws -> some IntentResult {
        // ...
        return .result()
    }
}
```

对应 `Localizable.xcstrings`(节选,YAML 化展示便于阅读):

```json
{
  "sourceLanguage": "zh-Hans",
  "strings": {
    "%lld notes": {
      "extractionState": "manual",
      "localizations": {
        "zh-Hans": { "variations": { "plural": {
          "one":   { "stringUnit": { "state": "translated", "value": "%lld 条笔记" } },
          "other": { "stringUnit": { "state": "translated", "value": "%lld 条笔记" } }
        } } },
        "en": { "variations": { "plural": {
          "one":   { "stringUnit": { "state": "translated", "value": "%lld note" } },
          "other": { "stringUnit": { "state": "translated", "value": "%lld notes" } }
        } } },
        "ja": { "variations": { "plural": {
          "other": { "stringUnit": { "state": "translated", "value": "%lld 件のメモ" } }
        } } }
      }
    },
    "已保存笔记「%@」": {
      "localizations": {
        "zh-Hans": { "stringUnit": { "state": "translated", "value": "已保存笔记「%@」" } },
        "en":      { "stringUnit": { "state": "translated", "value": "Saved note \"%@\"" } },
        "ja":      { "stringUnit": { "state": "translated", "value": "メモ「%@」を保存しました" } }
      }
    },
    "打开 NotesIsland": {
      "localizations": {
        "en": { "stringUnit": { "state": "translated", "value": "Open NotesIsland" } }
      }
    }
  },
  "version": "1.0"
}
```

中文(`zh-Hans`)下 `one` 与 `other` 写成一样;日文(`ja`)语法只有 `other` 一档。Xcode 16 的 String Catalog 编辑器会按 CLDR plural rules 自动给每个语言生成对应的 plural 槽位,你只需要填值。

---

## 四、调参与验收

### 4.1 关键参数与影响

| 参数 / 设置 | 影响 | 推荐 |
| --- | --- | --- |
| `accessibilityLabel` | VoiceOver 朗读 | 名词性短语,不带「按钮」字样(系统自动补 trait) |
| `accessibilityHint` | 朗读完 label 1.5 秒后追读 | 描述「点了会发生什么」,可短可省 |
| `accessibilityValue` | 状态值 | 滑块、开关、进度、评分必加 |
| `accessibilitySortPriority` | 焦点顺序 | 仅在视觉顺序与逻辑顺序不一致时用 |
| Dynamic Type minimum / maximum | 限制可放缩范围 | 一般不限制;特殊封面页可用 `.dynamicTypeSize(...DynamicTypeSize.xxLarge)` 限上限 |
| String Catalog `extractionState` | 翻译流转状态 | `new` → 译者翻 → `translated` → 校对 → `reviewed` |
| `sourceLanguage` | 源语言 | NotesIsland 设 `zh-Hans` |
| Base Internationalization | 资源 fallback 顺序 | 启用,缺翻译时回源语言 |

### 4.2 手动验证清单

1. **VoiceOver 走查**:在真机 → 设置 → 辅助功能 → VoiceOver 开启;或在 Settings → Accessibility → Accessibility Shortcut 设为 VoiceOver,然后三击侧键临时打开。打开 NotesIsland,从主屏开始向右滑过每一个元素:
   - 期望:每个图标按钮(收藏、删除、分享)都有自然语言 label;
   - 期望:笔记列表行被合并为单条朗读,不再逐字朗读分割文本;
   - 期望:不存在「按钮 按钮」连读(说明 trait 误重复)。
2. **Dynamic Type 走查**:Settings → 显示与亮度 → 文字大小,拉到最大,再开启「更大的辅助功能字号」拉到最大;回到 NotesIsland:
   - 期望:所有正文字号同步变大;
   - 期望:Paywall 价格卡片自动切到 vertical;
   - 期望:无文字被截断(出现 `...` 是 fail)。
3. **Reduce Motion**:Settings → 辅助功能 → 动态效果 → Reduce Motion 打开,验证笔记保存 toast 不再飞入,改为淡入。
4. **Increase Contrast / Differentiate Without Color**:打开后检查所有「仅用颜色传达状态」的位置(已收藏 = 黄星);确保 NotesIsland 的星标在打开「Differentiate Without Color」后仍有形状区分(空心 vs 实心)。
5. **国际化验收**:Scheme → Edit Scheme → Run → App Language 切到 English,真机或模拟器跑:
   - 期望:所有 UI 文案为英文,无中文残留;
   - 期望:`1 note` / `2 notes` plural 正确;
   - 期望:日期格式自动切到 `May 24, 2026` 风格(`Text(date, style: .date)` 自动跟随 locale);
   - 期望:`String(localized:)` 在 `Notification.request` 与 Widget Bundle 中也跟随系统语言;
6. **缺翻译检测**:Xcode 16 在 build 时如果 `.xcstrings` 中某些 key 状态仍是 `new`,会出现 build warning,可以在 Project → Build Settings → `LOCALIZATION_PREFERS_STRING_CATALOGS = YES` 与 `STRING_CATALOG_GENERATE_SYMBOLS = YES` 配合,生成 typed accessor 防止 typo。

### 4.3 真机 vs 模拟器差异

- 模拟器可以用 Accessibility Inspector(Xcode → Open Developer Tool)走查 label / hint / trait;
- VoiceOver 在模拟器上手势映射不顺畅,真机体验为准;
- Switch Control 与 Voice Control 几乎只能真机测;
- 日文 / 阿拉伯文(RTL)布局:模拟器开 `-NSDoubleLocalizedStrings YES` launch argument 模拟翻译变长场景,可提前发现裁切。

---

## 五、踩坑

### 5.1 与 iOS 16 / Swift 5 旧教程的差异

- **不要再写 `Localizable.strings` + `Localizable.stringsdict`**:Xcode 15 起官方默认 String Catalog,旧文件可右键 Migrate;新工程不要主动创建 `.strings`,否则两边维护一定会脱节。
- **不要再用 `NSLocalizedString("key", comment: "...")`**:虽然仍能跑,但 Xcode 16 自动扫描已经覆盖 `String(localized:)`,旧 API 不会被 IDE 收集 key,容易漏译。
- **不要再写 `accessibilityLabel = ...` Objective-C 风格 setter**:SwiftUI 用 modifier 链;改 UIKit `UIView` 时仍用 `view.accessibilityLabel = "..."`。
- **iOS 16 教程的 `LocalizedStringKey` 直接构造**:`Text(LocalizedStringKey("save"))` 仍有效但是冗余,iOS 18 下 `Text("save")` 默认即可,字面量会被识别。

### 5.2 Swift 6 严格并发常见报错

- `Sending non-Sendable value 'String'`:`LocalizedStringResource` 是 `Sendable` 而 `String` 在跨 actor 边界传文案时也是 `Sendable`(因 `String` 本身 `Sendable`),通常无问题;若你封装自定义文案 struct,记得标 `Sendable`。
- `@Environment(\.accessibilityReduceMotion)` 读取必须在 SwiftUI View body 中;不要把它读出来塞到 actor / Task 中保存为状态(违反 SwiftUI 数据流方向)。
- App Intents 的 `LocalizedStringResource` 字段必须 `static let title: LocalizedStringResource = "..."`,Swift 6 下若写成 `static var` 会触发「`var` is not concurrency-safe」编译错。

### 5.3 体验层踩坑

- **`accessibilityLabel` 里不要带「按钮」/「图片」字样**:VoiceOver 会自动用 trait 补读,你再写一次就变成「保存按钮 按钮」。
- **不要把 emoji 当 label**:`.accessibilityLabel("⭐")` 会被读成「五角星 表情符号」。改成 `.accessibilityLabel("已收藏")`。
- **巨大 ScrollView 中,VoiceOver 焦点在底部内容时,用 `.accessibilityScrollAction`(iOS 14+)告诉系统如何「翻页」**,否则视障用户三指滑动可能完全无法翻到下一屏。
- **错别 trait**:`.isHeader` 用错会让 VoiceOver 把整段当作标题快速跳过;`Section`/`navigationTitle` 已经自动是 header,不要再手动加。
- **`Text(date, style: .relative)`** 在 VoiceOver 下念出来已经是「3 分钟前」自然语言,**不要再用 `.accessibilityValue(text)` 覆盖**,会让朗读重复。
- **plural 变体的 `one` 不是所有语言都用**:Arabic 有 `zero / one / two / few / many / other` 六档,中文 / 日文只有 `other`;Xcode 16 编辑器会按 CLDR 自动展示对应槽位,不要手动只填 `one / other` 强推到所有语言,会导致某些语言显示 fallback。
- **RTL 布局**:`HStack` 默认会镜像方向,但你写死的 `padding(.leading)` 也会自动变成「视觉前侧」;不要用 `.padding(.left)`(已弃用)。图标方向(返回箭头)如需镜像,加 `.flipsForRightToLeftLayoutDirection(true)`。
- **`.xcstrings` 文件的合并冲突**:Apple 编辑过的 `.xcstrings` 仍是 JSON 文件,在 Git 上多人编辑可能产生顺序冲突;最佳实践是按 key 字母序由 IDE 重新格式化(Xcode 16 自动按 key 排序),不要手改 JSON 顺序。
- **iOS 19+(标注:仅适用于 iOS 19 SDK)**:Apple 引入 `AccessibilityRotor` 在 SwiftUI 上有更多原生 API(原本部分是 iOS 17/18 试验),允许 App 自定义 VoiceOver 的「转子」分类,如「按笔记日期」「按收藏」遍历。降级方案是在 iOS 18 用 `AccessibilityRotor("收藏笔记")` 已有版本,iOS 19 升级写法更轻;基线保持 iOS 18 实现即可。

到这里 NotesIsland 已经具备「视障用户能完整读完一个笔记」「Dynamic Type 拉到最大不会布局崩」「英文 / 日文 / 阿拉伯文 day-one 上线」「Reduce Motion 用户不眩晕」这四项审核硬指标。后续 25 篇会把端侧 AI(Vision / Core ML)接入笔记 OCR 与图像描述,让 a11y label 的 `Image` 类内容也能被 VoiceOver 朗读,进一步把无障碍向「智能化无障碍」推进。
