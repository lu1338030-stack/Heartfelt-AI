/**
 * API 类型定义。
 * 后续会从 shared/ 目录自动生成（基于 OpenAPI），现在手写占位。
 */

export interface HealthLiveness {
  status: 'ok'
  service: string
  timestamp: string
  uptime: number
}

export interface ReadinessCheck {
  status: 'up' | 'down'
  latency_ms?: number
  error?: string
}

export interface HealthReadiness {
  status: 'ok' | 'degraded'
  service: string
  timestamp: string
  checks: {
    database: ReadinessCheck
    ai_service: ReadinessCheck
  }
}

export interface AiServiceHealth {
  status: 'ok'
  service: string
  models_loaded: Record<string, boolean>
  timestamp: string
}

// ===== 降AI(Phase 1) =====

export interface HumanizeRequest {
  text?: string
  paperId?: string
  scenario?: 'academic' | 'blog' | 'opinion'
  maxRetries?: number
}

export interface HumanizeResponse {
  rewrittenText: string
  originalText: string
  paragraphs: HumanizeParagraphResult[]
  summary: HumanizeSummary
  beforeAfter: HumanizeBeforeAfter
}

export interface HumanizeParagraphResult {
  index: number
  originalText: string
  preprocessedText: string
  rewrittenText: string
  ruleHits: Array<{ ruleId: string; count: number; reason: string }>
  flaggedPatterns: Array<{ patternName: string; hint: string }>
  auditResult: HumanizeAudit
  tokensUsed: number
  rounds: number
  /** 该段最终输出文本的困惑度(ai-service 不可用时为 undefined) */
  ppl?: number
  pplBurstiness?: number
  pplPassed?: boolean
  pplFailed?: boolean
  pplAvailable?: boolean
}

export interface HumanizeAudit {
  dashResidual: number
  aiVocabPer1k: number
  sentenceLengthSigma: number
  passed: boolean
  failedReasons: string[]
}

export interface HumanizeSummary {
  totalParagraphs: number
  totalTokensUsed: number
  totalRounds: number
  overallPassed: boolean
  promptVersion: string
  scenario: string
  processingMs: number
  /** 平均 PPL */
  avgPpl?: number
  /** PPL 通过率 0-1 */
  pplPassRate?: number
  /** 是否有段 PPL 失败 */
  hasPplFailure?: boolean
}

export interface HumanizeBeforeAfter {
  dashCount: { before: number; after: number }
  aiVocabCount: { before: number; after: number }
  templateConnectorCount: { before: number; after: number }
  firstPersonDensity: { before: number; after: number }
}
