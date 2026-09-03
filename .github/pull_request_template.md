## Summary

<!-- What does this change do, in one or two sentences? -->

## Why

<!-- What problem does it solve? Link the issue if there is one. -->

## Changes

<!-- The notable changes. Keep unrelated changes out of this PR. -->

-

## Testing

<!--
How did you verify this? Be specific.

For UI interactivity, note that programmatic element.click() bypasses hit testing and can pass
against a button a user genuinely cannot click. Verify with real input where it matters.
-->

- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Manually verified on Windows

## Screenshots

<!-- Required for any UI change. Before/after if you are changing something that already existed. -->

## Regression risk

<!--
What could this break that is not obvious? Which players, window sizes, or configurations did you
not test? Saying "none" is fine if it is true, but think about it first.
-->

## Checklist

- [ ] New behaviour has a test; bug fixes have a regression test that fails without the fix
- [ ] Existing tests were updated rather than deleted when wiring changed
- [ ] No secrets, credentials, cookies, or personal listening data are included
- [ ] Stable identifiers (playback source IDs, config keys) were not renamed
- [ ] Comments explain why, not what
