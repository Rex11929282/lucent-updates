# Lucent (璃音)

[![CI](https://github.com/Rex11929282/lucent-updates/actions/workflows/ci.yml/badge.svg)](https://github.com/Rex11929282/lucent-updates/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Rex11929282/lucent-updates/actions/workflows/codeql.yml/badge.svg)](https://github.com/Rex11929282/lucent-updates/actions/workflows/codeql.yml)

**An open-source Windows desktop lyrics overlay and media-session integration project.**
Lucent detects which media session is actually playing on your PC, normalizes its metadata and
artwork, resolves synchronized lyrics, and renders them in a customizable liquid-glass overlay
that floats above your desktop.

Lucent is both an end-user desktop app and a working example of cross-player media-state
integration on Windows.

---

## What it does

### Lyrics overlay
- A single **liquid-glass capsule** that floats above the desktop, always on top, click-through optional.
- **Real-time synchronized lyrics** that follow the actual playback position.
- **Karaoke word-by-word highlighting** when the provider supplies word-timed lyrics (NetEase YRC).
- **Bilingual lyrics** — original plus translation on a second line.
- Extensive appearance control: glass material, background, blur, tint, corner radius, typography,
  progress-bar animations, decorative particle effects, and a spinning vinyl with artist artwork.
- **Quick presets** and **saved appearance profiles** that capture a complete visual configuration.

### Automatic playback detection
Lucent does not target a single hard-coded player. It scans **all Windows media sessions**
(SMTC/GSMTC), normalizes them into one shape, and arbitrates which one is genuinely active:

| Source ID | Player |
| --- | --- |
| `internal-player` | Lucent's built-in player |
| `desktop-netease` | NetEase Cloud Music desktop |
| `desktop-spotify` | Spotify desktop |
| `desktop-youtube-music` | YouTube Music (PWA or Chromium browser) |
| `desktop-generic` | Any other player exposing enough media-session metadata |

Source IDs are stable internal identifiers and never change with UI language.

When another player becomes the real active source, Lucent switches to it automatically without
losing lyric sync or reloading artwork unnecessarily.

### Room sync (LAN)
Everyone on the same local network can watch the same subtitle line. The host plays the music;
members follow. Only the lyric timeline and playback state are synchronized — **no audio is
streamed**, so bandwidth stays minimal.

### Other
- Song search, now-playing view and playback controls for the built-in player.
- Album artwork and artist images, with caching so routine position updates never cause flicker.
- Settings persist automatically and survive restarts.
- Auto update through GitHub Releases.

---

## Requirements

- **Windows 10 or 11.** Lucent relies on the Windows `GlobalSystemMediaTransportControls` API, so
  it is Windows-only by design.
- Node.js 22.12+ and npm, if you are building from source.

---

## Install

Download the latest installer from the [Releases](../../releases) page and run it.

To build from source, see [Development](#development).

---

## Basic usage

1. Start Lucent. The control console opens; the desktop capsule appears when you close or collapse it.
2. Start playing music in any supported player.
3. Lucent detects the active session and shows synchronized lyrics in the capsule.

| Action | How |
| --- | --- |
| Move the capsule | Drag it with the left mouse button |
| Open the console | Right-click the capsule, or `Ctrl+Alt+S` |
| Toggle click-through | `Ctrl+Alt+L`, or the console toggle |
| Play / pause | Click the capsule, or `Ctrl+Alt+Space` |

The console has six pages: **Home, Play, Appearance, Room, Settings, Help**.

### Precise NetEase sync

For NetEase Cloud Music, Lucent can mirror the exact line the desktop app is highlighting, which is
more accurate than reconstructing a timeline. This requires the NetEase desktop app to be running
with its lyrics page open. Without it, Lucent falls back to normal timeline synchronization.

---

## Development

```bash
npm ci
npm test
npm run build
npm run dev
```

- `npm run dev` starts the Vite dev server and the Electron windows together.
- `npm test` runs the full suite with the Node.js built-in test runner. There is no external test
  framework and no network access required.
- `npm run build` produces the renderer bundle in `dist/`.

Packaging is gated behind a release preflight check:

```bash
npm run release:check
npm run dist
```

`npm run dist` deliberately refuses to produce a build that could be mistaken for an official
release unless the required release signals are configured. Those signals are packaging safeguards;
they do not replace written licensing agreements with any music service.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor workflow, including how to add a
player adapter.

Architecture is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and player integration in
[docs/PLAYER_INTEGRATION.md](docs/PLAYER_INTEGRATION.md).

---

## Privacy

Lucent runs locally. It does not collect listening history, personal song history, IP addresses, or
device identifiers, and it has no analytics backend.

- Music metadata is read from Windows media sessions on your own machine.
- Lyrics and artwork are fetched from the relevant music provider only for the track being played.
- Room sync sends the lyric timeline and playback state to peers **you** connect to on your local
  network, and nothing else.
- NetEase credentials, when you choose to sign in, are stored encrypted through the OS credential
  facilities and never leave the machine.

---

## Known limitations

These are real constraints, not future work:

- **Windows only.** The media-session APIs Lucent depends on do not exist on macOS or Linux.
- **Precise NetEase mirroring depends on the NetEase desktop UI.** If that app changes its markup,
  mirroring can break and Lucent falls back to timeline sync.
- **`backdrop-filter` cannot sample desktop pixels.** A transparent overlay window has nothing
  behind it to refract, so the glass displacement effect is subtle unless the capsule has a
  background of its own (album art, tint, or frost).
- **Not every track has lyrics**, and metadata from generic players is often too sparse to match a
  song confidently. Lucent shows media information without forcing an incorrect lyric match.
- **Translation quality still needs native-speaker review.** Lucent ships eleven languages and
  switches instantly. All visible console UI, including appearance, help, onboarding, playback,
  rooms, and the promotional preview, goes through the translation system. Actual song titles,
  artist names, and other provider metadata remain in the language returned by the provider.
  The shipped translations were not written by native speakers, so corrections are welcome.

---

## Contributing

Contributions are welcome — bug reports, player compatibility reports, and pull requests.
Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [SUPPORT.md](SUPPORT.md).

Security issues should follow [SECURITY.md](SECURITY.md) rather than a public issue.

## License

[MIT](LICENSE).
