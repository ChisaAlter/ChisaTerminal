// 为 vitest node 环境提供最小 window polyfill，
// 避免模块加载时访问 window.electronAPI?.* 抛 ReferenceError。
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  ;(globalThis as unknown as { window: Record<string, unknown> }).window = {}
}

// xterm.js 在 open() 时会访问 window.matchMedia
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
  } as unknown as MediaQueryList)
}
