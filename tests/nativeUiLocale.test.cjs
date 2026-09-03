const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const nativeLocalePath = path.join(root, 'shared', 'nativeUiLocale.cjs')
const mainPath = path.join(root, 'electron', 'main.cjs')

function loadNativeUiLocale() {
  assert.equal(fs.existsSync(nativeLocalePath), true, 'native UI locale module must exist')
  return require(nativeLocalePath)
}

test('Electron native menus use the selected locale instead of fixed Traditional Chinese labels', () => {
  const source = fs.readFileSync(mainPath, 'utf8')
  // The module lives in shared/, so main.cjs must reach it as ../shared/.
  // An earlier version of this assertion expected ./nativeUiLocale.cjs, a path that
  // never existed — main.cjs matched the test and then failed to boot at runtime.
  assert.match(source, /require\(['"]\.\.\/shared\/nativeUiLocale\.cjs['"]\)/)
  // systemUiLocale() reads the Windows display-language list; app.getLocale()
  // reports the region format and is the wrong setting for choosing a UI language.
  assert.match(source, /nativeUiLabels\(state\.ui\?\.locale,\s*systemUiLocale\(\)\)/)
  assert.doesNotMatch(source, /label:\s*['"]開啟控制台['"]|label:\s*['"]徹底結束['"]/)
})

test('native labels cover every supported application locale', () => {
  const { nativeUiLabels, SUPPORTED_NATIVE_LOCALES } = loadNativeUiLocale()
  assert.ok(Array.isArray(SUPPORTED_NATIVE_LOCALES))
  for (const locale of SUPPORTED_NATIVE_LOCALES) {
    const labels = nativeUiLabels(locale)
    for (const key of ['openConsole', 'showLucent', 'hideLucent', 'quit', 'lockPosition']) {
      assert.equal(typeof labels[key], 'string', `${locale}.${key} must be translated`)
      assert.ok(labels[key].trim(), `${locale}.${key} must not be empty`)
    }
  }
})

test('unknown native locale falls back to English and language tags resolve safely', () => {
  const { nativeUiLabels, resolveNativeLocale } = loadNativeUiLocale()
  assert.equal(resolveNativeLocale('en-GB'), 'en-US')
  assert.equal(resolveNativeLocale('zh-Hant-TW'), 'zh-TW')
  assert.equal(resolveNativeLocale('zh-CN'), 'zh-CN')
  assert.equal(resolveNativeLocale('not-a-locale'), 'en-US')
  assert.equal(resolveNativeLocale('__proto__'), 'en-US')
  assert.equal(resolveNativeLocale('constructor'), 'en-US')
  assert.equal(resolveNativeLocale('toString'), 'en-US')
  assert.equal(nativeUiLabels('auto', 'zh-TW').openConsole, '開啟控制台')
  assert.equal(nativeUiLabels('not-a-locale').openConsole, 'Open console')
})
