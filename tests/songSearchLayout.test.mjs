import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

const block = (selector) => {
  const at = css.indexOf(selector)
  assert.notEqual(at, -1, `找不到樣式 ${selector}`)
  return css.slice(at, css.indexOf('}', at))
}

test('歌曲搜尋用的是自己的樣式，不跟一般小輸入框共用', () => {
  assert.match(source, /className="searchbar searchbar--song"/)
  assert.match(source, /className="results results--song"/)
})

test('輸入框放大而不是把字縮小', () => {
  const input = block('.searchbar--song input {')
  assert.match(input, /height: 44px/)
  assert.match(input, /font-size: 15px/)
  assert.match(input, /padding: 0 14px/)
  // 一般 .searchbar input 是 32px / 13px，歌曲搜尋必須比它大
  const generic = block('.searchbar input {')
  const genericHeight = Number(generic.match(/height: (\d+)px/)[1])
  const songHeight = Number(input.match(/height: (\d+)px/)[1])
  assert.ok(songHeight > genericHeight, '歌曲搜尋框要比一般輸入框高')
  const genericFont = Number(generic.match(/font-size: ([\d.]+)px/)[1])
  const songFont = Number(input.match(/font-size: ([\d.]+)px/)[1])
  assert.ok(songFont > genericFont, '字要變大，不是變小')
})

test('輸入框不會把搜尋按鈕擠掉', () => {
  assert.match(block('.searchbar input {'), /min-width: 0/)
  assert.match(block('.searchbar .btn {'), /flex: none/)
  assert.match(block('.searchbar--song .btn {'), /min-width: 88px/)
})

test('按鈕不能佔滿整條列把輸入框壓扁', () => {
  // .btn 預設 width:100%；在 flex 列裡配上 flex:none，按鈕會吃掉整列寬度，
  // 輸入框只剩幾十 px —— 這才是搜尋框看起來「太小」的真正原因。
  assert.match(block('.searchbar .btn {'), /width: auto/)
})

test('長歌名折兩行，而不是被切掉一半', () => {
  const meta = block('.results--song .meta b {')
  assert.match(meta, /white-space: normal/)
  assert.match(meta, /-webkit-line-clamp: 2/)
  assert.match(meta, /font-size: 14\.5px/)
  assert.doesNotMatch(css, /\.results \.meta b, \.nowplaying b/)
})

test('沒有封面時有替代圖，不會出現破圖', () => {
  assert.match(source, /results__noart/)
  assert.match(block('.results--song img,'), /width: 52px/)
})

test('視窗變窄時搜尋列會換行而不是被壓爛', () => {
  assert.match(css, /@media \(max-width: 620px\) \{[\s\S]{0,220}\.searchbar--song \{ flex-wrap: wrap; \}/)
})

test('搜尋中會顯示狀態，使用者知道有在動', () => {
  assert.match(source, /\{busy \? `\$\{t\('player\.searching'\)\}…` : t\('player\.search'\)\}/)
  // 提示文字與無障礙標籤也要跟著語言走
  assert.match(source, /placeholder=\{t\('player\.searchPlaceholder'\)\}/)
  assert.match(source, /aria-label=\{t\('player\.searchPlaceholder'\)\}/)
})

test('大量搜尋結果只在清單內捲動，不把播放器推離畫面', () => {
  const results = block('.results--song {')
  assert.match(results, /max-height: 320px/)
  assert.match(results, /overflow-y: auto/)
  assert.match(results, /overscroll-behavior: contain/)
})
