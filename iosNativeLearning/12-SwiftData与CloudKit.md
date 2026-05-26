# SwiftData 与 CloudKit

iOS 上的本地持久化方案在 2024 年彻底翻了一遍。`Core Data` 三十年的 NSManagedObject 心智,被 SwiftData 用 `@Model` 宏几行代码取代;接 iCloud 同步从"配置 CKDatabase + 手写 conflict resolution + 处理 CKRecord"几百行,变成 **`.modelContainer(for:cloudKitDatabase:)` 一行**。这一篇讲透 SwiftData 全景。

> 一句话先记住:**SwiftData 底层仍然是 Core Data,前台 API 用宏 + Swift Concurrency 重做了一遍——`@Model` 标 class 就是模型,`ModelContainer` 全局唯一,`@Query` 在视图里订阅。`@MainActor` 的 `ModelContext` 跑 UI 读写,`@ModelActor` 跑后台批量。CloudKit 一行配,iCloud 同步开。**

---

## 一、SwiftData 解决什么

iOS 上历来的持久化方案:

| 方案 | 适用 | 痛点 |
| --- | --- | --- |
| `UserDefaults` | 几 KB 偏好 | 不能放结构化数据 |
| 文件(JSON / Plist / SQLite) | 完全可控 | 自己管 schema / 并发 / 迁移 / 查询 |
| Core Data | 结构化、有关系、能同步 | API 古老,几十个 NSObject 类,容易写错 |
| 第三方(Realm / GRDB) | 文档少 | 不能跟 CloudKit 同步 |

SwiftData 的承诺:**用 Core Data 的引擎,套上 Swift 6 现代 API**。

```swift
import SwiftData

@Model
final class Note {
    var title: String
    var body: String
    var createdAt: Date
    
    init(title: String, body: String = "", createdAt: Date = .now) {
        self.title = title
        self.body = body
        self.createdAt = createdAt
    }
}
```

这是完整的模型定义。`@Model` 宏展开后,Note 自动:
- 继承 `PersistentModel` 协议
- 每个 stored property 改写成可观察 / KVO 化的 getter/setter
- 注入 `persistentModelID` / `hasChanges` / `isDeleted` 等属性
- 注册到 Schema 元数据,自动生成 SQLite 表

---

## 二、ModelContainer 与 ModelContext

`ModelContainer` 是全局唯一的容器:持有 schema、存储 URL、配置。`ModelContext` 是操作上下文,等价于 Core Data 的 `NSManagedObjectContext`。

```swift
@main
struct NotesIslandApp: App {
    let container: ModelContainer
    
    init() {
        do {
            let schema = Schema([Note.self, Tag.self])
            let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
            container = try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("ModelContainer init failed: \(error)")
        }
    }
    
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(container)        // 注入到整棵视图树
    }
}
```

视图内部通过 `@Environment(\.modelContext)` 拿到 main context(已经在 `@MainActor` 上):

```swift
struct AddNoteView: View {
    @Environment(\.modelContext) private var context
    @State private var title = ""
    
    var body: some View {
        Form {
            TextField("标题", text: $title)
            Button("保存") {
                let note = Note(title: title)
                context.insert(note)        // 加入 context
                try? context.save()          // 落盘
            }
        }
    }
}
```

`context.insert(note)` 加入 context 但还在内存,`save()` 真正落盘。多数情况下 SwiftUI 会**自动 save**(下次 runloop tick),但**关键时机最好手动 save**(导航前、App 进后台前)。

---

## 三、@Query:在视图里订阅持久化集合

```swift
struct NoteListView: View {
    @Query(sort: \Note.createdAt, order: .reverse)
    private var notes: [Note]
    
    var body: some View {
        List(notes) { note in
            NavigationLink(note.title, value: note)
        }
    }
}
```

`@Query` 是 SwiftData 的核心 property wrapper:**在视图里订阅一个查询,数据变化自动重渲染**。心智跟 `@State` 一致——你只声明"我要什么",改动由 SwiftData 推过来。

参数:
- `sort:` 排序 keyPath
- `order:` `.forward` / `.reverse`
- `filter:` `#Predicate` 类型安全的过滤
- `fetchLimit:` 最多取多少条

```swift
@Query(
    filter: #Predicate<Note> { $0.title.contains("待办") },
    sort: \Note.createdAt,
    order: .reverse,
    fetchLimit: 20
)
private var todos: [Note]
```

`#Predicate` 是 Foundation 提供的宏,类型安全:**写错字段编译期就报错,不像 Core Data 的 `NSPredicate(format: "title CONTAINS %@", ...)` 在运行时炸**。

动态查询(参数从 state 来):

```swift
struct SearchView: View {
    @State private var query = ""
    
    var body: some View {
        SearchResultList(query: query)
    }
}

struct SearchResultList: View {
    @Query private var results: [Note]
    
    init(query: String) {
        let predicate = #Predicate<Note> {
            query.isEmpty || $0.title.contains(query)
        }
        _results = Query(filter: predicate, sort: \.createdAt)
    }
    
    var body: some View {
        List(results) { ... }
    }
}
```

`@Query` 在 init 里用底层 `Query(...)` 重新初始化,实现动态查询。

---

## 四、关系建模

SwiftData 支持一对一、一对多、多对多:

```swift
@Model
final class Note {
    var title: String
    var body: String
    var createdAt: Date
    
    @Relationship(deleteRule: .cascade, inverse: \Attachment.note)
    var attachments: [Attachment] = []
    
    @Relationship(inverse: \Tag.notes)
    var tags: [Tag] = []
    
    init(title: String, body: String = "") {
        self.title = title
        self.body = body
        self.createdAt = .now
    }
}

@Model
final class Attachment {
    var url: URL
    var note: Note?           // 反向(一对多的多端)
    
    init(url: URL) { self.url = url }
}

@Model
final class Tag {
    var name: String
    @Relationship(inverse: \Note.tags)
    var notes: [Note] = []
    
    init(name: String) { self.name = name }
}
```

`@Relationship` 参数:
- **`deleteRule`**:`.cascade` 级联删除 / `.nullify` 置空 / `.deny` 阻止 / `.noAction` 不处理
- **`inverse`**:声明反向关系,**必须双向都写 inverse**(否则可能产生孤儿)

---

## 五、ModelContext 的并发模型

`@MainActor` 的 main context 在主线程,适合 UI 读写。批量导入 / 大查询不能阻塞 UI,要用 `@ModelActor` 自定义 actor:

```swift
@ModelActor
actor BatchImporter {
    func importNotes(_ items: [NoteDTO]) throws {
        // modelContext 是 actor 隔离的,自动跑后台
        for dto in items {
            let note = Note(title: dto.title, body: dto.body)
            modelContext.insert(note)
        }
        try modelContext.save()
    }
}

// 使用
let importer = BatchImporter(modelContainer: container)
try await importer.importNotes(largeBatch)
```

`@ModelActor` 宏会注入一个 `modelContainer` 和 `modelContext` 属性,且自动 actor 隔离。**这是 Swift 6 把数据竞争消灭在编译期的标志性设计——你写不出来非线程安全的 SwiftData 代码**。

**跨 actor 传递 `@Model` 实例的规则**:`@Model` 是 class,有引用 + 内部状态,不是 Sendable。**跨 actor 要传 `PersistentIdentifier`,在目标 actor 内用 `modelContext.model(for: id)` 重新拿到实例**:

```swift
@MainActor
func userTapped(_ note: Note) async {
    let id = note.persistentModelID
    try await importer.process(noteID: id)
}

@ModelActor
actor Importer {
    func process(noteID: PersistentIdentifier) throws {
        guard let note: Note = modelContext.model(for: noteID) as? Note else { return }
        note.title += " (processed)"
        try modelContext.save()
    }
}
```

---

## 六、Schema 迁移

模型字段变化(加字段、改类型、改关系),要做 schema migration:

```swift
// V1 模型
enum SchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] { [Note.self] }
    
    @Model
    final class Note {
        var title: String
        init(title: String) { self.title = title }
    }
}

// V2 加了 createdAt
enum SchemaV2: VersionedSchema {
    static var versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] { [Note.self] }
    
    @Model
    final class Note {
        var title: String
        var createdAt: Date
        init(title: String, createdAt: Date = .now) {
            self.title = title
            self.createdAt = createdAt
        }
    }
}

enum NotesMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [SchemaV1.self, SchemaV2.self]
    }
    
    static var stages: [MigrationStage] {
        [
            MigrationStage.lightweight(fromVersion: SchemaV1.self, toVersion: SchemaV2.self)
        ]
    }
}

// 容器配置
container = try ModelContainer(
    for: SchemaV2.self,
    migrationPlan: NotesMigrationPlan.self
)
```

**Lightweight migration** 适用于"加字段、删字段、改可选性"等简单变化,自动完成。**Custom migration** 用 `.custom(fromVersion:toVersion:willMigrate:didMigrate:)` 写代码迁移逻辑,适用于复杂场景(字段拆分、合并)。

---

## 七、CloudKit 同步:一行打开

```swift
let config = ModelConfiguration(
    schema: schema,
    cloudKitDatabase: .private(containerID: "iCloud.com.example.NotesIsland")
)
container = try ModelContainer(for: schema, configurations: [config])
```

`.private` 是用户私有数据库,跟着 iCloud 账号走。`.public` 是公共数据库(所有用户共享),`.shared` 是共享数据库(用户分享给其他用户)。

要让 CloudKit 工作,还要:
1. **Xcode → Signing & Capabilities → 加 iCloud capability,勾 CloudKit,填 container ID**
2. **`@Model` 类的所有字段必须有默认值**(CloudKit 要求字段可选或有默认)
3. **`@Relationship` 必须有 inverse**(双向)

`@Model` 类与 CloudKit Record 映射规则:
- 类名 → Record Type
- 字段名 → Field
- `persistentModelID` → CloudKit `recordID`

冲突解决:**SwiftData 默认 last-write-wins**(后写的覆盖)。复杂业务需要自定义冲突合并的话,通常用 CloudKit 直接 API,SwiftData 这部分还不够成熟。

> CloudKit 同步是"几乎免费"的——前提是模型简单 + 字段都有默认值 + 关系双向。**真实应用中 80% 场景这就够了**;那 20% 需要细粒度控制的场景(冲突合并策略、大数据集分页、增量同步),可能要 fallback 到 Core Data + CKSyncEngine。

---

## 八、@Model + @Observable 的兼容性

`@Model` 类自动实现了 `Observable`——你在视图里读它的字段,SwiftUI 会自动追踪。`@Bindable` 也能用:

```swift
struct EditView: View {
    @Bindable var note: Note    // @Model 实例直接 @Bindable
    
    var body: some View {
        Form {
            TextField("标题", text: $note.title)         // 双向绑定到 SwiftData 字段
            TextEditor(text: $note.body)
        }
        // 改动会被 SwiftData 自动追踪并 save
    }
}
```

这是 SwiftData + SwiftUI 一体感的根本——`@Model` / `@Observable` / `@Bindable` 用同一套 Observation 框架,字段级追踪能直接覆盖到持久化对象。

---

## 九、与 Realm / Room 对照

| 维度 | SwiftData | Realm | Room (Android) |
| --- | --- | --- | --- |
| 模型 | `@Model class` | `class: Object` | `@Entity data class` + DAO |
| 主键 | 自动 `persistentModelID` | `@objc dynamic id` | `@PrimaryKey` |
| 查询 | `@Query` + `#Predicate` | `RealmResults` LiveResults | `Flow<List<T>>` |
| 关系 | `@Relationship` + inverse | `LinkingObjects` | `@Relation` + join |
| 迁移 | `VersionedSchema` + `MigrationPlan` | `schemaVersion` + block | `Migration` + SQL |
| 云同步 | CloudKit 一行 | 商业版有 | 自己接 Firebase |
| Schema 类型安全 | ✅(Swift 类型) | ✅ | ✅ |
| Predicate 类型安全 | ✅(`#Predicate` 宏) | ✅ | ❌(SQL 字符串) |

**SwiftData 最大优势**:跟 SwiftUI 同团队设计,`@Query` 和 `@State` 心智一致,不用手写 Combine / Flow 桥接。

**SwiftData 当前短板**:复杂查询(多级 join、子查询、聚合)、批量更新性能(对比 GRDB)、迁移复杂度。这些场景 fallback 到 Core Data + `NSFetchRequest` 或 GRDB。

---

## 十、踩坑

1. **`@Model` 类没字段默认值,接 CloudKit 失败**——CloudKit 要求所有字段可选或有默认。要么字段标 `?`,要么 init 里给默认值。
2. **`@Relationship` 不加 `inverse`**——产生孤儿对象、内存泄漏、CloudKit 同步异常。双向关系必加。
3. **跨 actor 传 `@Model` 实例 crash**——`@Model` 不 Sendable,跨 actor 必传 `PersistentIdentifier`。
4. **`ModelContainer` 创建多次**——每次创建都是独立数据库连接,导致数据不一致。全局唯一,App 启动时建一次。
5. **`@Query` 写在 init 里用动态参数**——`@Query` macro 需要编译期常量,动态用 `_query = Query(...)`。
6. **`#Predicate` 里调用非 Foundation 函数**——`#Predicate` 编译期会检查能不能转 SQL/CloudKit 表达式,自定义函数转不了。复杂逻辑放外面手动 filter。
7. **`context.save()` 在每个改动后都调**——SwiftUI 通常会在 runloop 自动 save,频繁手动 save 反而拖性能。关键节点 save 即可。
8. **CloudKit 同步默默失败**——CloudKit 需要 device 登录 iCloud,且 Xcode 项目 capability 配对。模拟器登录 iCloud 也行,但首次同步可能要几秒到几十秒。
9. **`@Bindable note` 但 note 来自 @Query**——@Query 返回的实例本身就可绑定,直接 `@Bindable var note: Note` OK。但要注意:`@Query` 数组每次 SwiftData 通知都可能换实例,`@Bindable` 拿到的是当前快照。
10. **Lightweight migration 改字段类型崩**——加字段、删字段 OK,改字段类型(`String` → `Int`)是 destructive migration,必须 custom migration plan。

---

下一篇 `13-URLSession与网络层.md`,讲 `URLSession.data(for:) async` / `URLSession.bytes(for:)` 流式 API、`Codable` 与 `JSONDecoder` key strategy、错误模型 `URLError`、自建拦截器 / Retry / Adapter、跟 actor 配合的请求队列、Combine 何时仍胜出(Notification / Timer 桥接)。
