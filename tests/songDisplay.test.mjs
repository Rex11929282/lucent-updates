import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import * as songDisplay from '../src/songDisplay.js'

const {
  currentSongLyric,
  rendererSongKey,
  rendererSongRevisionKey,
} = songDisplay

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const capsuleSource = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
const consoleSource = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const stylesSource = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('same mirror text at a new index restarts fallback timing from zero', () => {
  const firstIdentity = songDisplay.lyricLineIdentity({
    songKey: 'id:108242',
    useMirror: true,
    mirror: { i: 4, text: '重複副歌' },
  })
  const nextIdentity = songDisplay.lyricLineIdentity({
    songKey: 'id:108242',
    useMirror: true,
    mirror: { i: 5, text: '重複副歌' },
  })
  let timing = songDisplay.nextMirrorTiming(null, {
    active: true,
    identity: firstIdentity,
    text: '重複副歌',
    now: 1_000,
  })
  timing = songDisplay.nextMirrorTiming(timing, {
    active: true,
    identity: nextIdentity,
    text: '重複副歌',
    now: 3_000,
  })

  assert.notEqual(firstIdentity, nextIdentity)
  assert.equal(timing.at, 3_000)
  assert.equal(songDisplay.mirrorFallbackRatio(timing, 3_000), 0)
})

test('line identity includes mirror text without an index and separates timeline mode', () => {
  const mirrorIdentity = songDisplay.lyricLineIdentity({
    songKey: 'id:108242',
    useMirror: true,
    mirror: { text: '沒有索引' },
  })
  const changedTextIdentity = songDisplay.lyricLineIdentity({
    songKey: 'id:108242',
    useMirror: true,
    mirror: { text: '下一句' },
  })
  const timelineIdentity = songDisplay.lyricLineIdentity({
    songKey: 'id:108242',
    useMirror: false,
    curIdx: 7,
  })

  assert.match(mirrorIdentity, /沒有索引/)
  assert.notEqual(mirrorIdentity, changedTextIdentity)
  assert.notEqual(mirrorIdentity, timelineIdentity)
})

test('karaoke class helper synchronously clears stale sung DOM classes', () => {
  const children = Array.from({ length: 3 }, () => {
    const classes = new Set(['sung'])
    return {
      classList: {
        contains: (name) => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
    }
  })
  const element = { children }

  songDisplay.applyKaraokeClasses(element, 0, '新句')

  assert.deepEqual(children.map((child) => child.classList.contains('sung')), [false, false, false])
})

test('switching from mirror to timeline changes identity and clears sung DOM classes', () => {
  const mirrorIdentity = songDisplay.lyricLineIdentity({
    songKey: 'id:108242',
    useMirror: true,
    mirror: { i: 4, text: '同一句' },
  })
  const timelineIdentity = songDisplay.lyricLineIdentity({
    songKey: 'id:108242',
    useMirror: false,
    curIdx: 4,
  })
  const classes = new Set(['sung'])
  const element = {
    children: [{
      classList: {
        contains: (name) => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
    }],
  }

  assert.notEqual(mirrorIdentity, timelineIdentity)
  songDisplay.applyKaraokeClasses(element, 0, '同')
  assert.equal(element.children[0].classList.contains('sung'), false)
})

test('lyric text normalization preserves word boundaries and punctuation', () => {
  assert.equal(songDisplay.normalizeLyricText('  Ｈello，   世 界！ '), 'hello, 世 界!')
})

test('lyric matching does not collide distinct English words or punctuation', () => {
  assert.notEqual(songDisplay.normalizeLyricText('now here'), songDisplay.normalizeLyricText('nowhere'))
  assert.notEqual(songDisplay.normalizeLyricText('re-sign'), songDisplay.normalizeLyricText('resign'))
  assert.equal(songDisplay.findTimelineLineForMirror([{ time: 1, text: 'nowhere' }], 'now here', 1), null)
  assert.equal(songDisplay.findTimelineLineForMirror([{ time: 1, text: 'resign' }], 're-sign', 1), null)
})

test('duplicate mirror lyrics select the timeline line nearest the current position', () => {
  const lines = [
    { time: 12, text: 'Hello 世界', words: [{ t: 12, d: 1, text: 'Hello 世界' }] },
    { time: 30, text: 'ＨＥＬＬＯ 世界', words: [{ t: 30, d: 1, text: 'ＨＥＬＬＯ 世界' }] },
  ]

  assert.equal(songDisplay.findTimelineLineForMirror(lines, ' hello 世界 ', 28), lines[1])
})

test('mirror karaoke safely falls back when rendered character count differs from YRC words', () => {
  const fallbackRatio = 0.42
  const ratio = songDisplay.mirrorKaraokeRatio({
    lines: [{
      time: 0,
      text: 'Hello world',
      words: [{ t: 0, d: 10, text: 'Hello world' }],
    }],
    mirrorText: 'HELLO   world',
    position: 5,
    fallbackRatio,
  })

  assert.equal(ratio, fallbackRatio)
})

test('flow fill keeps using real YRC timing when mirror formatting differs', () => {
  const lines = [{
    time: 0,
    text: 'Hello world',
    words: [
      { t: 0, d: 4, text: 'Hello' },
      { t: 4, d: 6, text: ' world' },
    ],
  }]

  assert.equal(songDisplay.flowFillRatioForLine(lines[0], 5), 0.5)
  assert.equal(songDisplay.mirrorFlowFillRatio({
    lines,
    mirrorText: 'HELLO   world',
    position: 5,
  }), 0.5)
})

test('flow fill falls back to real LRC line timestamps when YRC words are unavailable', () => {
  const lines = [
    { time: 10, text: 'first line' },
    { time: 20, text: 'second line' },
  ]
  assert.equal(songDisplay.flowFillRatioForTimedLine(lines, lines[0], 15), 0.5)
  assert.equal(songDisplay.mirrorFlowFillRatio({
    lines,
    mirrorText: 'first line',
    mirrorIndex: 0,
    position: 15,
  }), 0.5)
  assert.equal(songDisplay.mirrorFlowFillRatio({
    lines,
    mirrorText: '[Live] first, line!',
    mirrorIndex: 0,
    position: 15,
  }), 0.5)
})

test('flow fill uses the active NetEase lyric row when display punctuation differs', () => {
  const lines = [{
    time: 10,
    text: 'Hello world',
    words: [
      { t: 10, d: 5, text: 'Hello' },
      { t: 15, d: 5, text: ' world' },
    ],
  }]

  assert.equal(songDisplay.mirrorFlowFillRatio({
    lines,
    mirrorText: '[Chorus] Hello, world!',
    mirrorIndex: 0,
    position: 15,
  }), 0.5)
})

test('YRC karaoke ratio interpolates within the active word timestamp', () => {
  const line = {
    text: '你好',
    words: [
      { t: 10, d: 1, text: '你' },
      { t: 11, d: 1, text: '好' },
    ],
  }

  assert.equal(songDisplay.karaokeRatioForLine(line, 11.5), 0.75)
})

test('karaoke ratio counts emoji surrogate pairs as one rendered character', () => {
  const line = {
    text: 'A😀B',
    words: [
      { t: 0, d: 1, text: 'A' },
      { t: 1, d: 2, text: '😀' },
      { t: 3, d: 1, text: 'B' },
    ],
  }

  assert.equal(songDisplay.karaokeRatioForLine(line, 1.5), 5 / 12)
})

test('mirror karaoke uses matched YRC word timing instead of the average fallback', () => {
  const ratio = songDisplay.mirrorKaraokeRatio({
    lines: [{
      time: 20,
      text: '同步',
      words: [
        { t: 20, d: 1, text: '同' },
        { t: 21, d: 1, text: '步' },
      ],
    }],
    mirrorText: '同步',
    position: 20.5,
    fallbackRatio: 0.9,
  })

  assert.equal(ratio, 0.25)
})

test('mirror karaoke keeps the average fallback when words or a timeline match are absent', () => {
  const fallbackRatio = 0.42
  assert.equal(songDisplay.mirrorKaraokeRatio({
    lines: [{ time: 20, text: '無逐字' }],
    mirrorText: '無逐字',
    position: 20.5,
    fallbackRatio,
  }), fallbackRatio)
  assert.equal(songDisplay.mirrorKaraokeRatio({
    lines: [{ time: 20, text: '另一句', words: [{ t: 20, d: 1, text: '另' }] }],
    mirrorText: '找不到',
    position: 20.5,
    fallbackRatio,
  }), fallbackRatio)
})

test('mirror karaoke without YRC words follows LRC line timing instead of wall-clock fallback', () => {
  const lines = [
    { time: 20, text: '沒有逐字時間' },
    { time: 25, text: '下一句' },
  ]

  const ratio = songDisplay.mirrorKaraokeRatio({
    lines,
    mirrorText: '沒有逐字時間',
    position: 22.3,
    fallbackRatio: 0.99,
  })
  assert.ok(Math.abs(ratio - 0.5) < 1e-12)
})

test('LRC mirror fallback is stable while paused and follows a seek position', () => {
  const lines = [
    { time: 40, text: '暫停也不漂移' },
    { time: 45, text: '下一句' },
  ]
  const ratioAtPause = songDisplay.mirrorKaraokeRatio({
    lines,
    mirrorText: '暫停也不漂移',
    position: 41,
    fallbackRatio: 0.95,
  })
  const ratioAfterWaiting = songDisplay.mirrorKaraokeRatio({
    lines,
    mirrorText: '暫停也不漂移',
    position: 41,
    fallbackRatio: 1,
  })
  const ratioAfterSeek = songDisplay.mirrorKaraokeRatio({
    lines,
    mirrorText: '暫停也不漂移',
    position: 43.68,
    fallbackRatio: 0,
  })

  assert.equal(ratioAtPause, ratioAfterWaiting)
  assert.ok(Math.abs(ratioAtPause - (1 / 4.6)) < 1e-12)
  assert.ok(Math.abs(ratioAfterSeek - 0.8) < 1e-12)
})

test('App and Capsule wire identity resets and DOM clearing before paint', () => {
  assert.match(appSource, /lyricLineIdentity\(\{/)
  assert.match(appSource, /nextMirrorTiming\(/)
  assert.match(appSource, /mirrorFallbackRatio\(/)
  assert.match(appSource, /useLayoutEffect\(\(\) => \{\s*karaokeRef\.current = 0\s*lyricFillRef\.current = 0\s*\}, \[lineIdentity\]\)/)
  assert.match(appSource, /const transitionVisual = visualForSongTransition\(/)
  assert.match(appSource, /lineKey=\{transitionVisual\.lineKey\}/)
  assert.match(appSource, /useMirror=\{transitionVisual\.useMirror\}/)
  assert.match(capsuleSource, /useLayoutEffect\(\(\) => \{\s*if \(!characterHighlight\) return\s*applyKaraokeClasses\(txtRef\.current, 0, text\)/)
  assert.match(capsuleSource, /requestAnimationFrame\(paint\)/)
  assert.doesNotMatch(capsuleSource, /setInterval\(\(\) => \{\s*applyKaraokeClasses/)
})

test('renderer song key uses id and falls back to title plus artist', () => {
  assert.equal(rendererSongKey({ id: 108242, name: '雨天', artist: '孫燕姿' }), 'id:108242')
  assert.notEqual(
    rendererSongKey({ name: '歌曲 A', artist: '歌手' }),
    rendererSongKey({ name: '歌曲 B', artist: '歌手' }),
  )
})

test('renderer song revision key stays stable while metadata is promoted to an id', () => {
  assert.equal(rendererSongRevisionKey({ revision: 7, name: 'Song A', artist: 'Artist A' }), 'revision:7')
  assert.equal(rendererSongRevisionKey({ revision: 7, id: '108242', name: 'Song A', artist: 'Artist A' }), 'revision:7')
  assert.equal(rendererSongRevisionKey({ id: '108242' }), 'id:108242')
})

test('subtitle highlight modes use one playback frame loop and expose all four choices', () => {
  assert.match(capsuleSource, /requestAnimationFrame/)
  assert.match(capsuleSource, /highlight-fill/)
  assert.match(capsuleSource, /const fillHighlight = lyricHighlightMode === 'fill' \|\| lyricHighlightMode === 'both'/)
  assert.match(appSource, /mirrorFlowFillRatio\(/)
  assert.doesNotMatch(capsuleSource, /hasPreciseKaraoke/)
  assert.doesNotMatch(capsuleSource, /setInterval\(\(\) => \{\s*applyKaraokeClasses/)
  assert.match(consoleSource, /value="characters"/)
  assert.match(consoleSource, /value="fill"/)
  assert.match(consoleSource, /value="both"/)
  assert.match(consoleSource, /value="off"/)
})

test('flow fill keeps the base lyric visible and overlays colour instead of making text transparent', () => {
  const fillRule = stylesSource.match(/\.lyrics__cur\.highlight-fill \.lyrics__txt\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(capsuleSource, /data-lyric=\{text\}/)
  assert.match(stylesSource, /\.lyrics__cur\.highlight-fill \.lyrics__txt::after/)
  assert.match(stylesSource, /content:\s*attr\(data-lyric\)/)
  assert.doesNotMatch(fillRule, /(?:color|-webkit-text-fill-color):\s*transparent/)
})

test('loading a new song shows only a waiting note instead of a previous lyric', () => {
  assert.equal(currentSongLyric({
    song: { id: 'B', name: '歌曲 B', loading: true },
    mirror: { songId: 'A', text: '上一首歌詞' },
    lines: [{ text: '上一首時間軸歌詞' }],
    curIdx: 0,
  }), '♪')
})

test('matching mirror lyric wins and an empty lyric song remains a waiting note', () => {
  assert.equal(currentSongLyric({
    song: { id: 'B', name: '歌曲 B' },
    mirror: { songId: 'B', text: '新歌歌詞' },
    lines: [],
    curIdx: 0,
  }), '新歌歌詞')
  assert.equal(currentSongLyric({ song: { id: 'B', name: '純音樂' }, lines: [] }), '♪')
})
