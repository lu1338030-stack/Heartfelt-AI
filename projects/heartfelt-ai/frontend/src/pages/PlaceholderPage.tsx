import { TopNav } from '../components/layout/TopNav'
import { Footer } from '../components/layout/Footer'

/**
 * 未实现页面的占位组件。
 * 导航到 /dashboard, /api-docs, /pricing 时显示此页面。
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen flex flex-col pt-20 relative">
      <TopNav />
      <main className="flex-grow flex flex-col items-center justify-center px-margin-desktop gap-md">
        <h1 className="text-headline-lg font-headline-lg text-on-surface">{title}</h1>
        <p className="text-body-md font-body-md text-on-surface-variant">功能开发中，敬请期待。</p>
      </main>
      <Footer />
    </div>
  )
}
