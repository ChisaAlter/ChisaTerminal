import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const preloadOut = path.join(root, 'dist', 'main', 'preload')

if (fs.existsSync(preloadOut)) {
  fs.rmSync(preloadOut, { recursive: true, force: true })
}

const tsc = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', '-p', 'tsconfig.preload.json'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }
)

if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1)
}

// Preload is CommonJS (contextBridge requires CJS under Electron sandbox).
// Parent package.json is "type": "module", so mark this tree as CJS.
fs.mkdirSync(preloadOut, { recursive: true })
fs.writeFileSync(
  path.join(preloadOut, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8'
)

console.log('[build-preload] wrote', path.join(preloadOut, 'package.json'))
