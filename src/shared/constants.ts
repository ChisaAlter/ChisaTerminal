export const IPC_CHANNELS = {
  PTY: {
    CREATE: 'pty:create',
    WRITE: 'pty:write',
    RESIZE: 'pty:resize',
    CLOSE: 'pty:close',
    OUTPUT: 'pty:output',
    EXIT: 'pty:exit',
    SESSION_COUNT: 'pty:sessionCount',
  },
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
    IS_MAXIMIZED: 'window:isMaximized',
  },
  STORAGE: {
    GET: 'storage:get',
    SET: 'storage:set',
  },
  HOOK: {
    MESSAGE: 'hook:message',
  },
  APP: {
    RELOAD_SHORTCUTS: 'app:reloadShortcuts',
  },
  WALLPAPER: {
    SAVE: 'wallpaper:save',
  },
  BROWSER: {
    OPEN_URL: 'browser:openUrl',
  },
} as const

export const APP_NAME = 'ChisaTerminal'

export const DEFAULT_SETTINGS_KEY = 'mux0.settings.v1'
export const DEFAULT_WORKSPACES_KEY = 'mux0.workspaces.v2'
