# GitHub settings to apply by hand

The repository is already public and its description is applied through GitHub. The remaining
blocks are ready for the maintainer to apply where useful.

---

## Repository description

Paste into Settings → General → Description (350 char limit; this is 138):

```
Liquid-glass desktop lyrics for Windows. Detects whatever is actually playing — NetEase, Spotify, YouTube Music — and syncs lyrics over your desktop.
```

## Topics

Paste into the repository home page → ⚙ next to About → Topics:

```
electron
windows
lyrics
desktop-widget
music
overlay
smtc
netease-cloud-music
spotify
youtube-music
react
liquid-glass
```

## Homepage

Leave **empty**. There is no project website, and pointing it at the repo itself adds nothing.

---

## Toggles

| Setting | Value | Why |
| --- | --- | --- |
| Visibility | **Public** | Required for a Codex for Open Source application |
| Issues | **On** | `SUPPORT.md` and the issue templates assume it |
| Discussions | **On** | Keeps usage questions out of the bug tracker |
| Private vulnerability reporting | **On** | Settings → Security. `SECURITY.md` tells people to use it; leaving it off makes that instruction a dead end |
| Wiki | Off | Documentation lives in `docs/`, two places will drift |
| Projects | Off | Single maintainer |

## Branch protection on `main`

Not strictly required for a solo repo, but cheap and it makes CI meaningful:

- Require a pull request before merging: **on**
- Require status checks to pass: **on**, select the `CI` workflow once it has run at least once
- Allow the administrator to bypass: **on** (otherwise a solo maintainer locks themselves out)

---

## Repository name

Keep `Rex11929282/lucent-updates`. It is now the single public source and Release repository, and
already-installed clients use this exact path as their update endpoint.

---

## Order to do this in

1. Set topics
2. Turn on Issues, Discussions and private vulnerability reporting
3. Open a pull request so the CI workflow runs for the first time
4. Only once CI is green, add branch protection and consider a CI badge in the README —
   a badge for a workflow that has never run is worse than no badge
