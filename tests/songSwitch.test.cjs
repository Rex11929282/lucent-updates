const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  createSongRevision,
  currentPlaybackSongId,
  isFreshMirrorSnapshot,
  mapNeteaseSongDetail,
  mirrorBelongsToSong,
  normalizeCdpSnapshot,
  songIdentityKey,
} = require('../shared/songSwitch.cjs')

test('only the newest song revision may commit delayed results', async () => {
  const revision = createSongRevision()
  const a = revision.begin({ id: 'A' })
  const b = revision.begin({ id: 'B' })
  const c = revision.begin({ id: 'C' })

  assert.equal(revision.isCurrent(a), false)
  assert.equal(revision.isCurrent(b), false)
  assert.equal(revision.isCurrent(c), true)
  assert.equal(revision.current().identity.id, 'C')
})

test('promoting provisional metadata to its canonical id keeps one song revision', () => {
  const revision = createSongRevision()
  const provisional = revision.begin({ name: 'Song A', artist: 'Artist A' })
  const promoted = revision.promote(provisional, { id: '108242', name: 'Song A', artist: 'Artist A' })

  assert.equal(promoted.revision, provisional.revision)
  assert.equal(revision.current().revision, provisional.revision)
  assert.equal(revision.current().identity.id, '108242')
  assert.equal(revision.isCurrent(provisional), true)
})

test('main promotes a provisional song when a live CDP id arrives', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.match(source, /function promoteCurrentSong\(/)
  assert.match(source, /songRevision\.promote\(/)
  assert.match(source, /promoteCurrentSong\(nextId, 'cdp'\)/)
})

test('live playback event id wins over a stale lyric request id', () => {
  assert.equal(currentPlaybackSongId({
    progressSongId: '108242',
    playState: '108242_token|resume|nonce',
    requestSongId: '19723756',
  }), '108242')

  assert.equal(currentPlaybackSongId({
    playState: '145879_token|pause|nonce',
    requestSongId: '19723756',
  }), '145879')
  assert.equal(currentPlaybackSongId({ requestSongId: '19723756' }), '19723756')
})

test('the newest playback event wins when progress and state disagree during switching', () => {
  assert.equal(currentPlaybackSongId({
    progressSongId: '111',
    progressAt: 100,
    stateSongId: '222',
    playState: '222_token|resume',
    stateAt: 200,
    requestSongId: '111',
  }), '222')

  assert.equal(currentPlaybackSongId({
    progressSongId: '333',
    progressAt: 300,
    stateSongId: '222',
    stateAt: 200,
  }), '333')
})

test('a mirrored lyric is accepted only for the active song id', () => {
  assert.equal(mirrorBelongsToSong('108242', '108242'), true)
  assert.equal(mirrorBelongsToSong('108242', '19723756'), false)
  assert.equal(mirrorBelongsToSong('108242', null), false)
  assert.equal(mirrorBelongsToSong(null, '108242'), false)
})

test('an older poll snapshot cannot replace a newer direct lyric event', () => {
  const newest = { capturedAt: 2000, seq: 8 }

  assert.equal(isFreshMirrorSnapshot(newest, { capturedAt: 1999, seq: 7 }), false)
  assert.equal(isFreshMirrorSnapshot(newest, { capturedAt: 2000, seq: 7 }), false)
  assert.equal(isFreshMirrorSnapshot(newest, { capturedAt: 2000, seq: 8 }), true)
  assert.equal(isFreshMirrorSnapshot(newest, { capturedAt: 2001, seq: 1 }), true)
  assert.equal(isFreshMirrorSnapshot(newest, { seq: 9 }), true)
})

test('song identity falls back to normalized title and artist when id is absent', () => {
  assert.equal(songIdentityKey({ id: 108242, name: '雨天' }), 'id:108242')
  assert.equal(
    songIdentityKey({ name: ' 雨 天 ', artist: ' 孫燕姿 ' }),
    'meta:雨天|孫燕姿',
  )
})

test('song detail mapping keeps metadata from one authoritative id', () => {
  assert.deepEqual(mapNeteaseSongDetail({
    id: 108242,
    name: '雨天',
    ar: [{ id: 9272, name: '孫燕姿' }, { id: 2, name: '合唱者' }],
    al: { name: 'My Story, Your Song', picUrl: 'https://example/cover.jpg' },
    dt: 236000,
  }), {
    id: 108242,
    name: '雨天',
    artist: '孫燕姿, 合唱者',
    artistId: 9272,
    album: 'My Story, Your Song',
    cover: 'https://example/cover.jpg',
    durationMs: 236000,
  })
})

test('CDP snapshot keeps stale DOM lyric provenance separate from the live song id', () => {
  assert.deepEqual(normalizeCdpSnapshot({
    progressSongId: '222_token',
    progressAt: 300,
    stateSongId: '111_token',
    stateAt: 200,
    requestSongId: '111',
    vals: [12.5],
    lyric: { i: 4, main: '新歌歌詞', sub: 'translation' },
  }), {
    progressSongId: '222_token',
    progressAt: 300,
    stateSongId: '111_token',
    stateAt: 200,
    requestSongId: '111',
    vals: [12.5],
    lyric: { i: 4, main: '新歌歌詞', sub: 'translation', songId: '111' },
    songId: '222',
    songIdSource: 'playback',
  })
})

test('main makes a new song ready before optional YRC enrichment completes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.doesNotMatch(source, /const \[yrc, pair\] = await Promise\.all/)
  const readyAt = source.indexOf('loading: false,')
  const yrcAt = source.indexOf('ncmcdp.fetchYrc(id)')
  assert.ok(readyAt >= 0 && yrcAt >= 0 && readyAt < yrcAt)
})
