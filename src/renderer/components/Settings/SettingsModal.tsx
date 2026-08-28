import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/useSettingsStore.js'
import { useThemeStore } from '../../stores/useThemeStore.js'
import { useQuickActionsStore } from '../../stores/useQuickActionsStore.js'
import { DEFAULT_SETTINGS, type AppSettings, type Language } from '../../../shared/settings.js'
import { readFileAsBase64, pixelateImage, compressImage, getBase64Size, saveWallpaperToUserData, ensureDataUrl, MAX_WALLPAPER_SIZE } from '../../utils/wallpaper.js'

// Injected at build time from package.json — keeps About in sync with the release version
const APP_VERSION = __APP_VERSION__

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsCategory = 'appearance' | 'terminal' | 'behavior' | 'shortcuts' | 'quickActions' | 'about'

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation()
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance')
  const modalRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const [wallpaperError, setWallpaperError] = useState<string | null>(null)

  const settings = useSettingsStore((s) => s.settings)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const patchSettings = useSettingsStore((s) => s.patchSettings)
  const themes = useThemeStore((s) => s.themes)
  const quickActions = useQuickActionsStore((s) => s.actions)
  const addAction = useQuickActionsStore((s) => s.addAction)
  const updateAction = useQuickActionsStore((s) => s.updateAction)
  const removeAction = useQuickActionsStore((s) => s.removeAction)
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFileDataUrl, setSelectedFileDataUrl] = useState<string | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [localPixelated, setLocalPixelated] = useState(settings.wallpaperPixelated)
  const [localBlockSize, setLocalBlockSize] = useState(settings.wallpaperPixelationBlockSize)

  const categories = useMemo<{ id: SettingsCategory; label: string }[]>(() => [
    { id: 'appearance', label: t('settings.appearance') },
    { id: 'terminal', label: t('settings.terminal') },
    { id: 'behavior', label: t('settings.behavior') },
    { id: 'shortcuts', label: t('settings.shortcuts') },
    { id: 'quickActions', label: t('settings.quick_actions') },
    { id: 'about', label: t('settings.about') },
  ], [t])

  const shortcuts = useMemo(() => [
    { key: 'Ctrl+T', description: t('shortcuts.new_tab') },
    { key: 'Ctrl+W', description: t('shortcuts.close_tab') },
    { key: 'Ctrl+D', description: t('shortcuts.split_vertical') },
    { key: 'Ctrl+Shift+D', description: t('shortcuts.split_horizontal') },
    { key: 'Ctrl+Shift+P', description: t('shortcuts.command_palette') },
    { key: 'Ctrl+Shift+F', description: t('shortcuts.search') },
    { key: 'Ctrl+,', description: t('shortcuts.open_settings') },
    { key: 'Ctrl+= / Ctrl+-', description: t('shortcuts.zoom') },
    { key: 'Ctrl+0', description: t('shortcuts.zoom_reset') },
    { key: 'Ctrl+`', description: t('shortcuts.global_toggle'), global: true },
  ], [t])

  useEffect(() => {
    if (!isOpen) return
    setActiveCategory('appearance')
    setWallpaperError(null)
    // 记录触发元素以便关闭时还原焦点
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    // 打开时聚焦首个可交互元素
    requestAnimationFrame(() => {
      if (!modalRef.current) return
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length > 0) {
        focusable[0]?.focus()
      } else {
        modalRef.current.focus()
      }
    })
    return () => {
      // cleanup 在组件卸载或 isOpen 变 false 时执行，还原焦点
      previouslyFocusedRef.current?.focus?.()
      previouslyFocusedRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (!modalRef.current) return
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (first && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (last && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleTabKey)
    return () => document.removeEventListener('keydown', handleTabKey)
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    setLocalPixelated(settings.wallpaperPixelated)
    setLocalBlockSize(settings.wallpaperPixelationBlockSize)
  }, [settings.wallpaperPixelated, settings.wallpaperPixelationBlockSize])

  useEffect(() => {
    if (isOpen) {
      setSelectedFileDataUrl(null)
    }
  }, [isOpen])

  useEffect(() => {
    let cancelled = false
    const source = selectedFileDataUrl ?? settings.wallpaperUrl
    if (!source) {
      setPreviewDataUrl(null)
      return
    }
    if (!localPixelated) {
      setPreviewDataUrl(source)
      return
    }
    ensureDataUrl(source)
      .then((dataUrl) => pixelateImage(dataUrl, localBlockSize))
      .then((pixelated) => {
        if (!cancelled) setPreviewDataUrl(pixelated)
      })
      .catch(() => {
        if (!cancelled) setPreviewDataUrl(source)
      })
    return () => {
      cancelled = true
    }
  }, [selectedFileDataUrl, settings.wallpaperUrl, localPixelated, localBlockSize])

  if (!isOpen) return null

  const handleThemeChange = (themeId: string) => {
    updateSetting('themeId', themeId)
  }

  const handleWallpaperFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setWallpaperError(null)
    try {
      const dataUrl = await readFileAsBase64(file)
      setSelectedFileDataUrl(dataUrl)
      // 新文件默认不像素化，避免沿用旧壁纸的像素化状态导致误解
      setLocalPixelated(false)
    } catch {
      setSelectedFileDataUrl(null)
    }
    e.target.value = ''
  }

  const handleApplyWallpaper = async () => {
    const sourceUrl = selectedFileDataUrl ?? settings.wallpaperUrl
    if (!sourceUrl) return

    let url = sourceUrl
    if (localPixelated) {
      try {
        const dataUrl = await ensureDataUrl(sourceUrl)
        url = await pixelateImage(dataUrl, localBlockSize)
      } catch {
        // fall back to the original image
      }
    }

    if (getBase64Size(url) > MAX_WALLPAPER_SIZE) {
      try {
        url = await compressImage(url, 2560, 1440, 0.85)
      } catch {
        // keep the original url
      }
    }

    if (getBase64Size(url) > MAX_WALLPAPER_SIZE) {
      console.warn('Wallpaper too large after compression')
      setWallpaperError(t('wallpaper.too_large_error'))
      return
    }

    let wallpaperUrl = url
    if (wallpaperUrl.startsWith('data:')) {
      try {
        wallpaperUrl = await saveWallpaperToUserData(wallpaperUrl)
      } catch {
        setWallpaperError(t('wallpaper.save_error'))
        return
      }
    }

    patchSettings({
      wallpaperUrl,
      wallpaperEnabled: true,
      wallpaperPixelated: localPixelated,
      wallpaperPixelationBlockSize: localBlockSize,
    })
    setSelectedFileDataUrl(null)
    setWallpaperError(null)
  }

  const handleClearWallpaper = () => {
    setSelectedFileDataUrl(null)
    patchSettings({
      wallpaperUrl: DEFAULT_SETTINGS.wallpaperUrl,
      wallpaperEnabled: DEFAULT_SETTINGS.wallpaperEnabled,
      wallpaperPixelated: DEFAULT_SETTINGS.wallpaperPixelated,
      wallpaperPixelationBlockSize: DEFAULT_SETTINGS.wallpaperPixelationBlockSize,
    })
  }

  const renderAppearance = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t('appearance.title')}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-foreground mb-2">{t('settings.language')}</label>
          <select
            value={settings.language}
            onChange={(e) => updateSetting('language', e.target.value as Language)}
            className="w-full bg-canvas border border-border rounded px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-foreground mb-2">{t('appearance.theme')}</label>
          <select
            value={settings.themeId}
            onChange={(e) => handleThemeChange(e.target.value)}
            className="w-full bg-canvas border border-border rounded px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-foreground mb-2">{t('appearance.font')}</label>
          <input
            type="text"
            value={settings.fontFamily}
            onChange={(e) => updateSetting('fontFamily', e.target.value)}
            className="w-full bg-canvas border border-border rounded px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-foreground mb-2">
            {t('appearance.font_size', { n: settings.fontSize })}
          </label>
          <input
            type="range"
            min="10"
            max="24"
            value={settings.fontSize}
            onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-text-secondary mt-1">
            <span>10px</span>
            <span>24px</span>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">{t('appearance.wallpaper')}</h3>
          <div className="space-y-3">
            <div className="w-[200px] h-[120px] rounded border border-border overflow-hidden bg-canvas flex items-center justify-center">
              {previewDataUrl ? (
                <img src={previewDataUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-text-secondary">{t('wallpaper.no_preview')}</span>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp"
              onChange={handleWallpaperFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-sm rounded bg-accent hover:bg-accent/80 text-white transition-colors"
              >
                {t('wallpaper.select')}
              </button>
              <button
                onClick={handleApplyWallpaper}
                disabled={!previewDataUrl}
                className="px-3 py-1.5 text-sm rounded bg-canvas border border-border hover:bg-border/50 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('wallpaper.apply')}
              </button>
              <button
                onClick={handleClearWallpaper}
                disabled={!settings.wallpaperUrl && !selectedFileDataUrl}
                className="px-3 py-1.5 text-sm rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('wallpaper.clear')}
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={localPixelated}
                onChange={(e) => setLocalPixelated(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-foreground">{t('wallpaper.pixelate')}</span>
            </label>
            {wallpaperError && (
              <p role="alert" className="text-xs text-red-400">
                {wallpaperError}
              </p>
            )}
            {localPixelated && (
              <div>
                <label className="block text-sm text-foreground mb-2">
                  {t('wallpaper.pixel_size', { n: localBlockSize })}
                </label>
                <input
                  type="range"
                  min="4"
                  max="64"
                  step="1"
                  value={localBlockSize}
                  onChange={(e) => setLocalBlockSize(parseInt(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-xs text-text-secondary mt-1">
                  <span>4px</span>
                  <span>64px</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const renderTerminal = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t('terminal_settings.title')}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-foreground mb-2">{t('terminal_settings.cursor_style')}</label>
          <div className="flex gap-4">
            {(['block', 'underline', 'bar'] as const).map((style) => (
              <label key={style} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cursorStyle"
                  value={style}
                  checked={settings.cursorStyle === style}
                  onChange={(e) => updateSetting('cursorStyle', e.target.value as AppSettings['cursorStyle'])}
                  className="accent-accent"
                />
                <span className="text-sm text-foreground">
                  {style === 'block'
                    ? t('terminal_settings.cursor_block')
                    : style === 'underline'
                    ? t('terminal_settings.cursor_underline')
                    : t('terminal_settings.cursor_bar')}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm text-foreground">{t('terminal_settings.cursor_blink')}</label>
          <input
            type="checkbox"
            checked={settings.cursorBlink}
            onChange={(e) => updateSetting('cursorBlink', e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-foreground mb-2">{t('terminal_settings.scrollback')}</label>
          <input
            type="number"
            value={settings.scrollback}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1000
              updateSetting('scrollback', Math.max(100, Math.min(100000, val)))
            }}
            min="100"
            max="100000"
            className="w-full bg-canvas border border-border rounded px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>
    </div>
  )

  const renderBehavior = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t('behavior.title')}</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm text-foreground">{t('behavior.minimize_to_tray')}</label>
          <input
            type="checkbox"
            checked={settings.minimizeToTray}
            onChange={(e) => updateSetting('minimizeToTray', e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm text-foreground">{t('behavior.confirm_exit')}</label>
          <input
            type="checkbox"
            checked={settings.confirmOnExit}
            onChange={(e) => updateSetting('confirmOnExit', e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
        </div>
      </div>
    </div>
  )

  const renderShortcuts = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t('shortcuts.title')}</h2>
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <label className="text-sm text-foreground">{t('shortcuts.enable_global')}</label>
        <input
          type="checkbox"
          checked={settings.globalHotkeyEnabled}
          onChange={(e) => updateSetting('globalHotkeyEnabled', e.target.checked)}
          className="w-4 h-4 accent-accent"
        />
      </div>
      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.key}
            className="flex items-center justify-between py-2 px-3 rounded hover:bg-border/50"
          >
            <span className="text-sm text-foreground">
              {shortcut.description}
              {shortcut.global && (
                <span className="ml-2 text-xs text-text-secondary">{t('shortcuts.global_tag')}</span>
              )}
            </span>
            <kbd className="px-2 py-1 bg-border rounded text-xs text-foreground font-mono">
              {shortcut.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )

  const renderAbout = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t('about.title')}</h2>
      <div className="space-y-4 text-center py-8">
        <div className="text-3xl font-bold text-accent">{t('about.app_name')}</div>
        <div className="text-sm text-text-secondary">{t('about.version', { version: APP_VERSION })}</div>
        <p className="text-sm text-foreground max-w-md mx-auto leading-relaxed">
          {t('about.description')}
        </p>
      </div>
    </div>
  )

  const renderQuickActions = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t('quick_actions.title')}</h2>
      <div className="space-y-3">
        {quickActions.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('quick_actions.empty')}</p>
        ) : (
          quickActions.map((action) => (
            <div key={action.id} className="flex items-center gap-2 p-2 rounded border border-border">
              <input
                type="text"
                value={action.name}
                onChange={(e) => updateAction(action.id, { name: e.target.value })}
                className="flex-1 bg-canvas border border-border rounded px-2 py-1 text-foreground text-sm focus:outline-none focus:border-accent"
                placeholder={t('quick_actions.name')}
              />
              <input
                type="text"
                value={action.command}
                onChange={(e) => updateAction(action.id, { command: e.target.value })}
                className="flex-[2] bg-canvas border border-border rounded px-2 py-1 text-foreground text-sm font-mono focus:outline-none focus:border-accent"
                placeholder={t('quick_actions.command')}
              />
              <button
                onClick={() => removeAction(action.id)}
                className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
              >
                {t('quick_actions.delete')}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground mb-3">{t('quick_actions.add_section')}</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 bg-canvas border border-border rounded px-2 py-1 text-foreground text-sm focus:outline-none focus:border-accent"
            placeholder={t('quick_actions.name')}
          />
          <input
            type="text"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            className="flex-[2] bg-canvas border border-border rounded px-2 py-1 text-foreground text-sm font-mono focus:outline-none focus:border-accent"
            placeholder={t('quick_actions.command')}
          />
          <button
            onClick={() => {
              if (newName.trim() && newCommand) {
                addAction(newName, newCommand)
                setNewName('')
                setNewCommand('')
              }
            }}
            className="px-3 py-1 text-sm rounded bg-accent hover:bg-accent/80 text-white transition-colors"
          >
            {t('quick_actions.add_button')}
          </button>
        </div>
        <p className="text-xs text-text-secondary mt-2">
          {t('quick_actions.var_hint')}<code className="bg-border/50 px-1 rounded">{'{cwd}'}</code> {t('quick_actions.var_cwd')}&nbsp;&nbsp;<code className="bg-border/50 px-1 rounded">{'{tab}'}</code> {t('quick_actions.var_tab')}
        </p>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeCategory) {
      case 'quickActions':
        return renderQuickActions()
      case 'appearance':
        return renderAppearance()
      case 'terminal':
        return renderTerminal()
      case 'behavior':
        return renderBehavior()
      case 'shortcuts':
        return renderShortcuts()
      case 'about':
        return renderAbout()
      default:
        return null
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="settings-modal-overlay"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        data-testid="settings-modal"
        tabIndex={-1}
        className="relative w-full max-w-3xl h-[500px] max-h-full bg-canvas border border-border rounded-lg shadow-2xl overflow-hidden flex outline-none wallpaper-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-modal-title" className="sr-only">
          {t('settings.title')}
        </h2>
        <div className="w-48 shrink-0 border-r border-border bg-sidebar/50 p-2 flex flex-col overflow-y-auto">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              aria-current={activeCategory === category.id ? 'true' : undefined}
              className={`
                w-full text-left px-3 py-2 rounded text-sm transition-colors
                ${
                  activeCategory === category.id
                    ? 'bg-selection text-foreground'
                    : 'text-text-secondary hover:text-foreground hover:bg-border/50'
                }
              `}
            >
              {category.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
