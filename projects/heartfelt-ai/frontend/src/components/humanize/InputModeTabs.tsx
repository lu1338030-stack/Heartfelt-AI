/**
 * 输入模式 Tab 切换。对应原型 index.html 行 184-188。
 * "粘贴文本" / "上传文件" 两个 tab。
 *
 * Step 2 静态版本：默认选中"粘贴文本"。
 * Step 3 改为受控组件（activeTab 由父持有）。
 */

type TabId = 'paste' | 'upload'

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'paste', label: '粘贴文本' },
  { id: 'upload', label: '上传文件' },
]

export function InputModeTabs({ active, onChange }: Props) {
  return (
    <div className="flex gap-6 mb-md border-b border-white/10 pb-2">
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`pb-2 -mb-[10px] font-label-mono text-label-mono transition-all ${
              isActive
                ? 'text-primary border-b-2 border-primary font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export type { TabId }
