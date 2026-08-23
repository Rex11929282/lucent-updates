import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import * as songTransition from '../src/songTransition.js'
import schema from '../shared/defaults.json' with { type: 'json' }

const {
  advanceSongTransition,
  createShatterParticles,
  initialSongTransition,
  isTransitionEffectsPaused,
  particleTransitionDuration,
  shatterSnapshotForPhase,
} = songTransition

test('song transition stays in place through collapse hold expand and idle', () => {
  let state = initialSongTransition()
  state = advanceSongTransition(state, { type: 'song', revision: 1, at: 100 })
  assert.equal(state.phase, 'collapse')
  state = advanceSongTransition(state, { type: 'collapsed', revision: 1, at: 320 })
  assert.equal(state.phase, 'hold')
  state = advanceSongTransition(state, { type: 'ready', revision: 1, at: 400 })
  assert.equal(state.phase, 'expand')
  state = advanceSongTransition(state, { type: 'finished', revision: 1, at: 760 })
  assert.equal(state.phase, 'idle')
})

test('stale song transition events cannot overwrite a newer song', () => {
  const current = advanceSongTransition(initialSongTransition(), { type: 'song', revision: 3, at: 100 })
  const stale = advanceSongTransition(current, { type: 'ready', revision: 2, at: 200 })
  assert.deepEqual(stale, current)
})

test('new song cancels the previous transition revision', () => {
  const old = advanceSongTransition(initialSongTransition(), { type: 'song', revision: 1, at: 100 })
  const next = advanceSongTransition(old, { type: 'song', revision: 2, at: 150 })
  assert.equal(next.phase, 'collapse')
  assert.equal(next.revision, 2)
  assert.equal(next.startedAt, 150)
})

test('shatter keeps the old visual through collapse and hold, then captures the new visual for expansion', () => {
  const oldSurface = { label: 'old song' }
  const loadingSurface = { label: 'loading placeholder' }
  const newSurface = { label: 'new song' }

  assert.equal(shatterSnapshotForPhase('collapse', oldSurface, loadingSurface), oldSurface)
  assert.equal(shatterSnapshotForPhase('hold', oldSurface, loadingSurface), oldSurface)
  assert.equal(shatterSnapshotForPhase('expand', oldSurface, newSurface), newSurface)
})

test('particle shatter stays scattered until the next song is ready, then rebuilds without a second capture', () => {
  let state = initialSongTransition()
  state = advanceSongTransition(state, { type: 'end', revision: 4, at: 10 })
  assert.equal(state.phase, 'capture-out')
  state = advanceSongTransition(state, { type: 'snapshot-ready', revision: 4, at: 20 })
  assert.equal(state.phase, 'shatter-out')
  state = advanceSongTransition(state, { type: 'out-finished', revision: 4, at: 200 })
  assert.equal(state.phase, 'dormant')
  state = advanceSongTransition(state, { type: 'next-ready', revision: 4, at: 220 })
  assert.equal(state.phase, 'shatter-in')
  state = advanceSongTransition(state, { type: 'finished', revision: 4, at: 500 })
  assert.equal(state.phase, 'idle')
})

test('particle layouts are finite, clipped to their source and differ by seed', () => {
  const first = createShatterParticles({ width: 320, height: 92, seed: 1, count: 16 })
  const second = createShatterParticles({ width: 320, height: 92, seed: 2, count: 16 })
  const capped = createShatterParticles({ width: 320, height: 92, seed: 3, count: 200 })
  assert.equal(first.length, 16)
  assert.equal(capped.length, 72)
  assert.notDeepEqual(first, second)
  assert.ok(first.every((particle) => (
    particle.x >= 0 && particle.y >= 0
      && particle.x + particle.w <= 320
      && particle.y + particle.h <= 92
      && Number.isFinite(particle.dx)
      && Number.isFinite(particle.dy)
      && Number.isFinite(particle.rotation)
      && Number.isFinite(particle.radius)
      && particle.radius > 0
      && Array.isArray(particle.shape)
  )))
  assert.equal(isTransitionEffectsPaused('shatter-out'), true)
  assert.equal(isTransitionEffectsPaused('dormant'), true)
  assert.equal(isTransitionEffectsPaused('shatter-in'), true)
  assert.equal(isTransitionEffectsPaused('idle'), false)
})

test('particle shatter drifts apart and rebuilds slowly while respecting transition speed', () => {
  assert.equal(particleTransitionDuration('shatter-out', 1), 900)
  assert.equal(particleTransitionDuration('shatter-in', 1), 850)
  assert.equal(particleTransitionDuration('shatter-out', 2), 450)
  assert.equal(particleTransitionDuration('shatter-in', 0.5), 1700)
})

test('a failed screenshot never leaves shatter hidden forever', () => {
  let state = advanceSongTransition(initialSongTransition(), { type: 'end', revision: 5, at: 10 })
  state = advanceSongTransition(state, { type: 'snapshot-failed', revision: 5, at: 20 })
  assert.equal(state.phase, 'dormant')
  state = advanceSongTransition(state, { type: 'next-ready', revision: 5, at: 30 })
  state = advanceSongTransition(state, { type: 'snapshot-failed', revision: 5, at: 40 })
  assert.equal(state.phase, 'idle')
})

test('transition keeps the last ready visual until the new song is ready to expand', () => {
  const oldVisual = { line: 'old lyric' }
  const loadingVisual = { line: '♪' }
  const newVisual = { line: 'new lyric' }

  assert.equal(typeof songTransition.visualForSongTransition, 'function')
  assert.equal(songTransition.visualForSongTransition('collapse', oldVisual, loadingVisual), oldVisual)
  assert.equal(songTransition.visualForSongTransition('hold', oldVisual, loadingVisual), oldVisual)
  assert.equal(songTransition.visualForSongTransition('expand', oldVisual, newVisual), newVisual)
})

test('a new revision restarts transition state while one canvas survives its particle phases', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const transition = await readFile(new URL('../src/components/SongTransitionLayer.jsx', import.meta.url), 'utf8')
  assert.match(app, /transitionWrapRef/)
  assert.match(app, /el\.classList\.remove\('transition-run'\)/)
  assert.match(app, /void el\.offsetWidth/)
  assert.match(app, /el\.classList\.add\('transition-run'\)/)
  assert.match(transition, /function SongTransitionLayer\(/)
  assert.match(transition, /key=\{revision\}/)
})

test('expand owns its completion timer so the hold effect cannot cancel it early', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const holdGate = app.indexOf("songTransition.phase !== 'hold'")
  const expandGate = app.indexOf("songTransition.phase !== 'expand'")
  const finished = app.indexOf("type: 'finished'")

  assert.ok(holdGate >= 0)
  assert.ok(expandGate > holdGate)
  assert.ok(finished > expandGate)
})

test('the first detected song does not play a replacement transition from the empty state', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /!songKey \|\| songKey === 'none'/)
})

test('schema provides shaped sheen and in-place song transition defaults', () => {
  assert.equal(schema.cfg.songTransitionMode, 'collapse')
  assert.equal(schema.cfg.sheenMode, 'none')
  assert.equal(schema.cfg.sheenWidth, 34)
  assert.equal(schema.cfg.sheenHeight, 140)
  assert.equal(schema.cfg.sheenInterval, 6)
})

test('transition and sheen layers do not move the BrowserWindow', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const transition = await readFile(new URL('../src/components/SongTransitionLayer.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app + transition, /setPosition\s*\(/)
  assert.match(transition, /song-transition-layer/)
})

test('only Capsule owns overlay window sizing so hover transforms cannot resize the window', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /ov\.setSize\s*\(/)
  assert.doesNotMatch(capsule, /getBoundingClientRect\s*\(/)
})

test('shatter uses one crop canvas instead of cloning the complete pill DOM', async () => {
  const transition = await readFile(new URL('../src/components/SongTransitionLayer.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

  assert.match(transition, /<canvas/)
  assert.match(transition, /ov\.capturePill/)
  assert.match(transition, /createShatterParticles/)
  assert.match(transition, /phase === 'dormant'/)
  assert.match(transition, /context\.arc\(/)
  assert.doesNotMatch(transition, /phase !== 'capture-in'/)
  assert.doesNotMatch(transition, /context\.clip\(\)/)
  assert.doesNotMatch(transition, /cloneNode/)
  assert.doesNotMatch(transition, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(transition, /SHATTER_PARTICLES/)
  assert.match(css, /\.glass:has\(\.content--shatter-hidden\)/)
  assert.match(css, /\.song-transition-layer/)
})

test('LiquidGlass auxiliary direct layers are suppressed without hiding the actual glass surface', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.capsule\s*>\s*\.bg-black\.pointer-events-none/)
  assert.match(css, /\.capsule\s*>\s*\.mix-blend-overlay\.pointer-events-none/)
  assert.match(css, /\.capsule\s+\.glass/)
})
