# RAG 数据管道:切片、嵌入、索引、增量更新、评测

跑通一个 RAG demo 一下午,**搭一个能上生产的 RAG 数据管道半年**——这是 2024+ 几乎每个 AI 应用团队的共识。Demo 阶段你只关心「query → embedding → search → 喂 LLM」,但生产环境的真正问题是:**文档天天在变,索引怎么增量更新?切片切错了召回全废,怎么自动测?LLM 回答不靠谱,问题在切片还是召回还是模型?**——这一篇拆生产 RAG 的"数据一侧":Ingestion / Chunking / Embedding / Indexing / Retrieval + Reranker / 增量更新 / 评测回路。**aiLearning 讲模型一侧,本篇讲管道一侧**。

> 一句话先记住:**RAG 不是模型问题,是数据管道问题**。**切片(chunking)决定召回上限,索引(indexing)决定召回速度,增量更新(incremental)决定数据新鲜度,评测(evaluation)决定可观测性**。没评测的 RAG 是黑魔法,生产上能跑但不知道好坏。

---

## 一、生产 RAG 的五段管道

```
┌──────────────────────────────────────────────────────────┐
│                  RAG 数据管道                             │
│                                                          │
│  ① Ingestion (接入)                                       │
│     - Confluence / Notion / GitHub / S3 / DB             │
│     - Webhook / CDC / 定时同步                            │
│                                                          │
│  ② Chunking (切片)                                        │
│     - 固定窗口 / 语义 / 父子 / 标题路径                    │
│     - 元数据保留(source / heading / permission)         │
│                                                          │
│  ③ Embedding (嵌入)                                       │
│     - 调模型(OpenAI / Cohere / 自部署)                  │
│     - 批量 vs 流式                                        │
│     - 只对内容 hash 变化的 chunk 重新嵌入                  │
│                                                          │
│  ④ Indexing (索引)                                        │
│     - 向量库(28 篇) + 全文索引(BM25)                  │
│     - 可能还有图谱(GraphRAG)                            │
│                                                          │
│  ⑤ Retrieval + Rerank (检索 + 重排)                       │
│     - 召回 K=50 → 重排 K=5 → 喂 LLM                       │
│     - 混合搜索(向量 + BM25 + RRF)                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────────────────┐
              │  评测回路 (持续改进)     │
              │  - 离线:RAGAS / TruLens │
              │  - 在线:点击 / 满意度  │
              └─────────────────────────┘
```

---

## 二、Ingestion:文档怎么进来

### 2.1 数据源

```
内部:    Confluence / Notion / Wiki / 内部知识库
         GitHub(代码 + 文档)
         Google Drive / Sharepoint
         数据库(产品规格 / 客户记录)
         Slack / 邮件历史
         
外部:    公开网站爬虫
         RSS / API
         上传的 PDF / Word / 图片
```

### 2.2 增量发现方式

```
1. Webhook        Confluence / Notion 改了 → 推送 → 接入
                   实时性最好,但配置复杂
                   
2. CDC / API 监听  GitHub API 拉 commit、Wiki API 拉 update_at
                   半实时,可靠
                   
3. 定时全量 / 增量 每小时 / 每天扫一遍,diff 检测
                   简单,实时性差
                   
4. 文件系统监听     S3 EventBridge / 文件 inotify
                   实时但事件量大
```

### 2.3 工程模式

```python
@asset
def raw_confluence_pages():
    # 1. 列举所有 page id + version
    page_metas = confluence.list_all_pages()
    # 2. 对比上次 sync 的 version → 拿出有变化的
    changed = [p for p in page_metas if p.version > last_synced[p.id]]
    # 3. 全量拉取内容
    pages = [confluence.get_content(p.id) for p in changed]
    # 4. 落 Iceberg(带 ingestion_time)
    write_to_iceberg("raw_confluence", pages)
    return changed
```

---

## 三、Chunking:RAG 召回的生死命脉

### 3.1 为什么切片是关键

```
LLM context 窗口有限(8k - 200k token)
                ↓
            不可能塞整个文档
                ↓
        必须切成 chunk,只塞相关的几个
                ↓
   切片质量 = 召回质量
                ↓
   切错了:语义被切碎 → 召回看不到完整答案
```

### 3.2 切片策略

```
固定窗口(Fixed-size):
  按字符数 / token 数切
  简单,但可能切断句子 / 段落
  适合:平均长度均匀的文档

递归切片(Recursive):
  优先按段落 → 句子 → 词,直到切到 chunk_size 内
  保持语义完整
  适合:结构化文档(技术文档 / Wiki)

语义切片(Semantic):
  用 embedding 检测语义边界,在「话题切换」处切
  最贴合语义,但慢
  适合:长文档 / 论文

文档结构感知切片:
  按 Markdown / HTML heading 切
  保留 H1 / H2 / H3 路径作为元数据
  适合:Wiki / 技术文档

父子切片(Small-to-Big):
  Small chunks(256 token)用于召回(语义集中)
  召回后扩展到 Big chunk(2048 token)喂 LLM(上下文充足)
  适合:RAG 高级用法,召回精度 + 上下文兼顾
```

### 3.3 Chunk Size 的常见挡位

```
256 token    QA 问答    (LangChain demo 默认)
512 token    平衡       (大部分项目起步)
1024 token   长上下文 LLM 时代,信息密度更高
2048 token   父子切片的 big chunk
```

### 3.4 必须保留的元数据

```python
chunk = {
    "id": "uuid",
    "text": "...",
    "embedding": [...],
    "source_url": "https://confluence/space/page/123",
    "doc_id": "page_123",
    "version": 7,
    "heading_path": ["产品手册", "API", "认证"],
    "chunk_index": 3,            # 该文档的第几个 chunk
    "total_chunks": 12,
    "permission_groups": ["engineering", "ops"],
    "updated_at": "2025-05-11T..."
}
```

**没元数据**:
- 检索结果无法回链到源
- 无法权限过滤
- 无法增量更新
- LLM 给的答案无 citation,幻觉无从追溯

---

## 四、Embedding:把文本变向量

### 4.1 模型选型

```
OpenAI text-embedding-3-small    1536 维,$0.02/1M tokens,2024 起步
OpenAI text-embedding-3-large    3072 维,$0.13/1M tokens
Cohere embed-multilingual        多语言友好
                                 
开源:
BGE / bge-large-zh / bge-m3     中文友好,可自部署
e5 / e5-mistral-7b               通用强
Jina embeddings                  多模态(文本 + 图)
                                 
中文 specialized:
M3E / GTE-large-zh               中文场景常用
```

### 4.2 批量调用

```python
# 一次调一行 → 慢 + 贵
for chunk in chunks:
    embed = openai.embeddings.create(input=chunk).data[0].embedding

# 批量调(OpenAI 一次最多 2048 个)
batches = [chunks[i:i+256] for i in range(0, len(chunks), 256)]
for batch in batches:
    embeds = openai.embeddings.create(input=[c.text for c in batch]).data
    save(batch, embeds)
```

### 4.3 只对内容变化的 chunk 重新嵌入

```python
content_hash = sha256(chunk.text)
if content_hash != stored_hash:
    # 内容变了,重新嵌入
    embed = embed_model(chunk.text)
    save(chunk_id, embed, content_hash)
else:
    # 内容没变,跳过(省钱省时间)
    pass
```

**Embedding 调用是 RAG 管道里最贵的一项**,**hash 检查 + skip 是必备优化**。

### 4.4 流式 vs 批

```
批模式:     每天凌晨,把当天有变更的文档全部重新嵌入
             适合:大部分文档低频更新
             
流式:       Webhook 触发 → 立即嵌入 → 立即更新索引
             适合:高频更新 / 实时性要求高
             
混合:        热文档(经常被查)流式 + 冷文档批
```

---

## 五、Indexing:存哪儿

### 5.1 三类索引

```
向量索引     语义相似度(28 篇:pgvector / Qdrant / Milvus / ...)
全文索引     精确 / BM25(Elasticsearch / Postgres tsvector / Tantivy)
图谱索引     实体关系(Neo4j / Memgraph)+ GraphRAG(2024+)
```

### 5.2 存储方案

```
轻量(< 千万 chunk):
  pgvector 单库 + tsvector 全文 + 业务表
  一个 PG 实例搞定
  
中等(千万到亿):
  Qdrant / Milvus 向量
  + Elasticsearch / OpenSearch 全文
  + 元数据存 PG
  
大型(亿+):
  专用向量库分布式
  + 专用全文搜索集群
  + 图谱(GraphRAG)
  + Iceberg(原始文档归档)
```

### 5.3 索引 schema

```sql
-- pgvector + tsvector 一体
CREATE TABLE chunks (
    id BIGINT PRIMARY KEY,
    doc_id TEXT,
    chunk_index INT,
    text TEXT,
    text_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('chinese', text)) STORED,
    embedding VECTOR(1536),
    heading_path TEXT[],
    source_url TEXT,
    permission_groups TEXT[],
    content_hash TEXT,
    updated_at TIMESTAMP
);

CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON chunks USING gin (text_tsv);
CREATE INDEX ON chunks USING gin (permission_groups);
CREATE INDEX ON chunks (doc_id, chunk_index);
```

---

## 六、增量更新:RAG 数据管道的核心难题

### 6.1 问题

```
文档天天变:
  - Confluence 页面被改了
  - 文档被删了
  - 新文档被加了
  
RAG 索引必须跟上,否则:
  - 删了的文档仍被召回(幻觉源)
  - 新文档查不到
  - 旧版本误导回答
```

### 6.2 核心原则:doc_id 的 chunk 全删再插

```python
def update_doc(doc_id, new_text):
    # 1. 删除该 doc_id 的所有旧 chunk
    db.execute("DELETE FROM chunks WHERE doc_id = %s", doc_id)
    
    # 2. 重新切片
    new_chunks = chunk(new_text)
    
    # 3. 嵌入(用 content_hash 跳过未变化的)
    for c in new_chunks:
        if not embeds_cache.get(c.hash):
            c.embedding = embed_model(c.text)
            embeds_cache[c.hash] = c.embedding
        else:
            c.embedding = embeds_cache[c.hash]
    
    # 4. 插入
    db.insert_many("chunks", new_chunks)
```

**为什么不增量更新单个 chunk**:
- chunk 划分可能变(切片算法变了 / 文档结构变了)
- 同一段文本 chunk_id 可能不同
- 全删再插简单可靠

### 6.3 删除文档

```python
def delete_doc(doc_id):
    db.execute("DELETE FROM chunks WHERE doc_id = %s", doc_id)
```

### 6.4 Soft delete vs Hard delete

```
Soft delete:   加 is_deleted=true,检索时过滤
                好处:可恢复
                坏处:索引膨胀
                
Hard delete:   直接删
                好处:索引干净
                坏处:误删难恢复
                
工程建议:Hard delete + 保留 Iceberg 原始文档归档
```

### 6.5 防止"孤儿"

```
失败场景:
  删除 chunks 成功
  → 插入新 chunks 失败
  → 该文档不在索引里
  
解决:事务包装 / 重试 / 监控不一致
```

---

## 七、Retrieval + Reranker

### 7.1 三步走

```
第一步:粗召回 K=50
   向量召回 25 + BM25 召回 25 → RRF 融合
   
第二步:重排 K=10
   Cross-encoder 模型对每个 (query, chunk) 算精确相关性分
   
第三步:取 top 3-5 → 喂 LLM
```

### 7.2 Reranker 模型

```
BAAI/bge-reranker-large            中文友好
BAAI/bge-reranker-v2-m3            多语言
Cohere Rerank API                   托管 SaaS
Jina Reranker                       Jina 出品
```

### 7.3 代码

```python
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("BAAI/bge-reranker-large")

def retrieve(query, top_k=5):
    # 1. 粗召回(混合搜索)
    candidates = hybrid_search(query, top_k=50)
    
    # 2. Rerank
    pairs = [(query, c.text) for c in candidates]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(candidates, scores), key=lambda x: -x[1])
    
    # 3. Top K
    return [c for c, _ in ranked[:top_k]]
```

---

## 八、评测回路:RAG 必须有 SLA

### 8.1 离线评测

```
测试集:    几百到几千个 (query, expected_answer, expected_docs)
            人工标注 / LLM 生成 + 人工校对
            
评测指标:
  Context Recall:       召回的文档是否覆盖答案需要的信息
  Context Precision:    召回的文档跟问题相关的比例
  Faithfulness:         答案是否忠于召回内容(不幻觉)
  Answer Relevance:     答案是否切题
```

### 8.2 RAGAS

```python
from ragas import evaluate
from ragas.metrics import context_recall, faithfulness, answer_relevancy

result = evaluate(
    dataset=test_dataset,
    metrics=[context_recall, faithfulness, answer_relevancy]
)
print(result.scores)
```

### 8.3 TruLens

类似 RAGAS,但更注重「**生产环境实时监控**」:

```python
from trulens.core import TruSession
session = TruSession()

@session.app(app_id="my_rag")
def my_rag(query):
    docs = retrieve(query)
    return llm.generate(query, docs)

# 自动记录每次调用 + 评测分数
```

### 8.4 在线评测

```
点击率:           用户点了 LLM 给的链接
点踩 / 点赞:      用户对答案打分
满意度调查:        随机抽样问"答案有帮助吗"
follow-up:        用户问了 follow-up 说明前一回答不够
```

收集这些信号 → 形成「**坏案例池**」→ 加入下一版评测集 → **持续改进**。

---

## 九、工程落地:一个完整 RAG 管道

```python
# Dagster Asset 定义
from dagster import asset, AssetCheckSpec

@asset
def raw_documents():
    """Webhook + 定时同步,落 Iceberg"""
    return ingest_from_confluence_and_github()

@asset(deps=[raw_documents])
def chunked_documents():
    """递归切片,按 heading 切,512 token,带元数据"""
    return chunk_documents(load_changed_docs())

@asset(deps=[chunked_documents])
def embeddings():
    """对 hash 变化的 chunk 嵌入"""
    return embed_changed_chunks()

@asset(deps=[embeddings])
def index_state():
    """同步到 pgvector + Elasticsearch"""
    return index_to_search_systems()

@asset(deps=[index_state])
def ragas_evaluation():
    """每次索引更新后跑 RAGAS"""
    score = ragas_evaluate(load_test_set())
    assert score["faithfulness"] > 0.85  # 失败 = pipeline 失败
    return score
```

```python
# 应用侧
def answer(query, user):
    # 权限感知召回
    docs = retrieve_with_permissions(query, user.groups, top_k=5)
    answer = llm.generate(query, context=docs)
    return {
        "answer": answer,
        "citations": [d.source_url for d in docs]
    }
```

---

## 十、几个生产常见坑

### 10.1 切片把代码块切碎

```
Markdown 代码块:
  ```python
  def f():
      # ...大段函数
  ```
  
固定 512 token 切片 → 函数被切成 3 chunk → 召回看不到完整代码
                                            ↓
                                       代码 RAG 召回烂

解法:Markdown-aware chunker(LangChain 的 MarkdownTextSplitter)
      代码块不切,作为整体 chunk
```

### 10.2 没有 source attribution

```
LLM 给:「根据文档,xxx」
        但没说哪个文档
        → 用户无法验证 → 信任崩塌
        
解法:每个 chunk 必带 source_url,LLM prompt 强制 citation
```

### 10.3 索引重建 vs 渐进式

```
模型 / 算法 / 切片策略变了 → 整个索引要重建
                              ↓
                       中途用户查询命中新旧索引混合
                              ↓
                          结果飘忽

解法:
  - 双索引并行(新 / 旧)
  - 切流量验证后 cutover
  - 类似 Nessie 数据分支(11 篇)的思路
```

### 10.4 多语言

```
英文文档 + 中文查询 + 英文 embedding 模型 → 召回烂

解法:
  - 用多语言 embedding(bge-m3)
  - 或翻译统一到一种语言
```

### 10.5 长尾 query

```
"今天天气怎么样" → RAG 找不到相关文档 → LLM 编造

解法:
  - 召回不到 → 拒绝回答(让 LLM 说"我不知道")
  - 或返回"暂无相关信息"
  - 或 fallback 到通用搜索
```

---

## 十一、未来:Long Context vs RAG

### 11.1 Long Context 派的论调

「**2M token context 时代了,RAG 还需要吗?**」

```
GPT-4 Turbo: 128k
Gemini 1.5: 2M
Claude 3.5: 200k

→ 直接把所有文档塞进 context?
```

### 11.2 RAG 仍然必要的理由

```
- 成本:RAG 几分钱,2M context 几美元/次
- 延迟:RAG 几百 ms,Long Context 几秒到几十秒
- 召回质量:Long Context 模型有"中间被忽略"问题(Lost in the middle)
- 数据规模:超大 KB(几十 GB)塞不进 context
- 实时性:文档变了,RAG 增量索引快
```

**事实**:**Long Context + RAG 互补**——RAG 先粗召回相关文档,Long Context 模型在足够上下文里精读。

---

## 十二、看完这一篇,你应该能

- 在白板上画 RAG 数据管道五段(Ingestion / Chunking / Embedding / Indexing / Retrieval)
- 选切片策略(固定 / 递归 / 语义 / 父子)
- 知道 chunk_size 的常见挡位(256/512/1024)
- 解释增量更新的核心(doc_id 全删再插 + hash 跳过未变 embedding)
- 看到生产 RAG 默认配置(混合搜索 + Reranker + 评测回路)
- 知道 RAGAS / TruLens 是评测工具,没评测的 RAG 是黑魔法
- 给团队建议:Long Context 不替代 RAG,二者互补

下一篇:**30 特征平台** — Feature Store / 离线 + 在线 / Training-Serving Skew。RAG 是文本一侧,特征平台是结构化数据一侧的 ML 数据管道。
