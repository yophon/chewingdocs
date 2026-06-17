# 存储(下):NBT 与 Palette 位压缩

上一篇我们把 Region/Anvil 文件拆到了扇区级别:查位置表 → seek 到扇区 → 读出一段 `[长度][压缩类型][压缩数据]`。但解压之后那坨字节到底是什么?它怎么表达"这个 chunk 里第几格是什么方块、箱子里装了什么、待处理的水流 tick 有哪些"?

答案是两层:外层是 **NBT**(一种通用的二进制树格式,序列化几乎所有逐实例数据),内层最关键的是 **Palette 位压缩**(把 4096 个方块压到极小)。这一篇就专讲这两样,并解释为什么它们是 Minecraft "能省则省"的存储基石。

> 一句话先记住:**NBT 是 Minecraft 万物的序列化语言,Palette 位压缩是体素数据省空间的核心招数;而内存里的方块容器和磁盘上的结构几乎同构,所以加载几乎不用"翻译"。**

---

## 一、NBT:带类型、带名字、可嵌套的二进制树

NBT 全称 **Named Binary Tag**,是 Notch 早年设计的序列化格式。概念上它就是**二进制版的 JSON**:有对象、有数组、有强类型的标量,可以任意嵌套。但比 JSON 更紧凑、更快,因为它是二进制且自带类型标记。

### 每个 tag 的字节布局

一个具名 tag 在字节流里长这样:

```text
[ 1 字节:TagType ][ 2 字节:名字长度 ][ N 字节:名字(UTF-8) ][ payload ]
```

- 所有多字节整数都是**大端(big-endian)**。
- `payload` 的长度和结构由 `TagType` 决定。
- 例外:`List` 内部的元素**没有类型字节、也没有名字**——因为元素类型在 List 头部统一声明了一次,名字对数组元素也没意义。这是解析时最容易写错的地方。

### 完整类型表

| ID | 类型 | payload |
| --- | --- | --- |
| 0 | End | 无(标记一个 Compound 的结束)|
| 1 | Byte | 1 字节 |
| 2 | Short | 2 字节 |
| 3 | Int | 4 字节 |
| 4 | Long | 8 字节 |
| 5 | Float | 4 字节 IEEE754 |
| 6 | Double | 8 字节 IEEE754 |
| 7 | Byte_Array | 4 字节长度 + N 字节 |
| 8 | String | 2 字节长度 + UTF-8 |
| 9 | List | 1 字节元素类型 + 4 字节个数 + 元素们 |
| 10 | Compound | 一串具名 tag,直到遇到 End(0)|
| 11 | Int_Array | 4 字节长度 + N×4 字节 |
| 12 | Long_Array | 4 字节长度 + N×8 字节 |

两个"容器"类型最关键:

- **Compound(10)** ≈ 对象 / 字典:里面是一串具名 tag,**靠一个 End(0)标记收尾**(类似 C 字符串靠 `\0` 结尾)。
- **List(9)** ≈ 同类型数组:头部先写"元素类型 + 个数",后面紧跟纯 payload。

因为这两者能无限嵌套,NBT 天然适合表达 Minecraft 里那种层层套娃的数据:一个 chunk(Compound)里有 `sections`(List),每个 section 是 Compound,里面又有 `block_states`(Compound),里面又有 `palette`(List)和 `data`(Long_Array)……

### 为什么是 NBT 而不是 JSON/Protobuf

- **强类型 + 紧凑**:每个值带 1 字节类型,解析就是顺着字节流递归下降,不用像 JSON 那样边读边猜类型、处理空白和转义,体积也小得多。
- **自描述**:带名字,所以新版本加字段、老版本忽略未知字段都很自然,利于演进。
- **二进制原生数组**:`Byte_Array` / `Int_Array` / `Long_Array` 直接塞二进制块,正好用来装光照、高度图、调色板位数据这种大块定长数据——这点对体素世界尤其重要。

---

## 二、一个 chunk 的 NBT 长什么样(1.18+)

解压一个 chunk 的数据,得到的根节点是一个 Compound。现代版本(1.18 之后,世界高度扩展、生物群系下沉到 chunk)里大致有这些字段:

```text
(根 Compound)
├── DataVersion        : Int    世界数据版本号(跨版本迁移用)
├── xPos / zPos / yPos : Int    chunk 坐标 + 最低 section 的 y
├── Status             : String 生成阶段(empty→…→full)
├── sections           : List   每个元素是一个 16³ section
│     ├── Y            : Byte   该 section 的纵向序号
│     ├── block_states : Compound { palette: List, data: Long_Array }
│     ├── biomes       : Compound { palette: List, data: Long_Array }(4×4×4 粒度)
│     ├── BlockLight   : Byte_Array  每方块 4 bit 的方块光
│     └── SkyLight     : Byte_Array  每方块 4 bit 的天空光
├── block_entities     : List   箱子物品、告示牌文字、熔炉进度…
├── Heightmaps         : Compound 几张高度图,每张是 Long_Array(每列 9 bit)
├── block_ticks        : List   还没结算的方块 scheduled tick
├── fluid_ticks        : List   还没结算的流体 tick(和方块 tick 分开)
├── InhabitedTime      : Long   玩家在此 chunk 累计停留时间(影响刷怪/难度)
└── PostProcessing / structures / …
```

几个值得注意的点:

- **`Status` 是分阶段生成的产物**:地形生成是一条流水线(`empty` → `structure_starts` → … → `full`),跨 chunk 的结构(村庄、洞穴)要求邻居先到某阶段,所以每个 chunk 都记着自己生成到哪一步了。
- **`block_ticks` / `fluid_ticks` 是分开的两条队列**:对应 Tick 系统里方块和流体各自独立的调度。chunk 卸载时,没结算完的延迟任务必须一起持久化,否则水流会"凝固"在半路。
- **实体不在这里**:1.17 起,实体被搬到**独立的 `entities/` region 文件**(POI 兴趣点也单独存 `poi/`)。把实体和方块分文件,可以在不加载满功能 chunk 的情况下处理它们。
- **`Heightmaps` 用 Long_Array 打包**:每个 xz 列存一个高度值,**每列 9 bit**(因为世界高度可达数百格,8 bit 不够),整张图用打包进 long 数组的方式存——这和下面讲的方块调色板是同一套位打包思路。

---

## 三、Palette 位压缩:体素数据省空间的核心

现在到这一篇真正的重点。一个 section 有 16×16×16 = **4096** 个方块。如果每格都老老实实存一个"全局方块状态 ID"(全游戏两万多个 BlockState,需要约 15 bit),那一个 section 就要 4096×15 ≈ 7.5 KB,几十亿个方块直接把硬盘和内存撑爆。

但现实是:**一个 section 里通常只有寥寥几种方块**——一片石头、一层泥土、上面全是空气。于是采用**局部调色板(Palette)+ 紧凑位数组**:

```text
palette : ["minecraft:air", "minecraft:stone", "minecraft:dirt", "minecraft:coal_ore"]
data    : Long_Array,存 4096 个"在 palette 里的下标"
```

- **palette** 只列出本 section 实际出现过的方块状态,上例只有 4 种。
- **data** 的每个格子不存完整 ID,只存"它是 palette 里的第几个"。4 种只需 **2 bit**,而不是 15 bit。

### bitsPerEntry 规则

每格用多少位,由调色板大小决定:

```text
bitsPerEntry = max(4, ceil(log2(palette.length)))
```

- 调色板 ≤ 16 种 → 仍按 **4 bit/格**(有个下限 4:再小也不省多少,反而增加碎片处理复杂度)。
- 17–32 种 → 5 bit;33–64 种 → 6 bit;以此类推,位宽随种类自动增大。
- 当 bitsPerEntry 涨过某个阈值(约 **9 bit**)→ 干脆**放弃局部调色板,直接存全局方块状态 ID**(global palette)。因为种类太多时,维护一张局部调色板本身也不划算了。
- **极端退化**:如果整个 section 只有 **1 种**方块(比如全空气、全石头),调色板里就一项,下标永远是 0 ——这时 **`data` 数组可以整个省略**。大片均质地形就靠这一条被压到几乎为零。

这就是为什么"地下一大片石头"和"天上一大片空气"几乎不占存储:它们各自退化成"调色板单值 + 无 data"。

### 反直觉点:压缩率取决于"多样性"而非"方块数"

一个塞满了各种装饰方块、五颜六色的建筑 section,调色板可能有几十上百项,bitsPerEntry 涨到 7、8 位,占用反而比"全是石头"的实心山体大得多。**Minecraft 的存储成本由局部方块种类的多样性决定,不是由"挖没挖空"决定。** 这也解释了为什么高度装饰化的存档体积会显著膨胀。

---

## 四、bit-packing 的版本分水岭

下标怎么塞进 `Long_Array`(每个 long 64 bit)?这里有一个重要的版本差异,踩坑率极高:

### 1.16 之前:跨界打包(packed)

bit 紧密首尾相接排列,**一个下标可以横跨两个 long 的边界**。比如 5 bit/格,第 12 个下标占的是前一个 long 的最后几位 + 后一个 long 的开头几位。最省空间,但解析时要处理"跨 long 拼接",位运算更绕。

### 1.16 及之后:每个 long 内不跨界(padded)

改成**一个下标绝不跨越 long 边界**。一个 64 位 long 里塞 `floor(64 / bitsPerEntry)` 个下标,**余下的位直接留空浪费**。

```text
例:bitsPerEntry = 5
  每个 long 放 floor(64 / 5) = 12 个下标(12 × 5 = 60 bit)
  剩下 64 - 60 = 4 bit 永远空着,浪费掉
```

牺牲一点空间(那几个浪费的 bit),换来**解码时不用跨 long 拼接、按位移和掩码就能直接取**,更快也更简单。这是典型的"用空间换时间 + 换实现简洁"。

### 读第 i 个方块(1.16+ 伪代码)

```text
perLong    = 64 / bitsPerEntry           // 每个 long 装几个下标(向下取整)
longIndex  = i / perLong                  // 在第几个 long
offset     = (i % perLong) * bitsPerEntry // 在该 long 内的起始位
mask       = (1 << bitsPerEntry) - 1
paletteIdx = (data[longIndex] >> offset) & mask
blockState = palette[paletteIdx]
```

如果是 1.16 之前的存档,`longIndex`/`offset` 的计算要按"全局连续 bit 流"来算,并处理跨界——这正是写 `.mca` 解析器时最容易出 bug 的分支。判断走哪条路径,要看 chunk 的 **DataVersion**(下一节)。

---

## 五、DataVersion 与跨版本世界升级

每个 chunk(以及 `level.dat`)都带一个 **`DataVersion`**——一个随版本单调递增的整数,记录"这块数据是哪个版本写的"。

加载时,如果 `DataVersion` 低于当前游戏版本,Minecraft 会用 **DataFixerUpper**(简称 DFU)这套机制,把旧结构**逐步迁移**到新结构:

- 字段改名、嵌套结构调整、方块/物品的 ID 重命名(比如老的数字 ID → 命名空间 ID)、上面讲的 bit-packing 从跨界改成不跨界……都由一连串"data fixer"按版本号顺序套用。
- 这就是为什么**很老的存档还能在新版本里打开**:不是靠手工兼容,而是有一条声明式的升级链。
- 代价是 DFU 很重、很吃内存,大版本跨度升级一个大世界会明显卡——因为它要把每个 chunk 的 NBT 树整棵走一遍做变换。

> 把 `DataVersion` 理解成"数据的 schema 版本号",DFU 就是"自动迁移脚本集合"。它是 Minecraft 能长期向后兼容的关键基础设施。

---

## 六、内存与磁盘同构:为什么加载这么快

最后一个关键设计:**运行时内存里的方块容器,和磁盘上的结构几乎是同一个东西。**

内存里每个 section 用一个 **`PalettedContainer`** 持有方块,它内部就是"调色板 + 紧凑位数组",和我们前面讲的 `block_states = { palette, data }` 一模一样。于是:

- **加载**:NBT 解析出 `palette` + `data` → 几乎可以直接搬进 `PalettedContainer`,不需要把每个方块解包成独立对象再重建。
- **存盘**:`PalettedContainer` 几乎原样序列化回 `palette` + `data`。
- 运行中方块变化时,`PalettedContainer` 就地更新:调色板按需增删,bitsPerEntry 自动伸缩(种类变多就扩位重排,变少可压缩)。

这种"内存结构 = 磁盘结构"的同构设计,省掉了序列化/反序列化里最贵的"对象图重建",是 Minecraft 能在"无限世界 + 20 TPS"下又快又省的根本原因之一。

---

## 七、串联

把这一篇放回整条存储链路:

- **承接上篇(Region/Anvil)**:上一篇负责"在 `.mca` 文件里按扇区找到一段压缩字节、解压";这一篇负责解释解压后那棵 **NBT 树**怎么读,以及其中最关键的 **block_states** 怎么用 palette 位压缩表达 4096 个方块。两篇合起来,就是"一个 chunk 从磁盘字节到方块数组"的完整往返。
- **呼应渲染篇**:渲染时内存里的 `PalettedContainer` 和这里磁盘上的 palette 结构同构——存储的省空间技巧和渲染的"只画可见面",是同一份数据在两端各自的优化,互为对偶。
- **呼应生成篇**:`Status` 字段对应分阶段地形生成;`DataVersion` 则贯穿整个世界的版本演进。

一句话收束:**NBT 负责"怎么把任意逐实例数据落成字节",Palette 位压缩负责"把海量方块压到最小",DataVersion+DFU 负责"让这些字节跨版本还能读"。** 三者合起来,才撑得住一个可以无限生长、还能十年向后兼容的体素世界。
