import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const main = read('electron/main.cjs')
const preload = read('electron/preload.cjs')
const entry = read('src/main.jsx')
const audioService = read('src/AudioService.jsx')
const netease = read('electron/netease.cjs')
const consoleWindow = read('src/ConsoleWindow.jsx')
const defaults = read('shared/defaults.json')
const roomStyle = read('shared/roomStyle.cjs')
const mediaSession = read('shared/mediaSession.cjs')

test('a dedicated hidden BrowserWindow owns the audio service route', () => {
  assert.match(main, /let audioServiceWin\s*=\s*null/)
  assert.match(main, /show:\s*false/)
  assert.match(main, /skipTaskbar:\s*true/)
  assert.match(main, /backgroundThrottling:\s*false/)
  assert.match(main, /loadRoute\(audioServiceWin,\s*['"]audio-service['"]\)/)
  assert.match(entry, /audio-service/)
  assert.match(entry, /<AudioService\s*\/>/)
})

test('player commands are queued until the hidden audio service has loaded', () => {
  assert.match(main, /let audioServiceReady\s*=\s*false/)
  assert.match(main, /const pendingPlayerCommands\s*=\s*\[\]/)
  assert.match(main, /if \(!audioServiceReady\) \{[\s\S]*pendingPlayerCommands\.push\(command\)/)
  assert.match(main, /mediaEvent\.type\s*===\s*['"]ready['"]/)
  assert.match(main, /audioServiceReady\s*=\s*true/)
  assert.match(main, /while \(pendingPlayerCommands\.length/)
  assert.match(audioService, /report\(['"]ready['"]\)/)
})

test('audio service uses one HTML audio element and reports native media events', () => {
  assert.equal((audioService.match(/<audio\b/g) || []).length, 1)
  for (const event of ['loadedmetadata', 'playing', 'pause', 'timeupdate', 'ended', 'error']) {
    assert.match(audioService, new RegExp(`(?:['"]${event}['"]|\\b${event}\\s*:)`), event)
  }
  assert.match(audioService, /ov\.player\.onCommand/)
  assert.match(audioService, /ov\.player\.report/)
})

test('the main process filters its own Windows media session before resolving desktop playback', () => {
  assert.match(mediaSession, /function isOwnMediaSession\(session, ownSourceAppIds = \[\]\)/)
  assert.match(main, /const ownMediaSourceAppIds = new Set\(\[/)
  assert.match(main, /data\.sessions \|\| \[\]\)\.filter\(\(session\) => !isOwnMediaSession\(session, ownMediaSourceAppIds\)\)/)
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
  assert.match(main, /const RUNTIME_QA = !app\.isPackaged\s*&&\s*process\.env\.LUCENT_RUNTIME_QA\s*===\s*['"]1['"]/) 
  assert.match(main, /if \(RUNTIME_QA\)/)
  assert.match(main, /player:qaLoad/)
  assert.match(preload, /player:qaLoad/)
})

test('runtime QA isolates external desktop observers without auto-relaunching NetEase', () => {
  assert.match(main, /if \(!RUNTIME_QA\) \{[\s\S]*?smtc\.start[\s\S]*?ncmcdp\.start/)
  assert.doesNotMatch(main, /ensurePreciseMode/)
})

test('internal-player volume is personal, persisted, and sent to the single audio element', () => {
  assert.match(defaults, /"internalPlayerVolume":\s*0\.8/)
  assert.match(preload, /setVolume:\s*\(value\)\s*=>\s*ipcRenderer\.invoke\('player:volume', value\)/)
  assert.match(main, /ipcMain\.handle\('player:volume'/)
  assert.match(main, /sendPlayerCommand\(\{ type: 'volume', value:/)
  assert.match(audioService, /command\.type === 'volume'/)
  assert.match(consoleWindow, /t\('player\.volume'\)/)
  assert.match(roomStyle, /'internalPlayerVolume'/)
})

test('only real internal audio analysis is forwarded as a local spectrum frame', () => {
  assert.match(audioService, /createMediaElementSource/)
  assert.match(audioService, /createAnalyser/)
  assert.match(audioService, /compactSpectrum/)
  assert.match(audioService, /report\('spectrum'/)
  assert.match(main, /mediaEvent\.type === 'spectrum'/)
  assert.match(main, /sendAll\('player:spectrum'/)
  assert.match(preload, /onSpectrum:\s*sub\('player:spectrum'\)/)
})
