# 容器格式:MP4 / FLV / MKV / WebM

容器不是编码。容器解决的是:**把多条流和它们的时间关系装在一个文件里**。

> 一句话先记住:**容器管"怎么装",编码管"怎么压"**。排查播放兼容性时,永远分两步:先看容器,再看里面的编码。

---

## 一、容器里装什么

一个视频文件通常不是一条流:

```text
container
  video stream: H.264 / H.265 / VP9 / AV1
  audio stream: AAC / Opus / MP3
  subtitle stream
  metadata
  timestamps
```

查看:

```bash
ffprobe -hide_banner input.mp4
ffprobe -show_streams input.mp4
```

看到 `codec_name=h264` 不代表容器是 H.264,只代表视频流编码是 H.264。

---

## 二、MP4:最常见,但不是万能

MP4 适合点播、移动端、浏览器播放。常见组合:

```text
MP4 + H.264 + AAC
MP4 + H.265 + AAC
```

兼容性最稳的是 H.264 + AAC。H.265 在很多设备上能播,但浏览器支持受平台和授权影响,不能只看后缀。

MP4 还有一个关键点:`moov atom`。它保存索引信息。普通 MP4 如果 `moov` 在文件尾,浏览器要等下载到尾部才知道怎么播。优化:

```bash
ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4
```

这会把 `moov` 挪到文件头,适合网页渐进播放。

---

## 三、FLV:直播老兵

FLV 常见于老直播链路:

```text
RTMP 推流 -> FLV 播放
```

优点:

- 结构简单
- 延迟比 HLS 低
- 历史生态多

缺点:

- 浏览器原生不直接支持 FLV
- 通常需要 flv.js 这类 MSE 播放器
- 移动端和现代浏览器生态不如 HLS / WebRTC

FLV 不是未来主线,但很多直播系统还会遇到。

---

## 四、MKV:能装,但不适合 Web 默认分发

MKV 很灵活,什么都能装:

```text
MKV + H.264 + AAC
MKV + H.265 + Opus
MKV + 多字幕 / 多音轨
```

它适合本地收藏、影视文件、复杂字幕音轨。但 Web 分发不要默认选 MKV。浏览器、移动端、硬件播放器兼容性会让你付代价。

---

## 五、WebM:Web 友好但生态分裂

WebM 常见组合:

```text
WebM + VP9 + Opus
WebM + AV1 + Opus
```

适合浏览器和开放编码生态,但在部分平台、硬件解码、编辑工具链上不如 MP4/H.264 普遍。

WebM 经常出现在 MediaRecorder 默认输出里。你录出来的是 WebM,不等于后端、移动端、剪辑工具都能顺利处理。

---

## 六、转封装:不重新压缩

容器换掉,编码不变:

```bash
ffmpeg -i input.mkv -c copy output.mp4
```

`-c copy` 表示直接复制流。快,损失小。但前提是目标容器能装这些编码。比如 MP4 不适合装某些字幕或音频编码,命令会失败或产出兼容性差的文件。

---

## 七、踩坑提醒

1. **后缀不可信**——`.mp4` 里可能是浏览器不支持的编码。
2. **转封装不是转码**——`-c copy` 不会改变编码兼容性。
3. **Web 默认 H.264 + AAC 最稳**——追新编码前先看目标设备。
4. **MP4 网页播放记得 faststart**。
5. **MediaRecorder 输出要检查 MIME**——不要假设录出来就是 MP4。

下一篇:`05-编码格式:H.264 / H.265 / VP9 / AV1 / AAC / Opus.md`。
