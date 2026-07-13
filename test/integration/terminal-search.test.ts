import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { SearchAddon } from '@xterm/addon-search'
import {
  createSearchAddon,
  findNext,
  findPrevious,
  toXtermSearchOptions,
} from '../../src/renderer/utils/terminal-search.js'

function createTestTerminal(cols = 80, rows = 24) {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  const term = new Terminal({ cols, rows, allowProposedApi: true })
  term.open(container)
  const addon = new SearchAddon()
  term.loadAddon(addon)
  return { term, addon, container }
}

async function writeLines(term: Terminal, lines: string[]) {
  const data = lines.join('\r\n') + '\r\n'
  await new Promise<void>((resolve) => term.write(data, resolve))
}

async function writeErrorLines(term: Terminal, count: number) {
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const marker = i % 2 === 0 ? 'error' : 'info'
    lines.push(`line ${i} ${marker}`)
  }
  await writeLines(term, lines)
}

function attachResultCollector(addon: SearchAddon) {
  const results: { resultIndex: number; resultCount: number }[] = []
  let latest = results[0] ?? { resultIndex: -1, resultCount: 0 }
  addon.onDidChangeResults((e) => {
    latest = { resultIndex: e.resultIndex, resultCount: e.resultCount }
    results.push(latest)
  })
  return { results, getLatest: () => latest }
}

async function flushMicrotasks() {
  await Promise.resolve()
}

describe('terminal search integration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('finds expected match count and navigates through 100 lines', async () => {
    const { term, addon } = createTestTerminal()
    await writeErrorLines(term, 100)

    const collector = attachResultCollector(addon)
    findNext(addon, { keyword: 'error' })
    await flushMicrotasks()

    expect(collector.getLatest().resultCount).toBe(50)
    expect(collector.getLatest().resultIndex).toBe(0)
    expect(term.getSelection()).toBe('error')

    findNext(addon, { keyword: 'error' })
    await flushMicrotasks()
    expect(collector.getLatest().resultIndex).toBe(1)

    findNext(addon, { keyword: 'error' })
    await flushMicrotasks()
    expect(collector.getLatest().resultIndex).toBe(2)

    findPrevious(addon, { keyword: 'error' })
    await flushMicrotasks()
    expect(collector.getLatest().resultIndex).toBe(1)
  })

  it('isolates search between split terminals', async () => {
    const left = createTestTerminal()
    const right = createTestTerminal()

    await writeErrorLines(left.term, 100)
    await writeLines(
      right.term,
      Array.from({ length: 100 }, (_, i) => `line ${i} info`)
    )

    const leftCollector = attachResultCollector(left.addon)
    const rightCollector = attachResultCollector(right.addon)

    findNext(left.addon, { keyword: 'error' })
    await flushMicrotasks()
    expect(leftCollector.getLatest().resultCount).toBe(50)
    expect(left.term.getSelection()).toBe('error')

    findNext(right.addon, { keyword: 'error' })
    await flushMicrotasks()
    expect(rightCollector.getLatest().resultCount).toBe(0)
    expect(right.term.getSelection()).toBe('')

    // 右侧搜索不应影响左侧选区
    expect(left.term.getSelection()).toBe('error')
  })

  it('supports regex, case sensitive and whole word modes', async () => {
    const { term, addon } = createTestTerminal()
    await writeLines(term, ['Error error ERROR error_info', 'error error'])

    const collector = attachResultCollector(addon)

    // 普通文本：忽略大小写，包含子串匹配
    findNext(addon, { keyword: 'error' })
    await flushMicrotasks()
    expect(collector.getLatest().resultCount).toBe(6)

    // 区分大小写：只有小写 error
    findNext(addon, { keyword: 'error', caseSensitive: true })
    await flushMicrotasks()
    expect(collector.getLatest().resultCount).toBe(4)

    // 整词匹配：排除 error-info 中的部分匹配
    findNext(addon, { keyword: 'error', wholeWord: true })
    await flushMicrotasks()
    expect(collector.getLatest().resultCount).toBe(5)

    // 正则：匹配 Error/ERROR
    findNext(addon, { keyword: '[Ee]rror', regex: true })
    await flushMicrotasks()
    expect(collector.getLatest().resultCount).toBe(6)
  })

  it('searches 10000-line buffer in under 500ms', async () => {
    const { term, addon } = createTestTerminal()
    const lines = Array.from({ length: 10000 }, (_, i) =>
      `log line ${i} ${i % 10 === 0 ? 'error' : 'ok'}`
    )
    await writeLines(term, lines)

    const start = performance.now()
    findNext(addon, { keyword: 'error' })
    await flushMicrotasks()
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(500)
  })
})
