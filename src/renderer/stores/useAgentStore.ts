import { create } from 'zustand'
import type { HookMessage } from '../../shared/types.js'

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error'

// 每个 terminalId 一个状态（来自 hook 上报）
export interface TerminalHookState {
  terminalId: string
  status: AgentStatus
  command: string | null
  cwd: string | null
  exitCode: number | null
  lastUpdate: number
}

export interface AgentState {
  // 全局展示用（聚焦终端的派生状态）
  status: AgentStatus
  // 每个 terminal 的细粒度状态
  terminalStates: Record<string, TerminalHookState>
  // 当前聚焦的 terminalId（由 App 设置，用于派生全局展示）
  focusedTerminalId: string | null

  setFocusedTerminalId: (id: string | null) => void
  updateFromHook: (msg: HookMessage) => void
  removeTerminalState: (terminalId: string) => void
  reset: () => void
}

// hook event → AgentStatus
function eventToStatus(event: HookMessage['event']): AgentStatus {
  switch (event) {
    case 'running':
      return 'working'
    case 'finished':
      return 'idle'
    case 'idle':
      return 'idle'
    case 'needsInput':
      return 'thinking'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

export const useAgentStore = create<AgentState>((set, get) => ({
  status: 'idle',
  terminalStates: {},
  focusedTerminalId: null,

  setFocusedTerminalId: (id) => {
    // 合并为单次 set，避免先 set focusedTerminalId 再 set derived 触发两次订阅
    const t = id ? get().terminalStates[id] : undefined
    set({ focusedTerminalId: id, ...deriveFromTerminal(t) })
  },

  updateFromHook: (msg) => {
    const status = eventToStatus(msg.event)
    const next: TerminalHookState = {
      terminalId: msg.terminalId,
      status,
      command: msg.command ?? null,
      cwd: msg.cwd ?? null,
      exitCode: msg.exitCode ?? null,
      lastUpdate: msg.at,
    }
    const terminalStates = { ...get().terminalStates, [msg.terminalId]: next }

    // 如果消息属于当前聚焦 terminal，同步派生全局状态
    const focusedId = get().focusedTerminalId
    let patch: Partial<AgentState> = { terminalStates }
    if (focusedId === msg.terminalId) {
      patch = { ...patch, ...deriveFromTerminal(next) }
    }
    set(patch)
  },

  removeTerminalState: (terminalId) => {
    set((state) => {
      if (!(terminalId in state.terminalStates)) return state
      const { [terminalId]: _removed, ...rest } = state.terminalStates
      const patch: Partial<AgentState> = { terminalStates: rest }
      // 若移除的是当前聚焦 terminal，清空聚焦并重置全局派生状态
      if (state.focusedTerminalId === terminalId) {
        patch.focusedTerminalId = null
        Object.assign(patch, deriveFromTerminal(undefined))
      }
      return patch
    })
  },

  reset: () =>
    set({
      status: 'idle',
      terminalStates: {},
      focusedTerminalId: null,
    }),
}))

// 从 terminal 状态派生全局展示字段
function deriveFromTerminal(t: TerminalHookState | undefined): Partial<AgentState> {
  return { status: t?.status ?? 'idle' }
}
