const test = require('node:test')
const assert = require('node:assert/strict')

const { smtcClockDecision } = require('../shared/smtcClock.cjs')

const playing = (position, extra = {}) => ({
  sourceAppId: 'spotify.exe',
  sessionId: 'spotify.exe#track:one',
  title: 'Song one',
  artist: 'Artist',
  position,
  playbackStatus: 'Playing',
  playing: true,
  ...extra,
})

test('a repeated stale SMTC position does not re-anchor the running clock', () => {
  const first = smtcClockDecision(null, playing(10))
  const repeated = smtcClockDecision(first, playing(10))

  assert.equal(first.shouldAnchor, true)
  assert.equal(repeated.positionChanged, false)
  assert.equal(repeated.playingChanged, false)
  assert.equal(repeated.shouldAnchor, false)
  assert.equal(repeated.shouldUpdateState, false)
})

test('a real seek, track change, or pause still updates the clock', () => {
  const first = smtcClockDecision(null, playing(10))
  assert.equal(smtcClockDecision(first, playing(22)).shouldAnchor, true)
  assert.equal(smtcClockDecision(first, playing(10, {
    sessionId: 'spotify.exe#track:two',
    title: 'Song two',
  })).shouldAnchor, true)

  const paused = smtcClockDecision(first, {
    ...playing(10),
    playbackStatus: 'Paused',
    playing: false,
  })
  assert.equal(paused.playingChanged, true)
  assert.equal(paused.shouldUpdateState, true)
})
