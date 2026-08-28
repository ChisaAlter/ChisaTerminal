// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXPECTED_HOOK_PROFILE_SHA256,
  hashHookProfile,
  shouldLoadHookProfile,
} from '../../src/main/pty/hookProfileIntegrity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'hooks',
  'powershell-hook.ps1'
)

describe('hookProfileIntegrity', () => {
  it('has a non-empty expected digest', () => {
    expect(EXPECTED_HOOK_PROFILE_SHA256.length).toBe(64)
    expect(EXPECTED_HOOK_PROFILE_SHA256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('matches the committed powershell-hook.ps1 bytes', () => {
    const content = fs.readFileSync(HOOK_PATH)
    expect(hashHookProfile(content)).toBe(EXPECTED_HOOK_PROFILE_SHA256)
    expect(shouldLoadHookProfile(content)).toBe(true)
  })

  it('matches after CRLF conversion (Windows checkout)', () => {
    const content = fs.readFileSync(HOOK_PATH)
    const asCrlf = Buffer.from(
      content.toString('utf8').replace(/\n/g, '\r\n'),
      'utf8'
    )
    expect(hashHookProfile(asCrlf)).toBe(EXPECTED_HOOK_PROFILE_SHA256)
    expect(shouldLoadHookProfile(asCrlf)).toBe(true)
  })

  it('fails closed when content is tampered', () => {
    const content = fs.readFileSync(HOOK_PATH)
    const tampered = Buffer.concat([content, Buffer.from('\n# tampered\n')])
    expect(shouldLoadHookProfile(tampered)).toBe(false)
  })

  it('fails closed when expected digest is empty (misconfiguration)', () => {
    const content = fs.readFileSync(HOOK_PATH)
    expect(shouldLoadHookProfile(content, '')).toBe(false)
  })
})
