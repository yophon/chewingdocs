# 音视频采集、Track 与 MediaStream

WebRTC 里真正流动的是 Track。MediaStream 只是把一组 Track 绑在一起。

> 一句话先记住:**Track 是一条音频或视频轨,MediaStream 是轨道集合,RTCPeerConnection 发送的是 Track**。

---

## 一、采集本地流

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720, frameRate: 30 },
  audio: { echoCancellation: true, noiseSuppression: true }
})
```

拿轨道:

```js
const videoTrack = stream.getVideoTracks()[0]
const audioTrack = stream.getAudioTracks()[0]
```

---

## 二、查看实际采集参数

```js
console.log(videoTrack.getSettings())
console.log(audioTrack.getSettings())
```

约束是"希望",settings 是"实际"。摄像头不支持 1080p 时,浏览器可能降级,也可能报错。

---

## 三、静音、关摄像头、释放设备

静音:

```js
audioTrack.enabled = false
```

关摄像头画面:

```js
videoTrack.enabled = false
```

释放设备:

```js
stream.getTracks().forEach((track) => track.stop())
```

`enabled=false` 不等于 `stop()`。

---

## 四、替换 Track

摄像头切换、屏幕共享常用 `replaceTrack`:

```js
const sender = pc.getSenders().find((s) => s.track?.kind === "video")
await sender.replaceTrack(newVideoTrack)
```

好处是尽量不重新建 PeerConnection。是否需要重新协商取决于编码能力和方向变化。

---

## 五、控制发送码率

```js
const sender = pc.getSenders().find((s) => s.track?.kind === "video")
const params = sender.getParameters()
params.encodings = [{ maxBitrate: 1_500_000, maxFramerate: 30 }]
await sender.setParameters(params)
```

这比手改 SDP 稳。

---

## 六、远端 Track

```js
pc.ontrack = (event) => {
  const [stream] = event.streams
  remoteVideo.srcObject = stream
}
```

多人会议里不要只维护一个 remoteVideo。要按 peerId / trackId 管理。

---

## 七、踩坑提醒

1. **静音时 stop 音频轨**——恢复要重新授权或重新采集。
2. **切屏共享重建整个连接**——优先 replaceTrack。
3. **不看 getSettings**——以为发了 1080p,实际可能是 480p。
4. **多人房间不管理 trackId**——远端画面会串。
5. **离开页面不 stop**——摄像头和麦克风泄漏。

下一篇:`21-DataChannel.md`。
