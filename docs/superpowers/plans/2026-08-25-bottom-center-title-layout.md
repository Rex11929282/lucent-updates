# Bottom-Center Song Title Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing bottom-center song title its own bottom row inside the pill so it cannot overlap progress or playback time.

**Architecture:** Retain the existing `songNamePos: 'bc'` config value and `Capsule` markup. Change the `name-bc` CSS from full-column reversal to normal flow, letting the title render after the lyric/progress block. This keeps the progress/time row above the title and naturally grows the shared overlay/preview pill by one title row.

**Tech Stack:** React 19, CSS, Node test runner, Vite.

## Global Constraints

- Do not add a setting, config field, schema migration, timer, absolute overlay, or duplicate preview component.
- Change only the `name-bc` title layout; retain `tl`, `tc`, `tr`, `bl`, and `br` behaviour.
- Preserve lyric synchronisation, progress calculations, progress animations, vinyl layout, and glass rendering.
- Overlay and workbench preview must continue to use the same `Capsule` renderer.

---

### Task 1: Lock the bottom-center layout contract with regression tests

**Files:**
- Modify: `tests/songDisplay.test.mjs`
- Test: `tests/songDisplay.test.mjs`

**Interfaces:**
- Consumes: CSS class `name-bc` emitted by `src/components/Capsule.jsx`.
- Produces: Static regression protection for the CSS flow contract.

- [ ] **Step 1: Write the failing test**

```js
test('bottom-center song title reserves a separate in-pill row after playback time', async () => {
  const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(stylesSource, /\.name-bl \.content, \.name-bc \.content, \.name-br \.content \{ flex-direction: column-reverse; \}/)
  assert.match(stylesSource, /\.name-bc \.songname \{[^}]*align-self: center[^}]*margin: 4px 0 0[^}]*\}/s)
})
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `node --test --test-name-pattern "bottom-center song title reserves" tests/songDisplay.test.mjs`

Expected: FAIL because `name-bc` still belongs to the `column-reverse` selector and has no dedicated bottom-row margin.

- [ ] **Step 3: Implement the smallest CSS-only layout change**

In `src/styles.css`, keep only left-bottom and right-bottom in the reverse selector and make bottom-center remain normal column flow:

```css
.name-bl .content, .name-br .content { flex-direction: column-reverse; }
.name-bc .songname { align-self: center; margin: 4px 0 0; }
```

The existing markup already places `.songname` before `.row-wrap`; in normal column flow it would not create a bottom title. Move the song-title JSX block after `.row-wrap` only when `cfg.songNamePos === 'bc'`, while keeping it before `.row-wrap` for all other positions:

```jsx
const songNameNode = cfg.showSongName && songName ? <div className="songname">{songName}</div> : null
// render songNameNode before row-wrap unless cfg.songNamePos === 'bc'
// render songNameNode after row-wrap only when cfg.songNamePos === 'bc'
```

- [ ] **Step 4: Run the targeted test and verify it passes**

Run: `node --test --test-name-pattern "bottom-center song title reserves" tests/songDisplay.test.mjs`

Expected: PASS.

### Task 2: Verify real Capsule placement and preserve remaining title positions

**Files:**
- Modify: `tests/songDisplay.test.mjs`
- Modify: `src/components/Capsule.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `cfg.songNamePos`, `cfg.showSongName`, and `songName` supplied to `Capsule`.
- Produces: One `songname` element positioned after `.row-wrap` only for `bc`.

- [ ] **Step 1: Write the failing static renderer test**

```js
test('Capsule renders bottom-center title after the lyric and progress row only for bc', async () => {
  const capsuleSource = await readFile(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
  assert.match(capsuleSource, /const songNameNode = cfg\.showSongName && songName \? \(/)
  assert.match(capsuleSource, /cfg\.songNamePos !== 'bc' \? songNameNode : null[\s\S]*<div className="row-wrap">[\s\S]*cfg\.songNamePos === 'bc' \? songNameNode : null/s)
})
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `node --test --test-name-pattern "Capsule renders bottom-center" tests/songDisplay.test.mjs`

Expected: FAIL because `Capsule` currently always renders the song name before `.row-wrap`.

- [ ] **Step 3: Implement the conditional normal-flow markup**

In `src/components/Capsule.jsx`, define the existing song-name JSX once:

```jsx
const songNameNode = cfg.showSongName && songName ? (
  <div className="songname">{songName}</div>
) : null
```

Then replace the existing unconditional song-name JSX with:

```jsx
{cfg.songNamePos !== 'bc' ? songNameNode : null}
<div className="row-wrap">...</div>
{cfg.songNamePos === 'bc' ? songNameNode : null}
```

Keep the `row-wrap` content exactly unchanged. Do not alter `name-bl`/`name-br` behaviour.

- [ ] **Step 4: Run focused title/layout tests and verify they pass**

Run: `node --test tests/songDisplay.test.mjs tests/lyricLayout.test.mjs`

Expected: PASS.

### Task 3: Complete regression and runtime checks

**Files:**
- Verify: `src/components/Capsule.jsx`
- Verify: `src/styles.css`
- Verify: `tests/songDisplay.test.mjs`

**Interfaces:**
- Consumes: Completed `bc` normal-flow layout.
- Produces: Build-valid, user-visible title placement.

- [ ] **Step 1: Run the full test suite**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 2: Build the renderer**

Run: `npm.cmd run build`

Expected: Vite build completes without errors.

- [ ] **Step 3: Reopen the existing direct development instance**

Close only the verified Lucent Electron main process, then run `npm.cmd run dev` from `D:\DIOWMOW\Documents\克勞德`. Verify the main window title is `璃音 Lucent` and responding.

- [ ] **Step 4: Manual acceptance check**

Select `歌名位置 → 下中` and verify:

1. Lyrics and translation remain above the progress row.
2. Progress and `current / total` time are fully visible.
3. The song title is centered on its own lowest row inside the pill.
4. Switching back to another title position restores its existing layout.
