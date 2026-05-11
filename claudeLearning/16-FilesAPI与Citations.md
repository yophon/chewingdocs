# Files API 与 Citations

让 Claude 处理 PDF 合同、技术文档、研究报告——你需要两件配套设施:**Files API**(把文件上传到 Anthropic,后续在多次对话里复用)和 **Citations**(让 Claude 在回答里标"我引用了原文哪一段")。这两件事在 RAG / 法务 / 学术 / 客服知识库等场景用得到,**而且免去了"每次都把整篇 PDF 发一遍"的浪费**。

> 一句话先记住:**Files API = 上传一次,下次对话直接 file_id 引用,省 token、省 IO**;**Citations = 答案带"出处坐标",可信度 + 可审计性都跨一个台阶**。两者经常配套用,但也能各自独立。

---

## 一、Files API:为什么需要

不开 Files API 处理 PDF 的传统姿势:

```python
# 把 PDF 转 base64 直接塞进 message
import base64
with open("contract.pdf", "rb") as f:
    pdf_b64 = base64.b64encode(f.read()).decode()

resp = client.messages.create(
    messages=[{
        "role": "user",
        "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
            {"type": "text", "text": "总结一下这份合同的关键条款"}
        ]
    }],
    ...
)
```

问题:

- **每次对话都得重传整个 PDF**(网络 + 编码 + 重新解析)
- 多用户共享同一份文档时,每人都上传一遍
- 反复对话同一文档的 token 重复

Files API 解决方式:

```python
# 1. 上传一次,得到 file_id
with open("contract.pdf", "rb") as f:
    file_obj = client.files.create(file=f)
print(file_obj.id)  # "file_abc123"

# 2. 后续随便用 id 引用
resp = client.messages.create(
    messages=[{
        "role": "user",
        "content": [
            {"type": "document", "source": {"type": "file", "file_id": "file_abc123"}},
            {"type": "text", "text": "总结条款"}
        ]
    }],
    ...
)
```

第二次第三次问同一份文档时,**省去重传 + 重新预处理**。

---

## 二、Files API 完整接口

```python
# 上传
file = client.files.create(file=open("doc.pdf", "rb"))

# 列出
for f in client.files.list():
    print(f.id, f.filename, f.size_bytes)

# 看元信息
info = client.files.retrieve("file_abc123")

# 下载内容
content = client.files.download("file_abc123")

# 删除
client.files.delete("file_abc123")
```

**支持格式**(2026 现状):

- PDF
- 图片(PNG / JPEG / WebP / GIF)
- 文本 / Markdown / CSV
- JSON

**大小上限**:典型单文件 32MB(具体看 docs);超大文件需要先拆分。

---

## 三、Citations:让 Claude 带"出处"

普通 LLM 给你一段总结,你不知道它"从原文哪段抽来的"——这在法务、医疗、学术、客服场景**不可接受**。

Citations 让 Claude 在每段回答里附带原文位置:

```python
resp = client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=2048,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {"type": "file", "file_id": "file_abc123"},
                "citations": {"enabled": True}    # 关键
            },
            {"type": "text", "text": "总结违约条款"}
        ]
    }],
)

# 返回 content 里会有 citations
for block in resp.content:
    if block.type == "text":
        print(block.text)
        if block.citations:
            for c in block.citations:
                print(f"  → 引用文档 {c.document_index},位置 {c.start_char_index}-{c.end_char_index}")
                print(f"  原文: {c.cited_text[:80]}...")
```

输出大致:

```
违约金为合同金额的 20%,且需在违约通知后 15 日内支付。
  → 引用文档 0,位置 4521-4598
  原文: "若任一方违约,违约金为合同金额的 20%,需于违约通知...

未按时支付违约金的,可加收日万分之五利息。
  → 引用文档 0,位置 4612-4681
  原文: "如违约金未在规定期限内支付,可加收日万分之五利息..."
```

> Claude 会**主动**给每个事实陈述配引用——不需要你写复杂 prompt,SDK 会处理。

---

## 四、Citations 的可信级

Citations 的位置坐标是 Anthropic 后端从原文真实抽取的——**不是 LLM 编造的**。所以:

- **Citation 的位置 + 文本必然存在原文中**(后端校验)
- LLM 可能在事实陈述上仍然出错(理解错原文),但**不会捏造引用位置**

> 这是为什么 citations 比"prompt 里要求 LLM 给页码"靠谱得多——后者 LLM 经常编造页码。

---

## 五、多文档 + Citations

```python
messages=[{
    "role": "user",
    "content": [
        {"type": "document", "source": {"type": "file", "file_id": "doc1"}, "citations": {"enabled": True}},
        {"type": "document", "source": {"type": "file", "file_id": "doc2"}, "citations": {"enabled": True}},
        {"type": "text", "text": "对比这两份合同的违约条款差异"}
    ]
}]
```

返回的每个 citation 带 `document_index`(0 / 1)告诉你引用的是哪一份。

---

## 六、Citations 与 RAG 的关系

| 维度 | 传统 RAG | Citations |
| --- | --- | --- |
| 检索发生在 | 应用层(向量库) | 不发生(整文档塞进去) |
| 引用粒度 | 自己实现"chunk → 文档" 映射 | SDK 直接给字符位置 |
| 文档大小 | 检索 top-k 后控制在 < 几 K token | 整文档进 prompt(贵但准) |
| 适合场景 | 大语料(几千万文档) | 小语料(几十-几百文档) |

**结合用**:

1. RAG 先检索 top-3 文档
2. 把这 3 篇上传 Files API,带 citations
3. Claude 给出引用 = "引自文档 1 的第 12 行"

> **小语料场景 Citations 干净利落**;大语料还是 RAG。两者**不互斥**——很多生产应用都用混合方案。

---

## 七、Files API + Cache

Files API 上传的文档,**首次在某 prompt 里使用时仍然是普通输入 token**(只是省了网络传输和 base64 解析)。要省 token 还是要靠 prompt cache:

```python
messages=[{
    "role": "user",
    "content": [
        {
            "type": "document",
            "source": {"type": "file", "file_id": "..."},
            "cache_control": {"type": "ephemeral"}    # 把文档段缓存
        },
        {"type": "text", "text": "..."}
    ]
}]
```

第二次问同一文档(同样的 file_id 嵌入位置)→ **cache 命中,只付 10%**。

> Files API + Cache 是处理"反复问同一文档"的标配。**RAG 应用中检索结果稳定时也该开**。

---

## 八、PDF 处理的几个细节

### 8.1 大 PDF 用 pages 参数(SDK 端)

PDF 几百页,可能超 context 窗。Anthropic 后端会自动 chunk PDF 提取文本,但 token 仍按整篇计费。

**实战做法**:

- < 100 页:直接 Files API 上传,加 citations
- 100-500 页:看具体内容,先抽目录,问"我感兴趣 X 主题在哪几页",再切片
- > 500 页:走 RAG(切成 chunk → 向量 → 检索 top-K → 进 prompt)

### 8.2 扫描版 PDF

Claude 的 PDF 处理对**扫描件 + OCR 质量差**的文档表现下降明显——**先 OCR**(如 tesseract / textract / Adobe API),把结果作为文本上传,效果更好。

### 8.3 PDF 里的图表

Claude 4 多模态能力支持读 PDF 中的图表 / 表格。但**复杂表格**(嵌套、合并单元格)经常解析出错;**重要数据用文本验证一遍**。

---

## 九、生产典型架构

### 9.1 合同审查

```
上传 → 索引(Files API)
    ↓
按合同类型选 prompt 模板
    ↓
Claude 抽取关键条款 + 风险点 + Citations
    ↓
人工审 → 关注 Citations 找原文核对
```

### 9.2 客服知识库

```
公司文档 → 上传 → 拿 file_id 列表
    ↓
用户问 → RAG 检索 top-3 文档
    ↓
把这 3 个 file_id 塞进 prompt + Citations
    ↓
答案附带"我说的这一句出自手册第 X 节"
```

### 9.3 学术综述

```
上传 5-10 篇论文(Files API + Cache)
    ↓
Claude 综合分析 + Citations
    ↓
用户每段结论可点击跳转原文段
```

---

## 十、踩坑

1. **不用 Files API,反复 base64 上传**——文档大点儿网络都快爆,每次都要 IO
2. **不开 cache 重复问同一文档**——第 5 次仍然付 100% token
3. **想要引用却没开 citations**——LLM 自己编造的"引用页码"经常错
4. **大 PDF 直接上传超 context**——先确认文档大小,该切片切片
5. **scanned PDF 没预 OCR**——Claude 把图当图看,文本抽取不准
6. **Files API 不删旧文件**——账户里堆满老文档,不算大事但难管理;**用完删**
7. **多文档 citations 没区分 document_index**——多份引用混着展示,用户分不清来源
8. **生产没保存 citations 字段**——存 LLM 输出但忘了存引用,后期 audit 时找不到出处
9. **以为 file_id 跨账户共享**——file_id 是账户隔离的,A 账户上传 B 账户用不了
10. **没监控文档过期**——某些文件 TTL 后清理,生产突然 404;**重要文档定期 refresh 或本地存一份原文**

---

下一篇:`17-ComputerUse.md`,讲 Computer Use 三大工具(screenshot / mouse / keyboard / text editor / bash)、VM 沙箱建议、什么场景该用、什么不该。
