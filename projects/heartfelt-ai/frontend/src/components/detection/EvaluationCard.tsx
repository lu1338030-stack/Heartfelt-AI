import { Icon } from '../ui/Icon'

/**
 * AI 概率评估卡片。对应原型 code.html 行 231-288。
 * 左侧：环形图（conic-gradient 画圆环）+ AI 概率大数字。
 * 右侧：3条概率进度条（人类/AI/混合）+ 置信度。
 *
 * 未检测时所有数值显示 --，环形图灰色。
 * 检测后由父组件传入 result 填充。
 */

interface Result {
  aiProbability: number
  humanProbability: number
  mixedProbability: number
  confidence: number
}

interface Props {
  result: Result | null
}

/** 进度条子组件 */
function ProgressBar({
  label,
  value,
  colorClass,
  barClass,
}: {
  label: string
  value: number | null
  colorClass: string
  barClass: string
}) {
  const pct = value !== null ? `${value}%` : '--%'
  const width = value !== null ? `${value}%` : '0%'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-on-surface-variant">{label}</span>
        <span className={`${colorClass} font-mono font-bold`}>{pct}</span>
      </div>
      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barClass}`} style={{ width }} />
      </div>
    </div>
  )
}

export function EvaluationCard({ result }: Props) {
  const hasResult = result !== null
  // 环形图：检测后用 conic-gradient 按 AI 概率画弧
  const ringStyle = hasResult
    ? {
        background: `conic-gradient(from 0deg, #89ceff 0%, #89ceff ${result!.aiProbability}%, #1e293b ${result!.aiProbability}%, #1e293b 100%)`,
      }
    : undefined

  return (
    <div className="bg-surface-container-low rounded-xl p-lg glow-border flex flex-col lg:flex-row gap-lg items-center relative overflow-hidden">
      {/* 右上角模型标签 */}
      <div className="absolute top-0 right-0 p-6 flex gap-2">
        <span className="text-xs text-on-surface-variant">检测模型:</span>
        <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
          SpeedAI-v3.2
        </span>
      </div>

      {/* 环形图区域 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="flex items-center gap-2 text-primary font-medium mb-8 self-start w-full">
          <Icon name="analytics" />
          AI 生成概率评估
        </div>
        <div className="relative w-48 h-48 ring-chart flex items-center justify-center mb-6" style={ringStyle}>
          <div className="z-10 flex flex-col items-center">
            <span className="text-display-lg font-display-lg text-on-surface font-mono">
              {hasResult ? `${result!.aiProbability.toFixed(1)}%` : '--'}
            </span>
            <span className="text-xs text-on-surface-variant mt-1">AI 概率</span>
          </div>
        </div>
        <div className="text-sm text-on-surface-variant bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
          {hasResult ? '检测完成' : '等待检测'}
        </div>
      </div>

      {/* 指标区域 */}
      <div className="flex-1 flex flex-col gap-6 w-full">
        <ProgressBar
          label="人类写作概率"
          value={hasResult ? result!.humanProbability : null}
          colorClass="text-tertiary"
          barClass="bg-tertiary"
        />
        <ProgressBar
          label="AI 生成概率"
          value={hasResult ? result!.aiProbability : null}
          colorClass="text-primary"
          barClass="bg-primary-container"
        />
        <ProgressBar
          label="混合编辑概率"
          value={hasResult ? result!.mixedProbability : null}
          colorClass="text-secondary"
          barClass="bg-secondary"
        />
        {/* 置信度 */}
        <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Icon name="verified_user" size={16} className="text-primary" />
            检测置信度
          </div>
          <span className="text-on-surface-variant font-mono">
            {hasResult ? `${result!.confidence.toFixed(1)}%` : '--'}
          </span>
        </div>
      </div>
    </div>
  )
}
