# ICE、STUN、TURN

WebRTC 本地 demo 容易成功,线上失败大多卡在网络穿透。

> 一句话先记住:**ICE 负责找路,STUN 负责发现公网映射,TURN 负责直连失败时中继**。没有 TURN 的 WebRTC 不是生产系统。

---

## 一、为什么不能直接连

大多数用户在 NAT 后面:

```text
浏览器 192.168.1.5
  -> 家用路由器
  -> 公网 IP
```

对方不能直接访问你的内网地址。公司网络、校园网、运营商 NAT、防火墙还会更复杂。

---

## 二、ICE 候选地址

ICE 会收集 candidate:

| 类型 | 来源 |
| --- | --- |
| host | 本机地址 |
| srflx | STUN 发现的公网映射 |
| relay | TURN 中继地址 |

浏览器把 candidate 通过信令发给对端,双方尝试连通,选一条可用路径。

```js
pc.onicecandidate = (event) => {
  if (event.candidate) sendSignal({ candidate: event.candidate })
}
```

---

## 三、STUN 解决什么

STUN 服务器告诉客户端:

```text
你从公网看起来是 1.2.3.4:56789
```

配置:

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
})
```

STUN 不转发媒体,成本低。但不是所有 NAT 都能靠 STUN 打通。

---

## 四、TURN 解决什么

TURN 做中继:

```text
A -> TURN -> B
```

配置:

```js
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.example.com:3478" },
    {
      urls: "turn:turn.example.com:3478",
      username: "user",
      credential: "pass"
    }
  ]
})
```

TURN 成本高,因为媒体流量都过你的服务器。但它是连通率兜底。

---

## 五、ICE 状态

```js
pc.oniceconnectionstatechange = () => {
  console.log(pc.iceConnectionState)
}
```

常见:

| 状态 | 意义 |
| --- | --- |
| checking | 正在尝试 |
| connected | 找到可用路径 |
| completed | ICE 完成 |
| disconnected | 暂时断开 |
| failed | 失败 |
| closed | 关闭 |

线上黑屏先看 ICE 状态。

---

## 六、踩坑提醒

1. **只配 STUN**——部分用户永远连不上。
2. **TURN 没带鉴权**——会被人刷流量。
3. **TURN 带宽预算不足**——高峰时全体卡。
4. **candidate 早到不缓存**——remote description 未设置时会失败。
5. **不区分 UDP/TCP/TLS TURN**——公司网络可能只放行 443/TCP。

下一篇:`19-RTP / RTCP.md`。
