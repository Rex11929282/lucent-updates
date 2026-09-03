# Typography Presets, Fixed Title Track, and Cover Flow Fill Design

## Goal

Add restrained modern text styles, keep the song-title track permanently size-stable, and let the existing flow-fill lyric foreground use a readable two-colour gradient derived from the current song cover.

## Text style presets

Add one `textStyle` appearance setting with these presets:

- `clean` — current sharp, neutral presentation; default and backwards-compatible.
- `slant` — modern light forward slant: main lyric 5 degrees, translation 3 degrees, title 7 degrees.
- `soft` — restrained soft white glow; no movement.
- `neon` — saturated edge glow with the user-selected glow colour; no movement.
- `metal` — cool white-to-silver foreground with a modest crisp edge; no movement.

All presets use only composited CSS properties and existing text clarity, outline, colour, font, weight, letter spacing, and line-height controls remain authoritative. No preset adds a timing loop, modifies lyric fill timing, or affects mirror synchronisation.

## Fixed song-title track

- The song title always owns one fixed-height line within the pill, including when `showSongName` is disabled or there is no current song title.
- This reserved track keeps pill dimensions stable when toggling titles or switching between short and long titles.
- For `songNamePos: 'bc'`, the track remains the last row beneath the existing lyrics/progress row.
- For the other five title positions, the reserved track remains in its existing visual position but is invisible when title display is disabled.
- The title may never push the pill wider or taller due to its content. Its presentation is measured against the existing available inline width, compressed horizontally down to 72% as needed, then clipped with ellipsis if it still does not fit.
- The progress bar, playback time, vinyl, and lyrics retain their existing available space.

## Cover-driven flow fill

- Add `flowFillColorMode`: `fixed` (default) or `cover-gradient`.
- `cover-gradient` applies only to the already-sung foreground of `lyricHighlightMode: 'fill'` and `both`.
- Unfilled lyric characters remain `cfg.textColor` and preserve all existing clarity/outline rules.
- Reuse the current 12 by 12 cover sampling and existing three-colour `coverColors` state in `Capsule`; run that one sampler when either `rgbMode === 'cover'` or `flowFillColorMode === 'cover-gradient'`, then use its first two palette colours as the flowing foreground gradient.
- When a new cover has not loaded, cannot be read, or flow fill is inactive, use the existing fixed fill colour without blank/black text.
- Do not extract colours on a frame loop, do not add audio analysis, and do not change YRC/LRC timing logic.

## Settings and compatibility

- Add a compact `文字風格` select and a `流動填色顏色` select only when flow fill is enabled.
- Store both fields in the existing visual configuration/profile system; legacy configurations receive `textStyle: 'clean'` and `flowFillColorMode: 'fixed'` through the existing default merge and normalisation path.
- Do not bump the config schema: absent keys are safely supplied by the existing default merge.

## Verification

- Unit-test every text-style value normalises to an allowed preset and falls back to `clean`.
- Test title reserve width/height behaviour using a pure title-fit helper: short title scales to 1, long title scales no smaller than 0.72, overflow still clips.
- Test that `bc` stays below the progress row and that title absence uses an invisible fixed track rather than removing layout.
- Test cover-gradient flow fill uses the first two supplied cover palette colours only for filled characters and falls back to fixed colour without a palette.
- Run typography/layout tests, the full test suite, Vite build, and visually compare a short and long title with a light and a dark cover.

## Non-goals

- No new music source, no new lyric timing heuristic, no random colours, no permanent text animation, and no dynamic overlay resizing caused by song-title length.
