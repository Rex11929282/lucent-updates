const PERSONAL_WINDOW_CFG = new Set([
  'alwaysOnTop',
  'clickThrough',
  'locked',
  'safeMargin',
  'snapMode',
  'position',
  'offset',
  'borderRGB',
  'secondsPerLine',
  'internalPlayerVolume',
])

function sharedAppearanceStyle(state = {}) {
  const cfg = {}
  for (const [key, value] of Object.entries(state.cfg || {})) {
    if (!PERSONAL_WINDOW_CFG.has(key)) cfg[key] = value
  }

  return {
    glass: { ...(state.glass || {}) },
    cfg,
  }
}

module.exports = { sharedAppearanceStyle }
