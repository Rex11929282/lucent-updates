// Windows keeps two separate settings that are easy to confuse:
//
//   Region / format  -> "zh-CN"        (date, number and currency formatting)
//   Display language -> "zh-Hant-TW"   (what language the user reads)
//
// Electron's app.getLocale() and app.getSystemLocale() both report the *format*
// locale, and Chromium copies it to the front of navigator.languages. Choosing
// the UI language from either one shows Simplified Chinese to someone whose
// display language is Traditional Chinese. app.getPreferredSystemLanguages()
// is the ordered display-language list, so that is what the UI must follow.

function normalizeTag(value) {
  return String(value || '').trim().replace(/_/g, '-')
}

// Picks the first entry the app can actually display. Falling back to entry
// zero would pick a language with no translations when the user's top choice
// is unsupported but their second choice is not.
function preferredUiLocale(candidates, fallback = 'en-US', isSupported) {
  const list = Array.isArray(candidates) ? candidates : []
  const supported = typeof isSupported === 'function' ? isSupported : null

  for (const candidate of list) {
    const tag = normalizeTag(candidate)
    if (!tag) continue
    if (!supported) return tag
    if (supported(tag)) return tag
  }

  const last = normalizeTag(fallback)
  return last || 'en-US'
}

module.exports = { preferredUiLocale, normalizeTag }
