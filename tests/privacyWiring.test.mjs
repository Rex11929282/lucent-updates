import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('privacy control is main-process mediated and exposes no local file paths', () => {
  const main = read('electron/main.cjs')
  const preload = read('electron/preload.cjs')
  const bridge = read('src/overlayBridge.js')
  assert.match(main, /createPrivacyService/)
  assert.match(main, /privacy:summary/)
  assert.match(main, /privacy:erase/)
  assert.match(preload, /privacy:\s*\{/)
  assert.match(bridge, /privacy:\s*\{/)
  assert.doesNotMatch(preload, /lucent-data\.db|netease-credential\.bin/)
})

test('privacy UI explains that deletion only affects this computer', () => {
  const consoleSource = read('src/ConsoleWindow.jsx')
  assert.match(consoleSource, /t\('ui\.privacy\.title'\)/)
  assert.match(consoleSource, /t\('ui\.privacy\.hint'\)/)
  assert.match(consoleSource, /t\('ui\.privacy\.hostWarning'\)/)
  assert.match(consoleSource, /t\('ui\.privacy\.clearMessage'/)
})
