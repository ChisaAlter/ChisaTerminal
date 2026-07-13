import { ipcMain, WebContents, BrowserWindow, webContents as wcModule } from 'electron'
import fs from 'node:fs'
import { IPC_CHANNELS } from '../shared/constants.js'
import { PtyManager } from './pty/PtyManager.js'
import type { HookServer } from './hooks/HookServer.js'
import type { HookMessage } from '../shared/types.js'
import {
  canAccessTerminal,
  trackOwnership,
  untrackOwnership,
  clearOwnershipForWebContents,
  getOwnerWebContentsId,
} from './pty/ptyOwnership.js'

export { canAccessTerminal } from './pty/ptyOwnership.js'
export const ptyManager = new PtyManager()

/**
 * Wire HookServer messages to the renderer: forward each message to the
 * webContents that owns the terminalId (broadcast to all windows if unknown).
 */
export function attachHookForwarder(server: HookServer): void {
  server.onMessage = (msg: HookMessage) => {
    const wc = findWebContentsForTerminal(msg.terminalId)
    if (wc && !wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.HOOK.MESSAGE, msg)
      return
    }
    // Fallback: broadcast to all windows
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.HOOK.MESSAGE, msg)
      }
    }
  }
}

function findWebContentsForTerminal(terminalId: string): WebContents | null {
  const wcId = getOwnerWebContentsId(terminalId)
  if (wcId === undefined) return null
  const wc = wcModule.fromId(wcId)
  if (wc && !wc.isDestroyed()) {
    return wc
  }
  return null
}

interface OutputBuffer {
  chunks: string[]
  scheduled: boolean
  wc: WebContents
}

const outputBuffers = new Map<string, OutputBuffer>()
const HIGH_WATER_MARK = 1024 * 1024
const trackedWcDestroyed = new Set<number>()

function flushOutput(terminalId: string) {
  const buf = outputBuffers.get(terminalId)
  if (!buf) return
  buf.scheduled = false
  if (buf.chunks.length === 0) return
  const data = buf.chunks.join('')
  buf.chunks.length = 0
  if (!buf.wc.isDestroyed()) {
    buf.wc.send(IPC_CHANNELS.PTY.OUTPUT, terminalId, data)
  }
}

function scheduleFlush(terminalId: string) {
  const buf = outputBuffers.get(terminalId)
  if (!buf || buf.scheduled) return
  buf.scheduled = true
  setImmediate(() => flushOutput(terminalId))
}

function trackTerminal(wc: WebContents, terminalId: string) {
  trackOwnership(wc.id, terminalId)

  if (!trackedWcDestroyed.has(wc.id)) {
    trackedWcDestroyed.add(wc.id)
    wc.once('destroyed', () => {
      trackedWcDestroyed.delete(wc.id)
      const ids = clearOwnershipForWebContents(wc.id)
      for (const tid of ids) {
        ptyManager.closeSession(tid)
        outputBuffers.delete(tid)
      }
    })
  }
}

function isValidTerminalId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && /^[\w\-:]+$/.test(id)
}

ipcMain.handle(IPC_CHANNELS.PTY.CREATE, async (event, terminalId: string, cwd?: string) => {
  if (!isValidTerminalId(terminalId)) return
  const webContents = event.sender
  trackTerminal(webContents, terminalId)

  if (!outputBuffers.has(terminalId)) {
    outputBuffers.set(terminalId, { chunks: [], scheduled: false, wc: webContents })
  } else {
    outputBuffers.get(terminalId)!.wc = webContents
  }

  if (cwd !== undefined) {
    if (typeof cwd !== 'string' || cwd.length > 1024) {
      console.warn(`[PTY] Invalid cwd for ${terminalId} (non-string or too long), falling back to default`)
      cwd = undefined
    } else {
      try {
        const stat = fs.statSync(cwd)
        if (!stat.isDirectory()) {
          console.warn(`[PTY] cwd for ${terminalId} is not a directory, falling back to default: ${cwd}`)
          cwd = undefined
        }
      } catch {
        console.warn(`[PTY] cwd for ${terminalId} does not exist or is inaccessible, falling back to default: ${cwd}`)
        cwd = undefined
      }
    }
  }

  ptyManager.createSession(terminalId, cwd, (data) => {
    if (webContents.isDestroyed()) return
    const buf = outputBuffers.get(terminalId)
    if (!buf) return
    buf.chunks.push(data)
    let total = 0
    for (const c of buf.chunks) total += c.length
    if (total > HIGH_WATER_MARK) {
      buf.chunks.shift()
      console.warn(`[PTY] Output buffer for ${terminalId} exceeded high water mark, dropping oldest chunk`)
    }
    scheduleFlush(terminalId)
  }, (exitCode) => {
    if (!webContents.isDestroyed()) {
      webContents.send(IPC_CHANNELS.PTY.EXIT, terminalId, exitCode)
    }
    outputBuffers.delete(terminalId)
  })
})

ipcMain.on(IPC_CHANNELS.PTY.WRITE, (event, terminalId: string, data: string) => {
  if (!isValidTerminalId(terminalId)) return
  if (!canAccessTerminal(event.sender.id, terminalId)) {
    console.warn(`[PTY] Rejected write for unowned terminal ${terminalId} from wc=${event.sender.id}`)
    return
  }
  if (typeof data !== 'string') return
  const MAX_WRITE = 1024 * 1024
  if (data.length > MAX_WRITE) {
    console.warn(`[PTY] Write data for ${terminalId} exceeds 1MB (${data.length} bytes), truncating`)
    data = data.slice(0, MAX_WRITE)
  }
  ptyManager.write(terminalId, data)
})

ipcMain.handle(IPC_CHANNELS.PTY.RESIZE, (event, terminalId: string, cols: number, rows: number) => {
  if (!isValidTerminalId(terminalId)) return
  if (!canAccessTerminal(event.sender.id, terminalId)) {
    console.warn(`[PTY] Rejected resize for unowned terminal ${terminalId} from wc=${event.sender.id}`)
    return
  }
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) return
  if (cols < 1 || cols > 500 || rows < 1 || rows > 500) return
  ptyManager.resize(terminalId, cols, rows)
})

ipcMain.handle(IPC_CHANNELS.PTY.CLOSE, (event, terminalId: string) => {
  if (!isValidTerminalId(terminalId)) return
  if (!canAccessTerminal(event.sender.id, terminalId)) {
    console.warn(`[PTY] Rejected close for unowned terminal ${terminalId} from wc=${event.sender.id}`)
    return
  }
  ptyManager.closeSession(terminalId)
  outputBuffers.delete(terminalId)
  untrackOwnership(event.sender.id, terminalId)
})

ipcMain.handle(IPC_CHANNELS.PTY.SESSION_COUNT, () => {
  return ptyManager.getSessionCount()
})
