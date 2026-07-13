import { app, BrowserWindow, ipcMain, dialog, Menu, protocol } from 'electron'
import { createMainWindow, getMainWindow, setQuitting } from './window.js'
import { createTray, destroyTray } from './tray.js'
import { registerGlobalShortcut, unregisterGlobalShortcut, reloadGlobalShortcuts } from './shortcuts.js'
import { IPC_CHANNELS } from '../shared/constants.js'
import { ptyManager, attachHookForwarder } from './pty-ipc.js'
import { hookServer } from './hooks/HookServer.js'
import { t } from './i18n.js'
import './ipc.js'

const isDev = !app.isPackaged

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
})

if (isDev) {
  process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'
}

// 注册特权自定义协议，必须在 app ready 之前调用，且只能调用一次
protocol.registerSchemesAsPrivileged([
  { scheme: 'chisa-wallpaper', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    createMainWindow()
  })

  app.whenReady().then(async () => {
    createMainWindow()
    createTray()
    Menu.setApplicationMenu(null)
    registerGlobalShortcut()

    // Start hook server (Named Pipe on Windows / Unix socket elsewhere)
    const hookOk = await hookServer.start()
    if (!hookOk) {
      dialog.showErrorBox(t('dialog.hook.title'), t('dialog.hook.message'))
    } else {
      attachHookForwarder(hookServer)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      } else {
        const existingWin = getMainWindow()
        if (existingWin) {
          existingWin.show()
          existingWin.focus()
        }
      }
    })
  })

  app.on('before-quit', () => {
    setQuitting(true)
    unregisterGlobalShortcut()
  })

  app.on('will-quit', () => {
    unregisterGlobalShortcut()
    ptyManager.closeAll()
    hookServer.stop()
    destroyTray()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

ipcMain.handle(IPC_CHANNELS.WINDOW.MINIMIZE, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.minimize()
})

ipcMain.handle(IPC_CHANNELS.WINDOW.MAXIMIZE, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
  return win?.isMaximized() ?? false
})

ipcMain.handle(IPC_CHANNELS.WINDOW.IS_MAXIMIZED, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win?.isMaximized() ?? false
})

ipcMain.handle(IPC_CHANNELS.WINDOW.CLOSE, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.close()
})

ipcMain.handle(IPC_CHANNELS.APP.RELOAD_SHORTCUTS, () => {
  reloadGlobalShortcuts()
})
