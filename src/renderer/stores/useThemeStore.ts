import { create } from 'zustand'
import { themes, applyThemeToDocument, type Theme } from '../themes/index.js'
import { useSettingsStore } from './useSettingsStore.js'

interface ThemeState {
  currentThemeId: string
  themes: Theme[]
  setTheme: (themeId: string) => void
  getCurrentTheme: () => Theme | undefined
}

// 仅作为 store 初始状态值，不在模块导入时 apply 到 document。
// 首次主题应用发生在 settings 加载完成后（见下方 subscribe），
// 避免模块导入时先 apply 默认主题、加载后又切换导致的闪烁。
const initialThemeId = useSettingsStore.getState().settings.themeId || 'dracula'

export const useThemeStore = create<ThemeState>((set, get) => ({
  currentThemeId: initialThemeId,
  themes,
  setTheme: (themeId: string) => {
    const theme = themes.find((t) => t.id === themeId)
    if (theme) {
      applyThemeToDocument(theme)
      set({ currentThemeId: themeId })
    }
  },
  getCurrentTheme: () => {
    return themes.find((t) => t.id === get().currentThemeId)
  },
}))

useSettingsStore.subscribe((state, prevState) => {
  if (state.settings.themeId !== prevState.settings.themeId) {
    useThemeStore.getState().setTheme(state.settings.themeId)
  } else if (state.isLoaded && !prevState.isLoaded) {
    // settings 加载完成后首次应用主题，替代模块导入时的 apply
    useThemeStore.getState().setTheme(state.settings.themeId)
  }
})
