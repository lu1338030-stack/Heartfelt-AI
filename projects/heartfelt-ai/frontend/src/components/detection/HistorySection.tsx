import { Icon } from '../ui/Icon'
import type { HistoryItem } from '../../data/mockDetection'

/**
 * 检测历史记录卡片。对应原型 code.html 行 358-435。
 * 标题栏（筛选/清空）+ 历史列表 + 分页。
 */
interface Props {
  items: HistoryItem[]
}

export function HistorySection({ items }: Props) {
  return (
    <div className="bg-surface-container-low rounded-xl p-md glow-border mt-4 flex flex-col gap-4">
      {/* 标题栏 */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 text-on-surface font-medium">
          <Icon name="history" className="text-primary" />
          检测历史记录
        </div>
        <div className="flex gap-4">
          <button className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary">
            <Icon name="filter_list" size={16} />
            筛选
          </button>
          <button className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-error">
            <Icon name="delete" size={16} />
            清空
          </button>
        </div>
      </div>
      {/* 历史列表 */}
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const severityColor = item.severity === 'high' ? 'text-error' : 'text-tertiary'
          const severityBg =
            item.severity === 'high' ? 'bg-error-container/20 text-error' : 'bg-tertiary-container/20 text-tertiary'
          const severityBorder = item.severity === 'high' ? 'border-error/20' : 'border-tertiary/20'
          return (
            <div
              key={item.id}
              className="bg-surface-container rounded-lg p-4 flex items-center justify-between group hover:bg-surface-container-highest transition-colors cursor-pointer border border-transparent hover:border-white/10"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-md ${severityBg} flex items-center justify-center`}
                >
                  <Icon name={item.icon} />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
                      {item.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${severityBg} border ${severityBorder}`}
                    >
                      {item.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-on-surface-variant/60">
                    <span className="flex items-center gap-1">
                      <Icon name="schedule" size={14} /> {item.timestamp}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="model_training" size={14} /> {item.model}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className={`text-lg font-mono font-bold ${severityColor}`}>
                    {item.aiProbability}%
                  </span>
                  <span className="text-[10px] text-on-surface-variant">AI 生成</span>
                </div>
                <Icon
                  name="chevron_right"
                  className="text-on-surface-variant group-hover:text-primary"
                />
              </div>
            </div>
          )
        })}
      </div>
      {/* 分页 */}
      <div className="flex justify-center items-center gap-2 mt-4">
        <button className="w-8 h-8 rounded flex items-center justify-center bg-surface-container hover:bg-white/5 text-on-surface-variant">
          <Icon name="chevron_left" size={16} />
        </button>
        <button className="w-8 h-8 rounded flex items-center justify-center bg-primary/20 text-primary border border-primary/30 text-sm">
          1
        </button>
        <button className="w-8 h-8 rounded flex items-center justify-center bg-surface-container hover:bg-white/5 text-on-surface-variant text-sm">
          2
        </button>
        <button className="w-8 h-8 rounded flex items-center justify-center bg-surface-container hover:bg-white/5 text-on-surface-variant">
          <Icon name="chevron_right" size={16} />
        </button>
      </div>
    </div>
  )
}
