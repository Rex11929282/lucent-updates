# Final verification

The 43-item checklist from the 1.0.0 task brief, with the evidence for each. Items are marked:

- **Verified** — checked against a running build or a test that would fail if it broke
- **Verified (static)** — checked in the source or a fixture, not exercised at runtime
- **Deviation** — deliberately not done as written; the reason is given
- **Cannot verify here** — needs a published release or GitHub-side state

Nothing is marked verified on the strength of "the test suite is green" alone. Three bugs shipped
behind a green suite in a single day, so where a runtime check exists it was run.

---

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Recent Codex work not reverted | **Verified** | Concurrent changes are present and were built on, not overwritten — `smtcClock.cjs`, `resourceCache`, `activeSessionResolver`, `artworkCache`, and the temporary-profile improvement to the IPC fuzz script |
| 2 | App version exactly `1.0.0` | **Deviation** | Set to **1.1.0**. Published builds already reach 1.0.3 and electron-updater never downgrades, so 1.0.0 would strand every existing install on an unmaintained version. Reason recorded in `CHANGELOG.md` |
| 3 | README is a complete product README | **Verified (static)** | Rewritten in English; still has no screenshots — see the manual checklist |
| 4 | Open-source licence present | **Verified (static)** | MIT `LICENSE`. Copyright holder is the owner's decision, not a placeholder |
| 5 | GitHub auto-update still works | **Verified (published feed)** | v1.1.0 is published with `latest.yml`, the NSIS installer and matching `.blockmap`; the local and remote installer size/SHA-256 match, and the packaged `app-update.yml` points to the same public repository. A clean-machine install/update remains a manual check |
| 6–9 | Quick presets replaced: `good`, `wow`, `game good` | **Verified** | All three visible and applying complete configurations (`tests/quickPresets.test.mjs`) |
| 10 | Room Copy works | **Verified** | Fixed and re-checked with real `Input.dispatchMouseEvent` hit testing, not `element.click()` |
| 11 | Search input readable | **Verified** | Was 30px wide because `.btn { width: 100% }` met `flex: none`; fixed and swept |
| 12 | Internal player shows lyrics | **Verified** | Live: `稻香 · Lucky小爱` with lyrics advancing 0:57 → 1:07. Root cause was a frozen renderer, not the backend |
| 13 | NetEase detection | **Verified** | Live: `cloudmusic.exe [Playing]` detected and followed |
| 14 | Spotify detection | **Verified (static)** | `tests/mediaSpecConformance.test.cjs` §11. No Spotify installed to exercise |
| 15 | YouTube Music detection | **Verified (static)** | Same test — inferred from `chrome.exe` *and* `msedge.exe` sessions, since a browser does not announce itself |
| 16 | Generic player normalization | **Verified (static)** | `foobar2000.exe` → `desktop-generic` |
| 17 | Active session switching | **Verified (static)** | Spotify pauses, YouTube Music starts, arbitration follows |
| 18 | Cover extraction | **Verified (static)** | SMTC thumbnail lands in `cover`, never mislabelled as an artist image |
| 19 | Artist avatar | **Verified (static)** | Fallback order: provider image → song artwork → Lucent default |
| 20 | Image cache | **Verified (static)** | `src/artworkCache.js` + `shared/resourceCache.cjs`, both tested; bounded LRU with a generation guard |
| 21 | Position updates cause no artwork flicker | **Verified (static)** | A moved playhead and duration jitter do not change `TrackIdentity` |
| 22 | Player UI behaves like a real player | **Verified** | Live: transport, queue, seek bar, source label, artwork |
| 23 | Pause / resume | **Verified** | Live: a paused clock does not drift; resume continues from the pause point |
| 24 | Seek | **Verified** | Live forward and backward, plus `tests/seekBehaviour.test.mjs` |
| 25 | Previous / next | **Verified** | Live, with a real queue. Found and fixed a footgun: a queue of bare ids normalized to an *empty* queue, silently disabling both buttons |
| 26 | Track switch | **Verified** | Live |
| 27 | Source switch | **Verified (static)** | Conformance test §9 |
| 28 | Old lyrics do not remain | **Verified** | Live — this was the actual section 7 bug |
| 29 | First lyric line does not repeat forever | **Verified** | A position before the first timestamp shows no line rather than pinning line one |
| 30 | No competing playback-position timers | **Verified (static)** | One accessor (`estPosMs` → `clkPos`), one coordinator (`playback.updateClock`), one 250 ms poll |
| 31 | i18n works | **Verified** | Live switching across five languages |
| 32–36 | zh-TW, zh-CN, en, ja, ko | **Verified** | Rendered and inspected; no missing-glyph boxes in CJK or Cyrillic |
| 37 | Long-language layout | **Verified — two defects found and fixed** | An automated sweep over 25 page × locale combinations reported zero problems. Screenshots in Russian and Japanese showed a label colliding with its own hint (`Язык интерфейсаИзменения…`) and clipped dropdowns (`Полностью (ходит`). Both fixed; `tests/longLanguageLayout.test.mjs` |
| 38 | Language selection persists | **Verified** | Written to config and restored on relaunch |
| 39 | No large amounts of hard-coded UI strings | **Verified** | 115 CJK literals remain in `src/`, all data defaults the translator overrides. Confirmed on screen: the Japanese appearance page shows no Chinese |
| 40 | No AI contributor / co-author metadata | **Verified** | No `Co-Authored-By` trailers; no AI credited as author, contributor, maintainer or copyright holder. The five markdown mentions are about the Codex for Open Source *programme*, plus one line stating the maintainer may use such a tool |
| 41 | `npm test` passes | **Verified** | 731 tests across two suites (156 + 575) |
| 42 | `npm run build` passes | **Verified** | Clean |
| 43 | Release check passes | **Verified** | `npm run release:check` passes with `LUCENT_UPDATE_REPOSITORY=Rex11929282/lucent-updates` and the stable channel; it still refuses an official build when those signals are absent |
| 44 | Source/update repository split | **Verified** | `lucent-source` is private; public `lucent-updates` contains only README and the v1.1.0 installer, blockmap and `latest.yml`; the packaged feed URL is unchanged |

---

## What this checklist cannot tell you

The published feed and package wiring for auto-update (#5) are verified. A clean-machine install /
update and the repository settings that `docs/GITHUB_SETTINGS_TO_APPLY.md` covers still require
owner-side confirmation.

Spotify and YouTube Music detection (#14, #15) are verified against the normalization layer with
realistic session shapes, not against those applications running. The logic is exercised; the
integration is not. If either app is installed, playing a track and watching the source label is a
five-second confirmation worth doing before release.
