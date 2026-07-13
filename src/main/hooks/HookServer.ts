import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { HookMessage, HookMessageInternal } from '../../shared/types.js'

// Windows: \\.\pipe\chisa-hook-<pid>
// Unix: /tmp/chisa-hook-<pid>.sock
function getPipePath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\chisa-hook-${process.pid}`
  }
  return path.join(os.tmpdir(), `chisa-hook-${process.pid}.sock`)
}

/** 单个连接的接收缓冲区上限（1MB），超过即视为异常并断开连接，防止内存 DoS。 */
const MAX_BUFFER_BYTES = 1024 * 1024

/** handleLine 允许转发的合法 event 枚举集合。 */
const VALID_HOOK_EVENTS = new Set<string>([
  'running',
  'idle',
  'needsInput',
  'finished',
  'error',
])

export class HookServer {
  private server: net.Server | null = null
  private pipePath = ''
  private pipePathOverride?: string
  private clients = new Set<net.Socket>()
  private hookToken = ''

  onMessage: ((msg: HookMessage) => void) | null = null

  constructor(pipePath?: string) {
    this.pipePathOverride = pipePath
  }

  /** 当前会话令牌，仅供主进程内部使用（如注入 PTY 环境变量）。 */
  get token(): string {
    return this.hookToken
  }

  /** 校验客户端提交的 token 是否有效。 */
  validateToken(token: string): boolean {
    return token === this.hookToken && this.hookToken.length > 0
  }

  start(): Promise<boolean> {
    this.pipePath = this.pipePathOverride ?? getPipePath()
    // 每次启动生成新的会话令牌，防止旧进程或外部进程伪造消息。
    this.hookToken = randomBytes(32).toString('hex')
    this.server = net.createServer((socket) => {
      this.clients.add(socket)
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString()
        // 接收缓冲区超过 1MB 视为异常（DoS / 客户端 bug），立即断开。
        if (buffer.length > MAX_BUFFER_BYTES) {
          console.warn(
            '[HookServer] receive buffer exceeded 1MB, destroying socket',
          )
          buffer = ''
          socket.destroy()
          return
        }
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          this.handleLine(line, socket)
        }
      })
      socket.on('close', () => this.clients.delete(socket))
      socket.on('error', () => this.clients.delete(socket))
    })

    return new Promise<boolean>((resolve) => {
      let resolved = false

      this.server!.on('error', (err) => {
        console.warn('[HookServer] server error:', err.message)
        if (!resolved) {
          resolved = true
          resolve(false)
        }
      })

      // Remove stale unix socket file before listen (no-op on Windows)
      if (process.platform !== 'win32') {
        try {
          fs.rmSync(this.pipePath, { force: true })
        } catch {
          /* ignore */
        }
      }

      this.server!.listen(this.pipePath, () => {
        // Unix 域套接字默认权限过宽，限制为仅当前用户可读写。
        if (process.platform !== 'win32') {
          try {
            fs.chmodSync(this.pipePath, 0o600)
          } catch {
            /* ignore */
          }
        }
        // Expose pipe path via env so PtySession can read it and pass to children.
        // Write both names during mux0→chisa migration.
        process.env.CHISA_HOOK_PIPE = this.pipePath
        process.env.MUX0_HOOK_PIPE = this.pipePath
        if (!resolved) {
          resolved = true
          resolve(true)
        }
      })
    })
  }

  private handleLine(line: string, socket: net.Socket): void {
    if (!line.trim()) return
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      console.warn('[HookServer] invalid message:', line.slice(0, 200))
      return
    }
    // 先校验令牌：令牌无效即断开连接，避免伪造消息被进一步处理。
    const token = (msg as { token?: unknown } | null)?.token
    if (!this.validateToken(typeof token === 'string' ? token : '')) {
      console.warn('[HookServer] invalid token, dropping message')
      socket.destroy()
      return
    }
    // 运行时 schema 校验，防止畸形字段污染下游。
    if (msg === null || typeof msg !== 'object') {
      console.warn('[HookServer] invalid message: not an object')
      return
    }
    const m = msg as HookMessageInternal
    if (typeof m.terminalId !== 'string' || m.terminalId.length === 0) {
      console.warn('[HookServer] invalid message: missing terminalId')
      return
    }
    if (typeof m.event !== 'string' || !VALID_HOOK_EVENTS.has(m.event)) {
      console.warn('[HookServer] invalid message: bad event field')
      return
    }
    // 令牌仅用于主进程校验，不得转发到渲染进程或写入日志。
    delete m.token
    if (this.onMessage) {
      this.onMessage(m)
    }
  }

  async stop(): Promise<void> {
    if (this.server === null) return
    // 先断开所有客户端连接，再关闭 server 并等待其完全关闭。
    this.clients.forEach((c) => c.destroy())
    this.clients.clear()
    const server = this.server
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    this.server = null
    this.hookToken = ''
    if (process.platform !== 'win32' && this.pipePath) {
      try {
        fs.rmSync(this.pipePath, { force: true })
      } catch {
        /* ignore */
      }
    }
  }

  /** dispose 为 stop 的别名，便于资源统一管理。 */
  async dispose(): Promise<void> {
    await this.stop()
  }
}

export const hookServer = new HookServer()

/** 创建用于测试的 HookServer 实例，可指定独立 pipe 路径以避免相互干扰。 */
export function createTestHookServer(pipePath?: string): HookServer {
  return new HookServer(pipePath)
}
