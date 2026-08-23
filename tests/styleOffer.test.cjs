const test = require('node:test')
const assert = require('node:assert/strict')

const {
  canSendStyleOffer,
  createStyleOffer,
  handleStyleOfferOnce,
  applyAcceptedStyleOffer,
} = require('../shared/styleOffer.cjs')

test('host may target all or one member while a member may target only host', () => {
  assert.equal(canSendStyleOffer('host', 'all'), true)
  assert.equal(canSendStyleOffer('host', 'member-1'), true)
  assert.equal(canSendStyleOffer('member', 'host'), true)
  assert.equal(canSendStyleOffer('member', 'member-2'), false)
})

test('style offer strips personal window, sync, playback, and room fields', () => {
  const offer = createStyleOffer({
    id: 'offer-1', sender: { id: 'host', name: '房主' }, target: 'all', name: '藍色玻璃', createdAt: 100,
    style: {
      glass: { blurAmount: 0.5 },
      cfg: { tintColor: '#00aaff', clickThrough: true, alwaysOnTop: false, locked: true, safeMargin: 24, snapMode: 'strong', offset: 2, borderRGB: true, secondsPerLine: 9, position: 'tr' },
      positionMs: 5000,
      roomName: 'secret',
    },
  })

  assert.deepEqual(offer.style.glass, { blurAmount: 0.5 })
  assert.deepEqual(offer.style.cfg, { tintColor: '#00aaff' })
  assert.equal('positionMs' in offer.style, false)
  assert.equal('roomName' in offer.style, false)
  assert.equal('position' in offer.style.cfg, false)
})

test('offer ids are handled exactly once', () => {
  const handled = new Set()
  assert.equal(handleStyleOfferOnce(handled, 'offer-1'), true)
  assert.equal(handleStyleOfferOnce(handled, 'offer-1'), false)
})

test('invalid style offers are rejected', () => {
  assert.throws(() => createStyleOffer({ id: '', sender: {}, target: '', style: {} }))
})

test('accepting applies visual fields, preserves personal fields, and saves a named profile', () => {
  const state = {
    glass: { blurAmount: 0.1 },
    cfg: { tintColor: '#000000', clickThrough: true, offset: 1.5, borderRGB: true, position: 'bl' },
    profiles: [],
  }
  const offer = createStyleOffer({
    id: 'offer-2', sender: { id: 'host', name: '房主' }, target: 'all', name: '新外觀', createdAt: 100,
    style: { glass: { blurAmount: 0.8 }, cfg: { tintColor: '#12aaff', clickThrough: false, offset: 9, borderRGB: true, position: 'tr' } },
  })
  const result = applyAcceptedStyleOffer(state, offer, {
    profileId: 'profile-1', now: '2026-08-23T00:00:00.000Z', profileName: '來自 房主－2026/8/23', defaults: {},
  })

  assert.equal(result.glass.blurAmount, 0.8)
  assert.equal(result.cfg.tintColor, '#12aaff')
  assert.equal(result.cfg.clickThrough, true)
  assert.equal('offset' in result.cfg, false)
  assert.equal('borderRGB' in result.cfg, false)
  assert.equal(result.cfg.position, 'bl')
  assert.equal(result.profiles[0].id, 'profile-1')
  assert.equal(result.profiles[0].name, '來自 房主－2026/8/23')
  assert.equal('clickThrough' in result.profiles[0].cfg, false)
})
