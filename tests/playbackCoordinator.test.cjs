const test = require('node:test')
const assert = require('node:assert/strict')
const {
  SOURCE,
  createPlaybackCoordinator,
  playbackTrackKey,
} = require('../shared/playbackCoordinator.cjs')

const snap = (id, playing, capturedAt) => ({
  song: { id, name: `Song ${id}`, artist: 'Artist', revision: Number(id) || 1 },
  lines: [],
  timed: false,
  positionMs: 1000,
  playing,
  capturedAt,
})

test('solo mode prefers a playing desktop source over a playing internal source', () => {
  const clock = { now: 1000 }
  const coordinator = createPlaybackCoordinator({ now: () => clock.now })
  coordinator.update(SOURCE.INTERNAL, snap('11', true, 900))
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
  assert.equal(coordinator.current().song.id, '22')
})

test('a paused desktop source does not block a playing internal source', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', false, 950))
  coordinator.update(SOURCE.INTERNAL, snap('11', true, 960))
  assert.equal(coordinator.current().source, SOURCE.INTERNAL)
})

test('room member mode always renders the host snapshot even while host is paused', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  coordinator.setMode('member')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', false, 980))
  assert.equal(coordinator.current().source, SOURCE.ROOM_HOST)
  assert.equal(coordinator.current().song.id, '33')
})

test('leaving a room restores the best local source', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  coordinator.setMode('member')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', true, 980))
  coordinator.setMode(null)
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
})

test('source changes for the same canonical song keep the same track identity', () => {
  assert.equal(
    playbackTrackKey({ song: { id: '123', name: 'A', artist: 'B' } }),
    playbackTrackKey({ song: { id: 123, name: 'Different metadata', artist: '' } }),
  )
})

test('subscribers are notified only when the selected snapshot changes', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  const events = []
  const unsubscribe = coordinator.subscribe((value) => events.push(value))
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  coordinator.update(SOURCE.INTERNAL, snap('11', false, 960))
  unsubscribe()
  coordinator.update(SOURCE.DESKTOP, snap('23', true, 990))
  assert.equal(events.length, 1)
  assert.equal(events[0].song.id, '22')
})

test('member local updates stay cached but never emit over a room host selection', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  const events = []
  coordinator.subscribe((value) => events.push(value?.source || SOURCE.IDLE))
  coordinator.setMode('member')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', true, 900))
  coordinator.update(SOURCE.DESKTOP, snap('44', true, 950))
  assert.equal(coordinator.current().source, SOURCE.ROOM_HOST)
  assert.deepEqual(events, [SOURCE.ROOM_HOST])
})

test('host mode uses local arbitration and never selects room-host input', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.setMode('host')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', true, 900))
  coordinator.update(SOURCE.DESKTOP, snap('44', true, 950))
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
})

test('same-song source takeover preserves song revision and marks only the source change', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.INTERNAL, {
    ...snap('88', true, 900),
    song: { ...snap('88', true, 900).song, revision: 41 },
  })
  const next = coordinator.update(SOURCE.DESKTOP, {
    ...snap('88', true, 950),
    song: { ...snap('88', true, 950).song, revision: 99 },
  })
  assert.equal(next.trackKey, 'id:88')
  assert.equal(next.song.revision, 41)
  assert.equal(next.sourceChanged, true)
})

test('a different canonical song keeps its own revision', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.INTERNAL, {
    ...snap('88', true, 900),
    song: { ...snap('88', true, 900).song, revision: 41 },
  })
  const next = coordinator.update(SOURCE.DESKTOP, {
    ...snap('99', true, 950),
    song: { ...snap('99', true, 950).song, revision: 52 },
  })
  assert.equal(next.trackKey, 'id:99')
  assert.equal(next.song.revision, 52)
  assert.equal(next.sourceChanged, true)
})

test('clock updates do not publish a full snapshot while playback state is unchanged', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  const events = []
  coordinator.subscribe((value) => events.push(value))
  coordinator.update(SOURCE.INTERNAL, snap('77', true, 900))
  coordinator.updateClock(SOURCE.INTERNAL, { positionMs: 2500, playing: true, capturedAt: 1000 })
  assert.equal(events.length, 1)
  assert.equal(coordinator.current().positionMs, 2500)
})

test('a playback-state clock change re-runs source arbitration', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', false, 900))
  coordinator.update(SOURCE.INTERNAL, snap('77', true, 950))
  coordinator.updateClock(SOURCE.DESKTOP, { positionMs: 3000, playing: true, capturedAt: 1000 })
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
})

test('when all local sources are paused the most recently updated song remains visible', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', false, 900))
  coordinator.update(SOURCE.INTERNAL, snap('77', false, 980))
  assert.equal(coordinator.current().source, SOURCE.INTERNAL)
  assert.equal(coordinator.current().song.id, '77')
})
