/**
 * 生成测试用 .docx 文件
 * 用途：Phase 0 验收时 POST /api/v1/papers/upload 的测试 payload
 *
 * 运行：pnpm ts-node scripts/make-test-docx.ts
 * 输出：backend/test/fixtures/sample-paper.docx
 */
import { Document, Packer, Paragraph } from 'docx'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: '深度学习在自然语言处理中的应用研究', heading: 'Heading1' }),
          new Paragraph({
            text: '本文探讨近年来深度学习技术，尤其是 Transformer 架构，在自然语言处理领域的进展。首先回顾循环神经网络与卷积神经网络的传统方法；其次分析注意力机制的核心思想；最后展望大规模预训练模型的未来方向。',
          }),
          new Paragraph({
            text: '值得注意的是，Transformer 模型摒弃了原有的循环结构，仅依赖自注意力机制进行序列建模。此外，位置编码的引入弥补了丢失顺序信息的不足。',
          }),
          new Paragraph({
            text: '实验表明，在大规模语料上预训练的模型具有显著的迁移能力，多个下游任务的准确率均得到提升。',
          }),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  const outDir = path.join(__dirname, '..', 'test', 'fixtures')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'sample-paper.docx')
  fs.writeFileSync(outPath, buffer)
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath} (${buffer.length} bytes)`)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
