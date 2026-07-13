/**
 * Electron CDP 自动化基础框架。
 * 提供启动应用、连接 Chrome DevTools Protocol、查找 DOM、截图等能力。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn, type ChildProcess } from 'node:child_process'

const require = createRequire(import.meta.url)

export type { ChildProcess }

export interface CDPTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl: string
}

export interface CDPOptions {
  /** CDP 监听地址 */
  host?: string
  /** CDP 监听端口 */
  port?: number
  /** 等待 CDP 就绪的超时时间（毫秒） */
  readyTimeout?: number
  /** 截图保存目录，默认为当前工作目录 */
  outputDir?: string
}

export interface ElectronLaunchOptions extends CDPOptions {
  /** Electron 入口文件路径 */
  entry?: string
  /** 启动 Electron 时额外传入的参数 */
  args?: string[]
  /** 环境变量 */
  env?: NodeJS.ProcessEnv
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 9223
const DEFAULT_READY_TIMEOUT = 20000

export function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T)
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })
}

export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class CDPClient {
  private ws: WebSocket
  private id = 0
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >()

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
    this.ws.addEventListener('message', (ev) => this.handleMessage(ev.data))
  }

  private handleMessage(data: unknown) {
    const text = typeof data === 'string' ? data : (data as Buffer).toString()
    const msg = JSON.parse(text) as {
      id?: number
      error?: { message: string }
      result?: unknown
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)!
      this.pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result as unknown)
    }
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        resolve()
        return
      }
      this.ws.addEventListener('open', () => resolve(), { once: true })
      this.ws.addEventListener('error', (ev) => reject(new Error(`WebSocket 连接失败：${ev}`)), { once: true })
    })
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) {
        resolve()
        return
      }
      this.ws.addEventListener('close', () => resolve(), { once: true })
      this.ws.close()
    })
  }
}

export async function waitForCDP(options: CDPOptions = {}): Promise<void> {
  const host = options.host ?? DEFAULT_HOST
  const port = options.port ?? DEFAULT_PORT
  const timeout = options.readyTimeout ?? DEFAULT_READY_TIMEOUT
  const url = `http://${host}:${port}/json/list`
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    try {
      await fetchJson<CDPTarget[]>(url)
      return
    } catch {
      await wait(300)
    }
  }
  throw new Error(`等待 CDP 服务超时：${url}`)
}

export async function listTargets(options: CDPOptions = {}): Promise<CDPTarget[]> {
  const host = options.host ?? DEFAULT_HOST
  const port = options.port ?? DEFAULT_PORT
  return fetchJson<CDPTarget[]>(`http://${host}:${port}/json/list`)
}

export function findPageTarget(targets: CDPTarget[], title: string): CDPTarget | undefined {
  return targets.find((t) => t.type === 'page' && t.title === title)
}

/** Prefer app page (file:// or titled ChisaTerminal); skip DevTools pages. */
export function findAppPageTarget(targets: CDPTarget[]): CDPTarget | undefined {
  const pages = targets.filter((t) => t.type === 'page')
  return (
    pages.find((t) => t.title === 'ChisaTerminal') ||
    pages.find((t) => t.url.startsWith('file:') && !t.url.includes('devtools')) ||
    pages.find(
      (t) =>
        !t.url.startsWith('devtools:') &&
        !t.title.includes('DevTools') &&
        (t.url.includes('index.html') || t.url.includes('localhost'))
    )
  )
}

export async function connectCDP(options: CDPOptions = {}): Promise<CDPClient> {
  const host = options.host ?? DEFAULT_HOST
  const port = options.port ?? DEFAULT_PORT
  const timeout = options.readyTimeout ?? DEFAULT_READY_TIMEOUT
  const deadline = Date.now() + timeout
  let page: CDPTarget | undefined

  while (Date.now() < deadline) {
    const targets = await listTargets({ host, port })
    page = findAppPageTarget(targets)
    if (page) break
    await wait(300)
  }

  if (!page) {
    const targets = await listTargets({ host, port })
    const summary = targets.map((t) => `${t.type}:${t.title}:${t.url}`).join(' | ')
    throw new Error(`未找到 ChisaTerminal 页面目标。现有：${summary}`)
  }

  const client = new CDPClient(page.webSocketDebuggerUrl)
  await client.open()
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await client.send('DOM.enable')
  return client
}

function resolveElectronBinary(): string {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH
  try {
    // When required from Node (not inside Electron), the package exports the binary path.
    const binary = require('electron') as string
    if (typeof binary === 'string' && binary.length > 0) return binary
  } catch {
    // fall through
  }
  return process.platform === 'win32' ? 'electron.cmd' : 'electron'
}

export function launchElectron(options: ElectronLaunchOptions = {}): ChildProcess {
  const entry = options.entry ?? process.cwd()
  const port = options.port ?? DEFAULT_PORT
  const args = [
    entry,
    `--remote-debugging-port=${port}`,
    ...(options.args ?? []),
  ]
  const env = {
    ...process.env,
    NODE_ENV: 'e2e-test',
    // Prefer packaged renderer/main for e2e stability
    ...options.env,
  }

  const electronPath = resolveElectronBinary()
  const proc = spawn(electronPath, args, {
    env,
    stdio: 'inherit',
    shell: false,
  })

  proc.on('error', (err) => {
    console.error('启动 Electron 失败：', err.message)
  })

  return proc
}

export async function stopElectron(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.killed || proc.exitCode !== null) {
      resolve()
      return
    }
    proc.on('exit', () => resolve())
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
    }, 5000)
  })
}

export async function captureScreenshot(
  client: CDPClient,
  filename: string,
  options: CDPOptions = {}
): Promise<string> {
  const result = (await client.send('Page.captureScreenshot')) as { data: string }
  const outputDir = options.outputDir ?? process.cwd()
  const filepath = path.join(outputDir, filename)
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(filepath, Buffer.from(result.data, 'base64'))
  console.log(`已保存截图：${filepath}`)
  return filepath
}

export async function evaluate<T>(
  client: CDPClient,
  expression: string,
  awaitPromise = false
): Promise<T> {
  const result = (await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  })) as {
    result?: { value?: T; objectId?: string }
  }
  return result.result?.value as T
}

export async function querySelectorAllRects(
  client: CDPClient,
  selector: string
): Promise<Array<{ left: number; top: number; width: number; height: number }>> {
  return evaluate<Array<{ left: number; top: number; width: number; height: number }>>(
    client,
    `
      Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .map(el => el.getBoundingClientRect())
        .map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }))
    `
  )
}

export async function clickElement(client: CDPClient, selector: string): Promise<void> {
  const rects = await querySelectorAllRects(client, selector)
  const rect = rects[0]
  if (!rect) {
    throw new Error(`未找到可点击元素：${selector}`)
  }
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  await client.send('Input.synthesizeTapGesture', { x, y })
  await wait(300)
}

export async function dispatchKey(
  client: CDPClient,
  key: string,
  code: string,
  modifiers = 0
): Promise<void> {
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    modifiers,
  })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code })
}

export async function setFileInput(
  client: CDPClient,
  selector: string,
  files: string[]
): Promise<void> {
  const evalResult = (await client.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
    objectGroup: 'test',
  })) as { result?: { objectId?: string } }
  const objectId = evalResult.result?.objectId
  if (!objectId) {
    throw new Error(`未找到文件输入元素：${selector}`)
  }
  const nodeDesc = (await client.send('DOM.describeNode', { objectId })) as {
    node: { backendNodeId: number }
  }
  await client.send('DOM.setFileInputFiles', {
    backendNodeId: nodeDesc.node.backendNodeId,
    files,
  })
  await wait(500)
}
