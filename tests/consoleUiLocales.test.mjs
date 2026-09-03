import test from 'node:test'
import assert from 'node:assert/strict'
import consoleUi from '../src/locales/console-ui.json' with { type: 'json' }
import { LOCALE_IDS, createTranslator } from '../src/i18n.js'

const keys = Object.keys(consoleUi['en-US'])
const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

test('every supported locale owns every console UI translation without fallback', () => {
  for (const locale of LOCALE_IDS) {
    const missing = []
    const t = createTranslator(locale, { onMissing: (key) => {
      if (keys.includes(key)) missing.push(key)
    } })

    const translated = keys.map((key) => t(key))
    assert.deepEqual(missing, [], `${locale} is missing ${missing.length} console UI keys`)

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]
      assert.deepEqual(
        placeholders(translated[index]),
        placeholders(consoleUi['en-US'][key]),
        `${locale}:${key} changed interpolation placeholders`,
      )
    }

    if (locale !== 'en-US') {
      const localizedCount = translated.filter((value, index) => value !== consoleUi['en-US'][keys[index]]).length
      assert.ok(localizedCount >= 300, `${locale} translated only ${localizedCount}/${keys.length} console UI strings`)
    }
  }
})
