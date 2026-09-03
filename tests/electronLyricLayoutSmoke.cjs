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
const CDP_COMMAND_TIMEOUT_MS = 2500

async function waitFor(check, message, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check()
      if (value) return value
    } catch {}
    await delay(80)
  }
  throw new Error(message)
}

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
  const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', ...options })
  child.once('error', (error) => { child._launchError = error })
  return child
}

async function stopTree(child) {
  if (!child?.pid) return
  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    killer.once('exit', resolve)
    killer.once('error', resolve)
  })
}

async function pageFor(port, matcher) {
  return waitFor(async () => {
    const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
    return pages.find(matcher) || null
  }, `CDP page on ${port} did not become ready`, 30000)
}

async function connect(page) {
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  let nextId = 1
  const pending = new Map()
  const settlePending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
  }
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  socket.on('close', () => settlePending(new Error('CDP socket closed')))
  socket.on('error', (error) => settlePending(error instanceof Error ? error : new Error('CDP socket error')))
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Error('CDP socket is not open'))
      return
    }
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP command timed out: ${method}`))
    }, CDP_COMMAND_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    try {
      socket.send(JSON.stringify({ id, method, params }))
    } catch (error) {
      clearTimeout(timer)
      pending.delete(id)
      reject(error)
    }
  })
  const evaluate = (expression) => send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }).then((result) => {
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed')
    }
    return result.result.value
  })
  return { socket, send, evaluate }
}

function layoutSnapshot(id) {
  return {
    song: {
      id: 'layout-runtime-qa',
      revision: 1,
      name: '排版驗證歌曲',
      artist: 'Lucent QA',
      durationMs: 240000,
      cover: '',
      avatar: '',
      artworkReady: true,
    },
    lines: [{
      time: 10,
      text: '這是一段用來驗證長字級與雙語排版的歌詞內容',
      trans: 'A long bilingual lyric line for layout verification',
      words: [
        { t: 10, d: 0.5, text: '這是' },
        { t: 10.5, d: 0.5, text: '一段' },
        { t: 11, d: 0.5, text: '用來' },
        { t: 11.5, d: 0.5, text: '驗證' },
      ],
    }],
    timed: true,
    positionMs: 11000,
    playing: true,
    mirror: null,
    transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0 },
    layout: id,
  }
}

async function main() {
  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-lyric-layout-'))
  let vite = null
  let app = null
  let overlay = null
  let consolePage = null
  try {
    const vitePort = await freePort()
    const cdpPort = await freePort()
    const viteUrl = `http://127.0.0.1:${vitePort}`
    vite = startProcess(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(vitePort)], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await waitFor(() => fetch(viteUrl).then((response) => response.ok), 'Vite did not become ready', 25000)

    app = startProcess(electron, ['.', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(qaRoot, 'user-data')}`], {
      cwd: root,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: viteUrl,
        LUCENT_RUNTIME_QA: '1',
        LUCENT_DATA_PATH: path.join(qaRoot, 'lucent-data.db'),
      },
    })
    const overlayPage = await pageFor(cdpPort, (page) => page.type === 'page' && !page.url.includes('#'))
    overlay = await connect(overlayPage)
    await waitFor(() => overlay.evaluate('Boolean(window.overlay?.room?.qaState && document.querySelector(".capsule"))'), 'Overlay did not render')

    await overlay.evaluate(`window.overlay.stateSet({ cfg: {
      skin: 'glass', showVinyl: true, showSongName: true,
      maxWidth: 410, fontSize: 28,
      lyricAlign: 'auto', lyricFont: 'modern', translationFont: 'inherit',
      lyricLetterSpacing: 0.02, translationLetterSpacing: 0.01,
      lyricLineHeight: 1.35, translationLineHeight: 1.35,
      translationScale: 0.88, translationWeight: 700,
    } })`)

    await overlay.evaluate(`window.overlay.stateSet({ cfg: {
      lyricHighlightMode: 'fill', flowFillColorMode: 'cover-gradient', textStyle: 'slant', fxLineAnim: 'fade',
    } })`)
    await overlay.evaluate(`window.overlay.room.qaState(${JSON.stringify(layoutSnapshot('balanced'))})`)
    const typography = await waitFor(() => overlay.evaluate(`(() => {
      const capsule = document.querySelector('.capsule')
      const lyric = document.querySelector('.lyrics__txt')
      const character = document.querySelector('.flow-fill-cover .kchar')
      if (!capsule?.classList.contains('text-style-slant') || !lyric || !character) return null
      const lyricStyle = getComputedStyle(lyric)
      const characterStyle = getComputedStyle(character)
      return {
        transform: lyricStyle.transform,
        characterColor: characterStyle.color,
        characterFill: characterStyle.webkitTextFillColor,
      }
    })()`), 'Typography and cover-flow classes did not render')
    assert.notEqual(typography.transform, 'none', JSON.stringify(typography))
    assert.notEqual(typography.characterColor, 'rgba(0, 0, 0, 0)', JSON.stringify(typography))
    assert.notEqual(typography.characterFill, 'rgba(0, 0, 0, 0)', JSON.stringify(typography))

    const reports = []
    const screenshotDir = path.join(root, '.qa-artifacts')
    const screenshots = []
    const screenshotErrors = []
    const expected = {
      balanced: { align: 'center', translation: true },
      concert: { align: 'center', translation: true },
      bilingual: { align: 'flex-start', translation: true },
      compact: { align: 'center', translation: false },
      album: { align: 'flex-start', translation: true },
    }
    for (const [layout, expectation] of Object.entries(expected)) {
      await overlay.evaluate(`window.overlay.stateSet({ cfg: { lyricLayout: ${JSON.stringify(layout)} } })`)
      await overlay.evaluate(`window.overlay.room.qaState(${JSON.stringify(layoutSnapshot(layout))})`)
      const report = await waitFor(() => overlay.evaluate(`(() => {
        const capsule = document.querySelector('.capsule')
        const surface = capsule?.querySelector('.glass') || capsule?.querySelector('.plain')
        const content = capsule?.querySelector('.content')
        const lyrics = capsule?.querySelector('.lyrics')
        const main = capsule?.querySelector('.lyrics__txt')
        const trans = capsule?.querySelector('.lyrics__trans')
        const song = capsule?.querySelector('.songname')
        if (!capsule || !surface || !content || !lyrics || !main) return null
        const a = surface.getBoundingClientRect()
        const b = content.getBoundingClientRect()
        const c = main.getBoundingClientRect()
        const d = trans?.getBoundingClientRect() || null
        const e = song?.getBoundingClientRect() || null
        const within = (rect, outer) => !rect || (rect.left >= outer.left - 1 && rect.right <= outer.right + 1 && rect.top >= outer.top - 1 && rect.bottom <= outer.bottom + 1)
        const songNameWithinCurve = (() => {
          if (!e) return true
          const className = [...capsule.classList].find((value) => value.startsWith('name-')) || 'name-tl'
          if (className === 'name-tc' || className === 'name-bc') return true
          const radius = Math.min(a.width / 2, a.height / 2)
          const bottom = className === 'name-bl' || className === 'name-br'
          const right = className === 'name-tr' || className === 'name-br'
          const edgeDistance = Math.max(0, Math.min(radius, bottom ? a.bottom - e.bottom : e.top - a.top))
          const safeInset = radius - Math.sqrt(Math.max(0, radius * radius - (radius - edgeDistance) ** 2))
          return right ? e.right <= a.right - safeInset + 1 : e.left >= a.left + safeInset - 1
        })()
        return {
          layout: ${JSON.stringify(layout)},
          nameClass: [...capsule.classList].find((value) => value.startsWith('name-')) || '',
          hasLayoutClass: capsule.classList.contains('layout-${layout}'),
          alignItems: getComputedStyle(lyrics).alignItems,
          mainFont: getComputedStyle(main).fontFamily,
          mainLineHeight: getComputedStyle(main).lineHeight,
          songName: e && { left: e.left, top: e.top, right: e.right, bottom: e.bottom, fontSize: getComputedStyle(song).fontSize },
          surface: { left: a.left, top: a.top, right: a.right, bottom: a.bottom, width: a.width, height: a.height },
          content: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height },
          contentWithinSurface: within(b, a),
          songNameWithinSurface: within(e, a),
          songNameWithinCurve,
          mainWithinContent: within(c, b),
          translationPresent: Boolean(trans),
          translationWithinContent: within(d, b),
        }
      })()`).then((report) => report || null), `${layout} layout did not render`)
      assert.equal(report.hasLayoutClass, true, `${layout} class must reach the real capsule`)
      assert.equal(report.alignItems, expectation.align, `${layout} alignment must use its preset`)
      assert.equal(report.translationPresent, expectation.translation, `${layout} translation visibility must match the preset`)
      assert.match(report.mainFont, /Segoe UI|Microsoft JhengHei|sans-serif/i, `${layout} must resolve its system font stack`)
      assert.ok(report.surface.width > 0 && report.surface.height > 0, `${layout} pill must have visible dimensions`)
      assert.equal(report.contentWithinSurface, true, `${layout} content must stay within the pill`)
      assert.equal(report.songNameWithinCurve, true, `${layout} song name must stay inside the curved pill corner: ${JSON.stringify(report)}`)
      assert.equal(report.mainWithinContent, true, `${layout} main lyric must stay within content`)
      assert.equal(report.translationWithinContent, true, `${layout} translation must stay within content`)
      reports.push(report)
      if (['concert', 'compact', 'album'].includes(layout)) {
        try {
          const image = await overlay.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
          const target = path.join(screenshotDir, `lyric-layout-${layout}.png`)
          fs.mkdirSync(screenshotDir, { recursive: true })
          fs.writeFileSync(target, Buffer.from(image.data, 'base64'))
          screenshots.push(target)
        } catch (error) {
          screenshotErrors.push({ layout, error: String(error?.message || error) })
        }
      }
    }

    await overlay.evaluate('window.overlay.openConsole()')
    const consoleTarget = await pageFor(cdpPort, (page) => page.type === 'page' && page.url.includes('#console'))
    consolePage = await connect(consoleTarget)
    await waitFor(() => consolePage.evaluate(`(() => {
      const button = [...document.querySelectorAll('.console-nav button')]
        .find((item) => item.textContent.includes('首頁'))
      if (!button) return false
      button.click()
      return true
    })()`), 'Console home navigation did not render')
    const preview = await waitFor(() => consolePage.evaluate(`(() => {
      const capsule = document.querySelector('.console-capsule-preview .capsule')
      const surface = capsule?.querySelector('.glass') || capsule?.querySelector('.plain')
      const rect = surface?.getBoundingClientRect()
      const layoutClass = [...(capsule?.classList || [])].find((value) => value.startsWith('layout-'))
      return capsule && rect?.width > 0 && rect?.height > 0 && layoutClass === 'layout-album'
        ? { layoutClass, width: rect.width, height: rect.height, text: capsule.textContent }
        : null
    })()`), 'Workbench preview did not receive the current lyric layout')
    assert.equal(preview.layoutClass, 'layout-album')
    assert.ok(preview.width > 0 && preview.height > 0)
    assert.match(preview.text, /璃音 Lucent/)
    assert.match(preview.text, /讓每一句旋律浮在桌面/)
    assert.match(preview.text, /即時歌詞・液態玻璃・一起共賞/)

    const titlePositions = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']
    const titlePositionReports = []
    for (const position of titlePositions) {
      await overlay.evaluate(`window.overlay.stateSet({ cfg: { songNamePos: ${JSON.stringify(position)} } })`)
      const report = await waitFor(() => overlay.evaluate(`(() => {
        const capsule = document.querySelector('.capsule')
        const surface = capsule?.querySelector('.glass') || capsule?.querySelector('.plain')
        const song = capsule?.querySelector('.songname')
        if (!capsule || !surface || !song) return null
        const a = surface.getBoundingClientRect()
        const e = song.getBoundingClientRect()
        const className = [...capsule.classList].find((value) => value.startsWith('name-')) || ''
        const radius = Math.min(a.width / 2, a.height / 2, Number.parseFloat(getComputedStyle(surface).borderTopLeftRadius) || Infinity)
        const bottom = className === 'name-bl' || className === 'name-bc' || className === 'name-br'
        const right = className === 'name-tr' || className === 'name-br'
        const centered = className === 'name-tc' || className === 'name-bc'
        const edgeDistance = Math.max(0, Math.min(radius, bottom ? a.bottom - e.bottom : e.top - a.top))
        const safeInset = radius - Math.sqrt(Math.max(0, radius * radius - (radius - edgeDistance) ** 2))
        const curveSafe = centered || (right ? e.right <= a.right - safeInset + 1 : e.left >= a.left + safeInset - 1)
        return {
          position: ${JSON.stringify(position)},
          className,
          curveSafe,
          surface: { left: a.left, top: a.top, right: a.right, bottom: a.bottom, width: a.width, height: a.height, radius },
          title: { left: e.left, top: e.top, right: e.right, bottom: e.bottom },
          safeInset,
          cornerInset: getComputedStyle(capsule).getPropertyValue('--song-corner-inset'),
        }
      })()`).then((value) => value?.className === `name-${position}` ? value : null), `${position} song name did not render`)
      assert.equal(report.className, `name-${position}`)
      assert.equal(report.curveSafe, true, JSON.stringify(report))
      titlePositionReports.push(report)
    }

    process.stdout.write(`${JSON.stringify({ layouts: reports, preview, titlePositions: titlePositionReports, screenshots, screenshotErrors }, null, 2)}\n`)
  } finally {
    try { await overlay?.evaluate('window.overlay.closeConsole()') } catch {}
    consolePage?.socket.close()
    overlay?.socket.close()
    await stopTree(app)
    await stopTree(vite)
    fs.rmSync(qaRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
