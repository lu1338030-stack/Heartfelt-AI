import { NavLink } from 'react-router-dom'
import { Icon } from '../ui/Icon'

/**
 * 全站统一顶栏导航。
 *
 * 设计来源说明：两个原型（index.html 降AI改写 / code.html 检测中心）有两套 nav 设计，
 * 用户要求统一为一套，避免页面跳转时 nav 闪烁变化：
 *   - Logo：取自 index.html（favorite 图标在渐变方框里 + Heartfelt AI，无 PRO 徽章）
 *   - 其余所有样式：取自 code.html（加深背景 + 投影、border-b-2 active 样式、
 *     emerald 系统状态、settings 按钮、person 头像）
 *
 * 用 react-router NavLink 实现：active 状态自动跟随当前 URL。
 *   - 系统状态：翠绿色 emerald 圆点（带发光）而不是 tertiary
 *   - 右侧多一个 settings 按钮
 *   - 头像：8x8 圆形 + person 图标（不是真实图片）
 */
const NAV_LINKS = [
  { label: '控制台', to: '/dashboard' },
  { label: '检测中心', to: '/detection' },
  { label: '降AI改写', to: '/' },
  { label: 'API', to: '/api-docs' },
  { label: '定价', to: '/pricing' },
] as const

export function TopNav() {
  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-margin-desktop h-20 bg-surface-container/80 backdrop-blur-xl border-b border-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] transition-all duration-300">
      <div className="flex items-center gap-md">
        {/* Logo: 降AI改写原型的 favorite 图标 + 渐变方框样式（不带 PRO 徽章） */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[0_0_15px_rgba(137,206,255,0.3)]">
            <Icon name="favorite" className="text-surface font-bold" size={18} fill />
          </div>
          <span className="text-headline-md font-headline-md font-bold tracking-tight text-on-surface">
            Heartfelt AI
          </span>
        </div>
        {/* Nav links */}
        <div className="hidden md:flex ml-lg gap-sm items-center h-full">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) =>
                `px-4 py-2 text-label-mono font-label-mono transition-all duration-300 ${
                  isActive
                    ? 'text-primary border-b-2 border-primary font-bold pb-1'
                    : 'text-on-surface-variant hover:text-primary rounded-md'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
      {/* Right actions */}
      <div className="flex items-center gap-sm">
        {/* 系统状态：翠绿色圆点（带发光），按钮样式 */}
        <button className="hidden md:flex items-center gap-xs px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          系统正常
        </button>
        {/* 通知 */}
        <button className="p-2 rounded-full text-on-surface-variant hover:bg-white/5 hover:text-primary transition-all duration-300">
          <Icon name="notifications" />
        </button>
        {/* 设置 */}
        <button className="p-2 rounded-full text-on-surface-variant hover:bg-white/5 hover:text-primary transition-all duration-300">
          <Icon name="settings" />
        </button>
        {/* 头像：8x8 圆形 + person 图标 */}
        <button className="w-8 h-8 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center overflow-hidden hover:border-primary/50 transition-colors ml-2">
          <Icon name="person" size={14} className="text-on-surface-variant" />
        </button>
      </div>
    </nav>
  )
}
