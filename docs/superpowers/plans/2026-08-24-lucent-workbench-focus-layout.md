# 璃音 Lucent 工作檯專注式設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 開啟控制台時收起桌面藥丸，並提供和桌面完全同源的中央預覽、左側選中卡片、右側設定內容、清晰高對比的冷白工作檯與可拖曳控制台視窗。

**Architecture:** 主行程只管理 Overlay 的收起／恢復可見性，Renderer 只負責 160ms 的視覺收合。控制台預覽重用 `Capsule` 的 preview mode，而不是重複 `LiquidGlass` 樹。工作檯的展開狀態繼續使用 `state.ui.workbench.activeModule`，CSS 將其排成左卡片／中預覽／右檢閱面板三欄。

**Tech Stack:** Electron 43、React 19、Vite 6、原生 CSS、Node `node:test`。

## Global Constraints

- 不新增依賴、不封裝 EXE、不變更歌詞鏡像、播放仲裁、房間同步、更新服務或桌面藥丸定位。
- UI 維持繁體中文；不新增遊戲相關功能。
- 動畫只使用 `transform` 與 `opacity`；不使用桌面擷取、全視窗 Canvas、每卡片 timer 或連續 blur。
- preview mode 不得寫 Overlay 尺寸、位置或觸發換歌過場回報。
- 此工作區不是 Git worktree；所有 Task 的「Commit」步驟以完整測試／建置驗證取代。

---

### Task 1: Overlay 與控制台可見性協調

**Files:**
- Modify: `electron/main.cjs:38,269-280,1057-1058`
- Modify: `electron/preload.cjs:6-28`
- Modify: `src/overlayBridge.js:4-26`
- Modify: `src/App.jsx:28-405`
- Modify: `src/styles.css:1-90`
- Create: `tests/consoleOverlayVisibility.test.cjs`

**Interfaces:**
- Produces main helper `setOverlayConsoleCollapsed(collapsed: boolean): void`.
- Produces preload bridge `window.overlay.onConsoleVisibility(callback: (collapsed: boolean) => void): () => void`.
- `App` consumes `ov.onConsoleVisibility` and passes `consoleCollapsed: boolean` to `Capsule`.

- [ ] **Step 1: Write the failing visibility contract test**

```js
// tests/consoleOverlayVisibility.test.cjs
test('opening the console collapses the overlay and closing it restores the same renderer', () => {
  assert.match(main, /function setOverlayConsoleCollapsed\(collapsed\)/)
  assert.match(main, /overlay\.webContents\.send\('overlay:console-visibility', true\)/)
  assert.match(main, /overlay\.hide\(\)/)
  assert.match(main, /overlay\.showInactive\(\)/)
  assert.match(preload, /onConsoleVisibility: sub\('overlay:console-visibility'\)/)
  assert.match(app, /ov\.onConsoleVisibility/)
  assert.match(capsule, /consoleCollapsed/)
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/consoleOverlayVisibility.test.cjs`

Expected: FAIL because no `setOverlayConsoleCollapsed`, bridge subscription, or `consoleCollapsed` prop exists.

- [ ] **Step 3: Implement the minimal visibility protocol**

In `electron/main.cjs`, add one timer and a helper near `openConsole`:

```js
let consoleOverlayTimer = null

function setOverlayConsoleCollapsed(collapsed) {
  clearTimeout(consoleOverlayTimer)
  if (!overlay || overlay.isDestroyed()) return
  if (!collapsed) {
    overlay.showInactive()
    overlay.webContents.send('overlay:console-visibility', false)
    return
  }
  overlay.webContents.send('overlay:console-visibility', true)
  consoleOverlayTimer = setTimeout(() => {
    if (consoleWin && !consoleWin.isDestroyed() && overlay && !overlay.isDestroyed()) overlay.hide()
  }, 170)
}
```

Call `setOverlayConsoleCollapsed(true)` when an existing console is shown and after a new console finishes loading. Call `setOverlayConsoleCollapsed(false)` from `consoleWin.on('closed')`; clear the timer there first. Do not recreate or reload `overlay`.

Expose `onConsoleVisibility` in `electron/preload.cjs` and the no-op fallback in `src/overlayBridge.js`:

```js
onConsoleVisibility: sub('overlay:console-visibility')
```

In `App.jsx`, subscribe once and pass the state to `Capsule`:

```jsx
const [consoleCollapsed, setConsoleCollapsed] = useState(false)
useEffect(() => ov.onConsoleVisibility((value) => setConsoleCollapsed(!!value)), [])
// …
<Capsule consoleCollapsed={consoleCollapsed} /* existing props */ />
```

In `Capsule.jsx`, append `capsule--console-collapsed` to the outer visual wrapper when this prop is true. In CSS, animate only `opacity` and `transform: scale(.92)` for 160ms; in reduced-motion, remove the transition.

- [ ] **Step 4: Run the contract test and focused regression tests**

Run: `node --test tests/consoleOverlayVisibility.test.cjs tests/clickThrough.test.mjs tests/songTransition.test.mjs`

Expected: PASS. The test proves hide/show uses the existing Overlay instead of recreating it, and existing pointer / transition tests remain green.

- [ ] **Step 5: Verify production behavior in an isolated Electron profile**

Run Electron with `--remote-debugging-port=9226 --user-data-dir=<temp profile>`, invoke `window.overlay.openConsole()` via CDP, then verify the Overlay target remains loaded while its native window is hidden. Close the console and verify the same Overlay target becomes visible again. Stop only the exact QA Electron PID afterward.

### Task 2: 同源 Capsule preview mode

**Files:**
- Modify: `src/components/Capsule.jsx:17-175,240-370`
- Modify: `src/ConsoleWindow.jsx:1,193-217,235-273`
- Modify: `src/styles.css:1200-1248`
- Create: `tests/workbenchPreview.test.mjs`

**Interfaces:**
- `Capsule` accepts `preview?: boolean` and `consoleCollapsed?: boolean`.
- `ConsoleCapsulePreview` consumes `state`, `roomState` and renders `<Capsule preview />` with existing visual state.
- preview mode preserves all visual layers but suppresses Overlay-specific effects and event callbacks.

- [ ] **Step 1: Write the failing same-renderer test**

```js
test('workbench preview uses Capsule rather than a second simplified LiquidGlass pill', () => {
  assert.match(consoleSource, /import Capsule from '\.\/components\/Capsule\.jsx'/)
  assert.match(consoleSource, /<Capsule[\s\S]*preview/)
  assert.doesNotMatch(consoleSource, /function ConsoleCapsulePreview[\s\S]*<LiquidGlass/)
  assert.match(capsuleSource, /preview = false/)
  assert.match(capsuleSource, /if \(preview\) return/)
})

test('preview mode leaves sizing and window movement under the desktop Capsule only', () => {
  assert.match(capsuleSource, /if \(preview\) return undefined/)
  assert.match(capsuleSource, /!preview && onTransitionEvent/)
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/workbenchPreview.test.mjs`

Expected: FAIL because the console still renders its own `LiquidGlass` preview and `Capsule` has no preview flag.

- [ ] **Step 3: Add minimal preview mode to `Capsule`**

Extend the function signature:

```jsx
function Capsule({ /* existing props */, preview = false, consoleCollapsed = false }) {
```

Guard only desktop-specific paths:

```js
useLayoutEffect(() => {
  if (preview) return undefined
  // existing overlay size measurement body
}, [/* existing deps */, preview])
```

Do the same for pointer drag/context-menu handlers and transition snapshot callbacks. Keep visual construction, `DecorationCanvas`, `GlassSheen`, lyrics, translation, vinyl, cover, progress bar and CSS variables active. The preview outer wrapper gets `capsule--preview`, which fixes its max width and disables pointer events.

Replace the old `ConsoleCapsulePreview` body with a `Capsule` instance. Use existing room data when present, else the current preview strings. Use refs initialized to `.52`, `.45`, and `.38` for progress, karaoke and flow fill so the preview is visibly representative without changing actual playback state.

```jsx
<Capsule
  preview
  line={roomState?.mirror?.text || '播放後顯示精準歌詞'}
  trans={roomState?.mirror?.trans || roomState?.song?.name || '璃音 Lucent'}
  reserveTrans
  playing={!!roomState?.playing}
  lineKey={`preview:${roomState?.song?.id || 'idle'}`}
  useMirror={!!roomState?.mirror?.text}
  songName={roomState?.song?.name || '璃音 Lucent'}
  cfg={state.cfg}
  glass={state.glass}
  coverUrl={roomState?.song?.cover || ''}
  avatarUrl={roomState?.song?.avatar || ''}
  progressRef={progressRef}
  karaokeRef={karaokeRef}
  lyricFillRef={fillRef}
  showProgress
/>
```

Remove the old preview-only `.workbench__pill-content`, `.workbench__pill-cover`, `.workbench__pill-lines` and `.workbench__pill-time` CSS only after the source test confirms no use remains.

- [ ] **Step 4: Run preview and visual regression tests**

Run: `node --test tests/workbenchPreview.test.mjs tests/songDisplay.test.mjs tests/decorationRuntime.test.mjs tests/frameAssets.test.mjs`

Expected: PASS. Preview shares `Capsule`, while lyric highlights, decoration and vinyl assets remain green.

- [ ] **Step 5: Verify the production console DOM**

Open the console in the isolated Electron profile. Confirm the workbench contains `.capsule--preview`, no `.workbench__pill-content`, and updating one appearance slider changes CSS variables on the preview without calling `overlay:setSize`.

### Task 3: 專注式三欄工作檯與高可讀性材質

**Files:**
- Modify: `src/ConsoleWindow.jsx:221-274`
- Modify: `src/styles.css:1138-1343`
- Modify: `tests/liquidWorkbenchRuntime.test.mjs:9-49`

**Interfaces:**
- Focused workbench keeps the selected module in a semantic `.workbench__focus-card` left column, the preview in `.workbench__core` centre column, and `.workbench__inspector` right column.
- Existing `state.ui.workbench.activeModule` remains the only persisted open/closed state.

- [ ] **Step 1: Add failing focused-layout / contrast assertions**

```js
test('focused workbench keeps card left, shared preview centered, and inspector right', () => {
  assert.match(source, /workbench__focus-card/)
  assert.match(css, /\.workbench\.is-inspecting \.workbench__focus-card[\s\S]*left:/)
  assert.match(css, /\.workbench\.is-inspecting \.workbench__core[\s\S]*translateX/)
  assert.match(css, /\.workbench__inspector[\s\S]*right:/)
})

test('settings controls retain visible high-contrast frames on cold white glass', () => {
  assert.match(css, /--ui-border:\s*rgba\([^)]*,\s*\.4[0-9]?\)/)
  assert.match(css, /\.workbench__inspector[\s\S]*border: 1px solid/)
  assert.match(css, /\.workbench__inspector \.row select[\s\S]*border-color:/)
  assert.match(css, /\.sect__head[\s\S]*border:/)
})
```

- [ ] **Step 2: Run the focused layout test and verify RED**

Run: `node --test tests/liquidWorkbenchRuntime.test.mjs`

Expected: FAIL because no focus-card anchor and insufficient explicit contrast rules exist.

- [ ] **Step 3: Implement three-column focus layout and readable controls**

Wrap the selected module in `LiquidWorkbench` only while focused:

```jsx
{focused && <div className="workbench__focus-card" aria-hidden="true">
  <WorkbenchModule id={focused} focused={focused} onFocus={focusModule}
    moduleProps={pointer.moduleProps} style={pointer.styleFor(focused)} />
</div>}
```

When focused, omit the selected id from the floating module map so there is one semantic button, not a visual duplicate. CSS positions it in the left third and gives `.workbench__core` a central transform distinct from the inspector. Keep non-focused modules inert until `closeInspector`.

Strengthen the cold-white token palette without darkening the product:

```css
.workbench {
  --ui-fg: #102d3d;
  --ui-muted: #31586b;
  --ui-border: rgba(42, 86, 106, .48);
  --ui-panel: rgba(241, 249, 252, .82);
}
.workbench__module, .workbench__inspector, .sect__head,
.workbench__inspector input, .workbench__inspector select {
  border: 1px solid var(--ui-border);
}
```

Use `color: var(--ui-fg)` for labels and `color: var(--ui-muted)` for hints. Keep desktop transparency in `.workbench__material`; do not add desktop capture or reduce visual contrast below these values. Add transform/opacity transitions to focus card, core and inspector, and use existing reduced-motion override to remove those transitions.

- [ ] **Step 4: Run focused workbench tests**

Run: `node --test tests/liquidWorkbench.test.cjs tests/liquidWorkbenchRuntime.test.mjs tests/retiredAppearanceSettings.test.mjs`

Expected: PASS. Existing four-module persistence remains valid and focused layout / readability source contracts pass.

- [ ] **Step 5: Verify through CDP with true click input**

Scroll the 外觀 card into view if needed, dispatch a real `Input.dispatchMouseEvent` click, and assert all three DOM regions are present: `.workbench__focus-card`, `.capsule--preview`, `.workbench__inspector`. Verify a visible `borderTopColor` for the inspector and a non-empty label color.

### Task 4: Electron drag region that preserves controls

**Files:**
- Modify: `src/styles.css:1179-1199,1249-1331`
- Modify: `tests/liquidWorkbenchRuntime.test.mjs:41-49`

**Interfaces:**
- `.workbench__chrome` is Electron draggable.
- Interactive child elements and all workbench controls opt out with `-webkit-app-region: no-drag`.

- [ ] **Step 1: Add failing drag-region assertions**

```js
test('only the console title area drags the window while all controls remain interactive', () => {
  assert.match(css, /\.workbench__chrome[\s\S]*-webkit-app-region:\s*drag/)
  assert.match(css, /\.workbench__chrome \.tbtn[\s\S]*-webkit-app-region:\s*no-drag/)
  assert.match(css, /\.workbench__module[\s\S]*-webkit-app-region:\s*no-drag/)
  assert.match(css, /\.workbench__inspector[\s\S]*-webkit-app-region:\s*no-drag/)
})
```

- [ ] **Step 2: Run the drag-region test and verify RED**

Run: `node --test tests/liquidWorkbenchRuntime.test.mjs`

Expected: FAIL because the current title area has no Electron drag region.

- [ ] **Step 3: Implement CSS-only drag regions**

```css
.workbench__chrome { -webkit-app-region: drag; }
.workbench__chrome .tbtn,
.workbench__module,
.workbench__inspector,
.workbench__inspector *,
.workbench__focus-card { -webkit-app-region: no-drag; }
```

Do not add renderer mousemove IPC or a custom window-coordinate tracker. Electron manages movement through the native drag region.

- [ ] **Step 4: Run the workbench runtime test**

Run: `node --test tests/liquidWorkbenchRuntime.test.mjs`

Expected: PASS with the existing workbench behavior tests and new drag-region contract.

- [ ] **Step 5: Manual runtime verification**

Drag empty title-bar space in the production control window, then click the close button and one slider. Confirm the window moves, controls remain operable, and no extra Renderer messages are emitted.

### Task 5: Integration verification

**Files:**
- Modify: no additional production files unless a verified regression requires a surgical fix.
- Test: `tests/consoleOverlayVisibility.test.cjs`, `tests/workbenchPreview.test.mjs`, existing full suite.

- [ ] **Step 1: Run focused suite**

Run:

```powershell
node --test tests/consoleOverlayVisibility.test.cjs tests/workbenchPreview.test.mjs tests/liquidWorkbench.test.cjs tests/liquidWorkbenchRuntime.test.mjs tests/songDisplay.test.mjs tests/songTransition.test.mjs tests/clickThrough.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run the full suite**

Run: `npm.cmd test`

Expected: all existing and new tests pass with no skipped / failed test.

- [ ] **Step 3: Build production renderer**

Run: `npm.cmd run build`

Expected: Vite completes successfully and emits `dist/index.html` plus assets.

- [ ] **Step 4: Perform isolated runtime check**

Run the built app with a temporary `--user-data-dir` and CDP port. Verify:

1. Opening console leaves the Overlay target loaded, then hides its native window after the 160ms visual collapse.
2. Closing console restores the same Overlay target without a sync reset.
3. Clicking 外觀 yields left focused card, centre `.capsule--preview`, right inspector.
4. Preview contains the same vinyl/lyrics/progress DOM branches as `Capsule` and one appearance setting changes it immediately.
5. Title drag region and close button remain separately interactive.

Stop only the QA Electron PID. Do not package an EXE.

## Self-review

- Spec coverage: Tasks 1–4 cover all five approved requirements; Task 5 covers build and runtime verification.
- Scope: no unrelated playback, synchronization, room, update, game, packaging, dependency, or desktop-capture change is included.
- State: no new persisted configuration is necessary; existing `activeModule` remains the sole workbench layout state.
- Naming: `consoleCollapsed`, `preview`, `workbench__focus-card`, and `setOverlayConsoleCollapsed` are defined before use in later tasks.
