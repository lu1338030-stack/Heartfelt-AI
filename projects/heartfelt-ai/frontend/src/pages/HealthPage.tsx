import { useEffect, useState } from 'react'
import { Activity, RefreshCw, Heart, Database, Cpu } from 'lucide-react'
import { GlassPanel } from '../components/ui/GlassPanel'
import { getLiveness, getReadiness } from '../api/health'
import type { HealthLiveness, HealthReadiness } from '../api/types'

/**
 * 健康检查页（调试用），路由 /health。
 * 主页是 /，这里是开发期探针。
 */
export function HealthPage() {
  const [liveness, setLiveness] = useState<HealthLiveness | null>(null)
  const [readiness, setReadiness] = useState<HealthReadiness | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [l, r] = await Promise.all([
        getLiveness().catch((e) => ({ error: e.message })),
        getReadiness().catch((e) => ({ error: e.message })),
      ])
      if ('error' in l) setError(l.error)
      else setLiveness(l)
      if ('error' in r) setError((prev) => prev || r.error)
      else setReadiness(r)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-md">
      <div className="w-full max-w-2xl space-y-md">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-on-surface">Heartfelt AI</h1>
              <p className="text-sm font-mono text-on-surface-variant">健康检查 · 调试页</p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-gradient rounded-lg px-md py-2 text-on-primary font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </header>

        {error && (
          <GlassPanel className="rounded-xl border border-error p-md">
            <p className="text-error font-mono text-sm">⚠ Backend 连接失败：{error}</p>
            <p className="text-on-surface-variant text-sm mt-2">
              确认 backend 已启动：cd backend && pnpm start:dev
            </p>
          </GlassPanel>
        )}

        <GlassPanel className="rounded-xl p-md">
          <div className="flex items-center gap-2 mb-sm">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Liveness</h2>
            {liveness && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-tertiary text-on-tertiary">
                {liveness.status.toUpperCase()}
              </span>
            )}
          </div>
          {liveness ? (
            <dl className="grid grid-cols-2 gap-2 text-sm font-mono">
              <dt className="text-on-surface-variant">service</dt>
              <dd className="text-on-surface">{liveness.service}</dd>
              <dt className="text-on-surface-variant">uptime</dt>
              <dd className="text-on-surface">{liveness.uptime.toFixed(1)}s</dd>
              <dt className="text-on-surface-variant">timestamp</dt>
              <dd className="text-on-surface text-xs">{liveness.timestamp}</dd>
            </dl>
          ) : (
            <p className="text-on-surface-variant text-sm">等待数据...</p>
          )}
        </GlassPanel>

        <GlassPanel className="rounded-xl p-md">
          <div className="flex items-center gap-2 mb-sm">
            <Cpu className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Readiness</h2>
            {readiness && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  readiness.status === 'ok'
                    ? 'bg-tertiary text-on-tertiary'
                    : 'bg-secondary text-on-secondary'
                }`}
              >
                {readiness.status.toUpperCase()}
              </span>
            )}
          </div>
          {readiness ? (
            <div className="space-y-sm">
              <CheckRow
                icon={<Database className="w-4 h-4" />}
                name="PostgreSQL"
                check={readiness.checks.database}
              />
              <CheckRow
                icon={<Cpu className="w-4 h-4" />}
                name="AI Service (FastAPI)"
                check={readiness.checks.ai_service}
              />
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">等待数据...</p>
          )}
        </GlassPanel>
      </div>
    </div>
  )
}

function CheckRow({
  icon,
  name,
  check,
}: {
  icon: React.ReactNode
  name: string
  check: { status: string; latency_ms?: number; error?: string }
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-on-surface">
        {icon}
        <span className="font-mono">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {check.latency_ms !== undefined && (
          <span className="text-on-surface-variant text-xs font-mono">{check.latency_ms}ms</span>
        )}
        <span
          className={`px-2 py-0.5 rounded-full text-xs ${
            check.status === 'up'
              ? 'bg-tertiary text-on-tertiary'
              : 'bg-error text-on-error'
          }`}
        >
          {check.status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}
