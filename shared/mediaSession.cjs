function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function stableSessionPart(value) {
  return cleanString(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function syntheticSessionId(sourceAppId, raw, index) {
  const title = stableSessionPart(raw?.title)
  const artist = stableSessionPart(raw?.artist)
  const duration = nonNegativeNumber(raw?.duration)
  // Windows may publish title/artist first and fill in duration on a later
  // poll. Duration belongs to track-change detection, not to the lifetime of
  // the underlying SMTC session; including it here made metadata enrichment
  // look like a brand-new player session.
  const marker = title && artist
    ? [title, artist].join('|')
    : [title, artist, duration ? Math.round(duration) : 0].join('|')
  return `${sourceAppId}#track:${marker || index}`
}

function isOwnMediaSession(session, ownSourceAppIds = []) {
  const sourceAppId = cleanString(session?.sourceAppId || session?.app).toLowerCase()
  if (!sourceAppId) return false
  // Callers naturally build this as a Set (the ids are deduplicated), but an
  // Array reads better in tests. Accept any iterable rather than forcing one.
  // A string is excluded on purpose: it is iterable, and iterating it would
  // compare single characters instead of whole app ids.
  if (!ownSourceAppIds || typeof ownSourceAppIds === 'string') return false
  if (typeof ownSourceAppIds[Symbol.iterator] !== 'function') return false
  for (const value of ownSourceAppIds) {
    if (cleanString(value).toLowerCase() === sourceAppId) return true
  }
  return false
}

function nonNegativeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function normalizeMediaSession(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null

  const sourceAppId = cleanString(raw.sourceAppId || raw.app)
  const explicitSessionId = cleanString(raw.sessionId)
  if (!sourceAppId && !explicitSessionId) return null

  const title = cleanString(raw.title)
  const albumTitle = cleanString(raw.albumTitle || raw.album)
  const thumbnail = cleanString(raw.thumbnail || raw.coverUrl)
  const playbackStatus = cleanString(raw.playbackStatus || raw.status) || 'Unknown'
  // GSMTC does not expose a portable session id in the PowerShell bridge. The
  // bridge therefore uses the app id as a placeholder; derive a stable track
  // key so multiple same-app sessions do not overwrite one another and a
  // reorder of GetSessions() does not look like a new session.
  const appIdMatchesSessionId = sourceAppId && explicitSessionId
    && sourceAppId.toLowerCase() === explicitSessionId.toLowerCase()

  return {
    sessionId: appIdMatchesSessionId || !explicitSessionId
      ? syntheticSessionId(sourceAppId || explicitSessionId, raw, index)
      : explicitSessionId,
    source: 'smtc',
    sourceAppId,
    title,
    artist: cleanString(raw.artist),
    albumArtist: cleanString(raw.albumArtist),
    album: albumTitle,
    albumTitle,
    thumbnail,
    coverUrl: thumbnail,
    artistImageUrl: cleanString(raw.artistImageUrl),
    duration: nonNegativeNumber(raw.duration),
    position: nonNegativeNumber(raw.position ?? raw.pos),
    playbackStatus,
    playing: playbackStatus === 'Playing',
    paused: playbackStatus === 'Paused',
    confidence: sourceAppId && title ? 1 : 0.5,
  }
}

function normalizeMediaSessions(rawSessions) {
  if (!Array.isArray(rawSessions)) return []
  return rawSessions
    .map((session, index) => normalizeMediaSession(session, index))
    .filter(Boolean)
}

module.exports = { isOwnMediaSession, normalizeMediaSession, normalizeMediaSessions }
