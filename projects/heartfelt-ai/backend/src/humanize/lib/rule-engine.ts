/**
 * 规则引擎执行器
 *
 * 流程见 plan/humanize-module.md §3.4:
 *   1. 先跑 FLAGGED_RULES 标记(不改动文本,记录位置 + hint)
 *   2. 再跑 DETERMINISTIC_RULES 替换(改动文本,统计命中数)
 *   3. 最后扫破折号残留(应 = 0)
 *
 * flagged 先跑:它的正则匹配原始位置,deterministic 替换后位置会漂移。
 */

import {
  DETERMINISTIC_RULES,
  FLAGGED_RULES,
} from '../data/humanize-rules'

// ===== 输出类型 =====

export interface RuleHit {
  ruleId: string
  count: number
  reason: string
}

export interface FlagHit {
  patternName: string
  positions: number[]
  hint: string
}

export interface RuleEngineResult {
  /** 规则替换后的文本 */
  preprocessedText: string
  /** deterministic 规则命中记录 */
  hits: RuleHit[]
  /** flagged 模式标记 */
  flags: FlagHit[]
  /** 破折号残留(规则后扫描,应为 0;非 0 说明规则有遗漏) */
  dashResidual: number
}

// ===== 主函数 =====

/**
 * 运行规则引擎
 * @param text 原始段文本
 * @returns RuleEngineResult
 */
export function runRuleEngine(text: string): RuleEngineResult {
  // 1. flagged 先跑(不改动 text,记录位置)
  const flags = runFlaggedRules(text)

  // 2. deterministic 替换(改动 text)
  const { preprocessedText, hits } = runDeterministicRules(text)

  // 3. 扫破折号残留
  const dashResidual = countDash(preprocessedText)

  return {
    preprocessedText,
    hits,
    flags,
    dashResidual,
  }
}

// ===== flagged 规则执行 =====

/**
 * 跑 FLAGGED_RULES,返回所有标记
 * 用 regex.exec() 循环拿所有匹配的起始位置
 */
function runFlaggedRules(text: string): FlagHit[] {
  const flags: FlagHit[] = []

  for (const rule of FLAGGED_RULES) {
    const positions: number[] = []
    // 复制正则(带 g flag),exec 会维护 lastIndex
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags)

    let match: RegExpExecArray | null
    let safetyCounter = 0
    while ((match = regex.exec(text)) !== null) {
      positions.push(match.index)
      // 防止零宽匹配死循环
      if (match.index === regex.lastIndex) {
        regex.lastIndex++
      }
      if (++safetyCounter > 1000) break // 安全阀
    }

    if (positions.length > 0) {
      flags.push({
        patternName: rule.patternName,
        positions,
        hint: rule.hint,
      })
    }
  }

  return flags
}

// ===== deterministic 规则执行 =====

/**
 * 跑 DETERMINISTIC_RULES,逐条替换并统计命中数
 */
function runDeterministicRules(text: string): {
  preprocessedText: string
  hits: RuleHit[]
} {
  let current = text
  const hits: RuleHit[] = []

  for (const rule of DETERMINISTIC_RULES) {
    // 先统计命中数(在替换前)
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags)
    const matchCount = (current.match(regex) || []).length

    if (matchCount > 0) {
      // 替换
      current = current.replace(rule.pattern, rule.replace as never)
      hits.push({
        ruleId: rule.id,
        count: matchCount,
        reason: rule.reason,
      })
    }
  }

  return { preprocessedText: current, hits }
}

// ===== 工具函数 =====

/** 统计破折号数(em dash, en dash, 中文破折号) */
function countDash(text: string): number {
  return (text.match(/[—–——]/g) || []).length
}

/**
 * 提取所有 flagged 的 hint(扁平化)
 * 给 llm-rewriter 用,拼成 system prompt 第 7 层
 */
export function extractFlaggedHints(flags: FlagHit[]): string[] {
  return flags.map(f => f.hint)
}
