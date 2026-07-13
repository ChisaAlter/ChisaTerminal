import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useWorkspaceStore,
  getAllTerminalIds,
  getTerminalLastCwd,
  resolveActionCwd,
} from '../../stores/useWorkspaceStore.js'
import { useBrowserStore } from '../../stores/useBrowserStore.js'
import { useThemeStore } from '../../stores/useThemeStore.js'
import { useSettingsStore } from '../../stores/useSettingsStore.js'
import { useQuickActionsStore } from '../../stores/useQuickActionsStore.js'
import { useAgentStore } from '../../stores/useAgentStore.js'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpenSettings?: () => void
}

interface Command {
  id: string
  label: string
  description?: string
  category?: string
  action: () => void
}

export default function CommandPalette({ isOpen, onClose, onOpenSettings }: CommandPaletteProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const selectedIndexRef = useRef(0)

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const addTab = useWorkspaceStore((s) => s.addTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace)
  const splitTerminal = useWorkspaceStore((s) => s.splitTerminal)
  const visible = useBrowserStore((s) => s.visible)
  const toggleBrowserVisible = useBrowserStore((s) => s.toggleVisible)
  const openBrowserForTerminal = useBrowserStore((s) => s.openForTerminal)
  const removeBrowserTerminal = useBrowserStore((s) => s.removeTerminal)

  const themes = useThemeStore((s) => s.themes)

  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const patchSettings = useSettingsStore((s) => s.patchSettings)
  const quickActions = useQuickActionsStore((s) => s.actions)
  const injectAction = useQuickActionsStore((s) => s.injectAction)
  const terminalStates = useAgentStore((s) => s.terminalStates)

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId),
    [workspaces, selectedWorkspaceId]
  )
  const selectedTab = useMemo(
    () => selectedWorkspace?.tabs.find((t) => t.id === selectedWorkspace?.selectedTabId),
    [selectedWorkspace]
  )

  const runQuickAction = useCallback(
    (actionId: string) => {
      const action = quickActions.find((a) => a.id === actionId)
      const terminalId = selectedTab?.focusedTerminalId
      if (!action || !terminalId || !selectedTab) return
      // Live hook cwd first; fall back to layout-persisted lastCwd after restore
      // (before the shell hook has fired again).
      const cwd = resolveActionCwd(
        terminalStates[terminalId]?.cwd,
        getTerminalLastCwd(selectedTab.layout, terminalId)
      )
      injectAction(terminalId, action, {
        cwd,
        tabTitle: selectedTab.title ?? null,
      })
    },
    [quickActions, selectedTab, terminalStates, injectAction]
  )

  const commands: Command[] = useMemo(() => [
    {
      id: 'new-tab',
      label: t('palette.new_tab'),
      category: t('palette.category_tab'),
      description: t('palette.create_tab_desc'),
      action: () => {
        if (selectedWorkspaceId) {
          const tabNum = (selectedWorkspace?.tabs.length ?? 0) + 1
          addTab(selectedWorkspaceId, t('tab.terminal_n', { n: tabNum }))
        }
      },
    },
    {
      id: 'close-tab',
      label: t('palette.close_tab'),
      category: t('palette.category_tab'),
      description: t('palette.close_tab_desc'),
      action: () => {
        if (selectedWorkspaceId && selectedTab) {
          getAllTerminalIds(selectedTab.layout).forEach(removeBrowserTerminal)
          closeTab(selectedWorkspaceId, selectedTab.id)
        }
      },
    },
    {
      id: 'split-vertical',
      label: t('palette.split_vertical'),
      category: t('pane.split_vertical'),
      description: t('palette.split_vertical_desc'),
      action: () => {
        if (selectedWorkspaceId && selectedTab) {
          splitTerminal(
            selectedWorkspaceId,
            selectedTab.id,
            selectedTab.focusedTerminalId,
            'vertical'
          )
        }
      },
    },
    {
      id: 'split-horizontal',
      label: t('palette.split_horizontal'),
      category: t('pane.split_horizontal'),
      description: t('palette.split_horizontal_desc'),
      action: () => {
        if (selectedWorkspaceId && selectedTab) {
          splitTerminal(
            selectedWorkspaceId,
            selectedTab.id,
            selectedTab.focusedTerminalId,
            'horizontal'
          )
        }
      },
    },
    {
      id: 'toggle-browser',
      label: t('palette.toggle_browser'),
      category: t('palette.category_pane'),
      description: t('palette.toggle_browser_desc'),
      action: () => {
        const terminalId = selectedTab?.focusedTerminalId
        if (!terminalId) return
        if (visible) {
          toggleBrowserVisible()
        } else {
          openBrowserForTerminal(terminalId)
        }
      },
    },
    {
      id: 'new-workspace',
      label: t('palette.new_workspace'),
      category: t('palette.category_workspace'),
      description: t('palette.new_workspace_desc'),
      action: () => {
        addWorkspace(t('workspace.default', { n: workspaces.length + 1 }))
      },
    },
    ...workspaces.map((ws) => ({
      id: `switch-workspace-${ws.id}`,
      label: t('palette.switch_workspace', { name: ws.name }),
      category: t('palette.category_workspace'),
      description: t('palette.switch_workspace_desc', { name: ws.name }),
      action: () => selectWorkspace(ws.id),
    })),
    ...themes.map((theme) => ({
      id: `theme-${theme.id}`,
      label: t('palette.theme', { name: theme.name }),
      category: t('theme.label'),
      description: t('palette.theme_desc', { name: theme.name }),
      action: () => updateSetting('themeId', theme.id),
    })),
    {
      id: 'set-wallpaper',
      label: t('palette.set_wallpaper'),
      category: t('palette.category_appearance'),
      description: t('palette.set_wallpaper_desc'),
      action: () => {
        onOpenSettings?.()
      },
    },
    {
      id: 'clear-wallpaper',
      label: t('palette.clear_wallpaper'),
      category: t('palette.category_appearance'),
      description: t('palette.clear_wallpaper_desc'),
      action: () => {
        patchSettings({
          wallpaperUrl: null,
          wallpaperEnabled: false,
          wallpaperPixelated: false,
          wallpaperPixelationBlockSize: 16,
        })
      },
    },
    ...(onOpenSettings
      ? [
          {
            id: 'open-settings',
            label: t('palette.open_settings'),
            category: t('palette.category_settings'),
            description: t('palette.open_settings_desc'),
            action: () => onOpenSettings(),
          },
        ]
      : []),
    ...quickActions.map((action) => ({
      id: `quick-action-${action.id}`,
      label: t('palette.run_quick_action', { name: action.name }),
      category: t('palette.category_quick_actions'),
      description: action.command,
      action: () => runQuickAction(action.id),
    })),
  ], [workspaces, selectedWorkspaceId, selectedWorkspace, selectedTab, addTab, closeTab, splitTerminal, visible, toggleBrowserVisible, openBrowserForTerminal, removeBrowserTerminal, addWorkspace, selectWorkspace, themes, updateSetting, patchSettings, onOpenSettings, t, quickActions, runQuickAction])

  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q)
    )
  }, [commands, query])

  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen || !inputRef.current) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    inputRef.current.focus()
    inputRef.current.select()
    return () => {
      previouslyFocusedRef.current?.focus?.()
      previouslyFocusedRef.current = null
    }
  }, [isOpen])

  const executeCommand = useCallback((cmd: Command | undefined) => {
    if (cmd) {
      cmd.action()
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredCommands.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        executeCommand(filteredCommands[selectedIndexRef.current])
      } else if (e.key === 'Tab') {
        // 焦点陷阱：将焦点保留在 input 上，避免 Tab 离开 palette
        e.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredCommands, onClose, executeCommand])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      data-testid="command-palette-overlay"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.placeholder')}
        data-testid="command-palette"
        className="relative w-full max-w-lg bg-canvas border border-border rounded-lg shadow-2xl overflow-hidden wallpaper-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-listbox"
            aria-activedescendant={
              filteredCommands.length > 0
                ? `command-palette-option-${selectedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="w-full bg-transparent border-none outline-none text-foreground text-sm placeholder-text-secondary"
          />
        </div>
        <div
          id="command-palette-listbox"
          role="listbox"
          aria-label={t('palette.placeholder')}
          className="max-h-96 overflow-y-auto"
        >
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-text-secondary text-sm">
              {t('palette.no_result')}
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                id={`command-palette-option-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`
                  w-full px-4 py-2 text-left transition-colors
                  ${
                    index === selectedIndex
                      ? 'bg-selection text-foreground'
                      : 'text-foreground hover:bg-border'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{cmd.label}</span>
                  {cmd.category && (
                    <span className="text-xs text-text-secondary">
                      {cmd.category}
                    </span>
                  )}
                </div>
                {cmd.description && (
                  <div className="text-xs text-text-secondary mt-0.5">
                    {cmd.description}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
