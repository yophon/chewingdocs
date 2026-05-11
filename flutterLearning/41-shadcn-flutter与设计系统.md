# Flutter 设计系统:shadcn-flutter 等

回顾 17:Theme + ColorScheme 给了"颜色 / 字体 / 间距"的基础。但要真正做出统一的产品视觉,还需要**设计系统(Design System)**——一套从 token 到组件的完整规范。

---

## 一、什么是设计系统

```
Design Tokens   颜色 / 字号 / 圆角 / 间距 / 阴影 / 时长 ...
        ↓
Primitives      Box / Stack / Row / Text 之类基础
        ↓
Components      Button / Input / Card / Dialog
        ↓
Patterns        Form / Toolbar / Empty / Skeleton
        ↓
Templates       页面模板
        ↓
Pages           真实页面
```

Material / Cupertino 是**官方设计系统**;但产品要差异化,常常需要自己的或基于第三方:
- **shadcn-flutter** — shadcn/ui 的 Flutter 移植
- **forui** — 受 shadcn 启发,极简设计
- **moon_design** — Moon 设计语言(Lemonade 出品)
- **fluent_ui** — Microsoft Fluent
- **macos_ui** — macOS 风格
- **yaru** — Ubuntu Yaru

---

## 二、Material 还能不能用

Material 3 已经很优秀:
- 动态色彩(从用户壁纸取色)
- 一套完整组件
- 11 个 surface tint 层级

**问题在于"长得像 Google 产品"**。如果你的产品需要差异化(比如要"性冷淡"风、要"游戏"风),你要么改造 Material,要么换设计系统。

---

## 三、shadcn-flutter

[shadcn/ui](https://ui.shadcn.com) 是 React/Tailwind 圈最火的组件库。**核心理念**:
- 不是 npm 包,而是"复制代码到你项目里"
- Tailwind + Radix Primitives 组合
- 你完全拥有 / 修改这些组件

Flutter 移植:**shadcn_flutter** / **shadcn_ui**(两个不同实现都叫这名)。

```yaml
dependencies:
  shadcn_flutter: ^0.0.30
```

```dart
import 'package:shadcn_flutter/shadcn_flutter.dart';

void main() {
  runApp(ShadcnApp(
    title: 'My App',
    theme: ThemeData(
      colorScheme: ColorSchemes.darkZinc(),
      radius: 0.5,
    ),
    home: HomePage(),
  ));
}

// 用法接近 Material
PrimaryButton(
  child: Text('点击'),
  onPressed: () {},
)
SecondaryButton(child: Text('取消'))
```

特征:
- ColorScheme 内置 stone/zinc/slate/neutral/red/blue 等命名颜色
- 圆角 / 阴影 / 间距全部 token 化
- 组件薄,易改
- 自带 sheet / dialog / popover / command / tabs / form
- 支持暗色

---

## 四、自建 token 系统

不用第三方时自己抽 token。回顾 17,可以扩展 `ThemeExtension`:

```dart
@immutable
class AppTokens extends ThemeExtension<AppTokens> {
  const AppTokens({
    required this.spacing,
    required this.radius,
    required this.elevation,
    required this.duration,
  });

  final AppSpacing spacing;
  final AppRadius radius;
  final AppElevation elevation;
  final AppDuration duration;

  @override
  AppTokens copyWith({...}) => ...;
  @override
  AppTokens lerp(other, t) => ...;
}

class AppSpacing {
  const AppSpacing();
  final double xxs = 2, xs = 4, sm = 8, md = 12, lg = 16, xl = 24, xxl = 32;
}
```

注册:

```dart
ThemeData(
  extensions: [
    AppTokens(
      spacing: AppSpacing(),
      radius: AppRadius(),
      elevation: AppElevation(),
      duration: AppDuration(),
    ),
  ],
)

// 用
final tokens = Theme.of(context).extension<AppTokens>()!;
Padding(padding: EdgeInsets.all(tokens.spacing.md), ...);
```

回顾 17 这个写法。**关键是把"魔法数字"消灭**:
- `EdgeInsets.all(16)` ❌
- `EdgeInsets.all(tokens.spacing.lg)` ✅

---

## 五、Theme 工具:Figma → Token

设计师在 Figma 用 Token Studio(或 Figma Variables),导出 JSON,客户端工程化生成 Dart:

```
tokens.json
{
  "color": {
    "primary": {"value": "#3B82F6"},
    "danger":  {"value": "#EF4444"}
  },
  "spacing": {
    "md": {"value": "12px"}
  }
}
```

写脚本生成:

```dart
// 自动生成
class GeneratedTokens {
  static const colorPrimary = Color(0xFF3B82F6);
  static const colorDanger  = Color(0xFFEF4444);
  static const spacingMd    = 12.0;
}
```

变更只动 Figma → CI 跑一次脚本 → 客户端 PR → 发版。**设计 / 开发同步成本骤降**。

---

## 六、组件抽象示例:AppButton

```dart
enum AppButtonVariant { primary, secondary, ghost, destructive, outline }
enum AppButtonSize    { sm, md, lg }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.child,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.md,
    this.icon,
    this.loading = false,
  });

  final Widget child;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final Widget? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final tokens = Theme.of(context).extension<AppTokens>()!;
    final scheme = Theme.of(context).colorScheme;

    final (bg, fg) = switch (variant) {
      AppButtonVariant.primary     => (scheme.primary, scheme.onPrimary),
      AppButtonVariant.secondary   => (scheme.secondary, scheme.onSecondary),
      AppButtonVariant.ghost       => (Colors.transparent, scheme.primary),
      AppButtonVariant.destructive => (scheme.error, scheme.onError),
      AppButtonVariant.outline     => (Colors.transparent, scheme.primary),
    };

    final pad = switch (size) {
      AppButtonSize.sm => EdgeInsets.symmetric(horizontal: tokens.spacing.md, vertical: tokens.spacing.xs),
      AppButtonSize.md => EdgeInsets.symmetric(horizontal: tokens.spacing.lg, vertical: tokens.spacing.sm),
      AppButtonSize.lg => EdgeInsets.symmetric(horizontal: tokens.spacing.xl, vertical: tokens.spacing.md),
    };

    return Material(
      color: bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(tokens.radius.md),
        side: variant == AppButtonVariant.outline
            ? BorderSide(color: scheme.primary)
            : BorderSide.none,
      ),
      child: InkWell(
        onTap: loading ? null : onPressed,
        borderRadius: BorderRadius.circular(tokens.radius.md),
        child: Padding(
          padding: pad,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                SizedBox(width: 14, height: 14, child: CircularProgressIndicator(color: fg, strokeWidth: 2))
              else if (icon != null) ...[
                IconTheme(data: IconThemeData(color: fg, size: 16), child: icon!),
                SizedBox(width: tokens.spacing.xs),
              ],
              DefaultTextStyle(style: TextStyle(color: fg), child: child),
            ],
          ),
        ),
      ),
    );
  }
}
```

整个产品所有按钮**只用 AppButton**,样式不一致的问题从源头干掉。

---

## 七、shadcn-flutter 风格示例(自己实现)

无依赖,纯 Flutter。

```dart
class ShadCard extends StatelessWidget {
  const ShadCard({super.key, required this.child, this.title, this.description});
  final Widget child;
  final String? title;
  final String? description;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) Text(title!, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          if (description != null) ...[
            SizedBox(height: 4),
            Text(description!, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 14)),
          ],
          if (title != null || description != null) SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}
```

shadcn 的精髓**不是包,而是"统一的 token + 极简的组件"**。

---

## 八、设计系统的关键原则

### 1. token 是源头

颜色 / 间距 / 圆角全部 token,**业务代码禁止写裸值**。配 lint 规则强制:

```yaml
# analysis_options.yaml
custom_lint:
  rules:
    - avoid_hardcoded_colors      # 自定义 lint
    - avoid_hardcoded_dimensions
```

### 2. 组件覆盖率高

每个常用 UI 元素都有"已有组件"。新人不应该自己写 `RaisedButton`,而是查"AppButton"。

### 3. 文档化

用 `widgetbook` / `dashbook` / `storybook_flutter` 做组件画廊:

```yaml
dev_dependencies:
  widgetbook: ^3.7.1
  widgetbook_annotation: ^3.2.0
  widgetbook_generator: ^3.7.1
```

```dart
// widgetbook 入口
@App()
class WidgetbookApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Widgetbook.material(
      directories: [
        WidgetbookFolder(name: 'Buttons', children: [
          WidgetbookComponent(name: 'AppButton', useCases: [
            WidgetbookUseCase(name: 'Primary', builder: (_) => AppButton(child: Text('OK'))),
            WidgetbookUseCase(name: 'Loading', builder: (_) => AppButton(child: Text('OK'), loading: true)),
            WidgetbookUseCase(name: 'Destructive', builder: (_) => AppButton(child: Text('删除'), variant: AppButtonVariant.destructive)),
          ]),
        ]),
      ],
      addons: [
        DeviceFrameAddon(devices: [Devices.ios.iPhone13, Devices.android.pixel6]),
        ThemeAddon(themes: [WidgetbookTheme(name: 'Light', data: lightTheme), WidgetbookTheme(name: 'Dark', data: darkTheme)]),
        TextScaleAddon(scales: [1.0, 1.5, 2.0]),
      ],
    );
  }
}
```

设计师 / 产品打开 widgetbook 直接看所有组件、所有状态、不同设备 / 主题。

### 4. 主题切换的成本必须低

切暗色 / 切产品换肤,理论上**只改 ColorScheme + tokens**,组件不动。如果切个肤要改 100 个文件,说明设计系统没做好。

### 5. 组件状态完备

每个组件考虑:
- 默认 / hover / pressed / disabled / loading / focused
- 暗色模式
- RTL 模式
- 不同 textScaleFactor
- 异常输入 / 长文本截断

---

## 九、表单设计系统

```dart
class AppFormField extends StatelessWidget {
  const AppFormField({
    super.key,
    required this.label,
    this.hint,
    this.error,
    required this.child,
  });

  final String label;
  final String? hint, error;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = Theme.of(context).extension<AppTokens>()!;
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontWeight: FontWeight.w500)),
        SizedBox(height: tokens.spacing.xs),
        child,
        if (error != null) ...[
          SizedBox(height: tokens.spacing.xxs),
          Text(error!, style: TextStyle(color: scheme.error, fontSize: 12)),
        ] else if (hint != null) ...[
          SizedBox(height: tokens.spacing.xxs),
          Text(hint!, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
        ],
      ],
    );
  }
}

// 用
AppFormField(
  label: '邮箱',
  error: state.emailError,
  child: TextFormField(controller: _email),
)
```

整个 App 的输入框结构一致,改样式集中改。

---

## 十、第三方设计系统对比

| 库 | 风格 | 维护度 | 适合 |
| --- | --- | --- | --- |
| **shadcn_flutter** | 极简 / 现代 | 活跃 | SaaS / 后台 |
| **forui** | 极简 | 活跃 | 类似 shadcn |
| **moon_design** | 商业产品 | 一般 | 需要现成的多组件 |
| **fluent_ui** | Windows 风 | 活跃 | Windows 桌面 |
| **macos_ui** | macOS 风 | 活跃 | macOS 桌面 |
| **flutter_platform_widgets** | iOS+Android 平台风格 | 一般 | 同时要 iOS / Material |
| **gluestack-flutter / nativebase** | 早期 | 慎用 | — |
| Material(官方) | Google 风 | 官方 | 大众 App |
| Cupertino(官方) | iOS 风 | 官方 | iOS 优先 |

---

## 十一、暗色模式的"细节"

光切 `ColorScheme.dark` 不够。常忽略:

- **图片**:暗色下需要更柔的对比 / 不同的 placeholder
- **阴影**:暗色用 elevation tint 替代真实阴影(Material 3 默认就这样)
- **状态色**:暗色下"危险红"要降低饱和
- **截图 / 图表**:本来就有黑底要切白底,不然糊
- **Splash**:启动图也要暗色版

```dart
final isDark = Theme.of(context).brightness == Brightness.dark;
final placeholder = isDark ? 'assets/empty_dark.png' : 'assets/empty.png';
```

---

## 十二、动效一致性

按 token 化时长(回顾 15):

```dart
class AppDuration {
  final Duration fast = Duration(milliseconds: 150);
  final Duration normal = Duration(milliseconds: 250);
  final Duration slow = Duration(milliseconds: 400);
}
```

进出场曲线统一:`Curves.easeOutCubic`(进场)、`Curves.easeIn`(退场)。

```dart
AnimatedContainer(
  duration: tokens.duration.normal,
  curve: Curves.easeOutCubic,
  ...
)
```

---

## 十三、可访问性(A11Y)

设计系统天然要管 a11y,不然每页都可能漏:

- 文字最小 12sp,可读对比度 4.5:1
- 按钮最小 44x44 触控区
- Semantics 标签
- TalkBack / VoiceOver 测试

```dart
Semantics(
  button: true,
  label: '加入购物车',
  child: AppButton(...),
)
```

把 a11y 内置到组件里,业务方就不会忘。

---

## 十四、组件分发

大公司多 App 共用 → 抽 monorepo。
- `packages/design_tokens/`(纯数据)
- `packages/ui_kit/`(组件,依赖 tokens)
- `apps/customer_app/`、`apps/staff_app/` 都依赖 ui_kit

工具:`melos`(monorepo 管理 Flutter / Dart 多包)。

```yaml
# melos.yaml
name: my_company
packages:
  - packages/**
  - apps/**
```

```bash
melos bootstrap
melos run analyze
```

---

## 十五、心智模型

```
设计系统五层
  ├─ Tokens     单一真理(从 Figma 同步)
  ├─ Primitives  Container / Text / Stack
  ├─ Components  Button / Input / Card / Dialog
  ├─ Patterns    Form / List / Empty / Skeleton
  └─ Pages       真实页面

判断有没有"设计系统"的标准
  ✅ 颜色不是 Color(0xff...) 写在业务里
  ✅ 间距不是 8 / 12 / 16 写在业务里
  ✅ 按钮不是各页各样
  ✅ 主题切换不会出 bug
  ✅ 设计师改 token,客户端自动跟
```

**一句话**:产品越大、越想长期做,越早建设计系统。短期看像"过度工程",一年后回头看,改一处样式比手撸快 10 倍。

---

## 十六、和已学知识的串联

- 17 主题 / 国际化:设计系统的底层
- 22 响应式 UI:断点 token 也属于设计系统
- 31 基础 Widget:理解原生 widget 才能封装好组件
- 15 动画:动效时长 / 曲线 token
- 33 手势:可点击区域 / 反馈
- 38 Web / 桌面:同一设计系统跨端复用
- 40 实战:三类 App 都要先搭设计系统再写业务
