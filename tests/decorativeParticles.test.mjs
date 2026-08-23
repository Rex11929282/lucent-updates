import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DECORATION_DEFAULTS,
  normalizeDecorationConfig,
} from '../src/appearanceModel.js'
import * as decorativeParticles from '../src/effects/decorativeParticles.js'

const {
  MAX_PARTICLES,
  createParticle,
  resetParticle,
  stepParticle,
  targetParticleCount,
} = decorativeParticles

const fixed = () => 0.5
const bounds = { width: 320, height: 96 }
const defaults = normalizeDecorationConfig(DECORATION_DEFAULTS)

function sequence(values) {
  let index = 0
  const rng = () => {
    assert.ok(index < values.length, 'RNG sequence exhausted')
    const value = values[index++]
    rng.calls = index
    return value
  }
  rng.calls = 0
  return rng
}

function assertMeteorEntry(particle, particleBounds, edge, message) {
  switch (edge) {
    case 'top':
      assert.equal(particle.y, -particle.length, message)
      assert.ok(particle.x >= 0 && particle.x <= particleBounds.width, message)
      return
    case 'bottom':
      assert.equal(particle.y, particleBounds.height + particle.length, message)
      assert.ok(particle.x >= 0 && particle.x <= particleBounds.width, message)
      return
    case 'left':
      assert.equal(particle.x, -particle.length, message)
      assert.ok(particle.y >= 0 && particle.y <= particleBounds.height, message)
      return
    case 'right':
      assert.equal(particle.x, particleBounds.width + particle.length, message)
      assert.ok(particle.y >= 0 && particle.y <= particleBounds.height, message)
      return
    default:
      assert.fail(`Unknown meteor entry edge: ${edge}`)
  }
}

test('裝飾正規化不保留未知設定', () => {
  const cfg = normalizeDecorationConfig({ decorationMode: 'snow', decorationCount: 12, auroraPower: 1 })

  assert.equal(cfg.decorationMode, 'snow')
  assert.equal(cfg.decorationCount, 12)
  assert.equal('auroraPower' in cfg, false)
})

test('meteor has a core, trail, and directional velocity', () => {
  const particle = createParticle('meteor', bounds, defaults, fixed)

  assert.equal(particle.kind, 'meteor')
  assert.ok(particle.length > 0)
  assert.ok(particle.vx > 0)
  assert.ok(particle.vy > 0)
})

test('meteor edge softness produces different gradient, cap, and blur parameters', () => {
  assert.equal(typeof decorativeParticles.meteorDrawStyle, 'function')

  const hard = decorativeParticles.meteorDrawStyle({ meteorEdgeSoftness: 0 })
  const soft = decorativeParticles.meteorDrawStyle({ meteorEdgeSoftness: 1 })

  assert.equal(hard.lineCap, 'butt')
  assert.equal(soft.lineCap, 'round')
  assert.ok(soft.tailFadeStop > hard.tailFadeStop)
  assert.ok(soft.tailBlurScale > hard.tailBlurScale)
})

test('sakura rotates and sways while snow declares its shape', () => {
  const petal = createParticle('sakura', bounds, defaults, fixed)
  const snow = createParticle('snow', bounds, defaults, fixed)

  assert.equal(petal.kind, 'sakura')
  assert.ok(Number.isFinite(petal.rotationSpeed))
  assert.ok(['dot', 'crystal'].includes(snow.shape))
})

test('particles recycle after leaving the pill bounding rectangle', () => {
  const particle = {
    kind: 'snow',
    x: 20,
    y: 95,
    size: 4,
    vx: 0,
    vy: 400,
    age: 1,
    phase: 0,
  }

  assert.ok(particle.y <= bounds.height + particle.size)
  assert.equal(stepParticle(particle, 0.016, bounds, defaults), false)
  assert.ok(particle.y > bounds.height + particle.size)
  assert.ok(Number.isFinite(particle.rotation))
})

test('resetParticle reuses its object and targetParticleCount caps the pool', () => {
  const particle = { stale: true }
  const reset = resetParticle(particle, 'meteor', bounds, defaults, fixed)

  assert.equal(reset, particle)
  assert.equal(particle.kind, 'meteor')
  assert.equal(targetParticleCount({ decorationCount: 79 }, 4), MAX_PARTICLES)
  assert.equal(targetParticleCount({ decorationCount: -2 }, 0), 0)
})

test('none resets to an inactive, non-drawable particle and has no target count', () => {
  const disabled = resetParticle({ kind: 'meteor', size: 4 }, 'none', bounds, defaults, fixed)
  const fromCreate = createParticle('none', bounds, defaults, fixed)

  assert.equal(disabled.kind, 'none')
  assert.equal(disabled.active, false)
  assert.equal(disabled.shape, null)
  assert.equal(disabled.size, 0)
  assert.equal(disabled.length, 0)
  assert.equal(disabled.vx, 0)
  assert.equal(disabled.vy, 0)
  assert.equal(stepParticle(disabled, 0.016, bounds, defaults), false)
  assert.equal(fromCreate.active, false)
  assert.equal(targetParticleCount({ decorationMode: 'none', decorationCount: 18 }, 80), 0)
})

test('pooled particles clear mode-specific state across meteor, sakura, and snow', () => {
  const particle = createParticle('meteor', bounds, defaults, fixed)
  const identity = particle

  assert.equal(resetParticle(particle, 'sakura', bounds, defaults, fixed), identity)
  assert.equal(particle.kind, 'sakura')
  assert.equal(particle.shape, 'petal')
  assert.equal(particle.length, 0)
  assert.equal(particle.trailLength, 0)
  assert.equal(particle.coreBrightness, 0)
  assert.ok(particle.sway > 0)

  assert.equal(resetParticle(particle, 'snow', bounds, defaults, fixed), identity)
  assert.equal(particle.kind, 'snow')
  assert.equal(particle.shape, 'dot')
  assert.equal(particle.length, 0)
  assert.equal(particle.trailLength, 0)
  assert.equal(particle.coreBrightness, 0)
  assert.equal(particle.sway, 0)
  assert.equal(particle.rotationSpeed, 0)
  assert.ok(particle.drift > 0)
})

test('meteor directions use normalized velocities with the expected signs', () => {
  const directions = [
    ['left', -1, 0],
    ['right', 1, 0],
    ['down-left', -1, 1],
    ['down-right', 1, 1],
  ]

  for (const [meteorDirection, xSign, ySign] of directions) {
    const particle = createParticle('meteor', bounds, { ...defaults, meteorDirection }, fixed)

    assert.equal(Math.sign(particle.vx), xSign, meteorDirection)
    assert.equal(Math.sign(particle.vy), ySign, meteorDirection)
    assert.ok(Math.abs(Math.hypot(particle.vx, particle.vy) - 90) < 1e-9, meteorDirection)
  }
})

test('meteor resets vary their direction-aware entry positions', () => {
  const cases = [
    ['down-right', [0.5, 0.1, 0.2, 0.5, 0.9, 0.8], (first, second) => {
      assert.equal(first.y, -first.length)
      assert.equal(first.x, 64)
      assert.equal(second.x, -second.length)
      assert.equal(second.y, 0.8 * bounds.height)
    }],
    ['down-left', [0.5, 0.1, 0.2, 0.5, 0.9, 0.8], (first, second) => {
      assert.equal(first.y, -first.length)
      assert.equal(first.x, 64)
      assert.equal(second.x, bounds.width + second.length)
      assert.equal(second.y, 0.8 * bounds.height)
    }],
    ['right', [0.5, 0.2, 0.5, 0.8], (first, second) => {
      assert.equal(first.x, -first.length)
      assert.equal(second.x, -second.length)
      assert.equal(first.y, 0.2 * bounds.height)
      assert.equal(second.y, 0.8 * bounds.height)
    }],
    ['left', [0.5, 0.2, 0.5, 0.8], (first, second) => {
      assert.equal(first.x, bounds.width + first.length)
      assert.equal(second.x, bounds.width + second.length)
      assert.equal(first.y, 0.2 * bounds.height)
      assert.equal(second.y, 0.8 * bounds.height)
    }],
  ]

  for (const [meteorDirection, values, assertEntry] of cases) {
    const particle = {}
    const rng = sequence(values)
    const cfg = { ...defaults, meteorDirection }

    resetParticle(particle, 'meteor', bounds, cfg, rng)
    const first = { x: particle.x, y: particle.y, length: particle.length }
    resetParticle(particle, 'meteor', bounds, cfg, rng)
    const second = { x: particle.x, y: particle.y, length: particle.length }

    assert.notDeepEqual(
      [first.x, first.y],
      [second.x, second.y],
      `${meteorDirection} should not repeat its start point`,
    )
    assertEntry(first, second)
  }
})

test('random meteor direction consumes RNG before choosing its matching entry edge', () => {
  const particle = createParticle(
    'meteor',
    bounds,
    { ...defaults, meteorDirection: 'random' },
    sequence([0, 0.5, 0.1, 0.2]),
  )

  assert.equal(particle.vx > 0, true)
  assert.equal(particle.vy > 0, true)
  assert.equal(particle.y, -particle.length)
  assert.equal(particle.x, 64)
})

test('meteor starts stay outside and vary across extreme bounds and long tails', () => {
  const geometries = [
    ['narrow tall', { width: 7, height: 401 }, 34],
    ['wide short', { width: 701, height: 3 }, 34],
    ['tiny', { width: 1, height: 1 }, 12],
    ['tail larger than bounds', { width: 16, height: 7 }, 60],
  ]
  const directions = [
    ['down-right', 'top', 'x', [0.5, 0.1, 0.2, 0.5, 0.1, 0.8]],
    ['down-left', 'top', 'x', [0.5, 0.1, 0.2, 0.5, 0.1, 0.8]],
    ['up-right', 'bottom', 'x', [0.5, 0.1, 0.2, 0.5, 0.1, 0.8]],
    ['up-left', 'bottom', 'x', [0.5, 0.1, 0.2, 0.5, 0.1, 0.8]],
    ['right', 'left', 'y', [0.5, 0.2, 0.5, 0.8]],
    ['left', 'right', 'y', [0.5, 0.2, 0.5, 0.8]],
  ]

  for (const [geometryName, particleBounds, meteorLength] of geometries) {
    for (const [meteorDirection, edge, varyingCoordinate, values] of directions) {
      const rng = sequence(values)
      const cfg = { ...defaults, meteorDirection, meteorLength }
      const particle = {}

      resetParticle(particle, 'meteor', particleBounds, cfg, rng)
      const first = { ...particle }
      resetParticle(particle, 'meteor', particleBounds, cfg, rng)
      const second = { ...particle }

      assertMeteorEntry(first, particleBounds, edge, `${geometryName} ${meteorDirection} first reset`)
      assertMeteorEntry(second, particleBounds, edge, `${geometryName} ${meteorDirection} second reset`)
      assert.notEqual(
        first[varyingCoordinate],
        second[varyingCoordinate],
        `${geometryName} ${meteorDirection} should vary along its ${edge} edge`,
      )
      assert.equal(rng.calls, values.length, `${geometryName} ${meteorDirection} RNG calls`)
    }
  }
})

test('same diagonal entry edge gets a fresh position on consecutive resets', () => {
  const rng = sequence([0.5, 0.1, 0.2, 0.5, 0.1, 0.8])
  const particle = {}
  const cfg = { ...defaults, meteorDirection: 'down-right' }

  resetParticle(particle, 'meteor', bounds, cfg, rng)
  const firstX = particle.x
  assertMeteorEntry(particle, bounds, 'top', 'first diagonal reset')
  resetParticle(particle, 'meteor', bounds, cfg, rng)

  assertMeteorEntry(particle, bounds, 'top', 'second diagonal reset')
  assert.notEqual(particle.x, firstX)
  assert.equal(rng.calls, 6)
})

test('random meteor mode maps every selected direction to its entry edge and velocity', () => {
  const cases = [
    ['down-right', 0.01, 'top', 1, 1, [0.01, 0.5, 0.1, 0.25]],
    ['down-left', 0.18, 'top', -1, 1, [0.18, 0.5, 0.1, 0.25]],
    ['up-right', 0.34, 'bottom', 1, -1, [0.34, 0.5, 0.1, 0.25]],
    ['up-left', 0.51, 'bottom', -1, -1, [0.51, 0.5, 0.1, 0.25]],
    ['right', 0.68, 'left', 1, 0, [0.68, 0.5, 0.25]],
    ['left', 0.85, 'right', -1, 0, [0.85, 0.5, 0.25]],
  ]

  for (const [direction, , edge, xSign, ySign, values] of cases) {
    const rng = sequence(values)
    const particle = createParticle('meteor', bounds, { ...defaults, meteorDirection: 'random' }, rng)

    assertMeteorEntry(particle, bounds, edge, direction)
    assert.equal(Math.sign(particle.vx), xSign, direction)
    assert.equal(Math.sign(particle.vy), ySign, direction)
    assert.equal(rng.calls, values.length, `${direction} RNG calls`)
  }
})

test('long-tail meteors recycle after leaving every entry edge', () => {
  const particleBounds = { width: 13, height: 5 }
  const meteorLength = 80
  const cases = [
    ['down-right', 'top', [0.5, 0.1, 0.3]],
    ['down-left', 'right', [0.5, 0.9, 0.3]],
    ['up-right', 'left', [0.5, 0.9, 0.3]],
    ['up-left', 'bottom', [0.5, 0.1, 0.3]],
    ['right', 'left', [0.5, 0.3]],
    ['left', 'right', [0.5, 0.3]],
  ]

  for (const [meteorDirection, edge, values] of cases) {
    const particle = createParticle(
      'meteor',
      particleBounds,
      { ...defaults, meteorDirection, meteorLength },
      sequence(values),
    )

    assertMeteorEntry(particle, particleBounds, edge, meteorDirection)
    assert.equal(stepParticle(particle, 10, particleBounds, defaults), false, meteorDirection)
  }
})

test('meteor reset consumes only the direction, speed, edge, and position RNG values', () => {
  const cases = [
    ['fixed diagonal', { ...defaults, meteorDirection: 'down-right' }, [0.5, 0.1, 0.2], 3],
    ['fixed horizontal', { ...defaults, meteorDirection: 'right' }, [0.5, 0.2], 2],
    ['random diagonal', { ...defaults, meteorDirection: 'random' }, [0.01, 0.5, 0.1, 0.2], 4],
    ['random horizontal', { ...defaults, meteorDirection: 'random' }, [0.85, 0.5, 0.2], 3],
  ]

  for (const [name, cfg, values, expectedCalls] of cases) {
    const rng = sequence(values)
    const particle = createParticle('meteor', bounds, cfg, rng)

    assert.equal(rng.calls, expectedCalls, name)
    stepParticle(particle, 0.016, bounds, cfg)
    assert.equal(rng.calls, expectedCalls, `${name} should not consume RNG per frame`)
  }
})
