import { Icon } from '../ui/Icon'

/**
 * 特征维度分析卡片。对应原型 code.html 行 319-355。
 * 4个维度：词汇多样性 / 句法结构 / 语义连贯 / 风格一致性。
 * 2x2 网格（md 以上 4 列）。
 */
interface Features {
  lexicalDiversity: number
  syntacticStructure: number
  semanticCoherence: number
  styleConsistency: number
}

interface Props {
  features: Features | null
}

const DIMENSIONS: Array<{
  key: keyof Features
  label: string
  icon: string
  iconBg: string
  iconColor: string
}> = [
  { key: 'lexicalDiversity', label: '词汇多样性', icon: 'gesture', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { key: 'syntacticStructure', label: '句法结构', icon: 'account_tree', iconBg: 'bg-secondary-container/20', iconColor: 'text-secondary' },
  { key: 'semanticCoherence', label: '语义连贯', icon: 'link', iconBg: 'bg-tertiary/10', iconColor: 'text-tertiary' },
  { key: 'styleConsistency', label: '风格一致性', icon: 'format_paint', iconBg: 'bg-on-secondary-fixed-variant/20', iconColor: 'text-on-secondary-container' },
]

export function FeatureDimensions({ features }: Props) {
  return (
    <div className="bg-surface-container-low rounded-xl p-md glow-border flex flex-col gap-4">
      <div className="flex items-center gap-2 text-on-surface font-medium text-sm">
        <Icon name="category" size={16} className="text-primary" />
        特征维度分析
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {DIMENSIONS.map((dim) => {
          const val = features ? features[dim.key] : null
          const display = val !== null ? val.toFixed(2) : '--'
          return (
            <div
              key={dim.key}
              className="bg-surface-container rounded-lg p-4 flex flex-col items-center justify-center gap-3 glow-hover transition-all"
            >
              <div className={`w-8 h-8 rounded ${dim.iconBg} flex items-center justify-center`}>
                <Icon name={dim.icon} size={18} className={dim.iconColor} />
              </div>
              <div className="text-xs text-on-surface-variant">{dim.label}</div>
              <div className="font-mono text-on-surface">{display}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
