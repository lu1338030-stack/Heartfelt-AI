import { registerAs } from '@nestjs/config'

/**
 * LLM 配置(kdoo.ai OpenAI 兼容 endpoint)
 * Phase 1 降AI 模块用。读取 .env 里的 OPENAI_* 变量。
 *
 * 实测确认(2026-07-16):
 *   - baseURL: https://www.kdoo.ai/api/v1
 *   - model: Coder(推理模型,暴露 reasoning_content 字段)
 *   - system role 支持
 *   - temperature 0.6 是 DeepSeek R1 推荐值
 */
export const LLM_CONFIG_KEY = 'llm'

export default registerAs(LLM_CONFIG_KEY, () => ({
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://www.kdoo.ai/api/v1',
  apiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.OPENAI_MODEL ?? 'Coder',
  /** DeepSeek R1 路径推理模型推荐 0.6(实测改写效果最佳) */
  temperature: 0.6,
  /** 单段改写 4096 足够(含 reasoning token);超长段会先被 segment.ts 切分 */
  maxTokens: 4096,
  /** 单次 LLM 调用超时;推理模型可能慢,给足 60s */
  timeoutMs: 60_000,
}))
