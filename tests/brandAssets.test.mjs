import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const src = (name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('封面與唱片頭像是兩張不同的圖，不再共用同一張 promo', () => {
  const brand = src('brandAssets.js')
  assert.match(brand, /lucent-cover\.svg/)
  assert.match(brand, /lucent-avatar\.png/)
  assert.ok(fs.existsSync(new URL('../src/assets/lucent-cover.svg', import.meta.url)))
  assert.ok(fs.existsSync(new URL('../src/assets/lucent-avatar.png', import.meta.url)))
})

test('美術資源要用 import，寫死絕對路徑在 file:// 下會載不到', () => {
  // base 是 './'，打包後用 file:// 開；JS 字串裡的 '/xxx.svg' Vite 不會改寫，
  // 會被解讀成 file:///D:/xxx.svg 而失敗（舊的唱片頭像就是這樣壞掉的）。
  const brand = src('brandAssets.js')
  assert.match(brand, /^import coverAsset from '\.\/assets\/lucent-cover\.svg'$/m)
  assert.match(brand, /^import avatarAsset from '\.\/assets\/lucent-avatar\.png'$/m)

  // 註解裡會出現反例說明，先把註解去掉再檢查實際程式碼
  const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const file of ['App.jsx', 'ConsoleWindow.jsx', 'brandAssets.js']) {
    assert.doesNotMatch(stripComments(src(file)), /['"`]\/lucent-[\w-]+\.(svg|png)['"`]/,
      `${file} 不該用根目錄絕對路徑引用美術資源`)
  }
})

test('預覽藥丸的封面與頭像分別使用各自的資源', () => {
  const consoleSrc = src('ConsoleWindow.jsx')
  assert.match(consoleSrc, /coverUrl=\{LUCENT_COVER_ASSET\}/)
  assert.match(consoleSrc, /avatarUrl=\{LUCENT_AVATAR_ASSET\}/)
  assert.notEqual(
    consoleSrc.match(/coverUrl=\{(\w+)\}/)[1],
    consoleSrc.match(/avatarUrl=\{(\w+)\}/)[1],
  )
})

test('待機中的桌面藥丸也用璃音自己的封面與頭像', () => {
  const app = src('App.jsx')
  assert.match(app, /standby \? LUCENT_COVER_ASSET/)
  assert.match(app, /standby \? LUCENT_AVATAR_ASSET/)
})

test('唱片頭像跟首頁的桌寵用同一套毛色，看起來是同一隻', async () => {
  const { FUR, CREAM, EYE } = await import('../scripts/catRender.cjs')
  // 兩張圖都由同一支算圖程式產生，色盤自然一致；
  // 這裡守住的是「色盤仍是灰褐虎斑」而不是舊的橘貓。
  assert.ok(FUR.includes('#a89572'), '主毛色應為灰褐')
  assert.ok(CREAM.includes('#e2d7bf'), '腹部應為奶油色')
  assert.equal(EYE, '#a8bd5e', '眼睛應為榛綠')
  for (const retired of ['#e08b46', '#c26e33', '#f4b66b', '#e98d44']) {
    assert.ok(!FUR.includes(retired), `不該還有舊橘貓色 ${retired}`)
  }
  assert.ok(fs.existsSync(new URL('../src/assets/lucent-avatar.png', import.meta.url)))
})
