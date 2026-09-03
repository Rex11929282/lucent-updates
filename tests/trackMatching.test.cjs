const test = require('node:test')
const assert = require('node:assert/strict')

const {
  musicConfidence,
  normalizeTrackTitle,
  scoreTrackMatch,
  selectBestTrackMatch,
  shouldResolveLyrics,
} = require('../shared/trackMatching.cjs')

test('dedicated music sources with usable metadata qualify for lyric lookup', () => {
  const spotify = {
    playbackSource: 'desktop-spotify',
    sourceAppId: 'Spotify.exe',
    name: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We’re Dreaming',
    durationMs: 244000,
  }
  assert.ok(musicConfidence(spotify) >= 0.65)
  assert.equal(shouldResolveLyrics(spotify), true)
})

test('an ordinary browser video does not receive lyrics without music evidence', () => {
  const video = {
    playbackSource: 'desktop-generic',
    sourceAppId: 'chrome.exe',
    name: 'How a camera works',
    artist: 'Example Channel',
    durationMs: 612000,
  }
  assert.ok(musicConfidence(video) < 0.65)
  assert.equal(shouldResolveLyrics(video), false)
})

test('normalization removes explicit distribution labels but preserves meaningful versions', () => {
  assert.equal(normalizeTrackTitle('Midnight City (Official Audio)'), 'midnight city')
  assert.equal(normalizeTrackTitle('Midnight City - Lyrics'), 'midnight city')
  assert.equal(normalizeTrackTitle('Song (2024 Remaster)'), 'song')
  assert.equal(normalizeTrackTitle('Song (Acoustic Version)'), 'song acoustic version')
  assert.equal(normalizeTrackTitle('Song (Live at Wembley)'), 'song live at wembley')
})

test('normalization removes an explicit featuring suffix from the title', () => {
  assert.equal(normalizeTrackTitle('Talk to Me (feat. Guest)'), 'talk to me')
  assert.equal(normalizeTrackTitle('Talk to Me ft. Guest'), 'talk to me')
  assert.equal(normalizeTrackTitle('Talk to Me（Feat Guest）'), 'talk to me')
})

test('a featuring suffix can match provider metadata that keeps guests in the artist field', () => {
  const wanted = {
    name: 'Talk to Me (feat. Guest)',
    artist: 'Main Artist',
    durationMs: 186000,
  }
  const result = {
    id: 21,
    name: 'Talk to Me',
    artist: 'Main Artist feat. Guest',
    durationMs: 186400,
  }
  assert.ok(scoreTrackMatch(wanted, result) >= 0.65)
  assert.equal(selectBestTrackMatch(wanted, [result])?.id, 21)
})

test('exact title and artist with close duration is a safe lyric match', () => {
  const wanted = { name: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', durationMs: 244000 }
  const result = { id: 1, name: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', durationMs: 244900 }
  assert.ok(scoreTrackMatch(wanted, result) >= 0.9)
  assert.equal(selectBestTrackMatch(wanted, [result])?.id, 1)
})

test('explicit official-video noise may match while an acoustic version is not collapsed', () => {
  const provider = { id: 2, name: 'Song', artist: 'Artist', album: 'Album', durationMs: 180000 }
  assert.ok(scoreTrackMatch({ name: 'Song (Official Video)', artist: 'Artist', durationMs: 180000 }, provider) >= 0.65)
  assert.ok(scoreTrackMatch({ name: 'Song (Acoustic Version)', artist: 'Artist', durationMs: 180000 }, provider) < 0.65)
})

test('low-confidence provider results are rejected instead of forcing wrong lyrics', () => {
  const wanted = { name: 'A long podcast episode', artist: 'A podcast show', durationMs: 3600000 }
  const results = [
    { id: 9, name: 'A Long Song', artist: 'Another Artist', album: 'Music', durationMs: 220000 },
    { id: 10, name: 'Podcast', artist: 'Singer', album: 'Music', durationMs: 180000 },
  ]
  assert.equal(selectBestTrackMatch(wanted, results), null)
})

test('duration mismatch prevents same-title different-version collisions', () => {
  const wanted = { name: 'Song', artist: 'Artist', album: 'Album', durationMs: 180000 }
  const shortVersion = { id: 3, name: 'Song', artist: 'Artist', album: 'Other Album', durationMs: 95000 }
  assert.ok(scoreTrackMatch(wanted, shortVersion) < 0.65)
  assert.equal(selectBestTrackMatch(wanted, [shortVersion]), null)
})
