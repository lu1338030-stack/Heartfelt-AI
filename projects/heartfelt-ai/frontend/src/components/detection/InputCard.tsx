import { Icon } from '../ui/Icon'

/**
 * 文本输入卡片。对应原型 code.html 行 193-222。
 * 含：标题栏 + textarea + 底部操作（上传文件/粘贴链接/清空）。
 *
 * 受控组件：value + onChange 由父组件持有。
 */
interface Props {
  value: string
  onChange: (v: string) => void
  maxChars?: number
}

export function InputCard({ value, onChange, maxChars = 5000 }: Props) {
  const charCount = value.length

  return (
    <div className="bg-surface-container-low rounded-xl p-md flex flex-col gap-4 glow-border h-[400px]">
      {/* 标题栏 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-primary text-sm font-medium">
          <Icon name="edit_note" size={16} />
          输入待检测文本
        </div>
        <div className="text-on-surface-variant text-xs flex items-center gap-1 opacity-70">
          <Icon name="magic_button" size={12} />
          示例文本 <span className="ml-2">{charCount} / {maxChars}</span>
        </div>
      </div>
      {/* textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-grow bg-transparent border-none outline-none resize-none text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 p-0 text-sm leading-relaxed"
        placeholder="在此粘贴或输入需要检测的文本内容... 支持检测各类 AI 生成文本"
      />
      {/* 底部操作 */}
      <div className="flex justify-between items-center pt-4 border-t border-white/5">
        <div className="flex gap-3">
          <button className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 rounded bg-white/5 hover:bg-white/10">
            <Icon name="upload_file" size={16} />
            上传文件
          </button>
          <button className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 rounded bg-white/5 hover:bg-white/10">
            <Icon name="link" size={16} />
            粘贴链接
          </button>
        </div>
        <button
          onClick={() => onChange('')}
          disabled={!value}
          className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-error transition-colors px-3 py-1.5 rounded hover:bg-error/10 disabled:opacity-30"
        >
          <Icon name="delete" size={16} />
          清空
        </button>
      </div>
    </div>
  )
}
