import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const shell = css.match(/\.console-shell\s*\{[\s\S]*?\n\}/)?.[0] || ''

test('console outer surface stays clean without a drop shadow', () => {
  assert.match(shell, /border-radius:\s*28px/)
  assert.doesNotMatch(shell, /box-shadow\s*:/)
})

test('long localized labels can wrap inside navigation and utility rows', () => {
  assert.match(css, /\.console-nav b,\s*\.console-nav small\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
  assert.match(css, /\.privacy-flags span\s*\{[\s\S]*white-space:\s*normal/)
  assert.match(css, /\.playlist-toolbar, \.playlist-target\s*\{[\s\S]*flex-wrap:\s*wrap/)
  assert.match(css, /\.playlist-toolbar \.playlist-select, \.playlist-target select\s*\{[\s\S]*flex:\s*1 1 180px/)
})
