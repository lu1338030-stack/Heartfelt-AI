/**
 * kdoo.ai Coder 调用
 *
 * 调 OpenAI 兼容的 /chat/completions 端点,用 Coder 推理模型改写文本。
 * 见 plan/humanize-module.md §1.3(实测确认)和 §4(prompt 设计)。
 *
 * 实测细节:
 *   - system role 支持
 *   - reasoning_content 字段暴露思考过程(跟 DeepSeek R1 一样)
 *   - temperature 0.6 是推荐值
 *   - max_tokens 4096 够单段用(含 reasoning token)
 */

import axios from 'axios'
import {
  buildSystemPrompt,
  Scenario,
} from '../data/system-prompt'

// ===== 类型 =====

export interface RewriteInput {
  /** 预处理后的待改写文本 */
  text: string
  scenario: Scenario
  /** 规则引擎 flagged 标记 */
  flaggedHints?: string[]
  /** 重试时带上的"上次哪里没过"(来自 audit-loop) */
  retryHint?: string
  /**
   * 个性化上下文(Grok 6 维度方案维度 5,prompt v1.2.0+)
   * 透传给 buildSystemPrompt 的 Layer 8。为空时该层不注入。
   */
  personalContext?: string
  /** LLM 配置(由 service 注入,避免直接读 process.env) */
  config: LlmConfig
}

export interface RewriteOutput {
  /** 最终改写文本 */
  content: string
  /** reasoning_content(思考过程,可能为空) */
  reasoning: string
  /** 本次调用 token 总数 */
  tokensUsed: number
}

/**
 * LLM 配置
 * 由 HumanizeService 从 ConfigService 注入
 */
export interface LlmConfig {
  baseURL: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  /** 频率惩罚(0-2,惩罚已出现的词,强制词汇多样性,降 PPL) */
  frequencyPenalty?: number
  /** 核采样(0-1,聚焦高概率词;配合高温使用能减少乱码) */
  topP?: number
}

// ===== kdoo.ai 响应类型(OpenAI 兼容 + reasoning_content 扩展) =====

interface KdooMessage {
  role: string
  content: string
  /** 推理模型的思考过程(DeepSeek R1 路径) */
  reasoning_content?: string
}

interface KdooResponse {
  choices: Array<{
    message: KdooMessage
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ===== 主函数 =====

/**
 * 调 kdoo.ai Coder 改写文本
 *
 * @throws axios 错误(网络/超时/HTTP 4xx 5xx)直接抛,service 层处理
 */
export async function rewrite(input: RewriteInput): Promise<RewriteOutput> {
  const { config } = input

  const systemPrompt = buildSystemPrompt({
    scenario: input.scenario,
    flaggedHints: input.flaggedHints,
    personalContext: input.personalContext,
  })

  // 组装 user message
  // 末尾追加"输出格式警告":kdoo Coder 推理模型有概率把英文分析塞进 content,
  // 这里再强调一次,虽然不是 100% 可靠(代码层 extractChineseRewrite 兜底)
  const formatWarning =
    '\n\n---\n⚠️ 输出硬约束:你的回复有时会把英文分析过程("Let me..." "The user...")误塞进正文 content 字段,这是严重 bug。请确保 message.content 里只有最终的中文改写段落,没有任何英文、任何分析、任何数字编号列表。所有思考过程必须放到 reasoning_content 字段。'

  const userContent = input.retryHint
    ? `上一轮改写未通过自检,问题:${input.retryHint}。请在此基础上修复,只输出改写后的完整文本。

${input.text}${formatWarning}`
    : `${input.text}${formatWarning}`

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    // 频率惩罚:强制模型避免重复用词,增加词汇多样性(降 PPL)
    // 实测 0.3-0.5 区间有效,太高会导致语法错误
    ...(config.frequencyPenalty !== undefined
      ? { frequency_penalty: config.frequencyPenalty }
      : {}),
    // 核采样:配合高温,聚焦核心词汇分布,减少乱码
    ...(config.topP !== undefined ? { top_p: config.topP } : {}),
    // 不 stream,普通请求/响应
    stream: false,
  }

  const { data } = await axios.post<KdooResponse>(
    `${config.baseURL}/chat/completions`,
    body,
    {
      timeout: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  )

  const choice = data.choices?.[0]
  if (!choice) {
    // kdoo 认证/限流错误会返回 { code, message, type } 结构而非 choices
    const errMsg = (data as unknown as { message?: string })?.message
    throw new Error(
      `kdoo.ai 返回空 choices: ${errMsg ?? '模型无输出'}`,
    )
  }

  return {
    content: extractChineseRewrite(choice.message.content ?? ''),
    reasoning: choice.message.reasoning_content ?? '',
    tokensUsed: data.usage?.total_tokens ?? 0,
  }
}

// ===== 后处理:剥离混入 content 的英文分析段 =====

/**
 * kdoo Coder 推理模型有 ~10-20% 概率把思考过程(本该进 reasoning_content)
 * 误塞进 message.content。导致前端输出框显示一大坨草稿/英文/分析。
 *
 * 观察到的污染模式(见 polluted_1.txt 实证):
 *   1. 带引号包裹的草稿: "在业务边界..." "权限上..."(LLM 反复打磨的版本)
 *   2. 项目符号分析行: - Pattern 7 / - No "此外" / 1. xxx / 2. xxx
 *   3. 英文思考行: Let me try: / Let me analyze /
 *   4. 原文引用行: 模型把 input 又复述一遍(带或不带引号)
 *   5. 真正的最终输出在末尾:无引号、无项目符号、连续中文段
 *
 * 算法:
 *   1. 按行扫描,扔掉污染行
 *   2. 剩余的"干净中文行"按连续性合并
 *   3. 取最后一个连续段(草稿都在前面,最终版在后面)
 *
 * 边界情况:
 *   - 纯净输出(正常 case):无污染行,直接返回原文
 *   - 全是污染(极端):返回空串,让 audit 兜底失败 → 重试
 */
function extractChineseRewrite(raw: string): string {
  // 快速路径:几乎没英文字母 + 没引号包裹 + 没项目符号 → 直接返回
  const letterCount = (raw.match(/[a-zA-Z]/g) || []).length
  const hasQuoteDraft = /"[^"]{20,}"/.test(raw) || /"[^"]{20,}"/.test(raw)
  const hasBullet = /^[ \t]*([-*•]|\d+\.)\s+/m.test(raw)
  if (letterCount < 20 && !hasQuoteDraft && !hasBullet) {
    return raw.trim()
  }

  const lines = raw.split(/\r?\n/)

  // 污染行判定
  const isPollutedLine = (line: string): boolean => {
    const t = line.trim()
    if (!t) return false // 空行不判定,在合并阶段处理

    // (a) 带弯引号或直引号包裹的草稿("..." 或 "..." 或 """开头)
    if (/^["""''].*["""'']$/.test(t) && t.length > 20) return true
    if (/^[""']/.test(t) && t.length > 30) return true

    // (b) 项目符号开头(-、*、•、数字.)
    if (/^([-*•]|\d+\.)\s+/.test(t)) return true

    // (c) 英文思考标志(行首)
    if (/^(Let me|Let's|The user|The original|Pattern\s+\d|Here is|Here's|I'll|I will|First,|Second,|Third,|Finally,|Overall|In summary|To rewrite|After|Before|Now|So|Then|Next|Also|However|But |And |Or |My rewrite|Original|Rewrite|Draft|Version)\s*[:']?/i.test(t)) return true

    // (c') 任何 "xx:" 英文标签开头(My rewrite: / Original: / Revised: / Draft N: 等)
    // 标签单独成行(冒号后无内容)也算
    if (/^[A-Z][a-zA-Z\s]{2,20}:\s*$/.test(t)) return true
    if (/^[A-Z][a-zA-Z\s]{2,20}:\s+\S/.test(t)) return true

    // (d) 包含特定分析标志(即使中文开头,但有 "Pattern" "let me" 等也扔)
    if (/(Pattern\s+\d|let me|i'll try|版本\d|草稿\d)/i.test(t)) return true

    // (d') 数字编号模式:中文字符紧贴 (数字),如 "系(1)统(2)" - 模型在数字符
    // 出现 ≥ 3 次就肯定是污染
    if ((t.match(/[\u4e00-\u9fff]\(\d+\)/g) || []).length >= 3) return true

    // (e) 纯英文行(字母为主,无中文)
    const alnum = (t.match(/[a-zA-Z]/g) || []).length
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length
    if (alnum > 10 && cjk === 0) return true

    return false
  }

  // 给每行打标签
  const tagged = lines.map(line => {
    const t = line.trim()
    if (!t) return { line, type: 'blank' as const }
    if (isPollutedLine(line)) return { line, type: 'polluted' as const }

    // 剩下的视为"干净中文行"
    const alnum = (t.match(/[a-zA-Z]/g) || []).length
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length
    return { line, type: 'clean' as const, cjk, alnum }
  })

  // 合并连续 clean 行成段,blank 作为段分隔
  const segments: string[] = []
  let cur: string[] = []
  const flush = () => {
    if (cur.length > 0) {
      const seg = cur.join('\n').trim()
      if (seg) segments.push(seg)
      cur = []
    }
  }
  for (const { line, type } of tagged) {
    if (type === 'clean') {
      cur.push(line)
    } else if (type === 'blank') {
      // 空行:如果在 clean 段里,作为段内换行保留
      if (cur.length > 0) cur.push('')
    } else {
      // polluted:终结当前段
      flush()
    }
  }
  flush()

  if (segments.length === 0) {
    // 极端:全是污染,返回原文让 audit 兜底
    return raw.trim()
  }

  // 多段时取**最长**的那段
  // 实证(见 polluted_1.txt):真正的最终改写是连续完整段落,最长;
  // 原文复述往往被截断;草稿带引号已被过滤掉。
  // 边界:若多段长度接近(<10% 差异),取靠后的(模型倾向于后打磨的版本)
  if (segments.length === 1) return segments[0]

  const sorted = segments
    .map((s, i) => ({ s, i, len: s.length }))
    .sort((a, b) => b.len - a.len)

  // 最长段比第二名长 10% 以上 → 明确取最长
  if (sorted[0].len > sorted[1].len * 1.1) {
    return sorted[0].s
  }
  // 否则在"最长几个(差距 <10%)"里取**最后出现**的(模型反复打磨后的版本)
  const topGroup = sorted.filter(x => x.len >= sorted[0].len * 0.9)
  topGroup.sort((a, b) => b.i - a.i) // 按原序号倒序
  return topGroup[0].s
}
