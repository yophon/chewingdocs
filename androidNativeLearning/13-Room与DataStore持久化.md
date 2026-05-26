# Room 与 DataStore 持久化

> 一句话:**关系数据用 Room(SQLite + 注解 + Flow 订阅),用户偏好用 DataStore(协程友好的键值存储)**。两者一起覆盖 99% 的本地存储需求,`SharedPreferences` 在新项目里不该出现。

---

## 一、Android 存储的几种选择

| 用途 | 选择 | 为什么 |
| --- | --- | --- |
| 结构化数据(笔记 / 用户 / 标签) | **Room** | SQLite 的注解封装,有 Flow 订阅 |
| 键值偏好(主题、上次打开页) | **DataStore (Preferences)** | 协程友好,事务化 |
| 复杂键值(自定义对象) | **DataStore (Proto)** | 同上 + 类型安全 |
| 文件 / 图片 | 应用私有目录 / `MediaStore` | 17 篇展开 |
| 网络缓存 | OkHttp 缓存 + Room 离线副本 | 14 篇展开 |

**不该用**:`SharedPreferences`(异步 API 是 commit 阻塞、apply 不确定;没有 Flow),`Realm`(三方库,文档差,默认避开)。

---

## 二、Room 的三件事:Entity / Dao / Database

```kotlin
@Entity(tableName = "note")
data class NoteEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val content: String,
    val createdAt: Long,
    val updatedAt: Long,
    val archived: Boolean = false,
)
```

**Entity** = 数据库表。每个字段一列,`@PrimaryKey` 标主键,可选 `autoGenerate` 自增。Kotlin `data class` 与 Room 天作之合——构造函数参数直接当列。

```kotlin
@Dao
interface NoteDao {
    @Query("SELECT * FROM note WHERE archived = 0 ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<NoteEntity>>          // Flow:订阅变化

    @Query("SELECT * FROM note WHERE id = :id")
    fun observeOne(id: Long): Flow<NoteEntity?>

    @Query("SELECT * FROM note WHERE id = :id")
    suspend fun getById(id: Long): NoteEntity?         // suspend:单次取

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(note: NoteEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(notes: List<NoteEntity>)

    @Query("DELETE FROM note WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("UPDATE note SET archived = 1 WHERE id = :id")
    suspend fun archive(id: Long)
}
```

**Dao** = Data Access Object,定义所有查询。**关键**:
- 返回 `Flow<T>` → Room 自动监听表变化,有变化就 emit 新结果。这是 **Room 最大红利**——UI 通过订阅 Flow,**不需要手动刷新**。
- 返回 `suspend fun` → 单次查询 / 写入,自动在 IO 线程跑。

```kotlin
@Database(
    entities = [NoteEntity::class, TagEntity::class, NoteTagCrossRef::class],
    version = 1,
    exportSchema = true,                       // 必须 true,版本控制需要
)
abstract class NotedXDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao
    abstract fun tagDao(): TagDao
}
```

**Database** = 数据库本身,集合所有 Entity 和 Dao。`exportSchema = true` 让 Room 在编译时把 schema JSON 输出到 `:app/schemas/`,迁移时用得着。

---

## 三、依赖配置

`libs.versions.toml`(02 篇已配):

```toml
room = "2.6.1"

androidx-room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
androidx-room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
androidx-room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }
```

`:app/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.ksp)
}

android {
    defaultConfig {
        // Schema 输出目录(用于迁移测试与 schema 提交到 git)
        ksp { arg("room.schemaLocation", "$projectDir/schemas") }
    }
}

dependencies {
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)         // KTX:Flow + suspend 支持
    ksp(libs.androidx.room.compiler)               // KSP,不是 KAPT
}
```

---

## 四、Hilt 集成

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): NotedXDatabase =
        Room.databaseBuilder(ctx, NotedXDatabase::class.java, "notedx.db")
            .fallbackToDestructiveMigration()       // 仅 debug 用,见后面踩坑
            .build()

    @Provides
    fun provideNoteDao(db: NotedXDatabase): NoteDao = db.noteDao()
    
    @Provides
    fun provideTagDao(db: NotedXDatabase): TagDao = db.tagDao()
}
```

`@Singleton` 保证整个应用进程只有一份 Database 实例——SQLite 的连接池由 Room 内部管。

---

## 五、Repository 层 + UI 闭环

```kotlin
interface NoteRepository {
    fun observeAll(): Flow<List<Note>>
    fun observeOne(id: Long): Flow<Note?>
    suspend fun save(note: Note): Long
    suspend fun delete(id: Long)
}

class NoteRepositoryImpl @Inject constructor(
    private val dao: NoteDao,
) : NoteRepository {
    
    override fun observeAll(): Flow<List<Note>> =
        dao.observeAll().map { entities -> entities.map { it.toDomain() } }

    override fun observeOne(id: Long): Flow<Note?> =
        dao.observeOne(id).map { it?.toDomain() }

    override suspend fun save(note: Note): Long =
        dao.upsert(note.toEntity())

    override suspend fun delete(id: Long) = dao.delete(id)
}
```

**Entity ↔ Domain 转换**(`toDomain()` / `toEntity()`):

```kotlin
data class Note(
    val id: Long,
    val title: String,
    val content: String,
    val createdAt: Long,
    val updatedAt: Long,
    val archived: Boolean,
)

fun NoteEntity.toDomain() = Note(id, title, content, createdAt, updatedAt, archived)
fun Note.toEntity() = NoteEntity(id, title, content, createdAt, updatedAt, archived)
```

**为什么要转?** Entity 是数据库表的物理表达,Domain 是业务对象。两者短期看一样,但你迟早要拆开:Entity 多一列 `sync_state`、Domain 多一个计算属性 `preview`。**第一版就分开,后期成本几乎为零;不分开,后期合并要改一堆代码**。

ViewModel:

```kotlin
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val noteRepository: NoteRepository,
) : ViewModel() {

    val uiState: StateFlow<HomeUiState> = noteRepository.observeAll()
        .map { notes -> notes.map { it.toCard() } }
        .map { cards -> HomeUiState(notes = cards.toImmutableList()) }
        .catch { e -> emit(HomeUiState(errorMessage = e.message)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HomeUiState(isLoading = true))

    fun delete(id: Long) {
        viewModelScope.launch {
            noteRepository.delete(id)
        }
    }
}
```

**整条链**:UI 订阅 ViewModel UiState → ViewModel 订阅 Repository Flow → Repository 订阅 Dao Flow → Room 在数据库变化时自动 emit → 整条链每一层都自动刷新。**你写完插入代码后什么都不用做,UI 自动更新**——这就是 Room + Flow 的红利。

---

## 六、关系:`@Embedded` 与 `@Relation`

笔记有标签,标签有笔记——多对多关系。用 Cross-Ref 表:

```kotlin
@Entity(tableName = "tag")
data class TagEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
)

@Entity(
    tableName = "note_tag",
    primaryKeys = ["noteId", "tagId"],
    foreignKeys = [
        ForeignKey(NoteEntity::class, ["id"], ["noteId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(TagEntity::class, ["id"], ["tagId"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("tagId")],
)
data class NoteTagCrossRef(
    val noteId: Long,
    val tagId: Long,
)
```

查询带标签的笔记:

```kotlin
data class NoteWithTags(
    @Embedded val note: NoteEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(NoteTagCrossRef::class, parentColumn = "noteId", entityColumn = "tagId"),
    )
    val tags: List<TagEntity>,
)

@Dao
interface NoteDao {
    @Transaction
    @Query("SELECT * FROM note WHERE archived = 0")
    fun observeAllWithTags(): Flow<List<NoteWithTags>>
}
```

`@Transaction` 必须加——`@Relation` 查询内部要两次 query(主表 + 关联表),`@Transaction` 保证一致性。

---

## 七、迁移:版本号 + Migration

```kotlin
@Database(
    entities = [...],
    version = 2,                              // 升版本
    exportSchema = true,
)
abstract class NotedXDatabase : RoomDatabase()

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE note ADD COLUMN color INTEGER NOT NULL DEFAULT 0")
    }
}

Room.databaseBuilder(ctx, NotedXDatabase::class.java, "notedx.db")
    .addMigrations(MIGRATION_1_2)
    .build()
```

**铁律**:每次改 Entity(加字段 / 改类型),版本号 +1,提供 Migration。**不要用 `fallbackToDestructiveMigration()` 上线**——它会在升级失败时直接清空数据库。debug 测试可以,生产数据丢光用户会卸载。

Schema 文件(`:app/schemas/com.notedx.NotedXDatabase/2.json`)**应当提交到 git**,Room 编译期会用它检测迁移正确性。

---

## 八、测试 Room

```kotlin
@RunWith(AndroidJUnit4::class)
class NoteDaoTest {
    private lateinit var db: NotedXDatabase
    private lateinit var dao: NoteDao

    @Before fun setup() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(ctx, NotedXDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = db.noteDao()
    }

    @After fun tearDown() { db.close() }

    @Test fun insertAndQuery() = runTest {
        val id = dao.upsert(NoteEntity(title = "t", content = "c", createdAt = 0, updatedAt = 0))
        val list = dao.observeAll().first()
        assertEquals(1, list.size)
        assertEquals("t", list[0].title)
    }
}
```

`inMemoryDatabaseBuilder` 创建内存数据库,测试结束自动销毁。22 篇展开测试。

---

## 九、DataStore Preferences:替代 SharedPreferences

```kotlin
@Singleton
class UserPreferences @Inject constructor(@ApplicationContext ctx: Context) {

    private val Context.dataStore by preferencesDataStore(name = "user_prefs")
    private val dataStore = ctx.dataStore

    val theme: Flow<Theme> = dataStore.data.map { prefs ->
        Theme.valueOf(prefs[THEME_KEY] ?: Theme.System.name)
    }

    suspend fun setTheme(theme: Theme) {
        dataStore.edit { prefs -> prefs[THEME_KEY] = theme.name }
    }

    val lastOpenedNoteId: Flow<Long?> = dataStore.data.map { it[LAST_NOTE_KEY] }

    suspend fun setLastOpenedNoteId(id: Long) {
        dataStore.edit { prefs -> prefs[LAST_NOTE_KEY] = id }
    }

    companion object {
        private val THEME_KEY = stringPreferencesKey("theme")
        private val LAST_NOTE_KEY = longPreferencesKey("last_note_id")
    }
}

enum class Theme { Light, Dark, System }
```

**几个关键认识**:

1. **DataStore 全异步**——读返回 `Flow`,写是 `suspend fun`。没有阻塞 API。
2. **事务化写入**——`edit { prefs -> ... }` 块里多个写是原子的。
3. **类型安全 key**——`stringPreferencesKey` / `intPreferencesKey` / `booleanPreferencesKey` / `longPreferencesKey` / `floatPreferencesKey` / `doublePreferencesKey` / `stringSetPreferencesKey`。
4. **只能存基础类型**——复杂对象用 Proto DataStore 或 JSON 序列化进 String key。

依赖:`androidx.datastore:datastore-preferences:1.1.1`(02 篇已配)。

---

## 十、Proto DataStore:类型安全的复杂键值

如果你要存"一组复杂设置(主题 + 字体 + 通知偏好 + ...)",Preferences DataStore 不够好——每个字段一个 key,新增字段要改多处。Proto DataStore 用 Protocol Buffers 定义 schema:

```protobuf
// app/src/main/proto/user_settings.proto
syntax = "proto3";

option java_package = "com.notedx.proto";
option java_multiple_files = true;

message UserSettings {
    Theme theme = 1;
    int32 font_size = 2;
    bool notifications_enabled = 3;
}

enum Theme {
    SYSTEM = 0;
    LIGHT = 1;
    DARK = 2;
}
```

需要 `com.google.protobuf:protobuf-javalite` 等额外依赖。**用得不多**——除非你的设置确实复杂(几十个字段、嵌套结构),Preferences DataStore 已经够。

NotedX 默认用 Preferences DataStore,Proto 按需引入。

---

## 十一、UI 订阅 DataStore

```kotlin
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefs: UserPreferences,
) : ViewModel() {

    val theme: StateFlow<Theme> = prefs.theme
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Theme.System)

    fun setTheme(theme: Theme) {
        viewModelScope.launch {
            prefs.setTheme(theme)
        }
    }
}
```

Compose 侧:

```kotlin
@Composable
fun NotedXApp(vm: AppViewModel = hiltViewModel()) {
    val theme by vm.theme.collectAsStateWithLifecycle()
    val isDark = when (theme) {
        Theme.Light -> false
        Theme.Dark -> true
        Theme.System -> isSystemInDarkTheme()
    }
    NotedXTheme(darkTheme = isDark) { ... }
}
```

**用户改主题 → DataStore 更新 → Flow emit → ViewModel state 变 → Compose 重组 → 主题切换**。整条链一处写代码,全局自动响应。

---

## 十二、踩坑

**坑 1:`fallbackToDestructiveMigration()` 上线**。debug 用没事,**生产会清空所有用户数据**。每次升 Entity 必须写 Migration,**且应当在测试里跑过一次**(MigrationTestHelper)。

**坑 2:Dao 返回 `List<T>` 而不是 `Flow<List<T>>`**。返回 List 是"一次性查询",数据库变了 UI 不会刷新。**新代码默认 Flow**,只有真的"按一次按钮查一次"才返回 suspend fun List。

**坑 3:`@Transaction` 漏标**。`@Relation` 查询不加 `@Transaction`,两次 SQL 之间数据可能变化,得到不一致结果。编译期 Room 会警告,看到警告就加上。

**坑 4:多线程下用 `runBlocking` 调 suspend Dao**。Room 的 suspend Dao 已经在 IO 线程跑,**直接在协程里 await** 就行。`runBlocking` 会阻塞调用线程,主线程跑就 ANR。

**坑 5:把 SQL 写错只有运行时发现**。`@Query` 的 SQL 字符串在 Room 编译时**会被解析与类型检查**,这是 Room 比手写 SQLite 最大的红利——但仅限语法 / 列名 / 返回类型。运行时数据问题(找不到记录、约束冲突)仍然需要测试覆盖。

**坑 6:`OnConflictStrategy.IGNORE` 用错地方**。
```kotlin
@Insert(onConflict = OnConflictStrategy.IGNORE)
suspend fun insert(note: NoteEntity): Long    // 主键冲突直接忽略,返回 -1
```
"插入但不覆盖"的场景用 IGNORE,"插入或更新"用 REPLACE。**大部分场景用 REPLACE**——upsert 是常态。

**坑 7:把大对象塞 DataStore Preferences**。Preferences DataStore 整体序列化成一份文件,每次 edit 重写整个文件。**只放小值**——主题 / 字号 / 上次打开 ID 这种。文章草稿、笔记内容不该放。

**坑 8:DataStore 写入 race condition**。
```kotlin
val current = prefs.theme.first()    // ❌ 多协程并发会读旧值
prefs.setTheme(if (current == Light) Dark else Light)
```
DataStore `edit { ... }` 自带串行化,**多步操作必须在同一个 edit 块里**:
```kotlin
dataStore.edit { p -> p[KEY] = if (p[KEY] == "L") "D" else "L" }
```

**坑 9:UI 里直接调 Dao**。Dao 是数据层 API,Compose 应当通过 Repository → ViewModel → UiState 看到数据。**Composable / Activity 里不要 `@Inject lateinit var dao: NoteDao`**——这破坏分层,测试做不起来。

---

下一篇 `14-Retrofit 与第一个端到端闭环.md`,把 Retrofit + OkHttp + kotlinx.serialization 接进来,做"远端拉笔记 → 写本地 Room → UI 自动刷新"的完整闭环。这是 NotedX 第一个 production-ready 的功能。
