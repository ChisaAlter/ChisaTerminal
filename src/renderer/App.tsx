import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import Sidebar from './components/Sidebar/Sidebar.js'
import TabBar from './components/TabBar/TabBar.js'
import SplitPane from './components/SplitPane/SplitPane.js'
import BrowserSidecar from './components/Browser/BrowserSidecar.js'

import ErrorBoundary from './components/ErrorBoundary.js'
const CommandPalette = lazy(() => import('./components/CommandPalette/CommandPalette.js'))
const SettingsModal = lazy(() => import('./components/Settings/SettingsModal.js'))
import { useWorkspaceStore, getAllTerminalIds } from './stores/useWorkspaceStore.js'
import { useThemeStore } from './stores/useThemeStore.js'
import { applyThemeToDocument, themes } from './themes/index.js'
import { useSettingsStore } from './stores/useSettingsStore.js'
import { useInitializeSettings } from './stores/useSettingsStore.js'
import { useInitializeWorkspaces } from './stores/useWorkspaceStore.js'
import { useAgentStore } from './stores/useAgentStore.js'
import { useBrowserStore } from './stores/useBrowserStore.js'
import { useSyncQuickActions } from './stores/useQuickActionsStore.js'
import { DEFAULT_SETTINGS } from '../shared/settings.js'
import { openTerminalSearch } from './utils/terminal-search.js'
import { toSafeWallpaperCssUrl } from './utils/wallpaper.js'
import type { SplitDirection } from '@shared/types'

const api = window.electronAPI

export default function App() {
  const { t } = useTranslation()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId)
  const isLoaded = useWorkspaceStore((s) => s.isLoaded)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const addTab = useWorkspaceStore((s) => s.addTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)
  const selectTab = useWorkspaceStore((s) => s.selectTab)
  const renameTab = useWorkspaceStore((s) => s.renameTab)
  const focusTerminal = useWorkspaceStore((s) => s.focusTerminal)
  const updateSplitRatio = useWorkspaceStore((s) => s.updateSplitRatio)
  const splitTerminal = useWorkspaceStore((s) => s.splitTerminal)
  const closeTerminal = useWorkspaceStore((s) => s.closeTerminal)

  const settings = useSettingsStore((s) => s.settings)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId)
  const selectedTab = selectedWorkspace?.tabs.find(
    (t) => t.id === selectedWorkspace?.selectedTabId
  )
  const focusedTerminalId = selectedTab?.focusedTerminalId
  const currentThemeId = useThemeStore((s) => s.currentThemeId)
  const setTheme = useThemeStore((s) => s.setTheme)

  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)

  useInitializeSettings()
  useInitializeWorkspaces()
  useSyncQuickActions()

  const updateFromHook = useAgentStore((s) => s.updateFromHook)
  const setFocusedTerminalId = useAgentStore((s) => s.setFocusedTerminalId)
  const setActiveBrowserTerminal = useBrowserStore((s) => s.setActiveTerminal)
  const openBrowserForTerminal = useBrowserStore((s) => s.openForTerminal)
  const removeBrowserTerminal = useBrowserStore((s) => s.removeTerminal)
  const browserIsDragging = useBrowserStore((s) => s.isDragging)
  const autoNameTab = useWorkspaceStore((s) => s.autoNameTab)
  const updateTerminalCwd = useWorkspaceStore((s) => s.updateTerminalCwd)

  // 订阅 hook 消息
  useEffect(() => {
    if (!api?.hook?.onMessage) return
    const unsub = api.hook.onMessage((msg) => {
      updateFromHook(msg)

      // 持久化 hook 上报的 cwd，供下次启动恢复 PTY 工作目录
      if (msg.cwd) {
        updateTerminalCwd(msg.terminalId, msg.cwd)
      }

      // 自动命名：找到 terminalId 所属的 (workspaceId, tabId)，
      // 仅在 tab.userRenamed === false 时更新标题
      const state = useWorkspaceStore.getState()
      for (const w of state.workspaces) {
        for (const t of w.tabs) {
          const ids = getAllTerminalIds(t.layout)
          if (ids.includes(msg.terminalId)) {
            autoNameTab(w.id, t.id, msg.terminalId, msg.cwd ?? null, msg.command ?? null)
            return
          }
        }
      }
    })
    return unsub
  }, [updateFromHook, autoNameTab, updateTerminalCwd])

  // 监听主进程转发的链接点击（window.open 被拦截后通过 IPC 通知），
  // 用当前聚焦的 terminal 打开 BrowserSidecar 加载该 URL
  useEffect(() => {
    if (!api?.browser?.onOpenUrl) return
    const unsub = api.browser.onOpenUrl((url) => {
      const focusedId = useWorkspaceStore.getState().getSelectedTab()?.focusedTerminalId
      if (focusedId) {
        openBrowserForTerminal(focusedId, url)
      }
    })
    return unsub
  }, [openBrowserForTerminal])

  // 同步聚焦 terminal 到 AgentStore（用于派生全局状态栏展示）
  useEffect(() => {
    const nextFocusedTerminalId = selectedTab?.focusedTerminalId ?? null
    setFocusedTerminalId(nextFocusedTerminalId)
    setActiveBrowserTerminal(nextFocusedTerminalId)
  }, [selectedTab?.focusedTerminalId, setFocusedTerminalId, setActiveBrowserTerminal])

  useEffect(() => {
    if (currentThemeId) {
      setTheme(currentThemeId)
    }
  }, [currentThemeId, setTheme])

  useEffect(() => {
    if (settings.themeId && settings.themeId !== currentThemeId) {
      setTheme(settings.themeId)
    }
  }, [settings.themeId, currentThemeId, setTheme])

  useEffect(() => {
    if (isLoaded && workspaces.length === 0) {
      addWorkspace(t('workspace.default', { n: 1 }))
    }
  }, [isLoaded, workspaces.length, addWorkspace])

  const handleAddTab = useCallback(() => {
    if (selectedWorkspaceId) {
      const tabNum = (selectedWorkspace?.tabs.length ?? 0) + 1
      addTab(selectedWorkspaceId, t('tab.terminal_n', { n: tabNum }))
    }
  }, [selectedWorkspaceId, selectedWorkspace, addTab])

  const handleSplitVertical = useCallback(() => {
    if (selectedWorkspaceId && selectedTab) {
      splitTerminal(
        selectedWorkspaceId,
        selectedTab.id,
        selectedTab.focusedTerminalId,
        'vertical'
      )
    }
  }, [selectedWorkspaceId, selectedTab, splitTerminal])

  const handleSplitHorizontal = useCallback(() => {
    if (selectedWorkspaceId && selectedTab) {
      splitTerminal(
        selectedWorkspaceId,
        selectedTab.id,
        selectedTab.focusedTerminalId,
        'horizontal'
      )
    }
  }, [selectedWorkspaceId, selectedTab, splitTerminal])

  const handleCloseTabById = useCallback((tabId: string) => {
    if (!selectedWorkspace) return
    const tab = selectedWorkspace.tabs.find((t) => t.id === tabId)
    if (tab) {
      getAllTerminalIds(tab.layout).forEach(removeBrowserTerminal)
    }
    closeTab(selectedWorkspace.id, tabId)
  }, [selectedWorkspace, closeTab, removeBrowserTerminal])

  const handleCloseTab = useCallback(() => {
    if (selectedTab) {
      handleCloseTabById(selectedTab.id)
    }
  }, [selectedTab, handleCloseTabById])

  const handleZoomIn = useCallback(() => {
    const newSize = Math.min(settings.fontSize + 1, 72)
    updateSetting('fontSize', newSize)
  }, [settings.fontSize, updateSetting])

  const handleZoomOut = useCallback(() => {
    const newSize = Math.max(settings.fontSize - 1, 6)
    updateSetting('fontSize', newSize)
  }, [settings.fontSize, updateSetting])

  const handleZoomReset = useCallback(() => {
    updateSetting('fontSize', DEFAULT_SETTINGS.fontSize)
  }, [updateSetting])

  // 稳定化传给 memo 化子组件的回调：将 workspaceId/tabId 作为参数传入，
  // 避免在 workspaces.flatMap 中闭包捕获迭代变量导致每次渲染新建回调引用
  const handleFocusTerminal = useCallback(
    (workspaceId: string, tabId: string, terminalId: string) => {
      focusTerminal(workspaceId, tabId, terminalId)
    },
    [focusTerminal]
  )

  const handleUpdateSplitRatio = useCallback(
    (workspaceId: string, tabId: string, splitId: string, ratio: number) => {
      updateSplitRatio(workspaceId, tabId, splitId, ratio)
    },
    [updateSplitRatio]
  )

  const handleSplitTerminal = useCallback(
    (workspaceId: string, tabId: string, terminalId: string, direction: SplitDirection) => {
      splitTerminal(workspaceId, tabId, terminalId, direction)
    },
    [splitTerminal]
  )

  const handleCloseTerminal = useCallback(
    (workspaceId: string, tabId: string, terminalId: string) => {
      removeBrowserTerminal(terminalId)
      closeTerminal(workspaceId, tabId, terminalId)
    },
    [removeBrowserTerminal, closeTerminal]
  )

  const handleOpenBrowser = useCallback(
    (terminalId: string) => {
      openBrowserForTerminal(terminalId)
    },
    [openBrowserForTerminal]
  )

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true)
  }, [])

  const handleSelectTab = useCallback(
    (tabId: string) => {
      if (selectedWorkspaceId) selectTab(selectedWorkspaceId, tabId)
    },
    [selectedWorkspaceId, selectTab]
  )

  const handleRenameTab = useCallback(
    (tabId: string, title: string) => {
      if (selectedWorkspaceId) renameTab(selectedWorkspaceId, tabId, title)
    },
    [selectedWorkspaceId, renameTab]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings || showCommandPalette) {
        // 模态打开时仅放行 Escape，其余快捷键全部短路
        if (e.key === 'Escape') return
        // Ctrl/Cmd 组合键短路
        if (e.ctrlKey || e.metaKey) return
        return
      }
      if (e.defaultPrevented) return
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      const isPaletteShortcut = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p'
      const isSettingsShortcut = e.ctrlKey && e.key === ','
      const isSearchShortcut = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f'
      if (isInput && !isPaletteShortcut && !isSettingsShortcut && !isSearchShortcut) return

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 't') {
          e.preventDefault()
          handleAddTab()
        } else if (e.key.toLowerCase() === 'w') {
          e.preventDefault()
          handleCloseTab()
        } else if (e.key.toLowerCase() === 'd') {
          if (e.shiftKey) {
            e.preventDefault()
            handleSplitHorizontal()
          } else {
            e.preventDefault()
            handleSplitVertical()
          }
        } else if (isPaletteShortcut) {
          e.preventDefault()
          setShowCommandPalette(true)
        } else if (isSearchShortcut) {
          e.preventDefault()
          if (focusedTerminalId) {
            openTerminalSearch(focusedTerminalId)
          }
        } else if (e.key === ',') {
          e.preventDefault()
          setShowSettings(true)
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          handleZoomIn()
        } else if (e.key === '-') {
          e.preventDefault()
          handleZoomOut()
        } else if (e.key === '0') {
          e.preventDefault()
          handleZoomReset()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleAddTab, handleCloseTab, handleSplitVertical, handleSplitHorizontal, handleZoomIn, handleZoomOut, handleZoomReset, focusedTerminalId, showSettings, showCommandPalette])

  useEffect(() => {
    api?.app?.reloadShortcuts?.()
  }, [settings.globalHotkey, settings.globalHotkeyEnabled])

  useEffect(() => {
    if (settings.wallpaperEnabled && settings.wallpaperUrl) {
      document.documentElement.classList.add('wallpaper-enabled')
    } else {
      document.documentElement.classList.remove('wallpaper-enabled')
    }
    const theme = themes.find((t) => t.id === currentThemeId)
    if (theme) {
      applyThemeToDocument(theme)
    }
  }, [settings.wallpaperEnabled, settings.wallpaperUrl, currentThemeId, themes])

  const wallpaperCssUrl = useMemo(
    () => toSafeWallpaperCssUrl(settings.wallpaperUrl),
    [settings.wallpaperUrl]
  )

  // 预加载壁纸图片，仅当图片实际加载成功时才允许渲染图片层与暗色遮罩层，
  // 避免图片加载失败（如旧 file:// URL 或损坏文件）时遮罩层单独渲染导致内容被遮挡
  useEffect(() => {
    if (!settings.wallpaperEnabled || !wallpaperCssUrl || !settings.wallpaperUrl) {
      setWallpaperLoaded(false)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => { if (!cancelled) setWallpaperLoaded(true) }
    img.onerror = () => { if (!cancelled) setWallpaperLoaded(false) }
    img.src = settings.wallpaperUrl
    return () => { cancelled = true; img.onload = null; img.onerror = null }
  }, [settings.wallpaperEnabled, settings.wallpaperUrl, wallpaperCssUrl])

  return (
    <div className="h-full flex flex-col bg-canvas relative">
      {settings.wallpaperEnabled && wallpaperLoaded && wallpaperCssUrl && (
        <>
          <div
            className="fixed inset-0 bg-cover bg-center pointer-events-none z-0"
            style={{ backgroundImage: wallpaperCssUrl }}
          />
          <div className="fixed inset-0 bg-black/40 pointer-events-none z-0" />
        </>
      )}
      <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden wallpaper-glass">
        <Sidebar onOpenSettings={handleOpenSettings} />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {selectedWorkspace && (
            <TabBar
              tabs={selectedWorkspace.tabs}
              selectedTabId={selectedWorkspace.selectedTabId}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTabById}
              onAddTab={handleAddTab}
              onRenameTab={handleRenameTab}
            />
          )}
          <div className={`flex-1 min-h-0 overflow-hidden flex ${browserIsDragging ? 'pointer-events-none' : ''}`}>
            <div className="flex-1 min-w-0 overflow-hidden relative">
              {workspaces.length > 0 ? (
                // 渲染所有 workspace 的所有 tab：非活跃的用 invisible 隐藏（保留 DOM 与 canvas 上下文），
                // 活跃的标签用 absolute inset-0 占满父容器，避免切换 tab / workspace 时 TerminalView 被卸载导致终端重新初始化
                workspaces.flatMap((ws) =>
                  ws.tabs.map((tab) => {
                    const isVisible =
                      ws.id === selectedWorkspaceId &&
                      tab.id === ws.selectedTabId
                    return (
                      <div
                        key={`${ws.id}:${tab.id}`}
                        // 用 opacity-0 + pointer-events-none 替代 visibility:hidden，
                        // 避免 xterm canvas 在 tab 隐藏时被丢弃，同时让事件只命中当前 tab
                        className={
                          isVisible
                            ? 'absolute inset-0 opacity-100 pointer-events-auto z-0'
                            : 'absolute inset-0 opacity-0 pointer-events-none -z-10'
                        }
                      >
                        <SplitPane
                          workspaceId={ws.id}
                          tabId={tab.id}
                          node={tab.layout}
                          focusedTerminalId={tab.focusedTerminalId}
                          onFocusTerminal={handleFocusTerminal}
                          onUpdateRatio={handleUpdateSplitRatio}
                          onSplitTerminal={handleSplitTerminal}
                          onCloseTerminal={handleCloseTerminal}
                          onOpenBrowser={handleOpenBrowser}
                        />
                      </div>
                    )
                  })
                )
              ) : (
                <div className="h-full flex items-center justify-center text-text-secondary">
                  <span>{t('pane.empty')}</span>
                </div>
              )}
            </div>
            <BrowserSidecar />
          </div>
        </div>
      </div>
      {showCommandPalette && (
        <ErrorBoundary fallback={<div className="p-4 text-red-500 text-sm">{t('common.load_error')}</div>}>
          <Suspense fallback={<div className="p-4 text-text-secondary">{t('common.loading')}</div>}>
            <CommandPalette
              isOpen={showCommandPalette}
              onClose={() => setShowCommandPalette(false)}
              onOpenSettings={() => {
                setShowCommandPalette(false)
                setShowSettings(true)
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {showSettings && (
        <ErrorBoundary fallback={<div className="p-4 text-red-500 text-sm">{t('common.load_error')}</div>}>
          <Suspense fallback={<div className="p-4 text-text-secondary">{t('common.loading')}</div>}>
            <SettingsModal
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  )
}
