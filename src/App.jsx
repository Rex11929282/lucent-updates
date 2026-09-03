import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Capsule from './components/Capsule.jsx'
import { ov } from './overlayBridge.js'
import { useSharedState } from './useSharedState.js'
import { useRoom, positionMsOf, shouldScheduleVisualTick } from './useRoom.js'
import { lineIndexAt, totalDuration } from './lyrics.js'
import {
  currentSongLyric,
  activeFlowFillRatio,
  displayFlowFillRatio,
  flowDisplayMirror,
  hasActiveSong,
  holdFlowFillRatio,
  lyricLineIdentity,
  mirrorFallbackRatio,
  mirrorFlowFillRatio,
  mirrorKaraokeRatio,
  mirrorMatchesSong,
  nextMirrorTiming,
  rendererSongRevisionKey,
  shouldCommitDisplayMirror,
} from './songDisplay.js'
import {
  advanceSongTransition,
  initialSongTransition,
  isTransitionEffectsPaused,
  visualForSongTransition,
} from './songTransition.js'
import { EMPTY_AUDIO_SPECTRUM } from './audioSpectrum.js'
import { preloadArtwork } from './artworkCache.js'
import { idleCapsulePresentation } from './idleCapsule.js'
import { LUCENT_AVATAR_ASSET, LUCENT_COVER_ASSET } from './brandAssets.js'
import { createTranslator, detectSystemLocale, resolveLocale } from './i18n.js'

export default function App() {
  const containerRef = useRef(null)
  const capsuleRef = useRef(null)
  const transitionWrapRef = useRef(null)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const { state } = useSharedState()
  const { glass, cfg, lyricsRaw } = state
  const activeLocale = resolveLocale(state.ui?.locale, detectSystemLocale())
  const t = useMemo(() => createTranslator(activeLocale), [activeLocale])
  const { state: roomState, status: roomStatus, clockRef, clockRevision, playing: roomPlaying } = useRoom()
  const audioSpectrumRef = useRef(EMPTY_AUDIO_SPECTRUM)
  const spectrumActive = roomState?.source === 'internal-player'

  useEffect(() => ov.player.onSpectrum((frame) => {
    const bands = Array.isArray(frame?.bands)
      ? frame.bands.slice(0, 32).map((value) => Math.max(0, Math.min(1, Number(value) || 0)))
      : []
    audioSpectrumRef.current = frame?.active === true && bands.length
      ? { active: true, sequence: Math.max(0, Math.floor(Number(frame.sequence) || 0)), bands }
      : EMPTY_AUDIO_SPECTRUM
  }), [])

  useEffect(() => {
    if (!spectrumActive) audioSpectrumRef.current = EMPTY_AUDIO_SPECTRUM
  }, [spectrumActive])

  useEffect(() => ov.onConsoleVisibility((value) => setConsoleCollapsed(!!value)), [])

  // 有偵測到歌（即使歌詞還在抓）就不要退回示範字幕，否則換歌會閃一下 DEMO
  const hasRoomSong = hasActiveSong(roomState)
  const standby = !hasRoomSong || roomState?.song?.loading === true
  const idlePresentation = idleCapsulePresentation({ roomMode: roomStatus?.mode, song: roomState?.song, t })
  const hasRoomLyrics = !!(!standby && roomState.lines?.length)
  const songKey = rendererSongRevisionKey(roomState?.song)
  const [songTransition, setSongTransition] = useState(initialSongTransition)
  const transitionRevisionRef = useRef(0)
  const previousSongKeyRef = useRef('')
  const stableVisualRef = useRef(null)
  const [frozenVisual, setFrozenVisual] = useState(null)
  const [artworkReadyRevision, setArtworkReadyRevision] = useState(0)
  const [failedArtworkUrls, setFailedArtworkUrls] = useState(() => new Set())
  const handledEndTokenRef = useRef(0)
  const transitionModeRef = useRef(cfg.songTransitionMode)
  const pendingSongChange = cfg.songTransitionMode !== 'shatter'
    && !!(songKey && previousSongKeyRef.current && previousSongKeyRef.current !== songKey)

  useLayoutEffect(() => {
    if (cfg.songTransitionMode === 'shatter') {
      if (songKey && songKey !== 'none') previousSongKeyRef.current = songKey
      return undefined
    }
    if (!songKey || songKey === 'none') {
      previousSongKeyRef.current = ''
      setSongTransition(initialSongTransition())
      return undefined
    }
    const previous = previousSongKeyRef.current
    previousSongKeyRef.current = songKey
    if (!previous || previous === songKey || cfg.songTransitionMode === 'none') return undefined

    const revision = ++transitionRevisionRef.current
    const speed = Math.max(0.5, Math.min(2, cfg.transitionSpeed ?? 1))
    if (stableVisualRef.current) setFrozenVisual(stableVisualRef.current)
    setSongTransition((state) => advanceSongTransition(state, { type: 'song', revision, at: performance.now() }))
    const timer = setTimeout(() => {
      setSongTransition((state) => advanceSongTransition(state, { type: 'collapsed', revision, at: performance.now() }))
    }, 220 / speed)
    return () => clearTimeout(timer)
  }, [songKey, cfg.songTransitionMode])

  useLayoutEffect(() => {
    if (transitionModeRef.current === cfg.songTransitionMode) return undefined
    transitionModeRef.current = cfg.songTransitionMode
    if (cfg.songTransitionMode === 'shatter') {
      handledEndTokenRef.current = Number(roomState?.transition?.token) || 0
    }
    setSongTransition(initialSongTransition())
    setFrozenVisual(null)
    return undefined
  }, [cfg.songTransitionMode, roomState?.transition?.token])

  // 粒子重組前先把封面與唱片中心圖片真正載入 Renderer 快取。
  // 請求失敗也算完成，畫面會使用既有占位，不會永遠卡在破碎後狀態。
  useEffect(() => {
    const song = roomState?.song
    const revision = Number(song?.revision) || 0
    if (!revision || song?.loading !== false || song?.artworkReady === false) {
      setArtworkReadyRevision(0)
      setFailedArtworkUrls(new Set())
      return undefined
    }
    const urls = [...new Set([song.cover, song.artistImageUrl, song.avatar].filter(Boolean))]
    if (!urls.length) {
      setFailedArtworkUrls(new Set())
      setArtworkReadyRevision(revision)
      return undefined
    }
    let cancelled = false
    Promise.all(urls.map((url) => preloadArtwork(url))).then((results) => {
      if (!cancelled) {
        setFailedArtworkUrls(new Set(results.filter((result) => !result.ok).map((result) => result.url)))
        setArtworkReadyRevision(revision)
      }
    })
    return () => { cancelled = true }
  }, [roomState?.song?.revision, roomState?.song?.loading, roomState?.song?.artworkReady, roomState?.song?.cover, roomState?.song?.artistImageUrl, roomState?.song?.avatar])

  useLayoutEffect(() => {
    const token = Number(roomState?.transition?.token) || 0
    if (cfg.songTransitionMode !== 'shatter' || !token || token === handledEndTokenRef.current) return undefined
    handledEndTokenRef.current = token
    if (stableVisualRef.current) setFrozenVisual(stableVisualRef.current)
    setSongTransition((current) => advanceSongTransition(current, {
      type: 'end', revision: token, at: performance.now(),
    }))
    return undefined
  }, [cfg.songTransitionMode, roomState?.transition?.token])

  useLayoutEffect(() => {
    const nextRevision = Number(roomState?.song?.revision) || 0
    if (
      songTransition.phase !== 'hold'
      || roomState?.song?.loading !== false
      || roomState?.song?.artworkReady === false
      || !nextRevision
      || artworkReadyRevision !== nextRevision
    ) return undefined
    const { revision } = songTransition
    setSongTransition((state) => advanceSongTransition(state, { type: 'ready', revision, at: performance.now() }))
    return undefined
  }, [songTransition.phase, songTransition.revision, roomState?.song?.revision, roomState?.song?.loading, roomState?.song?.artworkReady, artworkReadyRevision])

  useLayoutEffect(() => {
    if (cfg.songTransitionMode !== 'shatter' || songTransition.phase !== 'dormant') return undefined
    const readyRevision = Number(roomState?.transition?.readySongRevision) || 0
    const endedRevision = Number(roomState?.transition?.endedSongRevision) || 0
    const lyricReady = !!roomState?.mirror?.text
      || !!roomState?.lines?.length
      || roomState?.syncStatus === 'no-precise-data'
    if (!readyRevision || readyRevision === endedRevision || artworkReadyRevision !== readyRevision || !lyricReady) return undefined
    setSongTransition((current) => advanceSongTransition(current, {
      type: 'next-ready', revision: current.revision, at: performance.now(),
    }))
    return undefined
  }, [cfg.songTransitionMode, songTransition.phase, roomState?.transition?.readySongRevision, roomState?.transition?.endedSongRevision, roomState?.mirror?.text, roomState?.lines?.length, roomState?.syncStatus, artworkReadyRevision])

  useLayoutEffect(() => {
    if (songTransition.phase !== 'expand') return undefined
    const { revision } = songTransition
    const speed = Math.max(0.5, Math.min(2, cfg.transitionSpeed ?? 1))
    const timer = setTimeout(() => {
      setSongTransition((state) => advanceSongTransition(state, { type: 'finished', revision, at: performance.now() }))
    }, 360 / speed)
    return () => clearTimeout(timer)
  }, [songTransition.phase, songTransition.revision, cfg.transitionSpeed])

  useLayoutEffect(() => {
    if (songTransition.phase === 'idle' && frozenVisual) setFrozenVisual(null)
  }, [songTransition.phase, frozenVisual])

  useLayoutEffect(() => {
    const el = transitionWrapRef.current
    if (!el || songTransition.phase !== 'collapse') return
    el.classList.remove('transition-run')
    void el.offsetWidth
    el.classList.add('transition-run')
  }, [songTransition.revision, songTransition.phase])

  const onTransitionEvent = useCallback((type) => {
    setSongTransition((current) => advanceSongTransition(current, {
      type, revision: current.revision, at: performance.now(),
    }))
  }, [])

  const lines = hasRoomLyrics ? roomState.lines : []
  const timed = hasRoomLyrics ? roomState.timed : false

  const [localPlaying, setLocalPlaying] = useState(false)
  const visualClockPlaying = !standby && shouldScheduleVisualTick({ hasRoomSong, roomPlaying, localPlaying: false })
  const [curIdx, setCurIdx] = useState(0)
  const localTimeRef = useRef(0)
  const lastTsRef = useRef(0)
  const progressRef = useRef(0)
  const karaokeRef = useRef(0) // 目前這行的逐字填光比例 0~1
  const lyricFillRef = useRef(0)
  const lyricFillActiveRef = useRef(false)
  const displayMirrorRef = useRef({ songKey: '', mirror: null })
  const pendingDisplayMirrorRef = useRef(null)
  const [displayMirrorState, setDisplayMirrorState] = useState({ songKey: '', mirror: null })
  const commitDisplayMirror = useCallback((entry) => {
    if (!shouldCommitDisplayMirror(displayMirrorRef.current, entry)) return false
    displayMirrorRef.current = entry
    setDisplayMirrorState(entry)
    return true
  }, [])

  const songDurSec = !standby && hasRoomSong ? (roomState?.song?.durationMs || 0) / 1000 : 0

  // 統一時鐘：房間有歌 → 用同步進度；否則本地示範播放
  useEffect(() => {
    let frame = 0
    let stopped = false
    const tick = () => {
      let posSec
      if (hasRoomSong) {
        posSec = positionMsOf(clockRef.current) / 1000
      } else {
        if (!localPlaying) return
        const now = performance.now()
        if (!lastTsRef.current) lastTsRef.current = now
        localTimeRef.current += (now - lastTsRef.current) / 1000
        lastTsRef.current = now
        const dur = totalDuration(lines, timed, cfg.secondsPerLine)
        if (dur > 0 && localTimeRef.current >= dur) localTimeRef.current = 0
        posSec = localTimeRef.current
      }
      const idx = lineIndexAt(lines, timed, posSec, cfg.secondsPerLine)
      setCurIdx((prev) => (prev === idx ? prev : idx))
      // 進度條（0~1），用 ref 傳給藥丸直接更新，不重繪玻璃
      const durSec = hasRoomSong ? songDurSec : totalDuration(lines, timed, cfg.secondsPerLine)
      progressRef.current = {
        ratio: durSec > 0 ? Math.min(1, Math.max(0, posSec / durSec)) : 0,
        posSec,
        durSec,
      }
      const displayedMirror = displayMirrorRef.current
      const pendingMirror = pendingDisplayMirrorRef.current
      if (pendingMirror?.songKey === songKey && displayedMirror?.songKey === songKey && displayedMirror.mirror) {
        const selected = flowDisplayMirror({
          previous: displayedMirror.mirror,
          incoming: pendingMirror.mirror,
          lines,
          position: posSec,
        })
        if (selected === pendingMirror.mirror) {
          const entry = { songKey, mirror: pendingMirror.mirror }
          pendingDisplayMirrorRef.current = null
          displayMirrorRef.current = entry
          setDisplayMirrorState(entry)
        }
      }
      // 鏡像模式：鏡像決定顯示句，YRC 時間軸決定逐字填光；無匹配/逐字資料才用平均句長。
      if (mirrorRef.current.active) {
        const m = mirrorRef.current
        const fallbackRatio = mirrorFallbackRatio(m, performance.now())
        const fillRatio = mirrorFlowFillRatio({
          lines,
          mirrorText: m.text,
          mirrorIndex: m.i,
          position: posSec,
        })
        const displayRatio = displayFlowFillRatio(fillRatio)
        lyricFillActiveRef.current = Number.isFinite(displayRatio)
        lyricFillRef.current = lyricFillActiveRef.current
          ? holdFlowFillRatio(lyricFillRef.current, displayRatio)
          : 0
        karaokeRef.current = mirrorKaraokeRatio({
          lines,
          mirrorText: m.text,
          position: posSec,
          fallbackRatio,
        })
        if (!stopped && visualClockPlaying) frame = requestAnimationFrame(tick)
        return
      }
      // 卡拉OK：有 YRC 逐字時間軸就精準到字；否則整行等速填光
      if (idx >= 0) {
        const cur = lines[idx]
        const displayRatio = displayFlowFillRatio(activeFlowFillRatio({ lines, line: cur, position: posSec }))
        lyricFillActiveRef.current = Number.isFinite(displayRatio)
        lyricFillRef.current = lyricFillActiveRef.current ? displayRatio : 0
        if (cur?.words?.length) {
          // 逐字：算已唱完的字元比例（字內插值）。
          // 必須用 Array.from 計數，與畫面上 Array.from(text) 產生的 span 數一致
          // （.length 是 UTF-16 碼元，遇到 emoji/代理對會與 span 數不符 → 高亮錯位）
          let done = 0
          for (const w of cur.words) {
            const n = Array.from(w.text).length
            if (posSec >= w.t + w.d) done += n
            else if (posSec > w.t && w.d > 0) { done += n * ((posSec - w.t) / w.d); break }
            else break
          }
          const totalChars = Array.from(cur.text).length || 1
          karaokeRef.current = Math.max(0, Math.min(1, done / totalChars))
        } else {
          const ls = timed ? (cur?.time ?? 0) : idx * cfg.secondsPerLine
          const leRaw = timed ? (lines[idx + 1]?.time ?? ls + 5) : (idx + 1) * cfg.secondsPerLine
          // 沒有逐字時間軸時：唱完通常還留一小段空檔才換行。
          // 用「固定每字秒數」估算會忽快忽慢（實際句長不合時會提早跑完卡住），
          // 改成依實際句長等比例縮短一小截，速度才會平順且貼合唱速。
          const span = Math.max(0.2, leRaw - ls)
          const le = ls + span * 0.88
          karaokeRef.current = le > ls ? Math.max(0, Math.min(1, (posSec - ls) / (le - ls))) : 1
        }
      } else {
        karaokeRef.current = 0
        lyricFillRef.current = 0
        lyricFillActiveRef.current = false
      }
      if (!stopped && visualClockPlaying) frame = requestAnimationFrame(tick)
    }
    tick()
    return () => { stopped = true; cancelAnimationFrame(frame); lastTsRef.current = 0 }
  }, [hasRoomSong, roomPlaying, localPlaying, visualClockPlaying, lines, timed, cfg.secondsPerLine, songDurSec, clockRef, clockRevision, songKey])

  // 優先鏡像網易雲畫面上正在高亮的那一句：由網易雲自己決定，天生同步，
  // 完全不需要時間軸計算（同步問題的根本解）。抓不到時才退回時間軸推算。
  const mirror = roomState?.mirror
  const waitingForIdentity = roomState?.syncStatus === 'waiting-identity'
    || roomState?.syncStatus === 'no-precise-data'
  const useMirror = !waitingForIdentity && mirrorMatchesSong(mirror, roomState?.song)
  const displayMirror = useMirror && displayMirrorState.songKey === songKey && displayMirrorState.mirror
    ? displayMirrorState.mirror
    : mirror

  useLayoutEffect(() => {
    if (!useMirror || !mirror?.text) {
      pendingDisplayMirrorRef.current = null
      const entry = { songKey, mirror: null }
      commitDisplayMirror(entry)
      return undefined
    }
    const previous = displayMirrorRef.current?.songKey === songKey
      ? displayMirrorRef.current.mirror
      : null
    if (!previous) {
      const entry = { songKey, mirror }
      commitDisplayMirror(entry)
      return undefined
    }
    const position = positionMsOf(clockRef.current) / 1000
    const selected = flowDisplayMirror({ previous, incoming: mirror, lines, position })
    if (selected === previous) {
      pendingDisplayMirrorRef.current = { songKey, mirror }
      return undefined
    }
    pendingDisplayMirrorRef.current = null
    const entry = { songKey, mirror }
    commitDisplayMirror(entry)
    return undefined
  }, [useMirror, mirror?.i, mirror?.text, mirror?.trans, lines, songKey, clockRef, commitDisplayMirror])

  const lineIdentity = lyricLineIdentity({ songKey, useMirror, mirror: displayMirror, curIdx })

  useLayoutEffect(() => {
    karaokeRef.current = 0
    lyricFillRef.current = 0
    lyricFillActiveRef.current = false
  }, [lineIdentity])

  // 記錄鏡像句的換句時刻與最近平均句長，供卡拉OK填光推算
  const mirrorRef = useRef({ active: false, identity: '', text: '', at: 0, dur: 3.5, hist: [] })
  useEffect(() => {
    localTimeRef.current = 0
    progressRef.current = { ratio: 0, posSec: 0, durSec: 0 }
    karaokeRef.current = 0
    lyricFillRef.current = 0
    lyricFillActiveRef.current = false
    setCurIdx(0)
    const state = mirrorRef.current
    state.active = false
    state.identity = ''
    state.text = ''
    state.at = 0
    state.dur = 3.5
    state.hist = []
  }, [lyricsRaw, songKey])

  useLayoutEffect(() => {
    mirrorRef.current = nextMirrorTiming(mirrorRef.current, {
      active: useMirror,
      identity: lineIdentity,
      text: mirror?.text || '',
      now: performance.now(),
    })
  }, [useMirror, lineIdentity, mirror?.text])

  const curLine = currentSongLyric({
    song: roomState?.song,
    mirror: useMirror ? displayMirror : null,
    lines,
    curIdx,
    syncStatus: roomState?.syncStatus,
  })
  // 雙語：該句的翻譯（沒有翻譯的歌就不顯示第二行）
  const curTrans = !cfg.bilingual
    ? ''
    : (waitingForIdentity ? '' : (useMirror ? (displayMirror?.trans || '') : (curIdx >= 0 ? lines[curIdx]?.trans || '' : '')))
  // 這首歌是否有翻譯：整首固定保留翻譯列，避免逐句忽高忽低造成玻璃重算閃爍
  const songHasTrans = useMemo(
    () => !!(cfg.bilingual && lines.some((l) => l && l.trans)),
    [cfg.bilingual, lines]
  )
  const nextLine = curIdx + 1 < lines.length ? lines[curIdx + 1]?.text : ''

  const onCapsuleClick = useCallback(() => {
    if (hasRoomSong && !standby) ov.player.toggle()
  }, [hasRoomSong, standby])

  useEffect(() => ov.onTogglePlay(() => {
    if (hasRoomSong && !standby) ov.player.toggle()
  }), [hasRoomSong, standby])

  // 滑鼠穿透
  useEffect(() => {
    if (!ov.isElectron) return
    if (!cfg.clickThrough) { ov.setIgnoreMouse(false); return }
    ov.setIgnoreMouse(true)
    return () => ov.setIgnoreMouse(false)
  }, [cfg.clickThrough])

  const onContextMenu = useCallback((e) => { e.preventDefault(); ov.popupMenu() }, [])

  // 桌面擷取影格：對齊視窗後方的桌面，讓玻璃折射它（像 iOS 26）
  const [frame, setFrame] = useState(null)
  useEffect(() => ov.onDesktopFrame(setFrame), [])
  const showDesktop = cfg.backdrop === 'desktop' && frame
  const desktopStyle = showDesktop
    ? {
        backgroundImage: `url(${frame.dataURL})`,
        backgroundSize: `${frame.disp.w}px ${frame.disp.h}px`,
        backgroundPosition: `${-(frame.win.x - frame.disp.x)}px ${-(frame.win.y - frame.disp.y)}px`,
        backgroundRepeat: 'no-repeat',
        borderRadius: `${Math.min(glass.cornerRadius, 60)}px`,
      }
    : { display: 'none' }

  // 專輯封面當底：玻璃會真的模糊/折射它（真玻璃、不卡）
  // 待機時沒有歌曲封面，就用璃音自己的封面，藥丸才不會空著。
  const usableSongCover = roomState?.song?.cover && !failedArtworkUrls.has(roomState.song.cover)
    ? roomState.song.cover
    : ''
  const usableArtistImage = [roomState?.song?.artistImageUrl, roomState?.song?.avatar, usableSongCover]
    .find((url) => url && !failedArtworkUrls.has(url)) || ''
  const coverUrl = cfg.backdrop === 'cover'
    ? (standby ? LUCENT_COVER_ASSET : (usableSongCover || LUCENT_COVER_ASSET))
    : ''
  const liveVisual = useMemo(() => ({
    line: standby ? idlePresentation.line : curLine,
    trans: standby ? '' : curTrans,
    reserveTrans: standby ? false : songHasTrans,
    lineKey: standby ? `idle:${idlePresentation.state}` : lineIdentity,
    useMirror: standby ? false : useMirror,
    songName: standby ? idlePresentation.songName : [roomState.song.name, roomState.song.artist].filter(Boolean).join(' · '),
    coverUrl,
    songCoverUrl: standby ? '' : usableSongCover,
    avatarUrl: standby ? LUCENT_AVATAR_ASSET : (usableArtistImage || LUCENT_AVATAR_ASSET),
    showProgress: !standby && hasRoomSong && songDurSec > 0,
    playing: !standby && hasRoomSong ? roomPlaying : false,
  }), [standby, idlePresentation, curLine, curTrans, songHasTrans, lineIdentity, useMirror, hasRoomSong, roomState?.song?.name, roomState?.song?.artist, usableSongCover, usableArtistImage, coverUrl, songDurSec, roomPlaying, localPlaying])
  // 新歌在 loading 期間仍沿用既有過場的穩定畫面；不能因為暫時沒有歌詞／封面
  // 就直接切到待機藥丸，否則會先閃成另一個尺寸，接著才跳回新歌。
  const transitionVisual = visualForSongTransition(
    pendingSongChange && cfg.songTransitionMode !== 'none' ? 'collapse' : songTransition.phase,
    frozenVisual || (pendingSongChange ? stableVisualRef.current : null),
    liveVisual,
  )
  const transitionEffectsPaused = cfg.songTransitionMode === 'shatter'
    && isTransitionEffectsPaused(songTransition.phase)

  useLayoutEffect(() => {
    if (!hasRoomSong || roomState?.song?.loading || songTransition.phase !== 'idle') return
    stableVisualRef.current = liveVisual
  }, [hasRoomSong, roomState?.song?.loading, songTransition.phase, liveVisual])

  return (
    <div className="app" ref={containerRef}>
      <div className="desktopbg" style={desktopStyle} />
      <div className="stage">
        <div
          ref={transitionWrapRef}
          className={`song-transition-wrap transition-${cfg.songTransitionMode || 'collapse'} phase-${songTransition.phase}${songTransition.phase === 'collapse' ? ' transition-run' : ''}`}
        >
        <Capsule
          consoleCollapsed={consoleCollapsed}
          innerRef={capsuleRef}
          mouseContainer={containerRef}
          line={transitionVisual.line}
          trans={transitionVisual.trans}
          reserveTrans={transitionVisual.reserveTrans}
          playing={transitionVisual.playing}
          lineKey={transitionVisual.lineKey}
          useMirror={transitionVisual.useMirror}
          songName={transitionVisual.songName}
          next={nextLine}
          cfg={cfg}
          glass={glass}
          coverUrl={transitionVisual.coverUrl}
          songCoverUrl={transitionVisual.songCoverUrl}
          avatarUrl={transitionVisual.avatarUrl}
          progressRef={progressRef}
          karaokeRef={karaokeRef}
          lyricFillRef={lyricFillRef}
          lyricFillActiveRef={lyricFillActiveRef}
          audioSpectrumRef={audioSpectrumRef}
          spectrumActive={spectrumActive}
          showProgress={transitionVisual.showProgress}
          // 只有真的沒有歌曲時才顯示待機唱片；換歌載入中要保留過場畫面的結構，
          // 避免唱片忽然出現／消失而觸發尺寸重算。
          forceVinyl={!hasRoomSong}
          transitionPhase={songTransition.phase}
          transitionRevision={songTransition.revision}
          effectsPaused={transitionEffectsPaused}
          onTransitionEvent={onTransitionEvent}
          onClick={onCapsuleClick}
          onContextMenu={onContextMenu}
        />
        </div>
      </div>
    </div>
  )
}
