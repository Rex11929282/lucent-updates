import { useEffect, useRef, useState } from 'react'
import LiquidGlass from 'liquid-glass-react'
import { ov } from './overlayBridge.js'
import { useSharedState } from './useSharedState.js'
import { useRoom } from './useRoom.js'
import { GLASS_DEFAULTS } from './defaults.js'
import DecorationCanvas from './components/DecorationCanvas.jsx'
import {
  createAppearanceProfile,
  decorationControlsForMode,
  mergeLookSections,
  progressControlsForMode,
  resetDecorationConfig,
  upsertAppearanceProfile,
} from './appearanceModel.js'
import { VINYL_FRAMES } from './frameAssets.js'

const PORT = 8787

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label className="row">
      <span className="row__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="row__val">{fmt ? fmt(value) : value}</span>
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
  shadowOut: 0.35, shadowOutBlur: 26, shadowIn: 0.25, outerGlow: 0, outerGlowColor: '#7fb0ff',
}

// 外觀快速預設（只含視覺設定，不動同步/視窗行為）
const LOOK_LABELS = { soft: '柔和', dreamy: '夢幻', esports: '電競', cyber: '賽博', minimal: '極簡' }
const LOOK_PRESETS = {
  soft:    { ...BG_PRESETS.light, bgPreset: 'light', tintColor: '#a8c0ff', rgbBar: false, barBeat: true,
             fxTilt: true, outline: 1, textClarity: 0.6, cornerPreset: 'pill', fontWeight: 700 },
  dreamy:  { ...BG_PRESETS.gradient, bgPreset: 'gradient', bgGradC1: '#8fd3ff', bgGradC2: '#e59bff',
             rgbBar: true, rgbMode: 'cover', barBeat: true, outline: 1.2, cornerPreset: 'pill', fontWeight: 800 },
  esports: { ...BG_PRESETS.dark, bgPreset: 'dark', rgbBar: true, rgbMode: 'rainbow', rgbSpeed: 2, rgbSat: 1.6,
             barBeat: true, outline: 1.6, textClarity: 0.9,
             cornerPreset: 'medium', fontWeight: 900, barHeight: 7 },
  cyber:   { ...BG_PRESETS.neon, bgPreset: 'neon', rgbBar: true, rgbMode: 'neon', neonColor: '#5cf0ff',
             glowColor: '#5cf0ff', barGlow: true, outline: 1.4, cornerPreset: 'small', fontWeight: 800, barHeight: 6 },
  minimal: { ...BG_PRESETS.clear, bgPreset: 'clear', rgbBar: false, barBeat: false,
             fxBreathe: false, fxVinylBounce: false, showVinyl: false,
             outline: 1.8, textClarity: 0.95, cornerPreset: 'pill', fontWeight: 700, barHeight: 3 },
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

export default function ConsoleWindow() {
  const [tab, setTab] = useState('room')
  const { state, setGlass, setCfg, setLyricsRaw, setProfiles, setUi, setUpdates } = useSharedState()
  const { status, members, state: roomState, queue, capabilities, commandResult } = useRoom()

  return (
    <div className="cw">
      <div className="cw__scene" />
      <div className="cw__panel">
        <div className="cw__head">
          <b>璃音 Lucent · 控制台</b>
          <button className="tbtn close" onClick={() => ov.closeConsole()}>✕</button>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === 'room' ? 'on' : ''}`} onClick={() => setTab('room')}>房間</button>
          <button className={`tab ${tab === 'play' ? 'on' : ''}`} onClick={() => setTab('play')}>播放</button>
          <button className={`tab ${tab === 'look' ? 'on' : ''}`} onClick={() => setTab('look')}>外觀</button>
          <button className={`tab ${tab === 'update' ? 'on' : ''}`} onClick={() => setTab('update')}>更新</button>
        </div>
        <div className="cw__body">
          {tab === 'room' && <RoomTab status={status} members={members} queue={queue} capabilities={capabilities} commandResult={commandResult} />}
          {tab === 'play' && <PlayTab roomState={roomState} status={status} commandResult={commandResult} />}
          {tab === 'look' && <LookTab state={state} setGlass={setGlass} setCfg={setCfg} setLyricsRaw={setLyricsRaw} setProfiles={setProfiles} setUi={setUi} cover={roomState?.song?.cover} />}
          {tab === 'update' && <UpdateTab settings={state.updates} setUpdates={setUpdates} />}
        </div>
      </div>
    </div>
  )
}

// ================= 應用程式更新 =================
function UpdateTab({ settings, setUpdates }) {
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
    if (!result?.ok) setMessage(result?.error || '更新操作失敗')
    const current = await ov.updates.snapshot()
    if (current) setSnapshot(current)
  }
  const statusText = {
    idle: '等待檢查', checking: '正在檢查更新…', current: '目前已是最新版本',
    available: '發現可用更新', downloading: '正在下載更新…', ready: '更新已下載，等待安裝',
    error: '更新失敗', disabled: '自動更新未啟用', manual: '僅支援手動更新',
  }[snapshot.status] || snapshot.status

  return (
    <div>
      <div className="group">版本與更新</div>
      <div className="kv"><span>目前版本</span><b>{snapshot.currentVersion || '—'}</b></div>
      <div className="kv"><span>更新狀態</span><b>{statusText}</b></div>
      {snapshot.availableVersion && <div className="kv"><span>可用版本</span><b>{snapshot.availableVersion}</b></div>}
      {snapshot.reason && <div className="hint">{snapshot.reason}</div>}
      {snapshot.error && <div className="err">{snapshot.error}</div>}

      <div className="group">更新偏好</div>
      <Toggle label="自動檢查更新" hint="啟動 30 秒後檢查，之後每四小時檢查一次"
        checked={settings?.autoCheck !== false} onChange={(value) => setUpdates({ autoCheck: value })} />
      <label className="row"><span className="row__label">更新頻道</span>
        <select value={settings?.channel === 'beta' ? 'beta' : 'stable'} onChange={(event) => setUpdates({ channel: event.target.value })}>
          <option value="stable">穩定版</option><option value="beta">測試版</option>
        </select><span className="row__val" /></label>

      {snapshot.progress && (
        <div className="update-progress">
          <div style={{ width: `${snapshot.progress.percent}%` }} />
          <span>{snapshot.progress.percent.toFixed(1)}%</span>
        </div>
      )}
      <div className="actions">
        <button className="btn" disabled={snapshot.mode !== 'automatic' || snapshot.status === 'checking'}
          onClick={() => run(ov.updates.check)}>檢查更新</button>
        {snapshot.status === 'ready' && <button className="btn" onClick={() => run(ov.updates.install)}>安裝並重新啟動</button>}
      </div>
      {snapshot.releaseNotes && <div className="update-notes"><b>{snapshot.releaseName || '更新說明'}</b><p>{snapshot.releaseNotes}</p></div>}
      {snapshot.deferred && <div className="hint">目前正在播放或主持房間；更新保留到你主動停止後再安裝，不會強制中斷。</div>}
      {message && <div className="err">{message}</div>}
      <div className="hint">安裝版會背景自動下載更新，並在未播放、未主持房間的安全時機自動安裝。</div>
    </div>
  )
}

// ================= 房間 =================
function RoomTab({ status, members, queue, capabilities, commandResult }) {
  const [roomName, setRoomName] = useState('我的房間')
  const [code, setCode] = useState('')
  const [hostName, setHostName] = useState('主持人')
  const [ip, setIp] = useState('')
  const [joinName, setJoinName] = useState('聽眾')
  const [myIp, setMyIp] = useState('')
  const [busy, setBusy] = useState(false)
  const [styleTarget, setStyleTarget] = useState('all')
  const [styleName, setStyleName] = useState('我的外觀')
  const [styleOffers, setStyleOffers] = useState([])
  const [styleNotice, setStyleNotice] = useState('')
  const [queueNotice, setQueueNotice] = useState('')

  useEffect(() => { ov.room.lanIp().then(setMyIp) }, [])
  useEffect(() => {
    let mounted = true
    ov.room.pendingOffers().then((offers) => { if (mounted) setStyleOffers(offers || []) })
    const offOffer = ov.room.onStyleOffer((offer) => setStyleOffers((items) => items.some((item) => item.id === offer.id) ? items : [...items, offer]))
    const offHandled = ov.room.onStyleOfferHandled(({ requestId }) => setStyleOffers((items) => items.filter((item) => item.id !== requestId)))
    const offResponse = ov.room.onStyleResponse((response) => setStyleNotice(response.accepted ? '對方已接受並保存' : '對方已拒絕'))
    return () => { mounted = false; offOffer(); offHandled(); offResponse() }
  }, [])
  const inRoom = status.mode === 'host' || status.mode === 'member'
  const canManageQueue = status.mode === 'host' || !!capabilities?.['queue.manage']
  const canControlPlayback = status.mode === 'host' || !!capabilities?.['playback.control']

  useEffect(() => {
    if (!commandResult) return
    setQueueNotice(commandResult.ok ? '房主已接受操作' : (commandResult.error || '房主拒絕操作'))
  }, [commandResult])

  const doHost = async () => {
    setBusy(true)
    const r = await ov.room.host({ roomName, code, hostName, port: PORT })
    setBusy(false)
    if (!r?.ok) alert('開房失敗：' + (r?.error || '未知錯誤'))
  }
  const doJoin = async () => {
    if (!ip.trim()) return alert('請輸入主持人 IP')
    setBusy(true)
    const r = await ov.room.join({ ip: ip.trim(), port: PORT, code, name: joinName })
    setBusy(false)
    if (!r?.ok) alert('無法加入房間：' + (r?.error || '未知錯誤'))
  }
  const sendStyle = async () => {
    const targetId = status.mode === 'host' ? styleTarget : 'host'
    const result = await ov.room.offerStyle(targetId, styleName)
    setStyleNotice(result?.ok ? '外觀參數已送出，等待對方確認' : `傳送失敗：${result?.error || '未知錯誤'}`)
  }
  const respondStyle = async (requestId, accepted) => {
    const result = await ov.room.respondStyleOffer(requestId, accepted)
    if (!result?.ok) setStyleNotice(result?.error || '處理失敗')
  }
  const setMemberCapability = async (member, key, checked) => {
    const next = { ...(member.capabilities || {}), [key]: checked }
    const result = await ov.room.setCapabilities(member.id, next)
    if (!result?.ok) setQueueNotice(result?.error || '授權失敗')
  }
  const queueCommand = async (type, payload) => {
    const result = await ov.room.command(type, payload)
    setQueueNotice(result?.pending ? '已送交房主處理' : result?.ok ? '' : (result?.error || '操作失敗'))
  }

  if (inRoom) {
    return (
      <div>
        <div className="group">目前房間</div>
        <div className="kv"><span>身分</span><b>{status.mode === 'host' ? '主持人' : '聽眾'}</b></div>
        {status.roomName && <div className="kv"><span>房名</span><b>{status.roomName}</b></div>}
        {status.mode === 'host' && (
          <>
            <div className="kv"><span>房號</span><b>{status.code || '（無）'}</b></div>
            <div className="kv"><span>我的位址</span><b>{status.ip || myIp}:{status.port || PORT}</b></div>
            <div className="hint">請聽眾用「加入房間」輸入上面的位址與房號。</div>
          </>
        )}
        {status.error && <div className="err">⚠ {status.error}</div>}
        {status.mode === 'member' && status.reconnecting && (
          <div className="hint">正在重新連線（第 {status.attempt || 1} 次，約 {Math.ceil((status.retryInMs || 1000) / 1000)} 秒）</div>
        )}
        <div className="group">成員（{members.length}）</div>
        <ul className="members room-member-list">{members.map((m, i) => (
          <li key={m.id || i}>
            <span>{m.host ? '👑 ' : '🎧 '}{m.name}</span>
            {status.mode === 'host' && !m.host && (
              <span className="member-permissions">
                <label><input type="checkbox" checked={m.capabilities?.['song.request'] !== false}
                  onChange={(event) => setMemberCapability(m, 'song.request', event.target.checked)} /> 點歌</label>
                <label><input type="checkbox" checked={!!m.capabilities?.['queue.manage']}
                  onChange={(event) => setMemberCapability(m, 'queue.manage', event.target.checked)} /> 管理佇列</label>
                <label><input type="checkbox" checked={!!m.capabilities?.['playback.control']}
                  onChange={(event) => setMemberCapability(m, 'playback.control', event.target.checked)} /> 控制播放</label>
              </span>
            )}
          </li>
        ))}</ul>
        {status.mode === 'member' && (
          <div className="hint">
            權限：{capabilities?.['song.request'] ? '可點歌' : '不可點歌'} · {capabilities?.['queue.manage'] ? '可管理佇列' : '不可管理佇列'} · {capabilities?.['playback.control'] ? '可控制播放' : '跟隨房主'}
          </div>
        )}

        <div className="group">待播放歌曲（{queue.length}）</div>
        {queue.length ? (
          <ul className="results room-queue">{queue.map((entry, index) => (
            <li key={entry.id}>
              {entry.cover && <img src={entry.cover} alt="" />}
              <div className="meta">
                <b>{entry.status === 'playing' ? '▶ ' : ''}{entry.name}</b>
                <div className="sub">{entry.artist}{entry.requesterName ? ` · ${entry.requesterName} 點播` : ''}</div>
              </div>
              {canControlPlayback && entry.status !== 'playing' && <button className="mini-action" onClick={() => queueCommand('playback.load', { queueEntryId: entry.id })}>播放</button>}
              {canManageQueue && <>
                <button className="mini-action" disabled={index === 0} onClick={() => queueCommand('queue.move', { id: entry.id, position: index - 1 })}>↑</button>
                <button className="mini-action" disabled={index === queue.length - 1} onClick={() => queueCommand('queue.move', { id: entry.id, position: index + 1 })}>↓</button>
                <button className="mini-action danger" onClick={() => queueCommand('queue.remove', { id: entry.id })}>移除</button>
              </>}
            </li>
          ))}</ul>
        ) : <div className="hint">目前沒有待播放歌曲；成員可到「播放」分頁搜尋並點歌。</div>}
        {queueNotice && <div className={queueNotice.includes('失敗') || queueNotice.includes('拒絕') || queueNotice.includes('尚未') ? 'err' : 'ok'}>{queueNotice}</div>}
        <div className="group">外觀參數分享</div>
        <label className="row"><span className="row__label">提案名稱</span>
          <input value={styleName} maxLength={40} onChange={(e) => setStyleName(e.target.value)} />
          <span className="row__val" /></label>
        {status.mode === 'host' && (
          <label className="row"><span className="row__label">傳送對象</span>
            <select value={styleTarget} onChange={(e) => setStyleTarget(e.target.value)}>
              <option value="all">所有成員</option>
              {members.filter((member) => !member.host).map((member) => (
                <option value={member.id} key={member.id}>{member.name}</option>
              ))}
            </select><span className="row__val" /></label>
        )}
        <button className="btn" onClick={sendStyle}>
          {status.mode === 'host' ? '傳送目前外觀參數' : '傳送目前外觀給房主'}
        </button>
        {styleNotice && <div className="hint">{styleNotice}</div>}
        {styleOffers.map((offer) => (
          <div className="style-offer" key={offer.id}>
            <b>{offer.sender?.name || '對方'}：{offer.name}</b>
            <div className="sub">{new Date(offer.createdAt).toLocaleString()}</div>
            <div className="hint">接受後會立即套用，並另存成命名外觀配置；視窗位置、置頂、穿透、鎖定與同步偏移不會被修改。</div>
            <div className="actions">
              <button className="btn" onClick={() => respondStyle(offer.id, true)}>接受並保存</button>
              <button className="btn secondary" onClick={() => respondStyle(offer.id, false)}>拒絕</button>
            </div>
          </div>
        ))}
        <button className="btn danger" onClick={() => ov.room.leave()}>離開房間</button>
      </div>
    )
  }
  return (
    <div>
      <div className="group">開一個房間（你當主持人）</div>
      <label className="field"><span>房間名稱</span><input value={roomName} onChange={(e) => setRoomName(e.target.value)} /></label>
      <label className="field"><span>房號（選填，當密碼）</span><input value={code} onChange={(e) => setCode(e.target.value)} /></label>
      <label className="field"><span>你的暱稱</span><input value={hostName} onChange={(e) => setHostName(e.target.value)} /></label>
      <div className="hint">你的區網位址：<b>{myIp || '偵測中…'}</b>:{PORT}</div>
      <button className="btn" disabled={busy} onClick={doHost}>🎤 開房</button>

      <div className="group">加入別人的房間</div>
      <label className="field"><span>主持人 IP</span><input placeholder="例如 192.168.1.23" value={ip} onChange={(e) => setIp(e.target.value)} /></label>
      <label className="field"><span>房號（若有）</span><input value={code} onChange={(e) => setCode(e.target.value)} /></label>
      <label className="field"><span>你的暱稱</span><input value={joinName} onChange={(e) => setJoinName(e.target.value)} /></label>
      <button className="btn" disabled={busy} onClick={doJoin}>🔗 加入</button>
      {status.denied && <div className="err">⚠ 被拒絕：{status.reason}</div>}
      {status.error && <div className="err">⚠ {status.error}</div>}
    </div>
  )
}

// ================= 網易雲帳號（掃碼登入） =================
function AccountBox({ onProfileChange }) {
  const [profile, setProfile] = useState(null)
  const [qr, setQr] = useState(null)
  const [status, setStatus] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    ov.netease.loginStatus().then((r) => {
      if (r?.profile) setProfile(r.profile)
      onProfileChange?.(r?.profile || null)
    })
    return () => clearInterval(pollRef.current)
  }, [])

  const startLogin = async () => {
    setStatus('產生 QR 碼中…')
    const r = await ov.netease.loginQr()
    if (!r?.ok || !r.qrimg) { setStatus('無法產生 QR：' + (r?.error || '')); return }
    setQr({ key: r.key, img: r.qrimg })
    setStatus('請用手機「網易雲音樂 App」掃碼')
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const c = await ov.netease.loginCheck(r.key)
      if (!c?.ok) return
      if (c.code === 800) { setStatus('QR 已過期，請重新產生'); clearInterval(pollRef.current); setQr(null) }
      else if (c.code === 801) setStatus('等待掃碼…')
      else if (c.code === 802) setStatus('已掃碼，請在手機上點「確認」')
      else if (c.code === 803) {
        const nextProfile = c.profile || { nickname: '已登入' }
        clearInterval(pollRef.current); setQr(null); setStatus(''); setProfile(nextProfile); onProfileChange?.(nextProfile)
      }
    }, 2000)
  }
  const logout = async () => { await ov.netease.logout(); setProfile(null); setStatus(''); onProfileChange?.(null) }

  return (
    <div>
      <div className="group">網易雲帳號（主持人連自己的帳號）</div>
      {profile ? (
        <div className="account">
          {profile.avatarUrl && <img src={profile.avatarUrl} alt="" />}
          <div className="meta"><b>{profile.nickname || '已登入'}</b><div className="sub">已連接網易雲帳號</div></div>
          <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={logout}>登出</button>
        </div>
      ) : qr ? (
        <div className="qrbox">
          <img src={qr.img} alt="QR" />
          <div className="hint">{status}</div>
          <button className="btn" onClick={() => { clearInterval(pollRef.current); setQr(null); setStatus('') }}>取消</button>
        </div>
      ) : (
        <>
          <button className="btn" onClick={startLogin}>📱 掃碼登入網易雲</button>
          {status && <div className="hint">{status}</div>}
        </>
      )}
    </div>
  )
}

function PrivacyBox() {
  const [summary, setSummary] = useState({ accountStored: false, libraryStored: false, settingsStored: false })
  const [message, setMessage] = useState('')
  const refresh = async () => {
    const next = await ov.privacy.summary()
    if (next) setSummary(next)
  }
  useEffect(() => { refresh() }, [])
  const erase = async (scope, label) => {
    if (!window.confirm(`確定要${label}？此操作只影響這台電腦。`)) return
    const result = await ov.privacy.erase(scope)
    setMessage(result?.ok ? '已完成本機資料清除。' : (result?.error || '清除失敗'))
    await refresh()
  }
  return (
    <Section title="資料與隱私" defaultOpen={false}>
      <div className="hint">只移除這台電腦上的璃音資料；不會刪除網易雲帳號或雲端歌單。</div>
      <div className="privacy-flags">
        <span>本機登入：{summary.accountStored ? '已儲存' : '未儲存'}</span>
        <span>本機歌單：{summary.libraryStored ? '已儲存' : '未儲存'}</span>
        <span>璃音設定：{summary.settingsStored ? '已儲存' : '未儲存'}</span>
      </div>
      <button className="btn secondary" onClick={() => erase('account', '移除本機登入資料')}>移除本機登入資料</button>
      <button className="btn secondary" onClick={() => erase('library', '清除本機歌單與房間佇列')}>清除本機歌單與房間佇列</button>
      <button className="btn danger" onClick={() => erase('settings', '重設璃音設定')}>重設璃音設定</button>
      <div className="hint">主持房間時不能清除本機歌單。</div>
      {message && <div className={message.startsWith('已完成') ? 'ok' : 'err'}>{message}</div>}
    </Section>
  )
}

// 網易雲歌單只讀；璃音本機歌單才允許建立、排序與刪除。
function PlaylistsPanel({ profile, isMember, canPlayback, onPlay }) {
  const [cloudPlaylists, setCloudPlaylists] = useState([])
  const [localPlaylists, setLocalPlaylists] = useState([])
  const [cloudTracks, setCloudTracks] = useState([])
  const [localTracks, setLocalTracks] = useState([])
  const [selectedCloudId, setSelectedCloudId] = useState('')
  const [selectedLocalId, setSelectedLocalId] = useState('')
  const [targetLocalId, setTargetLocalId] = useState('')
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshLocal = async (preferredId = '') => {
    const response = await ov.localPlaylists.list()
    if (!response?.ok) { setMessage(response?.error || '讀取本機歌單失敗'); return [] }
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
      else setMessage(response?.error || '讀取網易雲歌單失敗')
    })
    return () => { active = false }
  }, [profile?.userId])

  const createLocal = async () => {
    const name = newName.trim()
    if (!name) return
    const response = await ov.localPlaylists.create(name)
    if (!response?.ok) { setMessage(response?.error || '建立失敗'); return }
    setNewName(''); setMessage(''); await refreshLocal(response.data.id)
  }
  const selectLocal = async (id) => {
    setSelectedLocalId(id); setTargetLocalId(id)
    const response = await ov.localPlaylists.items(id)
    setLocalTracks(response?.ok ? response.data || [] : [])
    if (!response?.ok) setMessage(response?.error || '讀取失敗')
  }
  const selectCloud = async (id) => {
    setSelectedCloudId(id); setBusy(true); setMessage('')
    const response = await ov.netease.playlistTracks(id)
    setBusy(false)
    if (response?.ok) setCloudTracks(response.data || [])
    else { setCloudTracks([]); setMessage(response?.error || '讀取網易雲歌單失敗') }
  }
  const addToLocal = async (song) => {
    if (!targetLocalId) { setMessage('請先建立或選擇一個璃音本機歌單'); return }
    const response = await ov.localPlaylists.add(targetLocalId, { provider: 'netease', trackId: song.id, ...song })
    setMessage(response?.ok ? '已加入璃音本機歌單' : (response?.error || '加入失敗'))
    await refreshLocal(targetLocalId)
  }
  const renameLocal = async () => {
    const current = localPlaylists.find((item) => item.id === selectedLocalId)
    if (!current) return
    const name = window.prompt('新的歌單名稱', current.name)
    if (name == null) return
    const response = await ov.localPlaylists.rename(current.id, name)
    setMessage(response?.ok ? '' : (response?.error || '重新命名失敗'))
    await refreshLocal(current.id)
  }
  const deleteLocal = async () => {
    const current = localPlaylists.find((item) => item.id === selectedLocalId)
    if (!current || !window.confirm(`刪除璃音本機歌單「${current.name}」？`)) return
    const response = await ov.localPlaylists.delete(current.id)
    setMessage(response?.ok ? '' : (response?.error || '刪除失敗'))
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
    <Section title="歌單" defaultOpen={false}>
      <div className="group">網易雲歌單（唯讀）</div>
      {!profile?.userId ? <div className="hint">登入後可讀取帳號中的網易雲歌單。</div> : (
        <select className="playlist-select" value={selectedCloudId} disabled={busy}
          onChange={(event) => selectCloud(event.target.value)}>
          <option value="">選擇網易雲歌單</option>
          {cloudPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}（{playlist.trackCount}）</option>)}
        </select>
      )}
      {cloudTracks.length > 0 && (
        <>
          <div className="playlist-target">
            <span>加入到</span>
            <select value={targetLocalId} onChange={(event) => setTargetLocalId(event.target.value)}>
              <option value="">選擇璃音本機歌單</option>
              {localPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
            </select>
          </div>
          <ul className="results playlist-results">{cloudTracks.map((song) => (
            <li key={song.id}>
              {song.cover && <img src={song.cover} alt="" />}
              <div className="meta"><b>{song.name}</b><div className="sub">{song.artist}</div></div>
              <button className="mini-action" onClick={() => onPlay(song)}>{isMember && !canPlayback ? '點歌' : '播放'}</button>
              <button className="mini-action" onClick={() => addToLocal(song)}>收藏</button>
            </li>
          ))}</ul>
        </>
      )}

      <div className="group">璃音本機歌單</div>
      <div className="searchbar">
        <input value={newName} placeholder="新歌單名稱" onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') createLocal() }} />
        <button className="btn" disabled={!newName.trim()} onClick={createLocal}>建立</button>
      </div>
      {localPlaylists.length > 0 && (
        <div className="playlist-toolbar">
          <select className="playlist-select" value={selectedLocalId} onChange={(event) => selectLocal(event.target.value)}>
            {localPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}（{playlist.itemCount}）</option>)}
          </select>
          <button className="mini-action" onClick={renameLocal}>改名</button>
          <button className="mini-action danger" onClick={deleteLocal}>刪除</button>
        </div>
      )}
      {localTracks.length > 0 ? (
        <ul className="results playlist-results">{localTracks.map((track, index) => (
          <li key={track.id}>
            {track.cover && <img src={track.cover} alt="" />}
            <div className="meta"><b>{track.name}</b><div className="sub">{track.artist}</div></div>
            <button className="mini-action" onClick={() => onPlay(track)}>{isMember && !canPlayback ? '點歌' : '播放'}</button>
            <button className="mini-action" disabled={index === 0} onClick={() => moveLocal(track, index - 1)}>↑</button>
            <button className="mini-action" disabled={index === localTracks.length - 1} onClick={() => moveLocal(track, index + 1)}>↓</button>
            <button className="mini-action danger" onClick={() => removeLocal(track.id)}>移除</button>
          </li>
        ))}</ul>
      ) : selectedLocalId ? <div className="hint">這個歌單目前沒有歌曲。</div> : null}
      {message && <div className={message.startsWith('已加入') ? 'ok' : 'err'}>{message}</div>}
    </Section>
  )
}

// ================= 播放（自動偵測網易雲） =================
function PlayTab({ roomState, status, commandResult }) {
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
  const displayedPlayer = isMember && roomState?.song ? {
    ...player,
    song: roomState.song,
    playing: !!roomState.playing,
    positionMs: Number(roomState.positionMs) || 0,
    durationMs: Number(roomState.durationMs || roomState.song.durationMs) || 0,
    loading: false,
  } : player
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
    setPlayerMessage(commandResult.ok ? '房主已接受操作' : (commandResult.error || '房主拒絕操作'))
  }, [commandResult])

  const searchInternal = async () => {
    const keyword = query.trim()
    if (!keyword) return
    setBusy(true)
    setPlayerMessage('')
    const response = await ov.netease.search(keyword)
    setBusy(false)
    if (response?.ok) setResults(response.data || [])
    else setPlayerMessage(response?.error || '搜尋失敗')
  }

  const runPlayer = async (action, roomType, payload = {}) => {
    const response = isMember ? await ov.room.command(roomType, payload) : await action()
    setPlayerMessage(response?.ok ? '' : (response?.error || '操作失敗'))
    if (response?.ok) {
      const snapshot = await ov.player.snapshot()
      if (snapshot) setPlayer(snapshot)
    }
  }

  const playResult = async (song) => {
    const trackId = song.trackId || song.id
    if (isMember && !canPlayback) {
      const response = await ov.room.command('song.request', { provider: 'netease', trackId })
      setPlayerMessage(response?.ok ? '點歌已送交房主' : (response?.error || '點歌失敗'))
      return
    }
    setPlayerMessage(isMember ? '已送出播放命令…' : '正在準備歌曲、歌詞與封面…')
    const response = isMember
      ? await ov.room.command('playback.load', { trackId })
      : await ov.player.load(trackId)
    setPlayerMessage(response?.ok ? (response.pending ? '已送交房主處理' : '') : (response?.error || '歌曲目前無法播放'))
  }

  const formatTime = (milliseconds) => {
    const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }

  const enablePrecise = async () => {
    if (!window.confirm('這會關閉並重新開啟網易雲，正在播放的歌曲會中斷。要繼續嗎？')) return
    setBusy(true)
    await ov.ncmRelaunchDebug()
    setBusy(false)
  }

  return (
    <div>
      <AccountBox onProfileChange={setAccountProfile} />
      <PrivacyBox />

      <div className="group">軟體內播放網易雲</div>
      {!player.enabled ? (
        <div className="err">{player.reason || '此版本未啟用軟體內播放'}</div>
      ) : (
        <>
          <div className="searchbar">
            <input value={query} disabled={busy} placeholder="搜尋歌曲或歌手"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') searchInternal() }} />
            <button className="btn" disabled={busy || !query.trim()} onClick={searchInternal}>搜尋</button>
          </div>
          {isMember && <div className="hint">目前跟隨房主；{canPlayback ? '你已獲播放控制權，命令仍由房主端執行。' : '搜尋後可送出點歌，但不能直接改變藥丸。'}</div>}
          {results.length > 0 && (
            <ul className="results">
              {results.map((song) => (
                <li key={song.id}>
                  {song.cover && <img src={song.cover} alt="" />}
                  <div className="meta"><b>{song.name}</b><div className="sub">{song.artist || song.album || ''}</div></div>
                  <button className="btn" disabled={player.loading} onClick={() => playResult(song)}>{isMember && !canPlayback ? '點歌' : '播放'}</button>
                </li>
              ))}
            </ul>
          )}
          {displayedPlayer.song && (
            <div className="nowplaying internal-player-card">
              {displayedPlayer.song.cover && <img src={displayedPlayer.song.cover} alt="" />}
              <div className="meta"><b>{displayedPlayer.song.name}</b><div className="sub">{displayedPlayer.song.artist || ''}</div></div>
            </div>
          )}
          <div className="transport">
            <button className="btn" disabled={!canPlayback || !displayedPlayer.song || displayedPlayer.loading}
              onClick={() => runPlayer(displayedPlayer.playing ? ov.player.pause : ov.player.play, displayedPlayer.playing ? 'playback.pause' : 'playback.play')}>
              {displayedPlayer.playing ? '暫停' : '播放'}
            </button>
            <span>{formatTime(displayedPlayer.positionMs)}</span>
            <input type="range" min="0" max={Math.max(1, displayedPlayer.durationMs || 1)} value={Math.min(displayedPlayer.positionMs || 0, displayedPlayer.durationMs || 1)}
              disabled={!canPlayback || !displayedPlayer.song}
              onChange={(event) => runPlayer(() => ov.player.seek(Number(event.target.value)), 'playback.seek', { positionMs: Number(event.target.value) })} />
            <span>{formatTime(displayedPlayer.durationMs)}</span>
          </div>
          <div className="hint">目前來源：{player.source === 'desktop-netease' ? '電腦網易雲優先' : player.source === 'room-host' ? '房主' : player.source === 'internal-player' ? '軟體內播放' : '無'}</div>
        </>
      )}
      {(playerMessage || player.error) && <div className="err">{playerMessage || player.error}</div>}

      <PlaylistsPanel profile={accountProfile} isMember={isMember} canPlayback={canPlayback} onPlay={playResult} />

      <div className="group">精準模式（桌面版讀真實進度）</div>
      {info?.cdp && info?.lyricMirror ? (
        <div className="ok">✅ 即時歌詞鏡像已啟用：正跟隨網易雲高亮句</div>
      ) : info?.cdp ? (
        <div className="err">⚠ 已連接網易雲，但尚未收到歌詞高亮；請保持網易雲歌詞頁開啟</div>
      ) : (
        <>
          <button className="btn" disabled={busy} onClick={enablePrecise}>⚡ 啟用精準同步（會重開網易雲）</button>
          <div className="hint">
            會把網易雲關掉、用「除錯模式」重開一次,之後字幕就精準到秒(含拖動/暫停),不裝任何外掛。只需做一次;
            之後想要精準,就用這顆按鈕重開網易雲即可。
          </div>
        </>
      )}

      <div className="group">現在播放（自動偵測網易雲）</div>
      {s && s.name ? (
        <div className="nowplaying">
          {s.cover && <img src={s.cover} alt="" />}
          <div className="meta"><b>{s.name}</b><div className="sub">{s.artist || ''}</div></div>
        </div>
      ) : (
        <div className="hint">尚未同步。請在「網易雲音樂 App」按播放。</div>
      )}

      <div className="group">同步來源（點「跟隨」選擇要抓哪個）</div>
      {info ? (
        <>
          <div className={info.matched ? 'ok' : 'err'}>
            {info.matched
              ? '✅ 正在同步：' + (info.current?.title || '')
              : (info.following ? '⚠ 指定來源目前沒在播' : '⚠ 沒自動抓到網易雲，請在下方手動「跟隨」')}
          </div>
          <div className={info.posLocked ? 'ok' : 'err'}>
            {info.posLocked ? '🔒 已鎖定播放進度來源' : '⚠ 尚未鎖定進度來源（請讓網易雲播放幾秒）'}
          </div>
          {info.health && (
            <div className={Math.abs(info.health.avgMs ?? 0) < 400 ? 'ok' : 'err'}>
              {Math.abs(info.health.avgMs ?? 0) < 400 ? '🎯 字幕跟得上唱速' : '⚠ 字幕偏移偏大'}
              {' — 平均偏差 ' + (info.health.avgMs ?? '?') + ' ms'}
              {info.health.driftMs != null &&
                `（目前 ${info.health.driftMs > 0 ? '慢' : '快'} ${Math.abs(info.health.driftMs)} ms）`}
            </div>
          )}
          <button className={`btn ${!info.following ? 'on' : ''}`} onClick={() => ov.npSetFollow(null)}>
            自動（找網易雲）{!info.following ? ' ✓' : ''}
          </button>
          {info.detected && info.detected.length ? (
            <ul className="results">
              {info.detected.map((d, i) => (
                <li key={i} onClick={() => ov.npSetFollow(d.app)}>
                  <div className="meta"><b>{d.title || '(無標題)'}</b><div className="sub">[{d.status}] {d.app}</div></div>
                  <span className="play">{info.following === d.app ? '✓ 跟隨中' : '跟隨'}</span>
                </li>
              ))}
            </ul>
          ) : <div className="hint">系統沒有任何正在播放的媒體來源。</div>}
        </>
      ) : <div className="hint">偵測中…（在 App 內才會運作）</div>}

      <div className="hint">
        {isMember
          ? '你是聽眾：字幕跟隨主持人。'
          : '網易雲「桌面版」通常不會回報 Windows 媒體控制，清單裡不會出現。改用網易雲「網頁版」(music.163.com) 播放，這裡就會出現、點「跟隨」即可同步。'}
      </div>
    </div>
  )
}

// ================= 外觀 =================
function LookTab({ state, setGlass, setCfg, setLyricsRaw, setProfiles, setUi, cover }) {
  const { glass, cfg } = state
  const decorationControls = decorationControlsForMode(cfg.decorationMode)
  const progressControls = progressControlsForMode(cfg.progressAnim)
  const [profileName, setProfileName] = useState('')
  const [previewDecoration, setPreviewDecoration] = useState(true)
  const [previewEventKey, setPreviewEventKey] = useState(0)
  const sections = mergeLookSections(state.ui?.lookSections)
  useEffect(() => {
    if (previewDecoration) setPreviewEventKey((key) => key + 1)
  }, [previewDecoration, cfg.decorationMode])
  const sectionProps = (key) => ({
    open: sections[key],
    onOpenChange: (open) => setUi({ lookSections: { ...sections, [key]: open } }),
  })
  const saveProfile = (id, name) => {
    const profile = createAppearanceProfile({ id, name, glass, cfg })
    setProfiles(upsertAppearanceProfile(state.profiles || [], profile))
  }
  const applyProfile = (profile) => {
    setGlass(profile.glass || {})
    setCfg(profile.cfg || {})
  }
  const deleteProfile = (id) => setProfiles((state.profiles || []).filter((profile) => profile.id !== id))
  const onLyricFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => setLyricsRaw(String(r.result || '')); r.readAsText(f, 'utf-8')
  }
  const showCover = cfg.backdrop === 'cover' && cover
  return (
    <div>
      {/* 預覽：跟實際藥丸同參數、同封面底 */}
      <div className="preview" style={{ '--frost': cfg.frost, '--cover-img': showCover ? `url("${cover}")` : 'none' }}>
        <div className="preview__effect-layer">
          {!showCover && <div className="preview__bg" />}
          <DecorationCanvas
            cfg={cfg}
            playing={true}
            eventKey={previewEventKey}
            previewActive={previewDecoration}
          />
        </div>
        <div className="preview__content">
          <LiquidGlass
            displacementScale={glass.displacementScale} blurAmount={glass.blurAmount}
            saturation={glass.saturation} aberrationIntensity={glass.aberrationIntensity}
            elasticity={0} cornerRadius={glass.cornerRadius} mode={glass.mode}
            overLight={glass.overLight} padding="12px 26px" style={{ position: 'relative' }}
          >
            <span style={{ fontSize: Math.min(cfg.fontSize, 34), color: cfg.textColor, fontWeight: 800, whiteSpace: 'nowrap' }}>預覽字幕 Aa 樂 ♪</span>
          </LiquidGlass>
        </div>
      </div>
      <Toggle label="播放裝飾預覽" hint="只控制上方預覽，不影響字幕播放"
        checked={previewDecoration} onChange={setPreviewDecoration} />

      {/* ---------- 快速預設 ---------- */}
      <Section title="⚡ 快速預設與配置" {...sectionProps('quick')}>
      <div className="group">⚡ 快速預設</div>
      <div className="presetrow">
        {Object.keys(LOOK_PRESETS).map((k) => (
          <button key={k} className="btn preset" onClick={() => setCfg({ ...LOOK_PRESETS[k] })}>
            {LOOK_LABELS[k]}
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => setCfg(randomLook())}>🎲 隨機外觀</button>
      <div className="tip">隨機只會變更視覺（配色、玻璃、特效），不會動到同步與視窗設定</div>

      <div className="group">💾 我的配置</div>
      <div className="searchbar">
        <input value={profileName} maxLength={40} placeholder="配置名稱，例如：日常 / 投影"
          onChange={(e) => setProfileName(e.target.value)} />
        <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={() => {
          saveProfile(undefined, profileName)
          setProfileName('')
        }}>儲存目前外觀</button>
      </div>
      {(state.profiles || []).length > 0 && (
        <ul className="results profile-list">
          {(state.profiles || []).map((profile) => (
            <li key={profile.id}>
              <div className="meta"><b>{profile.name}</b><div className="sub">{new Date(profile.updatedAt).toLocaleString()}</div></div>
              <button className="mini-action" onClick={() => applyProfile(profile)}>套用</button>
              <button className="mini-action" onClick={() => saveProfile(profile.id, profile.name)}>覆寫</button>
              <button className="mini-action danger" onClick={() => deleteProfile(profile.id)}>刪除</button>
            </li>
          ))}
        </ul>
      )}

      </Section>

      {/* ---------- 樣式（最常用，放最前面）---------- */}
      <Section title="🎨 基本外觀、唱片與字幕" {...sectionProps('basic')}>
      <div className="group">🎨 樣式</div>
      <label className="row"><span className="row__label">藥丸外觀</span>
        <select value={cfg.skin} onChange={(e) => setCfg({ skin: e.target.value })}>
          <option value="glass">液態玻璃</option>
          <option value="avatar">透明（只有字）</option>
        </select><span className="row__val" /></label>
      <Toggle label="唱片頭像" hint="藥丸左邊顯示旋轉唱片"
        checked={cfg.showVinyl} onChange={(v) => setCfg({ showVinyl: v })} />
      {cfg.showVinyl && (
        <>
          <Slider label="唱片大小" value={cfg.vinylScale ?? 3.4} min={2} max={6} step={0.1}
            onChange={(v) => setCfg({ vinylScale: v })} fmt={(v) => v.toFixed(1) + '×'} />
          <label className="row"><span className="row__label">唱片外框</span>
            <select value={cfg.vinylFrame || 'none'} onChange={(e) => setCfg({ vinylFrame: e.target.value })}>
              {VINYL_FRAMES.map((frame) => <option value={frame.id} key={frame.id}>{frame.label}</option>)}
            </select><span className="row__val" /></label>
        </>
      )}
      <Toggle label="顯示歌名" hint="獨立一行小字，不影響歌詞"
        checked={cfg.showSongName} onChange={(v) => setCfg({ showSongName: v })} />
      {cfg.showSongName && (
        <label className="row"><span className="row__label">歌名位置</span>
          <select value={cfg.songNamePos || 'tl'} onChange={(e) => setCfg({ songNamePos: e.target.value })}>
            <option value="tl">左上</option>
            <option value="tc">上方置中</option>
            <option value="tr">右上</option>
            <option value="bl">左下</option>
            <option value="bc">中下</option>
            <option value="br">右下</option>
          </select><span className="row__val" /></label>
      )}
      <Toggle label="邊緣抗鋸齒" hint="消除藥丸邊緣的像素感"
        checked={cfg.smoothEdge} onChange={(v) => setCfg({ smoothEdge: v })} />
      <Toggle label="雙語歌詞" hint="原文 + 翻譯（外文歌才有）"
        checked={cfg.bilingual} onChange={(v) => setCfg({ bilingual: v })} />
      <label className="row"><span className="row__label">字幕高亮效果</span>
        <select value={cfg.lyricHighlightMode || (cfg.karaoke === false ? 'off' : 'characters')}
          onChange={(e) => setCfg({ lyricHighlightMode: e.target.value, karaoke: e.target.value !== 'off' })}>
          <option value="characters">逐字點亮</option>
          <option value="fill">流動填色</option>
          <option value="both">兩者同時</option>
          <option value="off">關閉</option>
        </select><span className="row__val" /></label>

      {/* ---------- 字幕 ---------- */}
      <div className="group">📝 字幕</div>
      <Slider label="字型大小" value={cfg.fontSize} min={14} max={80} step={1} onChange={(v) => setCfg({ fontSize: v })} />
      <Slider label="藥丸寬度" value={cfg.maxWidth} min={200} max={1400} step={10} onChange={(v) => setCfg({ maxWidth: v })} fmt={(v) => v + 'px'} />
      <Slider label="文字描邊" value={cfg.outline ?? 1} min={0} max={2.5} step={0.1}
        onChange={(v) => setCfg({ outline: v })} fmt={(v) => v.toFixed(1)} />
      <Slider label="歌詞可見度" value={cfg.lyricAlpha ?? 1} min={0.2} max={1} step={0.05}
        onChange={(v) => setCfg({ lyricAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label="歌詞清晰度" value={cfg.textClarity ?? 0.7} min={0} max={1} step={0.05}
        onChange={(v) => setCfg({ textClarity: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label="原文與翻譯間距" value={cfg.lyricTranslationGap ?? 7} min={0} max={32} step={1}
        onChange={(v) => setCfg({ lyricTranslationGap: v })} fmt={(v) => v + 'px'} />
      <Slider label="翻譯與進度條間距" value={cfg.translationProgressGap ?? 7} min={0} max={24} step={1}
        onChange={(v) => setCfg({ translationProgressGap: v })} fmt={(v) => v + 'px'} />
      <div className="tip">只調整文字銳利度、描邊與陰影，不會產生文字背景。</div>
      <Slider label="歌名可見度" value={cfg.songNameAlpha ?? 0.62} min={0} max={1} step={0.05}
        onChange={(v) => setCfg({ songNameAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <label className="row"><span className="row__label">歌名顏色</span>
        <input type="color" value={cfg.songNameColor || '#ffffff'} onChange={(e) => setCfg({ songNameColor: e.target.value })} />
        <span className="row__val">{cfg.songNameColor}</span></label>
      <label className="row"><span className="row__label">文字顏色</span>
        <input type="color" value={cfg.textColor} onChange={(e) => setCfg({ textColor: e.target.value })} /><span className="row__val">{cfg.textColor}</span></label>

      </Section>
      {/* ---------- 背景材質 ---------- */}
      <Section title="🪟 背景材質" {...sectionProps('background')}>
      <div className="group">🪟 背景材質</div>
      <label className="row"><span className="row__label">材質預設</span>
        <select value={cfg.bgPreset || 'standard'}
          onChange={(e) => setCfg({ bgPreset: e.target.value, ...(BG_PRESETS[e.target.value] || {}) })}>
          <option value="clear">透明</option>
          <option value="light">輕玻璃</option>
          <option value="standard">標準玻璃</option>
          <option value="heavy">重玻璃</option>
          <option value="frosted">毛玻璃</option>
          <option value="neon">霓虹玻璃</option>
          <option value="dark">深色玻璃</option>
          <option value="solid">純色半透明</option>
          <option value="gradient">漸層玻璃</option>
          <option value="custom">自訂</option>
        </select><span className="row__val" /></label>
      <Slider label="背景透明度" value={cfg.bgAlpha ?? 0.55} min={0} max={1} step={0.01}
        onChange={(v) => setCfg({ bgAlpha: v, bgPreset: 'custom' })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label="模糊度" value={cfg.bgBlur ?? 18} min={0} max={50} step={1}
        onChange={(v) => setCfg({ bgBlur: v, bgPreset: 'custom' })} fmt={(v) => v + 'px'} />
      <div className="tip">透明度與模糊度互相獨立：透明度降低不會讓模糊消失</div>
      <label className="row"><span className="row__label">藥丸圓角</span>
        <select value={cfg.cornerPreset || 'pill'} onChange={(e) => setCfg({ cornerPreset: e.target.value })}>
          <option value="pill">完全藥丸</option>
          <option value="large">大圓角</option>
          <option value="medium">中圓角</option>
          <option value="small">小圓角</option>
          <option value="custom">自訂</option>
        </select><span className="row__val" /></label>
      {cfg.cornerPreset === 'custom' && (
        <Slider label="圓角 px" value={cfg.cornerPx ?? 100} min={0} max={200} step={1}
          onChange={(v) => setCfg({ cornerPx: v })} fmt={(v) => v + 'px'} />
      )}

      <Section title="⚙ 背景進階">
        <Slider label="亮度" value={cfg.bgBright ?? 1} min={0.3} max={2} step={0.05}
          onChange={(v) => setCfg({ bgBright: v, bgPreset: 'custom' })} fmt={(v) => v.toFixed(2) + '×'} />
        <Slider label="對比" value={cfg.bgContrast ?? 1} min={0.3} max={2} step={0.05}
          onChange={(v) => setCfg({ bgContrast: v, bgPreset: 'custom' })} fmt={(v) => v.toFixed(2) + '×'} />
        <Slider label="飽和度" value={cfg.bgSat ?? 1.2} min={0} max={3} step={0.05}
          onChange={(v) => setCfg({ bgSat: v, bgPreset: 'custom' })} fmt={(v) => v.toFixed(2) + '×'} />

        <div className="group">染色</div>
        <label className="row"><span className="row__label">染色色彩</span>
          <input type="color" value={cfg.tintColor || '#8fa8ff'}
            onChange={(e) => setCfg({ tintColor: e.target.value, bgPreset: 'custom' })} />
          <span className="row__val">{cfg.tintColor}</span></label>
        <Slider label="染色強度" value={cfg.tintStrength ?? 0.12} min={0} max={1} step={0.01}
          onChange={(v) => setCfg({ tintStrength: v, bgPreset: 'custom' })} fmt={(v) => Math.round(v * 100) + '%'} />

        <div className="group">漸層</div>
        <label className="row"><span className="row__label">漸層模式</span>
          <select value={cfg.bgGradMode || 'none'} onChange={(e) => setCfg({ bgGradMode: e.target.value, bgPreset: 'custom' })}>
            <option value="none">關閉（用封面/霧面）</option>
            <option value="linear">線性漸層</option>
            <option value="radial">徑向漸層</option>
          </select><span className="row__val" /></label>
        {cfg.bgGradMode !== 'none' && (
          <>
            <label className="row"><span className="row__label">顏色 1</span>
              <input type="color" value={cfg.bgGradC1 || '#7f9cff'} onChange={(e) => setCfg({ bgGradC1: e.target.value })} />
              <span className="row__val">{cfg.bgGradC1}</span></label>
            <label className="row"><span className="row__label">顏色 2</span>
              <input type="color" value={cfg.bgGradC2 || '#c08cff'} onChange={(e) => setCfg({ bgGradC2: e.target.value })} />
              <span className="row__val">{cfg.bgGradC2}</span></label>
            {cfg.bgGradMode === 'linear' && (
              <Slider label="漸層角度" value={cfg.bgGradAngle ?? 145} min={0} max={360} step={5}
                onChange={(v) => setCfg({ bgGradAngle: v })} fmt={(v) => v + '°'} />
            )}
          </>
        )}

        <div className="group">高光與質感</div>
        <Toggle label="邊緣高光" checked={cfg.edgeHighlight}
          onChange={(v) => setCfg({ edgeHighlight: v, bgPreset: 'custom' })} />
        {cfg.edgeHighlight && (
          <Slider label="高光強度" value={cfg.edgeHlStrength ?? 0.45} min={0} max={1} step={0.05}
            onChange={(v) => setCfg({ edgeHlStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        )}
        <Slider label="噪點質感" value={cfg.noise ?? 0} min={0} max={0.6} step={0.02}
          onChange={(v) => setCfg({ noise: v, bgPreset: 'custom' })} fmt={(v) => Math.round(v * 100) + '%'} />

        <div className="group">陰影與發光</div>
        <Slider label="外陰影強度" value={cfg.shadowOut ?? 0.35} min={0} max={1} step={0.05}
          onChange={(v) => setCfg({ shadowOut: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <Slider label="外陰影模糊" value={cfg.shadowOutBlur ?? 26} min={0} max={80} step={2}
          onChange={(v) => setCfg({ shadowOutBlur: v })} fmt={(v) => v + 'px'} />
        <Slider label="內陰影強度" value={cfg.shadowIn ?? 0.25} min={0} max={1} step={0.05}
          onChange={(v) => setCfg({ shadowIn: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <Slider label="外發光" value={cfg.outerGlow ?? 0} min={0} max={1} step={0.05}
          onChange={(v) => setCfg({ outerGlow: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        {cfg.outerGlow > 0 && (
          <label className="row"><span className="row__label">發光顏色</span>
            <input type="color" value={cfg.outerGlowColor || '#7fb0ff'} onChange={(e) => setCfg({ outerGlowColor: e.target.value })} />
            <span className="row__val">{cfg.outerGlowColor}</span></label>
        )}
        <button className="btn" onClick={() => setCfg({ ...BG_DEFAULTS })}>↺ 重設背景材質</button>
      </Section>

      </Section>
      {/* ---------- 進度條 ---------- */}
      <Section title="🎚 進度條" {...sectionProps('progress')}>
      <div className="group">🌈 進度條</div>
      <Toggle label="顯示時間" hint="例如 1:23 / 4:26"
        checked={cfg.showTime} onChange={(v) => setCfg({ showTime: v })} />
      <Toggle label="RGB 彩色" hint="進度條上色與流動"
        checked={cfg.rgbBar} onChange={(v) => setCfg({ rgbBar: v })} />
      <Toggle label="換句跳動" hint="換句時進度條閃一下（可單獨開）"
        checked={cfg.barBeat} onChange={(v) => setCfg({ barBeat: v })} />
      <label className="row"><span className="row__label">動畫模式</span>
        <select value={cfg.progressAnim || 'flow'} onChange={(e) => setCfg({ progressAnim: e.target.value })}>
          <option value="none">無動畫</option>
          <option value="flow">平滑流動</option>
          <option value="breathe">呼吸</option>
          <option value="pulse">整體脈衝</option>
          <option value="bounce">彈跳</option>
          <option value="segments">分段跳動</option>
        </select><span className="row__val" /></label>
      {progressControls.speed && (
        <Slider label="動畫速度" value={cfg.progressSpeed ?? 1} min={0.2} max={4} step={0.1}
          onChange={(v) => setCfg({ progressSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
      )}
      {progressControls.strength && (
        <Slider label="動畫強度" value={cfg.progressStrength ?? 0.55} min={0.1} max={1} step={0.05}
          onChange={(v) => setCfg({ progressStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      )}
      {progressControls.smoothness && (
        <Slider label="動畫平滑度" value={cfg.progressSmoothness ?? 0.7} min={0.1} max={1} step={0.05}
          onChange={(v) => setCfg({ progressSmoothness: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      )}
      {progressControls.bounce && (
        <Slider label="跳動高度" value={cfg.progressBounceHeight ?? 4} min={1} max={12} step={1}
          onChange={(v) => setCfg({ progressBounceHeight: v })} fmt={(v) => v + 'px'} />
      )}
      <Slider label="已播放區可見度" value={cfg.barFillAlpha ?? 1} min={0.1} max={1} step={0.05}
        onChange={(v) => setCfg({ barFillAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label="未播放區可見度" value={cfg.barTrackAlpha ?? 0.28} min={0} max={1} step={0.05}
        onChange={(v) => setCfg({ barTrackAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label="進度條粗細" value={cfg.barHeight ?? 5} min={2} max={16} step={1}
        onChange={(v) => setCfg({ barHeight: v })} fmt={(v) => v + 'px'} />
      <Toggle label="進度條圓角" checked={cfg.barRound !== false}
        onChange={(v) => setCfg({ barRound: v })} />
      {cfg.progressAnim === 'segments'
        ? <div className="tip">「分段跳動」模式會固定使用分段進度條。</div>
        : <Toggle label="分段進度條" hint="把連續進度切成獨立區段"
            checked={cfg.segmentedBar} onChange={(v) => setCfg({ segmentedBar: v })} />}
      {(cfg.segmentedBar || cfg.progressAnim === 'segments') && <>
        <Slider label="分段數量" value={cfg.segmentCount ?? 12} min={4} max={40} step={1}
          onChange={(v) => setCfg({ segmentCount: v })} />
        <Slider label="分段間距" value={cfg.segmentGap ?? 3} min={1} max={10} step={1}
          onChange={(v) => setCfg({ segmentGap: v })} fmt={(v) => v + 'px'} />
        <Slider label="分段圓角" value={cfg.segmentRadius ?? 3} min={0} max={8} step={1}
          onChange={(v) => setCfg({ segmentRadius: v })} fmt={(v) => v + 'px'} />
      </>}
      <Toggle label="進度條發光" checked={cfg.barGlow}
        onChange={(v) => setCfg({ barGlow: v })} />
      {cfg.barGlow && <>
        <Slider label="發光強度" value={cfg.progressGlowStrength ?? 0.65} min={0.1} max={1} step={0.05}
          onChange={(v) => setCfg({ progressGlowStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <Slider label="發光範圍" value={cfg.progressGlowRange ?? 12} min={2} max={30} step={1}
          onChange={(v) => setCfg({ progressGlowRange: v })} fmt={(v) => v + 'px'} />
      </>}

      {cfg.rgbBar && (
        <>
          <label className="row"><span className="row__label">燈效模式</span>
            <select value={cfg.rgbMode || 'rainbow'} onChange={(e) => setCfg({ rgbMode: e.target.value })}>
              <option value="rainbow">彩虹流動</option>
              <option value="breath">柔光配色</option>
              <option value="neon">單色霓虹</option>
              <option value="cover">隨專輯配色</option>
            </select><span className="row__val" /></label>
          {(cfg.rgbMode === 'neon' || cfg.rgbMode === 'breath') && (
            <label className="row"><span className="row__label">霓虹顏色</span>
              <input type="color" value={cfg.neonColor || '#4f8cff'} onChange={(e) => setCfg({ neonColor: e.target.value })} />
              <span className="row__val">{cfg.neonColor}</span></label>
          )}
          <Slider label="速度" value={cfg.rgbSpeed ?? 1} min={0.2} max={4} step={0.1}
            onChange={(v) => setCfg({ rgbSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
          <Slider label="飽和度" value={cfg.rgbSat ?? 1} min={0} max={2} step={0.05}
            onChange={(v) => setCfg({ rgbSat: v })} fmt={(v) => v.toFixed(2) + '×'} />
          <Slider label="亮度" value={cfg.rgbBright ?? 1} min={0.4} max={2} step={0.05}
            onChange={(v) => setCfg({ rgbBright: v })} fmt={(v) => v.toFixed(2) + '×'} />
        </>
      )}

      </Section>

      <Section title="✨ 裝飾特效" {...sectionProps('effects')}>
        <div className="group">基礎設定</div>
        <label className="row"><span className="row__label">裝飾模式</span>
          <select value={cfg.decorationMode || 'none'} onChange={(e) => setCfg({ decorationMode: e.target.value })}>
            <option value="none">無</option>
            <option value="meteor">流星雨</option>
            <option value="sakura">櫻花飄落</option>
            <option value="snow">雪花飄落</option>
          </select><span className="row__val" /></label>
        {decorationControls.count && <>
          <Slider label="粒子數量" value={cfg.decorationCount ?? 18} min={0} max={80} step={1}
            onChange={(v) => setCfg({ decorationCount: v })} />
          <Slider label="移動速度" value={cfg.decorationSpeed ?? 1} min={0.2} max={3} step={0.1}
            onChange={(v) => setCfg({ decorationSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
          <Slider label="顯示強度" value={cfg.decorationStrength ?? 0.6} min={0} max={1} step={0.05}
            onChange={(v) => setCfg({ decorationStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
          <label className="row"><span className="row__label">粒子顏色</span>
            <input type="color"
              value={cfg.decorationMode === 'sakura' ? (cfg.decorationColor2 || '#ffb7d5') : (cfg.decorationColor || '#ffffff')}
              onChange={(e) => setCfg(cfg.decorationMode === 'sakura'
                ? { decorationColor2: e.target.value }
                : { decorationColor: e.target.value })} />
            <span className="row__val" /></label>

          <Section title="進階設定">
            {decorationControls.spawnRate && <>
              <Slider label="生成頻率" value={cfg.meteorSpawnRate ?? 1} min={0.2} max={3} step={0.1}
                onChange={(v) => setCfg({ meteorSpawnRate: v })} fmt={(v) => v.toFixed(1) + '×'} />
              <Slider label="速度變化" value={cfg.meteorSpeedVariance ?? 0.25} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorSpeedVariance: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label="流星長度" value={cfg.meteorLength ?? 34} min={8} max={80} step={1}
                onChange={(v) => setCfg({ meteorLength: v })} fmt={(v) => v + 'px'} />
              <Slider label="流星寬度" value={cfg.meteorWidth ?? 1.6} min={0.5} max={5} step={0.1}
                onChange={(v) => setCfg({ meteorWidth: v })} fmt={(v) => v.toFixed(1) + 'px'} />
              <Slider label="尾跡長度" value={cfg.meteorTrailLength ?? 0.75} min={0.1} max={2} step={0.05}
                onChange={(v) => setCfg({ meteorTrailLength: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label="尾跡透明度" value={cfg.meteorTrailAlpha ?? 0.55} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorTrailAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label="整體透明度" value={cfg.meteorAlpha ?? 0.85} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <label className="row"><span className="row__label">移動方向</span>
                <select value={cfg.meteorDirection || 'down-right'} onChange={(e) => setCfg({ meteorDirection: e.target.value })}>
                  <option value="down-right">右下</option>
                  <option value="down-left">左下</option>
                  <option value="up-right">右上</option>
                  <option value="up-left">左上</option>
                  <option value="right">向右</option>
                  <option value="left">向左</option>
                </select><span className="row__val" /></label>
              <label className="row"><span className="row__label">配色方式</span>
                <select value={cfg.meteorColorMode || 'fixed'} onChange={(e) => setCfg({ meteorColorMode: e.target.value })}>
                  <option value="fixed">單色</option>
                  <option value="accent">雙色核心</option>
                </select><span className="row__val" /></label>
              {cfg.meteorColorMode === 'accent' && (
                <label className="row"><span className="row__label">核心顏色</span>
                  <input type="color" value={cfg.decorationColor2 || '#ffb7d5'}
                    onChange={(e) => setCfg({ decorationColor2: e.target.value })} />
                  <span className="row__val" /></label>
              )}
              <Slider label="發光強度" value={cfg.meteorGlowStrength ?? 0.55} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorGlowStrength: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label="發光範圍" value={cfg.meteorGlowRange ?? 8} min={0} max={24} step={1}
                onChange={(v) => setCfg({ meteorGlowRange: v })} fmt={(v) => v + 'px'} />
              <Slider label="核心亮度" value={cfg.meteorCoreBrightness ?? 1.2} min={0.5} max={2} step={0.05}
                onChange={(v) => setCfg({ meteorCoreBrightness: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label="邊緣柔化" value={cfg.meteorEdgeSoftness ?? 0.5} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ meteorEdgeSoftness: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Toggle label="換句時爆發" checked={cfg.meteorBurstOnLine !== false}
                onChange={(v) => setCfg({ meteorBurstOnLine: v })} />
            </>}

            {decorationControls.sway && <>
              <Slider label="花瓣大小" value={cfg.sakuraSize ?? 8} min={2} max={20} step={1}
                onChange={(v) => setCfg({ sakuraSize: v })} fmt={(v) => v + 'px'} />
              <Slider label="搖曳幅度" value={cfg.sakuraSway ?? 0.7} min={0} max={2} step={0.05}
                onChange={(v) => setCfg({ sakuraSway: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label="旋轉速度" value={cfg.sakuraRotation ?? 1} min={0} max={3} step={0.1}
                onChange={(v) => setCfg({ sakuraRotation: v })} fmt={(v) => v.toFixed(1) + '×'} />
              <Slider label="深度變化" value={cfg.sakuraDepth ?? 0.55} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ sakuraDepth: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label="風力" value={cfg.sakuraWind ?? 0.15} min={-1} max={1} step={0.05}
                onChange={(v) => setCfg({ sakuraWind: v })} fmt={(v) => v.toFixed(2)} />
              <Slider label="透明度" value={cfg.sakuraAlpha ?? 0.8} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ sakuraAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
            </>}

            {decorationControls.drift && <>
              <Slider label="雪花大小" value={cfg.snowSize ?? 5} min={1} max={16} step={1}
                onChange={(v) => setCfg({ snowSize: v })} fmt={(v) => v + 'px'} />
              <Slider label="風力" value={cfg.snowWind ?? 0} min={-1} max={1} step={0.05}
                onChange={(v) => setCfg({ snowWind: v })} fmt={(v) => v.toFixed(2)} />
              <Slider label="飄移幅度" value={cfg.snowDrift ?? 0.5} min={0} max={2} step={0.05}
                onChange={(v) => setCfg({ snowDrift: v })} fmt={(v) => v.toFixed(2) + '×'} />
              <Slider label="柔化程度" value={cfg.snowSoftness ?? 0.45} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ snowSoftness: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label="結晶比例" value={cfg.snowCrystalRatio ?? 0.18} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ snowCrystalRatio: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label="透明度" value={cfg.snowAlpha ?? 0.8} min={0} max={1} step={0.05}
                onChange={(v) => setCfg({ snowAlpha: v })} fmt={(v) => Math.round(v * 100) + '%'} />
              <Slider label="亮度" value={cfg.snowBrightness ?? 1} min={0.5} max={2} step={0.05}
                onChange={(v) => setCfg({ snowBrightness: v })} fmt={(v) => v.toFixed(2) + '×'} />
            </>}
          </Section>
        </>}
        <button className="btn" onClick={() => setCfg(resetDecorationConfig())}>↺ 重設此區</button>
      </Section>

      <Section title="✨ 歌詞與藥丸動畫" {...sectionProps('lyricAnimation')}>
      <div className="group">✨ 藥丸特效</div>
      <Toggle label="換句呼吸" hint="換句時玻璃輕微放大回彈"
        checked={cfg.fxBreathe} onChange={(v) => setCfg({ fxBreathe: v })} />
      <Toggle label="逐字發光" hint="唱到的字帶柔光"
        checked={cfg.fxKaraokeGlow} onChange={(v) => setCfg({ fxKaraokeGlow: v })} />
      <Toggle label="唱片彈跳" hint="換句時唱片彈一下"
        checked={cfg.fxVinylBounce} onChange={(v) => setCfg({ fxVinylBounce: v })} />
      <Toggle label="暫停呼吸燈" hint="暫停時明暗呼吸提示"
        checked={cfg.fxPauseBreath} onChange={(v) => setCfg({ fxPauseBreath: v })} />
      <Toggle label="滑鼠 3D 傾斜" hint="滑鼠移上去時藥丸微微傾斜"
        checked={cfg.fxTilt} onChange={(v) => setCfg({ fxTilt: v })} />
      <Slider label="滑鼠感應距離" value={cfg.hoverActivationDistance ?? 14} min={0} max={80} step={1}
        onChange={(v) => setCfg({ hoverActivationDistance: v })} fmt={(v) => `${v}px`} />
      <label className="row"><span className="row__label">換句過場</span>
        <select value={cfg.fxLineAnim || 'fade'} onChange={(e) => setCfg({ fxLineAnim: e.target.value })}>
          <option value="none">無</option>
          <option value="fade">淡入</option>
          <option value="up">上滑淡入</option>
          <option value="zoom">縮放淡入</option>
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">逐字發光顏色</span>
        <input type="color" value={cfg.glowColor || '#8ec8ff'} onChange={(e) => setCfg({ glowColor: e.target.value })} />
        <span className="row__val">{cfg.glowColor}</span></label>
      <Slider label="唱片轉速" value={cfg.vinylRpm ?? 4.5} min={1.5} max={12} step={0.5}
        onChange={(v) => setCfg({ vinylRpm: v })} fmt={(v) => v.toFixed(1) + 's/圈'} />
      <Slider label="字幕字重" value={cfg.fontWeight ?? 800} min={400} max={900} step={100}
        onChange={(v) => setCfg({ fontWeight: v })} />

      <div className="group">換歌過場</div>
      <label className="row"><span className="row__label">過場模式</span>
        <select value={cfg.songTransitionMode || 'collapse'} onChange={(e) => setCfg({ songTransitionMode: e.target.value })}>
          <option value="none">無</option>
          <option value="collapse">原位聚合</option>
          <option value="shatter">原位破碎</option>
        </select><span className="row__val" /></label>
      {cfg.songTransitionMode !== 'none' && (
        <Slider label="過場速度" value={cfg.transitionSpeed ?? 1} min={0.5} max={2} step={0.1}
          onChange={(v) => setCfg({ transitionSpeed: v })} fmt={(v) => v.toFixed(1) + '×'} />
      )}

      <div className="group">玻璃流光</div>
      <label className="row"><span className="row__label">流光形狀</span>
        <select value={cfg.sheenMode || 'none'} onChange={(e) => setCfg({ sheenMode: e.target.value })}>
          <option value="none">無</option>
          <option value="oval">橢圓光斑</option>
          <option value="droplet">水滴</option>
          <option value="arc">弧形</option>
        </select><span className="row__val" /></label>
      {cfg.sheenMode !== 'none' && <>
        <Slider label="流光寬度" value={cfg.sheenWidth ?? 34} min={8} max={80} step={1}
          onChange={(v) => setCfg({ sheenWidth: v })} fmt={(v) => v + '%'} />
        <Slider label="流光高度" value={cfg.sheenHeight ?? 140} min={40} max={220} step={5}
          onChange={(v) => setCfg({ sheenHeight: v })} fmt={(v) => v + '%'} />
        <Slider label="移動時間" value={cfg.sheenDuration ?? 1.2} min={0.4} max={4} step={0.1}
          onChange={(v) => setCfg({ sheenDuration: v })} fmt={(v) => v.toFixed(1) + '秒'} />
        <Slider label="出現間隔" value={cfg.sheenInterval ?? 6} min={0.5} max={20} step={0.5}
          onChange={(v) => setCfg({ sheenInterval: v })} fmt={(v) => v.toFixed(1) + '秒'} />
        <Slider label="流光亮度" value={cfg.sheenBrightness ?? 1.5} min={0.5} max={3} step={0.1}
          onChange={(v) => setCfg({ sheenBrightness: v })} fmt={(v) => v.toFixed(1) + '×'} />
        <Slider label="流光模糊" value={cfg.sheenBlur ?? 16} min={0} max={40} step={1}
          onChange={(v) => setCfg({ sheenBlur: v })} fmt={(v) => v + 'px'} />
        <Slider label="流光透明度" value={cfg.sheenOpacity ?? 0.45} min={0.05} max={1} step={0.05}
          onChange={(v) => setCfg({ sheenOpacity: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <label className="row"><span className="row__label">移動方向</span>
          <select value={cfg.sheenDirection || 'ltr'} onChange={(e) => setCfg({ sheenDirection: e.target.value })}>
            <option value="ltr">左到右</option>
            <option value="rtl">右到左</option>
          </select><span className="row__val" /></label>
      </>}

      </Section>

      {/* ---------- 視窗行為 ---------- */}
      <Section title="🖥 視窗與同步" {...sectionProps('window')}>
      <div className="group">🪟 視窗</div>
      <Toggle label="永遠顯示在最上層" checked={cfg.alwaysOnTop} onChange={(v) => setCfg({ alwaysOnTop: v })} />
      <Toggle label="滑鼠穿透（不攔截滑鼠）" hint="遊戲與後方程式會直接收到滑鼠操作（Ctrl+Alt+L）"
        checked={cfg.clickThrough} onChange={(v) => setCfg({ clickThrough: v })} />
      {cfg.clickThrough && <div className="tip">已開啟：藥丸不會接收點擊。按 Ctrl+Alt+L 可解除穿透。</div>}
      <div className="tip">右鍵藥丸可「鎖定位置」，避免不小心拖動</div>
      <label className="row"><span className="row__label">螢幕安全邊距</span>
        <select value={String(cfg.safeMargin ?? 12)} onChange={(e) => setCfg({ safeMargin: Number(e.target.value) })}>
          {[0, 4, 8, 12, 16, 24].map((v) => <option key={v} value={v}>{v}px</option>)}
        </select><span className="row__val" /></label>
      <label className="row"><span className="row__label">邊緣吸附</span>
        <select value={cfg.snapMode || 'normal'} onChange={(e) => setCfg({ snapMode: e.target.value })}>
          <option value="off">關閉</option>
          <option value="light">輕度</option>
          <option value="normal">標準</option>
          <option value="strong">強力</option>
        </select><span className="row__val" /></label>
      <div className="tip">藥丸永遠不會被拖出螢幕；換解析度或拔螢幕後會自動移回可見範圍</div>

      {/* ---------- 進階（摺疊）---------- */}
      </Section>
      <Section title="⚙ 進階：液態玻璃參數" {...sectionProps('advanced')}>
        <div className="tip">與 rdev/liquid-glass-react 官方 demo 完全相同的參數</div>
        <label className="row"><span className="row__label">折射模式</span>
          <select value={glass.mode} onChange={(e) => setGlass({ mode: e.target.value })}>
            <option value="standard">standard</option>
            <option value="polar">polar</option>
            <option value="prominent">prominent</option>
            <option value="shader">shader</option>
          </select><span className="row__val" /></label>
        <Slider label="Displacement Scale" value={glass.displacementScale} min={0} max={200} step={1} onChange={(v) => setGlass({ displacementScale: v })} />
        <Slider label="Blur Amount" value={glass.blurAmount} min={0} max={1} step={0.01} onChange={(v) => setGlass({ blurAmount: v })} fmt={(v) => v.toFixed(2)} />
        <Slider label="Saturation" value={glass.saturation} min={100} max={300} step={10} onChange={(v) => setGlass({ saturation: v })} fmt={(v) => v + '%'} />
        <Slider label="Chromatic Aberration" value={glass.aberrationIntensity} min={0} max={20} step={1} onChange={(v) => setGlass({ aberrationIntensity: v })} />
        <Slider label="Elasticity" value={glass.elasticity} min={0} max={1} step={0.05} onChange={(v) => setGlass({ elasticity: v })} fmt={(v) => v.toFixed(2)} />
        <Slider label="Corner Radius" value={glass.cornerRadius} min={0} max={100} step={1} onChange={(v) => setGlass({ cornerRadius: v })} fmt={(v) => v + 'px'} />
        <Toggle label="Over Light" checked={glass.overLight} onChange={(v) => setGlass({ overLight: v })} />
        <button className="btn" onClick={() => setGlass({ ...GLASS_DEFAULTS })}>↺ 還原成 demo 預設</button>

        <div className="group">玻璃底</div>
        <label className="row"><span className="row__label">折射來源</span>
          <select value={cfg.backdrop} onChange={(e) => setCfg({ backdrop: e.target.value })}>
            <option value="cover">專輯封面（推薦）</option>
            <option value="none">無（純玻璃）</option>
            <option value="desktop">桌面（會卡）</option>
          </select><span className="row__val" /></label>
        <Slider label="霧面濃度" value={cfg.frost} min={0} max={0.8} step={0.01} onChange={(v) => setCfg({ frost: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      </Section>

      <Section title="📄 備用歌詞（沒偵測到網易雲時）">
        <div className="filerow">
          <label className="btn file">📂 載入 .lrc / .txt<input type="file" accept=".lrc,.txt,text/plain" onChange={onLyricFile} hidden /></label>
        </div>
        <textarea className="lyric-input" placeholder="貼上歌詞，一行一句；支援 [mm:ss.xx] 時間標記" defaultValue={state.lyricsRaw}
          onChange={(e) => setLyricsRaw(e.target.value)} />
        <Slider label="每行秒數" value={cfg.secondsPerLine} min={1} max={10} step={0.1} onChange={(v) => setCfg({ secondsPerLine: v })} fmt={(v) => v.toFixed(1) + 's'} />
      </Section>

      <button className="btn danger" onClick={() => ov.quit()}>✕ 關閉字幕程式</button>
    </div>
  )
}
