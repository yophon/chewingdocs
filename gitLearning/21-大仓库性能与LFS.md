# 大仓库性能与 LFS

git 在 100MB 仓库上飞快,在 5GB 仓库上还行,在 50GB monorepo 上**举步维艰**——`git status` 跑 30 秒、`git clone` 跑 1 小时、`git log` 卡顿。这一篇讲大仓库的性能问题、几个救命武器(shallow / partial / sparse / LFS)、和 Google / Meta 这种**100GB+ 仓库**怎么活下来的。

> 一句话先记住:**git 慢的根源是它存了仓库的全部历史 + 全部对象在每个开发者机器上**——分布式设计的代价。**大仓库的优化都是"少存点"**:shallow clone 只下近期 commit、partial clone 不下 blob、sparse checkout 只 checkout 部分文件、LFS 把大文件外挂存。**了解这四件,90% 的大仓库性能问题能解**。

---

## 一、git 在大仓库的瓶颈

### 1.1 clone 慢

`git clone` 默认下整个历史 + 所有 blob:

- Linux 内核(2026):约 5GB,clone 几十分钟
- Chromium:约 30GB,clone 一到几小时
- Google monorepo(传说中):**几百 GB**

慢的不只是网络,**git 解压 + index 建立**也很慢。

### 1.2 status 慢

`git status` 要遍历整个工作区 + 比对 index:

- 10 万文件:几秒
- 100 万文件:十几秒到几十秒
- macOS 默认文件系统(APFS)上 stat 调用慢,雪上加霜

### 1.3 log / blame 慢

`git log -- file` 在 history 长的仓库慢——要遍历历史找改 file 的 commit。

### 1.4 push 慢

push 时 git 要 pack 对象上传——大仓库 pack 慢、传输慢。

---

## 二、shallow clone:只下近期 commit

```bash
git clone --depth=1 <url>            # 只下最近 1 个 commit
git clone --depth=50 <url>           # 最近 50 个
git clone --shallow-since="1 month ago" <url>
git clone --single-branch <url>      # 只 clone 默认分支
git clone --no-tags <url>            # 不下 tag
```

**完美场景**:**CI 只跑测试**——只需要最新代码,不需要历史。

```yaml
# GitHub Actions
- uses: actions/checkout@v4
  with:
    fetch-depth: 1     # 默认就是这个
```

**限制**:

- 早期 git 版本不能 push shallow clone(2.5+ 大部分场景能,但仍有边界)
- 不能 fetch 超出 depth 的 commit
- 不能跑历史相关命令(`git log` / `git blame` 看不全)

**转回完整**:

```bash
git fetch --unshallow
```

> shallow clone 是**省时间最大的一招**——CI 默认开 fetch-depth: 1 节省一半时间。本地开发要看历史可以单独 fetch。

---

## 三、partial clone:不下 blob,用到再拉

git 2.19+ 加入,真正的"懒加载":

```bash
git clone --filter=blob:none <url>          # 不下 blob,要时再拉
git clone --filter=blob:limit=1m <url>      # 只下 < 1MB 的 blob
git clone --filter=tree:0 <url>             # 连 tree 都不下(更激进)
```

**机制**:

- clone 时只下载 commit 和 tree 对象
- 你 checkout / cat-file 某文件时,git 才**按需下载**对应 blob

**用户体验**:

- clone 极快
- 第一次访问某文件:稍慢(要下载)
- 之后:正常速度(已缓存)

**限制**:

- 完全离线工作不行(需要服务端支持)
- 服务端要支持 `uploadpack.allowFilter`(GitHub / GitLab 都支持)
- 一些老 git 工具不兼容(IDE / GUI 可能假死)

```bash
# 已 partial clone 的仓库,补全所有 blob
git fetch --refetch
```

---

## 四、sparse checkout:只 checkout 部分文件

git 2.25+ 把 sparse checkout 提到一级命令(原来要 `core.sparseCheckout`):

```bash
git sparse-checkout init --cone        # 启用,cone 模式(简单 / 快)
git sparse-checkout set src/auth docs  # 只 checkout 这两个目录
git sparse-checkout list               # 看当前 sparse 配置
git sparse-checkout disable            # 关闭,恢复完整 checkout
```

之后工作区**只有指定路径的文件**——其他路径在 git 里有,但磁盘上不存在。

**典型场景**:

- monorepo 里 200 个 package,你只关心 5 个 → sparse 只 checkout 这 5 个
- 大仓库里只想 build 某个子目录

**搭配 partial clone 的"完美组合"**:

```bash
git clone --filter=blob:none --no-checkout <url>
cd repo
git sparse-checkout init --cone
git sparse-checkout set packages/my-package
git checkout main
# 此时:.git 里只有 commit/tree,工作区只有 my-package 的文件
```

**Microsoft 的 VFS for Git / GVFS** / **Meta 的 EdenFS** 在这之上更进一步——文件系统级别的"虚拟"。

> Google / Meta / Microsoft 的"几百 GB 仓库"都靠 partial + sparse 撑住——开发者电脑上**实际存的只是工作 package 的几 GB**。

---

## 五、Git LFS:大文件外挂存储

git 设计上**对大文件不友好**:

- 每次改 1MB 二进制文件 → git 存整个 1MB(不会 diff 二进制)
- 100 次提交后历史里有 100MB 同一文件的不同版本
- clone 越来越慢

**Git LFS(Large File Storage)** 的解法:**git 仓库里只存"指针",真正文件在外部 LFS 服务器**。

### 5.1 安装

```bash
brew install git-lfs       # macOS
git lfs install            # 在仓库里启用
```

### 5.2 配置追踪规则

```bash
git lfs track "*.psd"       # 所有 .psd 文件走 LFS
git lfs track "*.mp4"
git lfs track "assets/**/*.png"
```

会写入 `.gitattributes`:

```
*.psd filter=lfs diff=lfs merge=lfs -text
```

`.gitattributes` 必须 commit——团队所有人统一规则。

### 5.3 之后

```bash
git add design.psd          # 自动走 LFS
git commit -m "add design"
git push                    # 大文件上传到 LFS server
```

仓库里 `design.psd` 变成一个小指针文件:

```
version https://git-lfs.github.com/spec/v1
oid sha256:abcdef...
size 12345678
```

clone 时:

```bash
git clone <repo>            # 只下指针,不下大文件
git lfs pull                # 显式下载所有 LFS 文件

# 或:
git lfs clone <repo>        # 一步到位
```

### 5.4 LFS 的限制和坑

- **LFS 服务端要支持** —— GitHub / GitLab / Bitbucket 都支持,但**收费**(GitHub 免费 1GB / 月)
- **clone 大小**仍然不小(指针小,但 `git lfs pull` 后还是大)
- **历史里早已存在的大文件 LFS 化** —— 要走"重写历史"流程(`git lfs migrate`),很危险
- **partial clone + LFS 结合**有边界条件

> **LFS 是为"团队协作必须看到大文件"的场景设计**(设计资产、模型权重、视频素材)。**纯代码仓库别上 LFS**——更可能用 `.gitignore` 排除大文件,生成物 / 二进制走 CI artifact。

---

## 六、其他大仓库优化

### 6.1 commit-graph

加速 `git log --graph` 等历史遍历:

```bash
git config --global core.commitGraph true
git config --global gc.writeCommitGraph true
git commit-graph write    # 一次性生成
```

仓库里写一个 `.git/objects/info/commit-graph` 索引——log 快几倍到几十倍。

### 6.2 fsmonitor

加速 `git status`:

```bash
git config --global core.fsmonitor true     # 2.37+ 内置 fsmonitor
git config --global core.untrackedCache true
```

机制:git 用文件系统的 watch API 知道哪些文件变了,**不再扫整个工作区**。

效果:100 万文件仓库的 `git status` 从 30 秒到 < 1 秒。

### 6.3 multi-pack-index

```bash
git multi-pack-index write
```

加速 packfile 查找——大量历史的仓库。

### 6.4 partial fetch

只 fetch 某些分支:

```bash
git fetch origin main:main feature:feature
```

不 fetch 所有分支——大仓库每次 fetch 节省时间。

---

## 七、scalar:Microsoft 出品的大仓库套件

[scalar](https://github.com/microsoft/scalar) 现已并入 git core:

```bash
scalar clone <url>          # 自动开 partial + sparse + commit-graph + fsmonitor
scalar register <repo>      # 把现有仓库加进 scalar 管理
```

**一键全开大仓库优化**——对开发者透明。

> 大仓库默认上 scalar——比手工挨个开各种 flag 简单。

---

## 八、监控仓库健康

```bash
git count-objects -vH       # 看仓库大小、对象数
# count: 1234           ← loose objects
# size: 1.23 MiB
# in-pack: 567890       ← packed objects
# size-pack: 1.23 GiB

git gc --aggressive         # 定期跑,优化 packfile
git fsck                    # 检查仓库完整性
```

**症状**:

- `loose objects` 几万个 → 跑 `git gc`
- `size-pack` 几 GB → 考虑 LFS / 清历史
- `in-pack` 几百万 → 大仓库,上 scalar

---

## 九、清掉历史里的大文件

仓库变大常因**历史里某个时期 commit 过大文件**(LFS 化之前的资产、误 commit 的 dump 文件)。清掉它们:

### 9.1 git-filter-repo(推荐)

```bash
pip install git-filter-repo

# 把所有 .psd 从历史里清掉
git filter-repo --path-glob '*.psd' --invert-paths

# 把某文件从历史里清掉
git filter-repo --path secrets.json --invert-paths

# 清掉所有 > 10MB 的文件
git filter-repo --strip-blobs-bigger-than 10M
```

清完后**所有 commit hash 都变了**——团队所有人要 re-clone。

### 9.2 BFG Repo-Cleaner(老但好用)

```bash
java -jar bfg.jar --delete-files secrets.json
java -jar bfg.jar --strip-blobs-bigger-than 10M
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

### 9.3 git filter-branch(慢、不推荐)

git 自带,但**慢得离谱**——10 万 commit 的仓库要跑几小时。新代码用 git-filter-repo。

---

## 十、典型大仓库工作流

**Monorepo 团队(50+ packages,50GB+ 仓库)**:

```bash
# 新人 onboard
scalar clone <url>
cd repo
scalar register .

# 配 sparse 只关心几个 package
git sparse-checkout set packages/my-package packages/shared

# 日常开发
git status         # < 1 秒(fsmonitor)
git log            # 快(commit-graph)
git fetch          # 只 fetch 关心分支
```

**资产仓库(设计 / 视频)**:

- LFS 处理大文件
- 分割成 多个 sub-repo + subtree(避免单仓库 100GB)
- 定期 `git lfs migrate` 把零散大文件迁 LFS

---

## 十一、踩坑提醒

1. **大仓库不开 fsmonitor**——`git status` 卡 30 秒
2. **CI 用完整 clone**——每次几 GB,慢 + 浪费带宽,**用 fetch-depth: 1**
3. **大文件直接 commit 不上 LFS**——历史污染,clone 越来越慢
4. **LFS 配置漏 .gitattributes commit**——只你本地走 LFS,队友 commit 进 git 历史
5. **想清历史里大文件用 filter-branch**——慢死,**用 filter-repo**
6. **partial clone 后假设能离线**——不行,要联网拉 blob
7. **sparse checkout 后忘了**——以为某文件丢了,实际上是 sparse 排除了
8. **不定期 `git gc`**——loose objects 累积到几万个,每次操作都慢
9. **LFS 用 + 历史清** 没考虑团队同步——别人本地还是旧的,re-clone 公告必发
10. **小仓库强行上 scalar / LFS**——过度工程,小仓库原生 git 就够了

---

下一篇:`22-签名提交安全与高级技巧.md`,讲 GPG / SSH 签名提交、密钥管理、history rewrite 的安全考量、和一些冷门但救命的高级 git 命令。
