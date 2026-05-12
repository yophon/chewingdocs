# Unix 文本流哲学:为什么 50 年前的"字节流接口"赢了所有结构化对手

很多人写 `ls | grep foo` 写了十年,但讲不清这一根竖线背后的 Unix 在 1970s 做了一个**反直觉的选择**:**所有程序的接口都是字节流文本,不是结构化数据、不是 RPC、不是对象**。从工程效率角度看这是个糟糕决定——每个程序读到的都是「一堆字节」,要自己 parse 回字段,改一列下游全乱,文件名带空格炸开,处理 JSON 得动用 jq 这种专门工具。**这看起来怎么都不像"最优解"**。

但 50 年后的今天,你在 Mac 上敲一行 `git log --oneline | grep fix | wc -l`,git 这个 2005 年才出现的工具能无缝接到 grep / wc 这两个 1970s 的工具上,**中间没有任何 schema 协商、没有 RPC stub 生成、没有版本对齐会议**。而 PowerShell 2006 年带着「对象管道」上场,在工程界从来没赢过 — 即使在 Windows 自己的开发者生态里,大家也是装 WSL 跑 bash。

这一篇讲清楚:**Unix 为什么选了文本,这个选择的代价是什么,2026 年又被怎么修正**。

> **一句话先记住:文本管道不是技术上的最优解,是协议上的最低公约数 — 任何程序只要会读写字节,就能加入这个生态**。结构化管道更高效,但需要所有程序认同 schema;文本只需要所有程序认同「一行一条记录」。**赢的不是效率,是兼容性的几何级数**。

---

## 一、开篇冲突:1970s 的反直觉选择

### 1.1 那个年代本来可以选什么

Unix 1969 年开始写,1973 年管道 (`|`) 加进 shell。这个时间点 IBM 已经有了主机时代成熟的结构化文件 (VSAM)、关系模型 1970 年由 Codd 提出、SmallTalk 1972 年就有了对象模型 — **"结构化"在那个年代不是新概念**。Ken Thompson 和 Dennis Ritchie 完全可以选让程序输出结构化记录、对象引用、类型化的流。**他们没选**。他们选了:每个程序读一堆字节、写一堆字节,**约定一下"行"通常意味着一条记录**,然后撒手不管。

### 1.2 这个决定在当时就被嘲笑过

数据库圈、Lisp 圈、Multics 圈,1970s 都在嘲笑 Unix 的"原始"。Multics 派认为 Unix 是 "castrated Multics"(阉割版),所有的结构都被剥光了。Lisp 派觉得 s-expression 才是宇宙真理,文本是穷人的对象表示。**但 50 年过去**:

```
1973 年的 grep + sort + wc + cat,在 2026 年的 Mac 上,
和 2026 年才发布的 gh / kubectl / claude-cli 无缝拼接

你昨天写的脚本:
   gh pr list --json title | jq -r '.[].title' | grep -i fix | wc -l
   ───────────  ──────────────────  ─────────  ─────
   2018 年才有的  2014 年才有的       1973 年      1973 年

没有一行 schema 协商代码,没有一个版本对齐 PR
```

**这就是文本管道赢的本质**:它降低了"加入这个生态"的门槛到**只要会 printf**。任何语言、任何年代、任何 OS、任何作者写的程序,只要会读写字节,就能进入这个组合系统。**没有 schema,就没有 schema breakage**。

### 1.3 PowerShell 走了相反的路 — 但没赢

PowerShell 2006 年发布,理论上完胜 Unix:对象管道、类型安全、属性直接访问、不用 parse。但 20 年过去,**工程界从来没认它**——即使在微软自己的开发者生态,大家也是装 WSL 跑 bash。原因不是技术,是生态:**对象管道要求所有工具同意一份 schema,这个前提在异构生态(Mac + Linux + 各种语言写的 CLI)永远不成立**。

**协议的胜利来自最低公约数,不是最优解**。这是这一篇最核心的认知。第 8 节会再详细对比。

---

## 二、Unix 哲学的 4 条(不是 17 条)

Doug McIlroy 1978 年总结的 Unix 哲学有十几条,后来 Eric Raymond 在 *The Art of Unix Programming* 扩到 17 条。**大部分是凑数的**。真正影响日常工程的就 4 条:

### 2.1 第 1 条:一个程序只做一件事,并做好

```
grep    只做"按模式过滤行"
sort    只做"排序"
wc      只做"数行 / 字 / 字符"
uniq    只做"相邻重复行去重"(故意不全局去重 — 那是 sort -u 的事)
```

每个工具 200-500 行 C 代码就够了,**作者死了维护者还能接手**。

**反例**:`find` 集成了"遍历 + 过滤 + 执行 + 打印"四件事,所以 `find . -name '*.go' -exec gofmt -w {} \;` 看起来很神奇,但 `-exec` 这个语法成了一代人的迷惑点 — 它本来应该是 `find ... | xargs gofmt -w`。**find 是 Unix 哲学的反面教材,被允许活下来是因为太早了**。

### 2.2 第 2 条:输出可以是另一个程序的输入(管道)

```bash
# 查最近 30 天合并的 PR 里有多少是修 bug 的
gh pr list --state merged --limit 200 --json title,mergedAt \
  | jq -r '.[] | select(.mergedAt > "2026-04-12") | .title' \
  | grep -iE '(fix|bug)' | wc -l
```

gh 是 GitHub 2020 年的官方 CLI,jq 是 2012 年的工具,grep/wc 是 1973 年的。它们能拼在一起,**仅仅因为每一个都默认从 stdin 读、向 stdout 写**。

工程后果:**你写 CLI 工具时,如果只会读固定路径文件、写到固定输出位置,你就把自己排除在 Unix 生态外了**。这就是为什么所有体面的 CLI 都支持 `-` 表示 stdin、把结果打到 stdout 而不是某个固定文件。

### 2.3 第 3 条:文本流是通用接口

```bash
kubectl get pod -o json | jq -r '.items[].metadata.name'
docker ps --format '{{.Names}}\t{{.Status}}' | column -t
git log --pretty=format:'%h %s' | head -20
curl -s https://api.github.com/repos/cli/cli/releases/latest | jq -r '.tag_name'
```

**这些工具都活在 2010s 之后,但都默认输出文本** — 它们不是被迫的(Go / Rust 输出 ProtoBuf 也很容易),是作者懂事:输出文本意味着 grep / awk / jq 都能接,输出二进制就只有自家工具能读。

### 2.4 第 4 条:优先小工具 + 组合,不要写大而全的程序

最容易被违反的一条,**因为"写一个大工具"在简历上看起来更厉害**:

```
反例(每个团队都至少有一个):
   "我们写了个内部 CLI 叫 mytool,它能部署、看日志、看 metric、改配置、重启 pod、跑数据库迁移..."
   结果:改一个子命令重新发版整个 CLI、测试覆盖率上不去、
        新人不知道每个子命令是干嘛的、想加新功能要找原作者批
   
正面教材:
   gh / kubectl / aws-cli 把自己拆成 plugin / subcommand
   你想要新功能,自己写一个小工具,接到 stdin / stdout
```

**Unix 哲学的工程价值是「可维护性」,不是「性能」**——拆开,独立演进、独立测试、独立发布。

---

## 三、stdin / stdout / stderr 解剖

### 3.1 每个进程默认有 3 个文件描述符

Unix 进程刚启动时,内核默认给它打开 3 个文件描述符(file descriptor,简称 fd):

```
┌──────────────────────────────────────────┐
│              进程启动                     │
├──────────────────────────────────────────┤
│  fd 0  →  stdin   标准输入(默认接键盘)   │
│  fd 1  →  stdout  标准输出(默认接屏幕)   │
│  fd 2  →  stderr  标准错误(默认接屏幕)   │
├──────────────────────────────────────────┤
│  fd 3+ →  程序自己 open() 出来的          │
└──────────────────────────────────────────┘
```

**这三个数字 0 / 1 / 2 不是约定俗成,是内核硬编码在 `unistd.h` 里的**。你写 C 程序 `read(0, buf, 1024)` 就是从 stdin 读,`write(1, buf, n)` 就是写 stdout。Python 里 `sys.stdin / sys.stdout / sys.stderr` 是这三个 fd 的包装。

### 3.2 管道的画法

一条 `A | B` 在内核里发生了什么:

```
┌─────────────┐
│   进程 A    │  stdout (fd 1) ──┐
│  (例如 ls)  │                   │
│             │  stderr (fd 2) ──┼──→ 屏幕(终端)
└─────────────┘                   │
                                  ▼
                       ┌──────────────────┐
                       │  内核匿名管道     │
                       │  (默认 64 KB)    │
                       └──────────────────┘
                                  │
                                  ▼
┌─────────────┐
│   进程 B    │  ← stdin (fd 0)
│ (例如 grep) │
│             │  stdout (fd 1) ──→ 屏幕
└─────────────┘  stderr (fd 2) ──→ 屏幕
```

注意几个关键点:

1. **管道只接 stdout,不接 stderr** — A 报错信息默认不会进管道,会直接打到屏幕
2. **A 和 B 同时跑** — 不是 A 跑完 B 才开始(下面单独讲)
3. **管道有缓冲** — Linux 默认 64 KB,A 写满 B 没读就阻塞

### 3.3 为什么 `2>&1` 这种古怪语法存在

知道了 stdout 是 fd 1、stderr 是 fd 2,`2>&1` 就破解了:

```bash
# 字面意思:把 fd 2(stderr)重定向到 fd 1(stdout)指向的地方
cmd 2>&1

# 解读:
#   2>   重定向 fd 2
#   &1   到 fd 1(& 表示"这是个 fd,不是文件名'1'")
```

**没有 `&` 会怎样**?

```bash
cmd 2>1
# 这是把 stderr 重定向到一个叫"1"的文件
# 你的目录里会多一个叫 "1" 的文件
# 这是个超级常见的坑
```

`> /dev/null 2>&1` 这种经典写法的含义:

```
> /dev/null      把 stdout 丢到黑洞(/dev/null 是个特殊设备,读永远空、写永远扔)
2>&1             把 stderr 也指到 stdout 当前指向的地方(也就是 /dev/null)

合起来:程序所有输出都丢掉,只看退出码
```

**顺序重要**:`2>&1 > /dev/null` 和 `> /dev/null 2>&1` 结果不同!

```bash
# 写法 1:cmd > /dev/null 2>&1
#   先把 stdout 改到 /dev/null
#   再把 stderr 改到"stdout 现在指向的地方"(/dev/null)
#   结果:都没了

# 写法 2:cmd 2>&1 > /dev/null
#   先把 stderr 改到"stdout 现在指向的地方"(屏幕)
#   再把 stdout 改到 /dev/null
#   结果:stdout 没了,stderr 还在屏幕
```

这是 shell 一切 fd 操作的核心:**fd 重定向是从左到右一个个执行的,每次都是"指向当时的状态"**。

bash 4+ 提供了简写 `&>`:

```bash
cmd &> /dev/null     # 等价于 cmd > /dev/null 2>&1
cmd &>> /tmp/log     # 等价于 cmd >> /tmp/log 2>&1
```

zsh 也支持。`fish` 不支持,要写完整版。

---

## 四、重定向操作符大全(浓缩版)

### 4.1 一张表

| 操作符 | 作用 | 例子 |
| --- | --- | --- |
| `>` | stdout 覆盖写入文件 | `ls > files.txt` |
| `>>` | stdout 追加到文件 | `date >> log.txt` |
| `<` | 从文件读 stdin | `wc -l < /etc/passwd` |
| `2>` | stderr 重定向 | `cmd 2> err.log` |
| `2>>` | stderr 追加 | `cmd 2>> err.log` |
| `&>` | stdout + stderr 一起重定向(bash 4+ / zsh) | `cmd &> all.log` |
| `2>&1` | stderr 跟着 stdout 走 | `cmd > log 2>&1` |
| `<<EOF` | heredoc:多行字符串当 stdin | 见下 |
| `<<<` | here-string:单行字符串当 stdin | `tr a A <<< "abc"` |
| `<(cmd)` | 进程替换:把 cmd 输出当临时文件名传 | `diff <(ls dir1) <(ls dir2)` |
| `>(cmd)` | 进程替换:把"写入这里"喂给 cmd | `cmd > >(gzip > out.gz)` |
| `\|` | 管道:A 的 stdout 接 B 的 stdin | `ls \| grep foo` |
| `\|&` | 管道带 stderr(bash 4+) | `cmd \|& grep -i error` |

### 4.2 常用真实场景

**场景 1:把 build 输出同时打到屏幕 + log 文件**

```bash
./build.sh 2>&1 | tee build.log         # stdout + stderr 合并,屏幕 + 文件
./build.sh > >(tee build.log) 2> >(tee build.err >&2)  # 分别存,屏幕都看
```

**场景 2:把一段配置塞给程序当 stdin(heredoc)**

```bash
cat <<EOF > nginx.conf            # 变量会展开
server { listen 80; server_name $DOMAIN; }
EOF

cat <<'EOF' > script.sh           # 加引号 = 不展开
echo $HOME                         # 这里的 $HOME 是字面量
EOF
```

**场景 3:对比两个命令的输出(进程替换,不用临时文件)**

```bash
diff <(kubectl get pod -o yaml prod-app) <(kubectl get pod -o yaml staging-app)
vimdiff <(curl -s api1) <(curl -s api2)
```

**场景 4:字符串当 stdin(here-string)**

```bash
grep error <<< "$LOG_LINE"        # 比 echo "$LOG_LINE" | grep 少 fork 一个 echo
```

**fish 没有进程替换** — 这是 fish 用户的一个长期痛点,得用 `psub` 函数代替:`diff (cmd1 | psub) (cmd2 | psub)`。

---

## 五、管道的本质:并行 + 缓冲 + SIGPIPE

### 5.1 管道不是顺序执行

很多人以为 `A | B` 是"A 跑完,把输出存起来,B 再读" — **不是**。**A 和 B 同时启动、同时跑**,A 边产出 B 边消费。

```
T0:   shell 调 pipe() 创建匿名管道
      shell fork 出 A,把 A 的 fd 1 接到管道写端
      shell fork 出 B,把 B 的 fd 0 接到管道读端
      A、B 同时 exec

T1:   A 写第一批数据到管道(管道有缓冲)
T2:   B 从管道读第一批数据,开始处理
T3:   A 继续写,B 继续读 ── 并发执行

直到:A 关闭 fd 1(EOF)
      B 读到 EOF,自己结束
```

**实战意义**:

```bash
# 这条命令处理一个 100 GB 的日志文件
# 如果是"先存再读",得占 100 GB 内存
# 实际上 grep 边读边过滤,内存只占几 MB
cat huge.log | grep ERROR | head -100
```

对**大文件 / 流式数据**,管道是 streaming 处理。这是 Unix 性能的一个关键 — 用很小的内存处理任意大的数据。

### 5.2 缓冲区:64 KB 默认

Linux 管道默认缓冲 64 KB(可通过 `fcntl(F_SETPIPE_SZ)` 改,最大到 `/proc/sys/fs/pipe-max-size`)。

```
管道写满(64 KB)但没人读
   ↓
A 的 write() 阻塞,A 暂停
   ↓
B 读走一些,管道腾出空间
   ↓
A 的 write() 返回,A 继续
```

**这就是 streaming 的反压机制(backpressure)**:B 处理不过来,A 自动慢下来 — 不会无限堆数据爆内存。

### 5.3 SIGPIPE:`yes | head -10` 为什么不卡死

```bash
yes | head -10
# yes 是无限循环往 stdout 写 "y" 的程序,理论上永远不停
# 但 head 读 10 行后 exit(),内核关闭管道读端
# yes 再次 write() 时,内核给 yes 发 SIGPIPE,yes 默认终止
```

**SIGPIPE 是 Unix 管道的隐藏机制**:消费者死了,生产者自动死。这是 `yes | head` 不爆内存的原因。

**跨语言 CLI 工具的坑**:Python 默认把 SIGPIPE 设成 ignore,所以 write() 会抛 BrokenPipeError:

```bash
# 经典坑:
python3 -c "for i in range(10**9): print(i)" | head -10
# 最后会看到一个 BrokenPipeError 堆栈

# 修复:
python3 -c "
import signal; signal.signal(signal.SIGPIPE, signal.SIG_DFL)
for i in range(10**9): print(i)
" | head -10
```

Go、Rust 默认行为类似,**写跨语言 CLI 工具时记得处理 SIGPIPE**,否则跟 `head` 一起用会报错。

### 5.4 用 C / Python 看底层

```c
// 最简化的 C pipe (去掉错误处理):shell 的 A | B 背后就是这段
int fds[2];
pipe(fds);              // fds[0] 读端,fds[1] 写端

if (fork() == 0) {       // 子进程扮演 B
    close(fds[1]);
    dup2(fds[0], 0);     // 把读端复制到 fd 0 (stdin)
    execlp("grep", "grep", "foo", NULL);
}
close(fds[0]);           // 父进程扮演 A
dup2(fds[1], 1);         // 把写端复制到 fd 1 (stdout)
execlp("ls", "ls", NULL);
```

Python 版本就是 `os.pipe() / os.fork() / os.dup2() / os.execlp()` 直接 1:1 翻译。**所有 shell 的 `|` 背后都是这段代码**——管道不是 shell 的魔法,是内核 syscall。更深的内核内部(`copy_to_user` / 环形缓冲)osLearning 系列会讲,这里不深入。

---

## 六、经典管道模式 6 种

写脚本写久了你会发现,**95% 的管道都能归类到 6 种基本模式**。记住这 6 种,看到新需求第一反应是"这是哪种"。

### 6.1 filter — 过滤(输入 → 输出,数据变少)

```bash
grep ERROR app.log | head -20                       # 经典过滤
ps -ef | grep kubectl | grep -v grep                # 排除 grep 自身
gh pr list --json title --jq '.[] | select(.title | test("fix"))'
```

grep / awk filter / jq select 都是这一类。

### 6.2 map — 批量映射(每条输入产生一条/一组输出)

```bash
find . -name '*.go' | xargs gofmt -w                # 批量格式化
cat urls.txt | xargs -I{} -P10 curl -s {}            # 并发 10 路调 API
```

xargs 的两个常见坑:

```bash
# 坑 1:文件名带空格 → xargs 按空格切,会拆错
find . -name '*.txt' | xargs rm                      # 文件叫 "my file.txt" 就炸
find . -name '*.txt' -print0 | xargs -0 rm           # 用 NUL 分隔才安全

# 坑 2:输入为空,xargs 仍然跑一次(把 rm 当无参跑,删当前目录的 stdin!)
find . -name 'no-such' | xargs -r rm                 # 加 -r,GNU 才有
```

### 6.3 reduce — 聚合(多行合并成更少的行/一个数)

```bash
gh pr list --limit 200 | wc -l                                       # 数 PR
git log --pretty=format:'%an' | sort | uniq -c | sort -rn | head -10 # 按作者排行
find . -name '*.go' | xargs wc -l | tail -1                          # 总行数
```

**`sort | uniq -c | sort -rn` 是 Unix 工程师的"map-reduce"** — 这一行 ≈ SQL 的 `SELECT col, COUNT(*) FROM t GROUP BY col ORDER BY 2 DESC`。

### 6.4 fan-in — 多源合并(多个数据源汇到一个管道)

```bash
{ cat app1.log; cat app2.log; cat app3.log; } | sort -k1   # shell 子命令组
cat <(cmd1) <(cmd2) <(cmd3) | sort                         # 进程替换
```

`{ ...; }` 是 shell 的子命令组,内部所有命令的 stdout 合并送下游。

### 6.5 fan-out (tee) — 一个输入,多个消费者

```bash
./build.sh 2>&1 | tee build.log                                  # 屏幕 + 文件
./test.sh | tee >(grep FAIL > fails.log) >(grep PASS > passes.log)  # 分流
seq 1 10 | tee /dev/stderr | awk '{sum+=$1} END{print sum}'      # 调试看中间结果
```

### 6.6 pipeline + while read — 逐行处理

```bash
find . -name '*.go' | while read -r f; do
  gofmt -w "$f"
  golint "$f"
done
```

**一个常见坑**:`while read` 在管道里跑时,在子 shell 里 — 循环里改的变量出循环后没了:

```bash
count=0
seq 1 10 | while read x; do count=$((count + 1)); done
echo $count   # 0!子 shell 里改的

# 修:用 < <(cmd)
count=0
while read x; do count=$((count + 1)); done < <(seq 1 10)
echo $count   # 10
```

---

## 七、文本接口的两面性

### 7.1 优点(为什么文本赢了)

```
1. 兼容性是几何级数 — 任何会 printf 的程序都能进生态
   1973 年的 grep 接到 2026 年的 claude-cli,中间零代码
2. 调试无门槛 — 管道任何一段加 tee 就能看中间结果
3. 工具死了不会带走数据 — 文本永远能读;ProtoBuf 没 .proto 就废了
4. 跨网络、跨 OS、跨架构无成本 — 字节流不挑 endianness / platform / transport
```

### 7.2 缺点(代价)

```
1. 每次都要 parse — awk 干 90% 工作就是把行切回字段
   性能上比对象管道差 1-2 个数量级
2. 字段位置脆弱 — ls 输出第 3 列改一下,所有 awk '{print $3}' 全炸
3. 嵌套结构难处理 — JSON 多层嵌套要 jq;XML 更难
4. 引号 / 空格 / 换行是地雷 — 文件名带空格 → ls | xargs 炸
```

### 7.3 真实的坑:`ls | grep myfile` 为什么不该这么用

```bash
ls | grep myfile        # 看起来人畜无害,实际上:
# 1. 文件名带换行(rare but exists):一个文件被算成多行
# 2. ls 在管道里输出格式不一定干净(去掉颜色 / 列对齐)
# 3. 文件名以 - 开头,看起来像 flag
# 4. 文件名带特殊字符,传给下游就乱套
```

**正确写法**:

```bash
find . -maxdepth 1 -name '*myfile*' -print0 | xargs -0 some-cmd    # NUL 分隔
some-cmd ./*myfile*                                                # shell glob
```

这就是为什么 GNU 工具家族普遍提供 **NUL-separated 输出**:

| 工具 | 选项 | 含义 |
| --- | --- | --- |
| `find` | `-print0` | 路径之间用 `\0` 分隔 |
| `xargs` | `-0` | 接受 `\0` 分隔 |
| `grep` / `sort` / `cut` | `-z` | 输入和输出都用 `\0` 当行结束 |
| `git` | `-z` 通用 | 见 `git ls-files -z`、`git diff -z` |

**核心理念**:`\n` 在文件名里可能出现,`\0` 在文件名里**不可能出现**(POSIX 禁止)。用 `\0` 分隔,才是真正安全的"行"。这也是 `--porcelain` 思想要补的另一面 — 下面单独讲。

---

## 八、PowerShell 走的另一条路(对比一节)

### 8.1 PS 管道传的是对象,不用 parse

```powershell
# 等价于 Unix 的:ps -eo pid,pcpu,comm | awk '$2 > 10 {print $3, $2, $1}'
Get-Process | Where-Object { $_.CPU -gt 10 } | Select-Object Name, CPU, Id
```

`$_` 是当前对象,`.CPU` 直接是 double。**没有解析,没有歧义,类型安全**。理论上完胜 Unix:对象传递比文本 + parse 快 10-100 倍(微基准)、类型安全、嵌套天然、IDE 能补全属性名。

### 8.2 PS 为什么没赢

```
1. 所有 cmdlet 必须是 .NET 程序,遵守 PSObject 协议
   你写个 Python / Go / Rust 工具,要先包成 .NET 才能进管道
   
2. macOS / Linux 上的 PS 是外来户,生态体量 ≈ Unix 的 1%
   跨 OS / 跨工具时,文本仍然是回退选项

3. cmdlet 的属性 schema 不稳定
   微软更新 .NET / Windows,Get-Process 的属性会变
```

**结论**:受控环境(微软全家桶)PS 体验非常好,Azure 运维确实是 PS 的天下;**异构生态(Mac + Linux + 各种语言写的 CLI),文本仍然赢** — 因为最低公约数才是真公约数。

我个人的判断:**PowerShell 不是"输了",是"赢在了特定生态里"**。它没赢 Unix 不是技术问题,是协议问题——**你定的协议越严格,加入你生态的成本越高**。

---

## 九、现代修正:JSON / 结构化输出的回潮

### 9.1 文本管道的局限催生了 JSON CLI 一代

到了 2010s,Web API 全部 JSON 化,CLI 工具也跟上来:

```bash
kubectl get pod -o json | jq '.items[] | {name: .metadata.name, status: .status.phase}'
gh pr list --json number,title,state --jq '.[] | select(.state == "OPEN") | .title'
aws ec2 describe-instances --output json | jq '.Reservations[].Instances[] | .InstanceId'
docker ps --format '{{json .}}' | jq -s 'group_by(.Image) | map({image: .[0].Image, count: length})'
git log --pretty=format:'%H %s' --since='1 week ago' | wc -l
```

### 9.2 jq 一代工具

这一波结构化数据处理工具,**接到了"文本管道"和"结构化数据"两边**——输入是文本管道,输出也是文本管道,中间按"结构"操作:

| 工具 | 处理 | 类比 |
| --- | --- | --- |
| **jq** | JSON | sed/awk for JSON |
| **yq** | YAML | jq for YAML |
| **dasel** | 任意(JSON/YAML/TOML/XML/CSV) | 跨格式版 jq |
| **miller (mlr)** | CSV/TSV/JSON/lines | awk for tabular data |
| **xsv / qsv** | CSV | super fast csv tool |
| **htmlq** | HTML | jq for HTML |
| **gron** | "扁平化" JSON | 把 JSON 变成 grep 友好 |

```bash
# gron 的妙用 — 把 JSON 扁平化给 grep
curl -s api.github.com/repos/cli/cli | gron | grep -i 'stargazers_count'
# 输出:json.stargazers_count = 38291;
```

### 9.3 一个真实的混合管道

```bash
# 找最近一周哪个 service 接到的请求最多(结构化日志版)
kubectl logs -n prod deploy/api-gateway --since=168h \
  | jq -r 'select(.svc) | .svc' \
  | sort | uniq -c | sort -rn | head -10
```

jq 是 2012 年的工具,接到 sort / uniq / head(1973 年)上**完全无缝**。**这就是 Unix 哲学的现代版本**:文本管道作为底层协议不变,在中间允许结构化处理。第 13 篇会专讲结构化数据处理,这里只做铺垫。

---

## 十、--porcelain 思想:人友好 vs 机器友好

### 10.1 `git status` vs `git status --porcelain`

```bash
# 给人看的:有颜色、有空行、有"提示语"
$ git status
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
        modified:   README.md
        modified:   src/main.go

# 给脚本看的:一行一个文件、固定列、稳定格式
$ git status --porcelain
 M README.md
 M src/main.go
```

**porcelain 这个名字来自 git 内部**:plumbing(管道工)是底层,porcelain(瓷器)是给人用的上层。`--porcelain` 看似矛盾(瓷器给人看的?) — 实际意思是 **"稳定的、可被脚本依赖的输出格式,即使是上层 porcelain 命令也保证一份机器友好的版本"**。

### 10.2 现代 CLI 都分两套输出

| 工具 | 人友好 | 机器友好 |
| --- | --- | --- |
| `git` | `git status` | `git status --porcelain` |
| `kubectl` | `kubectl get pod` | `kubectl get pod -o json/yaml` |
| `gh` | `gh pr list` | `gh pr list --json ...` |
| `docker` | `docker ps` | `docker ps --format '{{json .}}'` |
| `terraform` | `terraform plan` | `terraform plan -json` |
| `cargo` | `cargo build` | `cargo build --message-format=json` |
| `rg` (ripgrep) | `rg foo` | `rg foo --json` |

**机器友好的格式**:不带颜色控制字符、不带"提示语"、字段稳定不随版本调整、用 NUL / JSON / TSV 这种好 parse 的格式。

### 10.3 反例:`ls` 没有官方 `--porcelain`

`ls -l` 输出的日期格式随 locale 变、文件名出现空格会乱、对齐用空格不可靠。GNU 的 `ls --quoting-style=shell-always` 算是个补丁但不完美。**正确做法是用 `find` 代替 ls 做脚本**:

```bash
find . -maxdepth 1 -mindepth 1 -print0                  # NUL 分隔,安全
find . -type f -size +1M -printf '%s\t%p\n'              # 自定义格式
fd --type f --max-depth 1 --print0                       # 现代替代
```

第 11 篇会专讲 `rg / fd / bat / eza` 这一代现代工具,**它们普遍默认就分人友好和机器友好两套**。

---

## 十一、什么时候这种哲学失效

文本管道不是"所有数据处理"的最优解,**只是"日常 shell 操作"的最优解**。以下场景,它会输给别的方案:

| 场景 | 文本管道的问题 | 该换什么 |
| --- | --- | --- |
| **大数据集**(> 几 GB) | awk 单线程,parse 成本爆炸 | DuckDB / Polars / Spark(列存 + 向量化) |
| **嵌套 / 多行字段** | jq 写到第 4 层没人看得懂;grep 把 stack trace 断开 | Python / 结构化日志(JSON line) |
| **跨语言对象传递** | 文本只能在 shell 进程间 | gRPC / Protobuf / Arrow |
| **流式 + 状态聚合** | awk 状态有限,管道无 retention | Kafka Streams / Flink / Materialize |
| **事务 / ACID** | 文本管道无状态 | 数据库 |

**临界点的快速判断**:文件超过几 GB,或要做 join、group by 这种重计算,**直接上 DuckDB**:

```bash
# DuckDB 当 CLI SQL 引擎用,也能查 CSV / Parquet / JSON
duckdb -c "SELECT user, COUNT(*) FROM 'events.parquet' GROUP BY user ORDER BY 2 DESC LIMIT 10"
```

13 篇会专讲结构化数据处理。**总结**:

```
适合文本管道:日常 shell 任务 / 一次性数据探索 / 多工具快速组合 / 跨年代跨作者协作
不适合:TB+ 数据(列存引擎)/ 嵌套结构(Python)/ 跨进程对象(RPC)/ 实时流(Flink)
```

**Unix 文本管道是"日常 shell 工程"的最优解,不是"所有数据处理"的最优解**。需求溢出"日常 shell"边界,要换工具。

---

## 十二、看完这一篇你应该能

```
1. 解释 Unix 为什么选文本作通用接口
   答:不是最优解,是最低公约数 — 兼容性是几何级数

2. 解释 PowerShell 为什么没赢
   答:对象管道要求所有工具同意一份 schema,异构生态不可能

3. 默写 stdin / stdout / stderr 三个 fd 编号(0/1/2)
   并解释 2>&1 / > /dev/null 2>&1 的工作机制

4. 识别 6 种经典管道模式:filter / map / reduce / fan-in / fan-out / while read
   并能在 30 秒内挑出当前任务属于哪种

5. 知道何时该用 --porcelain / -print0 / -0 / --json
   并能解释 ls | grep 在文件名带空格时为什么炸

6. 知道何时不该用文本管道
   TB+ 数据 → DuckDB
   嵌套结构 → Python / jq
   跨进程对象 → RPC
```

---

## 十三、立场声明

```
不是所有 Unix 哲学的话都对:
  ✗ "Everything is a file" 是有用的简化,但对 socket / device 经常是 leaky abstraction
  ✗ "Do one thing" 在工具体量小时成立,大型 CLI 必然演化成 subcommand 系统
  ✗ "Worse is better" 经常被滥用为"我懒得做对"的借口

但这一条是真理:
  ✓ "文本流是通用接口" — 50 年实证,没有更好的替代
```

**Nushell** 是个有意思的新尝试 — 它在 PS 思路上加了"文本兼容"(可以接 Unix 命令的文本输出转成表格),2026 年还在小众阶段。我看好它在某些 niche 场景(数据探索、ETL 脚本),但**它要彻底替代 bash,得让全世界所有 CLI 工具都支持它的 schema** — PS 没做成,Nushell 大概率也做不成。05 篇讲 shell 选型时会更具体讨论。

---

## 十四、下一篇预告

下一篇:**`04-进程作业与信号.md`**。讲管道里的进程怎么被 shell 管起来:

- **作业控制**:`fg / bg / jobs / Ctrl-Z` 怎么挂起和恢复进程
- **信号体系**:`SIGINT / SIGTERM / SIGKILL / SIGHUP / SIGPIPE` 各管什么
- **Ctrl-C 真正发生了什么**:从键盘到 tty driver 到进程组的完整路径
- **`nohup` / `disown` / `setsid`**:让进程脱离 shell 控制的三种姿态
- **僵尸进程 / 孤儿进程**:fork 后没 wait 会发生什么

这一篇讲完"数据怎么在进程间流动",下一篇讲"进程本身怎么被控制"。两篇加起来,你对一行 `cmd1 | cmd2 &` 背后的全部机制就建立完整心智。

---

**这一篇到此**。下次你写 `git log | grep fix | wc -l`,记住这一根竖线 1973 年加进 shell 时,Ken Thompson 没想到 50 年后会变成全世界工程师每天最熟悉的快捷键 — **不是因为它最高效,是因为它最低限**。能加入这个协议的门槛只有"会 printf",所以全世界的程序都能加入。**这就是协议设计的胜利,与技术最优无关**。
