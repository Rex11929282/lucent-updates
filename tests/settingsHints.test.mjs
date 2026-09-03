import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import consoleUi from '../src/locales/console-ui.json' with { type: 'json' }

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const schema = JSON.parse(fs.readFileSync(new URL('../shared/defaults.json', import.meta.url), 'utf8'))

test('設定說明預設是開的，而且可以整批關掉', () => {
  assert.equal(schema.ui.lookHints, true, '第一次使用應該看得到說明')
  assert.match(source, /const HintContext = createContext\(true\)/)
  assert.match(source, /<HintContext\.Provider value=\{showHints\}>/)
  assert.match(source, /label=\{t\('look\.hints\.show'\)\}/)
  assert.match(source, /setUi\(\{ lookHints: v \}\)/)
})

test('Slider 與 Choice 都支援白話說明', () => {
  for (const component of ['Slider', 'Choice']) {
    const body = source.slice(source.indexOf(`function ${component}(`))
    assert.match(body.slice(0, 700), /hint/, `${component} 應該接受 hint`)
    assert.match(body.slice(0, 700), /useContext\(HintContext\)/, `${component} 應該跟著總開關`)
  }
})

test('名稱看不出用途的設定都補上了說明', () => {
  // Labels are translated at runtime; assert the source key and both shipped
  // console dictionaries instead of looking for one hardcoded language.
  const cryptic = [
    ['ui.look.background.noise', 'ui.look.background.noiseHint'],
    ['ui.look.progress.strength', 'ui.look.progress.strengthHint'],
    ['ui.look.progress.smoothness', 'ui.look.progress.smoothnessHint'],
    ['ui.look.background.waveAmplitude', 'ui.look.background.waveAmplitudeHint'],
    ['ui.look.background.waveSpeed', 'ui.look.background.waveSpeedHint'],
    ['ui.look.background.shadowIn', 'ui.look.background.shadowInHint'],
    ['ui.look.background.shadowOutBlur', 'ui.look.background.shadowOutBlurHint'],
    ['ui.look.background.outerGlow', 'ui.look.background.outerGlowHint'],
    ['ui.look.progress.trackAlpha', 'ui.look.progress.trackAlphaHint'],
    ['ui.look.background.saturation', 'ui.look.background.saturationHint'],
    ['ui.look.background.contrast', 'ui.look.background.contrastHint'],
  ]
  for (const [labelKey, hintKey] of cryptic) {
    assert.ok(source.includes(`label={t('${labelKey}')}`), `找不到設定鍵「${labelKey}」`)
    assert.ok(source.includes(`hint={t('${hintKey}')}`), `設定「${labelKey}」需要一行白話說明`)
    for (const locale of ['en-US', 'zh-TW']) {
      assert.equal(typeof consoleUi[locale][labelKey], 'string', `${locale} 缺少 ${labelKey}`)
      assert.equal(typeof consoleUi[locale][hintKey], 'string', `${locale} 缺少 ${hintKey}`)
    }
  }
  for (const key of ['look.clarity', 'look.translationScale']) {
    const at = source.indexOf(`label={t('${key}')}`)
    assert.notEqual(at, -1, `找不到設定鍵「${key}」`)
    const row = source.slice(at, at + 300)
    assert.ok(row.includes(`hint={t('${key}.hint')}`), `設定鍵「${key}」需要翻譯過的白話說明`)
  }
})

test('數值會用看得懂的單位呈現，而不是裸數字', () => {
  // 0 這種邊界值要講人話，不然使用者不知道 0 代表關掉還是壞了。
  for (const key of [
    'ui.look.value.transparent', 'ui.look.value.noBlur', 'ui.look.value.monochrome',
    'common.off', 'ui.look.value.calm',
  ]) {
    assert.ok(source.includes(`t('${key}')`), `應該有「${key}」這種白話數值`)
  }
  assert.ok(source.includes("t('common.none')"), '零描邊應該顯示在地化的「無」')
})

test('說明的樣式不會把版面撐開，關掉後就完全消失', () => {
  assert.match(css, /\.row--hinted \.row__label \{ display: grid;/)
  assert.match(css, /\.row__hint \{[\s\S]*?font-size: 11px;/)
  // 只有 row--hinted 會改版面；沒有 hint 的列維持原樣
  assert.match(css, /\.row--hinted \{ align-items: start; \}/)
})
