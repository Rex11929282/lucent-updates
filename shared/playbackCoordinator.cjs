const SOURCE = Object.freeze({
  DESKTOP: 'desktop-netease',
  INTERNAL: 'internal-player',
  ROOM_HOST: 'room-host',
  IDLE: 'idle',
})

function playbackTrackKey(snapshot = {}) {
  const song = snapshot.song || {}
  if (song.id != null && String(song.id)) return `id:${String(song.id)}`
  const normalize = (value) => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
  const name = normalize(song.name || song.title)
  const artist = normalize(song.artist)
  return name ? `meta:${name}|${artist}` : ''
}

function normalizeSnapshot(source, snapshot, now) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return {
    ...snapshot,
    song: snapshot.song ? { ...snapshot.song } : null,
    source,
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
    const desktop = sources.get(SOURCE.DESKTOP)
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
      if (!Object.values(SOURCE).includes(source) || source === SOURCE.IDLE) {
        throw new TypeError(`Unknown playback source: ${source}`)
      }
      const normalized = normalizeSnapshot(source, snapshot, now())
      if (normalized) sources.set(source, normalized)
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
        capturedAt: Number(clock.capturedAt) || now(),
      }
      sources.set(source, nextSource)
      if (playingChanged) return publish()
      if (selected?.source === source) {
        selected = {
          ...selected,
          positionMs: nextSource.positionMs,
          playing: nextSource.playing,
          capturedAt: nextSource.capturedAt,
        }
      }
      return selected
    },
    clear(source) {
      sources.delete(source)
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

module.exports = { SOURCE, createPlaybackCoordinator, playbackTrackKey }
