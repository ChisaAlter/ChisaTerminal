import { createHash } from 'node:crypto'

/**
 * Expected SHA-256 of hooks/powershell-hook.ps1 (raw file bytes).
 * Fail closed on mismatch: refuse to load the profile into PowerShell.
 */
export const EXPECTED_HOOK_PROFILE_SHA256 =
  'b69d5c87168f8a0b3b792e35648151b4f5a57b2dcbcd279cafe15b4af4f5a3bc'

export function hashHookProfile(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Returns true only when the content matches the expected digest.
 * Empty expected digest is treated as misconfiguration (fail closed).
 */
export function shouldLoadHookProfile(
  content: Buffer | string,
  expected: string = EXPECTED_HOOK_PROFILE_SHA256
): boolean {
  if (!expected) return false
  return hashHookProfile(content) === expected
}
