# Shatter No Overlap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the full lyric pill is never visible at the same time as the particle shatter effect. The next pill only appears after the final rebuild particle has faded out.

**Architecture:** Keep the existing transition reducer, one Canvas particle layer, and two-`requestAnimationFrame` completion handoff. Add one pure visibility predicate shared by the renderer and tests. The pill is visible while its snapshot is captured, hidden for `shatter-out`, `dormant`, and `shatter-in`, and becomes visible again only when the existing `finished` event transitions state to `idle` on the following React render.

**Tech Stack:** React 19, Canvas 2D, CSS, Node test runner.

## Global Constraints

- Do not add a second canvas, screenshot layer, mask, timer, or transition state.
- Keep particles in the existing pill-bounded canvas and retain their cover-derived colour palette.
- Do not change lyric synchronisation, music identity, window position, particle count, playback clock, or other effects.
- `capture-out` remains visible so the existing snapshot capture has real pill content to capture.
- A failed snapshot must still return to `idle`; it must not leave the pill permanently hidden.

## Task 1: Add a testable strict-visibility rule

**Files:**
- Modify: `src/songTransition.js`
- Modify: `tests/songTransition.test.mjs`

- [ ] Add `shouldHidePillDuringTransition(mode, phase)` beside `isTransitionEffectsPaused`.
  - Return `true` only for `mode === 'shatter'` and phases `shatter-out`, `dormant`, or `shatter-in`.
  - Return `false` for `capture-out`, `capture-in`, `idle`, all scale phases, and non-shatter modes.
- [ ] Write focused unit tests before implementation for every visible and hidden boundary phase.
- [ ] Run `npm.cmd test -- --test-name-pattern "strict shatter visibility"` and verify the test starts red before adding the helper, then green after it exists.

## Task 2: Render the pill from the strict visibility rule

**Files:**
- Modify: `src/components/Capsule.jsx`
- Modify: `tests/songTransition.test.mjs`

- [ ] Import `shouldHidePillDuringTransition` into `Capsule`.
- [ ] Replace the local handwritten `transitionPhase` membership check with the shared predicate when applying `content--shatter-hidden` and phase-specific content classes.
- [ ] Preserve the existing `SongTransitionLayer` as a sibling of the content, so hiding the pill does not hide or pause the particle canvas.
- [ ] Add a static integration assertion that `Capsule` uses the shared predicate and continues to forward the existing `onInFinished` event.
- [ ] Run the focused transition tests.

## Task 3: Remove early content fade-in from shatter CSS

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/songTransition.test.mjs`

- [ ] Make `content--shatter-hidden` visually hidden (`opacity: 0`) as well as non-interactive.
- [ ] Remove the `particleContentOut` and `particleContentIn` content animations, because they make the live pill fade during the particle canvas animation.
- [ ] Keep `content--shatter-out`, `content--dormant`, and `content--shatter-in` fully hidden. Do not add a crossfade.
- [ ] Retain existing `.glass:has(.content--shatter-hidden)` suppression so no glass body, background, or edge helper remains visible behind particles.
- [ ] Add a regression assertion that no `particleContentIn`/`particleContentOut` animation remains and each active shatter content phase is hidden.
- [ ] Run the focused transition tests.

## Task 4: Verify the final-frame handoff and regression safety

**Files:**
- Verify: `src/components/SongTransitionLayer.jsx`
- Verify: `src/App.jsx`
- Verify: `tests/songTransition.test.mjs`

- [ ] Keep the existing double-RAF `onInFinished` callback. It guarantees the final zero-opacity particle frame paints before `finished` moves the reducer to `idle`.
- [ ] Add/retain a test asserting `SongTransitionLayer` emits `onInFinished` after the existing double-RAF handoff.
- [ ] Run the full suite: `npm.cmd test`.
- [ ] Build: `npm.cmd run build`.
- [ ] Start the direct development build and manually verify one normal shatter cycle:
  1. Old pill is visible while being captured.
  2. Once particles appear, neither old nor incoming pill is visible.
  3. Particles scatter, hold, and rebuild.
  4. The incoming pill appears only after the last particle disappears.
  5. A snapshot failure and fast song switching recover to a visible normal pill.

## Acceptance Criteria

- No full pill, cover, glass surface, lyric, progress bar, or auxiliary edge layer is visible during `shatter-out`, `dormant`, or `shatter-in`.
- There is no crossfade between particles and the rebuilt pill.
- Snapshot capture remains functional and snapshot failure cannot permanently hide the overlay.
- No additional particle allocation or frame loop is introduced.
- Existing song cover palette rebuild, lyric synchronisation, and non-shatter transitions retain their present behaviour.
