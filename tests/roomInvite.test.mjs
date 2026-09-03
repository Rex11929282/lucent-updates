import test from 'node:test'
import assert from 'node:assert/strict'

import { formatRoomInvite, mergeRecentMembers, nextLocalizedDefault } from '../src/roomInvite.js'

test('room invite contains the host address and optional room code', () => {
  assert.equal(
    formatRoomInvite({ roomName: '我的房間', ip: '26.233.18.34', port: 8787, code: '1234' }),
    '璃音 Lucent 邀請\n房間：我的房間\n位址：26.233.18.34:8787\n房號：1234',
  )
})

test('room invite labels follow the active UI language', () => {
  assert.equal(
    formatRoomInvite(
      { roomName: 'Friday room', ip: '192.168.1.8', port: 8787, code: '9001' },
      { title: 'Lucent invite', room: 'Room', address: 'Address', code: 'Room code', separator: ': ' },
    ),
    'Lucent invite\nRoom: Friday room\nAddress: 192.168.1.8:8787\nRoom code: 9001',
  )
})

test('runtime language switching updates untouched defaults but preserves user input', () => {
  assert.equal(nextLocalizedDefault('我的房間', '我的房間', 'My room'), 'My room')
  assert.equal(nextLocalizedDefault('Friday room', '我的房間', 'My room'), 'Friday room')
})

test('recent members are deduplicated by IP and retained newest first', () => {
  const result = mergeRecentMembers(
    [{ name: '舊名稱', ip: '26.1.1.1', seenAt: 1 }, { name: '另一位', ip: '26.2.2.2', seenAt: 2 }],
    [{ name: '新名稱', ip: '26.1.1.1' }, { name: '無位址' }],
    10,
  )
  assert.deepEqual(result.map(({ name, ip }) => ({ name, ip })), [
    { name: '新名稱', ip: '26.1.1.1' },
    { name: '另一位', ip: '26.2.2.2' },
  ])
})
