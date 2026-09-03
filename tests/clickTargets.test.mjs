import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const block = (selector) => {
  const at = css.indexOf(selector)
  assert.notEqual(at, -1, `找不到樣式 ${selector}`)
  return css.slice(at, css.indexOf('}', at))
}

// 這組測試守的是一個實際回報過兩次的 bug：「區網位址的複製鈕按不動」。
// 原因不是事件或剪貼簿，是命中測試 —— 點擊穿過按鈕打到父層。
test('3D 卡片不使用 preserve-3d', () => {
  // preserve-3d 會把子元素推進 3D 空間；按鈕自己也有 transform
  // （hover 位移、按下下沉），兩者相遇時 Chromium 的命中測試會算錯，
  // 而且偏偏是 hover 之後才失效，正好是使用者要按下去的那一刻。
  const card = block('.card3d {')
  assert.doesNotMatch(card, /transform-style/, '.card3d 不該用 preserve-3d')
  const lift = block('.card3d__lift {')
  assert.doesNotMatch(lift, /transform-style/, '.card3d__lift 不該用 preserve-3d')
  assert.doesNotMatch(lift, /translateZ/, '內容層不該再做 Z 位移')
  // 傾斜本身要保留，立體感是靠它
  assert.match(card, /perspective\(900px\) rotateX\(var\(--rx/)
})

test('按鈕不加多餘的 translateZ(0)', () => {
  const buttons = block('.btn, .mini-action, .console-nav button {')
  assert.doesNotMatch(buttons, /translateZ/,
    'translateZ(0) 在 3D 情境下會讓按鈕收不到點擊，而且對效能沒有必要')
  assert.match(buttons, /position: relative/)
  assert.match(buttons, /overflow: hidden/)
})

test('通知不會蓋住標題列的關閉鈕', () => {
  // 關閉鈕在標題列右上角；toast 原本 top:16px 會壓在它上面，
  // 只要有通知跳出來就關不掉視窗。
  const toast = block('.console-toast {')
  const top = Number(toast.match(/top:(\d+)px/)[1])
  assert.ok(top >= 60, `toast 的 top 是 ${top}px，會壓到標題列`)
})

test('裝飾用的圖層不吃點擊', () => {
  // 卡片的反光與邊緣光是純裝飾，必須讓點擊穿過去
  for (const sel of ['.card3d::before {', '.card3d::after {']) {
    assert.match(block(sel), /pointer-events: none/, `${sel} 必須 pointer-events:none`)
  }
  assert.match(block('.ripple {'), /pointer-events: none/)
})
