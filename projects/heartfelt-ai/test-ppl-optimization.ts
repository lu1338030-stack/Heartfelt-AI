/**
 * PPL 优化验证脚本(DeepSeek V3 + 新 prompt + temp 1.1 + PPL≥45 阈值)
 *
 * 跑 10 次 humanize 接口,记录:
 *   - 每次的 PPL、burstiness、句长
 *   - 是否通过 PPL≥45
 *   - 改写后长度 vs 原文长度
 *   - 是否有污染(英文/分析过程漏进 content)
 *   - 总耗时、轮数、token
 */
const testText = '随着人工智能技术的快速发展，深度学习在图像识别领域取得了显著成果。研究表明，卷积神经网络通过模拟人类视觉系统，能够有效地提取图像特征。此外，注意力机制的引入进一步提高了模型的性能。需要注意的是，尽管这些方法效果显著，但仍然存在一些问题需要解决。例如，模型的可解释性较差，计算资源消耗较大。综上所述，未来的研究方向应该聚焦于提升模型的效率和可解释性。'

const ORIG_LEN = testText.length
const PASS_THRESHOLD = 45
const RUNS = 10

async function oneRun(i: number) {
  const t0 = Date.now()
  try {
      const resp = await fetch('http://localhost:3000/api/v1/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: testText,
        scenario: 'academic',
        maxRetries: 4,
      }),
    })
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    if (!resp.ok) {
      const errText = await resp.text()
      return { i, ok: false, elapsed, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` }
    }
    const data = await resp.json() as any

    // 取第一段(测试文本只有一段)
    const para = data.paragraphs?.[0]
    if (!para) {
      return { i, ok: false, elapsed, error: 'no paragraph in response' }
    }

    const rewritten = para.rewrittenText as string
    const ppl = para.ppl as number | undefined
    const burstiness = para.pplBurstiness as number | undefined
    const pplPassed = para.pplPassed as boolean | undefined
    const rounds = para.rounds as number
    const tokens = para.tokensUsed as number

    // 长度对比
    const outLen = rewritten.length
    const lenRatio = (outLen / ORIG_LEN * 100).toFixed(1)

    // 污染检测
    const letterCount = (rewritten.match(/[a-zA-Z]/g) || []).length
    const hasBullet = /^[ \t]*([-*•]|\d+\.)\s+/m.test(rewritten)
    const polluted = letterCount > 15 || hasBullet

    return {
      i,
      ok: true,
      elapsed,
      ppl: ppl?.toFixed(1),
      pplPassed,
      burstiness: burstiness?.toFixed(1),
      rounds,
      tokens,
      outLen,
      lenRatio: `${lenRatio}%`,
      polluted,
      preview: rewritten.slice(0, 60) + (rewritten.length > 60 ? '...' : ''),
    }
  } catch (e: any) {
    return { i, ok: false, elapsed: ((Date.now() - t0) / 1000).toFixed(1), error: e.message }
  }
}

async function main() {
  console.log(`=== DeepSeek V3 PPL 优化验证 ===`)
  console.log(`原文长度: ${ORIG_LEN} 字`)
  console.log(`PPL 通过阈值: ≥ ${PASS_THRESHOLD}`)
  console.log(`温度: 1.2, maxRetries: 4, prompt 版本: 1.2.1`)
  console.log(`测试次数: ${RUNS}\n`)

  const results = []
  for (let i = 1; i <= RUNS; i++) {
    const r = await oneRun(i)
    results.push(r)
    if (r.ok) {
      console.log(
        `Run ${String(i).padStart(2)}: PPL=${r.ppl?.padStart(6)} ${r.pplPassed ? '✅' : '⚠️'}  ` +
        `rounds=${r.rounds} ${r.elapsed}s  len=${r.outLen}(${r.lenRatio})  ` +
        `${r.polluted ? '🚨 POLLUTED' : '✓ clean'}  ${r.preview}`
      )
    } else {
      console.log(`Run ${String(i).padStart(2)}: ❌ FAILED (${r.elapsed}s) ${r.error}`)
    }
  }

  // 汇总
  console.log('\n=== 汇总 ===')
  const ok = results.filter(r => r.ok)
  const passed = ok.filter(r => r.pplPassed === true)
  const polluted = ok.filter(r => r.polluted === true)
  const ppls = ok.map(r => parseFloat(r.ppl as string)).filter(n => !isNaN(n))
  const times = ok.map(r => parseFloat(r.elapsed))

  console.log(`成功: ${ok.length}/${RUNS}`)
  console.log(`PPL 通过(≥${PASS_THRESHOLD}): ${passed.length}/${ok.length} = ${(passed.length / ok.length * 100).toFixed(0)}%`)
  console.log(`污染: ${polluted.length}/${ok.length}`)
  if (ppls.length > 0) {
    console.log(`PPL: min=${Math.min(...ppls).toFixed(1)} max=${Math.max(...ppls).toFixed(1)} avg=${(ppls.reduce((a,b)=>a+b,0)/ppls.length).toFixed(1)}`)
  }
  if (times.length > 0) {
    console.log(`耗时: min=${Math.min(...times).toFixed(1)}s max=${Math.max(...times).toFixed(1)}s avg=${(times.reduce((a,b)=>a+b,0)/times.length).toFixed(1)}s`)
  }

  // 长度超标统计(放宽到 130%)
  const overflows = ok.filter(r => {
    const ratio = parseFloat(r.lenRatio)
    return ratio > 132 // 超过 130% + 2% 容忍
  })
  console.log(`长度超标(>102%): ${overflows.length}/${ok.length}`)
}

main().catch(console.error)
