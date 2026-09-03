const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { preferredUiLocale } = require('../shared/systemLocale.cjs')
const { resolveNativeLocale, SUPPORTED_NATIVE_LOCALES } = require('../shared/nativeUiLocale.cjs')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

const supportedLanguages = new Set(SUPPORTED_NATIVE_LOCALES.map((tag) => tag.split('-')[0].toLowerCase()))
const isSupported = (tag) => supportedLanguages.has(String(tag).split('-')[0].toLowerCase())

test('follows the display-language list rather than the region format', () => {
  // The real machine this was found on: region format zh-CN, display language
  // Traditional Chinese. app.getLocale() reports zh-CN and would show the whole
  // UI in Simplified Chinese to someone who reads Traditional.
  const preferred = ['zh-Hant-TW', 'en-GB', 'zh-Hans-CN']
  const chosen = preferredUiLocale(preferred, 'zh-CN', isSupported)
  assert.equal(chosen, 'zh-Hant-TW')
  assert.equal(resolveNativeLocale('auto', chosen), 'zh-TW')
})

test('skips display languages the app has no translations for', () => {
  // Picking entry zero unconditionally would land on Thai and fall back to
  // English, even though the second preference is fully translated.
  assert.equal(preferredUiLocale(['th-TH', 'ja-JP'], 'en-US', isSupported), 'ja-JP')
  assert.equal(preferredUiLocale(['th-TH', 'vi-VN'], 'en-US', isSupported), 'en-US')
})

test('falls back safely when the preference list is missing or unusable', () => {
  for (const empty of [undefined, null, [], ['', '   ']]) {
    assert.equal(preferredUiLocale(empty, 'ja-JP', isSupported), 'ja-JP')
  }
  assert.equal(preferredUiLocale(undefined, '', isSupported), 'en-US')
  assert.equal(preferredUiLocale(undefined, null, isSupported), 'en-US')
  assert.equal(preferredUiLocale(['zh_TW'], 'en-US', isSupported), 'zh-TW', 'underscore tags normalise')
})

test('an explicit language choice still overrides detection', () => {
  // Detection only feeds the 'auto' case; picking a language in settings wins.
  assert.equal(resolveNativeLocale('ja-JP', 'zh-Hant-TW'), 'ja-JP')
  assert.equal(resolveNativeLocale('auto', 'zh-Hant-TW'), 'zh-TW')
})

test('the main process resolves native menus from the display-language list', () => {
  const main = read('electron', 'main.cjs')
  assert.match(main, /app\.getPreferredSystemLanguages\(\)/, 'must read the display-language list')
  assert.doesNotMatch(
    main,
    /nativeUiLabels\(state\.ui\?\.locale,\s*app\.getLocale\(\)\)/,
    'app.getLocale() is the region format, not the display language',
  )
  const menuCalls = main.match(/nativeUiLabels\(state\.ui\?\.locale,\s*systemUiLocale\(\)\)/g) || []
  assert.equal(menuCalls.length, 2, 'both the tray menu and the capsule menu must use it')
})

test('every renderer receives the resolved system locale from main', () => {
  const main = read('electron', 'main.cjs')
  const preload = read('electron', 'preload.cjs')
  const consoleWindow = read('src', 'ConsoleWindow.jsx')

  // All three windows share one preload, so any window missing the argument
  // would silently fall back to the region format.
  const windows = main.match(/preload: path\.join\(__dirname, 'preload\.cjs'\)/g) || []
  const wired = main.match(/additionalArguments: rendererArguments\(\)/g) || []
  assert.equal(wired.length, windows.length, `${windows.length} windows use the preload, ${wired.length} pass the locale`)

  assert.match(preload, /--lucent-system-locale=/, 'preload must read the argument')
  assert.match(preload, /systemLocale,/, 'preload must expose it')
  assert.match(consoleWindow, /detectSystemLocale\(\)/, 'the console must resolve through the shared helper')
})

test('no renderer derives a display language from navigator directly', () => {
  // The first version of this fix updated ConsoleWindow.jsx but missed App.jsx,
  // leaving the desktop capsule resolving its language from the region format.
  // Only src/i18n.js may touch navigator, and only as the no-bridge fallback.
  const offenders = []
  const dir = path.join(root, 'src')
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.(jsx?|mjs)$/.test(entry.name)) continue
      if (full === path.join(dir, 'i18n.js')) continue
      const source = fs.readFileSync(full, 'utf8')
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      if (/resolveLocale\([^)]*navigator\./.test(code)) {
        offenders.push(path.relative(root, full))
      }
    }
  }
  walk(dir)
  assert.deepEqual(offenders, [], `must call detectSystemLocale(): ${offenders.join(', ')}`)
})

test('the shared helper prefers the bridge and falls back to navigator', async () => {
  const { detectSystemLocale } = await import('../src/i18n.js')
  const savedWindow = global.window
  const savedNavigator = global.navigator

  try {
    global.navigator = { language: 'zh-CN' }
    global.window = { overlay: { systemLocale: 'zh-Hant-TW' } }
    assert.equal(detectSystemLocale(), 'zh-Hant-TW', 'the bridge value must win')

    // Browser-based development has no preload bridge.
    global.window = {}
    assert.equal(detectSystemLocale(), 'zh-CN', 'must fall back to navigator')

    // An empty bridge value must not shadow the fallback.
    global.window = { overlay: { systemLocale: '' } }
    assert.equal(detectSystemLocale(), 'zh-CN')
  } finally {
    if (savedWindow === undefined) delete global.window; else global.window = savedWindow
    if (savedNavigator === undefined) delete global.navigator; else global.navigator = savedNavigator
  }
})
