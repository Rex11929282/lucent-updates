import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { QUICK_PRESETS, QUICK_PRESET_IDS, applyQuickPreset } from '../src/quickPresets.js'
import { visualConfigSnapshot } from '../src/appearanceModel.js'

const schema = JSON.parse(fs.readFileSync(new URL('../shared/defaults.json', import.meta.url), 'utf8'))

test('三組自訂快速預設都是完整外觀快照，不是幾個零星數值', () => {
  assert.deepEqual(QUICK_PRESET_IDS, ['good', 'wow', 'gameGood'])
  const visualKeys = Object.keys(visualConfigSnapshot(schema.cfg))
  for (const [id, label] of [['good', 'good'], ['wow', 'wow'], ['gameGood', 'game good']]) {
    const preset = QUICK_PRESETS[id]
    assert.equal(preset.label, label)
    const missing = visualKeys.filter((key) => !(key in preset.cfg))
    assert.deepEqual(missing, [], `這些視覺設定沒被 ${label} 覆蓋到：${missing.join(', ')}`)
    assert.equal(Object.keys(preset.glass).length, Object.keys(schema.glass).length, `${label} 的玻璃參數要全帶`)
  }
})

test('三組預設都不會偷改視窗行為', () => {
  // 換個外觀不該讓視窗突然變成穿透或取消置頂
  for (const id of QUICK_PRESET_IDS) {
    for (const key of ['alwaysOnTop', 'clickThrough', 'locked', 'safeMargin', 'snapMode', 'offset', 'secondsPerLine']) {
      assert.equal(key in QUICK_PRESETS[id].cfg, false, `${id} 的 ${key} 屬於行為設定，不該出現在外觀預設裡`)
    }
  }
})

test('套用每組預設時 glass 與 cfg 一起更新', () => {
  // 只寫 cfg 的話，上一個外觀的玻璃參數會留著不動
  for (const id of QUICK_PRESET_IDS) {
    let cfg = null
    let glass = null
    const ok = applyQuickPreset(id, { setCfg: (value) => { cfg = value }, setGlass: (value) => { glass = value } })
    assert.equal(ok, true)
    assert.ok(cfg && Object.keys(cfg).length > 100)
    assert.ok(glass && Object.keys(glass).length === Object.keys(schema.glass).length)
    // 傳出去的必須是複本，不能讓呼叫端改到凍結的原始資料
    assert.notEqual(cfg, QUICK_PRESETS[id].cfg)
    assert.notEqual(glass, QUICK_PRESETS[id].glass)
  }
})

test('不存在的預設不會炸掉，也不會亂改設定', () => {
  let touched = false
  const ok = applyQuickPreset('nope', { setCfg: () => { touched = true }, setGlass: () => { touched = true } })
  assert.equal(ok, false)
  assert.equal(touched, false)
})

test('預設內容是凍結的，執行期不會被改掉', () => {
  assert.equal(Object.isFrozen(QUICK_PRESETS), true)
  for (const id of QUICK_PRESET_IDS) {
    assert.equal(Object.isFrozen(QUICK_PRESETS[id].cfg), true)
    assert.equal(Object.isFrozen(QUICK_PRESETS[id].glass), true)
  }
})

test('外觀頁把 good 接到完整套用流程上', () => {
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  assert.match(source, /import \{ QUICK_PRESETS, QUICK_PRESET_IDS, applyQuickPreset \}/)
  assert.match(source, /applyQuickPreset\(id, \{ setCfg, setGlass \}\)/)
})
