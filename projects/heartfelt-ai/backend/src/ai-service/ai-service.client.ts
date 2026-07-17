import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

/**
 * Python AI Service (FastAPI) 客户端
 * 负责后端 → 算法微服务 的所有 HTTP 调用
 *
 * 当前骨架仅实现 /health；后续会加：
 *   POST /embed           - 文本向量化
 *   POST /perplexity      - 困惑度 + 突发性
 *   POST /detect-ai       - AI 文本检测
 *   POST /semantic-search - 向量库检索
 */
@Injectable()
export class AiServiceClient {
  private readonly logger = new Logger(AiServiceClient.name)
  private readonly http: AxiosInstance

  constructor(private readonly config: ConfigService) {
    const baseURL = config.get<string>('AI_SERVICE_URL', 'http://localhost:8000')
    this.http = axios.create({
      baseURL,
      timeout: 60_000, // 模型推理可能慢
    })
    this.logger.log(`AI Service client initialized → ${baseURL}`)
  }

  /** 健康检查 */
  async health(): Promise<{
    status: string
    service: string
    models_loaded: Record<string, boolean>
    timestamp: string
  }> {
    const { data } = await this.http.get('/health')
    return data
  }

  // ===== 后续业务接口（v1+ 实现） =====

  /** 文本向量化（bge-base-zh） */
  async embed(text: string | string[]): Promise<number[][]> {
    const { data } = await this.http.post('/embed', { text })
    return data.embeddings
  }

  /** 困惑度 + 突发性(gpt2-chinese)
   * 响应字段与 ai-service PerplexityResponse 对齐:
   *   - ppl: 困惑度
   *   - burstiness: 突发性
   *   - sentence_count: 句子数
   */
  async perplexity(text: string): Promise<{
    ppl: number
    burstiness: number
    sentence_count: number
  }> {
    const { data } = await this.http.post('/perplexity', { text })
    return data
  }

  /** AI 文本检测（RoBERTa + Binoculars，v2） */
  async detectAi(text: string): Promise<{
    ai_rate: number
    risk_level: string
    details: Record<string, number>
  }> {
    const { data } = await this.http.post('/detect-ai', { text })
    return data
  }

  /** 向量库检索 */
  async semanticSearch(query: string, topK = 10): Promise<
    Array<{ id: string; score: number; segment_text: string; source_title?: string }>
  > {
    const { data } = await this.http.post('/semantic-search', { query, top_k: topK })
    return data.matches
  }
}
