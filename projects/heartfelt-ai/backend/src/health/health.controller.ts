import { Controller, Get, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'
import { AiServiceClient } from '../ai-service/ai-service.client'

/**
 * 健康检查控制器
 * 实际路径（走全局前缀 /api/v1）：
 *   GET /api/v1/health        - Liveness
 *   GET /api/v1/health/ready  - Readiness
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)
  private readonly pg: Pool

  constructor(
    private readonly config: ConfigService,
    private readonly aiService: AiServiceClient,
  ) {
    // 轻量探测：骨架期 TypeORM 模块未挂载，直接用 pg Pool 探一下连接
    this.pg = new Pool({
      host: config.get('POSTGRES_HOST', 'localhost'),
      port: Number(config.get('POSTGRES_PORT', 5432)),
      user: config.get('POSTGRES_USER', 'heartfelt'),
      password: config.get('POSTGRES_PASSWORD', 'heartfelt_dev'),
      database: config.get('POSTGRES_DB', 'heartfelt'),
      max: 1,
      connectionTimeoutMillis: 2000,
    })
  }

  /** Liveness：进程存活 */
  @Get()
  liveness() {
    return {
      status: 'ok',
      service: 'heartfelt-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  }

  /** Readiness：依赖可用性（DB + AI Service） */
  @Get('ready')
  async readiness() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkAiService(),
    ])
    const [dbResult, aiResult] = checks
    const db = this.unwrap(dbResult)
    const ai = this.unwrap(aiResult)
    const allOk = db.status === 'up' && ai.status === 'up'
    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'heartfelt-backend',
      timestamp: new Date().toISOString(),
      checks: { database: db, ai_service: ai },
    }
  }

  private unwrap<T>(r: PromiseSettledResult<T>): T & { status: string } {
    if (r.status === 'fulfilled') return r.value as any
    const reason = (r as PromiseRejectedResult).reason
    return { status: 'down', error: String(reason?.message || reason) } as any
  }

  private async checkDatabase() {
    const start = Date.now()
    let client
    try {
      client = await this.pg.connect()
      await client.query('SELECT 1')
      return { status: 'up', latency_ms: Date.now() - start }
    } catch (e) {
      return { status: 'down', error: (e as Error).message }
    } finally {
      client?.release()
    }
  }

  private async checkAiService() {
    const start = Date.now()
    try {
      await this.aiService.health()
      return { status: 'up', latency_ms: Date.now() - start }
    } catch (e) {
      return { status: 'down', error: (e as Error).message }
    }
  }
}
