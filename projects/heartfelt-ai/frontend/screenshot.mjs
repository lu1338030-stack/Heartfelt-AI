import { chromium } from 'playwright'
import { pathToFileURL } from 'url'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }})

// 原型
await page.goto(pathToFileURL('E:/daima/my-ai-agent/stitch_heartfelt_ai_humanization_platform (1)/index.html').href)
await page.screenshot({ path: '/tmp/proto.png', fullPage: true })
console.log('原型截图: /tmp/proto.png')

// React 实现
await page.goto('http://localhost:5173/')
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/react.png', fullPage: true })
console.log('React 截图: /tmp/react.png')

await browser.close()
