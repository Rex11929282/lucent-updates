function createInternalPlayerState() {
  return {
    revision: 0,
    trackId: null,
    song: null,
    lines: [],
    timed: false,
    positionMs: 0,
    durationMs: 0,
    playing: false,
    loading: false,
    assetsReady: false,
    urlRetryCount: 0,
    error: '',
    transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0 },
  }
}

function validNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : fallback
}

function reduceInternalPlayer(state = createInternalPlayerState(), event = {}) {
  if (event.type === 'load-start') {
    const revision = Number(event.revision) || 0
    if (revision <= Number(state.revision || 0)) return state
    const provisional = event.song
      ? {
          ...event.song,
          cover: '',
          avatar: '',
          loading: true,
          artworkReady: false,
          revision,
        }
      : null
    return {
      ...createInternalPlayerState(),
      revision,
      trackId: event.trackId == null ? null : String(event.trackId),
      song: provisional,
      loading: true,
      transition: state.transition || createInternalPlayerState().transition,
    }
  }

  if (!event.type || Number(event.revision) !== Number(state.revision) || !state.revision) return state

  if (event.type === 'load-ready') {
    const song = event.song ? { ...event.song, revision: state.revision } : null
    return {
      ...state,
      song,
      lines: Array.isArray(event.lines) ? event.lines : [],
      timed: !!event.timed,
      durationMs: validNumber(song?.durationMs, state.durationMs),
      loading: false,
      assetsReady: event.assetsReady !== false,
      error: '',
    }
  }

  if (event.type === 'playing') {
    const canRebuild = Number(state.transition?.token) > 0
      && Number(state.transition?.endedSongRevision) !== Number(state.revision)
      && state.assetsReady
    return {
      ...state,
      playing: true,
      loading: false,
      positionMs: validNumber(event.positionMs, state.positionMs),
      durationMs: validNumber(event.durationMs, state.durationMs),
      error: '',
      transition: canRebuild
        ? { ...state.transition, readySongRevision: state.revision }
        : state.transition,
    }
  }

  if (event.type === 'pause') {
    return {
      ...state,
      playing: false,
      positionMs: validNumber(event.positionMs, state.positionMs),
      durationMs: validNumber(event.durationMs, state.durationMs),
    }
  }

  if (event.type === 'ended') {
    const alreadyEnded = Number(state.transition?.endedSongRevision) === Number(state.revision)
    return {
      ...state,
      playing: false,
      positionMs: validNumber(event.positionMs, state.positionMs),
      durationMs: validNumber(event.durationMs, state.durationMs),
      transition: alreadyEnded
        ? state.transition
        : {
            token: Number(state.transition?.token || 0) + 1,
            endedSongRevision: state.revision,
            endedSongId: state.song?.id == null ? null : String(state.song.id),
            readySongRevision: 0,
          },
    }
  }

  if (event.type === 'time') {
    return {
      ...state,
      positionMs: validNumber(event.positionMs, state.positionMs),
      durationMs: validNumber(event.durationMs, state.durationMs),
    }
  }

  if (event.type === 'error') {
    return {
      ...state,
      playing: false,
      loading: false,
      error: String(event.message || '歌曲目前無法播放').slice(0, 160),
      urlRetryCount: Math.max(0, Number(event.retryCount) || 0),
    }
  }

  return state
}

function internalSnapshot(state = createInternalPlayerState()) {
  return {
    song: state.song ? { ...state.song, artworkReady: state.assetsReady } : null,
    lines: state.lines,
    timed: state.timed,
    positionMs: state.positionMs,
    playing: state.playing,
    mirror: null,
    transition: state.transition,
    loading: state.loading,
    error: state.error,
    capturedAt: Date.now(),
  }
}

module.exports = { createInternalPlayerState, reduceInternalPlayer, internalSnapshot }
