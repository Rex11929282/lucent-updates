import { positionMsOf } from './roomClockRuntime.js'

export function compactPlayerView(options = {}) {
  // Coerce explicitly instead of relying on default parameters: defaults only
  // apply to `undefined`, and useRoom starts its room state as `null`. Reading
  // `.source` off that null threw during render, and with no error boundary the
  // whole console went blank for anyone whose last page was "Play".
  const internalPlayer = options.internalPlayer || {}
  const roomState = options.roomState || {}
  const roomMode = options.roomMode || 'solo'

  const roomSource = roomMode === 'member'
    ? (roomState.originSource || roomState.source || 'room-host')
    : (roomState.source || '')
  const useSharedState = !!roomState.song
    && (roomMode === 'member' || (roomSource && roomSource !== 'internal-player'))

  if (!useSharedState) {
    return {
      ...internalPlayer,
      source: internalPlayer.source || 'internal-player',
      providerControllable: true,
    }
  }

  return {
    enabled: internalPlayer.enabled,
    song: roomState.song,
    playing: roomState.playing === true,
    positionMs: options.roomClock
      ? positionMsOf(options.roomClock, options.now)
      : Number(roomState.positionMs) || 0,
    durationMs: Number(roomState.durationMs || roomState.song.durationMs) || 0,
    loading: roomState.loading === true || roomState.song.loading === true,
    error: String(roomState.error || ''),
    queue: { length: 0, index: -1, hasPrevious: false, hasNext: false },
    source: roomSource || 'room-host',
    providerControllable: roomSource === 'internal-player',
  }
}
