/**
 * 在每次运行测试前为 electron-store 创建临时配置目录，
 * 避免测试数据污染开发环境或相互干扰。
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { afterAll } from 'vitest'

const tempConfigDir = path.join(
  os.tmpdir(),
  `chisa-terminal-test-${randomBytes(8).toString('hex')}`
)

fs.mkdirSync(tempConfigDir, { recursive: true })

// 覆盖各平台下 electron-store / conf 可能使用的配置目录环境变量
process.env.XDG_CONFIG_HOME = tempConfigDir
process.env.LOCALAPPDATA = tempConfigDir
process.env.APPDATA = path.join(tempConfigDir, 'AppData', 'Roaming')

afterAll(() => {
  try {
    fs.rmSync(tempConfigDir, { recursive: true, force: true })
  } catch {
    // 忽略清理失败，避免影响测试结果
  }
})
