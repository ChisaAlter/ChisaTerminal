import { describe, it, expect, beforeEach } from 'vitest'
import {
  canAccessTerminal,
  trackOwnership,
  resetOwnershipMaps,
  clearOwnershipForWebContents,
  untrackOwnership,
  getOwnerWebContentsId,
} from '../../src/main/pty/ptyOwnership.js'

describe('PTY ownership maps', () => {
  beforeEach(() => {
    resetOwnershipMaps()
  })

  it('returns false when nothing is tracked', () => {
    expect(canAccessTerminal(1, 'term-a')).toBe(false)
  })

  it('returns true for the owning webContents id', () => {
    trackOwnership(10, 'term-a')
    expect(canAccessTerminal(10, 'term-a')).toBe(true)
    expect(getOwnerWebContentsId('term-a')).toBe(10)
  })

  it('returns false for a different webContents id', () => {
    trackOwnership(10, 'term-a')
    expect(canAccessTerminal(99, 'term-a')).toBe(false)
  })

  it('returns false for a different terminal on the same webContents', () => {
    trackOwnership(10, 'term-a')
    expect(canAccessTerminal(10, 'term-b')).toBe(false)
  })

  it('supports multiple terminals owned by one webContents', () => {
    trackOwnership(10, 'term-a')
    trackOwnership(10, 'term-b')
    expect(canAccessTerminal(10, 'term-a')).toBe(true)
    expect(canAccessTerminal(10, 'term-b')).toBe(true)
    expect(canAccessTerminal(11, 'term-a')).toBe(false)
  })

  it('untrack removes ownership', () => {
    trackOwnership(10, 'term-a')
    untrackOwnership(10, 'term-a')
    expect(canAccessTerminal(10, 'term-a')).toBe(false)
    expect(getOwnerWebContentsId('term-a')).toBeUndefined()
  })

  it('clearOwnershipForWebContents closes all of that wc', () => {
    trackOwnership(10, 'term-a')
    trackOwnership(10, 'term-b')
    trackOwnership(11, 'term-c')
    const closed = clearOwnershipForWebContents(10)
    expect(closed.sort()).toEqual(['term-a', 'term-b'])
    expect(canAccessTerminal(10, 'term-a')).toBe(false)
    expect(canAccessTerminal(11, 'term-c')).toBe(true)
  })
})
