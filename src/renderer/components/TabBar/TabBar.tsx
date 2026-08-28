import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { TerminalTab } from '@shared/types'
import AgentStatusBar from '../Agent/AgentStatusBar.js'
import WindowControls, { showWindowControls } from './WindowControls.js'

// Windows 使用原生 titleBarOverlay 按钮（宽约 140px），需在右侧预留空间；
// 其他平台不预留，避免出现无意义的空白区域
const isWindows =
  typeof window !== 'undefined' && window.electronAPI?.platform === 'win32'

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

  return (
    <div
      className={`h-9 shrink-0 flex items-center bg-sidebar border-b border-border pl-2 gap-1 wallpaper-glass drag-region ${
        isWindows ? 'pr-[140px]' : showWindowControls ? 'pr-0' : 'pr-2'
      }`}
      data-testid="tab-bar"
    >
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
            data-testid="terminal-tab"
            data-tab-id={tab.id}
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
        data-testid="tab-add"
        className="w-7 h-7 rounded-md flex items-center justify-center text-text-secondary hover:text-foreground hover:bg-border transition-colors no-drag"
        title={t('tab.new')}
      >
        +
      </button>

      <AgentStatusBar />
      {showWindowControls && <WindowControls />}
    </div>
  )
}

export default memo(TabBar)
