import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore.js'
import { useThemeStore } from '../../stores/useThemeStore.js'
import { useSettingsStore } from '../../stores/useSettingsStore.js'

interface SidebarProps {
  onOpenSettings?: () => void
}

function Sidebar({ onOpenSettings }: SidebarProps = {}) {
  const { t } = useTranslation()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId)
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const themes = useThemeStore((s) => s.themes)
  const currentThemeId = useThemeStore((s) => s.currentThemeId)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const themeItemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!showThemeMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showThemeMenu])

  const handleAddWorkspace = () => {
    const name = t('workspace.default', { n: workspaces.length + 1 })
    const id = addWorkspace(name)
    setEditingId(id)
    setEditValue(name)
  }

  const handleDoubleClick = (id: string, name: string) => {
    setEditingId(id)
    setEditValue(name)
  }

  const handleRenameSubmit = () => {
    if (editingId && editValue.trim()) {
      renameWorkspace(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (workspaces.length > 1) {
      removeWorkspace(id)
    }
  }

  const focusThemeItem = useCallback((index: number) => {
    const len = themes.length
    if (len === 0) return
    const wrapped = ((index % len) + len) % len
    const el = themeItemRefs.current[wrapped]
    if (el) el.focus()
  }, [themes.length])

  const handleThemeMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const currentIndex = themes.findIndex((th) => th.id === currentThemeId)
      const baseIndex = currentIndex === -1 ? 0 : currentIndex
      focusThemeItem(baseIndex + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const currentIndex = themes.findIndex((th) => th.id === currentThemeId)
      const baseIndex = currentIndex === -1 ? 0 : currentIndex
      focusThemeItem(baseIndex - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowThemeMenu(false)
    }
  }, [themes, currentThemeId, focusThemeItem])

  useEffect(() => {
    if (showThemeMenu) {
      // 菜单打开时聚焦当前主题项（或第一项）
      const idx = themes.findIndex((th) => th.id === currentThemeId)
      const targetIdx = idx === -1 ? 0 : idx
      // 等待 DOM 渲染完成
      requestAnimationFrame(() => focusThemeItem(targetIdx))
    }
  }, [showThemeMenu, themes, currentThemeId, focusThemeItem])

  return (
    <div className="w-60 bg-sidebar border-r border-border flex flex-col wallpaper-glass">
      <div className="p-3 shrink-0 border-b border-border drag-region">
        <h1 className="text-sm font-semibold text-foreground">{t('app.title')}</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <div className="space-y-1" role="list">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              role="listitem"
              aria-current={ws.id === selectedWorkspaceId ? 'page' : undefined}
              onClick={() => selectWorkspace(ws.id)}
              onDoubleClick={() => handleDoubleClick(ws.id, ws.name)}
              className={`
                group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer
                transition-colors
                ${
                  ws.id === selectedWorkspaceId
                    ? 'bg-selection text-foreground'
                    : 'text-text-secondary hover:bg-border hover:text-foreground'
                }
              `}
            >
              {editingId === ws.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-none outline-none text-sm flex-1 text-foreground"
                />
              ) : (
                <span className="text-sm truncate flex-1">{ws.name}</span>
              )}
              <button
                onClick={(e) => handleRemove(e, ws.id)}
                aria-label={t('workspace.delete')}
                className="w-4 h-4 rounded opacity-0 group-hover:opacity-60 hover:opacity-100 hover:bg-border-strong flex items-center justify-center text-xs transition-opacity"
                title={t('workspace.delete')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="p-2 shrink-0 border-t border-border space-y-1">
        <button
          onClick={handleAddWorkspace}
          className="w-full px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-border hover:text-foreground transition-colors text-left flex items-center gap-2"
        >
          <span>+</span>
          <span>{t('workspace.new')}</span>
        </button>
        <div className="relative" ref={themeMenuRef}>
          <button
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            aria-expanded={showThemeMenu}
            aria-haspopup="menu"
            className="w-full px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-border hover:text-foreground transition-colors text-left flex items-center gap-2"
          >
            <span>🎨</span>
            <span>{t('theme.label')}</span>
          </button>
          {showThemeMenu && (
            <div
              role="menu"
              aria-label={t('theme.label')}
              onKeyDown={handleThemeMenuKeyDown}
              className="absolute bottom-full left-0 right-0 mb-1 bg-sidebar border border-border rounded-md shadow-lg overflow-hidden"
            >
              {themes.map((theme, index) => (
                <button
                  key={theme.id}
                  ref={(el) => { themeItemRefs.current[index] = el }}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    updateSetting('themeId', theme.id)
                    setShowThemeMenu(false)
                  }}
                  className={`
                    w-full px-3 py-2 text-sm text-left hover:bg-border transition-colors
                    ${theme.id === currentThemeId ? 'text-accent' : 'text-foreground'}
                  `}
                >
                  {theme.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => onOpenSettings?.()}
          data-testid="open-settings"
          className="w-full px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-border hover:text-foreground transition-colors text-left flex items-center gap-2"
        >
          <span>⚙</span>
          <span>{t('settings.title')}</span>
        </button>
      </div>
    </div>
  )
}

export default memo(Sidebar)
