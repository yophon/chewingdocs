# Fragment:历史、问题与心智

> 一句话:**Fragment 是 2011 年为"平板大屏一个 Activity 装多面板"发明的,后来变成了"组件复用 + 路由"的万能锤,顺手把生命周期复杂度乘以二**。现代 Compose 单 Activity 几乎不再用 Fragment,但**老代码大量使用,且系统服务有些场景仍要懂**。

---

## 一、Fragment 为什么会被发明

Android 1.0 的设计:**一屏一个 Activity**。手机屏小,这样够用。

2010 年平板时代来临,屏幕大,但**两个 Activity 不能同屏显示**(Activity 是全屏的)——平板上"左侧列表 + 右侧详情"做不了。

Google 在 Android 3.0(Honeycomb,2011)引入 **Fragment**:把 Activity 的内容拆成"一片片"(fragment),一个 Activity 可以装多个 Fragment,每个 Fragment 有自己的 View + 生命周期。

```
Activity (大屏平板)
├── ListFragment  (左侧 1/3)
└── DetailFragment (右侧 2/3)

Activity (小屏手机)
└── ListFragment (全屏);点击跳到新 Activity 显示 DetailFragment
```

**初衷是合理的**:解决"一屏多面板"问题。

**问题是后来被滥用**:大家发现 Fragment 比新建 Activity 轻,就开始把每个屏幕都做成 Fragment,FragmentTransaction 替代 startActivity。**这就把 Activity 的复杂生命周期 + Fragment 的复杂生命周期叠加**,问题指数级增长。

---

## 二、Fragment 的生命周期

Activity 7 个回调,Fragment 有 **11 个**(还不算 View 生命周期):

```
onAttach(context)         ← Fragment 被加到 Activity 上
onCreate(bundle)           ← Fragment 本身创建
onCreateView(...)          ← 创建这个 Fragment 的 View 树(返回 View 对象)
onViewCreated(view, ...)   ← View 创建完
onStart()
onResume()
onPause()
onStop()
onDestroyView()            ← View 被销毁(Fragment 本身可能没销毁)
onDestroy()                ← Fragment 销毁
onDetach()                 ← Fragment 与 Activity 解绑
```

**关键混乱点**:**Fragment 与它的 View 有两份生命周期**:

- **Fragment 实例** 寿命由 FragmentManager 管理
- **View 实例** 寿命可能比 Fragment 短(切换页面时 View 销毁但 Fragment 留着)

这导致经常出现 "View 没了但 Fragment 还在 callback" 的崩溃:

```kotlin
viewModel.notes.observe(this) { notes ->
    binding.recyclerView.adapter = ...    // 崩!Fragment View 已经销毁,binding 引用的 View 是 null
}
```

**修法**:用 `viewLifecycleOwner` 代替 `this`:

```kotlin
viewModel.notes.observe(viewLifecycleOwner) { notes -> ... }
```

`viewLifecycleOwner` 是 Fragment View 的 LifecycleOwner,在 `onDestroyView` 时被销毁——回调自动停。

这是 Fragment **最常见的坑**,也是它复杂度的具体体现。

---

## 三、FragmentManager 与 FragmentTransaction

```kotlin
supportFragmentManager.beginTransaction()
    .replace(R.id.container, HomeFragment())
    .addToBackStack(null)
    .commit()
```

**`FragmentManager`** 管所有 Fragment 实例,提供事务化的添加 / 移除 / 替换。**`FragmentTransaction`** 是一组操作的原子提交。

**关键操作**:

- `add` / `remove`——添加 / 移除 Fragment(View 销毁,Fragment 实例可能仍在)
- `replace`——替换容器内现有 Fragment
- `show` / `hide`——只改可见性,Fragment 不销毁(View 留着)
- `addToBackStack(tag)`——加入 BackStack,系统返回可以撤销这次事务

`addToBackStack` 后,Fragment 在 BackStack 上,View 可能被 destroy(`onDestroyView`),但 Fragment 实例还活着——返回时 View 重新 `onCreateView`。

**`commit()` vs `commitNow()` vs `commitAllowingStateLoss()`**:

- `commit()`——异步,Looper 下一帧执行
- `commitNow()`——同步立即执行(不能与 BackStack 配合)
- `commitAllowingStateLoss()`——`commit` 但在 Activity 已 `onSaveInstanceState` 后不抛异常(**反而是这个特性掩盖了 bug**)

**经典异常**:`IllegalStateException: Can not perform this action after onSaveInstanceState`——在 Activity onSaveInstanceState 后调 commit,系统认为 UI 状态已凝固,拒绝改。

`commitAllowingStateLoss` 是"我接受丢失"——但 UI 状态确实可能不一致。新代码应该用 Fragment Result API 之类的设计避开这种场景。

---

## 四、嵌套 Fragment:复杂度叠加

```kotlin
// Outer Fragment
childFragmentManager.beginTransaction()
    .add(R.id.inner_container, InnerFragment())
    .commit()
```

嵌套 Fragment 用 **`childFragmentManager`**(不是 `supportFragmentManager`)。

**问题**:

- Outer 销毁,Inner 也销毁
- Outer 的 onResume 是 Inner 的 onAttach 时机
- onActivityResult 在嵌套 Fragment 间路由麻烦

**实操**:**避免 Fragment 嵌套超过一层**。需要复杂结构,改 Compose / View 直接组合。

---

## 五、ViewPager + Fragment:常见用法

```kotlin
class HomePagerAdapter(fragment: Fragment) : FragmentStateAdapter(fragment) {
    override fun getItemCount() = 3
    override fun createFragment(position: Int): Fragment = when (position) {
        0 -> NotesFragment()
        1 -> TagsFragment()
        2 -> SettingsFragment()
    }
}

binding.viewPager.adapter = HomePagerAdapter(this)
```

`ViewPager2` + `FragmentStateAdapter` 是底部 Tab / 滑动页的典型实现。**FragmentStateAdapter 内部按需创建 Fragment,不可见时 destroyView(节省内存)**。

Compose 时代:`HorizontalPager` 直接装 Composable,完全不用 Fragment。

---

## 六、DialogFragment:对话框的标准

```kotlin
class ConfirmDialog : DialogFragment() {
    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        return AlertDialog.Builder(requireContext())
            .setTitle("删除?")
            .setMessage("这条笔记将永久删除")
            .setPositiveButton("删除") { _, _ -> /* ... */ }
            .setNegativeButton("取消", null)
            .create()
    }
}

ConfirmDialog().show(supportFragmentManager, "confirm")
```

**为什么用 DialogFragment 而不是直接 AlertDialog**:屏幕旋转时 AlertDialog 会消失;DialogFragment 跟 FragmentManager 走,旋转后自动重建。

Compose 时代:`AlertDialog` Composable + state 控制可见性,完全不用 Fragment。

---

## 七、Fragment 之间的数据传递

旧方式:**setTarget / setArguments**

```kotlin
val frag = DetailFragment().apply {
    arguments = Bundle().apply { putLong("noteId", 42) }
}
```

新方式:**Fragment Result API**

```kotlin
// 接收方
parentFragmentManager.setFragmentResultListener("key", this) { _, bundle ->
    val result = bundle.getString("value")
}

// 发送方
parentFragmentManager.setFragmentResult("key", bundleOf("value" to "..."))
```

Fragment Result API 是 `androidx.fragment:1.3+` 的现代答案,**取代过时的 setTargetFragment**。

---

## 八、Navigation Component 与 Fragment

Jetpack Navigation 之前的版本支持 Fragment 作为目的地:

```xml
<navigation>
    <fragment
        android:id="@+id/homeFragment"
        android:name="com.notedx.HomeFragment"
        android:label="Home">
        <action
            android:id="@+id/action_to_detail"
            app:destination="@id/detailFragment" />
    </fragment>
    <fragment ... />
</navigation>
```

代码:

```kotlin
findNavController().navigate(R.id.action_to_detail, bundleOf("noteId" to 42))
```

**Navigation Compose**(现代版 11 篇)直接用 `composable<Route>` 作为目的地,**完全跳过 Fragment**。新项目应当用 Navigation Compose 而不是 Navigation + Fragment。

---

## 九、为什么 Compose 时代 Fragment 几乎不用

Compose 解决了 Fragment 的三个核心问题:

1. **可复用 UI 单元**——Fragment 是为了"封装一块可复用 UI",Composable 函数完美胜任
2. **生命周期感知 UI**——`LaunchedEffect` / `rememberSaveable` 替代 Fragment 生命周期
3. **导航**——Navigation Compose 替代 FragmentTransaction

**结果**:**单 Activity + Compose Navigation 就是 Fragment 的完全替代**。Google 的 Now in Android、官方所有现代 sample 都不用 Fragment。

**仍然用 Fragment 的场景**(少数):

- 旧项目还在用 XML View + Navigation Component——这套和 Fragment 绑定
- 三方 SDK 强制要求传入 Fragment(微信支付 / 某些扫码 SDK)
- `AndroidView` 嵌入需要 LifecycleOwner 的 View 库时,Fragment 提供 viewLifecycleOwner 比 Composable 直接

---

## 十、读老代码的最低要求

如果你接手一个 Java/Kotlin + XML + Fragment 的老项目,**至少要会读**这几样:

```kotlin
class HomeFragment : Fragment() {
    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.recyclerView.adapter = NoteAdapter()
        viewModel.notes.observe(viewLifecycleOwner) { notes ->
            (binding.recyclerView.adapter as NoteAdapter).submitList(notes)
        }
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null              // 避免 View 泄漏
    }
}
```

**关键写法**:

- `_binding` 私有 nullable,`binding` 是非空 getter
- `onCreateView` 创建 View + binding
- `onViewCreated` 设置 UI / 订阅
- `onDestroyView` **必须置 null**(否则 View 引用泄漏)
- `observe` 用 `viewLifecycleOwner`,不是 `this`

这是 Fragment + ViewBinding + ViewModel + LiveData 的"老 Android 标准模式"。

---

## 十一、Fragment 与 ViewModel 的 scope

```kotlin
private val sharedVm: SharedViewModel by activityViewModels()   // Activity-scoped
private val vm: HomeViewModel by viewModels()                   // Fragment-scoped
private val parentVm: ParentViewModel by viewModels({ requireParentFragment() })   // 父 Fragment-scoped
```

`by viewModels()` 是 ktx 委托,内部:

- `viewModels()` 默认用 Fragment 自己作为 ViewModelStoreOwner
- `activityViewModels()` 用宿主 Activity 作为 Owner——Activity 内多个 Fragment 共享同一个 ViewModel
- 自定义 owner 可以共享给父 Fragment / 嵌套场景

这是 Fragment-Fragment / Fragment-Activity 共享数据的标准模式。

---

## 十二、Fragment 与 onActivityResult / Result API

旧 API:onActivityResult 在 Fragment 也能用,但要小心**嵌套 Fragment 不会自动收到**——必须 Activity 转发。

新 API:

```kotlin
private val launcher = registerForActivityResult(ActivityResultContracts.PickContact()) { uri ->
    // 在 Fragment 里直接收
}

binding.button.setOnClickListener { launcher.launch(null) }
```

Activity Result API 不论 Activity 还是 Fragment 都用同一个,不用考虑嵌套。**新代码全用这套**。

---

## 十三、什么时候真的需要 Fragment

只有 4 个场景:

1. **维护已经用 Fragment 的老项目**——别去 rewrite 一切,Fragment + Compose 也能共存(`ComposeView` 嵌 Composable)
2. **三方 SDK 强制要求 Fragment**——少数 SDK 这样设计,只能配合
3. **需要 dialog 配合 FragmentManager 的生命周期**——但 Compose `AlertDialog` 已经覆盖
4. **DialogFragment.show 的弹窗模式仍然方便**——某些工具弹窗(分享面板 / 底部表)的现成实现还在用

**Compose-only 新项目**:99% 不需要 Fragment。

---

## 十四、Fragment + Compose 互嵌

现实中有渐进迁移的需求——把老 Fragment 换成 Compose:

```kotlin
class HomeFragment : Fragment() {
    override fun onCreateView(...): View {
        return ComposeView(requireContext()).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent {
                NotedXTheme {
                    HomeScreen()       // Compose 代码从这里开始
                }
            }
        }
    }
}
```

**`setViewCompositionStrategy(DisposeOnViewTreeLifecycleDestroyed)`** 让 Compose 与 Fragment View 生命周期对齐,避免在 onDestroyView 后还重组导致泄漏。

这是 Compose **逐 Fragment 迁移**的标准方式——一个 Fragment 一个 ComposeView,逐渐覆盖,直到最后整个 App 单 Activity。

---

## 十五、调试 Fragment

```bash
# 查看 Fragment 栈
adb shell dumpsys activity activities | grep -A 50 "Stack"
```

代码里:

```kotlin
supportFragmentManager.fragments.forEach { Log.d("X", it::class.simpleName ?: "?") }
```

`FragmentManager.enableDebugLogging(true)` 让 Fragment 的生命周期回调打日志(API 已 deprecated,可以用)。

---

## 十六、踩坑

**坑 1:`observe(this)` 而不是 `observe(viewLifecycleOwner)`**。最经典 Fragment 崩溃——Fragment View 已销毁但 LiveData 回调还在引用旧 View,空指针。

**坑 2:`_binding` 不在 onDestroyView 置 null**。View 销毁但 binding 字段还引用,导致 View 树无法 GC,内存泄漏。

**坑 3:`commit()` 在 onSaveInstanceState 后调用**。`IllegalStateException`。常见来源是异步任务(网络回调)完成时 Activity 已经 stop。修法:在订阅时用 `viewLifecycleOwner.lifecycleScope`,生命周期自动管。

**坑 4:`commitAllowingStateLoss()` 当万能药**。这是把"状态丢失"合法化——能避免崩,但 UI 可能不一致。**新代码不要用这个,改用 Fragment Result API**。

**坑 5:嵌套 Fragment 用 `parentFragmentManager` 而不是 `childFragmentManager`**。前者是宿主的 FragmentManager,后者是嵌套 Fragment 的——用错会找不到子 Fragment。

**坑 6:Fragment 无参构造规则**。Fragment 必须有公共无参构造函数(系统反射重建)。**不能 `class HomeFragment(val id: Long)`**——用 arguments 传:
```kotlin
companion object {
    fun newInstance(id: Long) = HomeFragment().apply {
        arguments = bundleOf("id" to id)
    }
}
```

**坑 7:Fragment 间用 `setTargetFragment` 传数据**。已 deprecated,且嵌套 Fragment 下复杂。改 Fragment Result API。

**坑 8:`hide` / `show` 后 onResume / onPause 不调用**。`hide` 不触发生命周期变化(只是改可见性)——你以为 Fragment 进入后台释放资源,实际没释放。要写 `onHiddenChanged` 手动响应。

**坑 9:ViewPager + FragmentPagerAdapter(旧)的销毁混乱**。FragmentPagerAdapter 不销毁 Fragment(只 detach),内存占用大。**新代码用 FragmentStateAdapter(状态保存,View 销毁)**。

**坑 10:跨进程跳到 Fragment**。Fragment 是进程内概念,跨进程的"屏幕"只能是 Activity。Intent / 通知点击 / Deep Link 入口都必须是 Activity,Activity 内再 navigate 到 Fragment。

---

下一篇 `09-Service 三种形态与后台限制收紧史.md`,讲 Android 后台执行的核心组件 Service:Started / Bound / Foreground 三种形态、API 26 后台限制的根源、为什么 WorkManager 取代了大部分 Service 用法、什么场景仍然必须用前台服务。
