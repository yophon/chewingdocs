# View / ViewGroup 与绘制三阶段

> 一句话:**Android UI 的物理底层是 View 树——Activity 持有一个 Window,Window 装一个 DecorView 根,根之下嵌套 ViewGroup 与 View,每帧经过 measure → layout → draw 三阶段生成画面**。Compose 是上层抽象,但底层仍然把整棵 Composable 树编译成一个 View(`AbstractComposeView`)挂到 View 树。

---

## 一、View / ViewGroup 树

Android UI **本质上是一棵树**:

```
DecorView (root, FrameLayout)
├── status bar(系统栏占位)
└── content view (FrameLayout)
    └── 你的 setContentView 内容
        ├── LinearLayout
        │   ├── TextView
        │   └── Button
        └── RecyclerView
            └── ... item views
```

- **View**——叶节点,负责画自己(`onDraw`)
- **ViewGroup**——内部节点,负责排列子节点(`onLayout`)+ 可以自己 draw

`Activity.setContentView(R.layout.x)` 把 XML 解析成 View 树,挂到 content view 下。

`Activity.getWindow().getDecorView()` 拿到根。

---

## 二、绘制三阶段

每一帧主线程触发绘制(由 Choreographer 调度):

```
ViewRootImpl.performTraversals()
   ├── performMeasure()    ← measure 阶段:每个 View 决定自己多大
   ├── performLayout()     ← layout 阶段:ViewGroup 摆放子 View 位置
   └── performDraw()       ← draw 阶段:每个 View 在 Canvas 上画自己
```

**三阶段必须严格顺序**——measure 完才能 layout(知道大小才知道怎么排),layout 完才能 draw(知道位置才知道画哪)。

---

## 三、Measure 阶段

每个 View 的 `onMeasure(widthMeasureSpec, heightMeasureSpec)` 决定自己尺寸:

```java
@Override
protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
    setMeasuredDimension(measureWidth, measureHeight);
}
```

**`MeasureSpec`** 是 32 位 int,高 2 位是 mode,低 30 位是大小:

| Mode | 含义 |
| --- | --- |
| `EXACTLY` | 父级指定确切大小:你必须这么大(`android:layout_width="100dp"`) |
| `AT_MOST` | 父级给出上限:你不能超过这个(`wrap_content`) |
| `UNSPECIFIED` | 想多大就多大(ScrollView 内子 View 的高度) |

**ViewGroup 必须先量子 View**:

```java
@Override
protected void onMeasure(int widthSpec, int heightSpec) {
    int childWidthSpec = getChildMeasureSpec(widthSpec, padding, child.layoutParams.width);
    int childHeightSpec = getChildMeasureSpec(heightSpec, padding, child.layoutParams.height);
    child.measure(childWidthSpec, childHeightSpec);
    int childW = child.getMeasuredWidth();
    int childH = child.getMeasuredHeight();
    // 决定自己的大小
    setMeasuredDimension(...)
}
```

**measure 阶段决定的是"我想多大"——具体放哪由 layout 阶段定**。

---

## 四、Layout 阶段

```java
@Override
protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
    // 给每个子 View 一个位置
    for (int i = 0; i < getChildCount(); i++) {
        View child = getChildAt(i);
        int cl = left + paddingLeft;
        int ct = top + paddingTop + (i * child.getMeasuredHeight());
        child.layout(cl, ct, cl + child.getMeasuredWidth(), ct + child.getMeasuredHeight());
    }
}
```

`child.layout(l, t, r, b)` 设置子 View 的位置(相对父级)。

**layout 完成后,每个 View 有:**

- `getLeft()` / `getTop()` / `getRight()` / `getBottom()`——相对父级位置
- `getX()` / `getY()`——加上 translation 的最终位置
- `getMeasuredWidth()` / `getMeasuredHeight()`

---

## 五、Draw 阶段

```java
@Override
protected void onDraw(Canvas canvas) {
    // 在 canvas 上画
    canvas.drawRect(0, 0, getWidth(), getHeight(), paint);
    canvas.drawText("Hello", 50, 50, paint);
}
```

`Canvas` 提供绘制 API——drawRect / drawCircle / drawPath / drawText / drawBitmap。

**Draw 的顺序**:

1. 绘制 background(`Drawable.draw(canvas)`)
2. 调 `onDraw(canvas)`——你的内容
3. 调 `dispatchDraw(canvas)`——ViewGroup 把子 View 画上去
4. 绘制 foreground / scrollbars / decorations

---

## 六、Canvas 与硬件加速

**硬件加速**(API 14+ 默认开启)——Canvas 命令不直接画到内存 bitmap,而是生成"display list"(GPU 指令),交给 GPU 渲染。这是为什么 Android 流畅度比早期版本好得多。

```kotlin
// 关闭硬件加速(某些视觉效果需要,如 ColorMatrix 大于 5x5)
view.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
```

**软件 layer**:用 CPU 渲染到 Bitmap。极少需要。

---

## 七、`invalidate()` / `requestLayout()`

```kotlin
view.invalidate()         // 标记 View 需要重新 draw(不重新 measure/layout)
view.requestLayout()      // 标记需要重新 measure + layout + draw
```

| 操作 | 触发什么 | 何时用 |
| --- | --- | --- |
| `invalidate()` | 仅 draw 阶段 | 颜色 / 文字内容变了,大小没变 |
| `requestLayout()` | measure → layout → draw 全阶段 | 大小变了(`setText` 让 TextView 变宽) |
| `postInvalidate()` | 同 invalidate,但可从子线程调 | 子线程触发重绘 |

**`requestLayout` 是昂贵操作**——它会触发整棵树重新 measure。一个深层 View 调 `requestLayout`,可能让 100 个 View 全部 measure。

---

## 八、`ViewRootImpl`:连接 View 与 WMS

```
Activity.setContentView 后:
   Activity.getWindow().getDecorView()  ← DecorView 是 View 树根
       ↓
   WMS.addView(DecorView) 时创建 ViewRootImpl
       ↓
   ViewRootImpl 持有 DecorView,负责调度三阶段
       ↓
   Choreographer 每帧调 ViewRootImpl.performTraversals()
       ↓
   performTraversals → measure → layout → draw
```

**`ViewRootImpl` 不是 View**——它是连接 View 树与 WMS / SurfaceFlinger 的桥。一个 Window 一个 ViewRootImpl。

**重要影响**:**`requestLayout` 实际上是把请求传到 ViewRootImpl,ViewRootImpl 标记 dirty,等下次 Choreographer 帧时执行**——不是立刻执行。所以连续多次 requestLayout 在同一帧合并成一次。

---

## 九、`SurfaceView` / `TextureView` / `GLSurfaceView`

普通 View 在主线程画。但有些场景(视频播放、相机预览、游戏)需要**独立线程**画:

| 类 | 特点 |
| --- | --- |
| `SurfaceView` | 独立 Surface,直接给 SurfaceFlinger 合成,不参与 View 树绘制流程。性能最好。 |
| `TextureView`(API 14+) | 也是独立画,但 Surface 是 View 树的一部分,可以 `setRotation` / animator。比 SurfaceView 灵活,但性能略差。 |
| `GLSurfaceView` | SurfaceView + OpenGL 上下文。游戏 / 复杂渲染。 |

**CameraX Preview 内部是 SurfaceView/TextureView**(现代版 18 篇)。

---

## 十、View 触摸事件分发

```
ACTION_DOWN 触发
   ↓
DecorView.dispatchTouchEvent
   ↓
PhoneWindow.superDispatchTouchEvent
   ↓
ViewGroup.dispatchTouchEvent
   ├── onInterceptTouchEvent  ← 父级"我要拦截吗"
   ├── 子 View.dispatchTouchEvent
   │   └── onTouchEvent  ← 实际处理
   └── 没人处理 → 自己 onTouchEvent
```

**关键三件事**:

1. **`dispatchTouchEvent`**——事件分发到这个 View / ViewGroup
2. **`onInterceptTouchEvent`**(只 ViewGroup 有)——拦截不传给子
3. **`onTouchEvent`**——实际处理

**返回 true / false**:
- `dispatchTouchEvent` 返回 true = 事件处理完成,不传上(只在框架自己用)
- `onInterceptTouchEvent` 返回 true = 拦截这个事件,自己 onTouchEvent 处理
- `onTouchEvent` 返回 true = 我处理了这个事件,后续 MOVE / UP 都给我

**经典坑**:`onTouchEvent` 在 DOWN 时返回 false,后续 MOVE / UP 不再给你——因为"你 DOWN 都不要,后续不可能要"。

---

## 十一、滑动冲突

```
ScrollView
└── RecyclerView 横向
    └── TextView
```

用户横划——RecyclerView 想响应,ScrollView 也想(可能拦走)。这就是滑动冲突。

**解法**:`requestDisallowInterceptTouchEvent(true)`——子告诉父"我要处理,你别拦":

```kotlin
override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    if (ev.action == MotionEvent.ACTION_DOWN) {
        parent.requestDisallowInterceptTouchEvent(true)
    }
    return false
}
```

或者在父 ViewGroup 的 onInterceptTouchEvent 里根据滑动角度判断是横滑(让子)还是竖滑(自己拦)。

---

## 十二、View 的几个生命周期回调

```kotlin
class MyView : View {
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // 加入 Window,开始接收事件
        startListening()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // 离开 Window,清理
        stopListening()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        // 大小变了
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        // 可见性变了
    }
}
```

**`onAttachedToWindow` / `onDetachedFromWindow`** 是 View 注册 / 反注册资源的标准位置——加入 Window 时启动动画,离开时停止。

---

## 十三、`include` / `merge` / `ViewStub`:XML 性能优化

```xml
<!-- include:复用一段 XML -->
<include layout="@layout/common_toolbar" />

<!-- merge:被 include 时不增加层级 -->
<merge xmlns:android="...">
    <TextView ... />
    <Button ... />
</merge>

<!-- ViewStub:按需 inflate(初始不创建) -->
<ViewStub
    android:id="@+id/stub_advanced"
    android:layout="@layout/advanced_settings"
    android:inflatedId="@+id/advanced" />

// 代码里
findViewById<ViewStub>(R.id.stub_advanced).inflate()
```

**XML 嵌套深度是性能成本**——measure 阶段递归遍历整棵树,层级深 + 节点多就慢。merge / ViewStub 是减少层级的工具。

Compose 不存在这个问题——重组只跑变化部分。

---

## 十四、`RecyclerView`:View 复用的标准

`RecyclerView` 是 Android 列表的现代标准(替代旧的 ListView / GridView):

```kotlin
class NoteAdapter : RecyclerView.Adapter<NoteAdapter.VH>() {
    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.title)
    }
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.note_row, parent, false)
        return VH(view)
    }
    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.title.text = notes[position].title
    }
    override fun getItemCount() = notes.size
}
```

**核心机制**:**ViewHolder 复用**——滚出屏幕的 row 被回收到对象池,新滚入的 row 复用旧实例,只更新内容(`onBindViewHolder`)。一个 1000 项的列表实际只创建几十个 ViewHolder。

**LayoutManager**:`LinearLayoutManager` / `GridLayoutManager` / `StaggeredGridLayoutManager`——决定子 View 怎么排。

`RecyclerView` 是性能优化最复杂的 Android UI 组件——Compose `LazyColumn` 内部就是它的现代化封装。

---

## 十五、`Compose` 与 View 树的桥

```kotlin
// 在 XML 里嵌 Compose
class MainActivity : ComponentActivity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setContentView(R.layout.activity_main)
        findViewById<ComposeView>(R.id.composeView).setContent {
            // Compose 代码
        }
    }
}
```

```kotlin
// 在 Compose 里嵌 View
@Composable
fun MapPreview() {
    AndroidView(
        factory = { ctx -> MapView(ctx).apply { /* init */ } },
        update = { view -> /* 状态变化时调 */ }
    )
}
```

**`ComposeView`** 是 View 树里的一个节点,内部包含一棵 Compose 树。
**`AndroidView`** 是 Compose 树里的一个节点,内部包含一个 View。

互嵌但**两套体系不共享生命周期**——必须用 `setViewCompositionStrategy` 设置策略让 Compose 与 View 生命周期对齐(现代版 5 篇)。

---

## 十六、View 与 Surface

```
View 树
   ↓ (硬件加速)
display list
   ↓
GPU 渲染到 Surface
   ↓
Surface 提交给 SurfaceFlinger
   ↓
SurfaceFlinger 合成所有 Surface
   ↓
HW Composer / GPU 输出到屏幕
```

**每个 Window 有一个 Surface**——这个 Surface 内部包含整棵 View 树渲染的结果。**SurfaceView 例外**——它有独立 Surface。

`Surface` 本质是一段 GPU/CPU 内存缓冲,App 向它写帧,SurfaceFlinger 读它合成。这套机制保证了 App 渲染与系统合成解耦。

---

## 十七、调试 View

```bash
# 看当前 Activity 的 View 树
adb shell dumpsys activity top

# 用 Android Studio 的 Layout Inspector(图形界面)
# Tools → Layout Inspector → 选目标进程
```

**Layout Inspector** 显示完整 View 树,每个 View 的属性、measure 时间、draw 时间。

**Show Layout Bounds**:`adb shell setprop debug.layout true` + 重启 App,屏幕上显示每个 View 的边界(红色),帮你找过深嵌套。

---

## 十八、踩坑

**坑 1:onDraw 里 `new Paint()`**。每帧创建新对象,GC 压力大。**Paint / Rect 提前 new 出来 reuse**。

**坑 2:onMeasure 不调 `setMeasuredDimension`**。父级拿不到子尺寸,布局错乱。

**坑 3:onLayout 里 `requestLayout`**。无限递归 layout → 卡死。layout 阶段只调子的 layout,不能再请求自己。

**坑 4:onDraw 里改 View 状态**。`onDraw` 应当纯——只画,不改 View 字段、不调 setVisibility / setText。这会触发新一轮 invalidate,导致每帧都重绘。

**坑 5:`setVisibility(GONE)` vs `INVISIBLE` 不分**。`GONE` 不占空间(影响 layout),`INVISIBLE` 占空间只是不显示。

**坑 6:layout XML 嵌套过深**。10 层以上 measure 慢。**3-5 层是健康范围**,用 ConstraintLayout 减少嵌套。

**坑 7:onDraw 调 `getMeasuredWidth` 而不是 `getWidth`**。前者是 measure 阶段算出来的"想要的"大小,后者是 layout 阶段确定的"实际"大小。**onDraw 永远用 getWidth/getHeight**。

**坑 8:`postInvalidate` 与 `invalidate` 混用**。从主线程调 `postInvalidate` 是浪费(多一次 post)。从子线程必须 `postInvalidate`(`invalidate` 在子线程会崩)。

**坑 9:不释放 Bitmap → Canvas 不可用**。`Bitmap.recycle()` 后再被 Canvas 用,抛 "trying to use a recycled bitmap" 崩溃。

**坑 10:在 onAttachedToWindow 之前 `findViewById`**。早期访问可能 null。XML inflate 必须完成才能 findViewById。

---

下一篇 `15-XML 布局 findViewById 与 ViewBinding.md`,讲 View 系统的"配置方式":XML 布局怎么写、`findViewById` 为什么慢、`ViewBinding` 怎么取代它、`DataBinding` 是更激进的方案(争议大,新项目通常不用)。
