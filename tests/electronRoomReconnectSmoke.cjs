const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const WebSocket = require('ws')

const root = path.join(__dirname, '..')
const electron = require('electron')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, message, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check()
      if (value) return value
    } catch {}
    await delay(100)
  }
  throw new Error(message)
}

let nextHighPort = 43000 + (process.pid % 1000)

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    const candidate = nextHighPort++
    server.listen(candidate, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', ...options })
  child.once('error', (error) => { child._launchError = error })
  return child
}

async function stopTree(child) {
  if (!child?.pid) return
  if (process.platform !== 'win32') { child.kill(); return }
  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    killer.once('exit', resolve)
    killer.once('error', resolve)
  })
  // taskkill can report success before Chromium releases profile files.
  await delay(250)
}

async function cdpPage(port) {
  return waitFor(async () => {
    const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
    // Electron creates an about:blank target before preload/navigation is
    // ready. It has no bridge, so accepting it makes this smoke test fail
    // nondeterministically before the real overlay page appears.
    return pages.find((page) => page.type === 'page' && /^https?:\/\//.test(page.url) && !page.url.includes('#')) || null
  }, `CDP page on ${port} did not become ready`)
}

async function connect(page) {
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
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
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  }).then((result) => {
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed'
      throw new Error(detail)
    }
    return result.result.value
  })
  return { socket, evaluate }
}

function launchElectron({ cdpPort, userData, dataPath, viteUrl }) {
  // Chromium switches must precede the app path. When they followed '.',
  // Electron treated them as app arguments, so every fixture could fall back
  // to the user's real profile and collide with the single-instance lock.
  return startProcess(electron, [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userData}`, '.'], {
    cwd: root,
    env: { ...process.env, VITE_DEV_SERVER_URL: viteUrl, LUCENT_RUNTIME_QA: '1', LUCENT_DATA_PATH: dataPath },
  })
}

async function main() {
  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-room-reconnect-'))
  let vite = null
  let hostOne = null
  let hostTwo = null
  let member = null
  let hostOneCdp = null
  let hostTwoCdp = null
  let memberCdp = null
  try {
    const vitePort = await freePort()
    const roomPort = await freePort()
    const hostOnePort = await freePort()
    const hostTwoPort = await freePort()
    const memberPort = await freePort()
    const viteUrl = `http://127.0.0.1:${vitePort}`
    vite = startProcess(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(vitePort)], { cwd: root })
    await waitFor(() => fetch(viteUrl).then((response) => response.ok), 'Vite did not become ready')

    hostOne = launchElectron({ cdpPort: hostOnePort, userData: path.join(qaRoot, 'host-1'), dataPath: path.join(qaRoot, 'host-1.db'), viteUrl })
    member = launchElectron({ cdpPort: memberPort, userData: path.join(qaRoot, 'member'), dataPath: path.join(qaRoot, 'member.db'), viteUrl })
    hostOneCdp = await connect(await cdpPage(hostOnePort))
    memberCdp = await connect(await cdpPage(memberPort))
    await waitFor(() => hostOneCdp.evaluate('Boolean(window.overlay?.room?.host)'), 'host preload bridge did not become ready')
    await waitFor(() => memberCdp.evaluate('Boolean(window.overlay?.room?.join)'), 'member preload bridge did not become ready')

    const hostResult = await hostOneCdp.evaluate(`window.overlay.room.host({ roomName: 'QA 重連房', code: 'qa', hostName: 'QA 房主', port: ${roomPort} })`)
    assert.equal(hostResult.ok, true)
    await hostOneCdp.evaluate(`window.overlay.room.setState({ song: { id: 'host-song-1', name: '第一首' }, playing: true, positionMs: 100, durationMs: 200000 })`)
    await memberCdp.evaluate(`window.overlay.room.join({ ip: '127.0.0.1', port: ${roomPort}, code: 'qa', name: 'QA 聽眾' })`)
    await waitFor(() => memberCdp.evaluate('window.overlay.room.snapshot()').then((snapshot) => snapshot.state?.song?.id === 'host-song-1'),
      'member did not receive the first host snapshot')

    await stopTree(hostOne)
    hostOne = null
    await waitFor(() => memberCdp.evaluate('window.overlay.room.snapshot()').then((snapshot) => snapshot.mode === 'member' && snapshot.state?.song?.id === 'host-song-1'),
      'member did not retain the host snapshot while disconnected')

    hostTwo = launchElectron({ cdpPort: hostTwoPort, userData: path.join(qaRoot, 'host-2'), dataPath: path.join(qaRoot, 'host-2.db'), viteUrl })
    hostTwoCdp = await connect(await cdpPage(hostTwoPort))
    await waitFor(() => hostTwoCdp.evaluate('Boolean(window.overlay?.room?.host)'), 'replacement host preload bridge did not become ready')
    const replacementResult = await hostTwoCdp.evaluate(`window.overlay.room.host({ roomName: 'QA 重連房', code: 'qa', hostName: 'QA 房主', port: ${roomPort} })`)
    assert.equal(replacementResult.ok, true)
    await hostTwoCdp.evaluate(`window.overlay.room.setState({ song: { id: 'host-song-2', name: '第二首' }, playing: true, positionMs: 200, durationMs: 200000 })`)
    await waitFor(() => memberCdp.evaluate('window.overlay.room.snapshot()').then((snapshot) => snapshot.state?.song?.id === 'host-song-2'),
      'member did not reconnect to the replacement host')

    process.stdout.write(`${JSON.stringify({ reconnected: true, hostStateRestored: true })}\n`)
  } finally {
    hostOneCdp?.socket.close(); hostTwoCdp?.socket.close(); memberCdp?.socket.close()
    await stopTree(hostOne); await stopTree(hostTwo); await stopTree(member); await stopTree(vite)
    try {
      fs.rmSync(qaRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 })
    } catch {
      // A late Chromium handle should not turn a passed protocol test into a
      // false failure. Best-effort async cleanup leaves only a temp profile.
      fs.rm(qaRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }, () => {})
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
