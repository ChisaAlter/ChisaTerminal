import { spawn, IPty } from 'node-pty'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hookServer } from '../hooks/HookServer.js'
import {
  EXPECTED_HOOK_PROFILE_SHA256,
  hashHookProfile,
  shouldLoadHookProfile,
} from './hookProfileIntegrity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 解析 PowerShell 可执行文件绝对路径，避免依赖 PATH 解析（防劫持）。
// 优先使用 Windows 自带的 Windows PowerShell 5.1 绝对路径。
function resolvePowerShellPath(): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  return `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}

export class PtySession {
  private pty: IPty
  private closed = false
  readonly id: string

  constructor(
    id: string,
    cwd?: string,
    onData?: (data: string) => void,
    onExit?: (exitCode: number) => void
  ) {
    this.id = id

    const homeDir = os.homedir()
    const hookPipe =
      process.env.CHISA_HOOK_PIPE ?? process.env.MUX0_HOOK_PIPE ?? ''

    const isWindows = process.platform === 'win32'
    const ptyEnv: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      USERPROFILE: process.env.USERPROFILE ?? homeDir,
      HOME: process.env.HOME ?? homeDir,
      APPDATA: process.env.APPDATA ?? '',
      LOCALAPPDATA: process.env.LOCALAPPDATA ?? '',
      // 非 Windows 上默认 C.UTF-8（zh-CN 默认仅用于 Windows 中文环境）
      LANG: process.env.LANG ?? (isWindows ? 'zh-CN.UTF-8' : 'C.UTF-8'),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      COMSPEC: process.env.COMSPEC ?? '',
      // Hook integration (CHISA_* preferred; MUX0_* kept for profile compat)
      CHISA_TERMINAL_ID: id,
      CHISA_HOOK_PIPE: hookPipe,
      CHISA_HOOK_TOKEN: hookServer.token,
      MUX0_TERMINAL_ID: id,
      MUX0_HOOK_PIPE: hookPipe,
      MUX0_HOOK_TOKEN: hookServer.token,
    }
    for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERNAME', 'COMPUTERNAME', 'NUMBEROF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PATHEXT']) {
      const val = process.env[key]
      if (val) ptyEnv[key] = val
    }
    if (!isWindows) {
      // Linux/macOS：透传身份、图形会话与常用 XDG/SSH 变量，
      // 否则子 shell 里 GUI 程序、ssh-agent、locale 相关工具会失效
      for (const key of [
        'USER',
        'LOGNAME',
        'SHELL',
        'DISPLAY',
        'WAYLAND_DISPLAY',
        'XAUTHORITY',
        'DBUS_SESSION_BUS_ADDRESS',
        'SSH_AUTH_SOCK',
        'XDG_RUNTIME_DIR',
        'XDG_DATA_DIRS',
        'XDG_CONFIG_DIRS',
        'XDG_DATA_HOME',
        'XDG_CONFIG_HOME',
        'XDG_CACHE_HOME',
        'XDG_SESSION_TYPE',
        'XDG_CURRENT_DESKTOP',
        'LC_ALL',
        'LC_CTYPE',
        'TMPDIR',
      ]) {
        const val = process.env[key]
        if (val) ptyEnv[key] = val
      }
    }

    // Windows: PowerShell - 加载内置 hook profile
    // 其他平台: 默认 shell（hooks 暂未实现）
    let shell: string
    let args: string[] = []
    if (process.platform === 'win32') {
      shell = resolvePowerShellPath()
      // hook profile 位于项目根 hooks/powershell-hook.ps1
      // 运行时（开发）：dist/main/main/pty/PtySession.js → ../../../hooks/powershell-hook.ps1
      // 运行时（打包）：app.asar/dist/main/main/pty/ → app.asar.unpacked/hooks/...
      let hookProfilePath = path.resolve(__dirname, '..', '..', '..', 'hooks', 'powershell-hook.ps1')
      // asar 内无法被 PowerShell 直接读取，重定向到 app.asar.unpacked
      // 精确替换路径中的 app.asar 段（仅当其作为独立路径段出现时），避免误替换路径中恰好含 app.asar 子串的情况
      if (hookProfilePath.includes('app.asar')) {
        hookProfilePath = hookProfilePath.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')
      }
      args = [
        '-NoExit',
        '-NoLogo',
        '-ExecutionPolicy', 'Bypass',
        '-File', hookProfilePath,
      ]
      // 如果 profile 不存在（开发环境路径不同），退回原始启动方式
      try {
        if (!fs.existsSync(hookProfilePath)) {
          args = []
        } else {
          // SHA-256 完整性校验：防止打包到用户可写目录后被篡改/劫持（失败则不加载 profile）
          const profileContent = fs.readFileSync(hookProfilePath)
          if (!shouldLoadHookProfile(profileContent, EXPECTED_HOOK_PROFILE_SHA256)) {
            console.error(
              '[PtySession] profile 哈希不匹配或未配置！预期:',
              EXPECTED_HOOK_PROFILE_SHA256,
              '实际:',
              hashHookProfile(profileContent)
            )
            args = []
          }
        }
      } catch {
        args = []
      }
    } else {
      shell = process.env.SHELL || '/bin/bash'
    }

    this.pty = spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || homeDir,
      env: ptyEnv,
    })

    if (onData) {
      this.pty.onData(onData)
    }

    if (onExit) {
      this.pty.onExit(({ exitCode }) => {
        if (!this.closed) {
          this.closed = true
          onExit(exitCode)
        }
      })
    }
  }

  write(data: string): void {
    if (this.closed) return
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    if (this.closed) return
    try {
      this.pty.resize(cols, rows)
    } catch (e) {
      console.error('[PtySession] resize error:', e)
    }
  }

  kill(): void {
    this.dispose()
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.pty.kill()
    } catch (e) {
      console.error('[PtySession] kill error:', e)
    }
  }

  get pid(): number {
    return this.pty.pid
  }
}
