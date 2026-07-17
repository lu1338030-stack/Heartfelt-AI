/**
 * PPL 检查器
 *
 * 调 ai-service 的 /perplexity 接口,用本地中文 GPT-2 算困惑度,
 * 判断 LLM 改写后的文本是否还有 AI 特征。
 *
 * 阈值校准(基于真实格子达平台反馈,2025-07):
 *   - PPL ≥ 45:通过(人类区间,推荐安全线 42~55)
 *   - 38-44:可重试(带强 PPL 反馈回 LLM)
 *   - 30-37:勉强,继续重试(成功率低但 DeepSeek 快可以试)
 *   - < 30:硬失败(诚实报错)
 *
 * 向后兼容:ai-service 不可用时降级到只 Node 自检(PPL 字段 undefined)。
 */
import { AiServiceClient } from '../../ai-service/ai-service.client'

// ===== 类型 =====

export interface PplResult {
  ppl: number
  burstiness: number
  sentenceCount: number
}

export interface PplCheckOutput {
  /** PPL 检测结果(undefined = ai-service 不可用,降级模式) */
  result?: PplResult
  /** PPL ≥ passThreshold(45) */
  passed: boolean
  /** PPL < hardFailThreshold(30),不值得重试直接失败 */
  hardFailed: boolean
  /** ai-service 是否可用 */
  available: boolean
}

// ===== 阈值常量(基于真实格子达校准,2025-07) =====

/** 通过阈值(推荐安全区间 42~55,最低可接受 38) */
const PASS_THRESHOLD = 45
/** 硬失败阈值(低于此风险明显上升且重试意义不大) */
const HARD_FAIL_THRESHOLD = 30

// ===== 主函数 =====

/**
 * 检查文本的 PPL
 *
 * @param text 待检测文本
 * @param aiService ai-service 客户端
 * @returns PplCheckOutput
 */
export async function checkPpl(
  text: string,
  aiService: AiServiceClient,
): Promise<PplCheckOutput> {
  try {
    const raw = await aiService.perplexity(text)
    const result: PplResult = {
      ppl: raw.ppl,
      burstiness: raw.burstiness,
      sentenceCount: raw.sentence_count,
    }

    return {
      result,
      passed: result.ppl >= PASS_THRESHOLD,
      hardFailed: result.ppl < HARD_FAIL_THRESHOLD,
      available: true,
    }
  } catch (e) {
    // ai-service 不可用,降级:不阻塞流程,只标记 PPL 不可用
    return {
      result: undefined,
      passed: true,   // 降级时不算失败,让 Node 自检决定
      hardFailed: false,
      available: false,
    }
  }
}

/**
 * 根据 PPL 结果生成给 LLM 的重试提示
 *
 * 基于 librarian 调研的 PPL 提升排序(humanize-chinese v5.0 实证):
 *   1. 句式重构(+15-20):最大收益,改变句子骨架
 *   2. 低频词注入(+10-15):替换高频预测词
 *   3. 句长随机化(+5-10):打破均匀分布
 *   4. n-gram 打散(+3-8):破坏常用搭配
 *
 * 针对不同 PPL 区间给不同强度的提示。
 */
export function buildPplRetryHint(ppl: number): string {
  // 距离目标线的差距决定提示强度
  const gap = PASS_THRESHOLD - ppl

  if (gap <= 5) {
    // 38-44:接近达标,微调即可
    return `困惑度 PPL=${ppl.toFixed(1)},目标 ≥ ${PASS_THRESHOLD},差距 ${gap.toFixed(1)}。
当前文本可预测性偏高,GPT-2 仍能猜中很多词。**只需轻度调整**:
- 把 2-3 个高频词换成低频同义词(如"显著"→"明显地/颇为","重要"→"关键/要紧","研究"→"考察/探讨","表明"→"印证/揭示")
- 把一句长句拆成两短句,或把两短句合成一长句(任意 1 处即可)
- 不要改变内容,只改"怎么说"`
  }

  if (gap <= 15) {
    // 30-37:差距中等,需要中度调整
    return `困惑度 PPL=${ppl.toFixed(1)},目标 ≥ ${PASS_THRESHOLD},差距 ${gap.toFixed(1)}(中等)。
当前文本仍有明显 AI 痕迹,需要**中度改写**提升不可预测性:
- **句式重构(收益最大)**:至少 2 处改变句子骨架
  · 主被动转换("研究发现X" ↔ "X被发现")
  · 语序调整(宾语前置/状语后置)
  · 长短句拆合
- **低频词替换**:把 4-6 个高频预测词换成罕见同义词
  · "发展"→"演进/流变/衍化"
  · "影响"→"波及/牵动/作用机制"
  · "问题"→"症结/瓶颈/痛点"
  · "需要"→"亟须/离不开/有赖于"
- **句长随机化**:确保段内有极短句(8-12字)和长句(30-45字)交替`
  }

  // gap > 15:差距大,需要重度改写
  return `困惑度 PPL=${ppl.toFixed(1)},目标 ≥ ${PASS_THRESHOLD},差距 ${gap.toFixed(1)}(较大)。
当前文本 AI 痕迹很重,需要**彻底重写句子结构**:
- **句式重构(必须,收益最大 +15-20)**:整段每句都换骨架
  · 主被动互换
  · 因果倒置(先说结果再说原因)
  · 长句拆短、短句合长
  · 删除连接词"因此/所以/由于",改用语义衔接
- **低频词注入(必须,+10-15)**:把所有高频词都换掉
  · 避免"研究/表明/重要/影响/发展/问题/需要/通过/实现/提高"这十大 AI 最爱词
  · 用更具体、更书面、更不常见的同义词
- **打散常用搭配(n-gram)**:不要用"随着...的发展""在...方面""基于...的分析"这些模板
- **句长大幅波动**:极短句(5-10字)+ 长句(35-50字)交替出现
- 保持原文意思和专业术语不变,只改表达方式`
}
