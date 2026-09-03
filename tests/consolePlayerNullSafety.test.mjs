import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { compactPlayerView } from '../src/consolePlayer.js'

// useRoom 的房間狀態初始值是 null（不是 undefined），而預設參數只對 undefined 生效。
// 讀 null.source 會在 render 當中丟例外；控制台沒有 error boundary，
// 整棵樹會直接掛掉 —— 使用者看到的是一片空白的視窗。
test('房間狀態是 null 時不會炸掉', () => {
  const view = compactPlayerView({ internalPlayer: { enabled: true }, roomState: null, roomMode: 'solo' })
  assert.equal(view.source, 'internal-player')
  assert.equal(view.providerControllable, true)
})

test('完全沒傳參數也要安全', () => {
  assert.equal(compactPlayerView().source, 'internal-player')
  assert.equal(compactPlayerView({}).source, 'internal-player')
})

test('每個欄位個別為 null 都要安全', () => {
  for (const options of [
    { internalPlayer: null },
    { roomMode: null },
    { internalPlayer: null, roomState: null, roomMode: null },
  ]) {
    assert.doesNotThrow(() => compactPlayerView(options), `compactPlayerView(${JSON.stringify(options)}) 不該丟例外`)
  }
})

test('房主狀態正常時仍照舊運作', () => {
  const view = compactPlayerView({
    internalPlayer: { enabled: true },
    roomState: { song: { name: 'x', durationMs: 1000 }, playing: true, positionMs: 500, source: 'desktop-netease' },
    roomMode: 'member',
  })
  assert.equal(view.song.name, 'x')
  assert.equal(view.playing, true)
  assert.equal(view.source, 'desktop-netease')
  assert.equal(view.providerControllable, false, '跟隨房主時不能直接控制本機播放')
})

test('不靠預設參數處理 null', () => {
  const source = fs.readFileSync(new URL('../src/consolePlayer.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /roomState = \{\}/, '預設參數對 null 無效，必須明確兜底')
  assert.match(source, /options\.roomState \|\| \{\}/)
})
