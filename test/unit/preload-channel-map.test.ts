// @vitest-environment node
/**
 * Parity guard: the channel map duplicated in src/preload/index.ts
 * (self-contained for Electron sandbox) must stay identical to the
 * canonical src/shared/constants.ts IPC_CHANNELS.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    on: vi.fn(),
    invoke: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
  },
}))

const { PRELOAD_IPC_CHANNELS } = await import('../../src/preload/index.js')
const { IPC_CHANNELS } = await import('../../src/shared/constants.js')

describe('preload ↔ shared IPC channel map', () => {
  it('is deep-equal to the shared IPC_CHANNELS map', () => {
    expect(PRELOAD_IPC_CHANNELS).toEqual(IPC_CHANNELS)
  })
})
