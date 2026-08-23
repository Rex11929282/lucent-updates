const fs = require('node:fs')
const path = require('node:path')
const WebSocket = require('ws')

const CDP_HTTP = process.env.LUCENT_QA_CDP || 'http://127.0.0.1:9223'
const OUT_DIR = path.resolve(__dirname, '..', '.qa-artifacts', 'shatter')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function connect() {
  const pages = await fetch(`${CDP_HTTP}/json`).then((response) => response.json())
  const page = pages.find((candidate) => candidate.type === 'page' && !candidate.url.includes('#console'))
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
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  return { socket, send }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const { socket, send } = await connect()
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
  const inspect = () => evaluate(`(() => {
    const wrap = document.querySelector('.song-transition-wrap')
    const capsule = document.querySelector('.capsule')
    const surface = capsule?.querySelector('.glass') || capsule?.querySelector('.plain')
    const lyric = document.querySelector('.lyrics__txt')
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
      canvasCount: document.querySelectorAll('.song-transition-canvas').length,
      canvasAlphaSamples,
      effectsPaused: !!capsule?.classList.contains('effects-paused'),
      contentHidden: !!document.querySelector('.content--shatter-hidden'),
      contentOpacity: content ? Number(getComputedStyle(content).opacity) : 0,
      nodeCount: document.querySelectorAll('*').length,
      pillRect: surface ? surface.getBoundingClientRect().toJSON() : null,
      surfaceTransform: surface?.style.transform || '',
      computedTransform: surface ? getComputedStyle(surface).transform : '',
      transformed,
      lyricFill: lyric?.style.getPropertyValue('--lyric-fill') || '',
    }
  })()`)
  const screenshot = async (name) => {
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
      fxVinylBounce: true, progressAnim: 'breathe'
    } })`)
    await evaluate(`window.overlay.room.qaState(${JSON.stringify(state(song('qa-a', 101, '測試歌曲 A'), true, {
      token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0,
    }))})`)
    await evaluate(`window.__lucentQaTick = setInterval(() => {
      window.overlay.room.qaTick({ positionMs: 12000 + (performance.now() % 4000), playing: true })
    }, 40)`)
    await delay(650)
    await evaluate('window.overlay.room.qaTick({ positionMs: 12000, playing: true })')
    await delay(100)
    const idleBefore = await inspect()
    const rect = idleBefore.pillRect
    if (!rect?.width || !rect?.height) throw new Error(`可見藥丸尺寸無效：${JSON.stringify(rect)}`)
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
    await evaluate('clearInterval(window.__lucentQaTick); window.__lucentQaTick = 0')
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

    await evaluate(`window.overlay.room.qaState(${JSON.stringify(state(song('qa-a', 101, '測試歌曲 A'), false, {
      token: 1, endedSongRevision: 101, endedSongId: 'qa-a', readySongRevision: 0,
    }))})`)
    const outgoing = await waitForPhase('shatter-out')
    await delay(140)
    const outgoingSettled = await inspect()
    if (outgoingSettled.contentOpacity > 0.05) {
      throw new Error(`完整藥丸在粒子漂散時仍然閃現：${JSON.stringify(outgoingSettled)}`)
    }
    await screenshot('01-shatter-out')
    const dormant = await waitForPhase('dormant')
    if (dormant.canvasCount !== 1 || dormant.canvasAlphaSamples < 1) {
      throw new Error(`破碎粒子沒有停留到新素材完成：${JSON.stringify(dormant)}`)
    }
    await screenshot('02-dormant')

    const waitingArtworkSong = { ...song('qa-b', 202, '測試歌曲 B'), artworkReady: false }
    await evaluate(`window.overlay.room.qaState(${JSON.stringify(state(waitingArtworkSong, true, {
      token: 1, endedSongRevision: 101, endedSongId: 'qa-a', readySongRevision: 0,
    }))})`)
    await delay(220)
    const waitingForArtwork = await inspect()
    if (waitingForArtwork.phase !== 'phase-dormant') {
      throw new Error(`素材尚未就緒卻提早重組：${JSON.stringify(waitingForArtwork)}`)
    }

    await evaluate(`window.overlay.room.qaState(${JSON.stringify(state(song('qa-b', 202, '測試歌曲 B'), true, {
      token: 1, endedSongRevision: 101, endedSongId: 'qa-a', readySongRevision: 202,
    }))})`)
    const incoming = await waitForPhase('shatter-in')
    await delay(180)
    const incomingMid = await inspect()
    await screenshot('03-shatter-in')
    const idleAfter = await waitForPhase('idle')
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
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
