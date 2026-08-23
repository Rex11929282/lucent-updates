import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  DECORATION_DEFAULTS,
  DECORATION_MODES,
  DEFAULT_LOOK_SECTIONS,
  PROGRESS_MODES,
  createAppearanceProfile,
  decorationControlsForMode,
  mergeLookSections,
  normalizeDecorationConfig,
  pillHasBackground,
  progressClasses,
  resetDecorationConfig,
  upsertAppearanceProfile,
} from '../src/appearanceModel.js'

test('裝飾模式只有無、流星、櫻花與雪', () => {
  assert.deepEqual(DECORATION_MODES, ['none', 'meteor', 'sakura', 'snow'])
  assert.equal(normalizeDecorationConfig({ decorationMode: 'aurora' }).decorationMode, 'none')
})

test('不同模式只顯示相關進階控制', () => {
  const enabled = (mode) => Object.entries(decorationControlsForMode(mode))
    .filter(([, visible]) => visible)
    .map(([key]) => key)
    .sort()
  const common = ['alpha', 'color', 'color2', 'count', 'speed', 'strength']

  assert.deepEqual(enabled('none'), [])
  assert.deepEqual(enabled('meteor'), [...common,
    'burstOnLine', 'colorMode', 'coreBrightness', 'direction', 'edgeSoftness', 'glow',
    'length', 'spawnRate', 'speedVariance', 'trail', 'width',
  ].sort())
  assert.deepEqual(enabled('sakura'), [...common, 'depth', 'rotation', 'size', 'sway', 'wind'].sort())
  assert.deepEqual(enabled('snow'), [...common, 'brightness', 'crystalRatio', 'drift', 'size', 'softness', 'wind'].sort())
})

test('粒子設定會限制到安全範圍', () => {
  const cfg = normalizeDecorationConfig({ decorationMode: 'meteor', decorationCount: 999, decorationSpeed: -3 })
  assert.equal(cfg.decorationCount, 80)
  assert.equal(cfg.decorationSpeed, 0.2)
})

test('重設裝飾設定回到 schema 預設', () => {
  const reset = resetDecorationConfig()

  assert.deepEqual(reset, DECORATION_DEFAULTS)
  assert.deepEqual(Object.keys(reset).sort(), Object.keys(DECORATION_DEFAULTS).sort())
  assert.ok(Object.keys(reset).every((key) => /^(decoration|meteor|sakura|snow)/.test(key)))
  assert.equal('fontSize' in reset, false)
  assert.equal('alwaysOnTop' in reset, false)
})

test('transparent skin never renders a pill background', () => {
  assert.equal(pillHasBackground('avatar'), false)
  assert.equal(pillHasBackground('glass'), true)
  assert.equal(pillHasBackground(undefined), true)
})

test('外觀配置不會保存同步、視窗與定位參數', () => {
  const profile = createAppearanceProfile({
    id: 'daily',
    name: '日常',
    now: '2026-08-22T10:00:00.000Z',
    glass: { blurAmount: 0.4 },
    cfg: {
      fontSize: 32,
      textClarity: 0.8,
      alwaysOnTop: true,
      clickThrough: true,
      locked: true,
      safeMargin: 12,
      snapMode: 'strong',
      offset: 1.2,
      secondsPerLine: 4,
    },
  })

  assert.equal(profile.name, '日常')
  assert.deepEqual(profile.glass, { blurAmount: 0.4 })
  assert.deepEqual(profile.cfg, { fontSize: 32, textClarity: 0.8 })
})

test('命名外觀配置會保存裝飾粒子的視覺欄位', () => {
  const decoration = resetDecorationConfig()
  const profile = createAppearanceProfile({
    id: 'snow-night',
    name: '雪夜',
    now: '2026-08-22T10:00:00.000Z',
    glass: {},
    cfg: {
      ...decoration,
      alwaysOnTop: true,
    },
  })

  assert.equal(profile.name, '雪夜')
  assert.deepEqual(Object.keys(profile.cfg).sort(), Object.keys(decoration).sort())
  for (const [key, value] of Object.entries(decoration)) assert.deepEqual(profile.cfg[key], value, key)
  assert.equal('alwaysOnTop' in profile.cfg, false)
})

test('更新同名配置保留建立時間並替換視覺快照', () => {
  const oldProfile = createAppearanceProfile({
    id: 'daily', name: '日常', now: '2026-08-21T10:00:00.000Z', glass: {}, cfg: { fontSize: 20 },
  })
  const changed = createAppearanceProfile({
    id: 'daily', name: '日常新版', now: '2026-08-22T10:00:00.000Z', glass: {}, cfg: { fontSize: 36 },
  })
  const result = upsertAppearanceProfile([oldProfile], changed)

  assert.equal(result.length, 1)
  assert.equal(result[0].createdAt, oldProfile.createdAt)
  assert.equal(result[0].updatedAt, changed.updatedAt)
  assert.equal(result[0].cfg.fontSize, 36)
})

test('進度條 RGB、動畫與換句事件是互相獨立的 class', () => {
  const classes = progressClasses({ rgbBar: false, progressAnim: 'bounce', barBeat: true }, true)
  assert.ok(classes.includes('prog-bounce'))
  assert.ok(classes.includes('line-event'))
  assert.ok(!classes.includes('rgb'))

  const colored = progressClasses({ rgbBar: true, progressAnim: 'none', barBeat: false }, true)
  assert.ok(colored.includes('rgb'))
  assert.ok(colored.includes('prog-none'))
  assert.ok(!colored.includes('line-event'))
})

test('進度條模式清單完整且未知模式安全回退', () => {
  assert.deepEqual(PROGRESS_MODES, [
    'none', 'flow', 'breathe', 'pulse', 'bounce', 'segments',
  ])
  assert.ok(progressClasses({ progressAnim: 'unknown' }, false).includes('prog-none'))
})

test('設定頁展開狀態保留已知值並補齊預設', () => {
  const merged = mergeLookSections({ basic: false, progress: true, unknown: true })
  assert.equal(merged.basic, false)
  assert.equal(merged.progress, true)
  assert.equal(merged.background, DEFAULT_LOOK_SECTIONS.background)
  assert.equal('unknown' in merged, false)
})

test('設定 schema 提供新版外觀、配置、進度條與裝飾預設', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../shared/defaults.json', import.meta.url), 'utf8'))
  assert.equal(schema.schemaVersion, 12)
  assert.equal(schema.cfg.textClarity, 0.7)
  assert.equal(schema.cfg.progressAnim, 'flow')
  assert.equal(schema.cfg.segmentedBar, false)
  assert.equal(schema.cfg.decorationMode, 'none')
  assert.equal(schema.cfg.decorationCount, 18)
  assert.equal(schema.cfg.snowBrightness, 1)
  assert.equal(schema.cfg.hoverActivationDistance, 14)
  assert.deepEqual(schema.profiles, [])
  assert.deepEqual(schema.ui.lookSections, DEFAULT_LOOK_SECTIONS)
})

test('new shaped sheen does not revive the removed legacy straight-line effect', () => {
  const sources = [
    '../shared/defaults.json',
    '../src/ConsoleWindow.jsx',
    '../src/components/Capsule.jsx',
    '../src/styles.css',
  ].map((relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'))

  for (const source of sources) {
    assert.doesNotMatch(source, /fxSheen|fx-sheen|straight-line/)
  }
})
