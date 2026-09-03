const test = require('node:test')
const assert = require('node:assert/strict')
const {
  internalPlaybackEnabled,
  playerControlDecision,
  shouldPauseInternalForDesktop,
} = require('../shared/playerPolicy.cjs')

test('non-commercial packaged builds may enable internal playback explicitly', () => {
  assert.equal(internalPlaybackEnabled({ isPackaged: false, allowUnofficial: false }), true)
  assert.equal(internalPlaybackEnabled({ isPackaged: true, allowUnofficial: false }), false)
  assert.equal(internalPlaybackEnabled({ isPackaged: true, allowUnofficial: true }), true)
})

test('room members cannot control a local player and desktop source keeps authority', () => {
  assert.deepEqual(playerControlDecision({ roomMode: 'member', enabled: true, activeSource: 'room-host' }), {
    ok: false, error: '目前跟隨房主',
  })
  assert.deepEqual(playerControlDecision({ roomMode: null, enabled: true, activeSource: 'desktop-netease' }), {
    ok: false, error: '電腦上的網易雲正在播放',
  })
  assert.deepEqual(playerControlDecision({ roomMode: null, enabled: true, activeSource: 'desktop-spotify' }), {
    ok: false, error: '電腦上的其他播放器正在播放',
  })
  assert.deepEqual(playerControlDecision({ roomMode: null, enabled: true, activeSource: 'desktop-generic' }), {
    ok: false, error: '電腦上的其他播放器正在播放',
  })
  assert.deepEqual(playerControlDecision({ roomMode: 'host', enabled: true, activeSource: 'internal-player' }), { ok: true })
})

test('desktop takeover pauses an active internal source once but never requests auto-resume', () => {
  assert.equal(shouldPauseInternalForDesktop({
    previousSource: 'internal-player', desktopPlaying: true, internalPlaying: true,
  }), true)
  assert.equal(shouldPauseInternalForDesktop({
    previousSource: 'desktop-netease', desktopPlaying: true, internalPlaying: true,
  }), false)
  assert.equal(shouldPauseInternalForDesktop({
    previousSource: 'desktop-netease', desktopPlaying: false, internalPlaying: false,
  }), false)
})
