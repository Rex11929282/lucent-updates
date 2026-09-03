# Architecture

This document exists so a reviewer can understand Lucent without reverse-engineering it.

## The core idea

Every playback source — the built-in player, NetEase, Spotify, YouTube Music, an unknown player, or
a room host — is reduced to one shape, a **normalized playback state**. Everything downstream
(lyrics, artwork, the overlay) consumes only that shape and does not know or care which player
produced it.

```
Windows Media Sessions
        |
Media Session Scanner        electron/smtc.cjs  ->  shared/mediaSession.cjs
        |
Active Session Resolver      shared/activeSessionResolver.cjs
        |
Player Adapter / source id   shared/playbackSource.cjs
        |
NormalizedPlaybackState      shared/playbackCoordinator.cjs
        |
        +-- Artwork Resolver
        +-- Artist Metadata Resolver
        +-- Lyric Resolver         electron/netease.cjs
                |
          Lyric Timeline           parseYrc / parseLrc / mergeTranslation
                |
          Overlay Renderer         src/App.jsx -> src/components/Capsule.jsx
```

## Processes

**Electron main** (`electron/main.cjs`) owns everything that must be single-source-of-truth: the
config file, the playback coordinator, the room server/client, the media session poller, and window
lifecycle. It is the only place that touches the filesystem or the network.

**Preload** (`electron/preload.cjs`) exposes a fixed API surface over `contextBridge`. The renderer
never receives raw `ipcRenderer`. Adding a capability means adding an explicit method here.

**Renderer** runs two windows from one bundle, switched by URL hash:

- no hash — the desktop capsule (`src/App.jsx`)
- `#console` — the control console (`src/ConsoleWindow.jsx`)
- `#audio-service` — a hidden window that owns the `<audio>` element for the internal player

Both windows share appearance state through `src/useSharedState.js`, which round-trips via main so
the two windows never diverge.

## Playback

`shared/playbackCoordinator.cjs` is the arbiter. Each source pushes snapshots into it; it decides
which one is selected and notifies subscribers only when the selection actually changes.

Rules that matter:

- A playing desktop source beats a playing internal source, so Lucent never fights the app the user
  is actually using.
- A paused desktop source does not block the internal player.
- In a room, a member always renders the host's snapshot, even when the host is paused.
- Position updates alone do not re-publish a full snapshot, which is what keeps artwork from
  flickering on every poll.

`shared/playerPolicy.cjs` decides whether the internal player may act at all, and surfaces a reason
when it may not.

`src/AudioService.jsx` also tracks individual asynchronous play attempts. Pausing or replacing a
source invalidates a pending `play()` promise, so normal cancellation cannot report an error against
the next song. Failed provisional metadata is cleared; already-loaded song data remains available
for a decoder/source retry.

## Lyrics

Two paths, one core.

**Mirroring (NetEase desktop).** `electron/ncmcdp.cjs` attaches to the NetEase desktop app over the
Chrome DevTools Protocol and reads the line the app itself is highlighting. This is more accurate
than reconstructing a timeline, because it is the app's own answer. It requires the NetEase lyrics
page to be open, and it depends on that app's markup — a real fragility, documented in the README.

**Timeline.** Everything else fetches lyrics and runs a timeline against the playback clock. Word
timing comes from NetEase YRC when available; otherwise line-timed LRC. Translations are merged into
the same line objects so bilingual rendering is one pass.

Both paths produce the same `lines` array, so the overlay has one renderer.

Staleness is handled with a revision counter: every load increments it, and any response that arrives
against an older revision is discarded. This is what stops a slow lyric fetch from overwriting the
song the user has already skipped to.

## Rooms

`electron/room.cjs` implements a LAN room over WebSocket on port 8787. The host is the authoritative
server and broadcasts state; members render what they are told.

Only the lyric timeline and playback state cross the wire — no audio. `shared/roomClock.cjs`
compensates for latency so members land on the same line rather than the same wall-clock instant.
`shared/roomPolicy.cjs` enforces what a member is allowed to request; a crafted message cannot
execute a host-only command.

## Settings

One JSON file in the Electron user-data directory, described by `shared/defaults.json`, which is the
single source of truth for both processes.

`shared/stateMigration.cjs` upgrades older files forward. New keys appear automatically because
migration merges schema defaults; nobody has to delete their configuration to take an update.

Writes are debounced for high-frequency changes such as window dragging, but named profiles write
immediately and every exit path flushes — settings used to be lost by closing the app too quickly
after a change.

## Updates

`electron/updateService.cjs` wraps `electron-updater`. `shared/updateConfig.cjs` reads the bundled
release configuration, and capability is downgraded safely: development builds disable updates,
portable builds fall back to manual download.

Packaging is gated by `scripts/releasePreflight.cjs`, which refuses to produce an official-looking
build without the required release signals.

## Tests

`npm test` runs the Node.js built-in runner over `tests/`. No external framework, no network.

Three kinds of test:

1. **Unit tests** over `shared/` modules. Most logic lives there precisely so it can be tested
   without Electron.
2. **Source-level assertions** against `electron/main.cjs` and `src/styles.css`. These guard wiring
   and CSS invariants a unit test cannot see — that an IPC handler is registered, that a decorative
   overlay does not swallow clicks, that a toast does not cover the close button. They look unusual;
   they exist because those exact bugs shipped.
3. **Electron smoke scripts** (`tests/electron*Smoke.cjs`) that drive a running app over the DevTools
   Protocol. Not part of `npm test`.

When verifying UI interactivity, drive real mouse events through the DevTools Protocol rather than
calling `element.click()`. Programmatic clicks bypass hit testing and will pass against a button that
a user genuinely cannot click.

`npm run test:audio:runtime` builds and launches an isolated Electron instance with a temporary user
data directory and a local WAV server. It verifies actual analyser output and deliberately pending
play requests interrupted by pause or replacement. It does not use an account or contact NetEase,
so a passing result does not by itself prove authenticated online playback. The owned test process,
HTTP connections, and temporary user data are cleaned up on success or failure.
