# SDP 与 Offer / Answer

WebRTC 建连前,双方要先说清楚"我能收发什么"。这个能力描述就是 SDP。

> 一句话先记住:**Offer / Answer 是协商流程,SDP 是协商内容**。SDP 不负责传媒体,它只是告诉对方编码、方向、网络候选、加密指纹等信息。

---

## 一、Offer / Answer 流程

```text
A createOffer
A setLocalDescription
A -> signaling -> B
B setRemoteDescription
B createAnswer
B setLocalDescription
B -> signaling -> A
A setRemoteDescription
```

代码骨架:

```js
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
sendSignal({ type: "offer", sdp: offer.sdp })
```

接收方:

```js
await pc.setRemoteDescription(offer)
const answer = await pc.createAnswer()
await pc.setLocalDescription(answer)
sendSignal({ type: "answer", sdp: answer.sdp })
```

---

## 二、SDP 里有什么

SDP 大致长这样:

```text
v=0
o=...
s=-
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111
a=rtpmap:111 opus/48000/2
m=video 9 UDP/TLS/RTP/SAVPF 96
a=rtpmap:96 VP8/90000
a=fingerprint:sha-256 ...
a=setup:actpass
```

重点:

| 行 | 意义 |
| --- | --- |
| `m=` | 媒体类型和 payload type |
| `a=rtpmap` | payload type 对应编码 |
| `a=sendrecv` | 收发方向 |
| `a=fingerprint` | DTLS 指纹 |
| `a=ice-ufrag/pwd` | ICE 凭据 |

---

## 三、不要手写 SDP

生产里不要靠字符串硬拼 SDP。让浏览器生成。少数场景可以 SDP munging,但要很谨慎:

- 改编码优先级
- 限制码率
- 调整 profile

现代 WebRTC 更推荐用 API 控制 sender 参数:

```js
const sender = pc.getSenders().find((s) => s.track?.kind === "video")
const params = sender.getParameters()
params.encodings = [{ maxBitrate: 1_500_000 }]
await sender.setParameters(params)
```

---

## 四、协商时机

加轨、删轨、替换方向可能触发重新协商:

```js
pc.onnegotiationneeded = async () => {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  sendSignal({ type: "offer", sdp: offer.sdp })
}
```

生产要防止双方同时发 offer 的 glare 问题。简单 demo 不处理,多人系统会踩。

---

## 五、踩坑提醒

1. **setLocal / setRemote 顺序错**——状态机会直接报错。
2. **双方同时 offer**——需要 polite peer 策略或统一发起方。
3. **手改 SDP 无测试**——兼容性灾难。
4. **信令消息乱序**——candidate 可能早于 remote description。
5. **不打印 signalingState**——协商失败很难查。

下一篇:`18-ICE、STUN、TURN.md`。
