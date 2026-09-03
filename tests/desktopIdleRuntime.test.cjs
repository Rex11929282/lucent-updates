const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')

test('main clears the desktop playback source after liveness expiry instead of continuing its old clock', () => {
  assert.match(main, /desktopSourceDisposition\(/)
  assert.match(main, /function clearDesktopSource\(\)/)
  // There is no longer a single SOURCE.DESKTOP: desktop playback can now come
  // from NetEase, Spotify, YouTube Music or a generic session, so clearing goes
  // through clearDesktop() which drops whichever desktop source is active.
  assert.match(main, /playback\.clearDesktop\(\)/)
  // The stale clock must be dropped too, otherwise lyrics keep advancing on a
  // source that is no longer playing.
  const body = main.match(/function clearDesktopSource\(\)[\s\S]*?\n\}/)[0]
  assert.match(body, /clk\.at = 0/)
  assert.match(body, /clk\.playing = false/)
  assert.match(body, /np\.song = null/)
})

test('a brief SMTC detection gap retains the active source so background NetEase CDP cannot take over', () => {
  const body = main.match(/async function onSmtc\(data\) \{[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(body, /activeSmtcSourceAppId = cur\?\.sourceAppId \|\| ''/)
  assert.match(body, /if \(cur\) \{[\s\S]*?activeSmtcSourceAppId = cur\.sourceAppId/)
})

test('console is a normal window and NetEase debug relaunch remains manual only', () => {
  const consoleWindow = main.match(/function openConsole\(\) \{[\s\S]*?\n\}/)?.[0] || ''
  assert.match(consoleWindow, /alwaysOnTop:\s*false/)
  assert.doesNotMatch(main, /function ensurePreciseMode\(/)
  assert.doesNotMatch(main, /\n\s*ensurePreciseMode\(\)/)
  assert.match(main, /ipcMain\.handle\('ncm:relaunchDebug'/)
})
