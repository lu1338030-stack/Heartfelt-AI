import { Icon } from '../ui/Icon'

/**
 * 中央"一键生成"按钮。对应原型 index.html 行 240-246。
 * Step 3 受控：onClick + loading 状态。
 */
export function GenerateButton({
  onClick,
  loading = false,
}: {
  onClick: () => void
  loading?: boolean
}) {
  return (
    <div className="flex justify-center mt-xl mb-lg">
      <button
        onClick={onClick}
        disabled={loading}
        className="btn-gradient px-xl py-4 rounded-full text-on-primary font-headline-md text-headline-md font-bold flex items-center gap-3 active:scale-95 disabled:opacity-90 disabled:active:scale-100"
      >
        <Icon
          name={loading ? 'progress_activity' : 'auto_fix_high'}
          className={loading ? 'animate-spin' : ''}
        />
        {loading ? '正在生成...' : '一键生成'}
      </button>
    </div>
  )
}
