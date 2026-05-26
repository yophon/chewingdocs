# SwiftUI 性能与重渲染追踪

SwiftUI 性能问题与 UIKit 完全是两类话题。UIKit 优化关注 "view 复用 / 离屏渲染 / 主线程 IO"。SwiftUI 优化关注:**body 调用频率、视图 identity 稳定性、`@Observable` 字段级追踪利用是否到位、`LazyVStack` 边界是否设对**。这一篇讲透这些,告诉你**真正会卡的是什么**。

> 一句话先记住:**SwiftUI body 频繁被调用是常态,不要看到它就紧张——真正贵的是"底层渲染对象重建"。"id 漂移 / 大对象在 body 内构造 / 大 List 没 Lazy / 整对象 Observable 触发全树刷新" 才是性能元凶。`Self._printChanges()` 是你最重要的调试工具。**

---

## 一、SwiftUI 性能两层成本(再讲一次)

```
重计算 body (recompute)
   ├── 触发:依赖的状态变化
   ├── 成本:struct 构造 + 几条赋值,几乎零
   ↓
SwiftUI diff
   ├── 比较新旧 view tree,按 identity 对齐
   ├── 大多数节点 identity 没变 + struct 字段相等 → 标记 unchanged
   ↓
重渲染 (re-layout / re-draw)
   ├── 触发:diff 发现真有变化
   ├── 成本:Layout 协议参与、Metal 命令重录,昂贵
```

**body 重算便宜,重渲染昂贵**——SwiftUI 性能优化的本质就是"让 diff 尽量发现没变",而不是"让 body 不被调用"。

---

## 二、`Self._printChanges()`:追踪 body 重算原因

```swift
struct NoteRowView: View {
    let note: NoteSummary
    
    var body: some View {
        let _ = Self._printChanges()    // ⚠️ Debug 用,Release 删掉
        
        HStack {
            Text(note.title)
            Spacer()
            Text(note.dateString)
        }
    }
}
```

打开 Xcode Console,每次 `body` 被调用都会打印**为什么被调**。输出例:

```
NoteRowView: @self changed.
NoteRowView: @identity changed.
NoteRowView: _note changed.
```

- `@self changed` — 整个 struct 不等(字段变了)
- `@identity changed` — 视图 identity 变了(被重新创建)
- `_note changed` — `note` 这个具体字段变了

`@identity changed` 是最贵的——意味着这个视图整个被销毁重建,内部所有 `@State` 重新初始化。

---

## 三、Equatable view:让 SwiftUI 跳过 diff

复杂视图,字段多,SwiftUI 比较字段相等也有开销。你可以告诉 SwiftUI "用我自定义的 equals":

```swift
struct ComplexCard: View, Equatable {
    let note: Note
    
    static func == (lhs: ComplexCard, rhs: ComplexCard) -> Bool {
        lhs.note.id == rhs.note.id && lhs.note.updatedAt == rhs.note.updatedAt
    }
    
    var body: some View {
        // 复杂内容
    }
}

// 父视图里
ComplexCard(note: note)
    .equatable()        // 启用 Equatable 优化
```

`.equatable()` 让 SwiftUI 用你的 `==` 而不是默认结构相等。**只在自定义 view 字段很多 + 比较成本远低于 body 重算时才用**(一般用不上,SwiftUI 默认实现已经很快)。

---

## 四、id(_:) 的滥用代价

`id(_:)` 是控制视图 identity 的强力开关——给视图一个稳定 id,SwiftUI 认为"同一个 id 跨帧出现就是同一个视图"。

```swift
ForEach(notes) { note in
    NoteRow(note: note)
        .id(note.id)              // ✅ 稳定 id,identity 跨更新保留
}
```

```swift
// ❌ 每次重建都是新 UUID,identity 每次都变
ProfileView().id(UUID())
```

最常见的滥用是为了 "强制 reset 内部 `@State`" 而用动态 id:

```swift
// ❌ 想要 user 变了就清空 EditView 内的 @State
EditView()
    .id(currentUser.id)
```

技术上可行,但代价是 user 变化时,EditView 内的**所有内容**都被销毁重建,包括复杂的输入框、滚动位置、动画。**应该改成 EditView 接 user 参数,通过 init 同步状态,而不是靠 id 强制重建**。

---

## 五、@Observable 字段级追踪的赢面

06 篇讲过 `@Observable` 字段级追踪,从性能角度再展开:

```swift
@Observable
@MainActor
final class Store {
    var notes: [Note] = []
    var searchQuery = ""
    var isLoading = false
    var user: User?
}

struct SearchBar: View {
    @Bindable var store: Store
    var body: some View {
        TextField("搜索", text: $store.searchQuery)
        // 这个 view 只依赖 searchQuery,store.notes / isLoading / user 变化不会触发这里重算
    }
}

struct NoteList: View {
    let store: Store
    var body: some View {
        List(store.notes) { ... }
        // 只依赖 notes,searchQuery 变化不触发
    }
}
```

旧 `ObservableObject + @Published` 模式下,任意 `@Published` 字段变化,所有读 store 的视图都 body 重算。`@Observable` 字段级追踪后,**只有真正读到那个字段的视图才重算**。

---

## 六、List vs LazyVStack 边界

```swift
// 1000 行数据
List(items) { ItemRow(item: $0) }                          // ✅ 系统 Lazy
ScrollView { LazyVStack { ForEach(items) { ... } } }       // ✅ Lazy
ScrollView { VStack { ForEach(items) { ... } } }           // ❌ 1000 行立刻全创建
```

`List` 自带 lazy,基本不需要担心。`ScrollView + VStack` 会创建所有子视图,5-20 行 OK,100+ 行就卡。

`LazyVStack` 的 row 是 "进入可视区时创建"。**但 row 数量超 10000 时,即使 Lazy 也会卡**——SwiftUI 维护的 view tree 太大。这种规模考虑分页加载。

`List` 的 row 用 `.id(item.id)` 配合 `@Query` 的 `Identifiable`,iOS 能做最优 diff(只重建真正变化的 row)。

---

## 七、避免大对象在 body 里构造

```swift
struct ItemRow: View {
    let item: Item
    
    var body: some View {
        let formatter = DateFormatter()              // ❌ 每次 body 重算都构造
        formatter.dateStyle = .medium
        
        Text(formatter.string(from: item.date))
    }
}
```

每次 body 重算都新建 DateFormatter,formatter 构造很慢。改成 static 或 lazy:

```swift
private static let formatter: DateFormatter = {
    let f = DateFormatter()
    f.dateStyle = .medium
    return f
}()

var body: some View {
    Text(Self.formatter.string(from: item.date))
}
```

或者用 iOS 15+ 的 `Date.FormatStyle`:

```swift
Text(item.date, format: .dateTime.day().month().year())   // 内建 cache
```

---

## 八、AnyView 是性能杀手(常常)

`AnyView` 是类型擦除——SwiftUI diff 在没有静态类型时会保守,**只能"identity 不同就 swap"**,无法做更细粒度的 diff。

```swift
// ❌ AnyView 包一切
var body: some View {
    if isLoading {
        AnyView(ProgressView())
    } else {
        AnyView(ContentView())
    }
}
```

```swift
// ✅ @ViewBuilder 处理 if-else
var body: some View {
    if isLoading {
        ProgressView()
    } else {
        ContentView()
    }
}
```

`@ViewBuilder` 编译期生成 `_ConditionalContent<ProgressView, ContentView>`,SwiftUI 保留两种具体类型信息,diff 高效。

**`AnyView` 的合理场景**只有真正需要"运行时决定类型"的容器(plugin 系统、动态列表混排不同 row 类型),99% 业务场景不需要。

---

## 九、Instruments SwiftUI template

Instruments → 选 "SwiftUI" template,run 一遍 App,会出:

- **View Body**:每个 view 的 body 调用次数
- **Updates**:渲染更新数量
- **Image Decode**:图片解码耗时
- **Layout**:布局耗时

聚焦三件事:
1. **Body 调用最高的几个 view**——是不是依赖了不必要的 Observable 字段?
2. **Identity 重置频率**——是不是 `id()` 用错?
3. **图片 decode 慢**——可能没用 `AsyncImage` cache,或者图片源是高分辨率原图。

---

## 十、动画性能与 60/120 fps

iPhone 13+ Pro 系列有 ProMotion(120Hz),普通 iPhone 60Hz。Animation 卡顿表现:

- `60 fps` → 16.67ms / 帧,每帧 body + diff + render < 16ms
- `120 fps` → 8.33ms / 帧,更严格

测帧率用 Xcode Debug menu → Show GPU Timings,或者 Instruments Core Animation template。

**动画期间 body 频繁调用是正常的**——动画就是连续渲染中间值。优化重点:
- 动画过程中 body 不要做重型计算(format / 复杂逻辑)
- 动画涉及的视图层级要浅
- `id` 不要在动画中变化

---

## 十一、其他常见性能陷阱

**`.onChange(of:)` 频繁回调**:

```swift
.onChange(of: query) { _, newValue in
    Task { try await search(newValue) }    // 每个字符都触发请求
}
```

加 debounce:

```swift
@State private var searchTask: Task<Void, Never>?

.onChange(of: query) { _, newValue in
    searchTask?.cancel()
    searchTask = Task {
        try? await Task.sleep(for: .milliseconds(300))
        if Task.isCancelled { return }
        await search(newValue)
    }
}
```

**大数据集 ForEach with `id: \.self`**:

```swift
ForEach(items, id: \.self) { ... }    // ❌ 大对象 \.self 比较慢
ForEach(items) { ... }                // ✅ Item 是 Identifiable,自带 id
```

**State 在 View 树深处导致大范围 invalidation**:

```swift
struct A: View {
    @State private var count = 0       // ⚠️ 改 count 触发 A 整个 body 重算
    
    var body: some View {
        VStack {
            ExpensiveSubView()         // 即使不依赖 count,也参与 diff
            Button("\(count)") { count += 1 }
        }
    }
}
```

把 count 下沉到只用到它的子视图:

```swift
struct A: View {
    var body: some View {
        VStack {
            ExpensiveSubView()         // 不参与 count diff
            CountButton()               // 独立 @State
        }
    }
}

struct CountButton: View {
    @State private var count = 0
    var body: some View {
        Button("\(count)") { count += 1 }
    }
}
```

---

## 十二、踩坑

1. **Release build 还放 `Self._printChanges()`**——只是 debug 工具,Release 删掉。
2. **`AnyView` 包一切**——SwiftUI diff 失效,性能下降。`@ViewBuilder` 替代。
3. **大 ForEach 用 `id: \.self`**——大对象比较慢,用 Identifiable + 自动 id。
4. **`ScrollView { VStack { ForEach(thousand) } }`**——不 Lazy,1000 个 view 一次性创建。
5. **DateFormatter / NumberFormatter 在 body 里新建**——非常慢,提到 static let。
6. **`id(UUID())` 强制重建**——所有 `@State` 重置,贵且通常不是想要的。
7. **整个 Store 是 `ObservableObject`**——所有字段变都全树刷新,改 `@Observable`。
8. **`onChange` 高频改 state**——配 debounce 或 throttle。
9. **图片用原图 4K 直接 Image()**——image 解码占主线程,Image 解到屏幕 size,或者用 `AsyncImage` + `.thumbnail`。
10. **State 提到太高层**——改任一字段触发整棵树参与 diff。状态尽量下沉到只用它的子视图。

---

下一篇 `25-Instruments与MetricKit.md`,讲 Instruments 模板选型(Time Profiler / Allocations / Leaks)、火焰图读法、retain cycle / Leaks 局限、SwiftUI Instruments、`.crash` / `.ips` 符号化、`dSYM` 与 Xcode Organizer、`MetricKit` `MXMetricPayload` 自动上报、`os_log` 与 `OSLogStore` 检索、真机 vs 模拟器测试边界。
