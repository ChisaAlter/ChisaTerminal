import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentStore } from '../useAgentStore.js'
import type { HookMessage } from '../../../shared/types.js'

function hook(partial: Partial<HookMessage> & Pick<HookMessage, 'terminalId' | 'event'>): HookMessage {
  return {
    agent: 'powershell',
    at: Date.now(),
    ...partial,
  }
}

describe('useAgentStore', () => {
  beforeEach(() => {
    useAgentStore.getState().reset()
  })

  it('maps running/finished/error hook events', () => {
    const store = useAgentStore.getState()
    store.setFocusedTerminalId('t1')
    store.updateFromHook(hook({ terminalId: 't1', event: 'running', command: 'echo hi' }))
    expect(useAgentStore.getState().status).toBe('working')
    expect(useAgentStore.getState().terminalStates.t1?.command).toBe('echo hi')

    store.updateFromHook(hook({ terminalId: 't1', event: 'finished', exitCode: 0 }))
    expect(useAgentStore.getState().status).toBe('idle')

    store.updateFromHook(hook({ terminalId: 't1', event: 'error', exitCode: 1 }))
    expect(useAgentStore.getState().status).toBe('error')
    expect(useAgentStore.getState().terminalStates.t1?.exitCode).toBe(1)
  })

  it('does not update global status for non-focused terminals', () => {
    const store = useAgentStore.getState()
    store.setFocusedTerminalId('t1')
    store.updateFromHook(hook({ terminalId: 't1', event: 'idle' }))
    store.updateFromHook(hook({ terminalId: 't2', event: 'running', command: 'other' }))
    expect(useAgentStore.getState().status).toBe('idle')
    expect(useAgentStore.getState().terminalStates.t2?.status).toBe('working')
  })

  it('removeTerminalState clears focus when removing focused terminal', () => {
    const store = useAgentStore.getState()
    store.setFocusedTerminalId('t1')
    store.updateFromHook(hook({ terminalId: 't1', event: 'running' }))
    store.removeTerminalState('t1')
    expect(useAgentStore.getState().focusedTerminalId).toBeNull()
    expect(useAgentStore.getState().status).toBe('idle')
  })
})
