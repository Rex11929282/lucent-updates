# 璃音 Lucent 裝飾粒子 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有歌詞藥丸與控制台預覽中加入可保存、受圓角裁切且具粒子回收機制的流星雨、櫻花與雪花特效。

**Architecture:** 以 `src/effects/decorativeParticles.js` 保存純函式設定模型、粒子建立與更新規則；`DecorationCanvas.jsx` 只負責 Canvas 生命週期、物件池和繪製。Overlay 與控制台預覽共用同一 Canvas 元件，並掛在現有 `.visualclip` 裁切層內。

**Tech Stack:** Electron 33、React 19、Vite 6、Canvas 2D、Node.js `node:test`。

## Global Constraints

- 只提供「無、流星雨、櫻花飄落、雪花飄落」。
- 不加入玻璃流光、星塵、極光、霓虹脈衝、粒子飄帶、電流掃描、呼吸光霧或 RGB 掃描線。
- 不使用隨機值偽造音量、節拍、PCM、FFT 或其他音訊分析。
- Canvas 只能與藥丸裁切層相同大小，不建立全螢幕 Canvas，不增加 Overlay bounds。
- 不更改歌曲辨識、歌詞鏡像、逐字高亮、進度條、拖曳、滑鼠穿透或局域網同步語意。
- 不新增遊戲 HUD、遊戲偵測、遊戲模式、遊戲 Profile 或任何遊戲專用系統。
- 本計畫完成後先執行測試與實際檢查，不封裝 EXE。

---

## File Structure

- Create `src/effects/decorativeParticles.js`: 模式白名單、設定 Clamp、模式專屬控制欄位、粒子建立／更新與硬上限。
- Create `src/components/DecorationCanvas.jsx`: 單一 RAF、ResizeObserver、Canvas DPI、物件池、三種模式繪製與清理。
- Create `tests/decorativeParticles.test.mjs`: 純函式模式、Clamp、粒子幾何、邊界回收與決定性 RNG 測試。
- Create `tests/decorationRuntime.test.mjs`: 靜態檢查 Canvas 生命週期、無 Timer、共用元件與裁切接線。
- Modify `shared/defaults.json`: Schema 5 與裝飾預設參數。
- Modify `shared/stateMigration.cjs`: 舊設定 default merge、未知模式降級、配置快照清理。
- Modify `src/appearanceModel.js`: 模式清單、動態控制欄位與裝飾區重設快照。
- Modify `src/components/Capsule.jsx`: 在 `.visualclip` 內接入 `DecorationCanvas`，傳入 `lineKey` 與播放狀態。
- Modify `src/ConsoleWindow.jsx`: 新增裝飾特效可收合 UI、基礎／進階參數、重設此區與預覽開關。
- Modify `src/styles.css`: Canvas 層級、裁切與背景透明度拆分。
- Modify `package.json`: 把兩個新測試加入既有 `npm.cmd test`。

---

### Task 1: 裝飾設定模型與 Config Migration

**Files:**
- Create: `tests/decorativeParticles.test.mjs`
- Modify: `tests/appearanceModel.test.mjs`
- Modify: `tests/stateMigration.test.cjs`
- Modify: `shared/defaults.json`
- Modify: `shared/stateMigration.cjs`
- Modify: `src/appearanceModel.js`

**Interfaces:**
- Produces: `DECORATION_MODES`, `DECORATION_DEFAULTS`, `decorationControlsForMode(mode)`, `normalizeDecorationConfig(cfg)`, `resetDecorationConfig()`。
- `normalizeDecorationConfig(cfg)` returns a shallow object containing only validated decoration keys.

- [ ] **Step 1: Write failing model and migration tests**

```js
import {
  DECORATION_MODES,
  decorationControlsForMode,
  normalizeDecorationConfig,
  resetDecorationConfig,
} from '../src/appearanceModel.js'

test('裝飾模式只有無、流星、櫻花與雪', () => {
  assert.deepEqual(DECORATION_MODES, ['none', 'meteor', 'sakura', 'snow'])
  assert.equal(normalizeDecorationConfig({ decorationMode: 'aurora' }).decorationMode, 'none')
})

test('不同模式只顯示相關進階控制', () => {
  assert.equal(decorationControlsForMode('meteor').trail, true)
  assert.equal(decorationControlsForMode('sakura').rotation, true)
  assert.equal(decorationControlsForMode('snow').crystalRatio, true)
  assert.equal(decorationControlsForMode('none').count, false)
})

test('粒子設定會限制到安全範圍', () => {
  const cfg = normalizeDecorationConfig({ decorationMode: 'meteor', decorationCount: 999, decorationSpeed: -3 })
  assert.equal(cfg.decorationCount, 80)
  assert.equal(cfg.decorationSpeed, 0.2)
})
```

Migration test adds assertions that schema 4 receives defaults, unknown modes become `none`, and profile decoration config is sanitized.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/appearanceModel.test.mjs tests/stateMigration.test.cjs tests/decorativeParticles.test.mjs`

Expected: FAIL because decoration exports and test file implementation do not exist.

- [ ] **Step 3: Add schema 5 defaults**

Add these exact `cfg` defaults:

```json
"decorationMode": "none",
"decorationCount": 18,
"decorationSpeed": 1,
"decorationStrength": 0.6,
"decorationColor": "#ffffff",
"decorationColor2": "#ffb7d5",
"meteorSpawnRate": 1,
"meteorSpeedVariance": 0.25,
"meteorLength": 34,
"meteorWidth": 1.6,
"meteorTrailLength": 0.75,
"meteorTrailAlpha": 0.55,
"meteorAlpha": 0.85,
"meteorDirection": "down-right",
"meteorColorMode": "fixed",
"meteorGlowStrength": 0.55,
"meteorGlowRange": 8,
"meteorCoreBrightness": 1.2,
"meteorEdgeSoftness": 0.5,
"meteorBurstOnLine": true,
"sakuraSize": 8,
"sakuraSway": 0.7,
"sakuraRotation": 1,
"sakuraDepth": 0.55,
"sakuraWind": 0.15,
"sakuraAlpha": 0.8,
"snowSize": 5,
"snowWind": 0,
"snowDrift": 0.5,
"snowSoftness": 0.45,
"snowCrystalRatio": 0.18,
"snowAlpha": 0.8,
"snowBrightness": 1
```

Set `schemaVersion` to `5`.

- [ ] **Step 4: Implement model normalization and migration**

In `appearanceModel.js`, export the four-mode allowlist, mode-specific booleans, defaults copied from schema-facing values, and numeric Clamp helpers. In `stateMigration.cjs`, allow only `none|meteor|sakura|snow`, clamp `decorationCount` to `0..80`, clamp `decorationSpeed` to `0.2..3`, and sanitize every profile `cfg` using the same keys and ranges.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/appearanceModel.test.mjs tests/stateMigration.test.cjs tests/decorativeParticles.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 6: Review checkpoint**

Because this workspace is not a Git repository, record changed files in the execution log instead of running `git commit`.

---

### Task 2: Pure Particle Geometry and Object-Pool Runtime

**Files:**
- Create: `src/effects/decorativeParticles.js`
- Expand: `tests/decorativeParticles.test.mjs`

**Interfaces:**
- Consumes: normalized decoration config from Task 1.
- Produces:
  - `MAX_PARTICLES = 80`
  - `createParticle(mode, bounds, cfg, rng)` returns a reusable particle object.
  - `resetParticle(particle, mode, bounds, cfg, rng)` mutates and returns the particle.
  - `stepParticle(particle, dt, bounds, cfg)` returns `true` while alive and `false` after leaving bounds.
  - `targetParticleCount(cfg, burst = 0)` returns a clamped integer.

- [ ] **Step 1: Add deterministic failing particle tests**

```js
const fixed = () => 0.5
const bounds = { width: 320, height: 96 }

test('流星具有核心、尾跡與方向速度', () => {
  const p = createParticle('meteor', bounds, defaults, fixed)
  assert.equal(p.kind, 'meteor')
  assert.ok(p.length > 0)
  assert.ok(p.vx > 0)
  assert.ok(p.vy > 0)
})

test('櫻花具有旋轉與擺動，雪花標示雪點或雪晶', () => {
  const petal = createParticle('sakura', bounds, defaults, fixed)
  const snow = createParticle('snow', bounds, defaults, fixed)
  assert.equal(petal.kind, 'sakura')
  assert.ok(Number.isFinite(petal.rotationSpeed))
  assert.ok(['dot', 'crystal'].includes(snow.shape))
})

test('離開藥丸外接矩形後回收', () => {
  const p = { kind: 'snow', x: 20, y: 120, size: 4, vx: 0, vy: 20, age: 1, phase: 0 }
  assert.equal(stepParticle(p, 0.016, bounds, defaults), false)
})
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/decorativeParticles.test.mjs`

Expected: FAIL because particle functions do not exist.

- [ ] **Step 3: Implement minimal particle geometry**

Use per-particle scalar fields only; do not allocate arrays during `stepParticle`. Meteor direction maps to normalized vectors, sakura applies sinusoidal sway from `phase`, and snow applies slow sinusoidal drift. Spawn randomness is injected by `rng` so tests remain deterministic.

- [ ] **Step 4: Run particle tests**

Run: `node --test tests/decorativeParticles.test.mjs`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Confirm `Math.random()` appears only as the default injected spawn RNG and never in the per-frame update or audio path.

---

### Task 3: Shared Canvas Renderer and Pill Clipping

**Files:**
- Create: `src/components/DecorationCanvas.jsx`
- Create: `tests/decorationRuntime.test.mjs`
- Modify: `src/components/Capsule.jsx`
- Modify: `src/styles.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DecorationCanvas({ cfg, playing, eventKey, previewActive = true })` and particle functions from Task 2.
- Produces: one `<canvas className="decoration-canvas" aria-hidden />` with cleanup-safe RAF and ResizeObserver.

- [ ] **Step 1: Write failing runtime wiring test**

The test reads source files and asserts:

```js
assert.match(canvasSource, /requestAnimationFrame/)
assert.match(canvasSource, /cancelAnimationFrame/)
assert.match(canvasSource, /ResizeObserver/)
assert.doesNotMatch(canvasSource, /setInterval|setTimeout/)
assert.match(capsuleSource, /<DecorationCanvas/)
assert.match(capsuleSource, /eventKey=\{lineKey\}/)
assert.match(cssSource, /\.visualclip[\s\S]*overflow:\s*hidden/)
assert.match(cssSource, /\.decoration-canvas[\s\S]*pointer-events:\s*none/)
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/decorationRuntime.test.mjs`

Expected: FAIL because `DecorationCanvas.jsx` does not exist.

- [ ] **Step 3: Implement Canvas lifecycle and pool**

Use one `useEffect` to own RAF and pool, one `ResizeObserver` to update logical width/height, and a DPR cap of `2`. Reuse inactive particle objects, cap active particles at `MAX_PARTICLES`, and cancel RAF/disconnect observer on every mode change or unmount. When mode is `none` or `previewActive` is false, clear the canvas and do not schedule RAF.

Draw rules:

- Meteor: one gradient tail stroke plus one core stroke and terminal glow.
- Sakura: two mirrored Bézier lobes rotated around the particle center.
- Snow dot: filled circle with softness-based shadow blur.
- Snow crystal: six short radial arms, limited to the configured ratio.

When `eventKey` changes and `meteorBurstOnLine` is enabled, set a short frame-count burst budget; do not create a Timer.

- [ ] **Step 4: Mount renderer inside the existing clip layer**

Change the glass branch to:

```jsx
<div className="visualclip" aria-hidden>
  <div className="coverlayer" />
  <div className="bglayer" />
  <DecorationCanvas cfg={cfg} playing={playing} eventKey={lineKey} />
</div>
```

Keep text, vinyl and progress outside `.visualclip`, above it. Move `opacity: var(--bg-alpha)` from `.visualclip` to `.coverlayer, .bglayer` so particle opacity is not coupled to background transparency. Add absolute inset `0`, width/height `100%`, z-index `2`, border-radius `inherit`, and pointer-events `none` to `.decoration-canvas`.

- [ ] **Step 5: Add tests to package script and run focused tests**

Run: `node --test tests/decorativeParticles.test.mjs tests/decorationRuntime.test.mjs`

Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm.cmd run build`

Expected: Vite build exits `0` with no JSX or import errors.

---

### Task 4: Settings UI, Reset, Profiles, LAN and Shared Preview

**Files:**
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/appearanceModel.js`
- Modify: `shared/roomStyle.cjs`
- Modify: `tests/appearanceModel.test.mjs`
- Modify: `tests/roomStyle.test.cjs`
- Modify: `tests/decorationRuntime.test.mjs`

**Interfaces:**
- Consumes: `decorationControlsForMode`, `resetDecorationConfig`, `DecorationCanvas`.
- Produces: one saved collapsible `effects` section with mode-aware controls and local `previewDecoration` toggle.

- [ ] **Step 1: Add failing UI/model/room assertions**

Assert that visual profiles contain decoration fields, room style shares them, and the console source contains all four mode option values, `resetDecorationConfig`, and `<DecorationCanvas ... previewActive={previewDecoration}`.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/appearanceModel.test.mjs tests/roomStyle.test.cjs tests/decorationRuntime.test.mjs`

Expected: FAIL on missing UI and renderer wiring.

- [ ] **Step 3: Add mode-aware settings**

Create `<Section title="✨ 裝飾特效" {...sectionProps('effects')}>`. Always show mode. For non-`none`, show count, speed, strength and color. Show only meteor controls for meteor, sakura controls for sakura, and snow controls for snow. Place detailed controls inside a nested local `Section title="進階設定"`.

Add a `重設此區` button that calls:

```jsx
setCfg(resetDecorationConfig())
```

Do not reset any non-decoration key.

- [ ] **Step 4: Reuse renderer in preview**

Add local state:

```js
const [previewDecoration, setPreviewDecoration] = useState(true)
```

Mount the same `DecorationCanvas` in the preview's rounded container and add a `播放裝飾預覽` toggle. Preview events may use a local monotonically increasing event key only while preview is active; it must not mutate actual playback state.

- [ ] **Step 5: Verify profile and LAN behavior**

The existing `visualConfigSnapshot` includes decoration fields because they are visual and not in `NON_VISUAL_CFG`. The existing `sharedAppearanceStyle` also shares them because they are not personal window fields. Add explicit tests to prevent future regressions.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/appearanceModel.test.mjs tests/roomStyle.test.cjs tests/decorationRuntime.test.mjs`

Expected: PASS.

---

### Task 5: Full Regression and Actual Electron Verification

**Files:**
- Modify only if a regression test demonstrates a defect in files changed by Tasks 1-4.

**Interfaces:**
- Consumes: completed feature.
- Produces: verified source build; no EXE package.

- [ ] **Step 1: Run complete automated suite**

Run: `npm.cmd test`

Expected: all tests pass, including appearance, progress, click-through, migration, LAN style, song switch and song display.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: exit code `0`.

- [ ] **Step 3: Start source application**

Run: `npm.cmd run start`

Expected: one overlay and one control console process start without renderer errors.

- [ ] **Step 4: Inspect actual UI combinations**

Check `none`, `meteor`, `sakura`, `snow` with transparent/material backgrounds, five corner presets, custom radius, vinyl on/off, short/long/bilingual lyrics, maximum font size, pause/resume and song switch. Verify no particle appears outside the pill and no Canvas enlarges the window.

- [ ] **Step 5: Regression check**

Verify NetEase song recognition, mirrored line sync, karaoke text highlight, progress animation, real-time drag boundary, `Ctrl+Alt+L` click-through and LAN appearance sharing remain functional. Separate automated evidence from checks that require the user to play music or join from another machine.

- [ ] **Step 6: Report**

List modified files, schema migration, particle cap/recycling, clipping, tested combinations, automated results and any live checks still requiring user confirmation. Do not run `npm.cmd run dist` yet.
