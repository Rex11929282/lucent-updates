// Adversarial smoke test for the preload/IPC trust boundary.
//
// Run with:  npm run test:ipc-fuzz:runtime
//
// Why this exists: the room socket handler used to read a field off whatever
// JSON.parse returned. Sending the literal `null` threw a TypeError that wedged
// the whole main process — silently, with a green test suite. That raised the
// obvious question for the other boundary a renderer can reach: the ~64 IPC
// channels exposed through the preload bridge.
//
// ipcMain.handle wraps its handler in a promise, so a throw becomes a rejection
// the renderer sees rather than an uncaught exception. This script proves that
// empirically instead of trusting it, by calling the bridge with arguments no
// correct caller would pass and checking the main process still answers.
//
// Deliberately excluded: app:quit, privacy clears, update download/install,
// NetEase logout, room host/join/leave, and player loads. This must be safe to
// run against a normal install without destroying data or making noise.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))
const WebSocket = require('ws')

// Do not attach this smoke test to the maintainer's normal Lucent instance.
// The app deliberately enforces a single-instance lock, so using the default
// profile here makes the test fail with an unreachable CDP endpoint whenever
// Lucent is already open. A temporary profile also keeps the fuzz calls away
// from the user's settings and credentials.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-ipc-fuzz-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  // Chromium/Electron can reject some low Windows ports even when a short
  // TcpListener probe succeeds. Probe explicit high ports instead of asking
  // Windows for port 0 (this machine's allocator returns low ports).
  const preferred = [44332, 44333, 44334, 44335, 44336]
  const first = 40000 + (Date.now() % 10000)
  const candidates = [...preferred, ...Array.from({ length: 100 }, (_, index) => (
    40000 + ((first - 40000 + index) % 10000)
  ))]
  for (const candidate of candidates) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer()
      server.once('error', (error) => {
        try { server.close() } catch {}
        reject(error)
      })
      server.listen(candidate, '127.0.0.1', () => {
        server.close((error) => error ? reject(error) : resolve(candidate))
      })
    }).catch(() => null)
    if (port) return port
  }
  throw new Error('could not find an available high port')
}

const requestedPort = Number(process.env.LUCENT_SMOKE_PORT)
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : await freePort()
const activePortFile = path.join(userData, 'DevToolsActivePort')

function runtimePort() {
  try {
    const value = Number(fs.readFileSync(activePortFile, 'utf8').split(/\r?\n/, 1)[0])
    return Number.isInteger(value) && value > 0 ? value : PORT
  } catch {
    return PORT
  }
}

const CALLS = [
  'stateGet()',
  'stateSet(null)', 'stateSet([])', 'stateSet("x")', 'stateSet(0)', 'stateSet(undefined)',
  'setSize(null,null,null,null)', 'setSize("a","b")', 'setSize(NaN,NaN)',
  'setPosition(null,null)', 'setPosition("x","y")',
  'setIgnoreMouse(null)', 'setIgnoreMouse("yes")',
  'getBounds()',
  'npSetFollow(null)', 'npSetFollow({})', 'npSetFollow([])',
  'room.lanIp()', 'room.lanIps()', 'room.snapshot()', 'room.pendingOffers()',
  'room.setCapabilities(null)', 'room.setCapabilities({memberId:null,capabilities:null})',
  'room.offerStyle(null)', 'room.offerStyle({targetId:null,name:null})',
  'room.respondStyleOffer(null)', 'room.respondStyleOffer({requestId:null,accepted:"yes"})',
  'room.command(null)', 'room.command("x", null)',
  'player.snapshot()', 'player.seek(null)', 'player.seek("x")',
  'player.setVolume(null)', 'player.setVolume(99)', 'player.setVolume("loud")',
  'updates.snapshot()',
  'netease.search(null)', 'netease.lyric(null)', 'netease.loginStatus()',
  'netease.playlistTracks(null)', 'netease.userPlaylists(null)',
  'localPlaylists.list()',
]

async function connect() {
  const deadline = Date.now() + 20000
  let lastError = null
  let lastTargets = []
  let ws = null
  while (Date.now() < deadline) {
    ws = null
    try {
      const port = runtimePort()
      const list = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
        .then((r) => r.json())
      lastTargets = list.map((target) => `${target.type}:${target.url}`).slice(0, 8)
      const page = list.find((t) => t.type === 'page' && t.url.includes('#console'))
      if (!page) throw new Error('console window not found')
      ws = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((res, rej) => {
        let settled = false
        const finish = (callback, value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          ws.off('open', onOpen)
          ws.off('error', onError)
          callback(value)
        }
        const onOpen = () => finish(res)
        const onError = (error) => finish(rej, error)
        const timer = setTimeout(() => finish(rej, new Error('websocket open timeout')), 2000)
        ws.once('open', onOpen)
        ws.once('error', onError)
      })
      break
    } catch (error) {
      lastError = error
      if (ws) {
        // `ws.close()` on a socket that never opened emits a second error after
        // the one-shot listener above has been removed. Keep teardown quiet so
        // a target race is reported as a retry, not as an uncaught Node error.
        ws.on('error', () => {})
        try { ws.terminate() } catch {}
      }
      await sleep(250)
    }
  }
  if (!ws) {
    const targetInfo = lastTargets.length ? ` targets=${JSON.stringify(lastTargets)}` : ''
    throw new Error(`${lastError?.message || 'console CDP connection timed out'} (port=${runtimePort()})${targetInfo}`)
  }
  let id = 0
  const evaluate = (expression) => new Promise((res, rej) => {
    const mine = ++id
    const timer = setTimeout(() => rej(new Error('EVAL TIMEOUT')), 8000)
    const onMessage = (raw) => {
      const m = JSON.parse(raw)
      if (m.id !== mine) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      res(m.result?.exceptionDetails ? 'THREW' : m.result?.result?.value)
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({
      id: mine, method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }))
  })
  return { ws, evaluate }
}

// On Windows use Electron's real binary instead of the npm .cmd shim. The
// shim creates a cmd/node process tree that `child.kill()` does not reliably
// reap, leaving a test Electron instance behind and poisoning later runs.
const defaultExecutable = process.platform === 'win32'
  ? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(root, 'node_modules', '.bin', 'electron')
const executable = process.env.LUCENT_SMOKE_EXECUTABLE || defaultExecutable
const runtimeArgs = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`]
// Electron command-line switches are safest before the app path. This also
// makes the temporary profile deterministic for the real binary and for the
// npm CLI alike.
const executableArgs = process.env.LUCENT_SMOKE_EXECUTABLE
  ? runtimeArgs
  : [...runtimeArgs, '.']
const electron = spawn(
  executable,
  executableArgs,
  { cwd: root, env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'pipe'] },
)
console.log(`started ${path.basename(executable)} pid=${electron.pid} requestedCdpPort=${PORT} profile=${userData}`)
let stderr = ''
let exitInfo = null
electron.stderr.on('data', (b) => { stderr += b.toString() })
electron.once('exit', (code, signal) => { exitInfo = { code, signal } })

const shutdown = (code) => {
  try { electron.kill('SIGKILL') } catch {}
  try { fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch {}
  process.exit(code)
}

try {
  await sleep(13000)
  let session = await connect()
  console.log(`fuzzing ${CALLS.length} bridge calls with hostile arguments\n`)

  const wedged = []
  let resolved = 0
  let rejected = 0

  for (const call of CALLS) {
    const expression = `Promise.resolve().then(() => window.overlay.${call})
      .then(v => 'RESOLVED ' + String(JSON.stringify(v)).slice(0,60))
      .catch(e => 'REJECTED ' + String(e && e.message).slice(0,70))`
    let out
    try {
      out = await session.evaluate(expression)
    } catch (error) {
      console.log(`  ${call.padEnd(50)} *** ${error.message} ***`)
      wedged.push(call)
      try { session.ws.close() } catch {}
      try { session = await connect() } catch {
        console.log('\n!! the main process is no longer reachable at all')
        break
      }
      continue
    }
    if (out === 'THREW' || String(out).startsWith('REJECTED')) rejected += 1
    else resolved += 1
    console.log(`  ${call.padEnd(50)} ${out}`)
  }

  let aliveAfter = false
  try { aliveAfter = (await session.evaluate(`'alive'`)) === 'alive' } catch {}
  try { session.ws.close() } catch {}

  console.log('\n================ RESULT ================')
  console.log(`  resolved cleanly        : ${resolved}`)
  console.log(`  rejected cleanly        : ${rejected}`)
  console.log(`  wedged the main process : ${wedged.length}`)
  console.log(`  main process afterwards : ${aliveAfter ? 'alive' : 'DEAD'}`)

  const crashed = /uncaught|UnhandledPromiseRejection/i.test(stderr)
  if (crashed) console.log('\nstderr reported an uncaught failure:\n' + stderr.slice(-1200))

  if (wedged.length || !aliveAfter || crashed) {
    console.log('\nFAIL: a hostile IPC argument disturbed the main process.')
    shutdown(1)
  }
  console.log('\nPASS: every hostile argument was contained.')
  shutdown(0)
} catch (error) {
  console.error('smoke test could not run:', error.message, exitInfo ? `process exited (${JSON.stringify(exitInfo)})` : 'process still running')
  if (stderr) console.error(stderr.slice(-800))
  shutdown(1)
}
