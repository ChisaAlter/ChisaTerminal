import { globalShortcut } from 'electron'
import { toggleMainWindow } from './window.js'
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
      // 注册失败只记录日志：曾经向 renderer 发送 'shortcut:registerResult'，
      // 但该通道从未被 preload 暴露或监听，属于无效通知，已移除
      console.warn(`[Shortcuts] Failed to register global shortcut: ${accelerator} (already registered?)`)
    }
  } catch (err) {
    console.warn('[Shortcuts] Failed to register global shortcut:', err)
  }
}

export function reloadGlobalShortcuts(): void {
  registerGlobalShortcut()
}
