/**
 * E2E 基础运行入口。
 * 启动 Electron 应用并通过 CDP 连接，验证窗口可启动、DOM 可访问、截图可保存。
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
const APP_TITLE = 'ChisaTerminal'

async function runSmokeTest(client: CDPClient): Promise<void> {
  console.log('开始执行 E2E 冒烟测试...')

  const title = await evaluate<string>(client, 'document.title')
  console.log(`页面标题：${title}`)
  if (title !== APP_TITLE) {
    throw new Error(`标题不匹配：期望“${APP_TITLE}”，实际“${title}”`)
  }

  const bodyExists = await evaluate<boolean>(client, '!!document.body')
  if (!bodyExists) {
    throw new Error('页面 body 未加载')
  }
  console.log('DOM 已就绪')

  await captureScreenshot(client, 'e2e-smoke.png', { outputDir: OUTPUT_DIR })
  console.log('E2E 冒烟测试通过')
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
    await runSmokeTest(client)
  } finally {
    if (client) await client.close()
    await stopElectron(proc)
  }
}

main().catch((err: Error) => {
  console.error('E2E 测试失败：', err.message)
  process.exit(1)
})
