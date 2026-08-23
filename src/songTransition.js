export function initialSongTransition() {
  return { revision: 0, phase: 'idle', startedAt: 0 }
}

export function particleTransitionDuration(phase, speed = 1) {
  const safeSpeed = Math.max(0.5, Math.min(2, Number(speed) || 1))
  return (phase === 'shatter-out' ? 900 : 850) / safeSpeed
}

function seededRandom(seed) {
  let value = (Number(seed) || 1) >>> 0
  return () => {
    value += 0x6D2B79F5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function createShatterParticles({ width, height, seed, count = 16 }) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const total = Math.max(8, Math.min(72, Math.round(Number(count) || 16)))
  const columns = Math.ceil(Math.sqrt(total * safeWidth / safeHeight))
  const rows = Math.ceil(total / columns)
  const cellWidth = safeWidth / columns
  const cellHeight = safeHeight / rows
  const random = seededRandom(seed)
  const particles = []

  for (let index = 0; index < total; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = column * cellWidth
    const y = row * cellHeight
    const w = Math.min(cellWidth, safeWidth - x)
    const h = Math.min(cellHeight, safeHeight - y)
    const centerX = x + w / 2
    const centerY = y + h / 2
    const angle = Math.atan2(centerY - safeHeight / 2, centerX - safeWidth / 2)
      + (random() - 0.5) * 0.8
    const distance = 16 + random() * 34
    const inset = 8 + random() * 18
    const shape = [
      [random() * inset, random() * inset],
      [w - random() * inset, random() * inset],
      [w - random() * inset, h - random() * inset],
      [random() * inset, h - random() * inset],
    ]
    particles.push({
      x,
      y,
      w,
      h,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      rotation: (random() - 0.5) * 34,
      radius: Math.max(1.5, Math.min(w, h) * (0.18 + random() * 0.18)),
      shape,
    })
  }
  return particles
}

export function advanceSongTransition(state, event) {
  if (!event || !Number.isFinite(event.revision)) return state
  if (event.type !== 'song' && event.type !== 'end' && event.revision !== state.revision) return state
  if ((event.type === 'song' || event.type === 'end') && event.revision < state.revision) return state

  if (event.type === 'song') return { revision: event.revision, phase: 'collapse', startedAt: event.at }
  if (event.type === 'end') return { revision: event.revision, phase: 'capture-out', startedAt: event.at }
  if (event.type === 'collapsed' && state.phase === 'collapse') return { ...state, phase: 'hold' }
  if (event.type === 'ready' && (state.phase === 'collapse' || state.phase === 'hold')) return { ...state, phase: 'expand' }
  if (event.type === 'snapshot-ready' && state.phase === 'capture-out') return { ...state, phase: 'shatter-out' }
  if (event.type === 'snapshot-ready' && state.phase === 'capture-in') return { ...state, phase: 'shatter-in' }
  if (event.type === 'snapshot-failed' && (state.phase === 'capture-out' || state.phase === 'shatter-out')) {
    return { ...state, phase: 'dormant' }
  }
  if (event.type === 'snapshot-failed' && (state.phase === 'capture-in' || state.phase === 'shatter-in')) {
    return { ...state, phase: 'idle' }
  }
  if (event.type === 'out-finished' && state.phase === 'shatter-out') return { ...state, phase: 'dormant' }
  if (event.type === 'next-ready' && state.phase === 'dormant') return { ...state, phase: 'shatter-in' }
  if (event.type === 'finished' && (state.phase === 'expand' || state.phase === 'shatter-in')) {
    return { ...state, phase: 'idle' }
  }
  return state
}

export function isTransitionEffectsPaused(phase) {
  return phase === 'capture-out'
    || phase === 'shatter-out'
    || phase === 'dormant'
    || phase === 'capture-in'
    || phase === 'shatter-in'
}

export function shatterSnapshotForPhase(phase, stableSnapshot, liveSnapshot) {
  if (phase === 'collapse' || phase === 'hold' || phase === 'capture-out' || phase === 'shatter-out' || phase === 'dormant') {
    return stableSnapshot || liveSnapshot || null
  }
  if (phase === 'expand' || phase === 'capture-in' || phase === 'shatter-in') {
    return liveSnapshot || stableSnapshot || null
  }
  return null
}

export function visualForSongTransition(phase, stableVisual, liveVisual) {
  if ((phase === 'collapse' || phase === 'hold' || phase === 'capture-out' || phase === 'shatter-out' || phase === 'dormant') && stableVisual) {
    return stableVisual
  }
  return liveVisual
}
