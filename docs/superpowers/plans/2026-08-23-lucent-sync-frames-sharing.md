# Lucent Sync, Frames, Transitions, and Style Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate one-line lyric lag, produce a verified interim EXE, then add stable noise, spacing, adaptive frames, in-place song transitions, shaped glass sheen, and consent-based LAN style offers.

**Architecture:** Keep Electron main as the authority for NetEase CDP, room transport, persistence, and package creation. Put deterministic selection/state logic in small CommonJS or ESM helpers so Node tests execute behavior directly; React components only compose visual layers and consume validated config. Playback state remains automatic, while appearance sharing becomes an explicit targeted offer accepted by the receiver.

**Tech Stack:** Electron 33, React 19, Vite 6, WebSocket `ws`, `liquid-glass-react`, Node test runner, electron-builder portable target.

## Global Constraints

- Work in `D:\DIOWMOW\Documents\克勞德`; it is not a Git repository, so do not fabricate commits.
- Do not add game HUD, game detection, game profiles, FPS/MOBA features, or fake audio analysis.
- Do not move the BrowserWindow during song transitions; the pill stays at its current position.
- Preserve NetEase song detection, mirror lyrics, YRC word timing, pause/seek behavior, progress bar, vinyl, screen boundaries, and LAN playback sync.
- Stage one must produce a verified interim `Lucent 1.0.0.exe`; final packaging happens again after every task passes.
- All new settings persist and old configs load through safe defaults.

---

### Task 1: Deterministic NetEase active-line selection

**Files:**
- Create: `shared/lyricMirror.cjs`
- Modify: `electron/ncmcdp.cjs`
- Test: `tests/lyricMirror.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `selectLyricCandidate(candidates, positionSec)` returning `{ index, main, sub, source } | null`.
- Produces `buildLyricSnapshot(previous, candidate)` returning a monotonically sequenced snapshot only when identity changes.
- `electron/ncmcdp.cjs` consumes the same precedence in its injected DOM reader.

- [ ] **Step 1: Write failing candidate-selection tests**

```js
test('explicit current wins when old and new rows are both opaque', () => {
  const rows = [
    { index: 4, text: '上一句', alpha: 1, time: 10 },
    { index: 5, text: '新一句', alpha: 1, time: 14, current: true },
  ]
  assert.equal(selectLyricCandidate(rows, 14.1).main, '新一句')
})

test('time fallback follows playback position when current class is absent', () => {
  const rows = [
    { index: 4, text: '上一句', alpha: 1, time: 10 },
    { index: 5, text: '新一句', alpha: 1, time: 14 },
  ]
  assert.equal(selectLyricCandidate(rows, 14.1).index, 5)
})
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/lyricMirror.test.cjs`

Expected: FAIL because `shared/lyricMirror.cjs` does not exist.

- [ ] **Step 3: Implement the pure selector and snapshot sequencer**

```js
function selectLyricCandidate(candidates = [], positionSec) {
  const rows = candidates.filter((row) => String(row.main || row.text || '').trim())
  const explicit = rows.find((row) => row.current || row.ariaCurrent)
  if (explicit) return normalize(explicit, 'current')
  const timed = rows.filter((row) => Number.isFinite(row.time) && row.time <= positionSec + 0.35)
  if (timed.length) return normalize(timed.reduce((a, b) => b.time > a.time ? b : a), 'time')
  const bright = rows.filter((row) => row.alpha >= 0.9)
  return bright.length ? normalize(bright[bright.length - 1], 'alpha') : null
}
```

- [ ] **Step 4: Add the DOM snapshot reader and one MutationObserver**

The injected reader must collect `.line` candidates with `classList.contains('current')`, `aria-current`, `data-time`, computed alpha, main and translation leaf text. Store the latest result in `window.__lglLyricSnapshot`; observer updates it on class/style/text/list changes. The existing single polling loop reads the snapshot every 80ms and repairs the observer if the lyric root remounts.

- [ ] **Step 5: Run GREEN and the full suite**

Run: `node --test tests/lyricMirror.test.cjs`

Expected: all focused tests pass.

Run: `npm.cmd test`

Expected: zero failures.

---

### Task 2: Real sync verification and interim EXE

**Files:**
- Modify: `.superpowers/sdd/diagnose-sync.cjs`
- Create: `.superpowers/sdd/lyric-line-lag-report.md`
- Generated: `dist/**`
- Generated: `release/Lucent 1.0.0.exe`

**Interfaces:**
- Diagnostic output records `currentText`, alpha fallback text, Overlay text, source, sequence, and timestamps.

- [ ] **Step 1: Extend diagnostics to measure explicit current and overlay independently**

Record every current-line change and the first overlay frame containing the same text. Do not alter playback.

- [ ] **Step 2: Rebuild and restart only this workspace Electron process**

Run: `npm.cmd run build`

Expected: Vite build succeeds.

Stop only the main `electron.exe` whose command line contains `D:\DIOWMOW\Documents\克勞德` and restart it hidden with CDP port 9362.

- [ ] **Step 3: Perform real NetEase QA**

Observe at least five line changes including one repeated lyric if available. Pass criteria: Overlay never remains on the previous `.line.current`; normal measured lag is at most one 80ms poll cycle plus renderer dispatch.

Also verify pause, resume, seek, and song switch do not revive the old line.

- [ ] **Step 4: Run final interim gates**

Run: `npm.cmd test`

Expected: zero failures.

Run: `npm.cmd run build`

Expected: success.

Run: `npm.cmd run dist`

Expected: portable EXE generated at `release/Lucent 1.0.0.exe`.

- [ ] **Step 5: Launch the interim EXE and verify startup**

Launch the generated EXE with a dedicated temporary user-data directory, verify the Overlay and settings window load, then close only that verification instance.

---

### Task 3: Schema, stable noise, spacing, and adaptive frame assets

**Files:**
- Modify: `shared/defaults.json`
- Modify: `shared/stateMigration.cjs`
- Modify: `src/appearanceModel.js`
- Create: `src/frameAssets.js`
- Modify: `src/components/Capsule.jsx`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Copy: `public/frames/pill/{crystal,royal,starlight}.png`
- Copy: `public/frames/vinyl/{hologram,wood,celestial}.png`
- Test: `tests/appearanceModel.test.mjs`
- Test: `tests/stateMigration.test.cjs`
- Create: `tests/frameAssets.test.mjs`
- Test: `tests/decorationRuntime.test.mjs`

**Interfaces:**
- `PILL_FRAMES` entries expose `{ id, label, url, slice, safeInset }`.
- `VINYL_FRAMES` entries expose `{ id, label, url }`.
- Config adds `lyricTranslationGap`, `translationProgressGap`, `pillFrame`, `vinylFrame`.

- [ ] **Step 1: Write failing schema and frame-manifest tests**

```js
assert.equal(schema.cfg.lyricTranslationGap, 7)
assert.equal(schema.cfg.translationProgressGap, 7)
assert.equal(schema.cfg.pillFrame, 'none')
assert.equal(schema.cfg.vinylFrame, 'none')
assert.ok(PILL_FRAMES.every((frame) => frame.slice && frame.safeInset))
assert.ok(VINYL_FRAMES.every((frame) => frame.url.endsWith('.png')))
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/appearanceModel.test.mjs tests/stateMigration.test.cjs tests/frameAssets.test.mjs`

Expected: FAIL for missing fields and module.

- [ ] **Step 3: Upgrade defaults and safe migration**

Increase schema version once. Add defaults without removing unknown legacy values, keep `fxSheen` ignored, and ensure appearance profiles include the new visual fields while personal window fields remain excluded.

- [ ] **Step 4: Materialize the six supplied assets with stable names**

Copy the three 2172x724 PNGs to pill frame names and the three 1254x1254 PNGs to vinyl frame names. Verify dimensions and alpha channel after copy.

- [ ] **Step 5: Replace unstable noise rasterization**

Move noise to a dedicated `.noise-layer` inside `.visualclip`, outside `.bglayer`'s blur filter. Use one static texture/compositor layer and opacity only; remove `repeating-conic-gradient` and `mix-blend-mode` from the filtered pseudo-element.

- [ ] **Step 6: Render spacing and frames**

Pass CSS variables for both gaps. Add `.pill-frame` using manifest-driven `border-image-slice` and content safe insets. Add `.vinyl-frame` as a centered square `img` with `object-fit: contain`, pointer-events none, and no rotation.

- [ ] **Step 7: Add Chinese controls and immediate preview**

Add original/translation gap sliders, translation/progress gap slider, `中下` song position, pill-frame select, and vinyl-frame select. Do not remove existing controls.

- [ ] **Step 8: Run focused and full tests**

Run: `node --test tests/appearanceModel.test.mjs tests/stateMigration.test.cjs tests/frameAssets.test.mjs tests/decorationRuntime.test.mjs`

Expected: all pass.

Run: `npm.cmd test`

Expected: zero failures.

---

### Task 4: In-place song transition and shaped glass sheen

**Files:**
- Create: `src/songTransition.js`
- Create: `src/components/SongTransitionLayer.jsx`
- Create: `src/components/GlassSheen.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/Capsule.jsx`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Modify: `shared/defaults.json`
- Test: `tests/songTransition.test.mjs`
- Test: `tests/appearanceModel.test.mjs`

**Interfaces:**
- `advanceSongTransition(state, event)` returns `{ revision, phase, startedAt }` and ignores stale revisions.
- `SongTransitionLayer` accepts `{ phase, mode, revision }`.
- `GlassSheen` accepts only config and renders within `.visualclip`.

- [ ] **Step 1: Write failing transition-state tests**

Cover `idle -> collapse -> hold -> expand -> idle`, stale revision rejection, loading completion, and cancellation by a newer song.

- [ ] **Step 2: Run RED**

Run: `node --test tests/songTransition.test.mjs`

Expected: FAIL because the state machine does not exist.

- [ ] **Step 3: Implement the pure state machine and bounded layers**

Use a fixed number of shard elements only while phase is `shatter`. Put collapse/expand transform on an outer transition wrapper so it cannot overwrite LiquidGlass tilt, elasticity, vinyl, or line animation transforms. Do not call `ov.setPosition`.

- [ ] **Step 4: Add sheen config and renderer**

Add mode `none|oval|droplet|arc`, width, height, travel duration, interval, brightness, blur, opacity, and direction. CSS keyframes keep the layer transparent during the interval hold and visible only during travel. All shapes stay inside `.visualclip`.

- [ ] **Step 5: Add mode-aware Chinese controls**

Only show shape settings when sheen is enabled; preserve the removed legacy `fxSheen` migration rule.

- [ ] **Step 6: Run focused, full, and build checks**

Run: `node --test tests/songTransition.test.mjs tests/appearanceModel.test.mjs`

Expected: all pass.

Run: `npm.cmd test && npm.cmd run build`

Expected: zero failures and successful build.

---

### Task 5: Consent-based bidirectional LAN style offers

**Files:**
- Create: `shared/styleOffer.cjs`
- Modify: `electron/room.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/overlayBridge.js`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Modify: `shared/roomStyle.cjs`
- Test: `tests/styleOffer.test.cjs`
- Test: `tests/roomStyle.test.cjs`

**Interfaces:**
- `createStyleOffer({ id, sender, target, style, name, createdAt })` validates and sanitizes payload.
- `Room.sendStyleOffer(targetId, offer)` allows host to target all/one and member to host only.
- `Room.respondStyleOffer(requestId, accepted)` routes one terminal response.
- Preload exposes `room.offerStyle`, `room.respondStyleOffer`, `room.pendingOffers`, `room.onStyleOffer`, and `room.onStyleResponse`.

- [ ] **Step 1: Write failing protocol and sanitization tests**

Cover host-to-all, host-to-one, member-to-host, forbidden member-to-member, duplicate request IDs, rejected offer no mutation, accepted offer sanitization, and exclusion of personal/window/playback fields.

- [ ] **Step 2: Run RED**

Run: `node --test tests/styleOffer.test.cjs tests/roomStyle.test.cjs`

Expected: FAIL because the protocol does not exist and current room state silently contains style.

- [ ] **Step 3: Stop automatic style overwrite**

Remove `style` from continuous host playback state and delete the member-side automatic `mergeSharedStyle/saveState` branch. Playback, lyrics, mirror, transition phase, and tick remain automatic.

- [ ] **Step 4: Add stable connection IDs and targeted messages**

Assign each host/client a session ID on hello/welcome. Route style offers and responses only according to role. Keep pending offers in main-process memory and mark each ID handled once.

- [ ] **Step 5: Implement accept-and-save atomically**

On accept, sanitize style, merge it into local state, create an appearance profile named `來自 <sender>－<local timestamp>`, broadcast state to both windows, and save once. On reject, do not mutate state. Return result to sender.

- [ ] **Step 6: Add room UI**

Host UI chooses all or a member and sends current appearance. Member UI sends current appearance to host. Incoming cards show sender, name, timestamp, and changed-section summary with `接受並保存` and `拒絕`; handled cards cannot be clicked twice.

- [ ] **Step 7: Run protocol, full, and build checks**

Run: `node --test tests/styleOffer.test.cjs tests/roomStyle.test.cjs tests/stateMigration.test.cjs`

Expected: all pass.

Run: `npm.cmd test && npm.cmd run build`

Expected: zero failures and successful build.

---

### Task 6: Full visual/runtime regression and final EXE

**Files:**
- Create: `.superpowers/sdd/lucent-final-qa-2026-08-23.md`
- Generated: `release/Lucent 1.0.0.exe`

**Interfaces:** None; this is the final gate.

- [ ] **Step 1: Run complete automation**

Run: `npm.cmd test`

Expected: zero failures.

Run: `npm.cmd run build`

Expected: success with no unresolved imports.

- [ ] **Step 2: Perform real visual QA**

Check noise mouse hover, all three pill frames across short/long/bilingual/max-font layouts, all three vinyl frames at minimum/maximum sizes, middle-bottom song title, gap extrema, each sheen shape/interval, collapse/hold/shatter/expand, and no frame escaping the pill/window.

- [ ] **Step 3: Perform playback and LAN regression**

Verify NetEase line mirror and YRC, pause, seek, song switch, host/member playback, host-to-all/one offer, member-to-host offer, accept-and-save persistence after restart, rejection with no mutation, and personal window settings retained.

- [ ] **Step 4: Package and launch final EXE**

Run: `npm.cmd run dist`

Expected: `release/Lucent 1.0.0.exe` rebuilt successfully.

Launch with a fresh temporary user-data directory and verify startup, settings, assets, and saved-profile restart behavior.

## Plan Self-Review

- Every design requirement maps to a task.
- No BrowserWindow movement exists in transition tasks.
- Interim packaging occurs only after the isolated sync fix; final packaging repeats after all work.
- Automatic LAN style overwrite is explicitly removed before offers are enabled.
- New frame and sheen settings are included in schema, profiles, preview, LAN sanitization, tests, and final QA.
- No task introduces game-specific systems or fake audio analysis.
