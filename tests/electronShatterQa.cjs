const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const WebSocket = require('ws')
const electron = require('electron')

let cdpHttp = process.env.LUCENT_QA_CDP || 'http://127.0.0.1:9223'
const root = path.resolve(__dirname, '..')
const OUT_DIR = path.resolve(__dirname, '..', '.qa-artifacts', 'shatter')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, { windowsHide: true, stdio: 'ignore', ...options })
}

async function stopTree(child) {
  if (!child?.pid) return
  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    killer.once('exit', resolve)
    killer.once('error', resolve)
  })
}

async function waitForRuntime(url, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${url}/json`)
      if (response.ok) return
    } catch {}
    await delay(80)
  }
  throw new Error(`CDP did not become ready: ${url}`)
}

async function ensureRuntime() {
  try {
    await waitForRuntime(cdpHttp, 300)
    return async () => {}
  } catch {
    if (process.env.LUCENT_QA_SPAWN !== '1') throw new Error(`Overlay CDP is unavailable: ${cdpHttp}`)
  }

  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-shatter-qa-'))
  const vitePort = await freePort()
  const cdpPort = await freePort()
  const viteUrl = `http://127.0.0.1:${vitePort}`
  cdpHttp = `http://127.0.0.1:${cdpPort}`
  const vite = startProcess(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(vitePort)], { cwd: root })
  let app = null
  try {
    const viteStarted = Date.now()
    while (Date.now() - viteStarted < 10000) {
      try {
        const response = await fetch(viteUrl)
        if (response.ok) break
      } catch {}
      await delay(80)
    }
    app = startProcess(electron, ['.', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(qaRoot, 'user-data')}`], {
      cwd: root,
      stdio: 'ignore',
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: viteUrl,
        LUCENT_RUNTIME_QA: '1',
        LUCENT_DATA_PATH: path.join(qaRoot, 'lucent-data.db'),
      },
    })
    await waitForRuntime(cdpHttp)
  } catch (error) {
    await stopTree(app)
    await stopTree(vite)
    fs.rmSync(qaRoot, { recursive: true, force: true })
    throw error
  }
  return async () => {
    await stopTree(app)
    await stopTree(vite)
    fs.rmSync(qaRoot, { recursive: true, force: true })
  }
}

async function connect() {
  const pages = await fetch(`${cdpHttp}/json`).then((response) => response.json())
  // The hidden audio service is also a page. The overlay is the only page
  // without a hash route; selecting the first non-console page can bind QA to
  // #audio-service and make an initialized overlay look missing.
  const page = pages.find((candidate) => candidate.type === 'page' && !candidate.url.includes('#'))
  if (!page) throw new Error('找不到 Overlay CDP 頁面')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  let nextId = 1
  const pending = new Map()
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP ${method} request timed out`))
    }, 5000)
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value) },
      reject: (error) => { clearTimeout(timer); reject(error) },
    })
    try {
      socket.send(JSON.stringify({ id, method, params }))
    } catch (error) {
      clearTimeout(timer)
      pending.delete(id)
      reject(error)
    }
  })
  return { socket, send }
}

async function waitForOverlay(send, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await send('Runtime.evaluate', {
      expression: 'Boolean(window.overlay?.stateGet && window.overlay?.room?.qaState && document.querySelector(".capsule"))',
      returnByValue: true,
    })
    if (result.result?.value) return
    await delay(80)
  }
  throw new Error('Overlay did not become ready for shatter QA')
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const disposeRuntime = await ensureRuntime()
  let { socket, send } = await connect()
  await waitForOverlay(send)
  let originalState = null
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
    return result.result.value
  }
  const inspect = () => evaluate(`(async () => {
    const wrap = document.querySelector('.song-transition-wrap')
    const capsule = document.querySelector('.capsule')
    const surface = capsule?.querySelector('.glass') || capsule?.querySelector('.plain')
    const lyric = document.querySelector('.lyrics__txt')
    const wave = document.querySelector('.ocean-wave')
    const content = document.querySelector('.content')
    const canvas = document.querySelector('.song-transition-canvas')
    let canvasAlphaSamples = 0
    if (canvas?.width && canvas?.height) {
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data || []
      const stride = Math.max(4, Math.floor(pixels.length / 4000 / 4) * 4)
      for (let index = 3; index < pixels.length; index += stride) {
        if (pixels[index] > 8) canvasAlphaSamples += 1
      }
    }
    const transformed = [...(capsule?.querySelectorAll('*') || [])]
      .filter((element) => element.style.transform)
      .map((element) => ({ className: element.className, transform: element.style.transform }))
      return {
        phase: [...(wrap?.classList || [])].find((name) => name.startsWith('phase-')) || '',
        lyricClass: lyric?.className || '',
        kcharCount: lyric?.querySelectorAll('.kchar')?.length || 0,
        kcharFlow: [...(lyric?.querySelectorAll('.kchar') || [])].map((node) => node.style.getPropertyValue('--flow-fill')),
        cfg: (await window.overlay.stateGet())?.cfg?.lyricHighlightMode || '',
        room: await window.overlay.room.snapshot(),
        canvasCount: document.querySelectorAll('.song-transition-canvas').length,
      canvasAlphaSamples,
      effectsPaused: !!capsule?.classList.contains('effects-paused'),
      contentHidden: !!document.querySelector('.content--shatter-hidden'),
      contentOpacity: content ? Number(getComputedStyle(content).opacity) : 0,
        nodeCount: document.querySelectorAll('*').length,
        pillRect: surface ? surface.getBoundingClientRect().toJSON() : null,
        viewport: { width: window.innerWidth, height: window.innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight },
        windowBounds: await window.overlay.getBounds(),
      surfaceTransform: surface?.style.transform || '',
      computedTransform: surface ? getComputedStyle(surface).transform : '',
      transformed,
      flowFillChars: [...(lyric?.querySelectorAll('.kchar') || [])]
        .map((node) => node.style.getPropertyValue('--flow-fill'))
        .filter(Boolean),
      oceanLevel: Number(wave?.style.getPropertyValue('--ocean-level')),
      oceanPlayState: wave
        ? (wave.classList.contains('ocean-wave--live') ? 'running' : 'paused')
        : '',
    }
  })()`)
  const screenshot = async (name) => {
    if (process.env.LUCENT_QA_NO_SCREENSHOTS === '1') return
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(result.data, 'base64'))
  }
  const waitForPhase = async (wanted, timeoutMs = 2000) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const state = await inspect()
      if (state.phase === `phase-${wanted}`) return state
      await delay(16)
    }
    throw new Error(`等待 ${wanted} 階段逾時；目前 ${JSON.stringify(await inspect())}`)
  }
  const assertPillGeometry = (label, snapshot, baseline) => {
    const actual = snapshot?.pillRect
    const expected = baseline?.pillRect
    if (!actual || !expected || Math.abs(actual.x - expected.x) > 1.5 || Math.abs(actual.y - expected.y) > 1.5
      || Math.abs(actual.width - expected.width) > 1.5 || Math.abs(actual.height - expected.height) > 1.5) {
      throw new Error(`${label} 藥丸座標或尺寸漂移：${JSON.stringify({ actual, expected })}`)
    }
    if (snapshot.viewport?.width !== baseline.viewport?.width || snapshot.viewport?.height !== baseline.viewport?.height) {
      throw new Error(`${label} layout viewport 被改變：${JSON.stringify({ actual: snapshot.viewport, expected: baseline.viewport })}`)
    }
  }
  const song = (id, revision, name, loading = false) => ({
    id, revision, name, artist: '璃音測試', durationMs: 180000, loading,
    cover: '', avatar: '', artworkReady: !loading,
  })
  const lines = [
    {
      time: 10,
      text: '粒子破碎驗證',
      trans: 'Particle transition QA',
      words: [
        { t: 10, d: 2, text: '粒子' },
        { t: 12, d: 3, text: '破碎' },
        { t: 15, d: 5, text: '驗證' },
      ],
    },
    { time: 20, text: '下一句', trans: 'Next line' },
  ]
  const state = (songData, playing, transition) => ({
    song: songData,
    lines,
    timed: true,
    positionMs: playing ? 12000 : 179800,
    playing,
    mirror: null,
    transition,
  })

  try {
    originalState = await evaluate('window.overlay.stateGet()')
    await send('Page.reload', { ignoreCache: true })
    await delay(900)
    await send('Performance.enable')
    await evaluate(`window.overlay.stateSet({ glass: { elasticity: 0.8 }, cfg: {
      songTransitionMode: 'shatter', transitionSpeed: 1,
      hoverActivationDistance: 14, clickThrough: false,
      lyricHighlightMode: 'fill', glowColor: '#00a8ff', textColor: '#ffffff',
      decorationMode: 'meteor', fxTilt: true, fxBreathe: true,
      fxVinylBounce: true, progressAnim: 'breathe',
      oceanWave: true, oceanWaveColor: '#45b9ff', oceanWaveOpacity: 0.32,
      oceanWaveAmplitude: 0.45, oceanWaveSpeed: 1,
    } })`)
    await evaluate(`window.overlay.room.qaState(${JSON.stringify(state(song('qa-a', 101, '測試歌曲 A'), true, {
      token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0,
    }))})`)
    await evaluate(`window.__lucentQaTick = setInterval(() => {
      window.overlay.room.qaTick({ positionMs: 12000 + (performance.now() % 4000), playing: true })
    }, 160)`)
    await delay(650)
    await evaluate('clearInterval(window.__lucentQaTick); window.__lucentQaTick = 0')
    await evaluate('window.overlay.room.qaTick({ positionMs: 12000, playing: true })')
    await delay(100)
    const idleBefore = await inspect()
    const rect = idleBefore.pillRect
    if (!rect?.width || !rect?.height) throw new Error(`可見藥丸尺寸無效：${JSON.stringify(rect)}`)
    if (idleBefore.flowFillChars.length === 0) throw new Error(`YRC flow fill did not reach lyric characters: ${JSON.stringify(idleBefore)}`)
    if (!(idleBefore.oceanLevel > 0) || idleBefore.oceanPlayState !== 'running') {
      throw new Error(`Ocean material did not follow real playback progress: ${JSON.stringify(idleBefore)}`)
    }
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: Math.max(1, rect.left - 40), y: rect.top + rect.height / 2,
    })
    await delay(80)
    const mouseFar = await inspect()
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: Math.max(1, rect.left - 6), y: rect.top + rect.height / 2,
    })
    await delay(80)
    const mouseNear = await inspect()
    await screenshot('00-fill-and-mouse')
    const metricsBefore = await send('Performance.getMetrics')
    await evaluate(`(() => {
      window.__lucentQaFrames = []
      window.__lucentQaLastFrame = 0
      const sample = (now) => {
        if (window.__lucentQaLastFrame) window.__lucentQaFrames.push(now - window.__lucentQaLastFrame)
        window.__lucentQaLastFrame = now
        window.__lucentQaFrame = requestAnimationFrame(sample)
      }
      window.__lucentQaFrame = requestAnimationFrame(sample)
    })()`)

    const outgoingState = JSON.stringify(state(song('qa-a', 101, '測試歌曲 A'), false, {
      token: 1, endedSongRevision: 101, endedSongId: 'qa-a', readySongRevision: 0,
    }))
    // Schedule the state change, detach the external QA debugger first, then
    // let the renderer enter capture-out so the production local debugger can
    // own the target without two CDP clients racing for Page.captureScreenshot.
    await evaluate(`setTimeout(() => window.overlay.room.qaState(${outgoingState}), 500)`)
    socket.close()
    await delay(1350)
    {
      const next = await connect()
      socket = next.socket
      send = next.send
    }
    const captureSettled = await inspect()
    const outgoing = captureSettled
    if (outgoing.phase !== 'phase-shatter-out') {
      throw new Error(`粒子擷取後未進入散開階段：${JSON.stringify(outgoing)}`)
    }
    assertPillGeometry('擷取後', outgoing, idleBefore)
    await delay(140)
    const outgoingSettled = await inspect()
    assertPillGeometry('散開中', outgoingSettled, idleBefore)
    if (outgoingSettled.contentOpacity > 0.05) {
      throw new Error(`完整藥丸在粒子漂散時仍然閃現：${JSON.stringify(outgoingSettled)}`)
    }
    await screenshot('01-shatter-out')
    const dormant = await waitForPhase('dormant')
    assertPillGeometry('停留中', dormant, idleBefore)
    if (dormant.canvasCount !== 1 || dormant.canvasAlphaSamples < 1) {
      throw new Error(`破碎粒子沒有停留到新素材完成：${JSON.stringify(dormant)}`)
    }
    if (dormant.oceanPlayState !== 'paused') throw new Error(`Ocean material kept moving during shatter: ${JSON.stringify(dormant)}`)
    await screenshot('02-dormant')

    const waitingArtworkSong = { ...song('qa-b', 202, '測試歌曲 B'), artworkReady: false }
    await evaluate(`window.overlay.room.qaState(${JSON.stringify(state(waitingArtworkSong, true, {
      token: 1, endedSongRevision: 101, endedSongId: 'qa-a', readySongRevision: 0,
    }))})`)
    await delay(220)
    const waitingForArtwork = await inspect()
    assertPillGeometry('等待素材', waitingForArtwork, idleBefore)
    if (waitingForArtwork.phase !== 'phase-dormant') {
      throw new Error(`素材尚未就緒卻提早重組：${JSON.stringify(waitingForArtwork)}`)
    }

    await evaluate(`window.overlay.room.qaState(${JSON.stringify(state(song('qa-b', 202, '測試歌曲 B'), true, {
      token: 1, endedSongRevision: 101, endedSongId: 'qa-a', readySongRevision: 202,
    }))})`)
    const incoming = await waitForPhase('shatter-in')
    assertPillGeometry('重組中', incoming, idleBefore)
    await delay(180)
    const incomingMid = await inspect()
    assertPillGeometry('重組中段', incomingMid, idleBefore)
    await screenshot('03-shatter-in')
    const idleAfter = await waitForPhase('idle')
    assertPillGeometry('重組完成', idleAfter, idleBefore)
    await screenshot('04-rebuilt')
    const frameTimes = await evaluate(`(() => {
      cancelAnimationFrame(window.__lucentQaFrame)
      return window.__lucentQaFrames || []
    })()`)
    const metricsAfter = await send('Performance.getMetrics')

    const metrics = (result) => Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]))
    const before = metrics(metricsBefore)
    const after = metrics(metricsAfter)
    const sortedFrames = [...frameTimes].sort((a, b) => a - b)
    const report = {
      idleBefore,
      mouseFar,
      mouseNear,
      outgoing,
      dormant,
      waitingForArtwork,
      incoming,
      incomingMid,
      idleAfter,
      nodeDelta: (after.Nodes || 0) - (before.Nodes || 0),
      jsHeapDelta: (after.JSHeapUsedSize || 0) - (before.JSHeapUsedSize || 0),
      frameTiming: {
        samples: frameTimes.length,
        averageMs: frameTimes.length ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length : 0,
        p95Ms: sortedFrames[Math.floor(sortedFrames.length * 0.95)] || 0,
        maxMs: sortedFrames.at(-1) || 0,
      },
      screenshots: fs.readdirSync(OUT_DIR).map((name) => path.join(OUT_DIR, name)),
    }
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    if (originalState) {
      await evaluate(`window.overlay.stateSet(${JSON.stringify({ glass: originalState.glass, cfg: originalState.cfg })})`).catch(() => {})
    }
    await evaluate('window.overlay.room.leave()').catch(() => {})
    socket.close()
    await disposeRuntime()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
