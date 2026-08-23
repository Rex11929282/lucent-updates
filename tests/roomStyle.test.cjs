const test = require('node:test')
const assert = require('node:assert/strict')
const { sharedAppearanceStyle } = require('../shared/roomStyle.cjs')

test('房間共享所有外觀與歌詞參數但保留個人視窗行為', () => {
  const result = sharedAppearanceStyle({
    glass: { blurAmount: 0.4 },
    cfg: {
      textClarity: 0.9,
      progressAnim: 'bounce',
      segmentCount: 18,
      offset: 0.2,
      borderRGB: true,
      alwaysOnTop: true,
      clickThrough: true,
      locked: true,
      safeMargin: 12,
      snapMode: 'strong',
    },
  })

  assert.equal(result.cfg.textClarity, 0.9)
  assert.equal(result.cfg.progressAnim, 'bounce')
  assert.equal(result.cfg.segmentCount, 18)
  assert.equal('offset' in result.cfg, false)
  assert.equal('borderRGB' in result.cfg, false)
  assert.equal('alwaysOnTop' in result.cfg, false)
  assert.equal('clickThrough' in result.cfg, false)
  assert.equal('locked' in result.cfg, false)
  assert.deepEqual(result.glass, { blurAmount: 0.4 })
})

test('LAN 視覺共享會包含全部裝飾粒子設定', async () => {
  const { resetDecorationConfig } = await import('../src/appearanceModel.js')
  const decoration = resetDecorationConfig()
  const result = sharedAppearanceStyle({
    cfg: {
      ...decoration,
      clickThrough: true,
      alwaysOnTop: true,
    },
  })

  assert.deepEqual(Object.keys(result.cfg).sort(), Object.keys(decoration).sort())
  for (const [key, value] of Object.entries(decoration)) assert.deepEqual(result.cfg[key], value, key)
  assert.equal('clickThrough' in result.cfg, false)
  assert.equal('alwaysOnTop' in result.cfg, false)
})
