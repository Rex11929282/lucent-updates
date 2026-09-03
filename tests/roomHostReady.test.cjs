const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { Room } = require('../electron/room.cjs')

test('host only reports success after an IPv4 LAN listener is ready', async () => {
  let serverOptions
  class FakeServer extends EventEmitter {
    constructor(options) {
      super()
      serverOptions = options
      process.nextTick(() => this.emit('listening'))
    }
    close() {}
  }
  function FakeWebSocket() {}
  FakeWebSocket.OPEN = 1
  FakeWebSocket.Server = FakeServer

  const room = new Room({ WebSocketImpl: FakeWebSocket })
  const result = await room.startHost({ roomName: '測試房', code: '', hostName: '主持人', port: 8787 })

  assert.deepEqual(serverOptions, { host: '0.0.0.0', port: 8787, maxPayload: 64 * 1024 })
  assert.equal(result.ok, true)
  room.close()
})
