const test = require('node:test')
const assert = require('node:assert/strict')

const {
  SOURCE,
  createPlaybackCoordinator,
  normalizePlaybackState,
} = require('../shared/playbackCoordinator.cjs')

const REQUIRED_KEYS = [
  'source', 'originSource', 'sourceAppId', 'sessionId', 'song', 'lines', 'timed',
  'positionMs', 'durationMs', 'playing', 'paused', 'playbackStatus', 'mirror',
  'syncStatus', 'transition', 'loading', 'error', 'capturedAt',
]

test('every playback source receives the same required normalized state fields', () => {
  for (const source of [SOURCE.INTERNAL, SOURCE.DESKTOP_SPOTIFY, SOURCE.ROOM_HOST]) {
    const state = normalizePlaybackState(source, {
      song: { id: '1', title: 'Song', artist: 'Artist', durationMs: 5000 },
      positionMs: 1200,
      playing: source !== SOURCE.ROOM_HOST,
    }, 1000)
    for (const key of REQUIRED_KEYS) assert.equal(Object.hasOwn(state, key), true, `${source}: ${key}`)
    assert.equal(state.song.name, 'Song')
    assert.equal(state.durationMs, 5000)
    assert.equal(state.paused, !state.playing)
  }
})

test('a room snapshot preserves the host provider as originSource', () => {
  const state = normalizePlaybackState(SOURCE.ROOM_HOST, {
    source: SOURCE.DESKTOP_SPOTIFY,
    song: { name: 'Song' },
    playing: true,
  }, 1000)
  assert.equal(state.source, SOURCE.ROOM_HOST)
  assert.equal(state.originSource, SOURCE.DESKTOP_SPOTIFY)
})

test('desktop provider changes replace the old desktop input without an intermediate empty selection', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  const events = []
  coordinator.subscribe((state) => events.push(state))
  coordinator.update(SOURCE.DESKTOP_SPOTIFY, {
    song: { id: '7', name: 'Same song', revision: 12 }, playing: true,
  })
  const next = coordinator.update(SOURCE.DESKTOP_YOUTUBE_MUSIC, {
    song: { id: '7', name: 'Same song', revision: 99 }, playing: true,
  })

  assert.equal(next.source, SOURCE.DESKTOP_YOUTUBE_MUSIC)
  assert.equal(next.song.revision, 12)
  assert.equal(next.sourceChanged, true)
  assert.equal(events.length, 2)
  coordinator.clearDesktop()
  assert.equal(coordinator.current(), null)
})

test('clock updates keep normalized playing fields consistent', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.INTERNAL, { song: { id: '8', name: 'Song' }, playing: true })
  coordinator.updateClock(SOURCE.INTERNAL, { positionMs: 3000, playing: false })
  const state = coordinator.current()
  assert.equal(state.positionMs, 3000)
  assert.equal(state.playing, false)
  assert.equal(state.paused, true)
  assert.equal(state.playbackStatus, 'Paused')
})
