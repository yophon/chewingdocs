# Web Audio API 入门

Web Audio 不是为了播放一个 MP3。播放用 `<audio>` 就够。Web Audio 解决的是实时处理、混音、分析和可视化。

> 一句话先记住:**Web Audio 是一张音频节点图,声音从 source 流过一串 node,最后到 destination**。

---

## 一、最小节点图

```js
const ctx = new AudioContext()
const audio = document.querySelector("audio")
const source = ctx.createMediaElementSource(audio)
const gain = ctx.createGain()

source.connect(gain)
gain.connect(ctx.destination)

gain.gain.value = 0.5
```

结构:

```text
audio element -> source -> gain -> speakers
```

---

## 二、从麦克风进来

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const ctx = new AudioContext()
const source = ctx.createMediaStreamSource(stream)
const analyser = ctx.createAnalyser()

source.connect(analyser)
```

可以做音量条、频谱、静音检测。

---

## 三、音量分析

```js
const data = new Uint8Array(analyser.fftSize)

function tick() {
  analyser.getByteTimeDomainData(data)
  let sum = 0
  for (const v of data) {
    const x = v - 128
    sum += x * x
  }
  const rms = Math.sqrt(sum / data.length)
  console.log(rms)
  requestAnimationFrame(tick)
}

tick()
```

RMS 可以粗略判断用户是否在说话。

---

## 四、混音

多个 source 接到同一个 destination:

```text
mic --------\
music -------> gain -> destination
effect -----/
```

Web Audio 天然适合做:

- 背景音乐混合
- 音效播放
- 音量控制
- 可视化
- 简单处理链路

复杂降噪、回声消除不要自己手写,优先用浏览器 / WebRTC 内置能力。

---

## 五、AudioWorklet

需要自定义实时处理时用 AudioWorklet。它运行在专门的音频渲染线程,比老的 ScriptProcessorNode 更适合低延迟处理。

但它不是入门工具。只有在 Gain、Analyser、BiquadFilter 等节点不够时再上。

---

## 六、踩坑提醒

1. **用户手势限制**——很多浏览器要求点击后才能启动 AudioContext。
2. **拿 Web Audio 写播放器**——普通播放用 `<audio>`。
3. **主线程做重处理**——会卡 UI,还会爆音。
4. **自己写回声消除**——优先用 WebRTC 内置 AEC。
5. **不关闭 AudioContext 和 Track**——资源泄漏。

下一篇:`16-WebRTC 总览.md`。
