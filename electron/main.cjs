const { app, BrowserWindow, ipcMain, globalShortcut, screen, Menu, Tray, desktopCapturer, safeStorage } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const { Room, getLanIp, listLanIps } = require('./room.cjs')
const { createMusicProvider } = require('./musicProvider.cjs')
const smtc = require('./smtc.cjs')
const ncmcdp = require('./ncmcdp.cjs')
const { migrateState } = require('../shared/stateMigration.cjs')
const { loadConfigFile } = require('../shared/configStore.cjs')
const { isOwnMediaSession } = require('../shared/mediaSession.cjs')
const { sharedAppearanceStyle } = require('../shared/roomStyle.cjs')
const { canSendStyleOffer, createStyleOffer, handleStyleOfferOnce, applyAcceptedStyleOffer } = require('../shared/styleOffer.cjs')
const { randomUUID } = require('crypto')
const {
  createSongRevision,
  canTrustCdpSongIdentity,
  isFreshMirrorSnapshot,
  mirrorSyncDisposition,
  playbackStateToPlaying,
  resolveCdpPlaying,
  shouldProcessMirrorSnapshot,
  songIdentityKey,
} = require('../shared/songSwitch.cjs')
const { shouldHideWindowOnClose, resolveConsoleCloseAction } = require('../shared/windowLifecycle.cjs')
const { isNaturalSongEnd, isReadyToRebuild } = require('../shared/songLifecycle.cjs')
const { SOURCE, createPlaybackCoordinator } = require('../shared/playbackCoordinator.cjs')
const { desktopSessionIdentity, desktopSourceId, isDesktopSource } = require('../shared/playbackSource.cjs')
const { selectBestTrackMatch, shouldResolveLyrics } = require('../shared/trackMatching.cjs')
const { sameTrackIdentity } = require('../shared/trackIdentity.cjs')
const { desktopSourceDisposition } = require('../shared/desktopSourceLiveness.cjs')
const { smtcClockDecision } = require('../shared/smtcClock.cjs')
const { createInternalPlayerState, reduceInternalPlayer, internalSnapshot } = require('../shared/internalPlayerState.cjs')
const { internalPlaybackEnabled, playerControlDecision, shouldPauseInternalForDesktop } = require('../shared/playerPolicy.cjs')
const { PLAYER_ERROR_CODES, createPlayerError, playerErrorCode } = require('../shared/playerErrors.cjs')
const { createCredentialStore } = require('./credentialStore.cjs')
const { createLocalPlaylistStore } = require('./localPlaylistStore.cjs')
const { createPrivacyService } = require('./privacyService.cjs')
const { canExecuteRoomCommand, createRequestLimiter, normalizeCapabilities } = require('../shared/roomPolicy.cjs')
const { createUpdateService, updateCapability } = require('./updateService.cjs')
const { readBundledUpdateConfig } = require('../shared/updateConfig.cjs')
const { createActiveSessionResolver } = require('../shared/activeSessionResolver.cjs')
const { createWindowStateRelay } = require('../shared/windowStateRelay.cjs')
const { nativeUiLabels, resolveNativeLocale, SUPPORTED_NATIVE_LOCALES } = require('../shared/nativeUiLocale.cjs')
const { preferredUiLocale } = require('../shared/systemLocale.cjs')
const packagePolicy = require('../package.json').lucent || {}

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const RUNTIME_QA = !app.isPackaged && process.env.LUCENT_RUNTIME_QA === '1'
if (RUNTIME_QA) {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
}
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let overlay = null
let consoleWin = null
let consoleOverlayTimer = null
let audioServiceWin = null
let audioServiceReady = false
const pendingPlayerCommands = []
let tray = null
let explicitQuit = false
const room = new Room()
const playback = createPlaybackCoordinator()
const activeSessionResolver = createActiveSessionResolver()
const windowStateRelay = createWindowStateRelay()
const allowUnofficialNetease = packagePolicy.nonCommercialDevelopment === true
  || process.env.LUCENT_ALLOW_UNOFFICIAL_NETEASE === '1'
const unofficialPlaybackAllowed = internalPlaybackEnabled({
  isPackaged: app.isPackaged,
  allowUnofficial: allowUnofficialNetease,
})
const netease = createMusicProvider({
  isPackaged: app.isPackaged,
  allowUnofficial: allowUnofficialNetease,
})
let internalPlayer = createInternalPlayerState()
let internalRevision = 0
const pendingStyleOffers = new Map()
const handledStyleOffers = new Set()
let localPlaylists = null
let localDatabasePath = ''
let activeRoomQueueEntryId = null
const roomRequestLimiter = createRequestLimiter()
let updateService = null
let privacyService = null

// ---------- 網易雲登入憑證（Windows safeStorage 加密，不進 Renderer／房間） ----------
const credentialStore = createCredentialStore({
  safeStorage,
  fs,
  encryptedPath: path.join(app.getPath('userData'), 'netease-credential.bin'),
  legacyPath: path.join(app.getPath('userData'), 'netease-cookie.txt'),
})
function saveCookie(cookie) { credentialStore.save(cookie) }

// ---------- 共享設定狀態（外觀/玻璃，持久化）----------
const CONFIG_PATH = path.join(app.getPath('userData'), 'lgl-config.json')
// 設定的單一真相來源：與畫面端共用 shared/defaults.json，
// 避免預設值在主行程與畫面端平行維護而漂移。
const SCHEMA = require('../shared/defaults.json')
const SCHEMA_VERSION = SCHEMA.schemaVersion
const DEFAULT_STATE = {
  glass: { ...SCHEMA.glass },
  cfg: { ...SCHEMA.cfg },
  profiles: [...SCHEMA.profiles],
  updates: { ...SCHEMA.updates },
  ui: JSON.parse(JSON.stringify(SCHEMA.ui)),
  lyricsRaw: SCHEMA.lyricsRaw,
}
let state = loadState()

// 版本化遷移：舊設定檔缺少的新欄位一律以預設補齊，使用者的既有設定完整保留。
// 不需要刪除舊設定檔，也不會因為新增欄位而讀不到舊設定。
function migrate(raw) {
  return migrateState(raw, SCHEMA)
}

// 設定檔讀不起來時，絕對不能安靜地把使用者的設定換成預設值就算了。
// 原本這裡是 catch {} 直接回預設：只要寫檔寫到一半斷電、檔案被截斷、或內容
// 變成不合法的 JSON，使用者所有的具名配置、外觀、房間設定就在下次啟動時
// 無聲消失，而且原始檔案已經被下一次存檔覆蓋掉，救不回來。
// 現在改成先把讀不懂的檔案改名保存，再退回預設，至少資料還在硬碟上。
function loadState() {
  const result = loadConfigFile({
    fs,
    configPath: CONFIG_PATH,
    migrate,
    createDefault: createDefaultState,
    stamp: new Date().toISOString(),
  })
  if (result.outcome === 'recovered') {
    console.error(
      `[lucent] settings file could not be read (${result.error}). `
      + (result.backupPath
        ? `The original was kept at ${result.backupPath}.`
        : 'The original could not be preserved.')
      + ' Starting from defaults.',
    )
  }
  return result.state
}
function createDefaultState() {
  return { ...JSON.parse(JSON.stringify(DEFAULT_STATE)), win: null, schemaVersion: SCHEMA_VERSION }
}
// 設定寫檔。
//
// 為什麼需要 flush：原本只有 400ms 的 debounce，沒有任何離開前的強制寫入。
// 只要在變更後 400 毫秒內關掉程式（或行程被強制結束），那次變更就無聲消失 ——
// 使用者剛按下「儲存目前外觀」建立的配置就是這樣整組不見的。
// 現在分兩條路：高頻變動（拖曳視窗、滑桿）維持 debounce，
// 重要且不可重建的資料（具名配置）立即落地，離開前再保險 flush 一次。
let saveTimer = null
function writeStateNow() {
  clearTimeout(saveTimer)
  saveTimer = null
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(state, null, 2))
    return true
  } catch { return false }
}
function saveState({ immediate = false } = {}) {
  if (immediate) { writeStateNow(); return }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(writeStateNow, 400)
}
// 還有沒寫出去的變更就趕在關閉前寫掉
function flushState() {
  if (saveTimer) writeStateNow()
}
function applyPatch(patch) {
  for (const k of Object.keys(patch)) {
    const v = patch[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof state[k] === 'object') state[k] = { ...state[k], ...v }
    else state[k] = v
  }
}
function sendAll(channel, payload) {
  if (channel === 'room:state' || channel === 'np:info') windowStateRelay.remember(channel, payload)
  for (const w of [overlay, consoleWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
}
function replayWindowState(win) {
  if (!win || win.isDestroyed()) return
  windowStateRelay.replay((channel, payload) => win.webContents.send(channel, payload))
}

function restartUpdateService() {
  if (updateService) updateService.stop()
  const bundledUpdate = readBundledUpdateConfig({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    existsSync: fs.existsSync,
  })
  const capability = updateCapability({
    isPackaged: app.isPackaged,
    isPortable: !!process.env.PORTABLE_EXECUTABLE_FILE,
    enabled: bundledUpdate.enabled,
    reason: bundledUpdate.reason,
  })
  updateService = createUpdateService({
    autoUpdater,
    currentVersion: app.getVersion(),
    capability,
    canRestart: () => room.mode !== 'host' && !playback.current()?.playing,
    onState: (snapshot) => sendAll('update:changed', snapshot),
  })
  updateService.start(state.updates)
}
function broadcastState() { sendAll('state:changed', state) }

// Renderer 仍沿用既有 room:state 通道；所有完整播放狀態先經過唯一仲裁器。
playback.subscribe((snapshot) => {
  sendAll('room:state', snapshot)
  updateService?.notifySafetyChanged()
})

// ---------- 視窗 ----------
function loadRoute(win, hash) {
  if (DEV_URL) win.loadURL(hash ? `${DEV_URL.replace(/\/$/, '')}/#${hash}` : DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), hash ? { hash } : undefined)
}

// Windows 會替透明視窗畫一圈邊框/圓角/陰影（看起來就是藥丸外那個外框）。
// Electron 的 thickFrame/roundedCorners 在 Win11 上不一定生效，
// 直接呼叫 DWM API 關掉：圓角偏好、非工作區渲染、邊框顏色。
function killWindowsBorder(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return
  try {
    const hbuf = win.getNativeWindowHandle()
    const hwnd = hbuf.length === 8 ? hbuf.readBigUInt64LE(0).toString() : String(hbuf.readUInt32LE(0))
    const ps = `
Add-Type -Namespace W -Name D -MemberDefinition '
[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int s);'
$h=[IntPtr]::new([int64]${hwnd})
$noRound=1; [W.D]::DwmSetWindowAttribute($h,33,[ref]$noRound,4) | Out-Null   # 圓角: DONOTROUND
$off=1;     [W.D]::DwmSetWindowAttribute($h,2,[ref]$off,4)      | Out-Null   # 非工作區渲染: DISABLED
$none=-2;   [W.D]::DwmSetWindowAttribute($h,34,[ref]$none,4)    | Out-Null   # 邊框顏色: NONE
`.trim()
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 8000 }, () => {})
  } catch {}
}

// ================= 螢幕邊界系統 =================
// 目標：藥丸永遠不會被拖出螢幕、換解析度/DPI/拔螢幕後也一定找得回來。
// 注意：Electron 的 screen 座標已是「DPI 縮放後的邏輯座標」，
// 各螢幕縮放比例不同時仍可直接比較，不需自行換算 scaleFactor。
const SNAP_PX = { off: 0, light: 8, normal: 16, strong: 28 }

// 以視窗中心決定所屬螢幕 → 拖到另一台螢幕時會自然換邊界，
// 不會用整個 virtual screen 導致藥丸卡在兩螢幕交界的不可見處。
function displayFor(b) {
  try {
    return screen.getDisplayNearestPoint({
      x: Math.round(b.x + b.width / 2),
      y: Math.round(b.y + b.height / 2),
    })
  } catch {
    return screen.getPrimaryDisplay()
  }
}

// 玻璃在視窗內的內縮量（視窗四周有為彈性拉伸預留的隱形空間）。
// 夾限要扣掉它，藥丸「看得見的邊」才能真正貼到螢幕邊緣。
const inset = { x: 0, y: 0 }

// 把座標夾回所屬螢幕的工作區，並套用邊緣吸附
function clampPoint(b) {
  const margin = Math.max(0, Number(state.cfg.safeMargin ?? 0))
  const wa = displayFor(b).workArea
  const ix = Math.max(0, Math.min(inset.x, Math.floor(b.width / 2) - 4))
  const iy = Math.max(0, Math.min(inset.y, Math.floor(b.height / 2) - 4))
  const minX = wa.x + margin - ix
  const minY = wa.y + margin - iy
  const maxX = wa.x + wa.width - b.width - margin + ix
  const maxY = wa.y + wa.height - b.height - margin + iy

  // 視窗比螢幕還大時（超大字級）：至少貼齊左上，不要整個飛出去
  let x = maxX >= minX ? Math.min(Math.max(b.x, minX), maxX) : minX
  let y = maxY >= minY ? Math.min(Math.max(b.y, minY), maxY) : minY

  // 邊緣吸附：只有「靠近時」才吸，不會鎖死在邊緣拖不動
  const t = SNAP_PX[state.cfg.snapMode] ?? SNAP_PX.normal
  if (t > 0 && maxX >= minX && maxY >= minY) {
    if (Math.abs(x - minX) <= t) x = minX
    else if (Math.abs(x - maxX) <= t) x = maxX
    if (Math.abs(y - minY) <= t) y = minY
    else if (Math.abs(y - maxY) <= t) y = maxY
  }
  return { x: Math.round(x), y: Math.round(y) }
}

// 重新驗證目前位置（尺寸改變、螢幕變動、啟動時都要呼叫）
function enforceBounds() {
  if (!overlay || overlay.isDestroyed()) return
  const b = overlay.getBounds()
  const p = clampPoint(b)
  if (p.x !== b.x || p.y !== b.y) overlay.setPosition(p.x, p.y)
}

function showLucent() {
  clearTimeout(consoleOverlayTimer)
  if (!overlay || overlay.isDestroyed()) {
    createOverlay()
    return
  }
  if (overlay.isMinimized()) overlay.restore()
  overlay.show()
  overlay.focus()
  // 系統匣恢復不能只顯示原生視窗；設定開啟時 Renderer 也會收起藥丸。
  overlay.webContents.send('overlay:console-visibility', false)
  enforceBounds()
}

function hideLucent() {
  if (consoleWin && !consoleWin.isDestroyed()) consoleWin.hide()
  if (overlay && !overlay.isDestroyed()) overlay.hide()
}

// Language subtags the app ships translations for, e.g. 'zh' from 'zh-TW'.
const SUPPORTED_UI_LANGUAGES = new Set(
  SUPPORTED_NATIVE_LOCALES.map((tag) => String(tag).split('-')[0].toLowerCase()),
)
const isSupportedUiLanguage = (tag) => SUPPORTED_UI_LANGUAGES.has(String(tag).split('-')[0].toLowerCase())

// The display-language list, not app.getLocale() — see shared/systemLocale.cjs.
function systemUiLocale() {
  const preferred = typeof app.getPreferredSystemLanguages === 'function'
    ? app.getPreferredSystemLanguages()
    : []
  return preferredUiLocale(preferred, app.getLocale(), isSupportedUiLanguage)
}

// Handed to every renderer so the window UI resolves 'auto' from the same
// display-language list the native menus use. navigator.language cannot be used
// for this: Chromium reports the region format there instead.
const SYSTEM_LOCALE_ARGUMENT = '--lucent-system-locale='
function rendererArguments() {
  return [`${SYSTEM_LOCALE_ARGUMENT}${systemUiLocale()}`]
}

function nativeMenuTemplate() {
  const labels = nativeUiLabels(state.ui?.locale, systemUiLocale())
  return [
    { label: labels.openConsole, click: openConsole },
    { label: labels.showLucent, click: showLucent },
    { label: labels.hideLucent, click: hideLucent },
    { type: 'separator' },
    { label: labels.quit, click: requestFinalQuit },
  ]
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(Menu.buildFromTemplate(nativeMenuTemplate()))
}

function requestFinalQuit() {
  explicitQuit = true
  flushState()
  app.quit()
}

// 不管是從哪條路離開（托盤、關閉視窗、系統登出、autoUpdater 重啟），
// 都保證沒寫出去的設定會落地。
app.on('before-quit', flushState)
app.on('will-quit', flushState)
app.on('window-all-closed', flushState)

function createTray() {
  if (tray) return tray
  tray = new Tray(path.join(__dirname, '..', 'build', 'icon.ico'))
  tray.setToolTip('璃音 Lucent')
  refreshTrayMenu()
  tray.on('click', showLucent)
  return tray
}

function createOverlay() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const W = 460, H = 96
  const ix = state.win ? state.win.x : Math.round((sw - W) / 2)
  const iy = state.win ? state.win.y : Math.round(sh - H - 48)
  overlay = new BrowserWindow({
    width: W, height: H, x: ix, y: iy,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    // Windows 會替透明視窗畫一圈邊框/陰影（看起來就是藥丸外的圓角外框）。
    // thickFrame:false 移除 WS_THICKFRAME，邊框才不會被畫出來。
    thickFrame: false,
    roundedCorners: false,
    resizable: false, movable: true, skipTaskbar: false, alwaysOnTop: state.cfg.alwaysOnTop,
    fullscreenable: false, minWidth: 60, minHeight: 36,
    title: '璃音 Lucent',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, additionalArguments: rendererArguments() },
  })
  // 啟動時驗證上次保存的位置是否仍然合法（換解析度/拔螢幕/DPI 改變後可能已不存在）
  enforceBounds()
  killWindowsBorder(overlay) // 用 DWM 移除系統畫的邊框/圓角/陰影
  overlay.setAlwaysOnTop(state.cfg.alwaysOnTop, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRoute(overlay, '')
  overlay.webContents.on('did-finish-load', () => updateCapture())
  let moveTimer = null
  overlay.on('moved', () => {
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (overlay && !overlay.isDestroyed()) { const b = overlay.getBounds(); state.win = { x: b.x, y: b.y }; saveState() }
    }, 400)
  })
  overlay.on('close', (event) => {
    if (!shouldHideWindowOnClose(explicitQuit)) return
    event.preventDefault()
    overlay.hide()
  })
  overlay.on('closed', () => { overlay = null })
}

function setOverlayConsoleCollapsed(collapsed) {
  clearTimeout(consoleOverlayTimer)
  if (!overlay || overlay.isDestroyed()) return
  if (!collapsed) {
    overlay.showInactive()
    overlay.webContents.send('overlay:console-visibility', false)
    return
  }
  overlay.webContents.send('overlay:console-visibility', true)
  consoleOverlayTimer = setTimeout(() => {
    if (consoleWin && !consoleWin.isDestroyed() && overlay && !overlay.isDestroyed()) overlay.hide()
  }, 170)
}

function saveConsolePreferences(patch = {}) {
  state.ui = {
    ...state.ui,
    console: { ...(state.ui?.console || {}), ...patch },
  }
  broadcastState()
  saveState()
}

function performConsoleClose(action, remember = false) {
  const resolved = resolveConsoleCloseAction(action, false)
  if (remember && resolved !== 'ask') saveConsolePreferences({ closeBehavior: resolved })
  if (resolved === 'ask') {
    if (consoleWin && !consoleWin.isDestroyed()) consoleWin.webContents.send('console:close-request')
    return { ok: true, action: 'ask' }
  }
  if (resolved === 'pill') {
    if (consoleWin && !consoleWin.isDestroyed()) consoleWin.hide()
    showLucent()
    return { ok: true, action: 'pill' }
  }
  if (resolved === 'tray') {
    hideLucent()
    return { ok: true, action: 'tray' }
  }
  requestFinalQuit()
  return { ok: true, action: 'quit' }
}

function requestConsoleClose() {
  const action = resolveConsoleCloseAction(state.ui?.console?.closeBehavior, explicitQuit)
  return performConsoleClose(action, false)
}

function openConsole() {
  if (consoleWin && !consoleWin.isDestroyed()) {
    consoleWin.show()
    consoleWin.focus()
    replayWindowState(consoleWin)
    setOverlayConsoleCollapsed(true)
    return
  }
  consoleWin = new BrowserWindow({
    width: 1080, height: 720, frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, show: false, resizable: true, minWidth: 860, minHeight: 600, alwaysOnTop: false, fullscreenable: false,
    title: '璃音 Lucent · 控制台',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, additionalArguments: rendererArguments() },
  })
  loadRoute(consoleWin, 'console')
  consoleWin.webContents.once('did-finish-load', () => replayWindowState(consoleWin))
  consoleWin.once('ready-to-show', () => {
    if (!consoleWin || consoleWin.isDestroyed()) return
    consoleWin.show()
    consoleWin.focus()
    setOverlayConsoleCollapsed(true)
  })
  consoleWin.on('close', (event) => {
    if (explicitQuit) return
    event.preventDefault()
    requestConsoleClose()
  })
  consoleWin.on('closed', () => {
    consoleWin = null
    setOverlayConsoleCollapsed(false)
  })
}

function createAudioService() {
  if (audioServiceWin && !audioServiceWin.isDestroyed()) return audioServiceWin
  audioServiceReady = false
  audioServiceWin = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: rendererArguments(),
    },
  })
  loadRoute(audioServiceWin, 'audio-service')
  audioServiceWin.on('closed', () => { audioServiceReady = false; audioServiceWin = null; pendingPlayerCommands.length = 0 })
  return audioServiceWin
}

function flushPendingPlayerCommands() {
  if (!audioServiceReady || !audioServiceWin || audioServiceWin.isDestroyed()) return
  audioServiceWin.webContents.send('player:command', { type: 'volume', value: state.cfg.internalPlayerVolume })
  while (pendingPlayerCommands.length && audioServiceWin && !audioServiceWin.isDestroyed()) {
    audioServiceWin.webContents.send('player:command', pendingPlayerCommands.shift())
  }
}

function sendPlayerCommand(command) {
  if (!audioServiceWin || audioServiceWin.isDestroyed()) return false
  if (!audioServiceReady) {
    // The hidden window can still be loading when the first search result is
    // clicked. Queueing here prevents the load command from being lost before
    // AudioService has subscribed to player:command.
    pendingPlayerCommands.push(command)
    return true
  }
  audioServiceWin.webContents.send('player:command', command)
  return true
}

// ---------- 桌面擷取（優化版）：讓玻璃折射視窗後方的真實桌面 ----------
let captureTimer = null
async function captureOnce() {
  if (!overlay || overlay.isDestroyed() || state.cfg.backdrop !== 'desktop') return
  const disp = screen.getPrimaryDisplay()
  const { width: dw, height: dh } = disp.size
  const factor = Math.min(1, 720 / dw) // 低解析度（玻璃會模糊，看不出）
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(dw * factor), height: Math.round(dh * factor) },
    })
    if (!overlay || overlay.isDestroyed()) return
    const src = sources.find((s) => String(s.display_id) === String(disp.id)) || sources[0]
    if (!src) return
    const jpeg = src.thumbnail.toJPEG(45)
    const b = overlay.getBounds()
    overlay.webContents.send('desktop:frame', {
      dataURL: 'data:image/jpeg;base64,' + jpeg.toString('base64'),
      disp: { x: disp.bounds.x, y: disp.bounds.y, w: dw, h: dh },
      win: { x: b.x, y: b.y },
    })
  } catch {}
}
function updateCapture() {
  const on = state.cfg.backdrop === 'desktop'
  if (overlay && !overlay.isDestroyed()) { try { overlay.setContentProtection(on) } catch {} }
  if (on && !captureTimer) { captureTimer = setInterval(captureOnce, 450); captureOnce() }
  if (!on && captureTimer) { clearInterval(captureTimer); captureTimer = null }
}

function popupOverlayMenu() {
  const labels = nativeUiLabels(state.ui?.locale, systemUiLocale())
  const menu = Menu.buildFromTemplate([
    {
      label: labels.openConsole,
      click: () => openConsole(),
    },
    { type: 'separator' },
    {
      label: labels.lockPosition,
      type: 'checkbox',
      checked: !!state.cfg.locked,
      click: () => { applyPatch({ cfg: { locked: !state.cfg.locked } }); broadcastState(); saveState() },
    },
  ])
  if (overlay && !overlay.isDestroyed()) menu.popup({ window: overlay })
}

// ---------- 房間事件 -> 畫面 ----------
room.on('state', (snapshot) => {
  if (room.mode !== 'member') return
  playback.update(SOURCE.ROOM_HOST, snapshot)
})
room.on('tick', (tick) => {
  if (room.mode !== 'member') return
  sendAll('room:tick', tick)
})
room.on('members', (m) => sendAll('room:members', m))
room.on('status', (st) => sendAll('room:status', st))
room.on('sync', (sync) => sendAll('room:status', { sync }))
room.on('queue', (queue) => sendAll('room:queue', queue))
room.on('capabilities', (capabilities) => sendAll('room:capabilities', capabilities))
room.on('commandResult', (result) => sendAll('room:commandResult', result))
room.on('styleOffer', (raw) => {
  try {
    const offer = createStyleOffer(raw)
    if (handledStyleOffers.has(offer.id) || pendingStyleOffers.has(offer.id)) return
    pendingStyleOffers.set(offer.id, offer)
    sendAll('room:styleOffer', offer)
  } catch {}
})
room.on('styleResponse', (response) => sendAll('room:styleResponse', response))

function activeRoomQueue() {
  if (!localPlaylists || !room.roomId) return []
  return localPlaylists.listRoomQueue(room.roomId).filter((entry) => entry.status === 'queued' || entry.status === 'playing')
}

function broadcastRoomQueue() {
  const queue = activeRoomQueue()
  if (room.mode === 'host') room.setQueue(queue)
  else sendAll('room:queue', queue)
  return queue
}

async function playRoomQueueEntry(queueEntryId) {
  const entry = activeRoomQueue().find((item) => item.id === String(queueEntryId || ''))
  if (!entry) return { ok: false, error: '找不到待播歌曲' }
  const response = await loadInternalTrack(entry.trackId)
  if (!response.ok) {
    localPlaylists.removeRoomQueueEntry(entry.id)
    broadcastRoomQueue()
    return response
  }
  if (activeRoomQueueEntryId && activeRoomQueueEntryId !== entry.id) {
    try { localPlaylists.removeRoomQueueEntry(activeRoomQueueEntryId) } catch {}
  }
  activeRoomQueueEntryId = entry.id
  localPlaylists.updateRoomQueueStatus(entry.id, 'playing')
  broadcastRoomQueue()
  return { ok: true }
}

// 回傳「有沒有真的接上下一首」，呼叫端才知道要不要改走內建播放器的佇列。
async function advanceRoomQueue() {
  if (room.mode !== 'host' || !activeRoomQueueEntryId || !localPlaylists) return false
  try { localPlaylists.removeRoomQueueEntry(activeRoomQueueEntryId) } catch {}
  activeRoomQueueEntryId = null
  const next = activeRoomQueue().find((entry) => entry.status === 'queued')
  broadcastRoomQueue()
  if (!next) return false
  await playRoomQueueEntry(next.id)
  return true
}

async function handleRoomCommand(command, sender) {
  const role = sender?.id === 'host' ? 'host' : 'member'
  if (!canExecuteRoomCommand(role, sender?.capabilities, command?.type)) return { ok: false, error: '房主尚未授予此權限' }
  const payload = command?.payload || {}

  if (command.type === 'song.request') {
    if (String(payload.provider || 'netease') !== 'netease') return { ok: false, error: '目前只支援網易雲歌曲' }
    const trackId = String(payload.trackId || '').trim()
    if (!trackId) return { ok: false, error: '歌曲 ID 無效' }
    if (role === 'member') {
      const pending = localPlaylists.countPendingRoomRequests(room.roomId, sender.id)
      const limited = roomRequestLimiter.check(sender.id, pending)
      if (!limited.ok) return limited
    }
    try {
      const detail = await netease.getSongDetail(trackId)
      if (!detail) throw new Error('找不到歌曲')
      const entry = localPlaylists.addRoomQueueEntry(room.roomId, {
        provider: 'netease', trackId, name: detail.name, artist: detail.artist,
        cover: detail.cover, durationMs: detail.durationMs,
        requesterId: sender.id, requesterName: sender.name || (role === 'host' ? '主持人' : '成員'),
      })
      broadcastRoomQueue()
      return { ok: true, data: entry }
    } catch (error) { return { ok: false, error: String(error.message || error) } }
  }
  if (command.type === 'queue.remove') {
    localPlaylists.removeRoomQueueEntry(payload.id); broadcastRoomQueue(); return { ok: true }
  }
  if (command.type === 'queue.move') {
    localPlaylists.moveRoomQueueEntry(payload.id, payload.position); broadcastRoomQueue(); return { ok: true }
  }
  if (command.type === 'playback.load') {
    return payload.queueEntryId ? playRoomQueueEntry(payload.queueEntryId) : loadInternalTrack(payload.trackId)
  }
  if (command.type === 'playback.seek') return runPlayerCommand('seek', { positionMs: Math.max(0, Number(payload.positionMs) || 0) })
  if (['playback.play', 'playback.pause', 'playback.toggle'].includes(command.type)) {
    return runPlayerCommand(command.type.slice('playback.'.length))
  }
  return { ok: false, error: '不支援的房間命令' }
}

room.on('command', ({ command, sender }) => {
  handleRoomCommand(command, sender).then((result) => {
    room.sendCommandResult(sender.id, { commandId: command.commandId, ...result })
  }).catch((error) => {
    room.sendCommandResult(sender.id, { commandId: command.commandId, ok: false, error: String(error.message || error) })
  })
})

// ---------- 從真正的網易雲(SMTC)偵測播放，自動同步字幕 ----------
function parseLrc(raw) {
  const rows = (raw || '').replace(/\r/g, '').split('\n')
  const tag = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const out = []
  for (const line of rows) {
    let m; const text = line.replace(tag, '').trim(); tag.lastIndex = 0
    while ((m = tag.exec(line))) {
      const t = (+m[1]) * 60 + (+m[2]) + (m[3] ? (+String(m[3]).padEnd(3, '0')) / 1000 : 0)
      if (text) out.push({ time: t, text })
    }
  }
  out.sort((a, b) => a.time - b.time)
  return { lines: out, timed: out.length > 0 }
}

// 解析 YRC 逐字歌詞：[行開始,行長度](字開始,字長度,0)字...
function parseYrc(raw) {
  const out = []
  for (const line of (raw || '').replace(/\r/g, '').split('\n')) {
    const head = line.match(/^\[(\d+),(\d+)\]/)
    if (!head) continue
    const words = []
    const re = /\((\d+),(\d+),\d+\)([^(]*)/g
    let m
    while ((m = re.exec(line))) {
      const text = m[3]
      if (text === '') continue
      words.push({ t: +m[1] / 1000, d: +m[2] / 1000, text })
    }
    if (!words.length) continue
    out.push({ time: +head[1] / 1000, text: words.map((w) => w.text).join(''), words })
  }
  out.sort((a, b) => a.time - b.time)
  return { lines: out, timed: out.length > 0 }
}

// 把翻譯依時間軸合併到歌詞行上（時間最接近者視為同一句）
function mergeTranslation(lines, transRaw) {
  const t = parseLrc(transRaw)
  if (!t.lines.length) return lines
  return lines.map((l) => {
    let best = null, bestDiff = Infinity
    for (const tl of t.lines) {
      const diff = Math.abs(tl.time - l.time)
      if (diff < bestDiff) { bestDiff = diff; best = tl }
    }
    // 只有時間夠接近才算同一句，避免亂配
    return bestDiff <= 0.6 && best && best.text ? { ...l, trans: best.text } : l
  })
}

const np = {
  title: '', artist: '', song: null, lines: [], timed: false, playPosMs: 0, playing: false, lastAt: 0,
  syncStatus: 'waiting-identity',
  transition: { token: 0, endedSongRevision: 0, endedSongId: null, readySongRevision: 0 },
}
const songRevision = createSongRevision()
let followApp = null // null = 自動判斷目前播放來源；否則跟隨指定來源 app
let lastSmtcIdentity = null
let lastDesktopDetectedAt = 0
let activeSmtcSourceAppId = ''
let activeSmtcSessionId = ''
let activeDesktopPlaybackSource = SOURCE.DESKTOP_NETEASE
let lastSmtcClockState = null
// ---- 統一播放時鐘 ----
// 來源可能是 SMTC（有明確 Playing/Paused + 位置）或 CDP（整數秒進度）。
// 任一來源更新就重新對時；其餘時間用經過時間內插。
const clk = { posMs: 0, at: 0, playing: false, src: '' }
function clkPos() { return clk.playing ? clk.posMs + (Date.now() - clk.at) : clk.posMs }
function clkSync(posMs, playing, src) {
  const est = clkPos()
  const diff = posMs - est
  const drift = Math.abs(diff)
  if (drift > 1200 || playing !== clk.playing || !clk.at || !playing) {
    // 拖動 / 換歌 / 播放狀態改變 / 暫停 → 直接對齊
    clk.posMs = posMs
    clk.at = Date.now()
  } else if (drift > 150) {
    // 中等偏差：逐步靠攏（每次修正 40%），避免字幕忽快忽慢又不會累積誤差
    clk.posMs = est + diff * 0.4
    clk.at = Date.now()
  } else {
    clk.posMs = est
    clk.at = Date.now()
  }
  clk.playing = playing
  clk.src = src
  np.playing = playing
  np.playPosMs = clk.posMs
  np.lastAt = clk.at
}
function estPosMs() { return clkPos() }
function sharedStyle() {
  return sharedAppearanceStyle(state)
}

function markNaturalSongEnd(incomingSongId = null) {
  const revision = Number(np.song?.revision) || 0
  if (!revision || np.transition.endedSongRevision === revision) return false
  if (!isNaturalSongEnd({ song: np.song, positionMs: estPosMs(), playing: np.playing, incomingSongId })) return false
  np.transition = {
    token: np.transition.token + 1,
    endedSongRevision: revision,
    endedSongId: np.song?.id ? String(np.song.id) : null,
    readySongRevision: 0,
  }
  return true
}

// SMTC / 視窗標題模式沒有可靠的「播放完畢」事件。當歌曲身分已確定
// 換成另一首時，仍要為舊歌曲建立一次破碎世代，避免直接跳到新封面。
// 已由自然結束路徑建立過的 revision 會被上面的去重條件擋住。
function markSongReplacement() {
  const revision = Number(np.song?.revision) || 0
  if (!revision || np.transition.endedSongRevision === revision) return false
  np.transition = {
    token: np.transition.token + 1,
    endedSongRevision: revision,
    endedSongId: np.song?.id ? String(np.song.id) : null,
    readySongRevision: 0,
  }
  return true
}

function markNextSongReady() {
  if (!isReadyToRebuild(np.transition, np.song, np.playing)) return false
  if (np.transition.readySongRevision === np.song.revision) return false
  np.transition = { ...np.transition, readySongRevision: np.song.revision }
  return true
}

function pushState() {
  markNextSongReady()
  const previous = playback.current()
  const snapshot = {
    song: np.song, lines: np.lines, timed: np.timed,
    positionMs: estPosMs(), playing: np.playing,
    sourceAppId: activeSmtcSourceAppId,
    sessionId: activeSmtcSessionId,
    mirror: np.mirror || null, // 鏡像自網易雲畫面的當前句（優先採用）
    syncStatus: np.syncStatus,
    transition: np.transition,
    capturedAt: Date.now(),
  }
  const selected = playback.update(activeDesktopPlaybackSource, snapshot)
  if (isDesktopSource(selected?.source) && shouldPauseInternalForDesktop({
    previousSource: previous?.source,
    desktopPlaying: snapshot.playing,
    internalPlaying: internalPlayer.playing,
  })) {
    sendPlayerCommand({ type: 'pause', revision: internalPlayer.revision, reason: 'desktop-takeover' })
  }
  if (room.mode === 'host') room.setState(selected)
}
function pushTick() {
  if (markNextSongReady()) pushState()
  const tick = { positionMs: estPosMs(), playing: np.playing }
  const selected = playback.updateClock(activeDesktopPlaybackSource, { ...tick, capturedAt: Date.now() })
  if (!isDesktopSource(selected?.source)) return
  if (room.mode === 'host') room.tick(tick)
  else if (room.mode !== 'member') sendAll('room:tick', tick)
}

// ---- CDP 精準進度（乾淨模型）----
// 網易雲只回報「整數秒」，播放時每秒跳一次，暫停時完全停止回報。
// 位置一律「由最後回報的秒 + 經過時間」推算，並限制不得超過下一秒太多；
// 這樣可自我校正，不會累積漂移，也不需要把狀態寫來寫去。
let cdpSec = -1      // 最後回報的整數秒
let cdpSecAt = 0     // 收到該秒的時刻
let cdpLastAt = 0    // 最後收到任何 CDP 事件的時刻
const posPrev = { vals: [], at: 0 } // 上一輪 input 取樣，用來辨識哪個是播放進度
let posIdx = -1                     // 已鎖定的進度 input 索引
const posLast = { ms: -1, at: 0 }   // 進度值最後變動的時間，用來判斷播放/暫停
const health = { driftMs: null, absAvg: null, at: 0 } // 同步健康度（字幕是否跟上唱速）
let mirrorKey = '' // 鏡像高亮句的去重鍵
let mirrorOrder = { capturedAt: 0, seq: 0 }
function cdpActive() { return Date.now() - cdpLastAt < 3000 }
function cdpHas() { return ncmcdp.isConnected() && cdpSec >= 0 }
function cdpPosMs() {
  if (cdpSec < 0) return 0
  return cdpSec * 1000 + Math.min(Date.now() - cdpSecAt, 1200) // 最多只補到下一秒
}
function cdpPlaying() { return cdpSec >= 0 && Date.now() - cdpSecAt < 2500 }

function clearDesktopSource() {
  const selectedPlayback = playback.current()
  // 啟動或加入房間時，仲裁器會先建立一個空的 desktop source。它不是
  // 真正的播放狀態，不能在 liveness grace 到期時把主持人的房間快照清掉。
  const hadDesktopState = !!np.song || !!np.mirror || !!clk.at
    || (isDesktopSource(selectedPlayback?.source) && !!selectedPlayback.song)
  if (!hadDesktopState) return false
  np.title = ''
  np.artist = ''
  np.song = null
  np.lines = []
  np.timed = false
  np.mirror = null
  np.syncStatus = 'idle'
  np.playPosMs = 0
  np.playing = false
  np.lastAt = 0
  np.transition = { token: np.transition.token, endedSongRevision: 0, endedSongId: null, readySongRevision: 0 }
  mirrorKey = ''
  mirrorOrder = { capturedAt: 0, seq: 0 }
  lastSmtcIdentity = null
  cdpSec = -1
  cdpSecAt = 0
  cdpLastAt = 0
  posIdx = -1
  posPrev.vals = []
  posPrev.at = 0
  posLast.ms = -1
  posLast.at = 0
  lastSmtcClockState = null
  clk.posMs = 0
  clk.at = 0
  clk.playing = false
  clk.src = ''
  const selected = playback.clearDesktop()
  activeDesktopPlaybackSource = SOURCE.DESKTOP_NETEASE
  activeSmtcSourceAppId = ''
  activeSmtcSessionId = ''
  if (room.mode === 'host') {
    room.setState(selected || { song: null, lines: [], timed: false, positionMs: 0, playing: false, mirror: null, syncStatus: 'idle' })
  }
  return true
}

function expireDesktopSource(now = Date.now()) {
  if (desktopSourceDisposition({ now, lastDetectedAt: lastDesktopDetectedAt }) !== 'clear') return false
  return clearDesktopSource()
}

// 用「網易雲正在播的確切歌曲 ID」載入歌詞（優先 YRC 逐字）→ 每首歌都精準
function resetSongRuntime(identity, ticket, playing) {
  const name = identity.name || identity.title || ''
  const artist = identity.artist || ''
  np.title = name
  np.artist = artist
  np.mirror = null
  np.syncStatus = identity.preciseMirror === false ? 'timeline' : 'waiting-identity'
  mirrorKey = ''
  mirrorOrder = { capturedAt: 0, seq: 0 }
  np.lines = []
  np.timed = false
  np.song = {
    id: identity.id || null,
    name: name || '載入中…',
    artist,
    album: identity.album || '',
    cover: identity.cover || '',
    durationMs: identity.durationMs || 0,
    artistImageUrl: identity.artistImageUrl || identity.avatar || '',
    avatar: identity.artistImageUrl || identity.avatar || '',
    loading: true,
    artworkReady: !!(identity.avatar || identity.cover),
    revision: ticket.revision,
  }

  cdpSec = -1
  cdpSecAt = 0
  posIdx = -1
  posPrev.vals = []
  posPrev.at = 0
  posLast.ms = -1
  posLast.at = 0
  lastSmtcClockState = null
  clk.at = 0
  clkSync(0, !!playing, 'song-change')
  pushState()
}

function beginSong(identity, source, playing = np.playing) {
  const next = { ...identity, id: identity.id ? String(identity.id) : null, source }
  const current = songRevision.current()
  if (current && sameTrackIdentity(current.identity, next)) return current
  const ticket = songRevision.begin(next)
  resetSongRuntime(next, ticket, playing)
  if (next.id) loadSongById(ticket).catch(() => {})
  else loadSongByMeta(ticket).catch(() => {})
  return ticket
}

function promoteCurrentSong(id, source = 'cdp', metadata = {}) {
  const current = songRevision.current()
  if (!current || current.identity.id || !id) return null
  const providerMetadata = {
    ...metadata,
    name: current.identity.name || metadata.name,
    artist: current.identity.artist || metadata.artist,
  }
  const ticket = songRevision.promote(current, { ...providerMetadata, id, source })
  if (!ticket) return null

  np.title = providerMetadata.name || np.title
  np.artist = providerMetadata.artist || np.artist
  np.song = {
    ...np.song,
    id: ticket.identity.id,
    name: providerMetadata.name || np.song?.name || np.title,
    artist: providerMetadata.artist || np.song?.artist || np.artist,
    loading: true,
    artworkReady: !!(np.song?.avatar || np.song?.cover),
    revision: ticket.revision,
  }
  pushState()
  loadSongById(ticket).catch(() => {})
  return ticket
}

async function loadSongById(ticket) {
  const id = ticket.identity.id
  let detail = null
  try { detail = await netease.getSongDetail(id) } catch {}
  if (!songRevision.isCurrent(ticket)) return

  if (detail) {
    np.title = ticket.identity.name || detail.name
    np.artist = ticket.identity.artist || detail.artist
    np.song = {
      ...detail,
      name: ticket.identity.name || detail.name,
      artist: ticket.identity.artist || detail.artist,
      album: ticket.identity.album || detail.album,
      cover: ticket.identity.cover || detail.cover,
      durationMs: ticket.identity.durationMs || detail.durationMs,
      artistImageUrl: ticket.identity.artistImageUrl || ticket.identity.avatar || '',
      avatar: ticket.identity.artistImageUrl || ticket.identity.avatar || '',
      loading: true,
      artworkReady: !!(ticket.identity.avatar || ticket.identity.cover),
      revision: ticket.revision,
    }
    pushState()
  }

  // 一般 LRC 是切歌恢復的必要資料；YRC 只是逐字效果的可選升級。
  // 不能讓 CDP 請求（最慢 6 秒）卡住新歌與破碎過場的回復。
  const pair = await netease.getLyricPair(id).catch(() => ({ yrc: '', lrc: '', trans: '' }))
  if (!songRevision.isCurrent(ticket)) return

  const wordTimed = parseYrc(pair.yrc)
  const parsed = wordTimed.lines.length ? wordTimed : parseLrc(pair.lrc)
  np.lines = pair.trans ? mergeTranslation(parsed.lines, pair.trans) : parsed.lines
  np.timed = parsed.timed
  const needsArtistAvatar = !!detail?.artistId && !np.song?.artistImageUrl
  np.song = {
    ...np.song,
    avatar: np.song.artistImageUrl || '',
    loading: false,
    artworkReady: !needsArtistAvatar,
    revision: ticket.revision,
  }
  pushState()

  if (ncmcdp.isConnected()) {
    ncmcdp.fetchYrc(id).then((yrc) => {
      if (!songRevision.isCurrent(ticket) || !yrc || yrc.length <= 20) return
      const yrcParsed = parseYrc(yrc)
      if (!yrcParsed.lines.length) return
      np.lines = pair.trans ? mergeTranslation(yrcParsed.lines, pair.trans) : yrcParsed.lines
      np.timed = yrcParsed.timed
      pushState()
    }).catch(() => {})
  }

  if (needsArtistAvatar) {
    const avatar = await netease.getArtistAvatar(detail.artistId).catch(() => '')
    if (songRevision.isCurrent(ticket)) {
      np.song = {
        ...np.song,
        artistImageUrl: avatar || '',
        avatar: avatar || '',
        artworkReady: true,
      }
      pushState()
    }
  }
}

async function loadSongByMeta(ticket) {
  const { name, title, artist } = ticket.identity
  const wantedTitle = name || title || ''
  if (!shouldResolveLyrics(ticket.identity)) {
    if (!songRevision.isCurrent(ticket) || ticket.identity.id) return
    np.song = { ...np.song, loading: false, artworkReady: true }
    pushState()
    return
  }
  let results = []
  try { results = await netease.searchSongs(`${wantedTitle} ${artist || ''}`.trim(), 8) } catch {}
  if (!songRevision.isCurrent(ticket)) return
  if (ticket.identity.id) return
  const hit = selectBestTrackMatch(ticket.identity, results)
  if (!hit) {
    np.song = { ...np.song, loading: false, artworkReady: true }
    pushState()
    return
  }
  promoteCurrentSong(hit.id, 'search', { name: hit.name, artist: hit.artist })
}

function onCdp(d) {
  // 另一個 Windows 媒體來源正在使用時，背景中的網易雲 CDP 不得搶回歌曲與時鐘。
  if (activeSmtcSourceAppId && !NETEASE_RE.test(activeSmtcSourceAppId)) return
  cdpLastAt = Date.now()
  if (d?.songId != null || d?.lyric || Number.isFinite(Number(d?.progressSec))) {
    lastDesktopDetectedAt = cdpLastAt
  }
  if (room.mode === 'member') return
  if (d.songId != null) {
    const nextId = String(d.songId)
    if (d.songIdSource === 'playback') {
      const current = songRevision.current()
      if (!current || current.identity.id !== nextId) {
        if (current && !current.identity.id) promoteCurrentSong(nextId, 'cdp')
        else {
          if (!markNaturalSongEnd(nextId)) markSongReplacement()
          beginSong({ id: nextId }, 'cdp', np.playing)
        }
      }
    }
  }
  // 鏡像網易雲畫面上正在高亮的那一句：它由網易雲自己決定，
  // 完全不需要時間軸計算，天生同步（同步問題的根本解）。
  if (shouldProcessMirrorSnapshot(d)) {
    const activeSongId = songRevision.current()?.identity?.id
    const mirrorDisposition = mirrorSyncDisposition({ activeSongId, lyric: d.lyric })
    if (mirrorDisposition !== 'exact') {
      if (np.mirror || np.syncStatus !== mirrorDisposition) {
        np.mirror = null
        np.syncStatus = mirrorDisposition
        mirrorKey = ''
        mirrorOrder = { capturedAt: 0, seq: 0 }
        pushState()
      }
    } else if (isFreshMirrorSnapshot(mirrorOrder, d.lyric)) {
      mirrorOrder = { capturedAt: d.lyric.capturedAt, seq: d.lyric.seq }
      const key = d.lyric.songId + '|' + d.lyric.i + '|' + d.lyric.main
      if (key !== mirrorKey || np.syncStatus !== 'exact') {
        mirrorKey = key
        np.syncStatus = 'exact'
        np.mirror = {
          songId: String(d.lyric.songId),
          i: d.lyric.i,
          text: d.lyric.main || '',
          trans: d.lyric.sub || '',
          at: Date.now(),
        }
        pushState()
      }
    }
  }
  const directProgress = Number(d.progressSec)
  const hasDirectProgress = Number.isFinite(directProgress) && directProgress >= 0
  const positionVals = hasDirectProgress ? [directProgress] : d.vals
  if (Array.isArray(positionVals)) {
    // 從網易雲進度條 input 取播放秒數：可能有多個 input（音量等），
    // 挑出「以約 1 倍速前進」的那個當作播放位置。
    const now = Date.now()
    if (posPrev.at) {
      // 比對窗口必須明顯大於進度值的更新週期（實測約每秒才更新一次），
      // 否則 250ms 內算出的速率不是 0 就是 4，永遠判定不出「1 倍速」而鎖不到來源。
      const dtSec = (now - posPrev.at) / 1000
      if (dtSec > 1.5) {
        // 找出「以約 1 倍速前進」的 input 當作播放進度。
        // 音量等其他 input 不會自己往前跑，所以只要是持續遞增的就是它。
        let best = -1, bestScore = -1
        for (let i = 0; i < positionVals.length; i++) {
          const prev = posPrev.vals[i]
          if (prev == null) continue
          const rate = (positionVals[i] - prev) / dtSec
          if (rate > 0.25 && rate < 3.0) { // 放寬範圍，避免因取樣抖動鎖不上
            const score = 1 - Math.min(1, Math.abs(rate - 1))
            if (score > bestScore) { bestScore = score; best = i }
          }
        }
        if (!hasDirectProgress && best >= 0) posIdx = best
        posPrev.vals = positionVals.slice()
        posPrev.at = now
      }
    } else {
      posPrev.vals = positionVals.slice()
      posPrev.at = now
    }
    if (hasDirectProgress) posIdx = 0
    if (posIdx >= 0 && positionVals[posIdx] != null) {
      const posMs = Math.round(positionVals[posIdx] * 1000)
      // 進度值約每秒才更新一次。若每次輪詢都拿它對時，大部分時候是「舊值」，
      // 會讓時鐘被反覆往回拉 → 誤差來回震盪（實測 ±350ms）。
      // 因此只在「值真的變了」的那一刻對時（此時就是真實位置），其餘時間讓時鐘自走。
      const changed = Math.abs(posMs - posLast.ms) > 120
      if (changed) { posLast.ms = posMs; posLast.at = Date.now() }
      const playing = resolveCdpPlaying({
        playState: d.playState,
        lastProgressAt: posLast.at,
        now: Date.now(),
      })
      cdpSec = Math.floor(posMs / 1000)
      // 同一個 slider 值會在每次 CDP 輪詢重複回來；只有值真的變動時
      // 才更新「最後收到播放進度」時間，否則暫停後永遠不會進入安全停格。
      cdpSecAt = changed ? Date.now() : cdpSecAt
      if (changed || !clk.at || playing !== clk.playing) {
        // 健康度只在「新鮮讀數」時量測。舊值會讓時鐘看起來偏移，
        // 那是讀數過期造成的假象，不是真的不同步。
        if (clk.at && changed) {
          const drift = posMs - clkPos()
          health.driftMs = Math.round(drift)
          health.absAvg = health.absAvg == null
            ? Math.abs(drift) : health.absAvg * 0.8 + Math.abs(drift) * 0.2
          health.at = Date.now()
        }
        // 播放速度恆為 1 倍速，所以時鐘本身就會走得準；
        // 讀數抵達延遲卻是浮動的（CDP 往返 50~150ms 不等）。
        // 若每次讀數都大幅校正，時鐘會被反覆推拉 → 字幕忽快忽慢。
        // 因此：只有大偏差（拖動/換歌/暫停）才重新定錨；平時只做極輕微的漂移修正。
        const err = posMs - clkPos()
        clk.posMs = (!clk.at || Math.abs(err) > 700 || playing !== clk.playing)
          ? posMs
          : clkPos() + err * 0.08
        clk.at = Date.now()
        clk.playing = playing
        clk.src = 'cdp'
        np.playing = playing
        np.playPosMs = posMs
        np.lastAt = clk.at
      } else {
        clk.playing = playing // 只更新播放狀態，不動位置
        np.playing = playing
      }
    }
  }
  const explicitPlaying = playbackStateToPlaying(d.playState)
  if (explicitPlaying !== null && explicitPlaying !== clk.playing) {
    clkSync(clkPos(), explicitPlaying, 'cdp-state')
    pushTick()
  }
}

// 定時推送目前位置給畫面；並在來源都沉默太久時判定為暫停
setInterval(() => {
  expireDesktopSource()
  if (room.mode === 'member') return
  if (!clk.at) return
  // CDP 是播放中的主要心跳：超過 2.5 秒沒有新的秒 → 視為暫停（網易雲暫停時不回報）
  if (clk.playing && clk.src === 'cdp' && Date.now() - cdpSecAt > 2500) {
    clkSync(clkPos(), false, 'cdp')
  }
  if (markNaturalSongEnd()) pushState()
  pushTick()
}, 250)

const NETEASE_RE = /cloudmusic|netease|网易|網易/i
const ownMediaSourceAppIds = new Set([
  path.basename(process.execPath).toLowerCase(),
  path.basename(process.execPath, path.extname(process.execPath)).toLowerCase(),
  String(app.getName() || '').toLowerCase(),
  'electron.exe',
])
async function onSmtc(data) {
  // The hidden internal <audio> element publishes its own Windows media
  // session. It is not an external player and must never replace the
  // internal-player source with an empty desktop snapshot.
  const sessions = (data.sessions || []).filter((session) => !isOwnMediaSession(session, ownMediaSourceAppIds))
  const nzTitle = (data.netease || '').trim() // 網易雲桌面版視窗標題「歌 - 歌手」

  const detected = sessions.map((s) => ({
    app: s.sourceAppId,
    sourceAppId: s.sourceAppId,
    title: s.title,
    status: s.playbackStatus,
  }))
  if (nzTitle) detected.unshift({ app: '網易雲桌面版', title: nzTitle, status: '視窗標題' })

  // 選來源：指定來源 > 真正活躍的 SMTC 工作階段 > 網易雲桌面版視窗標題退路。
  let cur = null, hasPos = false
  const selectedSession = activeSessionResolver.resolve(sessions, { manualSourceAppId: followApp })
  if (selectedSession) {
    const identity = desktopSessionIdentity(selectedSession)
    cur = {
      ...identity,
      title: identity.name,
      position: selectedSession.position || 0,
      duration: selectedSession.duration || 0,
      playing: selectedSession.playbackStatus === 'Playing',
      isNetease: identity.preciseMirror,
    }
    hasPos = true
  }
  // 視窗標題沒有播放狀態或進度，只能在完全沒有 SMTC 來源時使用；
  // 不能覆蓋仲裁器保留下來的暫停歌曲，否則網易雲開著但沒播放也會誤切歌。
  if (!followApp && nzTitle && !cur) {
    const p = nzTitle.split(' - ')
    cur = {
      sourceAppId: '網易雲桌面版',
      sessionId: 'netease-window-title',
      title: p[0].trim(),
      artist: p.slice(1).join(' - ').trim(),
      position: 0,
      duration: 0,
      playing: true,
      isNetease: true,
    }
    hasPos = false
  }

  const previousSmtcSourceAppId = activeSmtcSourceAppId
  // A single GSMTC scan can temporarily omit the active application. Keep
  // its identity during the existing liveness grace period so background
  // NetEase CDP events cannot take over a Spotify/YouTube/generic source.
  // clearDesktopSource() remains the only place that drops the identity once
  // the grace period has actually expired.
  if (cur) {
    activeSmtcSourceAppId = cur.sourceAppId
    activeSmtcSessionId = cur.sessionId || ''
    activeDesktopPlaybackSource = cur.playbackSource || desktopSourceId(cur)
  }
  const activeSourceChanged = !!previousSmtcSourceAppId
    && previousSmtcSourceAppId !== activeSmtcSourceAppId

  const cdpStatus = ncmcdp.getStatus()
  sendAll('np:info', {
    detected, following: followApp, matched: !!cur, cdp: cdpStatus.connected,
    lyricMirror: cdpStatus.directLyricEvents > 0,
    lyricMirrorLastAt: cdpStatus.lastDirectLyricAt,
    posLocked: cur ? (!cur.isNetease || posIdx >= 0) : false,
    health: (Date.now() - health.at < 4000)
      ? { driftMs: health.driftMs, avgMs: health.absAvg == null ? null : Math.round(health.absAvg) }
      : null,
    current: cur ? { app: cur.isNetease && ncmcdp.isConnected() ? '網易雲(精準CDP)' : cur.sourceAppId, title: cur.title, artist: cur.artist, status: cur.playing ? 'Playing' : 'Paused' } : null,
  })

  if (cur) lastDesktopDetectedAt = Date.now()
  if (room.mode === 'member') return
  if (!cur) return

  const smtcIdentity = {
    name: cur.title,
    artist: cur.artist,
    album: cur.album,
    durationMs: cur.durationMs,
  }
  const smtcChanged = !sameTrackIdentity(lastSmtcIdentity, smtcIdentity)
  if (smtcChanged) lastSmtcIdentity = smtcIdentity
  else {
    // 同一首歌的 GSMTC 欄位可能分批補齊；只補身份資料，不重跑切歌／清空封面。
    lastSmtcIdentity = {
      ...lastSmtcIdentity,
      album: smtcIdentity.album || lastSmtcIdentity.album,
      durationMs: smtcIdentity.durationMs || lastSmtcIdentity.durationMs,
    }
  }
  const active = songRevision.current()
  const hasAuthoritativeCdpId = canTrustCdpSongIdentity({
    identity: active?.identity,
    isNeteaseSource: cur.isNetease,
    cdpConnected: ncmcdp.isConnected(),
    cdpFresh: cdpActive(),
  })
  if (smtcChanged && !hasAuthoritativeCdpId) {
    markSongReplacement()
    beginSong({
      name: cur.title,
      artist: cur.artist,
      album: cur.album,
      cover: cur.cover,
      avatar: cur.avatar,
      artistImageUrl: cur.artistImageUrl,
      durationMs: cur.durationMs,
      sourceAppId: cur.sourceAppId,
      playbackSource: cur.playbackSource || desktopSourceId(cur),
      preciseMirror: cur.isNetease,
    }, 'smtc', hasPos ? !!cur.playing : true)
  } else if (activeSourceChanged) {
    np.mirror = null
    mirrorKey = ''
    mirrorOrder = { capturedAt: 0, seq: 0 }
    np.syncStatus = cur.isNetease ? 'waiting-identity' : 'timeline'
    pushState()
  }

  if (hasPos) {
    if (cur.isNetease) {
      // 實測：網易雲回報給 Windows 的位置永遠是 0；沿用 CDP 或自走時鐘。
      if (cdpSec >= 0) {
        if (!!cur.playing !== clk.playing) clkSync(clkPos(), !!cur.playing, 'cdp+state')
      } else {
        clkSync(clkPos(), !!cur.playing, 'freerun')
      }
    } else {
      const clock = smtcClockDecision(lastSmtcClockState, cur)
      lastSmtcClockState = clock
      if (clock.shouldAnchor) clkSync(clock.positionMs, clock.playing, 'smtc')
      else if (clock.playingChanged) clkSync(clkPos(), clock.playing, 'smtc-state')
    }
    pushTick()
  } else if (!ncmcdp.isConnected()) {
    // 視窗標題模式（最後退路）：讀不到位置也讀不到暫停，只能依真實時間推進
    clkSync(clkPos(), true, 'title')
    pushTick()
  }
}

// ---------- IPC：設定狀態 ----------
ipcMain.handle('state:get', () => state)
ipcMain.handle('state:set', (_e, patch) => {
  applyPatch(patch)
  if (patch.cfg && 'alwaysOnTop' in patch.cfg && overlay) overlay.setAlwaysOnTop(!!state.cfg.alwaysOnTop, 'screen-saver')
  if (patch.cfg && 'backdrop' in patch.cfg) updateCapture()
  if (patch.ui) refreshTrayMenu()
  broadcastState()
  // 具名配置是使用者手動調出來、掉了就重建不回來的資料，不能等 debounce
  saveState({ immediate: 'profiles' in patch })
})

// 僅清除璃音自己的本機資料；憑證、資料庫路徑與 Cookie 永不送到 Renderer。
ipcMain.handle('privacy:summary', () => privacyService?.summary() || {
  accountStored: false, libraryStored: false, settingsStored: false,
})
ipcMain.handle('privacy:erase', (_e, scope) => {
  const result = privacyService?.erase(scope) || { ok: false, error: '資料服務尚未就緒' }
  if (!result.ok) return result
  if (scope === 'account') {
    try { netease.setCookie('') } catch {}
  }
  if (scope === 'library') {
    activeRoomQueueEntryId = null
    broadcastRoomQueue()
  }
  if (scope === 'settings') {
    restartUpdateService()
    updateCapture()
    enforceBounds()
    broadcastState()
  }
  return result
})

// ---------- IPC：視窗 ----------
ipcMain.handle('overlay:setSize', (_e, w, h, mx, my) => {
  if (!overlay || overlay.isDestroyed()) return
  if (Number.isFinite(mx)) inset.x = Math.max(0, Math.round(mx))
  if (Number.isFinite(my)) inset.y = Math.max(0, Math.round(my))
  const wa = screen.getPrimaryDisplay().workAreaSize
  const b = overlay.getBounds()
  const cx = b.x + b.width / 2, bottom = b.y + b.height
  const nw = Math.min(Math.round(wa.width * 0.96), Math.max(60, Math.round(w)))
  const nh = Math.max(36, Math.round(h))
  overlay.setBounds({ x: Math.round(cx - nw / 2), y: Math.round(bottom - nh), width: nw, height: nh })
  // 尺寸一變就重新驗證位置：字級/唱片/雙語/長歌詞造成變大時不會被推出螢幕
  enforceBounds()
})
ipcMain.handle('overlay:getBounds', () => (overlay ? overlay.getBounds() : null))
async function captureOverlayRegion(rect) {
  if (!overlay || overlay.isDestroyed()) return null
  try {
    const image = await Promise.race([
      overlay.webContents.capturePage(rect, { stayHidden: true, stayAwake: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('capture page timeout')), 500)),
    ])
    return image && !image.isEmpty() ? image.toDataURL() : null
  } catch (error) {
    return null
  }
}
function normalizeCaptureRect(crop = {}) {
  if (!overlay || overlay.isDestroyed()) return null
  const [contentWidth, contentHeight] = overlay.getContentSize()
  const x = Math.max(0, Math.min(contentWidth - 1, Math.floor(Number(crop.x) || 0)))
  const y = Math.max(0, Math.min(contentHeight - 1, Math.floor(Number(crop.y) || 0)))
  const width = Math.max(1, Math.min(contentWidth - x, 1600, Math.ceil(Number(crop.width) || 1)))
  const height = Math.max(1, Math.min(contentHeight - y, 600, Math.ceil(Number(crop.height) || 1)))
  return { x, y, width, height }
}
// 這是單向 IPC：擷取由主行程在目前 IPC callback 結束後啟動，
// 避免 Renderer 正在等待 invoke 回覆時和 Chromium compositor 互相等待。
ipcMain.on('overlay:capturePill:start', (event, { requestId, crop } = {}) => {
  if (!overlay || overlay.isDestroyed() || event.sender !== overlay.webContents || requestId == null) return
  const rect = normalizeCaptureRect(crop)
  if (!rect) {
    event.sender.send('overlay:capturePill:result', { requestId, dataUrl: null })
    return
  }
  setImmediate(async () => {
    const dataUrl = await captureOverlayRegion(rect)
    if (!event.sender.isDestroyed()) event.sender.send('overlay:capturePill:result', { requestId, dataUrl })
  })
})
// 拖曳中就即時夾限（不是放開滑鼠才拉回來）
ipcMain.handle('overlay:setPosition', (_e, x, y) => {
  if (!overlay || overlay.isDestroyed()) return
  const b = overlay.getBounds()
  const p = clampPoint({ x: Math.round(x), y: Math.round(y), width: b.width, height: b.height })
  overlay.setPosition(p.x, p.y)
})
ipcMain.handle('overlay:setIgnoreMouse', (_e, ignore) => { if (overlay) overlay.setIgnoreMouseEvents(!!ignore, { forward: true }) })
ipcMain.handle('menu:popup', () => popupOverlayMenu())
ipcMain.handle('console:open', () => openConsole())
ipcMain.handle('console:close', () => requestConsoleClose())
ipcMain.handle('console:close-with', (_e, { action, remember } = {}) => performConsoleClose(action, remember === true))
ipcMain.handle('console:show-pill', () => performConsoleClose('pill'))
ipcMain.handle('console:hide-to-tray', () => performConsoleClose('tray'))
ipcMain.handle('app:quit', () => requestFinalQuit())

// ---------- IPC：應用程式更新 ----------
ipcMain.handle('update:snapshot', () => updateService?.snapshot() || {
  mode: 'disabled', status: 'disabled', currentVersion: app.getVersion(), reason: '更新服務尚未就緒',
})
ipcMain.handle('update:check', () => updateService?.check() || { ok: false, error: '更新服務尚未就緒' })
ipcMain.handle('update:download', () => updateService?.download() || { ok: false, error: '更新服務尚未就緒' })
ipcMain.handle('update:install', () => updateService?.install() || { ok: false, error: '更新服務尚未就緒' })
ipcMain.handle('update:setSettings', (_e, patch = {}) => {
  state.updates = {
    autoCheck: patch.autoCheck === undefined ? state.updates.autoCheck : patch.autoCheck !== false,
    channel: patch.channel === 'beta' ? 'beta' : (patch.channel === undefined ? state.updates.channel : 'stable'),
  }
  broadcastState(); saveState(); restartUpdateService()
  return { ok: true, data: state.updates }
})

// ---------- IPC：房間 ----------
ipcMain.handle('room:host', async (_e, opts) => {
  const result = await room.startHost(opts)
  if (result?.ok) {
    playback.setMode('host')
    activeRoomQueueEntryId = null
    for (const entry of activeRoomQueue()) {
      if (entry.status === 'playing') localPlaylists.updateRoomQueueStatus(entry.id, 'queued')
    }
    broadcastRoomQueue()
    pushState()
    updateService?.notifySafetyChanged()
  }
  return result
})
ipcMain.handle('room:join', (_e, opts) => {
  const joined = room.join(opts)
  if (!joined?.ok) return joined
  playback.setMode('member')
  if (internalPlayer.playing) {
    sendPlayerCommand({ type: 'pause', revision: internalPlayer.revision, reason: 'room-member' })
  }
  return joined
})
ipcMain.handle('room:leave', () => {
  room.close()
  activeRoomQueueEntryId = null
  playback.setMode(null)
  playback.clear(SOURCE.ROOM_HOST)
  pendingStyleOffers.clear()
  sendAll('room:status', { mode: null, closed: true })
  sendAll('room:members', [])
  pushState()
  updateService?.notifySafetyChanged()
  return { ok: true }
})
ipcMain.handle('room:setState', (_e, s) => room.setState(s))
ipcMain.handle('room:tick', (_e, t) => room.tick(t))
if (RUNTIME_QA) {
  ipcMain.handle('room:qaState', (_event, snapshot) => {
    playback.setMode('member')
    playback.update(SOURCE.ROOM_HOST, snapshot)
    return { ok: true }
  })
  ipcMain.handle('room:qaTick', (_event, tick) => {
    sendAll('room:tick', tick)
    return { ok: true }
  })
}
ipcMain.handle('room:snapshot', () => ({
  ...room.snapshot(),
  // 成員重連期間房間快照仍是主持人的權威狀態；播放仲裁器可能被本機
  // 背景媒體來源刷新成空值，不能因此把已保留的房間狀態清掉。
  state: room.mode === 'member' ? room.state : playback.current(),
}))
ipcMain.handle('room:lanip', () => getLanIp())
// All usable addresses, so the host can pick the one their guests can actually
// reach (LAN vs VPN adapter) instead of being given one automatically.
ipcMain.handle('room:lanips', () => listLanIps())
ipcMain.handle('room:command', async (_e, { type, payload } = {}) => {
  const command = { commandId: randomUUID(), type: String(type || ''), payload: payload || {} }
  if (room.mode === 'host') {
    return { commandId: command.commandId, ...(await handleRoomCommand(command, {
      id: 'host', name: room.hostName || '主持人', capabilities: {},
    })) }
  }
  if (room.mode === 'member') {
    return room.sendCommand(command)
      ? { ok: true, pending: true, commandId: command.commandId }
      : { ok: false, error: '尚未連線到房主' }
  }
  return { ok: false, error: '目前不在房間中' }
})
ipcMain.handle('room:setCapabilities', (_e, { memberId, capabilities } = {}) => {
  if (room.mode !== 'host') return { ok: false, error: '只有房主可以授權' }
  const ok = room.setCapabilities(memberId, normalizeCapabilities(capabilities))
  return ok ? { ok: true } : { ok: false, error: '找不到房間成員' }
})
ipcMain.handle('room:pendingOffers', () => [...pendingStyleOffers.values()])
ipcMain.handle('room:offerStyle', (_e, { targetId, name } = {}) => {
  if (!canSendStyleOffer(room.mode, targetId)) return { ok: false, error: '此身分不能傳送到該對象' }
  const sender = room.mode === 'host'
    ? { id: 'host', name: room.hostName || '主持人' }
    : { id: room.selfId, name: room.selfName || '成員' }
  try {
    const offer = createStyleOffer({
      id: randomUUID(), sender, target: targetId, style: sharedStyle(), name, createdAt: Date.now(),
    })
    return room.sendStyleOffer(targetId, offer)
      ? { ok: true, offer }
      : { ok: false, error: '對方尚未連線' }
  } catch (error) {
    return { ok: false, error: String(error.message || error) }
  }
})
ipcMain.handle('room:respondStyleOffer', (_e, { requestId, accepted } = {}) => {
  const offer = pendingStyleOffers.get(requestId)
  if (!offer) return { ok: false, error: '提案已處理或不存在' }
  if (!handleStyleOfferOnce(handledStyleOffers, requestId)) return { ok: false, error: '提案已處理' }
  pendingStyleOffers.delete(requestId)

  if (accepted) {
    const stamp = new Date().toISOString()
    state = applyAcceptedStyleOffer(state, offer, {
      profileId: randomUUID(),
      now: stamp,
      profileName: `來自 ${offer.sender.name}－${new Date().toLocaleString('zh-TW')}`,
      defaults: SCHEMA.cfg,
    })
    broadcastState()
    saveState()
  }

  room.respondStyleOffer({ requestId, targetId: offer.sender.id, accepted: !!accepted })
  sendAll('room:styleOfferHandled', { requestId, accepted: !!accepted })
  return { ok: true, accepted: !!accepted }
})

// ---------- IPC：網易雲 ----------
ipcMain.handle('netease:search', async (_e, kw) => {
  try { return { ok: true, data: await netease.searchSongs(kw) } } catch (e) { return { ok: false, error: String(e.message || e) } }
})
ipcMain.handle('netease:lyric', async (_e, id) => {
  try { return { ok: true, data: await netease.getLyric(id) } } catch (e) { return { ok: false, error: String(e.message || e) } }
})

// 網易雲掃碼登入（主持人連接自己的帳號）
ipcMain.handle('netease:loginQr', async () => {
  try { return { ok: true, ...(await netease.loginQr()) } } catch (e) { return { ok: false, error: String(e.message || e) } }
})
ipcMain.handle('netease:loginCheck', async (_e, key) => {
  try {
    const r = await netease.loginCheck(key)
    if (r.cookie) saveCookie(r.cookie)
    return { ok: true, code: r.code, message: r.message, profile: r.profile || null } // 不回傳 cookie 給畫面
  } catch (e) { return { ok: false, error: String(e.message || e) } }
})
ipcMain.handle('netease:loginStatus', async () => {
  try { return { ok: true, profile: await netease.loginStatus() } } catch (e) { return { ok: false, error: String(e.message || e) } }
})
ipcMain.handle('netease:userPlaylists', async () => {
  try {
    const profile = await netease.loginStatus()
    if (!profile?.userId) return { ok: false, error: '請先登入網易雲' }
    return { ok: true, data: await netease.getUserPlaylists(profile.userId) }
  } catch (e) { return { ok: false, error: String(e.message || e) } }
})
ipcMain.handle('netease:playlistTracks', async (_e, id) => {
  try {
    if (!String(id || '').trim()) throw new Error('歌單 ID 無效')
    return { ok: true, data: await netease.getPlaylistTracks(id) }
  } catch (e) { return { ok: false, error: String(e.message || e) } }
})
ipcMain.handle('netease:logout', async () => {
  try { await netease.logout(); saveCookie(''); return { ok: true } } catch (e) { return { ok: false, error: String(e.message || e) } }
})

// ---------- IPC：璃音本機歌單（SQLite；不修改網易雲帳號內的歌單） ----------
function localPlaylistCall(action) {
  try {
    if (!localPlaylists) throw new Error('本機歌單尚未就緒')
    return { ok: true, data: action(localPlaylists) }
  } catch (error) {
    return { ok: false, error: String(error.message || error) }
  }
}
ipcMain.handle('localPlaylist:list', () => localPlaylistCall((store) => store.listPlaylists()))
ipcMain.handle('localPlaylist:create', (_e, name) => localPlaylistCall((store) => store.createPlaylist(name)))
ipcMain.handle('localPlaylist:rename', (_e, { id, name } = {}) => localPlaylistCall((store) => store.renamePlaylist(id, name)))
ipcMain.handle('localPlaylist:delete', (_e, id) => localPlaylistCall((store) => store.deletePlaylist(id)))
ipcMain.handle('localPlaylist:items', (_e, playlistId) => localPlaylistCall((store) => store.listItems(playlistId)))
ipcMain.handle('localPlaylist:add', (_e, { playlistId, item } = {}) => localPlaylistCall((store) => store.addItem(playlistId, item)))
ipcMain.handle('localPlaylist:remove', (_e, id) => localPlaylistCall((store) => store.removeItem(id)))
ipcMain.handle('localPlaylist:move', (_e, { id, position } = {}) => localPlaylistCall((store) => store.moveItem(id, position)))

// ---------- IPC：內建播放器 ----------
function playerDecision() {
  const selected = playback.current()
  const result = playerControlDecision({
    roomMode: room.mode,
    enabled: unofficialPlaybackAllowed,
    activeSource: selected?.playing ? selected.source : SOURCE.IDLE,
  })
  return result.ok ? result : { ...result, errorCode: playerErrorCode(result.error) }
}

function playerPublicSnapshot() {
  return {
    enabled: unofficialPlaybackAllowed,
    reason: unofficialPlaybackAllowed ? '' : '商用封裝版尚未取得官方網易雲播放授權',
    reasonCode: unofficialPlaybackAllowed ? '' : PLAYER_ERROR_CODES.PROVIDER_UNAVAILABLE,
    source: playback.current()?.source || SOURCE.IDLE,
    song: internalPlayer.song ? { ...internalPlayer.song } : null,
    positionMs: internalPlayer.positionMs,
    durationMs: internalPlayer.durationMs,
    playing: internalPlayer.playing,
    loading: internalPlayer.loading,
    error: internalPlayer.error,
    errorCode: playerErrorCode(internalPlayer.error),
    queue: queueSnapshot(),
  }
}

function emitPlayerChanged() {
  sendAll('player:changed', playerPublicSnapshot())
}

function publishInternalState() {
  const selected = playback.update(SOURCE.INTERNAL, internalSnapshot(internalPlayer))
  if (room.mode === 'host' && selected?.source === SOURCE.INTERNAL) room.setState(selected)
  emitPlayerChanged()
  return selected
}

// 內建播放器的播放佇列。
//
// 上一首／下一首必須有真的東西可以走，不能只是擺兩顆按不動的按鈕。
// 佇列來自使用者實際點播的那份清單（搜尋結果或歌單），所以「下一首」
// 走的就是他當下看到的順序。
const internalQueue = { tracks: [], index: -1 }

function setInternalQueue(tracks, currentId) {
  // The console passes full track objects, but a bare list of ids is the
  // obvious thing for any other caller to send. Reading only `.trackId`/`.id`
  // turned every number into an empty string, so those entries were filtered
  // away and the caller ended up with an EMPTY queue — strictly worse than
  // passing no queue at all, which at least yields the current track. That
  // silently kills the previous/next buttons, so accept both shapes.
  const list = (Array.isArray(tracks) ? tracks : [])
    .map((track) => {
      const bare = typeof track === 'string' || typeof track === 'number'
      return {
        trackId: String(bare ? track : (track?.trackId ?? track?.id ?? '')).trim(),
        name: bare ? '' : String(track?.name || ''),
        artist: bare ? '' : String(track?.artist || ''),
      }
    })
    // '0' is a sentinel, not a track id — shared/trackIdentity.cjs already
    // rejects it, and letting it through would queue an unplayable entry.
    .filter((track) => track.trackId && track.trackId !== '0')
  internalQueue.tracks = list
  internalQueue.index = list.findIndex((track) => track.trackId === String(currentId))
}

function queueSnapshot() {
  const { tracks, index } = internalQueue
  return {
    length: tracks.length,
    index,
    hasPrevious: index > 0,
    hasNext: index >= 0 && index < tracks.length - 1,
  }
}

function queueStep(offset) {
  const { tracks, index } = internalQueue
  if (index < 0) return null
  const next = index + offset
  return next >= 0 && next < tracks.length ? tracks[next] : null
}

async function loadInternalTrack(trackId, context = {}) {
  const decision = playerDecision()
  if (!decision.ok) return decision
  const id = String(trackId ?? '').trim()
  if (!id) return { ok: false, error: '歌曲 ID 無效', errorCode: PLAYER_ERROR_CODES.INVALID_ID }
  // 帶了清單就更新佇列；沒帶就把這首當成單曲，避免沿用上一份不相干的清單
  if (Array.isArray(context.queue)) setInternalQueue(context.queue, id)
  else if (internalQueue.tracks.every((track) => track.trackId !== id)) setInternalQueue([{ trackId: id }], id)
  else internalQueue.index = internalQueue.tracks.findIndex((track) => track.trackId === id)

  const revision = ++internalRevision
  internalPlayer = reduceInternalPlayer(internalPlayer, {
    type: 'load-start', revision, trackId: id,
    song: { id, name: '載入中…', artist: '' },
  })
  publishInternalState()

  try {
    const playable = await netease.getPlayableSong(id)
    if (revision !== internalRevision) return { ok: false, stale: true }
    if (!playable.detail) throw createPlayerError(PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE)
    if (!playable.url) throw createPlayerError(playable.errorCode || PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE)

    const pair = await netease.getLyricPair(id).catch(() => ({ yrc: '', lrc: '', trans: '' }))
    if (revision !== internalRevision) return { ok: false, stale: true }

    const wordTimed = parseYrc(pair.yrc)
    const parsed = wordTimed.lines.length ? wordTimed : parseLrc(pair.lrc)
    internalPlayer = reduceInternalPlayer(internalPlayer, {
      type: 'load-ready',
      revision,
      song: {
        ...playable.detail,
        artistImageUrl: '',
        avatar: '',
        loading: false,
        artworkReady: true,
      },
      lines: pair.trans ? mergeTranslation(parsed.lines, pair.trans) : parsed.lines,
      timed: parsed.timed,
      assetsReady: true,
    })
    publishInternalState()
    sendPlayerCommand({ type: 'load', revision, url: playable.url, autoplay: true })
    if (playable.detail.artistId) {
      netease.getArtistAvatar(playable.detail.artistId).then((avatar) => {
        if (revision !== internalRevision || !avatar) return
        internalPlayer = reduceInternalPlayer(internalPlayer, { type: 'artwork', revision, avatar })
        publishInternalState()
      }).catch(() => {})
    }
    return { ok: true }
  } catch (error) {
    if (revision !== internalRevision) return { ok: false, stale: true }
    internalPlayer = reduceInternalPlayer(internalPlayer, {
      type: 'error', revision, message: String(error.message || error), retryCount: 1,
    })
    publishInternalState()
    return { ok: false, error: internalPlayer.error, errorCode: playerErrorCode(internalPlayer.error) }
  }
}

async function stepInternalQueue(offset) {
  const decision = playerDecision()
  if (!decision.ok) return decision
  const target = queueStep(offset)
  if (!target) {
    const errorCode = offset > 0 ? PLAYER_ERROR_CODES.NO_NEXT : PLAYER_ERROR_CODES.NO_PREVIOUS
    return { ok: false, error: errorCode, errorCode }
  }
  return loadInternalTrack(target.trackId)
}

function runPlayerCommand(type, extra = {}) {
  const decision = playerDecision()
  if (!decision.ok) return decision
  if (!internalPlayer.revision || !internalPlayer.song) {
    return { ok: false, error: PLAYER_ERROR_CODES.NO_SONG, errorCode: PLAYER_ERROR_CODES.NO_SONG }
  }
  sendPlayerCommand({ type, revision: internalPlayer.revision, ...extra })
  return { ok: true }
}

ipcMain.handle('player:load', (_event, trackId, context) => loadInternalTrack(trackId, context || {}))
ipcMain.handle('player:next', () => stepInternalQueue(1))
ipcMain.handle('player:previous', () => stepInternalQueue(-1))
ipcMain.handle('player:play', () => runPlayerCommand('play'))
ipcMain.handle('player:pause', () => runPlayerCommand('pause'))
ipcMain.handle('player:toggle', () => runPlayerCommand('toggle'))
ipcMain.handle('player:seek', (_event, positionMs) => runPlayerCommand('seek', {
  positionMs: Math.max(0, Number(positionMs) || 0),
}))
ipcMain.handle('player:volume', (_event, value) => {
  const parsed = Number(value)
  const volume = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : state.cfg.internalPlayerVolume
  state.cfg.internalPlayerVolume = volume
  sendPlayerCommand({ type: 'volume', value: volume })
  broadcastState()
  saveState()
  return { ok: true, value: volume }
})
ipcMain.handle('player:snapshot', () => playerPublicSnapshot())
if (RUNTIME_QA) {
  ipcMain.handle('player:qaLoad', (_event, url) => {
    const revision = ++internalRevision
    internalPlayer = reduceInternalPlayer(internalPlayer, {
      type: 'load-start', revision, trackId: 'runtime-qa',
      song: { id: 'runtime-qa', name: 'Runtime QA', artist: 'Lucent' },
    })
    internalPlayer = reduceInternalPlayer(internalPlayer, {
      type: 'load-ready', revision,
      song: { id: 'runtime-qa', name: 'Runtime QA', artist: 'Lucent', durationMs: 1200 },
      lines: [], timed: false, assetsReady: true,
    })
    publishInternalState()
    sendPlayerCommand({ type: 'load', revision, url: String(url || ''), autoplay: true })
    return { ok: true }
  })
  ipcMain.handle('player:qaCommand', (_event, type, extra = {}) => {
    if (!internalPlayer.revision) return { ok: false }
    sendPlayerCommand({ type, revision: internalPlayer.revision, ...extra })
    return { ok: true }
  })
}
ipcMain.on('player:event', async (event, mediaEvent = {}) => {
  if (!audioServiceWin || audioServiceWin.isDestroyed() || event.sender.id !== audioServiceWin.webContents.id) return
  if (mediaEvent.type === 'ready') {
    audioServiceReady = true
    flushPendingPlayerCommands()
    return
  }
  const revision = Number(mediaEvent.revision) || 0
  if (!revision || revision !== internalPlayer.revision) return

  if (mediaEvent.type === 'spectrum') {
    const bands = Array.isArray(mediaEvent.bands)
      ? mediaEvent.bands.slice(0, 32).map((value) => Math.max(0, Math.min(1, Number(value) || 0)))
      : []
    if (playback.current()?.source === SOURCE.INTERNAL) {
      sendAll('player:spectrum', {
        active: mediaEvent.active === true && internalPlayer.playing,
        sequence: Math.max(0, Math.floor(Number(mediaEvent.sequence) || 0)),
        bands,
      })
    }
    return
  }

  if (mediaEvent.type === 'error' && internalPlayer.urlRetryCount === 0) {
    internalPlayer = { ...internalPlayer, playing: false, loading: true, urlRetryCount: 1, error: '' }
    publishInternalState()
    try {
      const url = await netease.getSongUrl(internalPlayer.trackId)
      if (revision !== internalRevision || !url) throw createPlayerError(
        url ? PLAYER_ERROR_CODES.MEDIA_LOAD_FAILED : PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE,
      )
      sendPlayerCommand({ type: 'load', revision, url, autoplay: true, retry: true })
      return
    } catch (error) {
      if (revision !== internalRevision) return
      internalPlayer = reduceInternalPlayer(internalPlayer, {
        type: 'error', revision, message: String(error.message || error), retryCount: 1,
      })
      publishInternalState()
      return
    }
  }

  const eventType = mediaEvent.type === 'loadedmetadata' ? 'time' : mediaEvent.type
  internalPlayer = reduceInternalPlayer(internalPlayer, { ...mediaEvent, type: eventType, revision })
  if (eventType === 'time') {
    const tick = { positionMs: internalPlayer.positionMs, playing: internalPlayer.playing }
    const selected = playback.updateClock(SOURCE.INTERNAL, { ...tick, capturedAt: Date.now() })
    sendAll('player:tick', tick)
    if (selected?.source === SOURCE.INTERNAL) {
      if (room.mode === 'host') room.tick(tick)
      else if (room.mode !== 'member') sendAll('room:tick', tick)
    }
    return
  }
  publishInternalState()
  if (eventType === 'ended') {
    // 房間佇列優先（主持人的點播清單）；沒有的話才走內建播放器自己的佇列。
    advanceRoomQueue()
      .then((advanced) => { if (!advanced && queueStep(1)) stepInternalQueue(1).catch(() => {}) })
      .catch(() => { if (queueStep(1)) stepInternalQueue(1).catch(() => {}) })
  }
})

// 指定要跟隨哪個播放來源（null = 自動找網易雲）
ipcMain.handle('np:setFollow', (_e, app) => {
  followApp = app || null
  activeSessionResolver.reset()
  return { ok: true }
})

function relaunchNcmDebug() {
  const ps = "$p=(Get-Process -Name cloudmusic -EA SilentlyContinue | Select-Object -First 1 -Expand Path); "
    + "if(-not $p){ $p='C:\\Program Files\\NetEase\\CloudMusic\\cloudmusic.exe' }; "
    + "Get-Process -Name cloudmusic -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; "
    + "Start-Sleep -Milliseconds 900; "
    + "if(Test-Path $p){ Start-Process -FilePath $p -ArgumentList '--remote-debugging-port=9222'; 'OK' } else { 'NO_EXE' }"
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      resolve({ ok: /OK/.test(stdout || ''), out: (stdout || '').trim(), error: err ? String(err.message) : '' })
    })
  })
}

ipcMain.handle('ncm:relaunchDebug', () => {
  return relaunchNcmDebug()
})

// ---------- 生命週期 ----------
if (!hasSingleInstanceLock) {
  app.quit()
} else {
app.on('second-instance', () => {
  if (!app.isReady()) return
  openConsole()
})

app.whenReady().then(() => {
  try { netease.setCookie(credentialStore.load()) } catch {}
  localDatabasePath = !app.isPackaged && process.env.LUCENT_DATA_PATH
    ? path.resolve(process.env.LUCENT_DATA_PATH)
    : path.join(app.getPath('userData'), 'lucent-data.db')
  localPlaylists = createLocalPlaylistStore(localDatabasePath)
  privacyService = createPrivacyService({
    credentialStore,
    fs,
    databasePath: localDatabasePath,
    configPath: CONFIG_PATH,
    closeDatabase: () => {
      if (localPlaylists) localPlaylists.close()
      localPlaylists = null
    },
    openDatabase: () => { localPlaylists = createLocalPlaylistStore(localDatabasePath) },
    getRoomMode: () => room.mode,
    resetSettings: () => { state = createDefaultState() },
  })
  restartUpdateService()
  createAudioService()
  createOverlay()
  createTray()
  if (state.ui?.console?.startupView !== 'pill') openConsole()
  if (!RUNTIME_QA) {
    smtc.start(onSmtc, path.join(app.getPath('userData'), 'lgl-np.ps1'))
    ncmcdp.start(onCdp)
  }

  // 螢幕環境改變（解析度、DPI 縮放、插拔螢幕）→ 重新驗證位置，
  // 避免藥丸留在已不存在的座標而「程式有開但找不到」。
  const revalidate = () => setTimeout(enforceBounds, 350)
  screen.on('display-metrics-changed', revalidate)
  screen.on('display-added', revalidate)
  screen.on('display-removed', revalidate)
  globalShortcut.register('CommandOrControl+Alt+L', () => { applyPatch({ cfg: { clickThrough: !state.cfg.clickThrough } }); broadcastState(); saveState() })
  globalShortcut.register('CommandOrControl+Alt+S', () => openConsole())
  globalShortcut.register('CommandOrControl+Alt+Space', () => { if (overlay) overlay.webContents.send('cmd:toggle-play') })
  app.on('activate', openConsole)
})
}
app.on('before-quit', () => { explicitQuit = true })
app.on('will-quit', () => {
  globalShortcut.unregisterAll(); room.close(); smtc.stop(); ncmcdp.stop()
  if (localPlaylists) { try { localPlaylists.close() } catch {}; localPlaylists = null }
  if (updateService) { updateService.stop(); updateService = null }
  if (tray) { tray.destroy(); tray = null }
})
app.on('window-all-closed', () => { if (explicitQuit) app.quit() })
