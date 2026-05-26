# 自定义 View:onMeasure / onLayout / onDraw

> 一句话:**自定义 View 是 Android UI 的"最底层创作能力"——继承 `View` / `ViewGroup`,重写 `onMeasure` 协商尺寸,`onLayout` 摆位置,`onDraw` 画内容,自己处理触摸事件**。Compose 时代多数场景已不需要,但少数极致定制 / 高性能渲染仍要懂。

---

## 一、什么时候真该自定义 View

**默认答案:不要自定义**。Compose / 标准 View / 三方库覆盖 95% 需求。

只有以下场景才有必要:

1. **自己画图**——表盘、波形、自定义 Chart、签名手写板
2. **极致性能**——一帧画几千个元素,Compose 也跟不上
3. **复杂触摸交互**——多指 / 手势组合,标准组件不够灵活
4. **第三方组件不可用**——遗留代码或离线环境

**Compose 替代**:`Canvas { drawXxx }` Composable 提供同样的画图能力,只是不能脱离 Compose 生态。

本篇讲传统 View 自定义,**主要面向读老代码和维护遗留组件**。

---

## 二、最小自定义 View

```kotlin
class CircleView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLUE
        style = Paint.Style.FILL
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val radius = width.coerceAtMost(height) / 2f
        canvas.drawCircle(width / 2f, height / 2f, radius, paint)
    }
}
```

XML:
```xml
<com.notedx.CircleView
    android:layout_width="100dp"
    android:layout_height="100dp" />
```

**三个构造函数变体**:

- `CircleView(context)` ——纯代码 new
- `CircleView(context, attrs)`——XML inflate
- `CircleView(context, attrs, defStyleAttr)`——XML + 主题默认 style

`@JvmOverloads` 一行让 Kotlin 编译器生成三个 Java 兼容构造函数。

---

## 三、`onMeasure`:尺寸协商

```kotlin
override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = resolveSize(desiredWidth(), widthMeasureSpec)
    val height = resolveSize(desiredHeight(), heightMeasureSpec)
    setMeasuredDimension(width, height)
}

private fun desiredWidth(): Int = 100   // 想要的宽,基于内容计算
private fun desiredHeight(): Int = 100
```

`MeasureSpec` 三种模式:

| Mode | 含义 | 该如何响应 |
| --- | --- | --- |
| `EXACTLY` | 父级给定确切大小(`100dp` 或 `match_parent`) | 必须这么大,不能更小或更大 |
| `AT_MOST` | 父级给上限(`wrap_content`) | 在上限内,按内容决定 |
| `UNSPECIFIED` | 想多大就多大(ScrollView 内的高度) | 按自己理想大小 |

`resolveSize(desired, spec)` 是 framework 提供的工具——它按上面的规则决定最终尺寸,你直接用即可。

**为什么 `EXACTLY` 要听父级**:LinearLayout 给子 View 分配剩余空间,要求子精确填满。

---

## 四、`onSizeChanged`:大小确定时

```kotlin
override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    // 大小变了,重新计算 Path / Bitmap / ...
    rebuildPath(w, h)
}
```

`onSizeChanged` 在 layout 阶段大小确定后调用——**适合做"依赖大小的预计算"**(把 Path 算好缓存,避免每次 onDraw 算)。

---

## 五、`onDraw`:用 Canvas + Paint 画

```kotlin
override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    
    // 画背景圆
    canvas.drawCircle(cx, cy, radius, bgPaint)
    
    // 画文字
    canvas.drawText("Hello", cx - textWidth / 2, cy + textHeight / 4, textPaint)
    
    // 画路径
    canvas.drawPath(arrowPath, arrowPaint)
    
    // 画位图
    canvas.drawBitmap(myBitmap, null, dstRect, null)
    
    // 旋转 / 缩放 / 平移
    canvas.save()
    canvas.translate(50f, 50f)
    canvas.rotate(45f)
    canvas.drawRect(...)
    canvas.restore()
}
```

**Paint 的关键属性**:

- `color`——颜色
- `style`——`FILL` / `STROKE` / `FILL_AND_STROKE`
- `strokeWidth`——线宽(stroke 模式)
- `textSize`——文字大小
- `isAntiAlias = true`——抗锯齿(几乎永远开)
- `pathEffect`——虚线 / 圆角等

**铁律**:**`onDraw` 里绝对不要 new 对象**——Paint / Path / Rect 提前 new,字段保存,onDraw 里 reuse。每帧 new 对象 GC 压力大,直接丢帧。

---

## 六、`Canvas` 的"save / restore" 栈

```kotlin
canvas.save()              // 把当前 matrix / clip 保存
canvas.rotate(45f, cx, cy) // 旋转
canvas.drawRect(...)       // 在旋转后的坐标系画
canvas.restore()           // 恢复
canvas.drawText(...)       // 在原坐标系画
```

`save` / `restore` 是 Canvas 的状态栈——常用于"我要画一段旋转 / 缩放的内容,完了恢复"。

**`save` 和 `restore` 必须配对**——漏掉一个会让后续绘制坐标错乱。

---

## 七、自定义 ViewGroup

```kotlin
class MyContainer @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : ViewGroup(context, attrs) {

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        // 先量子 View
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            measureChild(child, widthSpec, heightSpec)
        }
        // 根据子 View 决定自己大小
        setMeasuredDimension(...)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        // 决定每个子 View 的位置
        var top = 0
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            child.layout(0, top, child.measuredWidth, top + child.measuredHeight)
            top += child.measuredHeight
        }
    }
}
```

**自定义 ViewGroup 的两件事**:

1. `onMeasure` 先量所有子,然后定自己
2. `onLayout` 给每个子设定位置

**复杂自定义 ViewGroup 极少需要**——99% 用 ConstraintLayout / 现有 Layout 解决。Flexbox 类布局 Google 早提供了 `androidx.flexbox`。

---

## 八、自定义触摸事件

```kotlin
class DrawingView : View(...) {
    private val path = Path()
    
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                path.moveTo(event.x, event.y)
                return true        // 必须 true,否则后续 MOVE / UP 收不到
            }
            MotionEvent.ACTION_MOVE -> {
                path.lineTo(event.x, event.y)
                invalidate()       // 触发重绘
            }
            MotionEvent.ACTION_UP -> {
                // 完成一次绘制
            }
        }
        return true
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawPath(path, paint)
    }
}
```

**MotionEvent.action 的关键值**:

| Action | 含义 |
| --- | --- |
| `ACTION_DOWN` | 手指按下 |
| `ACTION_MOVE` | 手指移动 |
| `ACTION_UP` | 手指抬起 |
| `ACTION_CANCEL` | 事件被取消(父 View 拦截) |
| `ACTION_POINTER_DOWN` | 多指:第 2/3 根手指按下 |
| `ACTION_POINTER_UP` | 多指抬起 |

**返回值规则**:`onTouchEvent` 在 `ACTION_DOWN` 返回 true 表示"我要这串事件"。返回 false 表示"我不要",后续 MOVE/UP 不发给你。

---

## 九、`GestureDetector` 与 `ScaleGestureDetector`

简化触摸的高级 API:

```kotlin
private val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
    override fun onSingleTapUp(e: MotionEvent): Boolean {
        // 单击
        return true
    }
    override fun onDoubleTap(e: MotionEvent): Boolean {
        // 双击
        return true
    }
    override fun onLongPress(e: MotionEvent) {
        // 长按
    }
    override fun onFling(e1: MotionEvent?, e2: MotionEvent, vX: Float, vY: Float): Boolean {
        // 快速划动(惯性)
        return true
    }
})

override fun onTouchEvent(event: MotionEvent): Boolean {
    return gestureDetector.onTouchEvent(event)
}
```

`ScaleGestureDetector` 类似——检测双指缩放手势。

**手势识别用 GestureDetector,不要自己写"单击 = down + up < 200ms" 这种判断**——边界条件多,不如标准 API 稳定。

---

## 十、`requestLayout` / `invalidate` 区别再强调

```kotlin
fun setColor(c: Int) {
    color = c
    invalidate()         // 颜色改了,只需 redraw
}

fun setSize(s: Float) {
    size = s
    requestLayout()      // 大小变了,需要重新 measure + layout + draw
}
```

**普通自定义 View 改 prop**:
- 不影响大小 → `invalidate`
- 影响大小 → `requestLayout`

`requestLayout` 触发整棵树重新 measure,慎用——一帧多次 requestLayout 会让父级反复算尺寸。

---

## 十一、`save state`:跨配置变化保留状态

```kotlin
override fun onSaveInstanceState(): Parcelable {
    val parent = super.onSaveInstanceState()
    return SavedState(parent).apply {
        progress = this@MyView.progress
    }
}

override fun onRestoreInstanceState(state: Parcelable?) {
    if (state is SavedState) {
        super.onRestoreInstanceState(state.superState)
        progress = state.progress
    } else {
        super.onRestoreInstanceState(state)
    }
}

@Parcelize
class SavedState(val superState: Parcelable?, var progress: Float = 0f) : Parcelable
```

**View 必须有 `android:id`**——没 ID 系统不保存它的状态。

**`onSaveInstanceState` / `onRestoreInstanceState` 处理屏幕旋转**——View 的进度条 / 滚动位置 / 自定义状态跨重建保留。

---

## 十二、`Drawable`:更轻量的"画图"

```xml
<!-- res/drawable/badge.xml -->
<shape android:shape="oval">
    <solid android:color="#FF0000" />
    <size android:width="8dp" android:height="8dp" />
</shape>
```

```kotlin
view.background = ContextCompat.getDrawable(context, R.drawable.badge)
```

**简单装饰用 Drawable,复杂动态画面用自定义 View**。Drawable 不需要 measure / draw 全套,作为 View 的 background 直接显示。

`VectorDrawable`(矢量)+ `AnimatedVectorDrawable`(矢量动画)是图标 / 加载动画的标准格式——一份 XML 任意大小渲染,APK 不增大。

---

## 十三、`Layer` 与硬件加速

```kotlin
view.setLayerType(View.LAYER_TYPE_HARDWARE, null)   // 硬件 layer
view.setLayerType(View.LAYER_TYPE_SOFTWARE, null)    // 软件 layer
view.setLayerType(View.LAYER_TYPE_NONE, null)        // 默认
```

**Hardware layer**:把 View 渲染缓存到 GPU 纹理,适合"经常做 alpha / translation / rotation 动画"的 View——动画期间不重绘内容,只变换纹理。

**Software layer**:用 CPU 渲染到 Bitmap——少数硬件加速不支持的效果(如复杂 ColorMatrix)需要。

**默认 LAYER_TYPE_NONE 即可**,只在 profile 显示某 View 动画卡顿时考虑 HARDWARE。

---

## 十四、自定义 View 的可访问性

```kotlin
override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.contentDescription = "进度 $progress%"
    info.className = ProgressBar::class.java.name    // 让 TalkBack 知道这是进度条
}
```

**自定义 View 必须显式给可访问性信息**——TalkBack 否则只能念"未标记"。

`AccessibilityDelegate` 是更完整的方式,几乎从不用——给整个 View 加 description 已经覆盖 99% 场景。

---

## 十五、Compose `Canvas` 替代

```kotlin
@Composable
fun CircleProgress(progress: Float, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.size(48.dp)) {
        drawCircle(
            color = Color.Blue,
            radius = size.minDimension / 2 * progress,
            center = center,
        )
    }
}
```

Compose `Canvas` Composable 内的 `DrawScope` 提供与 Android Canvas 类似的 draw API。**新自定义画图组件应当用 Compose Canvas**,不再继承 View。

---

## 十六、调试

```bash
# 看 View 的 measure / layout / draw 性能
# Tools → Profiler → CPU → Frame timing(每帧分解到各阶段)

# 看 overdraw(重绘冗余)
# 系统设置 → 开发者选项 → 调试 GPU 过度绘制 / Show overdraw
```

**Overdraw**:一个像素被画多次——背景 + foreground + 文字,可能 2-3 倍。Android 标记颜色让你看出来。绿/蓝是健康,红/紫是过度——优化方法:去掉冗余背景、用 `<style>` 设 windowBackground 为 null 等。

---

## 十七、踩坑

**坑 1:onDraw 里 new 对象**。每帧 GC 压力。Paint / Path / Rect 提前 new,reuse。

**坑 2:setMeasuredDimension 漏调**。onMeasure 不调这个会 IllegalStateException。

**坑 3:onMeasure 不处理 EXACTLY**。父级要求 100dp,你按理想大小返回 200——超出父级,布局错乱。永远尊重 EXACTLY。

**坑 4:`canvas.save` 没配 `restore`**。Canvas 状态栈溢出/数据错乱,后续绘制全乱。

**坑 5:`onTouchEvent` 在 DOWN 返回 false**。MOVE / UP 不再收到,触摸功能挂掉一半。

**坑 6:自定义 ViewGroup 不调 `measureChild`**。子 View 的 `measuredWidth/Height` 为 0,layout 后看不到。

**坑 7:requestLayout 在 layout 阶段调**。无限递归 layout,卡死。**只在外部事件(setter / 触摸)触发,不在 onMeasure/onLayout 内部触发**。

**坑 8:invalidate 频繁(每个 ACTION_MOVE)**。50Hz 触摸事件 → 50 次 invalidate → Choreographer 还是 60Hz,但所有 invalidate 都合并成一次重绘。这没问题。但**不要在 invalidate 里再做计算**——计算在 setter 时做,invalidate 只触发 draw。

**坑 9:自定义 View 没保存状态**。屏幕旋转,View 进度条回到 0。`onSaveInstanceState` + 给 view 一个 id 才能保存。

**坑 10:用 `Canvas.drawBitmap` 大图缩放**。每帧缩放大 Bitmap → CPU 飙。提前 `Bitmap.createScaledBitmap` 缓存好缩小版,onDraw 直接画缩小版。

---

下一篇 `17-资源系统:res values-* 限定符与主题继承.md`,讲 Android 资源系统的"魔法"——`values/` / `values-zh/` / `values-night/` / `drawable-xxhdpi/` 怎么自动选,resources.arsc 怎么存,App 的语言 / 深色模式 / 屏幕密度切换怎么自动适配。
