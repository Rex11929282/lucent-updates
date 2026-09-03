function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const { normalizeWorkbench } = require('./liquidWorkbench.cjs')
const { normalizeConsoleState } = require('./consoleState.cjs')

const PROGRESS_MODES = new Set(['none', 'flow', 'breathe', 'pulse', 'bounce', 'segments', 'spectrum'])
const DECORATION_MODES = new Set(['none', 'meteor', 'sakura', 'snow'])
const VINYL_FRAMES = new Set(['none', 'classic', 'hologram', 'wood', 'celestial'])
const SONG_NAME_POSITIONS = new Set(['tl', 'tc', 'tr', 'bl', 'bc', 'br'])
const SONG_TRANSITIONS = new Set(['none', 'collapse', 'shatter'])
const SHEEN_MODES = new Set(['none', 'oval', 'droplet', 'arc'])
const SHEEN_DIRECTIONS = new Set(['ltr', 'rtl'])
const LYRIC_HIGHLIGHT_MODES = new Set(['characters', 'fill', 'both', 'off'])
const TEXT_STYLES = new Set(['clean', 'slant', 'soft', 'neon', 'metal'])
const FLOW_FILL_COLOR_MODES = new Set(['fixed', 'cover-gradient'])
const LYRIC_LAYOUTS = new Set(['balanced', 'concert', 'bilingual', 'compact', 'album'])
const LYRIC_ALIGNS = new Set(['auto', 'left', 'center', 'right'])
const LYRIC_FONTS = new Set(['system', 'modern', 'serif', 'mono'])
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
  'spectrumSize', 'spectrumAmplitude',
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
  if (result.backdrop === 'desktop') result.backdrop = defaults.backdrop || 'cover'
  if (!LYRIC_HIGHLIGHT_MODES.has(result.lyricHighlightMode)) {
    result.lyricHighlightMode = defaults.lyricHighlightMode || 'characters'
  }
  if (!TEXT_STYLES.has(result.textStyle)) result.textStyle = defaults.textStyle || 'clean'
  if (!FLOW_FILL_COLOR_MODES.has(result.flowFillColorMode)) result.flowFillColorMode = defaults.flowFillColorMode || 'fixed'
  result.karaoke = result.lyricHighlightMode !== 'off'
  if (!PROGRESS_MODES.has(result.progressAnim)) result.progressAnim = 'none'
  if (!VINYL_FRAMES.has(result.vinylFrame)) result.vinylFrame = defaults.vinylFrame || 'none'
  if (!SONG_NAME_POSITIONS.has(result.songNamePos)) result.songNamePos = defaults.songNamePos || 'tl'
  if (!LYRIC_LAYOUTS.has(result.lyricLayout)) result.lyricLayout = defaults.lyricLayout || 'balanced'
  if (!LYRIC_ALIGNS.has(result.lyricAlign)) result.lyricAlign = defaults.lyricAlign || 'auto'
  if (!LYRIC_FONTS.has(result.lyricFont)) result.lyricFont = defaults.lyricFont || 'system'
  if (result.translationFont !== 'inherit' && !LYRIC_FONTS.has(result.translationFont)) {
    result.translationFont = defaults.translationFont || 'inherit'
  }
  result.lyricLetterSpacing = clamp(result.lyricLetterSpacing, -0.08, 0.16, defaults.lyricLetterSpacing)
  result.translationLetterSpacing = clamp(result.translationLetterSpacing, -0.08, 0.16, defaults.translationLetterSpacing)
  result.lyricLineHeight = clamp(result.lyricLineHeight, 0.95, 1.8, defaults.lyricLineHeight)
  result.translationLineHeight = clamp(result.translationLineHeight, 0.95, 1.8, defaults.translationLineHeight)
  result.translationScale = clamp(result.translationScale, 0.5, 1.25, defaults.translationScale)
  result.translationWeight = clamp(result.translationWeight, 400, 900, defaults.translationWeight)
  result.internalPlayerVolume = clamp(result.internalPlayerVolume, 0, 1, defaults.internalPlayerVolume)
  if (typeof result.barFillColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(result.barFillColor)) {
    result.barFillColor = defaults.barFillColor
  }
  result.oceanWave = result.oceanWave === true
  result.oceanWaveOpacity = clamp(result.oceanWaveOpacity, 0, 0.8, defaults.oceanWaveOpacity)
  result.oceanWaveAmplitude = clamp(result.oceanWaveAmplitude, 0, 1, defaults.oceanWaveAmplitude)
  result.oceanWaveSpeed = clamp(result.oceanWaveSpeed, 0.2, 3, defaults.oceanWaveSpeed)
  if (typeof result.oceanWaveColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(result.oceanWaveColor)) {
    result.oceanWaveColor = defaults.oceanWaveColor
  }
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
      workbench: normalizeWorkbench(uiRaw.workbench),
      console: normalizeConsoleState(uiRaw.console, uiRaw.workbench),
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
  // 0.62 是舊版的預設歌名可見度；只升級這個舊預設，不覆寫使用者自行調過的值。
  if (from < 20) {
    if (out.cfg.songNameAlpha === 0.62) out.cfg.songNameAlpha = schema.cfg.songNameAlpha
    for (const profile of out.profiles) {
      if (profile?.cfg?.songNameAlpha === 0.62) profile.cfg.songNameAlpha = schema.cfg.songNameAlpha
    }
  }
  out.updates.autoCheck = out.updates.autoCheck !== false
  out.updates.channel = out.updates.channel === 'beta' ? 'beta' : 'stable'
  return out
}

module.exports = { mergeSharedStyle, migrateState, sanitizeCfg }
