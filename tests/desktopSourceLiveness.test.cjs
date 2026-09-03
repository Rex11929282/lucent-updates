const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  DESKTOP_SOURCE_GRACE_MS,
  desktopSourceDisposition,
} = require('../shared/desktopSourceLiveness.cjs')

test('desktop NetEase is retained during a brief detection interruption, then cleared after two seconds', () => {
  assert.equal(DESKTOP_SOURCE_GRACE_MS, 2000)
  assert.equal(desktopSourceDisposition({ now: 10_000, lastDetectedAt: 8_001 }), 'retain')
  assert.equal(desktopSourceDisposition({ now: 10_000, lastDetectedAt: 8_000 }), 'clear')
})

test('a never-detected desktop source is already idle', () => {
  assert.equal(desktopSourceDisposition({ now: 10_000, lastDetectedAt: 0 }), 'clear')
})

test('an empty bootstrap desktop selection cannot reset a host room', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.match(main, /const selectedPlayback = playback\.current\(\)/)
  assert.match(main, /const hadDesktopState = !!np\.song\s*\|\|\s*!!np\.mirror\s*\|\|\s*!!clk\.at\s*\|\|\s*\(isDesktopSource\(selectedPlayback\?\.source\) && !!selectedPlayback\.song\)/)
})
