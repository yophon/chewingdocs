# 14 SwiftData 全景:@Model / ModelContainer / @Query / Schema 迁移 / CloudKit 同步

> 基线:iOS 18 (最低部署目标) / Swift 6 严格并发 / Xcode 16 / SwiftUI / SwiftData。

NotesIsland 的 UI 和导航跑通了,但所有数据都还是 `[NoteSummary.samples]` 这种硬编码 mock。这一篇要把它换成**真正的本地持久化 + iCloud 同步**——也就是 SwiftData。

SwiftData 是 Apple 在 WWDC 2023 推出、iOS 17 落地、iOS 18 全面稳定的新数据持久化框架。它**底层仍然是 Core Data**,但前台 API 用 macro + Swift Concurrency 重做了一遍,扔掉了 `NSManagedObjectContext` / `NSPersistentContainer` / `NSFetchRequest` 那些古早 NSObject 心智。

这一篇会把 SwiftData 从 0 到 1 全讲清:模型怎么定义、容器怎么注入、查询怎么订阅、schema 怎么迁移、iCloud 怎么开。

---

## 一、机制定位

### 1.1 SwiftData 解决什么问题

iOS 上的持久化方案历来三套:

| 方案 | 适用 | 痛点 |
| --- | --- | --- |
| `UserDefaults` | 几 KB 偏好 | 不能放结构化数据,key-value plist 不可查询 |
| 直接写文件(JSON / Plist / SQLite) | 完全可控 | 自己管 schema、并发、迁移、查询、缓存,工程量爆炸 |
| Core Data | 结构化、有关系、能同步 iCloud | API 古老,几十个 NSObject 类,容易写错 |

第三方还有 Realm / GRDB / SQLite.swift,但**都不能跟 CloudKit 自动同步**。

SwiftData 的承诺:**用 Core Data 的引擎能力,套上 Swift 6 现代化的 API**。具体来说:

- 用 `@Model` 宏定义模型,一行宏展开成 NSManagedObject 子类 + meta;
- 用 `ModelContainer` 替代 `NSPersistentContainer`,SwiftUI 一行注入;
- 用 `@Query` 在视图里订阅,数据变了视图自动 invalidate,**心智跟 `@State` 一致**;
- 用 `#Predicate` 宏写类型安全的查询,编译期就能查错;
- 用 `VersionedSchema` + `MigrationPlan` 做 schema 演进,**告别手写 `.xcdatamodeld` 拖拽 mapping**;
- 用 `.modelContainer(for: ..., cloudKitDatabase:)` 一行打开 iCloud 同步。

### 1.2 与 Realm / Room 心智对照

| 维度 | SwiftData | Realm | Room (Android) |
| --- | --- | --- | --- |
| 模型定义 | `@Model class Note` | `class Note: Object` | `@Entity data class Note` + DAO |
| 主键 | 默认隐式 `persistentModelID` | `@objc dynamic var id` | `@PrimaryKey` |
| 查询订阅 | `@Query` 视图层订阅 | `RealmResults` LiveResults | `Flow<List<Note>>` + Coroutine |
| 关系 | `@Relationship` + 反向 | `LinkingObjects` | `@Relation` + multimap join |
| 迁移 | `VersionedSchema` + `MigrationPlan` | `schemaVersion + migrationBlock` | `Migration` + 手写 SQL |
| 云同步 | `cloudKitDatabase: .private` 一行 | 商业版才有 | 自己接 Firebase / 自建 |

SwiftData 最大优势:**和 SwiftUI 是同一团队设计的**,`@Query` 和 `@State` 用起来心智一致,不用手写 `Combine` 或 `Flow` 桥接。

---

## 二、Apple 平台心智

### 2.1 五个核心概念

| 概念 | framework | 角色 |
| --- | --- | --- |
| `@Model` | SwiftData | 宏,把 class 标成持久化模型 |
| `ModelContainer` | SwiftData | 容器,持有 schema + 存储 URL + 配置 |
| `ModelContext` | SwiftData | 操作上下文,等价于 Core Data 的 NSManagedObjectContext |
| `@Query` | SwiftData | property wrapper,在视图里订阅查询结果 |
| `#Predicate` | Foundation | 宏,类型安全的查询条件 |

### 2.2 ModelContext 的并发模型

这是 Swift 6 时代 SwiftData 最重要的心智:

- **`@MainActor` 的 main context**:`@Query` / `@Environment(\.modelContext)` 拿到的都是这个,跑在主线程,**绑定到 SwiftUI 视图刷新**。
- **后台 `ModelActor`**:批量导入、大查询不能阻塞 UI,要用 `@ModelActor` 自定义 actor,在它内部用独立的 `modelContext`。

```swift
@ModelActor
actor ImportActor {
    func importBatch(_ items: [ItemDTO]) throws {
        // 这里的 modelContext 是 actor 隔离的,不会卡 UI
        for dto in items { modelContext.insert(Note(from: dto)) }
        try modelContext.save()
    }
}
```

`@ModelActor` 宏会自动给 actor 注入一个 isolated 的 `modelContext`,你只管写业务。这是 Swift 6 把数据竞争消灭在编译期的标志性设计。

### 2.3 `@Model` 宏背后

`@Model class Note { var title: String }` 宏展开后,Note 会:

1. 继承 `PersistentModel` 协议(本身是 reference type);
2. 每个 stored property 被改写成 `_$observationRegistrar` + KVO 化的 getter / setter;
3. 自动注入 `persistentModelID`、`hasChanges`、`isDeleted` 等属性;
4. 注册到当前 `Schema` 的元数据里,供 SQLite 表结构生成使用。

**所以 `@Model` 的实例是引用类型**(class 而非 struct),跨 actor 传递会被 Swift 6 严格并发拦下。规则:**`@Model` 实例只在创建它的 `ModelContext` 所在的 isolation 域内使用,跨域要传 `PersistentIdentifier` 再 fetch**。

### 2.4 关系建模

SwiftData 支持一对一、一对多、多对多,通过 `@Relationship` 宏声明:

```swift
@Model
final class Note {
    var title: String
    @Relationship(deleteRule: .cascade, inverse: \Attachment.note)
    var attachments: [Attachment] = []
}
```

- `deleteRule`:`.cascade` 级联删除、`.nullify` 置空、`.deny` 阻止、`.noAction` 不处理。
- `inverse`:声明反向关系,SwiftData 才能在一端改动时自动维护另一端,避免引用泄漏。**双向关系永远要补 inverse**。

---

## 三、工程实现

下面给 NotesIsland 数据层的完整骨架:Note + Attachment 模型、Container 注入、列表订阅、增删改、CloudKit 同步、schema 迁移。

### 3.1 模型层

```swift
// File: Data/Models/Note.swift

import Foundation
import SwiftData

// MARK: - 笔记主模型(Schema V1)
@Model
final class Note {
    /// 隐式主键 persistentModelID 已存在,但跨设备同步要稳定 ID,自己也加一份
    var id: UUID
    var title: String
    var body: String
    var createdAt: Date
    var updatedAt: Date
    /// 关系:一篇笔记多个附件
    @Relationship(deleteRule: .cascade, inverse: \Attachment.note)
    var attachments: [Attachment] = []
    /// 关系:多对多 tag
    @Relationship(inverse: \Tag.notes)
    var tags: [Tag] = []

    init(id: UUID = UUID(), title: String, body: String = "") {
        self.id = id
        self.title = title
        self.body = body
        self.createdAt = .now
        self.updatedAt = .now
    }
}

// MARK: - 附件(图片 / 音频)
@Model
final class Attachment {
    var id: UUID
    var kind: Kind
    /// 不存大二进制,存文件 URL 字符串
    var localFilename: String
    var note: Note?

    enum Kind: String, Codable { case image, audio }

    init(kind: Kind, localFilename: String) {
        self.id = UUID()
        self.kind = kind
        self.localFilename = localFilename
    }
}

// MARK: - tag
@Model
final class Tag {
    @Attribute(.unique) var name: String
    var notes: [Note] = []

    init(name: String) { self.name = name }
}
```

几个工程细节:

- **`@Attribute(.unique)`** 给字段加唯一索引,违反唯一性时 save 抛 `SwiftDataError`。
- **关系的 inverse 写在哪一端都行**,只写一端就够,SwiftData 会自动同步另一端。
- **不要把大二进制(图片字节、音频字节)存进 `@Model`**,SwiftData 默认会塞进 SQLite,几百兆数据 + iCloud 同步会爆炸。永远把文件存 App Documents,数据库里只放路径。

### 3.2 容器注入

```swift
// File: Data/Stack/ModelStack.swift

import Foundation
import SwiftData

// MARK: - Schema 版本登记
enum SchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] {
        [Note.self, Attachment.self, Tag.self]
    }
}

// MARK: - 容器构造
enum ModelStack {
    static func makeContainer(inMemory: Bool = false,
                              cloudKit: Bool = true) -> ModelContainer {
        let schema = Schema(versionedSchema: SchemaV1.self)
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: inMemory,
            cloudKitDatabase: cloudKit ? .private("iCloud.com.example.NotesIsland") : .none
        )
        do {
            return try ModelContainer(for: schema, migrationPlan: NotesMigrationPlan.self,
                                      configurations: [config])
        } catch {
            // 持久化打不开时 fatalError 比静默降级好,问题暴露在开发期
            fatalError("ModelContainer init failed: \(error)")
        }
    }
}
```

```swift
// File: Features/App/NotesIslandApp.swift

import SwiftUI
import SwiftData

@main
struct NotesIslandApp: App {
    let container: ModelContainer = ModelStack.makeContainer()

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(container)
    }
}
```

`.modelContainer(container)` 是 SwiftUI 提供的 modifier,内部把 container 和它的 `mainContext` 注入到 environment。从此任意子 View 都能通过 `@Environment(\.modelContext)` 拿到主上下文,通过 `@Query` 订阅。

### 3.3 视图层订阅

```swift
// File: Features/Notes/NoteListView.swift

import SwiftUI
import SwiftData

struct NoteListView: View {
    // MARK: - 类型安全的查询
    @Query(
        filter: #Predicate<Note> { $0.title.isEmpty == false },
        sort: \.updatedAt, order: .reverse,
        animation: .default
    ) private var notes: [Note]

    @Environment(\.modelContext) private var context
    @Environment(AppRouter.self) private var router

    var body: some View {
        List {
            ForEach(notes) { note in
                NavigationLink(value: Route.note(id: note.id)) {
                    VStack(alignment: .leading) {
                        Text(note.title).font(.headline)
                        Text(note.updatedAt, style: .relative)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .onDelete(perform: delete)
        }
        .toolbar {
            Button("新建", systemImage: "plus") { create() }
        }
    }

    // MARK: - 增
    private func create() {
        let note = Note(title: "未命名")
        context.insert(note)
        // 不需要手动 save,SwiftData 默认 autosave 在主 context 里跑
        router.push(.editor(id: note.id))
    }

    // MARK: - 删
    private func delete(at offsets: IndexSet) {
        for i in offsets { context.delete(notes[i]) }
    }
}
```

- `@Query` 接受 `filter`、`sort`、`animation` 三个核心参数;`#Predicate` 在编译期校验你引用的字段确实存在于 `Note` 上,**写错字段名编译就报错**,告别旧 Core Data 的字符串 keypath。
- `context.insert / delete` 后**不必显式 save**——SwiftData 默认每个 run loop tick 末尾 autosave。需要立即写盘(如 App 即将退后台)再 `try context.save()`。
- `@Query` 是**响应式的**:数据库里的 Note 任意属性变了、新插入、删除,SwiftUI 自动 invalidate 这个 View,效果跟 `@Observable` 字段级追踪一致。

### 3.4 复杂查询 fallback 到 NSPredicate

`#Predicate` 大部分场景够用,但是**正则、子查询、`@count` 这些**它目前不支持。这时候 fallback 到 `FetchDescriptor` + `NSPredicate`:

```swift
// File: Data/Repository/NoteRepository.swift

import Foundation
import SwiftData

@MainActor
struct NoteRepository {
    let context: ModelContext

    // MARK: - 用 #Predicate 写简单查询
    func notes(taggedAs name: String) throws -> [Note] {
        let desc = FetchDescriptor<Note>(
            predicate: #Predicate { note in
                note.tags.contains(where: { $0.name == name })
            },
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        return try context.fetch(desc)
    }

    // MARK: - 复杂查询走 NSPredicate(iOS 18+ 已经能 #Predicate 大多数,这里只演示降级)
    func notesContaining(_ keyword: String) throws -> [Note] {
        let desc = FetchDescriptor<Note>(
            predicate: #Predicate { note in
                note.title.localizedStandardContains(keyword) ||
                note.body.localizedStandardContains(keyword)
            }
        )
        return try context.fetch(desc)
    }
}
```

`localizedStandardContains` 已经是 `#Predicate` 支持的方法(iOS 18 增补)。**真的需要 NSPredicate**的场景:正则 (`MATCHES`)、`@count`、`SUBQUERY`,这时候 `FetchDescriptor` 也接 `NSPredicate`,但要绕路:取出 `NSManagedObjectContext` 然后用底层 Core Data API。能不绕就别绕,**95% 业务都能用 `#Predicate` 解决**。

### 3.5 Schema 迁移

实际开发到第二个版本,要给 Note 加 `isPinned` 字段并把 `title` 改成必填:

```swift
// File: Data/Stack/SchemaV2.swift

import SwiftData

enum SchemaV2: VersionedSchema {
    static var versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] {
        [NoteV2.self, Attachment.self, Tag.self]
    }

    @Model
    final class NoteV2 {
        var id: UUID
        var title: String
        var body: String
        var createdAt: Date
        var updatedAt: Date
        var isPinned: Bool = false  // 新增
        @Relationship(deleteRule: .cascade, inverse: \Attachment.note)
        var attachments: [Attachment] = []
        @Relationship(inverse: \Tag.notes)
        var tags: [Tag] = []

        init(id: UUID = UUID(), title: String, body: String = "") {
            self.id = id; self.title = title; self.body = body
            self.createdAt = .now; self.updatedAt = .now
        }
    }
}

// MARK: - 迁移计划
enum NotesMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [SchemaV1.self, SchemaV2.self]
    }
    static var stages: [MigrationStage] {
        [migrateV1toV2]
    }

    static let migrateV1toV2 = MigrationStage.lightweight(
        fromVersion: SchemaV1.self,
        toVersion: SchemaV2.self
    )
}
```

- **轻量级迁移**(`.lightweight`)适用于纯增字段、字段有默认值、关系不变。SwiftData 自动跑,无需写代码。
- **自定义迁移**(`.custom(fromVersion:toVersion:willMigrate:didMigrate:)`)用于字段语义变了、要数据清洗。两个闭包都拿到 `ModelContext`,你自己跑 SQL 风格的 transformation。

迁移失败的兜底:容器初始化抛错。**生产代码要 catch 这个错**,引导用户「数据不兼容,请更新到最新版本」,而不是 fatalError 给一个白屏。

### 3.6 CloudKit 同步

`ModelConfiguration` 的 `cloudKitDatabase` 参数就是开关:

- `.private("iCloud.<container-id>")`:私有数据库,用户自己的 iCloud,跨设备同步同一个 Apple ID。
- `.shared(...)`:共享数据库,可邀请他人编辑。
- `.public(...)`:公共数据库,所有用户可见。
- `.none`:本地存储。

要让 CloudKit 跑起来,还需要在 Xcode:

1. Signing & Capabilities 加 **iCloud** capability,勾 CloudKit,新建一个容器 ID(必须以 `iCloud.` 开头)。
2. 加 **Background Modes**,勾 **Remote notifications**(CloudKit 后台推送变更)。
3. 在 CloudKit Dashboard 部署 schema 到生产环境(开发期会自动建,上线前要 Deploy to Production)。

代码上你**几乎啥都不用改**。需要注意的限制:

- 所有关系**必须 optional 或带默认值**(CloudKit 没有 NOT NULL 概念)。
- `@Attribute(.unique)` **不能用于 CloudKit 模型**——CloudKit 不支持唯一约束,Xcode 16 会编译警告。
- 二进制大字段会成 `CKAsset`(独立云存储),所以**附件路径方案天然友好**。

---

## 四、调参与验收

### 4.1 关键参数

| 参数 | 影响 | 推荐 |
| --- | --- | --- |
| `ModelConfiguration.isStoredInMemoryOnly` | 测试用 | Preview / Unit Test 走 true |
| `ModelContext.autosaveEnabled` | 性能 vs 数据安全 | UI context 保 true,后台 actor 手动 save |
| `@Query` 的 `animation` | 列表插入/删除动画 | `.default` 即可,有大量行考虑 nil |
| `FetchDescriptor.fetchLimit` | 内存 | 列表分页或预览用 100 上限 |
| CloudKit 容器 ID | 跨 App 同步 | 同一 App family 共享一个 |

### 4.2 手动验证步骤

1. **CRUD 闭环**:启动后点「新建」→ 进编辑器输入 → 返回列表能看到新行,列表按 `updatedAt` 倒序。
2. **数据持久化**:杀掉 App 重启,数据仍在。
3. **@Query 响应**:在另一个 View 里改了 Note(比如设置页加按钮 batch 改 title),列表自动刷新。
4. **关系级联**:删除一条 Note,它关联的 Attachment 全部消失(deleteRule: .cascade)。
5. **唯一约束**:重复插入同名 Tag 应抛错。
6. **Schema 迁移**:用 V1 跑一次写入数据 → 切到 V2 重新启动 → 老数据全在,新字段 isPinned 默认 false。
7. **CloudKit 同步**:同一 Apple ID 登录两台模拟器 / 真机,A 设备改一条 Note,B 设备 30s 内拉到(首次启动慢些,触发是 push 通知 + container.poll)。
8. **离线**:断网编辑数据,联网后自动同步上去,不重复不丢失。

### 4.3 与 Realm / Room 心智差异

从 Realm 来的容易踩:

- SwiftData 没有 LinkingObjects 的反向自动遍历,要 `@Relationship(inverse:)` 显式声明。
- SwiftData 的 `@Model` 是 class(引用),但**离开 ModelContext 后访问字段会 fault → crash**。Realm 是同样心智但更宽松。

从 Room 来的容易踩:

- SwiftData 没有显式 DAO,Repository 模式要自己抽。
- 后台线程操作必须走 `@ModelActor`,**不能像 Room 那样随便切线程**,Swift 6 严格并发会编译失败。

---

## 五、踩坑

### 5.1 旧教程的 Core Data 心智

| 旧教程会出现 | 不要写 |
| --- | --- |
| `NSPersistentContainer(name:)` | 用 `ModelContainer(for:)` |
| `NSFetchRequest(entityName: "Note")` | 用 `FetchDescriptor<Note>` |
| `viewContext.perform { ... }` | 主 context 直接用,后台 context 用 `@ModelActor` |
| `.xcdatamodeld` 拖拽 schema | `@Model` 宏定义,Schema 自动生成 |
| `NSManagedObjectContext.save()` | `try modelContext.save()`,但通常 autosave 帮你做 |
| `mergePolicy` / `parent context` 心智 | SwiftData 自己处理,不要去碰底层 |

### 5.2 Swift 6 严格并发下的 ModelContext 跨 actor

```swift
// ❌ 编译错:把主 context 塞给后台 task
@MainActor
func loadFromMain() {
    let ctx = self.modelContext  // 主 context
    Task.detached {
        try ctx.fetch(...)  // 跨 actor 拿主 context → 报错
    }
}

// ✅ 用 ModelActor,actor 内部有自己的 context
@ModelActor
actor Background {
    func loadAll() throws -> [PersistentIdentifier] {
        let notes = try modelContext.fetch(FetchDescriptor<Note>())
        // 跨 actor 返回 id,不要返回 Note 实例
        return notes.map(\.persistentModelID)
    }
}
```

**跨 actor 传 PersistentIdentifier,不传 @Model 实例**,这是 Swift 6 + SwiftData 最重要的纪律。

### 5.3 @Query 不能用动态 filter

```swift
// ❌ 这种写法看起来很合理,但 #Predicate 是宏,捕获的变量必须是字面量或可被宏看到的常量
struct SearchView: View {
    let keyword: String
    @Query(filter: #Predicate<Note> { $0.title.contains(keyword) }) var notes: [Note]
}
```

`#Predicate` 是编译期宏,**不能闭包捕获 SwiftUI 视图的属性**。要做动态搜索,用 `@Query` 的 init 重载:

```swift
struct SearchView: View {
    @Query private var notes: [Note]
    init(keyword: String) {
        let predicate = #Predicate<Note> { note in
            note.title.localizedStandardContains(keyword)
        }
        _notes = Query(filter: predicate, sort: \.updatedAt, order: .reverse)
    }
}
```

每次外部 keyword 变化,SwiftUI 会重新调用 init,@Query 重建,**性能可接受但要小心循环**。更复杂的搜索建议:用 `searchable` + 手动 `FetchDescriptor` + `@State` 结果数组,Query 静态、过滤动态。

### 5.4 inverse 漏写导致内存与 CloudKit 失同步

```swift
// ❌ 没写 inverse,SwiftData 不知道 Attachment.note 和 Note.attachments 是同一关系
@Model class Note {
    @Relationship(deleteRule: .cascade) var attachments: [Attachment] = []
}
@Model class Attachment {
    var note: Note?  // 漏掉关系标注
}
```

少写 inverse,SwiftData 会把它们当**两个独立关系**,删除 Note 时 Attachment 不级联,CloudKit 上还会同步出怪异的 dangling 引用。**双向关系永远在一端写 inverse,另一端不必重复**。

### 5.5 不要把图片 / 音频字节存进 @Model

```swift
// ❌ 大数据进 SQLite,几百 MB 数据库 + iCloud 同步会卡死
@Model class Attachment {
    var data: Data  // 50MB 视频塞这里
}

// ✅ 文件写 Documents,数据库存路径
@Model class Attachment {
    var localFilename: String  // "audio-2026-05-12-uuid.m4a"
}
```

CloudKit 二进制有 1MB 单行硬限,SwiftData 会自动把大字段拆出去成 `CKAsset`,但仍然不是最优解。**自己管文件 + 数据库存路径**,这是 mobile 持久化的通用纪律。

### 5.6 CloudKit 模型的硬限制

- **所有 stored property 必须有默认值或 optional**(Schema 推送到 CloudKit 时,iCloud 不支持 NOT NULL)。
- **`@Attribute(.unique)` 与 CloudKit 互斥**——开了 CloudKit 就不能用唯一约束,要靠应用层去重(查询时 dedupe by `name`)。
- **不能直接看到 CloudKit 同步进度**——SwiftData 把同步藏得很深,要 debug 走 Console 看 `com.apple.coredata.cloudkit` 子系统的 OSLog。

### 5.7 Preview 用 in-memory container

```swift
#Preview {
    NoteListView()
        .modelContainer(
            ModelStack.makeContainer(inMemory: true, cloudKit: false)
        )
}
```

Preview 不要走真实磁盘 + CloudKit,容器初始化要拉 schema、网络通讯,失败率高。**in-memory + 关 CloudKit + 注入几条 sample data**,Preview 才能秒开。

### 5.8 什么时候仍然需要 Core Data

SwiftData 99% 场景够用。回到 Core Data 的少数场景:

- 需要 `NSFetchedResultsController` 配 UICollectionView(SwiftUI 不需要,但你混 UIKit 时可能要)。
- 需要 child context + merge,做长事务编辑。
- 需要 `NSPersistentHistoryTracking` 自己实现增量同步(不走 CloudKit 时)。
- 既有大量 Core Data 资产,渐进迁移而非一次性重写。

SwiftData 内部仍是 Core Data,你可以**从 `ModelContext` 拿 `NSManagedObjectContext`** 做 hybrid:

```swift
// iOS 18+ API,可拿到底层 Core Data 句柄
let nsContext: NSManagedObjectContext = modelContext.coreDataContext
```

不到万不得已不要走这条路,**心智立刻退化到 Core Data 老世界**,严格并发也罩不住了。

### 5.9 测试 SwiftData 的标准姿势

测试要点是**绝对不让单元测试触碰真实磁盘和 CloudKit**:

```swift
// File: Tests/NoteRepositoryTests.swift

import Testing
import SwiftData
@testable import NotesIsland

@MainActor
struct NoteRepositoryTests {
    @Test func 可以创建并查询() throws {
        let container = ModelStack.makeContainer(inMemory: true, cloudKit: false)
        let context = container.mainContext
        let repo = NoteRepository(context: context)

        let n = Note(title: "测试")
        context.insert(n)
        try context.save()

        let all = try repo.notesContaining("测")
        #expect(all.count == 1)
        #expect(all.first?.title == "测试")
    }
}
```

每个测试方法都构造一个**全新的 in-memory container**,执行完销毁。`Testing` 框架的 `@Test` 配合 `@MainActor` 让 SwiftData 测试和 UI 行为一致;不要在测试里用 `Task.detached` 跨 actor 取数据,Swift 6 会编译失败。

### 5.10 性能调优要点

实际数据规模到几万行时常见性能问题:

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 列表滚动卡顿 | `@Query` 一次取全量 | 设 `FetchDescriptor.fetchLimit`,或用 `.lazy` |
| 批量插入慢 | autosave 每次 tick 落盘 | 临时关 autosave,批量结束后一次 save |
| 启动慢 | Schema 复杂或 CloudKit 首拉 | `@MainActor` 启动只 fetch 必要 fixture,其余懒加载 |
| 关系遍历卡 | N+1 fault | `FetchDescriptor.relationshipKeyPathsForPrefetching` 预加载 |

```swift
// 批量导入关 autosave
let ctx = ModelContext(container)
ctx.autosaveEnabled = false
for dto in giantBatch { ctx.insert(Note(from: dto)) }
try ctx.save()  // 一次落盘
```

预加载示例:

```swift
var desc = FetchDescriptor<Note>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
desc.fetchLimit = 50
desc.relationshipKeyPathsForPrefetching = [\.attachments, \.tags]
let notes = try context.fetch(desc)
```

这一行把 50 条 Note 的 attachments + tags 关系一次 join 出来,避免遍历时每行都触发一次 fault round-trip。这是 SQL 思路,在 SwiftData 上仍然适用。

### 5.11 数据备份与导出

CloudKit 是同步不是备份(误删一条 Note,iCloud 上也会跟着删)。真正的备份要自己做:

```swift
@MainActor
struct NoteExporter {
    let context: ModelContext

    func exportJSON(to url: URL) throws {
        let notes = try context.fetch(FetchDescriptor<Note>())
        let dtos = notes.map { NoteDTO(from: $0) }
        let data = try JSONEncoder().encode(dtos)
        try data.write(to: url, options: [.atomic])
    }
}

struct NoteDTO: Codable {
    let id: UUID
    let title: String
    let body: String
    let updatedAt: Date
    init(from note: Note) {
        self.id = note.id; self.title = note.title
        self.body = note.body; self.updatedAt = note.updatedAt
    }
}
```

**永远把 @Model 转成 DTO 再序列化**——直接对 @Model 实例做 JSONEncoder 会卷入持久化状态、关系 fault,序列化结果很难看且不稳定。导出的 JSON 配合 `ShareLink` modifier 让用户存到 iCloud Drive / 邮件附件就行。

### 5.12 ModelContainer 与 App 生命周期

`ModelContainer` 是重对象(打开 SQLite 文件、加载 schema、初始化 CloudKit syncEngine),一个 App 只该有一个。**不要每次进入页面 new 一个**——会拿到独立的 store,数据看不到。

正确姿势:

```swift
@main
struct NotesIslandApp: App {
    @State private var container = ModelStack.makeContainer()  // App 生命周期同寿
    var body: some Scene { WindowGroup { RootView() }.modelContainer(container) }
}
```

`@State` 持有,SwiftUI 在 App 重启前不会重建。子视图通过 `@Environment(\.modelContext)` 拿到 main context,自然共享同一个 container。

---

到这一篇,NotesIsland 的本地数据有了、跨设备同步也有了。下一篇我们补上「从服务器拉数据」这一块——`URLSession` async API、`Codable` 与网络层架构。
