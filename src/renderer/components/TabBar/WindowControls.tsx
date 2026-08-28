import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const api = typeof window !== 'undefined' ? window.electronAPI : undefined

/**
 * Frameless-window controls for Linux.
 * Windows uses the native titleBarOverlay buttons and macOS keeps its
 * traffic lights, so this renders only on Linux.
 */
export const showWindowControls = api?.platform === 'linux'

function WindowControls() {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!api?.window) return
    let cancelled = false
    api.window.isMaximized().then((value) => {
      if (!cancelled) setIsMaximized(value)
    })
    const unsub = api.window.onMaximizedChange(setIsMaximized)
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  if (!api?.window) return null

  const buttonClass =
    'w-10 h-full flex items-center justify-center text-text-secondary hover:text-foreground hover:bg-border transition-colors no-drag'

  return (
    <div className="flex items-stretch h-full shrink-0 ml-1" data-testid="window-controls">
      <button
        onClick={() => api.window.minimize()}
        title={t('titlebar.minimize')}
        aria-label={t('titlebar.minimize')}
        className={buttonClass}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="1" y1="5.5" x2="9" y2="5.5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        onClick={async () => {
          const next = await api.window.maximize()
          setIsMaximized(next)
        }}
        title={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
        aria-label={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
        className={buttonClass}
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1" y="3" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M3 3V1h6v6H7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        onClick={() => api.window.close()}
        title={t('titlebar.close')}
        aria-label={t('titlebar.close')}
        className={`${buttonClass} hover:bg-red-500/80 hover:text-white`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1" />
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}

export default memo(WindowControls)
