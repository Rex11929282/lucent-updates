const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createInternalPlayerState,
  reduceInternalPlayer,
  internalSnapshot,
} = require('../shared/internalPlayerState.cjs')

test('a new load revision clears previous song data and runtime errors', () => {
  const old = {
    ...createInternalPlayerState(),
    revision: 2,
    trackId: 'old',
    song: { id: 'old' },
    lines: [{ text: 'old lyric' }],
    playing: true,
    error: 'old error',
  }
  const next = reduceInternalPlayer(old, { type: 'load-start', revision: 3, trackId: 'new' })
  assert.equal(next.revision, 3)
  assert.equal(next.trackId, 'new')
  assert.equal(next.song, null)
  assert.deepEqual(next.lines, [])
  assert.equal(next.playing, false)
  assert.equal(next.loading, true)
  assert.equal(next.error, '')
})

test('a new load may expose provisional metadata without retaining old artwork', () => {
  const next = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start',
    revision: 1,
    trackId: '101',
    song: { id: '101', name: '載入中…', cover: 'old-cover-should-not-survive' },
  })
  assert.equal(next.song.id, '101')
  assert.equal(next.song.name, '載入中…')
  assert.equal(next.song.cover, '')
  assert.equal(next.song.artworkReady, false)
})

test('events from an older load revision are ignored', () => {
  const current = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 4, trackId: 'new',
  })
  const stale = reduceInternalPlayer(current, {
    type: 'load-ready', revision: 3, song: { id: 'old' }, lines: [{ text: 'old' }], timed: true,
  })
  assert.equal(stale, current)
})

test('ready, playing, time, pause and ended events preserve one song identity', () => {
  let state = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 5, trackId: '55',
  })
  state = reduceInternalPlayer(state, {
    type: 'load-ready', revision: 5,
    song: { id: '55', name: 'Song 55', durationMs: 9000 },
    lines: [{ time: 0, text: 'line' }], timed: true, assetsReady: true,
  })
  assert.equal(state.loading, false)
  assert.equal(state.assetsReady, true)
  state = reduceInternalPlayer(state, { type: 'playing', revision: 5, positionMs: 100, durationMs: 9000 })
  assert.equal(state.playing, true)
  state = reduceInternalPlayer(state, { type: 'time', revision: 5, positionMs: 2400, durationMs: 9000 })
  assert.equal(state.positionMs, 2400)
  state = reduceInternalPlayer(state, { type: 'pause', revision: 5, positionMs: 2500 })
  assert.equal(state.playing, false)
  state = reduceInternalPlayer(state, { type: 'ended', revision: 5, positionMs: 9000 })
  assert.equal(state.song.id, '55')
  assert.equal(state.positionMs, 9000)
  assert.equal(state.playing, false)
})

test('media errors stop playback and expose a safe message without a URL', () => {
  let state = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 6, trackId: '66', song: { id: '66', name: '載入中…' },
  })
  state = reduceInternalPlayer(state, {
    type: 'error', revision: 6, message: '歌曲目前無法播放', retryCount: 1,
  })
  assert.equal(state.playing, false)
  assert.equal(state.loading, false)
  assert.equal(state.song, null, 'A failed load must not leave a loading placeholder as the song title')
  assert.equal(internalSnapshot(state).song, null)
  assert.equal(state.error, '歌曲目前無法播放')
  assert.equal(state.urlRetryCount, 1)
  assert.doesNotMatch(JSON.stringify(internalSnapshot(state)), /https?:\/\//)
})

test('a decoder error preserves ready song metadata for a source retry', () => {
  let state = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 1, trackId: '66',
  })
  state = reduceInternalPlayer(state, {
    type: 'load-ready', revision: 1,
    song: { id: '66', name: 'Ready song', loading: false },
    lines: [{ time: 0, text: 'Ready lyric' }],
  })
  const failed = reduceInternalPlayer(state, { type: 'error', revision: 1, message: 'Decode failed' })
  assert.equal(failed.song, state.song)
  assert.equal(failed.lines, state.lines)
})

test('delayed artwork enriches the active song without resetting lyrics or playback', () => {
  const lines = [{ time: 1, text: 'current lyric' }]
  let state = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 7, trackId: '77', song: { id: '77' },
  })
  state = reduceInternalPlayer(state, {
    type: 'load-ready', revision: 7,
    song: { id: '77', cover: 'cover.jpg' }, lines, timed: true, assetsReady: true,
  })
  state = reduceInternalPlayer(state, { type: 'playing', revision: 7, positionMs: 3200 })
  const enriched = reduceInternalPlayer(state, {
    type: 'artwork', revision: 7, avatar: 'avatar.jpg',
  })
  assert.equal(enriched.song.avatar, 'avatar.jpg')
  assert.equal(enriched.lines, lines)
  assert.equal(enriched.positionMs, 3200)
  assert.equal(enriched.playing, true)
})

test('an ended song scatters once and the next ready playing song unlocks reassembly', () => {
  let state = reduceInternalPlayer(createInternalPlayerState(), {
    type: 'load-start', revision: 1, trackId: 'old', song: { id: 'old', name: 'Old' },
  })
  state = reduceInternalPlayer(state, {
    type: 'load-ready', revision: 1, song: { id: 'old', name: 'Old', durationMs: 1000 }, assetsReady: true,
  })
  state = reduceInternalPlayer(state, { type: 'playing', revision: 1 })
  state = reduceInternalPlayer(state, { type: 'ended', revision: 1, positionMs: 1000 })
  assert.deepEqual(state.transition, {
    token: 1, endedSongRevision: 1, endedSongId: 'old', readySongRevision: 0,
  })

  state = reduceInternalPlayer(state, {
    type: 'load-start', revision: 2, trackId: 'new', song: { id: 'new', name: 'New' },
  })
  assert.equal(state.transition.token, 1)
  assert.equal(state.transition.readySongRevision, 0)
  state = reduceInternalPlayer(state, {
    type: 'load-ready', revision: 2, song: { id: 'new', name: 'New', durationMs: 1000 }, assetsReady: true,
  })
  assert.equal(state.transition.readySongRevision, 0)
  state = reduceInternalPlayer(state, { type: 'playing', revision: 2 })
  assert.equal(state.transition.readySongRevision, 2)
  assert.deepEqual(internalSnapshot(state).transition, state.transition)
})
