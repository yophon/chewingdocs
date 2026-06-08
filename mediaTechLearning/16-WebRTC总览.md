# WebRTC 总览

WebRTC 不是"浏览器视频 API",它是一整套低延迟实时通信栈。

> 一句话先记住:**WebRTC 负责在不可信网络里建立安全的低延迟媒体通道**。API 只是表面,真正核心是协商、穿透、加密、RTP 传输、拥塞控制和质量反馈。

---

## 一、一通 WebRTC 电话发生了什么

```text
getUserMedia 采集音视频
  -> RTCPeerConnection 加轨
  -> createOffer / createAnswer 生成 SDP
  -> 信令服务器交换 SDP
  -> ICE 收集候选地址
  -> STUN / TURN 尝试连通
  -> DTLS 握手
  -> SRTP 传音视频
  -> RTCP 回传质量
```

信令服务器不传媒体,只帮双方交换信息。媒体通常点对点或经 SFU / TURN 转发。

---

## 二、WebRTC 组件表

| 组件 | 作用 |
| --- | --- |
| MediaStream / Track | 本地或远端音视频轨 |
| RTCPeerConnection | 连接和媒体传输核心 |
| SDP | 双方能力描述 |
| ICE | 找可连通路径 |
| STUN | 发现公网映射地址 |
| TURN | 直连失败时中继 |
| RTP / SRTP | 传媒体包 |
| RTCP | 质量反馈 |
| DataChannel | 传任意数据 |

---

## 三、信令不是标准的一部分

WebRTC 不规定信令协议。你可以用:

- WebSocket
- HTTP polling
- SSE
- 业务已有消息通道

只要能交换:

```text
offer
answer
ice candidate
```

就行。

---

## 四、最小连接骨架

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
})

const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
stream.getTracks().forEach((track) => pc.addTrack(track, stream))

pc.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0]
}

pc.onicecandidate = (event) => {
  if (event.candidate) sendSignal({ candidate: event.candidate })
}
```

这只是骨架。生产还需要状态机、重连、错误处理、TURN、统计指标。

---

## 五、WebRTC 适合什么

适合:

- 视频会议
- 语音通话
- 在线课堂互动
- 远程控制
- 低延迟连麦

不适合:

- 百万人直播分发
- 大文件可靠传输
- 可接受 10 秒延迟的普通点播

直播和会议不是一回事。会议要低延迟,直播要规模和成本。

---

## 六、踩坑提醒

1. **没有 TURN 就上线**——一定会有用户连不上。
2. **以为信令传媒体**——信令只交换协商信息。
3. **不处理 ICE 状态**——黑屏时不知道卡在哪。
4. **Mesh 做大房间**——用户带宽会炸。
5. **不上报 getStats**——质量问题没法查。

下一篇:`17-SDP 与 Offer / Answer.md`。
