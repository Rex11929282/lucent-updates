# Changelog

All notable changes to Lucent are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

- Fixed Windows media sessions being treated as new sessions when duration metadata arrives after title and artist metadata, avoiding unnecessary source switches and lyric reloads.
- Upgraded the `electron-builder` toolchain to 26.15.3 and pinned the `music-metadata` 11.12.3 and `qs` 6.16.0 security fixes used by the NetEase API, while preserving the existing NetEase API interface.

---

## [1.1.1] - 2026-09-04

Repackaged the validated Lucent build with a selectable-path NSIS installer and GitHub automatic-update metadata.
This patch release updates the distribution version only; it adds no game-related functionality and does not produce a Portable build.

---

## [1.1.0] - 2026-09-03

First release with complete documentation, an open-source licence and a multilingual interface.

Numbered 1.1.0 rather than 1.0.0 deliberately. Published builds already reach 1.0.3, and
electron-updater will not move a user backwards, so shipping 1.0.0 would silently strand every
existing install on an unmaintained version.

### Added
- Multi-player media detection. Lucent now enumerates every Windows media session rather than
  targeting one hard-coded player, normalizes them into a single shape, and arbitrates which session
  is genuinely active. Stable source IDs: `internal-player`, `desktop-netease`, `desktop-spotify`,
  `desktop-youtube-music`, `desktop-generic`.
- Word-timed karaoke lyrics using NetEase YRC, with automatic fallback to line-timed LRC.
- Saved appearance profiles, plus `good`, `wow`, and `game good` quick presets that apply complete
  visual configurations (both capsule settings and glass parameters) instead of a handful of values.
- Plain-language explanations under every appearance setting, with a single toggle to hide them.
- Host-selectable room address. Machines with both a LAN adapter and a VPN adapter can now choose
  which address guests are given.
- A compact player on the playback page: album art, artist avatar, title, artist, album, source,
  playback state, previous/play/next, seek bar and times in one card.
- A real playback queue for the built-in player, taken from whichever list the track was played
  from (search results or a playlist). Previous/next navigate it, and a finished track advances to
  the next one. The room queue still takes priority when hosting.
- Localization layer with eleven languages (English, Traditional and Simplified Chinese, Japanese,
  Korean, Spanish, French, German, Portuguese, Russian, Italian). Language switches instantly
  without a restart, is remembered, and defaults to the system locale. Missing keys fall back to
  English rather than showing raw keys. Punctuation is part of each translation, so a full-width
  CJK colon never leaks into English. Navigation, settings, the room page, the compact player and
  playback-source labels, appearance controls, help, onboarding, and promotional preview text all
  use the active locale. Native-speaker review remains outstanding.
- Open-source project documentation: license, contributing guide, security policy, support guide,
  roadmap, architecture notes, player-integration guide, and maintainer workflow.

### Changed
- The desktop pet was rebuilt as a procedurally rendered pixel tabby with eight distinct actions
  (idle, walk, run, jump, eat, groom, stretch, sleep) instead of eight frames that drew the same
  pose.
- The song search input and result rows were enlarged for readability.
- The room page was restructured into clear "host" and "join" cards.
- The three complete quick presets replace the earlier partial presets; saved personal profiles and
  the random-appearance action remain available.

### Fixed
- **Pausing buffered audio or switching tracks could trigger a false playback failure.** A cancelled
  `play()` promise could report against the replacement track and reload its source. Playback
  attempts now invalidate old promises; deliberate cancellation does not trigger a retry.
- **Failed song loads could retain a loading placeholder as the title.** Failed provisional metadata
  is cleared, while already-loaded metadata survives a decoder failure for a source retry.
- **Loading labels leaked Chinese into other locales**, including the home page and status rail.
  They now use the active UI language without translating actual song titles or artist names.
- Missing promotional preview, pixel-cat accessibility, and untitled-song strings in all eleven
  locales could display fallback fragments such as `line` and `song`.
- Closing the console without a backend error could produce a blank failure toast, while a backend
  error could leak its source-language text. Close failures now always have a translated fallback
  and localize a returned error when one exists.
- **Saved settings could be lost.** Configuration was written on a 400 ms debounce with no flush on
  exit, so anything changed just before closing — including a newly saved appearance profile — never
  reached disk. Named profiles now write immediately, and every exit path flushes pending writes.
- **Buttons inside 3D cards could not be clicked.** A `translateZ(0)` layer hint on buttons, combined
  with a `preserve-3d` ancestor, made Chromium's hit testing resolve clicks to the parent element.
  Because the button's hover transform triggered it, the failure happened exactly when the user was
  about to click.
- **Notifications covered the window close button**, making the console impossible to close while a
  toast was visible.
- **Program artwork never loaded.** Asset paths were absolute strings, which resolve incorrectly
  under the packaged `file://` origin; they are now imported so the bundler emits correct URLs.
- **The desktop pet never animated** on machines where Windows animation effects are disabled. Pet
  motion is now its own setting rather than being silently suppressed by the system preference.
- **Rooms could advertise an unreachable address** on machines with a VPN adapter installed.
- The search input collapsed to a few pixels wide because a full-width button consumed the row.
- **The console could open completely blank.** The compact player read the room state through a
  default parameter, which does not apply to `null` — and the room state starts as `null`. Anyone
  whose console reopened on the Play page before joining a room hit a render-time crash, and with no
  error boundary the entire window went empty.

---

## Earlier releases

Versions up to and including 1.0.3 were published while the project was still being shaped, and no
changelog was kept at the time. Rather than reconstruct entries after the fact, they are intentionally
left undocumented here — the GitHub Releases page remains the record of what was published.
