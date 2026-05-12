# Shell 脚本工程化:6 件让 shell 脚本不再"半坏"的工程动作

工程师对 shell 脚本最大的误解,是把它当成「**一次性 commit message**」——随手写、跑通就好、不写测试、不跑 lint、出错跟 git stash 一起被遗忘。**你打开自己 `~/scripts/` 或团队 `ops/` 的目录看一眼**,挑一个 50 行以上的 `.sh` 出来:**九成九满足下面任意一条**:文件头没 `set -euo pipefail`、`rm -rf "$dir/foo"` 里 `$dir` 没引号、`for f in $(ls)` 撞到带空格文件名就炸、临时文件靠"程序员记得删"而不是 `trap` 清理、依赖 `which python` 这种废弃的检测、`echo -e` 在 macOS 和 Linux 上行为不一样。**这些不是"代码风格",是隐藏 bug**——本地跑得好好的,直到某天进 CI / 装到客户机器 / 命中某个边界条件,凌晨炸了。**这种"半坏"状态在 Python / Go 项目里几乎不存在**(类型系统 + 测试框架挡住了),**但在 shell 里是默认状态**——shell 语法允许写出语义混乱的代码,默认配置允许命令失败之后继续往下跑,默认行为允许未定义变量当空字符串用。**你写 shell 脚本不主动加防御,就是给生产挖坑**。

> 一句话先记住:**shell 脚本超过 100 行就是错的选择——不是 shell 不行,是它的错误处理和测试基础设施抵不上 Python 5 分钟搭起来。100 行是边界**。100 行以下,把它工程化(`set -euo pipefail` + shellcheck + shfmt + bats + trap + 友好错误信息),它能跟你的代码一样进 CI、被 review、被 maintain;100 行以上,**转 Python**(`subprocess` + `click` + `uv` 5 分钟起步),不要在 shell 里写 200 行参数解析、200 行 JSON 处理、关联数组嵌套——shell 在这种场景被设计上就不够。

这一篇拆 6 个工程化动作,**每一条配真实事故场景**:

```
1. set -euo pipefail + IFS(默认 shell 不安全,这三行是入场券)
2. shellcheck(静态分析,80% 的坑这一关就拦住)
3. shfmt(格式化,团队脚本风格统一)
4. trap 清理(脚本死也要善后)
5. bats 单元测试(shell 脚本也能有 test)
6. 何时该放弃 shell 写 Python(知道边界,才知道哪头是 shell 主场)
```

读完你能拿走一份 30 行工程化模板,以后所有 shell 脚本从这份模板派生——**比从空白文件开始,质量直接跳两档**。

---

## 一、为什么默认 shell 是不安全的

### 1.1 一段看起来没问题的脚本

```bash
#!/bin/bash
# deploy.sh - 简单部署脚本

cd /app
git pull
npm install
npm run build
rm -rf dist/*
cp -r build/* dist/
systemctl restart myapp
echo "Deploy done"
```

**这 8 行里,至少有 6 个潜在 bug**:

```
1. cd /app 失败(目录不存在 / 权限不够)→ 不报错,后续命令在错的目录跑
2. git pull 失败(网断 / 冲突)→ 不报错,部署的是上次的旧代码
3. npm install 失败 → 不报错,用残缺依赖构建
4. npm run build 失败 → rm -rf dist/* 还是执行,旧 dist 没了
5. rm -rf dist/* —— 假如 dist 变量为空展开,等价 rm -rf /*
6. systemctl restart 失败(权限 / unit 不存在)→ "Deploy done" 照样打,
   你以为成功了
```

**默认 bash 的语义**:**每一行命令失败,默认下一行继续跑**。这种行为在 C 里叫 undefined behavior,在 bash 里被规范成"feature"。**用 1979 年 Bourne shell 的默认行为写 2026 年的 CI 脚本,事故是早晚的**。

### 1.2 一个真实事故:Steam 删了用户的 home

```bash
# Steam Linux 客户端 2015 年的代码(简化)
rm -rf "$STEAMROOT/"*
```

**当 `STEAMROOT` 因为某种原因为空时**:

```bash
rm -rf "/"*
# = rm -rf / 把所有 root 下的目录都删了
```

**用户的 home 被 Steam 客户端一行 shell 删了**——这个 bug 上了 Hacker News 头条,Valve 出来道歉,改成检查变量非空才删。**这就是不加 `set -u` 的代价**:本地测试时 `$STEAMROOT` 总是有值,放出去到用户手里某种环境变量没设,直接灾难。

### 1.3 三件套修复

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
```

**加这 3 行,上面 deploy.sh 的所有 bug 都变成"明确失败 + 退出码非 0"**——CI 立刻标红,人立刻知道出问题。**这 3 行是 shell 脚本工程化的入场券**,后面所有讨论都基于"你已经加了这 3 行"。

---

## 二、set 三件套 + IFS:挨个拆解

### 2.1 `set -e`(errexit):命令失败立刻退出

```bash
set -e
false              # 退出码非 0
echo "after"       # 不会执行,脚本已退出
```

**真实事故场景**:

```bash
# 没 set -e
make build       # 失败,退出码 2
make deploy      # 仍然跑——你部署的是上次成功的二进制
make verify      # 仍然跑——verify "成功" 但是验的是旧版本
echo "OK"        # 你以为发布成功了
```

加了 `set -e`,`make build` 失败就退出,`deploy` 不会拿旧二进制继续。

### 2.2 `set -e` 的四个陷阱(必须知道,否则你以为它生效但其实没有)

```bash
set -e

# 陷阱 1:if/while 条件里的失败不算
if false; then echo "yes"; fi
echo "still here"        # 仍然执行——if 的条件失败不触发 set -e

# 陷阱 2:|| 接住的失败不算
false || echo "ok"
echo "still here"        # 仍然执行,这是 set -e 的"显式吞错"出口

# 陷阱 3:! 反转,不算失败
! false
echo "still here"        # 仍然执行

# 陷阱 4:管道非最后段失败默认不算(需要 pipefail)
false | echo "hi"
echo "still here"        # 仍然执行——这就是为什么必须配 pipefail
```

**最大的坑是第 4 个**——所以你下面必须加 `pipefail`。

### 2.3 一段 `set -e` 反而掩盖 bug 的真实案例

```bash
set -e
count=$(grep -c "error" /var/log/app.log)
echo "errors: $count"
```

**问题**:**grep 找不到"error"时退出码是 1**,`$count` 没赋值,`set -e` 看到 `grep` 失败立刻退出——**你以为是"日志清晰、零错误",但脚本根本没跑完**。

**修复**:

```bash
set -e
count=$(grep -c "error" /var/log/app.log || true)
echo "errors: $count"
```

或者用 `|| echo 0` 让 grep 失败时 count=0。**这就是 `set -e` 的反直觉之处**:它太严格,有些命令"成功失败都正常",你要显式接住。

### 2.4 `set -u`(nounset):未定义变量报错

```bash
set -u
echo "Hello, $NAME"   # NAME 未定义 → 立刻报错退出

# 没有 set -u 时:输出 "Hello, "(以为没事,实际 NAME 没传进来)
```

**真实事故**:`find /data -mtime +$DAYS -delete`,**当 `DAYS` 未定义** → `find /data -mtime + -delete` → 删全部。**加 `set -u`,这种事故根本不会发生**(它会立刻报错,不会执行那条命令)。

给变量加默认值的正确姿势(在 `set -u` 下):

```bash
echo "${DEBUG:-false}"             # 不存在时用 "false"
[[ -n "${DEBUG:-}" ]] && echo debug # 安全判空
```

**重点**:`${VAR}` 在 `set -u` 下未定义直接报错;`${VAR:-}` 不报错,展开成空串。

### 2.5 `set -o pipefail`:管道任一段失败 → 整体失败

```bash
set -eo pipefail
false | echo "ok"        # 退出,因为 false 失败
echo "after"             # 不执行

# 没 pipefail:false 失败被掩盖,echo "after" 照跑
```

**典型场景**:

```bash
# 没 pipefail
curl -s https://api.example.com/health | grep -q "ok"
# curl 网络挂了你不知道,只看到 grep "没匹配"——但其实是 curl 没回任何东西
```

**有 pipefail**:`curl` 失败,整条管道失败,`set -e` 退出。**你立刻知道是网络问题,不是 health 真的不 ok**。

### 2.6 `IFS=$'\n\t'`:防 word splitting 用空格切

```bash
# 默认 IFS = "<space><tab><newline>"
files="my file.txt other.txt"
for f in $files; do echo "[$f]"; done
# 输出 3 项:[my] / [file.txt] / [other.txt](my file.txt 被空格切了)

# IFS=$'\n\t' 只在换行 / Tab 处切
files=$'my file.txt\nother.txt'
for f in $files; do echo "[$f]"; done
# 输出 2 项:[my file.txt] / [other.txt]
```

**注意**:**真正的银弹是"变量永远加双引号"**(下面 §三),`IFS` 是第二道防线——万一你忘了加引号,空格不会把字段切碎。

### 2.7 完整的入场券长这样

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# 后面写你的逻辑
```

**这 3 行是 shell 脚本工程化的"hello world"**。任何超过 10 行的脚本不写这 3 行,review 应该被打回。

---

## 三、引号原则:`$var` 错,`"$var"` 对

### 3.1 为什么必须加引号

```bash
file="my report.txt"
ls $file       # 实际跑:ls my report.txt → 找 2 个文件 → 失败
ls "$file"     # 实际跑:ls "my report.txt" → 找 1 个 → 成功
```

bash 在变量展开后默认做 **word splitting + globbing** —— `$file` 展开成 `my report.txt`,被空格切成 2 个 word。**加双引号关掉这两步**。

### 3.2 灾难级反例

```bash
dir=$1
rm -rf $dir/*                # ← 没引号

# 调用:./clean.sh "/home/user/old data"
# 实际跑:rm -rf /home/user/old data/*
#       = rm -rf /home/user/old + rm -rf data/*
# 用户哭了

# 修正:
rm -rf "$dir"/*              # ← 加引号,* 放引号外让 shell 展开 glob
```

### 3.3 数组用 `"${arr[@]}"`,不用 `${arr[*]}`

```bash
files=("a.txt" "b file.txt" "c.txt")

for f in ${files[@]}; do ...     # ← 错,b file.txt 被切碎
for f in "${files[*]}"; do ...   # ← 错,全部拼成一个字符串
for f in "${files[@]}"; do ...   # ← 对,每个元素独立 quote
```

**记忆点**:**数组永远 `"${arr[@]}"`(双引号 + @)**。

### 3.4 heredoc 的两种引号

```bash
name="alice"

cat <<EOF              # 不加引号:变量展开
Hello, $name           # 输出 "Hello, alice"
EOF

cat <<'EOF'            # 加单引号:原样不展开
Hello, $name           # 输出 "Hello, $name"
EOF
```

**规则**:**嵌入 awk / Python / SQL 用 `<<'EOF'`**——里面的 `$` 不会被 bash 抢去解释。

---

## 四、shellcheck:每个脚本必跑(80% 的坑这一步拦住)

### 4.1 这是什么

**shell 脚本的静态分析器**(Haskell 写)——给它一个 `.sh`,它告诉你 80% 的常见坑。**这是 shell 工程化里 ROI 最高的工具**,装一次受用一辈子。

```bash
brew install shellcheck         # macOS
apt install shellcheck          # Ubuntu
docker run --rm -v "$PWD":/mnt koalaman/shellcheck:stable bad.sh
```

### 4.2 一段实战

```bash
#!/bin/bash
# bad.sh
DIR=$1
for f in `ls $DIR`; do
  cp $f /tmp/backup/
  if [ $? == 0 ]; then echo "copied $f"; fi
done
```

跑 `shellcheck bad.sh` → 7 个 warning:

```
SC2034: DIR appears unused                              (没用)
SC2006: Use $(...) notation instead of backtick         (用 $() 替代反引号)
SC2086: Double quote to prevent globbing and word split (变量没加引号,3 处)
SC2045: Iterating over ls output is fragile             (别 iterate ls)
SC2181: Check exit code directly with if cmd; instead   (直接 if cmd,不用 $?)
SC2278: '==' is not POSIX; use '='                      (POSIX 用 = 不是 ==)
```

修正:

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

dir=$1
for f in "$dir"/*; do
  if cp "$f" /tmp/backup/; then
    echo "copied $f"
  fi
done
```

**再跑 → 0 warning**。**8 行代码、5 分钟改完,从"半坏"变成"工程级"**。

### 4.3 常见 warning 速查

```
SC2086: 没引用变量 ── $var 改 "$var"
SC2046: 命令替换没引用 ── $(cmd) 改 "$(cmd)"
SC2034: 变量定义但没用 ── 删或改名加 _ 前缀
SC2155: 同行 export 和赋值掩盖返回码 ── 拆两行
SC2068: 数组用 $@ 改 "$@"
SC2154: 变量没赋值就用(像 set -u 但是 lint 期)
SC2164: cd 后没 || exit
SC2236: -n 反义用 -z 而不是 ! -n
```

**记住前 3 个就解决 80% 报错**,其它的看具体提示。

### 4.4 在脚本里禁用某行规则

```bash
# shellcheck disable=SC2086  # 有意的 glob expansion
echo $glob_pattern
```

**禁用要写理由**——给后来人留线索,不是单纯"屏蔽报警"。

### 4.5 配置 + CI

`.shellcheckrc`(项目根):

```ini
disable=SC2086,SC2155
external-sources=true
shell=bash
```

GitHub Actions:

```yaml
- uses: ludeeus/action-shellcheck@master
  with:
    severity: warning
```

**VS Code 装 `timonwong.shellcheck` 扩展,Neovim 用 `bashls`**——实时反馈比 CI 强 10 倍,squiggly line 写的时候就提醒。

### 4.6 pre-commit hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/shellcheck-py/shellcheck-py
    rev: v0.10.0.1
    hooks:
      - id: shellcheck
```

**commit 之前自动跑**,半坏脚本根本进不了 repo。

---

## 五、shfmt:格式化(团队风格统一)

### 5.1 这是什么

**shell 脚本的 gofmt**——一个命令格式化整个仓库,统一团队风格。

```bash
brew install shfmt              # macOS
go install mvdan.cc/sh/v3/cmd/shfmt@latest
```

### 5.2 基础用法

```bash
shfmt script.sh                 # 输出格式化后的(不改)
shfmt -d script.sh              # 显示 diff
shfmt -w script.sh              # 写回文件
shfmt -i 2 -bn -w *.sh          # 整个目录,2 空格缩进,binary op 换行
```

### 5.3 常用 flag

```
-i 2     # 缩进 2 空格(0 表示用 tab)
-bn      # binary op 换行(&&、|| 放行尾)
-ci      # case 内缩进
-sr      # 函数 / if 后空格规整
-s       # 简化模式(去多余的引号 / 分号)
```

**团队建议**:`.editorconfig` 里把 shell 缩进定下来,`shfmt -i N` 跟上。

### 5.4 CI / pre-commit

```yaml
# .pre-commit-config.yaml
- repo: https://github.com/scop/pre-commit-shfmt
  rev: v3.10.0-1
  hooks:
    - id: shfmt
      args: ["-i", "2", "-bn", "-w"]
```

**commit 之前自动格式化**,不再有人为缩进吵架。

---

## 六、trap:脚本死也要善后

### 6.1 临时文件不清理 = 半残环境

```bash
#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d)
cd "$TMPDIR"

curl -sSL https://example.com/install.tar.gz | tar xz
./install.sh        # 假如这里失败 → 脚本退出 → /tmp/tmp.xxxxx 留下来

# 你装东西失败了 100 次,/tmp 留下 100 个垃圾目录
```

**修复:`trap` 在退出时跑清理**:

```bash
#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

cd "$TMPDIR"
# ... 用 $TMPDIR ...
# 脚本退出(正常 / 异常 / Ctrl-C)都会清理
```

`EXIT` 是个"伪信号",任何退出路径都触发——这是 shell 给你的"finally 块"。

### 6.2 多信号 + 错误处理

```bash
#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  local exit_code=$?
  echo "Cleaning up... (exit=$exit_code)"
  rm -rf "${TMPDIR:-}"
}

trap cleanup EXIT INT TERM
# EXIT:任何退出
# INT:Ctrl-C
# TERM:kill 发的 SIGTERM
```

**注意**:`EXIT` 已经覆盖 `INT` 和 `TERM`(因为它们也会触发 exit),**重复绑定不会出错,但语义清楚一点更好**。

### 6.3 真实场景:install.sh 失败留半残

```bash
# Anthropic Claude Code 装机脚本(简化)
trap 'cleanup_failure' ERR EXIT

TMPDIR=$(mktemp -d)
DEST="$HOME/.claude"

cleanup_failure() {
  if [ $? -ne 0 ]; then
    echo "Install failed, rolling back..."
    rm -rf "$TMPDIR"
    [ -d "$DEST.partial" ] && rm -rf "$DEST.partial"
    # 不删 $DEST,因为用户的老配置可能还在那
  fi
}

download_release "$TMPDIR/release.tar.gz"
extract "$TMPDIR/release.tar.gz" "$DEST.partial"
mv "$DEST.partial" "$DEST"           # 原子切换
```

**关键设计**:**新版本先装到 `.partial`,最后一步 mv**——失败时旧版本完整保留,trap 清理 `.partial`,用户绝不会"装到一半"。

### 6.4 ERR trap:错误时报上下文

```bash
#!/usr/bin/env bash
set -euo pipefail

err_handler() {
  echo "ERROR at line $LINENO: command '$BASH_COMMAND' failed (exit $?)" >&2
}
trap err_handler ERR

cd /nonexistent
# 输出:ERROR at line 8: command 'cd /nonexistent' failed (exit 1)
```

**比 `set -e` 默认的"无声退出"友好 100 倍**——CI 里看到这行,直接定位失败行号 + 命令。

---

## 七、bats:shell 脚本也能写单元测试

### 7.1 这是什么

**bats(Bash Automated Testing System)** ——用 bash 写的、给 bash 用的测试框架。

```bash
brew install bats-core          # macOS
npm install -g bats             # 跨平台
```

### 7.2 一段最小例子

`test/mkcd.bats`:

```bash
#!/usr/bin/env bats

# 这个 setup 在每个 @test 跑之前都跑一次
setup() {
  load '../scripts/lib.sh'      # source 你要测的脚本
  TMPDIR=$(mktemp -d)
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "mkcd creates and cd into directory" {
  mkcd "$TMPDIR/sub/deep"
  [ "$PWD" = "$TMPDIR/sub/deep" ]
}

@test "mkcd fails on existing file" {
  touch "$TMPDIR/existing"
  run mkcd "$TMPDIR/existing"
  [ "$status" -ne 0 ]
  [[ "$output" == *"not a directory"* ]]
}

@test "addition works" {
  result=$((2 + 2))
  [ "$result" -eq 4 ]
}
```

跑:

```bash
$ bats test/mkcd.bats
mkcd.bats
 ✓ mkcd creates and cd into directory
 ✓ mkcd fails on existing file
 ✓ addition works

3 tests, 0 failures
```

### 7.3 真实例子:测自己的 install.sh

```bash
# test/install.bats
@test "install on Ubuntu: detects apt" {
  PATH="$BATS_TEST_DIRNAME/fixtures/ubuntu-bin:$PATH"
  run bash ../install.sh --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"package manager: apt"* ]]
}

@test "install on Alpine: detects apk" {
  PATH="$BATS_TEST_DIRNAME/fixtures/alpine-bin:$PATH"
  run bash ../install.sh --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"package manager: apk"* ]]
}

@test "install on macOS: detects brew" {
  PATH="$BATS_TEST_DIRNAME/fixtures/mac-bin:$PATH"
  OSTYPE=darwin25 run bash ../install.sh --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"package manager: brew"* ]]
}
```

**fixtures 目录里放假的可执行文件**(空 stub 也行),通过控制 `PATH` 模拟不同 OS。**install.sh 的所有"if mac elif linux"分支都能测**——这一点 shell 脚本不写测试根本做不到。

### 7.4 bats 在 CI

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bats-core/bats-action@2.0.0
      - run: bats test/
```

**你的 install.sh 和 lib.sh 跟代码一样有 CI 覆盖**——这是 shell 工程化的最后一公里。

### 7.5 哪些脚本值得写 bats

```
值得写:
   ─ install.sh / setup.sh(跨 OS 行为复杂,容易踩雷)
   ─ 工具函数库(scripts/lib.sh,被多个脚本 source)
   ─ CI 黏合脚本(被多个 pipeline 调,改一次影响大)
   ─ 数据处理 / 解析脚本(input → output 的明确契约)

不值得写:
   ─ 一次性数据迁移(只跑一次)
   ─ 简单 alias / wrapper(就 5 行,看代码比看 test 快)
   ─ 已经太复杂,该转 Python 的
```

---

## 八、写"可调试"的脚本

### 8.1 `set -x` 全程开追踪

```bash
set -x       # 之后每条命令打印出来
cmd1
cmd2
set +x       # 关
```

**临时排错**:在脚本头加 `set -x`,看每行实际跑什么。**默认 PS4 是 `+ `**,不带文件名 / 行号——不友好。

### 8.2 自定义 PS4 显示文件 + 行号 + 函数

```bash
export PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]:-main}: '
set -x

# 输出:
# + ./deploy.sh:42:main: cd /app
# + ./deploy.sh:43:main: git pull
# + ./lib.sh:15:check_disk: df -h /
```

**这是 shell 脚本的"堆栈追踪"**——比 `set -x` 默认输出有用 10 倍。

### 8.3 log 函数 + 颜色

```bash
log()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[FAIL]\033[0m  %s\n' "$*" >&2; exit 1; }

log "Starting deploy"
warn "Disk usage > 80%"
die "Cannot find config.yml"
```

**配合 CI**:CI 终端通常支持颜色,关键信息一眼能找到。**非 TTY(管道里)自动忽略颜色 escape**——不会把 `\033[1;34m` 当字符输出(CI 系统通常 strip 掉 ANSI escape)。

### 8.4 30 行带日志的 demo

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# log helpers
log()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[FAIL]\033[0m  %s\n' "$*" >&2; exit 1; }

# 显式失败示例
[ -f config.yml ] || die "找不到 config.yml,你 cd 错目录了吗"

# 关键操作前打日志
log "开始 build"
make build || die "build 失败,看上面的 stderr"

log "开始 deploy"
make deploy || die "deploy 失败"

log "完成"
```

**每个 die 配一行说明**——**不要默认 `exit 1` 没消息**。CI 报错时看到 `[FAIL] 找不到 config.yml`,比看到一个红色的 exit 1 友好 100 倍。

---

## 九、shebang 与可移植性

### 9.1 三种 shebang

```bash
#!/usr/bin/env bash    # 找 PATH 里的 bash(推荐)
#!/bin/bash            # 假设 /bin/bash,macOS 上是 3.2(老!)
#!/bin/sh              # POSIX,Alpine 上是 ash,Ubuntu 上是 dash
```

**推荐 `#!/usr/bin/env bash`**——它找用户当前的 bash(brew install 的 bash 5.x 在 /opt/homebrew/bin/),而不是 `/bin/bash` 那个 macOS 自带的远古 3.2。

### 9.2 macOS 自带 bash 3.2 的坑

```bash
# bash 4 起支持的语法,macOS /bin/bash 3.2 不支持:
declare -A hashmap         # 关联数组
${var^^}                   # 大小写转换
mapfile -t arr < file      # 读文件到数组

# 在 macOS 用 /bin/bash 跑会语法错误,brew install bash 之后用 env bash 才行
```

**所以 macOS 用户写 bash 脚本:务必 `brew install bash` + shebang 用 `env bash`**——`/bin/bash` 当死了别用。

### 9.3 `#!/bin/sh` 的雷区

```bash
#!/bin/sh    # 在不同发行版指向不同 shell:
             # Alpine → ash(busybox 自带的极简 shell)
             # Ubuntu / Debian → dash(POSIX,无 bashism)
             # macOS → bash 3.2(但是以 POSIX 模式跑,部分 bashism 失效)

# 想跨这三个 OS 跑 → 只能用纯 POSIX 语法
[[ "$x" = "y" ]]       # ❌ [[ 是 bashism
[ "$x" = "y" ]         # ✓ POSIX 的 [
echo -e "..."          # ❌ -e 是 bashism,dash / ash 不支持
printf "...\n"         # ✓ POSIX
```

**规则**:**Devcontainer / Alpine / 容器化场景默认用 `#!/bin/sh`?**——不,**用 `#!/usr/bin/env bash` + `apk add bash` 是更靠谱**。POSIX 兼容写起来累,且很容易踩雷。

### 9.4 测试目标环境

```bash
# Dockerfile / devcontainer 装 bash
apk add bash             # Alpine
apt install bash         # 大部分 debian-slim 默认有

# 检查你脚本的目标环境
sh -c 'echo $0'          # 看 sh 是什么
ls -la /bin/sh           # 看 /bin/sh 链到哪
```

---

## 十、CLI 参数解析:能用 getopts 就用,200 行就转 Python

### 10.1 简单:`$1 $2 $@`

```bash
#!/usr/bin/env bash
# usage: ./script.sh <input> <output>

input=$1
output=$2
[ -n "$input" ] && [ -n "$output" ] || {
  echo "Usage: $0 <input> <output>" >&2
  exit 1
}
```

**5 行内的脚本,$1 $2 够了**——别上 getopts。

### 10.2 中等:`getopts`(POSIX,只支持 short option `-x`)

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [-h] [-v VERSION] [-d]
  -h           显示帮助
  -v VERSION   指定版本
  -d           开启 debug
EOF
}

version=""
debug=false

while getopts "hv:d" opt; do
  case "$opt" in
    h) usage; exit 0 ;;
    v) version="$OPTARG" ;;
    d) debug=true ;;
    *) usage; exit 1 ;;
  esac
done
shift $((OPTIND - 1))         # 处理掉 option,剩下的位置参数还在

echo "version=$version debug=$debug rest=$*"
```

**调用**:`./script.sh -v 1.2.3 -d arg1 arg2`。

### 10.3 复杂:别在 shell 里写 200 行参数解析

```bash
# 反例:shell 里手写 long option(--verbose / --output=path)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose) verbose=true; shift ;;
    --output)  output="$2"; shift 2 ;;
    --output=*) output="${1#*=}"; shift ;;
    --help)    usage; exit 0 ;;
    *) args+=("$1"); shift ;;
  esac
done

# 加上 short option / 别名 / 必选检查 / 类型验证 / help 自动生成 / autocomplete
# 你已经写到 200 行,而且边界一堆 bug
```

**这是 shell 的天花板**——`click` / `argparse` 5 分钟搞定的事,shell 给你写 200 行还不全。**100 行的参数解析就是该转 Python 的信号**。

---

## 十一、错误信息友好:每个 exit 1 配一行说明

### 11.1 反例

```bash
[ -f config.yml ] || exit 1
mkdir /var/log/myapp || exit 1
make build || exit 1
```

**CI 输出**:`Process exited with code 1`——你不知道是哪一步失败。

### 11.2 正确

```bash
die() {
  echo "❌ $*" >&2
  exit 1
}

[ -f config.yml ] || die "找不到 config.yml(是不是 cd 错目录?)"
mkdir /var/log/myapp || die "创建 /var/log/myapp 失败(权限?)"
make build || die "build 失败,看上面 stderr 的 cargo 报错"
```

**CI 输出**:`❌ 找不到 config.yml(是不是 cd 错目录?)`——**值班人不用看代码就知道往哪修**。

### 11.3 错误信息要带"修复建议"

```bash
command -v jq >/dev/null || die "未装 jq —— mac: 'brew install jq', linux: 'apt install jq'"

[ -n "${API_KEY:-}" ] || die "未设 API_KEY —— 检查 ~/.config/myapp/.env 或 1Password"
```

**信息密度的差距**:

```
❌  exit 1
✓✓  ❌ 未装 jq —— mac: 'brew install jq', linux: 'apt install jq'
```

后者直接告诉你"问题 + 修复",好的脚本是这种姿势。

---

## 十二、真实事故:Steam / Bitcoin / GitLab 各种

### 12.1 Steam 2015:删用户 home

```bash
# 真实代码(简化)
rm -rf "$STEAMROOT/"*

# 当 STEAMROOT 因某种原因为空(用户 reset 了变量 / 升级 bug):
# = rm -rf "/"*
# 用户的 / 下所有文件被 Steam 删了
```

**修复**:

```bash
# 1. set -u 拦截
set -u
rm -rf "$STEAMROOT/"*       # STEAMROOT 未定义 → 立刻退出

# 2. 显式默认值 + 失败
: "${STEAMROOT:?STEAMROOT must be set}"
rm -rf "$STEAMROOT/"*
```

`${VAR:?msg}` 的语义:**变量未设或为空 → 打 msg + 退出**。这是 shell 给你的"必填变量"检查。

### 12.2 GitLab 2017:rm -rf 错的目录

```bash
# DBA 在错的服务器上跑
rm -Rf /var/opt/gitlab/postgresql/data
# 实际跑在 prod 而不是 stage —— 300GB 用户数据没了
# 备份的 5 套有 4 套是坏的(没人验过)
```

**修复(脚本层面)**:

```bash
# 在脚本最开头加"我是谁,我跑哪"的检查
hostname=$(hostname)
case "$hostname" in
  stage-db-*) echo "Running on stage" ;;
  prod-db-*)  read -p "PROD!! Continue? (yes/NO) " ans
              [ "$ans" = "yes" ] || die "Aborted by user" ;;
  *)          die "Unknown host: $hostname" ;;
esac
```

**所有"可能跑在 prod 上的脚本",务必有这种 hostname 检查**——shell 给你的不是 type system,但 hostname 检查是显式护栏。

### 12.3 Bitcoin 2018:钱包恢复脚本忘了 quote

```bash
# 错的
backup_path=$1
rm -rf $backup_path/wallet     # 没引号

# 用户 backup_path = "/home/me/My Backup"
# rm -rf /home/me/My + rm -rf Backup/wallet
# 用户 /home/me 的目录被删
```

**修复**:`rm -rf "$backup_path/wallet"`——加引号一个动作,避免一个真实事故。

### 12.4 这些事故的共同点

```
─ 都是"非常简单的 shell"
─ 都是"在开发者本地跑得好好的"
─ 都因为某个变量在 prod 跑出了开发者没想到的值
─ set -u / 引号 / hostname 检查 / 默认值 任何一个动作都能避免
─ 但都没做
```

**这就是 shell 脚本工程化要解决的事**——**不是"让 shell 强大"**(它强不起来),**而是"承认 shell 默认行为有坑,主动加防御"**。

---

## 十三、何时该放弃 shell,写 Python

### 13.1 超过 100 行 = 转 Python 的硬信号

```
Python 5 分钟起步:
   uv init mytool && cd mytool
   uv add click httpx
   # 改 main.py
   
立即拥有:
   ─ 类型系统(mypy / pyright)
   ─ pytest 单元测试
   ─ argparse / click 参数解析
   ─ requests / httpx HTTP 客户端
   ─ pydantic 数据校验
   ─ rich 友好输出
   ─ logging 模块
   ─ 调试器 pdb / ipdb
   ─ IDE 跳定义、autocomplete
   ─ 类型推导

shell 给你的:
   ─ 命令拼接
   ─ pipe
   ─ 没了
```

**这就是为什么 100 行是边界**。

### 13.2 转 Python 的几个明确信号

```
信号 1:要 parse JSON
   ─ jq 能干,但语法复杂
   ─ shell 里 grep + awk 拼 JSON 路径是灾难
   ─ Python json.loads + 字典访问 = 一行

信号 2:要复杂数据结构
   ─ shell 关联数组 declare -A 难用
   ─ 嵌套 dict 根本不行
   ─ Python 原生支持

信号 3:要写单元测试 + mock
   ─ bats 能写,但 mock 系统调用很别扭
   ─ Python unittest.mock 标配

信号 4:要并发
   ─ shell 的 & 难调试,wait 容易漏
   ─ Python asyncio / concurrent.futures 标配

信号 5:要重用一个"库"
   ─ shell 函数库可用,但接口约定弱
   ─ Python 包 + 类型注解 + docstring = 文档

信号 6:要给非工程师用
   ─ shell 错误信息差
   ─ Python click 自动生成 --help / 错误友好
```

### 13.3 写 Python CLI 的 2026 起步姿势

```python
#!/usr/bin/env python3
"""mytool - 描述"""

import click
import logging
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


@click.command()
@click.option("-v", "--version", required=True, help="版本号")
@click.option("--dry-run", is_flag=True, help="只打印不执行")
def main(version: str, dry_run: bool) -> None:
    """部署 version 到 prod"""
    logging.basicConfig(level=logging.INFO)

    if dry_run:
        log.info(f"[DRY-RUN] 会部署 {version}")
        return

    log.info(f"开始部署 {version}")
    subprocess.run(["make", "build"], check=True)
    subprocess.run(["scp", f"dist/myapp-{version}", "prod:/opt/"], check=True)
    log.info("完成")


if __name__ == "__main__":
    main()
```

**起步**:`uv init && uv add click`,**10 分钟跑起来**。**比写 200 行 bash 快 10 倍,可维护性高 100 倍**。

### 13.4 不放弃 shell 的场景

```
✓ install / setup 脚本
   ─ 用户机器上没 Python,你要 install 才能装上
   ─ 这种"自举"场景只能 shell
   
✓ CI 黏合
   ─ "调一下 docker, 调一下 kubectl, sleep 一下, 调下 helm"
   ─ 5-30 行,shell 最直接
   
✓ SRE runbook
   ─ kubectl get ... | jq ... | xargs kubectl delete ...
   ─ 一行 pipeline,shell 是它的母语

✓ 把多个工具串成 alias / function
   ─ ~/.zshrc 里的 function gco() { ... }
   ─ shell 函数最自然
```

**这就是 shell 的"主场"**——在主场写得规矩(set 三件套 + shellcheck + 引号),在客场让位 Python。**两边边界清楚,工作流就顺**。

---

## 十四、生产级模板:30 行 shell 脚本 boilerplate

```bash
#!/usr/bin/env bash
# script.sh - 一句话描述这个脚本干啥
#
# Usage:
#   ./script.sh -v VERSION [-d]

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_NAME=$(basename "$0")

# ──────────────────────────────────────────
# 日志
# ──────────────────────────────────────────
log()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[FAIL]\033[0m  %s\n' "$*" >&2; exit 1; }

# ──────────────────────────────────────────
# 用法 & 清理
# ──────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $SCRIPT_NAME -v VERSION [-d] [-h]
  -v VERSION   版本号(必填)
  -d           开启 debug(set -x)
  -h           显示帮助
EOF
}

TMPDIR=""
cleanup() {
  [ -n "$TMPDIR" ] && rm -rf "$TMPDIR"
}
trap cleanup EXIT

# ──────────────────────────────────────────
# main
# ──────────────────────────────────────────
main() {
  local version=""
  local debug=false

  while getopts "hv:d" opt; do
    case "$opt" in
      h) usage; exit 0 ;;
      v) version="$OPTARG" ;;
      d) debug=true ;;
      *) usage; exit 1 ;;
    esac
  done

  [ -n "$version" ] || die "必须 -v VERSION"
  $debug && set -x

  TMPDIR=$(mktemp -d)
  log "开始,version=$version, tmp=$TMPDIR"

  # ── 实际逻辑 ──
  # ...
  
  log "完成"
}

main "$@"
```

**这份 30 行模板**:

```
✓ 入场券:set -euo pipefail + IFS
✓ 三档日志:log / warn / die
✓ 标准 usage 函数
✓ trap 自动清理 TMPDIR
✓ getopts 参数解析
✓ main 函数封装(可测、可重用)
✓ shebang 用 env bash(跨平台)
✓ 必填参数显式检查 + 友好错误信息
✓ 可选 debug 模式(-d)
```

**把这份模板存到 `~/.config/zsh/script-template.sh`,以后所有新 shell 脚本从它派生**——比从空白文件起手,质量自动跳两档。

可以做一个 zsh function 一键创建:

```bash
# ~/.zshrc
newscript() {
  local target="$1"
  [ -z "$target" ] && { echo "Usage: newscript path.sh"; return 1; }
  cp ~/.config/zsh/script-template.sh "$target"
  chmod +x "$target"
  echo "Created $target"
  $EDITOR "$target"
}
```

**`newscript ops/deploy.sh`**——10 秒新建一个工程级骨架。

---

## 十五、反对的写法

这些是常见错误,见到了就是搞错了:

```
❌ 不写 set -euo pipefail
   ─ "我跑过没问题啊"——直到边界条件命中

❌ 变量不加引号:rm -rf $FILE
   ─ 文件名带空格、路径带 $ 都炸
   ─ shellcheck SC2086 第一条提醒

❌ 数组用 $arr[@](没引号没 brace)
   ─ word splitting 把元素切碎

❌ shell 写 200 行
   ─ 100 行就是该转 Python 的信号

❌ shell 脚本不进 shellcheck CI
   ─ 装一次受用一辈子,不接 CI 等于白装

❌ cd 后不检查
   ─ cd /app 失败,后续命令在错的目录
   ─ 修复:cd /app || die "无 /app 目录"
   ─ 或 set -e + 配合 cd 失败退出

❌ exit 1 不附消息
   ─ CI 输出"exit code 1",值班人懵
   ─ die "原因 + 修复建议"

❌ `[ ... = ... ]` 用 `==`
   ─ [ ] 里 == 是 bashism,POSIX 标准用 =
   ─ [[ ]] 里 == 才是合法的
   ─ shellcheck SC2278 提醒

❌ which python 检测命令存在
   ─ which 是非标的、不可靠
   ─ command -v python(POSIX,推荐)

❌ if [ $? -eq 0 ];
   ─ 用 if cmd; 直接判
   ─ 不要把退出码"先存再用",有可能被中间命令污染

❌ 写错的 shebang
   ─ macOS 用 #!/bin/bash 用着 bash 3.2
   ─ 用 #!/usr/bin/env bash

❌ 临时文件不清理
   ─ /tmp 越积越多
   ─ trap 'rm -rf "$TMPDIR"' EXIT

❌ install.sh 写得只能在 mac 上跑
   ─ 用户在 Ubuntu / Alpine 跑就炸
   ─ 防御性写法 + bats 多 OS 测试

❌ 把密码 / token 写进脚本
   ─ 任何"硬编码 secret"都不允许
   ─ 用环境变量 + 不进 git

❌ echo -e 跨平台用
   ─ macOS 的 /bin/sh 不支持,dash 不支持
   ─ 用 printf '...\n'
```

**避开这 15 条,你的 shell 脚本质量自动到工程级**。

---

## 十六、看完应该能

```
□ 在白板上写出 set 三件套 + IFS,讲清楚每条防什么事故
□ 拿到一个新脚本能在 5 分钟内跑 shellcheck + shfmt + 加 set 三件套
□ 写一份带 trap 的 install.sh,失败时清干净不留半残
□ 给一个 200 行的复杂 shell 脚本,能识别"应该转 Python"的信号
□ 给团队脚本配 pre-commit hook(shellcheck + shfmt)+ CI gate
□ 用 bats 给自己的 install.sh 写跨 OS 的测试
□ 写脚本时 die 而不是 exit 1,每条错误信息都带"修复建议"
□ 知道 Steam 2015 那种 rm -rf 事故,你的脚本不会犯
□ 拿走 §14 的 30 行模板,以后所有新 shell 脚本从它派生
```

如果上面这 9 条你都做到,**这一篇就值了**。

---

## 十七、下一篇预告:28 - 任务运行器选型

27 讲了「**shell 脚本本身**」怎么工程化——但 shell 脚本不孤立存在,**它们通常被一层"任务运行器"组织**:

```
你的项目根有:
   ├── package.json (npm scripts)
   ├── Makefile
   ├── justfile
   ├── tasks.py (invoke)
   ├── Taskfile.yml
   ├── mise.toml [tasks]
   
每一个都说"我是项目的任务入口"
   你团队怎么选?
   什么时候 Makefile 不够,什么时候 just 就够,
   什么时候要上 mise tasks?

28 篇讲:
   ─ Make 的优势(无依赖,装机即用)与限制(tab 强制、phony 陷阱)
   ─ Just 的设计(无 dependency-graph、直接调 shell)
   ─ Task / Taskfile.yml(声明式 + cross-platform)
   ─ mise tasks(语言版本 + 任务一体化,24 篇基础上)
   ─ npm scripts 的边界(够前端,跨语言不行)
   ─ 真实工作流场景下的选型表
   ─ 跟 27 篇的 shell 脚本配合(任务入口 + 单独脚本的协作)
```

**核心论断**:**任务运行器不是"工具",是"项目的入口契约"**——选错一次,团队 3 年还在用错的。28 篇会把这件事讲透。
