import { Tray, Menu, nativeImage, app } from 'electron'
import { toggleMainWindow, setQuitting } from './window.js'
import { t } from './i18n.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null

function createTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', '..', 'resources', 'icon.png')
  const image = nativeImage.createFromPath(iconPath)
  return image.resize({ width: 16, height: 16 })
}

export function createTray(): Tray {
  if (tray) {
    return tray
  }

  const icon = createTrayIcon()
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: t('tray.toggle_window'),
      click: () => toggleMainWindow(),
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        setQuitting(true)
        app.quit()
      },
    },
  ])

  tray.setToolTip('ChisaTerminal')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    toggleMainWindow()
  })

  return tray
}

export function getTray(): Tray | null {
  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
