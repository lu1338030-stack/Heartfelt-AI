import { Icon } from '../ui/Icon'

/**
 * 使用须知提示条。对应原型 index.html 行 174-183。
 * 玻璃面板 + 左侧 primary 边框。
 */
export function NoticeBanner() {
  return (
    <div className="glass-panel rounded-xl p-md mb-lg border-l-4 border-l-primary bg-primary/10">
      <div className="flex gap-3">
        <Icon name="info" className="text-primary" />
        <div className="text-body-md font-body-md text-on-surface-variant">
          <p className="mb-1">
            <strong className="text-on-surface">1. 使用须知:</strong>{' '}
            当降低 AIGC 概率时，请严格遵守官方检测报告，仅修改高亮部分。使用非官方平台可能导致高亮不准确且降低无效。
          </p>
          <p>
            <strong className="text-on-surface">2. 建议:</strong>{' '}
            为了获得最佳结果，请将您的文档与官方检测报告一起上传。系统将自动定位并仅修改有问题的区域。
          </p>
        </div>
      </div>
    </div>
  )
}
