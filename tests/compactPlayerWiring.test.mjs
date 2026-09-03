import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const consoleWindow = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('compact player labels and controls the source it actually displays', () => {
  assert.match(consoleWindow, /compactPlayerView/)
  assert.match(consoleWindow, /playbackSourceLabel\(displayedPlayer\.source\)/)
  assert.match(consoleWindow, /canControlDisplayed/)
  assert.match(consoleWindow, /displayedPlayer\.song\?\.artistImageUrl/)
})

test('playback page receives the live room clock and refreshes only while an external source is playing', () => {
  assert.match(consoleWindow, /roomClockRef=\{clockRef\}/)
  assert.match(consoleWindow, /function PlayTab\(\{ roomState, roomClockRef,/)
  assert.match(consoleWindow, /roomClock:\s*roomClockRef\?\.current/)
  assert.match(consoleWindow, /setInterval\([\s\S]*?250\)/)
})
