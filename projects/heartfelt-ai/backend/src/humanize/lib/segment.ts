/**
 * 分段器
 *
 * 把全文切成适合 LLM 单次处理的段落。
 * 策略见 plan/humanize-module.md §2.3:
 *   - 按自然段落切(双换行或单换行分隔)
 *   - 超长段落(≥ 800 字):按 500 字滑窗切分,带 50 字 overlap
 *   - 短段落(< 50 字):合并到相邻段
 *   - 空段跳过
 */

export interface Paragraph {
  /** 段落序号,从 0 开始 */
  index: number
  text: string
  charCount: number
}

/** 短段合并阈值:小于此字数的段合并到相邻段 */
const SHORT_THRESHOLD = 50
/** 超长段切分阈值:大于等于此字数的段需要滑窗切分 */
const LONG_THRESHOLD = 800
/** 滑窗大小 */
const WINDOW_SIZE = 500
/** 滑窗 overlap */
const OVERLAP = 50

/**
 * 分段
 * @param text 全文(已去除首尾空白)
 * @returns Paragraph[],index 从 0 递增
 */
export function segment(text: string): Paragraph[] {
  if (!text || text.trim().length === 0) return []

  // 1. 按自然段落初切(双换行优先,其次单换行)
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .flatMap(p => p.split('\n'))
    .map(p => p.trim())
    .filter(p => p.length > 0)

  // 2. 超长段滑窗切分
  const splitParagraphs: string[] = []
  for (const para of rawParagraphs) {
    if (para.length >= LONG_THRESHOLD) {
      splitParagraphs.push(...splitLongParagraph(para))
    } else {
      splitParagraphs.push(para)
    }
  }

  // 3. 短段合并到相邻段(向后合并)
  const merged: string[] = []
  for (const para of splitParagraphs) {
    if (para.length < SHORT_THRESHOLD && merged.length > 0) {
      // 合并到上一段(用空格连接,保持可读性)
      merged[merged.length - 1] = merged[merged.length - 1] + ' ' + para
    } else if (para.length < SHORT_THRESHOLD && merged.length === 0) {
      // 第一段就太短,先存着等下一段合并;或者如果它是唯一段,直接保留
      merged.push(para)
    } else {
      merged.push(para)
    }
  }

  // 4. 如果最后剩一个超短段(没合到任何段),并入前一段
  if (merged.length >= 2) {
    const last = merged[merged.length - 1]
    if (last.length < SHORT_THRESHOLD) {
      merged[merged.length - 2] = merged[merged.length - 2] + ' ' + last
      merged.pop()
    }
  }

  // 5. 输出 Paragraph[]
  return merged.map((text, index) => ({
    index,
    text,
    charCount: text.length,
  }))
}

/**
 * 超长段落滑窗切分
 * @param para 超长段(≥ 800 字)
 * @returns 切分后的段数组(每段约 500 字,带 50 字 overlap)
 */
function splitLongParagraph(para: string): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < para.length) {
    const end = Math.min(start + WINDOW_SIZE, para.length)
    let chunk = para.slice(start, end)

    // 如果不是最后一块,尝试在句末标点处切(避免切断句子)
    if (end < para.length) {
      // 从 end 往前找最近的句末标点
      const sentenceEnd = findLastSentenceEnd(chunk)
      if (sentenceEnd > WINDOW_SIZE * 0.5) {
        // 找到合理的句末,在那里切
        chunk = para.slice(start, start + sentenceEnd)
        start = start + sentenceEnd - OVERLAP
      } else {
        // 没找到合理句末,硬切 + overlap
        start = end - OVERLAP
      }
    } else {
      // 最后一块
      start = end
    }

    chunks.push(chunk.trim())
    // 防止 overlap 导致死循环(start 没前进)
    if (start <= chunks.length * (WINDOW_SIZE - OVERLAP)) {
      start = chunks.length * (WINDOW_SIZE - OVERLAP) + 1
    }
  }

  return chunks.filter(c => c.length > 0)
}

/**
 * 在 chunk 里从后往前找最近的句末标点位置(。!?)
 * 返回标点后的位置(即切分点);没找到返回 0
 */
function findLastSentenceEnd(chunk: string): number {
  for (let i = chunk.length - 1; i >= WINDOW_SIZE * 0.5; i--) {
    if (/[。!?!?]/.test(chunk[i])) {
      return i + 1
    }
  }
  return 0
}
