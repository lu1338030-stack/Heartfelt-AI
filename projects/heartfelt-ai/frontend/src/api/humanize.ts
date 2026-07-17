import { apiClient } from './client'
import type { HumanizeRequest, HumanizeResponse } from './types'

/**
 * POST /api/v1/humanize
 *
 * 降AI 改写。后端三阶段流水线(分段 → 规则引擎 → LLM 重写 → 自检)。
 * 单次请求可能跑 30-90 秒(取决于段数和重试轮数)。
 *
 * client.ts 默认 timeout 30s 不够,这里单独覆盖为 180s。
 */
export async function humanize(req: HumanizeRequest): Promise<HumanizeResponse> {
  const { data } = await apiClient.post<HumanizeResponse>('/humanize', req, {
    timeout: 180_000,
  })
  return data
}
