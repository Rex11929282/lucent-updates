import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const capsule = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
const consoleUi = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('non-RGB progress accepts a saved custom played colour while RGB keeps ownership of its palette', () => {
  assert.match(capsule, /'--bar-fill-c': cfg\.barFillColor \|\| '#ffffff'/)
  assert.match(css, /\.progress__fill\s*\{[^}]*background:\s*var\(--bar-fill-c,#ffffff\)/s)
  assert.match(css, /\.progress__segment\.played\s*\{[^}]*background:\s*var\(--bar-fill-c,#ffffff\)/s)
  assert.match(consoleUi, /ui\.look\.progress\.fillColor/)
  assert.match(consoleUi, /!cfg\.rgbBar &&/)
})
