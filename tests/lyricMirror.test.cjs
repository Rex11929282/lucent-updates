const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  effectiveLyricAlpha,
  selectLyricCandidate,
  buildLyricSnapshot,
} = require('../shared/lyricMirror.cjs')
const { parseBindingPayload } = require('../electron/ncmcdp.cjs')

test('effective lyric alpha includes the row and text opacity, not only color alpha', () => {
  assert.ok(Math.abs(effectiveLyricAlpha(1, 0.4, 0.75) - 0.3) < 1e-12)
  assert.equal(effectiveLyricAlpha(0.8, 1, 1), 0.8)
})

test('CDP lyric polling is fast, lightweight, and never accumulates overlapping evaluations', () => {
  const source = fs.readFileSync(require.resolve('../electron/ncmcdp.cjs'), 'utf8')
  assert.match(source, /const POLL_INTERVAL_MS = 32/)
  assert.match(source, /if \(pollInFlight\) return/)
  assert.match(source, /pollInFlight = true/)
  assert.match(source, /pollInFlight = false/)
  assert.match(source, /window\.__lglLyricSnapshot/)
  assert.match(source, /window\.__lglLyricReadAt/)
})

test('a direct CDP lyric binding reaches the same normalized snapshot as the poll fallback', () => {
  const snapshot = parseBindingPayload(JSON.stringify({
    requestSongId: '108242',
    lyric: { i: 6, main: 'current line', sub: 'translation', seq: 9, capturedAt: 1234 },
  }))

  assert.equal(snapshot.songId, '108242')
  assert.equal(snapshot.songIdSource, 'request')
  assert.deepEqual(snapshot.lyric, {
    i: 6, main: 'current line', sub: 'translation', seq: 9, capturedAt: 1234, songId: '108242',
  })
  assert.equal(parseBindingPayload('{not json'), null)
})

test('the NetEase page reports a changed lyric through Runtime.bindingCalled before polling is needed', () => {
  const source = fs.readFileSync(require.resolve('../electron/ncmcdp.cjs'), 'utf8')
  assert.match(source, /Runtime\.bindingCalled/)
  assert.match(source, /m\.params\?\.name === 'lglReport'/)
  assert.match(source, /window\.lglReport\(JSON\.stringify\(/)
  assert.match(source, /parseBindingPayload\(m\.params\.payload\)/)
})

test('the precise-sync indicator requires a real direct lyric event, not only a CDP connection', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.cjs'), 'utf8')
  const consoleSource = fs.readFileSync(path.resolve(__dirname, '../src/ConsoleWindow.jsx'), 'utf8')
  assert.match(main, /const cdpStatus = ncmcdp\.getStatus\(\)/)
  assert.match(consoleSource, /info\?\.cdp && info\?\.lyricMirror/)
})

test('startup never force-restarts NetEase and the optional debug restart requires consent', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.cjs'), 'utf8')
  const consoleSource = fs.readFileSync(path.resolve(__dirname, '../src/ConsoleWindow.jsx'), 'utf8')
  assert.doesNotMatch(main, /ensurePreciseMode/)
  assert.match(main, /ipcMain\.handle\('ncm:relaunchDebug'/)
  assert.match(consoleSource, /window\.confirm\(/)
})

test('serialized lyric selector runs without Node module closures', () => {
  const selectInNeteasePage = new Function(`return (${selectLyricCandidate.toString()})`)()
  let selected = null
  assert.doesNotThrow(() => {
    selected = selectInNeteasePage([
      { index: 4, main: 'previous line', alpha: 1, time: 10, current: true },
      { index: 5, main: 'new line', alpha: 1, time: 14, current: true },
    ], 14.1)
  })
  assert.equal(selected.index, 5)
})

test('the complete injected lyric helpers run together in a browser-like scope', () => {
  const page = new Function(`
    const window = {}
    window.__lglEffectiveLyricAlpha = ${effectiveLyricAlpha.toString()}
    window.__lglSelectLyric = ${selectLyricCandidate.toString()}
    window.__lglBuildLyricSnapshot = ${buildLyricSnapshot.toString()}
    return window
  `)()
  const selected = page.__lglSelectLyric([
    { index: 4, main: 'previous line', alpha: page.__lglEffectiveLyricAlpha(1, 0.36, 1), alphaKnown: true, time: 10, current: true },
    { index: 5, main: 'new line', alpha: page.__lglEffectiveLyricAlpha(1, 1, 1), alphaKnown: false, time: 14 },
  ], 14.1)
  const snapshot = page.__lglBuildLyricSnapshot(null, selected, 1234)

  assert.equal(snapshot.index, 5)
  assert.equal(snapshot.main, 'new line')
  assert.equal(snapshot.seq, 1)
  assert.equal(snapshot.capturedAt, 1234)
})

test('explicit current wins when old and new rows are both opaque', () => {
  const rows = [
    { index: 4, main: '上一句', alpha: 1, time: 10 },
    { index: 5, main: '新一句', alpha: 1, time: 14, current: true },
  ]

  assert.deepEqual(selectLyricCandidate(rows, 14.1), {
    index: 5,
    main: '新一句',
    sub: '',
    source: 'current',
  })
})

test('actual brighter lyric row wins over a stale current class', () => {
  const selected = selectLyricCandidate([
    { index: 4, main: 'previous line', alpha: 0.36, alphaKnown: true, time: 10, current: true },
    { index: 5, main: 'new line', alpha: 1, alphaKnown: true, time: 14 },
  ], 14.1)

  assert.deepEqual(selected, {
    index: 5,
    main: 'new line',
    sub: '',
    source: 'alpha',
  })
})

test('a full-opacity new row may win even though only the old row has a fade signal', () => {
  const selected = selectLyricCandidate([
    { index: 4, main: 'previous line', alpha: 0.36, alphaKnown: true, time: 10, current: true },
    { index: 5, main: 'new line', alpha: 1, alphaKnown: false, time: 14 },
  ], 14.1)

  assert.deepEqual(selected, {
    index: 5,
    main: 'new line',
    sub: '',
    source: 'alpha',
  })
})

test('aria-current is treated as an explicit active row', () => {
  const rows = [
    { index: 4, main: '上一句', alpha: 1 },
    { index: 5, main: '新一句', alpha: 0.7, ariaCurrent: true },
  ]

  assert.equal(selectLyricCandidate(rows, 14.1).index, 5)
})

test('newer explicit row wins when NetEase keeps the previous current class during handoff', () => {
  const rows = [
    { index: 4, main: 'previous line', alpha: 1, time: 10, current: true },
    { index: 5, main: 'new line', alpha: 1, time: 14, current: true },
  ]

  assert.equal(selectLyricCandidate(rows, 14.1).index, 5)
})

test('time fallback wins over arbitrary virtual rows when no visual alpha signal exists', () => {
  const rows = [
    { index: 4, main: 'current line', alpha: 1, alphaKnown: false, time: 10 },
    { index: 19, main: 'offscreen line', alpha: 1, alphaKnown: false, time: 42 },
  ]

  const selected = selectLyricCandidate(rows, 10.1)
  assert.equal(selected.index, 4)
  assert.equal(selected.source, 'time')
})

test('visual lyric highlight wins before a stale playback-time fallback during handoff', () => {
  const rows = [
    { index: 4, main: 'previous line', alpha: 0.92, time: 10 },
    { index: 5, main: 'new line', alpha: 1, time: 14 },
  ]

  const selected = selectLyricCandidate(rows, 13.2)
  assert.equal(selected.index, 5)
  assert.equal(selected.source, 'alpha')
})

test('time fallback follows playback position when current class is absent', () => {
  const rows = [
    { index: 4, main: '上一句', alpha: 0.4, time: 10 },
    { index: 5, main: '新一句', alpha: 0.4, time: 14 },
    { index: 6, main: '下一句', alpha: 0.5, time: 18 },
  ]

  const selected = selectLyricCandidate(rows, 14.1)
  assert.equal(selected.index, 5)
  assert.equal(selected.source, 'time')
})

test('alpha fallback prefers the last equally bright row during a transition', () => {
  const rows = [
    { index: 4, main: '上一句', alpha: 1 },
    { index: 5, main: '新一句', alpha: 1 },
  ]

  const selected = selectLyricCandidate(rows, Number.NaN)
  assert.equal(selected.index, 5)
  assert.equal(selected.source, 'alpha')
})

test('snapshot sequence advances only when lyric identity changes', () => {
  const first = buildLyricSnapshot(null, {
    index: 5, main: '同一句', sub: 'translation', source: 'current',
  }, 1000)
  const same = buildLyricSnapshot(first, {
    index: 5, main: '同一句', sub: 'translation', source: 'alpha',
  }, 1050)
  const next = buildLyricSnapshot(same, {
    index: 6, main: '同一句', sub: 'translation', source: 'current',
  }, 1100)

  assert.equal(first.seq, 1)
  assert.equal(same.seq, 1)
  assert.equal(same.capturedAt, 1000)
  assert.equal(next.seq, 2)
  assert.equal(next.capturedAt, 1100)
})
