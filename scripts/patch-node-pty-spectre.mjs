/**
 * Local Windows BuildTools often lack Spectre-mitigated libs (MSB8040).
 * node-pty enables Spectre by default; strip it so electron-rebuild can succeed.
 * Safe no-op on non-Windows or if node-pty is absent.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') process.exit(0)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targets = [
  path.join(root, 'node_modules', 'node-pty', 'binding.gyp'),
  path.join(root, 'node_modules', 'node-pty', 'deps', 'winpty', 'src', 'winpty.gyp'),
]

let patched = 0
for (const file of targets) {
  if (!fs.existsSync(file)) continue
  const original = fs.readFileSync(file, 'utf8')
  const next = original.replaceAll(
    "'SpectreMitigation': 'Spectre'",
    "'SpectreMitigation': 'false'"
  )
  if (next !== original) {
    fs.writeFileSync(file, next, 'utf8')
    patched++
    console.log('[patch-node-pty-spectre] patched', path.relative(root, file))
  }
}

if (patched === 0) {
  console.log('[patch-node-pty-spectre] nothing to patch')
}
