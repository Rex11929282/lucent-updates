const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const WebSocket = require('ws')

const endpoint = process.env.LUCENT_SMOKE_CDP || 'http://127.0.0.1:9223'
const output = path.join(__dirname, '..', '.qa-artifacts', 'phase1-smoke.png')

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
    if (!message.id || !pending.has(message.id)) return
    const request = pending.get(message.id)
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
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
    return response.result.value
  }
  return { socket, send, evaluate }
}

async function main() {
  const overlayPage = (await pages()).find((page) => page.type === 'page' && !page.url.includes('#console'))
  assert.ok(overlayPage, 'Overlay page must exist')
  const overlay = await connect(overlayPage)
  let consoleConnection = null

  try {
    const runtime = await overlay.evaluate(`(async () => {
      const state = await window.overlay.stateGet()
      const capsule = document.querySelector('.capsule')
      const surface = capsule?.querySelector('.glass') || capsule?.querySelector('.plain')
      const rect = surface?.getBoundingClientRect()
      return {
        hasOffset: Object.prototype.hasOwnProperty.call(state.cfg, 'offset'),
        hasBorderRGB: Object.prototype.hasOwnProperty.call(state.cfg, 'borderRGB'),
        hasProgressRGB: Object.prototype.hasOwnProperty.call(state.cfg, 'rgbBar'),
        capsuleCount: document.querySelectorAll('.capsule').length,
        width: rect?.width || 0,
        height: rect?.height || 0,
        source: state.source || null,
      }
    })()`)

    assert.equal(runtime.hasOffset, false)
    assert.equal(runtime.hasBorderRGB, false)
    assert.equal(runtime.hasProgressRGB, true)
    assert.equal(runtime.capsuleCount, 1)
    assert.ok(runtime.width > 0 && runtime.height > 0)

    const screenshot = await overlay.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, Buffer.from(screenshot.data, 'base64'))

    await overlay.evaluate('window.overlay.openConsole()')
    let consolePage = null
    for (let attempt = 0; attempt < 30 && !consolePage; attempt += 1) {
      await delay(100)
      consolePage = (await pages()).find((page) => page.type === 'page' && page.url.includes('#console'))
    }
    assert.ok(consolePage, 'Settings window must open')
    consoleConnection = await connect(consolePage)
    let consoleRuntime = null
    for (let attempt = 0; attempt < 30; attempt += 1) {
      consoleRuntime = await consoleConnection.evaluate(`(async () => {
        const state = await window.overlay.stateGet()
        return {
          ready: document.readyState,
          hasOffset: Object.prototype.hasOwnProperty.call(state.cfg, 'offset'),
          hasBorderRGB: Object.prototype.hasOwnProperty.call(state.cfg, 'borderRGB'),
          textLength: document.body.innerText.length,
        }
      })()`)
      if (consoleRuntime.textLength > 20) break
      await delay(100)
    }
    assert.match(consoleRuntime.ready, /^(interactive|complete)$/)
    assert.equal(consoleRuntime.hasOffset, false)
    assert.equal(consoleRuntime.hasBorderRGB, false)
    assert.ok(consoleRuntime.textLength > 20)

    process.stdout.write(`${JSON.stringify({ runtime, consoleRuntime, screenshot: output }, null, 2)}\n`)
  } finally {
    await overlay.evaluate('window.overlay.closeConsole()').catch(() => {})
    consoleConnection?.socket.close()
    overlay.socket.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
