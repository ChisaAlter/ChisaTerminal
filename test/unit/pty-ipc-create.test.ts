// @vitest-environment node
/**
 * Handler-level tests for pty:create / pty:write ownership enforcement.
 * Electron and PtyManager are mocked; the real ptyOwnership maps are used.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
const onHandlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, fn)
    },
    on: (channel: string, fn: (...args: unknown[]) => unknown) => {
      onHandlers.set(channel, fn)
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
  webContents: { fromId: () => null },
}))

const createSession = vi.fn()
const closeSession = vi.fn()
const write = vi.fn()

vi.mock('../../src/main/pty/PtyManager.js', () => ({
  PtyManager: class {
    createSession = createSession
    closeSession = closeSession
    write = write
    resize = vi.fn()
    getSessionCount = vi.fn(() => 0)
    closeAll = vi.fn()
  },
}))

const { resetOwnershipMaps } = await import('../../src/main/pty/ptyOwnership.js')
const { IPC_CHANNELS } = await import('../../src/shared/constants.js')
await import('../../src/main/pty-ipc.js')

interface FakeSender {
  id: number
  isDestroyed: () => boolean
  once: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

function fakeEvent(wcId: number): { sender: FakeSender } {
  return {
    sender: {
      id: wcId,
      isDestroyed: () => false,
      once: vi.fn(),
      send: vi.fn(),
    },
  }
}

function invokeCreate(wcId: number, terminalId: string) {
  const handler = invokeHandlers.get(IPC_CHANNELS.PTY.CREATE)!
  return handler(fakeEvent(wcId), terminalId, undefined) as Promise<{
    ok: boolean
    error?: string
  }>
}

function invokeClose(wcId: number, terminalId: string) {
  const handler = invokeHandlers.get(IPC_CHANNELS.PTY.CLOSE)!
  return handler(fakeEvent(wcId), terminalId)
}

function sendWrite(wcId: number, terminalId: string, data: string) {
  const handler = onHandlers.get(IPC_CHANNELS.PTY.WRITE)!
  return handler(fakeEvent(wcId), terminalId, data)
}

describe('pty:create ownership enforcement', () => {
  beforeEach(() => {
    resetOwnershipMaps()
    createSession.mockClear()
    closeSession.mockClear()
    write.mockClear()
  })

  it('registers the create handler', () => {
    expect(invokeHandlers.has(IPC_CHANNELS.PTY.CREATE)).toBe(true)
  })

  it('allows the first create and tracks ownership', async () => {
    const result = await invokeCreate(1, 'term-a')
    expect(result).toEqual({ ok: true })
    expect(createSession).toHaveBeenCalledTimes(1)
  })

  it('rejects create for a terminal owned by another webContents', async () => {
    await invokeCreate(1, 'term-a')
    createSession.mockClear()

    const result = await invokeCreate(2, 'term-a')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('owned-by-other-webcontents')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('allows the owning webContents to re-create its own terminal', async () => {
    await invokeCreate(1, 'term-a')
    const result = await invokeCreate(1, 'term-a')
    expect(result).toEqual({ ok: true })
  })

  it('allows create after the owner closed the terminal', async () => {
    await invokeCreate(1, 'term-a')
    await invokeClose(1, 'term-a')

    const result = await invokeCreate(2, 'term-a')
    expect(result).toEqual({ ok: true })
  })

  it('rejects invalid terminal ids', async () => {
    const result = await invokeCreate(1, '../evil')
    expect(result.ok).toBe(false)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('write is rejected for non-owners and allowed for the owner', async () => {
    await invokeCreate(1, 'term-a')

    sendWrite(2, 'term-a', 'stolen input')
    expect(write).not.toHaveBeenCalled()

    sendWrite(1, 'term-a', 'echo hi')
    expect(write).toHaveBeenCalledWith('term-a', 'echo hi')
  })
})
