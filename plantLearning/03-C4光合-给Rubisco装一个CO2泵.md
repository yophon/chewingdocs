# C4 光合:给 Rubisco 装一个 CO2 泵

02 篇讲了 Rubisco 的缺陷:会错抓 O2,高温下错得更多。C4 植物的解决办法不是换酶,而是在 Rubisco 外面加一道工序,先把 CO2 抓住、运走、浓缩,再交给 Rubisco。这一篇讲这道工序怎么运转、要耗多少能量,以及它换来了什么、又留下了哪些短板。为什么 C4 没有因此淘汰 C3,放到 04 篇专门讲。

> 一句话先记住:**C4 植物让叶肉细胞用不会错抓 O2 的 PEP 羧化酶先抓 CO2,做成四碳酸运进维管束鞘细胞,再在那里放出 CO2 交给 Rubisco。每固定一个 CO2 要多花约 2 个 ATP,换来几乎没有光呼吸、更省水、更省氮;代价是在凉爽和弱光环境里不划算,而且普遍怕冷、适应弱光的能力差。**

---

## 一、两种细胞的分工

### 1.1 花环结构

把玉米叶片横切开放到显微镜下,会看到每条叶脉外面围着一圈排列紧密、叶绿体很多的细胞,这叫**维管束鞘细胞**;再往外是一圈叶肉细胞。这种同心圆式的结构像一个花环,所以叫"花环结构"(Kranz 结构,Kranz 是德语"花环")。C4 植物的叶脉通常也比 C3 植物密得多,保证每个叶肉细胞离维管束鞘都不远。

### 1.2 CO2 怎么被"泵"进去

```text
叶肉细胞:
  CO2 -> (碳酸酐酶) -> HCO3-
  HCO3- + 磷酸烯醇式丙酮酸(PEP) -> (PEP 羧化酶) -> 草酰乙酸(4 碳)
  草酰乙酸 -> 苹果酸或天冬氨酸(4 碳),运往维管束鞘

维管束鞘细胞:
  4 碳酸 -> 脱羧 -> CO2 + 3 碳化合物
  CO2 在这里被浓缩 -> Rubisco -> 卡尔文循环

回到叶肉细胞:
  3 碳化合物 -> 丙酮酸 -> (丙酮酸磷酸二激酶,PPDK,消耗 ATP) -> PEP,继续抓下一个 CO2
```

关键在于两点:

- **PEP 羧化酶不会错抓 O2**:它的底物是 HCO3-,对 O2 没有反应,而且亲和力高,CO2 很少时也能抓得住
- **Rubisco 被关在 CO2 浓度很高的地方**:维管束鞘细胞的细胞壁让 CO2 不容易漏出去,CO2 浓度可以提高到大气水平的数倍到十倍左右(教科书常见估算),光呼吸被压到很低

### 1.3 为什么叫"C4"

20 世纪 60 年代,Kortschak 等人和 Hatch 与 Slack 在研究甘蔗叶片时发现,甘蔗用放射性 CO2 标记后最先出现标记的不是卡尔文循环里的三碳化合物,而是四碳的有机酸。Hatch 与 Slack 在 1966 年报道了这条新的羧化途径。因为最初的固定产物是四碳酸,这类植物被称为 C4 植物;相应地,最初产物是三碳化合物的被称为 C3 植物。

---

## 二、能量账

### 2.1 多出来的 2 个 ATP

每固定一个 CO2 的大致成本:

| | ATP | NADPH |
| --- | ---: | ---: |
| C3 | 约 3 | 2 |
| C4 | 约 5 | 2 |

多出来的约 2 个 ATP 花在把丙酮酸重新变回 PEP 上:丙酮酸磷酸二激酶消耗一个 ATP,但把它分解成 AMP,相当于用掉了两个 ATP 的高能键。

### 2.2 泄漏让账更贵

被泵进维管束鞘的 CO2 并不会全部被 Rubisco 用掉,有一部分会漏回叶肉细胞。漏掉的 CO2 要重新被抓、重新运一次,所以实际成本比上表还要高一些。泵的效率,很大程度上取决于维管束鞘"关得有多严"。

---

## 三、三种亚型

C4 植物在维管束鞘里放出 CO2 的方式不止一种,按负责脱羧的酶分为三类:

| 亚型 | 运进维管束鞘的主要是 | 脱羧的位置 | 代表 |
| --- | --- | --- | --- |
| NADP-苹果酸酶型 | 苹果酸 | 叶绿体 | 玉米、甘蔗、高粱 |
| NAD-苹果酸酶型 | 天冬氨酸 | 线粒体 | 稷(黍)、苋菜 |
| PEP 羧激酶型 | 天冬氨酸等 | 细胞质 | 大黍等部分禾草 |

不同亚型的能量账和对环境的反应略有差别。比如 Sonawane 等 (2018) 发现,遮阴对 NADP-苹果酸酶型禾草光合效率的削弱,比另外两种亚型更小。

---

## 四、换来了什么

### 4.1 几乎没有光呼吸

02 篇引用过 Ehleringer 与 Björkman (1977) 的测量:30°C 时,C4 植物的光量子效率在普通空气和低氧条件下几乎相同,而且基本不随温度变化。光呼吸基本被压住,高温下 C4 的优势就来自这里。

### 4.2 更省水

Rubisco 周围的 CO2 已经被泵到很高的浓度,叶片不需要把气孔开得很大也能维持光合速率。气孔开得小,丢的水就少,所以 C4 植物每固定一份碳丢的水通常明显少于 C3 植物。在炎热干燥的环境里,这一点和"没有光呼吸"同样重要。

### 4.3 更省氮

02 篇说过,C3 植物要造大量 Rubisco 才能弥补它的慢和错。C4 植物的 Rubisco 工作在高 CO2 条件下,效率高得多,同样的光合速率需要的 Rubisco 少得多,叶片里的氮就可以少一些。

---

## 五、付出了什么

### 5.1 凉爽时不划算:交叉温度的两个口径

多花的 2 个 ATP 是固定开销,而光呼吸的损失随温度变化。温度低到一定程度,C3 的光呼吸损失就小于 C4 泵的耗能,C3 反而更划算。这个分界点叫**交叉温度**,文献里有两个口径,不能混用:

- **叶片尺度**:Ehleringer 与 Björkman (1977) 的测量中,约 30°C 时 C3 和 C4 的光量子效率相近;低于这个温度,C3 的效率更高
- **气候尺度**:Collatz、Berry 与 Clark (1998) 估算,在当前 CO2 浓度下,这个分界相当于最热月平均气温约 22°C,大致对应 C4 草和 C3 草在地理上的分界线(这个数字我们是从引用它的综述里看到的,没有核对原文)

两个口径都会随 CO2 浓度变化:CO2 越低,光呼吸越重,交叉温度越低,C4 能占的地盘越大(Ehleringer 等,1997)。

### 5.2 怕冷

很多 C4 植物在低温下光合能力明显下降,有的还会受冷害。Sage 与 Kubien (2007) 的综述认为,在耐寒的 C4 物种中,20°C 以下限制光合作用的主要是 Rubisco 的总量:C4 植物本来就"省着用"Rubisco,天一冷,这点 Rubisco 就不够了。另有研究推断,负责重新生成 PEP 的丙酮酸磷酸二激酶在低温下容易失活,也是 C4 怕冷的原因之一。

也有例外。芒属的巨芒(*Miscanthus × giganteus*)等少数 C4 植物能在较凉的气候里保持不错的光合能力,所以被用作温带地区的能源作物。

### 5.3 弱光下适应能力差

Sage 与 McKown (2006) 的综述专门讨论了"C4 的表型可塑性是否比 C3 差",结论是肯定的:

- 一些 C4 物种在弱光下生长时,维持不住高的光量子效率
- 一些 C4 物种在遮阴时不能相应减少羧化酶的含量,留下大量用不上的酶
- 耐阴的 C4 禾草在林下光斑过后,不能像 C3 植物那样保持光合"预热"状态,利用短暂光斑的能力较差

作者的解释是,叶肉和维管束鞘两种细胞必须精确配合,环境变化时调整的余地小,改动一边就可能打乱两个循环之间的协调。他们认为这可能是 C4 植物分布范围比较受限的原因之一。

---

## 常见误区

1. **"C4 植物不走卡尔文循环"**:C4 植物照样走卡尔文循环,只是放在维管束鞘细胞里进行;C4 途径只是加在前面的一道浓缩工序
2. **"C4 植物的光合作用在任何条件下都更强"**:只在温暖、强光、干旱时更强;凉爽、弱光时,多出的能耗让 C3 更划算
3. **"交叉温度是一个固定的数"**:叶片尺度约 30°C 和气候尺度约 22°C 是两个不同的口径,而且都会随 CO2 浓度变化
4. **"C4 植物都怕冷"**:多数怕冷,但巨芒等少数 C4 植物能适应较凉的气候
5. **"C4 省水是因为根系更发达"**:主要原因是 CO2 被浓缩后,气孔开得小一些也能维持光合

---

## 依据与延伸阅读

- Hatch M D, Slack C R, Photosynthesis by sugar-cane leaves: a new carboxylation reaction and the pathway of sugar formation, *Biochemical Journal* 101: 103–111, 1966
- Ehleringer J, Björkman O, Quantum yields for CO2 uptake in C3 and C4 plants, *Plant Physiology* 59: 86–90, 1977
- Ehleringer J R, Cerling T E, Helliker B R, C4 photosynthesis, atmospheric CO2, and climate, *Oecologia* 112: 285–299, 1997
- Collatz G J, Berry J A, Clark J S, Effects of climate and atmospheric CO2 partial pressure on the global distribution of C4 grasses: present, past, and future, *Oecologia* 114: 441–454, 1998
- Sage R F, Kubien D S, The temperature response of C3 and C4 photosynthesis, *Plant, Cell & Environment* 30: 1086–1106, 2007
- Sage R F, McKown A D, Is C4 photosynthesis less phenotypically plastic than C3 photosynthesis?, *Journal of Experimental Botany* 57: 303–317, 2006
- Sonawane B V 等, Shade compromises the photosynthetic efficiency of NADP-ME less than that of PEP-CK and NAD-ME C4 grasses, *Journal of Experimental Botany*, 2018:[PMC 全文](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5972597/)
- Sage R F, Monson R K (eds.), *C4 Plant Biology*, Academic Press, 1999

---

下一篇:`04-C4为什么没有淘汰C3.md`,把温度、光照、CO2 的历史、演化门槛和竞争放在一起,完整回答最初的问题。
