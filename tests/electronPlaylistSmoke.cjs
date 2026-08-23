const assert = require('node:assert/strict')
const WebSocket = require('ws')

const endpoint = process.env.LUCENT_SMOKE_CDP || 'http://127.0.0.1:9223'
const phase = process.env.LUCENT_PLAYLIST_SMOKE_PHASE || 'seed'
const playlistName = process.env.LUCENT_PLAYLIST_SMOKE_NAME || '璃音重啟驗證'

async function connect(pageMatcher = (candidate) => candidate.type === 'page' && !candidate.url.includes('#')) {
  const pages = await fetch(`${endpoint}/json`).then((response) => response.json())
  const page = pages.find(pageMatcher)
  assert.ok(page, 'Requested Electron page target must exist')
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed')
    return result.result.value
  }
  return { socket, send, evaluate }
}

async function main() {
  const client = await connect()
  try {
    if (phase === 'privacy') {
      const before = await client.evaluate('window.overlay.privacy.summary()')
      assert.deepEqual(Object.keys(before).sort(), ['accountStored', 'libraryStored', 'settingsStored'])
      assert.equal(JSON.stringify(before).includes('Path'), false)
      await client.evaluate("window.overlay.stateSet({ cfg: { fontSize: 15 } })")
      await new Promise((resolve) => setTimeout(resolve, 600))
      assert.equal((await client.evaluate('window.overlay.privacy.summary()')).settingsStored, true)
      const cleared = await client.evaluate("window.overlay.privacy.erase('settings')")
      assert.deepEqual(cleared, { ok: true, scope: 'settings' })
      const after = await client.evaluate('window.overlay.privacy.summary()')
      assert.equal(after.settingsStored, false)
      const resetState = await client.evaluate('window.overlay.stateGet()')
      assert.equal(resetState.cfg.fontSize, 14)
      process.stdout.write(`${JSON.stringify({ phase, privateSummary: true, settingsReset: true })}\n`)
      return
    }

    if (phase === 'ui') {
      await client.evaluate('window.overlay.openConsole()')
      let consoleClient = null
      for (let attempt = 0; attempt < 30 && !consoleClient; attempt += 1) {
        try { consoleClient = await connect((candidate) => candidate.type === 'page' && candidate.url.includes('#console')) }
        catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
      }
      assert.ok(consoleClient, 'Console window did not open')
      try {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (await consoleClient.evaluate('!!document.body && document.querySelectorAll(".tab").length >= 3')) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        await consoleClient.evaluate(`(() => {
          const tab = [...document.querySelectorAll('.tab')].find((button) => button.textContent.trim() === '播放')
          if (!tab) throw new Error('找不到播放分頁：' + document.body.innerText.slice(0, 500))
          tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)
        await new Promise((resolve) => setTimeout(resolve, 300))
        await consoleClient.evaluate(`(() => {
          const section = [...document.querySelectorAll('.sect__head')].find((button) => button.textContent.includes('歌單'))
          if (!section) throw new Error('找不到歌單分類')
          section.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)
        await new Promise((resolve) => setTimeout(resolve, 300))
        const visible = await consoleClient.evaluate(`(() => ({
          text: document.body.innerText,
          hasRuntimeError: !!document.querySelector('vite-error-overlay'),
        }))()`)
        assert.match(visible.text, /網易雲歌單（唯讀）/)
        assert.match(visible.text, /璃音本機歌單/)
        assert.equal(visible.hasRuntimeError, false)
        process.stdout.write(`${JSON.stringify({ phase, renderedCloud: true, renderedLocal: true })}\n`)
      } finally {
        consoleClient.socket.close()
        await client.evaluate('window.overlay.closeConsole()')
      }
      return
    }

    if (phase === 'update-ui') {
      const updateSnapshot = await client.evaluate('window.overlay.updates.snapshot()')
      assert.equal(updateSnapshot.mode, 'disabled')
      assert.match(updateSnapshot.reason, /開發模式/)
      await client.evaluate('window.overlay.openConsole()')
      let consoleClient = null
      for (let attempt = 0; attempt < 30 && !consoleClient; attempt += 1) {
        try { consoleClient = await connect((candidate) => candidate.type === 'page' && candidate.url.includes('#console')) }
        catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
      }
      assert.ok(consoleClient, 'Console window did not open')
      try {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (await consoleClient.evaluate('!!document.body && document.querySelectorAll(".tab").length === 4')) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        await consoleClient.evaluate(`(() => {
          const tab = [...document.querySelectorAll('.tab')].find((button) => button.textContent.trim() === '更新')
          if (!tab) throw new Error('找不到更新分頁')
          tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })()`)
        await new Promise((resolve) => setTimeout(resolve, 250))
        const text = await consoleClient.evaluate('document.body.innerText')
        assert.match(text, /自動檢查更新/)
        assert.match(text, /開發模式不執行自動更新/)
        process.stdout.write(`${JSON.stringify({ phase, safeDisabled: true, renderedUpdateUi: true })}\n`)
      } finally {
        consoleClient.socket.close()
        await client.evaluate('window.overlay.closeConsole()')
      }
      return
    }

    if (phase === 'room-ui') {
      const hosted = await client.evaluate(`window.overlay.room.host({ roomName: '璃音 QA 房', code: '', hostName: 'QA 房主', port: 0 })`)
      assert.equal(hosted.ok, true)
      const snapshot = await client.evaluate('window.overlay.room.snapshot()')
      assert.equal(snapshot.mode, 'host')
      assert.equal(snapshot.protocolVersion, 2)
      assert.ok(Array.isArray(snapshot.queue))
      await client.evaluate('window.overlay.openConsole()')
      let consoleClient = null
      for (let attempt = 0; attempt < 30 && !consoleClient; attempt += 1) {
        try { consoleClient = await connect((candidate) => candidate.type === 'page' && candidate.url.includes('#console')) }
        catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
      }
      assert.ok(consoleClient, 'Console window did not open')
      try {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (await consoleClient.evaluate('!!document.body && document.body.innerText.includes("待播放歌曲")')) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        const text = await consoleClient.evaluate('document.body.innerText')
        assert.match(text, /待播放歌曲/)
        assert.match(text, /成員/)
        process.stdout.write(`${JSON.stringify({ phase, protocolVersion: snapshot.protocolVersion, renderedQueue: true })}\n`)
      } finally {
        consoleClient.socket.close()
        await client.evaluate('window.overlay.closeConsole()')
        await client.evaluate('window.overlay.room.leave()')
      }
      return
    }

    if (phase === 'seed') {
      const created = await client.evaluate(`window.overlay.localPlaylists.create(${JSON.stringify(playlistName)})`)
      assert.equal(created.ok, true, created.error)
      const added = await client.evaluate(`window.overlay.localPlaylists.add(${JSON.stringify(created.data.id)}, ${JSON.stringify({
        provider: 'netease', trackId: 'qa-163', name: '重啟後仍存在', artist: '璃音 QA', durationMs: 163000,
      })})`)
      assert.equal(added.ok, true, added.error)
      process.stdout.write(`${JSON.stringify({ phase, playlistId: created.data.id, itemId: added.data.id })}\n`)
      return
    }

    const listed = await client.evaluate('window.overlay.localPlaylists.list()')
    assert.equal(listed.ok, true, listed.error)
    const playlist = listed.data.find((item) => item.name === playlistName)
    assert.ok(playlist, 'Playlist must survive an Electron restart')
    const items = await client.evaluate(`window.overlay.localPlaylists.items(${JSON.stringify(playlist.id)})`)
    assert.equal(items.ok, true, items.error)
    assert.deepEqual(items.data.map((item) => [item.trackId, item.name, item.position]), [['qa-163', '重啟後仍存在', 0]])
    process.stdout.write(`${JSON.stringify({ phase, playlistId: playlist.id, persistedItems: items.data.length })}\n`)
  } finally {
    client.socket.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
