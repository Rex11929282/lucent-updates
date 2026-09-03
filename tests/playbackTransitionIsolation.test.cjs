const test = require('node:test')
const assert = require('node:assert/strict')

const { SOURCE, createPlaybackCoordinator } = require('../shared/playbackCoordinator.cjs')

// The capsule's shatter animation is driven by snapshot.transition. Each source
// keeps its own transition object: the desktop's lives on `np` in main.cjs, the
// internal player's lives in its reducer. The internal player was recently made
// to announce transition.readySongRevision more eagerly (it previously refused
// unless it had already finished a song itself, which left the capsule frozen on
// the previous desktop track). That relaxation is only safe if one source's
// transition can never appear in a snapshot selected from the other.

const snap = (over = {}) => ({
  song: { id: '1', name: 'x', revision: 1 },
  lines: [], timed: false, positionMs: 0, playing: false,
  mirror: null, loading: false,
  transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0 },
  capturedAt: 1000,
  ...over,
})

test('the selected snapshot carries only its own source transition', () => {
  const playback = createPlaybackCoordinator({ now: () => 1000 })

  playback.update(SOURCE.DESKTOP_NETEASE, snap({
    song: { id: 'd', name: 'desktop song', revision: 7 },
    playing: true,
    transition: { token: 3, endedSongRevision: 7, endedSongId: 'd', readySongRevision: 0 },
  }))
  playback.update(SOURCE.INTERNAL, snap({
    song: { id: 'i', name: 'internal song', revision: 2 },
    playing: false,
    transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 2 },
  }))

  // Desktop is playing, so it wins arbitration.
  const selected = playback.current()
  assert.equal(selected.source, SOURCE.DESKTOP_NETEASE)
  assert.equal(selected.transition.readySongRevision, 0, 'the internal player must not fill in the desktop signal')
  assert.equal(selected.transition.token, 3, 'the desktop transition is preserved verbatim')
})

test('when the internal player wins, it brings its own transition', () => {
  const playback = createPlaybackCoordinator({ now: () => 1000 })

  // Desktop paused (the real case: the user paused NetEase), internal playing.
  playback.update(SOURCE.DESKTOP_NETEASE, snap({
    song: { id: 'd', name: 'desktop song', revision: 7 },
    playing: false,
    transition: { token: 3, endedSongRevision: 7, endedSongId: 'd', readySongRevision: 0 },
  }))
  playback.update(SOURCE.INTERNAL, snap({
    song: { id: 'i', name: 'internal song', revision: 2 },
    playing: true,
    transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 2 },
  }))

  const selected = playback.current()
  assert.equal(selected.source, SOURCE.INTERNAL)
  assert.equal(selected.song.name, 'internal song')
  assert.equal(
    selected.transition.readySongRevision,
    2,
    'without this the capsule stays frozen on the desktop song and shows its lyrics',
  )
  assert.equal(selected.transition.endedSongRevision, 0, 'the desktop ended-revision must not leak in')
})

test('a playing desktop source still beats the internal player', () => {
  // The relaxation must not let the internal player steal the display from a
  // desktop client that is actually playing.
  const playback = createPlaybackCoordinator({ now: () => 1000 })
  playback.update(SOURCE.INTERNAL, snap({
    song: { id: 'i', name: 'internal', revision: 2 }, playing: true,
    transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 2 },
  }))
  playback.update(SOURCE.DESKTOP_NETEASE, snap({
    song: { id: 'd', name: 'desktop', revision: 7 }, playing: true,
  }))

  assert.equal(playback.current().source, SOURCE.DESKTOP_NETEASE)
  assert.equal(playback.current().song.name, 'desktop')
})

test('a room member follows the host regardless of either local transition', () => {
  const playback = createPlaybackCoordinator({ now: () => 1000 })
  playback.setMode('member')
  playback.update(SOURCE.INTERNAL, snap({
    song: { id: 'i', name: 'internal', revision: 2 }, playing: true,
    transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 2 },
  }))
  playback.update(SOURCE.ROOM_HOST, snap({ song: { id: 'h', name: 'host song', revision: 5 }, playing: true }))

  const selected = playback.current()
  assert.equal(selected.source, SOURCE.ROOM_HOST)
  assert.equal(selected.transition.readySongRevision, 0, 'the local internal signal must not reach a member')
})
