# 14-Room 与 DataStore 持久化

> 一句话导读:Android 给你三套持久化机制,不是因为冗余,而是因为"用户数据 / 用户偏好 / 用户机密"三类数据的访问模式、迁移代价、加密成本完全不同;用对了边界,Room、DataStore 与 EncryptedSharedPreferences 各司其职;用错了边界,任意一个都能拖垮你的应用。

后端工程师对 SQL 早有心智:用 SQLite / Postgres / MySQL 装关系数据,用 Redis / Memcached 装会话级 kv,用 KMS / Vault 装机密。Android 端的物理三件套是 Room、DataStore、EncryptedSharedPreferences,语义和后端三件套高度对齐。本系列从第 11 篇就让 `UserRepository` 暴露 `Flow<UserProfile?>`,第 13 篇又用 Hilt 把 `RoomDatabase` 提升成 `@Singleton`。这一篇要把"`Flow` 怎么来"和"`UserPreference` 应该住哪里"两件事彻底落实。

旧 Android 时代用 `SQLiteOpenHelper` 写 raw SQL,用 `SharedPreferences` 装 kv,用 `Cursor` 拉数据手工 `cursor.getString(columnIndex)`。Room 把 raw SQL 留在 `@Query("SELECT ...")` 注解里**编译期校验**,DataStore 把 `SharedPreferences` 的"主线程 I/O + commit/apply 双 API"问题修掉换成 `Flow<Preferences>`,EncryptedSharedPreferences 走 Tink 把密钥包给硬件 Keystore。三件事都用 KSP 编译期处理,运行期没有反射。

## 1. 机制定位

把持久化拆成三种数据类型,而不是三个 API:

| 数据类型 | 典型例子 | 访问模式 | 选型 |
| --- | --- | --- | --- |
| 结构化关系数据 | 笔记、待办、聊天消息、订单 | 查询、过滤、排序、Join,可能很大 | **Room** |
| 用户偏好键值 | 主题、字体大小、最近搜索词 | 整体读、小量写,< 几十 KB | **DataStore** |
| 业务结构化偏好 | 复杂的 onboarding 状态、登录态、feature flags | 整体读、小量写,有 schema | **Proto DataStore** |
| 机密类型 | refresh token、API key、加密相关 | 整体读、小量写,需要硬件 Keystore | **EncryptedSharedPreferences**(过渡)或 [[securityLearning]] 推荐的 DataStore + Tink |

边界很重要:**Room 不应该装 100 字节的"用户是否第一次启动"**,**DataStore 不应该装 100 万条笔记**。前者用 Room 是巨锤砸钉子,后者用 DataStore 会让整个 Preferences map 在每次 emit 时序列化整份。新手第一年常见的失败:用 SQLite 装"上次启动时间",或者用 SharedPreferences 装"最近 1000 条笔记"。两条路都过 1 年就成屎山。

Room 解决的问题:

- 用 Kotlin 注解(`@Entity` / `@Dao` / `@Query`)在编译期把 SQL 错误抓出来,而不是运行期崩溃。
- 自动把查询结果包装成 `Flow<T>`,DB 变化自动 emit,搭配 Compose `collectAsStateWithLifecycle` 实现"DB 变,UI 变"。
- 提供 `Migration` 机制,版本号涨一次,旧用户数据库自动按你写的 SQL 升级,不需要清库。
- 与协程一等公民,所有 `suspend fun` 默认运行在 `Dispatchers.IO`,不会卡主线程。

DataStore 解决的问题:

- 取代 `SharedPreferences`。后者 `apply()` 异步但需要主线程读、`commit()` 同步会卡主线程、`onSharedPreferenceChangeListener` 不感知生命周期。
- 用 `Flow<Preferences>` 暴露读、用 `edit { ... }` 暴露写,所有操作都在协程内,主线程零阻塞。
- Proto DataStore 给你"键值有 schema"的能力——结构化偏好用 `.proto` 文件定义,反序列化即类型安全。

EncryptedSharedPreferences 解决的问题:

- 旧 `SharedPreferences` 把所有数据明文落盘,任何有 root 的设备都能读。Encrypted 版本走 AES-256 + 硬件 Keystore 派生密钥,做到"未越狱设备读不出"。
- 仍然是 `SharedPreferences` 兼容 API,迁移成本最低——但本身在 Jetpack 里已经被标记为不再推荐(`androidx.security:security-crypto` 自 1.1.0-alpha 起进入维护),长期路径是"自己用 Tink + DataStore 封装"。

## 2. Android 心智

### Room 的三件套

Room 把数据库抽象成三个 Kotlin 注解:

- `@Entity` 描述一张表,字段对应列。
- `@Dao` 描述对这张表的查询和写入,SQL 写在 `@Query("SELECT ...")` 注解里,KSP 编译期解析这串 SQL、检查列名、检查参数类型——这是 Room 区别于"Kotlin SQL ORM"的核心。
- `@Database` 描述整个数据库:版本号、Entity 列表、迁移列表。Hilt 把它包成 `@Singleton`,详见 §3。

```text
@Database(version=3)
   ├── @Entity NoteEntity         一张表
   ├── @Entity TagEntity          另一张表
   ├── @Dao NoteDao               一组查询
   ├── @Dao TagDao                另一组查询
   └── Migration(2→3)             升级脚本
```

`@Query("SELECT * FROM notes WHERE id = :id")` 不是字符串模板,KSP 在编译期会:

1. 解析 SQL 语法。
2. 校验 `notes` 表存在。
3. 校验 `id` 列存在。
4. 校验返回类型和 `NoteEntity` 字段对得上。
5. 在 `@Dao` 接口的实现类里生成代码。

任何一步失败,`./gradlew assembleDebug` 红线。在生产里这意味着"删了一列忘改 SQL"的事故不可能漏到 QA。

### `Flow<List<T>>` 的语义

Room 2.6+ 的查询返回类型可以是:

- `suspend fun getById(id: Long): Note?` —— 一次性查询,挂起。
- `fun observeAll(): Flow<List<Note>>` —— 持续观察,每次 DB 变化重新 emit。
- `fun pagingSource(): PagingSource<Int, Note>` —— Paging 3 集成。

`Flow<List<T>>` 这条路是 Room 与协程最有价值的整合。底层走 SQLite 的 `InvalidationTracker`:任何对 `notes` 表的写入(insert / update / delete)都会触发该表上所有活跃 Flow 重新执行查询并 emit 新 list。**Repository 不需要手动通知 ViewModel,UI 不需要手动 refresh**。Compose 里 `collectAsStateWithLifecycle()` 自动跟生命周期挂钩。

但**这条路不是免费的**。每次 emit 都是一次完整的查询;表大、查询复杂时,频繁写入会让 Flow 一直 emit。两条优化路径:

- 写入用 `@Transaction` 批量做,InvalidationTracker 会合并通知。
- 查询走 `distinctUntilChanged()` 在订阅侧过滤无差异 emit(但要注意 `data class` 的 `equals` 是否真的能区分)。

### Room KSP 化

Room 2.6+ 全面切 KSP,2.7+ KAPT 已经标记 deprecated。新项目零 KAPT,只用:

```kotlin
ksp(libs.androidx.room.compiler)
```

KSP 与 KAPT 在 Room 上的差异:

- KSP 直接读 Kotlin AST,nullability 处理更准。**KAPT 时代 Room 经常把可空字段当成不可空**,KSP 之后没了这个坑。
- KSP 增量更友好,改一个 Entity 不再触发全工程重编。
- Room Gradle Plugin(`androidx.room` plugin id)在 2.6 起接管 schema 导出路径,不再用旧的 `arg("room.schemaLocation", ...)`。

`build.gradle.kts` 关键片段(完整版在 §3):

```kotlin
plugins { id("androidx.room") }

room {
    schemaDirectory("$projectDir/schemas")
}
```

schemas 目录里每个版本号一份 JSON,描述这一版本下的表结构。Migration 测试就基于这份 JSON 做("从 v2 schema 升到 v3 schema,实际 SQL 是不是产出了同样的结构")。

### DataStore 的两个变体

`androidx.datastore` 提供两套 API:

- **Preferences DataStore**:类似 `SharedPreferences` 的 key-value,但 key 用 `stringPreferencesKey("user_name")` 显式声明类型。运行期没有 schema,反序列化失败也会静默走默认。
- **Proto DataStore**:用 `.proto` 文件描述结构,KSP / protoc 生成 Kotlin data class,DataStore 持有类型安全的 `Flow<UserPrefs>`。

实务里 90% 的场景 Preferences DataStore 足够;只有当 preferences 内部字段超过 10 个、字段之间有关系、需要版本迁移时,才升到 Proto。Proto 的迁移走 Protobuf 自身的字段序列号约定——新增字段不会破坏旧文件,删除字段要走 `reserved`。

### 与 SharedPreferences 的边界

`SharedPreferences` 这件事现在的状态:

- **不应在新代码里使用**,即使是简单 boolean。Android Studio 已经把 `SharedPreferences` 在新 lint 规则下标黄。
- 旧项目里有,迁移成本不高:写一个 `MigrationFromSharedPreferences` 的迁移函数,首次启动 DataStore 时读 SP 数据写入,删除 SP 文件。`androidx.datastore:datastore-preferences` 提供 `SharedPreferencesMigration` 工具类。
- **`PreferenceManager.getDefaultSharedPreferences(context)` 在 androidx 里已废弃**,要用 `androidx.preference:preference` 取代——但配 Compose 没意义,Compose 的设置界面自己写 UI 配 DataStore。

### EncryptedSharedPreferences 的现状

`androidx.security:security-crypto` 走 Tink + AndroidKeyStore,看起来理想,但库本身长期停在 1.1.0-alpha,首次启动 MasterKey 派生要 5-50ms,从普通 SP 迁过去回滚困难。[[securityLearning]] 给出的现代路径是 DataStore + 自定义加密 Serializer,EncryptedSharedPreferences 只在维护既有项目时保留。**新代码不写 EncryptedSharedPreferences**,机密如 refresh token 用 DataStore + Tink Aead 自封,第 15 篇会展开 token 的具体接法。

## 3. 工程实现

NotedX 已经有 `UserProfile` 在 Room,这次扩展到 `Note`,同时把"用户偏好"用 DataStore 接上。

### 步骤 1:Entity 与 DAO

文件位置 `app/src/main/java/com/example/notedx/data/local/NoteEntity.kt`:

```kotlin
package com.example.notedx.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "notes",
    indices = [Index(value = ["updated_at"])]
)
data class NoteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "body") val body: String,
    @ColumnInfo(name = "tag") val tag: String?,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    @ColumnInfo(name = "archived") val archived: Boolean = false,
)
```

`@Index` 不是装饰品。`updated_at` 上要按时间倒序排,没索引时 list 一长就掉帧。新建一个 Entity 时**先想清楚常用查询路径,再决定加哪些索引**。

文件位置 `app/src/main/java/com/example/notedx/data/local/NoteDao.kt`:

```kotlin
package com.example.notedx.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDao {

    @Query("SELECT * FROM notes WHERE archived = 0 ORDER BY updated_at DESC")
    fun observeActive(): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id LIMIT 1")
    suspend fun findById(id: String): NoteEntity?

    @Query("SELECT * FROM notes WHERE title LIKE :pattern OR body LIKE :pattern ORDER BY updated_at DESC")
    fun search(pattern: String): Flow<List<NoteEntity>>

    @Upsert
    suspend fun upsert(note: NoteEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(notes: List<NoteEntity>)

    @Query("UPDATE notes SET archived = 1 WHERE id = :id")
    suspend fun archive(id: String)

    @Query("DELETE FROM notes WHERE archived = 1 AND updated_at < :threshold")
    suspend fun pruneArchivedBefore(threshold: Long): Int

    @Transaction
    suspend fun replaceAll(notes: List<NoteEntity>) {
        nukeAll()
        upsertAll(notes)
    }

    @Query("DELETE FROM notes")
    suspend fun nukeAll()
}
```

`@Upsert`(Room 2.5+)是"有则更新,无则插入"的现代写法,等价于以前手写 `@Insert(REPLACE)` + `@Update`。`@Transaction` 注解的 `suspend fun` 在协程内开启事务,内部调用走同一个 DB 连接;**任意一个 `suspend` 调用抛异常,事务回滚**,不需要手动 try/catch。

### 步骤 2:Database 与 Migration

文件位置 `app/src/main/java/com/example/notedx/data/local/NotedDatabase.kt`:

```kotlin
package com.example.notedx.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [NoteEntity::class, UserEntity::class],
    version = 3,
    exportSchema = true,
)
abstract class NotedDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao
    abstract fun userDao(): UserDao
}

object NotedMigrations {

    val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // v2:为 notes 表加 tag 列
            db.execSQL("ALTER TABLE notes ADD COLUMN tag TEXT")
        }
    }

    val MIGRATION_2_3 = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // v3:加 archived 标志位 + 索引;旧行默认 0
            db.execSQL("ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_notes_updated_at ON notes(updated_at)")
        }
    }

    val ALL: Array<Migration> = arrayOf(MIGRATION_1_2, MIGRATION_2_3)
}
```

`exportSchema = true` 让 Room 在每次 build 时把当前版本的 schema 输出成 JSON 到 `schemas/com.example.notedx.data.local.NotedDatabase/3.json`。这份 JSON 必须签入 git——它既是 Migration 测试的"事实真相",又是 reviewer 看 PR 时判断 DB 结构变化的窗口。

Migration 的关键不是写 `ALTER TABLE`,而是**每一步都假设旧用户从上一版升上来**。v1→v2 加列,v2→v3 加列加索引,**绝不**写 v1→v3 直接合并(因为某个用户的旧 APK 跑了一年,DB 还停在 v1,需要走完整 v1→v2→v3 链)。Room 自己会按 `arrayOf(MIGRATION_1_2, MIGRATION_2_3)` 顺序拉链。

### 步骤 3:Hilt 模块提供 Database

文件位置 `app/src/main/java/com/example/notedx/di/DatabaseModule.kt`:

```kotlin
package com.example.notedx.di

import android.content.Context
import androidx.room.Room
import com.example.notedx.data.local.NotedDatabase
import com.example.notedx.data.local.NotedMigrations
import com.example.notedx.data.local.NoteDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): NotedDatabase =
        Room.databaseBuilder(ctx, NotedDatabase::class.java, "notedx.db")
            .addMigrations(*NotedMigrations.ALL)
            .fallbackToDestructiveMigrationOnDowngrade(dropAllTables = true)
            // 注意不要 fallbackToDestructiveMigration()——会在 missing migration 时清库
            .build()

    @Provides
    fun provideNoteDao(db: NotedDatabase): NoteDao = db.noteDao()
}
```

`fallbackToDestructiveMigrationOnDowngrade` 只在版本号回退时清库;正向 missing migration 时**不要 fallback**,而要 build 时崩出来——线上用户的数据丢了你救不回。开发期临时用 `fallbackToDestructiveMigration()` 偷懒可以,生产代码必须显式 Migration。

`@ApplicationContext` 是 Hilt 预绑的 Application 级 Context,直接注入用,不需要 `Context` 那个类型(注 Context 会拿到 ActivityContext,生命周期不对)。

### 步骤 4:Migration 测试

文件位置 `app/src/androidTest/java/com/example/notedx/data/local/NotedMigrationsTest.kt`:

```kotlin
package com.example.notedx.data.local

import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NotedMigrationsTest {

    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        NotedDatabase::class.java,
        emptyList(),
        FrameworkSQLiteOpenHelperFactory(),
    )

    @Test
    fun migrate1To3_preservesNoteRows() {
        // v1 schema 写一条 note
        helper.createDatabase("test-db", 1).apply {
            execSQL(
                "INSERT INTO notes (id, title, body, updated_at) VALUES (?, ?, ?, ?)",
                arrayOf("n1", "hello", "world", 1_700_000_000L),
            )
            close()
        }

        // 跑完整迁移链
        helper.runMigrationsAndValidate(
            "test-db",
            3,
            true,
            *NotedMigrations.ALL,
        ).use { db ->
            db.query("SELECT id, title, tag, archived FROM notes WHERE id = 'n1'").use { c ->
                check(c.moveToFirst())
                check(c.getString(0) == "n1")
                check(c.getString(1) == "hello")
                check(c.isNull(2))            // v2 加的 tag 列为 null
                check(c.getInt(3) == 0)       // v3 加的 archived 默认 0
            }
        }
    }
}
```

这条测试在 CI 必跑。**任何一次改了 Schema 又忘记加 Migration 的 PR,这条测试会红**——Room 跑迁移后比对实际 schema 和 v3.json 不一致就直接抛错。`emptyList()` 是 `AutoMigrationSpec` 列表,本例没用 AutoMigration(下面 §4 会讨论)。

### 步骤 5:DataStore 接入

文件位置 `app/src/main/java/com/example/notedx/data/prefs/UserPreferences.kt`:

```kotlin
package com.example.notedx.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

val Context.userPrefsStore: DataStore<Preferences> by preferencesDataStore(name = "user_prefs")

@Singleton
class UserPreferences @Inject constructor(
    private val store: DataStore<Preferences>,
) {
    private val KEY_DARK_THEME = booleanPreferencesKey("dark_theme")
    private val KEY_FONT_SIZE = intPreferencesKey("font_size_sp")

    val darkTheme: Flow<Boolean> = store.data.map { it[KEY_DARK_THEME] ?: false }
    val fontSize: Flow<Int> = store.data.map { it[KEY_FONT_SIZE] ?: 14 }

    suspend fun setDarkTheme(enabled: Boolean) {
        store.edit { it[KEY_DARK_THEME] = enabled }
    }

    suspend fun setFontSize(sp: Int) {
        store.edit { it[KEY_FONT_SIZE] = sp.coerceIn(10, 24) }
    }
}
```

`preferencesDataStore` 是 `Context` 上的 delegate,内部用 `Singleton` 模式确保同名 store 全应用唯一。Hilt 这边把 `DataStore<Preferences>` 通过 module 提供出来:

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object DataStoreModule {

    @Provides
    @Singleton
    fun provideUserPrefsStore(
        @ApplicationContext ctx: Context,
    ): DataStore<Preferences> = ctx.userPrefsStore
}
```

业务 ViewModel 里:

```kotlin
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefs: UserPreferences,
) : ViewModel() {

    val uiState: StateFlow<SettingsUi> = combine(prefs.darkTheme, prefs.fontSize) { dark, size ->
        SettingsUi(darkTheme = dark, fontSizeSp = size)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsUi())

    fun toggleDarkTheme() {
        viewModelScope.launch { prefs.setDarkTheme(!uiState.value.darkTheme) }
    }
}
```

Compose 那边 `collectAsStateWithLifecycle()` 接上 `uiState`,主题与字号会**实时跟随 DataStore 写入**变化——这正是 `Flow` 一等公民的价值。

### 步骤 6:Proto DataStore 概览

字段超过 10 个、有嵌套结构、需要版本迁移时用 Proto。`app/src/main/proto/onboarding.proto` 定义 `message OnboardingState { bool welcome_seen = 1; bool tutorial_done = 2; repeated string completed_steps = 3; }`,配一个实现 `Serializer<OnboardingState>` 的 object(`parseFrom` / `writeTo` 直接走 protobuf),然后 `val Context.onboardingStore by dataStore(fileName = "onboarding.pb", serializer = OnboardingSerializer)`。

加新字段不破坏旧文件——Protobuf wire format 对未知字段宽容。删字段时**永远只标 `reserved`,不要真删**,否则旧用户的文件里那条字段被错认为"未知字段",后续如果再 add 一个新字段也用 `= 2` 会读到旧值。

## 4. 调参和验收

### Migration 与 AutoMigration

Room 2.4+ 引入 `@AutoMigration(from = X, to = Y)`,简单加列 / 重命名能自动生成。复杂变化(拆表、合表、数据回填)仍需手写 `Migration`。决策矩阵:

| 变化 | 选 | 理由 |
| --- | --- | --- |
| 加列(可空 / 有 default) | AutoMigration | 一行注解搞定 |
| 加 Index | AutoMigration | 同上 |
| 重命名列 | AutoMigration + `@RenameColumn` 注解 | 显式标注 |
| 重命名表 | AutoMigration + `@RenameTable.Entries` 容器 | 同上 |
| 拆表 / 合表 / 数据转换 | 手写 Migration | AutoMigration 不知道你想怎么拆 |
| 加新表 | AutoMigration 或不写 | 新表无旧数据时 Room 会自动建 |

经验:**简单变化用 AutoMigration,复杂变化用手写 Migration,两者可以混用**。无论哪种都必须有 `schemas/` JSON 签入 git + Migration 测试覆盖。

### Flow 触发频率

`InvalidationTracker` 默认 1 秒内合并多次写入触发的 Flow emit。如果你在循环里 `dao.upsert(it)` 一千次,Flow 会被触发若干次(不是一次也不是一千次)。两种优化:

```kotlin
// 推荐:批量写
@Transaction
suspend fun upsertAll(notes: List<NoteEntity>) {
    notes.forEach { upsert(it) }  // 全部在一个事务,Flow 只触发一次
}

// 或者 Room 一等公民
@Upsert
suspend fun upsertAll(notes: List<NoteEntity>)
```

写入循环时**永远裹一层 `@Transaction`**,既性能,又给 Flow 端清晰的"批次"语义。

### DataStore 写入频率

`DataStore` 的写入是 actor 模式串行化的,N 次并发 `edit { }` 会被排队执行,但每次都触发一次 `Flow<Preferences>` emit。对"用户连续拖动 slider 调字号"这种场景,**不要每次 `onValueChange` 都 `setFontSize(...)`**,先在 ViewModel 里 debounce:

```kotlin
private val fontSizeWrites = MutableSharedFlow<Int>()

init {
    viewModelScope.launch {
        fontSizeWrites
            .debounce(300.milliseconds)
            .collect { prefs.setFontSize(it) }
    }
}

fun onFontSizeChange(sp: Int) { fontSizeWrites.tryEmit(sp) }
```

300ms 是肉眼可接受的阈值。这条优化在 onboarding 进度、滑块设置、搜索框输入这些场景都通用。

### Schema 版本与 App 版本

App `versionCode` 和 DB `version` 完全独立。DB version 只在表结构变化时涨,App version 每次发版都涨。同一个 App version 跨多个 DB version 很常见,反过来一个 DB version 跨多个 App version 也很常见。**绝不**用 `BuildConfig.VERSION_CODE` 做 DB version,这是引擎级反模式。

### EncryptedSharedPreferences 现状审视

如果遗留代码里有 EncryptedSharedPreferences,审视这几个问题:

- 密钥是否落在 AndroidKeyStore?(`MasterKey.Builder().setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()`)
- 是否在主线程读?(首次解密耗时,要 IO Dispatcher)
- 是否做了"key rotation"?(MasterKey 长期不轮换,泄露后无救济)

长期路径是迁移到 DataStore + 自定义 `Serializer`,内部用 Tink 的 `Aead` 加密。第 15 篇会给 refresh token 一份完整实现。

### 验收

- 用 Android Studio 的 **App Inspection > Database Inspector** 实时看 DB 内容,跑业务、看表行的变化,确认 Migration 之后字段都齐。
- 安装 v1 APK → 写若干 note → 直接覆盖安装 v3 APK,确认所有 note 仍在、`tag` 为 null、`archived` 为 0、查询返回正常。
- `./gradlew connectedDebugAndroidTest --tests "*MigrationTest*"` 全绿。
- `cat app/schemas/.../3.json` 内容包含所有 v3 字段与索引。
- 用 `adb shell run-as <pkg> ls -la databases/` 看 `notedx.db` 与 `notedx.db-wal`(开启 WAL 时正常)。
- DataStore 文件:`adb shell run-as <pkg> ls -la files/datastore/`,看到 `user_prefs.preferences_pb`。

## 5. 踩坑

### 坑 1:Migration 漏写

```kotlin
@Database(entities = [NoteEntity::class], version = 4)  // 涨到 4
abstract class NotedDatabase : RoomDatabase()

// 但 NotedMigrations.ALL 里只到 MIGRATION_2_3
```

线上崩溃:`Migration didn't properly handle: notes(...)`。Room 起来时拉迁移链,从用户当前 DB version 一路升到 schema 里写的最新 version,中间任何一档没有就崩。

**记忆口诀:动 @Database 的 version 之前,先确认 NotedMigrations.ALL 已经更新**。CI 加一条断言:`@Database` 的 version 等于 `MIGRATION_X_Y.endVersion` 的最大值。

### 坑 2:在 Migration 里依赖 Entity 字段

```kotlin
val MIGRATION_2_3 = Migration(2, 3) { db ->
    val notes = db.query("SELECT * FROM notes")
    notes.forEach {
        // 反例:用 NoteEntity 反序列化
        val entity = NoteEntity(/*...*/)
        // ...
    }
}
```

Migration 跑在"旧 schema 还活着"的时候,而代码里的 `NoteEntity` 已经是新 schema 的字段定义。两边对不上一定崩。**Migration 函数只能写 raw SQL**,数据转换在 SQL 里做,不要 import Entity 类。

### 坑 3:`fallbackToDestructiveMigration()` 上生产

```kotlin
Room.databaseBuilder(...)
    .fallbackToDestructiveMigration()    // 反例:missing migration 时清库
    .build()
```

这行字面意思是"找不到 Migration 时把数据库清空重建"。开发期偷懒可以,**永远**不要带进生产 build。线上用户的 1 万条笔记瞬间清零,你的 1 星评价会刷屏。

### 坑 4:`Flow<List<T>>` 在 ViewModel init 里 collect

```kotlin
init {
    viewModelScope.launch {
        dao.observeActive().collect { notes -> _state.value = notes }   // 反例
    }
}
```

写法没错,但少了 lifecycle 感知。屏幕停在后台,Flow 还在收数据、还在转换、还在更新 `_state`。`stateIn(scope, WhileSubscribed(5_000), initial)` 是正解:**没人订阅 5 秒后停止上游**。Compose `collectAsStateWithLifecycle()` 在 STOPPED 时也会自动取消订阅。

### 坑 5:`@PrimaryKey(autoGenerate = true)` 跨设备同步

服务器分配的 ID 用 String / UUID,Room 自增 ID 用本地 long。如果你写 `@PrimaryKey(autoGenerate = true) val id: Long`,然后想做"上传本地笔记到服务器并同步回来",服务器分给你的 ID 和本地不一致,要么再加 `serverId` 列,要么干脆从一开始用 String UUID。**双 ID 方案在中型项目里几乎一定出现**,提前留位置。

### 坑 6:`suspend fun` Dao 在主线程调

Room 的 `suspend fun` 默认在 Coroutine 的 `Dispatchers.IO` 里跑——前提是你**从一个真正异步的 scope 里 launch**。如果你写了:

```kotlin
runBlocking { dao.findById("x") }   // 反例:主线程 block
```

`runBlocking` 占住当前线程,Room 即使切去 IO 也没用,主线程被 block。生产代码里**永远不要 `runBlocking`**,要测试场景下临时用,加 `// TEST ONLY` 注释。

### 坑 7:DataStore 同名实例 / 反复 build Database

DataStore 强制每个 name 全应用唯一,`val Context.userPrefs by preferencesDataStore(name = "user_prefs")` 在两个文件都写一遍,运行期抛 `IllegalStateException`。Room 也一样——`Room.databaseBuilder().build()` 在业务代码里**永远不要二次调用**,同一个 db name 下两个 instance 互相不感知 `InvalidationTracker`,会出现"DB 改了但 Flow 不 emit"的诡异 bug。两条解都是"集中到一个文件 / 一个 Hilt 模块 + `@Singleton`",业务侧只 import 一份。

### 坑 8:DataStore key 用错类型

```kotlin
val KEY_FONT_SIZE = stringPreferencesKey("font_size_sp")  // 反例:类型选错
// 后面误用 intPreferencesKey 读
val intKey = intPreferencesKey("font_size_sp")
val size = store.data.first()[intKey]   // null,数据没丢但读不出
```

Preferences DataStore 的 key 类型是声明的,不是反射拿到的。同一个字符串 key 在不同类型下视图独立。**给每个 key 配一个 `object PrefsKeys` 单例,只声明一处**,业务侧引用过来。

### 坑 9:Proto DataStore 删字段

Proto 的 wire format 用字段号(`= 2`)定位字节流位置。直接删掉一个字段的声明,旧客户端写过的数据还在文件里,新客户端解析时它变成"未知字段";后续如果再 add 一个新字段也用 `= 2`,会读到旧值。**永远写 `reserved 2;` 加 `reserved "field_name";`**,字段号与名字都不可复用。

### 坑 10:EncryptedSharedPreferences 在 `Application.onCreate` 同步初始化

MasterKey 派生 + Tink 解密在低端机 50ms 级别,几个这种 lib 串起来启动期从 200ms 拖到 600ms,直接被 Play Vitals 标"启动慢"。生产路径:**机密类用 DataStore + 加密 Serializer 异步初始化**,或者第 13 篇的 Hilt `@Singleton` lazy 模式,首次真正读 token 时才付出代价。

### 坑 11:`@Entity` 嵌入对象 vs 关联

```kotlin
@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey val id: String,
    @Embedded val tag: Tag,        // 反规范化:tag 字段被展开成 tag.* 列
)
```

`@Embedded` 是"把嵌套字段拍平进同一张表",不是"建外键"。新人常误以为这是 SQL 关系。需要真正的关联用 `@Relation` + `@Transaction` 查询(详见 Room 文档 "Defining relationships between objects")。

## 手动验证

- [ ] App 首装 → 写 3 条 note → 杀进程重启 → 数据仍在,Compose 列表恢复。
- [ ] 旋转屏幕 / 切语言 / 切深色模式,note 列表不重新加载(`Flow` + `stateIn(SharingStarted.WhileSubscribed(5_000))` 验证)。
- [ ] 装 v1 APK → 写笔记 → 直接覆盖装 v3 APK → 数据完整,新字段(`tag` / `archived`)有合理默认值。
- [ ] `./gradlew connectedDebugAndroidTest --tests "*MigrationTest*"` 通过。
- [ ] 故意把 `@Database` 改成 version = 4 但不加 Migration,运行起 app 应在首次访问 DAO 时崩(`IllegalStateException: Migration didn't properly handle`)。
- [ ] 在 Database Inspector 里执行 `SELECT * FROM notes`,观察 archive 操作后 archived = 1 的行被过滤出列表(说明 Flow 触发了重查询)。
- [ ] DataStore:在设置页切深色模式,UI 即时更新,杀进程重启后状态保留;`adb shell run-as <pkg> cat files/datastore/user_prefs.preferences_pb` 是二进制,含 `dark_theme` key。
- [ ] 把 DataStore key 类型从 `boolean` 改成 `int` 重读,确认应用回退到默认值而非崩(类型不匹配验证)。
