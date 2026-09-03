const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const provider = fs.readFileSync(path.join(__dirname, '..', 'electron', 'netease.cjs'), 'utf8')

test('provider caches track metadata and artist images instead of reloading every poll', () => {
  assert.match(provider, /createAsyncResourceCache/)
  assert.match(provider, /songDetailCache\.get/)
  assert.match(provider, /artistImageCache\.get/)
  assert.match(provider, /safeArtworkUrl/)
})
