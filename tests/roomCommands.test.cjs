const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')

const { Room } = require('../electron/room.cjs')

function waitStatus(room, predicate) {
  return new Promise((resolve) => {
    const handler = (status) => {
      if (!predicate(status)) return
      room.off('status', handler); resolve(status)
    }
    room.on('status', handler)
  })
}

async function connectedRooms(t) {
  const host = new Room()
  const member = new Room()
  t.after(() => { member.close(); host.close() })
  host.startHost({ roomName: '點歌房', hostName: '房主', port: 0 })
  await once(host.wss, 'listening')
  const connected = waitStatus(member, (status) => status.connected)
  member.join({ ip: '127.0.0.1', port: host.wss.address().port, name: '聽眾' })
  await connected
  return { host, member }
}

test('room v2 welcome includes queue snapshot and default member capabilities', async (t) => {
  const { host, member } = await connectedRooms(t)
  assert.equal(host.protocolVersion, 2)
  assert.equal(member.protocolVersion, 2)
  assert.deepEqual(member.capabilities, {
    'song.request': true, 'queue.manage': false, 'playback.control': false,
  })
  assert.deepEqual(member.queue, [])
  assert.ok(member.roomId)
})

test('member commands are deduplicated and carry the authenticated socket identity', async (t) => {
  const { host, member } = await connectedRooms(t)
  let received = 0
  const commandPromise = new Promise((resolve) => host.on('command', (payload) => { received += 1; resolve(payload) }))
  const command = { commandId: 'same-id', type: 'song.request', payload: { provider: 'netease', trackId: '163' } }
  assert.equal(member.sendCommand(command), true)
  assert.equal(member.sendCommand(command), true)
  const incoming = await commandPromise
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(received, 1)
  assert.equal(incoming.sender.id, member.selfId)
  assert.equal(incoming.command.payload.trackId, '163')
})

test('host capability changes, queue revisions and command results reach the member', async (t) => {
  const { host, member } = await connectedRooms(t)
  const capabilityEvent = once(member, 'capabilities')
  assert.equal(host.setCapabilities(member.selfId, { 'song.request': true, 'playback.control': true }), true)
  const capabilities = (await capabilityEvent)[0]
  assert.equal(capabilities['playback.control'], true)
  assert.equal(capabilities['queue.manage'], false)

  const queueEvent = once(member, 'queue')
  host.setQueue([{ id: 'q1', provider: 'netease', trackId: '11', name: '歌曲', requesterName: '聽眾', position: 0, url: 'must-not-leak' }])
  const queue = (await queueEvent)[0]
  assert.equal(queue[0].trackId, '11')
  assert.equal(Object.hasOwn(queue[0], 'url'), false)
  assert.ok(member.roomRevision > 0)

  const resultEvent = once(member, 'commandResult')
  assert.equal(host.sendCommandResult(member.selfId, { commandId: 'c1', ok: true }), true)
  assert.deepEqual((await resultEvent)[0], { commandId: 'c1', ok: true })
})
