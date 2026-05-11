# 图数据库 Neo4j

12~17 章把 SQL / NoSQL 主流数据库讲完了——但有一种问题它们都解不好:**关系密集型查询**。

"找出我朋友的朋友的朋友里,3 度内点过赞且现在也喜欢摇滚的人"——这种 query 在 MySQL 里要做 4 次自连接,百万级数据就跑不动了。**图数据库**为这个场景而生。

---

## 一、为什么 SQL 在"关系"上吃力

```
  用户 user
   ├─ 关注 → user
   ├─ 点赞 → post
   ├─ 评论 → post
   ├─ 收藏 → product
   └─ 购买 → product

  问:从 A 出发,3 跳能到达多少个商品?
```

SQL 表达:

```sql
-- 一跳
SELECT b.id FROM follow f1 JOIN user b ON f1.followee = b.id WHERE f1.follower = 'A';

-- 三跳:JOIN follow JOIN follow JOIN follow JOIN like JOIN product
SELECT DISTINCT p.id
FROM follow f1
JOIN follow f2 ON f2.follower = f1.followee
JOIN follow f3 ON f3.follower = f2.followee
JOIN like l    ON l.user_id  = f3.followee
JOIN product p ON p.id = l.target_id;
```

**性能炸点**:每多一跳,JOIN 笛卡尔积膨胀几个数量级——MySQL 撑不住 4-5 跳的图。

图数据库的内部数据结构是**节点 + 边的指针**——遍历一条边是 **O(1)** 而非 O(N)。这是它在多跳查询上甩开 SQL 几个数量级的根因。

---

## 二、图数据库选型

| 数据库 | 类型 | 特点 |
| --- | --- | --- |
| **Neo4j** | LPG(标记属性图) | **事实标准**,Cypher 查询语言 |
| **NebulaGraph** | LPG | 国产,主打"百亿规模图" |
| **JanusGraph** | LPG | 跑在 HBase / Cassandra 上,扩展性强 |
| **TigerGraph** | LPG | 商业,大规模 + 实时 OLAP |
| **Amazon Neptune** | LPG + RDF | AWS 托管 |
| **Dgraph** | GraphQL native | GraphQL 优先 |
| **ArangoDB** | 多模(图+文档+KV) | 一库多用 |

> 经验法则:**入门和中型业务用 Neo4j**(社区版免费,生态最好);**百亿级关系**(国内大厂常见)上 NebulaGraph;**超大规模 + AWS 栈**走 Neptune。

---

## 三、LPG 模型:节点 / 边 / 属性

```
        [User: alice]
           │ FOLLOWS {since: 2024}
           ▼
        [User: bob]
           │ LIKES {at: 2024-04-12}
           ▼
        [Post: p1, content="..."]
```

| 元素 | 说明 |
| --- | --- |
| **Node**(节点) | 一个实体(User、Post、Product) |
| **Label**(标签) | 节点类型(:User, :Post) |
| **Relationship**(边) | 节点之间的有向连接(:FOLLOWS, :LIKES) |
| **Property**(属性) | 节点 / 边上的键值对 |

**关键认知**:**关系是一等公民**——它有方向、有类型、有属性,跟节点平级。SQL 里关系是"外键",图里关系是"对象"。

---

## 四、Neo4j 部署

```bash
# Docker 起一个
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password123 \
  neo4j:5.20

# 7474 = HTTP UI, 7687 = Bolt 协议(客户端用)
```

打开 `http://localhost:7474`,在 Browser 里直接写 Cypher。

---

## 五、Cypher:图的"SQL"

设计灵感是 **"用 ASCII 画图"**:

```
节点:(变量:Label {属性})
边:  -[变量:类型]->
```

### 基础查询

```cypher
// 创建节点和关系
CREATE (a:User {name: 'Alice', age: 28})
CREATE (b:User {name: 'Bob',   age: 30})
CREATE (a)-[:FOLLOWS {since: date('2024-01-15')}]->(b);

// 查询 alice 关注的人
MATCH (a:User {name: 'Alice'})-[:FOLLOWS]->(b)
RETURN b.name, b.age;

// 互相关注
MATCH (a:User)-[:FOLLOWS]->(b:User)-[:FOLLOWS]->(a)
RETURN a.name, b.name;
```

### 多跳遍历(图的杀手锏)

```cypher
// alice 的 3 度好友
MATCH (a:User {name: 'Alice'})-[:FOLLOWS*1..3]-(friend)
RETURN DISTINCT friend.name;

// 最短路径
MATCH p = shortestPath((a:User {name:'Alice'})-[:FOLLOWS*]-(b:User {name:'Eve'}))
RETURN p, length(p);

// 所有最短路径
MATCH p = allShortestPaths((a)-[*]-(b)) RETURN p;
```

### 推荐场景

```cypher
// "你可能认识的人":朋友的朋友,但不是你已关注的
MATCH (me:User {name:'Alice'})-[:FOLLOWS]->(friend)-[:FOLLOWS]->(suggest)
WHERE NOT (me)-[:FOLLOWS]->(suggest) AND me <> suggest
RETURN suggest.name, count(*) AS commonFriends
ORDER BY commonFriends DESC LIMIT 10;
```

```cypher
// 协同过滤:"喜欢这个商品的人也喜欢"
MATCH (target:Product {id: 'p1'})<-[:LIKED]-(u:User)-[:LIKED]->(other:Product)
WHERE other <> target
RETURN other.name, count(u) AS coLikes
ORDER BY coLikes DESC LIMIT 20;
```

> 经验法则:**这种推荐 query 在 Neo4j 几十毫秒,在 MySQL 几十秒**——这就是为什么社交平台必上图数据库。

---

## 六、索引与约束

Neo4j 也需要索引,否则 `MATCH (u:User {name:'Alice'})` 全图扫:

```cypher
// 唯一约束(自动建索引)
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

// 普通索引
CREATE INDEX user_name IF NOT EXISTS FOR (u:User) ON (u.name);

// 复合索引
CREATE INDEX user_country_age FOR (u:User) ON (u.country, u.age);

// 关系属性索引(5.0+)
CREATE INDEX rel_since FOR ()-[r:FOLLOWS]-() ON (r.since);

// 全文索引
CREATE FULLTEXT INDEX postContent FOR (p:Post) ON EACH [p.title, p.body];

// 用全文索引
CALL db.index.fulltext.queryNodes('postContent', 'java AND spring')
YIELD node, score
RETURN node.title, score;
```

> 经验法则:**Neo4j 起步必建主键唯一约束** + **常查的属性索引**。否则 1 万节点就开始慢。

---

## 七、Spring 集成:Spring Data Neo4j

```gradle
implementation 'org.springframework.boot:spring-boot-starter-data-neo4j'
```

```yaml
spring:
  neo4j:
    uri: bolt://localhost:7687
    authentication:
      username: neo4j
      password: password123
```

```java
@Node("User")
public class User {
    @Id @GeneratedValue private String id;
    private String name;
    private int age;

    @Relationship(type = "FOLLOWS", direction = OUTGOING)
    private Set<User> following = new HashSet<>();
}

public interface UserRepository extends Neo4jRepository<User, String> {
    @Query("""
        MATCH (a:User {name: $name})-[:FOLLOWS*1..3]-(friend)
        RETURN DISTINCT friend
    """)
    List<User> findFriendsWithin3Hops(String name);
}
```

> 经验法则:**复杂 Cypher 不要套对象映射**——直接 `@Query` 写 Cypher 返回 `Map` / 投影对象,性能和清晰度都好。

---

## 八、典型应用场景

### 1. 社交网络

```
用户 — 关注 → 用户
用户 — 发布 → 帖子
用户 — 点赞/评论 → 帖子

应用:好友推荐、热门内容、影响力分析
```

### 2. 风控 / 反欺诈

```
账号 — 共用设备 → 设备
账号 — 共用 IP → IP
账号 — 转账 → 账号

应用:发现"团伙"——同一设备上的多个账号、相互转账闭环、高风险关联
```

```cypher
// 找"3 个账号互相转账闭环"
MATCH (a)-[:TRANSFER]->(b)-[:TRANSFER]->(c)-[:TRANSFER]->(a)
WHERE a <> b AND b <> c
RETURN a, b, c;
```

### 3. 知识图谱

```
实体:人 / 公司 / 产品 / 概念
关系:任职 / 投资 / 竞品 / 包含
属性:时间、地理、类型

应用:智能问答("XX 公司的 CTO 之前在哪工作过?")、关联检索
```

### 4. 权限关系(ReBAC)

```
用户 — 协作 → 文档
用户 — 拥有 → 项目 — 包含 → 文档
组 — 有成员 → 用户

应用:Google Drive 这类"复杂权限"
```

### 5. 网络拓扑 / 依赖分析

```
服务 — 依赖 → 服务
机器 — 部署 → 服务

应用:链路追踪、影响面分析("某 DB 挂了影响哪些服务")
```

---

## 九、图算法:Neo4j Graph Data Science

Neo4j 有专门的 GDS 库,内置上百个图算法:

| 算法 | 用途 |
| --- | --- |
| **PageRank** | 节点重要性(谁是 KOL) |
| **Louvain / Label Propagation** | 社区发现(找出"圈子") |
| **Connected Components** | 连通分量 |
| **Shortest Path** | 最短路径 |
| **Node2Vec / FastRP** | 图嵌入(给节点算向量,给 ML 用) |
| **Triangle Count** | 紧密度 |
| **Betweenness Centrality** | 中介中心性(信息桥梁) |

```cypher
// 算 PageRank
CALL gds.graph.project('mygraph', 'User', 'FOLLOWS');
CALL gds.pageRank.stream('mygraph')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS name, score
ORDER BY score DESC LIMIT 10;
```

> 经验法则:**风控、推荐这种业务用 GDS 直接出特征**——比自己写 Spark 算图算法快十倍。

---

## 十、Neo4j vs SQL 性能比较心智

| 操作 | Neo4j | SQL |
| --- | --- | --- |
| 1 跳查询 | 类似 | 类似 |
| 3 跳查询 | 几十 ms | 几秒 |
| 5+ 跳查询 | 仍可接受 | 跑不出来 |
| 全表聚合 | 不擅长 | 擅长 |
| OLAP / BI | 不擅长 | 擅长 |
| 写入吞吐 | 中等 | 高 |
| ACID 事务 | 支持 | 支持 |
| 水平扩展 | 难(企业版有 Fabric) | 中等(分库分表) |

**结论**:**图数据库不是 SQL 替代品**——它是 SQL 解决不好的场景的"专科医生"。多数项目里,**主库还是 MySQL/PG,图库是辅助**。

---

## 十一、数据建模技巧

### 1. 关系还是属性?

```
User — LIKES → Post   (关系)
还是
User { likedPosts: [...] }   (属性)
```

**判断标准**:有没有 "JOIN" 需求。如果你要"找所有点过 P1 的人",必须建关系。

### 2. 关系上要不要存属性

```
User —[:LIKED {at: 2024-04-12}]→ Post

时间戳放边上更紧凑;放到独立 Like 节点更复杂但能挂更多属性
```

### 3. 超级节点(SuperNode)

某个 User 关注了 100 万人,这种"超级节点"的遍历会卡。

破法:

- 拆边类型(`:FOLLOWS_2024`, `:FOLLOWS_2025` 按时间分)
- 加索引(关系上的索引)
- 业务上限(微博"关注上限 2000")

> 经验法则:**任何热点节点都要预设上限或分桶**——不然总有一天某个 KOL 把整个查询拖崩。

---

## 十二、和其他存储的协作

```
            ┌──────────┐
            │  MySQL   │  ← 主数据,真相之源
            └────┬─────┘
                 │ CDC(46 章)
                 ▼
            ┌──────────┐
            │  Kafka   │
            └────┬─────┘
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
   ┌────────┐         ┌────────┐
   │ Neo4j  │         │  ES    │  ← 各自负责擅长的查询
   └────────┘         └────────┘
   关系查询             全文检索
```

**别让 Neo4j 当主库**——重要业务数据的"权威源"放 MySQL/PG,图库只存"为关系查询所必需的快照"。

---

## 十三、常见踩坑

1. **没建索引就开始查**:1 万节点就开始慢,10 万直接卡死
2. **超级节点**:某 KOL 关注/被关注几百万,查询炸
3. **关系滥建**:每条 Like 都建关系,几十亿条边占爆磁盘
4. **OLAP 找 Neo4j 算**:全图聚合不是它的菜,**用 ClickHouse**
5. **图当主库用**:写吞吐扛不住,且 ACID 范围比关系库小
6. **GDS 直接全图跑**:数据量大时 OOM,要先 project 到子图
7. **Cypher 写得太复杂**:几百行一个 query,优化器跑不过
8. **没用 PROFILE / EXPLAIN**:慢查询不知道哪卡
9. **混淆方向**:`->` 和 `<-` 写反,查不出结果
10. **批量写没用 UNWIND**:一条一条 CREATE 慢百倍
11. **不分页**:三跳查出几百万结果一次返回,炸内存
12. **直接对外暴露 Cypher**:类似 SQL 注入,业务必须参数化
13. **用 Neo4j 建模文档型数据**:本来该用 MongoDB
14. **企业版 / Fabric 不评估,直接想"水平扩展"**:社区版单机有上限

---

## 十四、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 关系密集 + 多跳查询 才上图 | CRUD 别上 |
| ✅ Neo4j 起步,大规模换 Nebula | 选型按规模 |
| ✅ 主键 unique 约束 + 常查属性索引 | 性能基础 |
| ✅ 超级节点预设上限或分桶 | 防热点 |
| ✅ 复杂 Cypher 写 PROFILE 看执行计划 | 优化必备 |
| ✅ 批量写用 UNWIND | 性能 ×100 |
| ✅ 图库当辅助,不当主库 | MySQL 是真相 |
| ✅ CDC 同步主库到图库 | 数据一致 |
| ✅ GDS 跑算法前 project 子图 | 防 OOM |
| ✅ 业务参数化 Cypher | 防注入 |
| ✅ 监控关系数 / 节点数 / 慢查询 | 健康度 |

---

## 小结

图数据库不是"更高级的数据库",**是为"关系密集"场景而生的专科工具**。

记住三件事:

1. **多跳查询 + 关系即业务** → 图数据库不可替代
2. **Neo4j 是绝大多数项目的起点**,Cypher 学习曲线友好
3. **图库当辅助**——主数据放 MySQL/PG,CDC 同步到 Neo4j 做关系查询

下一章我们换数据团队的视角——**数据仓库与数据湖**(Hive / Iceberg / Hudi),这是 BI、数据分析、AI 训练数据的根基。
