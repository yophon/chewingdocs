# NavigationStack 路由

`NavigationView` 在 iOS 16 已经 deprecated,2026 年还用它就是给自己挖坑。新方案是 **`NavigationStack` + 类型化路由**——这是 iOS 16 引入、iOS 18 完善的导航 API,核心思想是"用值类型 path 描述导航栈,push 一个值而不是 push 一个 View"。这一篇讲透:**`NavigationStack(path:)` / `NavigationLink(value:)` / `.navigationDestination(for:)` 三件套、`NavigationSplitView` 双栏布局、deep link 与 `onOpenURL`、Tab 内嵌 NavigationStack 的边界、可恢复导航**。

> 一句话先记住:**`NavigationStack` 把导航栈描述成一个 `path: [SomeType]` 数组——push 一个值就 append 一个,pop 就 removeLast。视图层通过 `.navigationDestination(for:)` 声明"遇到这种类型的值,用这种 View 渲染"。这是数据驱动导航,不是 UIKit 那种命令式 push。**

---

## 一、为什么 NavigationView 必须淘汰

```swift
// ❌ 旧:iOS 13-15 写法,iOS 16 deprecated
NavigationView {
    List(notes) { note in
        NavigationLink(destination: NoteDetailView(note: note)) {
            NoteRow(note: note)
        }
    }
}
```

这套语法的问题:

1. **NavigationLink 直接持有 destination View**——视图层级里有一堆 inert 的 destination,即使没 push 也在内存里。
2. **没有 path 抽象**——你不知道当前在哪一层,也没法用程序方式 push / pop。
3. **deep link 难做**——外部 URL 触发导航要找入口 view 手动激活 NavigationLink,代码混乱。
4. **iPad 行为不一致**——NavigationView 在 iPhone 上是栈,在 iPad 上变成 master-detail 双栏,同一份代码两种行为。

`NavigationStack` 把这些都解决了。

---

## 二、NavigationStack 基本用法

```swift
struct NotesRoot: View {
    @State private var path: [Note] = []
    
    var body: some View {
        NavigationStack(path: $path) {
            List(notes) { note in
                NavigationLink(note.title, value: note)   // 注意:value:,不是 destination:
            }
            .navigationTitle("笔记")
            .navigationDestination(for: Note.self) { note in
                NoteDetailView(note: note)
            }
        }
    }
}
```

三件事:
1. **`NavigationStack(path: $path)`**——绑定一个 path 数组,作为"当前栈"。
2. **`NavigationLink("...", value: ...)`**——点击时 append 一个值到 path。
3. **`.navigationDestination(for: Note.self) { ... }`**——声明"path 里出现 Note 类型时,用这个闭包构造对应 View"。

这套机制下,**导航就是数组操作**:

```swift
path.append(note)                       // 等价于 push
path.removeLast()                       // pop
path.removeAll()                        // pop to root
path = [n1, n2, n3]                     // 直接重置整个栈
```

---

## 三、异构路由:多种类型混在一个栈

```swift
struct Router: View {
    @State private var path = NavigationPath()    // 类型擦除的 path,可装异构
    
    var body: some View {
        NavigationStack(path: $path) {
            HomeView()
                .navigationDestination(for: Note.self) { NoteDetailView(note: $0) }
                .navigationDestination(for: Tag.self) { TagView(tag: $0) }
                .navigationDestination(for: SettingsRoute.self) { 
                    SettingsView(route: $0)
                }
        }
    }
}

enum SettingsRoute: Hashable {
    case account, privacy, about
}
```

`NavigationPath` 是 SwiftUI 提供的类型擦除版,可以 append 任何 `Hashable` 的值,内部用编码方式存。这让你在一个 NavigationStack 里 push Note → Tag → SettingsRoute → Note 这种混合栈。

```swift
path.append(note)                       // append Note
path.append(tag)                        // 同一个 path 装 Tag
path.append(SettingsRoute.privacy)      // 再装 enum
```

每种类型在 `.navigationDestination(for:)` 里有独立 handler。

---

## 四、程序化导航:不用 NavigationLink

```swift
struct ListView: View {
    @Binding var path: [Note]
    
    var body: some View {
        List(notes) { note in
            Button(note.title) {
                path.append(note)        // 程序触发导航
            }
        }
    }
}
```

`NavigationLink(value:)` 是声明式 UI,Button + path.append 是命令式。两者**完全等价**——前者本质是 SwiftUI 的语法糖,内部也是改 path。

在某些场景必须用命令式(异步操作完成后才决定 push 哪个):

```swift
Button("登录") {
    Task {
        do {
            try await login()
            path.append(HomeRoute.main)
        } catch {
            // 显示错误
        }
    }
}
```

---

## 五、deep link:URL 触发导航

```swift
struct App: View {
    @State private var path = NavigationPath()
    
    var body: some Scene {
        WindowGroup {
            NavigationStack(path: $path) {
                HomeView()
                    .navigationDestination(for: Note.self) { ... }
            }
            .onOpenURL { url in
                handleDeepLink(url, into: &path)
            }
        }
    }
    
    private func handleDeepLink(_ url: URL, into path: inout NavigationPath) {
        // notesisland://note/UUID
        guard url.scheme == "notesisland", url.host == "note",
              let id = UUID(uuidString: url.lastPathComponent),
              let note = findNote(id: id)
        else { return }
        
        path = NavigationPath()        // 清栈
        path.append(note)              // push 到目标
    }
}
```

`.onOpenURL` 是 SwiftUI 接收外部 URL 的口子,App 协议级 modifier。`Info.plist` 里要声明 URL Scheme(`CFBundleURLTypes`),Universal Link 还要配 `apple-app-site-association` 文件——这部分 14 篇会展开。

iOS 17+ 还有 `.handlesExternalEvents` / `App Intents` 等更结构化的入口方式,19 篇展开。

---

## 六、可恢复导航:序列化 path

`NavigationPath` 支持 `Codable`,可以序列化到磁盘,App 启动时恢复:

```swift
struct App: View {
    @State private var path = NavigationPath()
    
    var body: some Scene {
        WindowGroup {
            NavigationStack(path: $path) { ... }
                .task {
                    // 启动时恢复
                    if let data = try? Data(contentsOf: pathURL),
                       let restored = try? JSONDecoder().decode(
                           NavigationPath.CodableRepresentation.self,
                           from: data
                       ) {
                        path = NavigationPath(restored)
                    }
                }
                .onChange(of: path) { _, newPath in
                    // 实时保存
                    if let repr = newPath.codable {
                        try? JSONEncoder().encode(repr).write(to: pathURL)
                    }
                }
        }
    }
}
```

前提:path 里的所有类型都满足 `Codable & Hashable`。enum + associated value 的路由很容易做到。

> 用户用着用着 App 被系统杀死,再回来时直接停在同样位置——这是 iOS 体验细节。可恢复路由不难,但要从一开始就把路由值设计成 Codable。

---

## 七、NavigationSplitView:iPad 双栏 / 三栏

```swift
struct iPadRoot: View {
    @State private var selectedNote: Note?
    
    var body: some View {
        NavigationSplitView {
            // sidebar(左栏)
            List(notes, selection: $selectedNote) { note in
                NavigationLink(note.title, value: note)
            }
            .navigationTitle("笔记")
        } detail: {
            // detail(右栏)
            if let note = selectedNote {
                NoteDetailView(note: note)
            } else {
                ContentUnavailableView("选择笔记", systemImage: "doc.text")
            }
        }
    }
}
```

`NavigationSplitView` 在 iPhone 上自动退化成栈式导航;在 iPad 上是侧栏 + 详情;在 Mac 上是三栏(sidebar + content + detail)。

三栏版本:

```swift
NavigationSplitView {
    // sidebar
    SidebarView(selectedFolder: $folder)
} content: {
    // content list
    NotesListView(folder: folder, selected: $note)
} detail: {
    // detail
    NoteDetailView(note: note)
}
```

iPad 上 90% 的应用都该用 NavigationSplitView,避免在大屏上用单栏栈——大屏单栏意味着大量空白浪费。

---

## 八、Tab 与 NavigationStack 的组合

```swift
struct Root: View {
    var body: some View {
        TabView {
            NavigationStack {
                NoteListView()
                    .navigationDestination(for: Note.self) { NoteDetailView(note: $0) }
            }
            .tabItem { Label("笔记", systemImage: "note.text") }
            
            NavigationStack {
                SearchView()
                    .navigationDestination(for: Tag.self) { TagView(tag: $0) }
            }
            .tabItem { Label("搜索", systemImage: "magnifyingglass") }
            
            NavigationStack {
                SettingsView()
            }
            .tabItem { Label("设置", systemImage: "gear") }
        }
    }
}
```

**每个 Tab 各自包一个 NavigationStack**——这是 iOS 的标准模式。每个 Tab 有独立的导航栈,切换 Tab 不影响栈状态。

错误做法:

```swift
// ❌ NavigationStack 包 TabView
NavigationStack {
    TabView { ... }
}
// 切 Tab 时栈不重置,行为混乱
```

iOS 18+ 推出 `TabSection` / 可定制 Tab Bar / sidebar adaptive,但基本结构没变。

---

## 九、`.navigationDestination` 必须在 NavigationStack 内部

```swift
// ❌ destination 在外面
NavigationStack { HomeView() }
    .navigationDestination(for: Note.self) { ... }   // 不工作

// ✅ destination 在 NavigationStack 内的某个 view 上
NavigationStack {
    HomeView()
        .navigationDestination(for: Note.self) { ... }
}
```

`.navigationDestination(for:)` 必须挂在 NavigationStack 的 content 子视图上,通常是根 view 上。可以在子视图上多个不同类型,但只需要写一次。

---

## 十、退出导航与 dismiss

```swift
struct DetailView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        Button("返回") { dismiss() }   // 弹出当前 view
    }
}
```

`@Environment(\.dismiss)` 在 NavigationStack 里等同于 pop;在 sheet / fullScreenCover 里等同于关闭 modal。**通用的"返回上一层"**。

iOS 17+ 还能用 `.navigationBarBackButtonHidden(true)` + 自定义 back button:

```swift
.navigationBarBackButtonHidden(true)
.toolbar {
    ToolbarItem(placement: .topBarLeading) {
        Button {
            // 自定义返回逻辑(比如确认 unsaved changes)
        } label: {
            HStack { Image(systemName: "chevron.left"); Text("草稿") }
        }
    }
}
```

---

## 十一、踩坑

1. **`NavigationLink(destination:)` 还在用**——iOS 16 deprecated,改 `NavigationLink(value:)` + `.navigationDestination(for:)`。
2. **`NavigationView` 还在用**——iOS 16 deprecated,iPhone / iPad 行为不一致,改 NavigationStack。
3. **`path` 不是 `@State` 而是普通字段**——path 必须 `@State` 或 `@Binding`,否则改它不触发导航。
4. **`.navigationDestination(for: Note.self)` 重复多个**——同一类型重复声明会覆盖,只有一个生效,且 SwiftUI 不会报错,容易漏。
5. **iPad 上 NavigationStack 单栏满屏**——大屏体验差,iPad 应该用 NavigationSplitView。
6. **`onOpenURL` 在 NavigationStack 外**——`.onOpenURL` 可以放任何地方,但通常放在 Scene 或最外层 view 上,以便修改导航 state。
7. **Tab 切换栈不重置**——这是设计的,符合用户预期(从 Tab A 切到 B 再回 A,A 还在原位)。要重置写 `path.removeAll()` 监听 Tab 切换。
8. **`@State path` 在子视图改不到**——子视图要拿到 `@Binding var path: NavigationPath`(从父透传),才能改父的 path。
9. **path 里的类型不 Hashable**——`.navigationDestination(for:)` 要求类型 Hashable,Note 是 `@Model` 的话自动是 Hashable(by id)。
10. **deep link 改 path 触发不了 .navigationDestination**——通常因为 `.navigationDestination` 没在 NavigationStack 内部的 view 上。或者类型不匹配。debug 时先 print path,确认是不是真的改了。

---

下一篇 `12-SwiftData与CloudKit.md`,讲 SwiftData 全景:`@Model` 宏背后、`ModelContainer` / `ModelContext` 并发模型、`@Query` 视图订阅、`#Predicate` 类型安全查询、`VersionedSchema` + `MigrationPlan` 迁移、CloudKit 一行打开同步、`@ModelActor` 后台批量操作、与 Realm / Room 心智对照。
