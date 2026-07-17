import { Icon } from '../ui/Icon'

/**
 * 页脚。对应原型 index.html 行 248-260。
 */
const FOOTER_LINKS = ['隐私政策', '服务条款', '联系我们', '系统状态']

export function Footer() {
  return (
    <footer className="w-full flex justify-between items-center py-sm px-margin-desktop border-t border-white/5 bg-surface-container-lowest/80 backdrop-blur-md mt-auto relative z-10">
      <div className="flex items-center gap-2">
        <Icon name="favorite" className="text-primary" size={14} fill />
        <span className="text-body-md font-label-mono font-bold text-on-surface">Heartfelt AI</span>
      </div>
      <div className="flex gap-md">
        {FOOTER_LINKS.map((link) => (
          <a
            key={link}
            href="#"
            className="text-on-surface-variant text-label-mono font-label-mono hover:text-primary transition-colors"
          >
            {link}
          </a>
        ))}
      </div>
    </footer>
  )
}
