# Remove Progress Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the nine rejected progress animation modes and all word-driven progress effects while preserving karaoke lyric highlighting and the remaining progress modes.

**Architecture:** Keep `appearanceModel.js` as the authoritative mode allowlist. Remove rejected renderer layers and CSS engines at their sources, then sanitize old saved modes during migration so legacy configs fall back to `none`.

**Tech Stack:** React 19, CSS, Electron, Node test runner.

## Global Constraints

- Preserve lyric karaoke highlighting.
- Preserve RGB coloring, segmented progress, line-change beat, and the remaining modes.
- Do not package an EXE in this task.

---

### Task 1: Lock the reduced mode contract

**Files:**
- Modify: `tests/appearanceModel.test.mjs`
- Modify: `tests/progressRuntime.test.mjs`
- Modify: `tests/stateMigration.test.cjs`

- [ ] Replace the expected mode list with `none`, `flow`, `breathe`, `pulse`, `bounce`, and `segments`.
- [ ] Assert rejected modes and word-effect renderer hooks are absent.
- [ ] Assert legacy rejected modes migrate to `none`.
- [ ] Run `node --test tests/appearanceModel.test.mjs tests/progressRuntime.test.mjs tests/stateMigration.test.cjs` and verify the new assertions fail before production changes.

### Task 2: Remove rejected runtime behavior

**Files:**
- Modify: `src/appearanceModel.js`
- Modify: `src/components/Capsule.jsx`
- Modify: `src/styles.css`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `shared/defaults.json`
- Modify: `shared/stateMigration.cjs`

- [ ] Reduce the mode allowlist and continuous-mode set.
- [ ] Remove effect-layer generation, progress word-step events, rejected CSS variables, and rejected CSS engines.
- [ ] Remove rejected options and the complete word-driven progress settings group from the console.
- [ ] Remove obsolete defaults and sanitize rejected saved modes to `none`.
- [ ] Run the focused tests and verify they pass.

### Task 3: Regression verification

**Files:**
- Verify only.

- [ ] Run `npm.cmd test` and require zero failures.
- [ ] Run `npm.cmd run build` and require exit code 0.
- [ ] Restart the source application and verify the settings list contains only the six retained modes.
