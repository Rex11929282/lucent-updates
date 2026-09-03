const { SOURCE, isDesktopSource, isPlaybackSource } = require('./playbackSource.cjs')
const { trackIdentityKey } = require('./trackIdentity.cjs')

const EMPTY_LINES = Object.freeze([])
const EMPTY_TRANSITION = Object.freeze({ token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0 })

function playbackTrackKey(snapshot = {}) {
  const song = snapshot.song || {}
  return trackIdentityKey(song)
}

function normalizePlaybackState(source, snapshot, now = Date.now()) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const rawSong = snapshot.song && typeof snapshot.song === 'object' ? snapshot.song : null
  const durationMs = Math.max(0, Number(snapshot.durationMs ?? rawSong?.durationMs) || 0)
  const playing = snapshot.playing === true
  const originSource = source === SOURCE.ROOM_HOST
    ? (snapshot.originSource || snapshot.source || SOURCE.ROOM_HOST)
    : (snapshot.originSource || source)
  return {
    ...snapshot,
    source,
    originSource,
    sourceAppId: String(snapshot.sourceAppId || ''),
    sessionId: String(snapshot.sessionId || ''),
    song: rawSong ? {
      ...rawSong,
      name: String(rawSong.name || rawSong.title || ''),
      title: String(rawSong.title || rawSong.name || ''),
      artist: String(rawSong.artist || ''),
      album: String(rawSong.album || ''),
      cover: String(rawSong.cover || ''),
      artistImageUrl: String(rawSong.artistImageUrl || rawSong.avatar || ''),
      avatar: String(rawSong.avatar || ''),
      durationMs,
    } : null,
    lines: Array.isArray(snapshot.lines) ? snapshot.lines : EMPTY_LINES,
    timed: snapshot.timed === true,
    positionMs: Math.max(0, Number(snapshot.positionMs) || 0),
    durationMs,
    playing,
    paused: !playing,
    playbackStatus: playing ? 'Playing' : 'Paused',
    mirror: snapshot.mirror || null,
    syncStatus: String(snapshot.syncStatus || (source === SOURCE.INTERNAL ? 'timeline' : 'idle')),
    transition: snapshot.transition || EMPTY_TRANSITION,
    loading: snapshot.loading === true || rawSong?.loading === true,
    error: String(snapshot.error || ''),
    capturedAt: Number(snapshot.capturedAt) || now,
  }
}

function songStateKey(song = {}) {
  return [
    song.id ?? '',
    song.name ?? song.title ?? '',
    song.artist ?? '',
    song.album ?? '',
    song.cover ?? '',
    song.artistImageUrl ?? '',
    song.avatar ?? '',
    song.durationMs ?? 0,
    song.revision ?? 0,
    song.loading === true ? 1 : 0,
    song.artworkReady === false ? 0 : 1,
  ].join('|')
}

function sameSelection(a, b) {
  if (!a || !b) return a === b
  return a.source === b.source
    && a.trackKey === b.trackKey
    && songStateKey(a.song) === songStateKey(b.song)
    && Number(a.positionMs || 0) === Number(b.positionMs || 0)
    && !!a.playing === !!b.playing
    && a.mirror === b.mirror
    && a.lines === b.lines
    && a.transition === b.transition
}

function createPlaybackCoordinator({ now = Date.now } = {}) {
  const sources = new Map()
  const listeners = new Set()
  let mode = null
  let selected = null

  function choose() {
    if (mode === 'member') return sources.get(SOURCE.ROOM_HOST) || null
    const desktop = [...sources.entries()].find(([source]) => isDesktopSource(source))?.[1] || null
    const internal = sources.get(SOURCE.INTERNAL)
    if (desktop?.playing) return desktop
    if (internal?.playing) return internal
    if (desktop && internal) {
      return Number(internal.capturedAt || 0) > Number(desktop.capturedAt || 0)
        ? internal
        : desktop
    }
    return desktop || internal || null
  }

  function publish() {
    const candidate = choose()
    const previous = selected
    let next = candidate

    if (candidate) {
      const trackKey = playbackTrackKey(candidate)
      const sameTrack = !!previous && !!trackKey && previous.trackKey === trackKey
      next = {
        ...candidate,
        song: candidate.song
          ? {
              ...candidate.song,
              revision: sameTrack
                ? previous.song?.revision
                : candidate.song.revision,
            }
          : null,
        trackKey,
        sourceChanged: !!previous && previous.source !== candidate.source,
      }
    }

    if (sameSelection(previous, next)) return selected
    selected = next
    for (const listener of listeners) listener(selected)
    return selected
  }

  return {
    setMode(nextMode) {
      mode = nextMode === 'member' || nextMode === 'host' ? nextMode : null
      return publish()
    },
    update(source, snapshot) {
      if (!isPlaybackSource(source)) {
        throw new TypeError(`Unknown playback source: ${source}`)
      }
      const normalized = normalizePlaybackState(source, snapshot, now())
      if (normalized) {
        if (isDesktopSource(source)) {
          for (const key of sources.keys()) if (isDesktopSource(key) && key !== source) sources.delete(key)
        }
        sources.set(source, normalized)
      }
      else sources.delete(source)
      return publish()
    },
    updateClock(source, clock = {}) {
      const currentSource = sources.get(source)
      if (!currentSource) return selected
      const nextPlaying = typeof clock.playing === 'boolean' ? clock.playing : !!currentSource.playing
      const playingChanged = nextPlaying !== !!currentSource.playing
      const nextSource = {
        ...currentSource,
        positionMs: Number.isFinite(Number(clock.positionMs))
          ? Math.max(0, Number(clock.positionMs))
          : Number(currentSource.positionMs || 0),
        playing: nextPlaying,
        paused: !nextPlaying,
        playbackStatus: nextPlaying ? 'Playing' : 'Paused',
        capturedAt: Number(clock.capturedAt) || now(),
      }
      sources.set(source, nextSource)
      if (playingChanged) return publish()
      if (selected?.source === source) {
        selected = {
          ...selected,
          positionMs: nextSource.positionMs,
          playing: nextSource.playing,
          paused: nextSource.paused,
          playbackStatus: nextSource.playbackStatus,
          capturedAt: nextSource.capturedAt,
        }
      }
      return selected
    },
    clear(source) {
      sources.delete(source)
      return publish()
    },
    clearDesktop() {
      for (const source of sources.keys()) if (isDesktopSource(source)) sources.delete(source)
      return publish()
    },
    current() {
      return selected
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

module.exports = { SOURCE, createPlaybackCoordinator, normalizePlaybackState, playbackTrackKey }
