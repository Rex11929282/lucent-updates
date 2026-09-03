# Roadmap

This is a working roadmap, not a release schedule. There are no dates, because Lucent is maintained
by one person and inventing deadlines would only make this document wrong.

Items move up when they are actually being worked on.

---

## Now

Work in progress.

- **Multi-player media detection.** Scanning every Windows media session, normalizing them into one
  shape, and arbitrating which is genuinely active. The scanner, normalizer and resolver exist; a
  metadata-enrichment edge case is now covered: filling in duration later no longer creates a new
  synthetic session. Remaining work is hardening arbitration against paused-but-recent sessions,
  browsers reporting several sessions at once, and players that stop updating position.
- **Lyric matching confidence.** Browsers play podcasts, videos and adverts as well as music.
  Deciding *not* to show lyrics is as important as finding them, and sparse generic metadata makes
  confident matching hard.
- **Artwork and artist-image caching.** Avoiding repeated downloads and preventing flicker when only
  the playback position changes.

## Next

Planned, not started.

- **Native-speaker localization review.** The eleven-locale UI now includes appearance controls,
  rooms, help, onboarding, and the promotional preview. Runtime switching and persistence have
  been checked; translation quality still needs native-speaker review.
- **Broader compact-player verification.** Search, artwork, transport controls, queue navigation,
  and seeking are implemented. Continue testing additional account permissions, media formats,
  and desktop-source takeovers without turning Lucent into a full-screen music app.
- **Lyric provider abstraction.** Lyrics are currently NetEase-specific. Separating "which provider"
  from "how lyrics are timed and rendered" would let other sources be added without touching the
  overlay.
- **Accessibility.** Keyboard navigation through the console, focus visibility, and respecting
  reduced-motion preferences per feature rather than globally.

## Future

Directions we think are right, without committing to them.

- **Provider/plugin architecture** so a player adapter or lyric source can be contributed without
  modifying the core.
- **Broader Windows player compatibility**, driven by real compatibility reports rather than
  guesswork.
- **Performance work** on the overlay's effect pipeline, so heavy decorative effects stay cheap on
  low-end machines.
- **Packaging and updater reliability**, including clearer failure reporting when an update cannot be
  applied.
- **Wider test coverage** of the Electron layer, which is currently covered mostly by source-level
  assertions and manual smoke scripts.

---

## Not planned

Being explicit saves everyone time.

- **macOS and Linux.** Lucent is built on Windows media-session APIs. Porting is not a
  configuration change; it is a different media integration and is out of scope.
- **Audio streaming between room members.** Rooms synchronize the lyric timeline and playback state
  only. Streaming audio would change the bandwidth profile and the licensing position entirely.
- **Bundling an unlicensed music service.** Packaging deliberately refuses to produce an official
  build without the required release signals, and that safeguard is not going away.
