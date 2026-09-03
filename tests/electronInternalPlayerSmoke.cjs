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
    await overlay.evaluate(`window.overlay.stateSet({ cfg: {
      oceanWave: true, oceanWaveColor: '#45b9ff', oceanWaveOpacity: 0.32,
      oceanWaveAmplitude: 0.45, oceanWaveSpeed: 1,
    } })`)
    await waitFor(
      () => overlay.evaluate(`(() => {
        const wave = document.querySelector('.ocean-wave')
        const clip = document.querySelector('.visualclip')
        if (!wave || !clip) return null
        const a = wave.getBoundingClientRect(), b = clip.getBoundingClientRect()
        return Math.abs(a.left - b.left) < .5 && Math.abs(a.right - b.right) < .5
      })()`),
      'Ocean material did not mount inside the pill clip',
    )
    await overlay.evaluate(`(() => {
      window.__lucentSpectrumFrames = []
      window.__lucentStopSpectrum?.()
      window.__lucentStopSpectrum = window.overlay.player.onSpectrum((frame) => {
        window.__lucentSpectrumFrames.push(frame)
      })
    })()`)
    const loaded = await overlay.evaluate(`window.overlay.player.qaLoad(${JSON.stringify(wavDataUrl())})`)
    assert.equal(loaded.ok, true)

    const playing = await waitFor(
      () => overlay.evaluate('window.overlay.player.snapshot()').then((snapshot) => snapshot.playing && snapshot),
      'Audio service did not report playing',
    )
    assert.equal(playing.song.id, 'runtime-qa')
    assert.ok(playing.durationMs > 0)

    const spectrum = await waitFor(
      () => overlay.evaluate(`window.__lucentSpectrumFrames.find((frame) => frame?.active && Array.isArray(frame.bands) && frame.bands.some((value) => value > 0))`),
      'Audio service did not publish a real analyser spectrum frame',
    )
    assert.ok(spectrum.bands.length > 0)

    const ocean = await waitFor(
      () => overlay.evaluate(`(() => {
        const wave = document.querySelector('.ocean-wave')
        const level = Number(wave?.style.getPropertyValue('--ocean-level'))
        if (!wave || !(level > 0)) return null
        return { level, playState: wave.classList.contains('ocean-wave--live') ? 'running' : 'paused' }
      })()`),
      'Ocean material did not advance from the real playback ratio',
    )
    assert.ok(ocean.level > 0 && ocean.level <= 1)
    assert.equal(ocean.playState, 'running')

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
    const oceanPaused = await overlay.evaluate(`document.querySelector('.ocean-wave')?.classList.contains('ocean-wave--live') ? 'running' : 'paused'`)
    assert.equal(oceanPaused, 'paused')
    process.stdout.write(`${JSON.stringify({ playing, paused, spectrum, ocean, audioServiceSurvivedConsoleClose: true }, null, 2)}\n`)
  } finally {
    await overlay.evaluate('window.__lucentStopSpectrum?.()').catch(() => {})
    overlay.socket.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
