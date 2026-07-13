import { describe, it, expect } from 'vitest'
import {
  getAllTerminalIds,
  replaceTerminal,
  removeTerminal,
  updateRatio,
  stripTerminalIds,
  setTerminalLastCwd,
  getTerminalLastCwd,
  mapWorkspacesToPersistent,
  mapPersistentToWorkspaces,
  resolveRestoredCwd,
  resolveActionCwd,
} from '../useWorkspaceStore.js'
import type { SplitNode, Workspace } from '@shared/types'

function term(id: string, lastCwd?: string): SplitNode {
  return lastCwd
    ? { type: 'terminal', terminalId: id, lastCwd }
    : { type: 'terminal', terminalId: id }
}

function split(
  id: string,
  first: SplitNode,
  second: SplitNode,
  ratio = 0.5
): SplitNode {
  return { type: 'split', splitId: id, direction: 'vertical', ratio, first, second }
}

describe('getAllTerminalIds', () => {
  it('returns single id for terminal node', () => {
    expect(getAllTerminalIds(term('a'))).toEqual(['a'])
  })

  it('flattens nested split tree in depth-first order', () => {
    const tree = split('s1', term('a'), split('s2', term('b'), term('c')))
    expect(getAllTerminalIds(tree)).toEqual(['a', 'b', 'c'])
  })

  it('handles deeply nested tree', () => {
    const tree = split('s1', split('s2', term('a'), term('b')), split('s3', term('c'), term('d')))
    expect(getAllTerminalIds(tree)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('replaceTerminal', () => {
  it('replaces matching terminal node', () => {
    const tree = split('s1', term('a'), term('b'))
    const result = replaceTerminal(tree, 'b', term('c'))
    expect(getAllTerminalIds(result)).toEqual(['a', 'c'])
  })

  it('returns original node when no match at terminal level', () => {
    expect(replaceTerminal(term('a'), 'b', term('c'))).toEqual(term('a'))
  })

  it('replaces matching terminal in nested tree', () => {
    const tree = split('s1', term('a'), split('s2', term('b'), term('c')))
    const result = replaceTerminal(tree, 'c', term('d'))
    expect(getAllTerminalIds(result)).toEqual(['a', 'b', 'd'])
  })

  it('does not mutate original tree', () => {
    const tree = split('s1', term('a'), term('b'))
    const snapshot = JSON.parse(JSON.stringify(tree))
    replaceTerminal(tree, 'b', term('c'))
    expect(tree).toEqual(snapshot)
  })
})

describe('removeTerminal', () => {
  it('returns null when removing the only terminal', () => {
    expect(removeTerminal(term('a'), 'a')).toBeNull()
  })

  it('returns original when terminal does not match', () => {
    expect(removeTerminal(term('a'), 'b')).toEqual(term('a'))
  })

  it('returns sibling when removing from a two-terminal split', () => {
    const tree = split('s1', term('a'), term('b'))
    expect(removeTerminal(tree, 'b')).toEqual(term('a'))
    expect(removeTerminal(tree, 'a')).toEqual(term('b'))
  })

  it('removes from nested tree and collapses parent split', () => {
    const tree = split('s1', term('a'), split('s2', term('b'), term('c')))
    expect(removeTerminal(tree, 'c')).toEqual(split('s1', term('a'), term('b')))
  })

  it('returns original tree when terminal id not found', () => {
    const tree = split('s1', term('a'), term('b'))
    expect(removeTerminal(tree, 'x')).toEqual(tree)
  })
})

describe('updateRatio', () => {
  it('updates ratio on matching split', () => {
    const tree = split('s1', term('a'), term('b'), 0.5)
    const result = updateRatio(tree, 's1', 0.3)
    expect(result.type).toBe('split')
    if (result.type === 'split') {
      expect(result.ratio).toBe(0.3)
    }
  })

  it('returns terminal node unchanged', () => {
    expect(updateRatio(term('a'), 's1', 0.3)).toEqual(term('a'))
  })

  it('updates ratio on nested split', () => {
    const tree = split('s1', term('a'), split('s2', term('b'), term('c'), 0.5), 0.5)
    const result = updateRatio(tree, 's2', 0.7)
    if (result.type === 'split' && result.second.type === 'split') {
      expect(result.second.ratio).toBe(0.7)
    } else {
      throw new Error('expected nested split structure')
    }
  })

  it('does not mutate original tree', () => {
    const tree = split('s1', term('a'), term('b'), 0.5)
    const snapshot = JSON.parse(JSON.stringify(tree))
    updateRatio(tree, 's1', 0.3)
    expect(tree).toEqual(snapshot)
  })
})

describe('cwd persistence helpers', () => {
  it('setTerminalLastCwd / getTerminalLastCwd round-trip on nested layout', () => {
    const tree = split('s1', term('a'), term('b'))
    const next = setTerminalLastCwd(tree, 'b', 'C:\\Projects\\demo')
    expect(getTerminalLastCwd(next, 'b')).toBe('C:\\Projects\\demo')
    expect(getTerminalLastCwd(next, 'a')).toBeUndefined()
  })

  it('stripTerminalIds keeps lastCwd while clearing terminalId', () => {
    const tree = split(
      's1',
      term('a', 'C:\\Work\\a'),
      term('b', 'C:\\Work\\b')
    )
    const stripped = stripTerminalIds(tree)
    expect(stripped.type).toBe('split')
    if (stripped.type === 'split') {
      expect(stripped.first).toEqual({
        type: 'terminal',
        terminalId: '',
        lastCwd: 'C:\\Work\\a',
      })
      expect(stripped.second).toEqual({
        type: 'terminal',
        terminalId: '',
        lastCwd: 'C:\\Work\\b',
      })
    }
  })

  it('map save → load restores lastCwd for PTY create via resolveRestoredCwd', () => {
    const workspaces: Workspace[] = [
      {
        id: 'ws-1',
        name: 'Main',
        selectedTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            title: 'demo',
            focusedTerminalId: 'term-old',
            userRenamed: false,
            layout: term('term-old', 'C:\\Ai\\ChisaTerminal'),
          },
        ],
      },
    ]

    const persistent = mapWorkspacesToPersistent(workspaces, 'ws-1')
    // terminalId stripped, lastCwd kept
    const savedLayout = persistent.workspaces[0]!.tabs[0]!.layout
    expect(savedLayout.type).toBe('terminal')
    if (savedLayout.type === 'terminal') {
      expect(savedLayout.terminalId).toBe('')
      expect(savedLayout.lastCwd).toBe('C:\\Ai\\ChisaTerminal')
    }

    const restored = mapPersistentToWorkspaces(persistent)
    const layout = restored.workspaces[0]!.tabs[0]!.layout
    expect(layout.type).toBe('terminal')
    if (layout.type === 'terminal') {
      expect(layout.terminalId).not.toBe('')
      expect(layout.terminalId).not.toBe('term-old')
      expect(layout.lastCwd).toBe('C:\\Ai\\ChisaTerminal')
      // Same value SplitPane passes into TerminalView → pty.create
      expect(resolveRestoredCwd(layout.lastCwd)).toBe('C:\\Ai\\ChisaTerminal')
    }
  })

  it('resolveRestoredCwd falls back safely for empty/missing values', () => {
    expect(resolveRestoredCwd(undefined)).toBeUndefined()
    expect(resolveRestoredCwd(null)).toBeUndefined()
    expect(resolveRestoredCwd('')).toBeUndefined()
    expect(resolveRestoredCwd('   ')).toBeUndefined()
    expect(resolveRestoredCwd('/tmp/ok')).toBe('/tmp/ok')
  })

  it('resolveActionCwd prefers hook cwd then layout lastCwd (palette post-restore path)', () => {
    expect(resolveActionCwd('C:\\live', 'C:\\saved')).toBe('C:\\live')
    expect(resolveActionCwd(null, 'C:\\saved')).toBe('C:\\saved')
    expect(resolveActionCwd(undefined, 'C:\\saved')).toBe('C:\\saved')
    expect(resolveActionCwd(null, undefined)).toBeNull()
    expect(resolveActionCwd('', '  ')).toBeNull()
    // Same composition CommandPalette uses: hook state then layout
    const layout = term('term-1', 'C:\\Ai\\ChisaTerminal')
    const fromLayout = getTerminalLastCwd(layout, 'term-1')
    expect(resolveActionCwd(undefined, fromLayout)).toBe('C:\\Ai\\ChisaTerminal')
  })
})

