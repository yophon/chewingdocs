# MediaRecorder 与本地录制

浏览器录制不等于你拿到了 MP4。MediaRecorder 给的是浏览器支持的编码和容器,生产必须检查 MIME。

> 一句话先记住:**MediaRecorder 把 MediaStream 编成一段段 Blob,但输出格式由浏览器能力决定**。录制链路要先探测,再上传,必要时后端转码。

---

## 一、最小录制

```js
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
const recorder = new MediaRecorder(stream)
const chunks = []

recorder.ondataavailable = (event) => {
  if (event.data.size > 0) chunks.push(event.data)
}

recorder.onstop = () => {
  const blob = new Blob(chunks, { type: recorder.mimeType })
  const url = URL.createObjectURL(blob)
  document.querySelector("video").src = url
}

recorder.start()
setTimeout(() => recorder.stop(), 5000)
```

---

## 二、指定 MIME 前先探测

```js
const candidates = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/mp4"
]

const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type))
const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
```

不要硬写 `video/mp4`。很多浏览器不支持用 MediaRecorder 直接录 MP4。

---

## 三、分片上传

`start(timeslice)` 可以定期吐 Blob:

```js
recorder.ondataavailable = async (event) => {
  if (event.data.size > 0) {
    await uploadChunk(event.data)
  }
}

recorder.start(1000)
```

生产不要等录完一小时再上传一个大 Blob。中间断网、刷新、内存压力都会出问题。

---

## 四、录屏

```js
const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
const recorder = new MediaRecorder(display)
```

注意:

- 系统音频支持因浏览器和平台不同
- 用户可以随时停止共享
- 屏幕轨道结束要监听 `ended`

```js
display.getVideoTracks()[0].addEventListener("ended", () => {
  recorder.stop()
})
```

---

## 五、后端处理

浏览器上传 WebM,后端常转 MP4:

```bash
ffmpeg -i input.webm \
  -c:v libx264 -pix_fmt yuv420p \
  -c:a aac \
  -movflags +faststart \
  output.mp4
```

录制文件一定要走异步转码。不要在上传接口里同步跑 FFmpeg。

---

## 六、踩坑提醒

1. **假设浏览器能录 MP4**——先 `isTypeSupported`。
2. **不分片上传**——长录制容易内存爆。
3. **不监听 track ended**——用户停共享后状态错乱。
4. **上传后不转码**——移动端或播放器可能播不了 WebM。
5. **录制权限失败无提示**——用户会以为系统坏了。

下一篇:`15-Web Audio API 入门.md`。
