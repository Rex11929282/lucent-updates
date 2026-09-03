import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const playTab = source.slice(source.indexOf('function PlayTab'), source.indexOf('// ================= 外觀'))

test('播放頁把播放錯誤交給可翻譯的錯誤映射器', () => {
  assert.match(source, /import \{ localizePlayerError \} from ['"]\.\/playerErrors\.js['"]/) 
  assert.match(playTab, /localizePlayerError\(t,/) 
  for (const text of ['搜尋失敗', '操作失敗', '歌曲目前無法播放', '音量設定失敗', '軟體內播放網易雲']) {
    assert.doesNotMatch(playTab, new RegExp(text), `播放頁不應硬編碼 ${text}`)
  }
})

test('播放頁的登入、同步與播放器狀態使用 i18n keys', () => {
  const account = source.slice(source.indexOf('function AccountBox'), source.indexOf('function PrivacyBox'))
  for (const key of [
    'player.internalTitle', 'player.preciseTitle', 'player.desktopTitle',
    'player.syncSourceTitle', 'player.volume', 'player.requestSong',
  ]) {
    assert.ok(playTab.includes(`t('${key}')`), key)
  }
  for (const key of ['player.accountTitle', 'player.login', 'player.logout', 'player.cancel']) {
    assert.ok(account.includes(`t('${key}')`), key)
  }
})

test('播放器載入中不把後端固定中文載入字串當成歌名渲染', () => {
  assert.match(playTab, /const displayedTitle\s*=\s*displayedPlayer\.loading\s*\?\s*t\('player\.loading'\)/)
  assert.match(playTab, /title=\{displayedTitle\}\s*>\s*\{displayedTitle\}/)
})
