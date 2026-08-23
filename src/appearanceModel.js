export const PROGRESS_MODES = [
  'none', 'flow', 'breathe', 'pulse', 'bounce', 'segments',
]

export const DECORATION_MODES = ['none', 'meteor', 'sakura', 'snow']

export const DECORATION_DEFAULTS = Object.freeze({
  decorationMode: 'none',
  decorationCount: 18,
  decorationSpeed: 1,
  decorationStrength: 0.6,
  decorationColor: '#ffffff',
  decorationColor2: '#ffb7d5',
  meteorSpawnRate: 1,
  meteorSpeedVariance: 0.25,
  meteorLength: 34,
  meteorWidth: 1.6,
  meteorTrailLength: 0.75,
  meteorTrailAlpha: 0.55,
  meteorAlpha: 0.85,
  meteorDirection: 'down-right',
  meteorColorMode: 'fixed',
  meteorGlowStrength: 0.55,
  meteorGlowRange: 8,
  meteorCoreBrightness: 1.2,
  meteorEdgeSoftness: 0.5,
  meteorBurstOnLine: true,
  sakuraSize: 8,
  sakuraSway: 0.7,
  sakuraRotation: 1,
  sakuraDepth: 0.55,
  sakuraWind: 0.15,
  sakuraAlpha: 0.8,
  snowSize: 5,
  snowWind: 0,
  snowDrift: 0.5,
  snowSoftness: 0.45,
  snowCrystalRatio: 0.18,
  snowAlpha: 0.8,
  snowBrightness: 1,
})

const DECORATION_KEYS = Object.keys(DECORATION_DEFAULTS)

function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

export function decorationControlsForMode(mode) {
  const safeMode = DECORATION_MODES.includes(mode) ? mode : 'none'
  const active = safeMode !== 'none'
  return {
    count: active,
    speed: active,
    strength: active,
    color: active,
    color2: active,
    spawnRate: safeMode === 'meteor',
    speedVariance: safeMode === 'meteor',
    length: safeMode === 'meteor',
    width: safeMode === 'meteor',
    trail: safeMode === 'meteor',
    alpha: active,
    direction: safeMode === 'meteor',
    colorMode: safeMode === 'meteor',
    glow: safeMode === 'meteor',
    coreBrightness: safeMode === 'meteor',
    edgeSoftness: safeMode === 'meteor',
    burstOnLine: safeMode === 'meteor',
    size: safeMode === 'sakura' || safeMode === 'snow',
    sway: safeMode === 'sakura',
    rotation: safeMode === 'sakura',
    depth: safeMode === 'sakura',
    wind: safeMode === 'sakura' || safeMode === 'snow',
    drift: safeMode === 'snow',
    softness: safeMode === 'snow',
    crystalRatio: safeMode === 'snow',
    brightness: safeMode === 'snow',
  }
}

export function normalizeDecorationConfig(cfg = {}) {
  const normalized = { ...DECORATION_DEFAULTS }
  for (const key of DECORATION_KEYS) {
    if (!(key in cfg)) continue
    const value = cfg[key]
    if (key === 'decorationMode') {
      normalized[key] = DECORATION_MODES.includes(value) ? value : 'none'
    } else if (key === 'decorationCount') {
      normalized[key] = clamp(value, 0, 80, DECORATION_DEFAULTS[key])
    } else if (key === 'decorationSpeed') {
      normalized[key] = clamp(value, 0.2, 3, DECORATION_DEFAULTS[key])
    } else if (typeof DECORATION_DEFAULTS[key] === 'number') {
      if (Number.isFinite(value)) normalized[key] = value
    } else if (typeof value === typeof DECORATION_DEFAULTS[key]) {
      normalized[key] = value
    }
  }
  return normalized
}

export function resetDecorationConfig() {
  return { ...DECORATION_DEFAULTS }
}

const CONTINUOUS_PROGRESS_MODES = new Set([
  'flow', 'breathe', 'pulse', 'bounce', 'segments',
])

export function progressControlsForMode(mode) {
  const safeMode = PROGRESS_MODES.includes(mode) ? mode : 'none'
  return {
    speed: CONTINUOUS_PROGRESS_MODES.has(safeMode),
    strength: safeMode !== 'none',
    smoothness: safeMode === 'pulse' || safeMode === 'bounce',
    bounce: safeMode === 'bounce',
  }
}

export function pillHasBackground(skin) {
  return skin !== 'avatar'
}

export const DEFAULT_LOOK_SECTIONS = Object.freeze({
  preview: true,
  quick: true,
  basic: true,
  vinyl: false,
  subtitles: true,
  text: true,
  background: true,
  progress: false,
  lyricAnimation: false,
  effects: false,
  window: false,
  advanced: false,
})

const NON_VISUAL_CFG = new Set([
  'alwaysOnTop', 'clickThrough', 'locked', 'safeMargin', 'snapMode',
  'offset', 'borderRGB', 'secondsPerLine',
])

export function visualConfigSnapshot(cfg = {}) {
  const snapshot = {}
  for (const [key, value] of Object.entries(cfg)) {
    if (!NON_VISUAL_CFG.has(key)) snapshot[key] = value
  }
  return snapshot
}

export function createAppearanceProfile({ id, name, now, glass = {}, cfg = {} }) {
  const stamp = now || new Date().toISOString()
  return {
    id: String(id || globalThis.crypto?.randomUUID?.() || `${Date.now()}`),
    name: String(name || '未命名配置').trim().slice(0, 40) || '未命名配置',
    createdAt: stamp,
    updatedAt: stamp,
    glass: { ...glass },
    cfg: visualConfigSnapshot(cfg),
  }
}

export function upsertAppearanceProfile(profiles = [], next) {
  const index = profiles.findIndex((profile) => profile.id === next.id)
  if (index < 0) return [...profiles, next]
  const result = profiles.slice()
  result[index] = { ...next, createdAt: profiles[index].createdAt || next.createdAt }
  return result
}

export function mergeLookSections(saved = {}) {
  const merged = { ...DEFAULT_LOOK_SECTIONS }
  for (const key of Object.keys(DEFAULT_LOOK_SECTIONS)) {
    if (typeof saved[key] === 'boolean') merged[key] = saved[key]
  }
  return merged
}

export function progressClasses(cfg = {}, playing = false) {
  const mode = PROGRESS_MODES.includes(cfg.progressAnim) ? cfg.progressAnim : 'none'
  return [
    'progress',
    cfg.rgbBar ? 'rgb' : '',
    cfg.barBeat ? 'line-event' : '',
    cfg.barGlow ? 'bar-glow' : '',
    playing ? 'live' : '',
    `prog-${mode}`,
    cfg.segmentedBar || mode === 'segments' ? 'segmented' : '',
    cfg.barRound === false ? 'square' : '',
  ].filter(Boolean)
}

export function progressSegmentStates(count, ratio) {
  const total = Math.max(2, Math.min(40, Math.round(Number(count) || 0)))
  const played = Math.round(Math.max(0, Math.min(1, Number(ratio) || 0)) * total)
  return Array.from({ length: total }, (_, index) => index < played)
}
