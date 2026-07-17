import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'

/**
 * 降AI 请求/响应 DTO
 * 对应 plan/humanize-module.md §5
 *
 * 端点:POST /api/v1/humanize
 */

// ===== 请求 DTO =====

export class HumanizeRequestDto {
  /** 直接传文本(与 paperId 二选一,text 优先) */
  @IsOptional()
  @IsString()
  @MinLength(50)
  @MaxLength(50000)
  text?: string

  /** 已上传论文 ID(从 DB + MinIO 取原文) */
  @IsOptional()
  @IsString()
  paperId?: string

  /** 场景,决定个性注入强度。默认 academic */
  @IsOptional()
  @IsEnum(['academic', 'blog', 'opinion'])
  scenario?: 'academic' | 'blog' | 'opinion'

  /** 自检最多重试轮数(不含初次),默认 4(DeepSeek V3 快,可多试) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries?: number

  /**
   * 个性化上下文(Grok 6 维度方案维度 5:内容个性化,prompt v1.2.0+)
   *
   * 可选。作者本人的背景/立场/经验/写作偏好,会被 Layer 8 编织进改写,
   * 让文本带上作者独有的视角痕迹,解决"形式都对但读起来空洞"这一顽疾。
   *
   * 不传时行为完全等同 v1.1.1(向后兼容)。
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  personalContext?: string
}

// ===== 响应 DTO =====

export class HumanizeRuleHitDto {
  @IsString()
  ruleId: string

  count: number

  @IsString()
  reason: string
}

export class HumanizeFlaggedPatternDto {
  @IsString()
  patternName: string

  @IsString()
  hint: string
}

export class HumanizeAuditDto {
  /** 破折号残留(目标 0) */
  dashResidual: number
  /** AI 口癖词每千字(目标 < 3) */
  aiVocabPer1k: number
  /** 句长变异系数(目标 > 0.45) */
  sentenceLengthSigma: number
  /** 是否通过 */
  passed: boolean
  /** 不通过的原因 */
  failedReasons: string[]
}

export class HumanizeParagraphResultDto {
  index: number
  originalText: string
  preprocessedText: string
  rewrittenText: string
  ruleHits: HumanizeRuleHitDto[]
  flaggedPatterns: HumanizeFlaggedPatternDto[]
  auditResult: HumanizeAuditDto
  tokensUsed: number
  rounds: number

  // ===== PPL 反馈循环字段(Phase 2,见 plan/ppl-feedback-loop.md) =====
  /** 该段最终输出文本的困惑度(ai-service 不可用时为 undefined) */
  @IsOptional()
  ppl?: number

  /** 突发性(句长方差,人类文本通常 > AI 文本) */
  @IsOptional()
  pplBurstiness?: number

  /** PPL 是否通过(≥ 35 阈值)。ai-service 不可用时为 undefined */
  @IsOptional()
  pplPassed?: boolean

  /** PPL 失败标记(硬失败 < 25 或重试耗尽仍未达标)。true = 需要人工干预 */
  @IsOptional()
  pplFailed?: boolean

  /** ai-service 是否可用(false = 降级到纯 Node 自检,PPL 字段无意义) */
  @IsOptional()
  pplAvailable?: boolean
}

export class HumanizeSummaryDto {
  totalParagraphs: number
  totalTokensUsed: number
  totalRounds: number
  overallPassed: boolean
  promptVersion: string
  scenario: string
  processingMs: number

  // ===== PPL 汇总 =====
  /** 所有段 PPL 的平均值(ai-service 不可用时为 undefined) */
  @IsOptional()
  avgPpl?: number

  /** 通过 PPL 阈值的段数 / 总段数(ai-service 不可用时为 undefined) */
  @IsOptional()
  pplPassRate?: number

  /** 是否有段 PPL 失败(需人工干预) */
  @IsOptional()
  hasPplFailure?: boolean
}

export class HumanizeBeforeAfterDto {
  dashCount: { before: number; after: number }
  aiVocabCount: { before: number; after: number }
  templateConnectorCount: { before: number; after: number }
  firstPersonDensity: { before: number; after: number }
}

export class HumanizeResponseDto {
  rewrittenText: string
  originalText: string
  paragraphs: HumanizeParagraphResultDto[]
  summary: HumanizeSummaryDto
  beforeAfter: HumanizeBeforeAfterDto
}
