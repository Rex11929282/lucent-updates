const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')

test('main process routes local and room-host snapshots through PlaybackCoordinator', () => {
  assert.match(main, /createPlaybackCoordinator/)
  assert.match(main, /playback\.update\(activeDesktopPlaybackSource,\s*snapshot\)/)
  assert.match(main, /playback\.update\(SOURCE\.ROOM_HOST,\s*snapshot\)/)
  assert.match(main, /playback\.subscribe/)
})

test('room leave restores local mode before clearing the host source', () => {
  const start = main.indexOf("ipcMain.handle('room:leave'")
  const end = main.indexOf("ipcMain.handle('room:setState'", start)
  const leaveHandler = start >= 0 && end > start ? main.slice(start, end) : ''
  const localModeAt = leaveHandler.indexOf('playback.setMode(null)')
  const clearHostAt = leaveHandler.indexOf('playback.clear(SOURCE.ROOM_HOST)')
  assert.ok(localModeAt >= 0)
  assert.ok(clearHostAt > localModeAt)
  assert.match(leaveHandler, /pushState\(\)/)
})

test('new renderer snapshots use the coordinator selection instead of stale room storage', () => {
  // Hosts still expose the live coordinator selection. Members must instead
  // retain the room's authoritative host snapshot while reconnecting; both
  // paths are intentionally explicit so a local empty desktop source cannot
  // erase the host state.
  assert.match(main, /room:snapshot'[\s\S]*state:\s*room\.mode === 'member'\s*\?\s*room\.state\s*:\s*playback\.current\(\)/)
})

test('changing follow mode does not invalidate the current song identity', () => {
  const start = main.indexOf("ipcMain.handle('np:setFollow'")
  const end = main.indexOf('function relaunchNcmDebug', start)
  const handler = start >= 0 && end > start ? main.slice(start, end) : ''
  assert.match(handler, /followApp\s*=\s*app\s*\|\|\s*null/)
  assert.match(handler, /activeSessionResolver\.reset\(\)/)
  assert.doesNotMatch(handler, /activeSmtcSourceAppId\s*=\s*''/)
  assert.doesNotMatch(handler, /lastSmtcKey\s*=\s*''/)
  assert.doesNotMatch(handler, /np\.title\s*=\s*''/)
})

test('internal playback uses word-timed YRC and falls back to LRC for the same song revision', () => {
  const start = main.indexOf('async function loadInternalTrack')
  const end = main.indexOf('function runPlayerCommand', start)
  const loader = start >= 0 && end > start ? main.slice(start, end) : ''
  assert.match(loader, /parseYrc\(pair\.yrc\)/)
  assert.match(loader, /parseLrc\(pair\.lrc\)/)
  assert.match(loader, /revision !== internalRevision/)
})

test('delayed artist metadata cannot block audio or overwrite a newer track', () => {
  const start = main.indexOf('async function loadInternalTrack')
  const end = main.indexOf('function runPlayerCommand', start)
  const loader = start >= 0 && end > start ? main.slice(start, end) : ''
  const audioAt = loader.indexOf("sendPlayerCommand({ type: 'load'")
  const avatarAt = loader.indexOf('netease.getArtistAvatar')
  assert.ok(audioAt >= 0 && avatarAt > audioAt)
  assert.match(loader, /revision !== internalRevision/)
  assert.match(loader, /type: 'artwork'/)
})
