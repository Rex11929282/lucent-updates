import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import * as appearance from '../src/appearanceModel.js'
import * as songDisplay from '../src/songDisplay.js'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const mainSource = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const capsuleSource = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
const roomHookSource = fs.readFileSync(new URL('../src/useRoom.js', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const consoleSource = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('歌曲存在時即使歌詞尚未載入也保持遠端播放與進度狀態', () => {
  assert.equal(typeof songDisplay.hasActiveSong, 'function')
  assert.equal(songDisplay.hasActiveSong({ song: { id: '123', name: '歌曲', loading: true }, lines: [] }), true)
})

test('分段進度條能依播放比例產生真正的已播放與未播放區段', () => {
  assert.equal(typeof appearance.progressSegmentStates, 'function')
  assert.deepEqual(appearance.progressSegmentStates(8, 0.5), [true, true, true, true, false, false, false, false])
})

test('每個進度條動畫模式都有實際視覺引擎且 RGB 不被流動模式覆蓋', () => {
  for (const mode of appearance.PROGRESS_MODES.filter((value) => value !== 'none')) {
    assert.match(css, new RegExp(`\\.progress\\.prog-${mode}(?:[\\s.:{]|\\s)`), `missing CSS engine for ${mode}`)
  }
  assert.match(css, /\.progress\.prog-flow:not\(\.rgb\)\s+\.progress__fill/)
  assert.match(css, /\.progress__segment/)
  assert.doesNotMatch(css, /\.progress\.prog-flow\s+\.progress__fill\s*\{[^}]*background-image/s)
  assert.doesNotMatch(css, /@keyframes segmentFlow\s*\{[^}]*filter:/s)
  assert.doesNotMatch(css, /@keyframes progSegments\s*\{[^}]*filter:/s)
})

test('設定頁只顯示目前動畫真正有效的參數', () => {
  assert.equal(typeof appearance.progressControlsForMode, 'function')
  assert.deepEqual(appearance.progressControlsForMode('none'), { speed: false, strength: false, smoothness: false, bounce: false })
  assert.deepEqual(appearance.progressControlsForMode('bounce'), { speed: true, strength: true, smoothness: true, bounce: true })
  assert.deepEqual(appearance.progressControlsForMode('wave'), { speed: false, strength: false, smoothness: false, bounce: false })
})

test('持續動畫使用獨立 motion 層並包含完整未播放軌道', () => {
  assert.match(capsuleSource, /className="progress__track"/)
  assert.match(css, /\.progress__track/)
  assert.match(css, /\.progress\.prog-bounce\.live\s+\.progress__motion/)
})

test('已刪除的進度模式與逐字效果不再留在模型、UI 或渲染層', () => {
  const removed = ['wave', 'spread', 'ripple', 'electric', 'particles', 'peak', 'sheen', 'gradient', 'karaoke']
  const progressSelect = consoleSource.match(/<select value=\{cfg\.progressAnim[\s\S]*?<\/select>/)?.[0] || ''
  assert.equal(typeof appearance.progressEffectLayers, 'undefined')
  assert.equal(typeof appearance.progressWordStep, 'undefined')
  for (const mode of removed) {
    assert.ok(!appearance.PROGRESS_MODES.includes(mode))
    assert.doesNotMatch(progressSelect, new RegExp(`<option value=["']${mode}["']`))
    assert.doesNotMatch(css, new RegExp(`prog-${mode}|effects-${mode}|progress__${mode}`))
  }
  assert.doesNotMatch(consoleSource, /wordBarEffect|wordBarStrength/)
  assert.doesNotMatch(capsuleSource, /word-hit|progressEffectLayers|progressWordStep/)
})

test('RGB 上色不會覆蓋使用者設定的進度條高度', () => {
  assert.doesNotMatch(css, /\.progress\.rgb\s*\{[^}]*height\s*:\s*5px/s)
  assert.match(css, /\.progress\.rgb\s*\{[^}]*height\s*:\s*var\(--bar-h/s)
})

test('播放狀態變更會觸發 React 重繪 live class', () => {
  assert.match(roomHookSource, /const \[playing, setPlaying\] = useState/)
  assert.match(appSource, /playing: roomPlaying/)
  assert.match(appSource, /playing: !standby && hasRoomSong \? roomPlaying : false/)
  assert.match(appSource, /playing=\{transitionVisual\.playing\}/)
})

test('主行程取得單一實例鎖並處理第二次啟動', () => {
  assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/)
  assert.match(mainSource, /app\.on\(['"]second-instance['"]/)
})

test('live progress shares the visual requestAnimationFrame compositor without a polling timer', () => {
  assert.match(capsuleSource, /fillRef\.current\.style\.transform\s*=\s*`scaleX\(\$\{p\.toFixed\(4\)\}\)`/)
  assert.doesNotMatch(capsuleSource, /fillRef\.current\.style\.width\s*=/)
  assert.match(capsuleSource, /paintProgress\(\)[\s\S]*?requestAnimationFrame\(paint\)/)
  assert.doesNotMatch(capsuleSource, /setInterval\(/)
  assert.match(css, /\.progress__fill\s*\{[^}]*width:\s*100%[^}]*transform-origin:\s*left center/s)
  assert.doesNotMatch(css, /\.progress__fill\s*\{[^}]*transition:/s)
})

test('retired pill RGB border stays absent while the isolated vinyl remains continuously smooth', () => {
  assert.doesNotMatch(css, /\.fx-border/)
  assert.match(css, /\.vinyl__art\s*\{[^}]*will-change:\s*transform/s)
  assert.match(css, /\.vinyl--framed\.spin \.vinyl__art--framed\s*\{[^}]*animation:\s*discspin\s+var\(--rpm,\s*4\.5s\)\s+linear\s+infinite/s)
  assert.doesNotMatch(css, /\.vinyl--framed\.spin \.vinyl__art--framed\s*\{[^}]*steps\(/s)
})
