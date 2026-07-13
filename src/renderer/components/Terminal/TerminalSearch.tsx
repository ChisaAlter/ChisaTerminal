import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { SearchAddon } from '@xterm/addon-search'
import {
  findNext,
  findPrevious,
  clearSearch,
  type TerminalSearchOptions,
} from '../../utils/terminal-search.js'
import { useSettingsStore } from '../../stores/useSettingsStore.js'

interface TerminalSearchProps {
  visible: boolean
  searchAddon: SearchAddon | null
  onClose: () => void
}

export default function TerminalSearch({
  visible,
  searchAddon,
  onClose,
}: TerminalSearchProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [keyword, setKeyword] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const searchHistory = useSettingsStore((s) => s.settings.searchHistory)
  const addSearchHistory = useSettingsStore((s) => s.addSearchHistory)

  const options = useMemo<TerminalSearchOptions>(
    () => ({ keyword, regex, caseSensitive, wholeWord }),
    [keyword, regex, caseSensitive, wholeWord]
  )

  const doSearch = useCallback(
    (direction: 'next' | 'previous') => {
      if (!searchAddon || !keyword.trim()) return
      const found =
        direction === 'next'
          ? findNext(searchAddon, options)
          : findPrevious(searchAddon, options)
      if (found) {
        addSearchHistory(keyword)
      }
    },
    [searchAddon, keyword, regex, caseSensitive, wholeWord, addSearchHistory]
  )

  useEffect(() => {
    if (visible) {
      setShowHistory(false)
      // 聚焦到输入框并选中已有文本
      const input = inputRef.current
      if (input) {
        input.focus()
        input.select()
      }
    } else {
      if (searchAddon) {
        clearSearch(searchAddon)
      }
    }
  }, [visible, searchAddon])

  // 卸载时清理 blur 定时器，避免在组件销毁后仍触发状态更新
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!visible || !searchAddon) return
    if (keyword.trim()) {
      findNext(searchAddon, options)
    } else {
      clearSearch(searchAddon)
    }
  }, [keyword, regex, caseSensitive, wholeWord, visible, searchAddon])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      doSearch(e.shiftKey ? 'previous' : 'next')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const handleHistorySelect = (item: string) => {
    setKeyword(item)
    setShowHistory(false)
    if (searchAddon) {
      findNext(searchAddon, { ...options, keyword: item })
      addSearchHistory(item)
    }
  }

  if (!visible) return null

  return (
    <div className="absolute top-2 right-2 z-20 bg-canvas border border-border rounded shadow-lg p-2 flex flex-col gap-2 w-80">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (blurTimerRef.current) {
              clearTimeout(blurTimerRef.current)
              blurTimerRef.current = null
            }
            setShowHistory(searchHistory.length > 0)
          }}
          onBlur={() => {
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
            blurTimerRef.current = setTimeout(() => setShowHistory(false), 150)
          }}
          placeholder={t('search.placeholder')}
          className="flex-1 bg-canvas border border-border rounded px-2 py-1 text-foreground text-sm focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => doSearch('previous')}
          disabled={!keyword.trim()}
          className="px-2 py-1 text-xs rounded bg-canvas border border-border hover:bg-border/50 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('search.prev')}
        </button>
        <button
          onClick={() => doSearch('next')}
          disabled={!keyword.trim()}
          className="px-2 py-1 text-xs rounded bg-accent hover:bg-accent/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('search.next')}
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-canvas border border-border hover:bg-border/50 text-foreground transition-colors"
          aria-label={t('search.close')}
        >
          ×
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-foreground">
          <input
            type="checkbox"
            checked={regex}
            onChange={(e) => setRegex(e.target.checked)}
            className="w-3.5 h-3.5 accent-accent"
          />
          {t('search.regex')}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-foreground">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="w-3.5 h-3.5 accent-accent"
          />
          {t('search.case_sensitive')}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-foreground">
          <input
            type="checkbox"
            checked={wholeWord}
            onChange={(e) => setWholeWord(e.target.checked)}
            className="w-3.5 h-3.5 accent-accent"
          />
          {t('search.whole_word')}
        </label>
      </div>

      {showHistory && searchHistory.length > 0 && (
        <ul className="max-h-32 overflow-y-auto border border-border rounded bg-canvas">
          {searchHistory.map((item) => (
            <li
              key={item}
              onMouseDown={(e) => {
                e.preventDefault()
                handleHistorySelect(item)
              }}
              className="px-2 py-1 text-xs text-foreground hover:bg-selection cursor-pointer truncate"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
