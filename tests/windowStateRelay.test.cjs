const test = require('node:test')
const assert = require('node:assert/strict')
const { createWindowStateRelay } = require('../shared/windowStateRelay.cjs')

test('a console opened after playback starts receives the latest state and detection info', () => {
  const relay = createWindowStateRelay()
  const sent = []

  relay.remember('room:state', { song: { id: 'track-1' }, playing: true })
  relay.remember('np:info', { matched: true, current: { title: 'Track 1' } })
  relay.replay((channel, payload) => sent.push([channel, payload]))

  assert.deepEqual(sent, [
    ['room:state', { song: { id: 'track-1' }, playing: true }],
    ['np:info', { matched: true, current: { title: 'Track 1' } }],
  ])
})

test('a later empty playback snapshot is replayed instead of reviving an old song', () => {
  const relay = createWindowStateRelay()
  const sent = []

  relay.remember('room:state', { song: { id: 'old-track' }, playing: false })
  relay.remember('room:state', null)
  relay.replay((channel, payload) => sent.push([channel, payload]))

  assert.deepEqual(sent, [['room:state', null]])
})
