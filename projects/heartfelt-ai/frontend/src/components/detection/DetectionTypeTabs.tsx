import { Icon } from '../ui/Icon'
import type { DetectionType } from '../../data/mockDetection'

/**
 * 检测类型切换 Tab。对应原型 code.html 行 179-192。
 * 文本检测 / 图像检测 / 多模态 三个 tab。
 *
 * 受控组件：activeType 由父组件持有。
 */
const TABS: Array<{ id: DetectionType; label: string; icon: string }> = [
  { id: 'text', label: '文本检测', icon: 'text_fields' },
  { id: 'image', label: '图像检测', icon: 'image' },
  { id: 'multimodal', label: '多模态', icon: 'layers' },
]

interface Props {
  active: DetectionType
  onChange: (type: DetectionType) => void
}

export function DetectionTypeTabs({ active, onChange }: Props) {
  return (
    <div className="flex bg-surface-container-low rounded-lg p-1 glow-border">
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md transition-colors text-sm font-medium ${
              isActive
                ? 'bg-surface-container text-primary border border-white/5 shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon name={tab.icon} size={18} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
