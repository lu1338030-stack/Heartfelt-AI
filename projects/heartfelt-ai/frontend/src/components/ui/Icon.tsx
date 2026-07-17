/**
 * Material Symbols 图标包装。
 * 原型用 <span class="material-symbols-outlined">favorite</span>，
 * 这里封装成 React 组件统一管理。
 */
export function Icon({
  name,
  className = '',
  fill = false,
  size = 24,
}: {
  name: string
  className?: string
  fill?: boolean
  size?: number
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}`,
        fontSize: `${size}px`,
        lineHeight: 1,
      }}
      aria-hidden
    >
      {name}
    </span>
  )
}
