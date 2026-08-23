function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const PROGRESS_MODES = new Set(['none', 'flow', 'breathe', 'pulse', 'bounce', 'segments'])
const DECORATION_MODES = new Set(['none', 'meteor', 'sakura', 'snow'])
const VINYL_FRAMES = new Set(['none', 'hologram', 'wood', 'celestial'])
const SONG_NAME_POSITIONS = new Set(['tl', 'tc', 'tr', 'bl', 'bc', 'br'])
const SONG_TRANSITIONS = new Set(['none', 'collapse', 'shatter'])
const SHEEN_MODES = new Set(['none', 'oval', 'droplet', 'arc'])
const SHEEN_DIRECTIONS = new Set(['ltr', 'rtl'])
const LYRIC_HIGHLIGHT_MODES = new Set(['characters', 'fill', 'both', 'off'])
const DECORATION_KEYS = new Set([
  'decorationMode', 'decorationCount', 'decorationSpeed', 'decorationStrength', 'decorationColor', 'decorationColor2',
  'meteorSpawnRate', 'meteorSpeedVariance', 'meteorLength', 'meteorWidth', 'meteorTrailLength', 'meteorTrailAlpha',
  'meteorAlpha', 'meteorDirection', 'meteorColorMode', 'meteorGlowStrength', 'meteorGlowRange', 'meteorCoreBrightness',
  'meteorEdgeSoftness', 'meteorBurstOnLine', 'sakuraSize', 'sakuraSway', 'sakuraRotation', 'sakuraDepth', 'sakuraWind',
  'sakuraAlpha', 'snowSize', 'snowWind', 'snowDrift', 'snowSoftness', 'snowCrystalRatio', 'snowAlpha', 'snowBrightness',
])
const DECORATION_PREFIX = /^(decoration|meteor|sakura|snow)/
const REMOVED_CFG_KEYS = [
  'barWave', 'progressWaveAmplitude', 'progressWaveFrequency',
  'wordBarEffect', 'wordBarStrength',
  'fxSheen', 'pillFrame',
  'offset', 'borderRGB',
]

function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function migrateLegacyLyricHighlight(cfg = {}) {
  const result = { ...cfg }
  if (!Object.prototype.hasOwnProperty.call(result, 'lyricHighlightMode')
    && Object.prototype.hasOwnProperty.call(result, 'karaoke')) {
    result.lyricHighlightMode = result.karaoke === false ? 'off' : 'characters'
  }
  return result
}

function sanitizeCfg(cfg = {}, defaults = {}) {
  const result = { ...cfg }
  if (!LYRIC_HIGHLIGHT_MODES.has(result.lyricHighlightMode)) {
    result.lyricHighlightMode = defaults.lyricHighlightMode || 'characters'
  }
  result.karaoke = result.lyricHighlightMode !== 'off'
  if (!PROGRESS_MODES.has(result.progressAnim)) result.progressAnim = 'none'
  if (!VINYL_FRAMES.has(result.vinylFrame)) result.vinylFrame = defaults.vinylFrame || 'none'
  if (!SONG_NAME_POSITIONS.has(result.songNamePos)) result.songNamePos = defaults.songNamePos || 'tl'
  result.lyricTranslationGap = clamp(result.lyricTranslationGap, 0, 32, defaults.lyricTranslationGap)
  result.translationProgressGap = clamp(result.translationProgressGap, 0, 24, defaults.translationProgressGap)
  result.hoverActivationDistance = clamp(result.hoverActivationDistance, 0, 80, defaults.hoverActivationDistance)
  if (!SONG_TRANSITIONS.has(result.songTransitionMode)) result.songTransitionMode = defaults.songTransitionMode || 'collapse'
  if (!SHEEN_MODES.has(result.sheenMode)) result.sheenMode = defaults.sheenMode || 'none'
  if (!SHEEN_DIRECTIONS.has(result.sheenDirection)) result.sheenDirection = defaults.sheenDirection || 'ltr'
  result.transitionSpeed = clamp(result.transitionSpeed, 0.5, 2, defaults.transitionSpeed)
  result.sheenWidth = clamp(result.sheenWidth, 8, 80, defaults.sheenWidth)
  result.sheenHeight = clamp(result.sheenHeight, 40, 220, defaults.sheenHeight)
  result.sheenDuration = clamp(result.sheenDuration, 0.4, 4, defaults.sheenDuration)
  result.sheenInterval = clamp(result.sheenInterval, 0.5, 20, defaults.sheenInterval)
  result.sheenBrightness = clamp(result.sheenBrightness, 0.5, 3, defaults.sheenBrightness)
  result.sheenBlur = clamp(result.sheenBlur, 0, 40, defaults.sheenBlur)
  result.sheenOpacity = clamp(result.sheenOpacity, 0.05, 1, defaults.sheenOpacity)
  for (const key of REMOVED_CFG_KEYS) delete result[key]
  for (const key of Object.keys(result)) {
    if (DECORATION_PREFIX.test(key) && !DECORATION_KEYS.has(key)) delete result[key]
  }
  if ('decorationMode' in result) {
    result.decorationMode = DECORATION_MODES.has(result.decorationMode) ? result.decorationMode : 'none'
  }
  if ('decorationCount' in result) {
    result.decorationCount = clamp(result.decorationCount, 0, 80, defaults.decorationCount)
  }
  if ('decorationSpeed' in result) {
    result.decorationSpeed = clamp(result.decorationSpeed, 0.2, 3, defaults.decorationSpeed)
  }
  for (const key of DECORATION_KEYS) {
    if (!(key in result) || ['decorationMode', 'decorationCount', 'decorationSpeed'].includes(key)) continue
    const fallback = defaults[key]
    if (fallback !== undefined && typeof result[key] !== typeof fallback) delete result[key]
  }
  return result
}

function mergeSharedStyle(state, style, defaults = {}) {
  const result = { ...state }
  if (style?.glass) result.glass = { ...state.glass, ...style.glass }
  if (style?.cfg) result.cfg = sanitizeCfg({ ...state.cfg, ...migrateLegacyLyricHighlight(style.cfg) }, defaults)
  return result
}

function migrateState(raw = {}, schema) {
  const from = Number(raw.schemaVersion) || 1
  const uiRaw = raw.ui && typeof raw.ui === 'object' && !Array.isArray(raw.ui) ? raw.ui : {}
  const sectionsRaw = uiRaw.lookSections && typeof uiRaw.lookSections === 'object'
    ? uiRaw.lookSections
    : {}
  const out = {
    glass: { ...schema.glass, ...(raw.glass || {}) },
    cfg: sanitizeCfg({ ...schema.cfg, ...migrateLegacyLyricHighlight(raw.cfg || {}) }, schema.cfg),
    profiles: Array.isArray(raw.profiles)
      ? clone(raw.profiles).map((profile) => ({ ...profile, cfg: sanitizeCfg(migrateLegacyLyricHighlight(profile?.cfg || {}), schema.cfg) }))
      : clone(schema.profiles || []),
    updates: {
      ...clone(schema.updates || { autoCheck: true, channel: 'stable' }),
      ...(raw.updates && typeof raw.updates === 'object' && !Array.isArray(raw.updates) ? raw.updates : {}),
    },
    ui: {
      ...clone(schema.ui || {}),
      ...uiRaw,
      lookSections: {
        ...clone(schema.ui?.lookSections || {}),
        ...sectionsRaw,
      },
    },
    lyricsRaw: typeof raw.lyricsRaw === 'string' ? raw.lyricsRaw : schema.lyricsRaw || '',
    win: raw.win && typeof raw.win.x === 'number' && typeof raw.win.y === 'number' ? raw.win : null,
    schemaVersion: schema.schemaVersion,
  }

  if (from < 2) {
    if (out.cfg.safeMargin === 12) out.cfg.safeMargin = schema.cfg.safeMargin
    if (out.cfg.snapMode === undefined) out.cfg.snapMode = schema.cfg.snapMode
  }
  if (from < 3 && raw.cfg?.barWave === true && raw.cfg?.progressAnim == null) out.cfg.progressAnim = 'none'
  out.updates.autoCheck = out.updates.autoCheck !== false
  out.updates.channel = out.updates.channel === 'beta' ? 'beta' : 'stable'
  return out
}

module.exports = { mergeSharedStyle, migrateState, sanitizeCfg }
