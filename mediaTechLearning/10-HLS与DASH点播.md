# HLS 与 DASH 点播

大视频不能直接给用户一个 MP4 让他从头下到尾。点播系统要分片、缓存、按网络切清晰度。

> 一句话先记住:**HLS / DASH = 清单文件 + 一堆媒体分片**。播放器先拿清单,再按时间和清晰度拉分片。

---

## 一、为什么不用单个 MP4

单 MP4 的问题:

- 首屏慢
- 拖动依赖 Range 请求
- 清晰度切换难
- CDN 缓存粒度粗
- 弱网下恢复差

HLS / DASH 把视频切成小片:

```text
playlist.m3u8
  segment_000.ts
  segment_001.ts
  segment_002.ts
```

播放器边播边拉下一片。

---

## 二、HLS 基本结构

Master playlist:

```txt
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
1080p/index.m3u8
```

Media playlist:

```txt
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.000,
seg_000.ts
#EXTINF:6.000,
seg_001.ts
#EXT-X-ENDLIST
```

点播有 `#EXT-X-ENDLIST`,直播没有固定结尾。

---

## 三、DASH 基本结构

DASH 用 MPD:

```text
manifest.mpd
  Representation 720p
  Representation 1080p
  audio
  segments
```

HLS 在 Apple 生态和通用直播点播里很常见。DASH 在国际化 Web 点播、DRM、播放器生态里也常见。小团队先把 HLS 做稳。

---

## 四、生成单码率 HLS

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -c:a aac \
  -hls_time 6 \
  -hls_playlist_type vod \
  -hls_segment_filename "hls/seg_%03d.ts" \
  hls/index.m3u8
```

关键参数:

```text
hls_time              分片目标时长
hls_playlist_type vod 点播
hls_segment_filename  分片命名
```

---

## 五、多码率 HLS

先转多档:

```bash
ffmpeg -i input.mp4 -vf scale=1280:-2 -c:v libx264 -b:v 2500k -c:a aac 720p.mp4
ffmpeg -i input.mp4 -vf scale=854:-2  -c:v libx264 -b:v 1000k -c:a aac 480p.mp4
```

再分别切 HLS,最后写 master playlist。生产里通常由转码服务统一生成。

---

## 六、自适应码率 ABR

播放器根据网络和缓冲选择清晰度:

```text
带宽好 -> 拉 1080p
带宽差 -> 降到 720p / 480p
缓冲低 -> 降档保播放
```

ABR 的目标不是永远最高清,而是**少卡顿**。用户对卡顿比对轻微降清晰度更敏感。

---

## 七、踩坑提醒

1. **分片太长**——首屏和切换慢。
2. **分片太短**——请求数多,CDN 和播放器开销大。
3. **关键帧不对齐分片**——切换和拖动容易出问题。
4. **只做单码率**——弱网体验差。
5. **HLS 文件没配正确 MIME**——播放器可能直接失败。

下一篇:`11-M3U8、TS、fMP4 与分片.md`。
