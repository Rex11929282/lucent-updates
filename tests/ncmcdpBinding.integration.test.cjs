const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { WebSocketServer } = require('ws')
const ncmcdp = require('../electron/ncmcdp.cjs')

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
}

function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

test('a Runtime.bindingCalled lyric reaches the CDP update callback before any polling response', async () => {
  let port = 0
  let directClient = null
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify([{
      type: 'page',
      webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/test`,
    }]))
  })
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req))
  })

  await listen(server)
  port = server.address().port

  try {
    const received = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('binding callback timed out')), 1500)
      let sent = false
      wss.once('connection', (client) => {
        directClient = client
        client.on('message', (buffer) => {
          const message = JSON.parse(buffer.toString())
          if (sent || message.method !== 'Runtime.evaluate') return
          sent = true
          client.send(JSON.stringify({
            method: 'Runtime.bindingCalled',
            params: {
              name: 'lglReport',
              payload: JSON.stringify({
                requestSongId: '108242',
                lyric: { i: 4, main: 'binding lyric', sub: 'translation', seq: 7, capturedAt: 4567 },
              }),
            },
          }))
        })
      })
      ncmcdp.start((snapshot) => {
        if (snapshot?.lyric?.main !== 'binding lyric') return
        clearTimeout(timeout)
        resolve(snapshot)
      }, { port })
    })

    assert.equal(received.songId, '108242')
    assert.equal(received.lyric.songId, '108242')
    assert.equal(received.lyric.seq, 7)
    const status = ncmcdp.getStatus()
    assert.equal(status.connected, true)
    assert.equal(status.directLyricEvents, 1)
    assert.ok(status.lastDirectLyricAt > 0)

    directClient.send(JSON.stringify({
      method: 'Runtime.bindingCalled',
      params: {
        name: 'lglReport',
        payload: JSON.stringify({ lyric: { i: 5, main: 'unbound lyric', seq: 8 } }),
      },
    }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(ncmcdp.getStatus().directLyricEvents, 1)
  } finally {
    ncmcdp.stop()
    for (const client of wss.clients) client.terminate()
    await new Promise((resolve) => wss.close(resolve))
    await close(server)
  }
})
