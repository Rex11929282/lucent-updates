import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('room cards preserve their layout inside the Card3D content wrapper', () => {
  for (const variant of ['live', 'host', 'join']) {
    assert.match(source, new RegExp(`<Card3D className="room-card room-card--${variant}">`))
  }
  assert.match(css, /\.room-card > \.card3d__lift\s*\{[\s\S]*display:\s*grid[\s\S]*gap:\s*12px/)
  assert.match(css, /\.room-card > \.card3d__lift > header\s*\{[\s\S]*display:\s*flex/)
})
