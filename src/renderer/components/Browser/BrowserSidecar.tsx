import { FormEvent, memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BROWSER_SIDECAR_MAX_WIDTH,
  BROWSER_SIDECAR_MIN_WIDTH,
  normalizeBrowserUrl,
  useBrowserStore,
} from '../../stores/useBrowserStore.js'

function BrowserSidecar() {
  const { t } = useTranslation()
  const webviewRef = useRef<HTMLWebViewElement>(null)
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const cleanupDragRef = useRef<(() => void) | null>(null)
  const activeTerminalId = useBrowserStore((s) => s.activeTerminalId)
  const visible = useBrowserStore((s) => s.visible)
  const width = useBrowserStore((s) => s.width)
  const panel = useBrowserStore((s) => (s.activeTerminalId ? s.panels[s.activeTerminalId] : undefined))
  const navigate = useBrowserStore((s) => s.navigate)
  const updatePanel = useBrowserStore((s) => s.updatePanel)
  const closeForTerminal = useBrowserStore((s) => s.closeForTerminal)
  const resize = useBrowserStore((s) => s.resize)
  const setDragging = useBrowserStore((s) => s.setDragging)
  const [address, setAddress] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  // 提前派生 currentUrl：webview 仅在 currentUrl 非空时挂载，事件监听 effect 依赖它以在挂载时重绑监听器
  const currentUrl = panel?.url ?? ''

  useEffect(() => {
    setAddress(panel?.url ?? '')
  }, [panel?.url, activeTerminalId])

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.()
      cleanupDragRef.current = null
      dragStateRef.current = null
    }
  }, [])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleStart = () => {
      if (activeTerminalId) {
        updatePanel(activeTerminalId, { isLoading: true })
      }
      setError('')
    }
    const handleStop = () => {
      if (activeTerminalId) {
        updatePanel(activeTerminalId, { isLoading: false })
      }
    }
    const handleFail = (event: Event) => {
      const e = event as unknown as { errorCode?: number; errorDescription?: string; validatedURL?: string }
      // errorCode < 0 表示加载失败；某些情况下 -3 (ABORTED) 是主动取消，可忽略
      if (typeof e.errorCode === 'number' && e.errorCode < 0 && e.errorCode !== -3) {
        const desc = e.errorDescription || t('browser.load_failed')
        setError(`${desc} (${e.errorCode})`)
        if (activeTerminalId) {
          updatePanel(activeTerminalId, { isLoading: false })
        }
      }
    }

    const handlePermission = (event: Event) => {
      // 仅放行白名单权限（notifications），其余一律拒绝，避免外部页面滥用媒体/地理位置等能力
      const e = event as unknown as {
        permissionType?: string
        request?: { allow?: () => void; deny?: () => void; cancel?: () => void }
      }
      const allowedPermissions = ['notifications']
      if (e.permissionType && allowedPermissions.includes(e.permissionType)) {
        e.request?.allow?.()
      } else {
        // 兼容不同 Electron 版本：优先 deny，回退到 cancel
        if (e.request?.deny) {
          e.request.deny()
        } else {
          e.request?.cancel?.()
        }
      }
    }

    const handleConsole = (event: Event) => {
      const e = event as unknown as { message?: string; line?: number; sourceId?: string; level?: number }
      const prefix = `[BrowserSidecar webview] ${e.sourceId || ''}:${e.line || ''}`
      // 把 webview 内部日志打到主窗口 DevTools，方便排查 CodeBuddy 等本地页面问题
      if (e.level === 3) {
        console.error(prefix, e.message)
      } else if (e.level === 2) {
        console.warn(prefix, e.message)
      } else {
        console.log(prefix, e.message)
      }
    }

    const handleCertError = (event: Event) => {
      // 仅 dev 模式（主窗口走 http://localhost）且目标为本地地址时放行自签名证书；
      // 否则不阻止，让加载失败并进入 error 状态，避免放行任意站点的证书错误。
      const e = event as unknown as { preventDefault?: () => void; url?: string }
      const isDev = window.location.protocol === 'http:'
      if (!isDev) return
      try {
        const targetUrl = e.url
        if (!targetUrl) return
        const hostname = new URL(targetUrl).hostname
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          e.preventDefault?.()
        }
      } catch {
        // URL 解析失败时不放行
      }
    }

    webview.addEventListener('did-start-loading', handleStart)
    webview.addEventListener('did-stop-loading', handleStop)
    webview.addEventListener('did-fail-load', handleFail)
    webview.addEventListener('permissionrequest', handlePermission)
    webview.addEventListener('console-message', handleConsole)
    webview.addEventListener('certificate-error', handleCertError)

    return () => {
      webview.removeEventListener('did-start-loading', handleStart)
      webview.removeEventListener('did-stop-loading', handleStop)
      webview.removeEventListener('did-fail-load', handleFail)
      webview.removeEventListener('permissionrequest', handlePermission)
      webview.removeEventListener('console-message', handleConsole)
      webview.removeEventListener('certificate-error', handleCertError)
    }
  }, [activeTerminalId, updatePanel, t, currentUrl])

  if (!visible) return null

  const isLoading = panel?.isLoading ?? false

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeTerminalId || !address.trim()) return
    // 预校验 URL scheme：若 normalize 后为空且原输入非空，说明 scheme 不被允许
    // 此时显示错误提示并保留用户输入，不调用 navigate 以避免覆盖已有 panel 状态
    const normalizedUrl = normalizeBrowserUrl(address)
    if (!normalizedUrl) {
      setError(t('browser.invalid_scheme'))
      return
    }
    setError('')
    navigate(activeTerminalId, address)
  }

  const handleRefresh = () => {
    if (!currentUrl || !activeTerminalId) return
    webviewRef.current?.reload()
  }

  const handleMouseDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
    setDragging(true)
    dragStateRef.current = { startX: event.clientX, startWidth: width }

    const target = event.currentTarget
    // 捕获指针，保证 pointermove/pointerup 必触发到该元素，即使鼠标移出窗口或落在 webview 上
    try { target.setPointerCapture(event.pointerId) } catch { /* ignore */ }

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStateRef.current) return
      const delta = dragStateRef.current.startX - e.clientX
      resize(dragStateRef.current.startWidth + delta)
    }

    // 抽取统一清理逻辑：pointerup 与 pointercancel 共用，避免 Alt+Tab/UAC 取消指针时拖拽卡死
    const finishDrag = (e: PointerEvent) => {
      setIsDragging(false)
      setDragging(false)
      dragStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { target.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerUp)
      target.removeEventListener('pointercancel', handlePointerCancel)
      cleanupDragRef.current = null
    }

    const handlePointerUp = (e: PointerEvent) => {
      finishDrag(e)
    }

    const handlePointerCancel = (e: PointerEvent) => {
      finishDrag(e)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', handlePointerUp)
    target.addEventListener('pointercancel', handlePointerCancel)
    cleanupDragRef.current = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDragging(false)
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerUp)
      target.removeEventListener('pointercancel', handlePointerCancel)
    }
  }

  return (
    <aside
      className="relative shrink-0 h-full border-l border-border bg-canvas flex flex-col overflow-hidden shadow-2xl wallpaper-glass"
      style={{ width, minWidth: BROWSER_SIDECAR_MIN_WIDTH, maxWidth: BROWSER_SIDECAR_MAX_WIDTH }}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-20 transition-colors ${
          isDragging ? 'bg-accent' : 'bg-transparent hover:bg-accent'
        }`}
        onPointerDown={handleMouseDown}
      />
      <div className="h-11 shrink-0 flex items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          className="h-7 w-7 rounded border border-border text-text-secondary hover:text-foreground hover:border-border-strong disabled:opacity-40 disabled:hover:text-text-secondary disabled:hover:border-border flex items-center justify-center transition-colors"
          onClick={handleRefresh}
          disabled={!currentUrl}
          title={t('browser.refresh')}
          aria-label={t('browser.refresh')}
        >
          ↻
        </button>
        <form onSubmit={handleSubmit} className="flex-1 min-w-0">
          <input
            value={address}
            onChange={(event) => {
              setAddress(event.target.value)
              if (error) setError('')
            }}
            placeholder={t('browser.address_placeholder')}
            aria-invalid={!!error}
            className={`w-full h-7 rounded border bg-canvas/60 px-2 text-sm text-foreground placeholder:text-text-secondary focus:outline-none ${
              error
                ? 'border-red-500 focus:border-red-500'
                : 'border-border focus:border-accent'
            }`}
          />
        </form>
        <button
          type="button"
          className="h-7 w-7 rounded border border-border text-text-secondary hover:text-foreground hover:border-border-strong flex items-center justify-center transition-colors"
          onClick={() => closeForTerminal(activeTerminalId ?? undefined)}
          title={t('browser.close')}
          aria-label={t('browser.close')}
        >
          ×
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {currentUrl ? (
          <>
            {isLoading && (
              <div className="absolute left-0 right-0 top-0 z-10 h-8 bg-canvas/60 border-b border-border flex items-center px-3 text-xs text-text-secondary backdrop-blur-sm">
                {t('browser.loading')}
              </div>
            )}
            {error && (
              <div className="absolute left-0 right-0 top-0 z-20 bg-red-500/10 border-b border-red-500/40 flex items-center px-3 py-1 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <webview
              ref={webviewRef}
              src={currentUrl}
              partition="browser-sidecar"
              title={panel?.title || currentUrl}
              className="w-full h-full border-0 bg-white"
              nodeintegration={false}
              useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            />
          </>
        ) : (
          <div className="h-full flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-xl border border-border bg-sidebar/40 p-5 text-center shadow-xl backdrop-blur-sm">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full border border-border flex items-center justify-center text-2xl text-accent">
                ◉
              </div>
              <h2 className="text-base font-semibold text-foreground mb-2">{t('browser.empty_title')}</h2>
              <p className="text-sm text-text-secondary leading-6 mb-4">{t('browser.empty_description')}</p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value)
                    if (error) setError('')
                  }}
                  placeholder={t('browser.address_placeholder')}
                  aria-invalid={!!error}
                  className={`w-full h-9 rounded border bg-canvas/60 px-3 text-sm text-foreground placeholder:text-text-secondary focus:outline-none ${
                    error
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-border focus:border-accent'
                  }`}
                />
                {error && (
                  <p className="text-xs text-red-600 dark:text-red-400 text-left">{error}</p>
                )}
                <button
                  type="submit"
                  className="w-full h-9 rounded bg-accent text-sidebar font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  disabled={!activeTerminalId || !address.trim()}
                >
                  {t('browser.empty_action')}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default memo(BrowserSidecar)
