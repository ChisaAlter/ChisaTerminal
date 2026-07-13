import { describe, it, expect } from 'vitest'
import {
  clampBrowserWidth,
  BROWSER_SIDECAR_MIN_WIDTH,
  BROWSER_SIDECAR_MAX_WIDTH,
  BROWSER_SIDECAR_DEFAULT_WIDTH,
} from '../useBrowserStore.js'

describe('clampBrowserWidth', () => {
  it('clamps below min to min', () => {
    expect(clampBrowserWidth(100)).toBe(BROWSER_SIDECAR_MIN_WIDTH)
  })

  it('clamps above max to max', () => {
    expect(clampBrowserWidth(5000)).toBe(BROWSER_SIDECAR_MAX_WIDTH)
  })

  it('rounds finite values in range', () => {
    expect(clampBrowserWidth(333.7)).toBe(334)
  })

  it('falls back to default for non-finite input', () => {
    expect(clampBrowserWidth(Number.NaN)).toBe(BROWSER_SIDECAR_DEFAULT_WIDTH)
    expect(clampBrowserWidth(Number.POSITIVE_INFINITY)).toBe(BROWSER_SIDECAR_DEFAULT_WIDTH)
  })
})
