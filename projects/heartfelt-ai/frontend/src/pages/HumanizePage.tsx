import { useState } from 'react'
import { TopNav } from '../components/layout/TopNav'
import { Footer } from '../components/layout/Footer'
import { PageHeader } from '../components/humanize/PageHeader'
import { NoticeBanner } from '../components/humanize/NoticeBanner'
import { InputModeTabs } from '../components/humanize/InputModeTabs'
import { EditorPane } from '../components/humanize/EditorPane'
import { GenerateButton } from '../components/humanize/GenerateButton'
import type { TabId } from '../components/humanize/InputModeTabs'
import { humanize } from '../api/humanize'
import type { HumanizeResponse } from '../api/types'

const MIN_CHARS = 50
const MAX_CHARS = 50000

/**
 * 降AI改写工作台(主页)。对应原型 index.html 行 129-261。
 *
 * Phase 1:接真实后端 POST /api/v1/humanize
 */
export function HumanizePage() {
  const [activeTab, setActiveTab] = useState<TabId>('paste')
  const [inputText, setInputText] = useState('')
  const [outputText, setOutputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [creditsCost, setCreditsCost] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [lastResult, setLastResult] = useState<HumanizeResponse | null>(null)

  const charCount = inputText.length
  const canGenerate = charCount >= MIN_CHARS && charCount <= MAX_CHARS && !isGenerating

  async function handleGenerate() {
    if (!canGenerate) return
    setIsGenerating(true)
    setOutputText('')
    setCreditsCost(0)
    setErrorMsg('')
    setLastResult(null)

    try {
      const result = await humanize({
        text: inputText,
        scenario: 'academic',
        maxRetries: 1,
      })
      setOutputText(result.rewrittenText)
      // token 数当作"积分"展示(简化;后续可接真实计费)
      setCreditsCost(result.summary.totalTokensUsed)
      setLastResult(result)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      const msg =
        err.response?.data?.message ?? err.message ?? '降AI 处理失败,请稍后重试'
      setErrorMsg(msg)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleCopy() {
    if (!outputText) return
    await navigator.clipboard.writeText(outputText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleTabChange(tab: TabId) {
    if (tab === 'upload') {
      alert('上传文件功能开发中')
      return
    }
    setActiveTab(tab)
  }

  function handleClear() {
    setInputText('')
    setOutputText('')
    setCreditsCost(0)
    setErrorMsg('')
    setLastResult(null)
  }

  return (
    <div className="min-h-screen flex flex-col pt-20 relative">
      <TopNav />

      <main className="flex-grow w-full px-margin-desktop py-xl max-w-[1600px] mx-auto z-10">
        <PageHeader />
        <NoticeBanner />
        <InputModeTabs active={activeTab} onChange={handleTabChange} />

        {/* 错误提示 */}
        {errorMsg && (
          <div className="mb-4 p-4 rounded-xl bg-error-container/30 border border-error/30 text-error text-body-lg font-body-lg">
            {errorMsg}
          </div>
        )}

        {/* 自检报告(可选展示) */}
        {lastResult && (
          <div className="mb-4 p-4 rounded-xl glass-panel bg-surface-container-lowest/40 text-label-mono font-label-mono text-on-surface-variant flex flex-wrap gap-4 items-center">
            <span>
              自检:{lastResult.summary.overallPassed ? (
                <span className="text-emerald-400">全部通过 ✅</span>
              ) : (
                <span className="text-amber-400">部分未通过 ⚠️</span>
              )}
            </span>
            <span>段数:{lastResult.summary.totalParagraphs}</span>
            <span>耗时:{(lastResult.summary.processingMs / 1000).toFixed(1)}s</span>
            <span>Token:{lastResult.summary.totalTokensUsed}</span>
            <span>重试轮数:{lastResult.summary.totalRounds}</span>
            <span className="text-primary">
              破折号 {lastResult.beforeAfter.dashCount.before} → {lastResult.beforeAfter.dashCount.after}
            </span>
            <span className="text-primary">
              口癖词 {lastResult.beforeAfter.aiVocabCount.before} → {lastResult.beforeAfter.aiVocabCount.after}
            </span>
            {/* PPL 困惑度(Phase 2) */}
            {lastResult.summary.avgPpl !== undefined && (
              <span>
                平均PPL:
                <span className={
                  lastResult.summary.avgPpl >= 35
                    ? 'text-emerald-400'
                    : lastResult.summary.avgPpl >= 25
                      ? 'text-amber-400'
                      : 'text-red-400'
                }>
                  {' '}{lastResult.summary.avgPpl.toFixed(1)}
                </span>
                {' '}(目标 ≥ 35)
              </span>
            )}
            {lastResult.summary.pplPassRate !== undefined && (
              <span>
                PPL通过率:{(lastResult.summary.pplPassRate * 100).toFixed(0)}%
              </span>
            )}
            {lastResult.summary.hasPplFailure && (
              <span className="text-red-400">
                ⚠️ 部分段落PPL未达标,建议手动调整
              </span>
            )}
          </div>
        )}

        {/* 双栏编辑器 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter min-h-[500px]">
          <EditorPane
            variant="input"
            value={inputText}
            onChange={setInputText}
            onClear={handleClear}
            charCount={charCount}
            maxChars={MAX_CHARS}
          />
          <EditorPane
            variant="output"
            value={outputText}
            isGenerating={isGenerating}
            onCopy={handleCopy}
            copied={copied}
            creditsCost={creditsCost}
          />
        </div>

        <GenerateButton onClick={handleGenerate} loading={isGenerating} />
      </main>

      <Footer />
    </div>
  )
}
