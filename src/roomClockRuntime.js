export function applyScheduledState(current, incoming, hostNow) {
  return Number.isFinite(Number(incoming?.effectiveAtMs)) && Number(hostNow) < Number(incoming.effectiveAtMs)
    ? current
    : incoming
}

export function positionMsOf(clock, now = performance.now()) {
  if (!clock) return 0
  const at = Number.isFinite(Number(clock.hostAtMs)) ? Number(clock.hostAtMs) : Number(clock.at)
  return clock.playing ? clock.positionMs + Math.max(0, now - at) : clock.positionMs
}

export function shouldScheduleVisualTick({ hasRoomSong, roomPlaying, localPlaying }) {
  return hasRoomSong ? !!roomPlaying : !!localPlaying
}
