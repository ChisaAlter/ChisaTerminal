import { create } from 'zustand'
import { useEffect } from 'react'
import type { AppSettings, Language } from '../../shared/settings.js'
import { DEFAULT_SETTINGS } from '../../shared/settings.js'
import { DEFAULT_SETTINGS_KEY, LEGACY_SETTINGS_KEY } from '../../shared/constants.js'
import i18n from '../i18n/index.js'
import { updateSearchHistory } from '../utils/terminal-search.js'
import {
  BROWSER_SIDECAR_DEFAULT_WIDTH,
  clampBrowserWidth,
} from '../../shared/settings.js'

const storage = window.electronAPI?.storage

// 对持久化恢复的 settings 逐字段做类型校验，非法值从结果中剔除（回退到默认）。
// 防止存储被污染或迁移异常时传入非法类型导致运行时崩溃。
function sanitizeSettings(stored: unknown): Partial<AppSettings> {
  if (!stored || typeof stored !== 'object') return {}
  const s = stored as Record<string, unknown>
  const out: Partial<AppSettings> = {}

  if (typeof s.themeId === 'string') out.themeId = s.themeId
  if (typeof s.fontFamily === 'string') out.fontFamily = s.fontFamily
  if (typeof s.fontSize === 'number' && Number.isFinite(s.fontSize)) out.fontSize = s.fontSize
  if (s.cursorStyle === 'block' || s.cursorStyle === 'underline' || s.cursorStyle === 'bar') out.cursorStyle = s.cursorStyle
  if (typeof s.cursorBlink === 'boolean') out.cursorBlink = s.cursorBlink
  if (typeof s.scrollback === 'number' && Number.isFinite(s.scrollback)) out.scrollback = s.scrollback
  if (typeof s.minimizeToTray === 'boolean') out.minimizeToTray = s.minimizeToTray
  if (typeof s.confirmOnExit === 'boolean') out.confirmOnExit = s.confirmOnExit
  if (typeof s.globalHotkeyEnabled === 'boolean') out.globalHotkeyEnabled = s.globalHotkeyEnabled
  if (typeof s.globalHotkey === 'string') out.globalHotkey = s.globalHotkey
  if (Array.isArray(s.quickActions)) out.quickActions = s.quickActions as AppSettings['quickActions']
  if (s.language === 'zh-CN' || s.language === 'en') out.language = s.language
  if (typeof s.wallpaperUrl === 'string' || s.wallpaperUrl === null) {
    let url = s.wallpaperUrl as string | null
    if (url && url.startsWith('file://')) {
      // 旧版 file:///.../wallpapers/<name> 迁移到 chisa-wallpaper://<name>
      try {
        const parsed = new URL(url)
        const pathname = parsed.pathname
        const basename = pathname.split('/').filter(Boolean).pop() ?? ''
        if (basename) {
          url = `chisa-wallpaper://${basename}`
        } else {
          url = null
        }
      } catch {
        url = null
      }
    }
    out.wallpaperUrl = url
  }
  if (typeof s.wallpaperEnabled === 'boolean') out.wallpaperEnabled = s.wallpaperEnabled
  if (typeof s.wallpaperPixelated === 'boolean') out.wallpaperPixelated = s.wallpaperPixelated
  if (typeof s.wallpaperPixelationBlockSize === 'number' && Number.isFinite(s.wallpaperPixelationBlockSize)) out.wallpaperPixelationBlockSize = s.wallpaperPixelationBlockSize
  if (Array.isArray(s.searchHistory)) out.searchHistory = s.searchHistory as string[]
  if (typeof s.browserSidecarWidth === 'number' && Number.isFinite(s.browserSidecarWidth)) {
    out.browserSidecarWidth = clampBrowserWidth(s.browserSidecarWidth)
  }

  return out
}

function readLegacyThemeId(): string | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem('mux0-theme-storage')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentThemeId?: unknown } } | null
    const id = parsed?.state?.currentThemeId
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

function clearLegacyThemeStorage(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem('mux0-theme-storage')
  } catch {
    // ignore
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(settings: AppSettings) {
  if (!useSettingsStore.getState().isLoaded) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    storage?.set?.(DEFAULT_SETTINGS_KEY, settings).catch(() => {})
    saveTimer = null
  }, 400)
}

interface SettingsState {
  settings: AppSettings
  isLoaded: boolean
  setSettings: (settings: AppSettings) => void
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  patchSettings: (partial: Partial<AppSettings>) => void
  resetSettings: () => void
  loadSettings: () => Promise<void>
  addSearchHistory: (keyword: string) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoaded: false,
  setSettings: (settings: AppSettings) => set({ settings }),
  updateSetting: (key, value) => {
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }))
    if (key === 'language') {
      i18n.changeLanguage(value as Language)
    }
    scheduleSave(get().settings)
  },
  patchSettings: (partial) => {
    set((state) => ({
      settings: { ...state.settings, ...partial },
    }))
    scheduleSave(get().settings)
  },
  resetSettings: () => {
    set({ settings: { ...DEFAULT_SETTINGS } })
    scheduleSave(get().settings)
  },
  addSearchHistory: (keyword) => {
    const next = updateSearchHistory(get().settings.searchHistory, keyword, 50)
    set((state) => ({
      settings: { ...state.settings, searchHistory: next },
    }))
    scheduleSave(get().settings)
  },
  loadSettings: async () => {
    try {
      const legacyThemeId = readLegacyThemeId()
      if (!storage?.get) { set({ isLoaded: true }); return }
      // Prefer chisa.* keys; fall back to legacy mux0.* once, then re-save to new key.
      let stored = await storage.get(DEFAULT_SETTINGS_KEY)
      let migratedFromLegacy = false
      if (stored === undefined || stored === null) {
        stored = await storage.get(LEGACY_SETTINGS_KEY)
        if (stored !== undefined && stored !== null) migratedFromLegacy = true
      }
      const sanitized = sanitizeSettings(stored)
      const hasStoredThemeId = 'themeId' in sanitized
      let merged = { ...DEFAULT_SETTINGS, ...sanitized }
      if (!hasStoredThemeId && legacyThemeId) {
        merged = { ...merged, themeId: legacyThemeId }
      }
      i18n.changeLanguage(merged.language)
      set({ settings: merged, isLoaded: true })
      // Sync browser sidecar width into browser store (settings is source of truth)
      try {
        const { useBrowserStore } = await import('./useBrowserStore.js')
        const width =
          typeof merged.browserSidecarWidth === 'number'
            ? clampBrowserWidth(merged.browserSidecarWidth)
            : BROWSER_SIDECAR_DEFAULT_WIDTH
        useBrowserStore.setState({ width })
      } catch {
        // ignore circular init races in tests
      }
      if (migratedFromLegacy || (!hasStoredThemeId && legacyThemeId)) {
        try {
          await storage.set(DEFAULT_SETTINGS_KEY, merged)
          clearLegacyThemeStorage()
        } catch {
          // keep legacy storage if migration save fails
        }
      }
    } catch {
      set({ isLoaded: true })
    }
  },
}))

export function useInitializeSettings() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  useEffect(() => {
    loadSettings()
  }, [loadSettings])
}
