import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const main = read('electron/main.cjs')
const preload = read('electron/preload.cjs')
const bridge = read('src/overlayBridge.js')
const ui = read('src/ConsoleWindow.jsx')
const pkg = JSON.parse(read('package.json'))
const require = createRequire(import.meta.url)
const buildConfig = require('../electron-builder.config.cjs')

test('update service is main-process only and exposes public commands through preload', () => {
  assert.match(main, /createUpdateService/)
  for (const channel of ['snapshot', 'check', 'download', 'install', 'setSettings']) {
    assert.match(main, new RegExp(`update:${channel}`))
    assert.match(preload, new RegExp(`update:${channel}`))
  }
  assert.match(bridge, /updates:/)
  assert.match(preload, /onChanged: sub\('update:changed'\)/)
})

test('only the installable NSIS target is published and updater dependency is explicit', () => {
  const targets = buildConfig.win.target.map((target) => target.target)
  assert.deepEqual(targets, ['nsis'])
  assert.equal(typeof pkg.dependencies['electron-updater'], 'string')
  assert.equal(buildConfig.nsis.oneClick, false)
})

test('Traditional Chinese update UI explains automatic safe installer behavior', () => {
  assert.match(ui, /自動檢查更新/)
  assert.match(ui, /穩定版/)
  assert.match(ui, /測試版/)
  assert.match(ui, /安裝並重新啟動/)
  assert.doesNotMatch(ui, /Portable/)
})

test('install restart is blocked while playing or hosting', () => {
  assert.match(main, /canRestart: \(\) => room\.mode !== 'host' && !playback\.current\(\)\?\.playing/)
})

test('main rechecks a downloaded update when playback or room authority changes', () => {
  assert.match(main, /playback\.subscribe\([\s\S]*?notifySafetyChanged\(\)/)
  assert.match(main, /ipcMain\.handle\('room:leave'[\s\S]*?notifySafetyChanged\(\)/)
})

test('update UI explains background download and safe automatic install', () => {
  assert.match(ui, /背景自動下載/)
  assert.match(ui, /安全時機自動安裝/)
})
