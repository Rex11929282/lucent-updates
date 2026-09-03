# 璃音 Lucent 房間成員自動重連 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 房間成員在網路短暫中斷、主持人重開房間或電腦休眠恢復後，自動回到原房間並重新取得主持人的完整權威狀態，不以本機播放覆蓋房間藥丸。

**Architecture:** 將重連延遲抽成無副作用的 `roomReconnect` 純函式；`Room` 保留成員加入目標與最後權威快照，只有非使用者主動離房且非房號拒絕時排程單一重連 Timer。重新取得 `welcome` 後以完整 queue／capabilities／state 覆寫暫存值；Renderer 只展示連線狀態，仍由既有 `PlaybackCoordinator` 維持 `member` 模式下房主優先。

**Tech Stack:** Node test、WebSocket (`ws`)、Electron 主程序、React 19。

## Global Constraints

- 不接入正式 Provider、不改變桌面網易雲偵測與來源優先級。
- 成員斷線期間保留最後一份房主狀態，不能提升任何成員本機來源。
- 只有一個重連 Timer；離房、拒絕、開新房與程式結束時必須取消它。
- 不重送未確認的播放命令，避免重連後重複執行。
- 不新增遊戲功能、不傳遞 Cookie、播放 URL 或音訊資料。

---

### Task 1: 可測試的重連延遲策略

**Files:**
- Create: `shared/roomReconnect.cjs`
- Create: `tests/roomReconnect.test.cjs`

**Interfaces:**
- Produces `reconnectDelay(attempt, { baseMs, maxMs })`。
- `attempt` 為從 0 起的非負整數；預設回傳 `1000, 2000, 4000, 8000, 10000…`。

- [x] **Step 1: 寫入失敗測試**

```js
const { reconnectDelay } = require('../shared/roomReconnect.cjs')

test('reconnect delay grows predictably and remains capped', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((attempt) => reconnectDelay(attempt)),
    [1000, 2000, 4000, 8000, 10000, 10000])
})

test('invalid attempts and options stay within safe bounds', () => {
  assert.equal(reconnectDelay(-1), 1000)
  assert.equal(reconnectDelay(1, { baseMs: 500, maxMs: 750 }), 750)
})
```

- [x] **Step 2: 確認紅燈**

Run: `node --test tests/roomReconnect.test.cjs`

Expected: FAIL with `Cannot find module '../shared/roomReconnect.cjs'`.

- [x] **Step 3: 實作最小純函式**

```js
function reconnectDelay(attempt, { baseMs = 1000, maxMs = 10000 } = {}) {
  const base = Math.max(1, Number(baseMs) || 1000)
  const max = Math.max(base, Number(maxMs) || 10000)
  const exponent = Math.max(0, Math.floor(Number(attempt) || 0))
  return Math.min(max, base * (2 ** exponent))
}
module.exports = { reconnectDelay }
```

- [x] **Step 4: 確認綠燈**

Run: `node --test tests/roomReconnect.test.cjs`

Expected: all tests PASS.

### Task 2: Room 成員保留狀態並自動重連

**Files:**
- Modify: `electron/room.cjs`
- Modify: `tests/roomCommands.test.cjs`
- Modify: `tests/roomReconnect.test.cjs`

**Interfaces:**
- `Room` adds `reconnectTimer`, `reconnectAttempt`, `joinTarget`, `intentionalClose`.
- `Room.join({ ip, port, code, name })` records one join target then calls private `_connectMember()`.
- `Room.close()` is a deliberate leave and clears reconnect state plus retained room snapshot.
- A reconnecting status has `{ mode: 'member', connected: false, reconnecting: true, attempt, retryInMs }`.

- [x] **Step 1: 寫入失敗測試**

```js
test('member close preserves host snapshot and schedules one reconnect', async () => {
  const timers = []
  const room = createRoom({
    WebSocket: FakeWebSocket,
    setTimeoutFn: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearTimeoutFn: () => {},
  })
  room.join({ ip: '127.0.0.1', port: 8787, code: '123', name: '聽眾' })
  room.ws.emit('message', message({ type: 'welcome', roomId: 'r', roomRevision: 4, queue: [] }))
  room.ws.emit('message', message({ type: 'state', roomRevision: 4, state: { song: { id: '1' }, playing: true } }))
  room.ws.emit('close')
  assert.equal(room.snapshot().mode, 'member')
  assert.equal(room.snapshot().state.song.id, '1')
  assert.deepEqual(timers.map((timer) => timer.ms), [1000])
})

test('leave and denial cancel reconnect instead of reopening the socket', () => {
  // exercise close() and a denied message; neither may leave a timer pending
})
```

- [x] **Step 2: 確認紅燈**

Run: `node --test tests/roomReconnect.test.cjs tests/roomCommands.test.cjs`

Expected: FAIL because `Room` has no reconnect state or injected timers.

- [x] **Step 3: 實作最小重連生命週期**

```js
_scheduleReconnect() {
  if (this.reconnectTimer || this.intentionalClose || this.mode !== 'member' || !this.joinTarget) return
  const retryInMs = reconnectDelay(this.reconnectAttempt++)
  this.emit('status', { mode: 'member', connected: false, reconnecting: true,
    attempt: this.reconnectAttempt, retryInMs })
  this.reconnectTimer = this.setTimeoutFn(() => {
    this.reconnectTimer = null
    this._connectMember()
  }, retryInMs)
}
```

The WebSocket `close` handler only nulls the closed socket, emits a reconnecting status, and calls `_scheduleReconnect`; it must not call `close()`. On `welcome`, set `reconnectAttempt = 0`, replace queue/capabilities, and emit `{ connected: true, reconnecting: false }`. On `denied`, set `intentionalClose = true`, cancel the timer, set `mode = null`, and clear only the connection target. `close()` sets `intentionalClose = true` before closing its socket, cancels the exact timer, then clears state as it does today.

- [x] **Step 4: 確認綠燈**

Run: `node --test tests/roomReconnect.test.cjs tests/roomCommands.test.cjs tests/roomLeave.test.mjs`

Expected: all tests PASS; existing room command and leave behavior remains unchanged.

### Task 3: 控制台連線提示與來源鎖定回歸

**Files:**
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/useRoom.js`
- Modify: `tests/roomReconnect.test.cjs`
- Modify: `tests/roomQueueWiring.test.mjs`

**Interfaces:**
- `useRoom` merges reconnect status without clearing `state`, `queue`, or `capabilities`.
- Member Room UI shows `正在重新連線（第 N 次，約 X 秒）` while reconnecting, otherwise preserves existing connected UI.

- [x] **Step 1: 寫入失敗測試**

```js
test('console exposes a Traditional Chinese reconnecting notice without a local-source fallback', () => {
  const ui = fs.readFileSync(path.join(root, 'src', 'ConsoleWindow.jsx'), 'utf8')
  assert.match(ui, /正在重新連線/)
  assert.match(ui, /status\.reconnecting/)
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8')
  assert.match(main, /playback\.setMode\('member'\)/)
})
```

- [x] **Step 2: 確認紅燈**

Run: `node --test tests/roomReconnect.test.cjs tests/roomQueueWiring.test.mjs`

Expected: FAIL because the reconnecting UI message is absent.

- [x] **Step 3: 加入最小 UI 狀態**

```jsx
{status.mode === 'member' && status.reconnecting && (
  <div className="hint">正在重新連線（第 {status.attempt} 次，約 {Math.ceil(status.retryInMs / 1000)} 秒）</div>
)}
```

Keep the existing member restriction text visible. Do not clear `state` in `useRoom` on a status-only reconnect event; only an explicit room leave clears it.

- [x] **Step 4: 確認綠燈與建置**

Run: `node --test tests/roomReconnect.test.cjs tests/roomQueueWiring.test.mjs && npm.cmd run build`

Expected: tests PASS and Vite build succeeds.

### Task 4: 隔離的兩程序 Runtime 驗證

**Files:**
- Create: `tests/electronRoomReconnectSmoke.cjs`
- Modify: `package.json`

**Interfaces:**
- A Node smoke process launches an isolated host and member Electron pair with unique user-data paths and CDP ports.
- The member joins, host is stopped, a fresh host starts on the same port, then the member receives `welcome` and a fresh host state without manual join.

- [x] **Step 1: 寫入 smoke 驗收腳本**

```js
assert.equal(await member.evaluate('window.overlay.room.snapshot()').then((s) => s.mode), 'member')
await stopHost()
await waitFor(() => member.evaluate('window.overlay.room.snapshot()').then((s) => s.mode === 'member'))
await startHostAgain()
await waitFor(() => member.evaluate('window.overlay.room.snapshot()').then((s) => s.state?.song?.id === 'host-song-2'))
```

The script must create unique temporary directories, stop only the PIDs it spawned, and never target the user’s normal Lucent process.

- [x] **Step 2: Run complete verification**

Run: `npm.cmd test`

Expected: all test suites PASS.

Run: `npm.cmd run build`

Expected: Vite build succeeds.

Run: `node tests/electronRoomReconnectSmoke.cjs`

Expected: `{ "reconnected": true, "hostStateRestored": true }` with both spawned processes shut down.

## Self-Review

- Scope coverage: Tasks 1–3 implement and expose the missing member reconnect behavior; Task 4 verifies an actual two-process host/member recovery.
- Safety: reconnect does not resend commands, elevate member local playback, expose credentials, or interact with music Provider code.
- Boundaries: no visual redesign, new streaming feature, game feature, or EXE packaging is included.
- Placeholder scan: no incomplete API names or unspecified persistence rules remain; retry sequence, cancellation paths, and expected runtime result are explicit.
