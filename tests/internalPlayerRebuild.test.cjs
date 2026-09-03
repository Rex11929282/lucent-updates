const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createInternalPlayerState,
  reduceInternalPlayer,
  internalSnapshot,
} = require('../shared/internalPlayerState.cjs')

// The capsule's shatter transition parks in a "dormant" phase until it is told
// which song revision is ready to be drawn. That signal is transition.
// readySongRevision. Without it the capsule keeps rendering a frozen snapshot of
// the PREVIOUS song — its title and its lyrics — no matter what is really
// playing. This is exactly what "the internal player has no lyrics" looked like.

function playTrack(state, { revision, trackId, name, lines }) {
  let next = reduceInternalPlayer(state, {
    type: 'load-start', revision, trackId, song: { id: trackId, name },
  })
  next = reduceInternalPlayer(next, {
    type: 'load-ready', revision, song: { id: trackId, name, durationMs: 200000 }, lines, timed: true,
  })
  return reduceInternalPlayer(next, { type: 'playing', revision, positionMs: 0, durationMs: 200000 })
}

test('the very first internal track announces that it is ready to draw', () => {
  // The regression: a fresh internal player has transition.token === 0, and the
  // old rule refused to announce readiness unless the token was already above
  // zero. A pending shatter almost always comes from the desktop source, whose
  // token lives on a different object entirely, so this signal never fired.
  const state = playTrack(createInternalPlayerState(), {
    revision: 1, trackId: '111', name: '稻香', lines: [{ time: 0, text: 'a' }],
  })

  assert.equal(state.playing, true)
  assert.equal(state.transition.readySongRevision, 1, 'the capsule would stay frozen without this')
  assert.equal(internalSnapshot(state).transition.readySongRevision, 1, 'and it has to survive into the snapshot')
})

test('the snapshot carries the song and its lyrics alongside the signal', () => {
  const lines = Array.from({ length: 33 }, (_, i) => ({ time: i, text: `line ${i}` }))
  const state = playTrack(createInternalPlayerState(), { revision: 4, trackId: '9', name: '海闊天空', lines })
  const snapshot = internalSnapshot(state)

  assert.equal(snapshot.song.name, '海闊天空')
  assert.equal(snapshot.song.revision, 4)
  assert.equal(snapshot.song.artworkReady, true)
  assert.equal(snapshot.loading, false)
  assert.equal(snapshot.lines.length, 33, 'the lyrics the capsule refused to show')
  assert.equal(snapshot.transition.readySongRevision, 4)
})

test('a track still loading does not claim to be ready', () => {
  // assetsReady is false until load-ready lands. Announcing early would make the
  // capsule redraw with a half-built song.
  let state = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 2, trackId: '5', song: { id: '5', name: 'x' },
  })
  state = reduceInternalPlayer(state, { type: 'playing', revision: 2, positionMs: 0, durationMs: 1000 })
  assert.equal(state.assetsReady, false)
  assert.equal(state.transition.readySongRevision, 0, 'must not announce a song whose assets are not ready')
})

test('a song that already ended is not re-announced as ready', () => {
  let state = playTrack(createInternalPlayerState(), { revision: 3, trackId: '7', name: 'y', lines: [] })
  state = reduceInternalPlayer(state, { type: 'ended', revision: 3, positionMs: 200000, durationMs: 200000 })

  assert.equal(state.transition.endedSongRevision, 3)
  assert.equal(state.transition.readySongRevision, 0, 'ending clears the ready signal')

  // A stray 'playing' for the finished revision must not resurrect it.
  const stray = reduceInternalPlayer(state, { type: 'playing', revision: 3, positionMs: 0, durationMs: 200000 })
  assert.equal(stray.transition.readySongRevision, 0, 'the ended revision must not be announced again')
})

test('consecutive internal tracks each announce their own revision', () => {
  let state = playTrack(createInternalPlayerState(), { revision: 1, trackId: '1', name: 'one', lines: [] })
  assert.equal(state.transition.readySongRevision, 1)

  state = reduceInternalPlayer(state, { type: 'ended', revision: 1, positionMs: 1, durationMs: 1 })
  state = playTrack(state, { revision: 2, trackId: '2', name: 'two', lines: [] })

  assert.equal(state.song.name, 'two')
  assert.equal(state.transition.readySongRevision, 2, 'the second track needs its own signal')
  assert.notEqual(state.transition.readySongRevision, state.transition.endedSongRevision)
})
