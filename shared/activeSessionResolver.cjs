const MUSIC_SOURCE_RE = /cloudmusic|netease|spotify|youtube\s*music|youtubemusic|apple\s*music|musicbee|foobar|aimp|tidal|deezer|vlc/i
const RECENT_START_MS = 2500
const HISTORY_TTL_MS = 30000
const { trackIdentityKey } = require('./trackIdentity.cjs')

function isKnownMusicSource(session = {}) {
  return MUSIC_SOURCE_RE.test([
    session.sourceAppId,
    session.title,
    session.albumTitle,
  ].filter(Boolean).join(' '))
}

function metadataScore(session) {
  return (session.title ? 2 : 0)
    + (session.artist ? 1 : 0)
    + (session.albumTitle ? 1 : 0)
    + (Number(session.duration) > 0 ? 1 : 0)
}

function trackMarker(session = {}) {
  const explicitId = String(session.mediaId || session.trackId || session.songId || '').trim()
  if (explicitId) return `id:${explicitId}`
  return trackIdentityKey({
    name: session.title,
    artist: session.artist,
    album: session.albumTitle || session.album,
    durationMs: Number(session.duration) > 0 ? Number(session.duration) * 1000 : 0,
  })
}

function createActiveSessionResolver({ now = Date.now } = {}) {
  const history = new Map()
  let selectedId = ''

  function resolve(sessions, { manualSourceAppId = null } = {}) {
    const at = Number(now()) || Date.now()
    const entries = []

    for (const session of Array.isArray(sessions) ? sessions : []) {
      if (!session || !session.sessionId || (!session.title && !session.artist)) continue
      const id = String(session.sessionId)
      const previous = history.get(id)
      const playing = session.playing === true || session.playbackStatus === 'Playing'
      const position = Math.max(0, Number(session.position) || 0)
      const marker = trackMarker(session)
      // A player normally keeps one SMTC session for its whole lifetime. If
      // its title changes while it remains Playing, position may jump back to
      // zero without producing a paused -> playing edge. Treat that as a new
      // start so another stale Playing session cannot win the arbitration.
      const trackChanged = !!previous?.trackMarker && !!marker && previous.trackMarker !== marker
      const elapsed = previous ? at - previous.seenAt : 0
      const advancing = !!previous && playing && previous.playing
        && elapsed > 0 && elapsed <= 3000
        && position > previous.position + 0.15
      const startedAt = playing && (!previous?.playing || trackChanged)
        ? at
        : Number(previous?.startedAt) || 0
      const lastActiveAt = advancing || (playing && (!previous?.playing || trackChanged))
        ? at
        : Number(previous?.lastActiveAt) || 0
      const recentStart = playing && startedAt > 0 && at - startedAt <= RECENT_START_MS
      const activityTier = recentStart ? 5 : advancing ? 4 : playing ? 3 : session.paused ? 1 : 0
      const state = {
        session,
        id,
        playing,
        position,
        seenAt: at,
        trackMarker: marker,
        startedAt,
        lastActiveAt,
        activityTier,
        knownMusic: isKnownMusicSource(session),
        metadata: metadataScore(session),
      }
      history.set(id, state)
      entries.push(state)
    }

    for (const [id, state] of history) {
      if (at - state.seenAt > HISTORY_TTL_MS) history.delete(id)
    }

    const manual = manualSourceAppId
      ? entries.filter((entry) => entry.session.sourceAppId === manualSourceAppId)
      : []
    if (manual.length) {
      manual.sort(compareEntries)
      selectedId = manual[0].id
      return manual[0].session
    }

    const previous = entries.find((entry) => entry.id === selectedId)
    if (!entries.some((entry) => entry.playing) && previous) return previous.session

    entries.sort(compareEntries)
    const winner = entries[0] || null
    selectedId = winner?.id || ''
    return winner?.session || null

    function compareEntries(a, b) {
      return b.activityTier - a.activityTier
        || b.lastActiveAt - a.lastActiveAt
        || Number(b.knownMusic) - Number(a.knownMusic)
        || Number(b.id === selectedId) - Number(a.id === selectedId)
        || Number(b.session.confidence || 0) - Number(a.session.confidence || 0)
        || b.metadata - a.metadata
        || a.id.localeCompare(b.id)
    }
  }

  return {
    resolve,
    reset() {
      history.clear()
      selectedId = ''
    },
  }
}

module.exports = { createActiveSessionResolver, isKnownMusicSource }
