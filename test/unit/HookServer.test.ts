// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import { randomBytes } from 'node:crypto'
import { createTestHookServer, type HookServer } from '../../src/main/hooks/HookServer.js'

function createUniquePipePath(): string {
  const suffix = randomBytes(8).toString('hex')
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\mux0-hook-test-${suffix}`
  }
  return path.join(os.tmpdir(), `mux0-hook-test-${suffix}.sock`)
}

async function startServer(server: HookServer): Promise<void> {
  const ok = await server.start()
  expect(ok).toBe(true)
}

function connectClient(pipePath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(pipePath)
    client.on('connect', () => resolve(client))
    client.on('error', reject)
  })
}

async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('HookServer token validation', () => {
  let server: HookServer
  let pipePath: string

  beforeEach(() => {
    pipePath = createUniquePipePath()
    server = createTestHookServer(pipePath)
  })

  afterEach(async () => {
    await server.dispose()
    await waitFor(20)
  })

  it('forwards messages that carry the correct token', async () => {
    await startServer(server)
    const onMessage = vi.fn()
    server.onMessage = onMessage

    const client = await connectClient(pipePath)
    const msg = {
      terminalId: 'term-1',
      event: 'idle' as const,
      agent: 'powershell',
      at: Date.now(),
      cwd: 'C:\\Users',
      token: server.token,
    }

    client.write(JSON.stringify(msg) + '\n')
    await vi.waitFor(() => {
      expect(onMessage).toHaveBeenCalledTimes(1)
    })
    const forwarded = onMessage.mock.calls[0][0]
    expect(forwarded.terminalId).toBe('term-1')
    expect(forwarded.event).toBe('idle')
    expect(forwarded.cwd).toBe('C:\\Users')
    // 令牌不能随消息转发到渲染进程
    expect(forwarded.token).toBeUndefined()

    client.destroy()
  })

  it('drops messages with a missing token and disconnects the socket', async () => {
    await startServer(server)
    const onMessage = vi.fn()
    server.onMessage = onMessage

    const client = await connectClient(pipePath)
    const msg = {
      terminalId: 'term-1',
      event: 'idle' as const,
      agent: 'powershell',
      at: Date.now(),
    }

    client.write(JSON.stringify(msg) + '\n')
    await vi.waitFor(() => {
      expect(client.destroyed).toBe(true)
    })
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('drops messages with an invalid token and disconnects the socket', async () => {
    await startServer(server)
    const onMessage = vi.fn()
    server.onMessage = onMessage

    const client = await connectClient(pipePath)
    const msg = {
      terminalId: 'term-1',
      event: 'finished' as const,
      agent: 'powershell',
      at: Date.now(),
      exitCode: 0,
      token: 'forged-token',
    }

    client.write(JSON.stringify(msg) + '\n')
    await vi.waitFor(() => {
      expect(client.destroyed).toBe(true)
    })
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('does not forward anything before the server is started', () => {
    expect(server.token).toBe('')
    expect(server.validateToken('anything')).toBe(false)
  })

  it('regenerates token after restart', async () => {
    await startServer(server)
    const firstToken = server.token
    expect(firstToken.length).toBeGreaterThan(0)

    await server.stop()
    await startServer(server)
    const secondToken = server.token

    expect(secondToken.length).toBeGreaterThan(0)
    expect(secondToken).not.toBe(firstToken)
  })
})

describe('HookServer robustness', () => {
  let server: HookServer
  let pipePath: string

  beforeEach(() => {
    pipePath = createUniquePipePath()
    server = createTestHookServer(pipePath)
  })

  afterEach(async () => {
    await server.dispose()
    await waitFor(20)
  })

  it('destroys socket when receive buffer exceeds 1MB without newline', async () => {
    await startServer(server)
    const onMessage = vi.fn()
    server.onMessage = onMessage

    const client = await connectClient(pipePath)
    // 抑制服务端主动断开导致的 ECONNRESET，避免未处理错误
    client.on('error', () => {})

    // 发送超过 1MB 且不含换行的数据，触发缓冲区上限保护
    const oversized = 'x'.repeat(1024 * 1024 + 1024)
    client.write(oversized)
    await vi.waitFor(() => {
      expect(client.destroyed).toBe(true)
    })
    expect(onMessage).not.toHaveBeenCalled()

    client.destroy()
  })

  it('does not crash or forward on malformed JSON line', async () => {
    await startServer(server)
    const onMessage = vi.fn()
    server.onMessage = onMessage

    const client = await connectClient(pipePath)
    client.on('error', () => {})

    client.write('this is not valid json\n')
    await waitFor(50)

    expect(onMessage).not.toHaveBeenCalled()
    // 畸形 JSON 仅记录告警，不应断开连接
    expect(client.destroyed).toBe(false)

    client.destroy()
  })

  it('reassembles a message split across multiple TCP writes', async () => {
    await startServer(server)
    const onMessage = vi.fn()
    server.onMessage = onMessage

    const client = await connectClient(pipePath)
    client.on('error', () => {})

    const payload =
      JSON.stringify({
        terminalId: 'term-frag',
        event: 'running' as const,
        agent: 'powershell',
        at: Date.now(),
        token: server.token,
      }) + '\n'

    // 将同一条消息拆分为两次 write，模拟 TCP 分片
    const mid = Math.floor(payload.length / 2)
    client.write(payload.slice(0, mid))
    await waitFor(20)
    client.write(payload.slice(mid))
    await vi.waitFor(() => {
      expect(onMessage).toHaveBeenCalledTimes(1)
    })
    const forwarded = onMessage.mock.calls[0][0]
    expect(forwarded.terminalId).toBe('term-frag')
    expect(forwarded.event).toBe('running')
    expect(forwarded.token).toBeUndefined()

    client.destroy()
  })
})
