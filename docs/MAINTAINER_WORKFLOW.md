# Maintainer Workflow

Lucent is maintained by one person. This document describes how work actually flows, so the process
is legible to contributors and repeatable when the maintainer returns to it after a gap.

## The loop

```
Issue -> Triage -> Reproduce -> Implementation / PR -> Automated tests -> Review -> Release
```

### Triage

Every incoming issue gets one of four outcomes:

- **Actionable** — reproduction steps are clear enough to work from. Labelled and queued.
- **Needs information** — usually a compatibility report missing the `SourceAppUserModelId`, or a bug
  with no version. Ask once, specifically.
- **Documented behaviour** — Windows-only, NetEase precise sync needing the desktop app, subtle glass
  refraction on a transparent window. Point at the README section and close politely.
- **Out of scope** — see the "Not planned" section of ROADMAP.md. Close with the reason, not silence.

Duplicates get linked to the original rather than closed bare, so the reporter can follow along.

### Reproduce

Nothing gets fixed from a description alone. Player behaviour in particular varies by app and by
version, and the same symptom ("no lyrics") has several unrelated causes.

If it cannot be reproduced, say so and ask for the specific missing signal rather than guessing.

### Implementation

Work happens on a branch. The bar for a fix:

1. The root cause is understood, not just the symptom suppressed.
2. A regression test exists that **fails without the fix**. This is the part most easily skipped and
   most often regretted.
3. Comments explain why, especially for workarounds around Chromium or Windows behaviour — otherwise
   the next cleanup pass turns them back into bugs.

### Automated tests

`npm test` and `npm run build` must pass. CI runs both on Windows for every pull request and every
push to `main`.

For UI interactivity, verify with real input. Programmatic `element.click()` bypasses hit testing and
will happily pass against a button a user genuinely cannot click — that exact mistake shipped a
broken button once already.

`npm test` is necessary but not sufficient, and it is worth knowing exactly why. Roughly one test in
five only reads a source file and matches a regex; those pin wiring, not behaviour. Three real bugs
passed the full suite in a single day — a `require()` of a path that did not exist, a `Set` passed to
a function calling `.some()`, and a four-byte message that wedged the entire main process. When
touching any of the following, run the matching runtime check rather than trusting the green suite:

| What changed | Run |
| --- | --- |
| Anything the main process requires at startup | Launch the app. `tests/mainModuleResolution.test.cjs` covers resolution, not runtime. |
| The room protocol or socket handling | `npm run test:room-reconnect:runtime` and `tests/roomMessageHardening.test.cjs` |
| The preload bridge or any `ipcMain` handler | `npm run test:ipc-fuzz:runtime` |
| Settings loading, migration or persistence | `tests/configStore.test.cjs`, then launch once with a real config |
| A backend error string | `tests/backendMessageCoverage.test.mjs` — an unmapped message shows a generic fallback in ten of the eleven languages |

### Review

Even for solo work, changes go through a pull request so there is a reviewable diff and a written
reason. Review looks for:

- Regression risk that the author did not mention
- Stable identifiers being renamed (source IDs, config keys) — these are persisted and cross the room
  protocol, so renaming them breaks real installs
- Tests that were deleted instead of updated when wiring changed
- Secrets or personal data in the diff

### Release

1. Update `CHANGELOG.md` from the merged work, not from memory.
2. Bump the version.
3. `npm run release:check` — packaging refuses to produce an official-looking build without the
   required release signals.
4. `npm run dist`.
5. Publish the release with notes covering Highlights, Added, Fixed, Compatibility, Known issues, and
   install notes.
6. Keep artifact naming stable, and preserve `latest.yml`, the `.exe` and the `.blockmap`. Removing
   or renaming them breaks auto update for existing installs.

## Where AI assistance fits

The maintainer may use Codex or a similar assistant for parts of this loop. Scope matters: these are
maintenance aids, and a human makes the call.

- **Issue triage** — classifying reports, spotting duplicates, identifying which required detail is
  missing.
- **Pull request first-pass review** — surfacing regression risk and missing test coverage before a
  human read.
- **Regression test drafting** — turning a reproduction into a test that fails without the fix.
- **Release summaries** — assembling changelog entries from merged work, for the maintainer to verify.
- **Security-sensitive review** — a second read over Electron IPC boundaries, room message handling,
  external metadata handling, and updater logic.

Two constraints:

- Lucent's runtime has **no dependency on any AI service**. End users never supply an API key, and no
  such call happens during playback or lyric resolution.
- Generated output is reviewed before it lands. Assistance does not change authorship, and AI systems
  are not credited as contributors, co-authors, or maintainers.
