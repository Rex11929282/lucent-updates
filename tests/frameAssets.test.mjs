import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import schema from '../shared/defaults.json' with { type: 'json' }
import { VINYL_FRAMES, findVinylFrame } from '../src/frameAssets.js'

test('schema provides spacing and vinyl frame defaults', () => {
  assert.equal(schema.cfg.lyricTranslationGap, 7)
  assert.equal(schema.cfg.translationProgressGap, 7)
  assert.equal('pillFrame' in schema.cfg, false)
  assert.equal(schema.cfg.vinylFrame, 'none')
  assert.equal(schema.cfg.songNamePos, 'tl')
})

test('vinyl frame manifest keeps circular assets as contained images', () => {
  assert.equal(VINYL_FRAMES[0].id, 'none')
  for (const frame of VINYL_FRAMES.slice(1)) {
    assert.match(frame.url, /^\.\/frames\/vinyl\/.+\.png$/)
    assert.equal(typeof frame.coverScale, 'number')
    assert.ok(frame.coverScale >= 0.4 && frame.coverScale <= 0.8)
  }
  assert.equal(findVinylFrame('missing').id, 'none')
})

test('vinyl artwork fills each measured frame opening without a dark gap', () => {
  assert.deepEqual(
    Object.fromEntries(VINYL_FRAMES.slice(1).map((frame) => [frame.id, frame.coverScale])),
    { hologram: 0.75, wood: 0.74, celestial: 0.69 },
  )
})

test('noise uses a stable standalone layer outside the blurred material', async () => {
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(capsule, /className="noise-layer"/)
  assert.doesNotMatch(css, /\.has-noise\s+\.bglayer::after/)
  assert.doesNotMatch(css, /repeating-conic-gradient/)
  assert.match(css, /\.noise-layer[\s\S]*?background-image:/)
  assert.doesNotMatch(css, /\.noise-layer[\s\S]*?mix-blend-mode/)
  assert.doesNotMatch(css, /feTurbulence/)
  assert.match(css, /\.noise-layer[\s\S]*?repeating-radial-gradient/)
})

test('retired pill frames are absent from config, UI, and renderer', async () => {
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  const consoleSource = await readFile(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  const assets = await readFile(new URL('../src/frameAssets.js', import.meta.url), 'utf8')
  assert.doesNotMatch(capsule, /pillFrame|pill-frame|frame-safe/)
  assert.doesNotMatch(consoleSource, /pillFrame|PILL_FRAMES|藥丸外框/)
  assert.doesNotMatch(assets, /PILL_FRAMES|findPillFrame|pillFrameMetrics/)
})

test('selecting a vinyl frame replaces the default record surface instead of covering it', async () => {
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(capsule, /'--vinyl-cover-scale':\s*vinylFrame\.coverScale/)
  assert.match(capsule, /className="vinyl__art vinyl__art--default"/)
  assert.match(capsule, /className="vinyl__art vinyl__art--framed"/)
  assert.match(css, /\.vinyl--framed \.vinyl__ring,\s*\.vinyl--framed \.vinyl__disc,\s*\.vinyl--framed \.vinyl__art--default\s*\{\s*display:\s*none/)
  assert.match(css, /\.vinyl__art--framed[\s\S]*?width:\s*calc\(var\(--vinyl-cover-scale, 0\.5\) \* 100%\)/)
  assert.match(css, /\.vinyl--framed \.vinyl-frame[\s\S]*?z-index:\s*2/)
  assert.doesNotMatch(css, /\.vinyl\.spin \.vinyl-frame/)
})

test('no vinyl frame preserves the default record branch', async () => {
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  assert.equal(findVinylFrame('none').url, '')
  assert.match(capsule, /const hasCustomVinylFrame = !!vinylFrame\.url/)
  assert.match(capsule, /hasCustomVinylFrame \? 'vinyl--framed' : ''/)
  assert.match(capsule, /\{hasCustomVinylFrame \? \(/)
})
