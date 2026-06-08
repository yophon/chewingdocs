# ffmpeg / ffprobe 常用命令

这一篇只放高频命令。先能查、能转、能切、能定位问题,再谈复杂参数。

> 一句话先记住:**ffprobe 负责看清楚,ffmpeg 负责改数据**。生产脚本里先 probe 再处理,不要盲转。

---

## 一、查看文件信息

```bash
ffprobe -hide_banner input.mp4
```

结构化输出:

```bash
ffprobe -v error \
  -show_format -show_streams \
  -of json input.mp4
```

只看视频流:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,bit_rate \
  -of default=nw=1 input.mp4
```

只看音频流:

```bash
ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate,channels,bit_rate \
  -of default=nw=1 input.mp4
```

---

## 二、转封装

```bash
ffmpeg -i input.mkv -c copy output.mp4
```

Web 渐进播放:

```bash
ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4
```

---

## 三、转 H.264 + AAC

```bash
ffmpeg -i input.mov \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  output.mp4
```

控制输出码率:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -b:v 3000k -maxrate 3500k -bufsize 6000k \
  -c:a aac -b:a 128k \
  output.mp4
```

---

## 四、缩放和裁剪

缩放到宽 1280,高度按比例且为偶数:

```bash
ffmpeg -i input.mp4 -vf scale=1280:-2 -c:v libx264 -c:a copy output.mp4
```

裁剪:

```bash
ffmpeg -i input.mp4 -vf "crop=1280:720:0:0" -c:v libx264 -c:a copy output.mp4
```

---

## 五、截取片段

快速截取,可能不精确:

```bash
ffmpeg -ss 00:01:00 -i input.mp4 -t 10 -c copy clip.mp4
```

精确截取,会重编码:

```bash
ffmpeg -i input.mp4 -ss 00:01:00 -t 10 -c:v libx264 -c:a aac clip.mp4
```

`-ss` 放在 `-i` 前快,放后面更精确。

---

## 六、抽帧

每秒一张:

```bash
ffmpeg -i input.mp4 -vf fps=1 frames/%04d.jpg
```

截一张封面:

```bash
ffmpeg -ss 00:00:03 -i input.mp4 -frames:v 1 cover.jpg
```

---

## 七、提取音频

```bash
ffmpeg -i input.mp4 -vn -c:a copy audio.aac
```

转 WAV:

```bash
ffmpeg -i input.mp4 -vn -ac 1 -ar 16000 output.wav
```

语音识别常见 16k、单声道 WAV。

---

## 八、踩坑提醒

1. **命令能跑不等于输出可用**——一定 `ffprobe` 输出。
2. **`-c copy` 不能和视频滤镜一起用**。
3. **H.264 宽高最好是偶数**——很多像素格式要求。
4. **截取片段不准先看关键帧**。
5. **脚本里加 `-y` 要慎重**——会覆盖文件。

下一篇:`09-转码、转封装、裁剪、抽帧、水印.md`。
