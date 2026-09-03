export function initialSongTransition() {
  return { revision: 0, phase: 'idle', startedAt: 0 }
}

export function particleTransitionDuration(phase, speed = 1) {
  const safeSpeed = Math.max(0.5, Math.min(2, Number(speed) || 1))
  return (phase === 'shatter-out' ? 1000 : 1200) / safeSpeed
}

export function particleMotion(amount, rebuilding, rebuildDelay = 0, holding = false) {
  const progress = Math.max(0, Math.min(1, Number(amount) || 0))
  if (holding) {
    return { travel: 1, opacity: 0.18, radiusScale: 0.72 }
  }
  if (rebuilding) {
    const delay = Math.max(0, Math.min(0.55, Number(rebuildDelay) || 0))
    if (progress < delay) return { travel: 1, opacity: 0, radiusScale: 0.72 }
    const local = Math.max(0, Math.min(1, (progress - delay) / Math.max(0.001, 1 - delay)))
    const eased = local * local * (3 - 2 * local)
    const fade = local <= 0.72 ? 1 : 1 - (local - 0.72) / 0.28
    return {
      travel: 1 - eased,
      opacity: local === 0 ? 0.08 : Math.max(0, Math.min(1, (0.1 + local * 0.78) * fade)),
      radiusScale: 0.72 + (1 - local) * 0.22,
    }
  }
  const eased = Math.pow(progress, 1.35)
  return {
    travel: eased,
    opacity: 0.9 - eased * 0.85,
    radiusScale: 1 - eased * 0.28,
  }
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
  const total = Math.max(16, Math.min(128, Math.round(Number(count) || 16)))
  const columns = Math.ceil(Math.sqrt(total * safeWidth / safeHeight))
  const rows = Math.ceil(total / columns)
  const cellWidth = safeWidth / columns
  const cellHeight = safeHeight / rows
  const random = seededRandom(seed)
  const particles = []

  for (let index = 0; index < total; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    const w = Math.max(2, cellWidth * (0.48 + random() * 0.38))
    const h = Math.max(2, cellHeight * (0.48 + random() * 0.38))
    const x = Math.min(safeWidth - w, Math.max(0, column * cellWidth + random() * Math.max(0, cellWidth - w)))
    const y = Math.min(safeHeight - h, Math.max(0, row * cellHeight + random() * Math.max(0, cellHeight - h)))
    const centerX = x + w / 2
    const centerY = y + h / 2
    const angle = random() * Math.PI * 2
    const distance = 12 + random() * 38
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
      rebuildDelay: random() * 0.55,
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
    return { ...state, phase: 'idle' }
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

export function shouldHidePillDuringTransition(mode, phase) {
  return mode === 'shatter'
    && (phase === 'shatter-out' || phase === 'dormant' || phase === 'shatter-in')
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
