import { createHash } from 'node:crypto'

/**
 * Expected SHA-256 of hooks/powershell-hook.ps1 after LF normalization.
 * Fail closed on mismatch: refuse to load the profile into PowerShell.
 *
 * Windows checkouts / tooling may rewrite the profile as CRLF; hashing the
 * normalized LF form keeps CI and runtime integrity checks aligned with the
 * committed LF bytes (see .gitattributes).
 */
export const EXPECTED_HOOK_PROFILE_SHA256 =
  'b69d5c87168f8a0b3b792e35648151b4f5a57b2dcbcd279cafe15b4af4f5a3bc'

/** Normalize CRLF / lone CR to LF before hashing text profiles. */
export function normalizeHookProfileBytes(content: Buffer | string): Buffer {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
  const text = buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return Buffer.from(text, 'utf8')
}

export function hashHookProfile(content: Buffer | string): string {
  return createHash('sha256').update(normalizeHookProfileBytes(content)).digest('hex')
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
