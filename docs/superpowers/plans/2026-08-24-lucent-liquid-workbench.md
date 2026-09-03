# 璃音 Lucent 液態工作檯 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the console's fixed tabs with a cold-white, desktop-visible, rounded liquid workbench while preserving every current playback, appearance, room, privacy, and update action.

**Architecture:** Keep the existing Electron `consoleWin` transparent and frameless. The React console becomes a workbench shell with one central live `Capsule` preview, four draggable module triggers, and one contextual inspector that reuses the current `PlayTab`, `LookTab`, `RoomTab`, and `UpdateTab` components. Persist only normalized module coordinates and the active inspector identity through the existing `ui` settings migration path.

**Tech Stack:** Electron 43, React 19, Vite 6, CSS transforms/backdrop-filter, existing LiquidGlass component, Node built-in test runner.

## Global Constraints

- Do not add commercial, payment, authorization, game HUD, game mode, game detection, FPS/MOBA, audio-analysis, desktop-capture, or desktop-blur systems.
- The console may reveal the desktop through transparency, but must not capture desktop pixels or fake true backdrop blur.
- Preserve real CDP lyric mirror, karaoke, playback coordinator, LAN room authority, updater, profiles, and settings compatibility.
- Keep visible copy in Traditional Chinese.
- Use one pointer `requestAnimationFrame` loop for workbench proximity effects. Only animate `transform` and `opacity`; do not animate a permanent large `filter` or create per-module timers.
- Existing workspace is not a Git checkout. Do not attempt commits; record verification output in the handoff instead.

---

## File map

| File | Responsibility |
| --- | --- |
| `shared/liquidWorkbench.cjs` | Normalize, clamp, and serialize workbench UI layout without React or Electron dependencies. |
| `shared/defaults.json` | Schema 13 default workbench state. |
| `shared/stateMigration.cjs` | Backward-compatible v12 to v13 default merge and validation. |
| `src/liquidWorkbenchModel.js` | ESM bridge that exposes the shared normalized workbench model to React. |
| `src/useWorkbenchPointer.js` | One RAF-based pointer proximity and module-drag controller. |
| `src/ConsoleWindow.jsx` | Workbench shell, central preview, module triggers, contextual inspector and existing tab-content reuse. |
| `src/styles.css` | Cold-white transparent shell, whole-window radii, limited material layers, module and inspector motion. |
| `tests/liquidWorkbench.test.cjs` | Pure layout/migration normalization tests. |
| `tests/liquidWorkbenchRuntime.test.mjs` | Static renderer wiring and performance-boundary regression tests. |
| `tests/stateMigration.test.cjs` | Schema 13 migration expectations. |

## Task 1: Add a versioned, bounded workbench layout model

**Files:**
- Create: `shared/liquidWorkbench.cjs`
- Create: `tests/liquidWorkbench.test.cjs`
- Modify: `shared/defaults.json`
- Modify: `shared/stateMigration.cjs`
- Modify: `tests/stateMigration.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `WORKBENCH_MODULE_IDS`, `DEFAULT_WORKBENCH`, `normalizeWorkbench(raw)`, and `moveWorkbenchModule(workbench, moduleId, point)`.
- Consumes a persisted `ui.workbench` object and returns `{ activeModule, modules }`, where every coordinate is normalized to `[-0.42, 0.42]` on x and `[-0.34, 0.34]` on y.
- Later React work consumes only the normalized object; it must never write raw pixel coordinates to config.

- [ ] **Step 1: Write failing model tests**

Create `tests/liquidWorkbench.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DEFAULT_WORKBENCH,
  normalizeWorkbench,
  moveWorkbenchModule,
} = require('../shared/liquidWorkbench.cjs')

test('workbench always restores the four known modules and a safe active module', () => {
  const value = normalizeWorkbench({ activeModule: 'invalid', modules: { player: { x: 9, y: -9 } } })
  assert.deepEqual(Object.keys(value.modules), ['play', 'look', 'room', 'system'])
  assert.equal(value.activeModule, DEFAULT_WORKBENCH.activeModule)
  assert.deepEqual(value.modules.play, { x: 0.42, y: -0.34 })
})

test('moving a module persists bounded normalized coordinates without touching other modules', () => {
  const moved = moveWorkbenchModule(DEFAULT_WORKBENCH, 'look', { x: -1, y: 1 })
  assert.deepEqual(moved.modules.look, { x: -0.42, y: 0.34 })
  assert.deepEqual(moved.modules.play, DEFAULT_WORKBENCH.modules.play)
})
```

- [ ] **Step 2: Run the test and confirm the missing-model failure**

Run:

```powershell
node --test tests/liquidWorkbench.test.cjs
```

Expected: failure because `../shared/liquidWorkbench.cjs` does not exist.

- [ ] **Step 3: Implement the minimal shared model**

Create `shared/liquidWorkbench.cjs`:

```js
const WORKBENCH_MODULE_IDS = Object.freeze(['play', 'look', 'room', 'system'])
const DEFAULT_WORKBENCH = Object.freeze({
  activeModule: 'play',
  modules: Object.freeze({
    play: Object.freeze({ x: -0.34, y: -0.26 }),
    look: Object.freeze({ x: 0.34, y: -0.23 }),
    room: Object.freeze({ x: -0.28, y: 0.27 }),
    system: Object.freeze({ x: 0.29, y: 0.27 }),
  }),
})

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
function point(value, fallback) {
  return {
    x: clamp(Number.isFinite(value?.x) ? value.x : fallback.x, -0.42, 0.42),
    y: clamp(Number.isFinite(value?.y) ? value.y : fallback.y, -0.34, 0.34),
  }
}
function normalizeWorkbench(raw) {
  const modules = Object.fromEntries(WORKBENCH_MODULE_IDS.map((id) => [id, point(raw?.modules?.[id], DEFAULT_WORKBENCH.modules[id])]))
  const activeModule = raw?.activeModule === '' || WORKBENCH_MODULE_IDS.includes(raw?.activeModule)
    ? raw.activeModule
    : DEFAULT_WORKBENCH.activeModule
  return { activeModule, modules }
}
function moveWorkbenchModule(workbench, moduleId, target) {
  const current = normalizeWorkbench(workbench)
  if (!WORKBENCH_MODULE_IDS.includes(moduleId)) return current
  return { ...current, modules: { ...current.modules, [moduleId]: point(target, current.modules[moduleId]) } }
}
module.exports = { WORKBENCH_MODULE_IDS, DEFAULT_WORKBENCH, normalizeWorkbench, moveWorkbenchModule }
```

- [ ] **Step 4: Add schema 13 defaults and migration**

In `shared/defaults.json`, increment `schemaVersion` from `12` to `13` and add this object inside the existing top-level `ui` object:

```json
"workbench": {
  "activeModule": "play",
  "modules": {
    "play": { "x": -0.34, "y": -0.26 },
    "look": { "x": 0.34, "y": -0.23 },
    "room": { "x": -0.28, "y": 0.27 },
    "system": { "x": 0.29, "y": 0.27 }
  }
}
```

In `shared/stateMigration.cjs`, require `normalizeWorkbench` and merge the normalized value into `ui`:

```js
const { normalizeWorkbench } = require('./liquidWorkbench.cjs')
// inside returned ui object, alongside lookSections
workbench: normalizeWorkbench(uiRaw.workbench),
```

Update the existing schema migration test to load a schema 12 object without `ui.workbench`, then assert all four modules are restored and bounded malformed input is clamped.

- [ ] **Step 5: Add the new test file to the exact test command and verify**

Insert `tests/liquidWorkbench.test.cjs` after `tests/stateMigration.test.cjs` in `package.json`'s `test` script. Run:

```powershell
npm.cmd test
```

Expected: all existing tests plus the two new workbench model tests pass.

## Task 2: Introduce a React workbench shell without deleting existing features

**Files:**
- Create: `src/liquidWorkbenchModel.js`
- Modify: `src/ConsoleWindow.jsx:1-198`
- Create: `tests/liquidWorkbenchRuntime.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `src/liquidWorkbenchModel.js` exposes the CommonJS shared model to the renderer:

```js
import model from '../shared/liquidWorkbench.cjs'
export const { WORKBENCH_MODULE_IDS, DEFAULT_WORKBENCH, normalizeWorkbench, moveWorkbenchModule } = model
```

- `LiquidWorkbench` receives `{ state, roomState, status, members, queue, capabilities, commandResult, setUi, setGlass, setCfg, setLyricsRaw, setProfiles, setUpdates }`.
- Existing `PlayTab`, `LookTab`, `RoomTab`, and `UpdateTab` remain their current function components and are rendered only inside a contextual inspector. No existing API or IPC call changes.

- [ ] **Step 1: Write the failing structural renderer test**

Create `tests/liquidWorkbenchRuntime.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('console renders one liquid workbench and keeps existing feature panels reachable', () => {
  assert.match(source, /function LiquidWorkbench\(/)
  assert.match(source, /className="workbench__core"/)
  assert.match(source, /<PlayTab /)
  assert.match(source, /<LookTab /)
  assert.match(source, /<RoomTab /)
  assert.match(source, /<UpdateTab /)
  assert.doesNotMatch(source, /className="tabs"/)
})
```

- [ ] **Step 2: Run the new test and confirm it fails on the current tab layout**

Run:

```powershell
node --test tests/liquidWorkbenchRuntime.test.mjs
```

Expected: failure because `LiquidWorkbench` and `.workbench__core` do not exist and `.tabs` still exists.

- [ ] **Step 3: Replace only the ConsoleWindow shell**

Replace the `tab` state and the `.tabs` branch in `ConsoleWindow` with a `LiquidWorkbench` call. Add a `LiquidWorkbench` component above `UpdateTab` with this dispatch mapping:

```jsx
const panelFor = {
  play: <PlayTab roomState={roomState} status={status} commandResult={commandResult} />,
  look: <LookTab state={state} setGlass={setGlass} setCfg={setCfg} setLyricsRaw={setLyricsRaw} setProfiles={setProfiles} setUi={setUi} cover={roomState?.song?.cover} />,
  room: <RoomTab status={status} members={members} queue={queue} capabilities={capabilities} commandResult={commandResult} />,
  system: <UpdateTab settings={state.updates} setUpdates={setUpdates} />,
}
```

The outer JSX must have these semantic elements:

```jsx
<div className="cw cw--workbench">
  <div className="workbench" onPointerDown={closeInspectorWhenBackdrop}>
    <header className="workbench__chrome">…brand, sync summary, close button…</header>
    <div className="workbench__core"><ConsoleCapsulePreview … /></div>
    {WORKBENCH_MODULE_IDS.map((id) => <WorkbenchModule key={id} id={id} … />)}
    {focused && <aside className="workbench__inspector">{panelFor[focused]}</aside>}
  </div>
</div>
```

Reuse the current `LookTab` preview logic by extracting the existing preview JSX into `ConsoleCapsulePreview`; do not clone `Capsule` lyric timing or invent demo song state. Keep `ov.closeConsole()` attached to the existing close button.

- [ ] **Step 4: Verify feature reachability and full test command**

Add `tests/liquidWorkbenchRuntime.test.mjs` to `package.json`'s `test` script. Run:

```powershell
npm.cmd test
```

Expected: all tests pass and the static check proves the legacy components are still reachable through the workbench.

## Task 3: Add the cold-white, rounded, desktop-visible material shell

**Files:**
- Modify: `src/styles.css:800-900`
- Modify: `tests/liquidWorkbenchRuntime.test.mjs`

**Interfaces:**
- `.cw--workbench` remains transparent outside `.workbench`.
- `.workbench` owns `border-radius: 28px` and `overflow: hidden`; no child may create a square visual background outside it.
- `.workbench__material` is a static material layer. It cannot use desktop-capture APIs, a Canvas, `setInterval`, or an infinite `filter` animation.

- [ ] **Step 1: Extend the failing renderer test with material boundaries**

Append:

```js
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
test('workbench exposes desktop only through its rounded material shell', () => {
  assert.match(css, /\.cw--workbench\s*\{[^}]*background:\s*transparent/s)
  assert.match(css, /\.workbench\s*\{[^}]*border-radius:\s*28px/s)
  assert.match(css, /\.workbench\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.workbench__material\s*\{[\s\S]*backdrop-filter:/)
  assert.doesNotMatch(css, /getDisplayMedia|desktopCapturer|capturePage/)
})
```

- [ ] **Step 2: Run the test and confirm it fails before CSS work**

Run:

```powershell
node --test tests/liquidWorkbenchRuntime.test.mjs
```

Expected: failure for missing `.cw--workbench`, `.workbench`, and `.workbench__material` rules.

- [ ] **Step 3: Replace the legacy console panel skin with the workbench skin**

Add material structure to the workbench JSX:

```jsx
<div className="workbench__material" aria-hidden="true" />
<div className="workbench__sheen" aria-hidden="true" />
```

Add scoped CSS that follows these fixed boundaries:

```css
.cw--workbench { background: transparent; padding: 14px; }
.workbench { position: relative; min-height: 100%; overflow: hidden; border: 1px solid rgba(255,255,255,.58); border-radius: 28px; background: rgba(220,238,246,.22); box-shadow: inset 0 1px rgba(255,255,255,.78), 0 18px 56px rgba(32,60,78,.20); }
.workbench__material { position: absolute; inset: 0; z-index: 0; pointer-events: none; background: linear-gradient(125deg, rgba(255,255,255,.52), rgba(207,232,242,.18) 48%, rgba(166,202,219,.28)); backdrop-filter: blur(16px) saturate(118%); }
.workbench__sheen { position: absolute; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(ellipse at 20% 0%, rgba(255,255,255,.64), transparent 42%); }
```

Every user-facing foreground layer must be `position: relative; z-index: 1`. Do not apply `filter` to the root or animate `backdrop-filter`.

- [ ] **Step 4: Verify material tests and visual bounds**

Run:

```powershell
node --test tests/liquidWorkbenchRuntime.test.mjs
npm.cmd run build
```

Expected: both commands exit 0. In the running development window, check all four corners over a non-white desktop: corners are transparent outside the 28px shell, no square background or flicker appears, and close control remains usable.

## Task 4: Add bounded module focus, proximity, and dragging

**Files:**
- Create: `src/useWorkbenchPointer.js`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Modify: `tests/liquidWorkbenchRuntime.test.mjs`

**Interfaces:**
- `useWorkbenchPointer({ active, onMoveEnd })` returns `{ rootRef, moduleProps(id), styleFor(id) }`.
- At most one RAF can be pending. `moduleProps(id).onPointerUp` calls `onMoveEnd(id, { x, y })` with normalized coordinates.
- `styleFor(id)` returns only CSS custom values `--wb-x`, `--wb-y`, `--wb-near`, and `--wb-lift`; it must not set `filter`, width, height, or window bounds.

- [ ] **Step 1: Add source-level failure checks for the interaction boundary**

Append this test:

```js
test('workbench uses one RAF pointer controller and transform-only module motion', () => {
  const hook = fs.readFileSync(new URL('../src/useWorkbenchPointer.js', import.meta.url), 'utf8')
  assert.match(hook, /requestAnimationFrame/)
  assert.match(hook, /cancelAnimationFrame/)
  assert.match(hook, /onMoveEnd\(id, \{ x, y \}\)/)
  assert.doesNotMatch(hook, /setInterval|setTimeout\(/)
  assert.match(css, /\.workbench__module\s*\{[\s\S]*transform:/)
})
```

- [ ] **Step 2: Run the test and confirm the hook is absent**

Run:

```powershell
node --test tests/liquidWorkbenchRuntime.test.mjs
```

Expected: failure because `src/useWorkbenchPointer.js` does not exist.

- [ ] **Step 3: Implement a single-frame pointer controller**

Create the hook using one `rafIdRef`, one `pointerRef`, and one `ResizeObserver`. The central movement formula is:

```js
const dx = (pointer.x - centerX) / Math.max(rect.width, 1)
const dy = (pointer.y - centerY) / Math.max(rect.height, 1)
const distance = Math.hypot(dx, dy)
const near = Math.max(0, 1 - distance / 0.22)
```

Schedule a frame only from pointer movement; in that frame update React state once for all module proximity values. On pointer release, calculate normalized module coordinates relative to the workbench rect and call exactly:

```js
onMoveEnd(id, { x, y })
```

Cancel the RAF and disconnect the observer in the effect cleanup. While an inspector is open, modules other than the active module have `--wb-near: 0` and do not react.

- [ ] **Step 4: Connect the hook to persisted layout**

In `LiquidWorkbench`, normalize `state.ui?.workbench`, pass `moveWorkbenchModule(workbench, id, point)` into `setUi({ workbench: next })`, and preserve the current `lookSections` object by relying on existing `setUi` patch semantics. Each module button gets `...moduleProps(id)` and an inline style from `styleFor(id)`.

Use a real `<button type="button">` for each module trigger. Pointer dragging must suppress the click that would otherwise open the inspector.

- [ ] **Step 5: Add CSS motion without layout thrash and verify**

Add:

```css
.workbench__module { transform: translate3d(var(--wb-x), var(--wb-y), 0) translateY(calc(var(--wb-lift) * -7px)); transition: transform 180ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease; }
.workbench__module:hover, .workbench__module:focus-visible { outline: 2px solid rgba(255,255,255,.72); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .workbench__module { transition: none; } }
```

Use actual pixel coordinates in the renderer style calculation if required by CSS positioning; keep persisted values normalized. Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all tests and build pass. Manually check that module proximity activates only nearby, drag stays inside workbench, focus is visible, and CPU returns to idle when the pointer stops.

## Task 5: Preserve accessibility, regression coverage, and runtime validation

**Files:**
- Modify: `src/ConsoleWindow.jsx`
- Modify: `tests/liquidWorkbenchRuntime.test.mjs`
- Modify: `package.json` only if a new explicit test file was not yet added

**Interfaces:**
- Escape returns the workbench to its neutral state by clearing `activeModule`; this personal UI state is persisted.
- Clicking blank workbench material clears only the inspector, never closes the console or alters overlay state.
- Existing close button still calls `ov.closeConsole()`.

- [ ] **Step 1: Write the final regression test**

Add assertions:

```js
test('workbench keeps keyboard and existing application controls available', () => {
  assert.match(source, /onKeyDown={[\s\S]*event\.key === 'Escape'/)
  assert.match(source, /ov\.closeConsole\(\)/)
  assert.match(source, /aria-label="播放模組"/)
  assert.match(source, /aria-label="外觀模組"/)
  assert.match(source, /aria-label="房間模組"/)
  assert.match(source, /aria-label="系統模組"/)
})
```

- [ ] **Step 2: Run it and confirm the missing accessibility wiring**

Run:

```powershell
node --test tests/liquidWorkbenchRuntime.test.mjs
```

Expected: failure until Escape and module labels are wired.

- [ ] **Step 3: Implement neutral-state keyboard behavior**

Give the workbench root `tabIndex={-1}` and this handler:

```jsx
onKeyDown={(event) => {
  if (event.key === 'Escape') setUi({ workbench: { ...workbench, activeModule: '' } })
}}
```

Update `normalizeWorkbench` so empty `activeModule` is valid and means no inspector. Add each module's fixed Chinese `aria-label`. The close button remains independent from this keyboard flow.

- [ ] **Step 4: Verify the complete release-quality path**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Then start the development app with:

```powershell
npm.cmd run dev
```

Manual checks:

1. Place the console over a colorful desktop wallpaper. Confirm desktop is visible through the workbench but no square panel leaks outside rounded corners.
2. Open every module and confirm existing Playback, Appearance, Room, and Update controls still work.
3. Change a lyric appearance setting and confirm only the preview changes immediately; actual overlay synchronization continues.
4. Drag all four modules, close and reopen the console, and confirm layout restores.
5. Use Escape and pointer background click to close the inspector; use Tab to reach every module and close button.
6. Play a song, join/leave a room, and verify no changes to lyric mirror, avatar/cover display, room authority, or update status.
7. Move the pointer away and observe no continuing visual animation or material flicker.

Expected: test and build commands exit 0; manual checks all pass before a later packaging request.
