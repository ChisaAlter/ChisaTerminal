import type { QuickAction } from './types.js'

export type Language = 'zh-CN' | 'en'

export const BROWSER_SIDECAR_MIN_WIDTH = 280
export const BROWSER_SIDECAR_MAX_WIDTH = 900
export const BROWSER_SIDECAR_DEFAULT_WIDTH = 420

/** Clamp browser sidecar width into the allowed range (280–900). */
export function clampBrowserWidth(width: number): number {
  if (!Number.isFinite(width)) return BROWSER_SIDECAR_DEFAULT_WIDTH
  return Math.min(
    BROWSER_SIDECAR_MAX_WIDTH,
    Math.max(BROWSER_SIDECAR_MIN_WIDTH, Math.round(width))
  )
}

export interface AppSettings {
  themeId: string
  fontFamily: string
  fontSize: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  scrollback: number
  minimizeToTray: boolean
  confirmOnExit: boolean
  globalHotkeyEnabled: boolean
  globalHotkey: string
  quickActions: QuickAction[]
  language: Language
  wallpaperUrl: string | null
  wallpaperEnabled: boolean
  wallpaperPixelated: boolean
  wallpaperPixelationBlockSize: number
  /** 搜索历史记录，约定最大保留 50 条（追加时强制截断）。 */
  searchHistory: string[]
  /** Browser 侧栏宽度（px），约定范围 280–900。 */
  browserSidecarWidth: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'dracula',
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 14,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  minimizeToTray: false,
  confirmOnExit: true,
  globalHotkeyEnabled: true,
  globalHotkey: 'Ctrl+`',
  quickActions: [],
  language: 'zh-CN',
  wallpaperUrl: null,
  wallpaperEnabled: false,
  wallpaperPixelated: false,
  wallpaperPixelationBlockSize: 16,
  searchHistory: [],
  browserSidecarWidth: BROWSER_SIDECAR_DEFAULT_WIDTH,
}
