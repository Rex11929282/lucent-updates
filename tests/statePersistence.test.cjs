const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')

// 這組測試守的是一次真實的資料遺失：
// 存檔原本只有 400ms debounce，沒有任何離開前的強制寫入，
// 使用者按下「儲存目前外觀」後隨手關掉程式，那組具名配置就整組消失。
test('離開前一定會把還沒寫出去的設定寫掉', () => {
  assert.match(main, /function flushState\(\)/, '需要一個 flush 函式')
  assert.match(main, /if \(saveTimer\) writeStateNow\(\)/, 'flush 必須真的同步寫檔')
  for (const hook of ['before-quit', 'will-quit', 'window-all-closed']) {
    assert.match(main, new RegExp(`app\\.on\\('${hook}', flushState\\)`), `${hook} 要接上 flush`)
  }
  assert.match(main, /function requestFinalQuit\(\)[\s\S]{0,120}flushState\(\)/, '主動結束前要先 flush')
})

test('具名配置不等 debounce，立即落地', () => {
  // profiles 是使用者手動調出來的，掉了重建不回來，不能承受 400ms 的空窗
  assert.match(main, /saveState\(\{ immediate: 'profiles' in patch \}\)/)
  assert.match(main, /function saveState\(\{ immediate = false \} = \{\}\)/)
  assert.match(main, /if \(immediate\) \{ writeStateNow\(\); return \}/)
})

test('高頻變動仍然維持 debounce，不會每動一下就寫檔', () => {
  // 拖曳視窗、拉滑桿這種每秒好幾十次的變更如果每次都同步寫檔會卡
  assert.match(main, /saveTimer = setTimeout\(writeStateNow, 400\)/)
})
