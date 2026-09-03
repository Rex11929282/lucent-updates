const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')

test('desktop lyric lookup is gated by music and provider match confidence', () => {
  assert.match(main, /shouldResolveLyrics\(ticket\.identity\)/)
  assert.match(main, /selectBestTrackMatch\(ticket\.identity, results\)/)
  assert.doesNotMatch(main, /if \(bestScore < 2\) hit = results\[0\]/)
})
