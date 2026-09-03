# Player Integration

How Lucent turns "some app is playing music on Windows" into synchronized lyrics, and how to add
support for another player.

## The contract

Every player is reduced to the same normalized state before anything else happens:

```js
{
  sessionId,
  source,          // stable internal ID, e.g. 'desktop-spotify'
  sourceAppId,     // Windows SourceAppUserModelId

  title,
  artist,
  albumArtist,
  album,

  coverUrl,
  artistImageUrl,

  duration,
  position,
  playing,
  paused,

  confidence       // how sure we are this is music worth matching lyrics to
}
```

Downstream code — lyric resolution, artwork, the overlay — consumes only this. It never branches on
which player produced it. That is the whole point of the abstraction: adding a player must not
require touching the lyric or rendering code.

```
Player-specific detection
        |
NormalizedPlaybackState
        |
Shared lyrics / artwork / UI pipeline
```

## Where each piece lives

| Concern | Module |
| --- | --- |
| Reading Windows media sessions | `electron/smtc.cjs` |
| Normalizing raw session data | `shared/mediaSession.cjs` |
| Deciding which session is really active | `shared/activeSessionResolver.cjs` |
| Mapping a session to a stable source ID | `shared/playbackSource.cjs` |
| Arbitrating between sources | `shared/playbackCoordinator.cjs` |
| Whether the internal player may act | `shared/playerPolicy.cjs` |

## The four supported shapes

**NetEase Cloud Music** has two routes. Its Windows media session provides metadata and position
like any other player. Additionally, when the NetEase desktop app is running with its lyrics page
open, `electron/ncmcdp.cjs` attaches over the Chrome DevTools Protocol and mirrors the line the app
is highlighting. Mirroring is preferred when available because it is the app's own answer rather than
a reconstruction, but it depends on that app's markup and falls back to timeline sync when it breaks.

**Spotify** is a plain media-session consumer. The Spotify desktop app reports title, artist, album,
playback state, position, duration and a thumbnail. Lucent normalizes those and runs the shared lyric
pipeline — the same one NetEase timeline sync uses.

**YouTube Music** is harder, because it usually does not identify itself. A browser session reports
as Chrome, Edge, msedge or Chromium rather than as YouTube Music, so detection combines the source
app with metadata shape rather than trusting the app ID alone. When the combination is reliable
enough, the source becomes `desktop-youtube-music`; otherwise it stays generic.

**Generic players** are anything else exposing enough metadata. They get `desktop-generic` and are
treated normally: metadata and artwork are displayed, and lyrics are attempted. If confidence is too
low, media information is still shown but no lyrics are forced — a podcast should not get song lyrics
stapled to it.

## Music vs non-music

Browsers also play podcasts, videos, streams and adverts. Lucent scores confidence from artist and
album availability, whether the app is a known music source, metadata shape, and how well a lyric
provider result matches on title, artist and duration.

Low confidence means "show what is playing, do not guess lyrics". Showing obviously wrong lyrics is
worse than showing none.

## Track identity

Lyrics reload on track change, not on position change. Identity is derived from normalized title,
normalized artist, normalized album and a duration bucket — never from title alone, which collides
constantly across covers and live versions.

A position update must never look like a track change. If it does, artwork refetches, transitions
replay, and lyrics restart — the flicker bugs all trace back to identity being computed too loosely.

Title normalization has to be careful. Suffixes like `Remastered`, `Official Video`, `Live`, `feat.`
and bracketed annotations are noise for matching, but stripping brackets aggressively breaks songs
whose real titles contain them.

## Adding a player

1. **Recognise it.** Extend `desktopSourceId()` in `shared/playbackSource.cjs` and add a stable
   source ID to `SOURCE`. Existing IDs must never change: they are persisted in settings and sent in
   room messages. UI labels may be localized; IDs may not.

2. **Normalize anything unusual.** If the player reports metadata in an odd shape, handle it in
   `shared/mediaSession.cjs` rather than downstream.

3. **Adjust arbitration if needed.** If the player should be preferred or de-prioritised — for
   example, it keeps a session alive while idle — update
   `shared/activeSessionResolver.cjs`.

4. **Test it.** Add cases covering detection from a realistic session payload, normalization output,
   and arbitration against a competing session. The existing suites in `tests/playbackSource.test.cjs`,
   `tests/mediaSession.test.cjs` and `tests/activeSessionResolver.test.cjs` show the pattern.

You should not need to modify lyric fetching, artwork resolution, or the overlay. If you do, the
abstraction is leaking and that is worth raising in the pull request.

## Reporting a player that does not work

Open a **Player compatibility** issue and include the player's `SourceAppUserModelId` and the
metadata it exposes. Behaviour depends entirely on what that specific app reports to Windows, so
without it a report usually cannot be acted on.
