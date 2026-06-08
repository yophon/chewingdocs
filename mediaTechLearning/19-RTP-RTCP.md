# RTP / RTCP

WebRTC 真正传音视频靠 RTP,加密后是 SRTP。RTCP 负责反馈质量。

> 一句话先记住:**RTP 传媒体包,RTCP 传质量反馈**。RTP 不保证可靠,它追求低延迟;丢了就丢了,靠抖动缓冲、重传、FEC、降码率补救。

---

## 一、RTP 包里有什么

RTP 头包含:

| 字段 | 作用 |
| --- | --- |
| payload type | 编码类型编号 |
| sequence number | 包序号 |
| timestamp | 媒体时间 |
| SSRC | 流标识 |

序号用来发现丢包,时间戳用来播放同步。

---

## 二、为什么不用 TCP 可靠传输

实时音视频怕等待。TCP 丢一个包,后面的字节都要等它重传,这叫队头阻塞。

实时媒体更常见策略:

```text
能补就补
补不了就跳过
优先保证继续播放
```

语音里 200ms 后补来的包通常已经没用了。

---

## 三、Jitter Buffer

网络包到达时间不均匀:

```text
20ms 一包,但到达可能是 18ms / 25ms / 15ms / 40ms
```

jitter buffer 做短暂缓冲和重排,把不稳定到达变成稳定播放。

缓冲大:

- 更抗抖动
- 延迟更高

缓冲小:

- 延迟低
- 更容易卡顿 / 断音

---

## 四、RTCP 反馈

RTCP 反馈:

- 丢包率
- 抖动
- RTT
- 接收码率
- NACK 请求重传
- PLI / FIR 请求关键帧

发送端根据反馈降码率、发关键帧、调整编码。

---

## 五、看 getStats

```js
const stats = await pc.getStats()
for (const report of stats.values()) {
  if (report.type === "inbound-rtp" || report.type === "outbound-rtp") {
    console.log(report)
  }
}
```

重点:

```text
packetsLost
jitter
roundTripTime
framesDropped
framesPerSecond
bytesSent / bytesReceived
```

---

## 六、踩坑提醒

1. **把 RTP 当可靠流**——它不是。
2. **只看带宽不看丢包**——低带宽和高丢包是两类问题。
3. **不采集 RTCP/getStats**——会议质量无法定位。
4. **关键帧请求太频繁**——会造成码率尖峰。
5. **忽略音频 jitter**——断音比视频糊更难忍。

下一篇:`20-音视频采集、Track 与 MediaStream.md`。
