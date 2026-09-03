import test from 'node:test'
import assert from 'node:assert/strict'

import * as audioSpectrum from '../src/audioSpectrum.js'

const {
  EMPTY_AUDIO_SPECTRUM,
  SPECTRUM_REPORT_INTERVAL_MS,
  compactSpectrum,
} = audioSpectrum

test('audio spectrum compacts real analyser bins into a bounded frame', () => {
  const frame = compactSpectrum(Uint8Array.from([0, 64, 128, 255]), 2, 7)

  assert.deepEqual(frame, {
    active: true,
    sequence: 7,
    bands: [0.125, 0.751],
  })
  assert.equal(SPECTRUM_REPORT_INTERVAL_MS, 1000 / 30)
})

test('audio spectrum has a stable silent fallback without invented energy', () => {
  assert.deepEqual(compactSpectrum(null, 12, 3), {
    ...EMPTY_AUDIO_SPECTRUM,
    sequence: 3,
  })
})

test('spectrum levels map real analyser bands to a bounded visual row', () => {
  assert.equal(typeof audioSpectrum.spectrumLevels, 'function')
  const { spectrumLevels } = audioSpectrum
  assert.deepEqual(spectrumLevels({ active: true, bands: [0, 1] }, 4, 0.5), [0.14, 0.14, 0.57, 0.57])
  assert.deepEqual(spectrumLevels(EMPTY_AUDIO_SPECTRUM, 4, 1), [0, 0, 0, 0])
})
