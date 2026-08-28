import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { QuickAction } from '../../../shared/types.js'

interface TerminalContextMenuProps {
  x: number
  y: number
  hasSelection: boolean
  quickActions?: QuickAction[]
  onCopy: () => void
  onPaste: () => void
  onSelectAll: () => void
  onSplitVertical: () => void
  onSplitHorizontal: () => void
  onOpenBrowser: () => void
  onRunQuickAction?: (action: QuickAction) => void
  onClose: () => void
  onCloseTerminal: () => void
}

interface MenuItemProps {
  label: string
  onClick?: () => void
  disabled?: boolean
  separator?: boolean
}

function MenuHeader({ label }: { label: string }) {
  return (
    <div
      role="presentation"
      className="px-4 py-1 text-xs text-text-secondary select-none cursor-default"
    >
      {label}
    </div>
  )
}

function MenuItem({ label, onClick, disabled = false, separator = false }: MenuItemProps) {
  if (separator) {
    return <div role="separator" className="h-px bg-border my-1" />
  }

  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      className={`
        w-full px-4 py-2 text-left text-sm transition-colors
        ${disabled
          ? 'text-text-secondary cursor-default'
          : 'text-foreground hover:bg-selection cursor-pointer'
        }
      `}
    >
      {label}
    </button>
  )
}

export default function TerminalContextMenu({
  x,
  y,
  hasSelection,
  quickActions = [],
  onCopy,
  onPaste,
  onSelectAll,
  onSplitVertical,
  onSplitHorizontal,
  onOpenBrowser,
  onRunQuickAction,
  onClose,
  onCloseTerminal,
}: TerminalContextMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [position, setPosition] = useState({ x, y })

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useLayoutEffect(() => {
    if (!menuRef.current) return

    const menuRect = menuRef.current.getBoundingClientRect()
    const menuWidth = menuRect.width
    const menuHeight = menuRect.height

    let adjustedX = x
    let adjustedY = y

    if (x + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 8
    }
    if (y + menuHeight > window.innerHeight) {
      adjustedY = window.innerHeight - menuHeight - 8
    }

    if (adjustedX < 0) adjustedX = 8
    if (adjustedY < 0) adjustedY = 8

    setPosition({ x: adjustedX, y: adjustedY })
  }, [x, y])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (!menuRef.current) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = Array.from(
          menuRef.current.querySelectorAll<HTMLButtonElement>(
            'button[role="menuitem"]:not([disabled])'
          )
        )
        if (items.length === 0) return
        const currentIndex = items.findIndex((item) => item === document.activeElement)
        let nextIndex: number
        if (currentIndex === -1) {
          nextIndex = 0
        } else if (e.key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % items.length
        } else {
          nextIndex = (currentIndex - 1 + items.length) % items.length
        }
        const nextItem = items[nextIndex]
        if (nextItem) nextItem.focus()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!menuRef.current) return
    const firstItem = menuRef.current.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled])'
    )
    firstItem?.focus()
  }, [])

  const handleClick = (action: () => void) => {
    action()
    onClose()
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('context_menu.label')}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 100,
      }}
      className="bg-canvas border border-border rounded-md shadow-lg py-1 min-w-[180px] max-h-[70vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem
        label={t('terminal.copy')}
        onClick={() => handleClick(onCopy)}
        disabled={!hasSelection}
      />
      <MenuItem
        label={t('terminal.paste')}
        onClick={() => handleClick(onPaste)}
      />
      <MenuItem
        label={t('terminal.select_all')}
        onClick={() => handleClick(onSelectAll)}
      />
      <MenuItem label="" separator />
      <MenuItem
        label={t('pane.split_vertical')}
        onClick={() => handleClick(onSplitVertical)}
      />
      <MenuItem
        label={t('pane.split_horizontal')}
        onClick={() => handleClick(onSplitHorizontal)}
      />
      {quickActions.length > 0 && onRunQuickAction && (
        <>
          <MenuItem label="" separator />
          <MenuHeader label={t('context_menu.quick_actions')} />
          {quickActions.map((action) => (
            <MenuItem
              key={action.id}
              label={action.name}
              onClick={() => handleClick(() => onRunQuickAction(action))}
            />
          ))}
        </>
      )}
      <MenuItem label="" separator />
      <MenuItem
        label={t('browser.open')}
        onClick={() => handleClick(onOpenBrowser)}
      />
      <MenuItem label="" separator />
      <MenuItem
        label={t('pane.close_terminal')}
        onClick={() => handleClick(onCloseTerminal)}
      />
    </div>
  )
}
