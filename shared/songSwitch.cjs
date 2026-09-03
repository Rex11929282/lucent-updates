const { trackIdentityKey } = require('./trackIdentity.cjs')

function cleanSongId(value) {
  const match = String(value || '').match(/^(\d+)/)
  return match && match[1] !== '0' ? match[1] : null
}

function playbackStateToPlaying(value) {
  const tokens = String(value || '').toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (tokens.some((token) => ['pause', 'paused', 'stop', 'stopped'].includes(token))) return false
  if (tokens.some((token) => ['play', 'playing', 'resume', 'resumed'].includes(token))) return true
  return null
}

function resolveCdpPlaying({ playState, lastProgressAt = 0, now = Date.now(), progressGraceMs = 1500 } = {}) {
  const explicit = playbackStateToPlaying(playState)
  if (explicit !== null) return explicit
  const last = Number(lastProgressAt)
  return Number.isFinite(last) && last > 0 && Number(now) - last < progressGraceMs
}

function currentPlaybackSongId({
  progressSongId, progressAt = 0, stateSongId, playState, stateAt = 0, requestSongId,
} = {}) {
  const progress = cleanSongId(progressSongId)
  const state = cleanSongId(stateSongId) || cleanSongId(playState)
  if (progress && state) return stateAt > progressAt ? state : progress
  return progress || state || cleanSongId(requestSongId)
}

function normalizeCdpSnapshot(raw = {}) {
  const liveSongId = currentPlaybackSongId({ ...raw, requestSongId: null })
  const songId = liveSongId || currentPlaybackSongId(raw)
  const snapshot = { ...raw }
  if (raw.lyric) snapshot.lyric = { ...raw.lyric, songId: cleanSongId(raw.requestSongId) }
  if (songId) snapshot.songId = songId
  snapshot.songIdSource = liveSongId ? 'playback' : 'request'
  return snapshot
}

function songIdentityKey(song = {}) {
  return trackIdentityKey({ ...song, id: cleanSongId(song.id) })
}

function canTrustCdpSongIdentity({ identity, isNeteaseSource = false, cdpConnected = false, cdpFresh = false } = {}) {
  return isNeteaseSource === true
    && cdpConnected === true
    && cdpFresh === true
    && identity?.source === 'cdp'
    && !!cleanSongId(identity.id)
}

function mirrorBelongsToSong(activeSongId, lyricSongId) {
  const active = cleanSongId(activeSongId)
  const lyric = cleanSongId(lyricSongId)
  return !!active && active === lyric
}

function mirrorSyncDisposition({ activeSongId, lyric } = {}) {
  if (!activeSongId || !lyric?.songId) return 'waiting-identity'
  if (!lyric.main) return 'no-precise-data'
  if (!mirrorBelongsToSong(activeSongId, lyric.songId)) return 'waiting-identity'
  return 'exact'
}

function shouldProcessMirrorSnapshot(snapshot = {}) {
  return Object.hasOwn(snapshot, 'lyric')
}

function isFreshMirrorSnapshot(previous = {}, incoming = {}) {
  const previousAt = Number(previous.capturedAt)
  const incomingAt = Number(incoming.capturedAt)
  const previousSeq = Number(previous.seq)
  const incomingSeq = Number(incoming.seq)
  const hasPreviousAt = Number.isFinite(previousAt) && previousAt > 0
  const hasIncomingAt = Number.isFinite(incomingAt) && incomingAt > 0
  const hasPreviousSeq = Number.isFinite(previousSeq) && previousSeq > 0
  const hasIncomingSeq = Number.isFinite(incomingSeq) && incomingSeq > 0

  if (hasPreviousAt && hasIncomingAt) {
    if (incomingAt !== previousAt) return incomingAt > previousAt
    if (hasPreviousSeq && hasIncomingSeq) return incomingSeq >= previousSeq
    return true
  }
  if (hasPreviousSeq && hasIncomingSeq) return incomingSeq >= previousSeq
  return true
}

function mapNeteaseSongDetail(song) {
  if (!song) return null
  const artists = song.ar || song.artists || []
  return {
    id: song.id,
    name: song.name || '',
    artist: artists.map((artist) => artist.name).filter(Boolean).join(', '),
    artistId: artists[0]?.id || null,
    album: song.al?.name || song.album?.name || '',
    cover: song.al?.picUrl || song.album?.picUrl || '',
    durationMs: song.dt || song.duration || 0,
  }
}

function createSongRevision() {
  let value = 0
  let active = null
  return {
    begin(identity) {
      active = {
        revision: ++value,
        key: songIdentityKey(identity),
        identity: { ...identity },
      }
      return active
    },
    promote(ticket, identity) {
      if (!ticket || ticket !== active) return null
      const id = cleanSongId(identity?.id)
      if (!id) return active
      const next = { ...active.identity, ...identity, id }
      active.key = songIdentityKey(next)
      active.identity = next
      return active
    },
    current() { return active },
    isCurrent(ticket) {
      return !!ticket && !!active
        && ticket.revision === active.revision
        && ticket.key === active.key
    },
  }
}

module.exports = {
  cleanSongId,
  createSongRevision,
  currentPlaybackSongId,
  isFreshMirrorSnapshot,
  mapNeteaseSongDetail,
  mirrorBelongsToSong,
  mirrorSyncDisposition,
  shouldProcessMirrorSnapshot,
  normalizeCdpSnapshot,
  playbackStateToPlaying,
  resolveCdpPlaying,
  songIdentityKey,
  canTrustCdpSongIdentity,
}
