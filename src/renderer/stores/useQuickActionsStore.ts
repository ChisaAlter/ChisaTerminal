import { create } from 'zustand'
import { useEffect } from 'react'
import type { QuickAction } from '../../shared/types.js'
import { useSettingsStore } from './useSettingsStore.js'

const api = typeof window !== 'undefined' ? window.electronAPI : undefined

const SAFE_SHELL_ARG_RE = /^[A-Za-z0-9_.:\\/-]+$/

export type ShellPlatform = 'win32' | 'unix'

/**
 * Resolve shell escaping platform from an explicit signal.
 * Prefer preload-injected `electronAPI.platform`; never rely on renderer `process.platform` alone.
 */
export function resolveShellPlatform(
  platformHint?: string | null
): ShellPlatform {
  if (platformHint === 'win32') return 'win32'
  if (
    platformHint === 'darwin' ||
    platformHint === 'linux' ||
    platformHint === 'unix'
  ) {
    return 'unix'
  }
  // Preload-injected platform (reliable in Electron renderer)
  const injected =
    typeof window !== 'undefined'
      ? (window as Window & { electronAPI?: { platform?: string } }).electronAPI?.platform
      : undefined
  if (injected === 'win32') return 'win32'
  if (injected === 'darwin' || injected === 'linux') return 'unix'
  // Browser/userAgent fallback (tests / non-Electron)
  if (typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)) {
    return 'win32'
  }
  return 'unix'
}

export function escapeShellArg(
  value: string,
  platform: ShellPlatform = resolveShellPlatform()
): string {
  if (SAFE_SHELL_ARG_RE.test(value)) return value
  if (platform === 'win32') {
    // Windows (cmd/PowerShell): wrap in double quotes. Escape only double quotes
    // (as \") and percent signs (as %%, to prevent cmd variable expansion).
    // Backslashes are path separators and must NOT be doubled.
    return `"${value.replace(/"/g, '\\"').replace(/%/g, '%%')}"`
  }
  // Unix (bash): wrap in double quotes and escape backslash, double quote,
  // backtick, and dollar sign.
  return `"${value.replace(/[\\"`$]/g, '\\$&')}"`
}

/**
 * Pure substitution used by injectAction and unit tests.
 * Returns the command string that will be written to the PTY (includes trailing `\r`).
 */
export function buildInjectedCommand(
  action: QuickAction,
  context: { cwd?: string | null; tabTitle?: string | null },
  platform: ShellPlatform = resolveShellPlatform()
): string {
  let cmd = action.command
  if (context.cwd) {
    cmd = cmd
      .replace(/\{cwd:raw\}/g, context.cwd)
      .replace(/\{cwd\}/g, escapeShellArg(context.cwd, platform))
  }
  if (context.tabTitle) {
    cmd = cmd
      .replace(/\{tab:raw\}/g, context.tabTitle)
      .replace(/\{tab\}/g, escapeShellArg(context.tabTitle, platform))
  }
  return cmd + '\r'
}

interface QuickActionsState {
  actions: QuickAction[]
  syncFromSettings: (actions: QuickAction[]) => void
  addAction: (name: string, command: string) => string
  updateAction: (id: string, patch: Partial<Pick<QuickAction, 'name' | 'command'>>) => void
  removeAction: (id: string) => void
  injectAction: (
    terminalId: string,
    action: QuickAction,
    context: { cwd?: string | null; tabTitle?: string | null }
  ) => void
}

function persistToSettings(actions: QuickAction[]): void {
  useSettingsStore.getState().updateSetting('quickActions', actions)
}

export const useQuickActionsStore = create<QuickActionsState>((set, get) => ({
  actions: [],

  syncFromSettings: (actions) => set({ actions: actions ?? [] }),

  addAction: (name, command) => {
    const id = crypto.randomUUID()
    const action: QuickAction = { id, name: name.trim(), command }
    const next = [...get().actions, action]
    set({ actions: next })
    persistToSettings(next)
    return id
  },

  updateAction: (id, patch) => {
    const next = get().actions.map((a) =>
      a.id === id ? { ...a, ...patch } : a
    )
    set({ actions: next })
    persistToSettings(next)
  },

  removeAction: (id) => {
    const next = get().actions.filter((a) => a.id !== id)
    set({ actions: next })
    persistToSettings(next)
  },

  injectAction: (terminalId, action, context) => {
    if (!terminalId) return
    const platform = resolveShellPlatform(api?.platform)
    const payload = buildInjectedCommand(action, context, platform)
    api?.pty?.write?.(terminalId, payload)
  },
}))

// 将 settings.quickActions 单向同步到本 store
export function useSyncQuickActions() {
  const quickActions = useSettingsStore((s) => s.settings.quickActions)
  const syncFromSettings = useQuickActionsStore((s) => s.syncFromSettings)
  useEffect(() => {
    syncFromSettings(quickActions)
  }, [quickActions, syncFromSettings])
}
