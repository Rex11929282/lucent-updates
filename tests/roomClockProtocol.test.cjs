const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')

const { Room } = require('../electron/room.cjs')

async function connectedRooms(t) {
  const host = new Room()
  const member = new Room()
  t.after(() => { member.close(); host.close() })
  await host.startHost({ roomName: '時鐘測試', code: '', hostName: '主持人', port: 0 })
  const connected = new Promise((resolve) => member.on('status', function handler(status) {
    if (!status.connected) return
    member.off('status', handler)
    resolve()
  }))
  member.join({ ip: '127.0.0.1', port: host.wss.address().port, name: '聽眾' })
  await connected
  return { host, member }
}

test('host immediately answers a member clock ping with host timestamps', async (t) => {
  const { member } = await connectedRooms(t)
  const pong = new Promise((resolve) => member.on('clockPong', function handler(message) {
    if (message.sentAt !== 123) return
    member.off('clockPong', handler)
    resolve([message])
  }))
  member.ws.send(JSON.stringify({ type: 'clock-ping', sentAt: 123 }))
  const [message] = await pong
  assert.equal(message.sentAt, 123)
  assert.ok(Number.isFinite(message.hostReceivedAt))
  assert.ok(Number.isFinite(message.hostSentAt))
  assert.ok(Number.isFinite(message.receivedAt))
})

test('host state broadcasts include its monotonic timestamp', () => {
  const room = new Room({ now: () => 1234 })
  room.mode = 'host'
  let broadcast
  room._broadcast = (message) => { broadcast = message }
  room.setState({ positionMs: 4000, playing: true })
  assert.equal(broadcast.state.hostAtMs, 1234)
})
