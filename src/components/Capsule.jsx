import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import LiquidGlass from 'liquid-glass-react'
import { ov } from '../overlayBridge.js'
import { applyFlowFillStyles, applyKaraokeClasses, shouldRunLineEffects } from '../songDisplay.js'
import { pauseBreathActive } from '../pauseBreath.js'
import {
  pillHasBackground,
  lyricFontStack,
  lyricLayoutValues,
  normalizeTextStyle,
  oceanWaveLevel,
  progressClasses,
  progressSegmentStates,
} from '../appearanceModel.js'
import DecorationCanvas from './DecorationCanvas.jsx'
import { findVinylFrame } from '../frameAssets.js'
import GlassSheen from './GlassSheen.jsx'
import SongTransitionLayer from './SongTransitionLayer.jsx'
import { usePillMouse } from '../usePillMouse.js'
import { particleTransitionDuration, shouldHidePillDuringTransition } from '../songTransition.js'
import { spectrumLevels } from '../audioSpectrum.js'
import { createOceanWaveState, paintOceanWave, stepOceanWave } from '../oceanWavePhysics.js'
import { titleFitScale } from '../titleLayout.js'
import { paletteFromPixels } from '../coverPalette.js'
import { preloadArtwork } from '../artworkCache.js'
import { LUCENT_AVATAR_ASSET } from '../brandAssets.js'

const SPECTRUM_PROGRESS_BARS = 16

function VinylArtwork({ src }) {
  const recover = useCallback((event) => {
    const image = event.currentTarget
    if (image.dataset.fallback === '1') return
    image.dataset.fallback = '1'
    image.src = LUCENT_AVATAR_ASSET
  }, [])
  const resolved = src || LUCENT_AVATAR_ASSET
  return <img key={resolved} src={resolved} alt="" onError={recover} />
}

// 固定大小藥丸：字幕不滾動、最多兩行、完整；下方有進度條與時間。
// 兩種外觀：glass = 液態玻璃藥丸；avatar = 透明底 + 左側歌手頭像。
function Capsule({ innerRef, mouseContainer, line, trans, reserveTrans, playing, lineKey, useMirror, songName, cfg, glass, coverUrl, songCoverUrl, avatarUrl, progressRef, karaokeRef, lyricFillRef, lyricFillActiveRef, audioSpectrumRef, spectrumActive = false, showProgress, forceVinyl = false, transitionPhase = 'idle', transitionRevision = 0, effectsPaused = false, consoleCollapsed = false, preview = false, onTransitionEvent, onClick, onContextMenu }) {
  const wrapRef = useRef(null)
  const fillRef = useRef(null)
  const timeRef = useRef(null)
  const barRef = useRef(null)
  const segmentsRef = useRef(null)
  const progressSpectrumRef = useRef(null)
  const oceanWaveRef = useRef(null)
  const oceanCanvasRef = useRef(null)
  const oceanStateRef = useRef(createOceanWaveState())
  const oceanPaintAtRef = useRef(0)
  const oceanRippleRef = useRef(null)
  const currentLyricRef = useRef(null)
  const txtRef = useRef(null)
  const contentRef = useRef(null)
  const songNameTrackRef = useRef(null)
  const songNameTextRef = useRef(null)
  const [songNameScale, setSongNameScale] = useState(1)
  const pillMouse = usePillMouse(
    wrapRef,
    cfg.hoverActivationDistance ?? 14,
    !preview && !effectsPaused && ((glass.elasticity ?? 0) > 0 || !!cfg.fxTilt),
  )
  const onSnapshotReady = useCallback(() => { if (!preview) onTransitionEvent?.('snapshot-ready') }, [onTransitionEvent, preview])
  const onSnapshotFailed = useCallback(() => { if (!preview) onTransitionEvent?.('snapshot-failed') }, [onTransitionEvent, preview])
  const onOutFinished = useCallback(() => { if (!preview) onTransitionEvent?.('out-finished') }, [onTransitionEvent, preview])
  const onInFinished = useCallback(() => { if (!preview) onTransitionEvent?.('finished') }, [onTransitionEvent, preview])
  const text = line || '♪'
  const lyricHighlightMode = cfg.lyricHighlightMode || (cfg.karaoke === false ? 'off' : 'characters')
  const characterHighlight = lyricHighlightMode === 'characters' || lyricHighlightMode === 'both'
  // 流動填色只吃真實 YRC/LRC 時間；沒有時間資料時維持原文，不用假速度補動畫。
  const fillHighlight = lyricHighlightMode === 'fill' || lyricHighlightMode === 'both'
  const needsCharacterSpans = characterHighlight || fillHighlight
  const isAvatar = !pillHasBackground(cfg.skin)
  // 所有外觀模式都尊重同一個開關；透明模式關閉時不保留唱片或封面空位。
  const showVinyl = !!cfg.showVinyl || forceVinyl
  const showSpectrumProgress = cfg.progressAnim === 'spectrum'
  const showSegments = !showSpectrumProgress && (!!cfg.segmentedBar || cfg.progressAnim === 'segments')
  const showOceanWave = !isAvatar && cfg.oceanWave === true
  const oceanAmplitude = Math.max(0, Math.min(1, cfg.oceanWaveAmplitude ?? 0.45))
  const oceanSpeed = Math.max(0.2, Math.min(3, cfg.oceanWaveSpeed ?? 1))
  const segmentCount = Math.max(2, Math.min(40, Math.round(cfg.segmentCount ?? 12)))
  const lyricLayout = lyricLayoutValues(cfg.lyricLayout, cfg.lyricAlign)
  const lyricFont = lyricFontStack(cfg.lyricFont)
  const translationFont = cfg.translationFont === 'inherit' ? lyricFont : lyricFontStack(cfg.translationFont)
  const showTranslation = reserveTrans && lyricLayout.translationVisible
  const showSongName = !!cfg.showSongName && !!songName

  useLayoutEffect(() => {
    currentLyricRef.current?.classList.toggle('highlight-fill-active', fillHighlight)
    if (!needsCharacterSpans) return
    applyKaraokeClasses(txtRef.current, 0, text)
    // 先清空同一個 DOM 節點可能留下的上一句填色；有效時間到達後再由幀時鐘覆寫。
    applyFlowFillStyles(txtRef.current, 0, text)
  }, [characterHighlight, fillHighlight, needsCharacterSpans, lineKey, useMirror, text])

  useLayoutEffect(() => {
    if (innerRef) innerRef.current = wrapRef.current
    return () => { if (innerRef) innerRef.current = null }
  }, [innerRef])

  useLayoutEffect(() => {
    const track = songNameTrackRef.current
    const label = songNameTextRef.current
    if (!track || !label) return
    const measure = () => {
      if (!showSongName) {
        setSongNameScale((current) => current === 1 ? current : 1)
        return
      }
      const next = titleFitScale({ contentWidth: label.scrollWidth, trackWidth: track.clientWidth })
      setSongNameScale((current) => Math.abs(current - next) > 0.001 ? next : current)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    measure()
    return () => observer.disconnect()
  }, [showSongName, songName, cfg.fontSize, cfg.fontWeight, cfg.lyricLayout, cfg.textStyle])

  // 視窗尺寸「量測驅動」：實際量玻璃/內容有多大，就把視窗開多大。
  // 不用公式硬猜，任何字級、寬度、雙語、唱片組合都不會被裁到 → UI 不會變形。
  const appliedRef = useRef({ w: 0, h: 0 })
  const [shrink, setShrink] = useState(0) // 超出螢幕時自動縮窄的量
  // RGB 與流動填色共用同一組封面取色，避免多開 Canvas 與圖片載入。
  const [coverColors, setCoverColors] = useState(['#ff3d81', '#2ec4ff', '#8a5cff'])
  useEffect(() => {
    if ((cfg.rgbMode !== 'cover' && cfg.flowFillColorMode !== 'cover-gradient') || !coverUrl) return
    let cancelled = false
    preloadArtwork(coverUrl, { crossOrigin: true, timeoutMs: 2500 }).then(({ image, ok }) => {
      if (cancelled || !ok || !image) return
      try {
        const N = 12
        const cv = document.createElement('canvas')
        cv.width = N; cv.height = N
        const ctx = cv.getContext('2d')
        ctx.drawImage(image, 0, 0, N, N)
        const d = ctx.getImageData(0, 0, N, N).data
        if (!cancelled) setCoverColors(paletteFromPixels(d))
      } catch {}
    })
    return () => { cancelled = true }
  }, [cfg.rgbMode, cfg.flowFillColorMode, coverUrl])
  useEffect(() => { setShrink(0) }, [cfg.maxWidth, cfg.fontSize, cfg.skin, cfg.lyricLayout, cfg.lyricAlign, cfg.lyricFont, cfg.translationFont, cfg.lyricLetterSpacing, cfg.translationLetterSpacing, cfg.lyricLineHeight, cfg.translationLineHeight, cfg.translationScale, cfg.translationWeight, showVinyl])
  useEffect(() => {
    if (preview || !ov.isElectron) return
    const wrap = wrapRef.current
    if (!wrap) return

    const apply = () => {
      const target = wrap.querySelector('.glass') || wrap.querySelector('.plain') || wrap
      // 用 offsetWidth/Height（不含 transform）：getBoundingClientRect 會把彈性縮放算進去，
      // 滑鼠一動玻璃就縮放 → 量到的尺寸跟著變 → 視窗不停重設 → 邊框露出來。
      const r = { width: target.offsetWidth, height: target.offsetHeight }
      if (!r.width || !r.height) return
      const e = glass.elasticity || 0
      // 邊距要同時容納「彈性縮放」與「彈性位移」：
      // 縮放最大 = 1 + 0.3*e（每邊 0.15*e）；位移量與 elasticity 成正比，
      // 只算縮放會不夠，滑鼠移到邊角時圖層就會被視窗切到 → 外框露出。
      const marginX = Math.ceil(r.width * 0.16 * e) + 30 + Math.ceil(e * 70)
      const marginY = Math.ceil(r.height * 0.16 * e) + 26 + Math.ceil(e * 50)
      const w = Math.ceil(r.width) + marginX * 2
      const h = Math.ceil(r.height) + marginY * 2

      // 超出螢幕就自動縮窄內容（主行程會把視窗夾在螢幕內，
      // 若內容比視窗寬就會被裁掉 → 變形）。這裡回饋修正，保證一定塞得下。
      const budget = Math.floor((window.screen?.availWidth || 1920) * 0.94)
      if (w > budget) {
        setShrink((s) => Math.min(s + (w - budget) + 8, 4000))
        return
      }

      const a = appliedRef.current
      // 差距夠大才調整，避免與玻璃重算互相觸發造成抖動
      if (Math.abs(w - a.w) > 2 || Math.abs(h - a.h) > 2) {
        appliedRef.current = { w, h }
        // 一併回報「玻璃在視窗內的內縮量」：視窗比看得見的藥丸大很多，
        // 邊界夾限要用玻璃的可見邊緣算，藥丸才能真正貼到螢幕邊。
        // 扣一點保守量：彈性拉伸會讓玻璃在視窗內左右浮動，
        // 全額扣抵會偶爾超出螢幕邊緣，留 8px 緩衝確保「貼到但不超過」。
        ov.setSize(w, h, Math.max(0, marginX - 8), Math.max(0, marginY - 8))
      }
    }

    let raf = 0
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply) }
    const ro = new ResizeObserver(schedule)
    ro.observe(wrap)
    const g = wrap.querySelector('.glass')
    if (g) ro.observe(g)
    schedule()
    // 字型載入 / 玻璃初始化後再確認一次
    const t1 = setTimeout(schedule, 150)
    const t2 = setTimeout(schedule, 600)
    return () => { ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2) }
  }, [cfg.maxWidth, cfg.fontSize, cfg.skin, cfg.lyricLayout, cfg.lyricAlign, cfg.lyricFont, cfg.translationFont, cfg.lyricLetterSpacing, cfg.translationLetterSpacing, cfg.lyricLineHeight, cfg.translationLineHeight, cfg.translationScale, cfg.translationWeight, glass.elasticity, glass.cornerRadius, showVinyl, showTranslation, text, preview])

  // 進度條 + 時間：用 ref 直接改 DOM，不觸發玻璃重繪。
  // 預覽只畫一次代表性進度，不另開常駐 interval。
  const paintProgress = useCallback(() => {
    const fmt = (s) => {
      if (!isFinite(s) || s < 0) s = 0
      const m = Math.floor(s / 60)
      return m + ':' + String(Math.floor(s % 60)).padStart(2, '0')
    }
    const p = oceanWaveLevel(progressRef?.current)
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${p.toFixed(4)})`
    if (oceanWaveRef.current) {
      const now = performance.now()
      const previous = oceanPaintAtRef.current || now
      oceanPaintAtRef.current = now
      const ocean = stepOceanWave(oceanStateRef.current, {
        level: p,
        seconds: (now - previous) / 1000,
        speed: oceanSpeed,
        playing: playing && !effectsPaused,
      })
      oceanWaveRef.current.style.setProperty('--ocean-level', ocean.surface.toFixed(4))
      oceanWaveRef.current.style.setProperty('--ocean-offset', `${((1 - ocean.surface) * 100).toFixed(2)}%`)
      paintOceanWave(oceanCanvasRef.current, ocean, {
        amplitude: oceanAmplitude,
        color: cfg.oceanWaveColor,
      })
    }
    if (segmentsRef.current) {
      const states = progressSegmentStates(segmentCount, p)
      const nodes = segmentsRef.current.children
      for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('played', states[i])
    }
    if (progressSpectrumRef.current) {
      const nodes = progressSpectrumRef.current.children
      const played = Math.round(p * nodes.length)
      for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('played', i < played)
    }
    if (timeRef.current) {
      const cur = progressRef?.current?.posSec
      const dur = progressRef?.current?.durSec
      timeRef.current.textContent = (cur != null && dur ? fmt(cur) + ' / ' + fmt(dur) : '')
    }
  }, [progressRef, segmentCount, showOceanWave, showSpectrumProgress, oceanAmplitude, oceanSpeed, playing, effectsPaused, cfg.oceanWaveColor])
  // 所有時間導向視覺共用同一個畫面幀：字幕、流動填色、進度條與海浪。
  // React 只會在換句時換文字，播放期間只修改既有 DOM 節點。
  useEffect(() => {
    if (!characterHighlight && !fillHighlight && !showProgress && !showOceanWave) return undefined
    let frame = 0
    let lastCharacterRatio = -1
    let lastFillRatio = -1
    let stopped = false
    const paint = () => {
      if (stopped) return
      paintProgress()
      const characterRatio = Math.max(0, Math.min(1, karaokeRef?.current || 0))
      const fillRatio = Math.max(0, Math.min(1, lyricFillRef?.current || 0))
      const fillActive = fillHighlight && lyricFillActiveRef?.current === true
      const roundedCharacter = Math.round(characterRatio * 1000) / 1000
      const roundedFill = Math.round(fillRatio * 1000) / 1000
      if (characterHighlight && roundedCharacter !== lastCharacterRatio) {
        applyKaraokeClasses(txtRef.current, roundedCharacter, text)
        lastCharacterRatio = roundedCharacter
      }
      if (fillActive && roundedFill !== lastFillRatio && txtRef.current) {
        applyFlowFillStyles(txtRef.current, roundedFill, text)
        lastFillRatio = roundedFill
      }
      if (playing && !effectsPaused) frame = requestAnimationFrame(paint)
    }
    paint()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
  }, [characterHighlight, fillHighlight, playing, effectsPaused, karaokeRef, lyricFillRef, lyricFillActiveRef, lineKey, useMirror, text, showProgress, showOceanWave, paintProgress])

  useEffect(() => {
    const ripple = oceanRippleRef.current
    if (!ripple || !showOceanWave || !playing || effectsPaused) return undefined
    ripple.classList.remove('is-rippling')
    void ripple.offsetWidth
    ripple.classList.add('is-rippling')
    const timer = setTimeout(() => ripple.classList.remove('is-rippling'), 460)
    return () => clearTimeout(timer)
  }, [lineKey, showOceanWave, playing, effectsPaused])

  // 玻璃元件只在 window resize 時重算自身尺寸；換歌時內容高度會變（有無翻譯列），
  // 若不通知它重算，濾鏡尺寸會停留在上一首 → 畫面變形（換下一首後 UI 變怪）。
  useEffect(() => {
    if (preview) return undefined
    const wrap = wrapRef.current
    if (!wrap) return
    const g = wrap.querySelector('.glass')
    if (!g) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    })
    ro.observe(g)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [isAvatar, preview])

  // 換句時讓進度條「跳動」一下（這是我們手上真實的節奏訊號）
  useEffect(() => {
    if (!shouldRunLineEffects({ playing, effectsPaused, preview })) return undefined
    const targets = []
    // 跳動與 RGB 上色是兩個獨立設定：只開跳動也會有效果
    if (cfg.barBeat && barRef.current) targets.push([barRef.current, 'beat', 480])
    const wrap = wrapRef.current
    if (wrap) {
      const g = wrap.querySelector('.glass') || wrap.querySelector('.plain')
      if (cfg.fxBreathe && g) targets.push([g, 'breathe', 560])
      const v = wrap.querySelector('.vinyl')
      if (cfg.fxVinylBounce && v) targets.push([v, 'bounce', 520])
    }
    const timers = targets.map(([el, cls, ms]) => {
      el.classList.remove(cls)
      void el.offsetWidth // 強制重繪讓動畫可重播
      el.classList.add(cls)
      return setTimeout(() => el.classList.remove(cls), ms)
    })
    return () => {
      timers.forEach(clearTimeout)
      targets.forEach(([el, cls]) => el.classList.remove(cls))
    }
  }, [lineKey, cfg.barBeat, cfg.fxBreathe, cfg.fxVinylBounce, playing, effectsPaused, preview])

  const onPointerDown = useCallback(async (e) => {
    if (preview || e.button !== 0) return
    if (cfg.locked) {
      const onUp = () => { window.removeEventListener('pointerup', onUp); onClick?.() }
      window.addEventListener('pointerup', onUp)
      return
    }
    const startX = e.screenX, startY = e.screenY
    const bounds = await ov.getBounds()
    let moved = false
    const onMove = (ev) => {
      const dx = ev.screenX - startX, dy = ev.screenY - startY
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true
      if (moved && bounds) ov.setPosition(bounds.x + dx, bounds.y + dy)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!moved) onClick?.()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [onClick, cfg.locked, preview])

  const avatarSize = Math.round(cfg.fontSize * (cfg.vinylScale ?? 2.6))
  // 圓角：預設組或自訂 px；裝飾特效與材質層都會 inherit 這個圓角來裁切
  const CORNER = { pill: 999, small: 10, medium: 22, large: 40 }
  const cornerRadius = cfg.cornerPreset === 'custom'
    ? (cfg.cornerPx ?? 100)
    : (CORNER[cfg.cornerPreset] ?? glass.cornerRadius)
  // 內容寬度上限：扣掉唱片、內距與視窗邊距後不得超過螢幕，
  // 否則主行程的螢幕寬度上限會把玻璃裁掉 → 變形。
  const screenW = (typeof window !== 'undefined' && window.screen?.availWidth) || 1920
  const maxContentW = Math.max(120, Math.round(screenW * 0.9) - (showVinyl ? avatarSize + 12 : 0) - 60 - 120)
  const boxW = Math.max(80, Math.min(Math.max(60, cfg.maxWidth - 72), maxContentW) - shrink)
  const clarity = Math.max(0, Math.min(1, cfg.textClarity ?? 0.7))
  const outline = Math.max(0, cfg.outline ?? 1)
  const progressSmoothness = Math.max(0.1, Math.min(1, cfg.progressSmoothness ?? 0.7))
  const vinylFrame = findVinylFrame(cfg.vinylFrame)
  const hasCustomVinylFrame = vinylFrame.kind === 'frame'
  const isBareVinyl = vinylFrame.kind === 'bare'
  const isClassicVinyl = vinylFrame.kind === 'classic'
  useEffect(() => {
    const targets = []
    if (showSpectrumProgress && progressSpectrumRef.current) {
      targets.push([progressSpectrumRef.current, cfg.progressStrength ?? 0.55])
    }
    if (!targets.length) return undefined

    let frameId = 0
    let lastKey = ''
    let stopped = false
    const paint = () => {
      if (stopped) return
      const frame = spectrumActive ? audioSpectrumRef?.current : null
      const key = frame?.active ? `active:${Number(frame.sequence) || 0}` : 'silent'
      if (key !== lastKey) {
        for (const [target, amplitude] of targets) {
          const levels = spectrumLevels(frame, target.children.length, amplitude)
          for (let index = 0; index < target.children.length; index += 1) {
            target.children[index].style.setProperty('--spectrum-level', String(levels[index] || 0))
          }
        }
        lastKey = key
      }
      if (spectrumActive && playing && !effectsPaused && !preview) frameId = requestAnimationFrame(paint)
    }
    paint()
    return () => {
      stopped = true
      cancelAnimationFrame(frameId)
    }
  }, [audioSpectrumRef, cfg.progressStrength, effectsPaused, playing, preview, showSpectrumProgress, spectrumActive])

  const shatterContent = shouldHidePillDuringTransition(cfg.songTransitionMode, transitionPhase)
  const songNameNode = (
    <div className="songname-track" ref={songNameTrackRef} style={{ '--songname-scale': songNameScale }}>
      <div className={`songname${showSongName ? '' : ' songname--empty'}`}>
        <span className="songname__text" ref={songNameTextRef}>{songName || ''}</span>
      </div>
    </div>
  )

  // 內容（兩種外觀共用）
  const content = (
    <div ref={contentRef} className={`content ${isAvatar ? 'content--plain' : 'content--glass'} ${shatterContent ? `content--shatter-hidden content--${transitionPhase}` : ''}`}>
      {/* 封面與玻璃材質共用同一個裁切層，圓角不會因內容高度改變而平切。 */}
      <div className="visualclip" aria-hidden>
        {!isAvatar && (
          <>
          <div className="background-stack">
            <div className="coverlayer" />
            <div className="bglayer" />
          </div>
          {showOceanWave && (
            <div className={`ocean-wave ${playing && !effectsPaused ? 'ocean-wave--live' : ''}`} ref={oceanWaveRef} aria-hidden>
              <div className="ocean-wave__fill">
                <canvas className="ocean-wave__canvas" ref={oceanCanvasRef} />
                <div className="ocean-wave__ripple" ref={oceanRippleRef} />
              </div>
            </div>
          )}
          <div className="noise-layer" />
          <GlassSheen cfg={cfg} />
          <DecorationCanvas cfg={cfg} playing={playing && !effectsPaused} eventKey={lineKey} previewActive={!effectsPaused} />
          </>
        )}
      </div>
      {/* 歌名：左上角獨立一行，不與歌詞或唱片重疊 */}
      {cfg.songNamePos !== 'bc' ? songNameNode : null}
      <div className="row-wrap">
      {showVinyl && (
        <div className={`vinyl ${hasCustomVinylFrame ? 'vinyl--framed' : ''} ${isBareVinyl ? 'vinyl--bare' : ''} ${isClassicVinyl ? 'vinyl--classic' : ''} ${playing && !effectsPaused ? 'spin' : ''}`} style={{ width: avatarSize, height: avatarSize, ...(hasCustomVinylFrame ? { '--vinyl-cover-scale': vinylFrame.coverScale } : null) }}>
          {isClassicVinyl && <>
            <div className="vinyl__ring" />
            <div className="vinyl__disc" />
            <div className="vinyl__art vinyl__art--default">
              <VinylArtwork src={avatarUrl} />
            </div>
          </>}
          {isBareVinyl && (
            <div className="vinyl__art vinyl__art--bare">
              <VinylArtwork src={avatarUrl} />
            </div>
          )}
          {hasCustomVinylFrame ? (
            <>
              <div className="vinyl__art vinyl__art--framed">
                <VinylArtwork src={avatarUrl} />
              </div>
              <div className="vinyl-frame" style={{ backgroundImage: `url("${vinylFrame.url}")` }} />
            </>
          ) : null}
        </div>
      )}
      <div className="lyrics" style={{ width: boxW }}>
          <div ref={currentLyricRef} className={`lyrics__cur ${characterHighlight ? 'karaoke' : ''} ${fillHighlight ? 'highlight-fill' : ''} ${fillHighlight ? 'highlight-fill-active' : ''} ${fillHighlight && cfg.flowFillColorMode === 'cover-gradient' ? 'flow-fill-cover' : ''}`} style={{ color: cfg.textColor, '--lyric-fill-base': cfg.textColor || '#ffffff' }}>
          {/* key 用文字本身：鏡像模式下 lineKey 不會變，用它會讓動畫套在舊句上 */}
          <span className={`lyrics__txt anim-${cfg.fxLineAnim || 'fade'}`} key={text} ref={txtRef}>
            {needsCharacterSpans
              ? Array.from(text).map((c, i) => <span className="kchar" key={i}>{c === ' ' ? ' ' : c}</span>)
              : text}
          </span>
        </div>
        {/* 雙語第二行：翻譯。整首歌有翻譯就固定保留這一列（即使某句沒翻譯），
            避免逐句忽高忽低造成玻璃重算閃爍；整首沒翻譯則完全不佔空間。 */}
        {showTranslation ? (
          <div className="lyrics__trans" style={{ color: cfg.textColor }}>
            {trans || ' '}
          </div>
        ) : null}
        {/* 永遠保留進度列位置：避免顯示/隱藏造成高度變動 → 玻璃重算閃爍 */}
        <div className="progrow" style={{ opacity: showProgress ? 1 : 0 }}>
          <div
            className={progressClasses(cfg, playing && !effectsPaused).join(' ')}
            ref={barRef}
          >
            <div className="progress__motion">
              <div className="progress__track" />
              <div className="progress__fill" ref={fillRef} />
              {showSpectrumProgress && (
                <div className="progress__spectrum" ref={progressSpectrumRef} aria-hidden>
                  {Array.from({ length: SPECTRUM_PROGRESS_BARS }, (_, index) => (
                    <i style={{ '--spectrum-index': index }} key={index} />
                  ))}
                </div>
              )}
              {showSegments && (
                <div className="progress__segments" ref={segmentsRef} aria-hidden>
                  {Array.from({ length: segmentCount }, (_, index) => (
                    <i className="progress__segment" style={{ '--seg-index': index }} key={index} />
                  ))}
                </div>
              )}
            </div>
          </div>
          {cfg.showTime && <span className="progtime" ref={timeRef} />}
        </div>
      </div>
      </div>
      {cfg.songNamePos === 'bc' ? songNameNode : null}
    </div>
  )
  const contentShell = (
    <div className="content-shell">
      {content}
      {!preview && <SongTransitionLayer
          phase={transitionPhase}
          mode={cfg.songTransitionMode}
          revision={transitionRevision}
          sourceRef={wrapRef}
          incomingCoverUrl={songCoverUrl}
          loading={line === '♪'}
          visualKey={`${lineKey}|${songName}`}
          speed={cfg.transitionSpeed ?? 1}
          onSnapshotReady={onSnapshotReady}
          onSnapshotFailed={onSnapshotFailed}
          onOutFinished={onOutFinished}
          onInFinished={onInFinished}
        />}
    </div>
  )

  return (
    <div
      className={[
        'capsule interactive',
        isAvatar ? 'capsule--avatar' : '',
        `rgb-${cfg.rgbMode || 'rainbow'}`,
        cfg.barGlow ? 'fx-glow' : '',
        cfg.fxKaraokeGlow ? 'fx-kglow' : '',
        pauseBreathActive({ enabled: cfg.fxPauseBreath, playing, effectsPaused }) ? 'fx-pausebreath' : '',
        cfg.fxTilt && !effectsPaused ? 'fx-tilt' : '',
        effectsPaused ? 'effects-paused' : '',
        cfg.smoothEdge ? 'fx-smooth' : '',
        `layout-${lyricLayout.id}`,
        `text-style-${normalizeTextStyle(cfg.textStyle)}`,
        `name-${cfg.songNamePos || 'tl'}`,
        `grad-${cfg.bgGradMode || 'none'}`,
        cfg.noise > 0 ? 'has-noise' : '',
        consoleCollapsed ? 'capsule--console-collapsed' : '',
        preview ? 'capsule--preview' : '',
      ].filter(Boolean).join(' ')}
      ref={wrapRef}
      style={{
        '--frost': cfg.frost,
        '--outline': cfg.outline ?? 1,
        '--cover-img': coverUrl && cfg.backdrop === 'cover' ? `url("${coverUrl}")` : 'none',
        '--rgb-dur': `${(3 / (cfg.rgbSpeed || 1)).toFixed(2)}s`,
        '--rgb-sat': cfg.rgbSat ?? 1,
        '--rgb-bright': cfg.rgbBright ?? 1,
        '--neon': cfg.neonColor || '#4f8cff',
        '--glow': cfg.glowColor || '#8ec8ff',
        '--bar-h': `${cfg.barHeight ?? 5}px`,
        '--prog-dur': `${(2.4 / Math.max(0.15, cfg.progressSpeed ?? 1)).toFixed(2)}s`,
        '--prog-strength': cfg.progressStrength ?? 0.55,
        '--prog-smooth': cfg.progressSmoothness ?? 0.7,
        '--prog-ease': `cubic-bezier(.25, ${(1 - progressSmoothness).toFixed(2)}, .25, 1)`,
        '--prog-bounce': `${((cfg.progressBounceHeight ?? 4) * (0.5 + (cfg.progressStrength ?? 0.55))).toFixed(1)}px`,
        '--prog-glow': cfg.progressGlowStrength ?? 0.65,
        '--prog-glow-range': `${cfg.progressGlowRange ?? 12}px`,
        '--particle-in-dur': `${particleTransitionDuration('shatter-in', cfg.transitionSpeed)}ms`,
        '--seg-count': Math.max(2, Math.round(cfg.segmentCount ?? 12)),
        '--seg-gap': `${cfg.segmentGap ?? 3}px`,
        '--seg-radius': `${cfg.segmentRadius ?? 3}px`,
        '--rpm': `${cfg.vinylRpm ?? 4.5}s`,
        '--fw': cfg.fontWeight ?? 800,
        '--translation-weight': cfg.translationWeight ?? 700,
        '--lyric-align-items': lyricLayout.items,
        '--lyric-justify': lyricLayout.items,
        '--lyric-text-align': lyricLayout.textAlign,
        '--lyrics-font': lyricFont,
        '--translation-font': translationFont,
        '--lyric-main-size': `${Math.max(12, Math.round(cfg.fontSize * lyricLayout.mainScale))}px`,
        '--translation-size': `${Math.max(9, Math.round(cfg.fontSize * (cfg.translationScale ?? 0.72) * lyricLayout.transScale))}px`,
        '--songname-size': `${Math.max(12, Math.round(cfg.fontSize * 0.76 * lyricLayout.nameScale))}px`,
        '--songname-track-height': `${Math.ceil(Math.max(12, Math.round(cfg.fontSize * 0.76 * lyricLayout.nameScale)) * 1.28)}px`,
        '--lyric-letter-spacing': `${cfg.lyricLetterSpacing ?? 0.01}em`,
        '--translation-letter-spacing': `${cfg.translationLetterSpacing ?? 0}em`,
        '--lyric-line-height': cfg.lyricLineHeight ?? 1.25,
        '--translation-line-height': cfg.translationLineHeight ?? 1.3,
        // --- 背景材質 ---
        '--bg-alpha': cfg.bgAlpha ?? 0.55,
        '--bg-blur': `${cfg.bgBlur ?? 18}px`,
        '--ocean-color': cfg.oceanWaveColor || '#45b9ff',
        '--ocean-opacity': cfg.oceanWaveOpacity ?? 0.32,
        '--ocean-crest': `${Math.round(6 + oceanAmplitude * 22)}px`,
        '--ocean-drift': `${(11 / oceanSpeed).toFixed(2)}s`,
        '--ocean-drift-back': `${(16 / oceanSpeed).toFixed(2)}s`,
        '--bg-bright': cfg.bgBright ?? 1,
        '--bg-contrast': cfg.bgContrast ?? 1,
        '--bg-sat': cfg.bgSat ?? 1.2,
        '--tint': cfg.tintColor || '#8fa8ff',
        '--tint-a': cfg.tintStrength ?? 0.12,
        '--grad-c1': cfg.bgGradC1 || '#7f9cff',
        '--grad-c2': cfg.bgGradC2 || '#c08cff',
        '--grad-angle': `${cfg.bgGradAngle ?? 145}deg`,
        '--edge-hl': cfg.edgeHighlight ? (cfg.edgeHlStrength ?? 0.45) : 0,
        '--noise-a': cfg.noise ?? 0,
        '--lyric-trans-gap': `${Math.round((cfg.lyricTranslationGap ?? 7) * lyricLayout.gapScale)}px`,
        '--trans-progress-gap': `${Math.round((cfg.translationProgressGap ?? 7) * lyricLayout.progressGapScale)}px`,
        '--sheen-w': `${cfg.sheenWidth ?? 34}%`,
        '--sheen-h': `${cfg.sheenHeight ?? 140}%`,
        '--sheen-travel': `${cfg.sheenDuration ?? 1.2}s`,
        '--sheen-cycle': `${(cfg.sheenDuration ?? 1.2) + (cfg.sheenInterval ?? 6)}s`,
        '--sheen-bright': cfg.sheenBrightness ?? 1.5,
        '--sheen-blur': `${cfg.sheenBlur ?? 16}px`,
        '--sheen-opacity': cfg.sheenOpacity ?? 0.45,
        '--sh-out': cfg.shadowOut ?? 0.35,
        '--sh-out-blur': `${cfg.shadowOutBlur ?? 26}px`,
        '--sh-in': cfg.shadowIn ?? 0.25,
        '--oglow': cfg.outerGlow ?? 0,
        '--oglow-c': cfg.outerGlowColor || '#7fb0ff',
        // 圓角用變數往下傳：元件內部有一層包裝 div 沒有圓角，
        // 靠 border-radius: inherit 會在那裡斷掉（實測 bglayer 收到 0px）。
        '--radius': `${cornerRadius}px`,
        // --- 可見度 ---
        '--bar-fill-a': cfg.barFillAlpha ?? 1,
        '--bar-fill-c': cfg.barFillColor || '#ffffff',
        '--bar-track-a': cfg.barTrackAlpha ?? 0.28,
        '--name-a': cfg.songNameAlpha ?? 0.86,
        '--name-c': cfg.songNameColor || '#ffffff',
        '--lyric-a': cfg.lyricAlpha ?? 1,
        '--text-stroke': `${(outline * (0.03 + clarity * 0.045)).toFixed(3)}em`,
        '--text-shadow-near': `${(1 + (1 - clarity) * 2).toFixed(1)}px`,
        '--text-shadow-mid': `${(3 + (1 - clarity) * 7).toFixed(1)}px`,
        '--text-shadow-glow': `${(2 + (1 - clarity) * 14).toFixed(1)}px`,
        '--text-shadow-glow-a': (0.42 * (1 - clarity)).toFixed(2),
        '--c1': coverColors[0], '--c2': coverColors[1], '--c3': coverColors[2],
        '--lyric-fill-c1': cfg.flowFillColorMode === 'cover-gradient' ? coverColors[0] : cfg.textColor,
        '--lyric-fill-c2': cfg.flowFillColorMode === 'cover-gradient' ? coverColors[1] : cfg.textColor,
        '--lyric-fill-cover': cfg.flowFillColorMode === 'cover-gradient'
          ? `color-mix(in srgb, ${coverColors[0]} 55%, ${coverColors[1]})`
          : cfg.textColor,
      }}
      onPointerDown={preview ? undefined : onPointerDown}
      onContextMenu={preview ? undefined : onContextMenu}
    >
      {isAvatar ? (
        // 透明模式：沒有玻璃底，只有頭像 + 字幕
        <div className="plain">{contentShell}</div>
      ) : (
        <LiquidGlass
          style={preview ? { position: 'absolute', top: '50%', left: '50%' } : { position: 'fixed' }}
          mouseContainer={preview ? undefined : mouseContainer}
          globalMousePos={pillMouse.globalMousePos}
          mouseOffset={pillMouse.mouseOffset}
          displacementScale={glass.displacementScale}
          blurAmount={glass.blurAmount}
          saturation={glass.saturation}
          aberrationIntensity={glass.aberrationIntensity}
          elasticity={glass.elasticity}
          cornerRadius={cornerRadius}
          mode={glass.mode}
          overLight={glass.overLight}
          padding="0"
        >
          {contentShell}
        </LiquidGlass>
      )}
    </div>
  )
}

export default memo(Capsule)
