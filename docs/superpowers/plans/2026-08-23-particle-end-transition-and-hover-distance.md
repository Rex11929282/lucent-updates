# 璃音 Lucent：結尾粒子破碎與近距離滑鼠感應 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓藥丸只在歌曲自然結束時以低負載 Canvas 粒子原位破碎，下一首準備播放時重組，並讓液態玻璃的滑鼠感應距離可調且預設很近。

**Architecture:** 主程序判斷「自然結尾」並透過既有 room state 廣播單調遞增的 transition token；Renderer 以 token 驅動一個 capture-out → shatter-out → dormant → capture-in → shatter-in 的狀態機。破碎畫面以一次 native screenshot 和一個 Canvas 繪製有限的亂數種子碎片，不再複製完整 DOM。滑鼠則改由 Renderer 自己做距離 gate，再把外部滑鼠座標提供給 `liquid-glass-react`，不改動第三方套件。

**Tech Stack:** Electron 33、React 19、Vite 6、Node `node:test`、Canvas 2D、`webContents.capturePage`。

## Global Constraints

- 不修改 `node_modules/liquid-glass-react`。
- 不移動 BrowserWindow、不修改拖曳、鎖定、滑鼠穿透或螢幕邊界行為。
- 不新增遊戲 HUD、遊戲模式、遊戲偵測或任何遊戲功能。
- 不使用隨機值冒充音訊分析；亂數只在每次視覺破碎建立一次粒子版圖。
- 粒子數量有限，Canvas 與所有碎片均裁切在既有藥丸圓角內。
- 破碎期間只有 transition Canvas 可更新；其他裝飾、歌詞、唱片、進度與滑鼠玻璃效果停止。
- 新設定必須安全遷移舊 Config；Schema 由 9 升至 10。
- 此工作區沒有 `.git`，每個任務以測試與建置輸出取代 commit；不得建立假 commit。
- 不在本計畫執行 EXE 封裝；所有任務完成後才統一封裝。

---

## 檔案責任地圖

| 路徑 | 變更責任 |
| --- | --- |
| `shared/songLifecycle.cjs`（新增） | 純函式判斷自然結尾與下一首重組條件。 |
| `src/songTransition.js` | 純 Renderer transition state machine、有限粒子版圖與視覺選擇。 |
| `src/pillMouse.js`（新增） | 游標至藥丸矩形距離與 external LiquidGlass props 的純計算。 |
| `src/usePillMouse.js`（新增） | rAF 節流的瀏覽器 pointer listener，僅近距離時更新 React 狀態。 |
| `electron/main.cjs` | 發出自然結尾 token、下一首 ready token、提供安全的 `capturePage` IPC。 |
| `electron/preload.cjs` / `src/overlayBridge.js` | 暴露最小化 `capturePill(rect)` bridge。 |
| `src/App.jsx` | 分流 collapse 舊行為與 shatter 新生命週期、凍結舊視覺、恢復新視覺。 |
| `src/components/SongTransitionLayer.jsx` | 取代 16 個 DOM 複本，改為單一 Canvas screenshot 粒子層。 |
| `src/components/Capsule.jsx` | 轉接 effectsPaused、外部滑鼠座標與畫面 capture rect。 |
| `src/components/DecorationCanvas.jsx` / `src/styles.css` | 讓所有非 transition 動畫在破碎期間停止。 |
| `src/ConsoleWindow.jsx` | 新增「滑鼠感應距離」滑桿。 |
| `shared/defaults.json` / `shared/stateMigration.cjs` | Schema 10、預設值與範圍遷移。 |
| `tests/*.test.*` | lifecycle、transition、Canvas 結構、滑鼠距離與 config 相容性回歸。 |

### Task 1: 建立可測試的自然結尾判斷

**Files:**
- Create: `shared/songLifecycle.cjs`
- Create: `tests/songLifecycle.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ id, revision, durationMs }` song、目前 `positionMs`、`playing`、即將到達的 `incomingSongId`。
- Produces: `isNaturalSongEnd(sample, tailMs)` 與 `isReadyToRebuild(lifecycle, song, playing)`。
- Later consumers: `electron/main.cjs` 只能使用這兩個純函式判斷 transition token。

- [ ] **Step 1: 寫會失敗的自然結尾測試**

```js
// tests/songLifecycle.test.cjs
const test = require('node:test')
const assert = require('node:assert/strict')
const { isNaturalSongEnd, isReadyToRebuild } = require('../shared/songLifecycle.cjs')

const song = { id: '101', revision: 8, durationMs: 240000, loading: false }

test('only a stopped tail or a tail-end incoming song is a natural end', () => {
  assert.equal(isNaturalSongEnd({ song, positionMs: 120000, playing: false }), false)
  assert.equal(isNaturalSongEnd({ song, positionMs: 239500, playing: true }), false)
  assert.equal(isNaturalSongEnd({ song, positionMs: 239500, playing: false }), true)
  assert.equal(isNaturalSongEnd({ song, positionMs: 239500, playing: true, incomingSongId: '102' }), true)
})

test('only a different loaded and playing song can rebuild an active end lifecycle', () => {
  const lifecycle = { token: 3, endedSongRevision: 8, readySongRevision: 0 }
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: true }, true), false)
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: false }, false), false)
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: false }, true), true)
})
```

- [ ] **Step 2: 執行並確認測試因模組不存在而失敗**

Run: `node --test tests/songLifecycle.test.cjs`  
Expected: FAIL with `Cannot find module '../shared/songLifecycle.cjs'`.

- [ ] **Step 3: 實作最小純函式**

```js
// shared/songLifecycle.cjs
const END_TAIL_MS = 650

function isNaturalSongEnd({ song, positionMs, playing, incomingSongId }, tailMs = END_TAIL_MS) {
  const durationMs = Number(song?.durationMs)
  if (!song?.id || !Number.isFinite(durationMs) || durationMs <= 0) return false
  if (!Number.isFinite(Number(positionMs)) || Number(positionMs) < durationMs - tailMs) return false
  const incomingIsDifferent = incomingSongId != null && String(incomingSongId) !== String(song.id)
  return playing === false || incomingIsDifferent
}

function isReadyToRebuild(lifecycle, song, playing) {
  return Number(lifecycle?.token) > 0
    && Number(lifecycle?.endedSongRevision) > 0
    && Number(song?.revision) > 0
    && Number(song.revision) !== Number(lifecycle.endedSongRevision)
    && song.loading === false
    && playing === true
}

module.exports = { END_TAIL_MS, isNaturalSongEnd, isReadyToRebuild }
```

- [ ] **Step 4: 將測試加入既有 test script 並確認綠燈**

```json
// package.json scripts.test 末尾加入
"tests/songLifecycle.test.cjs"
```

Run: `node --test tests/songLifecycle.test.cjs`  
Expected: PASS, 2 tests.

Run: `npm.cmd test`  
Expected: PASS; existing tests remain green.

### Task 2: 將 transition state machine 改為 capture / 粒子 / dormant 生命週期

**Files:**
- Modify: `src/songTransition.js`
- Modify: `tests/songTransition.test.mjs`

**Interfaces:**
- Consumes: `{ type, revision, at }` events.
- Produces: `advanceSongTransition(state, event)`, `createShatterParticles({ width, height, seed, count })`, `isTransitionEffectsPaused(phase)`。
- Later consumers: `App.jsx`、`SongTransitionLayer.jsx`、`Capsule.jsx`。

- [ ] **Step 1: 替換舊 DOM 碎片測試為新 state machine 與粒子版圖測試**

```js
test('shatter follows end capture scatter dormant capture rebuild idle', () => {
  let state = initialSongTransition()
  state = advanceSongTransition(state, { type: 'end', revision: 4, at: 10 })
  assert.equal(state.phase, 'capture-out')
  state = advanceSongTransition(state, { type: 'snapshot-ready', revision: 4, at: 20 })
  assert.equal(state.phase, 'shatter-out')
  state = advanceSongTransition(state, { type: 'out-finished', revision: 4, at: 200 })
  assert.equal(state.phase, 'dormant')
  state = advanceSongTransition(state, { type: 'next-ready', revision: 4, at: 220 })
  assert.equal(state.phase, 'capture-in')
  state = advanceSongTransition(state, { type: 'snapshot-ready', revision: 4, at: 240 })
  assert.equal(state.phase, 'shatter-in')
  state = advanceSongTransition(state, { type: 'finished', revision: 4, at: 500 })
  assert.equal(state.phase, 'idle')
})

test('particle layouts are finite, clipped to their source and differ by seed', () => {
  const first = createShatterParticles({ width: 320, height: 92, seed: 1, count: 16 })
  const second = createShatterParticles({ width: 320, height: 92, seed: 2, count: 16 })
  assert.equal(first.length, 16)
  assert.notDeepEqual(first, second)
  assert.ok(first.every((p) => p.x >= 0 && p.y >= 0 && p.x + p.w <= 320 && p.y + p.h <= 92))
  assert.ok(first.every((p) => Number.isFinite(p.dx) && Number.isFinite(p.dy) && Number.isFinite(p.rotation)))
  assert.equal(isTransitionEffectsPaused('shatter-out'), true)
  assert.equal(isTransitionEffectsPaused('dormant'), true)
  assert.equal(isTransitionEffectsPaused('shatter-in'), true)
  assert.equal(isTransitionEffectsPaused('idle'), false)
})

test('a failed screenshot never leaves shatter hidden forever', () => {
  const out = advanceSongTransition(
    advanceSongTransition(initialSongTransition(), { type: 'end', revision: 4, at: 10 }),
    { type: 'snapshot-failed', revision: 4, at: 20 },
  )
  assert.equal(out.phase, 'dormant')
  const incoming = advanceSongTransition(
    advanceSongTransition(out, { type: 'next-ready', revision: 4, at: 30 }),
    { type: 'snapshot-failed', revision: 4, at: 40 },
  )
  assert.equal(incoming.phase, 'idle')

  const imageFailure = advanceSongTransition(
    advanceSongTransition(
      advanceSongTransition(initialSongTransition(), { type: 'end', revision: 5, at: 10 }),
      { type: 'snapshot-ready', revision: 5, at: 20 },
    ),
    { type: 'snapshot-failed', revision: 5, at: 30 },
  )
  assert.equal(imageFailure.phase, 'dormant')
})
```

- [ ] **Step 2: 確認新測試在舊實作失敗**

Run: `node --test tests/songTransition.test.mjs`  
Expected: FAIL because `createShatterParticles` and new phases do not exist.

- [ ] **Step 3: 實作 state machine 與一次性種子粒子版圖**

```js
// src/songTransition.js
export function initialSongTransition() {
  return { revision: 0, phase: 'idle', startedAt: 0 }
}

function seeded(seed) {
  let value = (Number(seed) >>> 0) || 1
  return () => {
    value |= 0
    value = (value + 0x6D2B79F5) | 0
    let next = Math.imul(value ^ (value >>> 15), 1 | value)
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function createShatterParticles({ width, height, seed, count = 16 }) {
  const random = seeded(seed)
  const safeCount = Math.max(8, Math.min(22, Math.round(count)))
  return Array.from({ length: safeCount }, () => {
    const w = Math.max(18, width * (0.10 + random() * 0.16))
    const h = Math.max(14, height * (0.22 + random() * 0.34))
    const x = Math.max(0, Math.min(width - w, random() * (width - w)))
    const y = Math.max(0, Math.min(height - h, random() * (height - h)))
    const cx = x + w / 2 - width / 2
    const cy = y + h / 2 - height / 2
    const length = Math.max(1, Math.hypot(cx, cy))
    const spread = 18 + random() * 34
    return {
      x, y, w, h,
      dx: (cx / length) * spread,
      dy: (cy / length) * spread,
      rotation: -18 + random() * 36,
      shape: [[.08 + random() * .18, .04 + random() * .16], [.78 + random() * .18, .08 + random() * .16], [.90 - random() * .18, .78 + random() * .18], [.06 + random() * .18, .90 - random() * .18]],
    }
  })
}

export function advanceSongTransition(state, event) {
  if (!event || !Number.isFinite(event.revision)) return state
  // Keep the pre-existing collapse path intact. App only sends these events in collapse mode.
  if (event.type === 'song' && event.revision >= state.revision) return { revision: event.revision, phase: 'collapse', startedAt: event.at }
  if (event.type === 'collapsed' && event.revision === state.revision && state.phase === 'collapse') return { ...state, phase: 'hold' }
  if (event.type === 'ready' && event.revision === state.revision && (state.phase === 'collapse' || state.phase === 'hold')) return { ...state, phase: 'expand' }
  if (event.type === 'finished' && event.revision === state.revision && state.phase === 'expand') return { ...state, phase: 'idle' }

  if (event.type === 'end' && event.revision > state.revision) return { revision: event.revision, phase: 'capture-out', startedAt: event.at }
  if (event.revision !== state.revision) return state
  if (event.type === 'snapshot-ready' && state.phase === 'capture-out') return { ...state, phase: 'shatter-out' }
  if (event.type === 'snapshot-failed' && (state.phase === 'capture-out' || state.phase === 'shatter-out')) return { ...state, phase: 'dormant' }
  if (event.type === 'out-finished' && state.phase === 'shatter-out') return { ...state, phase: 'dormant' }
  if (event.type === 'next-ready' && state.phase === 'dormant') return { ...state, phase: 'capture-in' }
  if (event.type === 'snapshot-ready' && state.phase === 'capture-in') return { ...state, phase: 'shatter-in' }
  if (event.type === 'snapshot-failed' && (state.phase === 'capture-in' || state.phase === 'shatter-in')) return { ...state, phase: 'idle' }
  if (event.type === 'finished' && state.phase === 'shatter-in') return { ...state, phase: 'idle' }
  return state
}

export function isTransitionEffectsPaused(phase) {
  return phase === 'capture-out' || phase === 'shatter-out' || phase === 'dormant' || phase === 'capture-in' || phase === 'shatter-in'
}

export function visualForSongTransition(phase, stableVisual, liveVisual) {
  return (phase === 'collapse' || phase === 'hold' || phase === 'capture-out' || phase === 'shatter-out' || phase === 'dormant') && stableVisual ? stableVisual : liveVisual
}
```

- [ ] **Step 4: 移除過時 `SHATTER_PARTICLES` 與 HTML snapshot 斷言，確認綠燈**

Run: `node --test tests/songTransition.test.mjs`  
Expected: PASS; no test imports `SHATTER_PARTICLES`.

### Task 3: 新增 Config 10 與純滑鼠距離 gate

**Files:**
- Create: `src/pillMouse.js`
- Create: `tests/pillMouse.test.mjs`
- Modify: `shared/defaults.json`
- Modify: `shared/stateMigration.cjs`
- Modify: `tests/stateMigration.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `pillPointerState(pointer, rect, activationDistance)` → `{ active, globalMousePos, mouseOffset }`。
- `Capsule.jsx` 只能以 `globalMousePos` / `mouseOffset` 將游標輸入給第三方玻璃元件。

- [ ] **Step 1: 寫距離、邊界與遷移測試**

```js
// tests/pillMouse.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { pillPointerState } from '../src/pillMouse.js'

const rect = { left: 100, top: 100, width: 200, height: 80 }

test('mouse only activates at or within the configured distance from the pill', () => {
  assert.equal(pillPointerState({ x: 299, y: 140 }, rect, 0).active, true)
  assert.equal(pillPointerState({ x: 314, y: 140 }, rect, 14).active, true)
  const far = pillPointerState({ x: 315, y: 140 }, rect, 14)
  assert.equal(far.active, false)
  assert.deepEqual(far.globalMousePos, { x: 0, y: 0 })
  assert.deepEqual(far.mouseOffset, { x: 0, y: 0 })
})
```

```js
// tests/stateMigration.test.cjs
test('schema 10 clamps hover activation distance without losing old config', () => {
  const result = migrateState({ schemaVersion: 9, cfg: { hoverActivationDistance: 999, fontSize: 31 } }, schema)
  assert.equal(result.schemaVersion, 10)
  assert.equal(result.cfg.hoverActivationDistance, 80)
  assert.equal(result.cfg.fontSize, 31)
})
```

- [ ] **Step 2: 確認新測試失敗**

Run: `node --test tests/pillMouse.test.mjs tests/stateMigration.test.cjs`  
Expected: FAIL because the pure module and config field do not exist.

- [ ] **Step 3: 實作距離 gate 與 Config 遷移**

```js
// src/pillMouse.js
export function pillPointerState(pointer, rect, activationDistance) {
  const distance = Math.max(0, Math.min(80, Number(activationDistance) || 0))
  if (!pointer || !rect || !rect.width || !rect.height) return { active: false, globalMousePos: { x: 0, y: 0 }, mouseOffset: { x: 0, y: 0 } }
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const dx = Math.max(rect.left - pointer.x, 0, pointer.x - right)
  const dy = Math.max(rect.top - pointer.y, 0, pointer.y - bottom)
  const active = Math.hypot(dx, dy) <= distance
  if (!active) return { active: false, globalMousePos: { x: 0, y: 0 }, mouseOffset: { x: 0, y: 0 } }
  return {
    active: true,
    globalMousePos: { x: pointer.x, y: pointer.y },
    mouseOffset: {
      x: ((pointer.x - (rect.left + rect.width / 2)) / rect.width) * 100,
      y: ((pointer.y - (rect.top + rect.height / 2)) / rect.height) * 100,
    },
  }
}
```

```json
// shared/defaults.json
{
  "schemaVersion": 10,
  "cfg": {
    "hoverActivationDistance": 14
  }
}
```

```js
// shared/stateMigration.cjs, inside sanitizeCfg after transitionSpeed
result.hoverActivationDistance = clamp(result.hoverActivationDistance, 0, 80, defaults.hoverActivationDistance)
```

- [ ] **Step 4: 將測試加入 script 並確認綠燈**

Run: `node --test tests/pillMouse.test.mjs tests/stateMigration.test.cjs`  
Expected: PASS.

Run: `npm.cmd test`  
Expected: PASS with both new test files included.

### Task 4: 主程序發出自然結尾／下一首 ready token，並提供裁切 screenshot IPC

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/overlayBridge.js`
- Modify: `tests/songLifecycle.test.cjs`

**Interfaces:**
- `room state.transition` shape: `{ token, endedSongRevision, endedSongId, readySongRevision }`.
- `ov.capturePill({ x, y, width, height })` resolves to `{ dataURL, width, height } | null`.
- `pushState()` includes `transition`; room members receive it through existing `room:state` unchanged.

- [ ] **Step 1: 增加會失敗的 source-level bridge / lifecycle propagation assertions**

```js
test('main state carries transition tokens and captures only an overlay-owned crop', async () => {
  const fs = require('node:fs/promises')
  const main = await fs.readFile(require.resolve('../electron/main.cjs'), 'utf8')
  const preload = await fs.readFile(require.resolve('../electron/preload.cjs'), 'utf8')
  assert.match(main, /transition:\s*np\.transition/)
  assert.match(main, /ipcMain\.handle\('overlay:capturePill'/)
  assert.match(main, /event\.sender !== overlay\.webContents/)
  assert.match(main, /webContents\.capturePage/)
  assert.match(preload, /capturePill:/)
})
```

- [ ] **Step 2: 確認 source-level assertion 失敗**

Run: `node --test tests/songLifecycle.test.cjs`  
Expected: FAIL because no `transition` state or `capturePill` bridge exists.

- [ ] **Step 3: 最小化主程序與 bridge 實作**

```js
// electron/main.cjs imports
const { isNaturalSongEnd, isReadyToRebuild } = require('../shared/songLifecycle.cjs')

// near np
np.transition = { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0 }

function markNaturalEnd(incomingSongId = null) {
  if (!isNaturalSongEnd({ song: np.song, positionMs: estPosMs(), playing: np.playing, incomingSongId })) return false
  if (np.transition.endedSongRevision === np.song.revision) return false
  np.transition = {
    token: np.transition.token + 1,
    endedSongRevision: np.song.revision,
    endedSongId: np.song.id || null,
    readySongRevision: 0,
  }
  pushState()
  return true
}

function markNextSongReady() {
  if (!isReadyToRebuild(np.transition, np.song, np.playing)) return false
  if (np.transition.readySongRevision === np.song.revision) return false
  np.transition = { ...np.transition, readySongRevision: np.song.revision }
  pushState()
  return true
}

// pushState st object
transition: np.transition,

// before songRevision.begin in beginSong
markNaturalEnd(next.id)

// after np.song.loading=false in loadSongById and after playing state changes in clkSync
markNextSongReady()

// IPC near overlay:getBounds
ipcMain.handle('overlay:capturePill', async (event, rect = {}) => {
  if (!overlay || overlay.isDestroyed() || event.sender !== overlay.webContents) return null
  const x = Math.max(0, Math.round(Number(rect.x) || 0))
  const y = Math.max(0, Math.round(Number(rect.y) || 0))
  const width = Math.min(1600, Math.max(1, Math.round(Number(rect.width) || 0)))
  const height = Math.min(600, Math.max(1, Math.round(Number(rect.height) || 0)))
  if (!width || !height) return null
  const image = await overlay.webContents.capturePage({ x, y, width, height })
  const size = image.getSize()
  return { dataURL: image.toDataURL(), width: size.width, height: size.height }
})
```

```js
// electron/preload.cjs and src/overlayBridge.js
capturePill: (rect) => ipcRenderer.invoke('overlay:capturePill', rect)
// browser fallback in src/overlayBridge.js
capturePill: asyncNull,
```

- [ ] **Step 4: 確認主程序語法與 lifecycle tests 綠燈**

Run: `node --check electron/main.cjs; node --check electron/preload.cjs; node --test tests/songLifecycle.test.cjs`  
Expected: all PASS.

### Task 5: 用單一 Canvas 取代 16 個 DOM 破碎複本

**Files:**
- Modify: `src/components/SongTransitionLayer.jsx`
- Modify: `src/styles.css`
- Modify: `tests/songTransition.test.mjs`

**Interfaces:**
- Consumes: `phase`, `revision`, `sourceRef`, `onSnapshotReady`, `onSnapshotFailed`, `onOutFinished`, `onInFinished`。
- Produces: 一個 `.song-transition-layer > canvas`，不產生 `cloneNode`、`dangerouslySetInnerHTML` 或重複 LiquidGlass。

- [ ] **Step 1: 寫會失敗的 Canvas 結構測試**

```js
test('shatter uses one crop canvas instead of cloning the complete pill DOM', async () => {
  const transition = await readFile(new URL('../src/components/SongTransitionLayer.jsx', import.meta.url), 'utf8')
  assert.match(transition, /<canvas/)
  assert.match(transition, /ov\.capturePill/)
  assert.match(transition, /createShatterParticles/)
  assert.doesNotMatch(transition, /cloneNode/)
  assert.doesNotMatch(transition, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(transition, /SHATTER_PARTICLES/)
})
```

- [ ] **Step 2: 確認舊 `SongTransitionLayer` 測試失敗**

Run: `node --test tests/songTransition.test.mjs`  
Expected: FAIL because current component clones DOM and has no canvas.

- [ ] **Step 3: 重寫 component 為單一 screenshot Canvas**

```jsx
// src/components/SongTransitionLayer.jsx
import { memo, useEffect, useRef, useState } from 'react'
import { ov } from '../overlayBridge.js'
import { createShatterParticles } from '../songTransition.js'

function sourceRect(sourceRef) {
  const rect = sourceRef?.current?.getBoundingClientRect?.()
  return rect && rect.width > 0 && rect.height > 0
    ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    : null
}

function clipParticle(ctx, particle) {
  ctx.beginPath()
  particle.shape.forEach(([x, y], index) => {
    const px = (x - .5) * particle.w
    const py = (y - .5) * particle.h
    if (index) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  })
  ctx.closePath()
  ctx.clip()
}

function SongTransitionLayer({ phase, revision, sourceRef, onSnapshotReady, onSnapshotFailed, onOutFinished, onInFinished }) {
  const canvasRef = useRef(null)
  const animationRef = useRef(0)
  const [frame, setFrame] = useState(null)

  useEffect(() => {
    if (phase !== 'capture-out' && phase !== 'capture-in') return undefined
    let cancelled = false
    const rect = sourceRect(sourceRef)
    if (!rect) { onSnapshotFailed?.(revision); return undefined }
    ov.capturePill(rect).then((shot) => {
      if (cancelled) return
      if (!shot?.dataURL || !shot.width || !shot.height) { onSnapshotFailed?.(revision); return }
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      setFrame({ ...shot, revision, seed })
      onSnapshotReady?.(revision)
    }).catch(() => { if (!cancelled) onSnapshotFailed?.(revision) })
    return () => { cancelled = true }
  }, [phase, revision, sourceRef, onSnapshotReady, onSnapshotFailed])

  useEffect(() => {
    if (!frame || frame.revision !== revision || (phase !== 'shatter-out' && phase !== 'shatter-in')) return undefined
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return undefined
    let stopped = false
    const image = new Image()
    image.onload = () => {
      if (stopped) return
      canvas.width = frame.width
      canvas.height = frame.height
      const particles = createShatterParticles({ width: frame.width, height: frame.height, seed: frame.seed, count: 16 })
      const duration = phase === 'shatter-out' ? 220 : 360
      const start = performance.now()
      const draw = (now) => {
        if (stopped) return
        const raw = Math.min(1, (now - start) / duration)
        const progress = phase === 'shatter-out' ? raw : 1 - raw
        context.clearRect(0, 0, frame.width, frame.height)
        for (const particle of particles) {
          context.save()
          context.globalAlpha = phase === 'shatter-out' ? 1 - raw : raw
          context.translate(particle.x + particle.w / 2 + particle.dx * progress, particle.y + particle.h / 2 + particle.dy * progress)
          context.rotate((particle.rotation * progress * Math.PI) / 180)
          clipParticle(context, particle)
          context.drawImage(image, particle.x, particle.y, particle.w, particle.h, -particle.w / 2, -particle.h / 2, particle.w, particle.h)
          context.restore()
        }
        if (raw < 1) { animationRef.current = requestAnimationFrame(draw); return }
        if (phase === 'shatter-out') onOutFinished?.(revision)
        else onInFinished?.(revision)
      }
      animationRef.current = requestAnimationFrame(draw)
    }
    image.onerror = () => { if (!stopped) onSnapshotFailed?.(revision) }
    image.src = frame.dataURL
    return () => { stopped = true; cancelAnimationFrame(animationRef.current) }
  }, [frame, phase, revision, onOutFinished, onInFinished, onSnapshotFailed])

  if (phase === 'idle' || phase === 'capture-out' || phase === 'capture-in') return null
  return <canvas ref={canvasRef} className={`song-transition-layer phase-${phase}`} aria-hidden />
}

export default memo(SongTransitionLayer)
```

```css
/* src/styles.css: replace fragment rules 198–247 */
.song-transition-layer {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  pointer-events: none;
  border-radius: var(--radius, 999px);
  clip-path: inset(0 round var(--radius, 999px));
  contain: layout paint;
}
```

- [ ] **Step 4: 為進／出完成 callback 補上可測試的單次完成條件**

```js
// component effect: in draw() after drawing p === 1
if (p >= 1) {
  if (phase === 'shatter-out') onOutFinished?.(revision)
  else onInFinished?.(revision)
  return
}
animationRef.current = requestAnimationFrame(draw)
```

Run: `node --test tests/songTransition.test.mjs`  
Expected: PASS; static assertions prove no full-DOM clone remains.

### Task 6: 在 App / Capsule 中接上 lifecycle、凍結視覺與特效暫停

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Capsule.jsx`
- Modify: `src/components/DecorationCanvas.jsx`
- Modify: `src/styles.css`
- Modify: `tests/songTransition.test.mjs`

**Interfaces:**
- `roomState.transition` is the source of `endToken` / `readySongRevision`.
- `Capsule` receives `effectsPaused`, `mouseState`, `onSnapshotReady`, `onSnapshotFailed`, `onOutFinished`, `onInFinished`.
- `effectsPaused` must be true for every shatter non-idle phase.

- [ ] **Step 1: 寫會失敗的 integration assertions**

```js
test('App drives shatter from the host end token instead of every song key change', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  assert.match(app, /roomState\?\.transition\?\.token/)
  assert.match(app, /type: 'end'/)
  assert.match(app, /type: 'next-ready'/)
  assert.match(app, /effectsPaused/)
  assert.match(capsule, /effectsPaused/)
  assert.match(capsule, /playing=\{playing && !effectsPaused\}/)
})
```

- [ ] **Step 2: 確認現況失敗**

Run: `node --test tests/songTransition.test.mjs`  
Expected: FAIL because App still triggers shatter on `songKey` changes.

- [ ] **Step 3: 實作 App state orchestration**

```jsx
// src/App.jsx: keep current songKey effect only for cfg.songTransitionMode === 'collapse'
const endToken = Number(roomState?.transition?.token || 0)
const readySongRevision = Number(roomState?.transition?.readySongRevision || 0)

useLayoutEffect(() => {
  if (cfg.songTransitionMode !== 'shatter' || !endToken) return undefined
  const revision = endToken
  if (stableVisualRef.current) setFrozenVisual(stableVisualRef.current)
  setSongTransition((current) => advanceSongTransition(current, { type: 'end', revision, at: performance.now() }))
  return undefined
}, [cfg.songTransitionMode, endToken])

useLayoutEffect(() => {
  if (cfg.songTransitionMode !== 'shatter' || !readySongRevision || songTransition.phase !== 'dormant') return undefined
  const revision = songTransition.revision
  setSongTransition((current) => advanceSongTransition(current, { type: 'next-ready', revision, at: performance.now() }))
  return undefined
}, [cfg.songTransitionMode, readySongRevision, songTransition.phase, songTransition.revision])

const effectsPaused = cfg.songTransitionMode === 'shatter' && songTransition.phase !== 'idle'
const onSnapshotReady = useCallback((revision) => setSongTransition((current) => advanceSongTransition(current, { type: 'snapshot-ready', revision, at: performance.now() })), [])
const onSnapshotFailed = useCallback((revision) => setSongTransition((current) => advanceSongTransition(current, { type: 'snapshot-failed', revision, at: performance.now() })), [])
const onOutFinished = useCallback((revision) => setSongTransition((current) => advanceSongTransition(current, { type: 'out-finished', revision, at: performance.now() })), [])
const onInFinished = useCallback((revision) => setSongTransition((current) => advanceSongTransition(current, { type: 'finished', revision, at: performance.now() })), [])
```

The existing `transitionVisual` call must not use `pendingSongChange` for shatter mode. It should keep `frozenVisual` only through `capture-out`, `shatter-out`, and `dormant`; new live content becomes visible for `capture-in` and after `shatter-in` completes.

- [ ] **Step 4: 暫停 Capsule 的所有非 transition 動畫**

```jsx
// src/components/Capsule.jsx: exact prop extension and effect gates
function Capsule({ mouseContainer, line, trans, reserveTrans, playing, lineKey, useMirror, songName, cfg, glass, coverUrl, avatarUrl, progressRef, karaokeRef, lyricFillRef, showProgress, transitionPhase = 'idle', transitionRevision = 0, effectsPaused = false, mouseState = { active: false, globalMousePos: { x: 0, y: 0 }, mouseOffset: { x: 0, y: 0 } }, onSnapshotReady, onSnapshotFailed, onOutFinished, onInFinished, onClick, onContextMenu }) {
  const cosmeticPlaying = playing && !effectsPaused
  const shatterContent = cfg.songTransitionMode === 'shatter'
    && ['shatter-out', 'dormant', 'shatter-in'].includes(transitionPhase)

  useEffect(() => {
    if (effectsPaused || (!characterHighlight && !fillHighlight)) return undefined
    let frame = 0
    let lastCharacterRatio = -1
    let lastFillRatio = -1
    let stopped = false
    const paint = () => {
      if (stopped) return
      const characterRatio = Math.max(0, Math.min(1, karaokeRef?.current || 0))
      const fillRatio = Math.max(0, Math.min(1, lyricFillRef?.current || 0))
      const roundedCharacter = Math.round(characterRatio * 1000) / 1000
      const roundedFill = Math.round(fillRatio * 1000) / 1000
      if (characterHighlight && roundedCharacter !== lastCharacterRatio) {
        applyKaraokeClasses(txtRef.current, roundedCharacter, text)
        lastCharacterRatio = roundedCharacter
      }
      if (fillHighlight && roundedFill !== lastFillRatio && txtRef.current) {
        txtRef.current.style.setProperty('--lyric-fill', `${(roundedFill * 100).toFixed(2)}%`)
        lastFillRatio = roundedFill
      }
      if (cosmeticPlaying) frame = requestAnimationFrame(paint)
    }
    paint()
    return () => { stopped = true; cancelAnimationFrame(frame) }
  }, [characterHighlight, fillHighlight, cosmeticPlaying, effectsPaused, karaokeRef, lyricFillRef, lineKey, useMirror, text])

  useEffect(() => {
    if (effectsPaused) return undefined
    const targets = []
    if (cfg.barBeat && barRef.current) targets.push([barRef.current, 'beat', 480])
    const wrap = wrapRef.current
    const surface = wrap?.querySelector('.glass') || wrap?.querySelector('.plain')
    if (cfg.fxBreathe && surface) targets.push([surface, 'breathe', 560])
    const vinyl = wrap?.querySelector('.vinyl')
    if (cfg.fxVinylBounce && vinyl) targets.push([vinyl, 'bounce', 520])
    const timers = targets.map(([element, className, ms]) => {
      element.classList.remove(className)
      void element.offsetWidth
      element.classList.add(className)
      return setTimeout(() => element.classList.remove(className), ms)
    })
    return () => timers.forEach(clearTimeout)
  }, [lineKey, cfg.barBeat, cfg.fxBreathe, cfg.fxVinylBounce, effectsPaused])

  const paintProgressAndTime = () => {
    const p = Math.max(0, Math.min(1, progressRef?.current?.ratio ?? progressRef?.current ?? 0))
    if (fillRef.current) fillRef.current.style.width = `${(p * 100).toFixed(2)}%`
    if (segmentsRef.current) {
      const nodes = segmentsRef.current.querySelectorAll('.progress__segment')
      const states = progressSegmentStates(segmentCount, p)
      for (let index = 0; index < nodes.length; index += 1) nodes[index].classList.toggle('played', states[index])
    }
    if (timeRef.current) {
      const cur = progressRef?.current?.posSec
      const dur = progressRef?.current?.durSec
      const format = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
      timeRef.current.textContent = cur != null && dur ? `${format(cur)} / ${format(dur)}` : ''
    }
  }

  // Keep the current static progress values while frozen; do not schedule the visual progress timer.
  useEffect(() => {
    if (effectsPaused) return undefined
    const id = setInterval(paintProgressAndTime, 250)
    return () => clearInterval(id)
  }, [progressRef, segmentCount, effectsPaused])
}
```

The actual JSX changes in the same task are:

```jsx
<DecorationCanvas cfg={cfg} playing={playing && !effectsPaused} eventKey={lineKey} previewActive={!effectsPaused} />

<SongTransitionLayer
  phase={transitionPhase}
  revision={transitionRevision}
  sourceRef={wrapRef}
  onSnapshotReady={onSnapshotReady}
  onSnapshotFailed={onSnapshotFailed}
  onOutFinished={onOutFinished}
  onInFinished={onInFinished}
/>

<div className={['capsule interactive', effectsPaused ? 'effects-paused' : '', mouseState.active ? 'mouse-near' : ''].filter(Boolean).join(' ')}>
  <LiquidGlass
    style={{ position: 'fixed' }}
    mouseContainer={mouseContainer}
    globalMousePos={mouseState.globalMousePos}
    mouseOffset={mouseState.mouseOffset}
    elasticity={effectsPaused ? 0 : glass.elasticity}
    displacementScale={glass.displacementScale}
    blurAmount={glass.blurAmount}
    saturation={glass.saturation}
    aberrationIntensity={glass.aberrationIntensity}
    cornerRadius={cornerRadius}
    mode={glass.mode}
    overLight={glass.overLight}
    padding="0"
  >
    {contentShell}
  </LiquidGlass>
</div>
```

Keep `.content--shatter-hidden` false during `capture-out` and `capture-in`; turn it on only for `shatter-out`, `dormant`, and `shatter-in`, so Canvas always captures a real old/new surface before the content is hidden.

```css
/* stop every CSS-only cosmetic animation without overriding composed transforms */
.capsule.effects-paused .vinyl,
.capsule.effects-paused .progress__motion,
.capsule.effects-paused .glass-sheen,
.capsule.effects-paused .lyrics__txt,
.capsule.effects-paused .noise-layer {
  animation-play-state: paused !important;
}
```

- [ ] **Step 5: 確認 transition test 綠燈且沒有 resize / position regression**

Run: `node --test tests/songTransition.test.mjs tests/clickThrough.test.mjs`  
Expected: PASS.

### Task 7: 實作 rAF 節流的滑鼠 hook 與設定控制項

**Files:**
- Create: `src/usePillMouse.js`
- Modify: `src/App.jsx`
- Modify: `src/components/Capsule.jsx`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Modify: `tests/pillMouse.test.mjs`

**Interfaces:**
- `usePillMouse({ sourceRef, activationDistance, disabled })` returns the exact `pillPointerState` shape.
- `Capsule` exposes its root HTMLElement through the existing `innerRef` prop.

- [ ] **Step 1: 增加 hook 的 source-level / pure contract test**

```js
test('Capsule exposes its measured root and App gates LiquidGlass through the local mouse hook', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  assert.match(app, /usePillMouse/)
  assert.match(app, /hoverActivationDistance/)
  assert.match(capsule, /globalMousePos=\{mouseState\.globalMousePos\}/)
  assert.match(capsule, /mouseOffset=\{mouseState\.mouseOffset\}/)
  assert.match(capsule, /innerRef\.current = wrapRef\.current/)
})
```

- [ ] **Step 2: 確認 hook contract test 失敗**

Run: `node --test tests/pillMouse.test.mjs`  
Expected: FAIL because the hook and external props are absent.

- [ ] **Step 3: 實作 hook 與 Capsule ref exposure**

```jsx
// src/usePillMouse.js
import { useEffect, useRef, useState } from 'react'
import { pillPointerState } from './pillMouse.js'

const NEUTRAL = { active: false, globalMousePos: { x: 0, y: 0 }, mouseOffset: { x: 0, y: 0 } }

export function usePillMouse({ sourceRef, activationDistance, disabled }) {
  const [state, setState] = useState(NEUTRAL)
  const frame = useRef(0)
  const point = useRef(null)
  useEffect(() => {
    if (disabled) { setState(NEUTRAL); return undefined }
    const update = () => {
      frame.current = 0
      const rect = sourceRef.current?.getBoundingClientRect?.()
      const next = pillPointerState(point.current, rect, activationDistance)
      setState((previous) => previous.active === next.active
        && previous.globalMousePos.x === next.globalMousePos.x
        && previous.globalMousePos.y === next.globalMousePos.y ? previous : next)
    }
    const onMove = (event) => {
      point.current = { x: event.clientX, y: event.clientY }
      if (!frame.current) frame.current = requestAnimationFrame(update)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame.current) }
  }, [sourceRef, activationDistance, disabled])
  return state
}
```

```jsx
// src/components/Capsule.jsx, immediately after wrapRef declaration
useEffect(() => {
  if (innerRef) innerRef.current = wrapRef.current
  return () => { if (innerRef) innerRef.current = null }
}, [innerRef])
```

```jsx
// src/App.jsx
const mouseState = usePillMouse({
  sourceRef: capsuleRef,
  activationDistance: cfg.hoverActivationDistance,
  disabled: effectsPaused || (glass.elasticity <= 0 && !cfg.fxTilt),
})
// pass mouseState into Capsule
```

- [ ] **Step 4: 加入單一、易懂的 UI slider 與近距離 3D class**

```jsx
// src/ConsoleWindow.jsx directly after the existing 「滑鼠 3D 傾斜」 Toggle
<Slider label="滑鼠感應距離" value={cfg.hoverActivationDistance ?? 14} min={0} max={80} step={1}
  onChange={(v) => setCfg({ hoverActivationDistance: v })} fmt={(v) => `${v}px`} />
```

```css
/* replace direct :hover trigger with App-provided near state */
.fx-tilt.mouse-near .glass { --t-rot: 3deg; }
```

- [ ] **Step 5: 驗證近距離 gate 不會回復到 200px**

Run: `node --test tests/pillMouse.test.mjs tests/stateMigration.test.cjs`  
Expected: PASS.

Run: `npm.cmd run build`  
Expected: Vite build success.

### Task 8: 完整回歸與實際 Overlay 驗證

**Files:**
- Test: `tests/songLifecycle.test.cjs`
- Test: `tests/songTransition.test.mjs`
- Test: `tests/pillMouse.test.mjs`
- Test: existing complete suite

- [ ] **Step 1: 執行完整自動測試與語法檢查**

Run:

```powershell
node --check electron\main.cjs
node --check electron\preload.cjs
npm.cmd test
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 2: 以隔離 user-data 啟動 Electron 實測**

Run:

```powershell
node_modules\electron\dist\electron.exe . --remote-debugging-port=9223 --user-data-dir=D:\DIOWMOW\Documents\克勞德\.tmp-lucent-verify-9223
```

Verify with CDP and screenshots:

1. 非尾端手動切歌沒有進入 `capture-out`。
2. 模擬尾端停止只進入一次 `capture-out → shatter-out → dormant`。
3. 新歌 `loading:false` 且 playing 時進入 `capture-in → shatter-in → idle`，新歌完整顯示。
4. transition 期間 `effects-paused` class 存在，DecorationCanvas 沒有排程後續 rAF。
5. 滑鼠在藥丸外 30px（預設 14px）時 `mouse-near` 不存在；14px 內才存在。
6. Canvas、背景、粒子全部保留藥丸圓角，BrowserWindow position/size 不改變。

- [ ] **Step 3: 關閉隔離測試程序並保留使用者原本設定**

Run only after verifying the command line contains `.tmp-lucent-verify-9223`:

```powershell
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -match 'tmp-lucent-verify-9223' } |
  Select-Object ProcessId,ParentProcessId,CommandLine
```

Then stop only the verified parent Electron PID. Do not touch `C:\Users\DIOWMOW\AppData\Roaming\lucent-lyrics\lgl-config.json`.

- [ ] **Step 4: Report verified outcome without packaging EXE**

Report changed files, test/build output, actual screenshot observations, natural-end limitations, and confirm EXE was deliberately not packaged because the user requested packaging only after all tasks are complete.
