import { create } from 'zustand'
import {
  BROWSER_SIDECAR_DEFAULT_WIDTH,
  BROWSER_SIDECAR_MAX_WIDTH,
  BROWSER_SIDECAR_MIN_WIDTH,
  clampBrowserWidth,
} from '../../shared/settings.js'
import { useSettingsStore } from './useSettingsStore.js'

export {
  BROWSER_SIDECAR_DEFAULT_WIDTH,
  BROWSER_SIDECAR_MAX_WIDTH,
  BROWSER_SIDECAR_MIN_WIDTH,
  clampBrowserWidth,
}

export interface BrowserPanelState {
  url: string
  title: string
  isLoading: boolean
}

interface BrowserStoreState {
  activeTerminalId: string | null
  visible: boolean
  width: number
  isDragging: boolean
  panels: Record<string, BrowserPanelState>
  setActiveTerminal: (terminalId: string | null) => void
  toggleVisible: () => void
  openForTerminal: (terminalId: string, url?: string) => void
  closeForTerminal: (terminalId?: string) => void
  navigate: (terminalId: string, url: string) => string
  updatePanel: (terminalId: string, patch: Partial<BrowserPanelState>) => void
  resize: (width: number) => void
  removeTerminal: (terminalId: string) => void
  setDragging: (dragging: boolean) => void
}

// 拖拽侧栏时 resize 会高频触发，对 settings 持久化加防抖避免 IPC 拥塞
let resizePersistTimer: ReturnType<typeof setTimeout> | null = null

const LOCAL_HOST_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?(?:[/?#].*)?$/i
// 匹配任意带 scheme 的输入（scheme:// 或 scheme:），后续用 http/https 白名单校验
const SCHEME_LIKE_PATTERN = /^[a-z][a-z\d+.-]*:/i
const PORT_PATTERN = /^\d{1,5}$/
const HOST_WITH_PORT_PATTERN = /^[^\s/:?#]+(?::\d{1,5})(?:[/?#].*)?$/

function createPanel(url = ''): BrowserPanelState {
  return {
    url,
    title: '',
    isLoading: false,
  }
}

export function normalizeBrowserUrl(value: string): string {
  const input = value.trim()
  if (!input) return ''

  // 对 //host 开头的输入补 https: 前缀再 normalize
  if (input.startsWith('//')) {
    return normalizeBrowserUrl(`https:${input}`)
  }

  if (PORT_PATTERN.test(input)) {
    const port = Number(input)
    if (port > 0 && port <= 65535) {
      return `http://localhost:${port}`
    }
  }

  if (LOCAL_HOST_PATTERN.test(input)) {
    return `http://${input}`
  }

  if (HOST_WITH_PORT_PATTERN.test(input)) {
    // 非 localhost 的 host:port 使用 https（localhost 已由 LOCAL_HOST_PATTERN 处理）
    return `https://${input}`
  }

  // 含 scheme（scheme:// 或 scheme:）：用 http/https 白名单校验，
  // 其余（file/data/blob/javascript/vbscript/mailto 等）一律返回空字符串
  if (SCHEME_LIKE_PATTERN.test(input)) {
    try {
      const parsed = new URL(input)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href
      }
      return ''
    } catch {
      return ''
    }
  }

  return `https://${input}`
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  activeTerminalId: null,
  visible: false,
  width: BROWSER_SIDECAR_DEFAULT_WIDTH,
  isDragging: false,
  panels: {},
  setActiveTerminal: (terminalId) => {
    set({ activeTerminalId: terminalId })
  },
  toggleVisible: () => {
    set((state) => ({ visible: !state.visible }))
  },
  openForTerminal: (terminalId, url) => {
    const normalizedUrl = url ? normalizeBrowserUrl(url) : undefined
    set((state) => {
      const existing = state.panels[terminalId]
      return {
        activeTerminalId: terminalId,
        visible: true,
        panels: {
          ...state.panels,
          [terminalId]: existing
            ? { ...existing, ...(normalizedUrl !== undefined ? { url: normalizedUrl } : {}) }
            : createPanel(normalizedUrl),
        },
      }
    })
  },
  closeForTerminal: (terminalId) => {
    const state = get()
    const targetTerminalId = terminalId ?? state.activeTerminalId
    // 仅当 terminalId 为 active 或无参数时，同时设置 visible: false
    const shouldHide = !terminalId || terminalId === state.activeTerminalId
    set((s) => {
      if (!targetTerminalId) {
        return shouldHide ? { visible: false } : {}
      }
      // 无论 terminalId 是否为 active，都从 panels 中删除对应记录
      const { [targetTerminalId]: _removed, ...panels } = s.panels
      return {
        panels,
        ...(shouldHide ? { visible: false } : {}),
      }
    })
  },
  navigate: (terminalId, url) => {
    const normalizedUrl = normalizeBrowserUrl(url)
    set((state) => ({
      activeTerminalId: terminalId,
      visible: true,
      panels: {
        ...state.panels,
        [terminalId]: {
          ...(state.panels[terminalId] ?? createPanel()),
          url: normalizedUrl,
          isLoading: true,
        },
      },
    }))
    return normalizedUrl
  },
  updatePanel: (terminalId, patch) => {
    set((state) => ({
      panels: {
        ...state.panels,
        [terminalId]: {
          ...(state.panels[terminalId] ?? createPanel()),
          ...patch,
        },
      },
    }))
  },
  resize: (width) => {
    const clamped = clampBrowserWidth(width)
    set({ width: clamped })
    // 持久化到 AppSettings（ALLOWED_KEYS 白名单内），300ms 防抖
    if (resizePersistTimer) clearTimeout(resizePersistTimer)
    resizePersistTimer = setTimeout(() => {
      try {
        useSettingsStore.getState().updateSetting('browserSidecarWidth', clamped)
      } catch {
        // settings store may not be ready in tests
      }
      resizePersistTimer = null
    }, 300)
  },
  removeTerminal: (terminalId) => {
    set((state) => {
      const { [terminalId]: _removed, ...panels } = state.panels
      const isActiveTerminal = state.activeTerminalId === terminalId
      // 删除 panel 和清空 activeTerminalId 时保留 visible 状态不变
      return {
        panels,
        activeTerminalId: isActiveTerminal ? null : state.activeTerminalId,
      }
    })
  },
  setDragging: (dragging) => {
    set({ isDragging: dragging })
  },
}))
