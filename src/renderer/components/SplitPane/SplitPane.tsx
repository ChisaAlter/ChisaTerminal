import { memo, useCallback, useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import TerminalView from '../Terminal/TerminalView.js'
import type { SplitNode, SplitDirection } from '@shared/types'
import { resolveRestoredCwd } from '../../stores/useWorkspaceStore.js'

interface SplitPaneProps {
  workspaceId: string
  tabId: string
  node: SplitNode
  focusedTerminalId: string
  onFocusTerminal: (workspaceId: string, tabId: string, terminalId: string) => void
  onUpdateRatio: (workspaceId: string, tabId: string, splitId: string, ratio: number) => void
  onSplitTerminal: (workspaceId: string, tabId: string, terminalId: string, direction: SplitDirection) => void
  onCloseTerminal: (workspaceId: string, tabId: string, terminalId: string) => void
  onOpenBrowser: (terminalId: string) => void
}

function SplitPane({
  workspaceId,
  tabId,
  node,
  focusedTerminalId,
  onFocusTerminal,
  onUpdateRatio,
  onSplitTerminal,
  onCloseTerminal,
  onOpenBrowser,
}: SplitPaneProps) {
  if (node.type === 'terminal') {
    return (
      <TerminalPane
        workspaceId={workspaceId}
        tabId={tabId}
        terminalId={node.terminalId}
        initialCwd={resolveRestoredCwd(node.lastCwd)}
        isFocused={focusedTerminalId === node.terminalId}
        onFocusTerminal={onFocusTerminal}
        onSplitTerminal={onSplitTerminal}
        onCloseTerminal={onCloseTerminal}
        onOpenBrowser={onOpenBrowser}
      />
    )
  }

  return (
    <SplitView
      workspaceId={workspaceId}
      tabId={tabId}
      splitNode={node}
      focusedTerminalId={focusedTerminalId}
      onFocusTerminal={onFocusTerminal}
      onUpdateRatio={onUpdateRatio}
      onSplitTerminal={onSplitTerminal}
      onCloseTerminal={onCloseTerminal}
      onOpenBrowser={onOpenBrowser}
    />
  )
}

export default memo(SplitPane)

interface TerminalPaneProps {
  workspaceId: string
  tabId: string
  terminalId: string
  /** Restored lastCwd for initial PTY create only (not a live session driver). */
  initialCwd?: string
  isFocused: boolean
  onFocusTerminal: (workspaceId: string, tabId: string, terminalId: string) => void
  onSplitTerminal: (workspaceId: string, tabId: string, terminalId: string, direction: SplitDirection) => void
  onCloseTerminal: (workspaceId: string, tabId: string, terminalId: string) => void
  onOpenBrowser: (terminalId: string) => void
}

function TerminalPane({
  workspaceId,
  tabId,
  terminalId,
  initialCwd,
  isFocused,
  onFocusTerminal,
  onSplitTerminal,
  onCloseTerminal,
  onOpenBrowser,
}: TerminalPaneProps) {
  const handleFocus = useCallback(() => {
    onFocusTerminal(workspaceId, tabId, terminalId)
  }, [onFocusTerminal, workspaceId, tabId, terminalId])
  const handleSplitVertical = useCallback(() => {
    onSplitTerminal(workspaceId, tabId, terminalId, 'vertical')
  }, [onSplitTerminal, workspaceId, tabId, terminalId])
  const handleSplitHorizontal = useCallback(() => {
    onSplitTerminal(workspaceId, tabId, terminalId, 'horizontal')
  }, [onSplitTerminal, workspaceId, tabId, terminalId])
  const handleCloseTerminal = useCallback(() => {
    onCloseTerminal(workspaceId, tabId, terminalId)
  }, [onCloseTerminal, workspaceId, tabId, terminalId])
  const handleOpenBrowser = useCallback(() => {
    onOpenBrowser(terminalId)
  }, [onOpenBrowser, terminalId])

  return (
    <div
      className={`flex-1 h-full w-full relative overflow-hidden transition-opacity ${
        isFocused ? 'opacity-100' : 'opacity-80'
      }`}
    >
      <TerminalView
        terminalId={terminalId}
        initialCwd={initialCwd}
        isFocused={isFocused}
        onFocus={handleFocus}
        onSplitVertical={handleSplitVertical}
        onSplitHorizontal={handleSplitHorizontal}
        onCloseTerminal={handleCloseTerminal}
        onOpenBrowser={handleOpenBrowser}
      />
    </div>
  )
}

interface SplitViewProps extends Omit<SplitPaneProps, 'node'> {
  splitNode: Extract<SplitNode, { type: 'split' }>
}

function SplitView({
  workspaceId,
  tabId,
  splitNode,
  focusedTerminalId,
  onFocusTerminal,
  onUpdateRatio,
  onSplitTerminal,
  onCloseTerminal,
  onOpenBrowser,
}: SplitViewProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ pos: number; ratio: number } | null>(null)
  const cleanupDragRef = useRef<(() => void) | null>(null)

  const isHorizontal = splitNode.direction === 'horizontal'

  const handleMouseDown = (e: React.PointerEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const pos = isHorizontal ? e.clientY : e.clientX
    dragStartRef.current = { pos, ratio: splitNode.ratio }

    const target = e.currentTarget as HTMLElement
    // 捕获指针，保证 pointermove/pointerup 必触发到该元素，即使鼠标移出窗口或落在 webview 上
    try { target.setPointerCapture(e.pointerId) } catch { /* ignore */ }

    const handlePointerMove = (ev: PointerEvent) => {
      if (!containerRef.current || !dragStartRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const totalSize = isHorizontal ? rect.height : rect.width
      const currentPos = isHorizontal ? ev.clientY : ev.clientX
      const delta = currentPos - dragStartRef.current.pos
      const deltaRatio = delta / totalSize

      let newRatio = dragStartRef.current.ratio + deltaRatio
      newRatio = Math.max(0.1, Math.min(0.9, newRatio))

      onUpdateRatio(workspaceId, tabId, splitNode.splitId, newRatio)
    }

    const finishDrag = (ev: PointerEvent) => {
      setIsDragging(false)
      dragStartRef.current = null
      try { target.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerUp)
      target.removeEventListener('pointercancel', handlePointerCancel)
      cleanupDragRef.current = null
    }
    const handlePointerUp = (ev: PointerEvent) => {
      finishDrag(ev)
    }
    const handlePointerCancel = (ev: PointerEvent) => {
      finishDrag(ev)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', handlePointerUp)
    target.addEventListener('pointercancel', handlePointerCancel)
    cleanupDragRef.current = () => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerUp)
      target.removeEventListener('pointercancel', handlePointerCancel)
    }
  }

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.()
      cleanupDragRef.current = null
      dragStartRef.current = null
    }
  }, [])

  const firstStyle: React.CSSProperties = isHorizontal
    ? { height: `${splitNode.ratio * 100}%` }
    : { width: `${splitNode.ratio * 100}%` }

  const secondStyle: React.CSSProperties = isHorizontal
    ? { height: `${(1 - splitNode.ratio) * 100}%` }
    : { width: `${(1 - splitNode.ratio) * 100}%` }

  const dividerStyle: React.CSSProperties = isHorizontal
    ? { cursor: 'row-resize', height: '4px' }
    : { cursor: 'col-resize', width: '4px' }

  const handleDividerKeyDown = (e: React.KeyboardEvent) => {
    const step = 0.05
    let delta = 0
    if (isHorizontal) {
      if (e.key === 'ArrowDown') delta = step
      else if (e.key === 'ArrowUp') delta = -step
      else return
    } else {
      if (e.key === 'ArrowRight') delta = step
      else if (e.key === 'ArrowLeft') delta = -step
      else return
    }
    e.preventDefault()
    const newRatio = Math.max(0.1, Math.min(0.9, splitNode.ratio + delta))
    onUpdateRatio(workspaceId, tabId, splitNode.splitId, newRatio)
  }

  return (
    <div
      ref={containerRef}
      className={`flex w-full h-full ${
        isHorizontal ? 'flex-col' : 'flex-row'
      }`}
    >
      <div style={firstStyle} className="overflow-hidden min-w-0 min-h-0">
        <SplitPane
          workspaceId={workspaceId}
          tabId={tabId}
          node={splitNode.first}
          focusedTerminalId={focusedTerminalId}
          onFocusTerminal={onFocusTerminal}
          onUpdateRatio={onUpdateRatio}
          onSplitTerminal={onSplitTerminal}
          onCloseTerminal={onCloseTerminal}
          onOpenBrowser={onOpenBrowser}
        />
      </div>
      <div
        style={dividerStyle}
        role="separator"
        tabIndex={0}
        aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
        aria-valuenow={Math.round(splitNode.ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={isHorizontal ? t('pane.split_horizontal') : t('pane.split_vertical')}
        onPointerDown={handleMouseDown}
        onKeyDown={handleDividerKeyDown}
        className={`
          bg-border hover:bg-accent transition-colors shrink-0
          ${isDragging ? 'bg-accent' : ''}
          focus:outline-none focus:ring-2 focus:ring-accent
        `}
      />
      <div style={secondStyle} className="flex-1 overflow-hidden min-w-0 min-h-0">
        <SplitPane
          workspaceId={workspaceId}
          tabId={tabId}
          node={splitNode.second}
          focusedTerminalId={focusedTerminalId}
          onFocusTerminal={onFocusTerminal}
          onUpdateRatio={onUpdateRatio}
          onSplitTerminal={onSplitTerminal}
          onCloseTerminal={onCloseTerminal}
          onOpenBrowser={onOpenBrowser}
        />
      </div>
    </div>
  )
}
