export const MAX_PARTICLES = 80

const METEOR_DIRECTIONS = ['down-right', 'down-left', 'up-right', 'up-left', 'right', 'left']

function number(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function meteorDrawStyle(cfg = {}) {
  const softness = Math.min(1, Math.max(0, number(cfg.meteorEdgeSoftness, 0.5)))
  return {
    lineCap: softness < 0.15 ? 'butt' : 'round',
    tailFadeStop: softness * 0.65,
    tailBlurScale: 0.25 + softness * 1.25,
  }
}

function meteorDirection(direction) {
  const diagonal = Math.SQRT1_2
  switch (direction) {
    case 'left':
      return [-1, 0]
    case 'right':
      return [1, 0]
    case 'down-left':
      return [-diagonal, diagonal]
    case 'up-right':
      return [diagonal, -diagonal]
    case 'up-left':
      return [-diagonal, -diagonal]
    default:
      return [diagonal, diagonal]
  }
}

function randomMeteorDirection(direction, rng) {
  if (direction !== 'random') return direction
  return METEOR_DIRECTIONS[Math.floor(rng() * METEOR_DIRECTIONS.length)]
}

function meteorEntryPoint(direction, bounds, length, rng) {
  switch (direction) {
    case 'down-right':
      return rng() < 0.5 ? [rng() * bounds.width, -length] : [-length, rng() * bounds.height]
    case 'down-left':
      return rng() < 0.5
        ? [rng() * bounds.width, -length]
        : [bounds.width + length, rng() * bounds.height]
    case 'up-right':
      return rng() < 0.5
        ? [rng() * bounds.width, bounds.height + length]
        : [-length, rng() * bounds.height]
    case 'up-left':
      return rng() < 0.5
        ? [rng() * bounds.width, bounds.height + length]
        : [bounds.width + length, rng() * bounds.height]
    case 'right':
      return [-length, rng() * bounds.height]
    case 'left':
      return [bounds.width + length, rng() * bounds.height]
    default:
      return [rng() * bounds.width, -length]
  }
}

function resetMeteor(particle, bounds, cfg, rng) {
  const direction = randomMeteorDirection(cfg.meteorDirection, rng)
  const [directionX, directionY] = meteorDirection(direction)
  const length = Math.max(1, number(cfg.meteorLength, 34))
  const width = Math.max(0.1, number(cfg.meteorWidth, 1.6))
  const variance = number(cfg.meteorSpeedVariance, 0.25)
  const speed = 90 * (1 + ((rng() * 2) - 1) * variance)
  const [x, y] = meteorEntryPoint(direction, bounds, length, rng)

  particle.kind = 'meteor'
  particle.active = true
  particle.shape = 'line'
  particle.size = width
  particle.length = length
  particle.x = x
  particle.y = y
  particle.vx = directionX * speed
  particle.vy = directionY * speed
  particle.age = 0
  particle.phase = 0
  particle.rotation = 0
  particle.rotationSpeed = 0
  particle.sway = 0
  particle.drift = 0
  particle.trailLength = number(cfg.meteorTrailLength, 0.75)
  particle.trailAlpha = number(cfg.meteorTrailAlpha, 0.55)
  particle.coreBrightness = number(cfg.meteorCoreBrightness, 1.2)
  return particle
}

function resetSakura(particle, bounds, cfg, rng) {
  const size = Math.max(1, number(cfg.sakuraSize, 8))
  const depth = number(cfg.sakuraDepth, 0.55)

  particle.kind = 'sakura'
  particle.active = true
  particle.shape = 'petal'
  particle.size = size
  particle.length = 0
  particle.x = rng() * bounds.width
  particle.y = -size
  particle.vx = number(cfg.sakuraWind, 0.15) * 30
  particle.vy = 24 * (1 + (rng() - 0.5) * depth)
  particle.age = 0
  particle.phase = rng() * Math.PI * 2
  particle.rotation = rng() * Math.PI * 2
  particle.rotationSpeed = (rng() * 2 - 1) * number(cfg.sakuraRotation, 1)
  particle.sway = number(cfg.sakuraSway, 0.7) * 16
  particle.drift = 0
  particle.trailLength = 0
  particle.trailAlpha = 0
  particle.coreBrightness = 0
  return particle
}

function resetSnow(particle, bounds, cfg, rng) {
  const size = Math.max(1, number(cfg.snowSize, 5))

  particle.kind = 'snow'
  particle.active = true
  particle.shape = rng() < number(cfg.snowCrystalRatio, 0.18) ? 'crystal' : 'dot'
  particle.size = size
  particle.length = 0
  particle.x = rng() * bounds.width
  particle.y = -size
  particle.vx = number(cfg.snowWind, 0) * 30
  particle.vy = 18 * (0.75 + rng() * 0.5)
  particle.age = 0
  particle.phase = rng() * Math.PI * 2
  particle.rotation = 0
  particle.rotationSpeed = 0
  particle.sway = 0
  particle.drift = number(cfg.snowDrift, 0.5) * 10
  particle.trailLength = 0
  particle.trailAlpha = 0
  particle.coreBrightness = 0
  return particle
}

function resetDisabled(particle) {
  particle.kind = 'none'
  particle.active = false
  particle.shape = null
  particle.size = 0
  particle.length = 0
  particle.x = 0
  particle.y = 0
  particle.vx = 0
  particle.vy = 0
  particle.age = 0
  particle.phase = 0
  particle.rotation = 0
  particle.rotationSpeed = 0
  particle.sway = 0
  particle.drift = 0
  particle.trailLength = 0
  particle.trailAlpha = 0
  particle.coreBrightness = 0
  return particle
}

export function createParticle(mode, bounds, cfg, rng = Math.random) {
  return resetParticle({}, mode, bounds, cfg, rng)
}

export function resetParticle(particle, mode, bounds, cfg, rng = Math.random) {
  if (mode === 'none') return resetDisabled(particle)
  if (mode === 'meteor') return resetMeteor(particle, bounds, cfg, rng)
  if (mode === 'sakura') return resetSakura(particle, bounds, cfg, rng)
  return resetSnow(particle, bounds, cfg, rng)
}

export function stepParticle(particle, dt, bounds, cfg) {
  if (particle.active === false || particle.kind === 'none') return false

  const elapsed = Math.max(0, number(dt, 0))
  const speed = number(cfg.decorationSpeed, 1)

  particle.age += elapsed
  if (particle.kind === 'meteor') {
    particle.x += particle.vx * elapsed * speed
    particle.y += particle.vy * elapsed * speed
  } else {
    const motion = number(particle.kind === 'sakura' ? particle.sway : particle.drift, 0)
    particle.x += (particle.vx + Math.sin(particle.age + particle.phase) * motion) * elapsed * speed
    particle.y += particle.vy * elapsed * speed
    particle.rotation = number(particle.rotation, 0)
      + number(particle.rotationSpeed, 0) * elapsed * speed
  }

  const extent = particle.kind === 'meteor' ? particle.length : particle.size
  return particle.x >= -extent
    && particle.x <= bounds.width + extent
    && particle.y >= -extent
    && particle.y <= bounds.height + extent
}

export function targetParticleCount(cfg, burst = 0) {
  if (cfg?.decorationMode === 'none') return 0
  const count = number(cfg?.decorationCount, 0) + number(burst, 0)
  return Math.max(0, Math.min(MAX_PARTICLES, Math.round(count)))
}
