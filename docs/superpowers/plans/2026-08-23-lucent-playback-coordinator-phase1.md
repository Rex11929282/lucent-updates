# 璃音 Lucent 播放來源仲裁第一階段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除字幕提前／延遲與藥丸 RGB 外框，建立經測試的單一播放來源仲裁器，讓現有桌面網易雲與房間主持人狀態遵守商用版優先級且不破壞既有歌詞、切歌與動畫。

**Architecture:** 新增純 CommonJS `PlaybackCoordinator` 作為主程序中的唯一播放狀態仲裁點，來源 Adapter 只提交既有形狀的播放快照。Renderer 暫時沿用 `room:state`／`room:tick` IPC，降低第一階段回歸風險；後續內建播放器直接作為第三個 Adapter 接入，不需要改動藥丸資料流。

**Tech Stack:** Electron 43.4.1、React 19、Node.js `node:test`、CommonJS 主程序／共享模組、Vite 6。

## Global Constraints

- 直接修改現有專案，不更換 Electron／React 技術框架。
- 房間成員只顯示主持人來源；本機桌面網易雲不得覆蓋房間狀態。
- 主持人與單機模式使用：正在播放的桌面網易雲優先，其次為內建播放器；全部暫停時保留最近有效歌曲。
- 同一歌曲只因來源切換不得增加歌曲世代或重播換歌過場。
- 移除的只有字幕 `offset` 與藥丸 `borderRGB`；進度條 RGB 必須保留。
- 舊 Config／Profiles／房間外觀提案中的淘汰欄位可讀但必須忽略。
- 不新增音訊串流、遊戲功能或任何假音訊分析。
- 本工作區沒有 `.git`；不得擅自初始化 Git。每個 Task 以測試與建置輸出作為檢查點，不執行 commit。
- 本階段不封裝 EXE；全部商用任務完成後才統一封裝。

---

## File Structure

**Create**

- `shared/playbackCoordinator.cjs`：純狀態仲裁、來源標準化、歌曲身分比較與訂閱通知。
- `tests/playbackCoordinator.test.cjs`：優先矩陣、房間鎖定、來源切換與同曲身分測試。
- `tests/playbackMainWiring.test.cjs`：確認主程序的桌面與房間播放狀態都經過仲裁器。
- `tests/retiredAppearanceSettings.test.mjs`：確認 UI、Renderer、CSS 與 presets 不再使用淘汰欄位。

**Modify**

- `shared/defaults.json`：Schema 10 → 11，移除 `offset`、`borderRGB`。
- `shared/stateMigration.cjs`：將兩欄加入淘汰清單，清理主設定、Profiles 及套用的共享外觀。
- `shared/roomStyle.cjs`：移除已淘汰欄位的個人設定特例，並由 migration 統一忽略。
- `src/appearanceModel.js`：移除淘汰欄位，不讓命名配置保存它們。
- `src/ConsoleWindow.jsx`：移除字幕偏移 Slider、RGB 外框 Toggle 及 presets／隨機外觀中的 `borderRGB`。
- `src/App.jsx`：歌詞索引與逐字比例直接使用權威 `posSec`。
- `src/components/Capsule.jsx`：移除 `fx-border` class。
- `src/styles.css`：刪除 `.fx-border` 相關藥丸跑馬燈 CSS，保留 `.progress.rgb`。
- `electron/main.cjs`：接入 `PlaybackCoordinator`，將桌面來源與房間來源送入仲裁器。
- `tests/stateMigration.test.cjs`：新增 schema 11 與淘汰欄位遷移覆蓋。
- `tests/appearanceModel.test.mjs`：更新視覺配置快照測試。
- `tests/roomStyle.test.cjs`、`tests/styleOffer.test.cjs`：更新淘汰欄位斷言。
- `package.json`：把新增測試加入既有 `npm test` 指令。

---

### Task 1: 淘汰字幕 offset 與藥丸 RGB 外框

**Files:**

- Modify: `shared/defaults.json:2-42`
- Modify: `shared/stateMigration.cjs:16-25`
- Modify: `shared/roomStyle.cjs:1-10`
- Modify: `src/appearanceModel.js:132-148`
- Modify: `src/ConsoleWindow.jsx:51-104,770-785,986-995`
- Modify: `src/App.jsx:193-271`
- Modify: `src/components/Capsule.jsx:382-392`
- Modify: `src/styles.css:487-514`
- Test: `tests/stateMigration.test.cjs`
- Test: `tests/appearanceModel.test.mjs`
- Test: `tests/roomStyle.test.cjs`
- Test: `tests/styleOffer.test.cjs`
- Create: `tests/retiredAppearanceSettings.test.mjs`

**Interfaces:**

- Consumes: `migrateState(raw, schema)`、`visualConfigSnapshot(cfg)`、現有 `cfg`。
- Produces: Schema 11，且任何持久化或渲染路徑都不存在有效的 `offset`／`borderRGB`。

- [ ] **Step 1: 寫入失敗的 migration 測試**

在 `tests/stateMigration.test.cjs` 追加：

```js
test('schema 11 retires lyric offset and pill RGB border from current config and profiles', () => {
  const result = migrateState({
    schemaVersion: 10,
    cfg: { offset: 2.4, borderRGB: true, rgbBar: true, fontSize: 30 },
    profiles: [{
      id: 'legacy-rgb-border',
      name: '舊外觀',
      glass: {},
      cfg: { offset: -1.2, borderRGB: true, rgbBar: true, textClarity: 0.8 },
    }],
  }, schema)

  assert.equal(schema.schemaVersion, 11)
  assert.equal('offset' in result.cfg, false)
  assert.equal('borderRGB' in result.cfg, false)
  assert.equal(result.cfg.rgbBar, true)
  assert.equal(result.cfg.fontSize, 30)
  assert.equal('offset' in result.profiles[0].cfg, false)
  assert.equal('borderRGB' in result.profiles[0].cfg, false)
  assert.equal(result.profiles[0].cfg.rgbBar, true)
  assert.equal(result.profiles[0].cfg.textClarity, 0.8)
})
```

- [ ] **Step 2: 寫入失敗的靜態移除測試**

建立 `tests/retiredAppearanceSettings.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('retired lyric offset has no renderer or settings UI path', () => {
  const app = read('src/App.jsx')
  const consoleWindow = read('src/ConsoleWindow.jsx')
  assert.doesNotMatch(app, /cfg\.offset/)
  assert.doesNotMatch(consoleWindow, /cfg\.offset|字幕提前\s*\/\s*延遲/)
})

test('retired pill RGB border is absent while progress RGB remains', () => {
  const capsule = read('src/components/Capsule.jsx')
  const consoleWindow = read('src/ConsoleWindow.jsx')
  const styles = read('src/styles.css')
  assert.doesNotMatch(capsule, /borderRGB|fx-border/)
  assert.doesNotMatch(consoleWindow, /borderRGB|藥丸邊框跑馬燈/)
  assert.doesNotMatch(styles, /\.fx-border/)
  assert.match(styles, /\.progress\.rgb/)
})
```

- [ ] **Step 3: 執行測試並確認目前失敗**

Run:

```powershell
node --test tests/stateMigration.test.cjs tests/retiredAppearanceSettings.test.mjs
```

Expected: FAIL；schema 仍為 10，且 UI／Renderer／CSS 仍包含淘汰欄位。

- [ ] **Step 4: 實作 Schema 與 migration**

將 `shared/defaults.json` 的版本改為 11，並完整刪除：

```json
"offset": 0
```

與：

```json
"borderRGB": false
```

在 `shared/stateMigration.cjs` 的 `REMOVED_CFG_KEYS` 改為：

```js
const REMOVED_CFG_KEYS = [
  'barWave', 'progressWaveAmplitude', 'progressWaveFrequency',
  'wordBarEffect', 'wordBarStrength',
  'fxSheen', 'pillFrame',
  'offset', 'borderRGB',
]
```

`sanitizeCfg()` 已在主設定、Profiles 與共享外觀合併時被呼叫，因此不得再新增另一套 migration 分支。

- [ ] **Step 5: 移除 UI、Renderer 與 preset 引用**

在 `src/App.jsx` 將：

```js
const adjPos = posSec + (cfg.offset || 0)
const idx = lineIndexAt(lines, timed, adjPos, cfg.secondsPerLine)
```

改為：

```js
const idx = lineIndexAt(lines, timed, posSec, cfg.secondsPerLine)
```

並將同一 effect 中傳給 `mirrorFlowFillRatio`、`mirrorKaraokeRatio` 與其他歌詞比例函式的 `adjPos` 全部改為 `posSec`，dependency array 刪除 `cfg.offset`。

在 `src/appearanceModel.js` 保留舊欄位的快照過濾能力，並改為：

```js
const NON_VISUAL_CFG = new Set([
  'alwaysOnTop', 'clickThrough', 'locked', 'safeMargin', 'snapMode',
  'offset', 'secondsPerLine',
])
```

改為：

```js
const NON_VISUAL_CFG = new Set([
  'alwaysOnTop', 'clickThrough', 'locked', 'safeMargin', 'snapMode',
  'offset', 'borderRGB', 'secondsPerLine',
])
```

從 `src/ConsoleWindow.jsx` 刪除 `borderRGB` preset／random 欄位、藥丸 RGB 外框 Toggle，以及整個字幕提前／延遲 Slider 與說明。從 `src/components/Capsule.jsx` className 陣列刪除：

```js
cfg.borderRGB ? 'fx-border' : '',
```

從 `src/styles.css` 刪除 `.fx-border .glass::after`、`.fx-border.rgb-cover .glass::after`、`.fx-border.rgb-neon .glass::after` 與 `.fx-border.rgb-breath .glass::after` 規則，不改 `.progress.rgb` 規則。

在 `shared/roomStyle.cjs` 的排除集合保留 `'offset'` 並加入 `'borderRGB'`。這是對未遷移 legacy 物件的第二道保護；已載入的正式 state 仍由 `sanitizeCfg()` 統一清除。

- [ ] **Step 6: 更新既有測試資料**

在 `tests/appearanceModel.test.mjs` 的 profile 輸入刪除 `offset: 1.2`，保留預期：

```js
assert.deepEqual(profile.cfg, { fontSize: 32, textClarity: 0.8 })
```

在 `tests/roomStyle.test.cjs` 與 `tests/styleOffer.test.cjs` 中，把 `offset` 從「個人欄位」測試改成「舊欄位被忽略」測試，斷言使用：

```js
assert.equal('offset' in result.cfg, false)
assert.equal('borderRGB' in result.cfg, false)
```

- [ ] **Step 7: 執行 Task 1 測試檢查點**

Run:

```powershell
node --test tests/stateMigration.test.cjs tests/appearanceModel.test.mjs tests/roomStyle.test.cjs tests/styleOffer.test.cjs tests/retiredAppearanceSettings.test.mjs
```

Expected: 全部 PASS，且 `rg -n "cfg\.offset|borderRGB|\.fx-border" shared src tests` 只允許出現在 migration 測試的 legacy 輸入與淘汰欄位清單。

---

### Task 2: 建立純 PlaybackCoordinator 與優先矩陣

**Files:**

- Create: `shared/playbackCoordinator.cjs`
- Create: `tests/playbackCoordinator.test.cjs`

**Interfaces:**

- Consumes: 各來源提交的既有播放快照 `{ song, lines, timed, positionMs, playing, mirror, transition }`。
- Produces: `createPlaybackCoordinator(options)`，回傳 `setMode(mode)`、`update(source, snapshot)`、`clear(source)`、`current()`、`subscribe(listener)`。

- [ ] **Step 1: 寫入來源優先與房間鎖定測試**

建立 `tests/playbackCoordinator.test.cjs`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  SOURCE,
  createPlaybackCoordinator,
  playbackTrackKey,
} = require('../shared/playbackCoordinator.cjs')

const snap = (id, playing, capturedAt) => ({
  song: { id, name: `Song ${id}`, artist: 'Artist', revision: Number(id) || 1 },
  lines: [],
  timed: false,
  positionMs: 1000,
  playing,
  capturedAt,
})

test('solo mode prefers a playing desktop source over a playing internal source', () => {
  const clock = { now: 1000 }
  const coordinator = createPlaybackCoordinator({ now: () => clock.now })
  coordinator.update(SOURCE.INTERNAL, snap('11', true, 900))
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
  assert.equal(coordinator.current().song.id, '22')
})

test('a paused desktop source does not block a playing internal source', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', false, 950))
  coordinator.update(SOURCE.INTERNAL, snap('11', true, 960))
  assert.equal(coordinator.current().source, SOURCE.INTERNAL)
})

test('room member mode always renders the host snapshot even while host is paused', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  coordinator.setMode('member')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', false, 980))
  assert.equal(coordinator.current().source, SOURCE.ROOM_HOST)
  assert.equal(coordinator.current().song.id, '33')
})

test('leaving a room restores the best local source', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  coordinator.setMode('member')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', true, 980))
  coordinator.setMode(null)
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
})

test('source changes for the same canonical song keep the same track identity', () => {
  assert.equal(
    playbackTrackKey({ song: { id: '123', name: 'A', artist: 'B' } }),
    playbackTrackKey({ song: { id: 123, name: 'Different metadata', artist: '' } }),
  )
})

test('subscribers are notified only when the selected snapshot changes', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  const events = []
  const unsubscribe = coordinator.subscribe((value) => events.push(value))
  coordinator.update(SOURCE.DESKTOP, snap('22', true, 950))
  coordinator.update(SOURCE.INTERNAL, snap('11', false, 960))
  unsubscribe()
  coordinator.update(SOURCE.DESKTOP, snap('23', true, 990))
  assert.equal(events.length, 1)
  assert.equal(events[0].song.id, '22')
})
```

- [ ] **Step 2: 執行測試並確認模組尚不存在**

Run:

```powershell
node --test tests/playbackCoordinator.test.cjs
```

Expected: FAIL with `Cannot find module '../shared/playbackCoordinator.cjs'`。

- [ ] **Step 3: 實作最小仲裁器**

建立 `shared/playbackCoordinator.cjs`：

```js
const SOURCE = Object.freeze({
  DESKTOP: 'desktop-netease',
  INTERNAL: 'internal-player',
  ROOM_HOST: 'room-host',
  IDLE: 'idle',
})

function playbackTrackKey(snapshot = {}) {
  const song = snapshot.song || {}
  if (song.id != null && String(song.id)) return `id:${String(song.id)}`
  const normalize = (value) => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
  const name = normalize(song.name || song.title)
  const artist = normalize(song.artist)
  return name ? `meta:${name}|${artist}` : ''
}

function normalizeSnapshot(source, snapshot, now) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return {
    ...snapshot,
    song: snapshot.song ? { ...snapshot.song } : null,
    source,
    capturedAt: Number(snapshot.capturedAt) || now,
  }
}

function sameSelection(a, b) {
  if (!a || !b) return a === b
  return a.source === b.source
    && playbackTrackKey(a) === playbackTrackKey(b)
    && Number(a.positionMs || 0) === Number(b.positionMs || 0)
    && !!a.playing === !!b.playing
    && Number(a.song?.revision || 0) === Number(b.song?.revision || 0)
    && a.mirror === b.mirror
    && a.lines === b.lines
}

function createPlaybackCoordinator({ now = Date.now } = {}) {
  const sources = new Map()
  const listeners = new Set()
  let mode = null
  let selected = null

  function choose() {
    if (mode === 'member') return sources.get(SOURCE.ROOM_HOST) || null
    const desktop = sources.get(SOURCE.DESKTOP)
    const internal = sources.get(SOURCE.INTERNAL)
    if (desktop?.playing) return desktop
    if (internal?.playing) return internal
    return desktop || internal || null
  }

  function publish() {
    const next = choose()
    if (sameSelection(selected, next)) return selected
    selected = next
    for (const listener of listeners) listener(selected)
    return selected
  }

  return {
    setMode(nextMode) {
      mode = nextMode === 'member' || nextMode === 'host' ? nextMode : null
      return publish()
    },
    update(source, snapshot) {
      if (!Object.values(SOURCE).includes(source) || source === SOURCE.IDLE) {
        throw new TypeError(`Unknown playback source: ${source}`)
      }
      const normalized = normalizeSnapshot(source, snapshot, now())
      if (normalized) sources.set(source, normalized)
      else sources.delete(source)
      return publish()
    },
    clear(source) {
      sources.delete(source)
      return publish()
    },
    current() {
      return selected
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

module.exports = { SOURCE, createPlaybackCoordinator, playbackTrackKey }
```

- [ ] **Step 4: 執行仲裁器測試**

Run:

```powershell
node --test tests/playbackCoordinator.test.cjs
```

Expected: 6 tests PASS。

---

### Task 3: 將主程序桌面來源與房間來源接入仲裁器

**Files:**

- Modify: `electron/main.cjs:1-15,255-270,398-414,598-712,828-834`
- Test: `tests/playbackCoordinator.test.cjs`
- Create: `tests/playbackMainWiring.test.cjs`
- Test: `tests/roomLeave.test.mjs`

**Interfaces:**

- Consumes: Task 2 的 `SOURCE`、`createPlaybackCoordinator()`。
- Produces: Renderer 仍透過 `room:state` 收到唯一權威快照；host 仍透過 `room.setState()` 廣播。

- [ ] **Step 1: 新增狀態來源與主程序接線測試**

在 `tests/playbackCoordinator.test.cjs` 追加：

```js
test('member local updates stay cached but never emit over a room host selection', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  const events = []
  coordinator.subscribe((value) => events.push(value?.source || SOURCE.IDLE))
  coordinator.setMode('member')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', true, 900))
  coordinator.update(SOURCE.DESKTOP, snap('44', true, 950))
  assert.equal(coordinator.current().source, SOURCE.ROOM_HOST)
  assert.deepEqual(events, [SOURCE.ROOM_HOST])
})

test('host mode uses local arbitration and never selects room-host input', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.setMode('host')
  coordinator.update(SOURCE.ROOM_HOST, snap('33', true, 900))
  coordinator.update(SOURCE.DESKTOP, snap('44', true, 950))
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
})
```

建立 `tests/playbackMainWiring.test.cjs`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')

test('main process routes local and room-host snapshots through PlaybackCoordinator', () => {
  assert.match(main, /createPlaybackCoordinator/)
  assert.match(main, /playback\.update\(SOURCE\.DESKTOP,\s*snapshot\)/)
  assert.match(main, /playback\.update\(SOURCE\.ROOM_HOST,\s*snapshot\)/)
  assert.match(main, /playback\.subscribe/)
})

test('room leave clears host source before restoring local playback', () => {
  const leaveHandler = main.match(/ipcMain\.handle\('room:leave',[\s\S]*?\n\}\)/)?.[0] || ''
  assert.match(leaveHandler, /playback\.clear\(SOURCE\.ROOM_HOST\)/)
  assert.match(leaveHandler, /playback\.setMode\(null\)/)
  assert.match(leaveHandler, /pushState\(\)/)
})
```

- [ ] **Step 2: 執行新增測試確認現行行為差異**

Run:

```powershell
node --test tests/playbackCoordinator.test.cjs tests/playbackMainWiring.test.cjs
```

Expected: `playbackCoordinator.test.cjs` PASS；`playbackMainWiring.test.cjs` FAIL，因主程序尚未建立仲裁器接線。

- [ ] **Step 3: 收緊 host 選擇並接入 main**

確認 `shared/playbackCoordinator.cjs` 的 `choose()` 在 `mode === 'host'` 時只考慮 desktop／internal；`ROOM_HOST` 只在 member 模式可被選擇。

在 `electron/main.cjs` imports 加入：

```js
const { SOURCE, createPlaybackCoordinator } = require('../shared/playbackCoordinator.cjs')
```

在 `const room = new Room()` 後加入：

```js
const playback = createPlaybackCoordinator()
```

將房間事件改為：

```js
room.on('state', (snapshot) => {
  if (room.mode !== 'member') return
  playback.update(SOURCE.ROOM_HOST, snapshot)
})
room.on('tick', (tick) => {
  if (room.mode !== 'member') return
  sendAll('room:tick', tick)
})
```

建立唯一輸出訂閱：

```js
playback.subscribe((snapshot) => {
  sendAll('room:state', snapshot)
})
```

將 `pushState()` 改為先建立 local snapshot，再送入仲裁器：

```js
function pushState() {
  markNextSongReady()
  const snapshot = {
    song: np.song,
    lines: np.lines,
    timed: np.timed,
    positionMs: estPosMs(),
    playing: np.playing,
    mirror: np.mirror || null,
    transition: np.transition,
    capturedAt: Date.now(),
  }
  playback.update(SOURCE.DESKTOP, snapshot)
  if (room.mode === 'host') room.setState(playback.current())
}
```

`pushTick()` 維持既有低頻 clock 路徑，不用 tick 重新發布完整 state：

```js
function pushTick() {
  if (markNextSongReady()) pushState()
  const tick = { positionMs: estPosMs(), playing: np.playing }
  if (room.mode === 'host') room.tick(tick)
  else if (room.mode !== 'member') sendAll('room:tick', tick)
}
```

單機 Renderer 的完整 state 更新由 coordinator subscribe 負責；進度仍由 `room:tick` 更新，避免每 250ms 重送歌詞與封面資料。

在 `room:host`、`room:join`、`room:leave` IPC 中同步 mode：

```js
ipcMain.handle('room:host', async (_event, options) => {
  const result = await room.startHost(options)
  playback.setMode('host')
  pushState()
  return result
})

ipcMain.handle('room:join', (_event, options) => {
  room.join(options)
  playback.setMode('member')
  return { ok: true }
})

ipcMain.handle('room:leave', () => {
  room.close()
  playback.setMode(null)
  playback.clear(SOURCE.ROOM_HOST)
  pendingStyleOffers.clear()
  sendAll('room:status', { mode: null, closed: true })
  sendAll('room:members', [])
  pushState()
  return { ok: true }
})
```

不要移除 `onCdp`／`onSmtc` 中 member 的 early return；成員端可在後續階段選擇是否低成本監測本機來源，但第一階段不得增加背景負載。

- [ ] **Step 4: 驗證房間退出與仲裁測試**

Run:

```powershell
node --test tests/playbackCoordinator.test.cjs tests/playbackMainWiring.test.cjs tests/roomLeave.test.mjs tests/roomOffers.test.cjs tests/styleOffer.test.cjs
```

Expected: 全部 PASS；退出房間後 `room-host` 清除並恢復桌面來源。

---

### Task 4: 防止來源切換重播同曲過場

**Files:**

- Modify: `shared/playbackCoordinator.cjs`
- Modify: `electron/main.cjs:398-414`
- Test: `tests/playbackCoordinator.test.cjs`
- Test: `tests/songSwitch.test.cjs`
- Test: `tests/songTransition.test.mjs`

**Interfaces:**

- Consumes: `playbackTrackKey(snapshot)`。
- Produces: 仲裁輸出 `sourceChanged: true|false` 與穩定 `trackKey`；同曲接管不改 `song.revision`。

- [ ] **Step 1: 寫入同曲接管測試**

在 `tests/playbackCoordinator.test.cjs` 追加：

```js
test('same-song source takeover preserves song revision and marks only the source change', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.INTERNAL, {
    ...snap('88', true, 900),
    song: { ...snap('88', true, 900).song, revision: 41 },
  })
  const next = coordinator.update(SOURCE.DESKTOP, {
    ...snap('88', true, 950),
    song: { ...snap('88', true, 950).song, revision: 99 },
  })
  assert.equal(next.trackKey, 'id:88')
  assert.equal(next.song.revision, 41)
  assert.equal(next.sourceChanged, true)
})

test('a different canonical song keeps its own revision', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.INTERNAL, {
    ...snap('88', true, 900),
    song: { ...snap('88', true, 900).song, revision: 41 },
  })
  const next = coordinator.update(SOURCE.DESKTOP, {
    ...snap('99', true, 950),
    song: { ...snap('99', true, 950).song, revision: 52 },
  })
  assert.equal(next.trackKey, 'id:99')
  assert.equal(next.song.revision, 52)
  assert.equal(next.sourceChanged, true)
})
```

- [ ] **Step 2: 執行測試確認缺少 identity preservation**

Run:

```powershell
node --test tests/playbackCoordinator.test.cjs
```

Expected: FAIL；輸出尚未提供 `trackKey`／`sourceChanged`，且同曲 revision 尚未保留。

- [ ] **Step 3: 在 publish 階段保留同曲 revision**

在 `shared/playbackCoordinator.cjs` 的 `publish()` 中，以以下流程產生輸出：

```js
function publish() {
  const candidate = choose()
  const previous = selected
  let next = candidate

  if (candidate) {
    const trackKey = playbackTrackKey(candidate)
    const sameTrack = !!previous && !!trackKey && previous.trackKey === trackKey
    next = {
      ...candidate,
      song: candidate.song
        ? {
            ...candidate.song,
            revision: sameTrack
              ? previous.song?.revision
              : candidate.song.revision,
          }
        : null,
      trackKey,
      sourceChanged: !!previous && previous.source !== candidate.source,
    }
  }

  if (sameSelection(previous, next)) return selected
  selected = next
  for (const listener of listeners) listener(selected)
  return selected
}
```

更新 `sameSelection()`，把 `trackKey` 與 `sourceChanged` 納入穩定比較，但不得用 `capturedAt` 造成每次輪詢都重送完整 state。

在 `electron/main.cjs` 中不得用 `sourceChanged` 呼叫 `markSongReplacement()`；切歌過場仍只由既有實際歌曲 revision／歌曲 ID 生命周期觸發。

- [ ] **Step 4: 執行同曲與既有切歌回歸測試**

Run:

```powershell
node --test tests/playbackCoordinator.test.cjs tests/songSwitch.test.cjs tests/songTransition.test.mjs tests/songLifecycle.test.cjs
```

Expected: 全部 PASS；同曲來源切換保留 revision，不同歌曲仍建立新世代。

---

### Task 5: 接入測試命令並完成第一階段回歸

**Files:**

- Modify: `package.json:7-10`
- Verify: `shared/defaults.json`
- Verify: `electron/main.cjs`
- Verify: `src/App.jsx`
- Verify: `src/ConsoleWindow.jsx`
- Verify: `src/components/Capsule.jsx`
- Verify: `src/styles.css`

**Interfaces:**

- Consumes: Tasks 1–4 的所有測試與實作。
- Produces: 第一階段可建置版本及可重複執行的回歸證據。

- [ ] **Step 1: 將新測試加入 package script**

在 `package.json` 的 `test` 指令加入：

```text
tests/playbackCoordinator.test.cjs tests/playbackMainWiring.test.cjs tests/retiredAppearanceSettings.test.mjs
```

保留所有既有測試檔，不刪除任何原有測試。

- [ ] **Step 2: 執行完整測試**

Run:

```powershell
npm.cmd test
```

Expected: exit code 0，所有測試 PASS。

- [ ] **Step 3: 執行 Vite production build**

Run:

```powershell
npm.cmd run build
```

Expected: exit code 0，`dist/index.html` 與 production assets 成功產生，沒有 unresolved import。

- [ ] **Step 4: 執行淘汰欄位與商用邊界掃描**

Run:

```powershell
rg -n "cfg\.offset|borderRGB|\.fx-border" shared src electron
rg -n "progress\.rgb|rgbBar" src shared
```

Expected:

- 第一個命令只允許 `shared/stateMigration.cjs` 的淘汰欄位名稱，不得出現在 UI、Renderer、presets 或 CSS。
- 第二個命令仍找到進度條 RGB 的設定與樣式。

- [ ] **Step 5: 實際啟動 smoke test**

Run:

```powershell
npm.cmd run start
```

Manual evidence:

- Overlay 與設定視窗可開啟。
- 設定頁沒有字幕提前／延遲與藥丸 RGB 外框。
- 進度條 RGB 仍可切換。
- 桌面網易雲播放、暫停與換歌仍更新藥丸。
- 加入房間後成員只顯示主持人狀態；離開後恢復本機來源。
- 同一歌曲從未播放狀態更新為可靠歌曲 ID 時不重播兩次換歌動畫。

- [ ] **Step 6: 記錄第一階段交付狀態**

在執行回報中列出：

- 修改檔案。
- `npm.cmd test` 測試數與結果。
- `npm.cmd run build` 結果。
- 實際 smoke test 已驗證與未驗證項目。
- 未封裝 EXE。
- 下一份計畫為「內建音訊服務與桌面網易雲接管」。
