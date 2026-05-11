# Embedding 与向量数据库

22 篇讲了 RAG 的整体流程,但底下的"语义→向量→检索"这一层一直被一笔带过。这一篇把它单独拎出来,讲清楚 **embedding 模型怎么选、向量怎么算距离、向量库为什么不能暴力搜、生产怎么落地**。看完这篇,你就有能力独立搭一个生产级语义检索层。

> 一句话先记住:**Embedding 把"意思"压成几千个浮点数,向量库把"找意思最近的"做到亚毫秒级**。两者加起来才是"语义检索"。

---

## 一、Embedding 的本质

Embedding 是一个函数:

```
f: 文本 → 高维浮点向量(几百到几千维)
```

它的核心约束是:**语义越接近,向量距离越近**。

```python
embed("我爱北京天安门")    → [0.12, -0.03, 0.55, ..., 0.07]    (1024 维)
embed("北京天安门我喜欢")  → [0.11, -0.02, 0.54, ..., 0.08]    (距离非常近)
embed("我讨厌芹菜")        → [0.71,  0.42, -0.21, ..., 0.66]   (距离远)
```

### 怎么训出来的

现代 embedding 模型基本都是 **基于 BERT 类 encoder + 对比学习(contrastive learning)** 训出来的:

| 训练时输入 | 标签 |
| --- | --- |
| (sentence_A, sentence_B) | 1 if 相似, 0 if 不相似 |
| (query, positive_doc, negative_doc) | 让 query-positive 距离 < query-negative 距离 |

训练目标:**把意思相近的拉近、不相近的推远**。学完之后,这个 encoder 就是一个 embedding 模型。

> 5 年工程师视角:**embedding 不是"抽特征",是"度量学习"**。它学的是"什么算近"这件事本身。

---

## 二、主流 Embedding 模型对比

2026 年仍在用的几个主流选项:

| 模型 | 维度 | 出处 | 中文 | 开源 | 备注 |
| --- | --- | --- | --- | --- | --- |
| OpenAI text-embedding-3-large | 3072 | OpenAI | 良 | 否 | 普适首选,贵 |
| OpenAI text-embedding-3-small | 1536 | OpenAI | 良 | 否 | 性价比 |
| Voyage voyage-3 | 1024 | Voyage AI | 优 | 否 | Anthropic 推荐配套 |
| Voyage voyage-3-large | 2048 | Voyage AI | 优 | 否 | 高精度场景 |
| Voyage voyage-code-3 | 1024 | Voyage AI | —— | 否 | 代码检索专用 |
| BGE-M3 | 1024 | 智源 | 优 | 是 | 开源里中文最强之一 |
| BGE-large-zh-v1.5 | 1024 | 智源 | 优 | 是 | 纯中文场景 |
| E5-mistral-7b-instruct | 4096 | 微软 | 优 | 是 | 大、强、贵(7B 模型) |
| Cohere embed-english-v4 / multilingual | 1024 | Cohere | 良 | 否 | API 稳定 |

### 怎么选

| 场景 | 首选 |
| --- | --- |
| 一般中英文检索 | voyage-3 / BGE-M3 |
| 纯中文,本地部署 | BGE-large-zh-v1.5 |
| 代码检索 | voyage-code-3 |
| 极致精度,有 GPU | E5-mistral-7b |
| 已经在 OpenAI 生态 | text-embedding-3-large |

> 经验:**第一版直接选 voyage-3 或 BGE-M3,不要纠结**。两者差距在 RAG 整体表现里通常 < 5%,而 chunking 和 rerank 的影响是 20%+。

---

## 三、维度、归一化、模型迁移

### 维度的取舍

| 维度 | 优点 | 代价 |
| --- | --- | --- |
| 256-512 | 存储省、检索快 | 精度低,适合超大库 |
| 768-1024 | 主流甜点 | 平衡 |
| 1536-3072 | 精度高 | 存储 × 2-3,索引慢 |
| 4096+ | 学术 SOTA | 工程很贵,收益边际递减 |

100 万条 1024 维 float32 向量 = 4GB。3072 维 = 12GB。**生产你会感受到这个差别**。

### Matryoshka:可截断维度

OpenAI text-embedding-3 系列、Voyage 都支持 **Matryoshka 表示**:训练时让前 k 维就具备完整语义能力。**你可以把 3072 维截断到 512 维直接用,精度只掉一点**。

```python
full = embed("hello", model="text-embedding-3-large")[:512]
# 直接用前 512 维,显著降低存储
```

### 归一化

**几乎所有现代 embedding 都是归一化向量**(L2 = 1)。这意味着:

```
余弦相似度 = 内积 (因为 ||a|| = ||b|| = 1)
余弦距离 = 1 - 内积
欧氏距离² = 2 - 2 × 内积  → 单调对应余弦距离
```

**三种距离在归一化下完全等价**。所以你看到向量库支持 cosine / dot / l2 三选一,在归一化场景下选哪个排序结果都一样,**选 dot 算最快**。

### 模型迁移的雷

```
v1: 你用 BGE-M3 索引了 100 万 chunk
v2: 想换成 voyage-3
   ↓
必须 reindex 全部 100 万 chunk(模型不同,向量空间不通用)
```

**两个不同 embedding 模型生成的向量没法混着搜**。这是切换模型最贵的成本。

---

## 四、距离度量

### 三种最常用

| 距离 | 公式 | 适用 |
| --- | --- | --- |
| 余弦 cosine | 1 − (a·b)/(‖a‖‖b‖) | 文本最常用 |
| 内积 dot | a·b | 归一化后 = 余弦,最快 |
| 欧氏 L2 | ‖a − b‖ | 图像、未归一化向量 |

### 直觉

```
余弦:看两个向量"指向是否一致",和长度无关
欧氏:看两个向量"端点是否接近",和长度有关

文本 embedding 训练时学的是"方向相似",所以用余弦/内积最对路
```

### 注意 Chroma 的默认值

Chroma 默认 L2,**很多人没改 metric 上来就用,效果会比 cosine 差一点**:

```python
collection = chroma.get_or_create_collection(
    name="docs",
    metadata={"hnsw:space": "cosine"},  # 必须显式指定
)
```

---

## 五、ANN:为什么不能暴力搜

### 暴力搜的代价

100 万条 1024 维向量,query 来一个,要算 100 万次内积——**每次 query ~50ms,QPS 上不去**。10 亿条直接歇菜。

| 库大小 | 暴力搜延迟 | 还能玩吗 |
| --- | --- | --- |
| 1 万 | < 1ms | 能 |
| 10 万 | ~5ms | 还行 |
| 100 万 | ~50ms | 不行 |
| 1 亿 | ~5s | 完全不行 |

### ANN(Approximate Nearest Neighbor)

ANN 的核心交易:**牺牲一点精度,换几个数量级的速度**。常见三个家族:

| 家族 | 代表 | 思想 |
| --- | --- | --- |
| Tree | Annoy | 用随机超平面切空间,递归 |
| LSH(局部敏感哈希) | FAISS-LSH | 把相似的映射到同一个 hash bucket |
| Graph | HNSW | 建一个"层级邻居图",在图上贪心走 |

2026 年生产里 **HNSW 几乎一统江湖**——Chroma、Qdrant、Milvus、pgvector、Weaviate 都默认 HNSW。

### HNSW 的直觉

```
                                     [上层:稀疏,快速跨大区]
                          A ──────── B
                          │           │
                          │   [中层:中密度]
                  A ── C ── D ── B
                  │    │    │    │
              [下层:全部节点都在这一层]
            A─C─E─F─G─H─D─I─J─K─B...
```

查询过程:

```
从最上层入口节点出发,贪心走到"离 query 最近的"
   ↓ 进到下一层,继续贪心
   ↓ 直到最底层,精确找 K 个
```

**速度从 O(N) 降到 O(log N)**,精度通常能保持 95%+。

### 关键参数

| 参数 | 含义 | 典型值 |
| --- | --- | --- |
| M | 每个节点最大邻居数 | 16-64 |
| efConstruction | 建索引时探索宽度 | 100-400 |
| efSearch | 查询时探索宽度 | 50-200 |

`efSearch` 越大,准确率越高,但越慢。**这个参数是查询时可调的——查询前可以根据 SLA 动态调**。

> 经验:Chroma / Qdrant 默认值都不错,**先跑通再调参**。除非你的库 > 1 亿,默认值基本够用。

---

## 六、向量库选型矩阵

| 库 | 部署 | 规模 | 易用 | 生态 | 适合 |
| --- | --- | --- | --- | --- | --- |
| Chroma | 内嵌 / 单机 | < 1000 万 | 极简 | Python 主 | 原型、小项目、本地 |
| pgvector | Postgres 扩展 | < 1 亿 | 中(SQL) | 和现有 PG 生态融合 | 已用 PG 的团队 |
| Qdrant | 自托管 / SaaS | 数亿 | 中 | Rust,API 干净 | 大规模 + 复杂过滤 |
| Milvus | 自托管 / Zilliz Cloud | 10 亿+ | 复杂 | 大数据生态 | 企业级超大库 |
| Weaviate | 自托管 / SaaS | 数亿 | 中 | 自带模块化(语义/混合/生成) | 一站式 |
| Pinecone | 全托管 SaaS | 数亿 | 极简 | 闭源 | 不想运维 |
| Elasticsearch + dense_vector | 自托管 / SaaS | 数亿 | 中 | 已有 ES 团队 | 复用 ES 集群 |

### 选型决策树

```
项目规模:
├── 原型/小(< 100 万)
│   └── Chroma
├── 中(100 万 ~ 1 亿)
│   ├── 已用 Postgres → pgvector
│   ├── 不想运维   → Pinecone
│   └── 自托管能力强 → Qdrant / Weaviate
└── 超大规模(> 1 亿)
    └── Milvus
```

> 一个朴素的实战建议:**90% 的团队从 Chroma 起步,真到 1000 万条再迁**。提前选 Milvus 是过度工程。

---

## 七、实操:Chroma 本地存储

完整可跑的最小例子。先装包:

```bash
pip install chromadb voyageai
```

```python
import chromadb
import voyageai

vo = voyageai.Client()

# 1. 持久化客户端(写到本地目录)
client = chromadb.PersistentClient(path="./chroma_db")

# 2. 创建 collection,显式指定 cosine
collection = client.get_or_create_collection(
    name="my_docs",
    metadata={"hnsw:space": "cosine"},
)

# 3. 准备文档
docs = [
    "向量数据库的核心是 ANN 算法。",
    "HNSW 是目前最主流的 ANN 索引。",
    "Chroma 是一款轻量级向量库,适合原型阶段。",
    "余弦相似度在归一化向量下等价于内积。",
    "Embedding 把语义压成高维浮点数。",
]

# 4. 批量 embed(注意 input_type 区分)
embeddings = vo.embed(docs, model="voyage-3", input_type="document").embeddings

collection.add(
    ids=[f"doc_{i}" for i in range(len(docs))],
    embeddings=embeddings,
    documents=docs,
    metadatas=[{"category": "tutorial", "lang": "zh"} for _ in docs],
)

# 5. 查询
query = "什么是 HNSW?"
qvec = vo.embed([query], model="voyage-3", input_type="query").embeddings[0]

results = collection.query(
    query_embeddings=[qvec],
    n_results=3,
    where={"lang": "zh"},  # 元数据过滤,贼好用
)

for doc, dist in zip(results["documents"][0], results["distances"][0]):
    print(f"{dist:.4f}  {doc}")
```

### 几个关键细节

1. **`input_type="document"` vs `"query"`**:Voyage、BGE-M3、E5 都支持区分两种调用。**document 时和 query 时用不同 prompt 训过**,混用会掉点。
2. **PersistentClient 写本地磁盘**,EphemeralClient 只在内存。生产用前者。
3. **元数据过滤**:`where={"category": "faq", "year": {"$gte": 2024}}` 能在向量检索的同时按结构化字段过滤,**很多场景比纯向量准多了**。
4. **批量 add**:不要一条条 add,一次几十到几百条最快。

### 删除和更新

```python
# 按 id 删
collection.delete(ids=["doc_0"])

# 按元数据条件删
collection.delete(where={"lang": "en"})

# 更新(本质是 upsert)
collection.upsert(
    ids=["doc_3"],
    embeddings=[new_vec],
    documents=["新版本的文本"],
    metadatas=[{"category": "tutorial", "lang": "zh", "version": 2}],
)
```

---

## 八、踩坑/选型建议

1. **第一版直接 voyage-3 + Chroma**。不要花一周比较 5 个 embedding 模型——它们在你的数据上的差异通常 < 5%,但 chunking 和 rerank 的差异是 20%+。
2. **永远显式指定距离 metric**。Chroma 默认 L2,大多数文本场景你想要 cosine。
3. **embedding 时 input_type 不要漏**。voyage / BGE-M3 / E5 都靠这个区分 query/document。
4. **不要在向量里塞元数据**。"年份很重要,我把年份信息也放进 embed 文本里"——别。**结构化字段走 metadata 过滤,不要污染向量空间**。
5. **千万别中途换模型**。换 embedding 模型 = 全库 reindex。**第一版选型时就要想到 1 年后**。
6. **维度不是越大越好**。1024 维和 3072 维在 RAG 实战表现差距通常 1-3%,但存储和延迟差 3 倍。
7. **HNSW 内存占用是向量本身的 1.5-2 倍**(图结构自己也要存)。容量规划别忘了。
8. **小心索引重建的窗口**。Chroma 加新文档是增量的,但参数(M、efConstruction)改了就要重建。重建期间可能不可用。
9. **生产一定要监控**:每天的 embed 调用次数(贵)、索引大小、p99 检索延迟、recall 抽样评估。
10. **当库到 1000 万条,严肃考虑迁 Qdrant / Milvus**。Chroma 在这个量级会开始喘——内存吃紧、并发上不去。**迁移成本和"等到崩了再迁"比是值得的**。

---

下一篇:`24-ContextEngineering上下文工程.md`,讲怎么在更高一层把 prompt、RAG、tool、memory 拼成一个真正可控的"上下文"——这是从单次 LLM 调用走向 Agent 的桥梁。
