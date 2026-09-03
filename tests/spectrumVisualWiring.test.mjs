import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const capsule = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const consoleSource = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('only the progress bar keeps the real local-player spectrum visual', () => {
  assert.match(capsule, /audioSpectrumRef/)
  assert.match(capsule, /progress__spectrum/)
  assert.match(css, /\.progress\.prog-spectrum/)
  assert.doesNotMatch(capsule, /vinyl--spectrum/)
  assert.doesNotMatch(css, /\.vinyl-spectrum/)
})

test('appearance controls no longer offer an avatar spectrum ring', () => {
  assert.doesNotMatch(consoleSource, /vinylFrame === 'spectrum'/)
  assert.doesNotMatch(consoleSource, /spectrumSize/)
  assert.doesNotMatch(consoleSource, /spectrumAmplitude/)
})

test('renderer consumes analyser data only while the internal player is the selected source', () => {
  assert.match(appSource, /ov\.player\.onSpectrum/)
  assert.match(appSource, /roomState\?\.source === 'internal-player'/)
  assert.match(appSource, /audioSpectrumRef/)
})
