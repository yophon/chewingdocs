# 输入控件与 TextField2

> 一句话:**Compose 1.7 的 `BasicTextField`(俗称 TextField2)用 `TextFieldState` 替代了"`value` + `onValueChange`"的伪 UDF 模型**,这才是 Android 输入的最终答案。本篇讲为什么旧 TextField 必须淘汰,新 API 怎么写。

---

## 一、旧 TextField 为什么必须换

Compose 1.5 之前,输入框是这样写的:

```kotlin
var text by remember { mutableStateOf("") }
TextField(
    value = text,
    onValueChange = { text = it }
)
```

看起来很 UDF——value 来自 State,onValueChange 改 State。但这套模型在以下场景全部出问题:

1. **中文 / 日文输入法组合文本**——拼音输入时,IME 维护一个"组合中"的草稿,旧 TextField 只暴露最终文本,组合状态没法对齐,经常出现"光标乱跳"、"删除把整个拼音串删掉"。
2. **撤销 / 重做**——旧模型每次 `onValueChange` 都是"我变成了这个值",历史只能自己存,实现极麻烦。
3. **光标位置无法 hoist**——`value` 只有 `String`,光标位置藏在内部,父级想"重置文本时把光标放到末尾"做不到。
4. **重组性能**——`onValueChange` 触发外部 State 更新,外部 State 写回 `value`,中间一来一回额外重组。

Compose 1.7 引入 **`BasicTextField(state: TextFieldState, ...)`**,把这些坑系统性修掉。这是 Android 输入控件的**新默认**。

> 旧 `TextField(value, onValueChange)` 还能用,但已经标 deprecation 路径,新代码不应再写。

---

## 二、`TextFieldState`:输入的状态容器

```kotlin
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState

@Composable
fun MyInput() {
    val state = rememberTextFieldState()
    BasicTextField(
        state = state,
        modifier = Modifier.fillMaxWidth(),
    )
}
```

`TextFieldState` 同时持有:

- **文本**(`state.text`,实际上是一个 `CharSequence` 视图)
- **光标位置 / 选区**(`state.selection`)
- **组合状态**(`state.composition`,IME 用)
- **撤销栈**(`state.undoState`)

输入框的所有"状态"都封装在这一个对象里,UI 直接绑定,父级也直接读 / 写它。

读取当前文本:

```kotlin
val current: String = state.text.toString()
```

写入文本(替换全部):

```kotlin
state.edit { replace(0, length, "新内容") }
```

`state.edit { ... }` 是个事务块,内部对所有 buffer 操作合并到一次重组。

---

## 三、绑定到 ViewModel:在哪一层 hoist

新模型下,文本的"真理源"放在哪?有两种合理选择:

**A. `TextFieldState` 留在 Composable,ViewModel 只在事件时取值**

```kotlin
@Composable
fun NoteEditor(onSave: (String) -> Unit) {
    val titleState = rememberTextFieldState()
    Column {
        BasicTextField(state = titleState)
        Button(onClick = { onSave(titleState.text.toString()) }) {
            Text("保存")
        }
    }
}
```

**适用**:简单表单,文本只在提交时才需要。这种模式下 ViewModel 不订阅输入,极省重组。

**B. `TextFieldState` 挂在 ViewModel,UI 共享同一个对象**

```kotlin
class NoteEditorViewModel : ViewModel() {
    val titleState = TextFieldState()
    
    fun save() {
        val title = titleState.text.toString()
        // ...
    }
}

@Composable
fun NoteEditor(vm: NoteEditorViewModel = viewModel()) {
    BasicTextField(state = vm.titleState)
    Button(onClick = vm::save) { Text("保存") }
}
```

**适用**:需要跨屏幕共享文本(草稿)、需要业务逻辑响应输入(实时搜索)、屏幕旋转要保留输入。

**默认选 A**——除非你确实需要 ViewModel 持有,否则文本状态在 Composable 里就够了。这与 Jetpack Compose 团队最新的官方指南一致。

---

## 四、实时响应输入:`textAsFlow`

订阅输入变化到 ViewModel(比如实时搜索):

```kotlin
class SearchViewModel : ViewModel() {
    val queryState = TextFieldState()
    
    val results: StateFlow<List<Note>> = snapshotFlow { queryState.text.toString() }
        .debounce(300)
        .distinctUntilChanged()
        .flatMapLatest { repo.search(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}

@Composable
fun SearchScreen(vm: SearchViewModel = viewModel()) {
    val results by vm.results.collectAsStateWithLifecycle()
    Column {
        BasicTextField(state = vm.queryState)
        // 显示 results
    }
}
```

**`snapshotFlow { ... }`**——把 Compose State 读取转换成 Flow,每次 State 变化都发送当前值。这是 Compose 与 Flow 之间的桥。

`debounce(300)` + `distinctUntilChanged()` + `flatMapLatest { ... }` 是"输入式搜索"的经典三件套:抖动 300ms、相同输入不重新搜、新输入到了取消上次。

---

## 五、Material 3 的 `TextField`(高层包装)

`BasicTextField` 是底层 API,没有边框、没有标签、没有错误提示。Material 3 给的高层包装是 `TextField` / `OutlinedTextField`——**但 1.7 时点这两个还基于旧 API(value + onValueChange)**,Material 3 还在迁移中。

实际项目里,以下是过渡期的写法:

```kotlin
import androidx.compose.material3.OutlinedTextField

@Composable
fun TitleField(state: TextFieldState) {
    OutlinedTextField(
        value = state.text.toString(),
        onValueChange = { state.edit { replace(0, length, it) } },
        label = { Text("标题") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
}
```

绕一层把 `TextFieldState` 适配到 Material `OutlinedTextField`。等 Material 3 完成迁移(预计 1.8 / 1.9),会有原生支持 `TextFieldState` 的 `OutlinedTextField`,本篇会更新。

---

## 六、键盘 / IME 配置

```kotlin
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType

BasicTextField(
    state = emailState,
    keyboardOptions = KeyboardOptions(
        keyboardType = KeyboardType.Email,         // 邮箱键盘
        imeAction = ImeAction.Next,                // IME 显示"下一项"
        autoCorrectEnabled = false,                // 邮箱不要自动纠正
    ),
    onKeyboardAction = { /* IME 动作触发,如 Next/Done/Search */
        focusManager.moveFocus(FocusDirection.Down)
    },
)
```

`KeyboardType` 常用值:`Text` / `Email` / `Number` / `NumberPassword` / `Password` / `Phone` / `Uri`。

`ImeAction`:`Done` / `Next` / `Previous` / `Search` / `Send`。

---

## 七、聚焦与焦点管理

```kotlin
val focusRequester = remember { FocusRequester() }

BasicTextField(
    state = state,
    modifier = Modifier.focusRequester(focusRequester),
)

LaunchedEffect(Unit) {
    focusRequester.requestFocus()    // 进入屏幕自动聚焦
}
```

多字段表单的"按 Next 跳到下一个":

```kotlin
val focusManager = LocalFocusManager.current

BasicTextField(
    state = titleState,
    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
    onKeyboardAction = { focusManager.moveFocus(FocusDirection.Down) },
)
BasicTextField(
    state = contentState,
    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
    onKeyboardAction = { focusManager.clearFocus() },
)
```

---

## 八、IME 内边距:edge-to-edge 下输入框不被键盘盖住

边到边模式开启后,键盘弹出会盖住输入框。Compose 1.5+ 提供 `imePadding()` Modifier:

```kotlin
Scaffold(
    modifier = Modifier.imePadding(),    // 整个屏幕跟 IME 高度上推
) { inner ->
    // ...
}
```

或者只让某个元素跟 IME 调整:

```kotlin
Column(
    modifier = Modifier.windowInsetsPadding(WindowInsets.ime),
) { ... }
```

`Scaffold` 默认会处理 IME inset,但只有当**你用了 `imePadding()` 或 `WindowInsets.ime`** 才生效。新项目把 `.imePadding()` 当成默认就对了。

---

## 九、表单状态:推荐做法

一个完整的表单(标题 + 内容 + 标签):

```kotlin
class NoteFormViewModel : ViewModel() {
    val titleState = TextFieldState()
    val contentState = TextFieldState()
    
    private val _selectedTags = MutableStateFlow<Set<TagId>>(emptySet())
    val selectedTags: StateFlow<Set<TagId>> = _selectedTags.asStateFlow()
    
    val canSave: StateFlow<Boolean> = snapshotFlow { titleState.text.toString() }
        .map { it.isNotBlank() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    
    fun toggleTag(id: TagId) {
        _selectedTags.update { current ->
            if (id in current) current - id else current + id
        }
    }
    
    fun save() {
        viewModelScope.launch {
            val note = Note(
                title = titleState.text.toString(),
                content = contentState.text.toString(),
                tags = _selectedTags.value,
            )
            repo.insert(note)
        }
    }
}
```

**心智**:文本字段用 `TextFieldState`(不是 `StateFlow<String>`,因为后者每键入一字触发整个 ViewModel 重组);选择 / 切换类用 `StateFlow`;**计算"是否可保存"用 `snapshotFlow { ... }` 把文本变成 Flow 再组合**。

UI:

```kotlin
@Composable
fun NoteForm(vm: NoteFormViewModel = viewModel()) {
    val canSave by vm.canSave.collectAsStateWithLifecycle()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = vm.titleState.text.toString(),
            onValueChange = { vm.titleState.edit { replace(0, length, it) } },
            label = { Text("标题") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = vm.contentState.text.toString(),
            onValueChange = { vm.contentState.edit { replace(0, length, it) } },
            label = { Text("内容") },
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 200.dp),
        )
        Button(onClick = vm::save, enabled = canSave) {
            Text("保存")
        }
    }
}
```

---

## 十、输入校验:错误显示

```kotlin
val email by vm.email.collectAsStateWithLifecycle()
val emailError = email.isNotEmpty() && !email.contains("@")

OutlinedTextField(
    value = email,
    onValueChange = vm::onEmailChange,
    label = { Text("邮箱") },
    isError = emailError,
    supportingText = {
        if (emailError) Text("邮箱格式不正确", color = MaterialTheme.colorScheme.error)
    },
    modifier = Modifier.fillMaxWidth(),
)
```

**校验时机选择**:

- 实时(每次输入)——干扰用户,通常只在用户已经离开过这个字段一次后才校验
- onSubmit(点击保存时)——简单,但用户要按完保存才知道哪里错
- onBlur(焦点离开字段)——最佳折中

实操推荐:`var hasBeenTouched by remember { mutableStateOf(false) }`,失焦时设为 true,校验只在 touched 后显示。

---

## 十一、踩坑

**坑 1:`var text by remember { mutableStateOf("") }` 写新代码**。这是旧模式。新代码用 `rememberTextFieldState()`。

**坑 2:把 `TextFieldState.text` 当 String 比较**。`state.text` 是 `CharSequence`,直接 `state.text == "x"` 不一定按你想的工作。`state.text.toString() == "x"` 才稳妥。

**坑 3:`onValueChange` 里跑昂贵逻辑**。每次按键都触发——校验、过滤、网络请求都不能直接放这里。要么 debounce,要么放 `snapshotFlow` + `debounce`。

**坑 4:整个表单状态扔到一个 `StateFlow<FormState>`**。每个字段输入都触发整个 StateFlow 重组,UI 性能差。**字段间相互独立的状态各自独立**,统一只在提交时聚合。

**坑 5:`imePadding()` 加在错的层级**。`imePadding()` 是 Modifier,作用于"应用它的那个 Composable 树及其子树"。如果你只想输入框本身随键盘移动,加在外层 Column;如果想整个屏幕推上去,加在 Scaffold。

**坑 6:`focusRequester` 在 Composable 函数体外创建**。`FocusRequester` 必须 `remember`,否则每次重组都新建,绑定的输入框对不上。

**坑 7:中文输入断字**。输入中文时,`onValueChange` 在拼音组合期间会被多次调用。如果你在 onValueChange 里"截断超长输入",会破坏组合。新 API 的 `TextFieldState.edit { }` 可以用 `filterChars` 等更细的接口处理这种边界,具体见 1.7+ 文档。

**坑 8:`Modifier.imePadding()` 与全屏 Dialog 冲突**。Dialog 默认有自己的 window inset 处理,在 Dialog 内再加 `imePadding` 可能导致键盘弹起时内容上推过多。先确认 Dialog 的 `properties.decorFitsSystemWindows` 设置。

---

下一篇 `08-布局 Modifier 与自适应.md`,把 Compose 的布局系统讲清楚:`Row` / `Column` / `Box` 的本质、`Modifier` 链顺序、weight / fillMaxSize / wrapContentSize 的区别、`ConstraintLayout` 何时该用、多语言/字体/可访问性的 inset 一并收口。
