# GitHub settings record

The single public source/update repository is `Rex11929282/lucent-updates`. Settings that can be
applied safely through the repository API are already applied and should not be duplicated in a
second repository.

---

## Repository description

Current description (350 char limit):

```
璃音 Lucent：Windows 桌面液態玻璃即時歌詞與共同聆聽軟體。
```

## Topics

Current topics:

```
desktop-widget electron liquid-glass lyrics music netease-cloud-music overlay react smtc spotify windows youtube-music
```

## Homepage

Leave **empty**. There is no project website, and pointing it at the repo itself adds nothing.

---

## Toggles

| Setting | Value | Why |
| --- | --- | --- |
| Visibility | **Public** | Applied |
| Issues | **On** | Applied; `SUPPORT.md` and issue templates assume it |
| Discussions | **On** | Applied; keeps usage questions out of the bug tracker |
| Private vulnerability reporting | **On** | Applied; `SECURITY.md` points maintainers here |
| Dependabot security updates | **On** | Applied after enabling vulnerability alerts |
| Wiki | Off | Applied; documentation lives in `docs/` |
| Projects | Off | Applied; this is a single-maintainer repository |

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

## Applied order

1. Set topics and repository description
2. Turn on Issues, Discussions and vulnerability reporting
3. Enable Dependabot security updates
4. Run the Windows CI and CodeQL workflows; both now pass on the main branch
5. Add the CI badge to the README after the first successful run

Branch protection is intentionally not applied: direct maintainer pushes are the current release
workflow. It can be enabled later after a pull-request release process is chosen.
