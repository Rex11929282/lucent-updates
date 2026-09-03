const test = require('node:test')
const assert = require('node:assert/strict')

const { createRoomClock } = require('../shared/roomClock.cjs')

test('clock chooses the lowest RTT sample for the host time estimate', () => {
  let now = 0
  const clock = createRoomClock({ now: () => now })
  clock.observePong({ sentAt: 0, hostReceivedAt: 80, hostSentAt: 80, receivedAt: 200 })
  clock.observePong({ sentAt: 300, hostReceivedAt: 380, hostSentAt: 380, receivedAt: 380 })
  now = 500
  assert.equal(clock.hostNow(), 540)
  assert.deepEqual(clock.snapshot(), { rttMs: 80, offsetMs: 40 })
})

test('clock preserves a large offset and reset discards previous samples', () => {
  let now = 1000
  const clock = createRoomClock({ now: () => now })
  clock.observePong({ sentAt: 0, hostReceivedAt: 1000, hostSentAt: 1000, receivedAt: 0 })
  assert.equal(clock.hostNow(), 2000)
  clock.reset()
  assert.equal(clock.hostNow(), 1000)
  assert.deepEqual(clock.snapshot(), { rttMs: null, offsetMs: 0 })
})

test('clock retains the full offset between independently started computers', () => {
  let now = 200000
  const clock = createRoomClock({ now: () => now })
  clock.observePong({ sentAt: 200000, hostReceivedAt: 5050, hostSentAt: 5050, receivedAt: 200100 })
  assert.equal(clock.hostNow(), 5000)
})
