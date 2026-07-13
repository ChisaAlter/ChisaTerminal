/**
 * AI 功能冒烟测试。
 * 验证启动后 Agent 状态栏可见，并能读取初始状态文本。
 */
import path from 'node:path'
import {
  launchElectron,
  stopElectron,
  waitForCDP,
  connectCDP,
  evaluate,
  captureScreenshot,
  type CDPClient,
  type ChildProcess,
} from './cdp-driver.js'

const OUTPUT_DIR = path.join(process.cwd(), 'e2e-screenshots')

async function runAgentSmoke(client: CDPClient): Promise<void> {
  console.log('开始执行 AI 功能冒烟测试...')

  const statusText = await evaluate<string>(
    client,
    `
      (() => {
        const el = document.querySelector('[class*="bg-sidebar"]')
        return el ? el.textContent : ''
      })()
    `
  )
  console.log(`Agent 状态栏文本：${statusText}`)

  const hasStatus = /就绪|等待输入|运行中|错误/.test(statusText)
  if (!hasStatus) {
    throw new Error('未在状态栏检测到 AI 状态文本')
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
    await waitForCDP()
    client = await connectCDP()
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
