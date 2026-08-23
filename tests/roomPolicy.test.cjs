const test = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_MEMBER_CAPABILITIES,
  canExecuteRoomCommand,
  createCommandDeduper,
  createRequestLimiter,
  normalizeCapabilities,
} = require('../shared/roomPolicy.cjs')

test('ordinary members may request songs but cannot control playback or manage queue', () => {
  assert.deepEqual(DEFAULT_MEMBER_CAPABILITIES, {
    'song.request': true,
    'queue.manage': false,
    'playback.control': false,
  })
  assert.equal(canExecuteRoomCommand('member', DEFAULT_MEMBER_CAPABILITIES, 'song.request'), true)
  assert.equal(canExecuteRoomCommand('member', DEFAULT_MEMBER_CAPABILITIES, 'queue.remove'), false)
  assert.equal(canExecuteRoomCommand('member', DEFAULT_MEMBER_CAPABILITIES, 'playback.pause'), false)
  assert.equal(canExecuteRoomCommand('host', {}, 'playback.load'), true)
})

test('capabilities are allowlisted and may be revoked immediately', () => {
  const granted = normalizeCapabilities({ 'song.request': true, 'queue.manage': true, 'playback.control': true, admin: true })
  assert.deepEqual(granted, { 'song.request': true, 'queue.manage': true, 'playback.control': true })
  assert.equal(canExecuteRoomCommand('member', granted, 'queue.move'), true)
  assert.equal(canExecuteRoomCommand('member', granted, 'playback.seek'), true)
  const revoked = normalizeCapabilities({ 'song.request': true })
  assert.equal(canExecuteRoomCommand('member', revoked, 'playback.seek'), false)
})

test('command ids execute exactly once with bounded memory', () => {
  const dedupe = createCommandDeduper(2)
  assert.equal(dedupe.accept('a'), true)
  assert.equal(dedupe.accept('a'), false)
  assert.equal(dedupe.accept('b'), true)
  assert.equal(dedupe.accept('c'), true)
  assert.equal(dedupe.accept('a'), true)
})

test('song requests are rate-limited and capped by pending count', () => {
  let now = 1000
  const limiter = createRequestLimiter({ now: () => now, windowMs: 10000, maxPerWindow: 3, maxPending: 5 })
  assert.equal(limiter.check('member-1', 0).ok, true)
  assert.equal(limiter.check('member-1', 1).ok, true)
  assert.equal(limiter.check('member-1', 2).ok, true)
  assert.match(limiter.check('member-1', 3).error, /太頻繁/)
  now += 10001
  assert.match(limiter.check('member-1', 5).error, /尚未處理/)
  assert.equal(limiter.check('member-1', 4).ok, true)
})
