# Contributing to Lucent

Thanks for considering a contribution. Lucent is a Windows desktop app, so most contributions need
a Windows machine to verify.

## Prerequisites

- Windows 10 or 11 (the media-session APIs Lucent depends on are Windows-only)
- Node.js 20 or newer, and npm
- A music player to test against — NetEase Cloud Music, Spotify, or YouTube Music in a browser

## Getting started

```bash
git clone <your fork>
cd lucent
npm ci
npm test
npm run dev
```

`npm run dev` starts Vite and Electron together. Two windows open: the desktop capsule and the
control console.

If you see `Electron failed to install correctly`, the Electron binary did not download during
install. Reinstall, or download the matching release from the Electron repository and extract it
into `node_modules/electron/dist/`.

## Running tests

```bash
npm test
```

Tests use the Node.js built-in test runner. There is no external framework, and no test requires
network access. `npm test` runs `pretest` first, so a single command covers the whole suite.

To run one file while iterating:

```bash
npm exec -- node --test tests/playbackCoordinator.test.cjs
```

Most tests are plain unit tests over the modules in `shared/`. Some assert against the source text of
`electron/main.cjs` or `src/styles.css` — these guard wiring and CSS invariants that unit tests
cannot reach, such as "this IPC handler is registered" or "this element is not covered by an overlay".
If you change that wiring, update the assertion rather than deleting it.

There are also Electron smoke scripts under `tests/electron*Smoke.cjs`. They drive a running app over
the Chrome DevTools Protocol and are not part of `npm test`.

## Building

```bash
npm run build      # renderer bundle only
npm run release:check
npm run dist       # full installer, requires the release signals
```

`npm run dist` refuses to build unless the release preflight passes. This is intentional: it stops
an unofficial build from being mistaken for a signed release.

## Code style

There is no linter enforced in CI. Match the surrounding code:

- Two-space indent, no semicolons, single quotes.
- Prefer small pure modules in `shared/` so behaviour can be unit tested without Electron.
- Comments explain **why**, not what. If a line looks odd but is deliberate, say why — several
  workarounds in this codebase exist for specific Chromium or Windows behaviours and will otherwise
  be "cleaned up" back into bugs.
- User-facing strings are currently Traditional Chinese. Developer documentation and code comments
  are English.

## Commits and branches

- Work on a branch, not `main`.
- Write commit messages that describe the change and its reason.
- Keep unrelated changes out of the same pull request.

## Pull requests

Before opening a PR:

1. `npm test` passes.
2. `npm run build` passes.
3. New behaviour has a test. Bug fixes have a regression test that fails without the fix.
4. UI changes include a screenshot.

Never commit secrets, cookies, credentials, or personal listening data. `netease-credential.bin` and
anything under a user data directory must stay out of the repository.

## Reporting bugs

Use the issue templates. For playback problems, the **Player compatibility** template asks for the
`SourceAppUserModelId` and the metadata a player exposes — that is usually the difference between a
report we can act on and one we cannot.

## Proposing features

Open an issue describing the problem before writing code. Lucent deliberately keeps a small surface;
a feature that only makes sense for one player usually belongs behind the player-adapter abstraction
instead of in the core.

## Adding a player adapter

Lucent normalizes every source into one `NormalizedPlaybackState`. To add a player:

1. Teach `shared/playbackSource.cjs` to recognise it in `desktopSourceId()`, and add a stable source
   ID. Existing IDs must not change — they are persisted and used in room messages.
2. If the player needs special metadata handling, extend `shared/mediaSession.cjs`.
3. If it should be preferred or de-prioritised during arbitration, adjust
   `shared/activeSessionResolver.cjs`.
4. Add tests covering detection, normalization and arbitration.

See [docs/PLAYER_INTEGRATION.md](docs/PLAYER_INTEGRATION.md) for the full walkthrough.

You do not need to modify the lyric, artwork, or overlay code: once a source produces a normalized
state, the shared pipeline handles the rest.

## Adding a language

The localization system is not built yet — see [ROADMAP.md](ROADMAP.md). Until it lands, please do
not submit large string-extraction PRs; coordinate on an issue first so the work is not duplicated.
