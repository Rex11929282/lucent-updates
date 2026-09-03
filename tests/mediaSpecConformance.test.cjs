const test = require('node:test')
const assert = require('node:assert/strict')

const { SOURCE, desktopSourceId, desktopSessionIdentity } = require('../shared/playbackSource.cjs')
const { sameTrackIdentity } = require('../shared/trackIdentity.cjs')
const { normalizeMediaSessions } = require('../shared/mediaSession.cjs')
const { createActiveSessionResolver } = require('../shared/activeSessionResolver.cjs')
const { normalizeTrackTitle, shouldResolveLyrics } = require('../shared/trackMatching.cjs')

// These assertions are tied to the numbered requirements in the 1.0.0 task
// document. Unit tests elsewhere cover each module in isolation; this file pins
// the end-to-end behaviour the document actually asks for, so a refactor can
// tell which behaviour is a free choice and which one is a promise.

test('§11–13: a media session resolves to the right normalized source id', () => {
  const cases = [
    [{ sourceAppId: 'Spotify.exe', title: 'Blinding Lights', albumTitle: 'After Hours' }, SOURCE.DESKTOP_SPOTIFY],
    // A browser does not announce itself as YouTube Music; it has to be inferred.
    [{ sourceAppId: 'chrome.exe', title: 'Song', albumTitle: 'YouTube Music' }, SOURCE.DESKTOP_YOUTUBE_MUSIC],
    [{ sourceAppId: 'msedge.exe', title: 'Song', albumTitle: 'YouTube Music' }, SOURCE.DESKTOP_YOUTUBE_MUSIC],
    [{ sourceAppId: 'cloudmusic.exe', title: '稻香' }, SOURCE.DESKTOP_NETEASE],
    // §13: an unknown player with usable metadata is still supported.
    [{ sourceAppId: 'foobar2000.exe', title: 'Some Song', albumTitle: 'Some Album' }, SOURCE.DESKTOP_GENERIC],
  ]
  for (const [session, expected] of cases) {
    assert.equal(desktopSourceId(session), expected, `${session.sourceAppId} should map to ${expected}`)
  }
})

test('§10: source ids are stable internal constants, not display labels', () => {
  // The document requires these exact strings; UI language must never change them.
  assert.equal(SOURCE.INTERNAL, 'internal-player')
  assert.equal(SOURCE.DESKTOP_NETEASE, 'desktop-netease')
  assert.equal(SOURCE.DESKTOP_SPOTIFY, 'desktop-spotify')
  assert.equal(SOURCE.DESKTOP_YOUTUBE_MUSIC, 'desktop-youtube-music')
  assert.equal(SOURCE.DESKTOP_GENERIC, 'desktop-generic')
})

test('§21: a position-only poll is not a track change', () => {
  // SMTC polls several times a second. Treating a moved playhead as a new track
  // would reload artwork and replay the change animation constantly.
  const track = { name: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', durationMs: 200040 }
  assert.equal(sameTrackIdentity(track, { ...track, positionMs: 120700 }), true, 'position moved')
  assert.equal(sameTrackIdentity(track, { ...track, durationMs: 201540 }), true, 'duration jitter inside a bucket')
  assert.equal(sameTrackIdentity(track, { ...track, name: 'Save Your Tears' }), false, 'a real track change')
})

test('§15: normalization strips packaging noise but keeps meaningful qualifiers', () => {
  // Over-stripping is called out explicitly in the document: removing every
  // bracketed token would match a live recording to the studio lyrics.
  assert.equal(normalizeTrackTitle('Song (Remastered 2011)'), 'song')
  assert.equal(normalizeTrackTitle('Song - Official Video'), 'song')
  assert.equal(normalizeTrackTitle('Song feat. X'), 'song')
  assert.match(normalizeTrackTitle('Song (Live)'), /live/, '"Live" identifies a different recording')
})

test('§9: arbitration follows whichever source is actually playing', () => {
  const playingSpotify = normalizeMediaSessions([
    { sourceAppId: 'Spotify.exe', title: 'A', artist: 'x', playbackStatus: 'Playing', position: 10, duration: 200 },
    { sourceAppId: 'chrome.exe', title: 'B', artist: 'y', albumTitle: 'YouTube Music', playbackStatus: 'Paused', position: 5, duration: 200 },
  ])
  assert.equal(
    createActiveSessionResolver({ now: () => 10_000 }).resolve(playingSpotify)?.sourceAppId,
    'Spotify.exe',
  )

  // The documented example: Spotify pauses, YouTube Music starts, Lucent follows.
  const playingYoutube = normalizeMediaSessions([
    { sourceAppId: 'Spotify.exe', title: 'A', artist: 'x', playbackStatus: 'Paused', position: 30, duration: 200 },
    { sourceAppId: 'chrome.exe', title: 'B', artist: 'y', albumTitle: 'YouTube Music', playbackStatus: 'Playing', position: 6, duration: 200 },
  ])
  assert.equal(
    createActiveSessionResolver({ now: () => 20_000 }).resolve(playingYoutube)?.sourceAppId,
    'chrome.exe',
  )
})

test('§14: media without music metadata is not forced into a lyric match', () => {
  // A podcast episode in a browser has a title but no artist. Showing song
  // lyrics over it would be confidently wrong.
  assert.equal(
    shouldResolveLyrics({ playbackSource: SOURCE.DESKTOP_GENERIC, name: 'Episode 214 - interview', artist: '', album: '' }),
    false,
  )
  assert.equal(
    shouldResolveLyrics({ playbackSource: SOURCE.DESKTOP_SPOTIFY, name: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours' }),
    true,
  )
})

test('§18: the Windows thumbnail is track artwork, never an artist image', () => {
  // Priority 1 is the SMTC thumbnail, and it belongs to the track. Putting it in
  // artistImageUrl would show album art as the artist avatar on every source.
  const identity = desktopSessionIdentity({
    sourceAppId: 'Spotify.exe', title: 'Song', artist: 'A', thumbnail: 'https://cdn.example/thumb.jpg',
  })
  assert.equal(identity.cover, 'https://cdn.example/thumb.jpg')
  assert.equal(identity.artistImageUrl, '', 'the thumbnail is not an artist portrait')
  assert.equal(identity.avatar, '')
})
