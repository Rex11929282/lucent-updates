import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pauseBreathActive } from '../src/pauseBreath.js'

test('pause breath runs only for an enabled ordinary pause', () => {
  assert.equal(pauseBreathActive({ enabled: true, playing: false, effectsPaused: false }), true)
  assert.equal(pauseBreathActive({ enabled: true, playing: true, effectsPaused: false }), false)
  assert.equal(pauseBreathActive({ enabled: true, playing: false, effectsPaused: true }), false)
  assert.equal(pauseBreathActive({ enabled: false, playing: false, effectsPaused: false }), false)
})

test('pause breath animates only the stable content composition layer', () => {
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(styles, /\.fx-pausebreath \.content-shell\s*\{[\s\S]*?animation:\s*pausebreath 3\.2s/)
  assert.doesNotMatch(styles, /\.fx-pausebreath \.glass, \.fx-pausebreath \.plain/)
})
