import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {
  FALLBACK_LOCALE, LOCALES, LOCALE_IDS, LOCALE_NAMES,
  createTranslator, formatDateTime, formatNumber,
  detectedMediaSourceLabel, detectedMediaStatusLabel,
  playbackSourceLabel, resolveLocale, resolveSystemLocale,
} from '../src/i18n.js'

test('支援文件要求的十一種語言', () => {
  for (const id of ['en-US', 'zh-TW', 'zh-CN', 'ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'ru-RU', 'it-IT']) {
    assert.ok(LOCALES[id], `缺少語言 ${id}`)
    assert.ok(LOCALE_NAMES[id], `${id} 缺少語言名稱`)
  }
  assert.equal(LOCALE_IDS.length, 11)
})

test('每個語言都補齊了英文有的所有鍵，不留半翻譯', () => {
  const base = Object.keys(LOCALES[FALLBACK_LOCALE]).sort()
  for (const id of LOCALE_IDS) {
    const missing = base.filter((key) => typeof LOCALES[id][key] !== 'string')
    assert.deepEqual(missing, [], `${id} 缺少：${missing.join(', ')}`)
  }
})

test('沒有語言留著未翻譯的英文原文', () => {
  // 品牌名不翻譯
  const brands = new Set(['source.desktop-spotify', 'source.desktop-youtube-music', 'source.desktop-netease', 'ui.preview.song'])
  // 這些是「該語言本來就跟英文同字」，不是漏翻。列成白名單才不會被誤判，
  // 也讓之後真的漏翻時測試仍然會抓到。
  const sameByNature = new Set([
    'de-DE|player.pause',            // Pause
    'fr-FR|player.pause',            // Pause
    'fr-FR|player.source',           // Source
    'fr-FR|look.layout.align.center', // Centre
    'fr-FR|settings.startup.console', // Console
    'it-IT|settings.startup.console',
    'pt-BR|settings.startup.console',
    'it-IT|nav.home',                // Home（義大利文介面常用）
  ])
  for (const id of LOCALE_IDS) {
    if (id === FALLBACK_LOCALE) continue
    for (const [key, value] of Object.entries(LOCALES[FALLBACK_LOCALE])) {
      if (brands.has(key) || sameByNature.has(`${id}|${key}`)) continue
      assert.notEqual(LOCALES[id][key], value, `${id} 的 "${key}" 仍是英文原文："${value}"`)
    }
  }
})

test('系統語言對應：繁簡中文要分得出來', () => {
  assert.equal(resolveSystemLocale('zh-TW'), 'zh-TW')
  assert.equal(resolveSystemLocale('zh-HK'), 'zh-TW')
  assert.equal(resolveSystemLocale('zh-Hant-TW'), 'zh-TW')
  assert.equal(resolveSystemLocale('zh-CN'), 'zh-CN')
  assert.equal(resolveSystemLocale('zh-Hans'), 'zh-CN')
  assert.equal(resolveSystemLocale('zh'), 'zh-CN')
})

test('系統語言對應：其他語言用語言碼就夠', () => {
  assert.equal(resolveSystemLocale('en-GB'), 'en-US')
  assert.equal(resolveSystemLocale('ja'), 'ja-JP')
  assert.equal(resolveSystemLocale('ko-KR'), 'ko-KR')
  assert.equal(resolveSystemLocale('pt-PT'), 'pt-BR')
  assert.equal(resolveSystemLocale('de-AT'), 'de-DE')
  assert.equal(resolveSystemLocale('ru'), 'ru-RU')
})

test('對不上的系統語言退回英文，不會壞掉', () => {
  assert.equal(resolveSystemLocale('sv-SE'), FALLBACK_LOCALE)
  assert.equal(resolveSystemLocale(''), FALLBACK_LOCALE)
  assert.equal(resolveSystemLocale(undefined), FALLBACK_LOCALE)
})

test('使用者選過語言之後，就不再被系統語言蓋掉', () => {
  assert.equal(resolveLocale('ja-JP', 'zh-TW'), 'ja-JP', '明確選擇要贏過系統偵測')
  assert.equal(resolveLocale('auto', 'ja-JP'), 'ja-JP', 'auto 才跟隨系統')
  assert.equal(resolveLocale(undefined, 'ko-KR'), 'ko-KR')
  assert.equal(resolveLocale('不存在的語言', 'ja-JP'), 'ja-JP', '無效值安全退回系統偵測')
})

test('缺鍵時退回英文，而不是把鍵名秀給使用者看', () => {
  const missing = []
  const t = createTranslator('ja-JP', { onMissing: (key) => missing.push(key) })
  assert.equal(t('nav.home'), 'ホーム')
  // 這個鍵哪個語言都沒有：不能顯示 "totally.made.up.key"
  const value = t('totally.made.up.key')
  assert.doesNotMatch(value, /\./, '不能把整串鍵名丟給使用者')
  assert.equal(value, 'key')
  assert.ok(missing.includes('totally.made.up.key'), '開發模式要能回報缺鍵')
})

test('變數會被代入', () => {
  const t = createTranslator('en-US')
  assert.equal(t('player.queuePosition', { index: 3, total: 12 }), 'Track 3 of 12')
  assert.equal(t('room.copiedAddress', { address: '192.168.1.5:8787' }), 'Copied 192.168.1.5:8787')
  // 沒給的變數保持原樣，不會變成 "undefined"
  assert.match(t('player.queuePosition', { index: 3 }), /\{total\}/)
})

test('播放來源：內部 ID 不翻譯，只翻顯示名稱', () => {
  const en = createTranslator('en-US')
  const ja = createTranslator('ja-JP')
  assert.equal(playbackSourceLabel(en, 'desktop-spotify'), 'Spotify')
  assert.equal(playbackSourceLabel(ja, 'internal-player'), 'アプリ内プレーヤー')
  assert.equal(playbackSourceLabel(en, 'internal-player'), 'Lucent player')
  // 未知來源不能把 ID 直接秀出來
  assert.equal(playbackSourceLabel(en, 'brand-new-player'), 'Unknown source')
})

test('偵測來源的後端狀態與來源名稱會翻譯，但未知程式名稱保持可辨識', () => {
  for (const id of LOCALE_IDS) {
    const t = createTranslator(id)
    assert.equal(detectedMediaStatusLabel(t, 'Playing'), t('player.playing'), `${id} 播放狀態`)
    assert.equal(detectedMediaStatusLabel(t, 'Paused'), t('player.paused'), `${id} 暫停狀態`)
    assert.equal(detectedMediaStatusLabel(t, '視窗標題'), t('player.windowTitle'), `${id} 視窗標題`)
    assert.equal(detectedMediaSourceLabel(t, '網易雲桌面版'), t('source.desktop-netease'), `${id} 網易雲來源`)
  }
  const en = createTranslator('en-US')
  assert.equal(detectedMediaSourceLabel(en, 'chrome.exe'), 'chrome.exe')
})

test('標點跟著語言走，不會把全形冒號套到英文上', () => {
  // 「來源：X」在英文應該是 "Source: X"，不能沿用中文的全形冒號。
  // 所以整行都要是翻譯字串，而不是在 JSX 裡硬接一個冒號。
  assert.equal(LOCALES['en-US']['player.sourceLine'], 'Source: {name}')
  assert.equal(LOCALES['zh-TW']['player.sourceLine'], '來源：{name}')
  assert.equal(LOCALES['fr-FR']['player.sourceLine'], 'Source : {name}', '法文冒號前要有空格')
  for (const id of LOCALE_IDS) {
    assert.match(LOCALES[id]['player.sourceLine'], /\{name\}/, `${id} 少了 {name} 佔位`)
  }
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  assert.match(source, /t\('player\.sourceLine', \{ name: playbackSourceLabel/)
})

test('日期用 app 選的語言格式化，不是系統語言', () => {
  const at = new Date('2026-08-28T14:05:00Z')
  const en = formatDateTime('en-US', at)
  const de = formatDateTime('de-DE', at)
  const ja = formatDateTime('ja-JP', at)
  for (const value of [en, de, ja]) assert.ok(value.length > 0)
  // 各語系的日期寫法本來就不同，相同才是可疑
  assert.notEqual(en, de)
  assert.notEqual(en, ja)
  assert.match(de, /2026/)
})

test('無效日期不會顯示 Invalid Date', () => {
  assert.equal(formatDateTime('en-US', 'not a date'), '')
  assert.equal(formatDateTime('en-US', undefined), '')
})

test('數字用在地化寫法：德文小數點是逗號', () => {
  assert.equal(formatNumber('en-US', 1.25, { digits: 2 }), '1.25')
  assert.equal(formatNumber('de-DE', 1.25, { digits: 2 }), '1,25')
  assert.equal(formatNumber('en-US', 0.5, { digits: 2, unit: '×' }), '0.50×')
  // 壞值不會變成 NaN 出現在畫面上
  assert.equal(formatNumber('en-US', 'abc'), '')
})

test('畫面實際用了在地化的日期與數字', () => {
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  assert.match(source, /formatDateTime\(locale, offer\.createdAt\)/)
  assert.match(source, /formatDateTime\(locale, profile\.updatedAt\)/)
  assert.match(source, /fmt \? fmt\(value\) : formatNumber\(locale, value\)/)
  // toLocaleString() 不帶語言會沿用系統語言，等於忽略使用者的選擇。
  // 註解裡會提到這個反例，所以先把註解去掉再檢查真正的程式碼。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /toLocaleString\(\)/, '不該用不帶語言的 toLocaleString()')
})

test('字型後備涵蓋所有支援語言的文字系統', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const stack = css.slice(css.indexOf('font-family:'), css.indexOf('font-family:') + 320)
  for (const [font, why] of [
    ['Microsoft JhengHei', '繁體中文'],
    ['Microsoft YaHei', '簡體中文'],
    ['Yu Gothic UI', '日文'],
    ['Malgun Gothic', '韓文'],
  ]) {
    assert.ok(stack.includes(font), `缺少${why}字型 ${font}，會出現豆腐字或用錯字形`)
  }
})

test('console-ui 那一層也每個語言都補齊，不是只有英文有', () => {
  // 翻譯分三層：base → overrides → console-ui。前兩層由 LOCALES 檢查，
  // 第三層在模組內部（沒有匯出），所以改用翻譯結果反推：
  // 同一個鍵在不同語言必須得到不同字串，相同就代表退回英文了。
  const ids = LOCALE_IDS.filter((id) => id !== 'en-US')
  const en = createTranslator('en-US')
  // 刻意挑「多字詞組」當樣本：像 ui.home.label（英文 "Home"）這種單字，
  // 義大利文本來就同樣是 "Home"，用它判斷會誤判成沒翻譯。
  const samples = ['ui.status.showPill', 'ui.status.lyricRule', 'ui.home.waitingTitle']
  for (const key of samples) {
    const english = en(key)
    // 缺鍵時會退回「鍵名最後一段」，拿它來判斷是不是真的有翻譯
    assert.notEqual(english, key.split('.').pop(), `${key} 沒有英文字串，退到了鍵名`)
    for (const id of ids) {
      const value = createTranslator(id)(key)
      assert.notEqual(value, english, `${id} 的 "${key}" 退回了英文，代表這一層沒翻`)
    }
  }
})

test('翻譯層數再多，缺鍵仍然不會把鍵名秀出來', () => {
  for (const id of LOCALE_IDS) {
    const value = createTranslator(id)('ui.definitely.not.a.real.key')
    assert.doesNotMatch(value, /\./, `${id} 把鍵名整串丟出來了`)
  }
})

test('語言設定會被保存，預設跟隨系統', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../shared/defaults.json', import.meta.url), 'utf8'))
  assert.equal(schema.ui.locale, 'auto')
})

test('控制台實際接上了 i18n，而不是只有檔案放著', () => {
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  assert.match(source, /const I18nContext = createContext/)
  assert.match(source, /<I18nContext\.Provider value=\{t\}>/)
  assert.match(source, /resolveLocale\(state\.ui\?\.locale, systemLocale\)/, '要讀使用者的選擇與系統語言')
  assert.match(source, /setUi\(\{ locale: e\.target\.value \}\)/, '要有語言選單')
  assert.match(source, /t\(`nav\.\$\{id\}`\)/, '導覽列要走翻譯')
  // 切換語言不該需要重開程式
  assert.doesNotMatch(source, /location\.reload\(\)[^\n]*locale/i)
})

test('關閉對話框、幫助頁與首次教學都走 i18n，不再固定顯示中文', () => {
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  for (const key of [
    'common.dismissNotification',
    'close.title',
    'close.body',
    'close.remember',
    'help.title',
    'help.step1',
    'help.step4',
    'help.openPill',
    'onboarding.aria',
    'onboarding.welcome.title',
    'onboarding.reopen.body',
    'onboarding.next.body',
    'common.skip',
    'common.next',
    'common.getStarted',
  ]) {
    assert.ok(source.includes(`'${key}'`), `畫面尚未接上 ${key}`)
  }
  assert.match(source, /const ONBOARDING_PAGES = \[[\s\S]*?'onboarding\.welcome\.tag'[\s\S]*?'onboarding\.reopen\.tag'[\s\S]*?'onboarding\.next\.tag'/)
  assert.match(source, /t\(page\.tag\)/)
  assert.match(source, /t\(page\.title\)/)
  assert.match(source, /t\(page\.body\)/)
})

test('外觀頁的預覽、快速配置與常用藥丸設定會跟著介面語言切換', () => {
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  const look = source.slice(source.indexOf('function LookTab'), source.indexOf('<div className="group">🧭 歌詞排版'))
  for (const key of [
    'look.preview.play',
    'look.hints.show',
    'look.section.quick',
    'look.random',
    'look.profiles.save',
    'look.section.basic',
    'look.skin',
    'look.vinyl.show',
    'look.songName.position',
    'look.bilingual',
    'look.highlight',
    'look.fillColor.cover',
  ]) assert.ok(look.includes(`t('${key}')`), `外觀頁尚未接上 ${key}`)
  assert.doesNotMatch(look, /label="(?:播放裝飾預覽|顯示設定說明|唱片頭像|顯示歌名|雙語歌詞)"/)
})

test('外觀頁的歌詞排版、字體與可讀性設定會跟著介面語言切換', () => {
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  const start = source.indexOf("<div className=\"group\">{t('look.layout.title')}</div>")
  const end = source.indexOf('{/* ---------- 背景材質 ---------- */}', start)
  assert.notEqual(start, -1, '找不到歌詞排版設定區')
  assert.notEqual(end, -1, '找不到背景材質分界')
  const look = source.slice(start, end)
  for (const key of [
    'look.layout.title',
    'look.layout.style',
    'look.layout.align',
    'look.layout.hint',
    'look.typography.title',
    'look.font.lyric',
    'look.font.translation',
    'look.textStyle',
    'look.fontWeight.lyric',
    'look.translationScale',
    'look.readability.title',
    'look.fontSize',
    'look.maxWidth',
    'look.outline',
    'look.lyricAlpha',
    'look.clarity',
    'look.translationGap',
    'look.progressGap',
    'look.clarity.tip',
    'look.songNameAlpha',
    'look.songNameColor',
    'look.textColor',
  ]) assert.ok(look.includes(`t('${key}')`), `外觀頁尚未接上 ${key}`)
  for (const expression of [
    't(`look.layout.${id}`)',
    't(`look.font.${font.id}`)',
    't(`look.textStyle.${style.id}`)',
  ]) assert.ok(look.includes(expression), `動態選項尚未接上 ${expression}`)
  assert.doesNotMatch(look, /(?:歌詞排版|排版樣式|字體與文字微調|字幕尺寸與可讀性|原文字體|翻譯字體|文字風格|歌詞清晰度)/)
})
