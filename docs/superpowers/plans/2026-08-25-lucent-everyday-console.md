# 璃音 Lucent 日常控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the draggable glass workbench with an opaque, beginner-friendly control console that opens on launch, safely hides the desktop pill while editing, and gives users clear recovery and sync actions without changing music or lyric behavior.

**Architecture:** Keep Electron's overlay, playback, NetEase, room, and appearance engines unchanged. Add a small persisted console-UI model for navigation, tutorial state, theme, and close behavior; the Electron main process owns window/tray transitions, while React renders one fixed shell with a left navigation rail, central page, right contextual panel, app-native notices, and an onboarding dialog.

**Tech Stack:** Electron 43, React 19, Vite 6, Node built-in test runner, existing `useSharedState` IPC state bridge.

## Global Constraints

- All visible copy remains Traditional Chinese.
- The console visible surface is fully opaque and follows Windows light/dark mode; only pixels outside its rounded corners may be transparent, and it must not use desktop capture or `backdrop-filter`.
- Do not alter NetEase lyric mirroring, playback coordinator, room protocol, pill position, or appearance config semantics.
- Keep the desktop pill independently always-on-top; the console itself is a normal non-always-on-top window.
- Preserve old config files through default merge migration; do not require users to delete configuration.
- No packaging or GitHub publishing in this task.

---

### Task 1: Persisted console preferences and legacy migration

**Files:**
- Create: `shared/consoleState.cjs`
- Create: `tests/consoleState.test.cjs`
- Modify: `shared/defaults.json`
- Modify: `shared/stateMigration.cjs`
- Modify: `tests/stateMigration.test.cjs`
- Modify: `package.json`

**Interfaces:**
- `normalizeConsoleState(value, legacyWorkbench)` returns `{ selectedPage, onboardingVersion, theme, startupView, closeBehavior, launchAtLogin, appearanceSection }`.
- Valid pages are `home`, `play`, `look`, `room`, `settings`, and `help`.
- Legacy workbench active modules map `play -> play`, `look -> look`, `room -> room`, `system -> settings`; missing or invalid values map to `home`.

- [ ] **Step 1: Write failing model tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeConsoleState } = require('../shared/consoleState.cjs')

test('legacy workbench focus migrates to a stable console page', () => {
  assert.deepEqual(
    normalizeConsoleState({}, { activeModule: 'look' }),
    { selectedPage: 'look', onboardingVersion: 0, theme: 'system', startupView: 'console', closeBehavior: 'ask', launchAtLogin: false, appearanceSection: 'quick' },
  )
})

test('invalid console preferences fall back without discarding valid choices', () => {
  const value = normalizeConsoleState({ selectedPage: 'room', theme: 'pink', closeBehavior: 'later', launchAtLogin: true })
  assert.equal(value.selectedPage, 'room')
  assert.equal(value.theme, 'system')
  assert.equal(value.closeBehavior, 'ask')
  assert.equal(value.launchAtLogin, true)
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm.cmd exec -- node --test tests/consoleState.test.cjs`

Expected: failure because `shared/consoleState.cjs` does not exist.

- [ ] **Step 3: Add the minimum console-state model and defaults**

```js
const PAGES = new Set(['home', 'play', 'look', 'room', 'settings', 'help'])
const THEMES = new Set(['system', 'light', 'dark'])
const CLOSE_BEHAVIORS = new Set(['ask', 'pill', 'tray', 'quit'])
const LEGACY_PAGE = { play: 'play', look: 'look', room: 'room', system: 'settings' }

function normalizeConsoleState(value = {}, legacyWorkbench = {}) {
  const page = PAGES.has(value.selectedPage) ? value.selectedPage : LEGACY_PAGE[legacyWorkbench.activeModule] || 'home'
  return {
    selectedPage: page,
    onboardingVersion: Number.isInteger(value.onboardingVersion) && value.onboardingVersion >= 0 ? value.onboardingVersion : 0,
    theme: THEMES.has(value.theme) ? value.theme : 'system',
    startupView: value.startupView === 'pill' ? 'pill' : 'console',
    closeBehavior: CLOSE_BEHAVIORS.has(value.closeBehavior) ? value.closeBehavior : 'ask',
    launchAtLogin: value.launchAtLogin === true,
    appearanceSection: typeof value.appearanceSection === 'string' ? value.appearanceSection : 'quick',
  }
}

module.exports = { normalizeConsoleState }
```

Add `ui.console` to `shared/defaults.json`, bump `schemaVersion`, and call `normalizeConsoleState(uiRaw.console, uiRaw.workbench)` from `migrateState`. Keep `ui.workbench` readable for old config compatibility, but do not let it drive the new UI.

- [ ] **Step 4: Extend migration coverage**

Add tests that load schema version 21 with `ui.workbench.activeModule`, then verify `ui.console.selectedPage`; verify user-selected `ui.console` values survive a reload.

- [ ] **Step 5: Run migration tests and verify GREEN**

Run: `npm.cmd exec -- node --test tests/consoleState.test.cjs tests/stateMigration.test.cjs`

Expected: all tests pass.

### Task 2: Console lifecycle, startup and pill recovery

**Files:**
- Modify: `shared/windowLifecycle.cjs`
- Modify: `tests/windowLifecycle.test.cjs`
- Modify: `tests/consoleOverlayVisibility.test.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`

**Interfaces:**
- `resolveConsoleCloseAction(closeBehavior, explicitQuit)` returns `ask`, `pill`, `tray`, or `quit`.
- Preload exposes `console.requestClose()`, `console.closeWith(action, remember)`, `console.showPill()`, `console.hideToTray()`, and `console.onCloseRequested(cb)`.
- Opening the console collapses the desktop pill; selecting `pill` restores it; selecting `tray` hides both windows; selecting `quit` is the only normal path that closes services.

- [ ] **Step 1: Write failing lifecycle tests**

```js
test('console close preserves ask mode until the renderer chooses an action', () => {
  assert.equal(lifecycle.resolveConsoleCloseAction('ask', false), 'ask')
  assert.equal(lifecycle.resolveConsoleCloseAction('pill', false), 'pill')
  assert.equal(lifecycle.resolveConsoleCloseAction('tray', false), 'tray')
  assert.equal(lifecycle.resolveConsoleCloseAction('quit', true), 'quit')
})

test('main exposes renderer-owned close choices and pill recovery', () => {
  assert.match(main, /ipcMain\.handle\('console:close-with'/)
  assert.match(main, /ipcMain\.handle\('console:show-pill'/)
  assert.match(preload, /closeWith:/)
  assert.match(preload, /showPill:/)
})
```

- [ ] **Step 2: Run the lifecycle tests and verify RED**

Run: `npm.cmd exec -- node --test tests/windowLifecycle.test.cjs tests/consoleOverlayVisibility.test.cjs`

Expected: failure because the close resolver and new IPC endpoints do not exist.

- [ ] **Step 3: Implement the minimal main-process lifecycle**

Expand `shared/windowLifecycle.cjs` with the resolver. In `electron/main.cjs`, create the console as a normal non-always-on-top window with only its outer rounded-corner pixels transparent (`transparent: true`, `alwaysOnTop: false`); its renderer body remains opaque. Open it after the overlay/tray are ready when `state.ui.console.startupView === 'console'`, and remove the desktop-pill right-click console entry.

On console OS-close, prevent the close unless `explicitQuit` is set. For `ask`, send `console:close-request` to the renderer. For remembered actions, execute `showLucent`, `hideLucent`, or `requestFinalQuit`. Persist a remembered action only when `remember === true`.

- [ ] **Step 4: Add bridge endpoints and static regression assertions**

Expose the new console bridge methods through `electron/preload.cjs`. Extend overlay visibility tests to assert that startup opens the console route, the console is not always-on-top, and the pill is restored only by the `pill` action.

- [ ] **Step 5: Run lifecycle tests and verify GREEN**

Run: `npm.cmd exec -- node --test tests/windowLifecycle.test.cjs tests/consoleOverlayVisibility.test.cjs`

Expected: all tests pass.

### Task 3: Fixed console shell, home, onboarding, and safe page embedding

**Files:**
- Create: `src/consoleShellModel.js`
- Create: `tests/consoleShell.test.mjs`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Modify: `tests/liquidWorkbenchRuntime.test.mjs`

**Interfaces:**
- `CONSOLE_NAV` is a fixed six-item list: home, play, look, room, settings, help.
- `getHomeNextAction({ song, precise, room, update })` returns a single action descriptor with `id`, `label`, and `page`.
- Existing `PlayTab`, `LookTab`, `RoomTab`, and `UpdateTab` remain data/operation owners; the shell only decides where each renders.

- [ ] **Step 1: Write failing shell model tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { CONSOLE_NAV, getHomeNextAction } from '../src/consoleShellModel.js'

test('console navigation is stable and text-labelled', () => {
  assert.deepEqual(CONSOLE_NAV.map((item) => item.id), ['home', 'play', 'look', 'room', 'settings', 'help'])
  assert.ok(CONSOLE_NAV.every((item) => item.label.length > 0))
})

test('home asks for precise sync before nonessential actions', () => {
  assert.deepEqual(getHomeNextAction({ song: null, precise: false, room: 'idle', update: 'current' }), {
    id: 'sync', label: '連接精準同步', page: 'play',
  })
})
```

- [ ] **Step 2: Run the shell test and verify RED**

Run: `npm.cmd exec -- node --test tests/consoleShell.test.mjs`

Expected: failure because `src/consoleShellModel.js` does not exist.

- [ ] **Step 3: Implement a small shell model**

```js
export const CONSOLE_NAV = [
  { id: 'home', label: '首頁', icon: '⌂' },
  { id: 'play', label: '播放', icon: '▶' },
  { id: 'look', label: '外觀', icon: '✦' },
  { id: 'room', label: '房間', icon: '◎' },
  { id: 'settings', label: '軟體設定', icon: '⚙' },
  { id: 'help', label: '幫助', icon: '?' },
]

export function getHomeNextAction({ song, precise, room, update }) {
  if (!precise) return { id: 'sync', label: '連接精準同步', page: 'play' }
  if (!song) return { id: 'play', label: '開始播放歌曲', page: 'play' }
  if (room === 'disconnected') return { id: 'room', label: '建立或加入房間', page: 'room' }
  if (update === 'available') return { id: 'update', label: '查看可用更新', page: 'settings' }
  return { id: 'pill', label: '顯示桌面藥丸', page: 'home' }
}
```

- [ ] **Step 4: Replace the draggable workbench rendering only**

Remove `LiquidWorkbench`, `WorkbenchModule`, `WorkbenchSummary`, pointer drag wiring, floating glass material, and inspector rendering from `src/ConsoleWindow.jsx`. Render `ConsoleShell` with:

1. a fixed text-labelled left navigation;
2. a central page region that keeps the real `Capsule` preview mounted on home and appearance pages;
3. a right contextual panel, which holds the active page's controls;
4. a home page with current song/source/sync/room/update status, one next action, `顯示桌面藥丸`, and `重新開啟教學`;
5. an appearance page with preview central and current `LookTab` in the right panel;
6. existing playback, room, and update views embedded without changing their APIs.

Render onboarding only when `onboardingVersion < 1`: two concise pages, Skip, Next, and Done; all outcomes persist `onboardingVersion: 1`. Add a three-item real-status checklist to the home page.

- [ ] **Step 5: Add opaque responsive CSS**

Add the new `.console-shell` styles to `src/styles.css`: no `backdrop-filter`, no transparent visible content, rounded window shell, system-compatible light/dark variables, `transform`/`opacity` transitions only, and a responsive two-column fallback below 860px. Preserve `prefers-reduced-motion` behavior.

- [ ] **Step 6: Run shell and workbench regression tests**

Run: `npm.cmd exec -- node --test tests/consoleShell.test.mjs tests/liquidWorkbenchRuntime.test.mjs tests/workbenchPreview.test.mjs`

Expected: new shell tests pass; existing preview test continues to prove the real `Capsule` preview is used.

### Task 4: App-native notices, close-choice modal, and recovery actions

**Files:**
- Create: `src/consoleFeedback.js`
- Create: `tests/consoleFeedback.test.mjs`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- `createFeedbackQueue()` returns `push(notice)`, `dismiss(id)`, and `takeConfirm(request)` with no browser-native dialogs.
- `useConsoleFeedback()` provides `notify({ tone, message })` and `confirm({ title, message, confirmLabel }) -> Promise<boolean>`.
- `CloseChoiceDialog` invokes `overlay.console.closeWith('pill'|'tray'|'quit', remember)`; it never directly destroys a window.

- [ ] **Step 1: Write a failing feedback queue test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createFeedbackQueue } from '../src/consoleFeedback.js'

test('feedback queue keeps the latest actionable notice and dismisses it by id', () => {
  const queue = createFeedbackQueue()
  const notice = queue.push({ tone: 'error', message: '無法加入房間' })
  assert.equal(queue.current().id, notice.id)
  queue.dismiss(notice.id)
  assert.equal(queue.current(), null)
})
```

- [ ] **Step 2: Run it and verify RED**

Run: `npm.cmd exec -- node --test tests/consoleFeedback.test.mjs`

Expected: failure because `src/consoleFeedback.js` does not exist.

- [ ] **Step 3: Implement the feedback store and console-owned dialogs**

Implement the small queue module with deterministic numeric IDs and no timers. In `ConsoleWindow.jsx`, add a context/provider, toast area, confirm dialog, and close-choice dialog. Replace every `alert(...)` and `window.confirm(...)` in the console with `notify` or awaited `confirm`.

Use direct actions for the home page: `顯示桌面藥丸` calls `overlay.console.showPill()`, `隱藏到系統匣` calls `overlay.console.hideToTray()`, and `重新連接精準同步` navigates to the existing playback sync action. Do not reset appearance or playback automatically.

- [ ] **Step 4: Run feedback tests and source-level regression check**

Run: `npm.cmd exec -- node --test tests/consoleFeedback.test.mjs && rg -n "window\.confirm|\balert\(" src/ConsoleWindow.jsx`

Expected: feedback test passes and `rg` has no matches.

### Task 5: Full verification and manual Electron smoke test

**Files:**
- Modify only if prior tasks leave a directly related failing test or unused import.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm.cmd test`

Expected: all existing unit/integration tests pass.

- [ ] **Step 2: Build the renderer**

Run: `npm.cmd run build`

Expected: Vite exits 0 with no build error.

- [ ] **Step 3: Run the Electron development smoke test**

Run: `npm.cmd run dev`

Verify manually:

1. launch opens the opaque console and hides the pill;
2. all six navigation items work and remain text-labelled;
3. onboarding skips/completes once and can be reopened;
4. home restores the pill without resetting appearance;
5. console close offers pill/tray/quit and remembered choice works on the next close;
6. playback, song search, appearance preview, room join/create, update settings, and lyric sync still work;
7. the console is not always-on-top and closing/hiding it does not stop the pill or music services.

- [ ] **Step 4: Stop the development process cleanly**

Use the development terminal's normal interrupt after the smoke test. Do not package or publish in this task.
