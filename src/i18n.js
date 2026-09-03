// Localization core.
//
// Design constraints:
//   - A missing key must never show a raw key like "player.play" to a user.
//     Lookup falls back to English, then to a readable last resort.
//   - Internal identifiers (playback source IDs, config keys) are never
//     translated. Only their display labels are.
//   - Switching language must not require a restart, so nothing here caches
//     resolved strings beyond the active locale object.

// The `with { type: 'json' }` attribute is required by Node's ESM loader, which
// the test suite uses directly. Vite understands it too, so one form works in
// both the bundler and plain Node.
import enUS from './locales/en-US.json' with { type: 'json' }
import zhTW from './locales/zh-TW.json' with { type: 'json' }
import zhCN from './locales/zh-CN.json' with { type: 'json' }
import jaJP from './locales/ja-JP.json' with { type: 'json' }
import koKR from './locales/ko-KR.json' with { type: 'json' }
import esES from './locales/es-ES.json' with { type: 'json' }
import frFR from './locales/fr-FR.json' with { type: 'json' }
import deDE from './locales/de-DE.json' with { type: 'json' }
import ptBR from './locales/pt-BR.json' with { type: 'json' }
import ruRU from './locales/ru-RU.json' with { type: 'json' }
import itIT from './locales/it-IT.json' with { type: 'json' }
import consoleOverrides from './locales/console-overrides.json' with { type: 'json' }
import consoleUi from './locales/console-ui.json' with { type: 'json' }
import consoleUiZhCN from './locales/console-ui/zh-CN.json' with { type: 'json' }
import consoleUiJaJP from './locales/console-ui/ja-JP.json' with { type: 'json' }
import consoleUiKoKR from './locales/console-ui/ko-KR.json' with { type: 'json' }
import consoleUiEsES from './locales/console-ui/es-ES.json' with { type: 'json' }
import consoleUiFrFR from './locales/console-ui/fr-FR.json' with { type: 'json' }
import consoleUiDeDE from './locales/console-ui/de-DE.json' with { type: 'json' }
import consoleUiPtBR from './locales/console-ui/pt-BR.json' with { type: 'json' }
import consoleUiRuRU from './locales/console-ui/ru-RU.json' with { type: 'json' }
import consoleUiItIT from './locales/console-ui/it-IT.json' with { type: 'json' }

export const FALLBACK_LOCALE = 'en-US'

const localeFiles = {
  'en-US': enUS,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'es-ES': esES,
  'fr-FR': frFR,
  'de-DE': deDE,
  'pt-BR': ptBR,
  'ru-RU': ruRU,
  'it-IT': itIT,
}

// A small override layer keeps feature-specific additions together while the
// existing locale files remain backwards-compatible and easy to review.
export const LOCALES = Object.freeze(Object.fromEntries(
  Object.entries(localeFiles).map(([id, dictionary]) => [
    id,
    Object.freeze({ ...dictionary, ...(consoleOverrides[id] || {}) }),
  ]),
))

// Endonyms: a language is easiest to find written in itself.
export const LOCALE_NAMES = Object.freeze({
  'en-US': 'English',
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'es-ES': 'Español',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'pt-BR': 'Português (Brasil)',
  'ru-RU': 'Русский',
  'it-IT': 'Italiano',
})

export const LOCALE_IDS = Object.freeze(Object.keys(LOCALES))

const CONSOLE_UI_LOCALES = Object.freeze({
  'en-US': consoleUi['en-US'],
  'zh-TW': consoleUi['zh-TW'],
  'zh-CN': consoleUiZhCN,
  'ja-JP': consoleUiJaJP,
  'ko-KR': consoleUiKoKR,
  'es-ES': consoleUiEsES,
  'fr-FR': consoleUiFrFR,
  'de-DE': consoleUiDeDE,
  'pt-BR': consoleUiPtBR,
  'ru-RU': consoleUiRuRU,
  'it-IT': consoleUiItIT,
})

// Windows/Electron report tags like 'zh-Hant-TW', 'zh', 'en-GB', 'pt-PT'.
// Match the exact tag, then the language subtag, then fall back to English.
const LANGUAGE_DEFAULT = Object.freeze({
  en: 'en-US',
  zh: 'zh-CN', // bare 'zh' is Simplified; Traditional arrives as zh-TW/zh-HK/zh-Hant
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  ru: 'ru-RU',
  it: 'it-IT',
})

const TRADITIONAL_REGIONS = new Set(['TW', 'HK', 'MO'])

export function resolveSystemLocale(tag) {
  const raw = String(tag || '').trim()
  if (!raw) return FALLBACK_LOCALE
  if (LOCALES[raw]) return raw

  const parts = raw.replace(/_/g, '-').split('-')
  const language = (parts[0] || '').toLowerCase()
  const rest = parts.slice(1).map((part) => part.toUpperCase())

  if (language === 'zh') {
    if (rest.includes('HANT')) return 'zh-TW'
    if (rest.includes('HANS')) return 'zh-CN'
    if (rest.some((part) => TRADITIONAL_REGIONS.has(part))) return 'zh-TW'
    return 'zh-CN'
  }
  return LANGUAGE_DEFAULT[language] || FALLBACK_LOCALE
}

// Windows reports two different things, and only one of them is a language:
//   region format   -> navigator.language, e.g. 'zh-CN'
//   display language -> what the user actually reads, e.g. 'zh-Hant-TW'
// The main process resolves the display language and hands it to every window
// through the preload bridge. Reading navigator.language instead renders the
// whole UI in Simplified Chinese for someone whose display language is
// Traditional. Every window must call this rather than touching navigator
// directly, so the two renderers cannot drift apart.
export function detectSystemLocale() {
  if (typeof window !== 'undefined' && window.overlay?.systemLocale) return window.overlay.systemLocale
  // No preload bridge means browser-based development, where navigator is all there is.
  return typeof navigator !== 'undefined' ? navigator.language : ''
}

// 'auto' means "follow the system"; anything else is the user's explicit choice
// and must win over detection on every later launch.
export function resolveLocale(preference, systemTag) {
  if (preference && preference !== 'auto' && LOCALES[preference]) return preference
  return resolveSystemLocale(systemTag)
}

function lookup(dictionary, key) {
  if (!dictionary) return undefined
  const direct = dictionary[key]
  if (typeof direct === 'string') return direct
  // Also support nested objects so a locale file can be grouped either way.
  let node = dictionary
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  ))
}

export function createTranslator(locale, { onMissing } = {}) {
  const id = LOCALES[locale] ? locale : FALLBACK_LOCALE
  const active = LOCALES[id]
  const fallback = LOCALES[FALLBACK_LOCALE]
  const activeConsoleUi = CONSOLE_UI_LOCALES[id] || {}
  const fallbackConsoleUi = CONSOLE_UI_LOCALES[FALLBACK_LOCALE] || {}

  return function t(key, vars) {
    const hit = lookup(active, key) ?? lookup(activeConsoleUi, key)
    if (hit !== undefined) return interpolate(hit, vars)

    const backup = lookup(fallback, key) ?? lookup(fallbackConsoleUi, key)
    if (backup !== undefined) {
      onMissing?.(key, id)
      return interpolate(backup, vars)
    }

    onMissing?.(key, id)
    // Last resort: never show a bare dotted key. The final segment reads far
    // better than "settings.appearance.progressBarAnimationSpeed".
    return key.split('.').pop()
  }
}

// --- Locale-aware formatting ---
//
// These must use the locale the user picked in Lucent, not the system locale.
// `toLocaleString()` with no argument silently uses the system one, so someone
// running Windows in Chinese but Lucent in German would still see Chinese dates.

export function formatDateTime(locale, value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toISOString()
  }
}

export function formatNumber(locale, value, { digits, unit = '' } = {}) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  try {
    const text = new Intl.NumberFormat(locale, digits === undefined ? undefined : {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(number)
    return unit ? `${text}${unit}` : text
  } catch {
    return unit ? `${number}${unit}` : String(number)
  }
}

// Display label for a playback source. The IDs themselves are stable and are
// never translated — only what the user sees.
export function playbackSourceLabel(t, source) {
  const key = `source.${String(source || 'unknown')}`
  const label = t(key)
  return label === String(source || 'unknown') ? t('source.unknown') : label
}

export function detectedMediaStatusLabel(t, value) {
  const raw = String(value || '').trim()
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (normalized === 'playing' || raw === '播放中') return t('player.playing')
  if (normalized === 'paused' || raw === '已暫停' || raw === '已暂停') return t('player.paused')
  if (normalized === 'windowtitle' || raw === '視窗標題' || raw === '窗口标题') return t('player.windowTitle')
  return raw
}

export function detectedMediaSourceLabel(t, value) {
  const raw = String(value || '').trim()
  if (/cloudmusic|netease|网易|網易/i.test(raw)) return t('source.desktop-netease')
  if (/spotify/i.test(raw)) return t('source.desktop-spotify')
  if (/youtube\s*music|youtubemusic/i.test(raw)) return t('source.desktop-youtube-music')
  return raw || t('source.unknown')
}
