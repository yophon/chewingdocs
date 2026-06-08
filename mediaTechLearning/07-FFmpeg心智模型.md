# FFmpeg 心智模型

FFmpeg 难不是命令多,是你不知道命令改的是哪一层。

> 一句话先记住:**FFmpeg = 解封装 -> 解码 -> 过滤 -> 编码 -> 封装 的管线工具**。`-c copy` 跳过解码和编码,所以快;加滤镜必须解码再编码,所以慢。

---

## 一、默认管线

```text
input.mp4
  -> demux 解封装
  -> decode 解码
  -> filter 滤镜
  -> encode 编码
  -> mux 封装
output.mp4
```

最普通命令:

```bash
ffmpeg -i input.mov output.mp4
```

FFmpeg 会按输出后缀和默认规则选择编码器、封装器。生产不要完全依赖默认值,要显式写清楚。

---

## 二、转封装为什么快

```bash
ffmpeg -i input.mkv -c copy output.mp4
```

管线变成:

```text
demux -> mux
```

不解码,不编码,只是把包从一个容器挪到另一个容器。前提是目标容器支持这些流。

---

## 三、转码为什么慢

```bash
ffmpeg -i input.mov -c:v libx264 -crf 23 -c:a aac output.mp4
```

管线:

```text
demux -> decode -> encode -> mux
```

视频编码最吃资源。1080p 还能靠 CPU,4K 大批量就要考虑硬件编码、任务队列、分片并发和成本。

---

## 四、滤镜一定触发重编码

缩放:

```bash
ffmpeg -i input.mp4 -vf scale=1280:-2 -c:v libx264 output.mp4
```

加水印:

```bash
ffmpeg -i input.mp4 -i logo.png \
  -filter_complex "overlay=20:20" \
  -c:v libx264 -c:a copy output.mp4
```

滤镜作用在解码后的原始帧上,所以视频必须重新编码。音频没动时可以 `-c:a copy`。

---

## 五、流选择:别让 FFmpeg 替你猜

多音轨、多字幕时要用 `-map`:

```bash
ffmpeg -i input.mkv \
  -map 0:v:0 -map 0:a:0 \
  -c:v libx264 -c:a aac output.mp4
```

含义:

```text
0:v:0  第 0 个输入的第 1 条视频流
0:a:0  第 0 个输入的第 1 条音频流
```

没有 `-map`,FFmpeg 会按默认策略选流,可能不是你想要的。

---

## 六、先 ffprobe,再 ffmpeg

```bash
ffprobe -hide_banner input.mp4
ffprobe -show_format -show_streams input.mp4
```

先确认:

- 容器
- 视频编码
- 音频编码
- 分辨率 / 帧率
- 像素格式
- 时长 / 码率
- 是否多音轨 / 多字幕

不要一上来就转码。很多问题只需要转封装。

---

## 七、踩坑提醒

1. **不写编码器**——默认值可能变,也可能不符合生产要求。
2. **该 `-c copy` 时重编码**——浪费时间和画质。
3. **用了滤镜还想 copy 视频**——逻辑上不可能。
4. **多流文件不用 `-map`**——输出丢音轨很常见。
5. **不看 stderr**——FFmpeg 的关键信息都在标准错误输出。

下一篇:`08-ffmpeg / ffprobe 常用命令.md`。
