# Security Policy

## Maintenance

Lucent is maintained by a single maintainer. There is no security team and no guaranteed response
window. Reports are handled on a best-effort basis, and that is stated plainly here rather than
implied otherwise.

## Supported versions

Only the latest released version receives fixes. Older releases are not patched — please update
before reporting.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository (Security → Report a
vulnerability). That keeps the report private until a fix is available.

Please do **not** open a public issue for an unfixed, high-impact vulnerability. Coordinate first so
users are not exposed before a release exists.

A useful report includes:

- Lucent version and Windows version
- What an attacker can achieve, not just what looks wrong
- Reproduction steps, and a proof of concept if you have one

## Security boundaries

If you are reviewing Lucent, these are the places where trust changes hands:

**Electron main process, preload, and IPC.** The renderer is not trusted to be correct. Everything
crossing `contextBridge` is an API boundary: preload exposes a fixed surface rather than raw
`ipcRenderer`, and main-process handlers validate their arguments instead of assuming the renderer
sent something sensible.

**External metadata, artwork, and lyrics.** Titles, artists, album names, cover URLs, and lyric text
all come from third parties or from other applications' media sessions. They are untrusted input:
they are never treated as markup, never used to build file paths, and never executed.

**Room networking.** The LAN room protocol accepts connections from other machines. Every inbound
message is validated, room commands are capability-checked against what the host granted, and a
member cannot execute host-only operations by sending a crafted message. Room traffic is plaintext
on the local network — it carries lyric timing and playback state, not credentials.

**Credentials.** NetEase sign-in is optional. When used, the credential is encrypted through the OS
credential facilities and stays on the machine. It is never logged, never sent to the room, and never
written to the settings file.

**Updater and release artifacts.** The updater is supply-chain sensitive. Releases are served over
HTTPS, and packaging refuses to produce an official-looking build without the required release
signals. If you find a way to make Lucent install an artifact it should not trust, treat that as
high severity.

## Out of scope

- Vulnerabilities in third-party music services themselves
- Issues that require an attacker to already have administrative access to the machine
- Missing hardening that has no demonstrated impact
