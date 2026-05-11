# Angular 组件、模板与绑定语法

Angular 组件是带 `@Component` 装饰器的类,模板是类 HTML 语法加上 Angular 专有绑定。

---

## 一、组件结构

```ts
// 独立组件(Angular 14+,推荐)
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <h2>{{ user.name }}</h2>
      <p>{{ user.email }}</p>
      <button (click)="edit()">编辑</button>
    </div>
  `,
})
export class UserCardComponent {
  @Input() user!: { name: string; email: string };
  @Output() edited = new EventEmitter<void>();

  edit() { this.edited.emit(); }
}
```

---

## 二、四种绑定语法

### 1. 插值:{{ }}

```html
<p>{{ title }}</p>
<p>{{ user?.name ?? '游客' }}</p>
```

### 2. 属性绑定:[属性]

```html
<img [src]="imageUrl">
<button [disabled]="isLoading">提交</button>
<div [class.active]="isActive"></div>
<app-user-card [user]="currentUser"></app-user-card>
```

### 3. 事件绑定:(事件)

```html
<button (click)="handleClick()">点击</button>
<input (input)="onInput($event)">
<app-user-card (edited)="onEdited()"></app-user-card>
```

`$event` 是原生事件对象或 EventEmitter 的值。

### 4. 双向绑定:[(ngModel)]

```html
<input [(ngModel)]="name">
```

---

## 三、内置指令

### Angular 17+ 新控制流(推荐)

```html
@if (isLoggedIn) {
  <div>欢迎!</div>
} @else {
  <a>请登录</a>
}

@for (item of items; track item.id) {
  <li>{{ item.name }}</li>
} @empty {
  <li>暂无数据</li>
}

@switch (status) {
  @case ('loading') { <spinner /> }
  @case ('error')   { <p>出错了</p> }
  @default          { <content /> }
}
```

`track` 极重要:列表更新时按 id 匹配 DOM 节点,避免全量重建。

### ngClass / ngStyle

```html
<div [ngClass]="{ active: isActive, 'text-bold': isBold }"></div>
<div [class]="isActive ? 'active' : ''"></div>
<div [ngStyle]="{ 'font-size': fontSize + 'px' }"></div>
```

---

## 四、组件通信

### 父 → 子:@Input

```ts
@Input() title: string = '';
@Input({ required: true }) items: string[] = [];
@Input({ transform: numberAttribute }) count = 0;
```

### 子 → 父:@Output + EventEmitter

```ts
@Output() itemSelected = new EventEmitter<Item>();

selectItem(item: Item) {
  this.itemSelected.emit(item);
}
```

```html
<!-- 父组件 -->
<app-list (itemSelected)="onSelected($event)"></app-list>
```

### 父访问子:@ViewChild

```ts
@ViewChild(ChildComponent) child!: ChildComponent;

ngAfterViewInit() {
  this.child.doSomething();
}
```

---

## 五、生命周期钩子

```ts
export class MyComponent implements OnInit, OnDestroy {
  ngOnChanges(changes: SimpleChanges) {}  // @Input 变化时
  ngOnInit() {}                           // 初始化完,常用来发请求
  ngAfterViewInit() {}                    // 模板 + 子组件渲染完
  ngOnDestroy() {}                        // 销毁,清理订阅/定时器
}
```

| 钩子 | 时机 | 常用场景 |
| --- | --- | --- |
| `ngOnChanges` | @Input 变化 | 监听 Input 变化 |
| `ngOnInit` | 初始化完 | 发请求、初始化 |
| `ngAfterViewInit` | 视图渲染完 | 操作 DOM |
| `ngOnDestroy` | 销毁 | 清理订阅/定时器 |

---

## 六、Pipes(管道)

```html
{{ price | currency:'CNY':'symbol':'1.2-2' }}   <!-- ¥1,234.56 -->
{{ date | date:'yyyy-MM-dd' }}
{{ title | uppercase }}
{{ text | slice:0:100 }}...
{{ user | json }}   <!-- 调试用 -->
{{ obs$ | async }}  <!-- 自动订阅 + 自动取消 -->
```

### 自定义 Pipe

```ts
@Pipe({ name: 'truncate', standalone: true })
export class TruncatePipe implements PipeTransform {
  transform(value: string, limit = 50): string {
    return value.length > limit ? value.slice(0, limit) + '...' : value;
  }
}
```

---

## 七、Signal Input / Output(Angular 17.1+)

```ts
export class UserCard {
  user = input.required<User>();
  size = input<'sm' | 'md'>('md');
  isOpen = model(false);       // 双向绑定 Signal
  selected = output<User>();

  fullName = computed(() => this.user().firstName + ' ' + this.user().lastName);
}
```

```html
<app-user-card
  [user]="currentUser"
  [(isOpen)]="dialogOpen"
  (selected)="onSelected($event)"
/>
```
