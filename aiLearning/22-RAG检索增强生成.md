# RAG:检索增强生成

RAG(Retrieval-Augmented Generation)是 2026 年最被高估、也最被低估的应用层技术——**高估的是"上 RAG 就解决幻觉",低估的是"做出一个真正稳定的 RAG 比想象中难得多"**。这一篇把 RAG 从原理到实操、从 Naive 到 Advanced 完整过一遍,最后给一个能跑通的 Anthropic + Chroma 例子。

> 一句话先记住:**RAG 不是把文档塞给 LLM 这么简单,它是一个"检索系统 + 生成系统"的组合,真正的瓶颈 90% 在检索那一头**。

---

## 一、为什么需要 RAG

LLM 本身有四个绕不开的硬伤:

| 硬伤 | 表现 | RAG 怎么补 |
| --- | --- | --- |
| 知识过时 | 模型只知道训练截止那天之前的世界 | 检索最新文档现喂 |
| 不知道私有知识 | 你公司的内部文档、客户数据,模型完全不知道 | 检索内部知识库 |
| 不可溯源 | 模型说"A 是 B",你不知道这从哪来 | 把检索到的文档作为引用 |
| 幻觉 | 凭空编造 | 把"凭着记忆答"改成"看着资料答" |

| 维度 | 微调 | RAG | 长上下文 |
| --- | --- | --- | --- |
| 知识更新 | 慢(每次重训) | 快(更新向量库) | 实时(直接换文档) |
| 私有知识 | 可以但训练贵 | 适合 | 适合 |
| 溯源 | 不行 | 天然支持 | 半支持 |
| 成本 | 高(GPU) | 中(向量库 + 推理) | 高(token 多) |
| 数据规模 | 中 | 大 | 小(几百 K token) |

> 经验:**90% 的"用 LLM 做内部知识问答"场景,第一个该考虑的方案就是 RAG**——不是微调、不是塞 1M context。

---

## 二、Naive RAG 流程

最朴素的 RAG 长这样:

```
索引阶段(离线,跑一次):
   原始文档
      ↓ chunking
   一堆 chunk(每段 200-1000 字)
      ↓ embedding
   每段 chunk 对应一个向量
      ↓ 存
   向量数据库(Chroma / Pinecone / pgvector ...)

查询阶段(在线,每次请求):
   用户问题
      ↓ embedding
   query 向量
      ↓ 在向量库里找最近的 K 个
   top-K chunk
      ↓ 拼进 prompt
   "根据下面资料回答:<chunk1><chunk2>...   问题:<query>"
      ↓ 喂给 LLM
   答案
```

这就是所有 RAG 系统的骨架。**复杂的 RAG 都是在某一步上加花样**:chunking 上加层级、检索时加 BM25、检索后加 rerank、生成前加 query 改写……骨架不变。

---

## 三、Chunking:文档怎么切

Chunking 是 RAG 第一个也是最被低估的难题。**切得不对,后面再花哨的检索都救不回来**。

### 几种主流策略

| 策略 | 说明 | 适用 |
| --- | --- | --- |
| 固定长度 | 按 token / 字符切,如 500 token | 快糙猛,baseline |
| 固定长度 + overlap | 相邻 chunk 重叠 50-100 token | 防止句子被切成两半,推荐入门 |
| 按结构切 | 按 markdown 标题、HTML 标签、段落 | 文档结构清晰时最好 |
| 语义切分 | 计算句子间相似度,在断点切 | 需要 embedding,贵但准 |
| 父子文档 | 切小 chunk 用于检索,生成时把整段父文档喂回 | 长文档常用 |

### Overlap 的作用

```
没有 overlap:
chunk1: [...一句话被切成两半,
chunk2: 后半截在这里。...]
查询时只能命中其中一个,信息不全。

有 overlap(20-30%):
chunk1: [...一句话被切成两半,后半截在这里。再多说一段。]
chunk2: [后半截在这里。再多说一段。又一段新内容。]
任何一句话都完整地出现在至少一个 chunk 里。
```

### 推荐 baseline

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=120,
    separators=["\n\n", "\n", "。", ".", " ", ""],
)
chunks = splitter.split_text(document)
```

> 经验:**chunk 长度 = 你单条 FAQ / 单个段落的平均长度**。技术文档 600-1000 字、客服对话 200-400 字、长篇报告 1000-1500 字。**没有放之四海而皆准的值**。

---

## 四、Embedding 选型简提

下一篇 23 详讲,这里只给一个最简结论:

| 模型 | 维度 | 中文表现 | 备注 |
| --- | --- | --- | --- |
| OpenAI text-embedding-3-large | 3072 | 不错 | 便利但贵 |
| Voyage voyage-3 | 1024 | 强 | Anthropic 推荐配套 |
| BGE-M3 | 1024 | 强 | 开源,免费 |
| E5-mistral | 4096 | 强 | 开源,大 |

**第一版选 voyage-3 或 BGE-M3 都不会错**。23 篇会展开。

---

## 五、检索质量是 RAG 的核心瓶颈

很多人 RAG 翻车都不是 LLM 的问题——**是检索没把对的东西捞出来**。Garbage in, garbage out。

### 检索的两个核心指标

| 指标 | 含义 | 不达标的症状 |
| --- | --- | --- |
| Recall@K | top-K 是否包含正确答案 | 答非所问、说"资料里没有" |
| Precision@K | top-K 中相关的比例 | 上下文充满噪声,生成质量下降 |

### 一些 Naive RAG 翻车的典型 case

| 场景 | 为什么翻车 |
| --- | --- |
| "X 和 Y 的区别" | 单个 chunk 通常只讲 X 或 Y 中的一个 |
| 多跳问题("A 的作者写过的另一本书") | 一次检索找不全 |
| 否定查询("不属于 X 的产品") | 向量搜索捞到的全是"属于 X 的" |
| 数字/精确查询("2024 年营收") | 向量搜索对数字不敏感 |
| 缩写、同义词 | 表述不同 → 向量距离远 |

> 5 年工程师视角:**Naive RAG 在 demo 阶段经常表现良好,上生产后准确率掉到 40-60% 是常态**。下面几节就是给这件事打补丁的。

---

## 六、Hybrid Search:BM25 + 向量

向量搜索擅长**语义相似**(意思相近,字面不同),BM25 擅长**关键词精确匹配**(数字、专有名词、缩写)。**两者一起上,准确率显著高于任一单独**。

### 为什么需要两者

```
用户问:"GPT-4o 上下文是 128K 还是 256K?"

向量搜索:命中"GPT-4 系列模型详解",但不一定包含数字
BM25  :命中包含 "128K" "256K" "GPT-4o" 字样的精确段落

两者合并 → top-K 既有语义相关又有关键词匹配,recall 立刻起飞。
```

### Reciprocal Rank Fusion(RRF)

合并两个 ranked list 的简单算法:

```python
def rrf(rankings: list[list[str]], k: int = 60) -> list[str]:
    scores = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)

vector_top = ["d1", "d3", "d7", "d9"]
bm25_top   = ["d3", "d2", "d7", "d5"]
final = rrf([vector_top, bm25_top])  # ["d3", "d7", "d1", ...]
```

> 经验:**Hybrid Search 是从 Naive 到 Advanced RAG 的第一个高 ROI 改造**——代码量小、提升明显。

---

## 七、Reranking:第二轮精排

Hybrid 检索拿到 top-50 之后,**再用一个更强的模型对这 50 条做重排,只取 top-5 喂给 LLM**。这一步叫 reranking。

### 为什么有用

| 阶段 | 模型 | 速度 | 质量 |
| --- | --- | --- | --- |
| 第一轮检索 | bi-encoder(query 和 doc 分别 embed) | 快(支持百万级库) | 中 |
| 第二轮 rerank | cross-encoder(query+doc 一起 forward) | 慢(只能跑几十条) | 高 |

cross-encoder 把 query 和 doc 拼起来过一次模型,**能捕捉精细的相关性**(向量距离做不到这一点)。

### Cohere Rerank API

```python
import cohere
co = cohere.Client()

results = co.rerank(
    model="rerank-3.5",
    query="GPT-4o 的上下文长度",
    documents=[chunk1_text, chunk2_text, ...],
    top_n=5,
)
top_chunks = [chunks[r.index] for r in results.results]
```

国内可选 BGE-Reranker、智源的 bce-reranker。**这一步几乎所有生产 RAG 都会做**。

---

## 八、Advanced RAG:再往上一层

### 1. Query 改写

用户问的话往往不适合直接拿去检索:

```
原始 query :"上次那个 bug 还在吗?"
改写后 query:"用户登录失败的 bug 是否已修复?"
```

让一个轻量 LLM 先把 query 改写一下,**指代消歧 + 补足上下文**。

### 2. HyDE(Hypothetical Document Embeddings)

**让 LLM 先编一个"假想答案",用这个假想答案的向量去检索**。

```
query: "RAG 和微调哪个更好?"
   ↓ 让 LLM 编一个答案(可能不准)
hypothetical: "RAG 和微调各有适用场景。RAG 适合知识更新频繁..."
   ↓ embed 这段假想答案
   ↓ 用它的向量检索
```

为什么有用:**假想答案的语义分布和"真实答案文档"更接近,比 query 本身更接近**。论文里 recall 普遍提升 10-20%。

### 3. 多路召回

```
向量召回(语义)+ BM25(关键词)+ 元数据过滤(时间/来源)→ 合并
```

不同召回路覆盖不同 case,合并后 recall 显著提升。

### 4. 迭代检索

复杂问题一次检索捞不全:

```
第 1 轮:用原 query 检索 → 看不够 → 让 LLM 提一个跟进问题
第 2 轮:用新 query 检索 → ...
直到 LLM 说"够了"
```

这其实已经接近 Agent 了——本质上就是把"检索"做成 Agent 的一个 tool。**26 篇会回到这个思路**。

---

## 九、评估 RAG

没有 eval 的 RAG 就是赌博。RAG 的 eval 比普通 LLM 任务更难,因为**它是检索 + 生成两阶段**,各自都要评。

### 检索阶段指标

| 指标 | 怎么算 |
| --- | --- |
| Recall@K | 标注"哪些 chunk 是 ground truth",看 top-K 是否包含 |
| MRR(Mean Reciprocal Rank)| 第一个相关 chunk 的位置倒数 |
| nDCG@K | 考虑相关性程度的排序质量 |

### 生成阶段指标

| 指标 | 含义 |
| --- | --- |
| Faithfulness(忠实度) | 答案是否完全基于检索到的内容,有没有幻觉 |
| Answer Relevance | 答案是否回答了 query |
| Context Precision | 检索到的 context 中相关的比例 |

### Ragas:开箱即用的 eval 库

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision

result = evaluate(
    dataset,  # 包含 query / answer / contexts / ground_truth 的数据集
    metrics=[faithfulness, answer_relevancy, context_precision],
)
```

> 经验:**先建 50 条标注 case,任何修改都跑一遍 eval**。否则你以为 query 改写"提升了准确率",其实只是某一个 case 看起来变好了。

---

## 十、什么时候不该用 RAG

RAG 不是万能的。下面这些场景**直接上 RAG 反而走弯路**:

| 场景 | 更好的方案 |
| --- | --- |
| 知识量小(几千字) | 直接全塞 prompt 或 long context |
| 风格 / 行话 / 语言习惯类 | 微调(SFT) |
| 强结构化查询(SQL 能搞定) | Text-to-SQL,不要硬上 RAG |
| 知识高度结构化(知识图谱已有) | GraphRAG / 直接图查询 |
| 实时性要求极高(毫秒级) | 缓存 + 直接生成 |

> 一个常被忽视的判断:**先看看长上下文够不够**。Claude Sonnet 4.6 / GPT-5 都是几百 K 上下文,**几本书的量直接全塞 prompt + prompt cache 经常比 RAG 又快又准**。

---

## 十一、代码:Anthropic + Chroma 简易 RAG

完整可跑的 minimum viable RAG。先装包:

```bash
pip install anthropic chromadb voyageai
```

```python
import os
import chromadb
import voyageai
from anthropic import Anthropic

# ---------- 1. 准备 ----------

vo = voyageai.Client()
anthropic = Anthropic()
chroma = chromadb.PersistentClient(path="./rag_db")
collection = chroma.get_or_create_collection(
    name="docs",
    metadata={"hnsw:space": "cosine"},
)

# ---------- 2. 索引阶段 ----------

def chunk_text(text: str, size: int = 800, overlap: int = 120) -> list[str]:
    chunks = []
    i = 0
    while i < len(text):
        chunks.append(text[i : i + size])
        i += size - overlap
    return chunks

def embed(texts: list[str], input_type: str) -> list[list[float]]:
    # voyage-3 维度 1024,中文/英文表现都不错
    return vo.embed(texts, model="voyage-3", input_type=input_type).embeddings

def index_documents(docs: list[dict]):
    """docs: [{'id': str, 'text': str, 'source': str}, ...]"""
    all_chunks, all_ids, all_meta = [], [], []
    for doc in docs:
        for j, chunk in enumerate(chunk_text(doc["text"])):
            all_chunks.append(chunk)
            all_ids.append(f"{doc['id']}_chunk_{j}")
            all_meta.append({"source": doc["source"], "doc_id": doc["id"]})

    # 批量 embed,Voyage 一次最多 128 条
    BATCH = 64
    for i in range(0, len(all_chunks), BATCH):
        batch = all_chunks[i : i + BATCH]
        vectors = embed(batch, input_type="document")
        collection.add(
            ids=all_ids[i : i + BATCH],
            embeddings=vectors,
            documents=batch,
            metadatas=all_meta[i : i + BATCH],
        )

# ---------- 3. 检索 ----------

def retrieve(query: str, k: int = 5) -> list[dict]:
    qvec = embed([query], input_type="query")[0]
    results = collection.query(query_embeddings=[qvec], n_results=k)
    return [
        {"text": doc, "source": meta["source"]}
        for doc, meta in zip(results["documents"][0], results["metadatas"][0])
    ]

# ---------- 4. 生成 ----------

SYSTEM_PROMPT = """你是一名资深产品支持工程师。回答必须满足:
1. 严格基于 <context> 中提供的资料,不要使用自己的知识
2. 如果资料不足以回答,直接说"资料里没有相关信息"
3. 在答案末尾用 [来源 N] 形式标注引用
4. 用简体中文,不超过 300 字
"""

def generate(query: str, contexts: list[dict]) -> str:
    context_block = "\n\n".join(
        f"[来源 {i+1}: {c['source']}]\n{c['text']}"
        for i, c in enumerate(contexts)
    )
    user_msg = f"<context>\n{context_block}\n</context>\n\n问题:{query}"

    resp = anthropic.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    return resp.content[0].text

# ---------- 5. 完整 RAG ----------

def rag(query: str) -> str:
    contexts = retrieve(query, k=5)
    return generate(query, contexts)

# ---------- 用法 ----------

if __name__ == "__main__":
    docs = [
        {
            "id": "faq001",
            "source": "产品 FAQ v1.2",
            "text": "Q: 怎么重置密码?A: 在登录页点击'忘记密码',输入邮箱后会收到链接...(此处省略一段长文)",
        },
        # ... 更多文档
    ]
    index_documents(docs)
    print(rag("我忘记密码了怎么办"))
```

### 升级路径(从 minimum 到生产)

| 阶段 | 改造 | 收益 |
| --- | --- | --- |
| v1 | 上面这段(naive) | baseline |
| v2 | 加 BM25,做 hybrid | recall +15% |
| v3 | 加 Cohere rerank | precision +20% |
| v4 | 加 query 改写 | 多轮对话场景 +30% |
| v5 | 加 prompt cache(system + 资料部分) | 成本降一半,延迟降 30% |

> Anthropic 的 prompt caching 配 RAG 是绝配——**system prompt 和高频引用的资料块用 cache_control,后续请求只算输入差异**。生产强烈推荐。

---

## 十二、踩坑/选型建议

1. **第一版用 naive RAG + 50 条 eval**。不要一开始就上 hybrid + rerank + query 改写——你不知道哪一步真的有用。
2. **chunk 大小、overlap 这两个参数的影响,比换 embedding 模型大得多**。先调切分,再换模型。
3. **生产场景一定要 hybrid + rerank**。BM25 + 向量 + cross-encoder 是最稳的三件套。
4. **不要一上来就上 1M context"代替 RAG"**。便宜的 RAG 够用就别上贵的长上下文,但**资料只有几十 K 的场景,长上下文 + cache 真的更划算**。
5. **检索召回不到时,先怀疑 chunking 和 embedding,而不是 LLM**。
6. **prompt 里明确说"如果资料不足就说不知道"**,否则模型会用世界知识强答,溯源就废了。
7. **加引用标注**(`[来源 N]`),让用户能点回原文档——大幅提升信任度,且让你 debug 时能定位问题。
8. **元数据过滤经常被忽略**。"只查 2024 年之后的文档"这种 case 比向量过滤准确得多。
9. **每次改动都跑 eval**。Ragas 或自己写,不要靠"我觉得变好了"。
10. **RAG 出错时分两层归因**:先看检索 top-K 里有没有正确答案(如果没有,问题在检索);如果有但 LLM 没用,问题在 prompt 或模型。**不要混在一起改**。

---

下一篇:`23-Embedding与向量数据库.md`,把 RAG 里"向量"这一层的细节展开——选哪个 embedding 模型、用哪个向量库、HNSW 是怎么找邻居的。
