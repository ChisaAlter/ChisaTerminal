import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAgentStore, type AgentStatus } from '../../stores/useAgentStore.js'

function shortCwd(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return '.../' + parts.slice(-2).join('/')
}

function AgentStatusBar() {
  const { t } = useTranslation()
  const status = useAgentStore((s) => s.status)
  const statusText = useAgentStore((s) => s.statusText)
  const focusedTerminalId = useAgentStore((s) => s.focusedTerminalId)
  const terminalState = useAgentStore((s) =>
    focusedTerminalId ? s.terminalStates[focusedTerminalId] : undefined
  )
  const cwd = terminalState?.cwd ?? null
  const command = terminalState?.command ?? null
  const exitCode = terminalState?.exitCode ?? null

  const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
    idle: { color: 'bg-green-500', label: t('agent.status.idle') },
    thinking: { color: 'bg-yellow-500', label: t('agent.status.thinking') },
    working: { color: 'bg-blue-500', label: t('agent.status.working') },
    error: { color: 'bg-red-500', label: t('agent.status.error') },
  }
  const config = statusConfig[status]
  const label = statusText || config.label

  return (
    <div
      className="h-full flex items-center gap-2 ml-auto no-drag text-xs text-text-secondary min-w-0"
      data-testid="agent-status-bar"
      data-agent-status={status}
      role="status"
      aria-live="polite"
      aria-label={t('agent.status_bar_label', { status: label })}
    >
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${config.color} ${
          status === 'thinking' || status === 'working' ? 'animate-pulse' : ''
        }`}
        data-testid="agent-status-dot"
      />
      <span data-testid="agent-status-label" className="shrink-0">
        {label}
      </span>
      {cwd && (
        <>
          <span className="text-border shrink-0">•</span>
          <span
            className="truncate max-w-[120px]"
            title={cwd}
            data-testid="agent-status-cwd"
          >
            {shortCwd(cwd)}
          </span>
        </>
      )}
      {command && status === 'working' && (
        <>
          <span className="text-border shrink-0">•</span>
          <span
            className="truncate max-w-[120px] font-mono"
            data-testid="agent-status-command"
            title={command}
          >
            {command}
          </span>
        </>
      )}
      {status === 'error' && exitCode !== null && (
        <>
          <span className="text-border shrink-0">•</span>
          <span data-testid="agent-status-exit" className="shrink-0">
            {t('agent.exit_code', { code: exitCode })}
          </span>
        </>
      )}
    </div>
  )
}

export default memo(AgentStatusBar)
