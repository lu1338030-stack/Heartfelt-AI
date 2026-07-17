import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Paper } from '../entities/paper.entity'
import { StorageService } from '../storage/storage.service'
import { AiServiceClient, AnalyzeResponse } from '../ai-service/ai-service.client'
import { segment, Paragraph } from './lib/segment'
import {
  runRuleEngine,
  RuleEngineResult,
  extractFlaggedHints,
} from './lib/rule-engine'
import { audit, AuditOutput } from './lib/audit-loop'
import { rewrite, RewriteOutput, LlmConfig } from './lib/llm-rewriter'
import { PROMPT_VERSION, Scenario } from './data/system-prompt'
import { countAiVocab } from './data/ai-fingerprint-dict'
import {
  checkPpl,
  buildPplRetryHint,
  PplCheckOutput,
} from './lib/ppl-checker'
import {
  HumanizeRequestDto,
  HumanizeResponseDto,
  HumanizeParagraphResultDto,
  HumanizeAuditDto,
  HumanizeSummaryDto,
  HumanizeBeforeAfterDto,
} from './dto/humanize.dto'

/**
 * 降AI 业务服务
 *
 * 三阶段流水线(见 plan/humanize-module.md §2.1):
 *   1. 分段器 segment.ts
 *   2. 规则引擎 rule-engine.ts(纯 Node,预处理)
 *   3. LLM 重写 llm-rewriter.ts(调 DeepSeek V3)
 *   + 自检闭环 audit-loop.ts(不达标回 LLM 重试)
 *   + PPL 反馈循环 ppl-checker.ts(本地 GPT-2 困惑度,每轮检查,Best-of-N 选优)
 *
 * 分段是串行预处理(快),段内三阶段是并行执行(Promise.all 所有段)。
 */
@Injectable()
export class HumanizeService {
  private readonly logger = new Logger(HumanizeService.name)
  private readonly llmConfig: LlmConfig

  constructor(
    @InjectRepository(Paper) private readonly papers: Repository<Paper>,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly aiService: AiServiceClient,
  ) {
    // 从 ConfigService 读 env(NestJS ConfigModule 注入),组装 LlmConfig
    // temperature 默认 1.3(高随机性降 PPL,DeepSeek V3 实测最优)
    // frequency_penalty 0.4:强制词汇多样性,避免高频 AI 词
    // top_p 0.95:配合高温,聚焦核心词汇分布
    const temperature = Number(this.config.get<string>('OPENAI_TEMPERATURE') ?? '1.3')
    this.llmConfig = {
      baseURL: this.config.get<string>('OPENAI_BASE_URL') ?? 'https://api.deepseek.com/v1',
      apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '',
      model: this.config.get<string>('OPENAI_MODEL') ?? 'deepseek-chat',
      temperature: Number.isFinite(temperature) ? temperature : 1.3,
      maxTokens: 4096,
      frequencyPenalty: 0.3,
      topP: 0.95,
      // DeepSeek V3 一般 2-5s,留余量
      // 可通过 OPENAI_TIMEOUT_MS 环境变量覆盖
      timeoutMs: Number(this.config.get<string>('OPENAI_TIMEOUT_MS') ?? '60000'),
    }
  }

  /**
   * 降AI 主入口
   */
  async humanize(dto: HumanizeRequestDto): Promise<HumanizeResponseDto> {
    const startedAt = Date.now()

    // 1. 参数校验:text 和 paperId 二选一
    if (!dto.text && !dto.paperId) {
      throw new BadRequestException('text 和 paperId 至少提供一个')
    }

    // 2. 取原文
    const scenario: Scenario = dto.scenario ?? 'academic'
    // 默认 4 轮重试(DeepSeek V3 每轮 ~4s,5 轮共 ~20s,UX 可接受)
    // 之前 kdoo Coder 每轮 60s 只敢设 2 轮
    const maxRetries = dto.maxRetries ?? 4
    const { originalText, paper } = await this.resolveOriginalText(dto)

    this.logger.log(
      `humanize start: scenario=${scenario} chars=${originalText.length} retries=${maxRetries}`,
    )

    // 3. 分段
    const paragraphs = segment(originalText)
    if (paragraphs.length === 0) {
      throw new BadRequestException('文本为空或分段后无有效内容')
    }

    // 4. 并行处理每一段(三阶段 + 自检闭环)
    const personalContext = dto.personalContext
    const paragraphResults = await Promise.all(
      paragraphs.map(para =>
        this.processParagraph(para, scenario, maxRetries, personalContext).catch(err => {
          // 单段失败不阻塞整体,返回带 error 标记的结果
          this.logger.error(
            `段落 ${para.index} 处理失败: ${(err as Error).message}`,
          )
          throw err // 向上抛,由 controller 兜底转 502
        }),
      ),
    )

    // 5. 拼回完整文本
    const rewrittenText = paragraphResults.map(p => p.rewrittenText).join('\n\n')

    // 6. 汇总
    const totalTokensUsed = paragraphResults.reduce(
      (sum, p) => sum + p.tokensUsed,
      0,
    )
    const totalRounds = paragraphResults.reduce(
      (sum, p) => sum + p.rounds,
      0,
    )
    const overallPassed = paragraphResults.every(p => p.auditResult.passed)

    // PPL 汇总(仅当 ai-service 可用且至少一段有 PPL 数据)
    const pplSegments = paragraphResults.filter(
      p => p.pplAvailable !== false && typeof p.ppl === 'number',
    )
    const avgPpl =
      pplSegments.length > 0
        ? pplSegments.reduce((sum, p) => sum + (p.ppl ?? 0), 0) /
          pplSegments.length
        : undefined
    const pplPassRate =
      pplSegments.length > 0
        ? pplSegments.filter(p => p.pplPassed === true).length /
          pplSegments.length
        : undefined
    const hasPplFailure = paragraphResults.some(p => p.pplFailed === true)

    const summary: HumanizeSummaryDto = {
      totalParagraphs: paragraphResults.length,
      totalTokensUsed,
      totalRounds,
      overallPassed,
      promptVersion: PROMPT_VERSION,
      scenario,
      processingMs: Date.now() - startedAt,
      avgPpl,
      pplPassRate,
      hasPplFailure,
    }

    // 7. beforeAfter 指标对比
    const beforeAfter = this.computeBeforeAfter(
      originalText,
      rewrittenText,
    )

    this.logger.log(
      `humanize done: paragraphs=${paragraphResults.length} passed=${overallPassed} tokens=${totalTokensUsed} ms=${summary.processingMs}` +
        (avgPpl !== undefined
          ? ` avgPpl=${avgPpl.toFixed(1)} pplPassRate=${pplPassRate!.toFixed(2)}`
          : '') +
        (hasPplFailure ? ' [PPL_FAILURE]' : ''),
    )

    return {
      rewrittenText,
      originalText,
      paragraphs: paragraphResults,
      summary,
      beforeAfter,
    }
  }

  // ===== 单段处理(三阶段 + 自检闭环 + PPL 反馈) =====

  private async processParagraph(
    para: Paragraph,
    scenario: Scenario,
    maxRetries: number,
    personalContext?: string,
  ): Promise<HumanizeParagraphResultDto> {
    // 阶段 1:预处理 - 优先走 Python /analyze(Node 兜底)
    //
    // Phase 5 重构(见 plan/refactor-python-llm-hybrid.md):
    //   - 优先调 ai-service 的 /analyze,一次性完成:
    //     规则引擎 + jieba 词级替换 + 自检指标 + LLM 精准 hint
    //   - Python 不可用时降级到 Node 的 rule-engine + audit-loop
    //
    // 保留 Node 实现是为了:
    //   1. 兜底(Python 服务挂了不影响业务)
    //   2. 平滑迁移(对比测试期可同时跑两套)
    let preprocessedText: string
    let flaggedHints: string[]
    let pythonAnalyze: AnalyzeResponse | undefined

    try {
      pythonAnalyze = await this.aiService.analyze(para.text, {
        scenario,
        doPreprocess: true,
        doVocabReplace: true,
        doPpl: false, // 预处理阶段不查 PPL,后续每轮再查
      })
      preprocessedText = pythonAnalyze.preprocessed_text
      // 优先用 Python 生成的精准 hint(句子级 + 词汇级)
      // 不只是 flagged 的 hint
      flaggedHints = [
        ...pythonAnalyze.llm_hints.text_hints,
        ...pythonAnalyze.llm_hints.sentence_hints,
        ...pythonAnalyze.llm_hints.vocab_hints,
      ]
      this.logger.debug(
        `段落 ${para.index} 走 Python /analyze 预处理: ` +
          `rules=${pythonAnalyze.rule_hits.length} ` +
          `flags=${pythonAnalyze.flags.length} ` +
          `hints=${flaggedHints.length} ` +
          `vocab_replaced=${pythonAnalyze.vocab_replace?.replacements.length ?? 0}`,
      )
    } catch (e) {
      // 兜底:Python 不可用,走 Node 旧逻辑
      this.logger.warn(
        `Python /analyze 失败,降级到 Node rule-engine: ${(e as Error).message}`,
      )
      const ruleResult: RuleEngineResult = runRuleEngine(para.text)
      preprocessedText = ruleResult.preprocessedText
      flaggedHints = extractFlaggedHints(ruleResult.flags)
    }

    // 阶段 2 + 3:LLM 重写 + 自检闭环
    // PPL 反馈循环(见 plan/ppl-feedback-loop.md):
    //   - Node 自检通过后,再调 PPL 检查
    //   - PPL 不达标 → 把 PPL 反馈塞进 retryHint 让 LLM 重写
    //   - 跨轮追踪 PPL 最高的版本(Best-of-N 模式,见 librarian 调研)
    let currentText = preprocessedText
    let llmResult: RewriteOutput | undefined
    let auditResult: AuditOutput | undefined
    let pplCheck: PplCheckOutput | undefined
    let rounds = 0
    const maxRounds = maxRetries + 1 // 总轮数 = 初次 + 重试

    // 追踪"最佳版本":Node 自检 + PPL 综合最优
    // 策略:优先取 audit.passed && pplPassed 的版本;否则取 PPL 最高的 passed 版本;再否则取 audit.passed 版本
    let bestVersion: {
      text: string
      llm: RewriteOutput
      audit: AuditOutput
      ppl?: PplCheckOutput
      rounds: number
      score: number  // 排序用:passed 状态权重高,PPL 次之
    } | undefined

    do {
      rounds++

      // 合成 retryHint:合并 audit + PPL 两路反馈
      let retryHint: string | undefined
      if (rounds > 1 && auditResult) {
        const hints: string[] = []
        if (!auditResult.passed && auditResult.retryHint) {
          hints.push(auditResult.retryHint)
        }
        // PPL 不达标且 ai-service 可用 → 追加 PPL 反馈
        if (
          pplCheck &&
          !pplCheck.passed &&
          pplCheck.available &&
          pplCheck.result
        ) {
          hints.push(buildPplRetryHint(pplCheck.result.ppl))
        }
        retryHint = hints.length > 0 ? hints.join('; ') : undefined
      }

      llmResult = await rewrite({
        text: currentText,
        scenario,
        flaggedHints,
        retryHint,
        personalContext,
        config: this.llmConfig,
      })

      auditResult = audit({
        rewrittenText: llmResult.content,
        reasoningContent: llmResult.reasoning,
      })

      // 每轮都查 PPL(不依赖 audit.passed)
      // 理由:PPL 是格子达 40% 权重维度,需要每轮数据来选最佳版本(Best-of-N);
      //       即使 audit 失败,用户也需要看到 PPL 信号;PPL 调用 ~200ms,相对 LLM 30s+ 可忽略
      pplCheck = await checkPpl(llmResult.content, this.aiService)

      this.logger.debug(
        `段落 ${para.index} 第 ${rounds} 轮: audit.passed=${auditResult.passed}` +
          (pplCheck.available
            ? ` ppl=${pplCheck.result?.ppl?.toFixed(1) ?? 'N/A'} pplPassed=${pplCheck.passed}`
            : ' ppl=unavailable'),
      )

      // 更新最佳版本
      // Score 分层设计(层级越高优先级越高,同层按 PPL 值排序):
      //   Tier 3 (300万+): audit ✅ + PPL ✅  —— 理想版本
      //   Tier 2 (200万+): PPL ✅(audit 可能 ✗)—— PPL 达标是降AI核心目标,优先于 audit 小瑕疵
      //   Tier 1 (100万+): audit ✅ + PPL 未达标 —— 至少没硬伤
      //   Tier 0 (0+):     都未达标 —— 按 PPL 排,选个相对好的
      // 同层内按 PPL 值排序(PPL 越高越好)
      // 注:之前 audit 权重 100万 >> PPL 10万,导致 audit ✅ 但 PPL=27 的版本
      //     被选中,而 audit ✗ 但 PPL=53 的版本被忽略 —— 这是 PPL 通过率低的主因
      const pplValue = pplCheck?.result?.ppl ?? -1
      const pplPassed = pplCheck?.passed ?? false
      const auditPassed = auditResult.passed
      let tier: number
      if (auditPassed && pplPassed) {
        tier = 3
      } else if (pplPassed) {
        tier = 2
      } else if (auditPassed) {
        tier = 1
      } else {
        tier = 0
      }
      // PPL 可能是 -1(ai-service 不可用),加 1000 保证非负
      const score = tier * 1_000_000 + (pplValue + 1000)
      if (!bestVersion || score > bestVersion.score) {
        bestVersion = {
          text: llmResult.content,
          llm: llmResult,
          audit: auditResult,
          ppl: pplCheck,
          rounds,
          score,
        }
      }

      // 决定是否继续重试
      const stillFailed =
        !auditResult.passed || (!!pplCheck && !pplCheck.passed)
      if (stillFailed && rounds < maxRounds) {
        // 重试时把 currentText 换成 LLM 上一轮输出,让它在自己的基础上修
        // 实证:始终基于上一轮输出效果最好(PPL 52.4 avg, 70% 通过率)
        //       交替回原文重试反而破坏效果(降到 43.8 avg, 40% 通过率)
        currentText = llmResult.content
      } else {
        break
      }
    } while (rounds < maxRounds)

    // 兜底:循环结束后用最佳版本
    const finalLlm = bestVersion!.llm
    const finalAudit = bestVersion!.audit
    const finalPpl = bestVersion!.ppl

    // 诚实报错:用 ppl-checker 的判定(避免硬编码阈值)
    // - pplHardFailed: PPL < 30(硬失败,重试无意义)
    // - pplExhausted: ai-service 可用但重试耗尽仍未过 45(30-44 区间耗尽)
    const pplHardFailed =
      !!finalPpl?.available &&
      !!finalPpl.result &&
      finalPpl.hardFailed
    const pplExhausted =
      !!finalPpl?.available &&
      !finalPpl.passed &&
      !pplHardFailed

    return {
      index: para.index,
      originalText: para.text,
      preprocessedText: preprocessedText,
      rewrittenText: finalLlm.content,
      // Python 路径用 pythonAnalyze 的数据,Node 兜底用 ruleResult
      // 注:DTO 字段名保持不变(前端兼容)
      ruleHits: pythonAnalyze
        ? pythonAnalyze.rule_hits.map(h => ({
            ruleId: h.rule_id,
            count: h.count,
            reason: h.reason,
          }))
        : runRuleEngine(para.text).hits.map(h => ({
            ruleId: h.ruleId,
            count: h.count,
            reason: h.reason,
          })),
      flaggedPatterns: pythonAnalyze
        ? pythonAnalyze.flags.map(f => ({
            patternName: f.pattern_name,
            hint: f.hint,
          }))
        : runRuleEngine(para.text).flags.map(f => ({
            patternName: f.patternName,
            hint: f.hint,
          })),
      auditResult: this.auditToDto(finalAudit),
      tokensUsed: finalLlm.tokensUsed,
      rounds,
      ppl: finalPpl?.result?.ppl,
      pplBurstiness: finalPpl?.result?.burstiness,
      pplPassed: finalPpl ? finalPpl.passed : undefined,
      pplFailed: pplHardFailed || pplExhausted || undefined,
      pplAvailable: finalPpl?.available,
    }
  }

  // ===== 原文解析 =====

  /**
   * 从 dto 解析原文
   * - text 优先
   * - paperId 从 DB 查 → MinIO 取 .docx → mammoth 抽文本
   */
  private async resolveOriginalText(
    dto: HumanizeRequestDto,
  ): Promise<{ originalText: string; paper: Paper | null }> {
    if (dto.text) {
      return { originalText: dto.text, paper: null }
    }

    // paperId 模式
    const paperId = dto.paperId!
    const paper = await this.papers.findOneBy({ id: paperId })
    if (!paper) {
      throw new NotFoundException(`论文 '${paperId}' 不存在`)
    }

    // 从 MinIO 取 .docx
    const buffer = await this.storage.get(paper.objectKey)
    const originalText = await this.extractDocxText(buffer)
    return { originalText, paper }
  }

  /**
   * mammoth 抽 .docx 文本
   */
  private async extractDocxText(buffer: Buffer): Promise<string> {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }

  // ===== beforeAfter 计算 =====

  private computeBeforeAfter(
    original: string,
    rewritten: string,
  ): HumanizeBeforeAfterDto {
    return {
      dashCount: {
        before: this.countDash(original),
        after: this.countDash(rewritten),
      },
      aiVocabCount: {
        before: countAiVocab(original),
        after: countAiVocab(rewritten),
      },
      templateConnectorCount: {
        before: this.countTemplateConnectors(original),
        after: this.countTemplateConnectors(rewritten),
      },
      firstPersonDensity: {
        before: this.countFirstPerson(original),
        after: this.countFirstPerson(rewritten),
      },
    }
  }

  /** 统计破折号数 */
  private countDash(text: string): number {
    return (text.match(/[—–——]/g) || []).length
  }

  /** 统计模板连接词(首先/其次/最后/此外/综上所述/值得注意的是) */
  private countTemplateConnectors(text: string): number {
    const connectors = [
      '首先',
      '其次',
      '最后',
      '此外',
      '综上所述',
      '值得注意的是',
      '与此同时',
    ]
    let count = 0
    for (const c of connectors) {
      let idx = 0
      while ((idx = text.indexOf(c, idx)) !== -1) {
        count++
        idx += c.length
      }
    }
    return count
  }

  /** 统计第一人称密度(笔者/我们/本研究 出现次数) */
  private countFirstPerson(text: string): number {
    const firstPerson = ['笔者', '我们', '本研究', '本文']
    let count = 0
    for (const p of firstPerson) {
      let idx = 0
      while ((idx = text.indexOf(p, idx)) !== -1) {
        count++
        idx += p.length
      }
    }
    return count
  }

  /** AuditOutput → DTO 转换 */
  private auditToDto(a: AuditOutput): HumanizeAuditDto {
    return {
      dashResidual: a.dashResidual,
      aiVocabPer1k: a.aiVocabPer1k,
      sentenceLengthSigma: a.sentenceLengthSigma,
      passed: a.passed,
      failedReasons: a.failedReasons,
    }
  }
}
