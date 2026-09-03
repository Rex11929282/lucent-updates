import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('console interaction intensity is saved and exposes complete, subtle, and off modes', () => {
  assert.match(source, /label className="row"[\s\S]{0,600}>\{t\('settings\.consoleMotion'\)\}/)
  assert.match(source, /value=\{consoleState\.motion \|\| 'full'\}/)
  assert.match(source, /updateConsole\(\{ motion: e\.target\.value \}\)/)
  for (const mode of ['full', 'subtle', 'off']) {
    assert.match(source, new RegExp(`<option value="${mode}">`))
  }
  assert.match(source, /attachRipples\(shellRef\.current, motion === 'full'\)/)
})
