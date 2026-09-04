# Handoff notes

Working state of the repository, written for whoever picks it up next. Two things matter here:
what is currently true, and which pieces of code look redundant but are not.

Everything below has been verified against a running build, not only against the test suite.

---

## Current state

- Version is **1.1.1** in `package.json` and `CHANGELOG.md`. Do not move it to 1.0.0. Published
  builds already reach 1.0.3 and electron-updater never downgrades, so 1.0.0 would strand every
  existing install. The reasoning is recorded in the changelog entry itself.
- `npm test` — 732 tests across two suites (156 + 576), all passing. `npm run build` clean.
- Runtime checks — audio playback, room reconnect, and the 42-call IPC fuzz probe all pass in
  isolated temporary profiles. The IPC probe reports 37 clean resolutions, 5 contained rejections,
  and zero wedged main processes.
- `npm run release:check` intentionally fails when the two release signals are absent; with
  `LUCENT_UPDATE_REPOSITORY=Rex11929282/lucent-updates` and stable channel it passes.
- GitHub Release **v1.1.1** is published at
  `https://github.com/Rex11929282/lucent-updates/releases/tag/v1.1.1` with the NSIS installer,
  matching blockmap and `latest.yml`. The remote installer size and SHA-256 match the local files.
- **Repository consolidation completed:** `Rex11929282/lucent-updates` is the single public
  repository for source, project history and binary Release assets. The obsolete binary-only
  repository was deleted after the source repository took over the same URL, so packaged clients
  keep their existing update endpoint.
- Sections 1–22 of the 1.0.0 task document are done and verified. Sections 8–22 were checked
  behaviourally against the spec, not just for file presence — see
  `tests/mediaSpecConformance.test.cjs`, where each assertion carries its requirement number.

## Invariants that look redundant and are not

Each of these encodes a bug that already shipped. Removing the guard restores the bug, and in three
of these cases the entire test suite stayed green while the bug was live.

1. **`electron/room.cjs` — `parseProtocolMessage`.**
   `JSON.parse` accepts `null`, numbers, strings, booleans and arrays. Both socket handlers must
   reject any non-object *before* reading a field. Sending the four bytes `null` to the room port
   used to throw a `TypeError` that wedged the whole main process, silently, with nothing on stderr.
   It is exported purely so its test can exercise the real function — a test that reimplements it
   would pass even after the guard was deleted.

2. **`shared/configStore.cjs` — rename before falling back to defaults.**
   An unparseable settings file is renamed to `<path>.corrupt-<stamp>`, never discarded. Returning
   defaults silently is what made a truncated write indistinguishable from a factory reset, and the
   next save overwrote the only copy. The BOM strip belongs to the same fix: Notepad adds one, and
   `JSON.parse` rejects it, so hand-editing your own settings used to erase them.
   `electron/privacyService.cjs` deletes those backups on "erase settings" — they hold the same
   personal data, and a recovery feature that defeats a privacy feature is worse than no recovery.

3. **`shared/internalPlayerState.cjs` — `canRebuild` must not require `transition.token > 0`.**
   The capsule's shatter animation parks in a `dormant` phase until told which revision is ready.
   That signal is `transition.readySongRevision`. Requiring the internal player's *own* token meant
   it only ever signalled after it had already finished a song — but the pending shatter normally
   comes from the desktop source, whose token lives on a different object. The capsule stayed frozen
   on the previous desktop track, showing that track's lyrics, while something else was audibly
   playing. Safety depends on one source's transition never appearing in another's snapshot;
   `tests/playbackTransitionIsolation.test.cjs` pins that.

4. **`shared/systemLocale.cjs` + `src/i18n.js` `detectSystemLocale`.**
   Windows reports a region format (`zh-CN`) separately from a display language (`zh-Hant-TW`).
   `app.getLocale()` and `navigator.language` both give the *format*. Every renderer must resolve
   its language through `detectSystemLocale()`; a test fails if any of them reads `navigator`
   directly, because the first version of this fix updated the console and missed the capsule.

5. **`electron/updateService.cjs` — the lookbehind in `publicError`.**
   `(?<![A-Za-z0-9])` is load-bearing. Without it the drive-letter rule also matches the `s:/`
   inside `https://`, rewriting every URL in an update error to `http本機檔案` and destroying the one
   detail a maintainer needs. The redaction exists because the issue templates ask users to paste
   these errors publicly and Windows paths contain the account name.

6. **`shared/mediaSession.cjs` — `isOwnMediaSession` accepts any iterable but rejects strings.**
   The caller passes a `Set`. A string is iterable and would match character by character.

## Verification that the test suite does not give you

Roughly one test in five only reads a source file and matches a regex. Those pin wiring, not
behaviour. When touching these areas, run the matching runtime check — the table in
`docs/MAINTAINER_WORKFLOW.md` lists them. In particular:

- Anything the main process requires at startup: **launch the app.** `tests/mainModuleResolution.test.cjs`
  proves the requires resolve, not that the app boots.
- The preload/IPC surface: `npm run test:ipc-fuzz:runtime` (42 hostile calls, checks main still answers).
- Renderer state that "should" be updating: read the React fiber. The internal-player lyric bug was
  invisible from the backend — state arrived complete and correct, and the capsule rendered a frozen
  snapshot anyway. Only inspecting `frozenVisual` on the fiber found it.

## Open items — none of these are code

They are listed here so they are not mistaken for unfinished work in the tree.

| Item | Who can do it |
| --- | --- |
| `LICENSE` copyright holder | **Only the repository owner.** It currently reads `Rex11929282`, taken from the repo URL. A legal name makes copyright easier to assert; a handle keeps the name private. Both are valid — this is not a placeholder awaiting a fix. |
| Screenshot of the capsule over a real desktop | **Only the owner.** The capsule is a transparent GPU-composited window: DevTools screenshots return blank, and the app's own `capturePill` deliberately captures the desktop *behind* the pill. An OS-level capture works but photographs whatever else is on screen. |
| GitHub repository settings | **Only the owner.** Everything is written out ready to paste in `docs/GITHUB_SETTINGS_TO_APPLY.md`, including the order to apply it in. |
| Native review of the eleven locales | A native speaker. The mechanical audit is clean — zero placeholder mismatches across 702 keys, zero length outliers — but that checks the machinery, not whether the wording reads naturally. |

Four screenshots of the console are captured and publishable. The room page must use the **redacted**
copy: the original showed a real LAN address twice plus the network adapter name.
