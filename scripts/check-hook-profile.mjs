/**
 * CI guard: hooks/powershell-hook.ps1 must hash to the pinned
 * EXPECTED_HOOK_PROFILE_SHA256 in src/main/pty/hookProfileIntegrity.ts.
 * A mismatch means either the profile was changed without re-pinning
 * (runtime would fail closed and silently skip hooks) or tampering.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const integritySource = readFileSync(
  path.join(root, 'src', 'main', 'pty', 'hookProfileIntegrity.ts'),
  'utf8'
)
const match = integritySource.match(
  /EXPECTED_HOOK_PROFILE_SHA256\s*=\s*\n?\s*'([a-f0-9]{64})'/
)
if (!match) {
  console.error('[check-hook-profile] EXPECTED_HOOK_PROFILE_SHA256 not found or malformed')
  process.exit(1)
}
const expected = match[1]

const profile = readFileSync(path.join(root, 'hooks', 'powershell-hook.ps1'))
const actual = createHash('sha256').update(profile).digest('hex')

if (actual !== expected) {
  console.error('[check-hook-profile] SHA-256 mismatch!')
  console.error(`  expected: ${expected}`)
  console.error(`  actual:   ${actual}`)
  console.error('  Update EXPECTED_HOOK_PROFILE_SHA256 if the profile change is intentional.')
  process.exit(1)
}

console.log('[check-hook-profile] OK:', actual)
