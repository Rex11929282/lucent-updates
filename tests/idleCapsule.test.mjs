import test from 'node:test'
import assert from 'node:assert/strict'

import { idleCapsulePresentation } from '../src/idleCapsule.js'
import { createTranslator } from '../src/i18n.js'

test('idle capsule gives a clear non-playing prompt when NetEase is absent and no room is joined', () => {
  assert.deepEqual(idleCapsulePresentation({ roomMode: null, song: null }), {
    line: '尚未開啟網易雲，也尚未加入房間',
    songName: '璃音 Lucent',
    state: 'idle',
  })
})

test('a member waits for the host rather than inventing local playback', () => {
  assert.equal(idleCapsulePresentation({ roomMode: 'member', song: null }).line, '已加入房間，等待房主播放')
})

test('a detected song with unfinished data reports loading without flowing lyrics', () => {
  assert.equal(idleCapsulePresentation({ roomMode: null, song: { id: '1', loading: true } }).state, 'loading')
})

test('idle capsule uses the active locale when a translator is provided', () => {
  const t = createTranslator('en-US')
  assert.equal(idleCapsulePresentation({ roomMode: null, song: null, t }).line, 'Open NetEase or join a room to begin')
  assert.equal(idleCapsulePresentation({ roomMode: 'member', song: null, t }).line, 'Joined the room; waiting for the host')
})
