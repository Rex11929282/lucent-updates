const test = require('node:test')
const assert = require('node:assert/strict')

const {
  SOURCE,
  desktopSessionIdentity,
  desktopSourceId,
  isDesktopSource,
} = require('../shared/playbackSource.cjs')

test('playback source ids are stable and independent from translated labels', () => {
  assert.equal(SOURCE.INTERNAL, 'internal-player')
  assert.equal(SOURCE.DESKTOP_NETEASE, 'desktop-netease')
  assert.equal(SOURCE.DESKTOP_SPOTIFY, 'desktop-spotify')
  assert.equal(SOURCE.DESKTOP_YOUTUBE_MUSIC, 'desktop-youtube-music')
  assert.equal(SOURCE.DESKTOP_GENERIC, 'desktop-generic')
  assert.equal(SOURCE.ROOM_HOST, 'room-host')
  assert.equal(SOURCE.DESKTOP, SOURCE.DESKTOP_NETEASE)
})

test('desktop sessions map to a provider source without using UI language', () => {
  assert.equal(desktopSourceId({ sourceAppId: 'cloudmusic.exe' }), SOURCE.DESKTOP_NETEASE)
  assert.equal(desktopSourceId({ sourceAppId: 'Spotify.exe' }), SOURCE.DESKTOP_SPOTIFY)
  assert.equal(desktopSourceId({ sourceAppId: 'chrome.exe', title: 'YouTube Music' }), SOURCE.DESKTOP_YOUTUBE_MUSIC)
  assert.equal(desktopSourceId({ sourceAppId: 'vlc.exe', title: 'Local file' }), SOURCE.DESKTOP_GENERIC)
})

test('all desktop ids are recognised without treating internal or room sources as desktop', () => {
  assert.equal(isDesktopSource(SOURCE.DESKTOP_NETEASE), true)
  assert.equal(isDesktopSource(SOURCE.DESKTOP_SPOTIFY), true)
  assert.equal(isDesktopSource(SOURCE.DESKTOP_YOUTUBE_MUSIC), true)
  assert.equal(isDesktopSource(SOURCE.DESKTOP_GENERIC), true)
  assert.equal(isDesktopSource(SOURCE.INTERNAL), false)
  assert.equal(isDesktopSource(SOURCE.ROOM_HOST), false)
})

test('Spotify session metadata becomes one complete desktop song identity', () => {
  assert.deepEqual(desktopSessionIdentity({
    sessionId: 'spotify-session',
    sourceAppId: 'Spotify.exe',
    title: 'Midnight City',
    artist: 'M83',
    albumTitle: 'Hurry Up, We’re Dreaming',
    thumbnail: 'data:image/jpeg;base64,AAAA',
    artistImageUrl: 'https://example.test/m83.jpg',
    duration: 244.25,
  }), {
    playbackSource: SOURCE.DESKTOP_SPOTIFY,
    sourceAppId: 'Spotify.exe',
    sessionId: 'spotify-session',
    name: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We’re Dreaming',
    cover: 'data:image/jpeg;base64,AAAA',
    artistImageUrl: 'https://example.test/m83.jpg',
    avatar: 'https://example.test/m83.jpg',
    durationMs: 244250,
    preciseMirror: false,
  })
})

test('NetEase remains the only desktop source that may use precise DOM lyric mirroring', () => {
  assert.equal(desktopSessionIdentity({ sourceAppId: 'cloudmusic.exe', title: '歌曲' }).preciseMirror, true)
  assert.equal(desktopSessionIdentity({ sourceAppId: 'spotify.exe', title: 'Song' }).preciseMirror, false)
  assert.equal(desktopSessionIdentity({ sourceAppId: 'vlc.exe', title: 'Song' }).preciseMirror, false)
})

test('YouTube Music is classified only when a browser session carries service evidence', () => {
  assert.equal(desktopSourceId({
    sourceAppId: 'chrome.exe',
    title: 'Song title - YouTube Music',
  }), SOURCE.DESKTOP_YOUTUBE_MUSIC)
  assert.equal(desktopSourceId({
    sourceAppId: 'msedge.exe',
    sessionId: 'https://music.youtube.com/watch?v=track',
    title: 'Song title',
    artist: 'Artist',
  }), SOURCE.DESKTOP_YOUTUBE_MUSIC)
  assert.equal(desktopSourceId({
    sourceAppId: 'chromium.exe',
    title: 'Ordinary YouTube video',
    artist: 'Channel name',
  }), SOURCE.DESKTOP_GENERIC)
})

test('an unknown media player keeps enough metadata for the generic shared pipeline', () => {
  const identity = desktopSessionIdentity({
    sourceAppId: 'MusicBee.exe',
    sessionId: 'musicbee-session',
    title: 'Local Song',
    artist: 'Local Artist',
    album: 'Local Album',
    coverUrl: 'data:image/png;base64,BBBB',
    position: 12,
    duration: 180,
  })
  assert.equal(identity.playbackSource, SOURCE.DESKTOP_GENERIC)
  assert.equal(identity.name, 'Local Song')
  assert.equal(identity.artist, 'Local Artist')
  assert.equal(identity.album, 'Local Album')
  assert.equal(identity.cover, 'data:image/png;base64,BBBB')
  assert.equal(identity.durationMs, 180000)
  assert.equal(identity.preciseMirror, false)
})
