const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

const { reconnectDelay } = require('../shared/roomReconnect.cjs')
const { Room } = require('../electron/room.cjs')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(check, message, timeoutMs = 1000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return
    await delay(10)
  }
  throw new Error(message)
}

test('reconnect delay grows predictably and remains capped', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((attempt) => reconnectDelay(attempt)),
    [1000, 2000, 4000, 8000, 10000, 10000])
})

test('invalid attempts and options stay within safe bounds', () => {
  assert.equal(reconnectDelay(-1), 1000)
  assert.equal(reconnectDelay(1, { baseMs: 500, maxMs: 750 }), 750)
})

test('member retains the host snapshot and reconnects after the host returns', { timeout: 3000 }, async (t) => {
  const host = new Room()
  const member = new Room({ reconnect: { baseMs: 10, maxMs: 20 } })
  let replacement = null
  t.after(() => { member.close(); replacement?.close(); host.close() })

  host.startHost({ roomName: '重連驗證', code: '1', hostName: '房主', port: 0 })
  await once(host.wss, 'listening')
  const port = host.wss.address().port
  const firstConnected = once(member, 'status')
  member.join({ ip: '127.0.0.1', port, code: '1', name: '聽眾' })
  await waitFor(() => member.snapshot().mode === 'member' && !!member.selfId, 'member did not join first host')
  host.setState({ song: { id: 'host-song-1' }, playing: true, positionMs: 100 })
  await waitFor(() => member.snapshot().state?.song?.id === 'host-song-1', 'member did not receive host state')

  host.close()
  await waitFor(() => member.snapshot().mode === 'member' && member.snapshot().state?.song?.id === 'host-song-1',
    'member discarded host state while reconnecting')

  replacement = new Room()
  replacement.startHost({ roomName: '重連驗證', code: '1', hostName: '房主', port })
  await once(replacement.wss, 'listening')
  await waitFor(() => !!member.selfId && member.snapshot().mode === 'member', 'member did not reconnect')
  replacement.setState({ song: { id: 'host-song-2' }, playing: true, positionMs: 200 })
  await waitFor(() => member.snapshot().state?.song?.id === 'host-song-2', 'member did not receive replacement host state')
  assert.equal(member.snapshot().mode, 'member')
  void firstConnected
})

test('explicit leave never schedules a reconnect', { timeout: 1000 }, async (t) => {
  const host = new Room()
  const member = new Room({ reconnect: { baseMs: 10, maxMs: 20 } })
  t.after(() => { member.close(); host.close() })
  host.startHost({ roomName: '離房驗證', hostName: '房主', port: 0 })
  await once(host.wss, 'listening')
  member.join({ ip: '127.0.0.1', port: host.wss.address().port, name: '聽眾' })
  await waitFor(() => !!member.selfId, 'member did not join')
  member.close()
  await delay(80)
  assert.equal(member.snapshot().mode, null)
  assert.equal(member.ws, null)
})

test('console exposes a Traditional Chinese reconnecting notice without local-source fallback', () => {
  const root = path.join(__dirname, '..')
  const ui = fs.readFileSync(path.join(root, 'src', 'ConsoleWindow.jsx'), 'utf8')
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8')
  assert.match(ui, /正在重新連線/)
  assert.match(ui, /status\.reconnecting/)
  assert.match(main, /playback\.setMode\('member'\)/)
})
