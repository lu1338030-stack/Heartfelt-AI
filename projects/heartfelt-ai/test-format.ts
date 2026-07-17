// 测试格式保留:用户给的"优势/局限性"原文
const testText = '传感器技术在腐败预警环节展现出其特有的优势——通过捕获异味、氨浓度抬升或化学成分波动这类反映鱼体腐变的信号，设备能提早发出告警；实时数据由持续运转的监测系统源源不断地提供给管理者，有助于压缩应对滞后的时间窗；凭借传感器回传的精确读数，操作人员可对货架期做出更准确的估算。局限性：传感器必须定期校准以维持精准度，而这通常既成本高昂又十分耗费精力；整套系统的部署开支不菲，对资金受限的小规模渔业企业而言，这一瓶颈尤为突出。'

async function oneRun(i: number) {
  const t0 = Date.now()
  try {
    const resp = await fetch('http://localhost:3000/api/v1/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText, scenario: 'academic', maxRetries: 4 }),
    })
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    if (!resp.ok) return { i, ok: false, elapsed, error: `HTTP ${resp.status}` }
    const data = await resp.json() as any
    const para = data.paragraphs?.[0]
    const rewritten = para?.rewrittenText as string
    const ppl = para?.ppl as number | undefined
    return {
      i, ok: true, elapsed,
      ppl: ppl?.toFixed(1),
      len: rewritten.length,
      lenRatio: (rewritten.length / testText.length * 100).toFixed(1) + '%',
      text: rewritten,
      hasLabel: rewritten.includes('优势') && rewritten.includes('局限'),
    }
  } catch (e: any) {
    return { i, ok: false, elapsed: ((Date.now() - t0) / 1000).toFixed(1), error: e.message }
  }
}

async function main() {
  console.log(`=== 格式保留测试(优势/局限性)==={}`)
  console.log(`原文 ${testText.length} 字:\n${testText}\n`)
  for (let i = 1; i <= 3; i++) {
    const r = await oneRun(i) as any
    if (r.ok) {
      console.log(`\n--- Run ${i} | PPL=${r.ppl} | len=${r.len}(${r.lenRatio}) | ${r.elapsed}s | 含结构标签: ${r.hasLabel ? '✅' : '❌'} ---`)
      console.log(r.text)
    } else {
      console.log(`Run ${i}: ❌ ${r.error}`)
    }
  }
}
main()
