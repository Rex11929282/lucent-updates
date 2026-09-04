# Manual checklist for the maintainer

The remaining unchecked items require the repository owner or a real user environment. Repository
settings and automated checks that could be completed safely have already been applied.

The repository is public and its v1.1.1 binary release is published in the same repository after
local verification. Legal-name and remaining community settings are still maintainer decisions.

---

## Decisions still open

- [x] **Version number — set to `1.1.1`.** The brief asked for `1.0.0`, but published builds already
      reach `1.0.3` and electron-updater never moves a user backwards, so `1.0.0` would strand every
      existing install on an unmaintained version. `1.1.1` is a patch release of the first documented
      version and ensures existing `1.1.0` installs can receive the update. `package.json` and the
      `CHANGELOG.md` heading are updated together. The v1.1.1 release is now published.
- [ ] **License copyright holder.** `LICENSE` reads `Copyright (c) 2026 Rex11929282`, taken from the
      repository URL. This is the one item nobody but you can decide: replace it with your legal name
      if you want the copyright to be enforceable under it, or keep the handle if you prefer not to
      publish your name. Both are valid; the handle is not a placeholder to be fixed.
- [ ] **Native review of translations.** The eleven locales were machine-written. A mechanical audit
      has been run and is clean: **zero placeholder mismatches** across all 702 keys (a dropped
      `{count}` is the defect that actually breaks a string), zero length outliers that would overflow
      a control, and no untranslated leftovers. That checks the machinery, not the *wording* — a
      native speaker is still the only way to catch text that is correct but reads oddly. Worth doing
      before promoting multilingual support as a headline feature.

## GitHub repository settings

**Everything in this section is now written out ready to paste in
`docs/GITHUB_SETTINGS_TO_APPLY.md`**, including the description, the topic list, which toggles to
turn on, and the order to do them in. The list below is the tick-box version.

- [x] Repository is **Public**
- [ ] Your GitHub **profile is public**
- [x] **Description** set — current value is recorded in `docs/GITHUB_SETTINGS_TO_APPLY.md`
- [x] **Topics** configured — current list is recorded in the same file
- [x] **Homepage** left empty (there is no real site; do not invent one)
- [x] GitHub shows **MIT** in the sidebar (confirmed through the repository API)
- [x] **Issues** enabled
- [x] **Discussions** enabled, if you want usage questions separated from bugs
- [x] **Private vulnerability reporting** enabled (Settings → Security), since `SECURITY.md` tells
      people to use it — if it is off, that instruction is broken
- [x] Source and update assets use one repository at `Rex11929282/lucent-updates`; keep this path
      stable because installed clients use it as their update endpoint.

## CI and automation

- [x] Confirm the **CI workflow actually runs and passes** on the Windows runner
- [x] Confirm **CodeQL** completes and reports into the Security tab
- [x] Confirm **Dependabot security updates** is enabled for the repository
- [x] CI badge added to the README after CI became green

## Release

- [x] Decide the version, then update `package.json` and the `CHANGELOG.md` heading together
- [x] `npm test` and `npm run build` pass locally
- [x] Set the release signals your environment needs, then `npm run release:check`
- [x] `npm run dist`
- [x] Publish with release notes covering Highlights / Added / Fixed / Compatibility / Known issues /
      Install notes
- [x] Confirm `latest.yml`, the `.exe` and the `.blockmap` are all attached — removing or renaming
      any of them breaks auto update for existing installs
- [ ] Install the published artifact on a clean machine and confirm it runs
      A same-machine fresh-prefix smoke test passed with the locally built `Lucent-Setup-1.1.1.exe`; this does not replace the clean-machine check.

## README screenshots

Real screenshots, not mockups. Five have been captured from the running application and are in the
session scratchpad — copy the ones you want into `docs/screenshots/` and reference them from the
README. They are deliberately **not** committed, because one of them contained a real LAN address.

- [x] The control console (home page) — `console-home.png`, publishable as-is
- [x] The appearance page with the live preview — `console-appearance.png`, publishable as-is
- [x] The playback page — `console-play.png`, publishable as-is
- [x] The software settings page showing the language list — `console-settings.png`, publishable as-is
- [x] The room page — use **`console-room-redacted.png`**, not the original. The original showed the
      real LAN address twice plus the network adapter name; the redacted copy replaces both with a
      generic `192.168.1.23` / `Ethernet` placeholder. Do not publish the unredacted file.
- [ ] The desktop capsule showing synchronized lyrics over a real desktop — **still to do, by you.**
      This one cannot be automated: the capsule is a transparent, GPU-composited always-on-top window,
      so DevTools screenshots come back blank, and the app's own `capturePill` deliberately captures
      the desktop *behind* the pill to feed the glass refraction. An OS-level capture of the capsule
      rectangle works, but it photographs whatever else is on your desktop at that moment. Take it
      yourself with Win+Shift+S over a background you are happy to publish.
- [ ] Detection working with Spotify or YouTube Music — needs one of those apps playing

A short demo GIF or video can follow later.

## Before submitting a Codex for Open Source application

- [ ] Fill every `TODO` metric in `docs/CODEX_FOR_OSS_APPLICATION_NOTES.md` with numbers read from
      GitHub **on the day you submit**. Do not estimate.
- [ ] Re-read `docs/OSS_READINESS_REVIEW.md` and confirm the ratings still match reality
- [ ] Confirm your OpenAI account email is correct
- [ ] Have your OpenAI Organization ID to hand
- [ ] Select **Primary Maintainer**
- [ ] Decide whether to request Codex Security review access
- [ ] Decide the API credit amount to request
- [ ] Check the three draft answers still fit the character limit after any edits

Two things worth being clear-eyed about before submitting: community and usage evidence are currently
**Weak**, and no amount of additional documentation changes that. If you would rather apply from a
stronger position, publish the release and let real usage accumulate first.

Do not fabricate stars, downloads, contributors, issues, or users to compensate. It is checkable, and
being caught is far worse than a modest set of real numbers.
