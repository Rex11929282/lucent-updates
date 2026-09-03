import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { applyScheduledState, positionMsOf, shouldScheduleVisualTick } from '../src/roomClockRuntime.js'

test('member clock interpolates from the host timestamp rather than receipt time', () => {
  const position = positionMsOf({ positionMs: 1000, playing: true, at: 500, hostAtMs: 450 }, 600)
  assert.equal(position, 1150)
})

test('a future effective state waits until its host timestamp before replacing the lyric', () => {
  const current = { lyric: '舊句' }
  const incoming = { lyric: '新句', effectiveAtMs: 1100 }
  assert.equal(applyScheduledState(current, incoming, 900).lyric, '舊句')
  assert.equal(applyScheduledState(current, incoming, 1150).lyric, '新句')
})

test('a paused room song does not keep the renderer visual clock alive', () => {
  assert.equal(shouldScheduleVisualTick({ hasRoomSong: true, roomPlaying: false, localPlaying: false }), false)
  assert.equal(shouldScheduleVisualTick({ hasRoomSong: true, roomPlaying: true, localPlaying: false }), true)
  assert.equal(shouldScheduleVisualTick({ hasRoomSong: false, roomPlaying: false, localPlaying: true }), true)
})

test('a paused seek invalidates the renderer once without enabling a continuous visual clock', () => {
  const hook = fs.readFileSync(new URL('../src/useRoom.js', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(hook, /const \[clockRevision, setClockRevision\] = useState\(0\)/)
  assert.match(hook, /if \(!active\) setClockRevision/)
  assert.match(hook, /clockRevision/)
  assert.match(app, /clockRevision/)
  assert.match(app, /\[hasRoomSong,[^\]]*clockRevision[^\]]*\]/s)
})
