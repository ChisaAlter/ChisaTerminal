import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/constants.js'
import type { HookMessage } from '../shared/types.js'

const CH = IPC_CHANNELS

// 按终端 ID 分发：单一 ipcRenderer 监听器按 terminalId 路由到对应回调集合，
// 避免 N 个终端实例各自注册全局监听导致的 N 倍回调开销。
const outputListeners = new Map<string, Set<(data: string) => void>>()
const exitListeners = new Map<string, Set<(exitCode: number) => void>>()
let outputListenerRegistered = false
let exitListenerRegistered = false

function ensureOutputListener(): void {
  if (outputListenerRegistered) return
  outputListenerRegistered = true
  ipcRenderer.on(CH.PTY.OUTPUT, (_event, terminalId: string, data: string) => {
    const set = outputListeners.get(terminalId)
    if (set) set.forEach((cb) => cb(data))
  })
}

function ensureExitListener(): void {
  if (exitListenerRegistered) return
  exitListenerRegistered = true
  ipcRenderer.on(CH.PTY.EXIT, (_event, terminalId: string, exitCode: number) => {
    const set = exitListeners.get(terminalId)
    if (set) set.forEach((cb) => cb(exitCode))
  })
}

contextBridge.exposeInMainWorld('electronAPI', {
  /** Reliable OS platform for shell escaping etc. (renderer process.platform is unavailable under contextIsolation). */
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke(CH.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.invoke(CH.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.invoke(CH.WINDOW.CLOSE),
    isMaximized: () => ipcRenderer.invoke(CH.WINDOW.IS_MAXIMIZED),
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      const listener = (_event: unknown, isMaximized: boolean) => callback(isMaximized)
      ipcRenderer.on(CH.WINDOW.MAXIMIZED_CHANGE, listener)
      return () => ipcRenderer.removeListener(CH.WINDOW.MAXIMIZED_CHANGE, listener)
    },
  },
  pty: {
    create: (terminalId: string, cwd?: string) =>
      ipcRenderer.invoke(CH.PTY.CREATE, terminalId, cwd),
    write: (terminalId: string, data: string) =>
      ipcRenderer.send(CH.PTY.WRITE, terminalId, data),
    resize: (terminalId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(CH.PTY.RESIZE, terminalId, cols, rows),
    close: (terminalId: string) =>
      ipcRenderer.invoke(CH.PTY.CLOSE, terminalId),
    getSessionCount: () =>
      ipcRenderer.invoke(CH.PTY.SESSION_COUNT),
    onOutputFor: (terminalId: string, callback: (data: string) => void) => {
      ensureOutputListener()
      let set = outputListeners.get(terminalId)
      if (!set) {
        set = new Set()
        outputListeners.set(terminalId, set)
      }
      set.add(callback)
      return () => {
        const s = outputListeners.get(terminalId)
        if (s) {
          s.delete(callback)
          if (s.size === 0) outputListeners.delete(terminalId)
        }
      }
    },
    onExitFor: (terminalId: string, callback: (exitCode: number) => void) => {
      ensureExitListener()
      let set = exitListeners.get(terminalId)
      if (!set) {
        set = new Set()
        exitListeners.set(terminalId, set)
      }
      set.add(callback)
      return () => {
        const s = exitListeners.get(terminalId)
        if (s) {
          s.delete(callback)
          if (s.size === 0) exitListeners.delete(terminalId)
        }
      }
    },
  },
  hook: {
    onMessage: (callback: (message: HookMessage) => void) => {
      const listener = (_event: unknown, message: HookMessage) => callback(message)
      ipcRenderer.on(CH.HOOK.MESSAGE, listener)
      return () => ipcRenderer.removeListener(CH.HOOK.MESSAGE, listener)
    },
  },
  storage: {
    get: (key: string) => ipcRenderer.invoke(CH.STORAGE.GET, key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke(CH.STORAGE.SET, key, value),
  },
  app: {
    reloadShortcuts: () =>
      ipcRenderer.invoke(CH.APP.RELOAD_SHORTCUTS),
  },
  wallpaper: {
    save: (dataUrl: string) =>
      ipcRenderer.invoke(CH.WALLPAPER.SAVE, dataUrl),
  },
  browser: {
    onOpenUrl: (callback: (url: string) => void) => {
      const listener = (_event: unknown, url: string) => callback(url)
      ipcRenderer.on(CH.BROWSER.OPEN_URL, listener)
      return () => ipcRenderer.removeListener(CH.BROWSER.OPEN_URL, listener)
    },
  },
})

declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<boolean>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
        onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
      }
      pty: {
        create: (terminalId: string, cwd?: string) => Promise<void>
        write: (terminalId: string, data: string) => void
        resize: (terminalId: string, cols: number, rows: number) => Promise<void>
        close: (terminalId: string) => Promise<void>
        getSessionCount: () => Promise<number>
        onOutputFor: (
          terminalId: string,
          callback: (data: string) => void
        ) => () => void
        onExitFor: (
          terminalId: string,
          callback: (exitCode: number) => void
        ) => () => void
      }
      hook: {
        onMessage: (
          callback: (message: HookMessage) => void
        ) => () => void
      }
      storage: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<void>
      }
      app: {
        reloadShortcuts: () => Promise<void>
      }
      wallpaper: {
        save: (dataUrl: string) => Promise<string>
      }
      browser: {
        onOpenUrl: (callback: (url: string) => void) => () => void
      }
    }
  }
}
