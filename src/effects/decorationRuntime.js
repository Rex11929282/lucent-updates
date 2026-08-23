import {
  MAX_PARTICLES,
  resetParticle,
  stepParticle,
  targetParticleCount,
} from './decorativeParticles.js'

const BURST_FRAMES = 18
const BURST_PARTICLES = 12
const METEOR_SPAWNS_PER_SECOND = 20

export const PAUSED_PAINT_INTERVAL_MS = 200
export const ACTIVE_PAINT_INTERVAL_MS = 1000 / 30

function cappedDpr(value) {
  return Math.min(2, Math.max(1, Number.isFinite(value) ? value : 1))
}

export function createDecorationRuntime({
  canvas,
  context,
  readState,
  drawParticle,
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
  createObserver = (callback) => new ResizeObserver(callback),
  readDevicePixelRatio = () => globalThis.devicePixelRatio || 1,
}) {
  const bounds = { width: 0, height: 0 }
  const pool = Array.from({ length: MAX_PARTICLES }, () => ({ active: false }))
  const initialState = readState()
  let observedEventKey = initialState.eventKey
  let observedCfg = initialState.cfg
  let observer = null
  let frameId = 0
  let lastPaintTime = null
  let currentDpr = 0
  let burstFrames = 0
  let meteorSpawnBudget = 0
  let instantMeteorSpawns = initialState.cfg.decorationMode === 'meteor' ? 1 : 0
  let needsPaint = true
  let disposed = false

  const clearCanvas = () => {
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.restore()
  }

  const syncBackingStore = (rect, dpr = cappedDpr(readDevicePixelRatio())) => {
    if (rect) {
      bounds.width = Math.max(0, rect.width)
      bounds.height = Math.max(0, rect.height)
    }

    const pixelWidth = Math.round(bounds.width * dpr)
    const pixelHeight = Math.round(bounds.height * dpr)
    const changed = dpr !== currentDpr
      || canvas.width !== pixelWidth
      || canvas.height !== pixelHeight

    if (changed) {
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      currentDpr = dpr
      needsPaint = true
    }
    return changed
  }

  const stop = () => {
    if (disposed) return
    disposed = true
    if (frameId) cancelFrame(frameId)
    observer?.disconnect()
    clearCanvas()
  }

  if (!initialState.previewActive || initialState.cfg.decorationMode === 'none') {
    clearCanvas()
    return stop
  }

  syncBackingStore(canvas.getBoundingClientRect())
  observer = createObserver((entries) => {
    syncBackingStore(entries?.[0]?.contentRect || canvas.getBoundingClientRect())
  })
  observer.observe(canvas)

  const setActiveCount = (target, cfg, spawnElapsed) => {
    let activeCount = 0
    for (const particle of pool) {
      if (particle.active) activeCount += 1
    }

    if (activeCount > target) {
      for (let index = pool.length - 1; index >= 0 && activeCount > target; index -= 1) {
        if (!pool[index].active) continue
        pool[index].active = false
        activeCount -= 1
      }
      meteorSpawnBudget = 0
    } else if (activeCount < target && bounds.width > 0 && bounds.height > 0) {
      let spawnCount = target - activeCount
      if (cfg.decorationMode === 'meteor') {
        const spawnRate = Number.isFinite(cfg.meteorSpawnRate) ? Math.max(0, cfg.meteorSpawnRate) : 1
        meteorSpawnBudget += spawnElapsed * METEOR_SPAWNS_PER_SECOND * spawnRate
        const instantCount = Math.min(spawnCount, instantMeteorSpawns)
        const budgetCount = Math.min(spawnCount - instantCount, Math.floor(meteorSpawnBudget))
        instantMeteorSpawns -= instantCount
        meteorSpawnBudget -= budgetCount
        spawnCount = instantCount + budgetCount
      }

      for (const particle of pool) {
        if (spawnCount === 0) break
        if (particle.active) continue
        resetParticle(particle, cfg.decorationMode, bounds, cfg)
        activeCount += 1
        spawnCount -= 1
      }

      if (activeCount === target) meteorSpawnBudget = 0
    }
  }

  const scheduleNext = () => {
    frameId = requestFrame(render)
  }

  function render(time) {
    if (disposed) return

    const state = readState()
    const { cfg, playing, eventKey } = state
    if (cfg !== observedCfg) {
      observedCfg = cfg
      needsPaint = true
    }
    const nextDpr = cappedDpr(readDevicePixelRatio())
    if (nextDpr !== currentDpr) syncBackingStore(null, nextDpr)

    if (eventKey !== observedEventKey) {
      observedEventKey = eventKey
      needsPaint = true
      if (playing && cfg.decorationMode === 'meteor' && cfg.meteorBurstOnLine) {
        burstFrames = BURST_FRAMES
        instantMeteorSpawns += BURST_PARTICLES
      }
    }

    const paintInterval = playing ? ACTIVE_PAINT_INTERVAL_MS : PAUSED_PAINT_INTERVAL_MS
    const cadenceDue = lastPaintTime === null || time - lastPaintTime >= paintInterval
    if (!needsPaint && !cadenceDue) {
      scheduleNext()
      return
    }

    const spawnElapsed = lastPaintTime === null
      ? 0
      : Math.min(1, Math.max(0, (time - lastPaintTime) / 1000))
    const elapsed = Math.min(0.05, spawnElapsed)
    const burst = playing && burstFrames > 0
      ? Math.ceil(BURST_PARTICLES * burstFrames / BURST_FRAMES)
      : 0

    setActiveCount(targetParticleCount(cfg, burst), cfg, spawnElapsed)
    clearCanvas()
    for (const particle of pool) {
      if (!particle.active) continue
      if (playing && !stepParticle(particle, elapsed, bounds, cfg)) {
        resetParticle(particle, cfg.decorationMode, bounds, cfg)
      }
      drawParticle(context, particle, cfg)
    }

    if (playing && burstFrames > 0) burstFrames -= 1
    lastPaintTime = time
    needsPaint = false
    scheduleNext()
  }

  scheduleNext()
  return stop
}
