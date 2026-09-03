import assert from 'node:assert/strict'
import test from 'node:test'
import { CONSOLE_PAGE_IDS, normalizeConsolePage } from '../src/consoleNavigation.js'

test('新版控制台保留首頁、播放、外觀、房間、設定與幫助導覽', () => {
  assert.deepEqual(CONSOLE_PAGE_IDS, ['home', 'play', 'look', 'room', 'settings', 'help'])
})

test('未知或缺少的控制台頁面一律回到首頁', () => {
  assert.equal(normalizeConsolePage(), 'home')
  assert.equal(normalizeConsolePage('unknown'), 'home')
  assert.equal(normalizeConsolePage('room'), 'room')
})
