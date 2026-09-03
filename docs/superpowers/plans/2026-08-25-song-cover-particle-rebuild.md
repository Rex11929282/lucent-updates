# Song Cover Particle Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolour shatter particles during rebuild from the next ready song cover while preserving the old captured particles during scatter and hold.

**Architecture:** Add a small pure palette utility that filters cover pixels into a stable three-colour palette and mixes colour strings by progress. `App` carries the real song cover separately from the optional cover-background URL, then `Capsule` passes that next ready song cover to `SongTransitionLayer`; the transition layer captures the original snapshot once, extracts the incoming palette once at `shatter-in`, and uses per-particle stable palette assignment during the existing single Canvas animation.

**Tech Stack:** React 19, browser Canvas 2D, Electron renderer, Node test runner.

## Global Constraints

- Only affect the `shatter-in` particle rebuild phase.
- Do not change lyric mirror, playback clock, progress bar, window sizing, or ordinary decorative particles.
- Reuse the existing `next-ready` artwork gate; never delay it with an additional network request.
- Do not sample image pixels in an animation frame.
- Keep the existing 128-particle cap and one-canvas transition renderer.
- On unusable cover pixels, use a deterministic three-colour theme fallback.
- This workspace is not a Git worktree; do not create commits.

---

### Task 1: Add deterministic cover-palette primitives

**Files:**
- Create: `src/coverPalette.js`
- Create: `tests/coverPalette.test.mjs`

**Interfaces:**
- Produces `fallbackCoverPalette(): string[]` returning exactly three CSS `rgb(...)` colours.
- Produces `paletteFromPixels(data: Uint8ClampedArray | number[], maxColours?: number): string[]` returning exactly three colours after excluding transparent, near-black, near-white, and low-saturation samples.
- Produces `mixPaletteColor(from: string, to: string, amount: number): string` returning a clamped CSS `rgb(...)` interpolation.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { fallbackCoverPalette, mixPaletteColor, paletteFromPixels } from '../src/coverPalette.js'

test('palette keeps saturated cover colours and rejects blank pixels', () => {
  const pixels = new Uint8ClampedArray([
    20, 140, 250, 255, 20, 140, 250, 255,
    245, 65, 150, 255, 245, 65, 150, 255,
    255, 255, 255, 255, 4, 4, 4, 255,
    120, 120, 120, 255, 0, 0, 0, 0,
  ])
  const palette = paletteFromPixels(pixels)
  assert.equal(palette.length, 3)
  assert.ok(palette.some((color) => color.includes('20, 140, 250')))
  assert.ok(palette.some((color) => color.includes('245, 65, 150')))
})

test('palette fallback and colour mix stay bounded and deterministic', () => {
  assert.equal(fallbackCoverPalette().length, 3)
  assert.equal(mixPaletteColor('rgb(0, 0, 0)', 'rgb(255, 100, 50)', 0.5), 'rgb(128, 50, 25)')
  assert.equal(mixPaletteColor('rgb(0, 0, 0)', 'rgb(255, 100, 50)', 2), 'rgb(255, 100, 50)')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/coverPalette.test.mjs`

Expected: FAIL because `src/coverPalette.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
const FALLBACK = ['rgb(142, 200, 255)', 'rgb(138, 92, 255)', 'rgb(255, 110, 180)']

function channels(color) {
  const values = String(color).match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number)
  return values?.length === 3 ? values : [142, 200, 255]
}

export function fallbackCoverPalette() { return [...FALLBACK] }

export function mixPaletteColor(from, to, amount) {
  const progress = Math.max(0, Math.min(1, Number(amount) || 0))
  const start = channels(from)
  const end = channels(to)
  const values = start.map((value, index) => Math.round(value + (end[index] - value) * progress))
  return `rgb(${values.join(', ')})`
}

export function paletteFromPixels(data) {
  const candidates = []
  for (let index = 0; index + 3 < data.length; index += 4) {
    const [r, g, b, alpha] = data.slice(index, index + 4)
    const maximum = Math.max(r, g, b)
    const minimum = Math.min(r, g, b)
    if (alpha < 96 || maximum < 28 || minimum > 232 || maximum - minimum < 34) continue
    candidates.push({ r, g, b, score: maximum - minimum + (maximum + minimum) * 0.08 })
  }
  candidates.sort((a, b) => b.score - a.score)
  const distinct = []
  for (const candidate of candidates) {
    if (distinct.some((item) => Math.abs(item.r - candidate.r) + Math.abs(item.g - candidate.g) + Math.abs(item.b - candidate.b) < 64)) continue
    distinct.push(candidate)
    if (distinct.length === 3) break
  }
  const fallback = fallbackCoverPalette()
  return Array.from({ length: 3 }, (_, index) => {
    const color = distinct[index]
    return color ? `rgb(${color.r}, ${color.g}, ${color.b})` : fallback[index]
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/coverPalette.test.mjs`

Expected: PASS, 2 tests.

### Task 2: Extract an incoming cover palette once per rebuild

**Files:**
- Modify: `src/components/SongTransitionLayer.jsx:1-175`
- Modify: `src/App.jsx:466-520`
- Modify: `src/components/Capsule.jsx:27,483-498`
- Modify: `tests/songTransition.test.mjs`

**Interfaces:**
- `App` supplies `songCoverUrl: roomState?.song?.cover || ''` independently of `cfg.backdrop`.
- `Capsule` accepts `songCoverUrl: string` and forwards it as `incomingCoverUrl`.
- `SongTransitionLayer` accepts a new optional `incomingCoverUrl: string` prop.
- `extractCoverPalette(url: string): Promise<string[]>` is renderer-local inside `SongTransitionLayer` and resolves to `fallbackCoverPalette()` for load, Canvas, or pixel-read failure.
- `drawParticle(context, particle, amount, rebuilding, holding, palette)` mixes `particle.color` to `palette[index % palette.length]` only when `rebuilding === true`.

- [ ] **Step 1: Write the failing test**

```js
test('rebuild particles use one incoming cover palette and preserve old colours before rebuilding', async () => {
  const layer = await readFile(new URL('../src/components/SongTransitionLayer.jsx', import.meta.url), 'utf8')
  assert.match(layer, /incomingCoverUrl/)
  assert.match(layer, /extractCoverPalette/)
  assert.match(layer, /paletteRef\.current/)
  assert.match(layer, /mixPaletteColor\(particle\.color, palette\[/)
  assert.match(layer, /phase === 'shatter-in'/)
})

test('App keeps song cover available when the cover background is disabled', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /songCoverUrl: roomState\?\.song\?\.cover \|\| ''/)
  assert.match(app, /songCoverUrl=\{transitionVisual\.songCoverUrl\}/)
})

test('Capsule forwards the real next-song cover into the particle transition', async () => {
  const capsule = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  assert.match(capsule, /incomingCoverUrl=\{songCoverUrl\}/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/songTransition.test.mjs`

Expected: FAIL because `incomingCoverUrl`, `extractCoverPalette`, and `paletteRef` are absent.

- [ ] **Step 3: Write minimal implementation**

```jsx
// SongTransitionLayer.jsx imports
import { fallbackCoverPalette, mixPaletteColor, paletteFromPixels } from '../coverPalette.js'

async function extractCoverPalette(url) {
  if (!url) return fallbackCoverPalette()
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url })
  const sample = document.createElement('canvas')
  sample.width = 24; sample.height = 24
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return fallbackCoverPalette()
  context.drawImage(image, 0, 0, sample.width, sample.height)
  return paletteFromPixels(context.getImageData(0, 0, sample.width, sample.height).data)
}

// In SongTransitionLayer props
incomingCoverUrl,

// In component refs
const paletteRef = useRef(fallbackCoverPalette())

// A useEffect keyed by shatter-in, revision, incomingCoverUrl:
// load exactly once; ignore the promise when cleanup marks it cancelled;
// keep fallback on failure; never set palette from an older revision.

// In render:
const palette = paletteRef.current
snapshot.particles.forEach((particle, index) => drawParticle(context, particle, amount, rebuilding, holding, palette[index % palette.length]))

// In drawParticle:
context.fillStyle = rebuilding ? mixPaletteColor(particle.color, targetColor, amount) : particle.color

// App liveVisual, independent of cfg.backdrop
songCoverUrl: roomState?.song?.cover || '',

// App -> Capsule JSX
songCoverUrl={transitionVisual.songCoverUrl}

// Capsule JSX
incomingCoverUrl={songCoverUrl}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/songTransition.test.mjs`

Expected: PASS, including the two new cover-palette wiring tests.

### Task 3: Validate visual timing and regressions

**Files:**
- Modify: `tests/songTransition.test.mjs`
- Test: `tests/coverPalette.test.mjs`

**Interfaces:**
- `mixPaletteColor` is used only in `shatter-in`; scatter and dormant retain the captured-particle colour.

- [ ] **Step 1: Write the failing regression assertion**

```js
test('cover recolour begins only during rebuild and reaches the selected cover colour', () => {
  const from = 'rgb(20, 30, 40)'
  const target = 'rgb(220, 80, 140)'
  assert.equal(mixPaletteColor(from, target, 0), from)
  assert.equal(mixPaletteColor(from, target, 1), target)
})
```

- [ ] **Step 2: Run test to verify it fails before importing the helper**

Run: `node --test tests/songTransition.test.mjs`

Expected: FAIL because `mixPaletteColor` is not imported by the test.

- [ ] **Step 3: Import the established helper, without changing production logic**

```js
import { mixPaletteColor } from '../src/coverPalette.js'
```

- [ ] **Step 4: Run focused and full verification**

Run: `node --test tests/coverPalette.test.mjs tests/songTransition.test.mjs`

Expected: PASS.

Run: `npm.cmd test`

Expected: PASS with no failures.

Run: `npm.cmd run build`

Expected: Vite build succeeds.

- [ ] **Step 5: Runtime check**

Run the development Electron app, switch between two songs with obviously different covers, and verify:

1. Scatter and dormant particles preserve the old screen-captured colours.
2. After the next cover/lyrics artwork gate opens, particles rebuild with a smooth shift to the next cover palette.
3. A missing or unreadable cover rebuilds with the fallback palette and reaches idle.
4. No pill movement, lyric delay, extra Canvas, or repeated pixel reads occur.
