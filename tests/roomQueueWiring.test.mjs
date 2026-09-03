import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const main = read('electron/main.cjs')
const room = read('electron/room.cjs')
const preload = read('electron/preload.cjs')
const bridge = read('src/overlayBridge.js')
const hook = read('src/useRoom.js')
const ui = read('src/ConsoleWindow.jsx')

test('room commands are host-authoritative, permission checked, deduplicated and rate limited', () => {
  assert.match(room, /PROTOCOL_VERSION = 2/)
  assert.match(room, /commandDeduper\.accept/)
  assert.match(main, /canExecuteRoomCommand/)
  assert.match(main, /roomRequestLimiter\.check/)
  assert.match(main, /room\.on\('command'/)
  assert.match(main, /room\.sendCommandResult/)
})

test('queue and permissions cross only the room IPC bridge without sensitive playback URLs', () => {
  assert.doesNotMatch(room.match(/const QUEUE_FIELDS =[^\n]*/)?.[0] || '', /url/i)
  for (const source of [preload, bridge]) {
    assert.match(source, /command:/)
    assert.match(source, /setCapabilities:/)
    assert.match(source, /onQueue:/)
    assert.match(source, /onCapabilities:/)
    assert.match(source, /onCommandResult:/)
  }
  assert.match(hook, /setQueue/)
  assert.match(hook, /setCapabilities/)
})

test('Traditional Chinese UI exposes requests, host grants and queue controls', () => {
  assert.match(ui, /t\('ui\.room\.queueGroup'/)
  assert.match(ui, /t\('ui\.room\.capQueue'/)
  assert.match(ui, /t\('ui\.room\.capPlayback'/)
  assert.match(ui, /t\('ui\.playlist\.request'/)
  assert.match(ui, /t\('ui\.room\.followHost'/)
})

test('internal player end advances the host queue and members route controls as commands', () => {
  const onEnded = main.match(/if \(eventType === 'ended'\) \{[\s\S]*?\n  \}/)[0]
  // The room queue still wins when hosting; only if it has nothing left does the
  // internal player fall back to its own queue.
  assert.match(onEnded, /advanceRoomQueue\(\)/)
  assert.match(onEnded, /stepInternalQueue\(1\)/)
  assert.ok(
    onEnded.indexOf('advanceRoomQueue') < onEnded.indexOf('stepInternalQueue'),
    'the room queue must be consulted before the local queue',
  )
  assert.match(ui, /ov\.room\.command\('song\.request'/)
  assert.match(ui, /ov\.room\.command\('playback\.load'/)
})
