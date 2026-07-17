import { useState } from 'react'
import { TopNav } from '../components/layout/TopNav'
import { Footer } from '../components/layout/Footer'
import { DetectionTypeTabs } from '../components/detection/DetectionTypeTabs'
import { InputCard } from '../components/detection/InputCard'
import { DetectButton } from '../components/detection/DetectButton'
import { EvaluationCard } from '../components/detection/EvaluationCard'
import { VisualizationCard } from '../components/detection/VisualizationCard'
import { FeatureDimensions } from '../components/detection/FeatureDimensions'
import { HistorySection } from '../components/detection/HistorySection'
import { MOCK_HISTORY, MOCK_DETECTION_RESULT, type DetectionType } from '../data/mockDetection'

const MIN_CHARS = 10

/**
 * AI 内容检测中心。对应原型 code.html。
 * 左栏：类型 tab + 输入卡片 + 检测按钮。
 * 右栏：评估卡片（环形图+指标）+ 可视化 + 特征维度。
 * 底部：历史记录。
 */
export function DetectionPage() {
  const [activeType, setActiveType] = useState<DetectionType>('text')
  const [inputText, setInputText] = useState('')
  const [isDetecting, setIsDetecting] = useState(false)
  const [result, setResult] = useState<typeof MOCK_DETECTION_RESULT | null>(null)

  const canDetect = inputText.length >= MIN_CHARS && !isDetecting

  async function handleDetect() {
    if (!canDetect) return
    setIsDetecting(true)
    setResult(null)
    // mock: 假装在调检测模型
    await new Promise((r) => setTimeout(r, 1500))
    setResult(MOCK_DETECTION_RESULT)
    setIsDetecting(false)
  }

  function handleTypeChange(type: DetectionType) {
    if (type !== 'text') {
      alert('图像检测 / 多模态检测功能开发中')
      return
    }
    setActiveType(type)
  }

  // 柱状图 mock：把 AI 概率分布到 5 个区间
  const chartValues = result
    ? [8, 15, 22, 30, result.aiProbability]
    : null

  return (
    <div className="min-h-screen flex flex-col relative bg-background text-on-surface font-body-md">
      {/* 背景网格装饰 */}
      <div className="fixed inset-0 grid-overlay pointer-events-none -z-10" />

      <TopNav />

      <main className="flex-grow pt-28 pb-xl px-margin-mobile md:px-margin-desktop max-w-[1600px] mx-auto w-full flex flex-col gap-lg">
        {/* Hero */}
        <header className="flex flex-col gap-2">
          <h1 className="text-headline-lg md:text-display-lg font-headline-lg md:font-display-lg text-on-surface">
            AI 内容检测中心
          </h1>
          <p className="text-body-md font-body-md text-on-surface-variant">
            支持文本、图像及多模态内容的一键检测，实时分析 AI 生成概率
          </p>
        </header>

        {/* Dashboard 布局：12 列网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          {/* 左栏：输入区 */}
          <div className="lg:col-span-4 flex flex-col gap-md">
            <DetectionTypeTabs active={activeType} onChange={handleTypeChange} />
            <InputCard value={inputText} onChange={setInputText} />
            <DetectButton onClick={handleDetect} loading={isDetecting} />
          </div>

          {/* 右栏：结果区 */}
          <div className="lg:col-span-8 flex flex-col gap-md">
            <EvaluationCard result={result} />
            <VisualizationCard values={chartValues} />
            <FeatureDimensions features={result?.features ?? null} />
          </div>
        </div>

        {/* 历史记录 */}
        <HistorySection items={MOCK_HISTORY} />
      </main>

      <Footer />
    </div>
  )
}
