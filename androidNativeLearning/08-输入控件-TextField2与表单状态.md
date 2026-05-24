# 08-输入控件、TextField2 与表单状态

> 一句话导读:旧 `TextField` 的 `value/onValueChange` 模型让中文 IME 在每次重组时跳光标、丢字符;Compose 1.7 GA 的 `BasicTextField` + `TextFieldState` 把缓冲、组合、撤销都收回到状态对象内部,这才是 Compose 表单的新基线。

第 07 篇把 `State<T>`、`remember` 与 Strong Skipping 三件事拆清了,屏幕级 Composable 已经可以静默跳过大半重组。但只要你尝试在 Compose 里写一个登录页,旧 `TextField` 的两个老 bug 就会回来:**中文输入到第三个字时光标突然跳到开头**、**填到一半旋屏内容清零**。这一篇就是把这两件事从 root cause 处解决——同时介绍 Compose 1.7 GA 的 `BasicTextField`(社区称 TextField2)新签名,并给出旧组件的迁移路径。

读者画像默认:你已经能写一个能跑的 Compose 屏幕,知道 `OutlinedTextField` 长什么样,但你的表单页要么用了 `var text by remember { mutableStateOf("") }` 在 ViewModel / Composable 间来回穿,要么写过 `value=text, onValueChange={ text = it.trim() }` 并发现光标会被吃掉。本篇要把这套老姿势换掉。

## 1. 机制定位

### 1.1 旧 `TextField` 的两个根本问题

Compose 自 1.0 起的 `TextField(value, onValueChange)` 是经典的"受控组件"(类比 React `<input value onChange>`):

```kotlin
var text by remember { mutableStateOf("") }
TextField(value = text, onValueChange = { text = it })
```

模型很优雅:state 是真相,UI 是 state 的函数。但落到 Android IME 上,它有两个根本麻烦:

**问题一:中文 IME 组合文本(composition)与重组节奏冲突。**

中文输入的过程是:键盘先显示拼音字母(`pin yin`),用户选词后 IME 把它替换成汉字(`拼音`)。这段"未提交的拼音"叫 composition,IME 通过 `InputConnection` 多次更新它。受控模型每次 `onValueChange` 都要走一遍 state 写入 → 重组 → 重新构造 `TextFieldValue`,把 composition range 重新设回去。**只要在 `onValueChange` 里做任何加工(trim、replace、字符过滤),composition range 就会错位,IME 端的"未提交字符"被吃掉,光标跳到字符串末尾或开头。** 这是 Compose 1.0-1.6 时代最经典的"中文输入 bug",论坛回答清一色是"`onValueChange` 里不要动 it,让 raw value 直接回写"——但只要有任何业务需求(最大字符数、限制符号),这条建议就守不住。

**问题二:状态 hoisting 的二次重组开销。**

`TextField` 的 `value` 是 `TextFieldValue`(包含 text、selection、composition),IME 每打一个字就要把它 hoist 出去,经过 ViewModel 或 Composable 局部 state,再写回。每次按键都触发"上行 + 下行"两次同步,每次都引起持有它的 Composable 重组。低端机上输入框延迟可见。

### 1.2 TextField2 的新模型:状态对象自己管缓冲

Compose 1.7(2024-09 GA)推出 `BasicTextField` 的新签名(社区称 TextField2):

```kotlin
val state = rememberTextFieldState(initialText = "")
BasicTextField(state = state, /* ... */)
```

变化的核心是:**`state: TextFieldState` 自己持有 text / selection / composition,Composable 不再通过 hoist 回写文本**。IME 写入 → state 内部直接吸收 → Composable 订阅 state 做重组。这条改动让中文 IME 的组合文本不再来回穿越 Composable 边界,从根上解决了上面两个问题。

附带的好处:`TextFieldState` 提供 `edit { ... }` 块、`InputTransformation` 与 `OutputTransformation`(过滤 / 格式化)、`undoState`(撤销栈),所有过去要手写的"密码点、信用卡分隔符、最大字符数"都成了一行配置。

### 1.3 截稿时点(2026-05)的 API 状态

| 维度 | 旧 `TextField`(value/onValueChange) | 新 `BasicTextField`(state) |
| --- | --- | --- |
| 引入时间 | Compose 1.0 | Compose 1.7 GA(2024-09) |
| 包路径(Material3 上层) | `androidx.compose.material3.TextField` / `OutlinedTextField` | 同名,但 Compose 1.7+ 内部已切换到新签名 |
| 状态类型 | `String` 或 `TextFieldValue` | `TextFieldState`(`androidx.compose.foundation.text.input.TextFieldState`) |
| 中文 IME composition | 不稳定,需谨慎处理 onValueChange | 稳定,无需特殊处理 |
| 输入过滤 / 格式化 | onValueChange 里手写,容易破坏 composition | `InputTransformation` / `OutputTransformation` |
| 撤销 | 自己维护栈 | 内置 `undoState` |
| 计划演进 | Compose 1.8 起标记为 deprecated,1.9-2.0 移除 | 主线 API |

Compose 1.7 时代 Material3 的 `TextField` / `OutlinedTextField` 包装仍接收 `value: String, onValueChange: (String) -> Unit`,这条是 Material3 上层 API 的兼容路径——它内部已经走新 buffer,因此不会有旧组件的 composition 问题,但只要项目主用 Material3 的 `TextField`,**你的代码在 IME 层面是安全的**,只是仍然要 hoist 字符串。新姿势是:**屏幕级单字段交互用 Material3 TextField 仍可,复杂表单 / 需要 transformation / 需要撤销时,直接用 `BasicTextField` + `TextFieldState`。** 本篇 §3 两种都给一遍。

## 2. Android 心智

### 2.1 `TextFieldState` 的核心 API

```kotlin
val state: TextFieldState = rememberTextFieldState(
    initialText = "",
    initialSelection = TextRange.Zero,
)

state.text                                 // CharSequence,只读视图
state.selection                            // TextRange,当前光标 / 选区
state.edit { replace(0, length, "new") }   // 显式编辑(类似 StringBuilder)
state.clearText()                          // 等价 edit { delete(0, length) }
```

`TextFieldState` 是 `Stable` 的状态容器,Compose 把它的内部读写整合进 Snapshot 系统,符合第 07 篇的 state 心智。`text` 本身不是 `String` 而是 `CharSequence`(具体类型是 `TextFieldCharSequence`,带 selection 信息),业务取字符串时 `state.text.toString()` 即可。

### 2.2 `KeyboardOptions` 与 IME 行为

```kotlin
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType

KeyboardOptions(
    keyboardType = KeyboardType.Email,          // 数字键盘 / 邮箱键盘 / 电话键盘
    imeAction = ImeAction.Next,                 // 软键盘右下角动作:Next / Done / Search / Go
    capitalization = KeyboardCapitalization.None,
    autoCorrectEnabled = false,                 // Compose 1.7 字段名从 autoCorrect 改为 autoCorrectEnabled
)
```

`KeyboardType` 影响键盘布局——Email 自动加 "@" 键,Number 直接给数字盘,Phone 给 12 键拨号。**这条只是显示,真正的输入校验仍要在 `InputTransformation` 或业务层做**。`ImeAction` 影响右下角按钮的图形与回车键的语义:登录页常用 Email→Next→Password→Done。

### 2.3 `onKeyboardAction`:替代旧 `KeyboardActions`

旧 API 是 `KeyboardActions(onDone = { ... }, onNext = { ... })`,新 API 把它们合并:

```kotlin
import androidx.compose.foundation.text.input.KeyboardActionHandler

BasicTextField(
    state = state,
    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
    onKeyboardAction = KeyboardActionHandler { performDefaultAction ->
        // 拦截:可调用 performDefaultAction() 走默认(隐藏键盘),也可自己处理
        submit()
    },
)
```

### 2.4 `InputTransformation` vs `OutputTransformation`

这两个 transformation 是 TextField2 的"格式化层",分开处理"输入过滤"和"显示美化":

- **`InputTransformation`**:发生在 buffer 写入之前,**真正改变 state.text**。例如:只允许数字、最大 16 个字符、自动转大写。
- **`OutputTransformation`**:只改变屏幕显示,state.text 不变。例如:把 `4000123412341234` 显示成 `4000 1234 1234 1234`,但内部仍是连续数字。

```kotlin
val digitsOnly = InputTransformation { changes ->
    val text = changes.asCharSequence()
    if (text.any { !it.isDigit() }) {
        changes.revertAllChanges()
    } else if (text.length > 16) {
        changes.delete(16, text.length)
    }
}

val creditCardFormat = OutputTransformation {
    insertFromMap(mapOf(4 to " ", 8 to " ", 12 to " "))
}
```

旧 `onValueChange` 里写 `if (it.isDigitsOnly()) text = it` 的写法到此结束——它在中文 IME 下没法保持 composition,新 transformation 在 buffer 层处理,IME 看到的是稳定的文本视图。

### 2.5 `snapshotFlow` 把 state 转成 Flow

校验通常要防抖(debounce):用户不会想刚输一个字就报错,要等输完一段静默期再校验。把 `TextFieldState.text` 桥接成 Flow:

```kotlin
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged

LaunchedEffect(state) {
    snapshotFlow { state.text.toString() }
        .distinctUntilChanged()
        .debounce(300)
        .collect { value -> viewModel.onEmailChanged(value) }
}
```

`snapshotFlow` 把任意 Snapshot State 的读取包成 Flow,每次 state 写入触发下游一次发射。这是 Compose 和 Coroutines 协作的标准模式之一,第 22 篇会再用一次。

### 2.6 Material3 `TextField` 的两种用法

Material3 库里的 `TextField` / `OutlinedTextField` 有两套重载:

```kotlin
// A. 兼容旧式签名(仍在用)
@Composable
fun TextField(value: String, onValueChange: (String) -> Unit, /* ... */)

// B. 新签名,直接接 TextFieldState(Compose 1.7+ Material3 已提供)
@Composable
fun TextField(state: TextFieldState, /* ... */)
```

B 重载内部直接代理 `BasicTextField` 的 state 版本,享受 transformation / undo / 稳定 composition;A 重载在内部仍走新缓冲,但你必须自己 hoist String。**新项目优先用 B**——把 state 提到 ViewModel 之外或者在 Composable 用 `rememberTextFieldState` 持有。

## 3. 工程实现

下面给一个 NotedX 登录页:邮箱 + 密码 + 提交按钮,带:稳定 IME(中文)、输入过滤(邮箱去空格 / 密码限制 6-20 位)、防抖校验、IME action 跳焦点。

**第一步:UI State 与 ViewModel**

文件 `app/src/main/java/com/notedx/feature/auth/LoginState.kt`:

```kotlin
package com.notedx.feature.auth

import androidx.compose.runtime.Immutable

@Immutable
data class LoginUiState(
    val emailError: String? = null,
    val passwordError: String? = null,
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
) {
    val canSubmit: Boolean
        get() = emailError == null && passwordError == null && !isSubmitting
}
```

注意:**这里不放 text 字段**。Email / Password 文本由 `TextFieldState` 持有,UI State 只放校验结果与提交状态。这是 TextField2 心智的关键拆分——text 是 UI state 的"显示部分",验证结果才是业务 state。

文件 `app/src/main/java/com/notedx/feature/auth/LoginViewModel.kt`:

```kotlin
package com.notedx.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onEmailChanged(value: String) {
        val err = when {
            value.isEmpty() -> null
            !value.contains("@") -> "邮箱格式不正确"
            else -> null
        }
        _state.update { it.copy(emailError = err) }
    }

    fun onPasswordChanged(value: String) {
        val err = when {
            value.isEmpty() -> null
            value.length < 6 -> "密码至少 6 位"
            else -> null
        }
        _state.update { it.copy(passwordError = err) }
    }

    fun submit(email: String, password: String) {
        if (!_state.value.canSubmit) return
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching { authRepository.login(email, password) }
                .onSuccess { _state.update { it.copy(isSubmitting = false) } }
                .onFailure { e ->
                    _state.update { it.copy(isSubmitting = false, errorMessage = e.message) }
                }
        }
    }
}
```

**第二步:登录屏幕,使用 `TextFieldState` + transformation + snapshotFlow**

文件 `app/src/main/java/com/notedx/feature/auth/LoginScreen.kt`:

```kotlin
package com.notedx.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.InputTransformation
import androidx.compose.foundation.text.input.OutputTransformation
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val emailState = rememberTextFieldState()
    val passwordState = rememberTextFieldState()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current

    // 防抖校验:每次文本静默 300ms 才走校验
    LaunchedEffect(emailState) {
        snapshotFlow { emailState.text.toString() }
            .distinctUntilChanged()
            .debounce(300)
            .collect(viewModel::onEmailChanged)
    }
    LaunchedEffect(passwordState) {
        snapshotFlow { passwordState.text.toString() }
            .distinctUntilChanged()
            .debounce(300)
            .collect(viewModel::onPasswordChanged)
    }

    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                state = emailState,
                label = { Text("邮箱") },
                isError = state.emailError != null,
                supportingText = state.emailError?.let { { Text(it) } },
                inputTransformation = InputTransformation
                    .maxLength(64)
                    .byValue { _, proposed -> proposed.filter { !it.isWhitespace() } },
                lineLimits = TextFieldLineLimits.SingleLine,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                    autoCorrectEnabled = false,
                ),
                onKeyboardAction = { focusManager.moveFocus(FocusDirection.Next) },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                state = passwordState,
                label = { Text("密码") },
                isError = state.passwordError != null,
                supportingText = state.passwordError?.let { { Text(it) } },
                inputTransformation = InputTransformation.maxLength(20),
                outputTransformation = MaskAllOutput,           // 显示星号,缓冲明文
                lineLimits = TextFieldLineLimits.SingleLine,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                onKeyboardAction = {
                    viewModel.submit(emailState.text.toString(), passwordState.text.toString())
                },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    viewModel.submit(emailState.text.toString(), passwordState.text.toString())
                },
                enabled = state.canSubmit,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.isSubmitting) "登录中..." else "登录")
            }
            state.errorMessage?.let { Text(it) }
        }
    }
}

private val MaskAllOutput = OutputTransformation {
    for (i in length - 1 downTo 0) replace(i, i + 1, "*")
}
```

设计要点逐条:

- **`rememberTextFieldState()`** 直接在 Composable 持有,**不放进 ViewModel**——TextFieldState 是 UI 层的"输入缓冲",ViewModel 不应感知它的存在(否则 ViewModel 与 Compose 运行时绑定,单元测试要起 Robolectric)。提交时 `state.text.toString()` 把字符串"拷贝"出来传给业务层。
- **`inputTransformation.byValue { _, proposed -> ... }`**:过滤空格,这是邮箱框的常见需求。新 API 内部正确处理 composition,中文用户不会丢字符。
- **`outputTransformation`** 实现密码星号:state 内部仍是明文(便于提交),显示成 `****`。如果只用 `visualTransformation` 旧 API 是同效果,但新 outputTransformation 更通用(也能做信用卡分隔)。
- **`focusManager.moveFocus(FocusDirection.Next)`**:IME 按 "Next" 自动跳到下一个 focusable,免去手写 `FocusRequester`。
- **`LaunchedEffect(emailState)` + `snapshotFlow`**:把缓冲文本接到 ViewModel,顺带 debounce。Effect 的 key 是 `emailState` 本身(引用稳定),不会被 LoginScreen 重组时重启协程。

**第三步:对比——旧 TextField 的反例迁移**

老代码长这样:

```kotlin
// app/src/main/java/com/notedx/feature/auth/legacy/LegacyLoginScreen.kt
@Composable
fun LegacyLoginScreen(viewModel: LoginViewModel = hiltViewModel()) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    OutlinedTextField(
        value = email,
        onValueChange = { input ->
            // 1. 这里 trim 会让中文 IME 抓不住 composition;
            // 2. ViewModel.onEmailChanged 同步触发,每次按键两次 state 更新。
            email = input.trim()
            viewModel.onEmailChanged(email)
        },
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Email,
            imeAction = ImeAction.Next,
        ),
        keyboardActions = KeyboardActions(onNext = { /* 焦点切换 */ }),
    )
    // password 类似
}
```

迁移到 TextField2:

| 旧写法 | 新写法 |
| --- | --- |
| `var text by rememberSaveable { mutableStateOf("") }` | `val state = rememberTextFieldState()`(用 Saver 持久化) |
| `value = text, onValueChange = { text = it }` | `state = state`(新签名,无 value/onValueChange) |
| `onValueChange = { text = it.trim() }` | `inputTransformation = InputTransformation.byValue { _, p -> p.filter { ... } }` |
| `KeyboardActions(onNext = { ... })` | `onKeyboardAction = { ... }` + `KeyboardOptions(imeAction = Next)` |
| `VisualTransformation.PasswordVisualTransformation` | `outputTransformation = OutputTransformation { ... }` |
| 在 onValueChange 里 `viewModel.onChanged(it)` | `LaunchedEffect { snapshotFlow { state.text }.collect { ... } }` |

迁移成本通常是 30 分钟一个屏幕,但**收益是中文 IME 直接稳定**,这对国内项目几乎是必须的修复。

**第四步:`rememberSaveable` 的 TextFieldState Saver**

`TextFieldState` 本身实现了 Saver,可以直接 `rememberSaveable`:

```kotlin
val state = rememberSaveable(saver = TextFieldState.Saver) {
    TextFieldState(initialText = "")
}
```

或者使用 `rememberTextFieldState` 的内部 saveable 重载(`androidx.compose.foundation.text.input.rememberTextFieldState` 在 1.7+ 已经自动用 `rememberSaveable`):

```kotlin
val state = rememberTextFieldState(initialText = "")
// 上面这一行旋屏后保留 text 与 selection,不需要手写 Saver
```

读源码确认下当前 BOM 的实现行为,如果不确定,显式写 `rememberSaveable(saver = TextFieldState.Saver)` 最稳。

## 4. 调参与验收

### 4.1 校验防抖参数

| 校验类型 | debounce 推荐 | 说明 |
| --- | --- | --- |
| 邮箱格式 | 300 ms | 用户停顿才校验,避免输到一半红字闪烁 |
| 用户名查重(网络) | 500-800 ms | 包含网络往返,过短会把请求量打爆 |
| 密码强度 | 0(实时) | 强度提示是渐变,实时反馈更直观 |
| 信用卡号(本地校验) | 0(实时) | 用户期望即时看到分隔与卡组识别 |

`debounce(0)` 等于直接 collect,**不要写 `debounce(0)`,直接去掉这一行**;`distinctUntilChanged()` 一定要带,否则 Compose 重组路径上同一字符串可能被收集两次。

### 4.2 何时仍用 Material3 `TextField(value, onValueChange)`

Material3 的兼容签名内部已切到新缓冲,因此中文 IME 不会出问题。以下三种情况可以仍用兼容签名:

1. **只读 / 反映外部数据**:`TextField(value = viewModel.title.toString(), onValueChange = {})`,展示用,不参与编辑。
2. **快速原型 / Demo**:不想引 `androidx.compose.foundation.text.input.*`。
3. **小项目仅一两个输入**:迁移成本不值。

但只要进入"表单页 / 有 transformation / 有撤销需求 / 在意性能",直接上 `state` 签名。

### 4.3 旧 TextField 迁移路径表

| 模块 | 迁移优先级 | 触发条件 |
| --- | --- | --- |
| 登录 / 注册 | 高 | 包含密码框,旧版掩码逻辑容易出错 |
| 搜索框 | 中 | 单字段简单输入,旧 API 也能跑 |
| 笔记编辑器多行 | 高 | 长文本 + 中文,旧版 composition 问题最明显 |
| 评论 / 留言 | 高 | 国内场景高频中文输入 |
| 设置页(开关 + 个别字段) | 低 | 字段稀疏,旧 API 没问题 |

建议:**新写直接用新 API,旧屏在迭代时顺手迁**,不要为迁移单独立项。

### 4.4 验收清单

- [ ] 登录页用中文 IME 输入 "我是张三"(IME 候选词模式),光标不跳、字符无丢失。
- [ ] 邮箱框输入带空格(`abc @example.com`),空格被过滤,光标仍在用户预期位置。
- [ ] 密码框显示星号,但 `viewModel.submit(...)` 拿到的是明文。
- [ ] 邮箱按 IME "下一步",焦点自动跳到密码框;密码框按 "Done",触发 submit。
- [ ] 旋转屏幕(`adb shell wm size 1080x2400 && adb shell settings put system user_rotation 1`),邮箱与密码文本仍在。
- [ ] 用 Layout Inspector 看 `LoginScreen` 的 recomposition,输入时只有具体的 `OutlinedTextField` 计数 +1,Scaffold / Column 保持稳定。
- [ ] 在邮箱里疯狂打字,`viewModel.onEmailChanged` 不应被每次按键都调到,而是每段静默 300 ms 调一次。

## 5. 踩坑

### 5.1 仍在 Compose 1.6:中文 IME 光标跳

如果你的项目还卡在 BOM 1.5 / 1.6(`composeBom = "2024.06.00"` 或更早),旧 `TextField(value, onValueChange)` 的 composition bug 还在。临时缓解写法是**完全不要在 `onValueChange` 里加工**:

```kotlin
// 紧急修补:只接收,不变形
OutlinedTextField(value = text, onValueChange = { text = it })
// 校验放在 LaunchedEffect + snapshotFlow(对 String state 不适用,要用 LaunchedEffect(text))
```

但这只是缓兵之计,真正的修法是升 BOM 到 2024.09.00 或更新,然后切 `BasicTextField(state = ...)`。

### 5.2 `TextFieldState` 不应放进 ViewModel

`TextFieldState` 持有 Compose 的 SnapshotState,跨配置变化(旋屏)会被 ViewModel 保留——但**它的 Snapshot 引用与具体 Composition 绑定**,旋屏后 ViewModel 还在、新 Composition 起来时,旧 state 的 internal undo / selection 行为可能错乱。**正确分工:文本 buffer 在 Composable;业务校验状态在 ViewModel**。提交时 `state.text.toString()` 把不可变快照传过去。

### 5.3 `InputTransformation` 写循环

```kotlin
// 反例:把 transformation 自己叠加在 changes 上,产生递归回写
val bad = InputTransformation { changes ->
    if (changes.length > 10) {
        changes.replace(0, changes.length, changes.asCharSequence().take(10))
    }
}
```

正确做法是 `changes.delete(10, changes.length)`,或在 transformation 链上用 `maxLength`:

```kotlin
val good = InputTransformation.maxLength(10)
```

新 API 提供了 `maxLength` / `byValue` 等组合子,自己写 raw transformation 仅在以上都不够用时。

### 5.4 焦点跳转用 `FocusRequester` 而忘 `LocalFocusManager`

旧手法:每个字段 `val emailFocus = FocusRequester()`,然后 `Modifier.focusRequester(emailFocus)`,再在 keyboardActions 里调 `passwordFocus.requestFocus()`。两三个字段还行,五个起就要排着 manage,出错。

新姿势:`LocalFocusManager.current.moveFocus(FocusDirection.Next)`,焦点链按 UI 树顺序自动决定。只在"自定义跳转顺序"或"特定字段抢焦点"时才用 `FocusRequester`。

### 5.5 `OutputTransformation` 的 selection / composition 边界

`OutputTransformation` 改变的是显示,但**光标位置会跟着插入的字符移动**。例如信用卡 `1234 5678`,光标在原位 4 时显示位置变成 5(`1234<空格>5`)。这是 API 期望行为,但如果你写自定义 transformation,要注意:在显示串里 `insertFromMap(mapOf(4 to " "))` 是正确写法,自己 manipulate selection 通常没必要。

### 5.6 `KeyboardActions` 的旧字段名

升 BOM 后偶尔会看到这种编译警告:

```text
'KeyboardActions(onDone = ...)' is deprecated. Use onKeyboardAction parameter.
```

旧 `KeyboardActions(onDone = { ... })` 还能跑,但只对旧 `TextField(value, onValueChange)` 重载有效。**新 `BasicTextField(state = ...)` 只接 `onKeyboardAction`**——如果你混用,某些字段的回车键看似没响应,根因就是写到了旧参数上。

### 5.7 `autoCorrect` 改名为 `autoCorrectEnabled`

Compose 1.7 把 `KeyboardOptions.autoCorrect` 改名为 `autoCorrectEnabled`,旧字段标记 deprecated。这条没语义改动,但 lint 提示密集,升级时全量替换即可。

### 5.8 表单提交按钮的 enabled 计算

```kotlin
// 反例:在 Button 的 enabled 表达式直接读两个 textfield 状态
Button(
    enabled = emailState.text.isNotEmpty() && passwordState.text.length >= 6,
    onClick = { ... }
) { ... }
```

每次任一 textfield 写入都会让 Button 重组(因为 enabled 是 state 的派生)。修法两种:

- 把 enabled 用 `derivedStateOf` 包起来(第 07 篇):减少 Button 自身重组次数。
- 让 enabled 取自 ViewModel 的 `canSubmit`(本篇 §3),让 textfield 文本与按钮启用解耦——textfield 写入触发 debounced 校验,校验失败前按钮仍可点(也可以不可点,看产品定义)。

### 5.9 IME 按 Done 同时按钮 onClick:双触发

```kotlin
onKeyboardAction = { viewModel.submit(...) },
...
Button(onClick = { viewModel.submit(...) }) { Text("登录") }
```

用户既能按键盘 Done 也能点按钮,如果 submit 没做防重(ViewModel 里没 `if (isSubmitting) return`),两次请求并发触发。ViewModel 端的"幂等防重"是标配,本篇 §3 已经放了 `if (!_state.value.canSubmit) return`。

### 5.10 `TextFieldLineLimits.SingleLine` 与 `IME_FLAG_NO_EXTRACT_UI`

某些键盘(尤其国产输入法)横屏时会进 "ExtractedText" 模式(键盘占大半屏,文本被复制到键盘自己的输入区)。Compose 1.7 默认正常,但如果你写了 `TextFieldLineLimits.MultiLine(...)` 又是密码框,部分键盘会拒绝复制(因为 Password keyboardType 标了 no_extract)。**密码框写 `TextFieldLineLimits.SingleLine` + `KeyboardType.Password`,不要让单字段密码进 multiline**。

### 5.11 老依赖 `androidx.compose.foundation.text2` 早期包路径

Compose 1.6 alpha / beta 阶段,TextField2 在实验包 `androidx.compose.foundation.text2.*`。1.7 GA 已迁到 `androidx.compose.foundation.text.input.*`。看到老 sample 里 import `text2` 子包,知道是 1.6 alpha 代码,直接换正式包。

### 5.12 `BasicTextField` 没有 label / supportingText

`BasicTextField` 是 unstyled 基础组件,Material3 的 `TextField` / `OutlinedTextField`(state 重载)在它之上加 label、placeholder、supporting text、leading icon。除非你确实要做自定义视觉(例如 Material 之外的 design system),否则直接用 Material3 `OutlinedTextField(state = ...)`,不要把 `BasicTextField` 当生产组件用。

---

`TextFieldState` 与 `InputTransformation` 一起把"中文 IME 跳光标"和"表单逻辑散落 Composable 各处"两个老 bug 一起解了。把这两条心智守好,登录、注册、笔记编辑这些 80% 的输入场景就有了稳定基线。下一篇把视角从"单个输入控件"扩到"整页布局":`Row` / `Column` / `Box` 的 Modifier 顺序、`LazyColumn` 的性能边界、Android 15 强制 edge-to-edge 之后 `WindowInsets` 怎么处理、平板 / 折叠屏的 WindowSizeClass 适配。

## 手动验证

- [ ] 项目 `libs.versions.toml` 中 `compose-bom` 不低于 `2024.09.00`(对应 Compose 1.7 GA)。
- [ ] 在登录页用中文 IME 输入"密码是 123",光标始终跟随,候选词不丢失。
- [ ] 邮箱框粘贴 `  user @example.com  `,空格全部被过滤,屏幕显示 `user@example.com`。
- [ ] 密码框输入 `abc123`,屏幕显示 `******`,但点击登录后 `viewModel.submit` 收到的字符串是 `abc123`。
- [ ] 邮箱框右下角是 "Next",按下后焦点跳到密码框;密码框按 "Done" 触发 submit。
- [ ] 旋屏后邮箱与密码内容仍在(`rememberTextFieldState` 内置 saveable)。
- [ ] 用 Android Studio Logcat 过滤 `LoginViewModel`,快速打字时 `onEmailChanged` 应每 300 ms 才调一次,不是每次按键都调。
- [ ] 把项目里至少一个旧 `TextField(value, onValueChange)` 屏迁移到 `BasicTextField(state = ...)`,记录前后中文输入体验差异。

---

**下一篇:** `09-布局-Modifier与自适应.md`,把 `Row` / `Column` / `Box` / `LazyColumn` 的 Modifier 链顺序坑、`Constraints` 心智、Android 15 edge-to-edge 与折叠屏 / 平板 `WindowSizeClass` 适配一次讲透。
