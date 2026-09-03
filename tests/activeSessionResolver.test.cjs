const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createActiveSessionResolver,
  isKnownMusicSource,
} = require('../shared/activeSessionResolver.cjs')

const session = (sourceAppId, playbackStatus, position, extra = {}) => ({
  sessionId: sourceAppId,
  sourceAppId,
  title: extra.title || `${sourceAppId} song`,
  artist: extra.artist ?? 'Artist',
  albumTitle: extra.albumTitle || '',
  position,
  duration: 240,
  playbackStatus,
  playing: playbackStatus === 'Playing',
  paused: playbackStatus === 'Paused',
  confidence: 1,
})

test('a playing session wins over a paused session regardless of scan order', () => {
  const resolver = createActiveSessionResolver({ now: () => 1000 })
  const selected = resolver.resolve([
    session('spotify.exe', 'Paused', 30),
    session('chrome.exe', 'Playing', 12, { title: 'YouTube Music' }),
  ])
  assert.equal(selected.sourceAppId, 'chrome.exe')
})

test('manual source selection wins while that session is still discoverable', () => {
  const resolver = createActiveSessionResolver({ now: () => 1000 })
  const selected = resolver.resolve([
    session('spotify.exe', 'Paused', 30),
    session('chrome.exe', 'Playing', 12, { title: 'YouTube Music' }),
  ], { manualSourceAppId: 'spotify.exe' })
  assert.equal(selected.sourceAppId, 'spotify.exe')
})

test('an advancing session replaces a stale session that merely says Playing', () => {
  let now = 1000
  const resolver = createActiveSessionResolver({ now: () => now })
  assert.equal(resolver.resolve([
    session('spotify.exe', 'Playing', 10),
    session('chrome.exe', 'Playing', 10, { title: 'Browser video' }),
  ]).sourceAppId, 'spotify.exe')

  now = 1700
  const selected = resolver.resolve([
    session('spotify.exe', 'Playing', 10),
    session('chrome.exe', 'Playing', 10.8, { title: 'Browser video' }),
  ])
  assert.equal(selected.sourceAppId, 'chrome.exe')
})

test('a newly started player replaces a previously active player', () => {
  let now = 1000
  const resolver = createActiveSessionResolver({ now: () => now })
  resolver.resolve([
    session('spotify.exe', 'Playing', 10),
    session('msedge.exe', 'Paused', 0, { title: 'YouTube Music' }),
  ])

  now = 1800
  const selected = resolver.resolve([
    session('spotify.exe', 'Playing', 10),
    session('msedge.exe', 'Playing', 0, { title: 'YouTube Music' }),
  ])
  assert.equal(selected.sourceAppId, 'msedge.exe')
})

test('stable playing evidence does not flap when the scan order changes', () => {
  let now = 1000
  const resolver = createActiveSessionResolver({ now: () => now })
  const spotify = session('spotify.exe', 'Playing', 10)
  const chrome = session('chrome.exe', 'Playing', 10, { title: 'Browser video' })
  assert.equal(resolver.resolve([spotify, chrome]).sourceAppId, 'spotify.exe')
  now = 1600
  assert.equal(resolver.resolve([chrome, spotify]).sourceAppId, 'spotify.exe')
})

test('a track change inside the same session counts as fresh playback', () => {
  let now = 1000
  const resolver = createActiveSessionResolver({ now: () => now })
  const spotify = session('spotify.exe', 'Playing', 120, { title: 'Old Song' })
  const browser = session('chrome.exe', 'Playing', 30, { title: 'Browser video' })
  assert.equal(resolver.resolve([spotify, browser]).sourceAppId, 'spotify.exe')

  now = 1800
  const selected = resolver.resolve([
    session('spotify.exe', 'Playing', 0, { title: 'New Song' }),
    session('chrome.exe', 'Playing', 30.8, { title: 'Browser video' }),
  ])
  assert.equal(selected.sourceAppId, 'spotify.exe')
})

test('a same-title change with a different artist counts as a fresh track', () => {
  let now = 1000
  const resolver = createActiveSessionResolver({ now: () => now })
  resolver.resolve([
    session('spotify.exe', 'Playing', 120, { title: '同名歌曲', artist: '歌手甲' }),
    session('chrome.exe', 'Playing', 30, { title: 'Browser video' }),
  ])

  now = 1800
  const selected = resolver.resolve([
    session('spotify.exe', 'Playing', 0, { title: '同名歌曲', artist: '歌手乙' }),
    session('chrome.exe', 'Playing', 30.8, { title: 'Browser video' }),
  ])
  assert.equal(selected.sourceAppId, 'spotify.exe')
})

test('when every source is paused the last selected song remains visible', () => {
  let now = 1000
  const resolver = createActiveSessionResolver({ now: () => now })
  resolver.resolve([
    session('spotify.exe', 'Playing', 10),
    session('vlc.exe', 'Paused', 40),
  ])
  now = 1800
  const selected = resolver.resolve([
    session('vlc.exe', 'Paused', 40),
    session('spotify.exe', 'Paused', 10),
  ])
  assert.equal(selected.sourceAppId, 'spotify.exe')
})

test('known music sources include apps and browser music titles without treating every browser as music', () => {
  assert.equal(isKnownMusicSource(session('cloudmusic.exe', 'Playing', 0)), true)
  assert.equal(isKnownMusicSource(session('chrome.exe', 'Playing', 0, { title: 'YouTube Music' })), true)
  assert.equal(isKnownMusicSource(session('chrome.exe', 'Playing', 0, { title: 'News video' })), false)
})
