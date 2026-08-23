import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import LiquidGlass from 'liquid-glass-react'
import { ov } from '../overlayBridge.js'
import { applyKaraokeClasses } from '../songDisplay.js'
import {
  pillHasBackground,
  progressClasses,
  progressSegmentStates,
} from '../appearanceModel.js'
import DecorationCanvas from './DecorationCanvas.jsx'
import { findVinylFrame } from '../frameAssets.js'
import GlassSheen from './GlassSheen.jsx'
import SongTransitionLayer from './SongTransitionLayer.jsx'
import { usePillMouse } from '../usePillMouse.js'
import { particleTransitionDuration } from '../songTransition.js'

// 固定大小藥丸：字幕不滾動、最多兩行、完整；下方有進度條與時間。
// 兩種外觀：glass = 液態玻璃藥丸；avatar = 透明底 + 左側歌手頭像。
function Capsule({ innerRef, mouseContainer, line, trans, reserveTrans, playing, lineKey, useMirror, songName, cfg, glass, coverUrl, avatarUrl, progressRef, karaokeRef, lyricFillRef, showProgress, transitionPhase = 'idle', transitionRevision = 0, effectsPaused = false, onTransitionEvent, onClick, onContextMenu }) {
  const wrapRef = useRef(null)
  const fillRef = useRef(null)
  const timeRef = useRef(null)
  const barRef = useRef(null)
  const segmentsRef = useRef(null)
  const txtRef = useRef(null)
  const contentRef = useRef(null)
  const pillMouse = usePillMouse(
    wrapRef,
    cfg.hoverActivationDistance ?? 14,
    !effectsPaused && ((glass.elasticity ?? 0) > 0 || !!cfg.fxTilt),
  )
  const onSnapshotReady = useCallback(() => onTransitionEvent?.('snapshot-ready'), [onTransitionEvent])
  const onSnapshotFailed = useCallback(() => onTransitionEvent?.('snapshot-failed'), [onTransitionEvent])
  const onOutFinished = useCallback(() => onTransitionEvent?.('out-finished'), [onTransitionEvent])
  const onInFinished = useCallback(() => onTransitionEvent?.('finished'), [onTransitionEvent])
  const text = line || '♪'
  const lyricHighlightMode = cfg.lyricHighlightMode || (cfg.karaoke === false ? 'off' : 'characters')
  const characterHighlight = lyricHighlightMode === 'characters' || lyricHighlightMode === 'both'
  // 流動填色只能吃真正的 YRC 字詞時間；沒有逐字資料時維持原文，不用假速度補動畫。
  const fillHighlight = lyricHighlightMode === 'fill' || lyricHighlightMode === 'both'
  const isAvatar = !pillHasBackground(cfg.skin)
  // 唱片頭像：透明模式一定顯示；玻璃模式可由設定開關決定（顯示在藥丸左邊）
  const showVinyl = isAvatar || !!cfg.showVinyl
  const showSegments = !!cfg.segmentedBar || cfg.progressAnim === 'segments'
  const segmentCount = Math.max(2, Math.min(40, Math.round(cfg.segmentCount ?? 12)))

  useLayoutEffect(() => {
    if (!characterHighlight) return
    applyKaraokeClasses(txtRef.current, 0, text)
  }, [characterHighlight, lineKey, useMirror, text])

  // 唯一的播放中字幕更新器：直接讀共享時鐘 ref，不因每一字觸發 React 重繪。
  // 暫停時只畫一次目前比例，不保留空轉的計時器。
  useEffect(() => {
    if (!characterHighlight && !fillHighlight) return undefined
    let frame = 0
    let lastCharacterRatio = -1
    let lastFillRatio = -1
    let stopped = false
    const paint = () => {
      if (stopped) return
      const characterRatio = Math.max(0, Math.min(1, karaokeRef?.current || 0))
      const fillRatio = Math.max(0, Math.min(1, lyricFillRef?.current || 0))
      const roundedCharacter = Math.round(characterRatio * 1000) / 1000
      const roundedFill = Math.round(fillRatio * 1000) / 1000
      if (characterHighlight && roundedCharacter !== lastCharacterRatio) {
        applyKaraokeClasses(txtRef.current, roundedCharacter, text)
        lastCharacterRatio = roundedCharacter
      }
      if (fillHighlight && roundedFill !== lastFillRatio && txtRef.current) {
        txtRef.current.style.setProperty('--lyric-fill', `${(roundedFill * 100).toFixed(2)}%`)
        lastFillRatio = roundedFill
      }
      if (playing && !effectsPaused) frame = requestAnimationFrame(paint)
    }
    paint()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
  }, [characterHighlight, fillHighlight, playing, effectsPaused, karaokeRef, lyricFillRef, lineKey, useMirror, text])

  useLayoutEffect(() => {
    if (innerRef) innerRef.current = wrapRef.current
    return () => { if (innerRef) innerRef.current = null }
  }, [innerRef])

  // 視窗尺寸「量測驅動」：實際量玻璃/內容有多大，就把視窗開多大。
  // 不用公式硬猜，任何字級、寬度、雙語、唱片組合都不會被裁到 → UI 不會變形。
  const appliedRef = useRef({ w: 0, h: 0 })
  const [shrink, setShrink] = useState(0) // 超出螢幕時自動縮窄的量
  // 從專輯封面抽出三個主色（rgbMode = cover 時使用）
  const [coverColors, setCoverColors] = useState(['#ff3d81', '#2ec4ff', '#8a5cff'])
  useEffect(() => {
    if (cfg.rgbMode !== 'cover' || !coverUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const N = 12
        const cv = document.createElement('canvas')
        cv.width = N; cv.height = N
        const ctx = cv.getContext('2d')
        ctx.drawImage(img, 0, 0, N, N)
        const d = ctx.getImageData(0, 0, N, N).data
        const picks = []
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2]
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
          picks.push({ r, g, b, sat: mx - mn, lum: (mx + mn) / 2 })
        }
        picks.sort((a, b) => (b.sat + b.lum * 0.3) - (a.sat + a.lum * 0.3))
        const pick = (i) => {
          const p = picks[Math.min(i, picks.length - 1)] || { r: 120, g: 140, b: 255 }
          return `rgb(${p.r},${p.g},${p.b})`
        }
        setCoverColors([pick(0), pick(Math.floor(picks.length * 0.15)), pick(Math.floor(picks.length * 0.3))])
      } catch {}
    }
    img.src = coverUrl
  }, [cfg.rgbMode, coverUrl])
  useEffect(() => { setShrink(0) }, [cfg.maxWidth, cfg.fontSize, cfg.skin, showVinyl])
  useEffect(() => {
    if (!ov.isElectron) return
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
  }, [cfg.maxWidth, cfg.fontSize, cfg.skin, glass.elasticity, glass.cornerRadius, showVinyl, reserveTrans, text])

  // 進度條 + 時間：用 ref 直接改 DOM，不觸發玻璃重繪
  useEffect(() => {
    if (effectsPaused) return undefined
    const fmt = (s) => {
      if (!isFinite(s) || s < 0) s = 0
      const m = Math.floor(s / 60)
      return m + ':' + String(Math.floor(s % 60)).padStart(2, '0')
    }
    const id = setInterval(() => {
      const p = Math.max(0, Math.min(1, progressRef?.current?.ratio ?? progressRef?.current ?? 0))
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p.toFixed(4)})`
      if (segmentsRef.current) {
        const states = progressSegmentStates(segmentCount, p)
        const nodes = segmentsRef.current.children
        for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('played', states[i])
      }
      if (timeRef.current) {
        const cur = progressRef?.current?.posSec
        const dur = progressRef?.current?.durSec
        timeRef.current.textContent = (cur != null && dur ? fmt(cur) + ' / ' + fmt(dur) : '')
      }
    }, 100)
    return () => clearInterval(id)
  }, [progressRef, segmentCount, effectsPaused])

  // 玻璃元件只在 window resize 時重算自身尺寸；換歌時內容高度會變（有無翻譯列），
  // 若不通知它重算，濾鏡尺寸會停留在上一首 → 畫面變形（換下一首後 UI 變怪）。
  useEffect(() => {
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
  }, [isAvatar])

  // 換句時讓進度條「跳動」一下（這是我們手上真實的節奏訊號）
  useEffect(() => {
    if (effectsPaused) return undefined
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
    return () => timers.forEach(clearTimeout)
  }, [lineKey, cfg.barBeat, cfg.fxBreathe, cfg.fxVinylBounce, effectsPaused])

  const onPointerDown = useCallback(async (e) => {
    if (e.button !== 0) return
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
  }, [onClick, cfg.locked])

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
  const hasCustomVinylFrame = !!vinylFrame.url
  const shatterContent = cfg.songTransitionMode === 'shatter'
    && (transitionPhase === 'shatter-out' || transitionPhase === 'dormant' || transitionPhase === 'shatter-in')

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
          <div className="noise-layer" />
          <GlassSheen cfg={cfg} />
          <DecorationCanvas cfg={cfg} playing={playing && !effectsPaused} eventKey={lineKey} previewActive={!effectsPaused} />
          </>
        )}
      </div>
      {/* 歌名：左上角獨立一行，不與歌詞或唱片重疊 */}
      {cfg.showSongName && songName ? (
        <div className="songname" style={{ fontSize: Math.max(9, Math.round(cfg.fontSize * 0.6)) }}>
          {songName}
        </div>
      ) : null}
      <div className="row-wrap">
      {showVinyl && (
        <div className={`vinyl ${hasCustomVinylFrame ? 'vinyl--framed' : ''} ${playing && !effectsPaused ? 'spin' : ''}`} style={{ width: avatarSize, height: avatarSize, ...(hasCustomVinylFrame ? { '--vinyl-cover-scale': vinylFrame.coverScale } : null) }}>
          <div className="vinyl__ring" />
          <div className="vinyl__disc" />
          <div className="vinyl__art vinyl__art--default">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <div className="vinyl__ph">♪</div>}
          </div>
          {hasCustomVinylFrame ? (
            <>
              <div className="vinyl__art vinyl__art--framed">
                {avatarUrl ? <img src={avatarUrl} alt="" /> : <div className="vinyl__ph">♪</div>}
              </div>
              <div className="vinyl-frame" style={{ backgroundImage: `url("${vinylFrame.url}")` }} />
            </>
          ) : null}
        </div>
      )}
      <div className="lyrics" style={{ width: boxW }}>
        <div className={`lyrics__cur ${characterHighlight ? 'karaoke' : ''} ${fillHighlight ? 'highlight-fill' : ''}`} style={{ fontSize: cfg.fontSize, color: cfg.textColor, '--lyric-fill-base': cfg.textColor || '#ffffff' }}>
          {/* key 用文字本身：鏡像模式下 lineKey 不會變，用它會讓動畫套在舊句上 */}
          <span className={`lyrics__txt anim-${cfg.fxLineAnim || 'fade'}`} key={text} ref={txtRef} data-lyric={text}>
            {characterHighlight
              ? Array.from(text).map((c, i) => <span className="kchar" key={i}>{c === ' ' ? ' ' : c}</span>)
              : text}
          </span>
        </div>
        {/* 雙語第二行：翻譯。整首歌有翻譯就固定保留這一列（即使某句沒翻譯），
            避免逐句忽高忽低造成玻璃重算閃爍；整首沒翻譯則完全不佔空間。 */}
        {reserveTrans ? (
          <div className="lyrics__trans" style={{ fontSize: Math.round(cfg.fontSize * 0.72), color: cfg.textColor }}>
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
    </div>
  )
  const contentShell = (
    <div className="content-shell">
      {content}
      <SongTransitionLayer
        phase={transitionPhase}
        mode={cfg.songTransitionMode}
        revision={transitionRevision}
        sourceRef={wrapRef}
        loading={line === '♪'}
        visualKey={`${lineKey}|${songName}`}
        speed={cfg.transitionSpeed ?? 1}
        onSnapshotReady={onSnapshotReady}
        onSnapshotFailed={onSnapshotFailed}
        onOutFinished={onOutFinished}
        onInFinished={onInFinished}
      />
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
        cfg.fxPauseBreath && !playing && !effectsPaused ? 'fx-pausebreath' : '',
        cfg.fxTilt && !effectsPaused ? 'fx-tilt' : '',
        effectsPaused ? 'effects-paused' : '',
        cfg.smoothEdge ? 'fx-smooth' : '',
        `name-${cfg.songNamePos || 'tl'}`,
        `grad-${cfg.bgGradMode || 'none'}`,
        cfg.noise > 0 ? 'has-noise' : '',
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
        // --- 背景材質 ---
        '--bg-alpha': cfg.bgAlpha ?? 0.55,
        '--bg-blur': `${cfg.bgBlur ?? 18}px`,
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
        '--lyric-trans-gap': `${cfg.lyricTranslationGap ?? 7}px`,
        '--trans-progress-gap': `${cfg.translationProgressGap ?? 7}px`,
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
        '--bar-track-a': cfg.barTrackAlpha ?? 0.28,
        '--name-a': cfg.songNameAlpha ?? 0.62,
        '--name-c': cfg.songNameColor || '#ffffff',
        '--lyric-a': cfg.lyricAlpha ?? 1,
        '--text-stroke': `${(outline * (0.03 + clarity * 0.045)).toFixed(3)}em`,
        '--text-shadow-near': `${(1 + (1 - clarity) * 2).toFixed(1)}px`,
        '--text-shadow-mid': `${(3 + (1 - clarity) * 7).toFixed(1)}px`,
        '--text-shadow-glow': `${(2 + (1 - clarity) * 14).toFixed(1)}px`,
        '--text-shadow-glow-a': (0.42 * (1 - clarity)).toFixed(2),
        '--c1': coverColors[0], '--c2': coverColors[1], '--c3': coverColors[2],
      }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      {isAvatar ? (
        // 透明模式：沒有玻璃底，只有頭像 + 字幕
        <div className="plain">{contentShell}</div>
      ) : (
        <LiquidGlass
          style={{ position: 'fixed' }}
          mouseContainer={mouseContainer}
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
