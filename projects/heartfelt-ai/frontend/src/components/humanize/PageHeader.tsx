import { Icon } from '../ui/Icon'

/**
 * Hero 标题区。对应原型 index.html 行 163-173。
 * 含主标题 + 副标题 + 历史记录按钮。
 */
export function PageHeader() {
  return (
    <div className="flex justify-between items-end mb-lg">
      <div>
        <h1 className="text-headline-lg font-headline-lg text-on-surface mb-xs bg-clip-text text-transparent bg-gradient-to-r from-on-surface to-on-surface-variant">
          AIGC 降AI痕迹改写
        </h1>
        <p className="text-body-md font-body-md text-on-surface-variant">
          将 AI 生成的文本转换为自然、地道的人类语言，规避检测风险。
        </p>
      </div>
      <button className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-all duration-300 text-label-mono font-label-mono bg-surface-container-low px-4 py-2 rounded-lg border border-white/5 hover:border-primary/40 hover:bg-surface-container">
        <Icon name="history" size={14} />
        历史记录
      </button>
    </div>
  )
}
