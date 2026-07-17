import { Icon } from '../ui/Icon'

/**
 * 概率分布可视化卡片。对应原型 code.html 行 289-318。
 * 柱状图区域 + 柱状图/热力图切换。
 * 未检测时柱子高度为 0（原型用 h-1 最小高度）。
 */
interface Props {
  /** 5个区间的概率值（0-100），null = 未检测 */
  values?: number[] | null
}

export function VisualizationCard({ values = null }: Props) {
  const hasData = values !== null && values.length > 0
  const labels = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%']

  return (
    <div className="bg-surface-container-low rounded-xl p-md glow-border flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-on-surface font-medium text-sm">
          <Icon name="bar_chart" size={16} className="text-primary" />
          概率分布可视化
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded bg-primary/10 text-primary border border-primary/20 text-xs">
            柱状图
          </button>
          <button className="px-3 py-1 rounded hover:bg-white/5 text-on-surface-variant text-xs">
            热力图
          </button>
        </div>
      </div>
      {/* 柱状图 */}
      <div className="h-48 relative border-b border-white/10 mt-4 flex items-end justify-between px-8">
        {/* Y 轴标签 */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-on-surface-variant/50 font-mono py-1">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        {/* 网格线 */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pl-8 py-1">
          <div className="w-full h-px bg-white/5" />
          <div className="w-full h-px bg-white/5" />
          <div className="w-full h-px bg-white/5" />
        </div>
        {/* 柱子 */}
        <div className="w-full h-full flex justify-around items-end z-10 pb-1">
          {labels.map((_, i) => {
            const val = hasData ? values![i] ?? 0 : 0
            const height = hasData ? `${Math.max(val, 2)}%` : undefined
            const minHeight = '4px'
            return (
              <div
                key={i}
                className="w-12 rounded-t bg-primary-container transition-all duration-700"
                style={{ height: height ?? minHeight, minHeight }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
