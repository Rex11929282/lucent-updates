# Playback and localization checkpoint — 2026-08-31

Scope: continue the existing development checkout's in-app playback and incomplete localization
repairs. Version remains **1.0.3**. No installer was built or published; GitHub visibility and licensing
were not changed. Existing user configuration and credentials were not modified.

## Confirmed defects and changes

- `src/AudioService.jsx`: a rejected old `audio.play()` promise used the newest song revision when
  reporting its error. Buffering followed by pause or a quick replacement triggered a false source
  retry/loading state. Each attempt now keeps its own revision and cancellation token. Stale and
  deliberately aborted requests cannot fail the new track.
- `shared/internalPlayerState.cjs`: a load failure stopped playback but retained the provisional
  loading title. Error handling now clears only provisional song data. Ready metadata and lyrics
  are preserved for genuine decoder/source retries.
- `src/ConsoleWindow.jsx`: loading titles on the home page and status rail now use the active
  language. The complete `good`, `wow`, and `game good` snapshots replace the five legacy partial
  quick presets. Personal profiles, random appearance, and material presets remain intact.
- `src/locales/console-overrides.json`: supplied six missing strings in all eleven locales:
  promotional preview label/title/lyrics/translation, pixel-cat accessibility label, and untitled
  song fallback. Track metadata is not translated.
- `src/ConsoleWindow.jsx`: close failures now use the active runtime error localizer and retain a
  translated fallback when the main process returns no error detail. Empty appearance profile names
  now use the active locale's default profile name.
- `tests/electronAudioPlaybackSmoke.cjs` and `package.json`: a repeatable isolated runtime check is
  available as `npm run test:audio:runtime`. State and localization regressions were updated for the
  intended behavior; the brand name is deliberately not translated.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm test` | PASS: 131 pretest + 513 main test executions, no failures |
| `npm run build` | PASS: Vite production bundle; existing large-chunk warning remains |
| `npm run test:audio:runtime` | PASS: nonzero local/HTTP analyser output, no false retry or loading state after cancellation |
| Literal translation-key audit | PASS: 615 UI keys resolve without fallback in all eleven locales |
| Real Electron console | PASS: six pages in each locale, real pointer navigation, no stray Chinese UI text in non-CJK locales |
| Preview and quick presets | PASS: localized promotional text stays inside preview; exactly three quick-preset buttons; all three apply cfg and glass values |
| Persistence | PASS: selected locale and preset parameters present in the isolated config after quit |
| Live NetEase search and audio | PASS: current account session, song ID 64093, duration 271227 ms, actual nonzero analyser signal |
| Live lyric seek and pause | PASS: 38 word-timed lines; paused seeks to 73310 ms and 34890 ms render the corresponding lyrics; reported position error 0 ms at each check |
| Pause and resume | PASS: lyric remains unchanged and position drift is 0 ms over the 700 ms paused sample; playback resumes |
| Loading localization in live path | PASS: English loading label on both home and status rail, no fixed Chinese loading title |
| Close/profile localization regressions | PASS: returned close errors are localized, missing profile names use the active locale |

The 0 ms measurements compare Lucent's displayed state with the requested internal-player seek
position. They are not a claim of zero device-output latency, network latency, or perfect alignment
for every song.

Runtime artifacts are local-only under `.qa-artifacts/`:

- `2026-08-31-console-audit.json`
- `2026-08-31-console-en-US.png`
- `2026-08-31-console-zh-TW.png`
- `2026-08-31-console-de-DE.png`
- `2026-08-31-network-playback.json`

The network check used an isolated copy of Lucent's encrypted login data and its matching Chromium
Local State on the same Windows account. No tokens or personal account details were logged. An
initial test copied only the encrypted credential and could not load that session; that harness
failure must not be misreported as an expired user login. Matching encryption metadata restored
the test session without changing the original files. Temporary copies were removed afterward.

## Remaining boundaries

- This batch verifies internal playback, not live NetEase desktop mirroring or cross-computer LAN
  latency. Automated regressions still run for those paths.
- One real track and controlled HTTP fixtures do not cover every account entitlement, format,
  network failure, or song. Provider-denied audio remains unavailable; no permissions are bypassed.
- Native-speaker translation review, clean-machine installation, signed release/update validation,
  version selection, and repository visibility decisions remain separate maintainer work.
- Existing maintainer/OSS planning documents are not proof of current GitHub settings or successful
  remote CI. This checkpoint does not authorize publishing source or changing licensing.
