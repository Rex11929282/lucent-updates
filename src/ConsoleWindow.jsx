import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Capsule from './components/Capsule.jsx'
import { ov } from './overlayBridge.js'
import { useSharedState } from './useSharedState.js'
import { useRoom } from './useRoom.js'
import {
  createAppearanceProfile,
  decorationControlsForMode,
  LYRIC_FONT_OPTIONS,
  LYRIC_LAYOUTS,
  TEXT_STYLE_OPTIONS,
  mergeLookSections,
  progressControlsForMode,
  resetDecorationConfig,
  upsertAppearanceProfile,
} from './appearanceModel.js'
import { VINYL_FRAMES } from './frameAssets.js'
import { formatRoomInvite, mergeRecentMembers, nextLocalizedDefault } from './roomInvite.js'
import { normalizeConsolePage } from './consoleNavigation.js'
import { CONSOLE_NAV, getHomeNextAction } from './consoleShellModel.js'
import { clampHomeCatX, homeCatActionSpec, nextHomeCatAction, resolveHomeCatMotion } from './homeCat.js'
import { ONBOARDING_VERSION, shouldOpenOnboarding } from './onboardingState.js'
import { createFeedbackQueue } from './consoleFeedback.js'
import { LUCENT_AVATAR_ASSET, LUCENT_COVER_ASSET } from './brandAssets.js'
import { attachRipples, resolveConsoleMotion, useCardTilt } from './useCardTilt.js'
import { QUICK_PRESETS, QUICK_PRESET_IDS, applyQuickPreset } from './quickPresets.js'
import {
  FALLBACK_LOCALE, LOCALE_IDS, LOCALE_NAMES, createTranslator, detectSystemLocale, resolveLocale,
  formatDateTime, formatNumber,
  detectedMediaSourceLabel, detectedMediaStatusLabel,
  playbackSourceLabel as localizedSourceLabel,
} from './i18n.js'
import { fitPreviewCapsule } from './consolePreviewFit.js'
import { compactPlayerView } from './consolePlayer.js'
import { localizePlayerError } from './playerErrors.js'
import { localizeRuntimeMessage, networkAdapterLabel } from './runtimeMessage.js'

const PORT = 8787
const RECENT_ROOM_MEMBERS_KEY = 'lucent:recent-room-members:v1'
function loadRecentRoomMembers() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_ROOM_MEMBERS_KEY) || '[]')
    return Array.isArray(parsed) ? mergeRecentMembers(parsed, [], 0) : []
  } catch { return [] }
}

async function copyText(value) {
  const text = String(value || '')
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const input = document.createElement('textarea')
    input.value = text
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.append(input)
    input.select()
    const copied = document.execCommand('copy')
    input.remove()
    return copied
  }
}

// 說明開關：設定名稱常常看不出來到底會改到什麼（「噪點質感」「動畫強度」），
// 所以每個控制項都可以附一行白話說明。使用者熟了可以整批收起來。
const HintContext = createContext(true)
const MotionContext = createContext('full')

// 介面語言。'auto' 跟隨系統，使用者選過就以他的選擇為準。
// 切換語言不需要重開程式：翻譯函式跟著 context 走，重新算一次就換好了。
const I18nContext = createContext(createTranslator('en-US'))
export function useT() { return useContext(I18nContext) }

// 目前作用中的語言代碼，給日期／數字格式化用。
// 不能用 toLocaleString() 不帶參數 —— 那會沿用系統語言，
// 使用者在 Lucent 選了德文、系統是中文時就會看到中文格式的日期。
const LocaleContext = createContext(FALLBACK_LOCALE)
export function useLocale() { return useContext(LocaleContext) }

function useLocalizedDefault(key) {
  const t = useT()
  const translated = t(key)
  const previousDefault = useRef(translated)
  const [value, setValue] = useState(translated)
  useEffect(() => {
    setValue((current) => nextLocalizedDefault(current, previousDefault.current, translated))
    previousDefault.current = translated
  }, [translated])
  return [value, setValue]
}

// 會跟著游標傾斜的卡片。.card3d__lift 只是內容容器，不再做 Z 位移
// （會讓裡面的按鈕點不到，詳見 styles.css 的說明）。
function Card3D({ className = '', children, lift = true, max = 7, ...rest }) {
  const motion = useContext(MotionContext)
  const { ref, handlers } = useCardTilt({ max, enabled: motion === 'full' })
  return (
    <section ref={ref} className={`card3d ${className}`} {...handlers} {...rest}>
      {lift ? <div className="card3d__lift">{children}</div> : children}
    </section>
  )
}

function Slider({ label, value, min, max, step, onChange, fmt, hint }) {
  const showHints = useContext(HintContext)
  const locale = useLocale()
  return (
    <label className={`row ${hint && showHints ? 'row--hinted' : ''}`}>
      <span className="row__label">
        {label}
        {hint && showHints && <small className="row__hint">{hint}</small>}
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      {/* 沒給 fmt 時走在地化數字：德文的小數點是逗號，俄文的千分位是空格 */}
      <span className="row__val">{fmt ? fmt(value) : formatNumber(locale, value)}</span>
    </label>
  )
}

// 下拉選單也常常需要解釋，包一層讓寫法跟 Slider 一致
function Choice({ label, value, onChange, hint, children }) {
  const showHints = useContext(HintContext)
  return (
    <label className={`row ${hint && showHints ? 'row--hinted' : ''}`}>
      <span className="row__label">
        {label}
        {hint && showHints && <small className="row__hint">{hint}</small>}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
      <span className="row__val" />
    </label>
  )
}

// 背景材質預設組：選了只是「快速套用一組參數」，之後仍可逐項微調
const BG_PRESETS = {
  clear:    { bgAlpha: 0.10, bgBlur: 0,  bgSat: 1.0, bgBright: 1.0, bgContrast: 1, tintStrength: 0,    edgeHighlight: true,  edgeHlStrength: 0.30, noise: 0,    bgGradMode: 'none' },
  light:    { bgAlpha: 0.32, bgBlur: 8,  bgSat: 1.1, bgBright: 1.05, bgContrast: 1, tintStrength: 0.06, edgeHighlight: true,  edgeHlStrength: 0.40, noise: 0,    bgGradMode: 'none' },
  standard: { bgAlpha: 0.55, bgBlur: 18, bgSat: 1.2, bgBright: 1.0, bgContrast: 1, tintStrength: 0.12, edgeHighlight: true,  edgeHlStrength: 0.45, noise: 0,    bgGradMode: 'none' },
  heavy:    { bgAlpha: 0.78, bgBlur: 30, bgSat: 1.3, bgBright: 0.95, bgContrast: 1.05, tintStrength: 0.18, edgeHighlight: true, edgeHlStrength: 0.55, noise: 0,  bgGradMode: 'none' },
  frosted:  { bgAlpha: 0.72, bgBlur: 44, bgSat: 0.7, bgBright: 1.15, bgContrast: 0.95, tintStrength: 0.05, edgeHighlight: true, edgeHlStrength: 0.5, noise: 0.22, bgGradMode: 'none' },
  neon:     { bgAlpha: 0.5,  bgBlur: 14, bgSat: 2.0, bgBright: 1.1, bgContrast: 1.15, tintColor: '#5cf0ff', tintStrength: 0.3, edgeHighlight: true, edgeHlStrength: 0.8, noise: 0, outerGlow: 0.5, outerGlowColor: '#5cf0ff', bgGradMode: 'none' },
  dark:     { bgAlpha: 0.85, bgBlur: 22, bgSat: 0.9, bgBright: 0.55, bgContrast: 1.1, tintColor: '#0b0f1c', tintStrength: 0.5, edgeHighlight: true, edgeHlStrength: 0.3, noise: 0, bgGradMode: 'none' },
  solid:    { bgAlpha: 0.62, bgBlur: 0,  bgSat: 1.0, bgBright: 1.0, bgContrast: 1, tintColor: '#1b2340', tintStrength: 0.9, edgeHighlight: true, edgeHlStrength: 0.35, noise: 0, bgGradMode: 'none' },
  gradient: { bgAlpha: 0.7,  bgBlur: 16, bgSat: 1.25, bgBright: 1.0, bgContrast: 1, tintStrength: 0, edgeHighlight: true, edgeHlStrength: 0.5, noise: 0, bgGradMode: 'linear' },
}
const BG_DEFAULTS = {
  bgPreset: 'standard', ...BG_PRESETS.standard,
  tintColor: '#8fa8ff', bgGradC1: '#7f9cff', bgGradC2: '#c08cff', bgGradAngle: 145,
  oceanWave: false, oceanWaveColor: '#45b9ff', oceanWaveOpacity: 0.32, oceanWaveAmplitude: 0.45, oceanWaveSpeed: 1,
  shadowOut: 0.35, shadowOutBlur: 26, shadowIn: 0.25, outerGlow: 0, outerGlowColor: '#7fb0ff',
}

// 隨機外觀：從同一個色相出發挑和諧配色，結果才會好看而不是雜亂
function randomLook() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)]
  const h = Math.floor(Math.random() * 360)
  const hsl = (dh, s, l) => `hsl(${(h + dh + 360) % 360} ${s}% ${l}%)`
  // 轉成 hex（<input type=color> 只吃 hex）
  const toHex = (dh, s, l) => {
    const H = ((h + dh) % 360) / 360, S = s / 100, L = l / 100
    const k = (n) => (n + H * 12) % 12
    const a = S * Math.min(L, 1 - L)
    const f = (n) => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')
  }
  const bgKey = pick(['light', 'standard', 'heavy', 'frosted', 'neon', 'dark', 'gradient'])
  return {
    ...BG_PRESETS[bgKey], bgPreset: bgKey,
    tintColor: toHex(0, 70, 65),
    bgGradC1: toHex(-25, 75, 62),
    bgGradC2: toHex(35, 75, 68),
    bgGradAngle: Math.floor(Math.random() * 360),
    neonColor: toHex(10, 85, 62),
    glowColor: toHex(-15, 80, 70),
    outerGlowColor: toHex(20, 80, 66),
    rgbBar: Math.random() < 0.75,
    rgbMode: pick(['rainbow', 'breath', 'neon', 'cover']),
    rgbSpeed: +(0.6 + Math.random() * 2).toFixed(1),
    barBeat: Math.random() < 0.8,
    barHeight: 3 + Math.floor(Math.random() * 7),
    cornerPreset: pick(['pill', 'pill', 'large', 'medium', 'small']),
    fontWeight: pick([600, 700, 800, 900]),
    outline: +(0.6 + Math.random() * 1.4).toFixed(1),
    fxTilt: Math.random() < 0.7,
    fxBreathe: Math.random() < 0.8,
    fxVinylBounce: Math.random() < 0.7,
    fxLineAnim: pick(['fade', 'up', 'zoom']),
    showVinyl: Math.random() < 0.8,
  }
}

// 開關：整列可點，右側是滑動開關；可附一行說明
function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="tgl" onClick={(e) => e.preventDefault()}>
      <span className="tgl__txt">
        <span className="tgl__label">{label}</span>
        {hint && <span className="tgl__hint">{hint}</span>}
      </span>
      <button
        type="button"
        className={`sw ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={!!checked}
      >
        <span className="sw__dot" />
      </button>
    </label>
  )
}

// 可摺疊區塊
function Section({ title, children, defaultOpen = false, open: controlledOpen, onOpenChange }) {
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : localOpen
  const toggle = () => {
    const next = !open
    if (onOpenChange) onOpenChange(next)
    else setLocalOpen(next)
  }
  return (
    <div className="sect">
      <button className={`sect__head ${open ? 'open' : ''}`} onClick={toggle}>
        <span>{title}</span>
        <span className="sect__arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="sect__body">{children}</div>}
    </div>
  )
}

const ConsoleFeedbackContext = createContext(null)

function useConsoleFeedback() {
  const feedback = useContext(ConsoleFeedbackContext)
  if (!feedback) throw new Error('Console feedback provider is missing')
  return feedback
}

function ConsoleToast({ notice, onDismiss }) {
  const t = useT()
  return (
    <div className={`console-toast console-toast--${notice.tone || 'info'}`} role="status" aria-live="polite">
      <span>{notice.message}</span>
      <button type="button" onClick={() => onDismiss(notice.id)} aria-label={t('common.dismissNotification')}>×</button>
    </div>
  )
}

function ConsoleConfirmDialog({ request, onResolve }) {
  const t = useT()
  if (!request) return null
  return (
    <section className="console-dialog-layer" role="dialog" aria-modal="true" aria-label={request.title}>
      <div className="console-dialog">
        <h2>{request.title}</h2>
        <p>{request.message}</p>
        <div className="console-dialog__actions">
          <button type="button" className="console-dialog__cancel" onClick={() => onResolve(false)}>{t('common.cancel')}</button>
          <button type="button" className="console-dialog__confirm" onClick={() => onResolve(true)}>{request.confirmLabel}</button>
        </div>
      </div>
    </section>
  )
}

function CloseChoiceDialog({ open, onChoose }) {
  const t = useT()
  const [remember, setRemember] = useState(false)
  useEffect(() => { if (open) setRemember(false) }, [open])
  if (!open) return null
  return (
    <section className="console-dialog-layer" role="dialog" aria-modal="true" aria-label={t('close.aria')}>
      <div className="console-dialog console-close-dialog">
        <h2>{t('close.title')}</h2>
        <p>{t('close.body')}</p>
        <label className="console-close-dialog__remember">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span>{t('close.remember')}</span>
        </label>
        <div className="console-close-dialog__actions">
          <button type="button" onClick={() => onChoose('pill', remember)}>{t('settings.closeBehavior.pill')}</button>
          <button type="button" onClick={() => onChoose('tray', remember)}>{t('settings.closeBehavior.tray')}</button>
          <button type="button" className="danger" onClick={() => onChoose('quit', remember)}>{t('settings.closeBehavior.quit')}</button>
        </div>
      </div>
    </section>
  )
}

function ConsoleFeedbackProvider({ children }) {
  const queueRef = useRef(null)
  const confirmResolveRef = useRef(null)
  const [notice, setNotice] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  if (!queueRef.current) queueRef.current = createFeedbackQueue()
  const queue = queueRef.current
  const notify = (input) => {
    const next = queue.push(input)
    setNotice(next)
    return next
  }
  const confirm = (input) => new Promise((resolve) => {
    confirmResolveRef.current?.(false)
    const next = queue.takeConfirm(input)
    confirmResolveRef.current = resolve
    setConfirmation(next)
  })
  const resolveConfirmation = (accepted) => {
    if (confirmation) queue.dismissConfirm(confirmation.id)
    setConfirmation(null)
    const resolve = confirmResolveRef.current
    confirmResolveRef.current = null
    resolve?.(accepted)
  }
  useEffect(() => () => {
    confirmResolveRef.current?.(false)
    confirmResolveRef.current = null
  }, [])
  return (
    <ConsoleFeedbackContext.Provider value={{
      notify,
      confirm,
      notice,
      confirmation,
      dismissNotice: (id) => { queue.dismiss(id); setNotice(queue.current()) },
      resolveConfirmation,
    }}>
      {children}
    </ConsoleFeedbackContext.Provider>
  )
}

function ConsoleFeedbackLayer() {
  const { notice, confirmation, dismissNotice, resolveConfirmation } = useConsoleFeedback()
  return <>
    {notice && <ConsoleToast notice={notice} onDismiss={dismissNotice} />}
    <ConsoleConfirmDialog request={confirmation} onResolve={resolveConfirmation} />
  </>
}

export default function ConsoleWindow() {
  const { state, hydrated, setGlass, setCfg, setProfiles, setUi, setUpdates } = useSharedState()
  const { status, members, state: roomState, clockRef, queue, capabilities, commandResult } = useRoom()

  return (
    <ConsoleFeedbackProvider>
      <ConsoleShell
        state={state} roomState={roomState} status={status} members={members} queue={queue}
        roomClockRef={clockRef}
        capabilities={capabilities} commandResult={commandResult}
        hydrated={hydrated}
        setGlass={setGlass} setCfg={setCfg}
        setProfiles={setProfiles} setUi={setUi} setUpdates={setUpdates}
      />
    </ConsoleFeedbackProvider>
  )
}

function ConsoleCapsulePreview({ state, playing = false, effectsPaused = false }) {
  const t = useT()
  const { glass, cfg } = state
  const stageRef = useRef(null)
  const capsuleRef = useRef(null)
  const [previewScale, setPreviewScale] = useState(1)
  const progressRef = useRef({ ratio: 0.52, posSec: 118, durSec: 225 })
  const karaokeRef = useRef(0)
  const lyricFillRef = useRef(0)
  const lyricFillActiveRef = useRef(false)
  useEffect(() => {
    const stage = stageRef.current
    const capsule = capsuleRef.current
    if (!stage || !capsule) return undefined
    let frame = 0
    const measure = () => {
      const pill = capsule.querySelector('.glass') || capsule.querySelector('.plain')
      if (!pill) return
      const next = fitPreviewCapsule({
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight,
        pillWidth: pill.offsetWidth,
        pillHeight: pill.offsetHeight,
      })
      setPreviewScale((current) => Math.abs(current - next) > 0.001 ? next : current)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(stage)
    observer.observe(capsule)
    const pill = capsule.querySelector('.glass') || capsule.querySelector('.plain')
    if (pill) observer.observe(pill)
    measure()
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [cfg, glass])
  return (
    <div ref={stageRef} className="console-capsule-preview" aria-label={t('ui.preview.aria')}>
      <div className="console-capsule-preview__fit" style={{ '--preview-scale': previewScale }}>
      <Capsule
        innerRef={capsuleRef}
        preview
        line={t('ui.preview.line')}
        trans={t('ui.preview.trans')}
        reserveTrans
        playing={playing}
        lineKey="preview:lucent-promo"
        useMirror={false}
        songName={t('ui.preview.song')}
        cfg={cfg}
        glass={glass}
        coverUrl={LUCENT_COVER_ASSET}
        avatarUrl={LUCENT_AVATAR_ASSET}
        progressRef={progressRef}
        karaokeRef={karaokeRef}
        lyricFillRef={lyricFillRef}
        lyricFillActiveRef={lyricFillActiveRef}
        audioSpectrumRef={null}
        spectrumActive={false}
        showProgress
        effectsPaused={effectsPaused}
      />
      </div>
    </div>
  )
}

function ConsoleStatusRail({ song, sync, exact, status, members, onOpenPill }) {
  const t = useT()
  const title = song?.loading ? t('player.loading') : (song?.name || t('ui.status.noSong'))
  const artist = song?.artist || t('ui.status.openNetease')
  const roomLabel = status?.mode === 'host'
    ? t('ui.status.hosting', { count: members.length })
    : status?.mode === 'member' ? t('ui.status.following') : t('ui.status.noRoom')
  return (
    <aside className="console-status-rail" aria-label={t('ui.status.room')}>
      <Card3D max={9}><span>{t('ui.status.currentSong')}</span><b title={title}>{title}</b><small>{artist}</small></Card3D>
      <Card3D max={9}><span>{t('ui.status.lyricSync')}</span><b className={exact ? 'ok' : ''}>{sync}</b><small>{t('ui.status.lyricRule')}</small></Card3D>
      <Card3D max={9}><span>{t('ui.status.room')}</span><b>{roomLabel}</b><small>{t('ui.status.localHint')}</small></Card3D>
      <button type="button" className="console-status-rail__pill" onClick={onOpenPill}>{t('ui.status.showPill')}</button>
    </aside>
  )
}

function HomeCat({ petMotion = 'full' }) {
  const t = useT()
  const [action, setAction] = useState('idle')
  const [x, setX] = useState(0.48)
  const [facing, setFacing] = useState(1)
  const xRef = useRef(0.48)
  const lastActivity = useRef(Date.now())
  const actionRef = useRef(null)
  const osReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const motion = resolveHomeCatMotion({ preference: petMotion, osReducedMotion })
  const reduced = motion === 'off'
  const canTravel = motion === 'full'

  useEffect(() => {
    const markActivity = () => { lastActivity.current = Date.now() }
    window.addEventListener('pointerdown', markActivity)
    window.addEventListener('keydown', markActivity)
    return () => {
      window.removeEventListener('pointerdown', markActivity)
      window.removeEventListener('keydown', markActivity)
    }
  }, [])

  useEffect(() => {
    if (reduced) return undefined
    const schedule = () => {
      const next = nextHomeCatAction({
        homeVisible: true,
        appVisible: document.visibilityState === 'visible',
        inactiveMs: Date.now() - lastActivity.current,
      })
      const spec = homeCatActionSpec(next)
      setAction(next)
      if (spec.moves && canTravel) {
        // 走路只挪一小段、跑跳才跨到遠處，看起來才像在逛而不是瞬移。
        const reach = next === 'walk' ? 0.22 : 0.55
        const target = clampHomeCatX(xRef.current + (Math.random() * 2 - 1) * reach)
        setFacing(target >= xRef.current ? 1 : -1)
        xRef.current = target
        setX(target)
      }
      actionRef.current = window.setTimeout(schedule, spec.hold)
    }
    actionRef.current = window.setTimeout(schedule, 900)
    return () => window.clearTimeout(actionRef.current)
  }, [reduced, canTravel])

  const spec = homeCatActionSpec(action)
  // 移動時間對齊動作長度，腳步才不會跟位移脫節。
  const travelMs = spec.moves && canTravel ? (action === 'walk' ? 4000 : 2200) : 0
  return (
    <div className={`home-cat-stage home-cat-stage--${motion}`} aria-label={t('ui.home.pixelCat')}>
      <div className="home-cat-stage__sun" aria-hidden="true" />
      <div className="home-cat-stage__floor" aria-hidden="true" />
      <div
        className={`home-cat home-cat--${action}`}
        style={{
          left: `${x * 100}%`,
          '--cat-facing': facing,
          '--cat-row': spec.row,
          '--cat-frames': spec.frames,
          '--cat-ms': `${spec.ms}ms`,
          '--cat-fill': spec.loop ? 'none' : 'forwards',
          '--cat-repeat': spec.loop ? 'infinite' : 1,
          '--cat-travel': `${travelMs}ms`,
        }}
        aria-hidden="true"
      >
        <div className="home-cat__sprite" />
      </div>
      {action === 'eat' && <div className="home-cat__food" style={{ left: `${Math.min(92, x * 100 + 8)}%` }} aria-hidden="true">◒</div>}
      {action === 'sleep' && <span className="home-cat__sleep" aria-hidden="true">z z</span>}
    </div>
  )
}

function HomeDashboard({ state, song, playing, status, roomState, sync, exact, nextAction, onNextAction, onTutorial }) {
  const t = useT()
  const title = song?.loading ? t('player.loading') : (song?.name || t('ui.home.waitingTitle'))
  const statusText = exact ? t('ui.home.preciseStatus') : t('ui.home.openNeteaseStatus')
  return (
    <div className="home-dashboard">
      <header className="home-dashboard__intro">
        <div><span>{t('ui.home.label')}</span><h1>{t('ui.home.title')}</h1><p>{statusText}</p></div>
        <div className="home-dashboard__actions">
          <button type="button" className="home-dashboard__pill" onClick={onNextAction}>{t(`ui.home.action.${nextAction.id}`)}</button>
          <button type="button" className="home-dashboard__tutorial" onClick={onTutorial}>{t('ui.home.tutorial')}</button>
        </div>
      </header>
      <HomeCat petMotion={state.cfg?.petMotion} />
      <div className="home-dashboard__preview"><ConsoleCapsulePreview state={state} playing={playing} /></div>
      <div className="home-dashboard__facts">
        <span><b>{t('ui.home.currentSong')}</b>{title}</span>
        <span><b>{t('ui.home.syncStatus')}</b>{sync}</span>
        <span><b>{t('ui.home.room')}</b>{status?.mode === 'host' ? t('ui.home.hosting') : status?.mode === 'member' ? t('ui.home.following') : t('ui.home.local')}</span>
      </div>
      {roomState?.playing && <small className="home-dashboard__note">{t('ui.home.roomPlaying')}</small>}
    </div>
  )
}

function SettingsTab({ consoleState, settings, cfg, locale, setCfg, setUi, setUpdates }) {
  const t = useT()
  const showHints = useContext(HintContext)
  const updateConsole = (patch) => setUi({ console: { ...consoleState, ...patch } })
  const osReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="console-settings">
      <h2>{t('settings.title')}</h2>
      <p>{t('settings.description')}</p>
      <label className="row"><span className="row__label">
        {t('settings.language')}
        {showHints && <small className="row__hint">{t('settings.language.hint')}</small>}
      </span>
        <select value={locale} onChange={(e) => setUi({ locale: e.target.value })}>
          <option value="auto">{t('settings.language.auto')}</option>
          {LOCALE_IDS.map((id) => <option value={id} key={id}>{LOCALE_NAMES[id]}</option>)}
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('settings.petMotion')}</span><select value={cfg?.petMotion || 'full'} onChange={(e) => setCfg({ petMotion: e.target.value })}>
        <option value="full">{t('settings.petMotion.full')}</option><option value="gentle">{t('settings.petMotion.gentle')}</option>
        <option value="auto">{t('settings.petMotion.auto')}</option><option value="off">{t('settings.petMotion.off')}</option>
      </select><span className="row__val" /></label>
      {osReduced && (cfg?.petMotion || 'full') === 'auto' && (
        <div className="hint">{t('settings.petMotion.reducedHint')}</div>
      )}
      <label className="row"><span className="row__label">{t('settings.theme')}</span><select value={consoleState.theme || 'system'} onChange={(e) => updateConsole({ theme: e.target.value })}>
        <option value="system">{t('settings.theme.system')}</option><option value="light">{t('settings.theme.light')}</option><option value="dark">{t('settings.theme.dark')}</option>
      </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('settings.consoleMotion')}</span><select value={consoleState.motion || 'full'} onChange={(e) => updateConsole({ motion: e.target.value })}>
        <option value="full">{t('settings.consoleMotion.full')}</option><option value="subtle">{t('settings.consoleMotion.subtle')}</option><option value="off">{t('settings.consoleMotion.off')}</option>
      </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('settings.startup')}</span><select value={consoleState.startupView || 'console'} onChange={(e) => updateConsole({ startupView: e.target.value })}>
        <option value="console">{t('settings.startup.console')}</option><option value="pill">{t('settings.startup.pill')}</option>
      </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('settings.closeBehavior')}</span><select value={consoleState.closeBehavior || 'ask'} onChange={(e) => updateConsole({ closeBehavior: e.target.value })}>
        <option value="ask">{t('settings.closeBehavior.ask')}</option><option value="pill">{t('settings.closeBehavior.pill')}</option><option value="tray">{t('settings.closeBehavior.tray')}</option><option value="quit">{t('settings.closeBehavior.quit')}</option>
      </select><span className="row__val" /></label>
      <UpdateTab settings={settings} setUpdates={setUpdates} />
    </div>
  )
}

function HelpTab({ onOpenPill }) {
  const t = useT()
  return <div className="console-help"><h2>{t('help.title')}</h2><ol>
    <li>{t('help.step1')}</li>
    <li>{t('help.step2')}</li>
    <li>{t('help.step3')}</li>
    <li>{t('help.step4')}</li>
  </ol><button type="button" className="btn" onClick={onOpenPill}>{t('help.openPill')}</button></div>
}

function ConsoleShell({
  state, roomState, roomClockRef, status, members, queue, capabilities, commandResult,
  hydrated, setGlass, setCfg, setProfiles, setUi, setUpdates,
}) {
  const { notify } = useConsoleFeedback()
  const consoleState = state.ui?.console || {}
  const page = normalizeConsolePage(consoleState.selectedPage)
  const setPage = (selectedPage) => setUi({ console: { ...consoleState, selectedPage } })
  const song = roomState?.song
  const playing = !!roomState?.playing
  const exact = roomState?.syncStatus === 'exact'
  const syncKey = exact
    ? 'ui.sync.precise'
    : roomState?.syncStatus === 'waiting-identity'
      ? 'ui.sync.waitingIdentity'
      : roomState?.syncStatus === 'no-precise-data'
        ? 'ui.sync.noPreciseData'
        : playing ? 'ui.sync.playing' : 'ui.sync.waiting'
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  useEffect(() => {
    if (shouldOpenOnboarding({ hydrated, onboardingVersion: consoleState.onboardingVersion })) {
      setOnboardingOpen(true)
    }
  }, [hydrated, consoleState.onboardingVersion])
  useEffect(() => {
    const off = ov.console.onCloseRequested(() => setCloseDialogOpen(true))
    return () => off?.()
  }, [])
  const motion = resolveConsoleMotion(consoleState.motion)
  const systemLocale = detectSystemLocale()
  const activeLocale = resolveLocale(state.ui?.locale, systemLocale)
  const t = useMemo(() => createTranslator(activeLocale, {
    onMissing: import.meta.env?.DEV
      ? (key, locale) => console.warn(`[i18n] missing "${key}" in ${locale}`)
      : undefined,
  }), [activeLocale])
  const sync = t(syncKey)
  const shellRef = useRef(null)
  // 漣漪用事件委派掛一次，不必去改每一顆按鈕
  useEffect(() => attachRipples(shellRef.current, motion === 'full'), [motion])
  const roomConnection = status?.mode ? 'connected' : 'disconnected'
  const nextAction = getHomeNextAction({
    song,
    precise: exact,
    room: roomConnection,
    update: state.updates?.available ? 'available' : 'current',
  })
  const showPill = () => ov.console.showPill()
  const runNextAction = () => {
    if (nextAction.id === 'pill') showPill()
    else setPage(nextAction.page)
  }
  const completeOnboarding = () => {
    setUi({ console: { ...consoleState, onboardingVersion: ONBOARDING_VERSION } })
    setOnboardingOpen(false)
  }
  const chooseClose = async (action, remember) => {
    setCloseDialogOpen(false)
    const result = await ov.console.closeWith(action, remember)
    if (!result?.ok) notify({ tone: 'error', message: result?.error
      ? localizeRuntimeMessage(t, result.error, 'console.closeError')
      : t('console.closeError') })
  }
  const mainPanels = {
    home: <HomeDashboard state={state} song={song} playing={playing} status={status} roomState={roomState}
      sync={sync} exact={exact} nextAction={nextAction} onNextAction={runNextAction}
      onTutorial={() => { setOnboardingStep(0); setOnboardingOpen(true) }} />,
    play: <PlayTab roomState={roomState} roomClockRef={roomClockRef} status={status} commandResult={commandResult} volume={state.cfg.internalPlayerVolume} />,
    look: <div className="console-look-preview"><span>{t('console.previewTitle')}</span><ConsoleCapsulePreview state={state} playing /></div>,
    room: <RoomTab status={status} members={members} queue={queue} capabilities={capabilities} commandResult={commandResult} />,
    settings: <SettingsTab consoleState={consoleState} settings={state.updates} cfg={state.cfg}
      locale={state.ui?.locale || 'auto'} setCfg={setCfg} setUi={setUi} setUpdates={setUpdates} />,
    help: <HelpTab onOpenPill={showPill} />,
  }
  const contextualPanel = page === 'look'
    ? <LookTab state={state} setGlass={setGlass} setCfg={setCfg} setProfiles={setProfiles} setUi={setUi} embedded />
    : <ConsoleStatusRail song={song} sync={sync} exact={exact} status={status} members={members} onOpenPill={showPill} />
  return (
    <I18nContext.Provider value={t}>
    <LocaleContext.Provider value={activeLocale}>
    <MotionContext.Provider value={motion}>
    <div className="cw cw--console">
      <main ref={shellRef} className="console-shell" data-console-theme={consoleState.theme || 'system'} data-motion={motion}>
        <header className="console-shell__header">
          <b><i>♪</i>璃音 Lucent</b>
          <span className={exact ? 'is-playing' : ''}>● {sync}</span>
          <button className="tbtn close" onClick={() => ov.console.requestClose()} aria-label={t('console.closeAria')}>×</button>
        </header>
        <div className="console-shell__body">
          <nav className="console-nav" aria-label={t('console.navAria')}>
            {CONSOLE_NAV.map(({ id, icon }) => <button type="button" key={id}
              className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
              <b><i>{icon}</i>{t(`nav.${id}`)}</b><small>{t(`nav.${id}.sub`)}</small>
            </button>)}
          </nav>
          <section className="console-main console-shell__page" aria-live="polite">{mainPanels[page]}</section>
          <aside className="console-panel" aria-label={t(`nav.${page}`)}>{contextualPanel}</aside>
        </div>
        {onboardingOpen && <OnboardingDialog step={onboardingStep} onSkip={completeOnboarding}
          onNext={() => setOnboardingStep((current) => Math.min(current + 1, ONBOARDING_LAST_STEP))} onDone={completeOnboarding} />}
        <CloseChoiceDialog open={closeDialogOpen} onChoose={chooseClose} />
        <ConsoleFeedbackLayer />
      </main>
    </div>
    </MotionContext.Provider>
    </LocaleContext.Provider>
    </I18nContext.Provider>
  )
}

const ONBOARDING_PAGES = [
  { tag: 'onboarding.welcome.tag', title: 'onboarding.welcome.title', body: 'onboarding.welcome.body' },
  { tag: 'onboarding.reopen.tag', title: 'onboarding.reopen.title', body: 'onboarding.reopen.body' },
  { tag: 'onboarding.next.tag', title: 'onboarding.next.title', body: 'onboarding.next.body' },
]
const ONBOARDING_LAST_STEP = ONBOARDING_PAGES.length - 1

function OnboardingDialog({ step, onSkip, onNext, onDone }) {
  const t = useT()
  const page = ONBOARDING_PAGES[step] || ONBOARDING_PAGES[ONBOARDING_LAST_STEP]
  const last = step === ONBOARDING_LAST_STEP
  return (
    <section className="console-onboarding" role="dialog" aria-modal="true" aria-label={t('onboarding.aria')}>
      <div className="console-onboarding__card">
        <span>{t(page.tag)}</span>
        <h2>{t(page.title)}</h2>
        <p>{t(page.body)}</p>
        <div className="console-onboarding__actions">
          <button type="button" className="console-onboarding__skip" onClick={onSkip}>{t('common.skip')}</button>
          <button type="button" className="console-onboarding__next" onClick={last ? onDone : onNext}>
            {last ? t('common.getStarted') : t('common.next')}
          </button>
        </div>
      </div>
    </section>
  )
}

function applyAppearanceProfile(profile, setGlass, setCfg) {
  setGlass(profile?.glass || {})
  setCfg(profile?.cfg || {})
}

// ================= 應用程式更新 =================
function UpdateTab({ settings, setUpdates }) {
  const t = useT()
  const [snapshot, setSnapshot] = useState({ mode: 'disabled', status: 'idle', currentVersion: '', reason: '' })
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    ov.updates.snapshot().then((value) => { if (active && value) setSnapshot(value) })
    const offChanged = ov.updates.onChanged((value) => value && setSnapshot(value))
    return () => { active = false; offChanged() }
  }, [])

  const run = async (action) => {
    setMessage('')
    const result = await action()
    if (!result?.ok) setMessage(localizeRuntimeMessage(t, result?.error, 'ui.update.errorAction'))
    const current = await ov.updates.snapshot()
    if (current) setSnapshot(current)
  }
  const statusText = t(`ui.update.status.${snapshot.status}`)

  return (
    <div>
      <div className="group">{t('ui.update.title')}</div>
      <div className="kv"><span>{t('ui.update.currentVersion')}</span><b>{snapshot.currentVersion || '—'}</b></div>
      <div className="kv"><span>{t('ui.update.statusLabel')}</span><b>{statusText}</b></div>
      {snapshot.availableVersion && <div className="kv"><span>{t('ui.update.availableVersion')}</span><b>{snapshot.availableVersion}</b></div>}
      {snapshot.reason && <div className="hint">{localizeRuntimeMessage(t, snapshot.reason, 'ui.update.errorAction')}</div>}
      {snapshot.error && <div className="err">{localizeRuntimeMessage(t, snapshot.error, 'ui.update.errorAction')}</div>}

      <div className="group">{t('ui.update.preferences')}</div>
      <Toggle label={t('ui.update.autoCheck')} hint={t('ui.update.autoHint')}
        checked={settings?.autoCheck !== false} onChange={(value) => setUpdates({ autoCheck: value })} />
      <label className="row"><span className="row__label">{t('ui.update.channel')}</span>
        <select value={settings?.channel === 'beta' ? 'beta' : 'stable'} onChange={(event) => setUpdates({ channel: event.target.value })}>
          <option value="stable">{t('ui.update.stable')}</option><option value="beta">{t('ui.update.beta')}</option>
        </select><span className="row__val" /></label>

      {snapshot.progress && (
        <div className="update-progress">
          <div style={{ width: `${snapshot.progress.percent}%` }} />
          <span>{snapshot.progress.percent.toFixed(1)}%</span>
        </div>
      )}
      <div className="actions">
        <button className="btn" disabled={snapshot.mode !== 'automatic' || snapshot.status === 'checking'}
          onClick={() => run(ov.updates.check)}>{t('ui.update.check')}</button>
        {snapshot.status === 'ready' && <button className="btn" onClick={() => run(ov.updates.install)}>{t('ui.update.install')}</button>}
      </div>
      {snapshot.releaseNotes && <div className="update-notes"><b>{snapshot.releaseName || t('ui.update.releaseNotes')}</b><p>{snapshot.releaseNotes}</p></div>}
      {snapshot.deferred && <div className="hint">{t('ui.update.deferred')}</div>}
      {message && <div className="err">{message}</div>}
      <div className="hint">{t('ui.update.autoInstallHint')}</div>
    </div>
  )
}

// ================= 房間 =================
function RoomTab({ status, members, queue, capabilities, commandResult }) {
  const { notify } = useConsoleFeedback()
  const t = useT()
  const locale = useLocale()
  const [roomName, setRoomName] = useLocalizedDefault('ui.room.defaultName')
  const [code, setCode] = useState('')
  const [hostName, setHostName] = useLocalizedDefault('ui.room.defaultHost')
  const [ip, setIp] = useState('')
  const [joinName, setJoinName] = useLocalizedDefault('ui.room.defaultListener')
  const [myIp, setMyIp] = useState('')
  const [lanIps, setLanIps] = useState([])
  const [busy, setBusy] = useState(false)
  const [styleTarget, setStyleTarget] = useState('all')
  const [styleName, setStyleName] = useLocalizedDefault('ui.room.defaultStyle')
  const [styleOffers, setStyleOffers] = useState([])
  const [styleNotice, setStyleNotice] = useState('')
  const [queueNotice, setQueueNotice] = useState('')
  const [queueNoticeTone, setQueueNoticeTone] = useState('ok')
  const [recentMembers, setRecentMembers] = useState(loadRecentRoomMembers)

  useEffect(() => {
    let alive = true
    ov.room.lanIps().then((list) => {
      if (!alive) return
      const entries = Array.isArray(list) ? list : []
      setLanIps(entries)
      // Only seed the selection; never overwrite a choice the host already made.
      setMyIp((current) => current || entries[0]?.address || '')
    }).catch(() => {})
    // Keep the single-address call as a fallback so a failure in the richer
    // lookup can't leave the address blank.
    ov.room.lanIp().then((ip) => { if (alive) setMyIp((current) => current || ip || '') }).catch(() => {})
    return () => { alive = false }
  }, [])
  useEffect(() => {
    let mounted = true
    ov.room.pendingOffers().then((offers) => { if (mounted) setStyleOffers(offers || []) })
    const offOffer = ov.room.onStyleOffer((offer) => setStyleOffers((items) => items.some((item) => item.id === offer.id) ? items : [...items, offer]))
    const offHandled = ov.room.onStyleOfferHandled(({ requestId }) => setStyleOffers((items) => items.filter((item) => item.id !== requestId)))
    const offResponse = ov.room.onStyleResponse((response) => setStyleNotice(response.accepted ? t('ui.room.accepted') : t('ui.room.rejected')))
    return () => { mounted = false; offOffer(); offHandled(); offResponse() }
  }, [t])
  const inRoom = status.mode === 'host' || status.mode === 'member'
  const canManageQueue = status.mode === 'host' || !!capabilities?.['queue.manage']
  const canControlPlayback = status.mode === 'host' || !!capabilities?.['playback.control']
  const roomAddress = `${status.ip || myIp}:${status.port || PORT}`
  const roomInvite = formatRoomInvite(
    { roomName: status.roomName || roomName, ip: status.ip || myIp, port: status.port || PORT, code: status.code || code },
    {
      title: `璃音 Lucent · ${t('ui.room.copyInvite')}`,
      room: t('ui.status.room'),
      address: t('ui.room.inviteAddress'),
      code: t('ui.room.roomNumber'),
      separator: locale.startsWith('zh') || locale === 'ja-JP' ? '：' : ': ',
    },
  )

  useEffect(() => {
    if (status.mode !== 'host') return
    const connected = members.filter((member) => !member.host && member.ip)
    if (!connected.length) return
    setRecentMembers((previous) => {
      const next = mergeRecentMembers(previous, connected)
      window.localStorage.setItem(RECENT_ROOM_MEMBERS_KEY, JSON.stringify(next))
      return next
    })
  }, [status.mode, members])

  // The copy button is never disabled. If the address has not arrived yet it is
  // resolved on click, so a slow or failed lookup can no longer leave a dead
  // button with no explanation.
  const copyRoomAddress = async () => {
    let ip = status.ip || myIp
    if (!ip) {
      ip = await ov.room.lanIp().catch(() => '')
      if (ip) setMyIp((current) => current || ip)
    }
    if (!ip) { notify({ tone: 'error', message: t('room.noAddress') }); return }
    const address = `${ip}:${status.port || PORT}`
    notify(await copyText(address)
      ? { tone: 'success', message: t('room.copiedAddress', { address }) }
      : { tone: 'error', message: t('room.copyFailed') })
  }
  const copyRoomInvite = async (targetName = '') => {
    notify(await copyText(roomInvite)
      ? { tone: 'success', message: targetName ? t('ui.room.copiedInviteFor', { name: targetName }) : t('ui.room.copiedInvite') }
      : { tone: 'error', message: t('ui.room.copyInviteFailed') })
  }

  useEffect(() => {
    if (!commandResult) return
    setQueueNotice(commandResult.ok ? t('ui.room.commandAccepted') : t('ui.room.commandRejected'))
    setQueueNoticeTone(commandResult.ok ? 'ok' : 'err')
  }, [commandResult, t])

  const doHost = async () => {
    setBusy(true)
    // Advertise the address the host actually picked, not whatever the automatic
    // order happens to return.
    const r = await ov.room.host({ roomName, code, hostName, port: PORT, advertiseIp: myIp })
    setBusy(false)
    if (!r?.ok) notify({ tone: 'error', message: t('ui.room.hostFailed') })
  }
  const doJoin = async () => {
    if (!ip.trim()) {
      notify({ tone: 'warning', message: t('ui.room.hostIpRequired') })
      return
    }
    setBusy(true)
    const r = await ov.room.join({ ip: ip.trim(), port: PORT, code, name: joinName })
    setBusy(false)
    if (!r?.ok) notify({ tone: 'error', message: t('ui.room.joinFailed') })
  }
  const sendStyle = async () => {
    const targetId = status.mode === 'host' ? styleTarget : 'host'
    const result = await ov.room.offerStyle(targetId, styleName)
    setStyleNotice(result?.ok ? t('ui.room.styleSent') : t('ui.room.styleFailed'))
  }
  const respondStyle = async (requestId, accepted) => {
    const result = await ov.room.respondStyleOffer(requestId, accepted)
    if (!result?.ok) setStyleNotice(t('ui.room.processFailed'))
  }
  const setMemberCapability = async (member, key, checked) => {
    const next = { ...(member.capabilities || {}), [key]: checked }
    const result = await ov.room.setCapabilities(member.id, next)
    if (!result?.ok) {
      setQueueNotice(t('ui.room.permissionFailed'))
      setQueueNoticeTone('err')
    }
  }
  const queueCommand = async (type, payload) => {
    const result = await ov.room.command(type, payload)
    setQueueNotice(result?.pending ? t('ui.room.queued') : result?.ok ? '' : t('ui.room.operationFailed'))
    setQueueNoticeTone(result?.pending || result?.ok ? 'ok' : 'err')
  }

  if (inRoom) {
    return (
      <div className="room-live">
        <Card3D className="room-card room-card--live">
          <header>
            <span className={`room-card__badge ${status.mode === 'host' ? 'is-host' : 'is-member'}`}>
              {status.mode === 'host' ? t('ui.room.hosting') : t('ui.room.following')}
            </span>
            <div>
              <b>{status.roomName || t('ui.room.defaultTitle')}</b>
              <small>{status.mode === 'host' ? t('ui.room.hostDescription') : t('ui.room.memberDescription')}</small>
            </div>
          </header>
          {status.mode === 'host' && (
            <div className="room-address">
              <span>{t('ui.room.inviteAddress')}</span>
              <b>{status.ip || myIp}:{status.port || PORT}{status.code ? ` · ${t('ui.room.roomNumber')} ${status.code}` : ''}</b>
              <button className="mini-action" onClick={copyRoomAddress}>{t('ui.room.copyAddress')}</button>
              <button className="mini-action" onClick={() => copyRoomInvite()}>{t('ui.room.copyInvite')}</button>
            </div>
          )}
          <div className="room-stats">
            <span><b>{members.length}</b>{t('ui.room.membersCount')}</span>
            {status.sync && (
              <span>
                <b>{Math.round(status.sync.rttMs || 0)}ms</b>
                {t('ui.room.syncDelay')} · {status.sync.quality === 'stable' ? t('ui.room.stable') : status.sync.quality === 'fair' ? t('ui.room.fair') : t('ui.room.unstable')}
              </span>
            )}
            <span><b>{queue.length}</b>{t('ui.room.queueCount')}</span>
          </div>
          {status.mode === 'member' && status.reconnecting && (
            <div className="hint">{t('ui.room.reconnecting', { attempt: status.attempt || 1, seconds: Math.ceil((status.retryInMs || 1000) / 1000) })}</div>
          )}
          {status.error && <div className="err">⚠ {localizeRuntimeMessage(t, status.error, 'ui.room.unknownError')}</div>}
        </Card3D>
        <div className="group">{t('ui.room.membersGroup', { count: members.length })}</div>
        <ul className="members room-member-list">{members.map((m, i) => (
          <li key={m.id || i}>
            <span>{m.host ? '👑 ' : '🎧 '}{m.name}</span>
            {status.mode === 'host' && !m.host && (
              <span className="member-permissions">
                <label><input type="checkbox" checked={m.capabilities?.['song.request'] !== false}
                  onChange={(event) => setMemberCapability(m, 'song.request', event.target.checked)} /> {t('ui.room.capSong')}</label>
                <label><input type="checkbox" checked={!!m.capabilities?.['queue.manage']}
                  onChange={(event) => setMemberCapability(m, 'queue.manage', event.target.checked)} /> {t('ui.room.capQueue')}</label>
                <label><input type="checkbox" checked={!!m.capabilities?.['playback.control']}
                  onChange={(event) => setMemberCapability(m, 'playback.control', event.target.checked)} /> {t('ui.room.capPlayback')}</label>
              </span>
            )}
          </li>
        ))}</ul>
        {status.mode === 'host' && recentMembers.length > 0 && (
          <>
            <div className="group">{t('ui.room.recentMembers')}</div>
            <ul className="members room-member-list">{recentMembers.map((member) => (
              <li key={member.ip}>
                <span>{member.name} · {member.ip}</span>
                <button className="mini-action" onClick={() => copyRoomInvite(member.name)}>{t('ui.room.copyInvite')}</button>
              </li>
            ))}</ul>
          </>
        )}
        {status.mode === 'member' && (
          <div className="hint">
            {t('ui.room.permission')}：{capabilities?.['song.request'] ? t('ui.room.allowed') : t('ui.room.denied')} {t('ui.room.capSong')} · {capabilities?.['queue.manage'] ? t('ui.room.allowed') : t('ui.room.denied')} {t('ui.room.capQueue')} · {capabilities?.['playback.control'] ? t('ui.room.allowed') : t('ui.room.followHost')} {t('ui.room.capPlayback')}
          </div>
        )}

        <div className="group">{t('ui.room.queueGroup', { count: queue.length })}</div>
        {queue.length ? (
          <ul className="results room-queue">{queue.map((entry, index) => (
            <li key={entry.id}>
              {entry.cover && <img src={entry.cover} alt="" />}
              <div className="meta">
                <b>{entry.status === 'playing' ? '▶ ' : ''}{entry.name}</b>
                <div className="sub">{entry.artist}{entry.requesterName ? ` · ${t('ui.room.requestedBy', { name: entry.requesterName })}` : ''}</div>
              </div>
              {canControlPlayback && entry.status !== 'playing' && <button className="mini-action" onClick={() => queueCommand('playback.load', { queueEntryId: entry.id })}>{t('ui.room.play')}</button>}
              {canManageQueue && <>
                <button className="mini-action" disabled={index === 0} onClick={() => queueCommand('queue.move', { id: entry.id, position: index - 1 })}>↑</button>
                <button className="mini-action" disabled={index === queue.length - 1} onClick={() => queueCommand('queue.move', { id: entry.id, position: index + 1 })}>↓</button>
                <button className="mini-action danger" onClick={() => queueCommand('queue.remove', { id: entry.id })}>{t('ui.room.remove')}</button>
              </>}
            </li>
          ))}</ul>
        ) : <div className="hint">{t('ui.room.noQueue')}</div>}
        {queueNotice && <div className={queueNoticeTone}>{queueNotice}</div>}
        <div className="group">{t('ui.room.styleShare')}</div>
        <label className="row"><span className="row__label">{t('ui.room.proposalName')}</span>
          <input value={styleName} maxLength={40} onChange={(e) => setStyleName(e.target.value)} />
          <span className="row__val" /></label>
        {status.mode === 'host' && (
          <label className="row"><span className="row__label">{t('ui.room.target')}</span>
            <select value={styleTarget} onChange={(e) => setStyleTarget(e.target.value)}>
              <option value="all">{t('ui.room.allMembers')}</option>
              {members.filter((member) => !member.host).map((member) => (
                <option value={member.id} key={member.id}>{member.name}</option>
              ))}
            </select><span className="row__val" /></label>
        )}
        <button className="btn" onClick={sendStyle}>
          {status.mode === 'host' ? t('ui.room.sendStyleHost') : t('ui.room.sendStyleToHost')}
        </button>
        {styleNotice && <div className="hint">{styleNotice}</div>}
        {styleOffers.map((offer) => (
          <div className="style-offer" key={offer.id}>
            <b>{offer.sender?.name || t('ui.room.other')}：{offer.name}</b>
            <div className="sub">{formatDateTime(locale, offer.createdAt)}</div>
            <div className="hint">{t('ui.room.offerHint')}</div>
            <div className="actions">
              <button className="btn" onClick={() => respondStyle(offer.id, true)}>{t('ui.room.acceptSave')}</button>
              <button className="btn secondary" onClick={() => respondStyle(offer.id, false)}>{t('ui.room.reject')}</button>
            </div>
          </div>
        ))}
        <button className="btn danger" onClick={() => ov.room.leave()}>{t('ui.room.leave')}</button>
      </div>
    )
  }
  return (
    <div className="room-setup">
      <p className="room-setup__lead">{t('ui.room.lead')}</p>

      <Card3D className="room-card room-card--host">
        <header>
          <span className="room-card__badge">{t('ui.room.hostBadge')}</span>
          <div>
            <b>{t('room.create')}</b>
            <small>{t('room.create.sub')}</small>
          </div>
        </header>
        <div className="room-card__body">
          <label className="field"><span>{t('room.name')}</span>
            <input value={roomName} maxLength={40} onChange={(e) => setRoomName(e.target.value)} /></label>
          <label className="field"><span>{t('room.nickname')}</span>
            <input value={hostName} maxLength={20} onChange={(e) => setHostName(e.target.value)} /></label>
          <label className="field field--wide"><span>{t('room.code')}</span>
            <input value={code} maxLength={20} placeholder={t('ui.room.passwordPlaceholder')}
              onChange={(e) => setCode(e.target.value)} /></label>
        </div>
        <div className="room-address">
          <span>{t('room.yourAddress')}</span>
          <b>{myIp ? `${myIp}:${PORT}` : t('room.detecting')}</b>
          <button className="mini-action" onClick={copyRoomAddress}>{t('common.copy')}</button>
        </div>
        {lanIps.length > 1 && (
          <>
            <Choice label={t('room.whichNetwork')} value={myIp} onChange={setMyIp}
              hint={t('room.whichNetwork.hint')}>
              {lanIps.map((entry) => (
                <option value={entry.address} key={entry.address}>
                  {entry.address} · {networkAdapterLabel(t, entry.adapter)}{entry.kind === 'radmin' ? ` (${t('ui.room.vpn')})` : entry.kind === 'lan' ? ` (${t('ui.room.lan')})` : ''}
                </option>
              ))}
            </Choice>
            <div className="tip">{t('ui.room.networkTip')}</div>
          </>
        )}
        <button className="btn room-card__go" disabled={busy} onClick={doHost}>
          {busy ? t('ui.room.processing') : t('ui.room.hostAction')}
        </button>
      </Card3D>

      <Card3D className="room-card room-card--join">
        <header>
          <span className="room-card__badge">{t('ui.room.joinBadge')}</span>
          <div>
            <b>{t('room.join')}</b>
            <small>{t('room.join.sub')}</small>
          </div>
        </header>
        <div className="room-card__body">
          <label className="field field--wide"><span>{t('room.hostAddress')}</span>
            <input placeholder={t('ui.room.hostIpPlaceholder')} value={ip} onChange={(e) => setIp(e.target.value)} /></label>
          <label className="field"><span>{t('room.code')}</span>
            <input value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="field"><span>{t('room.nickname')}</span>
            <input value={joinName} maxLength={20} onChange={(e) => setJoinName(e.target.value)} /></label>
        </div>
        <button className="btn room-card__go" disabled={busy} onClick={doJoin}>
          {busy ? t('ui.room.connecting') : t('ui.room.joinAction')}
        </button>
      </Card3D>

      {status.denied && <div className="err">{t('ui.room.denied', { reason: localizeRuntimeMessage(t, status.reason, 'ui.room.unknownError') })}</div>}
      {status.error && <div className="err">{t('ui.room.error', { reason: localizeRuntimeMessage(t, status.error, 'ui.room.unknownError') })}</div>}
    </div>
  )
}

// ================= 網易雲帳號（掃碼登入） =================
function AccountBox({ onProfileChange }) {
  const t = useT()
  const [profile, setProfile] = useState(null)
  const [qr, setQr] = useState(null)
  const [status, setStatus] = useState('')
  const pollRef = useRef(null)
  const tRef = useRef(t)

  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    ov.netease.loginStatus().then((r) => {
      if (r?.profile) setProfile(r.profile)
      onProfileChange?.(r?.profile || null)
    })
    return () => clearInterval(pollRef.current)
  }, [])

  const startLogin = async () => {
    setStatus(tRef.current('player.loginQrGenerating'))
    const r = await ov.netease.loginQr()
    if (!r?.ok || !r.qrimg) { setStatus(tRef.current('player.loginQrFailed')); return }
    setQr({ key: r.key, img: r.qrimg })
    setStatus(tRef.current('player.loginQrScan'))
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const c = await ov.netease.loginCheck(r.key)
      if (!c?.ok) return
      if (c.code === 800) { setStatus(tRef.current('player.loginQrExpired')); clearInterval(pollRef.current); setQr(null) }
      else if (c.code === 801) setStatus(tRef.current('player.loginQrWaiting'))
      else if (c.code === 802) setStatus(tRef.current('player.loginQrConfirm'))
      else if (c.code === 803) {
        const nextProfile = c.profile || { nickname: tRef.current('player.loggedIn') }
        clearInterval(pollRef.current); setQr(null); setStatus(''); setProfile(nextProfile); onProfileChange?.(nextProfile)
      }
    }, 2000)
  }
  const logout = async () => { await ov.netease.logout(); setProfile(null); setStatus(''); onProfileChange?.(null) }

  return (
    <div>
       <div className="group">{t('player.accountTitle')}（{t('player.accountHostHint')}）</div>
      {profile ? (
        <div className="account">
          {profile.avatarUrl && <img src={profile.avatarUrl} alt="" />}
          <div className="meta"><b>{profile.nickname || t('player.loggedIn')}</b><div className="sub">{t('player.accountConnected')}</div></div>
          <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={logout}>{t('player.logout')}</button>
        </div>
      ) : qr ? (
        <div className="qrbox">
          <img src={qr.img} alt="QR" />
          <div className="hint">{status}</div>
           <button className="btn" onClick={() => { clearInterval(pollRef.current); setQr(null); setStatus('') }}>{t('player.cancel')}</button>
        </div>
      ) : (
        <>
           <button className="btn" onClick={startLogin}>📱 {t('player.login')}</button>
          {status && <div className="hint">{status}</div>}
        </>
      )}
    </div>
  )
}

function PrivacyBox() {
  const t = useT()
  const { confirm } = useConsoleFeedback()
  const [summary, setSummary] = useState({ accountStored: false, libraryStored: false, settingsStored: false })
  const [message, setMessage] = useState('')
  const refresh = async () => {
    const next = await ov.privacy.summary()
    if (next) setSummary(next)
  }
  useEffect(() => { refresh() }, [])
  const erase = async (scope, label) => {
    if (!await confirm({
      title: t('ui.privacy.clearTitle'),
      message: t('ui.privacy.clearMessage', { label }),
      confirmLabel: t('ui.privacy.clearConfirm'),
    })) return
    const result = await ov.privacy.erase(scope)
    setMessage(result?.ok ? t('ui.privacy.done') : t('ui.privacy.failed'))
    await refresh()
  }
  return (
    <Section title={t('ui.privacy.title')} defaultOpen={false}>
      <div className="hint">{t('ui.privacy.hint')}</div>
      <div className="privacy-flags">
        <span>{t('ui.privacy.login')}：{summary.accountStored ? t('ui.privacy.saved') : t('ui.privacy.notSaved')}</span>
        <span>{t('ui.privacy.library')}：{summary.libraryStored ? t('ui.privacy.saved') : t('ui.privacy.notSaved')}</span>
        <span>{t('ui.privacy.settings')}：{summary.settingsStored ? t('ui.privacy.saved') : t('ui.privacy.notSaved')}</span>
      </div>
      <button className="btn secondary" onClick={() => erase('account', t('ui.privacy.removeLogin'))}>{t('ui.privacy.removeLogin')}</button>
      <button className="btn secondary" onClick={() => erase('library', t('ui.privacy.clearLibrary'))}>{t('ui.privacy.clearLibrary')}</button>
      <button className="btn danger" onClick={() => erase('settings', t('ui.privacy.resetSettings'))}>{t('ui.privacy.resetSettings')}</button>
      <div className="hint">{t('ui.privacy.hostWarning')}</div>
      {message && <div className={message === t('ui.privacy.done') ? 'ok' : 'err'}>{message}</div>}
    </Section>
  )
}

// 網易雲歌單只讀；璃音本機歌單才允許建立、排序與刪除。
function PlaylistsPanel({ profile, isMember, canPlayback, onPlay }) {
  const t = useT()
  const { confirm } = useConsoleFeedback()
  const [cloudPlaylists, setCloudPlaylists] = useState([])
  const [localPlaylists, setLocalPlaylists] = useState([])
  const [cloudTracks, setCloudTracks] = useState([])
  const [localTracks, setLocalTracks] = useState([])
  const [selectedCloudId, setSelectedCloudId] = useState('')
  const [selectedLocalId, setSelectedLocalId] = useState('')
  const [targetLocalId, setTargetLocalId] = useState('')
  const [newName, setNewName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshLocal = async (preferredId = '') => {
    const response = await ov.localPlaylists.list()
    if (!response?.ok) { setMessage(t('ui.playlist.readLocalFailed')); return [] }
    const lists = response.data || []
    setLocalPlaylists(lists)
    const nextId = preferredId || (lists.some((item) => item.id === selectedLocalId) ? selectedLocalId : lists[0]?.id || '')
    setSelectedLocalId(nextId)
    setTargetLocalId((current) => lists.some((item) => item.id === current) ? current : nextId)
    if (nextId) {
      const items = await ov.localPlaylists.items(nextId)
      setLocalTracks(items?.ok ? items.data || [] : [])
    } else setLocalTracks([])
    return lists
  }

  useEffect(() => { refreshLocal() }, [])
  useEffect(() => {
    let active = true
    if (!profile?.userId) { setCloudPlaylists([]); setCloudTracks([]); return () => { active = false } }
    setBusy(true)
    ov.netease.userPlaylists().then((response) => {
      if (!active) return
      setBusy(false)
      if (response?.ok) setCloudPlaylists(response.data || [])
      else setMessage(t('ui.playlist.readCloudFailed'))
    })
    return () => { active = false }
  }, [profile?.userId, t])

  const createLocal = async () => {
    const name = newName.trim()
    if (!name) return
    const response = await ov.localPlaylists.create(name)
    if (!response?.ok) { setMessage(t('ui.playlist.createFailed')); return }
    setNewName(''); setMessage(''); await refreshLocal(response.data.id)
  }
  const selectLocal = async (id) => {
    setSelectedLocalId(id); setTargetLocalId(id)
    const response = await ov.localPlaylists.items(id)
    setLocalTracks(response?.ok ? response.data || [] : [])
    if (!response?.ok) setMessage(t('ui.playlist.readFailed'))
  }
  const selectCloud = async (id) => {
    setSelectedCloudId(id); setBusy(true); setMessage('')
    const response = await ov.netease.playlistTracks(id)
    setBusy(false)
    if (response?.ok) setCloudTracks(response.data || [])
    else { setCloudTracks([]); setMessage(t('ui.playlist.readCloudFailed')) }
  }
  const addToLocal = async (song) => {
    if (!targetLocalId) { setMessage(t('ui.playlist.needLocal')); return }
    const response = await ov.localPlaylists.add(targetLocalId, { provider: 'netease', trackId: song.id, ...song })
    setMessage(response?.ok ? t('ui.playlist.added') : t('ui.playlist.addFailed'))
    await refreshLocal(targetLocalId)
  }
  const beginRenameLocal = () => {
    const current = localPlaylists.find((item) => item.id === selectedLocalId)
    if (!current) return
    setRenameValue(current.name)
    setRenaming(true)
  }
  const saveRenameLocal = async () => {
    const current = localPlaylists.find((item) => item.id === selectedLocalId)
    const name = renameValue.trim()
    if (!current || !name) return
    const response = await ov.localPlaylists.rename(current.id, name)
    setMessage(response?.ok ? '' : t('ui.playlist.renameFailed'))
    if (response?.ok) {
      setRenaming(false)
      setRenameValue('')
    }
    await refreshLocal(current.id)
  }
  const deleteLocal = async () => {
    const current = localPlaylists.find((item) => item.id === selectedLocalId)
    if (!current || !await confirm({
      title: t('ui.playlist.deleteTitle'),
      message: t('ui.playlist.deleteMessage', { name: current.name }),
      confirmLabel: t('ui.playlist.delete'),
    })) return
    const response = await ov.localPlaylists.delete(current.id)
    setMessage(response?.ok ? '' : t('ui.playlist.deleteFailed'))
    await refreshLocal()
  }
  const removeLocal = async (id) => {
    await ov.localPlaylists.remove(id)
    await selectLocal(selectedLocalId)
  }
  const moveLocal = async (track, position) => {
    await ov.localPlaylists.move(track.id, position)
    await selectLocal(selectedLocalId)
  }

  return (
    <Section title={t('ui.playlist.title')} defaultOpen={false}>
      <div className="group">{t('ui.playlist.cloud')}</div>
      {!profile?.userId ? <div className="hint">{t('ui.playlist.loginHint')}</div> : (
        <select className="playlist-select" value={selectedCloudId} disabled={busy}
          onChange={(event) => selectCloud(event.target.value)}>
          <option value="">{t('ui.playlist.selectCloud')}</option>
          {cloudPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}（{playlist.trackCount}）</option>)}
        </select>
      )}
      {cloudTracks.length > 0 && (
        <>
          <div className="playlist-target">
            <span>{t('ui.playlist.addTo')}</span>
            <select value={targetLocalId} onChange={(event) => setTargetLocalId(event.target.value)}>
              <option value="">{t('ui.playlist.selectLocal')}</option>
              {localPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
            </select>
          </div>
          <ul className="results playlist-results">{cloudTracks.map((song) => (
            <li key={song.id}>
              {song.cover && <img src={song.cover} alt="" />}
              <div className="meta"><b>{song.name}</b><div className="sub">{song.artist}</div></div>
              <button className="mini-action" onClick={() => onPlay(song, cloudTracks)}>{isMember && !canPlayback ? t('ui.playlist.request') : t('ui.playlist.play')}</button>
              <button className="mini-action" onClick={() => addToLocal(song)}>{t('ui.playlist.favorite')}</button>
            </li>
          ))}</ul>
        </>
      )}

      <div className="group">{t('ui.playlist.local')}</div>
      <div className="searchbar">
        <input value={newName} placeholder={t('ui.playlist.newPlaceholder')} onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') createLocal() }} />
        <button className="btn" disabled={!newName.trim()} onClick={createLocal}>{t('ui.playlist.create')}</button>
      </div>
      {localPlaylists.length > 0 && (
        <div className="playlist-toolbar">
          <select className="playlist-select" value={selectedLocalId} onChange={(event) => selectLocal(event.target.value)}>
            {localPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}（{playlist.itemCount}）</option>)}
          </select>
          <button className="mini-action" onClick={beginRenameLocal}>{t('ui.playlist.rename')}</button>
          <button className="mini-action danger" onClick={deleteLocal}>{t('ui.playlist.delete')}</button>
        </div>
      )}
      {renaming && (
        <div className="playlist-rename">
          <input value={renameValue} autoFocus placeholder={t('ui.playlist.newName')}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') saveRenameLocal() }} />
          <button type="button" className="mini-action" disabled={!renameValue.trim()} onClick={saveRenameLocal}>{t('ui.playlist.save')}</button>
          <button type="button" className="mini-action" onClick={() => setRenaming(false)}>{t('ui.playlist.cancel')}</button>
        </div>
      )}
      {localTracks.length > 0 ? (
        <ul className="results playlist-results">{localTracks.map((track, index) => (
          <li key={track.id}>
            {track.cover && <img src={track.cover} alt="" />}
            <div className="meta"><b>{track.name}</b><div className="sub">{track.artist}</div></div>
            <button className="mini-action" onClick={() => onPlay(track, localTracks)}>{isMember && !canPlayback ? t('ui.playlist.request') : t('ui.playlist.play')}</button>
            <button className="mini-action" disabled={index === 0} onClick={() => moveLocal(track, index - 1)}>↑</button>
            <button className="mini-action" disabled={index === localTracks.length - 1} onClick={() => moveLocal(track, index + 1)}>↓</button>
            <button className="mini-action danger" onClick={() => removeLocal(track.id)}>{t('ui.room.remove')}</button>
          </li>
        ))}</ul>
      ) : selectedLocalId ? <div className="hint">{t('ui.playlist.empty')}</div> : null}
      {message && <div className={message === t('ui.playlist.added') ? 'ok' : 'err'}>{message}</div>}
    </Section>
  )
}

// ================= 播放（自動偵測網易雲） =================
function PlayTab({ roomState, roomClockRef, status, commandResult, volume = 0.8 }) {
  const { confirm } = useConsoleFeedback()
  const t = useT()
  const playerError = (value, fallbackKey = 'player.actionFailed') => (
    localizePlayerError(t, value, { fallbackKey })
  )
  // 來源的內部 ID 永遠不變，只有顯示出來的名稱跟著語言走。
  const playbackSourceLabel = (source) => localizedSourceLabel(t, source)
  const s = roomState?.song
  const isMember = status.mode === 'member'
  const canPlayback = !isMember || !!status.capabilities?.['playback.control']
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [player, setPlayer] = useState({ enabled: false, playing: false, loading: false, positionMs: 0, durationMs: 0 })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [playerMessage, setPlayerMessage] = useState('')
  const [accountProfile, setAccountProfile] = useState(null)
  const [clockNow, setClockNow] = useState(() => performance.now())
  const displayedPlayer = compactPlayerView({
    internalPlayer: player,
    roomState,
    roomClock: roomClockRef?.current,
    now: clockNow,
    roomMode: status.mode || 'solo',
  })
  const canControlDisplayed = canPlayback && displayedPlayer.providerControllable
  const displayedAvatar = displayedPlayer.song?.artistImageUrl || displayedPlayer.song?.avatar || ''
  // 主行程在載入中會塞一個固定字串當歌名。那是後端的佔位字，不是真的歌名，
  // 直接畫出來的話英文介面會看到中文。載入中一律顯示翻譯過的「載入中」。
  const displayedTitle = displayedPlayer.loading
    ? t('player.loading')
    : (displayedPlayer.song?.name || t('player.noSong'))
  useEffect(() => ov.onNpInfo(setInfo), [])
  useEffect(() => {
    let active = true
    ov.player.snapshot().then((snapshot) => { if (active && snapshot) setPlayer(snapshot) })
    const offChanged = ov.player.onChanged((snapshot) => snapshot && setPlayer(snapshot))
    const offTick = ov.player.onTick((tick) => setPlayer((current) => ({ ...current, ...tick })))
    return () => { active = false; offChanged(); offTick() }
  }, [])
  useEffect(() => {
    if (!commandResult) return
    setPlayerMessage(commandResult.ok ? t('player.sentToHost') : playerError(commandResult.error, 'player.actionFailed'))
  }, [commandResult, t])
  useEffect(() => {
    if (!displayedPlayer.playing || displayedPlayer.providerControllable) return undefined
    setClockNow(performance.now())
    const timer = setInterval(() => setClockNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [displayedPlayer.playing, displayedPlayer.providerControllable, displayedPlayer.song?.revision])

  const searchInternal = async () => {
    const keyword = query.trim()
    if (!keyword) return
    setBusy(true)
    setPlayerMessage('')
    const response = await ov.netease.search(keyword)
    setBusy(false)
    if (response?.ok) setResults(response.data || [])
    else setPlayerMessage(playerError(response?.error, 'player.searchFailed'))
  }

  const runPlayer = async (action, roomType, payload = {}) => {
    const response = isMember ? await ov.room.command(roomType, payload) : await action()
    setPlayerMessage(response?.ok ? '' : playerError(response?.errorCode || response?.error))
    if (response?.ok) {
      const snapshot = await ov.player.snapshot()
      if (snapshot) setPlayer(snapshot)
    }
  }

  // queue 是使用者當下看到的那份清單（搜尋結果或歌單），
  // 「下一首」才會照他眼前的順序走，而不是憑空猜一個。
  const playResult = async (song, queue) => {
    const trackId = song.trackId || song.id
    if (isMember && !canPlayback) {
      const response = await ov.room.command('song.request', { provider: 'netease', trackId })
      setPlayerMessage(response?.ok ? t('player.requestSong') : playerError(response?.errorCode || response?.error))
      return
    }
    setPlayerMessage(isMember ? t('player.requestSent') : t('player.preparing'))
    const response = isMember
      ? await ov.room.command('playback.load', { trackId })
      : await ov.player.load(trackId, Array.isArray(queue) ? { queue } : {})
    setPlayerMessage(response?.ok ? (response.pending ? t('player.requestSent') : '') : playerError(response?.errorCode || response?.error))
  }

  const formatTime = (milliseconds) => {
    const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }

  const setVolume = async (value) => {
    const response = await ov.player.setVolume(value)
    if (!response?.ok) setPlayerMessage(playerError(response?.errorCode || response?.error, 'player.volumeFailed'))
  }

  const enablePrecise = async () => {
    if (!await confirm({
      title: t('player.preciseTitle'),
      message: t('player.preciseHint'),
      confirmLabel: t('player.enablePrecise'),
    })) return
    setBusy(true)
    await ov.ncmRelaunchDebug()
    setBusy(false)
  }

  return (
    <div>
      <AccountBox onProfileChange={setAccountProfile} />
      <PrivacyBox />

      <div className="group">{t('player.internalTitle')}</div>
      {!player.enabled ? (
        <div className="err">{playerError(player.reasonCode || player.reason, 'player.internalDisabled')}</div>
      ) : (
        <>
          <div className="searchbar searchbar--song">
            <input value={query} disabled={busy} placeholder={t('player.searchPlaceholder')}
              aria-label={t('player.searchPlaceholder')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') searchInternal() }} />
            <button className="btn" disabled={busy || !query.trim()} onClick={searchInternal}>
              {busy ? `${t('player.searching')}…` : t('player.search')}
            </button>
          </div>
          {isMember && <div className="hint">{canPlayback ? t('player.memberHint') : t('player.memberRequestHint')}</div>}
          {results.length > 0 && (
            <ul className="results results--song">
              {results.map((song) => (
                <li key={song.id}>
                  {song.cover
                    ? <img src={song.cover} alt="" />
                    : <div className="results__noart" aria-hidden="true">♪</div>}
                  <div className="meta">
                    <b title={song.name}>{song.name}</b>
                    <div className="sub" title={[song.artist, song.album].filter(Boolean).join(' · ')}>
                      {song.artist || t('player.unknownArtist')}{song.album ? ` · ${song.album}` : ''}
                    </div>
                  </div>
                  <button className="btn" disabled={player.loading} onClick={() => playResult(song, results)}>{isMember && !canPlayback ? t('player.requestSong') : t('player.play')}</button>
                </li>
              ))}
            </ul>
          )}
          {/* 緊湊播放器：封面、歌名、歌手、專輯、歌手頭像、來源、狀態、
              上一首／播放／下一首、進度條與時間，集中在一張卡片裡。 */}
          <section className="miniplayer">
            <div className="miniplayer__art">
              {displayedPlayer.song?.cover
                ? <img src={displayedPlayer.song.cover} alt="" />
                : <div className="miniplayer__noart" aria-hidden="true">♪</div>}
              {displayedAvatar && displayedAvatar !== displayedPlayer.song?.cover && (
                <img className="miniplayer__avatar" src={displayedAvatar} alt="" title={displayedPlayer.song?.artist || ''} />
              )}
            </div>
            <div className="miniplayer__body">
              <div className="miniplayer__head">
                <b title={displayedTitle}>{displayedTitle}</b>
                <span className={`miniplayer__state ${displayedPlayer.playing ? 'is-playing' : ''}`}>
                  {displayedPlayer.loading ? t('player.loading')
                    : displayedPlayer.playing ? t('player.playing')
                      : displayedPlayer.song ? t('player.paused') : t('player.standby')}
                </span>
              </div>
              <div className="miniplayer__meta" title={[displayedPlayer.song?.artist, displayedPlayer.song?.album].filter(Boolean).join(' · ')}>
                {displayedPlayer.song?.artist || '—'}
                {displayedPlayer.song?.album ? <span className="miniplayer__album"> · {displayedPlayer.song.album}</span> : null}
              </div>
              {/* 冒號屬於翻譯的一部分：中日用全形、法文冒號前要空格 */}
              <div className="miniplayer__source">{t('player.sourceLine', { name: playbackSourceLabel(displayedPlayer.source) })}</div>

              <div className="miniplayer__transport">
                <button className="mini-action" aria-label={t('player.previous')}
                  disabled={!canControlDisplayed || !displayedPlayer.queue?.hasPrevious}
                  title={displayedPlayer.queue?.hasPrevious ? t('player.previous') : t('player.noPrevious')}
                  onClick={() => runPlayer(ov.player.previous, 'playback.previous')}>⏮</button>
                <button className="btn miniplayer__play"
                  disabled={!canControlDisplayed || !displayedPlayer.song || displayedPlayer.loading}
                  onClick={() => runPlayer(displayedPlayer.playing ? ov.player.pause : ov.player.play, displayedPlayer.playing ? 'playback.pause' : 'playback.play')}>
                  {displayedPlayer.playing ? `⏸ ${t('player.pause')}` : `▶ ${t('player.play')}`}
                </button>
                <button className="mini-action" aria-label={t('player.next')}
                  disabled={!canControlDisplayed || !displayedPlayer.queue?.hasNext}
                  title={displayedPlayer.queue?.hasNext ? t('player.next') : t('player.noNext')}
                  onClick={() => runPlayer(ov.player.next, 'playback.next')}>⏭</button>
              </div>

              <div className="miniplayer__seek">
                <span>{formatTime(displayedPlayer.positionMs)}</span>
                <input type="range" min="0" max={Math.max(1, displayedPlayer.durationMs || 1)}
                  value={Math.min(displayedPlayer.positionMs || 0, displayedPlayer.durationMs || 1)}
                  disabled={!canControlDisplayed || !displayedPlayer.song}
                  aria-label={t('player.nowPlaying')}
                  onChange={(event) => runPlayer(() => ov.player.seek(Number(event.target.value)), 'playback.seek', { positionMs: Number(event.target.value) })} />
                <span>{formatTime(displayedPlayer.durationMs)}</span>
              </div>
              {displayedPlayer.queue?.length > 1 && (
                <div className="miniplayer__queue">
                  {t('player.queuePosition', { index: displayedPlayer.queue.index + 1, total: displayedPlayer.queue.length })}
                </div>
              )}
            </div>
          </section>

          <div className="transport player-volume">
            <label htmlFor="internal-player-volume">{t('player.volume')}</label>
            <input id="internal-player-volume" type="range" min="0" max="100" step="1"
              value={Math.round(Math.max(0, Math.min(1, Number(volume) || 0)) * 100)}
              onChange={(event) => setVolume(Number(event.target.value) / 100)} />
            <span>{Math.round(Math.max(0, Math.min(1, Number(volume) || 0)) * 100)}%</span>
          </div>
        </>
      )}
      {(playerMessage || player.error) && <div className="err">{playerMessage || playerError(player.error)}</div>}

      <PlaylistsPanel profile={accountProfile} isMember={isMember} canPlayback={canPlayback} onPlay={playResult} />

      <div className="group">{t('player.preciseTitle')}</div>
      {info?.cdp && info?.lyricMirror ? (
        <div className="ok">✅ {t('player.preciseEnabled')}</div>
      ) : info?.cdp ? (
        <div className="err">⚠ {t('player.preciseConnected')}</div>
      ) : (
        <>
          <button className="btn" disabled={busy} onClick={enablePrecise}>⚡ {t('player.enablePrecise')}</button>
          <div className="hint">{t('player.preciseHint')}</div>
        </>
      )}

      <div className="group">{t('player.desktopTitle')}</div>
      {s && s.name ? (
        <div className="nowplaying">
          {s.cover && <img src={s.cover} alt="" />}
          <div className="meta"><b>{s.name}</b><div className="sub">{s.artist || ''}</div></div>
        </div>
      ) : (
        <div className="hint">{t('player.desktopActionHint')}</div>
      )}

      <div className="group">{t('player.syncSourceTitle')}</div>
      {info ? (
        <>
          <div className={info.matched ? 'ok' : 'err'}>
            {info.matched
              ? `✅ ${t('player.syncing', { title: info.current?.title || '' })}`
              : (info.following ? `⚠ ${t('player.followUnavailable')}` : `⚠ ${t('player.noMedia')}`)}
          </div>
          <div className={info.posLocked ? 'ok' : 'err'}>
            {info.posLocked ? `🔒 ${t('player.positionLocked')}` : `⚠ ${t('player.positionWaiting')}`}
          </div>
          {info.health && (
            <div className={Math.abs(info.health.avgMs ?? 0) < 400 ? 'ok' : 'err'}>
              {Math.abs(info.health.avgMs ?? 0) < 400 ? `🎯 ${t('player.onTempo')}` : `⚠ ${t('player.offTempo')}`}
              {` — ${t('player.averageOffset', { value: info.health.avgMs ?? '?' })}`}
              {info.health.driftMs != null &&
                ` (${info.health.driftMs > 0 ? t('player.slow') : t('player.fast')} ${Math.abs(info.health.driftMs)} ms)`}
            </div>
          )}
          <button className={`btn ${!info.following ? 'on' : ''}`} onClick={() => ov.npSetFollow(null)}>
            {t('player.followAutomatic')}{!info.following ? ' ✓' : ''}
          </button>
          {info.detected && info.detected.length ? (
            <ul className="results">
              {info.detected.map((d, i) => (
                <li key={i} onClick={() => ov.npSetFollow(d.sourceAppId || d.app)}>
                  <div className="meta"><b>{d.title || t('player.untitled')}</b><div className="sub">[{detectedMediaStatusLabel(t, d.status)}] {detectedMediaSourceLabel(t, d.app)}</div></div>
                  <span className="play">{info.following === (d.sourceAppId || d.app) ? `✓ ${t('player.following')}` : t('player.follow')}</span>
                </li>
              ))}
            </ul>
          ) : <div className="hint">{t('player.noSources')}</div>}
        </>
      ) : <div className="hint">{t('player.detecting')}</div>}

      <div className="hint">
        {isMember
          ? t('player.memberGuide')
          : t('player.desktopGuide')}
      </div>
    </div>
  )
}

// ================= 外觀 =================
function LookTab({ state, setGlass, setCfg, setProfiles, setUi, embedded = false }) {
  const t = useT()
  const { glass, cfg } = state
  const decorationControls = decorationControlsForMode(cfg.decorationMode)
  const progressControls = progressControlsForMode(cfg.progressAnim)
  const [profileName, setProfileName] = useState('')
  const [previewDecoration, setPreviewDecoration] = useState(true)
  const sections = mergeLookSections(state.ui?.lookSections)
  const sectionProps = (key) => ({
    open: sections[key],
    onOpenChange: (open) => setUi({ lookSections: { ...sections, [key]: open } }),
  })
  const saveProfile = (id, name) => {
    const safeName = String(name || '').trim() || t('look.profiles.defaultName')
    const profile = createAppearanceProfile({ id, name: safeName, glass, cfg })
    setProfiles(upsertAppearanceProfile(state.profiles || [], profile))
  }
  const applyProfile = (profile) => applyAppearanceProfile(profile, setGlass, setCfg)
  const deleteProfile = (id) => setProfiles((state.profiles || []).filter((profile) => profile.id !== id))
  const showHints = state.ui?.lookHints !== false
  const locale = useLocale()
  return (
    <HintContext.Provider value={showHints}>
    <div>
      {/* 預覽：跟實際藥丸同參數、同封面底 */}
      {!embedded && <><div className="preview">
        <ConsoleCapsulePreview state={state} playing={previewDecoration} effectsPaused={!previewDecoration} />
      </div>
      <Toggle label={t('look.preview.play')} hint={t('look.preview.play.hint')}
        checked={previewDecoration} onChange={setPreviewDecoration} /></>}

      {/* 設定名稱常常看不出來會改到什麼，預設把白話說明打開；
          調熟了可以收起來，版面會精簡很多。 */}
      <Toggle label={t('look.hints.show')} hint={t('look.hints.show.hint')}
        checked={showHints} onChange={(v) => setUi({ lookHints: v })} />

      {/* ---------- 快速預設 ---------- */}
      <Section title={`⚡ ${t('look.section.quick')}`} {...sectionProps('quick')}>
      <div className="group">⚡ {t('look.quick.title')}</div>
      <div className="presetrow">
        {QUICK_PRESET_IDS.map((id) => (
          <button key={id} className="btn preset preset--own"
            onClick={() => applyQuickPreset(id, { setCfg, setGlass })}>
            {QUICK_PRESETS[id].label}
          </button>
        ))}
      </div>
      <div className="tip">{t('look.quick.completeTip')}</div>
      <button className="btn" onClick={() => setCfg(randomLook())}>🎲 {t('look.random')}</button>
      <div className="tip">{t('look.random.hint')}</div>

      <div className="group">💾 {t('look.profiles.title')}</div>
      <div className="searchbar">
        <input value={profileName} maxLength={40} placeholder={t('look.profiles.placeholder')}
          onChange={(e) => setProfileName(e.target.value)} />
        <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={() => {
          saveProfile(undefined, profileName)
          setProfileName('')
        }}>{t('look.profiles.save')}</button>
      </div>
      {(state.profiles || []).length > 0 && (
        <ul className="results profile-list">
          {(state.profiles || []).map((profile) => (
            <li key={profile.id}>
              <div className="meta"><b>{profile.name}</b><div className="sub">{formatDateTime(locale, profile.updatedAt)}</div></div>
              <button className="mini-action" onClick={() => applyProfile(profile)}>{t('common.apply')}</button>
              <button className="mini-action" onClick={() => saveProfile(profile.id, profile.name)}>{t('common.overwrite')}</button>
              <button className="mini-action danger" onClick={() => deleteProfile(profile.id)}>{t('common.delete')}</button>
            </li>
          ))}
        </ul>
      )}

      </Section>

      {/* ---------- 樣式（最常用，放最前面）---------- */}
      <Section title={`🎨 ${t('look.section.basic')}`} {...sectionProps('basic')}>
      <div className="group">🎨 {t('look.style.title')}</div>
      <label className="row"><span className="row__label">{t('look.skin')}</span>
        <select value={cfg.skin} onChange={(e) => setCfg({ skin: e.target.value })}>
          <option value="glass">{t('look.skin.glass')}</option>
          <option value="avatar">{t('look.skin.avatar')}</option>
        </select><span className="row__val" /></label>
      <Toggle label={t('look.vinyl.show')} hint={t('look.vinyl.show.hint')}
        checked={cfg.showVinyl} onChange={(v) => setCfg({ showVinyl: v })} />
      {cfg.showVinyl && (
        <>
          <Slider label={t('look.vinyl.size')} value={cfg.vinylScale ?? 3.4} min={2} max={6} step={0.1}
            onChange={(v) => setCfg({ vinylScale: v })} fmt={(v) => v.toFixed(1) + '×'} />
          <label className="row"><span className="row__label">{t('look.vinyl.frame')}</span>
            <select value={cfg.vinylFrame || 'none'} onChange={(e) => setCfg({ vinylFrame: e.target.value })}>
              {VINYL_FRAMES.map((frame) => <option value={frame.id} key={frame.id}>{t(`ui.look.frame.${frame.id}`)}</option>)}
            </select><span className="row__val" /></label>
        </>
      )}
      <Toggle label={t('look.songName.show')} hint={t('look.songName.show.hint')}
        checked={cfg.showSongName} onChange={(v) => setCfg({ showSongName: v })} />
      {cfg.showSongName && (
        <label className="row"><span className="row__label">{t('look.songName.position')}</span>
          <select value={cfg.songNamePos || 'tl'} onChange={(e) => setCfg({ songNamePos: e.target.value })}>
            <option value="tl">{t('look.position.tl')}</option>
            <option value="tc">{t('look.position.tc')}</option>
            <option value="tr">{t('look.position.tr')}</option>
            <option value="bl">{t('look.position.bl')}</option>
            <option value="bc">{t('look.position.bc')}</option>
            <option value="br">{t('look.position.br')}</option>
          </select><span className="row__val" /></label>
      )}
      <Toggle label={t('look.edgeSmooth')} hint={t('look.edgeSmooth.hint')}
        checked={cfg.smoothEdge} onChange={(v) => setCfg({ smoothEdge: v })} />
      <Toggle label={t('look.bilingual')} hint={t('look.bilingual.hint')}
        checked={cfg.bilingual} onChange={(v) => setCfg({ bilingual: v })} />
      <label className="row"><span className="row__label">{t('look.highlight')}</span>
        <select value={cfg.lyricHighlightMode || (cfg.karaoke === false ? 'off' : 'characters')}
          onChange={(e) => setCfg({ lyricHighlightMode: e.target.value, karaoke: e.target.value !== 'off' })}>
          <option value="characters">{t('look.highlight.characters')}</option>
          <option value="fill">{t('look.highlight.fill')}</option>
          <option value="both">{t('look.highlight.both')}</option>
          <option value="off">{t('common.off')}</option>
        </select><span className="row__val" /></label>
      {['fill', 'both'].includes(cfg.lyricHighlightMode || (cfg.karaoke === false ? 'off' : 'characters')) && (
        <label className="row"><span className="row__label">{t('look.fillColor')}</span>
          <select value={cfg.flowFillColorMode || 'fixed'} onChange={(e) => setCfg({ flowFillColorMode: e.target.value })}>
            <option value="fixed">{t('look.fillColor.fixed')}</option>
            <option value="cover-gradient">{t('look.fillColor.cover')}</option>
          </select><span className="row__val" /></label>
      )}

      <div className="group">{t('look.layout.title')}</div>
      <label className="row"><span className="row__label">{t('look.layout.style')}</span>
        <select value={cfg.lyricLayout || 'balanced'} onChange={(e) => setCfg({ lyricLayout: e.target.value })}>
          {Object.keys(LYRIC_LAYOUTS).map((id) => <option value={id} key={id}>{t(`look.layout.${id}`)}</option>)}
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('look.layout.align')}</span>
        <select value={cfg.lyricAlign || 'auto'} onChange={(e) => setCfg({ lyricAlign: e.target.value })}>
          <option value="auto">{t('look.layout.align.auto')}</option>
          <option value="left">{t('look.layout.align.left')}</option>
          <option value="center">{t('look.layout.align.center')}</option>
          <option value="right">{t('look.layout.align.right')}</option>
        </select><span className="row__val" /></label>
      <div className="tip">{t('look.layout.hint')}</div>

      <div className="group">{t('look.typography.title')}</div>
      <label className="row"><span className="row__label">{t('look.font.lyric')}</span>
        <select value={cfg.lyricFont || 'system'} onChange={(e) => setCfg({ lyricFont: e.target.value })}>
          {LYRIC_FONT_OPTIONS.map((font) => <option value={font.id} key={font.id}>{t(`look.font.${font.id}`)}</option>)}
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('look.font.translation')}</span>
        <select value={cfg.translationFont || 'inherit'} onChange={(e) => setCfg({ translationFont: e.target.value })}>
          <option value="inherit">{t('look.font.inherit')}</option>
          {LYRIC_FONT_OPTIONS.map((font) => <option value={font.id} key={font.id}>{t(`look.font.${font.id}`)}</option>)}
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('look.textStyle')}</span>
        <select value={cfg.textStyle || 'clean'} onChange={(e) => setCfg({ textStyle: e.target.value })}>
          {TEXT_STYLE_OPTIONS.map((style) => <option value={style.id} key={style.id}>{t(`look.textStyle.${style.id}`)}</option>)}
        </select><span className="row__val" /></label>
      <Slider label={t('look.fontWeight.lyric')} hint={t('look.fontWeight.lyric.hint')} value={cfg.fontWeight ?? 800} min={400} max={900} step={100}
        onChange={(v) => setCfg({ fontWeight: v })} fmt={(v) => v >= 800 ? t('look.weight.bold', { value: v }) : v <= 500 ? t('look.weight.thin', { value: v }) : t('look.weight.medium', { value: v })} />
      <Slider label={t('look.fontWeight.translation')} hint={t('look.fontWeight.translation.hint')} value={cfg.translationWeight ?? 700} min={400} max={900} step={100}
        onChange={(v) => setCfg({ translationWeight: v })} fmt={(v) => v >= 800 ? t('look.weight.bold', { value: v }) : v <= 500 ? t('look.weight.thin', { value: v }) : t('look.weight.medium', { value: v })} />
      <Slider label={t('look.letterSpacing.lyric')} hint={t('look.letterSpacing.lyric.hint')} value={cfg.lyricLetterSpacing ?? 0.01} min={-0.08} max={0.16} step={0.01}
        onChange={(v) => setCfg({ lyricLetterSpacing: v })} fmt={(v) => v.toFixed(2) + 'em'} />
      <Slider label={t('look.letterSpacing.translation')} hint={t('look.letterSpacing.translation.hint')} value={cfg.translationLetterSpacing ?? 0} min={-0.08} max={0.16} step={0.01}
        onChange={(v) => setCfg({ translationLetterSpacing: v })} fmt={(v) => v.toFixed(2) + 'em'} />
      <Slider label={t('look.lineHeight.lyric')} hint={t('look.lineHeight.lyric.hint')} value={cfg.lyricLineHeight ?? 1.25} min={0.95} max={1.8} step={0.05}
        onChange={(v) => setCfg({ lyricLineHeight: v })} fmt={(v) => v.toFixed(2)} />
      <Slider label={t('look.lineHeight.translation')} hint={t('look.lineHeight.translation.hint')} value={cfg.translationLineHeight ?? 1.3} min={0.95} max={1.8} step={0.05}
        onChange={(v) => setCfg({ translationLineHeight: v })} fmt={(v) => v.toFixed(2)} />
      <Slider label={t('look.translationScale')} hint={t('look.translationScale.hint')} value={cfg.translationScale ?? 0.72} min={0.5} max={1.25} step={0.05}
        onChange={(v) => setCfg({ translationScale: v })} fmt={(v) => Math.round(v * 100) + '%'} />

      {/* ---------- 字幕 ---------- */}
      <div className="group">{t('look.readability.title')}</div>
      <Slider label={t('look.fontSize')} value={cfg.fontSize} min={14} max={80} step={1} onChange={(v) => setCfg({ fontSize: v })} />
      <Slider label={t('look.maxWidth')} hint={t('look.maxWidth.hint')} value={cfg.maxWidth} min={200} max={1400} step={10} onChange={(v) => setCfg({ maxWidth: v })} fmt={(v) => v + 'px'} />
      <Slider label={t('look.outline')} hint={t('look.outline.hint')} value={cfg.outline ?? 1} min={0} max={2.5} step={0.1}
        onChange={(v) => setCfg({ outline: v })} fmt={(v) => (v === 0 ? t('common.none') : v.toFixed(1))} />
      <Slider label={t('look.lyricAlpha')} hint={t('look.lyricAlpha.hint')} value={cfg.lyricAlpha ?? 1} min={0.2} max={1} step={0.05}
        onChange={(v) => setCfg({ lyricAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label={t('look.clarity')} hint={t('look.clarity.hint')} value={cfg.textClarity ?? 0.7} min={0} max={1} step={0.05}
        onChange={(v) => setCfg({ textClarity: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label={t('look.translationGap')} hint={t('look.translationGap.hint')} value={cfg.lyricTranslationGap ?? 7} min={0} max={32} step={1}
        onChange={(v) => setCfg({ lyricTranslationGap: v })} fmt={(v) => v + 'px'} />
      <Slider label={t('look.progressGap')} hint={t('look.progressGap.hint')} value={cfg.translationProgressGap ?? 7} min={0} max={24} step={1}
        onChange={(v) => setCfg({ translationProgressGap: v })} fmt={(v) => v + 'px'} />
      <div className="tip">{t('look.clarity.tip')}</div>
      <Slider label={t('look.songNameAlpha')} hint={t('look.songNameAlpha.hint')} value={cfg.songNameAlpha ?? 0.86} min={0} max={1} step={0.05}
        onChange={(v) => setCfg({ songNameAlpha: v })} fmt={(v) => (v === 0 ? t('common.off') : Math.round(v * 100) + '%')} />
      <label className="row"><span className="row__label">{t('look.songNameColor')}</span>
        <input type="color" value={cfg.songNameColor || '#ffffff'} onChange={(e) => setCfg({ songNameColor: e.target.value })} />
        <span className="row__val">{cfg.songNameColor}</span></label>
      <label className="row"><span className="row__label">{t('look.textColor')}</span>
        <input type="color" value={cfg.textColor} onChange={(e) => setCfg({ textColor: e.target.value })} /><span className="row__val">{cfg.textColor}</span></label>

      </Section>
      {/* ---------- 背景材質 ---------- */}
      <Section title={t('ui.look.background.title')} {...sectionProps('background')}>
      <div className="group">{t('ui.look.background.title')}</div>
      <label className="row"><span className="row__label">{t('ui.look.background.preset')}</span>
        <select value={cfg.bgPreset || 'standard'}
          onChange={(e) => setCfg({ bgPreset: e.target.value, ...(BG_PRESETS[e.target.value] || {}) })}>
          <option value="clear">{t('ui.look.background.clear')}</option>
          <option value="light">{t('ui.look.background.light')}</option>
          <option value="standard">{t('ui.look.background.standard')}</option>
          <option value="heavy">{t('ui.look.background.heavy')}</option>
          <option value="frosted">{t('ui.look.background.frosted')}</option>
          <option value="neon">{t('ui.look.background.neon')}</option>
          <option value="dark">{t('ui.look.background.dark')}</option>
          <option value="solid">{t('ui.look.background.solid')}</option>
          <option value="gradient">{t('ui.look.background.gradient')}</option>
          <option value="custom">{t('ui.look.background.custom')}</option>
        </select><span className="row__val" /></label>
      <Slider label={t('ui.look.background.alpha')} hint={t('ui.look.background.alphaHint')} value={cfg.bgAlpha ?? 0.55} min={0} max={1} step={0.01}
        onChange={(v) => setCfg({ bgAlpha: v, bgPreset: 'custom' })} fmt={(v) => (v === 0 ? t('ui.look.value.transparent') : Math.round(v * 100) + '%')} />
      <Slider label={t('ui.look.background.blur')} hint={t('ui.look.background.blurHint')} value={cfg.bgBlur ?? 18} min={0} max={50} step={1}
        onChange={(v) => setCfg({ bgBlur: v, bgPreset: 'custom' })} fmt={(v) => (v === 0 ? t('ui.look.value.noBlur') : v + 'px')} />
      <div className="tip">{t('ui.look.background.independentTip')}</div>

      <div className="group">{t('ui.look.background.waveTitle')}</div>
      <Toggle label={t('ui.look.background.waveEnable')} hint={t('ui.look.background.waveEnableHint')}
        checked={cfg.oceanWave === true} onChange={(v) => setCfg({ oceanWave: v })} />
      {cfg.oceanWave && <>
        <label className="row"><span className="row__label">{t('ui.look.background.waveColor')}</span>
          <input type="color" value={cfg.oceanWaveColor || '#45b9ff'} onChange={(e) => setCfg({ oceanWaveColor: e.target.value })} />
          <span className="row__val">{cfg.oceanWaveColor}</span></label>
        <Slider label={t('ui.look.background.waveOpacity')} hint={t('ui.look.background.waveOpacityHint')} value={cfg.oceanWaveOpacity ?? 0.32} min={0} max={0.8} step={0.01}
          onChange={(v) => setCfg({ oceanWaveOpacity: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <Slider label={t('ui.look.background.waveAmplitude')} hint={t('ui.look.background.waveAmplitudeHint')} value={cfg.oceanWaveAmplitude ?? 0.45} min={0} max={1} step={0.05}
          onChange={(v) => setCfg({ oceanWaveAmplitude: v })} fmt={(v) => (v === 0 ? t('ui.look.value.calm') : Math.round(v * 100) + '%')} />
        <Slider label={t('ui.look.background.waveSpeed')} hint={t('ui.look.background.waveSpeedHint')} value={cfg.oceanWaveSpeed ?? 1} min={0.2} max={3} step={0.1}
          onChange={(v) => setCfg({ oceanWaveSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
        <div className="tip">{t('ui.look.background.waveProgressTip')}</div>
      </>}
      <label className="row"><span className="row__label">{t('ui.look.background.corner')}</span>
        <select value={cfg.cornerPreset || 'pill'} onChange={(e) => setCfg({ cornerPreset: e.target.value })}>
          <option value="pill">{t('ui.look.background.cornerPill')}</option>
          <option value="large">{t('ui.look.background.cornerLarge')}</option>
          <option value="medium">{t('ui.look.background.cornerMedium')}</option>
          <option value="small">{t('ui.look.background.cornerSmall')}</option>
          <option value="custom">{t('ui.look.background.custom')}</option>
        </select><span className="row__val" /></label>
      {cfg.cornerPreset === 'custom' && (
        <Slider label={t('ui.look.background.cornerPx')} value={cfg.cornerPx ?? 100} min={0} max={200} step={1}
          onChange={(v) => setCfg({ cornerPx: v })} fmt={(v) => v + 'px'} />
      )}

      <Section title={t('ui.look.background.advancedTitle')}>
        <div className="tip">{t('ui.look.background.advancedTip')}</div>
        <Slider label={t('ui.look.background.brightness')} hint={t('ui.look.background.brightnessHint')} value={cfg.bgBright ?? 1} min={0.3} max={2} step={0.05}
          onChange={(v) => setCfg({ bgBright: v, bgPreset: 'custom' })} fmt={(v) => v.toFixed(2) + '×'} />
        <Slider label={t('ui.look.background.contrast')} hint={t('ui.look.background.contrastHint')} value={cfg.bgContrast ?? 1} min={0.3} max={2} step={0.05}
          onChange={(v) => setCfg({ bgContrast: v, bgPreset: 'custom' })} fmt={(v) => v.toFixed(2) + '×'} />
        <Slider label={t('ui.look.background.saturation')} hint={t('ui.look.background.saturationHint')} value={cfg.bgSat ?? 1.2} min={0} max={3} step={0.05}
          onChange={(v) => setCfg({ bgSat: v, bgPreset: 'custom' })} fmt={(v) => (v === 0 ? t('ui.look.value.monochrome') : v.toFixed(2) + '×')} />

        <div className="group">{t('ui.look.background.tintGroup')}</div>
        <label className="row"><span className="row__label">{t('ui.look.background.tintColor')}</span>
          <input type="color" value={cfg.tintColor || '#8fa8ff'}
            onChange={(e) => setCfg({ tintColor: e.target.value, bgPreset: 'custom' })} />
          <span className="row__val">{cfg.tintColor}</span></label>
        <Slider label={t('ui.look.background.tintStrength')} value={cfg.tintStrength ?? 0.12} min={0} max={1} step={0.01}
          onChange={(v) => setCfg({ tintStrength: v, bgPreset: 'custom' })} fmt={(v) => Math.round(v * 100) + '%'} />

        <div className="group">{t('ui.look.background.gradientGroup')}</div>
        <label className="row"><span className="row__label">{t('ui.look.background.gradientMode')}</span>
          <select value={cfg.bgGradMode || 'none'} onChange={(e) => setCfg({ bgGradMode: e.target.value, bgPreset: 'custom' })}>
            <option value="none">{t('ui.look.background.gradientNone')}</option>
            <option value="linear">{t('ui.look.background.gradientLinear')}</option>
            <option value="radial">{t('ui.look.background.gradientRadial')}</option>
          </select><span className="row__val" /></label>
        {cfg.bgGradMode !== 'none' && (
          <>
            <label className="row"><span className="row__label">{t('ui.look.background.color1')}</span>
              <input type="color" value={cfg.bgGradC1 || '#7f9cff'} onChange={(e) => setCfg({ bgGradC1: e.target.value })} />
              <span className="row__val">{cfg.bgGradC1}</span></label>
            <label className="row"><span className="row__label">{t('ui.look.background.color2')}</span>
              <input type="color" value={cfg.bgGradC2 || '#c08cff'} onChange={(e) => setCfg({ bgGradC2: e.target.value })} />
              <span className="row__val">{cfg.bgGradC2}</span></label>
            {cfg.bgGradMode === 'linear' && (
              <Slider label={t('ui.look.background.gradientAngle')} value={cfg.bgGradAngle ?? 145} min={0} max={360} step={5}
                onChange={(v) => setCfg({ bgGradAngle: v })} fmt={(v) => v + '°'} />
            )}
          </>
        )}

        <div className="group">{t('ui.look.background.textureGroup')}</div>
        <Toggle label={t('ui.look.background.edgeHighlight')} hint={t('ui.look.background.edgeHighlightHint')}
          checked={cfg.edgeHighlight}
          onChange={(v) => setCfg({ edgeHighlight: v, bgPreset: 'custom' })} />
        {cfg.edgeHighlight && (
          <Slider label={t('ui.look.background.edgeStrength')} hint={t('ui.look.background.edgeStrengthHint')} value={cfg.edgeHlStrength ?? 0.45} min={0} max={1} step={0.05}
            onChange={(v) => setCfg({ edgeHlStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        )}
        <Slider label={t('ui.look.background.noise')} hint={t('ui.look.background.noiseHint')} value={cfg.noise ?? 0} min={0} max={0.6} step={0.02}
          onChange={(v) => setCfg({ noise: v, bgPreset: 'custom' })} fmt={(v) => (v === 0 ? t('common.off') : Math.round(v * 100) + '%')} />

        <div className="group">{t('ui.look.background.shadowGroup')}</div>
        <Slider label={t('ui.look.background.shadowOut')} hint={t('ui.look.background.shadowOutHint')} value={cfg.shadowOut ?? 0.35} min={0} max={1} step={0.05}
          onChange={(v) => setCfg({ shadowOut: v })} fmt={(v) => (v === 0 ? t('common.off') : Math.round(v * 100) + '%')} />
        <Slider label={t('ui.look.background.shadowOutBlur')} hint={t('ui.look.background.shadowOutBlurHint')} value={cfg.shadowOutBlur ?? 26} min={0} max={80} step={2}
          onChange={(v) => setCfg({ shadowOutBlur: v })} fmt={(v) => v + 'px'} />
        <Slider label={t('ui.look.background.shadowIn')} hint={t('ui.look.background.shadowInHint')} value={cfg.shadowIn ?? 0.25} min={0} max={1} step={0.05}
          onChange={(v) => setCfg({ shadowIn: v })} fmt={(v) => (v === 0 ? t('common.off') : Math.round(v * 100) + '%')} />
        <Slider label={t('ui.look.background.outerGlow')} hint={t('ui.look.background.outerGlowHint')} value={cfg.outerGlow ?? 0} min={0} max={1} step={0.05}
          onChange={(v) => setCfg({ outerGlow: v })} fmt={(v) => (v === 0 ? t('common.off') : Math.round(v * 100) + '%')} />
        {cfg.outerGlow > 0 && (
          <label className="row"><span className="row__label">{t('ui.look.background.glowColor')}</span>
            <input type="color" value={cfg.outerGlowColor || '#7fb0ff'} onChange={(e) => setCfg({ outerGlowColor: e.target.value })} />
            <span className="row__val">{cfg.outerGlowColor}</span></label>
        )}
        <button className="btn" onClick={() => setCfg({ ...BG_DEFAULTS })}>{t('ui.look.background.reset')}</button>
      </Section>

      </Section>
      {/* ---------- 進度條 ---------- */}
      <Section title={`🎚 ${t('ui.look.progress.title')}`} {...sectionProps('progress')}>
      <div className="group">🌈 {t('ui.look.progress.group')}</div>
      <Toggle label={t('ui.look.progress.showTime')} hint={t('ui.look.progress.showTimeHint')}
        checked={cfg.showTime} onChange={(v) => setCfg({ showTime: v })} />
      <Toggle label={t('ui.look.progress.rgb')} hint={t('ui.look.progress.rgbHint')}
        checked={cfg.rgbBar} onChange={(v) => setCfg({ rgbBar: v })} />
      {!cfg.rgbBar && (
        <label className="row"><span className="row__label">{t('ui.look.progress.fillColor')}</span>
          <input type="color" value={cfg.barFillColor || '#ffffff'} onChange={(e) => setCfg({ barFillColor: e.target.value })} />
          <span className="row__val">{cfg.barFillColor || '#ffffff'}</span></label>
      )}
      <Toggle label={t('ui.look.progress.beat')} hint={t('ui.look.progress.beatHint')}
        checked={cfg.barBeat} onChange={(v) => setCfg({ barBeat: v })} />
      <label className="row"><span className="row__label">{t('ui.look.progress.mode')}</span>
        <select value={cfg.progressAnim || 'flow'} onChange={(e) => setCfg({ progressAnim: e.target.value })}>
          <option value="none">{t('ui.look.progress.modeNone')}</option>
          <option value="flow">{t('ui.look.progress.modeFlow')}</option>
          <option value="breathe">{t('ui.look.progress.modeBreathe')}</option>
          <option value="pulse">{t('ui.look.progress.modePulse')}</option>
          <option value="bounce">{t('ui.look.progress.modeBounce')}</option>
          <option value="segments">{t('ui.look.progress.modeSegments')}</option>
          <option value="spectrum">{t('ui.look.progress.modeSpectrum')}</option>
        </select><span className="row__val" /></label>
      {progressControls.speed && (
        <Slider label={t('ui.look.progress.speed')} hint={t('ui.look.progress.speedHint')} value={cfg.progressSpeed ?? 1} min={0.2} max={4} step={0.1}
          onChange={(v) => setCfg({ progressSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
      )}
      {progressControls.strength && (
        <Slider label={t('ui.look.progress.strength')} hint={t('ui.look.progress.strengthHint')} value={cfg.progressStrength ?? 0.55} min={0.1} max={1} step={0.05}
          onChange={(v) => setCfg({ progressStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      )}
      {progressControls.smoothness && (
        <Slider label={t('ui.look.progress.smoothness')} hint={t('ui.look.progress.smoothnessHint')} value={cfg.progressSmoothness ?? 0.7} min={0.1} max={1} step={0.05}
          onChange={(v) => setCfg({ progressSmoothness: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      )}
      {progressControls.bounce && (
        <Slider label={t('ui.look.progress.bounceHeight')} hint={t('ui.look.progress.bounceHeightHint')} value={cfg.progressBounceHeight ?? 4} min={1} max={12} step={1}
          onChange={(v) => setCfg({ progressBounceHeight: v })} fmt={(v) => v + 'px'} />
      )}
      <Slider label={t('ui.look.progress.fillAlpha')} hint={t('ui.look.progress.fillAlphaHint')} value={cfg.barFillAlpha ?? 1} min={0.1} max={1} step={0.05}
        onChange={(v) => setCfg({ barFillAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label={t('ui.look.progress.trackAlpha')} hint={t('ui.look.progress.trackAlphaHint')} value={cfg.barTrackAlpha ?? 0.28} min={0} max={1} step={0.05}
        onChange={(v) => setCfg({ barTrackAlpha: v })} fmt={(v) => (v === 0 ? t('common.off') : Math.round(v * 100) + '%')} />
      <Slider label={t('ui.look.progress.height')} hint={t('ui.look.progress.heightHint')} value={cfg.barHeight ?? 5} min={2} max={16} step={1}
        onChange={(v) => setCfg({ barHeight: v })} fmt={(v) => v + 'px'} />
      <Toggle label={t('ui.look.progress.round')} checked={cfg.barRound !== false}
        onChange={(v) => setCfg({ barRound: v })} />
      {cfg.progressAnim === 'segments'
        ? <div className="tip">{t('ui.look.progress.segmentsTip')}</div>
        : <Toggle label={t('ui.look.progress.segments')} hint={t('ui.look.progress.segmentsHint')}
            checked={cfg.segmentedBar} onChange={(v) => setCfg({ segmentedBar: v })} />}
      {(cfg.segmentedBar || cfg.progressAnim === 'segments') && <>
        <Slider label={t('ui.look.progress.segmentCount')} value={cfg.segmentCount ?? 12} min={4} max={40} step={1}
          onChange={(v) => setCfg({ segmentCount: v })} />
        <Slider label={t('ui.look.progress.segmentGap')} value={cfg.segmentGap ?? 3} min={1} max={10} step={1}
          onChange={(v) => setCfg({ segmentGap: v })} fmt={(v) => v + 'px'} />
        <Slider label={t('ui.look.progress.segmentRadius')} value={cfg.segmentRadius ?? 3} min={0} max={8} step={1}
          onChange={(v) => setCfg({ segmentRadius: v })} fmt={(v) => v + 'px'} />
      </>}
      <Toggle label={t('ui.look.progress.glow')} checked={cfg.barGlow}
        onChange={(v) => setCfg({ barGlow: v })} />
      {cfg.barGlow && <>
        <Slider label={t('ui.look.progress.glowStrength')} value={cfg.progressGlowStrength ?? 0.65} min={0.1} max={1} step={0.05}
          onChange={(v) => setCfg({ progressGlowStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <Slider label={t('ui.look.progress.glowRange')} value={cfg.progressGlowRange ?? 12} min={2} max={30} step={1}
          onChange={(v) => setCfg({ progressGlowRange: v })} fmt={(v) => v + 'px'} />
      </>}

      {cfg.rgbBar && (
        <>
          <label className="row"><span className="row__label">{t('ui.look.progress.rgbMode')}</span>
            <select value={cfg.rgbMode || 'rainbow'} onChange={(e) => setCfg({ rgbMode: e.target.value })}>
              <option value="rainbow">{t('ui.look.progress.rgbRainbow')}</option>
              <option value="breath">{t('ui.look.progress.rgbBreath')}</option>
              <option value="neon">{t('ui.look.progress.rgbNeon')}</option>
              <option value="cover">{t('ui.look.progress.rgbCover')}</option>
            </select><span className="row__val" /></label>
          {(cfg.rgbMode === 'neon' || cfg.rgbMode === 'breath') && (
            <label className="row"><span className="row__label">{t('ui.look.progress.rgbColor')}</span>
              <input type="color" value={cfg.neonColor || '#4f8cff'} onChange={(e) => setCfg({ neonColor: e.target.value })} />
              <span className="row__val">{cfg.neonColor}</span></label>
          )}
          <Slider label={t('ui.look.progress.rgbSpeed')} value={cfg.rgbSpeed ?? 1} min={0.2} max={4} step={0.1}
            onChange={(v) => setCfg({ rgbSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
          <Slider label={t('ui.look.progress.rgbSaturation')} value={cfg.rgbSat ?? 1} min={0} max={2} step={0.05}
            onChange={(v) => setCfg({ rgbSat: v })} fmt={(v) => v.toFixed(2) + '×'} />
          <Slider label={t('ui.look.progress.rgbBrightness')} value={cfg.rgbBright ?? 1} min={0.4} max={2} step={0.05}
            onChange={(v) => setCfg({ rgbBright: v })} fmt={(v) => v.toFixed(2) + '×'} />
        </>
      )}

      </Section>

      <Section title={`✨ ${t('ui.look.effects.title')}`} {...sectionProps('effects')}>
        <div className="group">{t('ui.look.effects.basic')}</div>
        <label className="row"><span className="row__label">{t('ui.look.effects.mode')}</span>
          <select value={cfg.decorationMode || 'none'} onChange={(e) => setCfg({ decorationMode: e.target.value })}>
            <option value="none">{t('ui.look.effects.modeNone')}</option>
            <option value="meteor">{t('ui.look.effects.modeMeteor')}</option>
            <option value="sakura">{t('ui.look.effects.modeSakura')}</option>
            <option value="snow">{t('ui.look.effects.modeSnow')}</option>
          </select><span className="row__val" /></label>
        {decorationControls.count && <>
          <Slider label={t('ui.look.effects.count')} value={cfg.decorationCount ?? 18} min={0} max={80} step={1}
            onChange={(v) => setCfg({ decorationCount: v })} />
          <Slider label={t('ui.look.effects.speed')} value={cfg.decorationSpeed ?? 1} min={0.2} max={3} step={0.1}
            onChange={(v) => setCfg({ decorationSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
          <Slider label={t('ui.look.effects.strength')} value={cfg.decorationStrength ?? 0.6} min={0} max={1} step={0.05}
            onChange={(v) => setCfg({ decorationStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
          <label className="row"><span className="row__label">{t('ui.look.effects.color')}</span>
            <input type="color"
              value={cfg.decorationMode === 'sakura' ? (cfg.decorationColor2 || '#ffb7d5') : (cfg.decorationColor || '#ffffff')}
              onChange={(e) => setCfg(cfg.decorationMode === 'sakura'
                ? { decorationColor2: e.target.value }
                : { decorationColor: e.target.value })} />
            <span className="row__val" /></label>

          <Section title={t('ui.look.effects.advanced')}>
            {decorationControls.spawnRate && <>
              <Slider label={t('ui.look.effects.spawnRate')} value={cfg.meteorSpawnRate ?? 1} min={0.2} max={3} step={0.1}
                onChange={(v) => setCfg({ meteorSpawnRate: v })} fmt={(v) => v.toFixed(1) + '×'} />
              <Slider label={t('ui.look.effects.speedVariance')} value={cfg.meteorSpeedVariance ?? 0.25} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorSpeedVariance: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label={t('ui.look.effects.meteorLength')} value={cfg.meteorLength ?? 34} min={8} max={80} step={1}
                onChange={(v) => setCfg({ meteorLength: v })} fmt={(v) => v + 'px'} />
              <Slider label={t('ui.look.effects.meteorWidth')} value={cfg.meteorWidth ?? 1.6} min={0.5} max={5} step={0.1}
                onChange={(v) => setCfg({ meteorWidth: v })} fmt={(v) => v.toFixed(1) + 'px'} />
              <Slider label={t('ui.look.effects.trailLength')} value={cfg.meteorTrailLength ?? 0.75} min={0.1} max={2} step={0.05}
                onChange={(v) => setCfg({ meteorTrailLength: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label={t('ui.look.effects.trailAlpha')} value={cfg.meteorTrailAlpha ?? 0.55} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorTrailAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label={t('ui.look.effects.alpha')} value={cfg.meteorAlpha ?? 0.85} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <label className="row"><span className="row__label">{t('ui.look.effects.direction')}</span>
                <select value={cfg.meteorDirection || 'down-right'} onChange={(e) => setCfg({ meteorDirection: e.target.value })}>
                  <option value="down-right">{t('ui.look.effects.directionDownRight')}</option>
                  <option value="down-left">{t('ui.look.effects.directionDownLeft')}</option>
                  <option value="up-right">{t('ui.look.effects.directionUpRight')}</option>
                  <option value="up-left">{t('ui.look.effects.directionUpLeft')}</option>
                  <option value="right">{t('ui.look.effects.directionRight')}</option>
                  <option value="left">{t('ui.look.effects.directionLeft')}</option>
                </select><span className="row__val" /></label>
              <label className="row"><span className="row__label">{t('ui.look.effects.colorMode')}</span>
                <select value={cfg.meteorColorMode || 'fixed'} onChange={(e) => setCfg({ meteorColorMode: e.target.value })}>
                  <option value="fixed">{t('ui.look.effects.colorFixed')}</option>
                  <option value="accent">{t('ui.look.effects.colorAccent')}</option>
                </select><span className="row__val" /></label>
              {cfg.meteorColorMode === 'accent' && (
                <label className="row"><span className="row__label">{t('ui.look.effects.coreColor')}</span>
                  <input type="color" value={cfg.decorationColor2 || '#ffb7d5'}
                    onChange={(e) => setCfg({ decorationColor2: e.target.value })} />
                  <span className="row__val" /></label>
              )}
              <Slider label={t('ui.look.effects.glowStrength')} value={cfg.meteorGlowStrength ?? 0.55} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorGlowStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label={t('ui.look.effects.glowRange')} value={cfg.meteorGlowRange ?? 8} min={0} max={24} step={1}
                onChange={(v) => setCfg({ meteorGlowRange: v })} fmt={(v) => v + 'px'} />
              <Slider label={t('ui.look.effects.coreBrightness')} value={cfg.meteorCoreBrightness ?? 1.2} min={0.5} max={2} step={0.05}
                onChange={(v) => setCfg({ meteorCoreBrightness: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label={t('ui.look.effects.edgeSoftness')} value={cfg.meteorEdgeSoftness ?? 0.5} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorEdgeSoftness: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Toggle label={t('ui.look.effects.burst')} checked={cfg.meteorBurstOnLine !== false}
                onChange={(v) => setCfg({ meteorBurstOnLine: v })} />
            </>}

            {decorationControls.sway && <>
              <Slider label={t('ui.look.effects.sakuraSize')} value={cfg.sakuraSize ?? 8} min={2} max={20} step={1}
                onChange={(v) => setCfg({ sakuraSize: v })} fmt={(v) => v + 'px'} />
              <Slider label={t('ui.look.effects.sakuraSway')} value={cfg.sakuraSway ?? 0.7} min={0} max={2} step={0.05}
                onChange={(v) => setCfg({ sakuraSway: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label={t('ui.look.effects.sakuraRotation')} value={cfg.sakuraRotation ?? 1} min={0} max={3} step={0.1}
                onChange={(v) => setCfg({ sakuraRotation: v })} fmt={(v) => v.toFixed(1) + '×'} />
              <Slider label={t('ui.look.effects.sakuraDepth')} value={cfg.sakuraDepth ?? 0.55} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ sakuraDepth: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label={t('ui.look.effects.wind')} value={cfg.sakuraWind ?? 0.15} min={-1} max={1} step={0.05}
                onChange={(v) => setCfg({ sakuraWind: v })} fmt={(v) => v.toFixed(2)} />
              <Slider label={t('ui.look.effects.opacity')} value={cfg.sakuraAlpha ?? 0.8} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ sakuraAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
            </>}

            {decorationControls.drift && <>
              <Slider label={t('ui.look.effects.snowSize')} value={cfg.snowSize ?? 5} min={1} max={16} step={1}
                onChange={(v) => setCfg({ snowSize: v })} fmt={(v) => v + 'px'} />
              <Slider label={t('ui.look.effects.wind')} value={cfg.snowWind ?? 0} min={-1} max={1} step={0.05}
                onChange={(v) => setCfg({ snowWind: v })} fmt={(v) => v.toFixed(2)} />
              <Slider label={t('ui.look.effects.snowDrift')} value={cfg.snowDrift ?? 0.5} min={0} max={2} step={0.05}
                onChange={(v) => setCfg({ snowDrift: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label={t('ui.look.effects.snowSoftness')} value={cfg.snowSoftness ?? 0.45} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ snowSoftness: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label={t('ui.look.effects.snowCrystalRatio')} value={cfg.snowCrystalRatio ?? 0.18} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ snowCrystalRatio: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label={t('ui.look.effects.opacity')} value={cfg.snowAlpha ?? 0.8} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ snowAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label={t('ui.look.effects.brightness')} value={cfg.snowBrightness ?? 1} min={0.5} max={2} step={0.05}
                onChange={(v) => setCfg({ snowBrightness: v })} fmt={(v) => v.toFixed(2) + '×'} />
            </>}
          </Section>
        </>}
        <button className="btn" onClick={() => setCfg(resetDecorationConfig())}>↺ {t('ui.look.effects.reset')}</button>
      </Section>

      <Section title={`✨ ${t('ui.look.animation.title')}`} {...sectionProps('lyricAnimation')}>
      <div className="group">✨ {t('ui.look.animation.pillGroup')}</div>
      <Toggle label={t('ui.look.animation.lineBreathe')} hint={t('ui.look.animation.lineBreatheHint')}
        checked={cfg.fxBreathe} onChange={(v) => setCfg({ fxBreathe: v })} />
      <Toggle label={t('ui.look.animation.karaokeGlow')} hint={t('ui.look.animation.karaokeGlowHint')}
        checked={cfg.fxKaraokeGlow} onChange={(v) => setCfg({ fxKaraokeGlow: v })} />
      <Toggle label={t('ui.look.animation.vinylBounce')} hint={t('ui.look.animation.vinylBounceHint')}
        checked={cfg.fxVinylBounce} onChange={(v) => setCfg({ fxVinylBounce: v })} />
      <Toggle label={t('ui.look.animation.pauseBreath')} hint={t('ui.look.animation.pauseBreathHint')}
        checked={cfg.fxPauseBreath} onChange={(v) => setCfg({ fxPauseBreath: v })} />
      <Toggle label={t('ui.look.animation.tilt')} hint={t('ui.look.animation.tiltHint')}
        checked={cfg.fxTilt} onChange={(v) => setCfg({ fxTilt: v })} />
      <Slider label={t('ui.look.animation.elasticity')} value={glass.elasticity} min={0} max={1} step={0.05}
        onChange={(v) => setGlass({ elasticity: v })} fmt={(v) => v.toFixed(2)} />
      <Slider label={t('ui.look.animation.hoverDistance')} value={cfg.hoverActivationDistance ?? 14} min={0} max={80} step={1}
        onChange={(v) => setCfg({ hoverActivationDistance: v })} fmt={(v) => `${v}px`} />
      <label className="row"><span className="row__label">{t('ui.look.animation.lineTransition')}</span>
        <select value={cfg.fxLineAnim || 'fade'} onChange={(e) => setCfg({ fxLineAnim: e.target.value })}>
          <option value="none">{t('ui.look.animation.none')}</option>
          <option value="fade">{t('ui.look.animation.fade')}</option>
          <option value="up">{t('ui.look.animation.slideFade')}</option>
          <option value="zoom">{t('ui.look.animation.zoomFade')}</option>
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('ui.look.animation.glowColor')}</span>
        <input type="color" value={cfg.glowColor || '#8ec8ff'} onChange={(e) => setCfg({ glowColor: e.target.value })} />
        <span className="row__val">{cfg.glowColor}</span></label>
      <Slider label={t('ui.look.animation.vinylRpm')} value={cfg.vinylRpm ?? 4.5} min={1.5} max={12} step={0.5}
        onChange={(v) => setCfg({ vinylRpm: v })} fmt={(v) => v.toFixed(1) + t('ui.look.value.perRevolution')} />

      <div className="group">{t('ui.look.animation.songTransitionGroup')}</div>
      <label className="row"><span className="row__label">{t('ui.look.animation.transitionMode')}</span>
        <select value={cfg.songTransitionMode || 'collapse'} onChange={(e) => setCfg({ songTransitionMode: e.target.value })}>
          <option value="none">{t('ui.look.animation.none')}</option>
          <option value="collapse">{t('ui.look.animation.collapse')}</option>
          <option value="shatter">{t('ui.look.animation.shatter')}</option>
        </select><span className="row__val" /></label>
      {cfg.songTransitionMode !== 'none' && (
        <Slider label={t('ui.look.animation.transitionSpeed')} value={cfg.transitionSpeed ?? 1} min={0.5} max={2} step={0.1}
          onChange={(v) => setCfg({ transitionSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
      )}

      <div className="group">{t('ui.look.animation.sheenGroup')}</div>
      <label className="row"><span className="row__label">{t('ui.look.animation.sheenMode')}</span>
        <select value={cfg.sheenMode || 'none'} onChange={(e) => setCfg({ sheenMode: e.target.value })}>
          <option value="none">{t('ui.look.animation.none')}</option>
          <option value="oval">{t('ui.look.animation.sheenOval')}</option>
          <option value="droplet">{t('ui.look.animation.sheenDroplet')}</option>
          <option value="arc">{t('ui.look.animation.sheenArc')}</option>
        </select><span className="row__val" /></label>
      {cfg.sheenMode !== 'none' && <>
        <Slider label={t('ui.look.animation.sheenWidth')} value={cfg.sheenWidth ?? 34} min={8} max={80} step={1}
          onChange={(v) => setCfg({ sheenWidth: v })} fmt={(v) => v + '%'} />
        <Slider label={t('ui.look.animation.sheenHeight')} value={cfg.sheenHeight ?? 140} min={40} max={220} step={5}
          onChange={(v) => setCfg({ sheenHeight: v })} fmt={(v) => v + '%'} />
        <Slider label={t('ui.look.animation.sheenDuration')} value={cfg.sheenDuration ?? 1.2} min={0.4} max={4} step={0.1}
          onChange={(v) => setCfg({ sheenDuration: v })} fmt={(v) => v.toFixed(1) + t('ui.look.value.seconds')} />
        <Slider label={t('ui.look.animation.sheenInterval')} value={cfg.sheenInterval ?? 6} min={0.5} max={20} step={0.5}
          onChange={(v) => setCfg({ sheenInterval: v })} fmt={(v) => v.toFixed(1) + t('ui.look.value.seconds')} />
        <Slider label={t('ui.look.animation.sheenBrightness')} value={cfg.sheenBrightness ?? 1.5} min={0.5} max={3} step={0.1}
          onChange={(v) => setCfg({ sheenBrightness: v })} fmt={(v) => v.toFixed(1) + '×'} />
        <Slider label={t('ui.look.animation.sheenBlur')} value={cfg.sheenBlur ?? 16} min={0} max={40} step={1}
          onChange={(v) => setCfg({ sheenBlur: v })} fmt={(v) => v + 'px'} />
        <Slider label={t('ui.look.animation.sheenOpacity')} value={cfg.sheenOpacity ?? 0.45} min={0.05} max={1} step={0.05}
          onChange={(v) => setCfg({ sheenOpacity: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <label className="row"><span className="row__label">{t('ui.look.animation.direction')}</span>
          <select value={cfg.sheenDirection || 'ltr'} onChange={(e) => setCfg({ sheenDirection: e.target.value })}>
            <option value="ltr">{t('ui.look.animation.ltr')}</option>
            <option value="rtl">{t('ui.look.animation.rtl')}</option>
          </select><span className="row__val" /></label>
      </>}

      </Section>

      {/* ---------- 視窗行為 ---------- */}
      <Section title={`🖥 ${t('ui.look.window.title')}`} {...sectionProps('window')}>
      <div className="group">🪟 {t('ui.look.window.group')}</div>
      <Toggle label={t('ui.look.window.alwaysOnTop')} checked={cfg.alwaysOnTop} onChange={(v) => setCfg({ alwaysOnTop: v })} />
      <Toggle label={t('ui.look.window.clickThrough')} hint={t('ui.look.window.clickThroughHint')}
        checked={cfg.clickThrough} onChange={(v) => setCfg({ clickThrough: v })} />
      {cfg.clickThrough && <div className="tip">{t('ui.look.window.clickThroughTip')}</div>}
      <div className="tip">{t('ui.look.window.lockTip')}</div>
      <label className="row"><span className="row__label">{t('ui.look.window.safeMargin')}</span>
        <select value={String(cfg.safeMargin ?? 12)} onChange={(e) => setCfg({ safeMargin: Number(e.target.value) })}>
          {[0, 4, 8, 12, 16, 24].map((v) => <option key={v} value={v}>{v}px</option>)}
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">{t('ui.look.window.snap')}</span>
        <select value={cfg.snapMode || 'normal'} onChange={(e) => setCfg({ snapMode: e.target.value })}>
          <option value="off">{t('ui.look.window.snapOff')}</option>
          <option value="light">{t('ui.look.window.snapLight')}</option>
          <option value="normal">{t('ui.look.window.snapNormal')}</option>
          <option value="strong">{t('ui.look.window.snapStrong')}</option>
        </select><span className="row__val" /></label>
      <div className="tip">{t('ui.look.window.boundaryTip')}</div>

      </Section>

      <button className="btn danger" onClick={() => ov.quit()}>✕ {t('ui.look.window.quit')}</button>
    </div>
    </HintContext.Provider>
  )
}
