import { app, ipcMain, protocol } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  IPC_CHANNELS,
  ALLOWED_STORAGE_KEYS,
  DEFAULT_SETTINGS_KEY,
  DEFAULT_WORKSPACES_KEY,
} from '../shared/constants.js'
import { store } from './store.js'

// Only current keys may be written; legacy keys remain readable for migration.
const WRITE_KEYS = new Set([DEFAULT_SETTINGS_KEY, DEFAULT_WORKSPACES_KEY])
const MAX_VALUE_SIZE = 10 * 1024 * 1024
const WALLPAPER_DIR_NAME = 'wallpapers'
const WALLPAPER_MIME_WHITELIST = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const WALLPAPER_MAX_SIZE = 20 * 1024 * 1024
const WALLPAPER_EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}
const WALLPAPER_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

// 注册 chisa-wallpaper:// 自定义协议，避免 file:// URL 在 dev/prod 被 Chromium 拦截
app.whenReady().then(() => {
  protocol.handle('chisa-wallpaper', async (request) => {
    try {
      // request.url 形如 chisa-wallpaper://abc.png
      const parsed = new URL(request.url)
      // filename 从 pathname 提取，去掉前导 /
      let filename = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
      // 也可能 hostname 携带（保险）
      if (!filename && parsed.hostname) {
        filename = parsed.hostname
      }
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
        return new Response('Forbidden', { status: 403 })
      }
      const dir = path.join(app.getPath('userData'), WALLPAPER_DIR_NAME)
      const filePath = path.join(dir, filename)
      // 路径穿越防护：解析后必须仍在 dir 内
      const resolved = path.resolve(filePath)
      const resolvedDir = path.resolve(dir)
      if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
        return new Response('Forbidden', { status: 403 })
      }
      const buffer = await fs.promises.readFile(resolved)
      const ext = path.extname(filename).toLowerCase()
      const mime = WALLPAPER_MIME_BY_EXT[ext] ?? 'application/octet-stream'
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' },
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
})

ipcMain.handle(IPC_CHANNELS.STORAGE.GET, (_event, key: string) => {
  try {
    if (typeof key !== 'string' || !ALLOWED_STORAGE_KEYS.has(key)) {
      console.warn(`[Storage] Rejected get for key: ${key}`)
      return undefined
    }
    return store.get(key)
  } catch (err) {
    console.error('[Storage] get error:', err)
    return undefined
  }
})

ipcMain.handle(IPC_CHANNELS.STORAGE.SET, (_event, key: string, value: unknown) => {
  try {
    if (typeof key !== 'string' || !WRITE_KEYS.has(key)) {
      console.warn(`[Storage] Rejected set for key: ${key}`)
      return
    }
    const serialized = JSON.stringify(value)
    if (serialized.length > MAX_VALUE_SIZE) {
      console.error(`[Storage] Value for key ${key} exceeds max size (${serialized.length} bytes)`)
      return
    }
    store.set(key, value)
  } catch (err) {
    console.error('[Storage] set error:', err)
  }
})

ipcMain.handle(IPC_CHANNELS.WALLPAPER.SAVE, async (_event, dataUrl: unknown) => {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid wallpaper data URL')
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
    if (!match) {
      throw new Error('Wallpaper data URL is not base64 encoded')
    }
    const mime = match[1]
    const base64 = match[2]
    if (!mime || !base64) {
      throw new Error('Wallpaper data URL is malformed')
    }
    if (!WALLPAPER_MIME_WHITELIST.includes(mime)) {
      throw new Error(`Unsupported wallpaper MIME type: ${mime}`)
    }
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length === 0) {
      throw new Error('Wallpaper content is empty')
    }
    if (buffer.length > WALLPAPER_MAX_SIZE) {
      throw new Error(`Wallpaper content exceeds max size (${buffer.length} bytes)`)
    }
    const ext = WALLPAPER_EXT_BY_MIME[mime]
    const hash = createHash('sha256').update(buffer).digest('hex')
    const dir = path.join(app.getPath('userData'), WALLPAPER_DIR_NAME)
    await fs.promises.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${hash}${ext}`)
    await fs.promises.writeFile(filePath, buffer)
    return `chisa-wallpaper://${hash}${ext}`
  } catch (err) {
    console.error('[Wallpaper] save error:', err)
    throw err
  }
})
