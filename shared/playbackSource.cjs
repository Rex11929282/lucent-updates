const SOURCE = Object.freeze({
  INTERNAL: 'internal-player',
  DESKTOP_NETEASE: 'desktop-netease',
  DESKTOP_SPOTIFY: 'desktop-spotify',
  DESKTOP_YOUTUBE_MUSIC: 'desktop-youtube-music',
  DESKTOP_GENERIC: 'desktop-generic',
  ROOM_HOST: 'room-host',
  IDLE: 'idle',
  // 舊程式與外掛仍可讀取，但新接線使用明確的 provider ID。
  DESKTOP: 'desktop-netease',
})

const DESKTOP_SOURCES = new Set([
  SOURCE.DESKTOP_NETEASE,
  SOURCE.DESKTOP_SPOTIFY,
  SOURCE.DESKTOP_YOUTUBE_MUSIC,
  SOURCE.DESKTOP_GENERIC,
])
const PLAYBACK_SOURCES = new Set([...DESKTOP_SOURCES, SOURCE.INTERNAL, SOURCE.ROOM_HOST])

function desktopSourceId(session = {}) {
  const value = [
    session.sourceAppId,
    session.sessionId,
    session.mediaId,
    session.service,
    session.title,
    session.albumTitle,
  ].filter(Boolean).join(' ').toLowerCase()
  if (/cloudmusic|netease|网易|網易/.test(value)) return SOURCE.DESKTOP_NETEASE
  if (/spotify/.test(value)) return SOURCE.DESKTOP_SPOTIFY
  if (/youtube\s*music|youtubemusic|music\.youtube/.test(value)) return SOURCE.DESKTOP_YOUTUBE_MUSIC
  return SOURCE.DESKTOP_GENERIC
}

function desktopSessionIdentity(session = {}) {
  const playbackSource = desktopSourceId(session)
  const cover = String(session.thumbnail || session.coverUrl || '').trim()
  const artistImageUrl = String(session.artistImageUrl || '').trim()
  const explicitDurationMs = Number(session.durationMs)
  const durationSeconds = Number(session.duration)
  return {
    playbackSource,
    sourceAppId: String(session.sourceAppId || '').trim(),
    sessionId: String(session.sessionId || '').trim(),
    name: String(session.title || '').trim(),
    artist: String(session.artist || '').trim(),
    album: String(session.albumTitle || session.album || '').trim(),
    cover,
    artistImageUrl,
    avatar: artistImageUrl,
    durationMs: Number.isFinite(explicitDurationMs) && explicitDurationMs > 0
      ? explicitDurationMs
      : (Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : 0),
    preciseMirror: playbackSource === SOURCE.DESKTOP_NETEASE,
  }
}

function isDesktopSource(source) {
  return DESKTOP_SOURCES.has(source)
}

function isPlaybackSource(source) {
  return PLAYBACK_SOURCES.has(source)
}

module.exports = { SOURCE, desktopSessionIdentity, desktopSourceId, isDesktopSource, isPlaybackSource }
