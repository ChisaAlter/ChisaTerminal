export interface ThemeColors {
  sidebar: string
  canvas: string
  foreground: string
  border: string
  borderStrong: string
  accent: string
  selection: string
  textSecondary: string
  terminal: TerminalColors
}

export interface TerminalColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface Theme {
  name: string
  id: string
  colors: ThemeColors
}

export const draculaTheme: Theme = {
  id: 'dracula',
  name: 'Dracula',
  colors: {
    sidebar: '#1e1e2e',
    canvas: '#181825',
    foreground: '#f5f5f5',
    border: '#313244',
    borderStrong: '#45475a',
    accent: '#bd93f9',
    selection: '#44475a',
    textSecondary: '#a0a0b0',
    terminal: {
      background: '#181825',
      foreground: '#f5f5f5',
      cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#bfbfbf',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
}

export const lightTheme: Theme = {
  id: 'light',
  name: '浅色',
  colors: {
    sidebar: '#f8f8f8',
    canvas: '#ffffff',
    foreground: '#1a1a1a',
    border: '#e5e5e5',
    borderStrong: '#d4d4d4',
    accent: '#7c3aed',
    selection: '#e0e0e0',
    textSecondary: '#666666',
    terminal: {
      background: '#ffffff',
      foreground: '#1a1a1a',
      cursor: '#1a1a1a',
      cursorAccent: '#ffffff',
      selectionBackground: '#d4d4d4',
      black: '#1a1a1a',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#c026d3',
      cyan: '#0891b2',
      white: '#e5e5e5',
      brightBlack: '#525252',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#d946ef',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff',
    },
  },
}

export const monokaiTheme: Theme = {
  id: 'monokai',
  name: 'Monokai',
  colors: {
    sidebar: '#272822',
    canvas: '#1e1f1c',
    foreground: '#f8f8f2',
    border: '#3e3d32',
    borderStrong: '#525249',
    accent: '#a6e22e',
    selection: '#49483e',
    textSecondary: '#a0a090',
    terminal: {
      background: '#1e1f1c',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      cursorAccent: '#272822',
      selectionBackground: '#49483e',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#ff6188',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
  },
}

export const themes: Theme[] = [draculaTheme, monokaiTheme, lightTheme]

function hexToRgba(hex: string, alpha: number): string {
  let sanitized = hex.replace('#', '')
  // 支持 3 位 hex（如 #fff -> #ffffff）
  if (sanitized.length === 3) {
    sanitized = sanitized
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (sanitized.length !== 6) {
    return `rgba(0, 0, 0, ${alpha})`
  }
  const r = parseInt(sanitized.substring(0, 2), 16)
  const g = parseInt(sanitized.substring(2, 4), 16)
  const b = parseInt(sanitized.substring(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(0, 0, 0, ${alpha})`
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement
  const wallpaperEnabled = root.classList.contains('wallpaper-enabled')

  root.style.setProperty('--color-sidebar', wallpaperEnabled ? hexToRgba(theme.colors.sidebar, 0.55) : theme.colors.sidebar)
  root.style.setProperty('--color-canvas', wallpaperEnabled ? hexToRgba(theme.colors.canvas, 0.45) : theme.colors.canvas)
  root.style.setProperty('--color-foreground', theme.colors.foreground)
  root.style.setProperty('--color-border', wallpaperEnabled ? hexToRgba(theme.colors.border, 0.65) : theme.colors.border)
  root.style.setProperty('--color-border-strong', wallpaperEnabled ? hexToRgba(theme.colors.borderStrong, 0.75) : theme.colors.borderStrong)
  root.style.setProperty('--color-accent', theme.colors.accent)
  root.style.setProperty('--color-selection', wallpaperEnabled ? hexToRgba(theme.colors.selection, 0.7) : theme.colors.selection)
  root.style.setProperty('--color-text-secondary', theme.colors.textSecondary)
}
