/**
 * E2E smoke + UI scenarios via Chrome DevTools Protocol.
 * Requires: npm run build  (uses packaged dist/, not Vite dev server)
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
  dispatchKey,
  type CDPClient,
  type ChildProcess,
} from './cdp-driver.js'

const OUTPUT_DIR = path.join(process.cwd(), 'e2e-screenshots')
const APP_TITLE = 'ChisaTerminal'

/** Ctrl modifier bit for CDP Input.dispatchKeyEvent */
const MOD_CTRL = 2

async function assertTruthy(client: CDPClient, expression: string, message: string): Promise<void> {
  const ok = await evaluate<boolean>(client, expression)
  if (!ok) throw new Error(message)
}

async function runSmokeTest(client: CDPClient): Promise<void> {
  console.log('[e2e] smoke: title + body')

  const title = await evaluate<string>(client, 'document.title')
  if (title !== APP_TITLE) {
    throw new Error(`标题不匹配：期望“${APP_TITLE}”，实际“${title}”`)
  }

  await assertTruthy(client, '!!document.body', '页面 body 未加载')
  await assertTruthy(
    client,
    '!!document.querySelector(\'[data-testid="agent-status-bar"]\')',
    'Agent 状态栏未渲染'
  )
  await assertTruthy(
    client,
    '!!document.querySelector(\'[data-testid="tab-bar"]\')',
    'TabBar 未渲染'
  )

  await captureScreenshot(client, 'e2e-smoke.png', { outputDir: OUTPUT_DIR })
  console.log('[e2e] smoke ok')
}

async function runAgentStatusScenario(client: CDPClient): Promise<void> {
  console.log('[e2e] agent status bar')
  const status = await evaluate<string>(
    client,
    `document.querySelector('[data-testid="agent-status-bar"]')?.getAttribute('data-agent-status') ?? ''`
  )
  if (!status) throw new Error('data-agent-status 为空')
  // Initial state is idle until hooks fire
  if (!['idle', 'thinking', 'working', 'error'].includes(status)) {
    throw new Error(`未知 agent status: ${status}`)
  }
  const label = await evaluate<string>(
    client,
    `document.querySelector('[data-testid="agent-status-label"]')?.textContent?.trim() ?? ''`
  )
  // zh-CN default or en
  if (!/就绪|等待输入|运行中|错误|Ready|Waiting|Working|Error/i.test(label)) {
    throw new Error(`Agent 状态文案异常: “${label}”`)
  }
  console.log(`[e2e] agent status=${status} label=${label}`)
}

async function runNewTabScenario(client: CDPClient): Promise<void> {
  console.log('[e2e] new tab')
  const before = await evaluate<number>(
    client,
    `document.querySelectorAll('[data-testid="terminal-tab"]').length`
  )
  await evaluate(client, `document.querySelector('[data-testid="tab-add"]')?.click()`)
  await wait(500)
  const after = await evaluate<number>(
    client,
    `document.querySelectorAll('[data-testid="terminal-tab"]').length`
  )
  if (after !== before + 1) {
    throw new Error(`新建标签失败：before=${before} after=${after}`)
  }
  await captureScreenshot(client, 'e2e-new-tab.png', { outputDir: OUTPUT_DIR })
  console.log('[e2e] new tab ok')
}

async function runSettingsScenario(client: CDPClient): Promise<void> {
  console.log('[e2e] settings modal (Ctrl+,)')
  // key: "," code: "Comma"
  await dispatchKey(client, ',', 'Comma', MOD_CTRL)
  await wait(600)
  await assertTruthy(
    client,
    '!!document.querySelector(\'[data-testid="settings-modal"]\')',
    '设置对话框未打开'
  )
  await captureScreenshot(client, 'e2e-settings.png', { outputDir: OUTPUT_DIR })
  // Escape to close
  await dispatchKey(client, 'Escape', 'Escape')
  await wait(400)
  const stillOpen = await evaluate<boolean>(
    client,
    `!!document.querySelector('[data-testid="settings-modal"]')`
  )
  if (stillOpen) throw new Error('设置对话框未能用 Escape 关闭')
  console.log('[e2e] settings ok')
}

async function runCommandPaletteScenario(client: CDPClient): Promise<void> {
  console.log('[e2e] command palette (Ctrl+Shift+P)')
  // Shift = 8
  await dispatchKey(client, 'P', 'KeyP', MOD_CTRL | 8)
  await wait(600)
  await assertTruthy(
    client,
    '!!document.querySelector(\'[data-testid="command-palette"]\')',
    '命令面板未打开'
  )
  await captureScreenshot(client, 'e2e-palette.png', { outputDir: OUTPUT_DIR })
  await dispatchKey(client, 'Escape', 'Escape')
  await wait(400)
  const stillOpen = await evaluate<boolean>(
    client,
    `!!document.querySelector('[data-testid="command-palette"]')`
  )
  if (stillOpen) throw new Error('命令面板未能用 Escape 关闭')
  console.log('[e2e] command palette ok')
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
    // Let React hydrate / stores load
    await wait(1500)
    await runSmokeTest(client)
    await runAgentStatusScenario(client)
    await runNewTabScenario(client)
    await runSettingsScenario(client)
    await runCommandPaletteScenario(client)
    console.log('[e2e] all scenarios passed')
  } finally {
    if (client) await client.close()
    await stopElectron(proc)
  }
}

main().catch((err: Error) => {
  console.error('E2E 测试失败：', err.message)
  process.exit(1)
})
