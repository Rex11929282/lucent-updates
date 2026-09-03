# Typography Presets, Fixed Title Track, and Cover Flow Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five saved text-style presets, a fixed-size song-title track with bounded title compression, and optional cover-derived two-colour flow-fill foregrounds.

**Architecture:** Add small pure helpers for allowed text styles and title scale. `Capsule` will keep one existing cover sampler, run it for either cover RGB or cover flow fill, and set CSS variables/classes on the shared overlay/preview component. Song-title measurement uses its existing rendered DOM and `ResizeObserver`, with no timers; a fixed CSS track prevents text presence and length from changing pill dimensions.

**Tech Stack:** React 19, CSS, Node test runner, Vite.

## Global Constraints

- Do not change lyric timing, mirror synchronisation, YRC/LRC fallback, song transition, or audio analysis.
- Do not add random colours, a duplicate preview renderer, an additional cover sampler, a polling loop, or a schema bump.
- `textStyle: 'clean'` and `flowFillColorMode: 'fixed'` are the backwards-compatible defaults.
- Unfilled lyrics always retain the user text colour and current clarity/outline treatment.
- Song title scale is bounded from `0.72` to `1`; any remaining overflow is clipped with ellipsis without changing pill size.

---

### Task 1: Add pure typography and title-fit contracts

**Files:**
- Create: `src/titleLayout.js`
- Modify: `src/appearanceModel.js`
- Modify: `shared/stateMigration.cjs`
- Modify: `shared/defaults.json`
- Modify: `tests/appearanceModel.test.mjs`
- Modify: `tests/stateMigration.test.cjs`

**Interfaces:**
- Produces `TEXT_STYLE_OPTIONS`, `normalizeTextStyle(style)`, `normalizeFlowFillColorMode(mode)`, and `titleFitScale({ contentWidth, trackWidth, minScale })`.
- `titleFitScale` returns a finite number in `[minScale, 1]`, returns `1` for non-overflow/invalid dimensions, and uses `trackWidth / contentWidth` for overflow.

- [ ] **Step 1: Write failing unit tests**

```js
assert.equal(normalizeTextStyle('slant'), 'slant')
assert.equal(normalizeTextStyle('unknown'), 'clean')
assert.equal(normalizeFlowFillColorMode('cover-gradient'), 'cover-gradient')
assert.equal(normalizeFlowFillColorMode('unknown'), 'fixed')
assert.equal(titleFitScale({ contentWidth: 100, trackWidth: 160 }), 1)
assert.equal(titleFitScale({ contentWidth: 200, trackWidth: 160 }), 0.8)
assert.equal(titleFitScale({ contentWidth: 1000, trackWidth: 160 }), 0.72)
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test --test-name-pattern "text style|title fit" tests/appearanceModel.test.mjs`

Expected: FAIL because helpers and defaults do not exist.

- [ ] **Step 3: Implement the bounded helpers and defaults**

```js
export const TEXT_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'clean', label: '冷白清晰' }),
  Object.freeze({ id: 'slant', label: '現代斜切' }),
  Object.freeze({ id: 'soft', label: '柔光' }),
  Object.freeze({ id: 'neon', label: '霓虹' }),
  Object.freeze({ id: 'metal', label: '金屬' }),
])
export function normalizeTextStyle(value) { return TEXT_STYLE_OPTIONS.some((item) => item.id === value) ? value : 'clean' }
export function normalizeFlowFillColorMode(value) { return value === 'cover-gradient' ? value : 'fixed' }
```

```js
export function titleFitScale({ contentWidth, trackWidth, minScale = 0.72 } = {}) {
  const content = Number(contentWidth)
  const track = Number(trackWidth)
  const floor = Math.max(0.1, Math.min(1, Number(minScale) || 0.72))
  if (!Number.isFinite(content) || !Number.isFinite(track) || content <= 0 || track <= 0 || content <= track) return 1
  return Math.max(floor, Math.min(1, track / content))
}
```

Add `textStyle: "clean"` and `flowFillColorMode: "fixed"` to `shared/defaults.json`. In `shared/stateMigration.cjs`, normalise both fields after existing lyric-style validation, using the default values for invalid legacy data.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `node --test tests/appearanceModel.test.mjs tests/stateMigration.test.cjs`

Expected: PASS.

### Task 2: Keep the title track stable and compress only title text

**Files:**
- Modify: `src/components/Capsule.jsx`
- Modify: `src/styles.css`
- Modify: `tests/songDisplay.test.mjs`

**Interfaces:**
- Consumes `titleFitScale` and existing `cfg.songNamePos`, `cfg.showSongName`, `songName`.
- Produces one always-rendered `.songname-track` containing a possibly invisible `.songname` element and CSS variable `--songname-scale`.

- [ ] **Step 1: Write failing renderer/style regression tests**

```js
assert.match(capsuleSource, /import \{ titleFitScale \} from '\.\.\/titleLayout\.js'/)
assert.match(capsuleSource, /className="songname-track"/)
assert.match(capsuleSource, /titleFitScale\(\{ contentWidth: .*trackWidth:/s)
assert.match(stylesSource, /\.songname-track \{[^}]*height: var\(--songname-track-height[^}]*\}/s)
assert.match(stylesSource, /\.songname__text \{[^}]*text-overflow: ellipsis[^}]*transform: scaleX\(var\(--songname-scale, 1\)\)/s)
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `node --test --test-name-pattern "title track|title compression" tests/songDisplay.test.mjs`

Expected: FAIL because title markup is currently conditional and title fitting does not exist.

- [ ] **Step 3: Implement fixed title track and one-observer measurement**

In `Capsule`:

```jsx
const songNameTrackRef = useRef(null)
const songNameTextRef = useRef(null)
const [songNameScale, setSongNameScale] = useState(1)
```

Use one `ResizeObserver` over the track. Derive content width from `songNameTextRef.current.scrollWidth / currentScale` and call `titleFitScale({ contentWidth, trackWidth: track.clientWidth })`; update state only when the result changes by more than `0.001`. Render the track in both title locations, but render its text only according to `showSongName && songName`:

```jsx
const songNameNode = (
  <div className="songname-track" ref={songNameTrackRef} style={{ '--songname-scale': songNameScale }}>
    <div className={`songname${cfg.showSongName && songName ? '' : ' songname--empty'}`}>
      <span className="songname__text" ref={songNameTextRef}>{songName || ''}</span>
    </div>
  </div>
)
```

Keep `bc` after `.row-wrap`, all other positions before `.row-wrap`. CSS must set a fixed track line height, clip overflow, hide only text for `songname--empty`, and make title text horizontally compress and then ellipsise. The title row is always present; no title string contributes a new measured pill height.

- [ ] **Step 4: Run the targeted tests and verify they pass**

Run: `node --test --test-name-pattern "title track|title compression|bottom-center" tests/songDisplay.test.mjs`

Expected: PASS.

### Task 3: Add text-style CSS and settings UI

**Files:**
- Modify: `src/components/Capsule.jsx`
- Modify: `src/styles.css`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `tests/songDisplay.test.mjs`

**Interfaces:**
- Consumes `normalizeTextStyle(cfg.textStyle)` and `TEXT_STYLE_OPTIONS`.
- Produces `text-style-clean`, `text-style-slant`, `text-style-soft`, `text-style-neon`, and `text-style-metal` classes on the existing capsule.

- [ ] **Step 1: Write failing style and UI tests**

```js
for (const id of ['clean', 'slant', 'soft', 'neon', 'metal']) assert.match(stylesSource, new RegExp(`\\.text-style-${id}`))
assert.match(stylesSource, /\.text-style-slant \.lyrics__txt[^}]*skewX\(5deg\)/s)
assert.match(consoleSource, /文字風格/)
assert.match(consoleSource, /TEXT_STYLE_OPTIONS\.map/)
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `node --test --test-name-pattern "text style presets" tests/songDisplay.test.mjs`

Expected: FAIL because the classes and select do not exist.

- [ ] **Step 3: Implement CSS-only visual presets and select**

Pass `text-style-${normalizeTextStyle(cfg.textStyle)}` in the existing capsule class list. Add CSS transforms/text shadows/background clips per the approved values; all rules are static and use existing `--glow-c`, `--text-shadow-*`, text colour, and outline variables. Add one `文字風格` select in the existing 字體與文字微調 group:

```jsx
<select value={cfg.textStyle || 'clean'} onChange={(event) => setCfg({ textStyle: event.target.value })}>
  {TEXT_STYLE_OPTIONS.map((style) => <option value={style.id} key={style.id}>{style.label}</option>)}
</select>
```

- [ ] **Step 4: Run targeted typography tests and verify they pass**

Run: `node --test --test-name-pattern "text style presets|song title" tests/songDisplay.test.mjs`

Expected: PASS.

### Task 4: Reuse cover palette for flow-fill gradient

**Files:**
- Modify: `src/components/Capsule.jsx`
- Modify: `src/styles.css`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `tests/songDisplay.test.mjs`

**Interfaces:**
- Consumes `cfg.flowFillColorMode`, `cfg.rgbMode`, `coverUrl`, and existing `coverColors`.
- Produces `--lyric-fill-c1`/`--lyric-fill-c2` on `Capsule`, and a setting shown only for fill/both highlighters.

- [ ] **Step 1: Write failing cover-flow tests**

```js
assert.match(capsuleSource, /cfg\.rgbMode !== 'cover' && cfg\.flowFillColorMode !== 'cover-gradient'/)
assert.match(capsuleSource, /--lyric-fill-c1': cfg\.flowFillColorMode === 'cover-gradient' \? coverColors\[0\] : cfg\.textColor/)
assert.match(stylesSource, /\.highlight-fill-active \.kchar\.fill-partial[^}]*--lyric-fill-c1[^}]*--lyric-fill-c2/s)
assert.match(consoleSource, /流動填色顏色/)
```

- [ ] **Step 2: Run targeted test and verify it fails**

Run: `node --test --test-name-pattern "cover gradient flow fill" tests/songDisplay.test.mjs`

Expected: FAIL because flow fill is not colour-mode aware.

- [ ] **Step 3: Implement one-sampler cover-gradient fill**

Expand the existing cover-sampling effect guard to:

```js
if ((cfg.rgbMode !== 'cover' && cfg.flowFillColorMode !== 'cover-gradient') || !coverUrl) return
```

Expose `--lyric-fill-c1` and `--lyric-fill-c2` with `cfg.textColor` fallbacks. Update the existing filled-character CSS to use a left-to-right linear gradient only when `.flow-fill-cover` is present; unfilled characters remain current text colour. Add `flow-fill-cover` to `lyrics__cur` only if fill highlighting is enabled and colour mode is `cover-gradient`. Add a `流動填色顏色` select immediately beside current lyric-highlight choices, rendered only for `fill` and `both`.

- [ ] **Step 4: Run targeted tests and verify they pass**

Run: `node --test --test-name-pattern "cover gradient flow fill" tests/songDisplay.test.mjs`

Expected: PASS.

### Task 5: Complete integration checks

**Files:**
- Verify: `src/components/Capsule.jsx`
- Verify: `src/styles.css`
- Verify: `src/ConsoleWindow.jsx`
- Verify: `shared/defaults.json`

- [ ] **Step 1: Run typography and migration tests**

Run: `node --test tests/appearanceModel.test.mjs tests/songDisplay.test.mjs tests/stateMigration.test.cjs tests/workbenchPreview.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run all tests and build**

Run: `npm.cmd test; npm.cmd run build`

Expected: all tests pass and Vite completes without errors.

- [ ] **Step 3: Reopen development Lucent and check runtime**

Restart only the verified Lucent Electron main process, run `npm.cmd run dev`, and confirm a responding window titled `璃音 Lucent`.

- [ ] **Step 4: Manual acceptance check**

1. Select each text style in the shared preview and confirm it updates immediately without moving lyrics.
2. Hide/show song name and switch short/long song titles: pill dimensions remain fixed; long names compress then ellipsise.
3. Select `流動填色 → 封面雙色漸層` with a dark cover and a light cover: only sung characters change to the cover gradient; unread characters remain legible configured text colour.
4. Select fixed fill and confirm existing single-colour behaviour returns.
