import { app, BrowserWindow, dialog, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { store } from './store.js'
import { DEFAULT_SETTINGS_KEY, LEGACY_SETTINGS_KEY, IPC_CHANNELS } from '../shared/constants.js'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/settings.js'
import { ptyManager } from './pty-ipc.js'
import { t } from './i18n.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let isQuitting = false

export function setQuitting(quitting: boolean) {
  isQuitting = quitting
}

function getSettings(): AppSettings {
  const stored =
    (store.get(DEFAULT_SETTINGS_KEY) as Partial<AppSettings> | undefined) ??
    (store.get(LEGACY_SETTINGS_KEY) as Partial<AppSettings> | undefined)
  return { ...DEFAULT_SETTINGS, ...stored }
}

function attachWindowHandlers(win: BrowserWindow) {
  win.on('close', (e) => {
    if (isQuitting) {
      return
    }
    const settings = getSettings()

    if (settings.minimizeToTray) {
      e.preventDefault()
      win.hide()
      if (process.platform === 'darwin') {
        app.dock?.hide?.()
      }
      return
    }

    if (settings.confirmOnExit && ptyManager.getSessionCount() > 0) {
      e.preventDefault()
      const choice = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: [t('dialog.exit.cancel'), t('dialog.exit.quit')],
        defaultId: 0,
        cancelId: 0,
        message: t('dialog.exit.title'),
        detail: t('dialog.exit.message', { count: ptyManager.getSessionCount() }),
      })
      if (choice === 1) {
        isQuitting = true
        app.quit()
      }
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  win.on('maximize', () => {
    win.webContents.send(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, true)
  })

  win.on('unmaximize', () => {
    win.webContents.send(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, false)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    // 链接点击统一交给 renderer 处理（在右侧 BrowserSidecar 打开），
    // 不再调用 shell.openExternal 打开系统浏览器，避免 Windows 弹窗和卡死。
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        win.webContents.send(IPC_CHANNELS.BROWSER.OPEN_URL, url)
      }
    } catch {
      console.warn('[Window] Blocked invalid URL:', url)
    }
    return { action: 'deny' }
  })

  // 防御：阻止主窗口页面导航（如 <a href> 点击、JS location 赋值），
  // 避免主窗口离开 React 应用导致白屏。http/https 链接转发到 BrowserSidecar。
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        win.webContents.send(IPC_CHANNELS.BROWSER.OPEN_URL, url)
      }
    } catch {
      console.warn('[Window] Blocked navigation to:', url)
    }
  })
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  // e2e / explicit prod: load dist renderer even when not packaged (electron .)
  const forceProdUi =
    process.env.NODE_ENV === 'e2e-test' ||
    process.env.CHISA_E2E === '1' ||
    process.env.CHISA_PROD === '1'
  const isDev =
    !forceProdUi &&
    (!app.isPackaged ||
      process.env.CHISA_DEV === 'true' ||
      process.env.MUX0_DEV === 'true')
  // Allow emergency rollback: CHISA_SANDBOX=0 disables sandbox if a preload edge case appears.
  const sandboxEnabled = process.env.CHISA_SANDBOX !== '0'

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1e1e2e',
    title: 'ChisaTerminal',
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: 'rgba(0, 0, 0, 0)',
            symbolColor: '#cdd6f4',
            height: 36,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: sandboxEnabled,
      // 启用 <webview> 标签，用于右侧 BrowserSidecar 加载外部页面
      webviewTag: true,
    },
  })

  // Diagnose missing preload / electronAPI in production builds
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Window] preload-error:', preloadPath, error)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow?.webContents
      .executeJavaScript('!!window.electronAPI && !!window.electronAPI.pty')
      .then((ok) => {
        if (!ok) {
          console.error(
            '[Window] electronAPI.pty missing after load — preload failed or sandbox blocked bridge'
          )
        }
      })
      .catch((err) => console.error('[Window] post-load probe failed:', err))
  })

  const csp = isDev
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: file: chisa-wallpaper:",
        "font-src 'self' data:",
        "connect-src 'self' ws://localhost:5173 http://localhost:5173",
        // 允许 BrowserSidecar 的 iframe 加载任意 http/https 页面；
        // iframe sandbox 未授予 allow-same-origin，无法访问父 API，安全。
        "frame-src 'self' http: https:",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: file: chisa-wallpaper:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-src 'self' http: https:",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  // browser-sidecar partition：剥离响应头中的 X-Frame-Options 和 CSP 的 frame-ancestors
  // 指令，使 webview 能加载带这些头的外部页面（webview 自身已通过 sandbox / nodeIntegration=false 隔离）。
  session.fromPartition('browser-sidecar').webRequest.onHeadersReceived((details, callback) => {
    const sourceHeaders = details.responseHeaders ?? {}
    const headers: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(sourceHeaders)) {
      const lower = key.toLowerCase()
      if (lower === 'x-frame-options') {
        continue
      }
      if (lower === 'content-security-policy') {
        const filtered = value
          .map((v) => v.replace(/frame-ancestors\s+[^;]+;?/gi, ''))
          .filter((v) => v.trim().length > 0)
        if (filtered.length === 0) {
          continue
        }
        headers[key] = filtered
        continue
      }
      headers[key] = value
    }
    callback({ responseHeaders: headers })
  })

  // 校验 <webview> 挂载参数：阻止 nodeIntegration / 关闭 webSecurity 的请求，强制 sandbox，
  // 并校验 src scheme 为 http/https，防止加载 file:/data: 等危险协议。
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (webPreferences.nodeIntegration === true || webPreferences.webSecurity === false) {
      event.preventDefault()
      console.warn('[Window] Blocked unsafe <webview>: nodeIntegration/disableWebSecurity requested')
      return
    }
    webPreferences.nodeIntegration = false
    webPreferences.webSecurity = true
    webPreferences.sandbox = true

    const src = params.src
    if (typeof src === 'string' && src.length > 0) {
      try {
        const parsed = new URL(src)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          event.preventDefault()
          console.warn('[Window] Blocked <webview> with non-http(s) src:', src)
        }
      } catch {
        event.preventDefault()
        console.warn('[Window] Blocked <webview> with invalid src:', src)
      }
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'))
  }

  attachWindowHandlers(mainWindow)

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function toggleMainWindow(): void {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isVisible()) {
    if (mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}
