import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createTranslator, LOCALE_IDS } from '../src/i18n.js'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const lookTab = source.slice(source.indexOf('function LookTab'))
const withoutComments = lookTab
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

test('appearance settings do not contain user-facing hardcoded Chinese', () => {
  assert.doesNotMatch(withoutComments, /[一-龥]/)
})

test('appearance settings use translated labels for the previously hardcoded groups', () => {
  for (const key of [
    'ui.look.background.title',
    'ui.look.progress.title',
    'ui.look.effects.title',
    'ui.look.animation.title',
    'ui.look.window.title',
    'ui.look.frame.none',
    'ui.look.frame.classic',
  ]) {
    const isDynamicFrameKey = key.startsWith('ui.look.frame.')
    assert.ok(
      source.includes(`t('${key}'`)
        || source.includes(`t("${key}"`)
        || source.includes(`t(\`${key}\``)
        || (isDynamicFrameKey && source.includes('t(`ui.look.frame.${frame.id}`')),
      key,
    )
  }
})

test('new console UI keys never fall back to a raw key', () => {
  for (const locale of LOCALE_IDS) {
    const t = createTranslator(locale)
    assert.notEqual(t('ui.look.background.title'), 'title')
    assert.notEqual(t('ui.look.progress.title'), 'title')
    assert.notEqual(t('ui.look.effects.title'), 'title')
  }
})

test('close failures use the runtime error localizer', () => {
  const closeStart = source.indexOf('const chooseClose = async')
  const closeEnd = source.indexOf('const mainPanels =', closeStart)
  const closeHandler = source.slice(closeStart, closeEnd)
  assert.match(closeHandler, /result\?\.error\s*\?\s*localizeRuntimeMessage\(t, result(?:\?\.|\.)error, 'console\.closeError'\)\s*:\s*t\('console\.closeError'\)/)
  assert.doesNotMatch(closeHandler, /message:\s*result\?\.error\s*\|\|/)
})

test('empty appearance profile names use a localized fallback', () => {
  const lookStart = source.indexOf('function LookTab')
  const lookEnd = source.indexOf('// =================', lookStart + 20)
  const look = source.slice(lookStart, lookEnd > lookStart ? lookEnd : undefined)
  assert.match(look, /t\('look\.profiles\.defaultName'\)/)
  for (const locale of LOCALE_IDS) {
    const value = createTranslator(locale)('look.profiles.defaultName')
    assert.notEqual(value, 'defaultName')
    assert.notEqual(value, 'look.profiles.defaultName')
  }
})

test('room defaults and copied invites follow runtime language switching', () => {
  assert.match(source, /useLocalizedDefault\('ui\.room\.defaultName'\)/)
  assert.match(source, /useLocalizedDefault\('ui\.room\.defaultHost'\)/)
  assert.match(source, /useLocalizedDefault\('ui\.room\.defaultListener'\)/)
  assert.match(source, /useLocalizedDefault\('ui\.room\.defaultStyle'\)/)
  assert.match(source, /title:\s*`璃音 Lucent · \$\{t\('ui\.room\.copyInvite'\)\}`/)
})

test('room feedback severity does not depend on Traditional Chinese words', () => {
  assert.match(source, /queueNoticeTone/)
  assert.doesNotMatch(source, /queueNotice\.includes\('失敗'\)/)
  assert.doesNotMatch(source, /queueNotice\.includes\('拒絕'\)/)
})

test('room style response listener rebinds when the runtime language changes', () => {
  const listenerStart = source.indexOf('ov.room.pendingOffers()')
  const listenerEnd = source.indexOf('const roomInvitePayload', listenerStart)
  const listenerEffect = source.slice(listenerStart, listenerEnd)

  assert.match(listenerEffect, /onStyleResponse\([\s\S]*?t\('ui\.room\.accepted'\)/)
  assert.match(listenerEffect, /\}, \[t\]\)/)
})

test('async playback and playlist feedback refreshes with the runtime language', () => {
  const playlistStart = source.indexOf('ov.netease.userPlaylists()')
  const playlistEnd = source.indexOf('const createLocal', playlistStart)
  const playlistEffect = source.slice(playlistStart, playlistEnd)
  assert.match(playlistEffect, /t\('ui\.playlist\.readCloudFailed'\)/)
  assert.match(playlistEffect, /\}, \[profile\?\.userId, t\]\)/)

  const playbackStart = source.indexOf('if (!commandResult) return', playlistEnd)
  const playbackEnd = source.indexOf('if (!displayedPlayer.playing', playbackStart)
  const playbackEffect = source.slice(playbackStart, playbackEnd)
  assert.match(playbackEffect, /t\('player\.sentToHost'\)/)
  assert.match(playbackEffect, /\}, \[commandResult, t\]\)/)
})

test('NetEase QR polling reads the latest runtime translator', () => {
  const accountStart = source.indexOf('function AccountBox')
  const accountEnd = source.indexOf('function PrivacyBox', accountStart)
  const account = source.slice(accountStart, accountEnd)
  assert.match(account, /const tRef = useRef\(t\)/)
  assert.match(account, /useEffect\(\(\) => \{\s*tRef\.current = t\s*\}, \[t\]\)/)
  assert.match(account, /setStatus\(tRef\.current\('player\.loginQrWaiting'\)\)/)
  assert.match(account, /nickname: tRef\.current\('player\.loggedIn'\)/)
})
