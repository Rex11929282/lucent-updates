import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const main = read('electron/main.cjs')
const preload = read('electron/preload.cjs')
const entry = read('src/main.jsx')
const audioService = read('src/AudioService.jsx')
const netease = read('electron/netease.cjs')

test('a dedicated hidden BrowserWindow owns the audio service route', () => {
  assert.match(main, /let audioServiceWin\s*=\s*null/)
  assert.match(main, /show:\s*false/)
  assert.match(main, /skipTaskbar:\s*true/)
  assert.match(main, /backgroundThrottling:\s*false/)
  assert.match(main, /loadRoute\(audioServiceWin,\s*['"]audio-service['"]\)/)
  assert.match(entry, /audio-service/)
  assert.match(entry, /<AudioService\s*\/>/)
})

test('audio service uses one HTML audio element and reports native media events', () => {
  assert.equal((audioService.match(/<audio\b/g) || []).length, 1)
  for (const event of ['loadedmetadata', 'playing', 'pause', 'timeupdate', 'ended', 'error']) {
    assert.match(audioService, new RegExp(`(?:['"]${event}['"]|\\b${event}\\s*:)`), event)
  }
  assert.match(audioService, /ov\.player\.onCommand/)
  assert.match(audioService, /ov\.player\.report/)
})

test('preload exposes commands separately from audio-service reports', () => {
  assert.match(preload, /player:load/)
  assert.match(preload, /player:play/)
  assert.match(preload, /player:pause/)
  assert.match(preload, /player:toggle/)
  assert.match(preload, /player:seek/)
  assert.match(preload, /player:snapshot/)
  assert.match(preload, /player:command/)
  assert.match(preload, /player:event/)
})

test('main applies the commercial provider gate, member lock and desktop takeover policy', () => {
  assert.match(main, /internalPlaybackEnabled/)
  assert.match(main, /playerControlDecision/)
  assert.match(main, /shouldPauseInternalForDesktop/)
  assert.match(main, /SOURCE\.INTERNAL/)
  assert.match(main, /desktop-takeover/)
})

test('playable song metadata and its short-lived URL are resolved together without entering snapshots', () => {
  assert.match(netease, /async function getPlayableSong/)
  assert.match(netease, /getSongDetail\(id\)/)
  assert.match(netease, /getSongUrl\(id\)/)
  assert.match(netease, /getPlayableSong[,\s]/)
  assert.doesNotMatch(main, /song:\s*\{[^}]*url:/s)
})

test('runtime QA audio loading is unavailable outside an explicit development gate', () => {
  assert.match(main, /!app\.isPackaged\s*&&\s*process\.env\.LUCENT_RUNTIME_QA\s*===\s*['"]1['"]/) 
  assert.match(main, /player:qaLoad/)
  assert.match(preload, /player:qaLoad/)
})
