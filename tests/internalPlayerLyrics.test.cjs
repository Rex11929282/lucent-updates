const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  createInternalPlayerState,
  reduceInternalPlayer,
  internalSnapshot,
} = require('../shared/internalPlayerState.cjs')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
const loadTrack = main.match(/async function loadInternalTrack\(trackId[^)]*\)[\s\S]*?\n\}/)[0]

const LINES_A = [{ t: 0, text: 'first song line one' }, { t: 4000, text: 'first song line two' }]
const LINES_B = [{ t: 0, text: 'second song line one' }]

function loaded(revision, lines, timed = true) {
  let state = createInternalPlayerState()
  state = reduceInternalPlayer(state, {
    type: 'load-start', revision, trackId: `t${revision}`, song: { id: `t${revision}`, name: 'x' },
  })
  return reduceInternalPlayer(state, {
    type: 'load-ready', revision, song: { id: `t${revision}`, name: 'x', durationMs: 120000 }, lines, timed,
  })
}

// ---- 歌詞真的送得到藥丸 ----

test('載入完成後歌詞會出現在送往藥丸的快照裡', () => {
  const snap = internalSnapshot(loaded(1, LINES_A))
  assert.equal(snap.lines.length, 2)
  assert.equal(snap.lines[0].text, 'first song line one')
  assert.equal(snap.timed, true)
  // 內建播放器沒有網易雲畫面可鏡像，所以 mirror 必須是 null，
  // 歌詞完全靠自己的時間軸推進
  assert.equal(snap.mirror, null)
})

// ---- 切歌：舊歌詞必須消失 ----

test('切到下一首時，上一首的歌詞立刻清掉', () => {
  const first = loaded(1, LINES_A)
  assert.equal(internalSnapshot(first).lines.length, 2)
  // 新的 load-start 進來（還沒抓到新歌詞）
  const switching = reduceInternalPlayer(first, {
    type: 'load-start', revision: 2, trackId: 't2', song: { id: 't2', name: 'y' },
  })
  assert.deepEqual(internalSnapshot(switching).lines, [],
    '新歌還在載入時不能繼續顯示上一首的歌詞')
  assert.equal(internalSnapshot(switching).timed, false)
})

test('慢回來的舊歌詞不會蓋掉已經在播的新歌', () => {
  // 情境：快速連續切歌，第一首的歌詞請求比第二首晚回來
  let state = loaded(2, LINES_B)
  state = reduceInternalPlayer(state, {
    type: 'load-ready', revision: 1, song: { id: 't1', name: 'x' }, lines: LINES_A, timed: true,
  })
  assert.equal(internalSnapshot(state).lines[0].text, 'second song line one',
    '舊 revision 的回應必須被丟掉')
})

// ---- 沒有歌詞的歌 ----

test('沒有歌詞的歌不會壞掉，也不會留著上一首的詞', () => {
  const first = loaded(1, LINES_A)
  let state = reduceInternalPlayer(first, {
    type: 'load-start', revision: 2, trackId: 't2', song: { id: 't2', name: 'no lyrics' },
  })
  state = reduceInternalPlayer(state, {
    type: 'load-ready', revision: 2, song: { id: 't2', name: 'no lyrics' }, lines: [], timed: false,
  })
  const snap = internalSnapshot(state)
  assert.deepEqual(snap.lines, [])
  assert.equal(snap.timed, false)
  assert.equal(snap.song.name, 'no lyrics', '沒歌詞仍要正常顯示歌曲資訊')
})

test('歌詞欄位型別不對時安全退回空陣列', () => {
  let state = createInternalPlayerState()
  state = reduceInternalPlayer(state, { type: 'load-start', revision: 1, trackId: 't1', song: { id: 't1' } })
  state = reduceInternalPlayer(state, { type: 'load-ready', revision: 1, song: { id: 't1' }, lines: null })
  assert.deepEqual(internalSnapshot(state).lines, [])
})

// ---- 播放控制不能弄丟歌詞 ----

test('暫停、續播、跳轉都不會弄丟歌詞', () => {
  let state = loaded(1, LINES_A)
  for (const event of [
    { type: 'playing', revision: 1, positionMs: 1000, durationMs: 120000 },
    { type: 'time', revision: 1, positionMs: 30000 },
    { type: 'pause', revision: 1, positionMs: 30000 },
    { type: 'playing', revision: 1, positionMs: 30000 },
    { type: 'time', revision: 1, positionMs: 5000 },
  ]) {
    state = reduceInternalPlayer(state, event)
    assert.equal(internalSnapshot(state).lines.length, 2, `${event.type} 之後歌詞不該消失`)
  }
  assert.equal(internalSnapshot(state).positionMs, 5000, '往回跳轉要反映真實位置')
})

test('延後送達的歌手頭像不會清掉歌詞', () => {
  let state = loaded(1, LINES_A)
  state = reduceInternalPlayer(state, { type: 'artwork', revision: 1, avatar: 'http://x/a.jpg' })
  assert.equal(internalSnapshot(state).lines.length, 2)
})

// ---- 主行程的抓詞流程 ----

test('抓詞流程：優先逐字 YRC，退回一般 LRC，翻譯另外併入', () => {
  assert.match(loadTrack, /netease\.getLyricPair\(id\)/)
  assert.match(loadTrack, /const wordTimed = parseYrc\(pair\.yrc\)/)
  assert.match(loadTrack, /wordTimed\.lines\.length \? wordTimed : parseLrc\(pair\.lrc\)/)
  assert.match(loadTrack, /pair\.trans \? mergeTranslation\(parsed\.lines, pair\.trans\) : parsed\.lines/)
})

test('抓詞失敗時照樣能播，只是沒有歌詞', () => {
  // 沒有 catch 的話，歌詞服務掛掉會讓整首歌播不出來
  assert.match(loadTrack, /getLyricPair\(id\)\.catch\(\(\) => \(\{ yrc: '', lrc: '', trans: '' \}\)\)/)
})

test('抓詞前後都檢查 revision，避免慢回應蓋掉新歌', () => {
  const guards = loadTrack.match(/if \(revision !== internalRevision\) return \{ ok: false, stale: true \}/g) || []
  assert.ok(guards.length >= 2, `至少要在取得播放來源與歌詞之後各檢查一次，實際 ${guards.length} 次`)
})

test('內建播放器與桌面來源共用同一套歌詞解析', () => {
  // 兩邊都要走 parseYrc/parseLrc/mergeTranslation，不能各自實作一份
  const desktop = main.match(/const parsed = wordTimed\.lines\.length \? wordTimed : parseLrc\(pair\.lrc\)/g) || []
  assert.ok(desktop.length >= 2, '桌面來源與內建播放器都要用同一組解析流程')
})
