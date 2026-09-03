import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import * as appearance from '../src/appearanceModel.js'

const capsule = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const consoleSource = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('ocean fill follows the bounded real playback ratio and never invents progress', () => {
  assert.equal(typeof appearance.oceanWaveLevel, 'function')
  assert.equal(appearance.oceanWaveLevel(-1), 0)
  assert.equal(appearance.oceanWaveLevel(0.42), 0.42)
  assert.equal(appearance.oceanWaveLevel(2), 1)
  assert.equal(appearance.oceanWaveLevel(undefined), 0)
})

test('ocean material is clipped inside the pill and is controlled from material settings', () => {
  assert.match(capsule, /oceanCanvasRef/)
  assert.match(capsule, /ocean-wave/)
  assert.match(capsule, /--ocean-level/)
  assert.match(css, /\.ocean-wave/)
  assert.match(css, /\.ocean-wave__fill/)
  assert.match(css, /\.ocean-wave__canvas/)
  assert.doesNotMatch(capsule, /ocean-wave__sheet/)
  assert.match(consoleSource, /t\('ui\.look\.background\.waveTitle'\)/)
})

test('ocean level is painted by the shared visual frame without a competing CSS transition', () => {
  const fillRule = css.slice(css.indexOf('.ocean-wave__fill'), css.indexOf('.ocean-wave__canvas'))
  assert.doesNotMatch(fillRule, /transition:\s*transform/)
  assert.match(capsule, /requestAnimationFrame\(paint\)/)
  assert.match(capsule, /ocean-wave__ripple/)
})
