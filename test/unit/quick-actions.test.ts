import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuickAction } from '../../src/shared/types.js'

const writeMock = vi.fn()

;(globalThis as unknown as { window: Record<string, unknown> }).window = {
  ...(globalThis as unknown as { window?: Record<string, unknown> }).window,
  electronAPI: {
    platform: 'win32',
    pty: { write: writeMock },
  },
  navigator: { userAgent: 'Windows NT 10.0' },
}

const {
  escapeShellArg,
  buildInjectedCommand,
  resolveShellPlatform,
  useQuickActionsStore,
} = await import('../../src/renderer/stores/useQuickActionsStore.js')

describe('resolveShellPlatform', () => {
  it('honors explicit win32 / unix-like hints', () => {
    expect(resolveShellPlatform('win32')).toBe('win32')
    expect(resolveShellPlatform('darwin')).toBe('unix')
    expect(resolveShellPlatform('linux')).toBe('unix')
  })

  it('uses preload-injected electronAPI.platform', () => {
    expect(resolveShellPlatform(null)).toBe('win32')
  })
})

describe('escapeShellArg', () => {
  it('returns safe plain strings unchanged', () => {
    expect(escapeShellArg('hello', 'win32')).toBe('hello')
    expect(escapeShellArg('foo-bar_baz.txt', 'unix')).toBe('foo-bar_baz.txt')
    expect(escapeShellArg('C:/Users/admin/projects', 'win32')).toBe(
      'C:/Users/admin/projects'
    )
    expect(escapeShellArg('C:\\Users\\System32', 'win32')).toBe(
      'C:\\Users\\System32'
    )
  })

  it('wraps values containing spaces with platform-specific rules', () => {
    expect(escapeShellArg('/path/with spaces', 'unix')).toBe(
      '"/path/with spaces"'
    )
    // On Windows backslashes must NOT be doubled
    expect(escapeShellArg('C:\\Users\\My Name', 'win32')).toBe(
      '"C:\\Users\\My Name"'
    )
    // Unix doubles backslashes inside quoted strings
    expect(escapeShellArg('C:\\Users\\My Name', 'unix')).toBe(
      '"C:\\\\Users\\\\My Name"'
    )
  })

  it('escapes double quotes', () => {
    expect(escapeShellArg('say "hello"', 'win32')).toBe('"say \\"hello\\""')
    expect(escapeShellArg('say "hello"', 'unix')).toBe('"say \\"hello\\""')
  })

  it('escapes backticks and dollar signs on unix only', () => {
    expect(escapeShellArg('echo `whoami`', 'win32')).toBe('"echo `whoami`"')
    expect(escapeShellArg('echo `whoami`', 'unix')).toBe('"echo \\`whoami\\`"')
    expect(escapeShellArg('echo $HOME', 'win32')).toBe('"echo $HOME"')
    expect(escapeShellArg('echo $HOME', 'unix')).toBe('"echo \\$HOME"')
  })

  it('escapes percent signs on Windows', () => {
    expect(escapeShellArg('50%', 'win32')).toBe('"50%%"')
    expect(escapeShellArg('100% done', 'win32')).toBe('"100%% done"')
  })
})

describe('buildInjectedCommand (shipped substitution path)', () => {
  it('escapes cwd and tab placeholders by default', () => {
    const action: QuickAction = {
      id: '1',
      name: 'test',
      command: 'cd {cwd} && echo {tab}',
    }
    const out = buildInjectedCommand(
      action,
      { cwd: '/path/with spaces', tabTitle: 'tab & pipe' },
      'unix'
    )
    expect(out).toBe('cd "/path/with spaces" && echo "tab & pipe"\r')
  })

  it('keeps raw placeholders unescaped', () => {
    const action: QuickAction = {
      id: '2',
      name: 'raw',
      command: 'cd {cwd:raw} && echo {tab:raw}',
    }
    const out = buildInjectedCommand(
      action,
      { cwd: '/path/with spaces', tabTitle: 'tab & pipe' },
      'unix'
    )
    expect(out).toBe('cd /path/with spaces && echo tab & pipe\r')
  })

  it('appends carriage return terminator', () => {
    const action: QuickAction = { id: '3', name: 'enter', command: 'ls' }
    expect(buildInjectedCommand(action, {}, 'unix')).toBe('ls\r')
  })
})

describe('injectAction (writes via electronAPI.pty.write)', () => {
  beforeEach(() => {
    writeMock.mockClear()
  })

  it('writes the same payload as buildInjectedCommand to the focused terminal path', () => {
    const action: QuickAction = {
      id: '1',
      name: 'test',
      command: 'cd {cwd} && echo {tab}',
    }
    const expected = buildInjectedCommand(
      action,
      { cwd: '/path/with spaces', tabTitle: 'tab & pipe' },
      'win32'
    )
    useQuickActionsStore.getState().injectAction('term-1', action, {
      cwd: '/path/with spaces',
      tabTitle: 'tab & pipe',
    })
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(writeMock).toHaveBeenCalledWith('term-1', expected)
  })

  it('writes command followed by carriage return with no context', () => {
    const action: QuickAction = { id: '3', name: 'enter', command: 'ls' }
    useQuickActionsStore.getState().injectAction('term-3', action, {})
    expect(writeMock).toHaveBeenCalledWith('term-3', 'ls\r')
  })
})
