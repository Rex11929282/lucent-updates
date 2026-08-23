import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Capsule from './components/Capsule.jsx'
import { ov } from './overlayBridge.js'
import { useSharedState } from './useSharedState.js'
import { useRoom, positionMsOf } from './useRoom.js'
import { DEMO_LYRICS, parseLyrics, lineIndexAt, totalDuration } from './lyrics.js'
import {
  currentSongLyric,
  flowFillRatioForLine,
  flowFillRatioForTimedLine,
  hasActiveSong,
  lyricLineIdentity,
  mirrorFallbackRatio,
  mirrorFlowFillRatio,
  mirrorKaraokeRatio,
  mirrorMatchesSong,
  nextMirrorTiming,
  rendererSongRevisionKey,
} from './songDisplay.js'
import {
  advanceSongTransition,
  initialSongTransition,
  isTransitionEffectsPaused,
  visualForSongTransition,
} from './songTransition.js'

export default function App() {
  const containerRef = useRef(null)
  const capsuleRef = useRef(null)
  const transitionWrapRef = useRef(null)
  const { state } = useSharedState()
  const { glass, cfg, lyricsRaw } = state
  const { state: roomState, clockRef, playing: roomPlaying } = useRoom()

  // 有偵測到歌（即使歌詞還在抓）就不要退回示範字幕，否則換歌會閃一下 DEMO
  const hasRoomSong = hasActiveSong(roomState)
  const hasRoomLyrics = !!(hasRoomSong && roomState.lines?.length)
  const songKey = rendererSongRevisionKey(roomState?.song)
  const [songTransition, setSongTransition] = useState(initialSongTransition)
  const transitionRevisionRef = useRef(0)
  const previousSongKeyRef = useRef('')
  const stableVisualRef = useRef(null)
  const [frozenVisual, setFrozenVisual] = useState(null)
  const [artworkReadyRevision, setArtworkReadyRevision] = useState(0)
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
      return undefined
    }
    const urls = [...new Set([song.cover, song.avatar].filter(Boolean))]
    if (!urls.length) {
      setArtworkReadyRevision(revision)
      return undefined
    }
    let cancelled = false
    Promise.all(urls.map((url) => new Promise((resolve) => {
      const image = new Image()
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      image.onload = finish
      image.onerror = finish
      image.src = url
      if (image.complete) finish()
    }))).then(() => {
      if (!cancelled) setArtworkReadyRevision(revision)
    })
    return () => { cancelled = true }
  }, [roomState?.song?.revision, roomState?.song?.loading, roomState?.song?.artworkReady, roomState?.song?.cover, roomState?.song?.avatar])

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
    if (songTransition.phase !== 'hold' || roomState?.song?.loading !== false) return undefined
    const { revision } = songTransition
    setSongTransition((state) => advanceSongTransition(state, { type: 'ready', revision, at: performance.now() }))
    return undefined
  }, [songTransition.phase, songTransition.revision, roomState?.song?.loading])

  useLayoutEffect(() => {
    if (cfg.songTransitionMode !== 'shatter' || songTransition.phase !== 'dormant') return undefined
    const readyRevision = Number(roomState?.transition?.readySongRevision) || 0
    const endedRevision = Number(roomState?.transition?.endedSongRevision) || 0
    if (!readyRevision || readyRevision === endedRevision || artworkReadyRevision !== readyRevision) return undefined
    setSongTransition((current) => advanceSongTransition(current, {
      type: 'next-ready', revision: current.revision, at: performance.now(),
    }))
    return undefined
  }, [cfg.songTransitionMode, songTransition.phase, roomState?.transition?.readySongRevision, roomState?.transition?.endedSongRevision, artworkReadyRevision])

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

  const localParsed = useMemo(
    () => (lyricsRaw.trim() ? parseLyrics(lyricsRaw) : { lines: DEMO_LYRICS, timed: false }),
    [lyricsRaw]
  )
  const lines = hasRoomLyrics ? roomState.lines : (hasRoomSong ? [] : localParsed.lines)
  const timed = hasRoomLyrics ? roomState.timed : (hasRoomSong ? false : localParsed.timed)

  const [localPlaying, setLocalPlaying] = useState(false)
  const [curIdx, setCurIdx] = useState(0)
  const localTimeRef = useRef(0)
  const lastTsRef = useRef(0)
  const progressRef = useRef(0)
  const karaokeRef = useRef(0) // 目前這行的逐字填光比例 0~1
  const lyricFillRef = useRef(0)

  const songDurSec = hasRoomSong ? (roomState?.song?.durationMs || 0) / 1000 : 0

  // 統一時鐘：房間有歌 → 用同步進度；否則本地示範播放
  useEffect(() => {
    const id = setInterval(() => {
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
      // 鏡像模式：鏡像決定顯示句，YRC 時間軸決定逐字填光；無匹配/逐字資料才用平均句長。
      if (mirrorRef.current.active) {
        const m = mirrorRef.current
        const fallbackRatio = mirrorFallbackRatio(m, performance.now())
        lyricFillRef.current = mirrorFlowFillRatio({
          lines,
          mirrorText: m.text,
          mirrorIndex: m.i,
          position: posSec,
        }) ?? 0
        karaokeRef.current = mirrorKaraokeRatio({
          lines,
          mirrorText: m.text,
          position: posSec,
          fallbackRatio,
        })
        return
      }
      // 卡拉OK：有 YRC 逐字時間軸就精準到字；否則整行等速填光
      if (idx >= 0) {
        const cur = lines[idx]
        lyricFillRef.current = flowFillRatioForLine(cur, posSec)
          ?? flowFillRatioForTimedLine(lines, cur, posSec)
          ?? 0
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
      }
    }, 80)
    return () => { clearInterval(id); lastTsRef.current = 0 }
  }, [hasRoomSong, localPlaying, lines, timed, cfg.secondsPerLine, songDurSec, clockRef])

  // 優先鏡像網易雲畫面上正在高亮的那一句：由網易雲自己決定，天生同步，
  // 完全不需要時間軸計算（同步問題的根本解）。抓不到時才退回時間軸推算。
  const mirror = roomState?.mirror
  const useMirror = mirrorMatchesSong(mirror, roomState?.song)
  const lineIdentity = lyricLineIdentity({ songKey, useMirror, mirror, curIdx })

  useLayoutEffect(() => {
    karaokeRef.current = 0
    lyricFillRef.current = 0
  }, [lineIdentity])

  // 記錄鏡像句的換句時刻與最近平均句長，供卡拉OK填光推算
  const mirrorRef = useRef({ active: false, identity: '', text: '', at: 0, dur: 3.5, hist: [] })
  useEffect(() => {
    localTimeRef.current = 0
    progressRef.current = { ratio: 0, posSec: 0, durSec: 0 }
    karaokeRef.current = 0
    lyricFillRef.current = 0
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
    mirror: useMirror ? mirror : null,
    lines,
    curIdx,
  })
  // 雙語：該句的翻譯（沒有翻譯的歌就不顯示第二行）
  const curTrans = !cfg.bilingual
    ? ''
    : (useMirror ? (mirror.trans || '') : (curIdx >= 0 ? lines[curIdx]?.trans || '' : ''))
  // 這首歌是否有翻譯：整首固定保留翻譯列，避免逐句忽高忽低造成玻璃重算閃爍
  const songHasTrans = useMemo(
    () => !!(cfg.bilingual && lines.some((l) => l && l.trans)),
    [cfg.bilingual, lines]
  )
  const nextLine = curIdx + 1 < lines.length ? lines[curIdx + 1]?.text : ''

  const onCapsuleClick = useCallback(() => {
    if (hasRoomSong) { ov.player.toggle(); return }
    setLocalPlaying((p) => !p)
  }, [hasRoomSong])

  useEffect(() => ov.onTogglePlay(() => {
    if (hasRoomSong) ov.player.toggle()
    else setLocalPlaying((p) => !p)
  }), [hasRoomSong])

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
  const coverUrl = cfg.backdrop === 'cover' ? (roomState?.song?.cover || '') : ''
  const liveVisual = useMemo(() => ({
    line: curLine,
    trans: curTrans,
    reserveTrans: songHasTrans,
    lineKey: lineIdentity,
    useMirror,
    songName: hasRoomSong ? [roomState.song.name, roomState.song.artist].filter(Boolean).join(' — ') : '',
    coverUrl,
    avatarUrl: roomState?.song?.avatar || '',
    showProgress: hasRoomSong && songDurSec > 0,
    playing: hasRoomSong ? roomPlaying : localPlaying,
  }), [curLine, curTrans, songHasTrans, lineIdentity, useMirror, hasRoomSong, roomState?.song?.name, roomState?.song?.artist, roomState?.song?.avatar, coverUrl, songDurSec, roomPlaying, localPlaying])
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
          avatarUrl={transitionVisual.avatarUrl}
          progressRef={progressRef}
          karaokeRef={karaokeRef}
          lyricFillRef={lyricFillRef}
          showProgress={transitionVisual.showProgress}
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
