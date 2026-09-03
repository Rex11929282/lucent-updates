const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const WebSocket = require('ws')

const root = path.join(__dirname, '..')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, message, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await delay(80)
  }
  throw new Error(message)
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

function tone() {
  const rate = 8000, samples = rate * 5
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / rate) * 5000), 44 + i * 2)
  return wav
}

async function connect(page) {
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const pending = new Map()
  let sequence = 0
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 8000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  return { socket, evaluate }
}

async function stop(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform !== 'win32') { child.kill(); return }
  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    killer.once('exit', resolve); killer.once('error', resolve)
  })
}

async function main() {
  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-audio-playback-'))
  const wav = tone()
  const slowResponses = new Set()
  let slowRequests = 0
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Cache-Control', 'no-store')
    if (!req.url.startsWith('/no-cors')) res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.url.startsWith('/slow')) {
      slowRequests++
      slowResponses.add(res)
      res.once('close', () => slowResponses.delete(res))
      res.writeHead(200, { 'Content-Length': wav.length })
      res.flushHeaders()
    } else {
      res.writeHead(200, { 'Content-Length': wav.length })
      res.end(wav)
    }
  })
  let app = null, overlay = null, audio = null
  let launchLog = ''
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const origin = `http://127.0.0.1:${server.address().port}`
    const cdpPort = await freePort()
    const env = { ...process.env, LUCENT_RUNTIME_QA: '1', LUCENT_DATA_PATH: path.join(qaRoot, 'data.db'), VITE_DEV_SERVER_URL: '' }
    delete env.ELECTRON_RUN_AS_NODE
    app = spawn(require('electron'), ['.', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${qaRoot}`], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    })
    app.stderr.on('data', (data) => { launchLog = (launchLog + data).slice(-5000) })
    app.once('error', (error) => { launchLog += error.message })
    const targets = await waitFor(async () => {
      try {
        const list = await fetch(`http://127.0.0.1:${cdpPort}/json`, { signal: AbortSignal.timeout(1000) }).then((r) => r.json())
        return list.some((page) => page.url.includes('#audio-service')) && list.some((page) => !page.url.includes('#')) ? list : null
      } catch { return null }
    }, 'Isolated Electron did not start')
    overlay = await connect(targets.find((page) => !page.url.includes('#')))
    audio = await connect(targets.find((page) => page.url.includes('#audio-service')))
    await waitFor(() => audio.evaluate('Boolean(document.querySelector("audio") && window.overlay?.player)'), 'Audio renderer is not ready')
    await overlay.evaluate('window.overlay.player.setVolume(0.05)')
    await overlay.evaluate(`(() => {
      window.__audioSmokeFrames = []; window.__audioSmokeStates = [];
      window.overlay.player.onSpectrum(frame => { window.__audioSmokeFrames.push(frame); if (window.__audioSmokeFrames.length > 80) window.__audioSmokeFrames.shift() });
      window.overlay.player.onChanged(state => { window.__audioSmokeStates.push({loading: state.loading, error: state.error}); });
    })()`)
    await audio.evaluate(`(() => {
      window.__audioSmokeCommands = [];
      window.overlay.player.onCommand(command => window.__audioSmokeCommands.push({type: command.type, retry: !!command.retry}));
    })()`)
    const load = (url) => overlay.evaluate(`window.overlay.player.qaLoad(${JSON.stringify(url)})`)
    const snapshot = () => overlay.evaluate('window.overlay.player.snapshot()')
    const reset = async () => {
      await overlay.evaluate('window.__audioSmokeFrames = []; window.__audioSmokeStates = []')
      await audio.evaluate('window.__audioSmokeCommands = []')
    }
    const sound = () => overlay.evaluate('Math.max(0, ...window.__audioSmokeFrames.slice(-3).flatMap(frame => frame.active ? frame.bands : []))')
    const dataUrl = `data:audio/wav;base64,${wav.toString('base64')}`

    await load(dataUrl)
    await waitFor(() => snapshot().then((s) => s.playing), 'Control audio did not play')
    const controlPeak = await waitFor(sound, 'Control audio has no analyser output')
    await overlay.evaluate('window.overlay.player.pause()')
    await reset()

    await load(`${origin}/cors.wav`)
    await waitFor(() => snapshot().then((s) => s.playing), 'Remote fixture did not play')
    await delay(1000)
    const remotePeak = await sound()
    const remoteMedia = await audio.evaluate('(() => { const a = document.querySelector("audio"); return {paused: a.paused, currentTime: a.currentTime, crossOrigin: a.crossOrigin, error: a.error?.code || 0} })()')
    await overlay.evaluate('window.overlay.player.pause()')
    await reset()

    await load(`${origin}/no-cors.wav`)
    await waitFor(() => snapshot().then((s) => s.playing), 'Non-CORS fixture did not play')
    await delay(1000)
    const noCorsPeak = await sound()
    await overlay.evaluate('window.overlay.player.pause()')
    await reset()

    const beforeSwitch = slowRequests
    await load(`${origin}/slow-switch.wav`)
    await waitFor(() => slowRequests > beforeSwitch, 'Slow switching fixture was not requested')
    await load(dataUrl)
    await waitFor(() => snapshot().then((s) => s.playing), 'Replacement audio did not play')
    await delay(900)
    const switchingStates = await overlay.evaluate('window.__audioSmokeStates')
    const switchingCommands = await audio.evaluate('window.__audioSmokeCommands')
    await overlay.evaluate('window.overlay.player.pause()')
    await reset()

    const beforePause = slowRequests
    await load(`${origin}/slow-pause.wav`)
    await waitFor(() => slowRequests > beforePause, 'Slow pause fixture was not requested')
    await overlay.evaluate('window.overlay.player.pause()')
    await delay(900)
    const pauseStates = await overlay.evaluate('window.__audioSmokeStates')
    const pauseCommands = await audio.evaluate('window.__audioSmokeCommands')
    const report = {
      controlPeak, remotePeak, noCorsPeak, remoteMedia,
      switchReloaded: switchingStates.some((s) => s.loading),
      pauseLoading: (await snapshot()).loading,
      switchRetried: switchingCommands.some((c) => c.retry),
      switchErrored: switchingStates.some((s) => !!s.error),
      pauseRetried: pauseCommands.some((c) => c.retry),
      pauseErrored: pauseStates.some((s) => !!s.error),
    }
    console.log(JSON.stringify(report, null, 2))
    assert.ok(remotePeak > 0, 'Remote audio advanced but Web Audio output was silent')
    assert.equal(report.switchRetried || report.switchErrored, false, 'An old play promise corrupted the replacement track')
    assert.equal(report.switchReloaded, false, 'An old play promise started reloading the replacement track')
    assert.equal(report.pauseRetried || report.pauseErrored, false, 'A requested pause was reported as a playback failure')
    assert.equal(report.pauseLoading, false, 'A requested pause started a spurious URL reload')
  } catch (error) {
    if (!overlay) console.error(launchLog)
    throw error
  } finally {
    if (overlay) await overlay.evaluate('window.overlay.quit()').catch(() => {})
    overlay?.socket.close(); audio?.socket.close()
    await delay(200)
    await stop(app)
    for (const res of slowResponses) res.destroy()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    const resolved = path.resolve(qaRoot)
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('lucent-audio-playback-')) {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
