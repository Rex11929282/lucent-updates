# 房間權威時鐘同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓所有房間成員以房主權威播放時鐘同步進度與歌詞，降低換句延遲且不累積漂移。

**Architecture:** 在既有 WebSocket 房間協定新增 clock ping/pong；成員端用最小 RTT 樣本估算主機與本機單調時鐘偏移，播放時鐘只由這個校正後的時間推算。房主在 seek 與切歌訊息加上未來生效時間，成員只在該時間統一提交狀態。

**Tech Stack:** Electron、Node.js、`ws`、React、Node built-in test runner。

## Global Constraints

- 保留局域網 WebSocket 房間、網易雲鏡像歌詞與播放仲裁器。
- 不恢復手動字幕提前／延遲設定。
- 不偽造音訊分析或使用 random() 補償節拍。
- 此計畫只建立可供 WSS 使用的協定，不部署或假裝已部署 WSS 中繼服務。
- 同步校正用單調時間，不使用可被系統校時跳動的 `Date.now()` 作為播放運算基準。

---

### Task 1: 可測試的時鐘偏移估算器

**Files:**
- Create: `shared/roomClock.cjs`
- Create: `tests/roomClock.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `createRoomClock({ now, maxLeadMs = 150 })`。
- `observePong({ sentAt, hostReceivedAt, hostSentAt, receivedAt })` 回傳 `{ rttMs, offsetMs }`。
- `hostNow()` 回傳以本機單調時間校正後的房主時間；`reset()` 清除全部樣本。

- [ ] **Step 1: Write the failing test**

```js
test('clock chooses the lowest RTT sample and limits prediction lead', () => {
  const clock = createRoomClock({ now: () => now, maxLeadMs: 150 })
  clock.observePong({ sentAt: 0, hostReceivedAt: 80, hostSentAt: 80, receivedAt: 200 })
  clock.observePong({ sentAt: 300, hostReceivedAt: 340, hostSentAt: 340, receivedAt: 380 })
  now = 500
  assert.equal(clock.hostNow(), 540)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roomClock.test.cjs`

Expected: FAIL because `shared/roomClock.cjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
function createRoomClock({ now = performance.now, maxLeadMs = 150 } = {}) {
  let best = null
  let offsetMs = 0
  function observePong({ sentAt, hostReceivedAt, hostSentAt, receivedAt }) {
    const rttMs = Math.max(0, receivedAt - sentAt - Math.max(0, hostSentAt - hostReceivedAt))
    const candidate = ((hostReceivedAt - sentAt) + (hostSentAt - receivedAt)) / 2
    if (!best || rttMs < best.rttMs) { best = { rttMs, offsetMs: candidate }; offsetMs = candidate }
    return { rttMs, offsetMs }
  }
  return { observePong, hostNow: () => now() + Math.max(-maxLeadMs, Math.min(maxLeadMs, offsetMs)), reset: () => { best = null; offsetMs = 0 } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roomClock.test.cjs`

Expected: PASS.

- [ ] **Step 5: Add the test to the aggregate command and run it**

Run: `npm.cmd test`

Expected: all existing tests and the new room clock test pass.

### Task 2: 房間協定時鐘探測與權威時間戳

**Files:**
- Modify: `electron/room.cjs`
- Modify: `tests/roomCommands.test.cjs`
- Create: `tests/roomClockProtocol.test.cjs`

**Interfaces:**
- Host replies to member `{ type: 'clock-ping', sentAt }` with `{ type: 'clock-pong', sentAt, hostReceivedAt, hostSentAt }`.
- `Room` emits `clockPong` on the member with host timestamps plus `receivedAt`.
- `Room#setState` preserves a host-provided `hostAtMs`; if absent, it adds one from injected monotonic `now`.
- `Room#tick` preserves `hostAtMs` likewise.

- [ ] **Step 1: Write failing protocol tests**

```js
test('host immediately answers a member clock ping with host receive and send times', async () => {
  // connect actual Room host/member over ws on an ephemeral port
  // send clock-ping and assert the member receives matching sentAt and two host timestamps
})

test('state broadcasts carry the host monotonic timestamp', () => {
  const room = new Room({ now: () => 1234 })
  room.setState({ positionMs: 4000, playing: true })
  assert.equal(lastBroadcast.state.hostAtMs, 1234)
})
```

- [ ] **Step 2: Run the protocol tests to verify they fail**

Run: `node --test tests/roomClockProtocol.test.cjs`

Expected: FAIL because ping/pong and `hostAtMs` do not exist.

- [ ] **Step 3: Implement only the message handlers**

```js
if (msg.type === 'clock-ping' && Number.isFinite(msg.sentAt)) {
  const hostReceivedAt = this.now()
  sock.send(JSON.stringify({ type: 'clock-pong', sentAt: msg.sentAt, hostReceivedAt, hostSentAt: this.now() }))
}
```

Attach `hostAtMs: this.now()` only at host broadcast boundaries. Inject `now` into `Room` with `performance.now` as default for tests.

- [ ] **Step 4: Run protocol tests to verify they pass**

Run: `node --test tests/roomClockProtocol.test.cjs tests/roomCommands.test.cjs`

Expected: PASS.

- [ ] **Step 5: Run the complete suite**

Run: `npm.cmd test`

Expected: all tests pass.

### Task 3: 成員端校正、預測與切歌生效時間

**Files:**
- Modify: `src/useRoom.js`
- Modify: `src/App.jsx`
- Modify: `electron/main.cjs`
- Modify: `tests/playbackCoordinator.test.cjs`
- Create: `tests/roomClockRenderer.test.mjs`

**Interfaces:**
- `useRoom()` exposes `sync: { rttMs, offsetMs, quality }`.
- Member sends clock ping every 3000ms only while connected; cleanup clears one interval.
- Incoming state or tick uses host clock time to set `clockRef`.
- Host sends `effectiveAtMs` 150ms in the future for discrete seek/song changes; member applies pending snapshot at the target instead of rendering an intermediate stale lyric.

- [ ] **Step 1: Write failing renderer tests**

```js
test('member clock interpolates from hostAtMs rather than the local receipt time', () => {
  const position = positionMsOf({ positionMs: 1000, playing: true, at: 500, hostAtMs: 450 }, 600)
  assert.equal(position, 1150)
})

test('a future effective state does not replace the current lyric before its timestamp', () => {
  assert.equal(applyScheduledState(current, incoming, 900).lyric, current.lyric)
  assert.equal(applyScheduledState(current, incoming, 1150).lyric, incoming.lyric)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/roomClockRenderer.test.mjs`

Expected: FAIL because the renderer has no scheduled-state helper and no host-clock interpolation.

- [ ] **Step 3: Implement bounded smoothing**

Use a single timer in `useRoom` for the 3-second ping. Preserve the existing RAF / lyric renderer loops. For a correction below 80ms, update `clockRef` with a weighted correction; at or above 120ms, set the host-derived position immediately. Use `effectiveAtMs` only for discrete state changes, never for each continuous tick.

- [ ] **Step 4: Run renderer tests to verify they pass**

Run: `node --test tests/roomClockRenderer.test.mjs tests/playbackCoordinator.test.cjs`

Expected: PASS.

- [ ] **Step 5: Run complete suite and production build**

Run: `npm.cmd test; npm.cmd run build`

Expected: zero test failures and Vite exits 0.

### Task 4: 房間同步狀態顯示與回歸驗收

**Files:**
- Modify: `src/ConsoleWindow.jsx`
- Modify: `electron/preload.cjs`
- Create: `tests/roomSyncWiring.test.mjs`

**Interfaces:**
- Room tab shows `直連` / `中繼預留` transport label, RTT in ms, and `穩定` / `不穩定` quality.
- Renderer only reads status through the existing preload room API; it cannot access sockets directly.

- [ ] **Step 1: Write failing wiring test**

```js
test('room tab renders RTT and sync quality from the preload room status', () => {
  const source = read('src/ConsoleWindow.jsx')
  assert.match(source, /同步延遲/)
  assert.match(source, /status\.sync/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roomSyncWiring.test.mjs`

Expected: FAIL because the room tab has no sync status UI.

- [ ] **Step 3: Add read-only status UI**

Display only the measured values and a Chinese quality label. Do not add an advance/delay slider or an unimplemented relay switch.

- [ ] **Step 4: Run focused and full verification**

Run: `node --test tests/roomSyncWiring.test.mjs; npm.cmd test; npm.cmd run build`

Expected: all commands exit 0.

- [ ] **Step 5: Manual two-process verification**

Run a host and a member with a local ephemeral port. Verify welcome, clock pong, room state, seek, pause, and reconnect. Record observed RTT and state/lyric hand-off behavior before release packaging.
