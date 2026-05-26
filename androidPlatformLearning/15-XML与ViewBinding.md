# XML 布局、findViewById 与 ViewBinding

> 一句话:**XML 布局是 Android 上一代的 UI 声明方式——LayoutInflater 把 XML 解析为 View 树,`findViewById` 在树里按 ID 找 View**。`ViewBinding` 让"按 ID 找"变成类型安全的字段,`DataBinding` 进一步加表达式但成本高。

---

## 一、XML 布局是怎么变成 View 的

```xml
<!-- res/layout/activity_main.xml -->
<LinearLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    <TextView
        android:id="@+id/title"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="@string/hello"
        android:textSize="18sp" />

    <Button
        android:id="@+id/save_button"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="@string/save" />
</LinearLayout>
```

```kotlin
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // ↑ 内部:LayoutInflater 解析 XML → 创建 View 树 → 加到 Activity 的 content view
    }
}
```

**`setContentView(R.layout.X)` 内部**:

```java
public void setContentView(int layoutResID) {
    LayoutInflater.from(this).inflate(layoutResID, mDecor.findViewById(android.R.id.content), true);
}
```

`LayoutInflater.inflate`:

1. 解析 XML(已经被 AAPT 编译为二进制 XML,在 APK 的 res 里)
2. 按节点逐个创建 View 对象——`<TextView>` → `new TextView(context, attrs)`
3. 把构造时的 attrs 应用到 View
4. 递归处理子节点,通过 `ViewGroup.addView` 挂上

**性能成本**:大型 XML inflate 一次几十毫秒,启动时是首屏可见时间的主要构成之一。

---

## 二、`findViewById`:按 ID 找 View

```kotlin
val title = findViewById<TextView>(R.id.title)
val button = findViewById<Button>(R.id.save_button)
```

内部实现:**遍历整棵 View 树,按 ID 比对**。

```java
// View.findViewById 简化版
View findViewById(int id) {
    if (id == this.id) return this;
    if (this instanceof ViewGroup) {
        for (View child : children) {
            View found = child.findViewById(id);
            if (found != null) return found;
        }
    }
    return null;
}
```

**几个性能问题**:

1. **遍历整树**——大 layout 中重复 findViewById 慢
2. **类型不安全**——`findViewById<TextView>(R.id.button)` 编译能过,运行时 ClassCastException
3. **可能返回 null**——ID 找不到返回 null,容易 NPE
4. **代码冗余**——10 个 View 写 10 行 findViewById

**优化方法**:把 findViewById 结果缓存到字段(`lateinit var title: TextView`),onCreate 里 init 一次。后续都用字段。

但仍冗余——这就是 ViewBinding 要解决的。

---

## 三、`ViewBinding`:类型安全的"找 View"

```kotlin
// :app/build.gradle.kts
android {
    buildFeatures { viewBinding = true }
}
```

AGP 给每个 layout XML 自动生成 Binding 类:`activity_main.xml` → `ActivityMainBinding`。

```kotlin
class MainActivity : Activity() {
    private lateinit var binding: ActivityMainBinding
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // 直接用,无需 findViewById
        binding.title.text = "Hello"
        binding.saveButton.setOnClickListener { /* ... */ }
    }
}
```

**ViewBinding 的红利**:

1. **类型安全**——`binding.title` 是 `TextView`,编译期检查
2. **空安全**——XML 里**所有 ID 都进 Binding**,字段非空(除非用 `tools:layout` 标可空)
3. **自动生成**——XML 改了,Binding 类自动更新
4. **零开销**——本质就是 findViewById 一次性全做完,缓存到字段

**Fragment 里的写法**:

```kotlin
class HomeFragment : Fragment() {
    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!
    
    override fun onCreateView(...): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null      // 避免 View 引用泄漏
    }
}
```

**Fragment 必须在 onDestroyView 置 null**(Fragment 比 View 寿命长)。

**ViewBinding 是 XML 项目的标配**——没有理由不开,新 XML 项目都该用。

---

## 四、`DataBinding`:更激进(争议大)

DataBinding 允许在 XML 里写表达式:

```xml
<layout xmlns:android="...">
    <data>
        <variable name="vm" type="com.notedx.HomeViewModel" />
    </data>
    <LinearLayout ...>
        <TextView
            android:text="@{vm.title}"
            android:visibility="@{vm.isLoaded ? View.VISIBLE : View.GONE}" />
    </LinearLayout>
</layout>
```

```kotlin
val binding: ActivityMainBinding = DataBindingUtil.setContentView(this, R.layout.activity_main)
binding.vm = viewModel
binding.lifecycleOwner = this
```

**DataBinding 的红利**:UI 与 ViewModel 双向绑定,声明式风格,理论上代码少。

**致命问题**:

1. **编译期生成代码极复杂** —— 表达式语法错误 / 类型错误,错误信息晦涩
2. **构建慢**——KAPT 处理 layout 慢
3. **运行时性能**——表达式背后有反射调用 / 监听注册,负担可见
4. **可读性差**——业务逻辑混入 XML
5. **现代替代是 Compose**——Compose 解决了同样的问题,且更优雅

**结论**:**DataBinding 在 Compose 时代基本被淘汰**。如果你接手用了 DataBinding 的老项目,留着;新项目**坚决用 ViewBinding 或者直接上 Compose**。

---

## 五、`<merge>` / `<include>` / `<ViewStub>` 复用

### `<include>`:复用一段 XML

```xml
<!-- toolbar.xml -->
<androidx.appcompat.widget.Toolbar ... />

<!-- activity_main.xml -->
<LinearLayout>
    <include layout="@layout/toolbar" android:id="@+id/toolbar" />
    <FrameLayout ... />
</LinearLayout>
```

ViewBinding 自动给 include 生成嵌套 binding:

```kotlin
binding.toolbar.root            // 实际的 Toolbar 对象
```

### `<merge>`:不增加层级

```xml
<!-- merge_buttons.xml -->
<merge xmlns:android="...">
    <Button android:id="@+id/btn_a" ... />
    <Button android:id="@+id/btn_b" ... />
</merge>
```

被 include 时,merge 不创建容器,两个 Button 直接挂到 include 的父级。**用于自定义复用组合,减少层级**。

### `<ViewStub>`:按需 inflate

```xml
<ViewStub
    android:id="@+id/stub_advanced"
    android:layout="@layout/advanced_settings"
    android:inflatedId="@+id/advanced" />
```

```kotlin
findViewById<ViewStub>(R.id.stub_advanced).inflate()
// ViewStub 被替换为 advanced_settings 的内容
```

**用例**:某些屏幕的"高级选项" / "错误提示" 默认不显示,需要时才创建。**避免初始 inflate 浪费**。

---

## 六、`<style>` 与 `<theme>`:样式复用

```xml
<!-- res/values/styles.xml -->
<style name="HeadlineText">
    <item name="android:textSize">24sp</item>
    <item name="android:textColor">@color/black</item>
    <item name="android:textStyle">bold</item>
</style>
```

```xml
<TextView style="@style/HeadlineText" ... />
```

**Style** 是一组属性的集合,**Theme** 是应用到整个 Activity / Application 的 style。

```xml
<style name="Theme.NotedX" parent="Theme.MaterialComponents.DayNight.NoActionBar">
    <item name="colorPrimary">@color/notedx_blue</item>
    <item name="android:windowBackground">@color/background</item>
</style>
```

```xml
<application android:theme="@style/Theme.NotedX" ... />
```

**Theme 是从根 Window 继承到所有子 View**——你给 Activity 设 theme,里面所有 TextView 默认 textColor 都是 theme 里定义的 primary 色。

---

## 七、`?attr/xxx`:主题引用

```xml
<TextView android:textColor="?attr/colorPrimary" ... />
```

`?attr/` 引用当前主题下的属性值——不写死颜色,根据 theme 自动变(深色模式自适应)。

**新代码永远用 `?attr/`**,不写死颜色,**这是 Material 主题正常工作的前提**。

---

## 八、`tools:` 命名空间:设计时辅助

```xml
<LinearLayout xmlns:android="..." xmlns:tools="http://schemas.android.com/tools">

    <TextView
        android:id="@+id/title"
        tools:text="标题示例"                    <!-- 仅设计时显示,运行时无 -->
        android:text="@{vm.title}" />
    
    <RecyclerView
        tools:listitem="@layout/note_row"       <!-- 设计时显示假数据 -->
        tools:itemCount="5" />
</LinearLayout>
```

`tools:` 属性**编译时被去掉**,只在 Android Studio Preview 里用。

**用例**:布局预览不需要等数据,设计时即可看效果——和 Compose 的 `@Preview` 同思想。

---

## 九、ConstraintLayout:扁平化布局

旧式 LinearLayout / RelativeLayout 嵌套深易卡。**ConstraintLayout**(2017+)让你**用约束声明位置**,通常 1-2 层就能搞定整个屏幕:

```xml
<androidx.constraintlayout.widget.ConstraintLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <TextView
        android:id="@+id/title"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        android:layout_marginTop="16dp"
        android:layout_marginStart="16dp" />

    <Button
        android:id="@+id/saveButton"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        app:layout_constraintTop_toBottomOf="@id/title"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="8dp"
        android:layout_marginEnd="16dp" />
</androidx.constraintlayout.widget.ConstraintLayout>
```

**性能**:ConstraintLayout 内部一次 measure 解决整个约束图,比深嵌套快。

**Android Studio Layout Editor** 提供拖拽生成约束——可视化操作。

---

## 十、`LayoutInflater`:运行时 inflate

```kotlin
val view = LayoutInflater.from(context).inflate(R.layout.item_row, parent, false)
```

**参数**:

- `resource`——XML id
- `root`——挂载的父级(可 null)
- `attachToRoot`——是否真的挂到 root

**RecyclerView 的 Adapter** 永远用 `parent, false`——意思是"用 parent 的 LayoutParams 作为约束,但不真的挂上去"(RecyclerView 自己管挂载)。

---

## 十一、`<dimen>` / `<color>` / `<string>` / `<integer>`

```xml
<!-- res/values/dimens.xml -->
<resources>
    <dimen name="margin_default">16dp</dimen>
    <dimen name="text_title">18sp</dimen>
</resources>

<!-- res/values/colors.xml -->
<resources>
    <color name="notedx_blue">#005AC1</color>
    <color name="background_light">#FFFFFF</color>
    <color name="background_dark">#121212</color>
</resources>

<!-- res/values/strings.xml -->
<resources>
    <string name="app_name">NotedX</string>
    <string name="welcome">欢迎,%1$s</string>
</resources>
```

XML 引用:`android:textSize="@dimen/text_title"` / `android:textColor="@color/notedx_blue"` / `android:text="@string/welcome"`。

代码引用:`getString(R.string.welcome, userName)` / `resources.getDimensionPixelSize(R.dimen.margin_default)`。

**值在 XML 里集中,UI 引用 ID,主题切换 / 国际化 / 多屏适配靠 17 篇的"资源限定符"**。

---

## 十二、9-patch 图:可拉伸图片

```
btn_background.9.png      ← 注意命名 .9.png
```

9-patch 是带"拉伸标记线"的 PNG——四条黑线指示哪些区域可以拉伸 / 内容区。常用于按钮背景、气泡——一张图适配任意尺寸。

Android Studio 自带 9-patch 编辑器:`Tools → Draw 9-patch`。

**Compose 项目几乎不用 9-patch**——直接画 Box + RoundedCornerShape。9-patch 主要在 XML 项目里。

---

## 十三、自定义 attribute

```xml
<!-- res/values/attrs.xml -->
<resources>
    <declare-styleable name="CustomView">
        <attr name="cv_radius" format="dimension" />
        <attr name="cv_borderColor" format="color" />
    </declare-styleable>
</resources>
```

```kotlin
class CustomView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    init {
        context.theme.obtainStyledAttributes(attrs, R.styleable.CustomView, 0, 0).apply {
            try {
                val radius = getDimension(R.styleable.CustomView_cv_radius, 0f)
                val border = getColor(R.styleable.CustomView_cv_borderColor, Color.BLACK)
            } finally { recycle() }
        }
    }
}
```

XML 用:

```xml
<com.notedx.CustomView
    app:cv_radius="8dp"
    app:cv_borderColor="#FF0000" />
```

16 篇会展开自定义 View。

---

## 十四、Compose 替代了什么

| XML 概念 | Compose 替代 |
| --- | --- |
| `<LinearLayout>` / `<RelativeLayout>` | `Column` / `Row` / `Box` |
| `<TextView>` / `<Button>` | `Text` / `Button` Composable |
| `findViewById` / ViewBinding | 函数参数 / 状态 |
| `<style>` / `<theme>` | `MaterialTheme` + `LocalContentColor` |
| `?attr/colorPrimary` | `MaterialTheme.colorScheme.primary` |
| `<include>` / `<merge>` | 普通 Composable 函数调用 |
| `<ViewStub>` | `if (condition) { Composable() }` |
| `tools:text` | `@Preview` 注解 |
| DataBinding 表达式 | Composable 内 state-driven 自然写 |
| 9-patch | Compose 自带 `RoundedCornerShape` / `dashedBorder` |

Compose 是这套 XML 系统的"声明式版本"——本质上是同样意图的现代化重写。

---

## 十五、迁移到 Compose 的策略

老 XML 项目逐 Fragment 迁 Compose:

```kotlin
class HomeFragment : Fragment() {
    override fun onCreateView(...): View {
        return ComposeView(requireContext()).apply {
            setContent {
                NotedXTheme { HomeScreen() }
            }
        }
    }
}
```

Activity 不变,只把 Fragment 的 onCreateView 改成返回 ComposeView。逐个 Fragment 迁,最后整个 App 不再有 XML 布局(除了 themes.xml 等系统级)。

---

## 十六、调试

```bash
# 查看当前 Activity 的 View 层级
adb shell dumpsys activity top

# Show layout bounds(系统设置 / adb)
adb shell setprop debug.layout true
# stop && start app

# 看 layout inflate 时间
adb shell setprop debug.systrace.tags.enableflags views     # 触发 trace 类别
```

---

## 十七、踩坑

**坑 1:`findViewById` 在 setContentView 之前调用**。Activity 还没解析 layout,返回 null。**永远在 super.onCreate 之后**。

**坑 2:ViewBinding 在 Fragment 不置 null**。Fragment 重建,_binding 持有旧 View → 泄漏。

**坑 3:写死颜色而不用 `?attr/`**。深色模式下颜色不变 / 主题不能切换。

**坑 4:`match_parent` 在 ScrollView 内**。ScrollView 内子 height 不能 match_parent(没法决定多高)。改 wrap_content 或具体 dp。

**坑 5:`layout_weight` 与 `width` 不配合**。LinearLayout weight 模式下,`layout_width="0dp"` + `weight=1` 才正确;`wrap_content` + `weight` 可能行为不符预期。

**坑 6:include 时漏写 layout id**。`<include layout="@layout/x" />` 没有 id,代码里找不到。**`android:id="@+id/x"` 必给**(给容器 id,而不是 include 内部 id)。

**坑 7:多 layout 共用 ID 引用**。`R.id.title` 在 A 和 B layout 都用——ViewBinding 没问题(各自 Binding 类),但 findViewById 写得不当容易拿错。

**坑 8:`include` 在 ConstraintLayout 里设 layout_constraint**。include 的 root 决定它的 LayoutParams 类型,不一定支持 constraint。`<include>` 外面包一层有时需要。

**坑 9:DataBinding 与 R8 / kapt 冲突**。kapt 出错信息隐晦。**优先用 KSP + ViewBinding,不要选 DataBinding**。

**坑 10:`setContentView` 多次调用**。每次重新 inflate,旧 View 引用失效,findViewById 拿错。`setContentView` 应在 onCreate 调一次。

---

下一篇 `16-自定义 View onMeasure onLayout onDraw.md`,完整走通"自己写一个 View":什么时候该自定义、`onMeasure` 的尺寸协商、`onLayout` 摆放子 View、`onDraw` 用 Canvas / Paint 画图、触摸事件分发、save/restore state 跨配置变化。
