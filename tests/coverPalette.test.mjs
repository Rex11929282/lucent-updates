import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fallbackCoverPalette, mixPaletteColor, paletteFromPixels } from '../src/coverPalette.js'

test('palette keeps saturated cover colours and rejects blank pixels', () => {
  const pixels = new Uint8ClampedArray([
    20, 140, 250, 255, 20, 140, 250, 255,
    245, 65, 150, 255, 245, 65, 150, 255,
    255, 255, 255, 255, 4, 4, 4, 255,
    120, 120, 120, 255, 0, 0, 0, 0,
  ])
  const palette = paletteFromPixels(pixels)
  assert.equal(palette.length, 3)
  assert.ok(palette.some((color) => color.includes('20, 140, 250')))
  assert.ok(palette.some((color) => color.includes('245, 65, 150')))
})

test('palette fallback and colour mix stay bounded and deterministic', () => {
  assert.equal(fallbackCoverPalette().length, 3)
  assert.equal(mixPaletteColor('rgb(0, 0, 0)', 'rgb(255, 100, 50)', 0.5), 'rgb(128, 50, 25)')
  assert.equal(mixPaletteColor('rgb(0, 0, 0)', 'rgb(255, 100, 50)', 2), 'rgb(255, 100, 50)')
})

test('Capsule uses the contrast-safe cover palette for flowing lyrics', () => {
  const source = fs.readFileSync(path.resolve('src/components/Capsule.jsx'), 'utf8')
  assert.match(source, /import \{ paletteFromPixels \} from '\.\.\/coverPalette\.js'/)
  assert.match(source, /setCoverColors\(paletteFromPixels\(d\)\)/)
})
