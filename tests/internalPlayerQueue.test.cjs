// Queue normalization must accept both shapes a caller can reasonably send.
// Reading only `.trackId`/`.id` turned a bare id into an empty string, so every
// entry was filtered out and the caller got an EMPTY queue — worse than sending
// no queue at all, and it silently disables previous/next.
const assertQueue = require('node:assert/strict')
const testQueue = require('node:test')

function normalizeQueueEntries(tracks) {
  // Mirrors setInternalQueue's mapping in electron/main.cjs.
  return (Array.isArray(tracks) ? tracks : [])
    .map((track) => {
      const bare = typeof track === 'string' || typeof track === 'number'
      return {
        trackId: String(bare ? track : (track?.trackId ?? track?.id ?? '')).trim(),
        name: bare ? '' : String(track?.name || ''),
        artist: bare ? '' : String(track?.artist || ''),
      }
    })
    .filter((track) => track.trackId && track.trackId !== '0')
}

testQueue('a queue of bare ids is accepted, not silently emptied', () => {
  const fromIds = normalizeQueueEntries([5257138, '509781655', 1888354230])
  assertQueue.equal(fromIds.length, 3, 'bare ids must survive normalization')
  assertQueue.deepEqual(fromIds.map((t) => t.trackId), ['5257138', '509781655', '1888354230'])
})

testQueue('a queue of track objects still works and keeps its metadata', () => {
  const fromObjects = normalizeQueueEntries([
    { id: 5257138, name: '屋顶', artist: '周杰倫' },
    { trackId: '509781655', name: '想你就寫信' },
  ])
  assertQueue.equal(fromObjects.length, 2)
  assertQueue.equal(fromObjects[0].name, '屋顶')
  assertQueue.equal(fromObjects[0].artist, '周杰倫')
  assertQueue.equal(fromObjects[1].trackId, '509781655')
})

testQueue('entries with no usable id are dropped, mixed shapes survive', () => {
  const mixed = normalizeQueueEntries([0, '', null, undefined, {}, { id: '7' }, 9])
  assertQueue.deepEqual(mixed.map((t) => t.trackId), ['7', '9'], '0 and empty are not ids')
})

testQueue('main.cjs normalizes both shapes rather than only reading .id', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  const fn = main.match(/function setInternalQueue\([\s\S]*?\n\}/)
  assertQueue.ok(fn, 'setInternalQueue should exist')
  assertQueue.match(fn[0], /typeof track === 'string' \|\| typeof track === 'number'/, 'must handle bare ids')
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8')
const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ConsoleWindow.jsx'), 'utf8')

// 上一首／下一首必須真的有東西可以走。加一顆按不動或按了沒反應的按鈕，
// 比沒有那顆按鈕更糟。
test('內建播放器有真正的佇列，不是只有兩顆裝飾用按鈕', () => {
  assert.match(main, /const internalQueue = \{ tracks: \[\], index: -1 \}/)
  assert.match(main, /function setInternalQueue\(/)
  assert.match(main, /function queueStep\(offset\)/)
  assert.match(main, /async function stepInternalQueue\(offset\)/)
  assert.match(main, /ipcMain\.handle\('player:next'/)
  assert.match(main, /ipcMain\.handle\('player:previous'/)
  assert.match(preload, /next: \(\) => ipcRenderer\.invoke\('player:next'\)/)
  assert.match(preload, /previous: \(\) => ipcRenderer\.invoke\('player:previous'\)/)
})

test('佇列來自使用者實際點的那份清單', () => {
  // 搜尋結果與歌單都要把清單帶下去，「下一首」才會照眼前的順序走
  assert.match(ui, /playResult\(song, results\)/, '搜尋結果要帶自己的清單')
  assert.match(ui, /onPlay\(song, cloudTracks\)/, '雲端歌單要帶自己的清單')
  assert.match(ui, /onPlay\(track, localTracks\)/, '本機歌單要帶自己的清單')
  assert.match(ui, /ov\.player\.load\(trackId, Array\.isArray\(queue\) \? \{ queue \} : \{\}\)/)
  assert.match(main, /ipcMain\.handle\('player:load', \(_event, trackId, context\)/)
})

test('按鈕的可用狀態由真實佇列決定', () => {
  // hasPrevious / hasNext 來自主行程，不是前端猜的
  assert.match(main, /hasPrevious: index > 0/)
  assert.match(main, /hasNext: index >= 0 && index < tracks\.length - 1/)
  assert.match(main, /queue: queueSnapshot\(\)/, '快照要把佇列狀態帶給畫面端')
  assert.match(ui, /disabled=\{!canControlDisplayed \|\| !displayedPlayer\.queue\?\.hasPrevious\}/)
  assert.match(ui, /disabled=\{!canControlDisplayed \|\| !displayedPlayer\.queue\?\.hasNext\}/)
})

test('走到頭時回傳可讀的原因，而不是無聲失敗', () => {
  assert.match(main, /offset > 0 \? PLAYER_ERROR_CODES\.NO_NEXT : PLAYER_ERROR_CODES\.NO_PREVIOUS/)
})

test('沒有帶清單時不會沿用上一份不相干的佇列', () => {
  // 從別的地方單獨播一首歌，之後按「下一首」不該跳到上一份清單的歌
  assert.match(main, /setInternalQueue\(\[\{ trackId: id \}\], id\)/)
})

test('緊湊播放器顯示完整資訊：專輯、歌手頭像、來源、狀態', () => {
  const card = ui.match(/<section className="miniplayer">[\s\S]*?<\/section>/)[0]
  assert.match(card, /miniplayer__avatar/, '歌手頭像要與專輯封面分開呈現')
  assert.match(card, /displayedPlayer\.song\.album/, '要顯示專輯')
  assert.match(card, /playbackSourceLabel\(displayedPlayer\.source\)/, '要顯示目前來源')
  assert.match(card, /miniplayer__state/, '要顯示播放狀態')
  assert.match(card, /formatTime\(displayedPlayer\.positionMs\)/)
  assert.match(card, /formatTime\(displayedPlayer\.durationMs\)/)
  // 標籤走翻譯，所以檢查的是 i18n 鍵而不是寫死的中文
  assert.match(card, /aria-label=\{t\('player\.previous'\)\}/)
  assert.match(card, /aria-label=\{t\('player\.next'\)\}/)
  assert.match(card, /aria-label=\{t\('player\.nowPlaying'\)\}/)
  assert.match(card, /t\('player\.noPrevious'\)/, '走到頭時要說明原因')
  assert.match(card, /t\('player\.noNext'\)/)
  assert.match(card, /miniplayer__noart/, '沒有封面時要有替代圖，不能破圖')
})
