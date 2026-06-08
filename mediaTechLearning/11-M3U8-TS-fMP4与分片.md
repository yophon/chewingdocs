# M3U8、TS、fMP4 与分片

HLS 看起来只是一个 `.m3u8` 加一堆文件,但生产问题大多藏在分片边界、关键帧和缓存策略里。

> 一句话先记住:**M3U8 是清单,TS / fMP4 是媒体分片,分片边界最好落在关键帧上**。播放器不是下载"一个视频",而是按清单不断拉小文件。

---

## 一、M3U8 是文本清单

点播清单:

```txt
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.000,
seg_000.ts
#EXTINF:6.000,
seg_001.ts
#EXT-X-ENDLIST
```

关键字段:

| 字段 | 意思 |
| --- | --- |
| `EXT-X-TARGETDURATION` | 最大分片时长上限 |
| `EXT-X-MEDIA-SEQUENCE` | 第一个分片序号 |
| `EXTINF` | 下一个分片时长 |
| `EXT-X-ENDLIST` | 点播结束标记 |

直播清单会不断滑动,通常没有 `ENDLIST`。

---

## 二、TS 分片

老 HLS 常用 MPEG-TS:

```text
index.m3u8
seg_000.ts
seg_001.ts
```

优点:

- 历史兼容性强
- 流式友好
- 直播生态成熟

缺点:

- 包开销相对大
- Web 现代播放器里不如 fMP4 精细

---

## 三、fMP4 分片

现代 HLS / DASH 常用 fragmented MP4:

```text
init.mp4
seg_000.m4s
seg_001.m4s
```

`init.mp4` 放初始化信息,`.m4s` 放媒体片段。fMP4 更适合和 MSE、DASH、低延迟 HLS 等现代链路配合。

生成示意:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -c:a aac \
  -hls_segment_type fmp4 \
  -hls_time 6 \
  -hls_playlist_type vod \
  -hls_segment_filename "hls/seg_%03d.m4s" \
  hls/index.m3u8
```

---

## 四、分片时长怎么选

| 时长 | 影响 |
| --- | --- |
| 1-2s | 延迟低,请求多,成本高 |
| 4-6s | 常规点播 / 普通直播折中 |
| 10s+ | 请求少,但首屏和切换慢 |

点播常用 4-6 秒。普通直播可 2-6 秒。低延迟直播要另讲,不能只把分片切短。

---

## 五、关键帧对齐

分片边界如果不是关键帧,播放器切换清晰度或从某片开始解码时可能失败。

常见做法:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -g 180 -keyint_min 180 -sc_threshold 0 \
  -hls_time 6 \
  -c:a aac \
  hls/index.m3u8
```

30fps、6 秒分片,`-g 180`。实际生产要按帧率计算。

---

## 六、缓存策略

点播:

```text
segment: 长缓存
playlist: 可长缓存,因为不会变
```

直播:

```text
segment: 可缓存一段时间
playlist: 短缓存或不缓存
```

直播清单会变,被 CDN 长缓存就是灾难。用户会一直看到旧分片。

---

## 七、踩坑提醒

1. **清单缓存太久**——直播卡在旧内容。
2. **分片不从关键帧开始**——拖动和切档出问题。
3. **分片太短**——请求风暴和 CDN 成本上升。
4. **TS/fMP4 混用不测端**——播放器兼容差异要实测。
5. **忽略 MIME**——`.m3u8` 和 `.m4s` 要正确返回类型。

下一篇:`12-播放器原理与缓冲策略.md`。
