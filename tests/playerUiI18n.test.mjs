import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createTranslator, LOCALE_IDS } from '../src/i18n.js'
import { localizePlayerError } from '../src/playerErrors.js'

test('player failures are translated instead of exposing backend Chinese', () => {
  const en = createTranslator('en-US')
  const de = createTranslator('de-DE')
  assert.equal(localizePlayerError(en, '請先登入網易雲'), 'Log in to NetEase Cloud Music first')
  assert.notEqual(localizePlayerError(de, '電腦上的網易雲正在播放'), localizePlayerError(en, '電腦上的網易雲正在播放'))
  assert.match(localizePlayerError(en, 'PLAYER_NO_PLAYABLE_SOURCE'), /playable|source/i)
})

test('all supported locales contain the player error labels', () => {
  const mapper = fs.readFileSync(new URL('../src/playerErrors.js', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  for (const key of [
    'player.error.invalidId', 'player.error.loginRequired', 'player.error.noPlayableSource',
    'player.error.mediaLoadFailed', 'player.error.neteaseActive', 'player.error.otherPlayerActive',
  ]) {
    assert.match(mapper, new RegExp(key.replaceAll('.', '\\.'), 's'))
  }
  assert.match(source, /localizePlayerError/)
  for (const locale of LOCALE_IDS) {
    const t = createTranslator(locale)
    assert.notEqual(t('player.error.loginRequired'), 'player.error.loginRequired')
    assert.notEqual(t('player.error.noPlayableSource'), 'player.error.noPlayableSource')
  }
})

test('browser player error mapper does not import a Node-only CommonJS module', () => {
  const mapper = fs.readFileSync(new URL('../src/playerErrors.js', import.meta.url), 'utf8')
  assert.doesNotMatch(mapper, /^\s*import .*playerErrors\.cjs/m)
  assert.match(mapper, /const PLAYER_ERROR_CODES = Object\.freeze\(/)
  assert.match(mapper, /function playerErrorCode\(value\)/)
})
