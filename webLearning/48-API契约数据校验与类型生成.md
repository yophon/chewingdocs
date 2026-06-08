# API 契约、数据校验与类型生成

前端和后端最容易扯皮的地方不是页面,是接口契约。

一句话先记住:**API 契约 = 请求、响应、错误、权限、分页、版本的共同约定。TypeScript 只能保护前端代码,不能自动保证后端返回的一定对。**

---

## 一、为什么需要契约

坏接口协作:

```text
后端说字段叫 user_name
前端写 name
联调当天才发现
```

坏错误处理:

```json
{ "message": "failed" }
```

前端不知道:

- 是未登录?
- 是无权限?
- 是参数错?
- 是资源不存在?
- 能不能重试?

契约要提前定义这些。

---

## 二、契约包含什么

```text
path
method
request params
request body
response body
error code
auth requirement
pagination
rate limit
version
```

示例:

```text
GET /api/users
query:
  keyword?: string
  role?: owner | admin | member
  page: number
  pageSize: number

response:
  items: User[]
  total: number
  page: number
  pageSize: number

errors:
  UNAUTHORIZED
  FORBIDDEN
  INVALID_QUERY
```

---

## 三、Zod 做运行时校验

TypeScript 不会校验接口返回:

```ts
const user = await response.json() as User; // 只是断言,不是校验
```

正确做法:

```ts
import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member']),
});

export type User = z.infer<typeof userSchema>;
```

```ts
const data = await response.json();
const user = userSchema.parse(data);
```

线上建议用 `safeParse`:

```ts
const result = userSchema.safeParse(data);

if (!result.success) {
  reportSchemaError(result.error, data);
  throw new Error('Invalid API response');
}

return result.data;
```

---

## 四、请求层封装

最小 request:

```ts
type ApiErrorBody = {
  code: string;
  message: string;
  requestId?: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body ?? { code: 'UNKNOWN', message: 'Unknown error' });
  }

  return body as T;
}
```

注意:

- `fetch` 遇到 400 / 500 不会 throw
- 超时要自己做
- 401 / 403 / 409 / 422 要区分
- requestId 要带到错误监控

---

## 五、错误码规范

不要只靠 HTTP status。

```json
{
  "code": "USER_EMAIL_EXISTS",
  "message": "Email already exists",
  "requestId": "req_123"
}
```

前端根据 code 做分支:

```ts
if (error instanceof ApiError) {
  switch (error.body.code) {
    case 'USER_EMAIL_EXISTS':
      form.setError('email', { message: 'Email already exists' });
      break;
    case 'FORBIDDEN':
      showForbiddenDialog();
      break;
    default:
      toast.error(error.body.message);
  }
}
```

HTTP status 表示大类,业务 code 表示具体原因。

---

## 六、OpenAPI

OpenAPI 适合 REST:

```yaml
paths:
  /users:
    get:
      parameters:
        - name: page
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: OK
```

前端生成类型:

```bash
npx openapi-typescript ./openapi.yaml -o src/shared/api/schema.ts
```

使用:

```ts
import type { paths } from '@/shared/api/schema';

type ListUsersResponse =
  paths['/users']['get']['responses']['200']['content']['application/json'];
```

优点:

- 后端语言无关
- 文档、mock、类型生成一套
- 适合多端协作

缺点:

- schema 维护成本高
- 复杂泛型体验不如端到端 TS

---

## 七、tRPC

tRPC 适合全栈 TypeScript:

```ts
export const userRouter = router({
  list: publicProcedure
    .input(z.object({ page: z.number().default(1) }))
    .query(({ input }) => listUsers(input)),
});
```

前端:

```ts
const users = trpc.user.list.useQuery({ page: 1 });
```

优点:

- 类型端到端
- 不需要手写 OpenAPI
- Zod 校验自然集成

缺点:

- 强绑定 TypeScript
- 多语言客户端不友好
- 公共 API / 开放平台不适合

选型:

```text
内部全栈 TS 产品 -> tRPC
多语言 / 多端 / 开放 API -> OpenAPI
只做前端消费第三方 API -> 手写 client + Zod 校验
```

---

## 八、API Client 组织

按实体组织:

```text
entities/user/
  model.ts
  schema.ts
  api.ts
```

```ts
// entities/user/api.ts
import { z } from 'zod';
import { request } from '@/shared/lib/request';
import { userSchema } from './schema';

const listUsersResponseSchema = z.object({
  items: z.array(userSchema),
  total: z.number(),
});

export async function listUsers(params: ListUsersParams) {
  const data = await request<unknown>(`/api/users?${new URLSearchParams(params)}`);
  return listUsersResponseSchema.parse(data);
}
```

不要在组件里写:

```tsx
useEffect(() => {
  fetch('/api/users').then(...)
}, []);
```

组件不该知道接口细节。

---

## 九、Mock 与契约测试

MSW mock 要基于契约:

```ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json({
      items: [
        { id: '1', name: 'Ada', email: 'ada@example.com', role: 'admin' },
      ],
      total: 1,
    });
  }),
];
```

契约测试检查 mock 是否仍符合 schema:

```ts
test('mock list users matches schema', async () => {
  const res = await fetch('/api/users');
  const json = await res.json();
  expect(() => listUsersResponseSchema.parse(json)).not.toThrow();
});
```

Mock 一旦和真实接口漂移,测试就会给你假安全感。

---

## 十、分页契约

统一分页格式:

```ts
type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
```

或者 cursor:

```ts
type CursorPage<T> = {
  items: T[];
  nextCursor?: string;
};
```

不要每个接口一种:

```json
{ "list": [], "count": 1 }
{ "data": [], "totalCount": 1 }
{ "records": [], "pagination": {} }
```

前端会被迫写一堆适配层。

---

## 十一、检查清单

- [ ] 请求和响应是否有 schema
- [ ] 错误响应是否有 `code/message/requestId`
- [ ] 401 / 403 / 404 / 409 / 422 是否区分
- [ ] API client 是否集中在 entity 层
- [ ] 组件是否不直接拼接口 URL
- [ ] OpenAPI / tRPC 是否有明确选择
- [ ] Mock 是否和 schema 同步
- [ ] 分页格式是否统一
- [ ] 运行时校验失败是否上报

---

## 十二、心智模型

```text
TypeScript 管编译期
Zod 管运行时
OpenAPI 管跨语言契约
tRPC 管全栈 TS 契约
ApiError 管失败分支
requestId 管排障链路
```

接口契约稳,前端开发才会稳。否则所有类型都是自我安慰。

下一篇 49 讲前端可观测性。
