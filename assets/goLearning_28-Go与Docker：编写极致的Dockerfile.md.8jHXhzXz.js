import{_ as a,H as i,f as n,i as l}from"./chunks/framework.BHvCMIhP.js";const c=JSON.parse('{"title":"Go 与 Docker：编写极致的 Dockerfile","description":"","frontmatter":{},"headers":[],"relativePath":"../goLearning/28-Go与Docker：编写极致的Dockerfile.md","filePath":"../goLearning/28-Go与Docker：编写极致的Dockerfile.md","lastUpdated":1778496697000}'),e={name:"../goLearning/28-Go与Docker：编写极致的Dockerfile.md"};function p(t,s,k,h,o,r){return i(),n("div",null,[...s[0]||(s[0]=[l(`<h1 id="go-与-docker-编写极致的-dockerfile" tabindex="-1">Go 与 Docker：编写极致的 Dockerfile <a class="header-anchor" href="#go-与-docker-编写极致的-dockerfile" aria-label="Permalink to &quot;Go 与 Docker：编写极致的 Dockerfile&quot;">​</a></h1><blockquote><p><strong>导读</strong>：Go 程序的最终产物是一个完全独立的静态二进制文件。这意味着它运行时完全不需要安装 Go 环境、Python 解释器或 JVM，非常适合容器化。</p></blockquote><h2 id="一、为什么-go-适合-docker" tabindex="-1">一、为什么 Go 适合 Docker？ <a class="header-anchor" href="#一、为什么-go-适合-docker" aria-label="Permalink to &quot;一、为什么 Go 适合 Docker？&quot;">​</a></h2><p>传统 Java/Python 应用的镜像动辄几百兆甚至上 GB，而一个复杂的 Go 微服务镜像，可以<strong>极致压缩到不到 10MB</strong>。部署极快，扩容极快。</p><h2 id="二、多阶段构建-multi-stage-build" tabindex="-1">二、多阶段构建 (Multi-Stage Build) <a class="header-anchor" href="#二、多阶段构建-multi-stage-build" aria-label="Permalink to &quot;二、多阶段构建 (Multi-Stage Build)&quot;">​</a></h2><p>这是编写 Go Dockerfile 的绝对标准做法。我们在第一阶段使用臃肿的 Go 镜像进行编译，在第二阶段把编译好的二进制文件直接扔到一个极小的基础镜像（如 Alpine 或 Scratch）中运行。</p><div class="language-dockerfile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">dockerfile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 第一阶段：编译 (builder)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> golang:1.21-alpine </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">AS</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> builder</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 设置国内代理和开启 Module</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ENV</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> GO111MODULE=on \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    GOPROXY=https://goproxy.cn,direct</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WORKDIR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> /build</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">COPY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> go.mod go.sum ./</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> go mod download</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 拷贝源代码并编译</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">COPY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> . .</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># CGO_ENABLED=0 禁用 CGO，保证生成完全静态链接的二进制，这样才能在任意极简系统中运行</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> CGO_ENABLED=0 GOOS=linux go build -o myapp ./cmd/api/main.go</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 第二阶段：运行环境</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Alpine 是只有 5MB 的轻量级 Linux</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 追求极致甚至可以使用 FROM scratch (一个完全空无一物的镜像)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> alpine:latest</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 更新证书，否则发 HTTPS 请求会报错</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> apk --no-cache add ca-certificates tzdata</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WORKDIR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> /app</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 只从 builder 阶段把编译好的那个二进制文件拷过来</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">COPY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> --from=builder /build/myapp .</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">EXPOSE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 8080</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 启动命令</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">CMD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;./myapp&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span></code></pre></div><h2 id="三、docker-构建加速技巧" tabindex="-1">三、Docker 构建加速技巧 <a class="header-anchor" href="#三、docker-构建加速技巧" aria-label="Permalink to &quot;三、Docker 构建加速技巧&quot;">​</a></h2><p>上面的 Dockerfile 里，我们把 <code>COPY go.mod go.sum ./</code> 放在拷贝全量代码之前，是为了<strong>利用 Docker 的层缓存 (Layer Cache)</strong>。只要模块依赖不变，Docker 就会直接复用 <code>go mod download</code> 这一层的缓存，极大地加快后续的反复构建速度。</p>`,9)])])}const g=a(e,[["render",p]]);export{c as __pageData,g as default};
