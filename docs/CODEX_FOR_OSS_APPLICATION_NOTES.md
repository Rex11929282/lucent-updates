# Codex for Open Source — Application Notes

Maintainer-facing working notes for preparing an application. This is not marketing copy, and it is
not a claim that any application has been accepted.

**Do not submit metrics from this file without checking them on the day of submission.** Every number
below is marked TODO precisely because it changes and must not be guessed.

---

## Project

**Lucent** — an open-source Windows desktop lyrics overlay and media-session integration project.

## Repository

`TODO: fill with the current official public source repository URL before submission`

Note: if the repository is still named after an update feed rather than the project, see the
"Repository presentation" section below before applying.

## Maintainer role

Primary Maintainer.

## Current verifiable metrics

Fill each of these from the GitHub UI or API on submission day. Do not estimate.

| Metric | Value |
| --- | --- |
| Stars | `TODO: fill with current verified metric before submission` |
| Forks | `TODO: fill with current verified metric before submission` |
| Contributors | `TODO: fill with current verified metric before submission` |
| Releases published | `TODO: fill with current verified metric before submission` |
| Release asset download count | `TODO: fill with current verified metric before submission` |
| Open / closed issues | `TODO: fill with current verified metric before submission` |
| Pull requests | `TODO: fill with current verified metric before submission` |
| Commit activity (last 90 days) | `TODO: fill with current verified metric before submission` |

If a number is small, leave it small. Inflated or invented metrics are both dishonest and trivially
checkable by a reviewer.

---

## Draft answers

Each draft is written to stay under 500 characters. Re-count after any edit.

### Why does this repository qualify?

> Lucent is an actively maintained open-source Windows desktop app and a reusable media-session
> integration layer. It scans every Windows media session, arbitrates which is genuinely playing,
> and normalizes NetEase, Spotify, YouTube Music and generic players into one playback state that
> drives synchronized lyrics and artwork. I handle releases, issue triage, security policy and CI
> directly. The cross-player abstraction is useful to other Electron/Windows projects, not just this
> one.

*(485 characters, counted as a single joined paragraph)*

### How will you use API credits?

> For OSS maintenance automation rather than writing features: issue triage and duplicate detection,
> pull-request first-pass review, drafting regression tests from reproductions, analysing
> player-compatibility reports, generating release notes and verifying changelog accuracy,
> localization consistency checks, and security-sensitive review of Electron IPC, media-session
> handling, room networking and updater code. Lucent's runtime has no AI dependency and end users
> never supply an API key.

*(490 characters, counted as a single joined paragraph)*

### Anything else we should know?

> I am the primary maintainer and develop Lucent actively. It targets an area with little open-source
> coverage: cross-player media-state integration on Windows, where each player reports differently
> and correctness depends on real compatibility reports. Current priorities are broader player
> support, lyric-matching confidence, and internationalization. I maintain CI, a security policy,
> issue and PR templates, and contributor documentation to keep contribution practical.

*(471 characters, counted as a single joined paragraph)*

---

## Repository presentation

Section 42 of the task brief flags a real risk: if the repository still reads as an update feed or a
release-storage repo, a reviewer will read it that way.

Checklist before applying:

- [ ] The repository presents itself as the main Lucent source repository, not an updates mirror
- [ ] Description mentions Windows, desktop lyrics overlay, media-session detection, synchronized
      lyrics, and open source
- [ ] Topics configured (see below)
- [ ] GitHub detects the MIT license
- [ ] README has real screenshots, not mockups

### Suggested description

> Open-source Windows desktop lyrics overlay with automatic media-session detection — synchronizes
> lyrics across NetEase, Spotify, YouTube Music and other players.

### Suggested topics

Only topics that genuinely match:

```
lyrics  desktop-lyrics  windows  electron  react  music
spotify  youtube-music  netease-cloud-music
media-session  smtc  gsmtc  karaoke  overlay  open-source
```

### Homepage

Leave empty. There is no official website or docs site, and inventing one is worse than an empty
field.

### If renaming the repository

A rename is only safe after checking updater dependencies:

1. `electron-builder.config.factory.cjs` reads `LUCENT_UPDATE_REPOSITORY` to derive the publish
   `owner`/`repo`. Confirm what value is used in the release environment.
2. GitHub redirects the old repository path after a rename, so existing installs generally keep
   working — but the redirect is a courtesy, not a guarantee. Verify an update actually completes
   from an already-installed build before relying on it.
3. Update `LUCENT_UPDATE_REPOSITORY` in the release environment to the new path.
4. Do not rewrite remote history for presentation. Losing release history to look tidier is a net
   loss.

**Manual step:** renaming happens in GitHub repository settings; it cannot be done from this
repository's code.

---

## Honesty constraints

Recorded here so they are not quietly forgotten under submission pressure:

- No purchased, traded, or self-generated stars, downloads, or contributors
- No fabricated issues, pull requests, or discussion activity
- No invented users, partners, or install counts
- No OpenAI API dependency forced into Lucent's runtime to strengthen an application
- No claim of OpenAI sponsorship, endorsement, or acceptance

If the project's usage numbers are modest, the application should rest on technical substance and
maintenance evidence instead.
