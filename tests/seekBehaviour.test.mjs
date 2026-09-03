import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { parseLyrics, lineIndexAt } from '../src/lyrics.js'

const require = createRequire(import.meta.url)
const { createInternalPlayerState, reduceInternalPlayer, internalSnapshot } = require('../shared/internalPlayerState.cjs')
const { sameTrackIdentity } = require('../shared/trackIdentity.cjs')

// Task document §38 requires a Seek regression test, and §24 names the failure
// modes: seeking must not cause permanent desync, must not look like a track
// change, and must not restart the line animation. Seeking is the one operation
// that moves the clock without anything about the track changing, so every
// "did the track change?" check has to stay false across it.

const LRC = [
  '[00:10.00]first line',
  '[00:20.00]second line',
  '[00:30.00]third line',
  '[00:40.00]fourth line',
  '[00:50.00]fifth line',
].join('\n')

function playing() {
  let s = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 1, trackId: '42', song: { id: '42', name: 'Song' },
  })
  s = reduceInternalPlayer(s, {
    type: 'load-ready', revision: 1, song: { id: '42', name: 'Song', durationMs: 60000 }, lines: [], timed: true,
  })
  return reduceInternalPlayer(s, { type: 'playing', revision: 1, positionMs: 0, durationMs: 60000 })
}

test('seeking moves the clock and nothing else', () => {
  const before = playing()
  const after = reduceInternalPlayer(before, { type: 'time', revision: 1, positionMs: 45000, durationMs: 60000 })

  assert.equal(after.positionMs, 45000, 'the clock must move')
  assert.equal(after.revision, before.revision, 'a seek is not a new revision')
  assert.equal(after.song.id, before.song.id, 'the track must not change')
  assert.equal(after.playing, before.playing, 'seeking must not change play state')
  assert.equal(sameTrackIdentity(before.song, after.song), true, 'identity must survive a seek')
})

test('seeking does not re-announce the track as newly ready', () => {
  // transition.readySongRevision is what makes the capsule rebuild and replay
  // its change animation. If a seek re-fired it, the same line would restart
  // its animation every time the user dragged the progress bar.
  const before = playing()
  const announced = before.transition.readySongRevision
  const after = reduceInternalPlayer(before, { type: 'time', revision: 1, positionMs: 45000, durationMs: 60000 })

  assert.equal(after.transition.readySongRevision, announced, 'the ready signal must not change on a seek')
  assert.equal(after.transition.token, before.transition.token, 'no new transition token')
  assert.equal(after.transition.endedSongRevision, before.transition.endedSongRevision)
})

test('a stale seek for a previous track is ignored', () => {
  // An in-flight seek can land after the user has already switched tracks.
  const first = playing()
  const second = reduceInternalPlayer(first, {
    type: 'load-start', revision: 2, trackId: '99', song: { id: '99', name: 'Next' },
  })
  const stale = reduceInternalPlayer(second, { type: 'time', revision: 1, positionMs: 45000, durationMs: 60000 })

  assert.equal(stale.revision, 2, 'the newer track stays current')
  assert.notEqual(stale.positionMs, 45000, 'a seek for the old revision must not move the new track')
})

test('the snapshot the renderer sees carries the seeked position', () => {
  const after = reduceInternalPlayer(playing(), { type: 'time', revision: 1, positionMs: 33000, durationMs: 60000 })
  assert.equal(internalSnapshot(after).positionMs, 33000)
})

test('seeking lands on the correct lyric line in both directions', () => {
  const { lines, timed } = parseLyrics(LRC)
  assert.equal(timed, true)
  assert.equal(lines.length, 5)

  // Forward, backward, and back forward again — the index is derived from the
  // clock every time, so a seek can never leave a permanent offset.
  assert.equal(lineIndexAt(lines, timed, 45, 4), 3, 'seek to 45s -> fourth line')
  assert.equal(lineIndexAt(lines, timed, 15, 4), 0, 'seek back to 15s -> first line')
  assert.equal(lineIndexAt(lines, timed, 55, 4), 4, 'seek to 55s -> fifth line')
  assert.equal(lineIndexAt(lines, timed, 25, 4), 1, 'seek back to 25s -> second line')

  // Repeating a position must give the same answer — no accumulated drift.
  assert.equal(lineIndexAt(lines, timed, 45, 4), 3, 'the same clock always yields the same line')
})

test('seeking before the first timestamp is not treated as the first line', () => {
  // A track with an instrumental intro should show nothing yet, not line one
  // held on screen — that is the "first line repeats forever" symptom.
  const { lines, timed } = parseLyrics(LRC)
  assert.equal(lineIndexAt(lines, timed, 0, 4), -1)
  assert.equal(lineIndexAt(lines, timed, 9.9, 4), -1)
  assert.equal(lineIndexAt(lines, timed, 10, 4), 0, 'exactly on the timestamp shows the line')
})
