import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mainSource = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const hookSource = readFileSync(new URL('../src/useRoom.js', import.meta.url), 'utf8')

test('leaving a room drops the stale host source and restores the local snapshot', () => {
  const leaveHandler = mainSource.match(/ipcMain\.handle\('room:leave',[\s\S]*?\n\}\)/)?.[0] || ''
  assert.match(leaveHandler, /playback\.setMode\(null\)/)
  assert.match(leaveHandler, /playback\.clear\(SOURCE\.ROOM_HOST\)/)
  assert.match(leaveHandler, /pushState\(\)/)
  assert.match(hookSource, /if \(!s\) \{\s*setState\(null\)\s*setClock\(0, false\)/)
})
