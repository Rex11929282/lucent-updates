const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('events')

const { Room } = require('../electron/room.cjs')

function waitStatus(room, predicate) {
  return new Promise((resolve) => {
    const handler = (status) => {
      if (!predicate(status)) return
      room.off('status', handler)
      resolve(status)
    }
    room.on('status', handler)
  })
}

test('room routes style offers and responses only between host and connected member', async (t) => {
  const host = new Room()
  const member = new Room()
  t.after(() => { member.close(); host.close() })

  host.startHost({ roomName: '測試', hostName: '房主', port: 0 })
  await once(host.wss, 'listening')
  const port = host.wss.address().port
  const connected = waitStatus(member, (status) => status.connected)
  member.join({ ip: '127.0.0.1', port, name: '成員' })
  await connected

  assert.match(member.selfId, /^member-/)
  assert.ok(host.members.some((item) => item.id === member.selfId))

  const toMember = once(member, 'styleOffer')
  assert.equal(host.sendStyleOffer(member.selfId, { id: 'host-offer' }), true)
  assert.equal((await toMember)[0].id, 'host-offer')

  const toHost = once(host, 'styleOffer')
  assert.equal(member.sendStyleOffer('host', { id: 'member-offer' }), true)
  const incoming = (await toHost)[0]
  assert.equal(incoming.sender.id, member.selfId)
  assert.equal(incoming.sender.name, '成員')

  const response = once(member, 'styleResponse')
  assert.equal(host.respondStyleOffer({ requestId: 'member-offer', targetId: member.selfId, accepted: true }), true)
  assert.equal((await response)[0].accepted, true)
  assert.equal(member.sendStyleOffer('member-other', { id: 'bad' }), false)
})
