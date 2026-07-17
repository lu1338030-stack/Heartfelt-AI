import { Icon } from '../ui/Icon'

/**
 * 一键检测按钮。对应原型 code.html 行 223-228。
 * 用 .btn-gradient-detection（蓝→红紫渐变，和降AI改写的 btn-gradient 颜色不同）。
 */
interface Props {
  onClick: () => void
  loading?: boolean
}

export function DetectButton({ onClick, loading = false }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-4 rounded-xl btn-gradient-detection text-white font-bold text-lg flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-[0_0_30px_rgba(14,165,233,0.3)] hover:shadow-[0_0_40px_rgba(14,165,233,0.4)] transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70"
    >
      <Icon name={loading ? 'progress_activity' : 'auto_awesome'} className={loading ? 'animate-spin' : ''} />
      {loading ? '正在检测...' : '一键检测 AI 生成概率'}
    </button>
  )
}
