const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createTrackIdentity,
  sameTrackIdentity,
  trackIdentityKey,
} = require('../shared/trackIdentity.cjs')

test('track identity uses title, artist, album and a stable duration bucket', () => {
  assert.deepEqual(createTrackIdentity({
    name: 'Midnight City (Official Audio)',
    artist: 'M83',
    album: 'Hurry Up, We’re Dreaming',
    durationMs: 244000,
    positionMs: 5000,
  }), {
    providerId: null,
    normalizedTitle: 'midnight city',
    normalizedArtist: 'm83',
    normalizedAlbum: 'hurry up we re dreaming',
    durationBucket: 49,
  })
})

test('playback position and small duration drift do not create a new track', () => {
  const before = { name: 'Song', artist: 'Artist', album: 'Album', durationMs: 180000, positionMs: 1000 }
  const after = { ...before, durationMs: 181900, positionMs: 120000 }
  assert.equal(sameTrackIdentity(before, after), true)
})

test('late album and duration enrichment do not replay the track-change lifecycle', () => {
  const provisional = { name: 'Song', artist: 'Artist' }
  const enriched = { ...provisional, album: 'Album', durationMs: 180000, cover: 'cover.jpg' }
  assert.equal(sameTrackIdentity(provisional, enriched), true)
})

test('meaningful versions, artists, albums and large duration differences remain distinct', () => {
  const base = { name: 'Song', artist: 'Artist', album: 'Album', durationMs: 180000 }
  assert.equal(sameTrackIdentity(base, { ...base, name: 'Song (Acoustic Version)' }), false)
  assert.equal(sameTrackIdentity(base, { ...base, artist: 'Another Artist' }), false)
  assert.equal(sameTrackIdentity(base, { ...base, album: 'Other Album' }), false)
  assert.equal(sameTrackIdentity(base, { ...base, durationMs: 95000 }), false)
})

test('source takeover keeps one identity while conflicting provider ids do not', () => {
  const desktop = { name: 'Song', artist: 'Artist', source: 'desktop-spotify' }
  const internal = { ...desktop, source: 'internal-player' }
  assert.equal(sameTrackIdentity(desktop, internal), true)
  assert.equal(sameTrackIdentity({ ...desktop, id: 1 }, { ...desktop, id: 2 }), false)
})

test('identity key contains provider id when available and metadata otherwise', () => {
  assert.equal(trackIdentityKey({ id: '108242', name: '雨天' }), 'id:108242')
  assert.equal(
    trackIdentityKey({ name: '雨天', artist: '孫燕姿', album: 'My Story', durationMs: 236000 }),
    'meta:雨天|孫燕姿|my story|47',
  )
})
