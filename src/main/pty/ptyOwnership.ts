/**
 * PTY session ownership maps: webContents.id → terminalIds.
 * Kept free of Electron IPC side effects so unit tests can import safely.
 */

const wcToTerminals = new Map<number, Set<string>>()
const terminalToWc = new Map<string, Set<number>>()

export function canAccessTerminal(webContentsId: number, terminalId: string): boolean {
  const set = wcToTerminals.get(webContentsId)
  return !!set?.has(terminalId)
}

export function trackOwnership(webContentsId: number, terminalId: string): void {
  let set = wcToTerminals.get(webContentsId)
  if (!set) {
    set = new Set()
    wcToTerminals.set(webContentsId, set)
  }
  set.add(terminalId)

  let back = terminalToWc.get(terminalId)
  if (!back) {
    back = new Set()
    terminalToWc.set(terminalId, back)
  }
  back.add(webContentsId)
}

export function untrackOwnership(webContentsId: number, terminalId: string): void {
  const set = wcToTerminals.get(webContentsId)
  if (set) {
    set.delete(terminalId)
    if (set.size === 0) wcToTerminals.delete(webContentsId)
  }
  const back = terminalToWc.get(terminalId)
  if (back) {
    back.delete(webContentsId)
    if (back.size === 0) terminalToWc.delete(terminalId)
  }
}

/** Remove all terminals owned by a webContents (window destroyed). */
export function clearOwnershipForWebContents(webContentsId: number): string[] {
  const set = wcToTerminals.get(webContentsId)
  if (!set) return []
  const ids = [...set]
  for (const tid of ids) {
    untrackOwnership(webContentsId, tid)
  }
  return ids
}

/** First webContents id that owns this terminal, if any. */
export function getOwnerWebContentsId(terminalId: string): number | undefined {
  const set = terminalToWc.get(terminalId)
  if (!set || set.size === 0) return undefined
  return set.values().next().value
}

export function resetOwnershipMaps(): void {
  wcToTerminals.clear()
  terminalToWc.clear()
}
