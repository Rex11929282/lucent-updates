import test from 'node:test'
import assert from 'node:assert/strict'

import { createOceanWaveState, stepOceanWave } from '../src/oceanWavePhysics.js'

test('ocean wave phase advances continuously while playback is active', () => {
  const state = createOceanWaveState(0.3)
  stepOceanWave(state, { level: 0.3, seconds: 0.4, speed: 1, playing: true })
  const first = state.phase
  stepOceanWave(state, { level: 0.3, seconds: 0.4, speed: 1, playing: true })

  assert.ok(first > 0)
  assert.ok(state.phase > first)
})

test('ocean wave freezes when playback is paused and anchors a real seek immediately', () => {
  const state = createOceanWaveState(0.2)
  stepOceanWave(state, { level: 0.2, seconds: 0.5, speed: 1, playing: true })
  const phase = state.phase
  stepOceanWave(state, { level: 0.2, seconds: 0.5, speed: 1, playing: false })
  assert.equal(state.phase, phase)

  stepOceanWave(state, { level: 0.85, seconds: 0.016, speed: 1, playing: true })
  assert.equal(state.surface, 0.85)
})
