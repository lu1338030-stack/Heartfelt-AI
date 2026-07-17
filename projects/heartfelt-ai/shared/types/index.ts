/**
 * Heartfelt AI · 前后端共享类型定义
 *
 * 这些类型与 backend DTO 对齐。
 * 当前手写；后续可从 shared/openapi.yaml 通过 openapi-typescript 自动生成。
 */

// ===== 健康检查 =====

export interface Liveness {
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

export interface Readiness {
  status: 'ok' | 'degraded'
  service: string
  timestamp: string
  checks: {
    database: ReadinessCheck
    ai_service: ReadinessCheck
  }
}

// ===== 论文（v1+ 占位） =====

export interface Paper {
  id: string
  userId: string
  filename: string
  charCount: number
  status: 'pending' | 'processing' | 'done' | 'failed'
  uploadedAt: string
}

/**
 * POST /papers/upload 的响应
 * 与 backend src/papers/dto/paper.dto.ts 的 PaperUploadResponseDto 对齐
 */
export interface PaperUploadResponse {
  paperId: string
  charCount: number
}

/**
 * GET /papers/:id 的响应（与 Paper 同结构；单独定义以便从 API 视角命名）
 */
export type PaperRecord = Paper

// ===== 查重结果（v1+ 占位） =====

export interface PlagiarismResult {
  paperId: string
  totalSimilarity: number // R 值
  copyRate: number // 复写率
  citationRate: number // 引用率
  redSpans: RedSpan[]
  sources: SimilarSource[]
}

export interface RedSpan {
  start: number
  end: number
  text: string
  sourceIds: string[]
}

export interface SimilarSource {
  id: string
  title: string
  url?: string
  similarity: number
}

// ===== AI 检测结果（v1+ 占位） =====

export interface AiDetectionResult {
  paperId: string
  aiRate: number // 0-100
  riskLevel: 'low' | 'medium' | 'high'
  perplexity?: number
  burstiness?: number
  paragraphMarks: ParagraphMark[]
}

export interface ParagraphMark {
  paragraphIndex: number
  label: 'sxaigc' | 'qaigc' | 'caigc' | 'daigc' | 'eaigc'
  score: number
}

// ===== 降AI 结果（v1+ 占位） =====

export interface HumanizeResult {
  paperId: string
  iterations: HumanizeIteration[]
}

export interface HumanizeIteration {
  iteration: number
  beforeAiRate: number
  afterAiRate: number
  changedSpans: Array<{ before: string; after: string }>
}

// ===== 降AI 结果（Phase 1 实现） =====
// 与 backend HumanizeResponseDto 对齐

/** POST /humanize 请求体 */
export interface HumanizeRequest {
  text?: string
  paperId?: string
  scenario?: 'academic' | 'blog' | 'opinion'
  maxRetries?: number
}

/** POST /humanize 响应 */
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
  /** 突发性(句长方差) */
  pplBurstiness?: number
  /** PPL 是否通过(≥ 35) */
  pplPassed?: boolean
  /** PPL 失败标记(需人工干预) */
  pplFailed?: boolean
  /** ai-service 是否可用 */
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
  /** 平均 PPL(ai-service 不可用时为 undefined) */
  avgPpl?: number
  /** PPL 通过率 0-1 */
  pplPassRate?: number
  /** 是否有段 PPL 失败(需人工干预) */
  hasPplFailure?: boolean
}

export interface HumanizeBeforeAfter {
  dashCount: { before: number; after: number }
  aiVocabCount: { before: number; after: number }
  templateConnectorCount: { before: number; after: number }
  firstPersonDensity: { before: number; after: number }
}
