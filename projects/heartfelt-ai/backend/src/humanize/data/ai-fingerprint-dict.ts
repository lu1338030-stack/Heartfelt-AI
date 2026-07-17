/**
 * AI 口癖词词典 + 统计函数
 *
 * 用于:
 *   1. 规则引擎的 deterministic 替换(见 humanize-rules.ts 的 ai-vocab-* 规则)
 *   2. 自检闭环的 aiVocabPer1k 统计(见 audit-loop.ts)
 *
 * 来源:
 *   - humanizer skill v2.8.2 中文化适配
 *   - 格子达实测高危词清单(3 个同现即触发 AI 腔判定)
 *
 * Phase 2 就绪后,这个词典可升级为"低困惑度词频次"统计,但结构不变。
 */

/**
 * 自检用的 AI 口癖词清单(格子达高危 + humanizer 中文适配)
 * 注意:这里只列"需要统计"的词;能直接正则替换的进 humanize-rules.ts
 */
export const AI_FINGERPRINT_WORDS: readonly string[] = [
  // 模板连接词(规则引擎会替换一部分,自检兜底统计残留)
  '此外',
  '综上所述',
  '值得注意的是',
  '首先',
  '其次',
  '最后',
  '与此同时',
  '在此基础上',
  '进一步而言',
  '总而言之',
  '换言之',
  // 高频 AI 腔词
  '赋能',
  '助力',
  '打造',
  '护航',
  '抓手',
  '闭环',
  '底层逻辑',
  '全方位',
  '多维度',
  '全链路',
  '至关重要',
  '不可磨灭',
  '显著影响',
  '具有重要意义',
  '具有重要价值',
  '具有重要地位',
  // 谄媚/对话腔
  '众所周知',
  '不言而喻',
  '显而易见',
  // 宣传腔
  '革命性',
  '颠覆性',
  '划时代',
  '里程碑式',
  '开创性',
] as const

/**
 * 统计文本中 AI 口癖词出现频次(每千字)
 *
 * @param text 待检测文本
 * @returns 每千字命中数(浮点)。人类文本 < 1,AI 文本通常 > 5
 */
export function countAiVocabPer1k(text: string): number {
  if (text.length === 0) return 0
  let hits = 0
  for (const word of AI_FINGERPRINT_WORDS) {
    // 全文计数(重叠也算,用 indexOf 滚动)
    let idx = 0
    while ((idx = text.indexOf(word, idx)) !== -1) {
      hits++
      idx += word.length
    }
  }
  return (hits / text.length) * 1000
}

/**
 * 统计文本中 AI 口癖词的绝对命中数(用于 beforeAfter 对比)
 */
export function countAiVocab(text: string): number {
  let hits = 0
  for (const word of AI_FINGERPRINT_WORDS) {
    let idx = 0
    while ((idx = text.indexOf(word, idx)) !== -1) {
      hits++
      idx += word.length
    }
  }
  return hits
}
