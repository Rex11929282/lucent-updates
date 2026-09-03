const assert = require('node:assert/strict')
const WebSocket = require('ws')

const endpoint = process.env.LUCENT_SMOKE_CDP || 'http://127.0.0.1:9333'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function pages() {
  return fetch(`${endpoint}/json/list`).then((response) => response.json())
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
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }))
  }).then((result) => {
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
    return result.result.value
  })
  return { socket, evaluate }
}

function assertNormalized(state) {
  assert.ok(state && typeof state === 'object', 'A selected playback state must exist')
  for (const key of [
    'source', 'originSource', 'sourceAppId', 'sessionId', 'song', 'lines', 'timed',
    'positionMs', 'durationMs', 'playing', 'paused', 'playbackStatus', 'mirror',
    'syncStatus', 'transition', 'loading', 'error', 'capturedAt',
  ]) assert.ok(Object.prototype.hasOwnProperty.call(state, key), `Missing normalized field: ${key}`)
}

async function main() {
  const overlayPage = (await pages()).find((page) => page.type === 'page'
    && !page.url.includes('#console') && !page.url.includes('#audio-service'))
  assert.ok(overlayPage, 'Overlay page must exist')
  const connection = await connect(overlayPage)
  try {
    const result = await connection.evaluate(`(async () => {
      const compact = (state) => state ? {
        source: state.source,
        originSource: state.originSource,
        sourceAppId: state.sourceAppId,
        sessionId: state.sessionId,
        songId: state.song?.id ?? null,
        songRevision: state.song?.revision ?? null,
        syncStatus: state.syncStatus,
        hasCover: !!state.song?.cover,
        hasArtistImage: !!(state.song?.artistImageUrl || state.song?.avatar),
        playing: state.playing,
        normalizedKeys: Object.keys(state).sort(),
      } : null
      const seen = []
      const stop = window.overlay.room.onState((state) => {
        seen.push(compact(state))
      })
      const before = (await window.overlay.room.snapshot()).state
      await window.overlay.npSetFollow(before?.sourceAppId || null)
      await new Promise((resolve) => setTimeout(resolve, 1400))
      const manual = (await window.overlay.room.snapshot()).state
      await window.overlay.npSetFollow(null)
      await new Promise((resolve) => setTimeout(resolve, 1400))
      const automatic = (await window.overlay.room.snapshot()).state
      stop()
      return {
        before: compact(before),
        manual: compact(manual),
        automatic: compact(automatic),
        seen,
        state: automatic,
      }
    })()`)
    assertNormalized(result.state)
    assert.match(result.state.source, /^(desktop-(netease|spotify|youtube-music|generic)|internal-player|room-host)$/)
    assert.equal(result.manual.source, result.before.source)
    assert.equal(result.automatic.source, result.before.source)
    assert.equal(result.manual.songRevision, result.before.songRevision)
    assert.equal(result.automatic.songRevision, result.before.songRevision)
    assert.equal(result.seen.includes(null), false, 'Source switching must not publish an empty state')
    delete result.state
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    connection.socket.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
