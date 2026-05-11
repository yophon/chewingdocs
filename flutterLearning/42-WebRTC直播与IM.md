# Flutter WebRTC、直播与 IM

实时通信(RTC)/ 直播 / IM 这三件事的客户端核心都是**长连接 + 流媒体**。一篇讲清。

---

## 一、技术全景

```
IM(消息)                ←→ 长连接 + 文本消息
WebRTC(视频通话)        ←→ 端到端音视频流(P2P 或 SFU)
直播(一对多)            ←→ 推流(RTMP/SRT) → 流媒体服务器 → 拉流(HLS/FLV/WebRTC)
连麦 / 实时互动直播     ←→ WebRTC 推流 → 服务端转码 → CDN
```

| 场景 | 协议 | 延迟 |
| --- | --- | --- |
| 直播(传统) | RTMP 推、HLS 拉 | 5-30s |
| 直播(低延迟) | SRT 推、HTTP-FLV / LL-HLS | 1-5s |
| 直播(实时) | WebRTC | 200ms-1s |
| 视频通话 | WebRTC | 100-300ms |
| IM 文本 | WebSocket | 几十 ms |

---

## 二、IM:长连接客户端

### 1. WebSocket 基础

```yaml
dependencies:
  web_socket_channel: ^3.0.1
```

```dart
final channel = WebSocketChannel.connect(Uri.parse('wss://im.example.com/ws'));

channel.stream.listen((msg) {
  print('收到: $msg');
});

channel.sink.add(jsonEncode({'type': 'text', 'content': 'hi'}));

await channel.sink.close();
```

### 2. 工程化封装

裸 WebSocket 不能直接用,必须包一层:

```dart
class ImClient {
  ImClient(this.url, this.token);
  final String url;
  final String token;

  WebSocketChannel? _ch;
  Timer? _heartbeat;
  int _retry = 0;
  final _msgController = StreamController<ImMessage>.broadcast();
  Stream<ImMessage> get messages => _msgController.stream;

  Future<void> connect() async {
    try {
      _ch = WebSocketChannel.connect(
        Uri.parse('$url?token=$token'),
        protocols: ['im-v1'],
      );
      _ch!.stream.listen(
        _onMessage,
        onError: (e) => _reconnect(),
        onDone: _reconnect,
      );
      _retry = 0;
      _startHeartbeat();
    } catch (_) {
      _reconnect();
    }
  }

  void _startHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(Duration(seconds: 30), (_) {
      _ch?.sink.add(jsonEncode({'type': 'ping'}));
    });
  }

  void _onMessage(dynamic data) {
    final m = jsonDecode(data) as Map<String, dynamic>;
    if (m['type'] == 'pong') return;
    _msgController.add(ImMessage.fromJson(m));
  }

  void _reconnect() {
    _heartbeat?.cancel();
    _ch?.sink.close();
    final delay = min(30, pow(2, _retry).toInt());      // 指数退避
    _retry++;
    Future.delayed(Duration(seconds: delay), connect);
  }

  Future<String> send(ImMessage msg) async {
    final ackId = uuid();
    _ch!.sink.add(jsonEncode({...msg.toJson(), 'ackId': ackId}));
    return ackId;       // 等 server 回 ack
  }

  Future<void> close() async {
    _heartbeat?.cancel();
    await _ch?.sink.close();
    await _msgController.close();
  }
}
```

要点:
- **指数退避 + 抖动**:别死磕重连
- **心跳**:30s 一次 `ping`,服务端 `pong`
- **网络变化重连**(`connectivity_plus` 监听网络切换)
- **Ack 机制**:每条消息带 ack 标识

### 3. 离线消息拉取

回顾 40。登录后用 `lastSeq` 增量拉:

```dart
Future<void> sync() async {
  final last = await db.maxSeq();
  while (true) {
    final batch = await api.fetchAfter(last, limit: 100);
    if (batch.isEmpty) break;
    await db.insertAll(batch);
    last = batch.last.seq;
  }
}
```

### 4. Socket.IO

`socket_io_client` 也常见,自带重连 / room / namespace:

```yaml
dependencies:
  socket_io_client: ^3.0.0
```

```dart
final socket = io.io('https://api.example.com', {
  'transports': ['websocket'],
  'auth': {'token': token},
});
socket.on('message', (data) => print(data));
socket.emit('send', {'to': 'u2', 'text': 'hi'});
```

---

## 三、WebRTC 基础

### 1. 概念

```
Caller(A)                Signaling Server                Callee(B)
   |   ---- offer SDP ----->                                |
   |                          ---- offer ----->             |
   |   <---- answer ----                                    |
   |                          <---- answer ----             |
   |   <---- ICE candidates ---->                           |
   |   <======= P2P Media Stream =======>                   |
```

- **SDP**:描述媒体能力(编解码、分辨率)
- **ICE candidate**:可达地址候选(本地 IP、公网 IP via STUN、TURN 中转)
- **STUN / TURN**:打洞 / 中转
- **Signaling**:WebSocket 等任何信道,WebRTC 自己**不规定信令**

### 2. flutter_webrtc

```yaml
dependencies:
  flutter_webrtc: ^0.12.1
```

iOS 加 Info.plist:

```xml
<key>NSMicrophoneUsageDescription</key><string>语音通话</string>
<key>NSCameraUsageDescription</key><string>视频通话</string>
```

Android 加:

```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

### 3. 一对一视频通话最简版

```dart
class VideoCall {
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  RTCPeerConnection? _pc;
  MediaStream? _localStream;

  Future<void> init() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();

    _localStream = await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': {'facingMode': 'user'},
    });
    _localRenderer.srcObject = _localStream;

    _pc = await createPeerConnection({
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'turn:turn.example.com:3478', 'username': 'u', 'credential': 'p'},
      ],
    });

    _localStream!.getTracks().forEach((t) => _pc!.addTrack(t, _localStream!));

    _pc!.onTrack = (e) {
      if (e.streams.isNotEmpty) _remoteRenderer.srcObject = e.streams[0];
    };

    _pc!.onIceCandidate = (cand) {
      signaling.send({'type': 'ice', 'cand': cand.toMap()});
    };
  }

  Future<void> call() async {
    final offer = await _pc!.createOffer();
    await _pc!.setLocalDescription(offer);
    signaling.send({'type': 'offer', 'sdp': offer.sdp, 'sdpType': offer.type});
  }

  Future<void> onSignal(Map<String, dynamic> msg) async {
    switch (msg['type']) {
      case 'offer':
        await _pc!.setRemoteDescription(RTCSessionDescription(msg['sdp'], msg['sdpType']));
        final answer = await _pc!.createAnswer();
        await _pc!.setLocalDescription(answer);
        signaling.send({'type': 'answer', 'sdp': answer.sdp, 'sdpType': answer.type});
      case 'answer':
        await _pc!.setRemoteDescription(RTCSessionDescription(msg['sdp'], msg['sdpType']));
      case 'ice':
        final c = msg['cand'];
        await _pc!.addCandidate(RTCIceCandidate(c['candidate'], c['sdpMid'], c['sdpMLineIndex']));
    }
  }

  Future<void> hangup() async {
    await _localStream?.dispose();
    await _pc?.close();
    await _localRenderer.dispose();
    await _remoteRenderer.dispose();
  }
}

// UI
RTCVideoView(_localRenderer, mirror: true)
RTCVideoView(_remoteRenderer)
```

### 4. 多人会议:SFU / MCU

P2P 只适合 1v1。3 人以上:
- **MCU**:服务端混流再下发(占带宽小,服务端开销大)
- **SFU**:服务端转发,客户端各自接(主流方案)

开源 SFU:
- **mediasoup**(Node)
- **Janus**(C)
- **Pion**(Go)
- **LiveKit**(Go,SDK 完整,**Flutter 一等支持**)
- **Jitsi**(Java,会议级)

---

## 四、LiveKit:Flutter 实时通信首选

```yaml
dependencies:
  livekit_client: ^2.3.5
```

```dart
final room = Room();
await room.connect('wss://your-livekit', token);

// 发布麦 + 摄像头
await room.localParticipant?.setMicrophoneEnabled(true);
await room.localParticipant?.setCameraEnabled(true);

// 监听新参与者
room.addListener(() {
  for (final p in room.participants.values) {
    p.videoTracks.firstOrNull?.let((track) {
      // 渲染
    });
  }
});

// UI
ParticipantWidget(room.localParticipant!)
for (final p in room.participants.values) ParticipantWidget(p)
```

LiveKit 完全开源,自己部署免费;或用云版本付费。

---

## 五、声网 / 腾讯 RTC / 即构(国内方案)

国内三大商业 RTC:

| 厂 | SDK 名 | 特点 |
| --- | --- | --- |
| 声网 Agora | agora_rtc_engine | 全球节点,质量稳 |
| 腾讯 TRTC | tencent_rtc_sdk | 国内带宽好,有 IM |
| 即构 ZEGO | zego_express_engine | 互动直播主打 |

接入流程类似:Token → 加入频道 → 发布流 → 订阅他人。**国内做实时音视频几乎都是这三选一**(自研 mediasoup 成本极高)。

```dart
// 以 Agora 为例
final engine = createAgoraRtcEngine();
await engine.initialize(RtcEngineContext(appId: 'xxx'));
await engine.enableVideo();
await engine.joinChannel(token: t, channelId: 'room1', uid: 0, options: ChannelMediaOptions());
```

---

## 六、直播推流(RTMP / SRT)

### 1. 主播端(推流)

```yaml
dependencies:
  flutter_rtmp_publisher: ^x
  # 或:
  apivideo_live_stream: ^1.2.1
```

```dart
final controller = ApiVideoLiveStreamController(
  initialAudioConfig: AudioConfig(bitrate: 128000),
  initialVideoConfig: VideoConfig(bitrate: 2000000, resolution: Resolution.RESOLUTION_720, fps: 30),
);

await controller.initialize();
await controller.startStreaming(
  streamKey: 'YOUR_STREAM_KEY',
  url: 'rtmp://live.example.com/app',
);
```

直播服务端:**SRS / nginx-rtmp / WowzaCDN**。或第三方 CDN:腾讯云直播、阿里云直播、AWS IVS。

### 2. 观众端(拉流)

```yaml
dependencies:
  video_player: ^2.9.2
  better_player: ^0.0.85   # 更全功能
  fijkplayer: ^0.11.0      # 基于 ijkplayer,延迟更低
```

```dart
final player = BetterPlayerController(
  BetterPlayerConfiguration(),
  betterPlayerDataSource: BetterPlayerDataSource(
    BetterPlayerDataSourceType.network,
    'https://live.example.com/app/stream.m3u8',     // HLS
    // 或 'http://live.example.com/app/stream.flv',  // FLV
    liveStream: true,
  ),
);

BetterPlayer(controller: player)
```

| 协议 | 延迟 | 兼容 |
| --- | --- | --- |
| HLS(.m3u8) | 5-30s | 全平台 |
| HTTP-FLV | 1-3s | iOS Safari 不支持原生 |
| LL-HLS | 1-3s | 较新 |
| WebRTC | 200ms-1s | 需要服务端支持 |

低延迟直播现代选择:**WebRTC(LiveKit / Agora)** 或 **LL-HLS**。

---

## 七、连麦 / 互动直播

主播 + 嘉宾用 WebRTC,他们的混流通过服务端推 RTMP 给观众:

```
主播 (WebRTC) ──┐
嘉宾 (WebRTC) ──┼─→ SFU/混流服务 ─→ RTMP/HLS ─→ 普通观众
观众A ─────────┘
```

声网 / 腾讯 / 即构都封装了"互动直播"模式,直接用现成 SDK 就行,不用自己搭。

---

## 八、视频播放进阶

### 1. 缓存(滑滑滑场景)

`cached_video_player` / `chewie` + 自定义 cache:

```dart
import 'package:cached_video_player_plus/cached_video_player_plus.dart';

final controller = CachedVideoPlayerPlusController.networkUrl(
  Uri.parse(url),
  invalidateCacheIfOlderThan: Duration(days: 7),
);
```

### 2. 预加载

短视频流场景常用:**滑到第 N 个时,预加载第 N+1 / N+2**(回顾 40):

```dart
class VideoPreloader {
  final _pool = <String, VideoPlayerController>{};

  Future<void> preload(String url) async {
    if (_pool.containsKey(url)) return;
    final c = VideoPlayerController.networkUrl(Uri.parse(url));
    await c.initialize();
    _pool[url] = c;
  }

  VideoPlayerController? consume(String url) => _pool.remove(url);
}
```

### 3. 倍速 / 字幕 / 选集

`better_player` / `chewie` 都封装了。复杂场景自己包一层:

```dart
controller.setPlaybackSpeed(1.5);
controller.setAudioTrack(...);
controller.setSubtitleSource(...);
```

---

## 九、音频通话 / 语音房

### 1. 一对一语音

把上面 WebRTC 的视频流去掉就是语音。资源最省。

### 2. 多人语音房(Clubhouse 类)

直接用 LiveKit / Agora。客户端核心:
- "上麦 / 下麦"= publish / unpublish audio
- 显示当前发言者:监听 `audioLevel`

```dart
participant.events.listen((event) {
  if (event is ParticipantSpeakingChanged) {
    setState(() => _speakers[participant.identity] = event.isSpeaking);
  }
});
```

### 3. 实时变声 / 美声

部分 SDK(声网 / Agora)支持原生变声。复杂的:服务端处理后下发,或本地用 ffmpeg 实时滤镜(开销大)。

---

## 十、IM + RTC + 直播 综合架构

很多产品(如直播 / 社交)三件事都要:

```
长连(IM)        : 文本 / 礼物 / 弹幕 / 控制信令
推流 / 拉流(直播): 主播一对多
WebRTC(连麦)   : 主播 + 嘉宾多端互通
```

**信令复用 IM 长连**:连麦邀请、应答、挂断,都通过同一个 WebSocket 走。不要为信令再开一条 socket。

```dart
// IM 一条 socket,多种 type
{type: 'chat',     content: ...}
{type: 'gift',     ...}
{type: 'rtc.offer', ...}
{type: 'rtc.answer', ...}
{type: 'rtc.ice', ...}
```

---

## 十一、性能 / 稳定性要点

### 1. 内存 / CPU

- WebRTC 不渲染时一定要 dispose RTCVideoRenderer
- 视频缓存控制(数量上限)
- 直播页退出 controller.dispose
- 摄像头释放(不然下次 getUserMedia 失败)

### 2. 网络弱 / 切换

- 听 `connectivity_plus`,wifi → 4G 自动重连
- 直播观众侧弱网降画质(SDK 自带 ABR)
- WebRTC 有 SVC / 自适应码率

### 3. 后台 / 锁屏

- iOS:开 Background Modes → Audio / VoIP
- Android:前台服务通知保持
- iOS VoIP 推送(CallKit + PushKit)

### 4. 通话 UI

CallKit / ConnectionService 集成(让通话像系统电话):

```yaml
flutter_callkit_incoming: ^2.0.4+2
```

```dart
final params = CallKitParams(
  id: callId,
  nameCaller: 'Alice',
  appName: 'MyApp',
  type: 1,                       // 1 = video
);
await FlutterCallkitIncoming.showCallkitIncoming(params);
```

---

## 十二、自研 vs 用商业 SDK

| 自研 | 商业 SDK |
| --- | --- |
| 全可控 / 无月费 | 上手快、QoS 有保障 |
| 需要 RTC / 流媒体 + 后端 + 运维 | 开通 → 接 SDK |
| 全球部署成本极高 | 厂商有 100+ 节点 |
| 适合大厂 / 长期产品 | 99% 项目 |

**经验**:除非你公司做"实时音视频"本身就是核心业务,**直接选 LiveKit(开源)/ 声网(商业)**。

---

## 十三、心智模型

```
长连接是骨架
  IM     ─→ WebSocket 文本消息
  RTC    ─→ WebSocket 信令 + UDP 媒体
  直播   ─→ RTMP 推 / HLS 拉

延迟越低,成本越高
  HLS(秒级)        最便宜
  HTTP-FLV(秒级)   便宜
  LL-HLS(秒以下)   中等
  WebRTC(<300ms)   贵(SFU 服务器、TURN 流量)

互动越多,SDK 越值得
  纯文本 IM         自研 / Socket.IO
  1v1 通话          flutter_webrtc + 自部署 SFU 也行
  多人会议 / 直播   LiveKit / Agora,别自己折腾
```

**实时通信工程**:90% 的复杂度在服务端 + 网络。客户端记两件事:**正确管理 PeerConnection 生命周期 + 长连接的稳定重连**。

---

## 十四、和已学知识的串联

- 23 音视频:本地播放器 / 录音,本篇是网络上的延伸
- 26 推送 + CallKit/VoIP:接听离线呼叫
- 16 平台通道:CallKit、PushKit 都要原生侧
- 36 错误处理:网络重连、SDK 错误码统一处理
- 37 Isolate:大文件 / 大量消息解析放后台
- 39 Firebase:FCM 配合 VoIP 通知
- 40 实战:社交 / IM App 的核心都在这一篇
- 11 DI:把 ImClient / Room 注入,方便 mock 测试
