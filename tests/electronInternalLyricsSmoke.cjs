const assert = require('node:assert/strict')
const WebSocket = require('ws')

const endpoint = process.env.LUCENT_SMOKE_CDP || 'http://127.0.0.1:9223'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function connectOverlay() {
  const pages = await fetch(`${endpoint}/json`).then((response) => response.json())
  const page = pages.find((item) => item.type === 'page' && !item.url.includes('#'))
  assert.ok(page, 'Overlay target must exist')
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
  const evaluate = async (expression) => {
    const id = nextId++
    const response = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }))
    })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Runtime.evaluate failed')
    return response.result.value
  }
  return { socket, evaluate }
}

async function waitFor(check, message, timeoutMs = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await check()
    if (value) return value
    await delay(100)
  }
  throw new Error(message)
}

function expectedLine(lines, positionMs) {
  const position = positionMs / 1000
  let selected = lines[0] || null
  for (const line of lines) {
    if (Number(line.time) > position) break
    selected = line
  }
  return selected?.text || ''
}

async function main() {
  const overlay = await connectOverlay()
  try {
    await overlay.evaluate('window.overlay.closeConsole()')
    const search = await overlay.evaluate(`window.overlay.netease.search('孤獨患者')`)
    assert.equal(search.ok, true)
    assert.ok(search.data.length > 0)

    let loaded = null
    for (const song of search.data.slice(0, 5)) {
      const result = await overlay.evaluate(`window.overlay.player.load(${JSON.stringify(song.id)})`)
      if (result?.ok) { loaded = song; break }
    }
    assert.ok(loaded, 'No searched track was playable with the current NetEase session')

    const playing = await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.room.snapshot()')
      const state = snapshot?.state
      return state?.source === 'internal-player' && state.playing && state.lines?.length ? state : null
    }, 'Internal playback did not publish a timed lyric snapshot')
    assert.equal(String(playing.song.id), String(loaded.id))
    assert.ok(playing.lines.some((line) => Array.isArray(line.words) && line.words.length > 0))

    await overlay.evaluate('window.overlay.player.pause()')
    const paused = await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.player.snapshot()')
      return snapshot && !snapshot.playing ? snapshot : null
    }, 'Internal playback did not pause')
    await delay(400)
    const pausedAgain = await overlay.evaluate('window.overlay.player.snapshot()')
    assert.ok(Math.abs(pausedAgain.positionMs - paused.positionMs) < 200)

    const forwardLine = playing.lines[Math.min(5, playing.lines.length - 1)]
    const forwardMs = Math.max(0, Math.round(Number(forwardLine.time || 0) * 1000 + 100))
    assert.equal((await overlay.evaluate(`window.overlay.player.seek(${forwardMs})`)).ok, true)
    const forward = await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.room.snapshot()')
      return Math.abs((snapshot?.state?.positionMs || 0) - forwardMs) < 500 ? snapshot.state : null
    }, 'Paused forward seek did not update the shared playback clock')
    const expectedForward = expectedLine(forward.lines, forwardMs).trim()
    const forwardText = await waitFor(
      async () => {
        const text = await overlay.evaluate(`document.querySelector('.lyrics__txt')?.textContent || ''`)
        return text.trim() === expectedForward ? text : ''
      },
      'Paused forward seek did not render a lyric',
    )
    assert.equal(forwardText.trim(), expectedForward)

    const backwardMs = Math.max(0, Math.round(Number(playing.lines[0]?.time || 0) * 1000 + 100))
    assert.equal((await overlay.evaluate(`window.overlay.player.seek(${backwardMs})`)).ok, true)
    const backward = await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.room.snapshot()')
      return Math.abs((snapshot?.state?.positionMs || 0) - backwardMs) < 500 ? snapshot.state : null
    }, 'Paused backward seek did not update the shared playback clock')
    const expectedBackward = expectedLine(backward.lines, backwardMs).trim()
    let lastBackwardText = ''
    let backwardText
    try {
      backwardText = await waitFor(
        async () => {
          lastBackwardText = await overlay.evaluate(`document.querySelector('.lyrics__txt')?.textContent || ''`)
          return lastBackwardText.trim() === expectedBackward ? lastBackwardText : ''
        },
        'Paused backward seek did not render a lyric',
      )
    } catch (error) {
      throw new Error(`${error.message}; expected=${JSON.stringify(expectedBackward)} actual=${JSON.stringify(lastBackwardText)}`)
    }
    assert.equal(backwardText.trim(), expectedBackward)

    assert.equal((await overlay.evaluate('window.overlay.player.play()')).ok, true)
    await waitFor(
      () => overlay.evaluate('window.overlay.player.snapshot()').then((snapshot) => snapshot?.playing),
      'Internal playback did not resume',
    )
    await overlay.evaluate('window.overlay.player.pause()')

    const switchSearch = await overlay.evaluate(`window.overlay.netease.search('起風了')`)
    assert.equal(switchSearch.ok, true)
    let switched = null
    for (const song of switchSearch.data.filter((item) => String(item.id) !== String(loaded.id)).slice(0, 6)) {
      const result = await overlay.evaluate(`window.overlay.player.load(${JSON.stringify(song.id)})`)
      if (!result?.ok) continue
      const state = await waitFor(async () => {
        const snapshot = await overlay.evaluate('window.overlay.room.snapshot()')
        return String(snapshot?.state?.song?.id) === String(song.id) && snapshot.state.lines?.length
          ? snapshot.state
          : null
      }, 'Second track did not publish its own lyric timeline')
      switched = { song, state }
      break
    }
    assert.ok(switched, 'No second track was playable with the current NetEase session')
    assert.notEqual(switched.state.lines[0]?.text, playing.lines[0]?.text)

    await overlay.evaluate(`(() => {
      window.__lucentReload = window.overlay.player.load(${JSON.stringify(loaded.id)})
      return true
    })()`)
    await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.room.snapshot()')
      return String(snapshot?.state?.song?.id) === String(loaded.id)
        && snapshot.state.song.loading === true
        && snapshot.state.lines?.length === 0
    }, 'Track change did not clear the previous lyric immediately')
    assert.equal((await overlay.evaluate('window.__lucentReload')).ok, true)
    const reloaded = await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.room.snapshot()')
      return String(snapshot?.state?.song?.id) === String(loaded.id) && snapshot.state.lines?.length
        ? snapshot.state
        : null
    }, 'Original track lyrics did not reload after switching back')
    assert.equal(reloaded.lines[0]?.text, playing.lines[0]?.text)

    await overlay.evaluate(`(() => {
      window.__lucentRapidSwitch = Promise.allSettled([
        window.overlay.player.load(${JSON.stringify(switched.song.id)}),
        window.overlay.player.load(${JSON.stringify(loaded.id)})
      ])
      return true
    })()`)
    await overlay.evaluate('window.__lucentRapidSwitch')
    const rapidFinal = await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.room.snapshot()')
      return String(snapshot?.state?.song?.id) === String(loaded.id) && snapshot.state.lines?.length
        ? snapshot.state
        : null
    }, 'Rapid switching allowed an older track to overwrite the newest track')
    assert.equal(rapidFinal.lines[0]?.text, playing.lines[0]?.text)
    const endSeekMs = Math.max(0, Number(rapidFinal.song.durationMs || 0) - 500)
    assert.equal((await overlay.evaluate(`window.overlay.player.seek(${endSeekMs})`)).ok, true)
    assert.equal((await overlay.evaluate('window.overlay.player.play()')).ok, true)
    await waitFor(
      () => overlay.evaluate('window.overlay.player.snapshot()').then((snapshot) => snapshot?.playing),
      'Track-end check did not begin playback',
    )
    const ended = await waitFor(async () => {
      const snapshot = await overlay.evaluate('window.overlay.player.snapshot()')
      return !snapshot?.playing && snapshot?.positionMs >= endSeekMs ? snapshot : null
    }, 'Track end did not stop the internal player')

    process.stdout.write(`${JSON.stringify({
      song: { id: loaded.id, name: loaded.name, artist: loaded.artist },
      lineCount: playing.lines.length,
      wordTimedLines: playing.lines.filter((line) => line.words?.length).length,
      pausedAtMs: paused.positionMs,
      forward: { positionMs: forwardMs, lyric: forwardText },
      backward: { positionMs: backwardMs, lyric: backwardText },
      resumed: true,
      switchedTo: { id: switched.song.id, name: switched.song.name, lineCount: switched.state.lines.length },
      previousLyricsCleared: true,
      rapidSwitchWinner: rapidFinal.song.id,
      trackEndedAtMs: ended.positionMs,
    }, null, 2)}\n`)
  } finally {
    overlay.socket.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
