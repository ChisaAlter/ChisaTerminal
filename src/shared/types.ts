export interface Workspace {
  id: string
  name: string
  tabs: TerminalTab[]
  selectedTabId: string | null
}

export interface TerminalTab {
  id: string
  title: string
  layout: SplitNode
  focusedTerminalId: string
  userRenamed: boolean
}

export type SplitDirection = 'horizontal' | 'vertical'

export type SplitNode =
  | { type: 'terminal'; terminalId: string; lastCwd?: string }
  | {
      type: 'split'
      splitId: string
      direction: SplitDirection
      ratio: number
      first: SplitNode
      second: SplitNode
    }

export interface HookMessage {
  terminalId: string
  event: 'running' | 'idle' | 'needsInput' | 'finished' | 'error'
  agent: string
  at: number
  exitCode?: number
  toolDetail?: string
  summary?: string
  // PowerShell hook 扩展字段
  cwd?: string
  command?: string
}

/**
 * 主进程内部使用的 Hook 消息类型：在 HookMessage 基础上额外携带会话令牌。
 * token 仅用于主进程校验，不会转发到渲染进程或写入日志。
 */
export interface HookMessageInternal extends HookMessage {
  token?: string
}

export interface QuickAction {
  id: string
  name: string
  command: string
}
