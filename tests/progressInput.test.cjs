const test = require('node:test')
const assert = require('node:assert/strict')

const { selectPlaybackProgress } = require('../shared/progressInput.cjs')

test('a fresh player event wins when an unrelated range reports zero', () => {
  assert.equal(selectPlaybackProgress([
    { value: 0, max: 100 },
    { value: 0, max: 120 },
  ], 119.4, 120), 119.4)
})

test('the serialized playback selector does not depend on Node module closures', () => {
  const browserSelector = Function(`return (${selectPlaybackProgress.toString()})`)()
  assert.equal(browserSelector([{ value: 0, max: 120 }], 119.4, 120), 119.4)
})
