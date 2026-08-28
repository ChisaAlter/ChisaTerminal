import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  readFileAsBase64,
  pixelateImage,
  saveWallpaperToUserData,
  toSafeWallpaperCssUrl,
} from '../wallpaper.js'

// 4x4 红色 PNG data URL
const RED_4X4_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='
const OTHER_PNG = 'data:image/png;base64,other='

describe('readFileAsBase64', () => {
  it('returns a data URL for an image File', async () => {
    const file = new File(['content'], 'test.png', { type: 'image/png' })
    const result = await readFileAsBase64(file)
    expect(result).toMatch(/^data:image\/png;base64,/)
  })
})

describe('pixelateImage', () => {
  let originalImage: typeof Image
  let originalCreateElement: typeof document.createElement

  beforeEach(() => {
    originalImage = globalThis.Image
    originalCreateElement = document.createElement

    // Mock Image so canvas-based pixelation is fast and deterministic in jsdom
    globalThis.Image = class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 4
      naturalHeight = 4
      private _src = ''
      set src(value: string) {
        this._src = value
        queueMicrotask(() => {
          if (value === 'not-a-valid-image-url' || !value.startsWith('data:')) {
            this.onerror?.()
          } else {
            this.onload?.()
          }
        })
      }
      get src() {
        return this._src
      }
    } as unknown as typeof Image

    // Mock canvas to return predictable data URLs and sizes
    document.createElement = ((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => ({
            drawImage: vi.fn(),
            imageSmoothingEnabled: false,
          }),
          toDataURL: (type?: string) =>
            type === 'image/png' ? OTHER_PNG : RED_4X4_PNG,
          width: 4,
          height: 4,
        } as unknown as HTMLCanvasElement
      }
      return originalCreateElement.call(document, tagName)
    }) as typeof document.createElement
  })

  afterEach(() => {
    globalThis.Image = originalImage
    document.createElement = originalCreateElement
  })

  it('uses the mocked Image', () => {
    expect(new Image().constructor.name).toBe('MockImage')
  })

  it('returns the original data URL when blockSize <= 1', async () => {
    const result = await pixelateImage(RED_4X4_PNG, 1)
    expect(result).toBe(RED_4X4_PNG)
  })

  it('returns a different data URL when blockSize > 1', async () => {
    const result = await pixelateImage(RED_4X4_PNG, 2)
    expect(result).not.toBe(RED_4X4_PNG)
    expect(result).toMatch(/^data:image\/png;base64,/)
  })

  it('rejects for an invalid image URL', async () => {
    await expect(
      pixelateImage('not-a-valid-image-url', 2)
    ).rejects.toThrow('Failed to load image')
  })
})

describe('saveWallpaperToUserData', () => {
  const originalElectronAPI = (window as { electronAPI?: unknown }).electronAPI

  beforeEach(() => {
    ;(window as { electronAPI?: unknown }).electronAPI = {
      wallpaper: {
        save: vi.fn(),
      },
    }
  })

  afterEach(() => {
    ;(window as { electronAPI?: unknown }).electronAPI = originalElectronAPI
  })

  it('calls the main save API and returns the file URL', async () => {
    const save = vi.fn().mockResolvedValue('file:///userdata/wallpapers/abc.png')
    ;(window as { electronAPI?: { wallpaper?: { save: typeof save } } }).electronAPI = {
      wallpaper: { save },
    }

    const result = await saveWallpaperToUserData(RED_4X4_PNG)

    expect(save).toHaveBeenCalledWith(RED_4X4_PNG)
    expect(result).toBe('file:///userdata/wallpapers/abc.png')
  })

  it('throws when the wallpaper save API is unavailable', async () => {
    ;(window as { electronAPI?: unknown }).electronAPI = undefined

    await expect(saveWallpaperToUserData(RED_4X4_PNG)).rejects.toThrow(
      'Wallpaper save API is not available'
    )
  })
})

describe('toSafeWallpaperCssUrl', () => {
  it('accepts chisa-wallpaper URLs', () => {
    expect(toSafeWallpaperCssUrl('chisa-wallpaper://abc123.png')).toBe(
      'url("chisa-wallpaper://abc123.png")'
    )
  })

  it('rejects http/file/javascript and empty values', () => {
    expect(toSafeWallpaperCssUrl(null)).toBeNull()
    expect(toSafeWallpaperCssUrl('')).toBeNull()
    expect(toSafeWallpaperCssUrl('https://evil.example/x.png')).toBeNull()
    expect(toSafeWallpaperCssUrl('file:///C:/wall.png')).toBeNull()
    expect(toSafeWallpaperCssUrl("chisa-wallpaper://x.png')};background:url('evil")).toBeNull()
  })
})
