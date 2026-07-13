import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createSearchAddon,
  toXtermSearchOptions,
  updateSearchHistory,
  findNext,
  findPrevious,
  clearSearch,
  registerSearchController,
  unregisterSearchController,
  openTerminalSearch,
  closeTerminalSearch,
  type TerminalSearchOptions,
} from '../../src/renderer/utils/terminal-search.js'

describe('toXtermSearchOptions', () => {
  it('maps plain text options with default flags', () => {
    const opts: TerminalSearchOptions = { keyword: 'hello' }
    const result = toXtermSearchOptions(opts)
    expect(result.regex).toBe(false)
    expect(result.caseSensitive).toBe(false)
    expect(result.wholeWord).toBe(false)
    expect(result.decorations).toBeDefined()
  })

  it('maps regex option', () => {
    const opts: TerminalSearchOptions = { keyword: 'err.*', regex: true }
    const result = toXtermSearchOptions(opts)
    expect(result.regex).toBe(true)
  })

  it('maps case sensitive option', () => {
    const opts: TerminalSearchOptions = { keyword: 'Error', caseSensitive: true }
    const result = toXtermSearchOptions(opts)
    expect(result.caseSensitive).toBe(true)
  })

  it('maps whole word option', () => {
    const opts: TerminalSearchOptions = { keyword: 'error', wholeWord: true }
    const result = toXtermSearchOptions(opts)
    expect(result.wholeWord).toBe(true)
  })

  it('maps all four modes together', () => {
    const opts: TerminalSearchOptions = {
      keyword: 'ERROR',
      regex: true,
      caseSensitive: true,
      wholeWord: true,
    }
    const result = toXtermSearchOptions(opts)
    expect(result.regex).toBe(true)
    expect(result.caseSensitive).toBe(true)
    expect(result.wholeWord).toBe(true)
  })
})

describe('updateSearchHistory', () => {
  it('prepends new keyword', () => {
    expect(updateSearchHistory(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('deduplicates existing keyword and moves it to front', () => {
    expect(updateSearchHistory(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('ignores empty or whitespace-only keyword', () => {
    expect(updateSearchHistory(['a'], '')).toEqual(['a'])
    expect(updateSearchHistory(['a'], '   ')).toEqual(['a'])
  })

  it('limits history to max items', () => {
    const history = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    expect(updateSearchHistory(history, '11')).toEqual([
      '11', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    ])
  })

  it('respects custom max items', () => {
    expect(updateSearchHistory(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a'])
  })
})

describe('SearchAddon helpers', () => {
  let addon: ReturnType<typeof createSearchAddon>

  beforeEach(() => {
    addon = createSearchAddon()
  })

  afterEach(() => {
    addon.dispose()
  })

  it('clears decorations when keyword is empty', () => {
    const clearSpy = vi.spyOn(addon, 'clearDecorations')
    expect(findNext(addon, { keyword: '' })).toBe(false)
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('delegates findPrevious to addon', () => {
    const prevSpy = vi.spyOn(addon, 'findPrevious').mockReturnValue(true)
    findPrevious(addon, { keyword: 'test', regex: true })
    expect(prevSpy).toHaveBeenCalledWith('test', expect.objectContaining({ regex: true }))
    prevSpy.mockRestore()
  })

  it('clearSearch calls clearDecorations', () => {
    const clearSpy = vi.spyOn(addon, 'clearDecorations')
    clearSearch(addon)
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

describe('search controller registry', () => {
  it('opens and closes search for a registered terminal', () => {
    const show = vi.fn()
    const hide = vi.fn()
    registerSearchController('term-1', { show, hide })

    openTerminalSearch('term-1')
    expect(show).toHaveBeenCalled()

    closeTerminalSearch('term-1')
    expect(hide).toHaveBeenCalled()

    unregisterSearchController('term-1')

    openTerminalSearch('term-1')
    expect(show).toHaveBeenCalledTimes(1)
  })
})
