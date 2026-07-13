import { store } from './store.js'
import { DEFAULT_SETTINGS_KEY, LEGACY_SETTINGS_KEY } from '../shared/constants.js'
import { DEFAULT_SETTINGS, type AppSettings, type Language } from '../shared/settings.js'

const messages: Record<Language, Record<string, string>> = {
  'zh-CN': {
    'dialog.exit.title': '确认退出',
    'dialog.exit.message': '当前有 {{count}} 个活动终端会话，确定要退出吗？',
    'dialog.exit.cancel': '取消',
    'dialog.exit.quit': '退出',
    'dialog.hook.title': 'Hook 服务警告',
    'dialog.hook.message': 'Hook 服务启动失败，Agent 钩子功能将不可用。',
  },
  'en': {
    'dialog.exit.title': 'Confirm Exit',
    'dialog.exit.message': 'There are {{count}} active terminal session(s). Are you sure you want to quit?',
    'dialog.exit.cancel': 'Cancel',
    'dialog.exit.quit': 'Quit',
    'dialog.hook.title': 'Hook Server Warning',
    'dialog.hook.message': 'Failed to start hook server. Agent hooks will be unavailable.',
  },
}

function getLanguage(): Language {
  try {
    const stored =
      (store.get(DEFAULT_SETTINGS_KEY) as Partial<AppSettings> | undefined) ??
      (store.get(LEGACY_SETTINGS_KEY) as Partial<AppSettings> | undefined)
    return (stored?.language ?? DEFAULT_SETTINGS.language) as Language
  } catch {
    return DEFAULT_SETTINGS.language
  }
}

export function t(key: string, params?: Record<string, unknown>): string {
  const lang = getLanguage()
  const dict = messages[lang] ?? messages['zh-CN']
  let s = dict[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      s = s.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), String(v))
    }
  }
  return s
}
