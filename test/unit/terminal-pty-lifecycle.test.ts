// @vitest-environment node
/**
 * Structural contract: TerminalView must create the PTY once per terminalId.
 * Live layout lastCwd / initialCwd prop churn must not appear in the create effect deps.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TERMINAL_VIEW = path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'renderer',
  'components',
  'Terminal',
  'TerminalView.tsx'
)

describe('TerminalView PTY lifecycle contract', () => {
  const source = fs.readFileSync(TERMINAL_VIEW, 'utf8')

  it('calls pty.create with the identity-scoped initialCwdRef snapshot', () => {
    expect(source).toMatch(/api\.pty\.create\(\s*terminalId\s*,\s*initialCwdRef\.current\s*\)/)
  })

  it('does not list cwd / initialCwd in the create-effect dependency array', () => {
    // The create/dispose effect must close with [terminalId] only.
    // A regression that reintroduces cwd would respawn PTY on every cd/hook update.
    expect(source).toMatch(
      /unregisterSearchController\(terminalId\)[\s\S]*?\}, \[terminalId\]\)/
    )
    expect(source).not.toMatch(/\}, \[terminalId,\s*(cwd|initialCwd)\]\)/)
    expect(source).not.toMatch(/\}, \[(cwd|initialCwd),\s*terminalId\]\)/)
  })

  it('uses resolveActionCwd for quick-action inject (hook then layout fallback)', () => {
    expect(source).toMatch(/resolveActionCwd\(\s*terminalCwd/)
  })
})
