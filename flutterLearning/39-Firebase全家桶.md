# Flutter Firebase 全家桶

Firebase 是 Google 的"后端即服务"全家桶,Flutter 端官方支持最全。**国内访问受限**,海外 / 出海项目首选。

---

## 一、为什么用 Firebase

| 自己搭 | Firebase |
| --- | --- |
| 后端服务器 | Firestore / Realtime DB |
| 文件存储 | Cloud Storage |
| 身份系统 | Authentication |
| 函数计算 | Cloud Functions |
| 推送 | FCM(回顾 26) |
| 崩溃监控 | Crashlytics |
| 分析 | Analytics |
| 灰度配置 | Remote Config |
| 性能监控 | Performance |
| AB 测试 | A/B Testing(基于 Remote Config + Analytics) |

零运维 + 实时同步 + 免费额度够用 = MVP 起步神器。

---

## 二、初始化

```bash
dart pub global activate flutterfire_cli
flutterfire configure
```

会自动创建 `lib/firebase_options.dart`、配置 iOS / Android plist / google-services.json。

```dart
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(MyApp());
}
```

依赖按需加:

```yaml
dependencies:
  firebase_core: ^3.6.0
  firebase_auth: ^5.3.1
  cloud_firestore: ^5.4.4
  firebase_storage: ^12.3.4
  firebase_messaging: ^15.1.3
  firebase_remote_config: ^5.1.3
  firebase_analytics: ^11.3.3
  firebase_crashlytics: ^4.1.3
  firebase_performance: ^0.10.0+8
  cloud_functions: ^5.1.3
```

---

## 三、Authentication:身份系统

### 1. 邮箱 / 密码

```dart
final auth = FirebaseAuth.instance;

await auth.createUserWithEmailAndPassword(email: e, password: p);
await auth.signInWithEmailAndPassword(email: e, password: p);
await auth.signOut();
await auth.sendPasswordResetEmail(email: e);
```

### 2. 第三方登录

```yaml
google_sign_in: ^6.2.1
sign_in_with_apple: ^6.1.2
```

```dart
// Google
final googleUser = await GoogleSignIn().signIn();
final googleAuth = await googleUser!.authentication;
final credential = GoogleAuthProvider.credential(
  accessToken: googleAuth.accessToken,
  idToken: googleAuth.idToken,
);
await auth.signInWithCredential(credential);

// Apple(iOS 必须给 Apple 登录,审核要求)
final appleCred = await SignInWithApple.getAppleIDCredential(
  scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
);
final oauth = OAuthProvider('apple.com').credential(
  idToken: appleCred.identityToken,
);
await auth.signInWithCredential(oauth);
```

### 3. 手机号(短信验证)

```dart
await auth.verifyPhoneNumber(
  phoneNumber: '+8613800138000',
  verificationCompleted: (cred) => auth.signInWithCredential(cred),  // 自动检测
  verificationFailed: (e) => print(e),
  codeSent: (verificationId, _) async {
    final smsCode = await _askUser();          // 弹框让用户填
    final cred = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    await auth.signInWithCredential(cred);
  },
  codeAutoRetrievalTimeout: (_) {},
);
```

### 4. 监听登录态

```dart
auth.authStateChanges().listen((user) {
  if (user == null) {
    Navigator.pushReplacementNamed(context, '/login');
  } else {
    Navigator.pushReplacementNamed(context, '/home');
  }
});
```

或直接 StreamBuilder:

```dart
StreamBuilder<User?>(
  stream: FirebaseAuth.instance.authStateChanges(),
  builder: (_, snap) {
    if (snap.connectionState == ConnectionState.waiting) return SplashPage();
    return snap.hasData ? HomePage() : LoginPage();
  },
)
```

---

## 四、Firestore:NoSQL 实时数据库

### 1. 数据模型

```
collection 用户(users)
  └─ document(uid_xxx)
       ├─ name: 'Alice'
       ├─ avatar: '...'
       └─ subcollection(orders)
            └─ document(...)
```

不要把所有东西塞进一个文档(单文档 1MB 上限)。**子集合**适合 1-N。

### 2. CRUD

```dart
final users = FirebaseFirestore.instance.collection('users');

// 写
await users.doc('u1').set({
  'name': 'Alice',
  'createdAt': FieldValue.serverTimestamp(),
});

// 读单条
final doc = await users.doc('u1').get();
final data = doc.data();

// 更新
await users.doc('u1').update({'name': 'Bob'});

// 删除
await users.doc('u1').delete();
```

### 3. 查询

```dart
final snap = await users
  .where('age', isGreaterThanOrEqualTo: 18)
  .where('city', isEqualTo: 'Shanghai')
  .orderBy('createdAt', descending: true)
  .limit(20)
  .get();

for (final doc in snap.docs) {
  print(doc.data());
}
```

复合 where 条件需要建**复合索引**(控制台会提示)。

### 4. 实时监听(Firestore 杀手级)

```dart
users.doc('u1').snapshots().listen((snap) {
  print('实时数据:${snap.data()}');
});

// 集合监听
users.where('online', isEqualTo: true).snapshots().listen((snap) {
  for (final change in snap.docChanges) {
    switch (change.type) {
      case DocumentChangeType.added:    print('新增 ${change.doc.id}');
      case DocumentChangeType.modified: print('修改 ${change.doc.id}');
      case DocumentChangeType.removed:  print('删除 ${change.doc.id}');
    }
  }
});
```

UI 直接 StreamBuilder:

```dart
StreamBuilder<QuerySnapshot>(
  stream: users.orderBy('updatedAt').snapshots(),
  builder: (_, snap) {
    if (!snap.hasData) return Loading();
    return ListView(
      children: snap.data!.docs.map((d) => UserTile(d.data())).toList(),
    );
  },
)
```

### 5. 事务 / 批量写

```dart
// 事务(读 + 写,自动 retry)
await FirebaseFirestore.instance.runTransaction((tx) async {
  final snap = await tx.get(users.doc('u1'));
  final n = snap.data()!['count'] as int;
  tx.update(users.doc('u1'), {'count': n + 1});
});

// Batch(纯写)
final batch = FirebaseFirestore.instance.batch();
batch.set(users.doc('u1'), {...});
batch.update(users.doc('u2'), {...});
batch.delete(users.doc('u3'));
await batch.commit();
```

### 6. 类型安全:withConverter

```dart
final usersRef = FirebaseFirestore.instance
  .collection('users')
  .withConverter<User>(
    fromFirestore: (snap, _) => User.fromJson(snap.data()!),
    toFirestore: (user, _) => user.toJson(),
  );

final user = (await usersRef.doc('u1').get()).data();   // User?
await usersRef.doc('u1').set(User(...));
```

配合 freezed(回顾 34)爽到飞起。

### 7. 离线支持

Firestore 默认开启离线缓存。**没网时 set / update 会缓存,联网自动同步**。

```dart
FirebaseFirestore.instance.settings = Settings(
  persistenceEnabled: true,
  cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
);
```

---

## 五、Cloud Storage:文件存储

```dart
final ref = FirebaseStorage.instance.ref('avatars/u1.jpg');

// 上传
await ref.putFile(File('/path/to/avatar.jpg'));
await ref.putData(bytes);

// 上传带进度
final task = ref.putFile(file);
task.snapshotEvents.listen((s) {
  print('${s.bytesTransferred}/${s.totalBytes}');
});
await task;

// 拿下载 URL
final url = await ref.getDownloadURL();

// 删除
await ref.delete();
```

UI 直接用:

```dart
Image.network(url)         // 或 cached_network_image
```

权限在 Storage Rules 配:

```
match /avatars/{userId} {
  allow read: if true;
  allow write: if request.auth.uid == userId
            && request.resource.size < 5 * 1024 * 1024;
}
```

---

## 六、Cloud Functions:无服务器函数

后端逻辑写在 Functions 里(TypeScript / Python),Flutter 端调:

```dart
final callable = FirebaseFunctions.instance.httpsCallable('addOrder');
final result = await callable.call({'productId': 'p1', 'count': 2});
print(result.data);
```

Functions 端(Node):

```ts
import {onCall} from 'firebase-functions/v2/https';

export const addOrder = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '没登录');

  await db.collection('orders').add({uid, ...req.data});
  return {ok: true};
});
```

适合:
- 需要密钥的逻辑(如调第三方支付)
- 跨集合的复杂事务
- 触发型(用户注册时发欢迎邮件)
- 定时任务(`onSchedule`)

---

## 七、Cloud Messaging(FCM)

回顾 26。Flutter 端核心:

```dart
final fcm = FirebaseMessaging.instance;
await fcm.requestPermission();
final token = await fcm.getToken();
await sendTokenToBackend(token);

// 前台
FirebaseMessaging.onMessage.listen((msg) {
  showLocalNotification(msg);    // 前台不会自动弹通知
});

// 点击进入(冷启动)
final initial = await FirebaseMessaging.instance.getInitialMessage();
if (initial != null) handleDeeplink(initial);

// 后台点击
FirebaseMessaging.onMessageOpenedApp.listen(handleDeeplink);
```

---

## 八、Analytics

```dart
final analytics = FirebaseAnalytics.instance;

// 事件
await analytics.logEvent(
  name: 'add_to_cart',
  parameters: {'product_id': 'p1', 'price': 99.0},
);

// 用户属性
await analytics.setUserId(id: uid);
await analytics.setUserProperty(name: 'plan', value: 'pro');

// 屏幕(配合 GoRouter)
NavigatorObserver get observer => FirebaseAnalyticsObserver(analytics: analytics);
```

事件命名规则:`xxx_yyy` 小写下划线,Google 建议遵循 GA4 规范。

---

## 九、Crashlytics:崩溃监控

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(...);

  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;

  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };

  runApp(MyApp());
}

// 手动上报非 fatal
FirebaseCrashlytics.instance.recordError(e, st, fatal: false);

// 加自定义信息(便于排查)
FirebaseCrashlytics.instance.setUserIdentifier(uid);
FirebaseCrashlytics.instance.setCustomKey('plan', 'pro');
FirebaseCrashlytics.instance.log('用户点了支付按钮');
```

混淆后崩溃堆栈 → 上传 symbols(回顾 19):

```bash
flutter build apk --release --obfuscate --split-debug-info=symbols
firebase crashlytics:symbols:upload --app=APP_ID symbols
```

---

## 十、Remote Config:动态配置 / 灰度

```dart
final rc = FirebaseRemoteConfig.instance;
await rc.setConfigSettings(RemoteConfigSettings(
  fetchTimeout: Duration(seconds: 10),
  minimumFetchInterval: Duration(hours: 1),
));
await rc.setDefaults({
  'show_new_feature': false,
  'banner_title': '欢迎',
});
await rc.fetchAndActivate();

// 用
final showFeature = rc.getBool('show_new_feature');
final title = rc.getString('banner_title');
```

控制台可按用户百分比 / 平台 / 国家分发不同值。**Feature Flag 不发版改 UI 行为**就靠它。

---

## 十一、Performance:性能监控

```dart
final trace = FirebasePerformance.instance.newTrace('parse_users');
await trace.start();
final users = await parseUsers();
trace.setMetric('count', users.length);
await trace.stop();

// 网络请求自动监控(http 请求)
final metric = FirebasePerformance.instance.newHttpMetric(
  'https://api.example.com/items', HttpMethod.Get,
);
await metric.start();
// ... 实际请求
await metric.stop();
```

控制台看慢请求、慢页面 trace。

---

## 十二、A/B 测试

= **Remote Config + Analytics**:

1. Remote Config 定义 `button_color`,默认 `red`
2. 控制台创建 A/B 实验,50% 用户 `red`,50% `green`
3. 客户端读 `button_color` 渲染
4. Analytics 跟踪 `purchase` 事件
5. 控制台自动算两组转化率,推荐获胜方

---

## 十三、App Check:防止滥用

防止有人拿 API key 直接刷你的 Firebase:

```dart
await FirebaseAppCheck.instance.activate(
  androidProvider: AndroidProvider.playIntegrity,
  appleProvider: AppleProvider.deviceCheck,
  webProvider: ReCaptchaV3Provider('YOUR_SITE_KEY'),
);
```

启用后只有"真 App"才能调你的 Firestore / Functions。

---

## 十四、安全规则速记

### Firestore Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 默认禁
    match /{document=**} { allow read, write: if false; }

    // 用户只能读写自己
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid;
    }

    // 订单仅本人可读
    match /orders/{orderId} {
      allow read: if request.auth.uid == resource.data.uid;
      allow create: if request.auth.uid == request.resource.data.uid;
      allow update, delete: if false;        // 只能用 Functions 改
    }
  }
}
```

**写规则跟写代码一样要测**,控制台有 Rules Playground。

---

## 十五、定价 / 免费额度(2026 概览)

| 服务 | 免费 | 付费 |
| --- | --- | --- |
| Auth | 50K MAU 免费 | $0.0055 / MAU |
| Firestore | 1 GiB 存储,50K 读/天 | 按读写计 |
| Storage | 5 GB | $0.026/GB/月 |
| Functions | 2M 次调用/月 | $0.4/百万次 |
| FCM | 完全免费 | — |
| Hosting | 10GB | $0.026/GB |

**MVP 阶段几乎不用花钱**;到几万 DAU 才需要认真考虑成本。Functions 的冷启动费用 + Firestore 读次数是最容易超的两项,留意。

---

## 十六、坑

### 1. iOS 推送证书

iOS 用 APNs Key 上传到 Firebase。错过了得重新申请。

### 2. Firestore 索引报错

新查询第一次跑会报"missing index",日志会给一个 URL,**点开就自动创建**,等 1-2 分钟生效。

### 3. 列表权限 vs 文档权限

`allow read` 可分 `get`(单条)和 `list`(查询)。常见漏洞:**`get` 限定到 uid,但 `list` 没限**,导致整个集合泄露。

### 4. Functions 区域选择

默认 `us-central1`,亚洲用户慢。指定 `asia-northeast1`(东京)/ `asia-east2`(香港)等。

### 5. 国内访问

国内手机几乎连不上 google APIs。**面向国内用户必须自建后端或用阿里云 / 腾讯云**。Firebase 适合海外 / 出海。

---

## 十七、和已学知识的串联

- 09 Riverpod / 10 Bloc:把 Firestore Stream 当数据源
- 13 网络请求:Dio 调 Functions 走 callable / HTTP
- 14 本地存储:Firestore 离线缓存替代部分 Hive 场景
- 26 推送:FCM 是这一节的延伸
- 19 打包发布:Crashlytics 上传符号
- 36 错误处理:Sentry 与 Crashlytics 二选一(或共存)
- 11 依赖注入:把 `FirebaseAuth.instance` 等通过 DI 注入,方便测试 mock

---

## 十八、心智模型

```
Firebase 是套件,不是单一产品
  ├─ 数据   : Firestore(实时 NoSQL) + Storage(文件)
  ├─ 身份   : Auth(注册登录) + App Check(防滥用)
  ├─ 计算   : Functions(无服务器后端)
  ├─ 通信   : FCM(推送)
  ├─ 监控   : Analytics + Crashlytics + Performance
  └─ 配置   : Remote Config + A/B Test

什么时候用 Firebase
  ✅ 出海项目 / 海外用户
  ✅ MVP / 创业早期
  ✅ 不想自建后端
  ✅ 实时协同 / IM 类
  ❌ 国内用户为主
  ❌ 复杂关系型数据
  ❌ 强一致性 / 海量金融
```

**一句话**:能省一个后端工程师 6 个月的时间。出海或个人项目几乎闭着眼上。
