const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { desktopSessionIdentity } = require('../shared/playbackSource.cjs')
const { normalizePlaybackState, SOURCE } = require('../shared/playbackCoordinator.cjs')

test('Windows thumbnail is track artwork and is not mislabeled as an artist image', () => {
  const identity = desktopSessionIdentity({
    sourceAppId: 'Spotify.exe',
    title: 'Song',
    thumbnail: 'data:image/jpeg;base64,COVER',
  })
  assert.equal(identity.cover, 'data:image/jpeg;base64,COVER')
  assert.equal(identity.artistImageUrl, '')
  assert.equal(identity.avatar, '')
})

test('an explicit provider artist image remains separate in normalized playback state', () => {
  const state = normalizePlaybackState(SOURCE.DESKTOP_SPOTIFY, {
    song: {
      name: 'Song',
      cover: 'track.jpg',
      artistImageUrl: 'artist.jpg',
      avatar: 'artist.jpg',
    },
  })
  assert.equal(state.song.cover, 'track.jpg')
  assert.equal(state.song.artistImageUrl, 'artist.jpg')
  assert.equal(state.song.avatar, 'artist.jpg')
})

test('renderer fallback order is artist image, track artwork, then Lucent assets', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8')
  assert.match(app, /usableSongCover \|\| LUCENT_COVER_ASSET/)
  assert.match(app, /\[roomState\?\.song\?\.artistImageUrl, roomState\?\.song\?\.avatar, usableSongCover\]/)
  assert.match(app, /usableArtistImage \|\| LUCENT_AVATAR_ASSET/)
})

test('renderer rejects artwork that fails to decode and falls back without blocking the song transition', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8')
  assert.match(app, /preloadArtwork\(url\)/)
  assert.match(app, /failedArtworkUrls/)
  assert.match(app, /usableSongCover/)
  assert.match(app, /usableArtistImage/)
})

test('artist lookup commits only to the current song revision', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.match(main, /if \(songRevision\.isCurrent\(ticket\)\) \{[\s\S]*artistImageUrl:/)
})
