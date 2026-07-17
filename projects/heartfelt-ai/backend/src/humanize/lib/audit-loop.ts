/**
 * 自检闭环
 *
 * 跑在每一段 LLM 输出上,不达标回 LLM 重试。
 * 见 plan/humanize-module.md §6:
 *   - 破折号残留 = 0(硬约束,一票否决)
 *   - AI 口癖词频次 < 3/千字(软指标)
 *   - 句长变异系数 > 0.45(软指标,接近人类 0.45-0.7)
 *
 * 纯 Node,零 LLM 成本。
 */

import { countAiVocabPer1k } from '../data/ai-fingerprint-dict'

// ===== 类型 =====

export interface AuditInput {
  /** LLM 改写后的文本 */
  rewrittenText: string
  /** LLM 思考过程(可选,目前只作参考不参与硬判定) */
  reasoningContent?: string
}

export interface AuditOutput {
  /** 破折号残留数(目标 0) */
  dashResidual: number
  /** AI 口癖词每千字命中数(目标 < 3) */
  aiVocabPer1k: number
  /** 句长变异系数 σ/均值(目标 > 0.45) */
  sentenceLengthSigma: number
  /** 是否通过自检 */
  passed: boolean
  /** 不通过的原因(空数组 = 通过) */
  failedReasons: string[]
  /** 给下一轮 LLM 的提示(不通过时填) */
  retryHint?: string
}

// ===== 阈值常量 =====

/** 破折号残留上限(硬约束) */
const DASH_MAX = 0
/** AI 口癖词每千字上限 */
const AI_VOCAB_PER_1K_MAX = 3
/** 句长变异系数下限 */
const SENTENCE_SIGMA_MIN = 0.45
/** 句长检查的最小文本长度(太短不算) */
const SIGMA_CHECK_MIN_LENGTH = 100

// ===== 主函数 =====

/**
 * 自检
 * @param input LLM 输出
 * @returns AuditOutput
 */
export function audit(input: AuditInput): AuditOutput {
  const text = input.rewrittenText

  const dashResidual = countDash(text)
  const aiVocabPer1k = countAiVocabPer1k(text)
  const sentenceLengthSigma =
    text.length >= SIGMA_CHECK_MIN_LENGTH
      ? calcSentenceLengthSigma(text)
      : 1.0 // 文本太短时跳过检查,给默认通过值

  const failedReasons: string[] = []

  if (dashResidual > DASH_MAX) {
    failedReasons.push(
      `破折号残留 ${dashResidual} 处(必须为 0)`,
    )
  }
  if (aiVocabPer1k >= AI_VOCAB_PER_1K_MAX) {
    failedReasons.push(
      `AI 口癖词 ${aiVocabPer1k.toFixed(1)}/千字(目标 < ${AI_VOCAB_PER_1K_MAX})`,
    )
  }
  if (
    sentenceLengthSigma <= SENTENCE_SIGMA_MIN &&
    text.length >= SIGMA_CHECK_MIN_LENGTH
  ) {
    failedReasons.push(
      `句长变异系数 ${sentenceLengthSigma.toFixed(2)}(目标 > ${SENTENCE_SIGMA_MIN})`,
    )
  }

  const passed = failedReasons.length === 0
  const retryHint = passed ? undefined : failedReasons.join('; ')

  return {
    dashResidual,
    aiVocabPer1k,
    sentenceLengthSigma,
    passed,
    failedReasons,
    retryHint,
  }
}

// ===== 工具函数 =====

/**
 * 计算句长变异系数(σ / 均值)
 *
 * 归一化标准差,消除文本长度影响。人类文本约 0.45-0.7,AI 文本约 0.12-0.25。
 *
 * @param text 待检测文本
 * @returns 变异系数;句子太少(< 3)返回 0
 */
export function calcSentenceLengthSigma(text: string): number {
  // 按中英文句末标点分句
  const sentences = text
    .split(/[。!?!?\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  if (sentences.length < 3) return 0 // 句子太少不算

  const lengths = sentences.map(s => s.length)
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length

  if (mean === 0) return 0

  const variance =
    lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length

  return Math.sqrt(variance) / mean
}

/** 统计破折号数(em dash, en dash, 中文破折号) */
function countDash(text: string): number {
  return (text.match(/[—–——]/g) || []).length
}
