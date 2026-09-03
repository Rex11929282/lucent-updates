const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8')
const consoleWindow = fs.readFileSync(path.join(root, 'src', 'ConsoleWindow.jsx'), 'utf8')

test('main publishes desktop state and ticks through the classified provider id', () => {
  assert.match(main, /desktopSourceId/)
  assert.match(main, /activeDesktopPlaybackSource/)
  assert.match(main, /playback\.update\(activeDesktopPlaybackSource, snapshot\)/)
  assert.match(main, /playback\.updateClock\(activeDesktopPlaybackSource/)
  assert.match(main, /playback\.clearDesktop\(\)/)
})

test('Spotify artwork and album metadata survive the shared lyric lookup pipeline', () => {
  assert.match(main, /desktopSessionIdentity\(selectedSession\)/)
  assert.match(main, /cover:\s*identity\.cover\s*\|\|\s*''/)
  assert.match(main, /durationMs:\s*identity\.durationMs\s*\|\|\s*0/)
  assert.match(main, /cover:\s*ticket\.identity\.cover\s*\|\|\s*detail\.cover/)
  assert.match(main, /album:\s*ticket\.identity\.album\s*\|\|\s*detail\.album/)
})

test('player source labels cover each stable provider id without changing those ids', () => {
  // Labels moved out of ConsoleWindow into the locale files, so this now checks
  // every language rather than only the Chinese strings — a stronger guarantee
  // than the single-file version it replaces.
  const { SOURCE } = require('../shared/playbackSource.cjs')
  const localeDir = path.join(root, 'src', 'locales')
  const ids = [
    SOURCE.INTERNAL, SOURCE.DESKTOP_NETEASE, SOURCE.DESKTOP_SPOTIFY,
    SOURCE.DESKTOP_YOUTUBE_MUSIC, SOURCE.DESKTOP_GENERIC, SOURCE.ROOM_HOST, SOURCE.IDLE,
  ]
  for (const file of fs.readdirSync(localeDir).filter((name) => /^[a-z]{2}(?:-[A-Z]{2})?\.json$/.test(name))) {
    const dict = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'))
    for (const id of ids) {
      assert.equal(typeof dict[`source.${id}`], 'string', `${file} is missing a label for ${id}`)
    }
    assert.equal(typeof dict['source.unknown'], 'string', `${file} needs a fallback label`)
  }
  // The IDs themselves are persisted and cross the room protocol; translating
  // the UI must never rename them.
  assert.equal(SOURCE.DESKTOP_NETEASE, 'desktop-netease')
  assert.equal(SOURCE.DESKTOP_SPOTIFY, 'desktop-spotify')
  assert.equal(SOURCE.DESKTOP_YOUTUBE_MUSIC, 'desktop-youtube-music')
  assert.equal(SOURCE.DESKTOP_GENERIC, 'desktop-generic')
  assert.equal(SOURCE.INTERNAL, 'internal-player')
  // The console renders labels through the translator, not a hardcoded map.
  assert.match(consoleWindow, /localizedSourceLabel\(t, source\)/)
})
