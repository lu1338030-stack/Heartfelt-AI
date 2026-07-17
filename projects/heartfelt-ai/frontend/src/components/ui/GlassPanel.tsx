import type { ReactNode } from 'react'

/**
 * 玻璃拟态面板。
 * 对齐原型 .glass-panel 样式：rgba(25,31,47,0.6) + blur(12px) + 边框。
 */
export function GlassPanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`glass-panel ${className}`}>{children}</div>
}
