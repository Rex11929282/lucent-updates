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

test('schema 10 adds and clamps the pill mouse activation distance', () => {
  const legacy = migrateState({ schemaVersion: 9, cfg: {} }, schema)
  const tooFar = migrateState({ schemaVersion: 9, cfg: { hoverActivationDistance: 999 } }, schema)
  const invalid = migrateState({ schemaVersion: 9, cfg: { hoverActivationDistance: 'bad' } }, schema)

  assert.equal(schema.schemaVersion, 12)
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

  assert.equal(schema.schemaVersion, 12)
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
