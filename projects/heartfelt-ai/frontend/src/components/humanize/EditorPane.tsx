import { Icon } from '../ui/Icon'

/**
 * 编辑器单栏。原型行 191-238（input）和 210-238（output）结构高度相似，
 * 抽成一个组件用 variant 区分。
 *
 * variant="input"  → 左栏：textarea + 字符计数
 * variant="output" → 右栏：空状态 / 结果文本 + 积分消耗 + 复制按钮
 */

type Variant = 'input' | 'output'

interface Props {
  variant: Variant
  // input
  value?: string
  onChange?: (v: string) => void
  onClear?: () => void
  charCount?: number
  maxChars?: number
  // output
  isGenerating?: boolean
  onCopy?: () => void
  copied?: boolean
  creditsCost?: number
}

export function EditorPane({
  variant,
  value = '',
  onChange,
  onClear,
  charCount = 0,
  maxChars = 1000,
  isGenerating = false,
  onCopy,
  copied = false,
  creditsCost = 0,
}: Props) {
  const isInput = variant === 'input'

  return (
    <div
      className={`glass-panel rounded-2xl flex flex-col relative transition-all duration-300 group ${
        isInput
          ? 'focus-within:border-primary/40 focus-within:shadow-[0_8px_32px_-1px_rgba(137,206,255,0.15)]'
          : ''
      } bg-surface-container-lowest/40`}
    >
      {/* 头部 */}
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container-lowest/60 rounded-t-2xl">
        <span
          className={`text-label-mono font-label-mono flex items-center gap-2 ${
            isInput ? 'text-primary' : 'text-tertiary'
          }`}
        >
          <Icon name={isInput ? 'edit_document' : 'check_circle'} size={14} />
          {isInput ? '原文内容' : '改写结果'}
        </span>
        {isInput ? (
          <button
            onClick={onClear}
            disabled={!value}
            className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-30"
          >
            <Icon name="delete_outline" size={14} />
          </button>
        ) : null}
      </div>

      {/* 内容区 */}
      {isInput ? (
        <div className="flex-grow p-1">
          <textarea
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full h-full bg-transparent border-none outline-none text-body-lg font-body-lg text-on-surface p-md resize-none focus:ring-0 focus:outline-none input-area placeholder-on-surface-variant/30"
            placeholder="在此输入或粘贴文本。不建议一次粘贴多段或仅粘贴一句话以获得最佳结果。每次约 300 字符最佳。最少 20 字符。"
          />
        </div>
      ) : (
        <div className="flex-grow p-md flex items-center justify-center relative">
          {/* 空状态 / loading */}
          {!value && (
            <div className="text-center text-on-surface-variant/40 absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
              <Icon
                name={isGenerating ? 'progress_activity' : 'magic_button'}
                size={48}
                className={`opacity-30 ${isGenerating ? 'animate-spin' : ''}`}
              />
              <span className="text-body-lg font-body-lg opacity-40">
                {isGenerating ? '正在改写...' : '等待生成中...'}
              </span>
            </div>
          )}
          {/* 结果文本 */}
          {value && (
            <div className="w-full h-full overflow-y-auto input-area text-body-lg font-body-lg text-on-surface relative z-10">
              {value}
            </div>
          )}
        </div>
      )}

      {/* 底部 */}
      <div className="p-4 border-t border-white/5 flex justify-between items-center bg-surface-container-lowest/60 rounded-b-2xl">
        {isInput ? (
          <span
            className={`text-label-mono font-label-mono ${
              charCount > maxChars ? 'text-error' : 'text-on-surface-variant'
            }`}
          >
            {charCount} / {maxChars} 字符
          </span>
        ) : (
          <>
            <div className="text-label-mono font-label-mono text-on-surface-variant/70">
              预计消耗: <span className="text-primary font-bold">{creditsCost}</span> 积分
            </div>
            <button
              onClick={onCopy}
              disabled={!value}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-label-mono font-label-mono border border-white/10 hover:border-primary/30 text-on-surface disabled:opacity-50"
            >
              <Icon name={copied ? 'check' : 'content_copy'} size={14} />
              {copied ? '已复制' : '复制结果'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
