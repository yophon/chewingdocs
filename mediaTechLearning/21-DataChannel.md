# DataChannel

WebRTC 不只能传音视频,也能传任意数据。DataChannel 底层走 SCTP over DTLS,复用同一套连接和 NAT 穿透能力。

> 一句话先记住:**DataChannel 是低延迟点对点数据通道,适合控制消息、白板、游戏状态,不适合替代 HTTP 做大文件分发**。

---

## 一、创建 DataChannel

发起方:

```js
const channel = pc.createDataChannel("chat")

channel.onopen = () => channel.send("hello")
channel.onmessage = (event) => console.log(event.data)
```

接收方:

```js
pc.ondatachannel = (event) => {
  const channel = event.channel
  channel.onmessage = (event) => console.log(event.data)
}
```

DataChannel 会参与 SDP 协商。

---

## 二、可靠与不可靠

默认可靠有序:

```js
pc.createDataChannel("reliable")
```

不可靠、限制重传:

```js
pc.createDataChannel("game", {
  ordered: false,
  maxRetransmits: 0
})
```

场景:

| 模式 | 适合 |
| --- | --- |
| 可靠有序 | 聊天、白板操作 |
| 不可靠无序 | 游戏位置、实时指针 |

---

## 三、背压

发送太快会堆积:

```js
channel.bufferedAmount
channel.bufferedAmountLowThreshold = 64 * 1024
channel.onbufferedamountlow = () => {
  // 继续发
}
```

大文件分块传时必须看 `bufferedAmount`,否则内存会涨。

---

## 四、适合什么

适合:

- 聊天消息
- 远程控制指令
- 白板同步
- 会议内状态同步
- 小文件点对点传输

不适合:

- 大文件可靠下载
- 需要服务端审计的业务数据
- 多人广播大流量

多人会议里 DataChannel 也可能经 SFU 或信令服务转发,别假设永远点对点。

---

## 五、踩坑提醒

1. **发送不看 bufferedAmount**——内存堆积。
2. **大文件全塞一个 send**——要分块。
3. **控制消息不做版本**——客户端版本不一致会炸。
4. **可靠通道传高频状态**——队头阻塞导致状态过期。
5. **把它当安全业务通道**——权限和审计仍要设计。

下一篇:`22-一对一通话实战.md`。
