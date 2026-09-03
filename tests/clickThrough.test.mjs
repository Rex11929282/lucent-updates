import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const consoleSource = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const mainSource = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')

test('滑鼠穿透開啟後整個藥丸都不攔截遊戲操作', () => {
  assert.match(appSource, /if \(!cfg\.clickThrough\)[\s\S]*?setIgnoreMouse\(false\)/)
  assert.match(appSource, /ov\.setIgnoreMouse\(true\)/)
  assert.doesNotMatch(appSource, /elementFromPoint|closest\(['"]\.interactive['"]\)/)
})

test('設定頁清楚說明穿透狀態與解除快捷鍵', () => {
  assert.match(consoleSource, /t\('ui\.look\.window\.clickThrough'\)/)
  assert.match(consoleSource, /t\('ui\.look\.window\.clickThroughHint'\)/)
  assert.match(consoleSource, /t\('ui\.look\.window\.clickThroughTip'\)/)
  assert.match(mainSource, /CommandOrControl\+Alt\+L/)
})
