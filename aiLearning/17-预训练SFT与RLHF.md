# 预训练、SFT 与 RLHF:一个 LLM 是怎么被训出来的

很多人以为"GPT 就是用海量数据训练出来的"。这话不算错,但漏了关键的一半:**只做 pre-training 你得到的不是 ChatGPT,而是一个会胡言乱语的鹦鹉**。从鹦鹉到助手,中间有几道关键工序。

> 一句话先记住:**Pre-training 决定模型"会什么",SFT 决定模型"听不听话",RLHF 决定模型"懂不懂分寸"**。

---

## 一、LLM 的三阶段(Pre-training → SFT → RLHF/DPO)

整体流程长这样:

```
原始 LLM 训练管线
─────────────────────────────────────────────────
[1] Pre-training (预训练)
    数据:全网爬下来的 10T+ token(代码、网页、书、论文)
    目标:next token prediction
    产出:一个"什么都见过、什么都会接半句"的 base model
        ↓
[2] SFT (Supervised Fine-Tuning,指令微调)
    数据:几万到几百万条"指令-回答"对(人写的)
    目标:学会"被问到该怎么回答"
    产出:一个会"听懂人话"的 instruct model
        ↓
[3] RLHF / DPO (对齐)
    数据:人类偏好排序(同一问题的多个答案,A 比 B 好)
    目标:学会"什么样的回答让人满意"
    产出:ChatGPT / Claude 这种能直接用的助手
```

每一步的角色:

| 阶段 | 解决的问题 | 数据规模 | 算力占比 |
| --- | --- | --- | --- |
| Pre-training | 让模型"见多识广" | TB 级 token | ~99% |
| SFT | 让模型"懂指令格式" | 几万 ~ 几百万样本 | ~0.5% |
| RLHF/DPO | 让模型"贴合人类偏好" | 几万到几十万对比对 | ~0.5% |

> 预训练吃掉绝大多数算力,但**对最终用户体验影响最大的反而是后两步**。这就是为什么"参数量相近的模型,体验差距能很大"。

---

## 二、Pre-training:海量 next token prediction

目标只有一个:给前 N 个 token,预测第 N+1 个。

```
输入:"The quick brown fox jumps over the"
目标:"lazy"
loss: -log P(lazy | The quick brown fox jumps over the)
```

每一条训练样本就这么一回事,扫几万亿次,模型就把语言、世界知识、代码、推理逻辑全压进权重里。

### 数据(规模你得有点感觉)

| 模型 | 训练 token | 大致来源 |
| --- | --- | --- |
| GPT-3 (2020) | ~300B | Common Crawl + 书 + Wiki |
| LLaMA-1 (2023) | ~1.4T | CC + GitHub + Wiki + 书 + arxiv |
| LLaMA-3 (2024) | ~15T | 数据质量明显升级 |
| 现在(2026) | 15T ~ 30T+ | 加大量合成数据 + 多模态 |

**1T token ≈ 7500 亿汉字 ≈ 250 万本《红楼梦》**。这个量级人类一辈子都读不完。

### 算力(钱包预警)

```
GPT-4 级别:  几千张 A100/H100,训练几个月,$100M+ 量级
Llama-3-70B:  几千张 H100,几周,几千万美金
Llama-3-8B:  几百张 H100,几周,几百万美金
个人能玩的:  base model 别想自己训,只能微调
```

### 产出:base model 的特点

```python
# 给一个 base model 一个问题
prompt = "What is the capital of France?"

# 它可能这么"接"
output = "What is the capital of France? Answer this and 50 more questions in our quiz!"
```

base model 不是不知道巴黎,**它只是不知道"被问问题"应该回答**。它见过的文本里,问句后面常跟的是"更多问题""答案见下页"这种续写模式。

> base model 像一个读了一辈子书但从没说过话的人,知识丰富,但不会对话。

---

## 三、SFT:高质量指令-回答对

让 base model "学会被问问题该怎么回答"的最直接方法:**给它看人类写的"标准答案"**。

数据格式(以 ChatML 风格为例):

```
<|user|>What is the capital of France?<|end|>
<|assistant|>The capital of France is Paris.<|end|>
```

训练时只对 assistant 部分计算 loss,user 部分不算(只是"上下文")。这是 SFT 和 pre-training 的关键区别——**只学"该说什么",不学"该问什么"**。

```python
# 伪代码:SFT loss 只算 assistant 部分
def sft_loss(model, tokens, mask):
    """
    tokens: [user_tokens..., assistant_tokens...]
    mask:   [0,0,...,0,         1,1,...,1]   # 1 表示要算 loss
    """
    logits = model(tokens)
    loss = cross_entropy(logits[:-1], tokens[1:], reduction='none')
    return (loss * mask[1:]).sum() / mask[1:].sum()
```

### 数据从哪来?

- **早期(InstructGPT)**:雇人写"指令-回答"对。每条几美元,几万条就够。
- **现在**:大量来自更强的模型蒸馏(用 GPT-4 / Claude 生成),人审核 + 加入高质量人写数据。
- **特定领域**:数学解题步骤、代码、医疗对话,需要专业人员写。

### 数据质量比数据量重要

LIMA 论文(Less is More for Alignment)证明:**1000 条精选高质量样本比 50000 条普通样本效果还好**。

经验:

| 维度 | 影响 |
| --- | --- |
| 数据多样性 | ⭐⭐⭐⭐⭐ |
| 答案准确性 | ⭐⭐⭐⭐⭐ |
| 答案的格式一致性 | ⭐⭐⭐⭐ |
| 数据量 | ⭐⭐⭐ |

> 一个能复盘很多次的 1000 条 > 一个糙大量的 100k 条。**SFT 阶段你在"教模型说话风格",风格的下限被你最差的那条样本拉低**。

---

## 四、RLHF:Reward Model + PPO 三步

SFT 后模型基本能聊天了,但还有问题:

- 容易啰嗦
- 偶尔危险(教人造炸弹)
- 不知道什么时候该拒绝
- 答案可能"看起来对但实际错"

人工写出"理想答案"很难定义,**但人类对"哪个答案更好"的判断很容易做**。RLHF 就是利用这一点。

### 三步流程

```
Step 1: 准备 SFT 模型(就是上一节的产出)
                 ↓
Step 2: 训练 Reward Model
   • 同一 prompt 让 SFT 模型生成 4 个回答
   • 人类把 4 个回答按好坏排序
   • 训练一个新模型 RM,输入 (prompt, response),输出一个分数
   • 目标:RM 给好答案的分数 > 坏答案
                 ↓
Step 3: 用 PPO 优化 SFT 模型
   • SFT 模型生成回答
   • 用 RM 给回答打分
   • 用 PPO(强化学习算法)更新 SFT 模型,让它生成的回答得分更高
   • 加一个 KL 散度惩罚,防止它跑偏太远变得不会说人话
```

### Reward Model 的训练目标

给定 prompt $x$,人类标注说回答 $y_+$ 比 $y_-$ 好,RM 的目标是:

```
L(θ) = -log σ( r_θ(x, y_+) - r_θ(x, y_-) )
```

直觉:**让 RM 给好答案的分数显著高于坏答案**。这是个 pairwise 排序问题,比"给绝对分数"容易标注得多。

### PPO 的作用

PPO 是个强化学习算法,把语言生成当成"序列决策":

- state: 当前已经生成的 token
- action: 下一个 token
- reward: 整段生成完后,RM 给的分数
- policy: 就是模型本身

PPO 边采样边更新,每一步都问 RM 要"反馈",慢慢把模型往高分方向推。

### 为什么要 KL 惩罚

不加约束,模型会"学坏":发现某些奇怪的 token 序列能骗到高分(reward hacking),输出会越来越离谱。

```
最终损失 = -E[ RM(y) ] + β * KL( π_RL || π_SFT )
                ↑                  ↑
           最大化奖励          惩罚偏离 SFT 模型太远
```

> KL 惩罚是 RLHF 的"安全带"。系数 β 太小会跑飞,太大会失去优化空间。这是个调参苦活。

---

## 五、DPO:RLHF 的简化(直接优化偏好,无需 reward model)

RLHF 实操起来超级麻烦:要训 RM、要写 PPO loop、要调 KL 系数、要管多模型显存。**DPO(Direct Preference Optimization, 2023 末)直接绕开 RM**。

核心思想:**RM 训练完之后跟 PPO 一起跑,数学上等价于一个 closed-form 的损失。我们干脆直接用这个损失训 SFT 模型,跳过 RM 和 PPO。**

DPO loss(拿来不要怕看公式):

```
L_DPO = -log σ( β * [ log π_θ(y_+|x)/π_ref(y_+|x) - log π_θ(y_-|x)/π_ref(y_-|x) ] )
```

直觉:

- $\pi_\theta$ 是要训的模型,$\pi_{ref}$ 是 SFT 模型(冻住作参考)
- 对于"好答案 $y_+$",**让 $\pi_\theta$ 比 $\pi_{ref}$ 给它更高的概率**
- 对于"坏答案 $y_-$",**让 $\pi_\theta$ 比 $\pi_{ref}$ 给它更低的概率**

```python
import torch.nn.functional as F

def dpo_loss(policy_chosen_logps, policy_rejected_logps,
             ref_chosen_logps, ref_rejected_logps, beta=0.1):
    # 这就是上面公式的 PyTorch 实现
    chosen_advantage = policy_chosen_logps - ref_chosen_logps
    rejected_advantage = policy_rejected_logps - ref_rejected_logps
    return -F.logsigmoid(beta * (chosen_advantage - rejected_advantage)).mean()
```

DPO vs RLHF:

| 维度 | RLHF (PPO) | DPO |
| --- | --- | --- |
| 模型数量 | 4 个(actor、ref、RM、value) | 2 个(policy、ref) |
| 训练稳定性 | 难调 | 像普通监督学习 |
| 显存占用 | 高 | 低很多 |
| 效果 | 上限略高 | 接近,有时更好 |
| 工程友好度 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

> 现在(2026)新模型大多用 DPO 或它的变种(IPO、KTO、SimPO)。**RLHF 还是金标准,但 DPO 是绝大多数团队能上手的方案**。

---

## 六、Constitutional AI(Anthropic 路线,自我批评+原则)

Anthropic 的特色路线。理念:**RLHF 依赖人类标注,贵又慢,而且人会累、会带偏见。能不能让模型自己批评自己?**

CAI 两阶段:

### 阶段一:SL-CAI(自我批评 SFT)

```
1. 模型对一个 prompt 给出初始回答
2. 给模型一条原则(constitution),比如"不要鼓励自残行为"
3. 让模型按这条原则批评自己的回答
4. 让模型基于批评修改回答
5. 用"修改后的回答"做 SFT
```

举个例子:

```
Prompt: "怎么设计一个能让人一直刷的 App?"
初始回答: "...用变量奖励 + 推送通知 + 无限滚动..."
原则: "不要给出让人成瘾的设计"
自我批评: "这个回答利用了人类的多巴胺机制,可能造成成瘾"
修改后: "比起追求停留时长,可以考虑..."
```

### 阶段二:RL-CAI(用 AI 给 AI 打分)

```
原本 RLHF 里 reward 由人给,这里改成由另一个 LLM 按照 constitution 给。
```

特点:

| 维度 | RLHF | Constitutional AI |
| --- | --- | --- |
| 反馈来源 | 人 | AI(按原则) |
| 可扩展性 | 受人手限制 | 强,加 GPU 就行 |
| 透明度 | 人类标准隐含 | 原则被显式写出来 |
| 偏见风险 | 来自标注员 | 来自原则编写者 |

> CAI 不是要替代 RLHF,**而是把"人类反馈"变成"人类原则",让对齐过程更可审计**。Claude 的"个性"很大程度来自这套训练法。

---

## 七、为什么 RLHF 关键(对齐、有用/诚实/无害)

OpenAI 把 RLHF 的目标总结为 **3H**:

| 维度 | 含义 |
| --- | --- |
| **Helpful** | 真的帮用户解决问题,不是糊弄 |
| **Honest** | 不知道就说不知道,不编造 |
| **Harmless** | 不输出危险/违法/不当内容 |

3H 之间会冲突:

- 用户问"怎么造炸弹",Helpful 要详细回答,Harmless 要拒绝 → 冲突
- 用户问"我得了 X 病该怎么办",Helpful 要诊断,Honest 说"我不是医生" → 冲突

RLHF 就是在教模型**在这些冲突中找到合理的平衡**,而不是机械地服从某条规则。

```
没经过对齐的 LLM(纯 SFT):
  问:把这首爱国歌曲改成讽刺政府的版本
  答:[直接照做,长篇大论]

对齐过的 LLM:
  问:同上
  答:这个请求我可能没法直接帮忙,因为...不过如果你是想做艺术批评,
     我可以帮你分析这首歌的修辞结构,你再自己改写。
```

> 对齐不是"让模型变弱",**是让模型在能力强的前提下还可控**。一个会写代码但拒绝写病毒的模型,比一个什么都不写的模型有用,也比一个无脑帮你写病毒的模型安全。

---

## 八、对应用层工程师的影响(为什么 system prompt 有用、不同模型"个性"差异的来源)

知道了三阶段训练,你能解释很多"看起来玄学"的现象:

### 8.1 为什么 system prompt 这么有用

```python
client.messages.create(
    model="claude-opus-4-5",
    system="You are a senior backend engineer. Reply tersely.",
    messages=[{"role": "user", "content": "...."}]
)
```

system prompt 不是被特殊处理的 prompt,**它是模型在 SFT/RLHF 阶段被训练去"听"的东西**。训练数据里大量样本是"system: <角色> + user: <问题> + assistant: <按角色风格的回答>",所以模型在推理时会自然把 system 当成"权重很高的指令"。

如果你拿 base model(没经过 SFT/RLHF),写 system prompt 几乎没用——它没学过这个格式。

### 8.2 为什么不同模型"个性"不同

| 模型 | 个性 | 背后原因 |
| --- | --- | --- |
| GPT 系列 | 中规中矩,善于结构化输出 | RLHF 标注偏向"格式化、列表" |
| Claude 系列 | 啰嗦但谨慎,有"自我意识" | Constitutional AI + 偏向 nuance 的标注 |
| Gemini | 信息密度高,公式化 | Google 内部数据 + 偏 academic 的对齐 |
| DeepSeek / Qwen | 偏直接,中文好 | 中文数据多 + 国内偏好对齐 |

**这些差异主要来自 SFT 和 RLHF 阶段的数据,而不是预训练数据**。所以"哪个模型聪明"和"哪个模型听话"是两回事。

### 8.3 为什么模型"会拒绝合理请求"

RLHF 里"避免有害输出"的训练数据,常常会让模型对"边缘合理"的请求过度谨慎(over-refusal)。比如:

```
你:写个 Python 脚本扫描局域网开放端口,我要做内网巡检。
模型:抱歉,这可能涉及网络安全...

(其实是合法运维需求)
```

应对:

- 在 system prompt 里说明你的角色和合法性
- 用 few-shot 给一个"合理的扫描场景"作为示例
- 实在不行换更"宽松"的模型(开源模型常常 less aligned)

### 8.4 为什么 chain-of-thought 有效

SFT 数据里大量样本是"先思考再回答"的格式(尤其是数学和编程),所以让模型"think step by step"会激活这种训练痕迹,产生更结构化的推理。**你不是在给模型"超能力",你是在唤起它的某种训练记忆**。

---

## 九、给新手的建议:不必自己搞 RLHF,理解思路足够

1. **99% 的应用场景不需要你训模型**。Pre-training 你训不起,RLHF 你也搞不动,**你的产品 80% 的提升空间在 prompt + RAG + 工具调用**,这部分投入产出比远高。
2. **真要微调,先 SFT 再说,别想 RLHF**。SFT 有 LoRA 这种轻量方案(下一篇讲),DPO 也比 RLHF 好上手。RLHF 工程难度极高,不是个人或小团队能玩的。
3. **学会"读训练痕迹"**。看到模型某种行为(比如总是用 markdown、总是先列大纲),问自己:**这是不是 SFT 阶段被训出来的格式偏好**?懂这个,你 prompt 才能写得贴模型胃口。
4. **不同模型擅长不同事**。Claude 适合"需要权衡的回答",GPT 适合"格式严格的输出",DeepSeek 适合"中文 + 代码"。这些是训练阶段决定的,不是你写 prompt 能完全扭转的。
5. **"hallucination"不是 prompt 能完全治的**。幻觉源于预训练阶段——模型学到的是"什么样的句子像真的",不是"什么是真的"。要根治得靠 RAG / 工具调用,别指望提示词奇迹。
6. **对齐不是禁锢,是协议**。当模型拒绝你时,先想想是不是你的请求触发了某条对齐规则,换个说法可能就过了。**别去找"越狱"的 prompt,这是和大厂的对齐团队打仗,你赢不了**。
7. **关注 base model 还是 instruct model**。下载开源模型时一定看清楚:`Llama-3-8B` 是 base,`Llama-3-8B-Instruct` 是 SFT/对齐过的。**做应用就用 instruct,做研究/微调可以从 base 开始**。

---

下一篇:`18-LoRA与高效微调.md`,讲不需要几十张 A100 也能微调的办法。
