/**
 * AI / Agent status smoke: agent-status-bar must be present with a known status.
 */
import path from 'node:path'
import {
  launchElectron,
  stopElectron,
  waitForCDP,
  connectCDP,
  evaluate,
  captureScreenshot,
  wait,
  type CDPClient,
  type ChildProcess,
} from './cdp-driver.js'

const OUTPUT_DIR = path.join(process.cwd(), 'e2e-screenshots')

async function runAgentSmoke(client: CDPClient): Promise<void> {
  console.log('开始执行 AI 功能冒烟测试...')

  const exists = await evaluate<boolean>(
    client,
    `!!document.querySelector('[data-testid="agent-status-bar"]')`
  )
  if (!exists) throw new Error('未找到 [data-testid="agent-status-bar"]')

  const status = await evaluate<string>(
    client,
    `document.querySelector('[data-testid="agent-status-bar"]')?.getAttribute('data-agent-status') ?? ''`
  )
  const label = await evaluate<string>(
    client,
    `document.querySelector('[data-testid="agent-status-label"]')?.textContent?.trim() ?? ''`
  )
  console.log(`Agent 状态：status=${status} label=${label}`)

  if (!['idle', 'thinking', 'working', 'error'].includes(status)) {
    throw new Error(`未知 data-agent-status: ${status}`)
  }
  if (!/就绪|等待输入|运行中|错误|Hook 不可用|Ready|Waiting|Working|Error|Hooks unavailable/i.test(label)) {
    throw new Error(`未在状态栏检测到 AI 状态文本：${label}`)
  }

  await captureScreenshot(client, 'ai-smoke.png', { outputDir: OUTPUT_DIR })
  console.log('AI 功能冒烟测试通过')
}

async function main(): Promise<void> {
  const proc: ChildProcess = launchElectron({
    entry: process.cwd(),
    outputDir: OUTPUT_DIR,
  })

  let client: CDPClient | undefined
  try {
    await waitForCDP({ readyTimeout: 30000 })
    client = await connectCDP()
    await wait(1500)
    await runAgentSmoke(client)
  } finally {
    if (client) await client.close()
    await stopElectron(proc)
  }
}

main().catch((err: Error) => {
  console.error('AI 冒烟测试失败：', err.message)
  process.exit(1)
})
