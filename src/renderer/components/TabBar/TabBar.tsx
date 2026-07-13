import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { TerminalTab } from '@shared/types'
import { useAgentStore, type AgentStatus } from '../../stores/useAgentStore.js'

interface TabBarProps {
  tabs: TerminalTab[]
  selectedTabId: string | null
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onAddTab: () => void
  onRenameTab: (tabId: string, title: string) => void
}

function TabBar({
  tabs,
  selectedTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onRenameTab,
}: TabBarProps) {
  const { t } = useTranslation()
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleDoubleClick = (tab: TerminalTab) => {
    setEditingTabId(tab.id)
    setEditValue(tab.title)
  }

  const handleRenameSubmit = () => {
    if (editingTabId && editValue.trim()) {
      onRenameTab(editingTabId, editValue.trim())
    }
    setEditingTabId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
    }
  }

  const focusTabAtIndex = useCallback((index: number) => {
    const len = tabs.length
    if (len === 0) return
    const wrapped = ((index % len) + len) % len
    const el = tabRefs.current[wrapped]
    const tab = tabs[wrapped]
    if (el && tab) {
      el.focus()
      onSelectTab(tab.id)
    }
  }, [tabs, onSelectTab])

  const handleTabListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const currentIndex = tabs.findIndex((tab) => tab.id === selectedTabId)
      const baseIndex = currentIndex === -1 ? 0 : currentIndex
      const nextIndex = e.key === 'ArrowRight' ? baseIndex + 1 : baseIndex - 1
      focusTabAtIndex(nextIndex)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusTabAtIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusTabAtIndex(tabs.length - 1)
    }
  }, [tabs, selectedTabId, focusTabAtIndex])

  const status = useAgentStore((s) => s.status)
  const statusText = useAgentStore((s) => s.statusText)
  const focusedTerminalId = useAgentStore((s) => s.focusedTerminalId)
  const terminalState = useAgentStore((s) =>
    focusedTerminalId ? s.terminalStates[focusedTerminalId] : undefined
  )
  const cwd = terminalState?.cwd ?? null
  const command = terminalState?.command ?? null

  const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
    idle: { color: 'bg-green-500', label: t('agent.status.idle') },
    thinking: { color: 'bg-yellow-500', label: t('agent.status.thinking') },
    working: { color: 'bg-blue-500', label: t('agent.status.working') },
    error: { color: 'bg-red-500', label: t('agent.status.error') },
  }
  const config = statusConfig[status]

  function shortCwd(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 2) return path
    return '.../' + parts.slice(-2).join('/')
  }

  return (
    <div className="h-9 shrink-0 flex items-center bg-sidebar border-b border-border px-2 gap-1 wallpaper-glass drag-region pr-[140px]">
      <div
        className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-drag"
        role="tablist"
        aria-label={t('tab.new')}
        onKeyDown={handleTabListKeyDown}
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === selectedTabId
          return (
          <div
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelectTab(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab)}
            className={`
              flex items-center gap-2 px-3 h-7 rounded-md cursor-pointer
              text-sm whitespace-nowrap shrink-0
              transition-colors
              ${
                selected
                  ? 'bg-canvas text-foreground border border-border-strong'
                  : 'text-text-secondary hover:text-foreground hover:bg-border'
              }
            `}
          >
            {editingTabId === tab.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent border-none outline-none text-sm w-24 text-foreground"
              />
            ) : (
              <span className="max-w-[120px] truncate">{tab.title || t('tab.terminal')}</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
              aria-label={t('tab.close')}
              className="w-4 h-4 rounded hover:bg-border-strong flex items-center justify-center text-xs opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
          )
        })}
      </div>
      <button
        onClick={onAddTab}
        className="w-7 h-7 rounded-md flex items-center justify-center text-text-secondary hover:text-foreground hover:bg-border transition-colors no-drag"
        title={t('tab.new')}
      >
        +
      </button>

      {/* 底部状态栏合并到标签栏右侧，避免单独占用底部空间 */}
      <div className="h-full flex items-center gap-2 ml-auto no-drag text-xs text-text-secondary">
        <div
          className={`w-2 h-2 rounded-full ${config.color} ${
            status === 'thinking' || status === 'working' ? 'animate-pulse' : ''
          }`}
        />
        <span>{statusText || config.label}</span>
        {cwd && (
          <>
            <span className="text-border">•</span>
            <span className="truncate max-w-[120px]" title={cwd}>
              {shortCwd(cwd)}
            </span>
          </>
        )}
        {command && status === 'working' && (
          <>
            <span className="text-border">•</span>
            <span className="truncate max-w-[120px] font-mono">{command}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default memo(TabBar)
