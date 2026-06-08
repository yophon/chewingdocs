# 浏览器 Media API

浏览器音视频能力主要分三块:播放、采集、处理。不要把它们混成一个 API。

> 一句话先记住:**`HTMLMediaElement` 负责播放,`getUserMedia` 负责采集,`MediaStream` / `Track` 是浏览器里传递音视频的基本对象**。

---

## 一、播放:video / audio

```html
<video controls src="/video.mp4"></video>
```

JS 控制:

```js
const video = document.querySelector("video")
await video.play()
video.pause()
video.currentTime = 30
console.log(video.duration)
```

常见事件:

```js
video.addEventListener("loadedmetadata", () => {})
video.addEventListener("canplay", () => {})
video.addEventListener("waiting", () => {})
video.addEventListener("playing", () => {})
video.addEventListener("error", () => {})
```

`waiting` 和 `playing` 可以粗略统计卡顿。

---

## 二、采集:getUserMedia

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
})

video.srcObject = stream
```

带约束:

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720, frameRate: 30 },
  audio: { echoCancellation: true, noiseSuppression: true }
})
```

约束是请求,不是保证。实际结果要看 `track.getSettings()`。

---

## 三、MediaStream 和 Track

```js
const tracks = stream.getTracks()
const videoTrack = stream.getVideoTracks()[0]
const audioTrack = stream.getAudioTracks()[0]
```

Track 是真正的媒体轨道。可以停止:

```js
stream.getTracks().forEach((track) => track.stop())
```

可以静音 / 关摄像头:

```js
audioTrack.enabled = false
videoTrack.enabled = false
```

`enabled=false` 是暂停发送内容,`stop()` 是释放设备。

---

## 四、设备枚举

```js
const devices = await navigator.mediaDevices.enumerateDevices()
console.table(devices)
```

用户授权前,浏览器可能隐藏设备 label。不要指望一进页面就拿到完整设备名。

---

## 五、屏幕共享

```js
const displayStream = await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: true
})
```

屏幕共享得到的也是 MediaStream。后面可以塞给 WebRTC,也可以录制。

---

## 六、权限和 HTTPS

音视频采集一般要求安全上下文:

```text
https://
localhost 例外
```

权限失败要区分:

- 用户拒绝
- 设备不存在
- 设备被占用
- 约束无法满足
- 非安全上下文

---

## 七、踩坑提醒

1. **不 stop track**——摄像头灯一直亮。
2. **把 enabled=false 当释放设备**——不是。
3. **不处理权限错误**——用户只看到空白。
4. **约束写死 1080p**——低端设备可能直接失败。
5. **没有 HTTPS**——生产采集直接不可用。

下一篇:`14-MediaRecorder 与本地录制.md`。
