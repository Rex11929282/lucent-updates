const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

let lifecycle = {}
try { lifecycle = require('../shared/windowLifecycle.cjs') } catch {}

test('ordinary close hides Lucent while an explicit quit closes its services', () => {
  assert.equal(typeof lifecycle.shouldHideWindowOnClose, 'function')
  assert.equal(lifecycle.shouldHideWindowOnClose(false), true)
  assert.equal(lifecycle.shouldHideWindowOnClose(true), false)
})

test('console close preserves ask mode until the renderer chooses an action', () => {
  assert.equal(typeof lifecycle.resolveConsoleCloseAction, 'function')
  assert.equal(lifecycle.resolveConsoleCloseAction('ask', false), 'ask')
  assert.equal(lifecycle.resolveConsoleCloseAction('pill', false), 'pill')
  assert.equal(lifecycle.resolveConsoleCloseAction('tray', false), 'tray')
  assert.equal(lifecycle.resolveConsoleCloseAction('quit', true), 'quit')
})

test('main exposes renderer-owned close choices and pill recovery', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8')
  assert.match(main, /ipcMain\.handle\('console:close-with'/)
  assert.match(main, /ipcMain\.handle\('console:show-pill'/)
  assert.match(preload, /closeWith:/)
  assert.match(preload, /showPill:/)
})

test('main process owns a tray menu with restore and final-exit actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  const labels = require('../shared/nativeUiLocale.cjs').nativeUiLabels('zh-TW')
  assert.match(source, /\bTray\b/)
  assert.equal(labels.showLucent, '顯示璃音')
  assert.equal(labels.quit, '徹底結束')
  assert.match(source, /function nativeMenuTemplate\(\)/)
  assert.match(source, /function refreshTrayMenu\(\)/)
})
