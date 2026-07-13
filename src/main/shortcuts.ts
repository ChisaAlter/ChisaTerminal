import { globalShortcut } from 'electron'
import { toggleMainWindow, getMainWindow } from './window.js'
import { store } from './store.js'
import { DEFAULT_SETTINGS_KEY, LEGACY_SETTINGS_KEY } from '../shared/constants.js'
import type { AppSettings } from '../shared/settings.js'
import { DEFAULT_SETTINGS } from '../shared/settings.js'

let currentHotkey: string | null = null

export function unregisterGlobalShortcut(): void {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
    currentHotkey = null
  }
}

export function registerGlobalShortcut(): void {
  unregisterGlobalShortcut()
  const settings =
    (store.get(DEFAULT_SETTINGS_KEY) as Partial<AppSettings> | undefined) ??
    (store.get(LEGACY_SETTINGS_KEY) as Partial<AppSettings> | undefined)
  const merged = { ...DEFAULT_SETTINGS, ...settings }
  if (!merged.globalHotkeyEnabled) {
    return
  }
  const accelerator = merged.globalHotkey
  if (!accelerator) {
    return
  }
  try {
    const success = globalShortcut.register(accelerator, () => {
      toggleMainWindow()
    })
    if (success) {
      currentHotkey = accelerator
    } else {
      console.warn(`[Shortcuts] Failed to register global shortcut: ${accelerator} (already registered?)`)
      getMainWindow()?.webContents.send('shortcut:registerResult', { success: false, accelerator })
    }
  } catch (err) {
    console.warn('[Shortcuts] Failed to register global shortcut:', err)
    getMainWindow()?.webContents.send('shortcut:registerResult', { success: false, accelerator })
  }
}

export function reloadGlobalShortcuts(): void {
  registerGlobalShortcut()
}
