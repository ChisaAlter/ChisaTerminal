import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, type ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useThemeStore } from '../../stores/useThemeStore.js'
import { useSettingsStore } from '../../stores/useSettingsStore.js'
import {
  normalizeBrowserUrl,
  useBrowserStore,
} from '../../stores/useBrowserStore.js'
import { useQuickActionsStore } from '../../stores/useQuickActionsStore.js'
import { useAgentStore } from '../../stores/useAgentStore.js'
import {
  useWorkspaceStore,
  getTerminalLastCwd,
  resolveActionCwd,
} from '../../stores/useWorkspaceStore.js'
import type { TerminalColors } from '../../themes/index.js'
import type { QuickAction } from '../../../shared/types.js'
import ErrorBoundary from '../ErrorBoundary.js'
import TerminalContextMenu from './TerminalContextMenu.js'
import TerminalSearch from './TerminalSearch.js'
import {
  createSearchAddon,
  registerSearchController,
  unregisterSearchController,
} from '../../utils/terminal-search.js'

const api = window.electronAPI

function mapThemeColors(tc: TerminalColors, transparentBackground = false): ITerminalOptions['theme'] {
  return {
    background: transparentBackground ? 'rgba(0,0,0,0)' : tc.background,
    foreground: tc.foreground,
    cursor: tc.cursor,
    cursorAccent: tc.cursorAccent,
    selectionBackground: tc.selectionBackground,
    black: tc.black,
    red: tc.red,
    green: tc.green,
    yellow: tc.yellow,
    blue: tc.blue,
    magenta: tc.magenta,
    cyan: tc.cyan,
    white: tc.white,
    brightBlack: tc.brightBlack,
    brightRed: tc.brightRed,
    brightGreen: tc.brightGreen,
    brightYellow: tc.brightYellow,
    brightBlue: tc.brightBlue,
    brightMagenta: tc.brightMagenta,
    brightCyan: tc.brightCyan,
    brightWhite: tc.brightWhite,
  }
}

interface TerminalViewProps {
  terminalId: string
  /**
   * Restored lastCwd for the *initial* PTY create only.
   * Must NOT drive the session lifecycle: live layout lastCwd updates must not
   * dispose/recreate the PTY. Captured once per terminalId via ref.
   */
  initialCwd?: string
  isFocused?: boolean
  onFocus?: () => void
  onSplitVertical?: () => void
  onSplitHorizontal?: () => void
  onCloseTerminal?: () => void
  onOpenBrowser?: () => void
}

function TerminalView({
  terminalId,
  initialCwd,
  isFocused = false,
  onFocus,
  onSplitVertical,
  onSplitHorizontal,
  onCloseTerminal,
  onOpenBrowser,
}: TerminalViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<ReturnType<typeof createSearchAddon> | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocusedRef = useRef(isFocused)
  const isVisibleRef = useRef(false)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const fitRafRef = useRef<number | null>(null)
  // Snapshot restore cwd only when the terminal identity changes — never when
  // hook-driven lastCwd updates re-render the parent with a new path.
  const initialCwdRef = useRef(initialCwd)
  const terminalIdForCwdRef = useRef(terminalId)
  if (terminalIdForCwdRef.current !== terminalId) {
    terminalIdForCwdRef.current = terminalId
    initialCwdRef.current = initialCwd
  }
  const [searchVisible, setSearchVisible] = useState(false)
  const { t } = useTranslation()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const themes = useThemeStore((s) => s.themes)
  const currentThemeId = useThemeStore((s) => s.currentThemeId)
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily)
  const fontSize = useSettingsStore((s) => s.settings.fontSize)
  const cursorBlink = useSettingsStore((s) => s.settings.cursorBlink)
  const cursorStyle = useSettingsStore((s) => s.settings.cursorStyle)
  const scrollback = useSettingsStore((s) => s.settings.scrollback)
  const wallpaperEnabled = useSettingsStore((s) => s.settings.wallpaperEnabled)
  const quickActions = useQuickActionsStore((s) => s.actions)
  const injectAction = useQuickActionsStore((s) => s.injectAction)
  const terminalCwd = useAgentStore((s) => s.terminalStates[terminalId]?.cwd ?? null)

  const currentTheme = useMemo(
    () => themes.find((t) => t.id === currentThemeId),
    [themes, currentThemeId]
  )

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null)

  useEffect(() => {
    if (!wrapperRef.current) return

    const term = new Terminal({
      fontFamily,
      fontSize,
      lineHeight: 1.2,
      cursorBlink,
      cursorStyle,
      scrollback,
      theme: currentTheme?.colors.terminal
        ? mapThemeColors(currentTheme.colors.terminal, wallpaperEnabled)
        : undefined,
      allowTransparency: true,
      allowProposedApi: true,
      // 覆盖 xterm 默认的 OSC 8 链接处理（默认会弹 confirm 对话框并调用 window.open）
      // 改为直接在右侧 BrowserSidecar 打开，仅允许 http/https
      linkHandler: {
        activate: (event, text) => {
          event.preventDefault()
          const normalized = normalizeBrowserUrl(text)
          if (normalized) {
            useBrowserStore.getState().openForTerminal(terminalId, normalized)
          }
        },
      },
    })

    const fitAddon = new FitAddon()
    // 终端中点击 http/https 链接时，不弹确认框，直接在右侧 BrowserSidecar 打开
    const webLinksAddon = new WebLinksAddon((event, url) => {
      event.preventDefault()
      const normalized = normalizeBrowserUrl(url)
      if (normalized) {
        useBrowserStore.getState().openForTerminal(terminalId, normalized)
      }
    })
    const searchAddon = createSearchAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(searchAddon)

    term.open(wrapperRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    registerSearchController(terminalId, {
      show: () => setSearchVisible(true),
      hide: () => setSearchVisible(false),
    })

    let removeOutputListener: (() => void) | undefined
    let removeExitListener: (() => void) | undefined
    let dataDisposable: { dispose: () => void } | undefined

    if (api?.pty) {
      // Use only the identity-scoped snapshot — never re-create on live lastCwd churn
      api.pty.create(terminalId, initialCwdRef.current)

      removeOutputListener = api.pty.onOutputFor(terminalId, (data: string) => {
        if (termRef.current) {
          termRef.current.write(data)
        }
      })

      removeExitListener = api.pty.onExitFor(terminalId, (exitCode: number) => {
        if (termRef.current) {
          termRef.current.write(`\r\n[${tRef.current('terminal.exited', { code: exitCode })}]\r\n`)
        }
      })

      dataDisposable = term.onData((data) => {
        api.pty.write(terminalId, data)
      })
    } else {
      term.writeln(`\x1b[33m[${tRef.current('terminal.browser_fallback')}]\x1b[0m`)
    }

    const fitAndResizePty = () => {
      if (!fitAddonRef.current || !termRef.current || !wrapperRef.current) return
      // 隐藏/未挂载 tab 不 fit，避免算到 0 或反复触发 xterm 重排
      if (!isVisibleRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      try {
        fitAddonRef.current.fit()
      } catch {
        return
      }
      const { cols, rows } = termRef.current
      if (cols <= 0 || rows <= 0) return
      // 尺寸未变时不 resize pty，避免输入/输出时反复重排导致内容抖动/上滑
      if (lastSizeRef.current?.cols === cols && lastSizeRef.current?.rows === rows) return
      lastSizeRef.current = { cols, rows }
      api?.pty?.resize?.(terminalId, cols, rows)
    }

    const scheduleFit = () => {
      if (fitRafRef.current) cancelAnimationFrame(fitRafRef.current)
      fitRafRef.current = requestAnimationFrame(() => {
        fitRafRef.current = null
        fitAndResizePty()
      })
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      if (entry.contentRect.width === 0 || entry.contentRect.height === 0) return
      scheduleFit()
    })
    // 观察外层容器而非 wrapperRef（xterm 自身元素），
    // 避免 xterm 内部渲染层/滚动条尺寸变化反馈到 ResizeObserver 形成 fit 循环导致输入时左右晃动
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    } else {
      resizeObserver.observe(wrapperRef.current)
    }

    // 监听可见性：当终端从隐藏/离屏切换为可见时重新 fit + 聚焦，避免 xterm canvas 损坏
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        const isVisible = entry.isIntersecting && entry.intersectionRatio > 0
        const wasVisible = isVisibleRef.current
        isVisibleRef.current = isVisible
        if (isVisible && !wasVisible) {
          scheduleFit()
          if (termRef.current && isFocusedRef.current) {
            termRef.current.focus()
          }
        }
      },
      { threshold: 0 }
    )
    intersectionObserver.observe(wrapperRef.current)

    resizeTimerRef.current = setTimeout(scheduleFit, 50)

    return () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
      if (fitRafRef.current) cancelAnimationFrame(fitRafRef.current)
      removeOutputListener?.()
      removeExitListener?.()
      dataDisposable?.dispose()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      unregisterSearchController(terminalId)
      api?.pty?.close?.(terminalId)
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
    }
    // Intentionally depend only on terminalId. Live layout lastCwd / initialCwd
    // prop updates must NOT tear down the xterm + PTY session mid-use.
  }, [terminalId])

  useEffect(() => {
    if (!termRef.current) return
    const opts: ITerminalOptions = {
      fontFamily,
      fontSize,
      cursorBlink,
      cursorStyle,
      scrollback,
    }
    if (currentTheme?.colors.terminal) {
      opts.theme = mapThemeColors(currentTheme.colors.terminal, wallpaperEnabled)
    }
    Object.assign(termRef.current.options, opts)
    // 字号/字体变化后单元格尺寸改变，需重新 fit 以更新 cols/rows 并 resize PTY
    try {
      fitAddonRef.current?.fit()
      const term = termRef.current
      if (term && term.cols > 0 && term.rows > 0) {
        api?.pty?.resize?.(terminalId, term.cols, term.rows)
      }
    } catch {
      // ignore fit errors
    }
  }, [fontFamily, fontSize, cursorBlink, cursorStyle, scrollback, currentTheme, wallpaperEnabled, terminalId])

  useEffect(() => {
    isFocusedRef.current = isFocused
    if (termRef.current && isFocused && isVisibleRef.current) {
      termRef.current.focus()
    }
  }, [isFocused])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const hasSelection = termRef.current ? termRef.current.getSelection() !== '' : false
    setContextMenu({ x: e.clientX, y: e.clientY, hasSelection })
  }

  const handleCopy = () => {
    if (termRef.current) {
      const selection = termRef.current.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection)
      }
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        // term.paste() applies bracketed-paste mode so multi-line pastes are
        // not executed line-by-line by the shell.
        termRef.current?.paste(text)
      }
    } catch (err) {
      console.warn('Paste failed:', err)
    }
  }

  const handleSelectAll = () => {
    if (termRef.current) {
      termRef.current.selectAll()
    }
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleRunQuickAction = (action: QuickAction) => {
    // Prefer live hook cwd; fall back to layout lastCwd / initial restore snapshot
    const tab = useWorkspaceStore.getState().getSelectedTab()
    const layoutLastCwd = tab
      ? getTerminalLastCwd(tab.layout, terminalId)
      : undefined
    injectAction(terminalId, action, {
      cwd: resolveActionCwd(terminalCwd, layoutLastCwd ?? initialCwdRef.current),
      tabTitle: tab?.title ?? null,
    })
  }

  return (
    <div
        ref={containerRef}
        className="terminal-glass w-full h-full relative"
        onContextMenu={handleContextMenu}
        onClick={onFocus}
      >
        <div
          ref={wrapperRef}
          tabIndex={0}
          role="application"
          aria-label={t('terminal.label')}
          className="terminal-xterm w-full h-full"
        />
      <TerminalSearch
        visible={searchVisible}
        searchAddon={searchAddonRef.current}
        onClose={() => setSearchVisible(false)}
      />
      {contextMenu && (
        <TerminalContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasSelection={contextMenu.hasSelection}
          quickActions={quickActions}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          onSplitVertical={() => onSplitVertical?.()}
          onSplitHorizontal={() => onSplitHorizontal?.()}
          onOpenBrowser={() => onOpenBrowser?.()}
          onRunQuickAction={handleRunQuickAction}
          onClose={handleCloseContextMenu}
          onCloseTerminal={() => onCloseTerminal?.()}
        />
      )}
    </div>
  )
}

function TerminalViewWithErrorBoundary(props: TerminalViewProps) {
  const [retryKey, setRetryKey] = useState(0)
  const { t } = useTranslation()
  return (
    <ErrorBoundary
      key={retryKey}
      fallback={
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-red-500 text-sm">
          <span>{t('terminal.crashed')}</span>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="px-3 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
          >
            {t('common.retry')}
          </button>
        </div>
      }
    >
      <TerminalView {...props} />
    </ErrorBoundary>
  )
}

export default memo(TerminalViewWithErrorBoundary)
