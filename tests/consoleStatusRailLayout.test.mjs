import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('status rail keeps its three lines spaced inside the Card3D lift layer', () => {
  assert.match(css, /\.console-status-rail > \.card3d > \.card3d__lift\s*\{[\s\S]*display:\s*grid[\s\S]*gap:\s*4px/)
})
