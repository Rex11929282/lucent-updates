const assert = require('node:assert/strict')
const WebSocket = require('ws')

const endpoint = process.env.LUCENT_SMOKE_CDP || 'http://127.0.0.1:9223'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function pages() {
  return fetch(`${endpoint}/json`).then((response) => response.json())
}

async function connect(page) {
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  let nextId = 1
  const pending = new Map()
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Runtime.evaluate failed')
    return response.result.value
  }
  return { socket, evaluate }
}

function wavDataUrl(seconds = 3, sampleRate = 8000) {
  const samples = Math.floor(seconds * sampleRate)
  const dataBytes = samples * 2
  const wav = Buffer.alloc(44 + dataBytes)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataBytes, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataBytes, 40)
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin(index * Math.PI * 2 * 220 / sampleRate) * 2500)
    wav.writeInt16LE(value, 44 + index * 2)
  }
  return `data:audio/wav;base64,${wav.toString('base64')}`
}

async function waitFor(check, message, timeoutMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await check()
    if (value) return value
    await delay(80)
  }
  throw new Error(message)
}

async function main() {
  const targets = await pages()
  const overlayPage = targets.find((page) => page.type === 'page' && !page.url.includes('#'))
  const audioPage = targets.find((page) => page.type === 'page' && page.url.includes('#audio-service'))
  assert.ok(overlayPage, 'Overlay target must exist')
  assert.ok(audioPage, 'Hidden audio-service target must exist')

  const overlay = await connect(overlayPage)
  try {
    const loaded = await overlay.evaluate(`window.overlay.player.qaLoad(${JSON.stringify(wavDataUrl())})`)
    assert.equal(loaded.ok, true)

    const playing = await waitFor(
      () => overlay.evaluate('window.overlay.player.snapshot()').then((snapshot) => snapshot.playing && snapshot),
      'Audio service did not report playing',
    )
    assert.equal(playing.song.id, 'runtime-qa')
    assert.ok(playing.durationMs > 0)

    await overlay.evaluate('window.overlay.openConsole()')
    await waitFor(
      async () => (await pages()).some((page) => page.type === 'page' && page.url.includes('#console')),
      'Console did not open',
    )
    await overlay.evaluate('window.overlay.closeConsole()')
    await waitFor(
      async () => !(await pages()).some((page) => page.type === 'page' && page.url.includes('#console')),
      'Console did not close',
    )
    assert.ok((await pages()).some((page) => page.type === 'page' && page.url.includes('#audio-service')))

    assert.equal((await overlay.evaluate("window.overlay.player.qaCommand('seek', { positionMs: 500 })")).ok, true)
    await delay(120)
    assert.equal((await overlay.evaluate("window.overlay.player.qaCommand('pause')")).ok, true)
    const paused = await waitFor(
      () => overlay.evaluate('window.overlay.player.snapshot()').then((snapshot) => !snapshot.playing && snapshot),
      'Audio service did not report pause',
    )
    assert.ok(paused.positionMs >= 400)
    assert.equal(Object.prototype.hasOwnProperty.call(paused, 'url'), false)
    process.stdout.write(`${JSON.stringify({ playing, paused, audioServiceSurvivedConsoleClose: true }, null, 2)}\n`)
  } finally {
    overlay.socket.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
