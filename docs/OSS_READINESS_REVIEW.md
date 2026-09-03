# Codex for Open Source — Readiness Review

An honest assessment of where this repository stands. Ratings are **Strong / Medium / Weak**, and a
Weak rating names exactly what is missing rather than softening it.

Reviewed against the state of the repository at the time of writing. Re-check before submitting;
several items depend on GitHub-side settings that cannot be verified from the source tree.

---

## Repository clarity — **Medium**

The code is organised so intent is legible: pure logic in `shared/`, Electron-specific code in
`electron/`, UI in `src/`. Module names describe responsibilities (`activeSessionResolver`,
`playbackCoordinator`, `internalPlayerState`). A reviewer can follow the data path without guessing.

**What is missing:** the repository is still named after an update feed rather than the project, and
the GitHub description and topics are unset. A reviewer landing on the repo page would see release
storage, not a product. That is a settings change, not a code change — see the manual checklist.

## Open-source hygiene — **Strong**

MIT license, contributing guide, security policy, code of conduct, support guide, changelog and
roadmap are all present and project-specific rather than boilerplate. The roadmap states what is
explicitly *not* planned, with reasons.

No AI system is credited as contributor, co-author or maintainer anywhere in the repository.

## Documentation — **Strong**

`docs/ARCHITECTURE.md` explains the process model, playback arbitration, the two lyric paths, rooms,
settings migration and the test strategy. `docs/PLAYER_INTEGRATION.md` documents the normalized
playback contract and gives a four-step path to adding a player adapter.

Both explain *why* — including why source-level assertions exist and why programmatic clicks are not
acceptable UI verification. That is the kind of context that saves a contributor hours.

**Minor gap:** no screenshots yet, so the README describes the UI without showing it.

## CI / tests — **Strong**

731 tests (156 + 575 across the two suites) run on every pull request and push to `main`, on a
Windows runner because the release
preflight and several tests assert Windows-specific behaviour. `npm test` and `npm run build` both
gate. No external test framework and no network access required, so the suite is reproducible.

Coverage is genuinely load-bearing: several tests exist specifically because the bug they describe
already shipped once (settings loss on quit, buttons unclickable inside 3D cards, a blank console
from a null room state).

**Caveat:** the Electron layer is covered mostly by source-level assertions and manual smoke scripts
rather than end-to-end automation. That is stated in the architecture doc rather than hidden.

The suite intentionally combines runtime-oriented unit tests with source-level wiring assertions.
The latter pin contracts, but do not replace launching Electron or exercising a real input path.
Three shipped bugs went through that gap in a single day: a `require()` of a path that did not exist
(the app could not start at all), a `Set` passed to a function calling `.some()` (media detection
threw on every poll), and locale detection reading the Windows region format instead of the display
language. The whole suite was green for all three.

Two guards now close the worst of it — `tests/mainModuleResolution.test.cjs` resolves and loads every
main-process module, and `tests/backendMessageCoverage.test.mjs` fails when a backend message has no
translation path. The matching runtime probes are documented in `docs/MAINTAINER_WORKFLOW.md` and
are run separately from the headline test count.

## Security — **Medium**

`SECURITY.md` names the real trust boundaries: the preload/IPC surface, untrusted external metadata,
room networking, credential storage and the updater. Private vulnerability reporting is the stated
channel. CodeQL runs weekly and on every PR; Dependabot is configured monthly and grouped, with
Electron majors deliberately excluded from automated bumps.

The room protocol boundary **has** now been adversarially tested, and it failed the first attempt.
`JSON.parse` accepts `null`, numbers, strings, booleans and arrays — not just objects — and both
socket handlers read `.type` off the result immediately. Sending the four bytes `null` to the room
port raised a `TypeError` that wedged the entire main process: the room stopped serving, new peers
could not connect, DevTools stopped responding, and **nothing was written to stderr**. Any device on
the same LAN could do it, and because the member side had the identical pattern, a malicious host
could wedge every member. Both handlers now reject any non-object document before reading a field
(`tests/roomMessageHardening.test.cjs`).

The preload/IPC surface was tested next and **held**. `npm run test:ipc-fuzz:runtime` drives 42 bridge
calls with arguments no correct caller would pass — `null` patches, string coordinates, `NaN` sizes,
missing payloads — and checks after each one that the main process still answers. Result: 37 resolved,
5 rejected cleanly as `Error invoking remote method`, **0 wedged**. The difference from the room bug is
structural: `ipcMain.handle` wraps its handler in a promise, so a throw becomes a rejection the
renderer sees, whereas the raw socket handler had nothing catching it.

Credential storage was audited next and **held**. The NetEase cookie is encrypted at rest through
`safeStorage`, written atomically (temp file then rename), and there is no plaintext fallback on save —
`writeEncrypted` throws instead. A legacy plaintext cookie is migrated and then deleted. The value is
never returned to the renderer (`netease:loginCheck` deliberately strips it), never placed in shared
state, never broadcast to a room, and neither `netease.cjs` nor `privacyService.cjs` contains a single
logging call. Clearing the account removes the encrypted file, its temp file, and the legacy file.

The updater **held on its trust boundary and failed on disclosure**. The feed is never set at runtime —
`feedUrl` is always empty and the source comes only from the `app-update.yml` bundled inside the signed
installer, so nothing at runtime can redirect where an update is fetched from. But update errors are
shown in the UI and the issue templates ask reporters to paste them into public issues, and the
redaction covered only `X:\` paths. `file:///C:/Users/<name>/…` URLs, forward-slash paths and UNC
shares all reached the screen intact, carrying the Windows account name. Redaction now covers every
path form, while leaving path-free messages readable (`tests/updateErrorRedaction.test.cjs`).

One gap was introduced by this session's own work and then closed: corrupt-settings backups hold the
same personal data as the settings file, so "erase my settings" now removes them too. A recovery
feature that quietly defeats a privacy feature is worse than no recovery feature.

Untrusted external metadata — song titles, artists and artwork URLs from NetEase or from another
machine in a room — **held**. There is no `dangerouslySetInnerHTML`, `innerHTML`, `document.write`,
`eval` or `new Function` anywhere in `src/`, so text cannot become markup. Artwork URLs are
interpolated into a CSS custom property, which sounded like an injection until it was tested against a
live window: React assigns styles through `element.style.setProperty`, and CSSOM rejects a value with
unbalanced quotes or parens outright. `url("x"),red;background:url("http://…` was dropped, storing
nothing and creating no extra declaration. `javascript:` and `data:` URLs are accepted as values but
neither executes — a `javascript:` URL does nothing in `url()`, and SVG loaded through CSS runs in
secure static mode with scripting disabled.

That safety depends entirely on styles being set through CSSOM rather than assembled as a stylesheet
string, so `tests/externalMetadataSafety.test.mjs` pins the property rather than the symptom.

A second pass over the room protocol looked at abuse rather than malformed input, and found nothing
further. Command replay is deduplicated by `commandId` (bounded at 500 entries), song requests are
limited to three per ten seconds per member with a five-request pending ceiling, and every other
command type requires a capability the host has to grant — members get only `song.request` by default.
`clock-ping` has no rate limit and looked like an amplification vector, so it was measured: a member
sending **134,094 pings in six seconds (~22k/s), all answered**, moved main-process latency not at all
(1–2 ms before, during and after). Worth re-checking on weaker hardware or with many members, but it
is not a defect today.

**What is missing:** no full security review has been performed, and the boundaries above were probed
rather than formally analysed. Two of the seven checks found real defects, and both were found by
probing rather than by reading the code — which is the honest argument for treating anything unprobed
as unproven.

It is worth recording that the probes also went the *other* way twice. The CSS interpolation of an
untrusted artwork URL and the unthrottled `clock-ping` both looked like defects on the page and both
survived measurement. Reading alone produces false positives as readily as false negatives; only the
probe settled either one.

## Release management — **Medium**

Packaging is gated by a preflight that refuses to produce an official-looking build without the
required release signals, which is a real safeguard rather than a formality. Artifact naming is
stable and the updater contract (`latest.yml`, `.exe`, `.blockmap`) is documented.

**What is still missing:** the version decision is resolved at **1.1.0**. The task brief called for
1.0.0 as a first official release, but published versions already reach 1.0.3, and shipping 1.0.0
would stop auto-update for existing installs. A public v1.1.0 binary release is now cut from the
current documentation and changelog; the installer is unsigned and clean-machine install/update
verification remains a maintainer check.

## Maintainer evidence — **Medium**

There is a documented maintenance loop (`docs/MAINTAINER_WORKFLOW.md`), issue templates that ask for
the specific data a compatibility report needs, and a PR template with a regression-risk section.
Commit activity is real and recent.

**What is missing:** the loop is documented but not yet demonstrated — there is no history of triaged
issues or reviewed external pull requests to point at, because there have not been any.

## Community evidence — **Weak**

There are no external contributors, no issues filed by other people, and no discussions. Nothing has
been fabricated to hide this.

This is the honest position for a project that has not been publicly promoted yet. It improves only
through real usage; there is no shortcut that is not also dishonest.

## Usage evidence — **Weak**

Stars, forks and download counts are low or unverified. They are deliberately left as TODO in the
application notes rather than estimated.

If the application is submitted now, it should rest on technical substance and maintenance quality,
not on usage numbers.

## Ecosystem importance — **Strong**

Cross-player media-state integration on Windows is genuinely under-served in open source. The
normalization layer — scan every media session, arbitrate which is actually active, reduce NetEase,
Spotify, YouTube Music and unknown players to one playback state — is reusable well beyond a lyrics
overlay, and is documented as a contract rather than buried in UI code.

The project also demonstrates a workable Electron overlay architecture: a transparent always-on-top
window with click-through, a separate console process, and shared state through a validated IPC
bridge.

---

## Summary

| Area | Rating |
| --- | --- |
| Repository clarity | Medium |
| Open-source hygiene | Strong |
| Documentation | Strong |
| CI / tests | Strong |
| Security | Medium |
| Release management | Medium |
| Maintainer evidence | Medium |
| Community evidence | **Weak** |
| Usage evidence | **Weak** |
| Ecosystem importance | Strong |

The engineering and documentation are in good shape. The weaknesses are all *social* — no community
and no usage yet — and those cannot be fixed by writing more code or more Markdown. They change only
by publishing the project and letting real users find it.

The highest-value remaining actions are therefore not in this repository: rename and describe the
repo so it reads as a product, add real screenshots, and cut a release people can actually install.
