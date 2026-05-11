# React 表单:React Hook Form

表单是前端最高频但最容易写得难看的部分。受控组件每个 input 都 `value + onChange`,几十个字段时性能和可读性都崩。

**React Hook Form**(简称 RHF)解决这一切:**非受控 + 一行注册 + 内建校验**。

---

## 一、为什么不直接 useState

```tsx
function Form() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState(0);
  const [bio, setBio] = useState('');
  // ... 20 个字段
  // 还要校验、错误提示、初始值、重置...
}
```

**几乎不可维护**。RHF 用一个 hook 管全部。

---

## 二、安装

```bash
pnpm add react-hook-form
pnpm add zod @hookform/resolvers   # 配合 zod 校验
```

---

## 三、最小例子

```tsx
import { useForm } from 'react-hook-form';

type Inputs = {
  name: string;
  email: string;
};

function MyForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const onSubmit = async (data: Inputs) => {
    await api.create(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name', { required: '必填' })} />
      {errors.name && <p>{errors.name.message}</p>}

      <input {...register('email', {
        required: '必填',
        pattern: { value: /\S+@\S+/, message: '邮箱格式错' },
      })} />
      {errors.email && <p>{errors.email.message}</p>}

      <button disabled={isSubmitting}>
        {isSubmitting ? '提交中' : '提交'}
      </button>
    </form>
  );
}
```

`{...register('name')}` 是关键:它返回 `{ onChange, onBlur, ref, name }`,RHF 用 ref 拿值,**不引发组件重渲染**。

---

## 四、核心 API

```tsx
const {
  register,                // 注册字段
  handleSubmit,            // 包装提交回调
  watch,                   // 监听某字段值
  setValue,                // 程序化设值
  getValues,               // 取当前所有值
  reset,                   // 重置
  control,                 // 配合 Controller(给受控组件用)

  formState: {
    errors,                // 校验错误
    isDirty,               // 是否被修改过
    isValid,               // 整体是否合法
    isSubmitting,          // 正在提交
    isSubmitSuccessful,    // 提交成功过
    touchedFields,         // 哪些字段被碰过
  },
} = useForm<Inputs>({
  defaultValues: { name: '张三' },
  mode: 'onBlur',          // onSubmit / onChange / onBlur / onTouched / all
});
```

---

## 五、内建校验规则

```tsx
register('name', {
  required: '必填',
  minLength: { value: 2, message: '至少 2 字' },
  maxLength: { value: 20, message: '最多 20 字' },
  pattern: { value: /^[a-z]+$/, message: '只能小写字母' },
  validate: {
    notAdmin: v => v !== 'admin' || '不能用 admin',
    asyncCheck: async v => {
      const ok = await api.checkUsername(v);
      return ok || '用户名已存在';
    },
  },
});
```

`validate` 可以写多个,逐个执行。

---

## 六、用 Zod 做模式校验(推荐)

```bash
pnpm add zod @hookform/resolvers
```

```tsx
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  name: z.string().min(2, '至少 2 字'),
  email: z.string().email('邮箱格式错'),
  age: z.number().int().min(18, '需满 18 岁'),
  password: z.string().min(8),
  confirmPwd: z.string(),
}).refine(d => d.password === d.confirmPwd, {
  message: '两次密码不一致',
  path: ['confirmPwd'],
});

type Inputs = z.infer<typeof schema>;     // 类型自动推

function MyForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: Inputs) => api.create(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <p>{errors.name.message}</p>}

      <input {...register('email')} />
      {errors.email && <p>{errors.email.message}</p>}

      <input type="number" {...register('age', { valueAsNumber: true })} />
      {errors.age && <p>{errors.age.message}</p>}
    </form>
  );
}
```

**Zod 是当前 TS 校验事实标准**,前后端都能复用同一个 schema。

### 复杂 Schema

```tsx
const userSchema = z.object({
  email: z.string().email(),
  age: z.coerce.number().int().min(0),     // 自动把字符串转数字
  role: z.enum(['admin', 'user', 'guest']),
  birthday: z.date().optional(),
  tags: z.array(z.string()).max(5),
  preferences: z.object({
    theme: z.enum(['light', 'dark']),
    notifications: z.boolean(),
  }),
});
```

类比 Flutter freezed(回顾 34):**Zod 是 TS 的 freezed,做 schema + 类型推导**。

---

## 七、Controller:给受控组件用

很多 UI 库的组件(MUI / Ant Design / Mantine)是受控的,不能直接 `register`。用 `Controller`:

```tsx
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';

<Controller
  name="birthday"
  control={control}
  rules={{ required: true }}
  render={({ field, fieldState }) => (
    <DatePicker
      {...field}
      onChange={field.onChange}
      value={field.value ?? null}
    />
  )}
/>
```

`field` 提供 `{value, onChange, onBlur, ref, name}`,自定义组件用对应字段即可。

---

## 八、Watch:监听字段值

```tsx
const { watch } = useForm<Inputs>();

const role = watch('role');
const allValues = watch();
const someFields = watch(['name', 'email']);

// 在 JSX 里实时显示
return (
  <>
    <input {...register('name')} />
    <p>预览:{watch('name')}</p>
  </>
);
```

⚠️ `watch('xxx')` 会让组件**每次该字段变化都重渲染**。频繁变化的字段用 `useWatch` 更精细:

```tsx
import { useWatch } from 'react-hook-form';

function Preview({ control }) {
  const name = useWatch({ control, name: 'name' });
  return <p>{name}</p>;
}
```

只有 Preview 重渲染,主表单不动。

---

## 九、动态字段(添加 / 删除)

```tsx
import { useFieldArray } from 'react-hook-form';

type Inputs = {
  contacts: { name: string; phone: string }[];
};

function ContactForm() {
  const { control, register, handleSubmit } = useForm<Inputs>({
    defaultValues: { contacts: [{ name: '', phone: '' }] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contacts',
  });

  return (
    <form onSubmit={handleSubmit(...)}>
      {fields.map((f, i) => (
        <div key={f.id}>
          <input {...register(`contacts.${i}.name`)} />
          <input {...register(`contacts.${i}.phone`)} />
          <button type="button" onClick={() => remove(i)}>删除</button>
        </div>
      ))}
      <button type="button" onClick={() => append({ name: '', phone: '' })}>
        添加
      </button>
    </form>
  );
}
```

`f.id` 是 RHF 自动生成的稳定 key(回顾 03 列表 key)。

---

## 十、嵌套字段

```tsx
type Inputs = {
  user: {
    name: string;
    address: { city: string; zip: string };
  };
};

<input {...register('user.name')} />
<input {...register('user.address.city')} />
<input {...register('user.address.zip')} />
```

点号路径,RHF 自动处理嵌套。

---

## 十一、默认值与重置

```tsx
const { reset } = useForm<Inputs>({
  defaultValues: {
    name: '张三',
    age: 18,
  },
});

// 重置回默认
reset();

// 用新值重置
reset({ name: '李四', age: 20 });

// 重置后保持某些字段
reset({ name: '李四' }, { keepDirty: true, keepErrors: true });
```

### 异步默认值(从 API 加载)

```tsx
function EditUser({ id }) {
  const { data } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api.getUser(id),
  });

  const { register, reset, handleSubmit } = useForm<Inputs>();

  useEffect(() => {
    if (data) reset(data);     // 数据来了再填默认值
  }, [data, reset]);

  if (!data) return <Spinner />;
  return ...;
}
```

或用 `useForm` 的 `values` 属性自动同步:

```tsx
const { register } = useForm({
  values: data,    // data 变了自动 reset
});
```

---

## 十二、错误处理与全局错误

```tsx
const { setError, formState: { errors } } = useForm<Inputs>();

const onSubmit = async (data: Inputs) => {
  try {
    await api.create(data);
  } catch (e) {
    if (e.code === 'EMAIL_TAKEN') {
      setError('email', { message: '邮箱已被注册' });
    } else {
      setError('root', { message: '提交失败,稍后再试' });
    }
  }
};

// 显示
{errors.root && <p className="error">{errors.root.message}</p>}
```

服务端校验失败也用 `setError` 把错误"塞"回表单,UI 跟前端校验一致。

---

## 十三、Submit 时的 isSubmitting

```tsx
<button disabled={isSubmitting}>
  {isSubmitting && <Spinner />}
  {isSubmitting ? '提交中' : '提交'}
</button>
```

防止用户重复点击。

---

## 十四、性能:RHF 为什么快

```
普通受控:每个 keystroke → setState → 整个表单重渲染
RHF    :每个 keystroke → 内部 ref 更新 → 只有显示该字段错误的组件重渲染
```

100 个字段的表单也丝滑。

---

## 十五、跟 UI 库的整合

### shadcn/ui

```tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel>邮箱</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

shadcn 的 Form 组件是 RHF + Tailwind 的封装,现代 React 项目主流。

### MUI / Mantine / Ant Design

都用 `Controller` 包一层即可。

---

## 十六、常见模式

### 1. 登录表单

```tsx
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type Form = z.infer<typeof schema>;

function LoginForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const navigate = useNavigate();
  const { mutateAsync } = useMutation({
    mutationFn: api.login,
    onSuccess: () => navigate('/dashboard'),
  });

  return (
    <form onSubmit={handleSubmit(d => mutateAsync(d))}>
      <input {...register('email')} type="email" />
      {errors.email && <p>{errors.email.message}</p>}

      <input {...register('password')} type="password" />
      {errors.password && <p>{errors.password.message}</p>}

      <button disabled={isSubmitting}>
        {isSubmitting ? '...' : '登录'}
      </button>
    </form>
  );
}
```

### 2. 文件上传

```tsx
<input type="file" {...register('avatar', { required: true })} />

const onSubmit = (data) => {
  const formData = new FormData();
  formData.append('avatar', data.avatar[0]);
  // ⚠️ 注意是数组,因为 input file 的 files 是 FileList
};
```

### 3. 多步表单

```tsx
const [step, setStep] = useState(1);
const { register, handleSubmit, trigger, getValues } = useForm<Inputs>();

const next = async () => {
  const ok = await trigger(['name', 'email']);    // 只校验本步
  if (ok) setStep(s => s + 1);
};

return (
  <form onSubmit={handleSubmit(submit)}>
    {step === 1 && <Step1 register={register} />}
    {step === 2 && <Step2 register={register} />}
    {step === 3 && <Step3 register={register} getValues={getValues} />}

    {step < 3
      ? <button type="button" onClick={next}>下一步</button>
      : <button type="submit">提交</button>}
  </form>
);
```

---

## 十七、常见坑

### 1. 没设 defaultValues

```tsx
useForm<Inputs>();    // 默认 undefined,受控组件可能警告

useForm<Inputs>({
  defaultValues: { name: '', email: '' },    // ✅ 显式给空字符串
});
```

### 2. 数字字段忘记 valueAsNumber

```tsx
register('age')                          // ⚠️ 拿到的是字符串
register('age', { valueAsNumber: true })  // ✅ 自动转数字
```

或在 zod 里 `z.coerce.number()`。

### 3. 直接 register 受控组件

```tsx
<Switch {...register('agree')} />     // ❌ MUI Switch 是受控,直接 register 失败
```

→ 用 `Controller`。

### 4. 在条件里 register 不同字段

```tsx
{cond && <input {...register('a')} />}
{!cond && <input {...register('b')} />}
```

切换条件时 a / b 字段值会留在 form 里。需要时用 `unregister`。

### 5. 重置后值还是旧的

```tsx
reset();    // 没传参 → 重置到 defaultValues

reset({ name: '新' });    // 用新值
```

注意 reset 会清掉 errors 和 dirty,**用 keepXxx 保留**。

### 6. trigger 校验某字段

```tsx
const ok = await trigger('email');
const ok = await trigger();           // 校验全部
const ok = await trigger(['a', 'b']);
```

---

## 十八、其他表单方案

| 方案 | 特点 |
| --- | --- |
| **Formik** | 老牌,API 受控,性能差,**新项目别用** |
| **Final Form** | API 老,小众 |
| **TanStack Form** | TanStack 生态新作,类型极强 |
| **手写 useState** | < 5 字段简单表单可以 |

实战 99% RHF。

---

## 十九、和 Flutter 的对照

| Flutter | React Hook Form |
| --- | --- |
| `Form + GlobalKey<FormState>` | `useForm` |
| `TextFormField + validator` | `register('x', { ... })` |
| `Form.of(context).validate()` | `trigger()` / `handleSubmit` |
| `formKey.currentState!.save()` | `getValues()` |
| `_formKey.currentState!.reset()` | `reset()` |
| 自定义 validator | zod schema / validate fn |

Flutter 的 Form 跟 RHF 思路类似,只是 React 配合 zod 做 schema 校验更现代。

---

## 二十、推荐组合

```
react-hook-form         核心
zod + @hookform/resolvers  类型安全 schema
shadcn/ui Form          UI 包装(可选)
TanStack Query Mutation  提交后端
```

---

## 二十一、心智模型

```
受控 vs 非受控:
  受控(useState):每次输入 → setState → 重渲染整表
  非受控(RHF):  ref 内部记录 → 提交时一次性拿值 → 几乎不重渲染

RHF 三件套:
  register     → 字段注册(input)
  handleSubmit → 提交包装(校验 + 调你的回调)
  formState    → 错误 / 状态(isSubmitting / isDirty / errors)

Schema 用 zod:
  一次定义 → 类型 + 校验 + 文档全有
```

**表单在 React 里曾经是噩梦,RHF + Zod 让它变成最优雅的部分**。任何中型表单建议直接上,从写第一个字段就用上 zod 做类型,后期省下来的时间巨大。

下一篇 09 讲 React 性能与渲染机制——所有"为什么我的应用卡"的答案在那里。
