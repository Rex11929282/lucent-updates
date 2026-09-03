const test = require('node:test')
const assert = require('node:assert/strict')
const schema = require('../shared/defaults.json')
const { mergeSharedStyle, migrateState } = require('../shared/stateMigration.cjs')

test('舊設定升級後保留原值並補齊 profiles 與 UI', () => {
  const result = migrateState({
    schemaVersion: 2,
    glass: { blurAmount: 0.2 },
    cfg: { fontSize: 48, textPlate: true, safeMargin: 12 },
    win: { x: 300, y: 200 },
  }, schema)

  assert.equal(result.schemaVersion, schema.schemaVersion)
  assert.equal(result.glass.blurAmount, 0.2)
  assert.equal(result.cfg.fontSize, 48)
  assert.equal(result.cfg.textClarity, schema.cfg.textClarity)
  assert.deepEqual(result.profiles, [])
  assert.deepEqual(result.ui, schema.ui)
  assert.deepEqual(result.win, { x: 300, y: 200 })
})

test('新版配置與收合狀態在重啟遷移後不遺失', () => {
  const raw = {
    schemaVersion: 3,
    cfg: { fontSize: 36 },
    profiles: [{ id: 'daily', name: '日常', cfg: { fontSize: 30 }, glass: {} }],
    ui: { lookSections: { basic: false, progress: true } },
  }
  const result = migrateState(raw, schema)

  assert.equal(result.profiles[0].id, 'daily')
  assert.equal(result.ui.lookSections.basic, false)
  assert.equal(result.ui.lookSections.progress, true)
  assert.equal(result.ui.lookSections.background, schema.ui.lookSections.background)
})

test('損毀的 profiles 與 ui 會安全回退', () => {
  const result = migrateState({ profiles: {}, ui: 'bad' }, schema)
  assert.deepEqual(result.profiles, [])
  assert.deepEqual(result.ui, schema.ui)
})

test('舊版已刪除的動畫與逐字進度設定會安全回退並移除', () => {
  const result = migrateState({ schemaVersion: 2, cfg: { barWave: true } }, schema)
  assert.equal(result.cfg.progressAnim, 'none')
  const current = migrateState({ schemaVersion: 3, cfg: {
    progressAnim: 'electric',
    wordBarEffect: 'flash',
    wordBarStrength: 'strong',
  } }, schema)
  assert.equal(current.cfg.progressAnim, 'none')
  assert.equal('wordBarEffect' in current.cfg, false)
  assert.equal('wordBarStrength' in current.cfg, false)
})

test('schema 4 設定會取得裝飾預設且未知模式安全回退', () => {
  const result = migrateState({
    schemaVersion: 4,
    cfg: { decorationMode: 'aurora', decorationCount: 999, decorationSpeed: -3 },
  }, schema)

  assert.equal(result.schemaVersion, schema.schemaVersion)
  assert.equal(result.cfg.decorationMode, 'none')
  assert.equal(result.cfg.decorationCount, 80)
  assert.equal(result.cfg.decorationSpeed, 0.2)
  assert.equal(result.cfg.decorationColor, schema.cfg.decorationColor)
})

test('profile 裝飾設定只保留已驗證的鍵值', () => {
  const result = migrateState({
    profiles: [{
      id: 'daily',
      name: '日常',
      glass: {},
      cfg: { decorationMode: 'aurora', decorationCount: 999, decorationSpeed: -3, meteorAuroraPower: 1 },
    }],
  }, schema)

  assert.equal(result.profiles[0].cfg.decorationMode, 'none')
  assert.equal(result.profiles[0].cfg.decorationCount, 80)
  assert.equal(result.profiles[0].cfg.decorationSpeed, 0.2)
  assert.equal('meteorAuroraPower' in result.profiles[0].cfg, false)
})

test('schema 5 legacy glass sheen loads without retaining the removed key in main or profile cfg', () => {
  const result = migrateState({
    schemaVersion: 5,
    cfg: { fxSheen: true, fontSize: 48 },
    profiles: [{
      id: 'legacy',
      name: 'Legacy',
      glass: {},
      cfg: { fxSheen: false, fontSize: 30 },
    }],
  }, schema)

  assert.equal(result.schemaVersion, schema.schemaVersion)
  assert.equal(result.cfg.fontSize, 48)
  assert.equal('fxSheen' in result.cfg, false)
  assert.equal(result.profiles[0].cfg.fontSize, 30)
  assert.equal('fxSheen' in result.profiles[0].cfg, false)
})

test('LAN host legacy style cfg is sanitized before member state can be saved or broadcast', () => {
  assert.equal(typeof mergeSharedStyle, 'function')
  const member = migrateState({
    schemaVersion: 5,
    cfg: { memberExperimental: 'keep' },
    profiles: [{
      id: 'legacy-profile',
      name: 'Legacy profile',
      glass: {},
      cfg: { fxSheen: true, profileExperimental: 'keep' },
    }],
  }, schema)
  const merged = mergeSharedStyle(member, {
    cfg: { fxSheen: true, fontSize: 48, hostExperimental: 'keep' },
  }, schema.cfg)

  assert.equal(merged.cfg.fontSize, 48)
  assert.equal(merged.cfg.memberExperimental, 'keep')
  assert.equal(merged.cfg.hostExperimental, 'keep')
  assert.equal('fxSheen' in merged.cfg, false)
  assert.equal(merged.profiles[0].cfg.profileExperimental, 'keep')
  assert.equal('fxSheen' in merged.profiles[0].cfg, false)
  assert.doesNotMatch(JSON.stringify(merged), /fxSheen/)
})

test('schema 8 retires pill frames while normalizing vinyl frame, spacing, and song position settings', () => {
  const result = migrateState({
    schemaVersion: 6,
    cfg: {
      pillFrame: 'royal',
      vinylFrame: 'not-a-frame',
      songNamePos: 'outside',
      lyricTranslationGap: 999,
      translationProgressGap: -10,
      songTransitionMode: 'teleport',
      transitionSpeed: 99,
      sheenMode: 'straight-line',
      sheenWidth: -1,
      sheenInterval: 999,
    },
  }, schema)

  assert.equal('pillFrame' in result.cfg, false)
  assert.equal(result.cfg.vinylFrame, 'none')
  assert.equal(result.cfg.songNamePos, 'tl')
  assert.equal(result.cfg.lyricTranslationGap, 32)
  assert.equal(result.cfg.translationProgressGap, 0)
  assert.equal(result.cfg.songTransitionMode, 'collapse')
  assert.equal(result.cfg.transitionSpeed, 2)
  assert.equal(result.cfg.sheenMode, 'none')
  assert.equal(result.cfg.sheenWidth, 8)
  assert.equal(result.cfg.sheenInterval, 20)
})

test('legacy karaoke boolean migrates to a named lyric highlight mode', () => {
  const off = migrateState({ schemaVersion: 8, cfg: { karaoke: false } }, schema)
  const characters = migrateState({ schemaVersion: 8, cfg: { karaoke: true } }, schema)
  const fill = migrateState({ schemaVersion: 9, cfg: { lyricHighlightMode: 'fill' } }, schema)
  const invalid = migrateState({ schemaVersion: 9, cfg: { lyricHighlightMode: 'invalid' } }, schema)

  assert.equal(off.cfg.lyricHighlightMode, 'off')
  assert.equal(characters.cfg.lyricHighlightMode, 'characters')
  assert.equal(fill.cfg.lyricHighlightMode, 'fill')
  assert.equal(invalid.cfg.lyricHighlightMode, 'characters')
})

test('legacy typography settings safely fall back to supported text and flow-fill modes', () => {
  const legacy = migrateState({ schemaVersion: 20, cfg: {} }, schema)
  const valid = migrateState({ schemaVersion: 20, cfg: { textStyle: 'slant', flowFillColorMode: 'cover-gradient' } }, schema)
  const invalid = migrateState({ schemaVersion: 20, cfg: { textStyle: 'wrong', flowFillColorMode: 'wrong' } }, schema)

  assert.equal(legacy.cfg.textStyle, 'clean')
  assert.equal(legacy.cfg.flowFillColorMode, 'fixed')
  assert.equal(valid.cfg.textStyle, 'slant')
  assert.equal(valid.cfg.flowFillColorMode, 'cover-gradient')
  assert.equal(invalid.cfg.textStyle, 'clean')
  assert.equal(invalid.cfg.flowFillColorMode, 'fixed')
})

test('schema 10 adds and clamps the pill mouse activation distance', () => {
  const legacy = migrateState({ schemaVersion: 9, cfg: {} }, schema)
  const tooFar = migrateState({ schemaVersion: 9, cfg: { hoverActivationDistance: 999 } }, schema)
  const invalid = migrateState({ schemaVersion: 9, cfg: { hoverActivationDistance: 'bad' } }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal(legacy.cfg.hoverActivationDistance, 14)
  assert.equal(tooFar.cfg.hoverActivationDistance, 80)
  assert.equal(invalid.cfg.hoverActivationDistance, 14)
})

test('schema 11 retires lyric offset and pill RGB border from current config and profiles', () => {
  const result = migrateState({
    schemaVersion: 10,
    cfg: { offset: 2.4, borderRGB: true, rgbBar: true, fontSize: 30 },
    profiles: [{
      id: 'legacy-rgb-border',
      name: '舊外觀',
      glass: {},
      cfg: { offset: -1.2, borderRGB: true, rgbBar: true, textClarity: 0.8 },
    }],
  }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal('offset' in result.cfg, false)
  assert.equal('borderRGB' in result.cfg, false)
  assert.equal(result.cfg.rgbBar, true)
  assert.equal(result.cfg.fontSize, 30)
  assert.equal('offset' in result.profiles[0].cfg, false)
  assert.equal('borderRGB' in result.profiles[0].cfg, false)
  assert.equal(result.profiles[0].cfg.rgbBar, true)
  assert.equal(result.profiles[0].cfg.textClarity, 0.8)
})

test('schema 12 adds safe update defaults and normalizes unknown channels', () => {
  const legacy = migrateState({ schemaVersion: 11 }, schema)
  assert.deepEqual(legacy.updates, { autoCheck: true, channel: 'stable' })
  const beta = migrateState({ schemaVersion: 12, updates: { autoCheck: false, channel: 'beta' } }, schema)
  assert.deepEqual(beta.updates, { autoCheck: false, channel: 'beta' })
  const invalid = migrateState({ schemaVersion: 12, updates: { channel: 'nightly' } }, schema)
  assert.equal(invalid.updates.channel, 'stable')
})

test('schema 13 adds bounded personal liquid workbench layout', () => {
  const legacy = migrateState({ schemaVersion: 12, ui: { lookSections: { basic: false } } }, schema)
  assert.equal(schema.schemaVersion, 22)
  assert.equal(legacy.ui.lookSections.basic, false)
  assert.deepEqual(Object.keys(legacy.ui.workbench.modules), ['play', 'look', 'room', 'system'])

  const malformed = migrateState({
    schemaVersion: 12,
    ui: { workbench: { activeModule: 'bad', modules: { play: { x: 999, y: -999 } } } },
  }, schema)
  assert.equal(malformed.ui.workbench.activeModule, '')
  assert.deepEqual(malformed.ui.workbench.modules.play, { x: 0.42, y: -0.34 })
})

test('schema 14 preserves only recognised control workbench surfaces', () => {
  const legacy = migrateState({ schemaVersion: 13, ui: { workbench: { surface: 'white' } } }, schema)
  const invalid = migrateState({ schemaVersion: 13, ui: { workbench: { surface: 'night' } } }, schema)

  assert.equal(legacy.ui.workbench.surface, 'white')
  assert.equal(invalid.ui.workbench.surface, 'glass')
})

test('schema 15 adds a bounded personal internal-player volume', () => {
  const legacy = migrateState({ schemaVersion: 14, cfg: {} }, schema)
  const tooLoud = migrateState({ schemaVersion: 14, cfg: { internalPlayerVolume: 2 } }, schema)
  const invalid = migrateState({ schemaVersion: 14, cfg: { internalPlayerVolume: 'bad' } }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal(legacy.cfg.internalPlayerVolume, 0.8)
  assert.equal(tooLoud.cfg.internalPlayerVolume, 1)
  assert.equal(invalid.cfg.internalPlayerVolume, 0.8)
})

test('schema 20 promotes only the legacy dim song-title default', () => {
  const migrated = migrateState({
    schemaVersion: 19,
    cfg: { songNameAlpha: 0.62 },
    profiles: [{ id: 'old-default', name: '舊預設', glass: {}, cfg: { songNameAlpha: 0.62 } }],
  }, schema)
  const personal = migrateState({
    schemaVersion: 19,
    cfg: { songNameAlpha: 0.4 },
    profiles: [{ id: 'personal', name: '個人設定', glass: {}, cfg: { songNameAlpha: 0.4 } }],
  }, schema)

  assert.equal(migrated.cfg.songNameAlpha, 0.86)
  assert.equal(migrated.profiles[0].cfg.songNameAlpha, 0.86)
  assert.equal(personal.cfg.songNameAlpha, 0.4)
  assert.equal(personal.profiles[0].cfg.songNameAlpha, 0.4)
})

test('schema 19 removes the retired avatar spectrum ring while preserving progress spectrum', () => {
  const legacy = migrateState({ schemaVersion: 15, cfg: {} }, schema)
  const bounded = migrateState({
    schemaVersion: 15,
    cfg: { vinylFrame: 'spectrum', progressAnim: 'spectrum', spectrumSize: 9, spectrumAmplitude: -1 },
  }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal('spectrumSize' in legacy.cfg, false)
  assert.equal('spectrumAmplitude' in legacy.cfg, false)
  assert.equal(bounded.cfg.vinylFrame, 'none')
  assert.equal(bounded.cfg.progressAnim, 'spectrum')
  assert.equal('spectrumSize' in bounded.cfg, false)
  assert.equal('spectrumAmplitude' in bounded.cfg, false)
})

test('schema 17 adds a bounded progress-driven ocean material without changing playback settings', () => {
  const legacy = migrateState({ schemaVersion: 16, cfg: {} }, schema)
  const bounded = migrateState({
    schemaVersion: 16,
    cfg: { oceanWave: 'yes', oceanWaveOpacity: 9, oceanWaveAmplitude: -1, oceanWaveSpeed: 99 },
  }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal(legacy.cfg.oceanWave, false)
  assert.equal(legacy.cfg.oceanWaveOpacity, 0.32)
  assert.equal(legacy.cfg.oceanWaveAmplitude, 0.45)
  assert.equal(legacy.cfg.oceanWaveSpeed, 1)
  assert.equal(bounded.cfg.oceanWave, false)
  assert.equal(bounded.cfg.oceanWaveOpacity, 0.8)
  assert.equal(bounded.cfg.oceanWaveAmplitude, 0)
  assert.equal(bounded.cfg.oceanWaveSpeed, 3)
})

test('schema 18 normalizes lyric layout and typography without changing lyric data', () => {
  const legacy = migrateState({ schemaVersion: 17, cfg: {} }, schema)
  const bounded = migrateState({
    schemaVersion: 17,
    cfg: {
      lyricLayout: 'not-a-layout',
      lyricAlign: 'diagonal',
      lyricFont: 'unknown',
      translationFont: 'unknown',
      lyricLetterSpacing: 2,
      translationLetterSpacing: -2,
      lyricLineHeight: 9,
      translationLineHeight: 0,
      translationScale: 9,
      translationWeight: 1,
    },
  }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal(legacy.cfg.lyricLayout, 'balanced')
  assert.equal(legacy.cfg.lyricAlign, 'auto')
  assert.equal(legacy.cfg.lyricFont, 'system')
  assert.equal(legacy.cfg.translationFont, 'inherit')
  assert.equal(bounded.cfg.lyricLayout, 'balanced')
  assert.equal(bounded.cfg.lyricAlign, 'auto')
  assert.equal(bounded.cfg.lyricFont, 'system')
  assert.equal(bounded.cfg.translationFont, 'inherit')
  assert.equal(bounded.cfg.lyricLetterSpacing, 0.16)
  assert.equal(bounded.cfg.translationLetterSpacing, -0.08)
  assert.equal(bounded.cfg.lyricLineHeight, 1.8)
  assert.equal(bounded.cfg.translationLineHeight, 0.95)
  assert.equal(bounded.cfg.translationScale, 1.25)
  assert.equal(bounded.cfg.translationWeight, 400)
})

test('legacy desktop backdrop safely falls back without changing saved glass values', () => {
  const result = migrateState({
    cfg: { backdrop: 'desktop' },
    glass: { elasticity: 0.75, blurAmount: 0.2 },
  }, schema)

  assert.equal(result.cfg.backdrop, schema.cfg.backdrop)
  assert.equal(result.glass.elasticity, 0.75)
  assert.equal(result.glass.blurAmount, 0.2)
})

test('schema 22 adds persisted console preferences and migrates legacy workbench focus', () => {
  const legacy = migrateState({
    schemaVersion: 21,
    ui: { workbench: { activeModule: 'system' } },
  }, schema)
  const saved = migrateState({
    schemaVersion: 22,
    ui: {
      console: {
        selectedPage: 'room',
        onboardingVersion: 1,
        theme: 'dark',
        startupView: 'pill',
        closeBehavior: 'tray',
        launchAtLogin: true,
        appearanceSection: 'progress',
      },
    },
  }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal(legacy.ui.console.selectedPage, 'settings')
  assert.equal(legacy.ui.console.onboardingVersion, 0)
  assert.equal(legacy.ui.console.theme, 'system')
  assert.equal(saved.ui.console.selectedPage, 'room')
  assert.equal(saved.ui.console.onboardingVersion, 1)
  assert.equal(saved.ui.console.theme, 'dark')
  assert.equal(saved.ui.console.startupView, 'pill')
  assert.equal(saved.ui.console.closeBehavior, 'tray')
  assert.equal(saved.ui.console.launchAtLogin, true)
  assert.equal(saved.ui.console.appearanceSection, 'progress')
})
