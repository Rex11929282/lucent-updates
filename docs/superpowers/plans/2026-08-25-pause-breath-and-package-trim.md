# Pause Breath and Package Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a paused Lucent pill a smooth, conflict-free dim-and-return animation and safely remove non-runtime files from the NSIS payload.

**Architecture:** A small pure helper decides whether the existing `fxPauseBreath` option may animate. `Capsule` consumes that helper and applies a class; CSS animates only the existing content composition layer, so it never changes pill geometry or LiquidGlass transforms. Builder glob exclusions remove diagnostic/documentation artifacts while retaining normal compression and all runtime assets.

**Tech Stack:** React 19, CSS animations, Node test runner, Electron Builder/NSIS.

## Global Constraints

- Keep `compression: normal`; do not trade installation speed for maximum compression.
- Do not remove Electron runtime files, `dist/frames`, NetEase API runtime modules, updater dependencies, or user-visible features.
- Do not alter lyric synchronization, room synchronization, song transitions, window sizing, or mouse elasticity.
- The paused visual must be disabled while song transition effects are paused and stop immediately when playback resumes.
- No Git commit is included because this workspace has no Git repository.

---

### Task 1: Isolate paused visual eligibility

**Files:**
- Create: `src/pauseBreath.js`
- Create: `tests/pauseBreath.test.mjs`
- Modify: `src/components/Capsule.jsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `pauseBreathActive({ enabled, playing, effectsPaused }): boolean`.
- Consumes: existing `cfg.fxPauseBreath`, `playing`, and `effectsPaused` values in `Capsule`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { pauseBreathActive } from '../src/pauseBreath.js'

test('pause breath runs only for an enabled ordinary pause', () => {
  assert.equal(pauseBreathActive({ enabled: true, playing: false, effectsPaused: false }), true)
  assert.equal(pauseBreathActive({ enabled: true, playing: true, effectsPaused: false }), false)
  assert.equal(pauseBreathActive({ enabled: true, playing: false, effectsPaused: true }), false)
  assert.equal(pauseBreathActive({ enabled: false, playing: false, effectsPaused: false }), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pauseBreath.test.mjs`

Expected: FAIL because `src/pauseBreath.js` does not exist.

- [ ] **Step 3: Write minimal implementation and wire it**

Create `src/pauseBreath.js`:

```js
export function pauseBreathActive({ enabled, playing, effectsPaused } = {}) {
  return enabled === true && playing !== true && effectsPaused !== true
}
```

In `src/components/Capsule.jsx`, import the helper and replace the inline paused condition with:

```js
pauseBreathActive({ enabled: cfg.fxPauseBreath, playing, effectsPaused }) ? 'fx-pausebreath' : ''
```

Add `tests/pauseBreath.test.mjs` to the `node --test` list in `package.json` so later full regressions always exercise the pause contract.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pauseBreath.test.mjs`

Expected: PASS, 1 test.

### Task 2: Animate the content layer without changing geometry

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/pauseBreath.test.mjs`

**Interfaces:**
- Consumes: `fx-pausebreath` from Task 1.
- Produces: a 3.2-second CSS-only animation applied to `.content-shell`.

- [ ] **Step 1: Extend the failing test**

Append assertions that inspect the stylesheet:

```js
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
assert.match(styles, /\.fx-pausebreath \.content-shell\s*\{[\s\S]*?animation:\s*pausebreath 3\.2s/)
assert.doesNotMatch(styles, /\.fx-pausebreath \.glass, \.fx-pausebreath \.plain/)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pauseBreath.test.mjs`

Expected: FAIL because the current CSS animates `.glass` and `.plain` for 2.6 seconds.

- [ ] **Step 3: Replace the old CSS rule**

Replace the existing pause rule with:

```css
.fx-pausebreath .content-shell {
  animation: pausebreath 3.2s cubic-bezier(.45, 0, .55, 1) infinite;
  will-change: opacity, filter;
}
@keyframes pausebreath {
  0%, 100% { opacity: 1; filter: brightness(1); }
  50% { opacity: .68; filter: brightness(.78); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pauseBreath.test.mjs`

Expected: PASS. The CSS contains no `transform`, width, height, or JavaScript timer for the paused state.

### Task 3: Exclude only non-runtime package artifacts

**Files:**
- Modify: `electron-builder.config.factory.cjs`
- Modify: `tests/releasePreflight.test.cjs`

**Interfaces:**
- Consumes: `createBuildConfig()`.
- Produces: `files` exclusions for maps, Markdown, and test directories while keeping `compression: 'normal'`.

- [ ] **Step 1: Write the failing test**

Add to `tests/releasePreflight.test.cjs`:

```js
test('builder excludes non-runtime diagnostic and documentation artifacts without changing compression', () => {
  const config = createBuildConfig({})
  for (const pattern of ['!**/*.map', '!**/*.md', '!**/*.MD', '!**/*.markdown', '!**/test/**/*', '!**/tests/**/*']) {
    assert.ok(config.files.includes(pattern), pattern)
  }
  assert.equal(config.compression, 'normal')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/releasePreflight.test.cjs`

Expected: FAIL because these exclusions are absent.

- [ ] **Step 3: Add the exact safe exclusions**

Append these patterns after the existing NetEase `public` exclusion in `electron-builder.config.factory.cjs`:

```js
'!**/*.map',
'!**/*.md',
'!**/*.MD',
'!**/*.markdown',
'!**/test/**/*',
'!**/tests/**/*',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/releasePreflight.test.cjs`

Expected: PASS; existing installer directory-choice behavior remains covered.

### Task 4: Run regression, build, package, and runtime verification

**Files:**
- Verify only: `tests/*`, `dist/*`, `release/*`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fresh evidence for pause eligibility, build integrity, package contents, package size, and launch.

- [ ] **Step 1: Run complete automated regression suite**

Run: `npm.cmd test`

Expected: all existing tests plus `pauseBreath.test.mjs` pass with zero failures.

- [ ] **Step 2: Build the renderer**

Run: `npm.cmd run build`

Expected: Vite exits with code 0.

- [ ] **Step 3: Produce a local NSIS installer without upload**

Run:

```powershell
$env:LUCENT_UPDATE_REPOSITORY = 'Rex11929282/lucent-updates'
$env:LUCENT_RELEASE_CHANNEL = 'stable'
npm.cmd run dist
```

Expected: one `release/Lucent-Setup-1.0.0.exe` and matching blockmap, with `--publish never` preventing upload.

- [ ] **Step 4: Inspect the generated ASAR and compare size**

Run:

```powershell
$installer = Get-Item 'release/Lucent-Setup-1.0.0.exe'
$maps = & '.\\node_modules\\.bin\\asar.cmd' list 'release\\win-unpacked\\resources\\app.asar' | Select-String '\\.map$'
$docs = & '.\\node_modules\\.bin\\asar.cmd' list 'release\\win-unpacked\\resources\\app.asar' | Select-String '\\.(md|markdown)$'
[pscustomobject]@{ InstallerMiB = [math]::Round($installer.Length / 1MB, 2); SourceMaps = $maps.Count; Docs = $docs.Count }
```

Expected: `SourceMaps` and `Docs` are 0; installer size is compared against the 113.44 MiB baseline rather than assumed.

- [ ] **Step 5: Start the local packaged build once**

Run: `Start-Process -FilePath 'release\\win-unpacked\\Lucent.exe' -WorkingDirectory 'release\\win-unpacked'`

Expected: Lucent main window appears without an Electron main-process error. Close only the process started for this verification.
