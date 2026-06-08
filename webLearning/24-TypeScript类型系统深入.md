# TypeScript 类型系统深入

TypeScript 不是"加类型注释的 JavaScript"。它是一套**独立的、图灵完备的类型语言**,运行在编译期,产物是 0 行 JS。

会写 `: string` 只是入门,**会让类型自动推导出来**才是熟练。这一篇把类型系统的核心机制讲透:

- 泛型与约束
- 条件类型与 `infer`
- 映射类型与键重映射
- 类型守卫与缩窄
- 内置工具类型(及它们的实现)
- 实战类型体操

---

## 一、为什么要"重视类型"

```typescript
// 没类型
function add(a, b) { return a + b }
add('1', 2);        // 运行时:'12',静默 bug

// 有类型
function add(a: number, b: number): number { return a + b }
add('1', 2);        // ❌ 编译就报错
```

类型 = **编译期文档 + 编译期单元测试**。

但如果你写成这样:

```typescript
function getUser(id: string): any { ... }
const user = getUser('1');
user.foo.bar.baz;       // ❌ 没拦住,any 是核武器
```

`any` 本质是关掉类型检查。**真懂 TS 的人最少用 any**。

---

## 二、类型推导(让 TS 自己干活)

```typescript
const x = 1;            // x: 1   (字面量类型)
let y = 1;              // y: number
const arr = [1, 2, 3];  // arr: number[]
const obj = { a: 1 };   // obj: { a: number }

const fn = (n: number) => n * 2;   // fn: (n: number) => number,返回类型自动推导
```

**能推导就别手写**。手写多了,后面改起来到处改。

### `as const`:把字面量变常量类型

```typescript
const config = {
  api: '/api',
  retries: 3,
};
// config.api: string,config.retries: number

const config = {
  api: '/api',
  retries: 3,
} as const;
// config.api: '/api'(literal),config.retries: 3
```

`as const` 是**做枚举的最佳方式**:

```typescript
const ROLES = ['admin', 'user', 'guest'] as const;
type Role = typeof ROLES[number];  // 'admin' | 'user' | 'guest'
```

---

## 三、泛型:让类型变成"参数"

### 1. 函数泛型

```typescript
function identity<T>(x: T): T { return x; }

identity(1);          // T = number
identity('hi');       // T = string
identity({ a: 1 });   // T = { a: number }
```

`<T>` = "我先不知道是啥类型,你给我什么我就当啥处理"。

### 2. 泛型约束 `extends`

```typescript
function getLength<T extends { length: number }>(x: T): number {
  return x.length;
}

getLength([1, 2]);    // ✅
getLength('hi');       // ✅
getLength(123);        // ❌
```

### 3. 多个泛型参数

```typescript
function pair<A, B>(a: A, b: B): [A, B] { return [a, b]; }

const p = pair(1, 'hi');   // p: [number, string]
```

### 4. 默认泛型参数

```typescript
type Response<T = unknown> = { data: T; status: number };

const a: Response = ...;             // T = unknown
const b: Response<User> = ...;        // T = User
```

### 5. 泛型在接口 / 类型别名

```typescript
interface Box<T> { value: T }
type Pair<A, B> = { first: A; second: B };
```

### 6. 经典实战:类型安全的 fetch

```typescript
async function api<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

const user = await api<{ id: string; name: string }>('/me');
user.name;  // ✅ TS 知道是 string
```

---

## 四、Union 与 Intersection

```typescript
type ID = string | number;            // 联合(或者)
type A = { x: 1 } & { y: 2 };         // 交叉(且)= { x: 1; y: 2 }
```

### Discriminated Union(标签联合,最重要的模式)

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number };

function area(s: Shape) {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2;     // s 自动缩窄成 circle
    case 'square': return s.side ** 2;
  }
}
```

`kind` 字段是"判别符",TS 通过它**自动缩窄**类型。这是**前端最常用的类型模式**(Redux action、API 响应、状态机都靠它)。

### 完整性检查 `never`

```typescript
function area(s: Shape) {
  switch (s.kind) {
    case 'circle': return ...;
    case 'square': return ...;
    default:
      const _exhaustive: never = s;     // 加了新 kind 没处理就报错
      throw new Error(_exhaustive);
  }
}
```

**重构时神器**:加新 kind,所有 switch 漏处理的地方编译报错。

---

## 五、类型守卫与缩窄

### 1. `typeof`

```typescript
function fn(x: string | number) {
  if (typeof x === 'string') {
    x.toUpperCase();      // 缩窄成 string
  } else {
    x.toFixed(2);          // 缩窄成 number
  }
}
```

### 2. `instanceof`

```typescript
function fn(e: Error | string) {
  if (e instanceof Error) {
    e.message;            // Error
  }
}
```

### 3. `in`(检查属性存在)

```typescript
function fn(x: { a: 1 } | { b: 2 }) {
  if ('a' in x) {
    x.a;        // ✅
  }
}
```

### 4. 自定义类型谓词

```typescript
function isString(x: unknown): x is string {
  return typeof x === 'string';
}

const v: unknown = ...;
if (isString(v)) {
  v.toUpperCase();        // ✅ TS 信你
}
```

`x is string` 告诉 TS:"如果这函数返回 true,就当 x 是 string"。

### 5. 断言函数

```typescript
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const x: string | undefined = ...;
assert(x, 'x is required');
x.toUpperCase();          // ✅ TS 知道 x 是 string
```

### 6. 收窄常见 trap

```typescript
function fn(x: string | null) {
  if (x !== null) {
    setTimeout(() => x.toUpperCase());   // ❌ 闭包内重新变成 string | null
  }
}
```

**TS 不能跨闭包追踪缩窄**。修复:

```typescript
function fn(x: string | null) {
  if (x !== null) {
    const safe = x;
    setTimeout(() => safe.toUpperCase());     // ✅
  }
}
```

---

## 六、`keyof` / `typeof` / `in`

```typescript
type User = { id: string; name: string; age: number };

type K = keyof User;        // 'id' | 'name' | 'age'

const u: User = ...;
type T = typeof u;          // 反推出 User
type T2 = typeof u.id;       // string

// 索引访问类型
type Name = User['name'];    // string
```

`typeof` 在 TS 里 = **取一个值的类型**(不是 JS 的 typeof)。是连接"运行时世界"和"类型世界"的桥梁。

### 实战:从对象推出类型

```typescript
const config = {
  apiUrl: 'http://api',
  timeout: 5000,
} as const;

type Config = typeof config;      // { readonly apiUrl: 'http://api'; readonly timeout: 5000 }
type Key = keyof typeof config;   // 'apiUrl' | 'timeout'
```

---

## 七、映射类型

```typescript
type User = { id: string; name: string; age: number };

// 全部变可选
type Partial<T> = { [K in keyof T]?: T[K] };
type T1 = Partial<User>;
// { id?: string; name?: string; age?: number }

// 全部变只读
type Readonly<T> = { readonly [K in keyof T]: T[K] };

// 全部变 string 类型
type Stringify<T> = { [K in keyof T]: string };
```

`[K in keyof T]` = 遍历 T 的每个 key。

### 键重映射(`as`)

```typescript
// 给所有 key 加前缀 'on'
type EventHandlers<T> = {
  [K in keyof T as `on${Capitalize<string & K>}`]: () => T[K];
};

type T = EventHandlers<{ click: number; hover: string }>;
// { onClick: () => number; onHover: () => string }
```

`as` 在映射类型里 = **重命名 key**。

### 过滤 key

```typescript
// 只保留方法
type Methods<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};
```

`as never` 让这个 key 消失。

---

## 八、条件类型与 `infer`

### 条件类型

```typescript
type IsString<T> = T extends string ? true : false;

type A = IsString<'hi'>;      // true
type B = IsString<123>;       // false
```

### 分布式条件(distributive)

```typescript
type ToArray<T> = T extends any ? T[] : never;
type R = ToArray<string | number>;
// string[] | number[]    ← 自动分配
```

如果不想分配,加 `[]` 包起来:

```typescript
type ToArrayNoDistribute<T> = [T] extends [any] ? T[] : never;
type R = ToArrayNoDistribute<string | number>;
// (string | number)[]
```

### `infer`:模式匹配 + 抽取

```typescript
// 抽取函数返回类型
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

type R = ReturnType<() => string>;     // string

// 抽取 Promise 内的类型
type Awaited<T> = T extends Promise<infer U> ? U : T;

type R = Awaited<Promise<number>>;     // number

// 抽取数组元素类型
type ElementOf<T> = T extends (infer E)[] ? E : never;

type R = ElementOf<string[]>;          // string

// 抽取函数参数
type Params<T> = T extends (...args: infer P) => any ? P : never;

type R = Params<(a: string, b: number) => void>;
// [a: string, b: number]
```

`infer X` = "声明一个待推导变量 X,你给我推一下"。

---

## 九、内置工具类型(必须熟练)

```typescript
type User = { id: string; name: string; age: number };

Partial<User>             // 所有字段可选
Required<User>            // 所有字段必填
Readonly<User>            // 所有字段只读
Pick<User, 'id' | 'name'> // 挑出指定字段
Omit<User, 'age'>         // 排除指定字段

Record<'a' | 'b', number> // { a: number; b: number }

Exclude<'a' | 'b' | 'c', 'a'>     // 'b' | 'c'
Extract<'a' | 'b' | 'c', 'a'>     // 'a'
NonNullable<string | null>         // string

ReturnType<typeof fn>             // fn 的返回类型
Parameters<typeof fn>             // fn 的参数 tuple
ConstructorParameters<typeof Cls> // 构造器参数
InstanceType<typeof Cls>          // 类的实例类型

Awaited<Promise<T>>               // T(自动展开嵌套 Promise)

Uppercase<'hi'>                   // 'HI'
Lowercase<'HI'>                   // 'hi'
Capitalize<'hi'>                  // 'Hi'
Uncapitalize<'Hi'>                // 'hi'
```

### 它们怎么实现的(以 Pick 为例)

```typescript
type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
```

看懂这个 = 看懂了"映射类型 + 索引访问 + Exclude"配合。

---

## 十、实战类型体操

### 1. 深度 Partial

```typescript
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
```

### 2. 深度 Readonly

```typescript
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};
```

### 3. 取所有 key 的路径(像 Lodash get)

```typescript
type Paths<T> = T extends object
  ? { [K in keyof T]: K extends string ? K | `${K}.${Paths<T[K]> & string}` : never }[keyof T]
  : never;

type P = Paths<{ a: { b: { c: number } } }>;
// 'a' | 'a.b' | 'a.b.c'
```

### 4. 元组转联合

```typescript
type Tuple = ['a', 'b', 'c'];
type Union = Tuple[number];   // 'a' | 'b' | 'c'
```

### 5. 联合转交叉

```typescript
type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

type R = UnionToIntersection<{ a: 1 } | { b: 2 }>;
// { a: 1 } & { b: 2 }
```

(原理:利用函数参数逆变。看懂 = TS 类型黑魔法入门。)

### 6. Promise 链返回值

```typescript
async function getUser() {
  return { id: '1', name: 'A' };
}

type User = Awaited<ReturnType<typeof getUser>>;
// { id: string; name: string }
```

`Awaited<ReturnType<typeof f>>` 是**最常用的类型组合**之一。

---

## 十一、`unknown` vs `any` vs `never`

```typescript
let a: any = 1;
a.foo.bar.baz;          // ✅ 编译过(运行时报错)

let b: unknown = 1;
b.foo;                   // ❌ unknown 必须先收窄
if (typeof b === 'object' && b !== null && 'foo' in b) {
  b.foo;                 // ✅
}

let c: never;
c = 1;                   // ❌ never 不能赋任何值
function fail(): never { throw new Error(); }    // 永远不返回
```

```
any     : 关闭类型检查,核武器,慎用
unknown : 安全的 any,必须先验证再用
never   : 不可能存在的值(switch 完整性 / 永远抛错的函数)
```

**接收外部数据用 unknown**,先用 `zod` 校验再用,从此告别 `any`。

```typescript
import { z } from 'zod';

const userSchema = z.object({ id: z.string(), name: z.string() });
type User = z.infer<typeof userSchema>;

const data: unknown = await fetch(...).then(r => r.json());
const user = userSchema.parse(data);     // 校验过的 User
```

---

## 十二、常见 trap

### Trap 1:对象字面量额外属性

```typescript
type User = { id: string };
const u: User = { id: '1', name: 'A' };  // ❌ name 不存在

const tmp = { id: '1', name: 'A' };
const u2: User = tmp;                     // ✅(直接的字面量才检查)
```

### Trap 2:函数参数双向协变

```typescript
type Handler = (n: number) => void;
const h: Handler = (n: number | string) => {};   // ✅(参数能更宽)
```

不直观,但是为了和 DOM API 兼容。

### Trap 3:`{}` 不是空对象

```typescript
type T = {};      // 任何非 null/undefined 的值
const x: T = 1;   // ✅
const x: T = 'a'; // ✅
```

要表达"空对象"用 `Record<string, never>`。

### Trap 4:`as` 不是检查,是绕过

```typescript
const u = data as User;     // 不验证!出错就出错
```

`as` 只在你**真的比 TS 知道得多**时用。乱用 = `any` 第二。

---

## 十三、配置 `tsconfig.json`(2025 推荐)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,                   // 全开
    "noUncheckedIndexedAccess": true, // arr[0] 自动 T | undefined
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,          // 兼容 esbuild/swc
    "verbatimModuleSyntax": true,     // import type 强约束
    "skipLibCheck": true,
    "esModuleInterop": true,
    "jsx": "preserve"
  }
}
```

`strict: true` 是底线,**新项目永远开**。

---

## 十四、心智模型

```
TS 类型系统是一门"编译期函数式语言":
  - 输入:类型
  - 输出:类型
  - 工具:泛型(参数)、条件类型(if)、映射类型(map)、infer(模式匹配)

学习路径:
  1. 推导大于声明(能让 TS 自己推就别手写)
  2. 联合 + 标签联合是 80% 业务建模
  3. keyof / typeof 把"值"和"类型"打通
  4. 工具类型组合用,体操题没必要刷
  5. unknown + zod 处理外部数据,从此不用 any

最高境界:
  让用户感觉不到类型在工作。出错时 TS 报错,正常时类型自己推导。
```

---

## 十五、参考资源

- 官方 Handbook(必读 1 遍):https://www.typescriptlang.org/docs/handbook
- Type Challenges(刷题):https://github.com/type-challenges/type-challenges
- TS Playground(随时试):https://www.typescriptlang.org/play
- Total TypeScript(Matt Pocock 课程):https://www.totaltypescript.com

**别背 API,理解机制**。机制就那几样:泛型、条件、映射、infer。其他都是组合。
