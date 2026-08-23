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
  assert.match(ui, /待播放歌曲/)
  assert.match(ui, /管理佇列/)
  assert.match(ui, /控制播放/)
  assert.match(ui, /點歌已送交房主/)
  assert.match(ui, /目前跟隨房主/)
})

test('internal player end advances the host queue and members route controls as commands', () => {
  assert.match(main, /eventType === 'ended'[^\n]*advanceRoomQueue/)
  assert.match(ui, /ov\.room\.command\('song\.request'/)
  assert.match(ui, /ov\.room\.command\('playback\.load'/)
})
