import { create } from 'zustand'
import { useEffect } from 'react'
import type { Workspace, TerminalTab, SplitNode, SplitDirection } from '@shared/types'
import { DEFAULT_WORKSPACES_KEY } from '../../shared/constants.js'
import { useAgentStore } from './useAgentStore.js'
import { useBrowserStore } from './useBrowserStore.js'

const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined

function generateId(): string {
  return crypto.randomUUID()
}

function createTerminalNode(terminalId: string, lastCwd?: string): SplitNode {
  return lastCwd
    ? { type: 'terminal', terminalId, lastCwd }
    : { type: 'terminal', terminalId }
}

function createSplitNode(
  direction: SplitDirection,
  first: SplitNode,
  second: SplitNode,
  ratio: number = 0.5
): SplitNode {
  return {
    type: 'split',
    splitId: generateId(),
    direction,
    ratio,
    first,
    second,
  }
}

export function getAllTerminalIds(node: SplitNode): string[] {
  if (node.type === 'terminal') {
    return [node.terminalId]
  }
  return [...getAllTerminalIds(node.first), ...getAllTerminalIds(node.second)]
}

export function getTerminalLastCwd(node: SplitNode, terminalId: string): string | undefined {
  if (node.type === 'terminal') {
    return node.terminalId === terminalId ? node.lastCwd : undefined
  }
  return (
    getTerminalLastCwd(node.first, terminalId) ??
    getTerminalLastCwd(node.second, terminalId)
  )
}

export function setTerminalLastCwd(
  node: SplitNode,
  terminalId: string,
  cwd: string
): SplitNode {
  if (node.type === 'terminal') {
    if (node.terminalId !== terminalId) return node
    if (node.lastCwd === cwd) return node
    return { ...node, lastCwd: cwd }
  }
  const first = setTerminalLastCwd(node.first, terminalId, cwd)
  const second = setTerminalLastCwd(node.second, terminalId, cwd)
  if (first === node.first && second === node.second) return node
  return { ...node, first, second }
}

export function replaceTerminal(
  node: SplitNode,
  terminalId: string,
  newNode: SplitNode
): SplitNode {
  if (node.type === 'terminal') {
    return node.terminalId === terminalId ? newNode : node
  }
  return {
    ...node,
    first: replaceTerminal(node.first, terminalId, newNode),
    second: replaceTerminal(node.second, terminalId, newNode),
  }
}

export function removeTerminal(node: SplitNode, terminalId: string): SplitNode | null {
  if (node.type === 'terminal') {
    return node.terminalId === terminalId ? null : node
  }
  const first = removeTerminal(node.first, terminalId)
  const second = removeTerminal(node.second, terminalId)
  if (first === null) return second
  if (second === null) return first
  return { ...node, first, second }
}

export function updateRatio(
  node: SplitNode,
  splitId: string,
  ratio: number
): SplitNode {
  if (node.type === 'terminal') return node
  if (node.splitId === splitId) {
    return { ...node, ratio }
  }
  return {
    ...node,
    first: updateRatio(node.first, splitId, ratio),
    second: updateRatio(node.second, splitId, ratio),
  }
}

// 序列化前剥离 layout 树中每个 terminal 节点的 terminalId，
// 保留 lastCwd，供下次启动恢复工作目录。
export function stripTerminalIds(node: SplitNode): SplitNode {
  if (node.type === 'terminal') {
    const base: SplitNode = { type: 'terminal', terminalId: '' }
    return node.lastCwd ? { ...base, lastCwd: node.lastCwd } : base
  }
  return {
    ...node,
    first: stripTerminalIds(node.first),
    second: stripTerminalIds(node.second),
  }
}

// 加载后为每个 terminal 节点重新生成 terminalId，保留 lastCwd
export function regenerateTerminalIds(node: SplitNode): SplitNode {
  if (node.type === 'terminal') {
    return createTerminalNode(generateId(), node.lastCwd)
  }
  return {
    ...node,
    first: regenerateTerminalIds(node.first),
    second: regenerateTerminalIds(node.second),
  }
}

/**
 * Normalize a restored cwd for PTY create: pass through non-empty strings.
 * Existence checks happen in the main process (pty-ipc); renderer keeps the value.
 */
export function resolveRestoredCwd(lastCwd?: string | null): string | undefined {
  if (typeof lastCwd !== 'string') return undefined
  const trimmed = lastCwd.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Prefer live hook-reported cwd; fall back to layout-persisted lastCwd (post-restore).
 * Used by Quick Action injection from palette / context menu.
 */
export function resolveActionCwd(
  hookCwd?: string | null,
  layoutLastCwd?: string | null
): string | null {
  if (typeof hookCwd === 'string' && hookCwd.trim()) return hookCwd
  if (typeof layoutLastCwd === 'string' && layoutLastCwd.trim()) return layoutLastCwd
  return null
}

// 校验持久化的 layout 结构是否合法
function isValidLayout(node: unknown): node is SplitNode {
  if (!node || typeof node !== 'object') return false
  const n = node as {
    type?: unknown
    first?: unknown
    second?: unknown
    lastCwd?: unknown
  }
  if (n.type === 'terminal') {
    if (n.lastCwd !== undefined && typeof n.lastCwd !== 'string') return false
    return true
  }
  if (n.type === 'split') {
    return isValidLayout(n.first) && isValidLayout(n.second)
  }
  return false
}

interface PersistentTab {
  id: string
  title: string
  layout: SplitNode
  focusedTerminalId: string
  userRenamed: boolean
}

interface PersistentWorkspace {
  id: string
  name: string
  tabs: PersistentTab[]
  selectedTabId: string | null
}

export interface WorkspacePersistentData {
  workspaces: PersistentWorkspace[]
  selectedWorkspaceId: string | null
}

/**
 * Pure mapping from stored JSON → in-memory workspaces (regenerates terminal ids, keeps lastCwd).
 * Used by loadWorkspaces and unit tests.
 */
export function mapPersistentToWorkspaces(data: WorkspacePersistentData): {
  workspaces: Workspace[]
  selectedWorkspaceId: string | null
} {
  const workspaces: Workspace[] = data.workspaces.map((pw) => {
    const tabs = Array.isArray(pw?.tabs) ? pw.tabs : []
    return {
      id: typeof pw.id === 'string' ? pw.id : generateId(),
      name: typeof pw.name === 'string' ? pw.name : '',
      tabs: tabs.map((pt) => {
        const layout = isValidLayout(pt?.layout)
          ? regenerateTerminalIds(pt.layout as SplitNode)
          : createTerminalNode(generateId())
        const allIds = getAllTerminalIds(layout)
        // focusedTerminalId 在持久化时是旧 id；恢复后始终回退到首个 terminal
        const focused = allIds[0] ?? ''
        return {
          id: typeof pt?.id === 'string' ? pt.id : generateId(),
          title: typeof pt?.title === 'string' ? pt.title : '',
          layout,
          focusedTerminalId: focused,
          userRenamed: typeof pt?.userRenamed === 'boolean' ? pt.userRenamed : false,
        }
      }),
      selectedTabId: pw.selectedTabId ?? null,
    }
  })
  return {
    workspaces,
    selectedWorkspaceId:
      typeof data.selectedWorkspaceId === 'string'
        ? data.selectedWorkspaceId
        : null,
  }
}

export function mapWorkspacesToPersistent(
  workspaces: Workspace[],
  selectedWorkspaceId: string | null
): WorkspacePersistentData {
  return {
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      tabs: w.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        // 序列化前剥离 terminalId，保留 lastCwd
        layout: stripTerminalIds(t.layout),
        focusedTerminalId: t.focusedTerminalId,
        userRenamed: t.userRenamed,
      })),
      selectedTabId: w.selectedTabId,
    })),
    selectedWorkspaceId,
  }
}

interface WorkspaceState {
  workspaces: Workspace[]
  selectedWorkspaceId: string | null
  isLoaded: boolean

  addWorkspace: (name: string) => string
  removeWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  selectWorkspace: (id: string) => void

  addTab: (workspaceId: string, title?: string) => string
  closeTab: (workspaceId: string, tabId: string) => void
  selectTab: (workspaceId: string, tabId: string) => void
  renameTab: (workspaceId: string, tabId: string, title: string) => void
  resetTabToAutoTitle: (workspaceId: string, tabId: string) => void
  autoNameTab: (
    workspaceId: string,
    tabId: string,
    terminalId: string,
    cwd: string | null,
    command: string | null
  ) => void
  updateTerminalCwd: (terminalId: string, cwd: string) => void

  splitTerminal: (
    workspaceId: string,
    tabId: string,
    terminalId: string,
    direction: SplitDirection
  ) => string | null
  closeTerminal: (workspaceId: string, tabId: string, terminalId: string) => void
  focusTerminal: (workspaceId: string, tabId: string, terminalId: string) => void
  updateSplitRatio: (
    workspaceId: string,
    tabId: string,
    splitId: string,
    ratio: number
  ) => void

  getSelectedWorkspace: () => Workspace | null
  getSelectedTab: () => TerminalTab | null

  loadWorkspaces: () => Promise<void>
  saveWorkspaces: () => Promise<void>
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(() => {
    const state = useWorkspaceStore.getState()
    if (state.isLoaded) {
      state.saveWorkspaces()
    }
  }, 400)
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  selectedWorkspaceId: null,
  isLoaded: false,

  addWorkspace: (name: string) => {
    const id = generateId()
    const workspace: Workspace = {
      id,
      name,
      tabs: [],
      selectedTabId: null,
    }
    set((state) => {
      const workspaces = [...state.workspaces, workspace]
      return {
        workspaces,
        selectedWorkspaceId: state.selectedWorkspaceId ?? id,
      }
    })

    get().addTab(id, '')
    scheduleSave()
    return id
  },

  removeWorkspace: (id: string) => {
    const removedWorkspace = get().workspaces.find((w) => w.id === id) ?? null
    set((state) => {
      const workspaces = state.workspaces.filter((w) => w.id !== id)
      let selectedWorkspaceId = state.selectedWorkspaceId
      if (selectedWorkspaceId === id) {
        selectedWorkspaceId = workspaces[0]?.id ?? null
      }
      return { workspaces, selectedWorkspaceId }
    })
    if (removedWorkspace) {
      removedWorkspace.tabs.forEach((t) => {
        getAllTerminalIds(t.layout).forEach((tid) => {
          useAgentStore.getState().removeTerminalState(tid)
          useBrowserStore.getState().removeTerminal(tid)
        })
      })
    }
    scheduleSave()
  },

  renameWorkspace: (id: string, name: string) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, name } : w
      ),
    }))
    scheduleSave()
  },

  selectWorkspace: (id: string) => {
    set({ selectedWorkspaceId: id })
    scheduleSave()
  },

  addTab: (workspaceId: string, title?: string) => {
    const terminalId = generateId()
    const tabId = generateId()
    const tab: TerminalTab = {
      id: tabId,
      title: title ?? '新标签',
      layout: createTerminalNode(terminalId),
      focusedTerminalId: terminalId,
      userRenamed: false,
    }

    set((state) => ({
      workspaces: state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: [...w.tabs, tab],
          selectedTabId: tabId,
        }
      }),
    }))

    scheduleSave()
    return tabId
  },

  closeTab: (workspaceId: string, tabId: string) => {
    const workspace = get().workspaces.find((w) => w.id === workspaceId)
    const removedTab = workspace?.tabs.find((t) => t.id === tabId) ?? null
    set((state) => ({
      workspaces: state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        const tabs = w.tabs.filter((t) => t.id !== tabId)
        let selectedTabId = w.selectedTabId
        if (selectedTabId === tabId) {
          const idx = w.tabs.findIndex((t) => t.id === tabId)
          selectedTabId =
            tabs[Math.max(0, idx - 1)]?.id ?? tabs[0]?.id ?? null
        }
        return { ...w, tabs, selectedTabId }
      }),
    }))
    if (removedTab) {
      getAllTerminalIds(removedTab.layout).forEach((tid) => {
        useAgentStore.getState().removeTerminalState(tid)
        useBrowserStore.getState().removeTerminal(tid)
      })
    }
    scheduleSave()
  },

  selectTab: (workspaceId: string, tabId: string) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, selectedTabId: tabId } : w
      ),
    }))
    scheduleSave()
  },

  renameTab: (workspaceId: string, tabId: string, title: string) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: w.tabs.map((t) =>
            t.id === tabId ? { ...t, title, userRenamed: true } : t
          ),
        }
      }),
    }))
    scheduleSave()
  },

  resetTabToAutoTitle: (workspaceId: string, tabId: string) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: w.tabs.map((t) =>
            t.id === tabId ? { ...t, userRenamed: false } : t
          ),
        }
      }),
    }))
    scheduleSave()
  },

  autoNameTab: (workspaceId, tabId, terminalId, cwd, command) => {
    set((state) => {
      let changed = false
      const workspaces = state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: w.tabs.map((t) => {
            if (t.id !== tabId) return t
            if (t.userRenamed) return t
            const firstTerminalId = getAllTerminalIds(t.layout)[0]
            if (firstTerminalId !== terminalId) return t

            let title = ''
            if (cwd) {
              const normalized = cwd.replace(/\\/g, '/').replace(/\/$/, '')
              const parts = normalized.split('/').filter(Boolean)
              title = parts.length === 0 ? cwd : (parts[parts.length - 1] ?? cwd)
            }
            if (command && command.trim()) {
              const cmd = command.trim().split(/\s+/)[0] ?? ''
              title = title ? `${title} · ${cmd}` : cmd
            }
            if (title !== t.title) {
              changed = true
              return { ...t, title }
            }
            return t
          }),
        }
      })
      if (changed) {
        setTimeout(() => scheduleSave(), 0)
        return { workspaces }
      }
      return state
    })
  },

  updateTerminalCwd: (terminalId: string, cwd: string) => {
    if (!cwd || !terminalId) return
    set((state) => {
      let changed = false
      const workspaces = state.workspaces.map((w) => {
        let workspaceChanged = false
        const tabs = w.tabs.map((t) => {
          const nextLayout = setTerminalLastCwd(t.layout, terminalId, cwd)
          if (nextLayout !== t.layout) {
            workspaceChanged = true
            changed = true
            return { ...t, layout: nextLayout }
          }
          return t
        })
        return workspaceChanged ? { ...w, tabs } : w
      })
      if (!changed) return state
      setTimeout(() => scheduleSave(), 0)
      return { workspaces }
    })
  },

  splitTerminal: (
    workspaceId: string,
    tabId: string,
    terminalId: string,
    direction: SplitDirection
  ) => {
    const newTerminalId = generateId()
    let createdId: string | null = null

    set((state) => {
      const workspaces = state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: w.tabs.map((t) => {
            if (t.id !== tabId) return t
            const existingCwd = getTerminalLastCwd(t.layout, terminalId)
            const firstNode = createTerminalNode(terminalId, existingCwd)
            const secondNode = createTerminalNode(newTerminalId, existingCwd)
            const newNode = createSplitNode(direction, firstNode, secondNode)
            createdId = newTerminalId
            return {
              ...t,
              layout: replaceTerminal(t.layout, terminalId, newNode),
              focusedTerminalId: newTerminalId,
            }
          }),
        }
      })
      return { workspaces }
    })

    scheduleSave()
    return createdId
  },

  closeTerminal: (workspaceId: string, tabId: string, terminalId: string) => {
    set((state) => {
      const workspaces = state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: w.tabs.map((t) => {
            if (t.id !== tabId) return t
            const newLayout = removeTerminal(t.layout, terminalId)
            if (!newLayout) return t

            const remainingIds = getAllTerminalIds(newLayout)
            const newFocus = remainingIds.includes(t.focusedTerminalId)
              ? t.focusedTerminalId
              : remainingIds[0] ?? ''

            return {
              ...t,
              layout: newLayout,
              focusedTerminalId: newFocus,
            }
          }),
        }
      })
      return { workspaces }
    })
    useAgentStore.getState().removeTerminalState(terminalId)
    scheduleSave()
  },

  focusTerminal: (workspaceId: string, tabId: string, terminalId: string) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: w.tabs.map((t) =>
            t.id === tabId ? { ...t, focusedTerminalId: terminalId } : t
          ),
        }
      }),
    }))
    scheduleSave()
  },

  updateSplitRatio: (
    workspaceId: string,
    tabId: string,
    splitId: string,
    ratio: number
  ) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) => {
        if (w.id !== workspaceId) return w
        return {
          ...w,
          tabs: w.tabs.map((t) => {
            if (t.id !== tabId) return t
            return {
              ...t,
              layout: updateRatio(t.layout, splitId, ratio),
            }
          }),
        }
      }),
    }))
    scheduleSave()
  },

  getSelectedWorkspace: () => {
    const { workspaces, selectedWorkspaceId } = get()
    return workspaces.find((w) => w.id === selectedWorkspaceId) ?? null
  },

  getSelectedTab: () => {
    const workspace = get().getSelectedWorkspace()
    if (!workspace || !workspace.selectedTabId) return null
    return workspace.tabs.find((t) => t.id === workspace.selectedTabId) ?? null
  },

  loadWorkspaces: async () => {
    try {
      if (!storage?.get) {
        set({ isLoaded: true })
        return
      }
      const stored = await storage.get(DEFAULT_WORKSPACES_KEY)
      if (!stored || typeof stored !== 'object') {
        set({ isLoaded: true })
        return
      }
      const data = stored as WorkspacePersistentData
      if (!Array.isArray(data.workspaces)) {
        set({ isLoaded: true })
        return
      }
      const mapped = mapPersistentToWorkspaces(data)
      set({
        workspaces: mapped.workspaces,
        selectedWorkspaceId: mapped.selectedWorkspaceId,
        isLoaded: true,
      })
    } catch {
      set({ isLoaded: true })
    }
  },

  saveWorkspaces: async () => {
    try {
      const state = get()
      const data = mapWorkspacesToPersistent(
        state.workspaces,
        state.selectedWorkspaceId
      )
      await storage?.set?.(DEFAULT_WORKSPACES_KEY, data)
    } catch {
      // ignore persistence errors
    }
  },
}))

export function useInitializeWorkspaces() {
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])
}
