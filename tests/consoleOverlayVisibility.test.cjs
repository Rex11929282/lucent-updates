const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const main = read('electron/main.cjs')
const preload = read('electron/preload.cjs')
const app = read('src/App.jsx')
const capsule = read('src/components/Capsule.jsx')

test('opening the console collapses the overlay and closing it restores the same renderer', () => {
  assert.match(main, /function setOverlayConsoleCollapsed\(collapsed\)/)
  assert.match(main, /overlay\.webContents\.send\('overlay:console-visibility', true\)/)
  assert.match(main, /overlay\.hide\(\)/)
  assert.match(main, /overlay\.showInactive\(\)/)
  assert.match(preload, /onConsoleVisibility:\s*sub\('overlay:console-visibility'\)/)
  assert.match(app, /ov\.onConsoleVisibility/)
  assert.match(capsule, /consoleCollapsed/)
})

test('showing Lucent from the tray restores a console-collapsed renderer', () => {
  const match = main.match(/function showLucent\(\) \{([\s\S]*?)\n\}/)
  assert.ok(match, 'showLucent should exist')
  assert.match(match[1], /overlay\.webContents\.send\('overlay:console-visibility', false\)/)
})

test('showing Lucent cancels a pending console hide before making the overlay visible', () => {
  const match = main.match(/function showLucent\(\) \{([\s\S]*?)\n\}/)
  assert.ok(match, 'showLucent should exist')
  assert.match(match[1], /clearTimeout\(consoleOverlayTimer\)/)
})

test('the capsule context menu provides a direct console recovery action', () => {
  const match = main.match(/function popupOverlayMenu\(\) \{([\s\S]*?)\n\}/)
  assert.ok(match, 'popupOverlayMenu should exist')
  assert.match(match[1], /nativeUiLabels\(state\.ui\?\.locale,\s*systemUiLocale\(\)\)/)
  assert.match(match[1], /label:\s*labels\.openConsole/)
  assert.match(match[1], /click:\s*\(\)\s*=>\s*openConsole\(\)/)
})
