import type { ISearchOptions } from '@xterm/addon-search'
import { SearchAddon } from '@xterm/addon-search'

export interface TerminalSearchOptions {
  keyword: string
  regex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
}

export interface SearchDecorations {
  matchBackground?: string
  matchBorder?: string
  matchOverviewRuler: string
  activeMatchBackground?: string
  activeMatchBorder?: string
  activeMatchColorOverviewRuler: string
}

const DEFAULT_DECORATIONS: SearchDecorations = {
  matchBackground: '#f59e0b',
  matchBorder: '#f59e0b',
  matchOverviewRuler: '#f59e0b',
  activeMatchBackground: '#ef4444',
  activeMatchBorder: '#ef4444',
  activeMatchColorOverviewRuler: '#ef4444',
}

export function createSearchAddon(): SearchAddon {
  return new SearchAddon()
}

const lastSearchOptionsMap = new WeakMap<SearchAddon, TerminalSearchOptions>()

function optionsChanged(
  addon: SearchAddon,
  options: TerminalSearchOptions
): boolean {
  const last = lastSearchOptionsMap.get(addon)
  if (!last) return true
  return (
    last.keyword !== options.keyword ||
    last.regex !== options.regex ||
    last.caseSensitive !== options.caseSensitive ||
    last.wholeWord !== options.wholeWord
  )
}

function trackSearchOptions(
  addon: SearchAddon,
  options: TerminalSearchOptions
): void {
  lastSearchOptionsMap.set(addon, { ...options })
}

export function toXtermSearchOptions(
  options: TerminalSearchOptions,
  decorations: SearchDecorations = DEFAULT_DECORATIONS
): ISearchOptions {
  return {
    regex: options.regex ?? false,
    caseSensitive: options.caseSensitive ?? false,
    wholeWord: options.wholeWord ?? false,
    decorations,
  }
}

export function findNext(
  addon: SearchAddon,
  options: TerminalSearchOptions
): boolean {
  if (!options.keyword) {
    clearSearch(addon)
    return false
  }
  if (optionsChanged(addon, options)) {
    addon.clearDecorations()
  }
  trackSearchOptions(addon, options)
  try {
    return addon.findNext(options.keyword, toXtermSearchOptions(options))
  } catch {
    clearSearch(addon)
    return false
  }
}

export function findPrevious(
  addon: SearchAddon,
  options: TerminalSearchOptions
): boolean {
  if (!options.keyword) {
    clearSearch(addon)
    return false
  }
  if (optionsChanged(addon, options)) {
    addon.clearDecorations()
  }
  trackSearchOptions(addon, options)
  try {
    return addon.findPrevious(options.keyword, toXtermSearchOptions(options))
  } catch {
    clearSearch(addon)
    return false
  }
}

export function clearSearch(addon: SearchAddon): void {
  addon.clearDecorations()
  lastSearchOptionsMap.delete(addon)
}

export function updateSearchHistory(
  history: string[],
  keyword: string,
  maxItems = 10
): string[] {
  const trimmed = keyword.trim()
  if (!trimmed) return history
  const filtered = history.filter((item) => item !== trimmed)
  return [trimmed, ...filtered].slice(0, maxItems)
}

interface SearchController {
  show: () => void
  hide: () => void
}

const searchControllers = new Map<string, SearchController>()

export function registerSearchController(
  terminalId: string,
  controller: SearchController
): void {
  searchControllers.set(terminalId, controller)
}

export function unregisterSearchController(terminalId: string): void {
  searchControllers.delete(terminalId)
}

export function openTerminalSearch(terminalId: string): void {
  searchControllers.get(terminalId)?.show()
}

export function closeTerminalSearch(terminalId: string): void {
  searchControllers.get(terminalId)?.hide()
}
