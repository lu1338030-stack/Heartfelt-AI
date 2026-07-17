# Heartfelt AI · 执行规划文档

> 基于 2026-07-16 真实代码现状盘点产出。权威设计源：[`plan/project-overview.md`](../../plan/project-overview.md)。
> 本文档是开发 agent 和测试 agent 的执行蓝图。每个 Phase 的验收标准**必须全部满足**才算完成。

---

## 1. 现状盘点（2026-07-16 摸底）

| 端 | 完成度 | 已有 | 缺失 |
|---|---|---|---|
| **frontend** | ~30% | 路由骨架 6 条；HumanizePage + DetectionPage 真页面（组件完整、交互完整）；设计系统完整迁移（globals.css 270 行）；axios client + health hook | 全 mock 数据，0 真实 API 调用；Dashboard/Api/Pricing 占位符；缺 react-query/zustand/react-hook-form/zod/react-dropzone/framer-motion/recharts |
| **backend** | ~5% | NestJS 能跑；health module + ai-service client（axios 封装） | TypeORM 故意没启用；0 业务 module；0 实体；0 migration；0 算法库；缺 pgvector/bullmq/mammoth/docx/jieba/pino |
| **ai-service** | ~5% | FastAPI 能跑；/health；lifespan 占位 | 4 业务路由全注释；0 模型加载；torch/transformers/sentence-transformers 全在 optional 未装 |
| **shared** | ~20% | openapi.yaml 有 /health；types/index.ts 手写完整业务类型（Paper/Plagiarism/AiDetection/Humanize 全覆盖） | 业务 API 端点未定义 |
| **基础设施** | 设计完成 | docker-compose.yml 写好 PG(pgvector)+Redis+MinIO | **Docker 未安装**（用户将装） |

**核心矛盾**：前端领先后端太多（30% vs 5%），中间是 mock 数据的鸿沟；后端 TypeORM 因等 Docker 而冻结。

---

## 2. 卡点与对策

### 卡点 A：Docker 未安装 → TypeORM 冻结

**对策**：用户已同意安装 Docker。本规划的 Phase 0 第一步就是装 Docker + `docker compose up -d`，后续所有 Phase 按原生 PG+Redis+MinIO 架构推进，**不使用 SQLite/内存队列等变通方案**。

装 Docker 的命令（Windows，交用户执行）：
```powershell
winget install Docker.DockerDesktop
# 装完重启电脑，启动 Docker Desktop，等托盘图标变绿
docker compose up -d   # 在 projects/heartfelt-ai/ 下执行
```~

### 卡点 B：前端领先但全 mock，后端 0 业务接口

**对策**：Phase 1 降AI 模块从后端算法起步，做到后端 `/api/v1/humanize` 可用后，立刻把前端 HumanizePage 的 mock 换成真 API。**前端 mock 在对应后端接口就绪前不拆**，保证随时可演示。

### 卡点 C：算法准确率难验证

**对策**：每个算法模块配套**验收样本集**（人工标注的已知答案文本），验收时跑样本集统计准确率，不靠"看起来对"。

---

## 3. Phase 拆解

> 依赖链：Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4。前 3 个可部分并行（见各 Phase 依赖说明）。

### Phase 0：基础设施 + 后端数据层就位

**目标**：Docker 跑起来，TypeORM 接通 PG，实体和 migration 建表，papers 模块能上传/查询。这是所有业务模块的地基。

**前置**：用户装 Docker（卡点 A）。

**交付物**：
- [x] Docker 装好，`docker compose up -d` 起 PG+Redis+MinIO 三容器
- [x] `backend/.env` 配好（DATABASE_URL、REDIS_URL、MINIO 配置、kdoo.ai key 占位）
- [x] `backend/src/app.module.ts` 启用 `TypeOrmModule.forRootAsync(...)`
- [x] `backend/src/entities/` 下 5 个实体：`paper.entity.ts` / `plagiarism-result.entity.ts` / `ai-detection-result.entity.ts` / `humanize-iteration.entity.ts` / `corpus-fingerprint.entity.ts`（字段见设计文档第 5 章 SQL）
- [x] `backend/src/data-source.ts` TypeORM DataSource 配置
- [x] 首个 migration 文件（建上述 5 表 + `CREATE EXTENSION vector`）
- [x] `pnpm migration:run` 成功建表
- [x] `backend/src/modules/papers/`：controller + service + dto（upload/get）  *(注：实际路径 `backend/src/papers/`，按 NestJS 约定不用 modules/ 子层)*
- [x] MinIO 文件上传/下载封装（`backend/src/modules/storage/` 或 papers 内联）  *(注：实际 `backend/src/storage/`，全局模块)*
- [x] Redis 连接封装（为后续 BullMQ 准备）  *(注：Redis 容器已起，连接封装留 Phase 4 装 BullMQ 时一并做，避免无消费方引入死代码)*

**验收标准**：
1. `docker compose ps` 显示 postgres/redis/minio 三容器 healthy
2. `pnpm migration:run` 退出码 0，PG 里 `\dt` 能看到 5 张表 + vector 扩展
3. `pnpm start:dev` 启动 NestJS 无报错
4. `curl -X POST /api/v1/papers/upload -F file=@test.docx` 返回 `{ paperId, charCount }`
5. `curl /api/v1/papers/<id>` 返回论文记录
6. MinIO 控制台（localhost:9001）能看到上传的文件

**依赖**：无（第一个开工）
**预估**：2-3 天

---

### Phase 1：降AI 模块（最高优先级）

**目标**：后端实现降AI 三阶段流水线（规则引擎 → LLM 重写 → 自检），暴露 `/api/v1/humanize` 独立接口；前端 HumanizePage 接真 API。

**依赖**：Phase 0 完成（需 papers 表存迭代记录，需 MinIO 存对照）。**降AI 是纯 Node 算法 + LLM HTTP 调用，不依赖 Python ai-service**。

**交付物**：
- [ ] `backend/src/modules/humanize/data/humanize-rules.ts`：降AI 规则词典，**合并三个来源**：
  - 设计文档 3.3 章的 126 条学术化替换（标点清洗 / 模板打破 / 学术化替换）
  - 开源 aigc-deslop / humanize-chinese 的规则
  - **humanizer skill v2.8.2 的确定性模式**（正则可匹配的，共 18 条）：
    - **破折号零容忍**（模式 14，硬约束非建议）：`—` `–` `——` `--` → 句号/逗号/冒号/括号/重构。规则引擎输出后强制扫描，命中即未通过
    - 弯引号 `""` → 直引号 `""`（模式 19）
    - 三段式打破（`X、Y 和 Z` / `首先...其次...最后` → 非对称结构）（模式 10）
    - 否定排比 `不仅仅是...而是...` / 尾随否定 `..., no X` → 直接陈述（模式 9）
    - 表情符号剥离（模式 18）
    - 粗体标记剥离 `**X**` → `X`（模式 15）
    - 内联标题列表平整化（`- **X：** ...` → 连续散文）（模式 16）
    - AI 高频词替换（此外→另外、值得注意的是→、至关重要→很重要、不断演变的格局→ 等，模式 7）
    - 填充短语删除（"为了实现这一目标"→"为此"、"在这个时间点"→"现在"、"值得注意的是数据显示"→"数据显示" 等，模式 23）
    - 协作交流痕迹删除（"希望这对您有帮助"、"请告诉我"、"这是一个" 等，模式 20）
    - 知识截止免责 + 投机填充删除（"截至...根据我最后的训练"、"保持低调" 等，模式 21）
    - 谄媚语气删除（"好问题！"、"您说得完全正确" 等，模式 22）
    - 通用积极结论平整化（"未来看起来光明"、"激动人心的时代" → 具体陈述，模式 25）
    - 信号旗宣告删除（"让我们深入探讨"、"以下是您需要了解的" 等，模式 28）
    - 碎片标题删除（标题后紧跟一句重述标题的废话 → 删掉废话行，模式 29）
    - 连字符词对谓语位置去连字符（`the report is high-quality` → `high quality`，保留定语位置连字符，模式 26）
    - 标题 Title Case → 句首大写（模式 17，英文标题适用）
    - 过度限定压缩（"可能潜在地或许会被认为" → "可能"，模式 24）
  - 规则分两类：`deterministic`（正则替换，必命中）和 `pattern-flagged`（命中后标记，交 LLM 重写时处理）
- [ ] `backend/src/modules/humanize/data/humanizer-patterns.ts`：humanizer skill 的**语义级模式清单**（不可正则匹配的，共 15 条），作为 LLM 重写的检测维度参考。含模式编号 + 示例 + 改写方向，供 prompt 引用：
  - 过度强调意义/遗产（模式 1）
  - 过度强调知名度（模式 2）
  - -ing 肤浅分析（模式 3，中文化为"……着/……了"尾缀）
  - 宣传式语言（模式 4）
  - 模糊归因 + weasel words（模式 5）
  - 公式化"挑战与展望"（模式 6）
  - 系动词回避（模式 8，"作为/代表/充当"→"是"）
  - 同义词循环（模式 11）
  - 虚假范围"从 X 到 Y"（模式 12）
  - 被动语态 + 无主语碎片（模式 13，"无需配置文件"→"你不需要配置文件"）
  - 说服性权威套路（模式 27，"真正的问题是"、"核心在于"）
  - diff 锚定写作（模式 30，"此函数被添加以替换..."→描述事物本身）
  - 伪造金句 + 断奏戏剧（模式 31，连续短陈述堆砌戏剧感）
  - 格言公式（模式 32，"X 是 Y 的语言"）
  - 对话式修辞开场（模式 33，"说实话？"、"看这里"作为独立钩子）
- [ ] `backend/src/modules/humanize/data/false-positives.ts`：**误报指引**（来自 skill DETECTION GUIDANCE 章），规则引擎和 LLM 都要遵守：
  - 孤立的单个过渡词不算 AI 痕迹（堆叠才算）
  - 单个短强调句不算断奏戏剧（连续多个才算）
  - 完美语法/一致风格/正式词汇本身不是 AI 信号
  - 人类写作特征应保留（具体罕见的细节/混合感受/时代特定引用/可辩护的第一人称选择/句长变化/真诚的旁白和自我修正）
  - **判断原则**：看 tell 的**集群**而非孤立点（单个破折号无意义，破折号+三段式+充满活力的织锦+结论段 = 认罪）
- [ ] `backend/src/modules/humanize/lib/rule-engine.ts`：规则引擎执行器（输入文本 → 应用 deterministic 规则 → 标记 pattern-flagged 命中 → **强制破折号零容忍扫描** → 输出 { 预处理后文本, 命中规则清单, 待 LLM 处理的语义模式标记, 破折号残留检查 }）
- [ ] `backend/src/modules/humanize/lib/llm-rewriter.ts`：LLM 重写器，**system prompt 融合 humanizer skill v2.8.2 全部原则**：
  - 调 kdoo.ai 或 OpenAI 兼容接口
  - 采用 skill 的 **draft → audit → final 三阶段循环**（system prompt 内引导 LLM 自审）：
    1. draft：初版改写，覆盖原文全部要点，不压缩信息（原文 5 段，改写 5 段）
    2. audit：自问"这段文本为什么还像 AI 生成？"列出残留 tell
    3. final：针对残留 tell 修订，**输出前自扫 `—` `–`，命中即未完成**
  - system prompt 包含（融合设计文档 3.3 章 + humanizer skill v2.8.2）：
    - skill 的 4 条任务原则（识别 AI 模式 / 改写不删除 / 保含义 / 匹配音调）
    - skill 的"个性与灵魂"指引（**带条件启用**：博客/随笔/观点文注入个性；百科/技术/法律/参考文本保持中性——**学术论文属中性偏正式，克制注入个性**）
    - 完整 33 种 AI 模式清单作为检测维度（引用 humanizer-patterns.ts + humanize-rules.ts 的 deterministic）
    - 误报指引（引用 false-positives.ts，避免过度改写破坏合理表达）
    - 设计文档 3.3 章的学术降AI 要求（保学术性 + 注入人类特征 + 句长随机化 + 信息密度不均 + 核心词重复 + 保原意）
    - 规则引擎的 pattern-flagged 标记作为额外提示（"以下段落被标记为[模式X]，重点改写"）
  - **Voice Calibration 支持**（可选）：接口接受 `voiceSample` 字段（用户自己之前的写作样本），LLM 先分析样本的句长/用词/段首/标点/过渡习惯，改写时匹配用户个人风格而非默认中性音调。无样本时回退到默认学术中性音调
  - **自检闭环用 humanizer 的 audit 标准**作为达标判据之一（残留 tell 数 ≤ 阈值 + 破折号零残留 + 学术性评分），不达标回 draft，≤ 3 轮
- [ ] `backend/src/config/llm.config.ts`：LLM 配置（endpoint / apiKey / model）
- [ ] `backend/src/modules/humanize/humanize.service.ts`：编排三阶段：
  1. 规则引擎预处理（deterministic 替换 + pattern-flagged 标记 + 破折号零容忍扫描）
  2. LLM 重写（带预处理后的文本 + 语义模式标记 + humanizer 33 模式维度 prompt + draft→audit→final 自审循环）
  3. 自检闭环：复用 Phase 2 的口癖词检测 + **humanizer audit 标准**（残留 tell 数 + 破折号零残留 + 学术性），不达标回 draft，≤ 3 轮。Phase 2 未就绪时用口癖统计 + 破折号扫描 + tell 计数兜底
- [ ] `backend/src/modules/humanize/humanize.controller.ts`：`POST /api/v1/humanize`（独立接口，不存库）
- [ ] `shared/types/index.ts` 补 `HumanizeRequest` / `HumanizeResponse` DTO
- [ ] `shared/openapi.yaml` 补 `/humanize` 端点定义
- [ ] **前端**：装 `@tanstack/react-query`，`frontend/src/api/humanize.ts` 写 useMutation hook
- [ ] **前端**：HumanizePage 的 `handleGenerate` 从 mock 换成真 API 调用
- [ ] **验收样本集**：`backend/test/fixtures/humanize-samples/` 下 5 段已知 AI 文本（含破折号/排比/模板词）

**验收标准**：
1. `curl -X POST /api/v1/humanize -d '{"text":"<AI文本>"}'` 返回改写后文本 + 改写对照 + 命中规则清单 + 残留 tell 清单 + draft/audit/final 三阶段产物
2. **破折号零容忍硬约束**：改写后输出扫描 `—` `–` `——` `--`，命中数为 **0**（任一残留即该样本未通过）
3. 5 段验收样本跑下来：
   - AI 指纹词（破折号/分号/综上所述/具有重要意义/首先其次最后）频次**下降 > 80%**
   - humanizer 的 33 种模式命中数**下降 > 70%**（规则引擎 + LLM 联合作用）
   - 残留 tell 清单平均每段 ≤ 2 条（audit 阶段 LLM 自报，人工复核）
4. 改写后文本至少包含 1 处第一人称、1 处模糊限定词（人类特征注入）——但**学术论文场景克制使用**，不强制每段都有
5. 规则引擎单独跑（LLM 不调用）应能消除 ≥ 40% 的 AI 痕迹（deterministic 规则的独立价值）+ 破折号 100% 清除
6. 误报指引生效：含具体罕见细节/混合感受/真诚旁白的人类段落，改写后**保留这些人类特征**，不被过度平整化
7. 前端 HumanizePage 点击生成按钮 → 调真后端 → 显示真实改写结果 + 命中规则 + 残留 tell（非 mock）
8. LLM 调用失败时有降级（规则引擎结果仍返回，错误信息清晰，LLM 阶段产物缺失但不阻塞）

**预估**：4-5 天

---

### Phase 2：AIGC 检测模块

**目标**：实现五维 AI 检测特征（困惑度/突发性/口癖词/句法多样性/词汇 TTR），暴露 `/api/v1/detect-ai`。其中困惑度依赖 Python ai-service 的 GPT2-zh。

**依赖**：Phase 0 完成。**可与 Phase 1 并行**（不互相依赖），但 Phase 1 的自检闭环需要 Phase 2 的口癖词检测——所以 Phase 2 的 NestJS 侧特征（口癖/句法/TTR）建议先于 Phase 1 的自检闭环完成。

**交付物**：
- [ ] `backend/src/modules/ai-detection/data/ai-fingerprint-dict.ts`：口癖词词典（设计文档 3.2 章：模板连接词/排比/强调句式/标点指纹/虚化动词 + 人类特征词）
- [ ] `backend/src/modules/ai-detection/lib/burstiness.ts`：句长突发性计算（σ）
- [ ] `backend/src/modules/ai-detection/lib/ttr.ts`：滑动窗口 TTR（窗口 100 字）
- [ ] `backend/src/modules/ai-detection/lib/sentence-stats.ts`：分句 + 句法多样性统计
- [ ] `backend/src/modules/ai-detection/ai-detection.service.ts`：五维加权 AI率计算（权重见设计文档 3.2 章）+ 风险等级判定
- [ ] `backend/src/modules/ai-detection/ai-detection.controller.ts`：`POST /api/v1/detect-ai`
- [ ] **Python**：`ai-service/pyproject.toml` 装 `detect` extras（torch/transformers）
- [ ] `ai-service/app/routers/perplexity.py` + `services/perplexity_service.py`：加载 `uer/gpt2-chinese-cluecorpussmall`，算困惑度 + 突发性
- [ ] `ai-service/app/routers/embed.py` + `services/embedding_service.py`：加载 `BAAI/bge-base-zh-v1.5`（为 Phase 3 查重预备，但 Phase 2 先暴露端点）
- [ ] `backend/src/modules/ai-detection/lib/perplexity.client.ts`：调 Python /perplexity 的封装
- [ ] `shared/` 补 AiDetectionRequest/Response DTO + openapi 端点
- [ ] **前端**：`frontend/src/api/detect.ts`，DetectionPage 换真 API
- [ ] **验收样本集**：`backend/test/fixtures/ai-samples/` 20 段文本（10 段 AI 生成 + 10 段人类写），人工标注 ground truth

**验收标准**：
1. Python `/perplexity` 对中文文本返回 `{ perplexity, burstiness }`
2. Python `/embed` 对中文文本返回 768 维向量
3. `curl -X POST /api/v1/detect-ai -d '{"text":"..."}'` 返回 `{ aiRate, riskLevel, perplexity, burstiness, fingerprintScore, paragraphMarks }`
4. 20 段验收样本：AI 段落 AI率 > 40%，人类段落 AI率 < 30%（即准确率门槛：**20 段里 ≥ 15 段分类正确，整体准确率 ≥ 75%**）
5. 前端 DetectionPage 调真后端显示真实 AI率 + 五维特征

**预估**：5-6 天（Python 模型首次下载占半天）

---

### Phase 3：论文查重模块

**目标**：双层查重（NestJS SimHash 指纹 + Python BERT 语义），冷启动文献库，GB/T 7714 引用识别。

**依赖**：Phase 0 完成 + Phase 2 的 Python /embed 就绪（查重第二层用 bge-base-zh）。

**交付物**：
- [ ] `backend/src/modules/plagiarism/lib/ngram.ts`：5-gram 字符级 shingle
- [ ] `backend/src/modules/plagiarism/lib/simhash.ts`：SimHash 64-bit + 汉明距离
- [ ] `backend/src/modules/plagiarism/lib/text-segment.ts`：按段落 + 滑动窗口切分
- [ ] `backend/src/modules/plagiarism/citation-detector.ts`：GB/T 7714 引用块识别
- [ ] `backend/src/modules/plagiarism/plagiarism.service.ts`：编排双层查重 + 重复率计算（设计文档 3.1 章公式）
- [ ] `backend/src/modules/plagiarism/plagiarism.controller.ts`：`GET /api/v1/papers/:id/plagiarism`
- [ ] Python `/semantic-search`：pgvector 检索封装
- [ ] 冷启动脚本：维基中文 dump + arXiv 中文摘要 → 入 `corpus_fingerprints` 表
- [ ] 装 `@node-rs/jieba` 中文分词
- [ ] `shared/` 补查重 DTO
- [ ] **验收样本集**：5 篇已知重复论文 + 对应来源文本

**验收标准**：
1. 给定一段文本，SimHash 能算出指纹，汉明距离 ≤ 3 能判相似
2. Python `/semantic-search` 能从 pgvector 检出 top-K 相似段落
3. 上传含已知重复的论文 → 标红召回 ≥ 60%（5 篇里重复段落被标出比例）
4. 总相似比 / 复写率 / 引用率三个数字都能算出来
5. GB/T 7714 格式的引用块被正确识别为"引用率"而非"复写率"

**预估**：6-8 天（冷启动文献库抓取耗时）

---

### Phase 4：主流程串联 + 报告生成

**目标**：BullMQ 编排完整工作流（上传 → 查重 → AI检测 → 降AI → 报告），docx 标红报告生成。

**依赖**：Phase 1 + 2 + 3 全部完成。

**交付物**：
- [ ] `backend/src/modules/jobs/check-paper.processor.ts`：BullMQ 主任务处理器，串 5 步
- [ ] `backend/src/modules/workflow/workflow.service.ts`：工作流编排
- [ ] 装 `@nestjs/bullmq` + `bullmq`，接 Redis
- [ ] `POST /api/v1/papers/:id/check` 触发完整流程
- [ ] `GET /api/v1/jobs/:jobId` 返回进度
- [ ] `backend/src/modules/report/lib/docx-marker.ts`：用 `docx` 库生成标红/标注报告
- [ ] `GET /api/v1/papers/:id/reports/:type` 返回 docx 流
- [ ] 降AI 自检闭环接 Phase 2 完整检测（≤ 3 轮迭代）
- [ ] **前端**：补 Dashboard 页（任务列表 + 进度轮询）、报告下载入口

**验收标准**：
1. 上传一篇 docx → 触发 check → BullMQ 任务跑完 5 步无报错
2. `GET /jobs/:jobId` 实时返回 `{ progress, step }`
3. 能下载三份报告 docx：查重标红 / AI段落标注 / 降AI对照
4. 报告 docx 用 Word 打开格式正常，标红/标注可见
5. 降AI 自检：AI率 > 阈值时自动迭代，达标或满 3 轮停止

**预估**：4-5 天

---

### Phase 5（v2，持续）：算法增强

不在本期交付范围，记录待办：
- [ ] Python `/detect-ai` RoBERTa + Binoculars 集成
- [ ] 文献库扩充（CNKI OA + Common Crawl）
- [ ] MGT-Mini 中文检测集成
- [ ] MASH 对抗性改写

---

## 4. 算法实现顺序（三大模块依赖图）

```
Phase 1 降AI ──────────┐
  ├─ 规则引擎 (纯Node) │  ← 无外部依赖，最先做
  ├─ LLM 重写 (HTTP)   │  ← 需 kdoo.ai key
  └─ 自检闭环 ─────────┼── 需 Phase 2 的口癖检测
                       │
Phase 2 AI检测 ────────┤
  ├─ 口癖词统计 (纯Node)│  ← Phase 1 自检依赖它，建议先做
  ├─ 句法/TTR (纯Node) │
  ├─ 突发性 (纯Node)   │
  └─ 困惑度 (Python)   │  ← 需下载 GPT2-zh 模型
                       │
Phase 3 查重 ──────────┘
  ├─ SimHash/ngram (纯Node)
  ├─ 语义比对 (Python bge)  ← 需 Phase 2 的 /embed
  └─ 冷启动文献库          ← 耗时，可与算法并行抓
```

**并行机会**：Phase 1 的规则引擎 + Phase 2 的口癖词统计可以同时开工（都是纯 Node，互不依赖）。

---

## 5. 前后端协同策略

### 契约对齐机制
- **shared/openapi.yaml 是唯一契约源**。后端实现接口前，先在 openapi.yaml 定义端点 → 用 `openapi-typescript` 生成前端类型 → 前后端各自消费。
- `shared/types/index.ts` 当前手写，Phase 0 起改为从 openapi.yaml 自动生成，消除手写漂移。

### mock → 真 API 切换时机
| 前端页面 | 当前状态 | 切换时机 |
|---|---|---|
| HumanizePage | mock (setTimeout 假延时) | Phase 1 后端 `/humanize` 就绪后立即切 |
| DetectionPage | mock | Phase 2 后端 `/detect-ai` 就绪后立即切 |
| Dashboard | 占位符 | Phase 4 任务流就绪后新建 |
| Api/Pricing | 占位符 | 非核心，最后做 |

**原则**：mock 在对应后端接口就绪前**不拆**，保证前端随时可演示。

---

## 6. 测试策略

### 框架选型
| 端 | 框架 | 配置时机 |
|---|---|---|
| frontend | vitest + @testing-library/react | Phase 1 切真 API 时一起搭（测 useMutation hook） |
| backend | jest（NestJS 自带）+ supertest | Phase 0 结束搭（测 papers upload） |
| ai-service | pytest + httpx | Phase 2 装 Python 模型时搭 |

### 算法验收样本（核心）
- 降AI：`backend/test/fixtures/humanize-samples/` 5 段 AI 文本
- AI检测：`backend/test/fixtures/ai-samples/` 20 段（10 AI + 10 人）
- 查重：5 篇已知重复论文 + 来源

样本集**人工标注 ground truth**，测试 agent 验收时跑样本集统计准确率/召回率。

### 测试 agent 介入时机
- 每个 Phase 开发完成后立即介入
- 测试 agent 职责：跑验收标准清单 + 跑样本集 + 报告偏差

---

## 7. 风险清单

| 风险 | 概率 | 对策 |
|---|---|---|
| Docker Desktop 在 Windows 上启动失败/WSL 问题 | 中 | Phase 0 第一步先验证 `docker run hello-world`，失败则排查 WSL2 |
| HuggingFace 模型下载慢/失败（国内网络） | 高 | 设 `HF_ENDPOINT=https://hf-mirror.com`，模型挂卷缓存 |
| LLM 降AI 有天花板（极限 15-25% AI率） | 高 | 文档告知用户；提供"人工介入点"；maxIterations 上限 3 |
| 查重冷启动库小，召回低 | 高 | 定位"初检工具"；自建库随用随长 |
| docx 格式兼容（不同 Word 版本） | 中 | 用成熟 `docx` 库操作 OOXML；提供 .txt 兜底 |
| 前后端类型手写漂移 | 中 | Phase 0 起 openapi.yaml 自动生成类型 |
| Phase 1 自检闭环依赖 Phase 2 口癖检测 | 中 | 调整顺序：Phase 2 口癖词统计先做（见算法依赖图） |

---

## 8. 执行规则（给开发/测试 agent）

1. **严格按 Phase 顺序**，不跳级。Phase 内部子任务可并行（见依赖图）。
2. **每个 Phase 完成必须跑全部验收标准**，任一条不过则不算完成，由测试 agent 复核。
3. **改代码前先读对应模块现有文件**，匹配现有风格（命名/格式/错误处理）。
4. **禁止 `as any` / `@ts-ignore`**，禁止删测试凑通过。
5. **遇到阻塞立即上报**（如模型下载失败、Docker 起不来），不要闷头重试超 3 次。
6. **每完成一个交付物**，更新本文档对应 checkbox 为 `[x]`。

---

## 9. humanizer skill v2.8.2 内置说明

用户要求把 [blader/humanizer](https://github.com/blader/humanizer) skill（v2.8.2，MIT 协议，基于维基百科"Signs of AI writing"由 WikiProject AI Cleanup 维护）的功能内置到项目降AI 模块。该 skill 是一份 prompt 指南（非可执行代码），含 **33 种 AI 写作模式** + 4 条任务原则 + 个性与灵魂指引 + 误报检测指引 + draft→audit→final 三阶段流程。

源 SKILL.md：https://github.com/blader/humanizer/blob/main/SKILL.md

### 内置策略：规则引擎 + LLM prompt + 误报防护 三路融合

skill 的 33 种模式分三路处理：

| 类型 | 处理位置 | 模式（按 skill 编号） |
|---|---|---|
| **确定性匹配**（正则可识别，18 条） | `humanize-rules.ts` 的 `deterministic` 规则 | **14 破折号（硬约束零容忍）**、19 弯引号、10 三段式、9 否定排比+尾随否定、18 表情、15 粗体、16 内联标题列表、7 AI 高频词、23 填充短语、20 协作交流痕迹、21 知识截止+投机填充、22 谄媚语气、25 通用积极结论、28 信号旗宣告、29 碎片标题、26 连字符词对、17 标题 Title Case、24 过度限定 |
| **语义级识别**（需 LLM 判断，15 条） | `humanizer-patterns.ts` 清单 + `llm-rewriter.ts` system prompt | 1 过度强调意义、2 知名度、3 -ing 肤浅分析、4 宣传腔、5 模糊归因、6 公式化挑战展望、8 系动词回避、11 同义词循环、12 虚假范围、13 被动语态+无主语、27 说服性权威套路、30 diff 锚定写作、31 伪造金句+断奏戏剧、32 格言公式、33 对话式修辞开场 |
| **误报防护** | `false-positives.ts`（规则引擎 + LLM 共同遵守） | 孤立过渡词/单破折号/单短句不算 tell；看集群而非孤立点；保留人类写作特征（具体罕见细节/混合感受/时代引用/真诚旁白） |

### 关键升级（相比 v1.0 规划基于的旧中文版）

| 项 | 旧版（v1.0 规划基于） | v2.8.2 原版（本次升级） |
|---|---|---|
| 模式数 | 24 种 | **33 种**（+9 种新型 AI 痕迹） |
| 破折号 | "过度使用"建议替换 | **硬约束零容忍**：输出扫描 `—` `–` 命中即未通过 |
| 流程 | 单次改写 | **draft → audit → final** 三阶段循环（LLM 自审残留 tell） |
| 音调匹配 | 无 | **Voice Calibration**（可选 voiceSample 匹配用户个人风格） |
| 误报防护 | 无 | **DETECTION GUIDANCE 章**：明确不该标记什么，避免过度平整化 |
| 灵魂注入 | 无条件 | **带条件启用**：按内容类型决定是否注入个性（学术→克制） |

### 学术场景适配

skill 原为通用英文（百科/资讯/营销/博客），项目用于**中文学术论文降AI** 时调整：
- 保留学术性（不口语化过度，skill 的"允许混乱/跑题/坦白不确定性"在学术场景克制使用）
- 注入的人类特征以学术口吻的第一人称为主（"笔者认为"/"我们发现"），而非 skill 示例的随性语气
- skill 的"个性与灵魂"按内容类型条件启用：学术论文属"中性偏正式"，默认不注入强个性，但保留句长变化和具体细节
- 中英文差异：-ing 尾缀（模式 3）中文化为"……着/……了"；Title Case（模式 17）仅英文标题适用；破折号中英文都禁

详见 Phase 1 交付物清单。

---

**文档版本**：v1.2 · 2026-07-16（v1.2 按 humanizer skill v2.8.2 原版重写内置方案：33 模式 + 破折号硬约束 + draft→audit→final + Voice Calibration + 误报防护）
**待用户确认后**，开发 agent 从 Phase 0 开始执行。
