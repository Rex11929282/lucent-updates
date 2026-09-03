# Bottom-Center Song Title Layout Design

## Goal

Make the existing `下中` song-name position a dedicated bottom row inside the lyric pill. It must never overlap the progress bar or playback time.

## Context

The current `name-bc` layout reverses the complete content column. The song title, progress bar, and time therefore compete for the same bottom area. The screenshot confirms playback time is obscured.

## Alternatives considered

1. **Dedicated three-row layout — selected.** Lyrics occupy their normal row, progress and time occupy a separate row, and the song title occupies a bottom-center row. It is predictable and preserves both pieces of information.
2. Overlay the title on the bottom edge. This keeps the current height but continues to compete with time and is rejected.
3. Hide playback time while bottom-center title is selected. This avoids overlap but loses useful playback information and is rejected.

## Design

- Keep every existing position (`左上`, `上方置中`, `右上`, `左下`, `下中`, `右下`) and all settings values unchanged.
- Change only `name-bc`:
  - Do not reverse the full `.content` column.
  - Render song title after the normal lyric/progress content flow, with centered alignment.
  - Reserve its own bottom row and a small top gap, so the progress/time row stays directly above it.
  - Allow the pill to grow naturally by exactly this title row when a song name is visible.
- Maintain existing corner safety inset and text truncation rules.
- Continue to use the same `Capsule` component for overlay and settings preview, so both displays match.

## Scope and non-goals

- No new setting, config migration, or schema change.
- No changes to lyric synchronisation, playback time calculations, progress animation, vinyl layout, glass styling, or other title positions.
- No visual overlay, absolute positioning, timer, or duplicate preview renderer.

## Verification

- Add a regression test that `name-bc` is not part of the column-reverse selector.
- Add a test that its CSS reserves a separate centered bottom row after the progress area.
- Run the title/layout tests, full `npm.cmd test`, and `npm.cmd run build`.
- Re-open the live overlay and confirm that the bottom-center song title is inside the pill and that `2:27 / 6:01` remains fully visible above it.
