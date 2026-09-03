const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isOwnMediaSession,
  normalizeMediaSession,
  normalizeMediaSessions,
} = require('../shared/mediaSession.cjs')

test('recognises the app-owned media session so internal audio is not treated as desktop playback', () => {
  assert.equal(isOwnMediaSession({ sourceAppId: 'electron.exe' }, ['electron.exe', 'Lucent.exe']), true)
  assert.equal(isOwnMediaSession({ sourceAppId: 'cloudmusic.exe' }, ['electron.exe', 'Lucent.exe']), false)
  assert.equal(isOwnMediaSession({ sourceAppId: 'chrome.exe' }, ['electron.exe', 'Lucent.exe']), false)
})

test('accepts the Set that the main process actually passes, not just an Array', () => {
  // main.cjs builds ownMediaSourceAppIds as a Set. This test previously only ever
  // passed Arrays, so an implementation using ownSourceAppIds.some() passed the
  // whole suite while throwing on every single SMTC poll at runtime.
  const owned = new Set(['electron.exe', 'lucent.exe'])
  assert.equal(isOwnMediaSession({ sourceAppId: 'electron.exe' }, owned), true)
  assert.equal(isOwnMediaSession({ sourceAppId: 'Electron.exe' }, owned), true)
  assert.equal(isOwnMediaSession({ sourceAppId: 'cloudmusic.exe' }, owned), false)
})

test('never throws on the argument shapes a caller can realistically pass', () => {
  const shapes = [undefined, null, [], new Set(), ['electron.exe'], new Set(['electron.exe']), 'electron.exe']
  for (const shape of shapes) {
    assert.doesNotThrow(() => isOwnMediaSession({ sourceAppId: 'cloudmusic.exe' }, shape), `threw on ${String(shape)}`)
  }
  // A bare string is iterable but is not a list of ids; it must not match by character.
  assert.equal(isOwnMediaSession({ sourceAppId: 'e' }, 'electron.exe'), false)
})

test('normalizes one GSMTC session into the shared playback shape', () => {
  const session = normalizeMediaSession({
    sessionId: 'cloudmusic.exe!session',
    sourceAppId: 'cloudmusic.exe',
    title: '孤獨患者',
    artist: '陳奕迅',
    albumArtist: '陳奕迅',
    albumTitle: '？',
    thumbnail: 'data:image/jpeg;base64,AAAA',
    position: 12.75,
    duration: 248.5,
    playbackStatus: 'Playing',
  }, 0)

  assert.deepEqual(session, {
    sessionId: 'cloudmusic.exe!session',
    source: 'smtc',
    sourceAppId: 'cloudmusic.exe',
    title: '孤獨患者',
    artist: '陳奕迅',
    albumArtist: '陳奕迅',
    album: '？',
    albumTitle: '？',
    thumbnail: 'data:image/jpeg;base64,AAAA',
    coverUrl: 'data:image/jpeg;base64,AAAA',
    artistImageUrl: '',
    duration: 248.5,
    position: 12.75,
    playbackStatus: 'Playing',
    playing: true,
    paused: false,
    confidence: 1,
  })
})

test('keeps discoverable sessions while safely normalizing missing metadata', () => {
  const sessions = normalizeMediaSessions([
    {
      sourceAppId: 'chrome.exe',
      title: '  YouTube Music  ',
      position: -5,
      duration: 'not-a-number',
      playbackStatus: 'Paused',
    },
    { sessionId: 'vlc-session', playbackStatus: 'Stopped' },
    null,
    {},
  ])

  assert.equal(sessions.length, 2)
  assert.match(sessions[0].sessionId, /^chrome\.exe#track:/)
  assert.equal(sessions[0].title, 'YouTube Music')
  assert.equal(sessions[0].position, 0)
  assert.equal(sessions[0].duration, 0)
  assert.equal(sessions[0].playing, false)
  assert.equal(sessions[0].paused, true)
  assert.equal(sessions[0].confidence, 1)
  assert.equal(sessions[1].sessionId, 'vlc-session')
  assert.equal(sessions[1].sourceAppId, '')
  assert.equal(sessions[1].confidence, 0.5)
})

test('accepts legacy SMTC field names during the transition', () => {
  const session = normalizeMediaSession({
    app: 'legacy-player',
    title: 'Legacy song',
    pos: 9,
    status: 'Playing',
  }, 2)

  assert.equal(session.sourceAppId, 'legacy-player')
  assert.equal(session.sessionId, 'legacy-player#track:legacy song||0')
  assert.equal(session.position, 9)
  assert.equal(session.playbackStatus, 'Playing')
  assert.equal(session.playing, true)
})

test('synthetic same-app session ids stay stable when Windows reorders sessions', () => {
  const tracks = [
    {
      sessionId: 'chrome.exe',
      sourceAppId: 'chrome.exe',
      title: 'Music A',
      artist: 'Artist A',
      duration: 180,
      playbackStatus: 'Playing',
    },
    {
      sessionId: 'chrome.exe',
      sourceAppId: 'chrome.exe',
      title: 'Music B',
      artist: 'Artist B',
      duration: 210,
      playbackStatus: 'Paused',
    },
  ]

  const first = normalizeMediaSessions(tracks)
  const reordered = normalizeMediaSessions([...tracks].reverse())
  const firstIds = new Map(first.map((item) => [item.title, item.sessionId]))
  const reorderedIds = new Map(reordered.map((item) => [item.title, item.sessionId]))

  assert.notEqual(firstIds.get('Music A'), firstIds.get('Music B'))
  assert.equal(firstIds.get('Music A'), reorderedIds.get('Music A'))
  assert.equal(firstIds.get('Music B'), reorderedIds.get('Music B'))
})

test('synthetic session id stays stable when Windows fills in duration later', () => {
  const beforeMetadata = normalizeMediaSession({
    sourceAppId: 'cloudmusic.exe',
    title: '孤獨患者',
    artist: '陳奕迅',
    duration: 0,
    playbackStatus: 'Playing',
  })
  const afterMetadata = normalizeMediaSession({
    sourceAppId: 'cloudmusic.exe',
    title: '孤獨患者',
    artist: '陳奕迅',
    duration: 248.5,
    playbackStatus: 'Playing',
  })

  assert.equal(afterMetadata.sessionId, beforeMetadata.sessionId)
})
