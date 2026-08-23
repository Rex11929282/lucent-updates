const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')

test('main process routes local and room-host snapshots through PlaybackCoordinator', () => {
  assert.match(main, /createPlaybackCoordinator/)
  assert.match(main, /playback\.update\(SOURCE\.DESKTOP,\s*snapshot\)/)
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
  assert.match(main, /room:snapshot'[\s\S]*state:\s*playback\.current\(\)/)
})
