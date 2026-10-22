# Files API、PDF 与 Citations

很多真实的 AI 应用都围绕文档展开:合同审阅、财报分析、技术手册问答、论文总结。这一篇讲三件相关的事:**怎么把文档交给 Claude**(PDF、纯文本、图片)、**怎么上传一次反复使用**(Files API),以及**怎么让回答带上可核对的出处**(Citations)。

> 一句话先记住:**文档问答的可信度来自出处**。让 Claude 读文档并不难,难的是让读者相信它说的确实在文档里。citations 让每句结论都指向原文的具体位置,这比在提示词里写"请只根据文档回答"可靠得多。

---

## 一、把文档交给 Claude

### 1.1 PDF

```python
import base64

with open("report.pdf", "rb") as f:
    pdf_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    messages=[{
        "role": "user",
        "content": [
            {   # 文档块放在文字问题之前
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64},
            },
            {"type": "text", "text": "总结这份报告的主要发现。"},
        ],
    }],
)
```

- Claude 同时看到 PDF 里的**文字和页面图像**,所以图表、表格、扫描件都能理解
- 限制:**单个请求 32MB,最多 600 页**(上下文为 200K 的模型最多 100 页)
- base64 字符串里不能有换行
- PDF 按页消耗 token(文字 + 页面图像),很长的 PDF 会很贵——只需要几页时先拆出来

### 1.2 纯文本和自定义内容

纯文本文档用 `"source": {"type": "text", "media_type": "text/plain", "data": "..."}`。需要自己控制引用粒度(比如按段落、按条款),可以用自定义内容的文档,把内容拆成一组块传入。

### 1.3 图片

```python
{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}}
{"type": "image", "source": {"type": "url", "url": "https://example.com/chart.png"}}
```

---

## 二、Files API:上传一次,多次引用

同一份文档要问十个问题,每次都把几十 MB 的 base64 塞进请求,既慢又浪费带宽。Files API 让你**先上传,之后用 `file_id` 引用**。

Files API **已经转正**:用 `client.files`,不需要 beta 头。旧代码里的 `client.beta.files` 加 `files-api-2025-04-14` 是过时的写法。

### 2.1 上传和引用

```python
from pathlib import Path

uploaded = client.files.upload(file=Path("contract.pdf"))
print(uploaded.id)            # file_...

for question in ["主要条款有哪些?", "终止条款怎么写的?", "付款计划是怎样的?"]:
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        messages=[{
            "role": "user",
            "content": [
                {"type": "document", "source": {"type": "file", "file_id": uploaded.id},
                 "title": "采购合同"},
                {"type": "text", "text": question},
            ],
        }],
    )
    print(next((b.text for b in response.content if b.type == "text"), ""))
```

**内容块的类型要和文件的 MIME 类型匹配**:PDF 和文本用 `document`,图片用 `image`。

### 2.2 管理

```python
for f in client.files.list():          # 自动翻页
    print(f.id, f.filename, f.size_bytes)

client.files.delete(file_id)
```

### 2.3 要知道的限制

| 项 | 值 |
| --- | --- |
| 单文件大小 | 500MB |
| 每个组织总存储 | 100GB |
| 保存期限 | 直到你删除 |
| 计费 | 上传、列出、删除免费;在消息里使用时按输入 token 计费 |
| 下载 | 只能下载**由代码执行工具或 skills 生成**的文件,不能下载你上传的文件 |
| 平台 | Bedrock 和 Vertex AI 上不可用 |

### 2.4 和缓存的配合

文件内容在消息里用到时按输入 token 计费,所以**同一份文档反复提问时,给文档块加上缓存标记**,后续请求按缓存价读取。还有一个容易忽略的好处:如果你在多轮对话里用一个签名 URL 引用文档,而这个 URL 每次返回的字节不同,新模型上会让之后的思考块失效(26 篇);**跨轮次引用的内容用 Files API 上传一次**,就没有这个问题。

---

## 三、Citations:让回答带出处

### 3.1 开启

在**每个**文档块上设 `citations: {"enabled": True}`——要么全部开启,要么全部不开:

```python
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {"type": "file", "file_id": uploaded.id},
                "title": "员工手册 2026",
                "citations": {"enabled": True},
            },
            {"type": "text", "text": "年假可以跨年结转吗?"},
        ],
    }],
)
```

### 3.2 返回的格式

开启后,回答会被拆成多个 `text` 块,有出处的块带一个 `citations` 数组:

```python
for block in response.content:
    if block.type == "text":
        print(block.text)
        for c in (block.citations or []):
            print("  └─", c.cited_text, f"(文档 {c.document_index}《{c.document_title}》)")
            if c.type == "page_location":
                print(f"     第 {c.start_page_number}-{c.end_page_number} 页")
            elif c.type == "char_location":
                print(f"     字符 {c.start_char_index}-{c.end_char_index}")
```

| 文档类型 | 位置类型 | 字段 |
| --- | --- | --- |
| 纯文本 | `char_location` | `start_char_index` / `end_char_index` |
| PDF | `page_location` | `start_page_number` / `end_page_number`(从 1 开始) |
| 自定义内容 | `content_block_location` | 块的索引范围 |

每条引用都有 `cited_text`(引用的原文)、`document_index`、`document_title`。`cited_text` 不计入输出 token。

### 3.3 为什么比"提示词约束"好

| 做法 | 问题 |
| --- | --- |
| 提示词里写"只根据文档回答,并注明出处" | 模型可能编造出处,格式也不稳定 |
| 让模型输出 JSON,里面带引用 | 引用的文字可能和原文对不上 |
| **Citations** | 引用由 API 生成,`cited_text` 是原文的真实片段,位置可以直接定位 |

在界面上,可以把 `cited_text` 做成悬浮提示或脚注,点击跳转到 PDF 的对应页。

### 3.4 限制

- **和结构化输出(`output_config.format`)不兼容**,同时使用返回 400。需要结构化的结果又要出处时,先用 citations 拿到带出处的回答,再在第二步做结构化抽取
- 多文档时每个文档都要开启,用 `title` 区分来源

---

## 四、和 RAG 的关系

aiLearning/22 讲过 RAG:检索出相关片段,塞进上下文,让模型基于它们回答。Claude 的 1M 上下文和 citations 改变了一些取舍:

| 场景 | 做法 |
| --- | --- |
| 文档总量能放进上下文(几份合同、一本手册) | 直接整份交给 Claude + citations + 缓存,省掉检索链路 |
| 文档库很大(成千上万份) | 仍然需要检索;把检索出的片段作为文档块传入,开启 citations |
| 需要逐字可追溯 | citations,不要让模型自己写引用 |
| 内容频繁变化 | 检索 + 文档块,不要依赖长期缓存 |

"能整份放进上下文就不做 RAG"并不总是对的:上下文越长,每次请求越贵、越慢。**同一份文档会被反复问时,整份放入 + 缓存很划算;每次问的文档都不同时,检索更省**。

---

## 五、生产中的典型架构

```
用户上传文档
  → Files API 上传,存下 file_id(和你自己的文档 ID 关联)
  → 提问时:文档块(file_id + title + citations + 缓存标记)+ 问题
  → 返回:按 text 块渲染回答,citations 渲染成脚注 / 跳转链接
  → 文档删除时同步调用 files.delete
```

需要对文档做计算(画图表、算统计量、改格式)时,把文件交给服务端代码执行工具处理,生成的文件可以通过 Files API 下载(28 篇)。

---

## 六、踩坑

1. **还在用 `client.beta.files` 加 beta 头**——Files API 已转正,用 `client.files`
2. **同一份文档每次都 base64 上传**——用 Files API 上传一次
3. **反复提问同一文档却不加缓存**——每次都按全价计费
4. **PDF 超过 600 页或 32MB 直接发**——报错。拆分,或只发需要的页
5. **文档块的类型和文件类型不匹配**——图片文件用了 `document` 块
6. **只给部分文档开 citations**——要么全开,要么全不开
7. **citations 和结构化输出一起用**——400,分两步做
8. **想下载自己上传的文件**——只能下载代码执行或 skills 生成的文件
9. **在 Bedrock / Vertex 上用 Files API**——不可用,改用 base64
10. **跨轮次用签名 URL 引用会变化的内容**——新模型上会让思考块失效,用 Files API

---

下一篇:`28-服务端工具.md`,讲 Anthropic 托管执行的工具:网页搜索与抓取、代码执行、工具搜索、程序化工具调用、advisor、MCP connector、Agent Skills,以及 computer use。
