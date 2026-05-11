# Flutter 网络请求:Dio + 拦截器 + GraphQL

Flutter 网络请求三种主流方案:

1. **`http` 包**(官方,简单,够用一半场景)
2. **`dio`**(社区标杆,功能强,推荐)
3. **`graphql_flutter`**(GraphQL 协议,REST 之外的另一条路)

---

## 一、http 包(官方,最简单)

```yaml
dependencies:
  http: ^1.2.1
```

```dart
import 'package:http/http.dart' as http;

final res = await http.get(Uri.parse('https://api.example.com/users'));
if (res.statusCode == 200) {
  final data = jsonDecode(res.body);
}

// POST
await http.post(
  Uri.parse('https://api.example.com/login'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({'name': 'a', 'pwd': '1'}),
);
```

**优点**:零依赖、简单
**缺点**:每次都要手动写 baseUrl、序列化、错误处理、超时、重试……所以一旦项目稍微复杂就升级到 Dio。

---

## 二、Dio:实战标准

```yaml
dependencies:
  dio: ^5.7.0
```

### 基础用法

```dart
final dio = Dio(BaseOptions(
  baseUrl: 'https://api.example.com',
  connectTimeout: const Duration(seconds: 5),
  receiveTimeout: const Duration(seconds: 5),
  headers: {'Content-Type': 'application/json'},
));

// GET
final res = await dio.get('/users', queryParameters: {'page': 1});
print(res.data);                       // 自动解析 JSON

// POST
await dio.post('/login', data: {'name': 'a', 'pwd': '1'});

// 上传
final formData = FormData.fromMap({
  'name': 'avatar',
  'file': await MultipartFile.fromFile('/path/to/img.jpg'),
});
await dio.post('/upload', data: formData);

// 下载
await dio.download('https://example.com/file.zip', '/local/path/file.zip',
    onReceiveProgress: (got, total) => print('${got / total * 100}%'));
```

### 错误处理

Dio 把所有错误包成 `DioException`:

```dart
try {
  await dio.get('/users');
} on DioException catch (e) {
  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.receiveTimeout:
      // 超时
      break;
    case DioExceptionType.badResponse:
      // 4xx / 5xx
      print('HTTP ${e.response?.statusCode}');
      break;
    case DioExceptionType.cancel:
      // 主动取消
      break;
    default:
      // 其他
  }
}
```

### 取消请求

```dart
final cancelToken = CancelToken();
dio.get('/slow', cancelToken: cancelToken);

// 用户离开页面时
cancelToken.cancel('用户取消');
```

---

## 三、拦截器:Dio 的灵魂

拦截器 = 请求/响应**中间件**。

```dart
dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) {
    print('→ ${options.method} ${options.uri}');
    handler.next(options);          // 继续
    // 或 handler.reject(err);       // 拦截
    // 或 handler.resolve(response); // 直接返回数据
  },
  onResponse: (response, handler) {
    print('← ${response.statusCode}');
    handler.next(response);
  },
  onError: (e, handler) {
    print('✗ ${e.message}');
    handler.next(e);
  },
));
```

### 实战拦截器 1:自动加 Token

```dart
class AuthInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = TokenStorage.instance.token;
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}

dio.interceptors.add(AuthInterceptor());
```

### 实战拦截器 2:401 自动刷新 Token + 重试

```dart
class RefreshInterceptor extends Interceptor {
  final Dio dio;
  RefreshInterceptor(this.dio);

  bool _refreshing = false;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401) return handler.next(err);
    if (_refreshing) return handler.next(err);

    _refreshing = true;
    try {
      final newToken = await AuthApi.refresh();
      TokenStorage.instance.token = newToken;

      // 重发原请求
      final clone = await dio.fetch(err.requestOptions);
      handler.resolve(clone);
    } catch (_) {
      handler.next(err);
    } finally {
      _refreshing = false;
    }
  }
}
```

### 实战拦截器 3:统一日志

```dart
dio.interceptors.add(LogInterceptor(
  request: true,
  requestBody: true,
  responseBody: true,
  error: true,
));
```

或用社区包 `pretty_dio_logger` 颜色更好看。

### 实战拦截器 4:统一错误码处理

```dart
class BizErrorInterceptor extends Interceptor {
  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final code = response.data['code'];
    if (code != 0) {
      handler.reject(DioException(
        requestOptions: response.requestOptions,
        response: response,
        message: response.data['msg'],
      ));
      return;
    }
    response.data = response.data['data'];   // 把 data 字段拆出来
    handler.next(response);
  }
}
```

后端统一返回 `{code, msg, data}`,这个拦截器把业务错误也变成异常,Service 层就只关心成功的 data。

### 拦截器顺序

按 add 顺序,**onRequest 从前往后**,**onResponse / onError 从后往前**(像洋葱)。

```dart
dio.interceptors.addAll([
  LogInterceptor(),       // 最先打日志
  AuthInterceptor(),      // 再加 Token
  RefreshInterceptor(),   // 401 处理在最里
]);
```

---

## 四、Dio + 模型类

手动解析:

```dart
class User {
  final int id;
  final String name;
  User({required this.id, required this.name});

  factory User.fromJson(Map<String, dynamic> json) =>
      User(id: json['id'], name: json['name']);
}

// 用
final res = await dio.get('/me');
final user = User.fromJson(res.data);
```

### 自动生成:json_serializable

```yaml
dependencies:
  json_annotation: ^4.9.0
dev_dependencies:
  build_runner: ^2.4.9
  json_serializable: ^6.8.0
```

```dart
// user.dart
import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  final int id;
  final String name;
  User({required this.id, required this.name});

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}
```

跑 `dart run build_runner build`,生成 `user.g.dart`。后面字段加几十个也不用手写了。

---

## 五、retrofit:Dio 的"接口注解版"

像后端 Java 的 Retrofit 那样,**用注解描述 API**。

```yaml
dependencies:
  retrofit: ^4.4.0
  dio: ^5.7.0
dev_dependencies:
  retrofit_generator: ^9.1.0
  build_runner: ^2.4.9
```

```dart
// api.dart
import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';
import 'user.dart';

part 'api.g.dart';

@RestApi(baseUrl: 'https://api.example.com')
abstract class Api {
  factory Api(Dio dio) = _Api;

  @GET('/users')
  Future<List<User>> getUsers(@Query('page') int page);

  @GET('/users/{id}')
  Future<User> getUser(@Path('id') int id);

  @POST('/users')
  Future<User> create(@Body() User user);
}
```

跑 build_runner 后,直接用:

```dart
final api = Api(dio);
final users = await api.getUsers(1);
```

**好处**:接口、路径、参数全在一个文件,看一眼就懂;改 URL 不会传错参数。

---

## 六、典型架构(Dio + Repo)

```
UI (Cubit/Bloc)
   ↓
UserRepo (接口) ← 抽象,业务逻辑依赖它
   ↓
UserRepoImpl  ← 实现,内部用 Api / Dio
   ↓
Api (Retrofit / 手写)
   ↓
Dio + Interceptors
```

```dart
abstract class UserRepo {
  Future<User> getMe();
}

class UserRepoImpl implements UserRepo {
  final Api api;
  UserRepoImpl(this.api);

  @override
  Future<User> getMe() async {
    try {
      return await api.getMe();
    } on DioException catch (e) {
      throw AppException.fromDio(e);   // 转成业务异常
    }
  }
}
```

UI 只接触 `UserRepo`,**完全不知道下面用的是 REST 还是 GraphQL 还是本地缓存**。

---

## 七、GraphQL 入门

REST 是"服务端给你定好接口";GraphQL 是"客户端按需查字段"。

```graphql
query {
  user(id: 1) {
    name
    email
    posts(limit: 5) {
      title
      createdAt
    }
  }
}
```

后端只返回你要的字段,**避免 over-fetch / under-fetch**。

### graphql_flutter

```yaml
dependencies:
  graphql_flutter: ^5.1.2
```

```dart
final client = GraphQLClient(
  link: HttpLink('https://api.example.com/graphql'),
  cache: GraphQLCache(),
);

void main() {
  runApp(GraphQLProvider(
    client: ValueNotifier(client),
    child: MyApp(),
  ));
}
```

### Query

```dart
class UserPage extends StatelessWidget {
  static const _query = r'''
    query GetUser($id: Int!) {
      user(id: $id) {
        name
        email
      }
    }
  ''';

  @override
  Widget build(BuildContext context) {
    return Query(
      options: QueryOptions(
        document: gql(_query),
        variables: {'id': 1},
      ),
      builder: (result, {refetch, fetchMore}) {
        if (result.isLoading) return const CircularProgressIndicator();
        if (result.hasException) return Text(result.exception.toString());

        final user = result.data!['user'];
        return Text('${user['name']} - ${user['email']}');
      },
    );
  }
}
```

### Mutation

```dart
Mutation(
  options: MutationOptions(
    document: gql(r'''
      mutation Login($email: String!, $pwd: String!) {
        login(email: $email, pwd: $pwd) {
          token
          user { id name }
        }
      }
    '''),
    onCompleted: (data) {
      final token = data?['login']['token'];
      // ...
    },
  ),
  builder: (runMutation, result) {
    return ElevatedButton(
      onPressed: () => runMutation({'email': 'a@b.com', 'pwd': '1'}),
      child: const Text('登录'),
    );
  },
)
```

### Subscription(实时数据)

```dart
final subscription = client.subscribe(SubscriptionOptions(
  document: gql(r'''
    subscription { newMessage { id text } }
  '''),
));

subscription.listen((result) {
  print(result.data);
});
```

WebSocket Link:

```dart
final link = Link.split(
  (request) => request.isSubscription,
  WebSocketLink('wss://api.example.com/graphql'),
  HttpLink('https://api.example.com/graphql'),
);
```

---

## 八、GraphQL 代码生成(强烈推荐)

手写 query 字符串、手动取 `result.data!['user']` 容易写错。用 `graphql_codegen`:

```yaml
dev_dependencies:
  build_runner: ^2.4.9
  graphql_codegen: ^0.14.0
```

把 `.graphql` 文件放进项目,跑生成,得到强类型 API:

```dart
// 自动生成的代码
final result = await client.query$GetUser(
  Options$Query$GetUser(variables: Variables$Query$GetUser(id: 1)),
);

final user = result.parsedData!.user;
print(user.name);                   // 强类型!
```

类型安全 + IDE 补全,**生产环境必备**。

---

## 九、REST vs GraphQL

| 维度 | REST | GraphQL |
| --- | --- | --- |
| 端点 | 多个(/users,/posts...) | 一个(/graphql) |
| 字段控制 | 后端定 | 前端按需要 |
| 类型 | 一般弱(JSON 任意) | 强 schema |
| 缓存 | HTTP 层(Cache-Control) | 客户端缓存(更复杂) |
| 上传文件 | 直接 FormData | 需要 multipart 扩展 |
| 学习曲线 | 平 | 陡 |
| 工具链 | Postman + 手写 | GraphiQL + codegen |
| 最适合 | 简单 CRUD、文件上传 | 复杂查询、多客户端、字段差异大 |

**经验**:
- 后端已经是 REST → 用 Dio + Retrofit
- 后端是 GraphQL(Apollo、Hasura、AWS AppSync 等)→ graphql_flutter + codegen
- **不要为了用 GraphQL 而上 GraphQL**,这是后端架构决定的,不是前端选的

---

## 十、错误处理与重试

### 重试:dio_smart_retry

```yaml
dependencies:
  dio_smart_retry: ^6.0.0
```

```dart
dio.interceptors.add(RetryInterceptor(
  dio: dio,
  retries: 3,
  retryDelays: const [
    Duration(seconds: 1),
    Duration(seconds: 2),
    Duration(seconds: 4),
  ],
));
```

### 缓存:dio_cache_interceptor

```yaml
dependencies:
  dio_cache_interceptor: ^3.5.0
```

```dart
final options = CacheOptions(
  store: MemCacheStore(),
  policy: CachePolicy.request,
  hitCacheOnErrorExcept: [401, 403],
  maxStale: const Duration(days: 7),
);

dio.interceptors.add(DioCacheInterceptor(options: options));
```

请求自动缓存,网络挂了用旧数据兜底。

---

## 十一、HTTPS / 证书 / 抓包

### 自签名证书(测试)

```dart
(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
  return HttpClient()
    ..badCertificateCallback = (cert, host, port) => true;     // ⚠️ 仅测试!
};
```

### 抓包(Charles / Fiddler)

```dart
(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
  return HttpClient()
    ..findProxy = (uri) => 'PROXY 192.168.1.10:8888'           // 代理 IP:端口
    ..badCertificateCallback = (cert, host, port) => true;
};
```

加完就能在 Charles 里看到所有请求。

---

## 十二、推荐组合

```
小项目  : http 包,直接写
中型     : Dio + Interceptor + json_serializable
中大型   : Dio + Retrofit + json_serializable + 错误统一处理
GraphQL : graphql_flutter + graphql_codegen
极大型   : 自研 Repo 层,屏蔽底层(REST/GraphQL/缓存)细节
```

---

## 十三、和已学知识的串联

- 网络请求拿到的数据 → 喂给 Cubit/Riverpod NotifierProvider → emit 新状态 → UI 重建
- Dio 的 `cancelToken` 配合 Widget 的 `dispose`(回顾 06):页面销毁时取消请求
- 401 拦截器配合 go_router(回顾 12):刷 Token 失败 → `context.go('/login')`
- Retrofit 生成的 Api 类配合 get_it / Riverpod(回顾 11):一次注入,全局复用

---

## 十四、心智模型

```
原始 HTTP    : 自己拼请求、解析、错处理     适合极简
Dio          : HTTP + 拦截器 + 取消 + 上传   实战标杆
Dio+Retrofit : 上面 + 注解化接口             大项目首选
GraphQL      : 改协议,客户端控制查询         后端配合时用
```

**不管用什么,Repo 层都要有**。UI 永远不要直接调 Dio 或 GraphQLClient,中间隔一层抽象,后面无论换网络库、换协议、加缓存都不痛。
