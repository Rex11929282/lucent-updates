const test = require('node:test')
const assert = require('node:assert/strict')

const { getLanIp, normalizeJoinTarget, socketPeerIp } = require('../electron/room.cjs')

test('join target accepts a bare IP, ws URL, or IP with an explicit port', () => {
  assert.deepEqual(normalizeJoinTarget('192.168.1.25', 8787), { ip: '192.168.1.25', port: 8787 })
  assert.deepEqual(normalizeJoinTarget('ws://192.168.1.25:9000', 8787), { ip: '192.168.1.25', port: 9000 })
  assert.deepEqual(normalizeJoinTarget(' 192.168.1.25:9001 ', 8787), { ip: '192.168.1.25', port: 9001 })
})

test('join target rejects malformed URLs instead of attempting a WebSocket connection', () => {
  assert.equal(normalizeJoinTarget('ws://ws://192.168.1.25:8787', 8787), null)
  assert.equal(normalizeJoinTarget('https://example.com', 8787), null)
  assert.equal(normalizeJoinTarget('', 8787), null)
})

test('room address prefers the Radmin virtual IPv4 over a physical LAN address', () => {
  const ifaces = {
    'VPN Adapter': [{ family: 'IPv4', internal: false, address: '26.233.18.34' }],
    WiFi: [{ family: 'IPv4', internal: false, address: '192.168.1.25' }],
  }
  assert.equal(getLanIp(ifaces), '26.233.18.34')
})

test('member address normalizes the IPv4-mapped Radmin socket address', () => {
  assert.equal(socketPeerIp({ _socket: { remoteAddress: '::ffff:26.233.18.55' } }), '26.233.18.55')
})
