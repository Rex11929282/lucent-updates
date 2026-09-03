function updateCapability({ isPackaged, isPortable, enabled, reason = '' }) {
  if (!isPackaged) return { mode: 'disabled', reason: '開發模式不執行自動更新', feedUrl: '' }
  if (isPortable) return { mode: 'manual', reason: 'Portable 版本僅支援手動下載更新', feedUrl: '' }
  if (!enabled) return { mode: 'disabled', reason: reason || '安裝包沒有更新設定', feedUrl: '' }
  return { mode: 'automatic', reason: '', feedUrl: '' }
}

// Update errors are shown in the UI, and the issue templates ask people to
// paste them into public GitHub issues. Windows puts the account name in almost
// every path (C:\Users\<name>\...), so any path has to be redacted before the
// text is displayed.
//
// The earlier version matched only `X:\` paths. electron-updater also reports
// `file:///C:/Users/<name>/...` URLs and forward-slash paths, so the account
// name still reached the screen through those.
const REDACTED_PATH = '本機檔案'
function publicError(error) {
  return String(error?.message || error || '更新失敗')
    // file:// URLs first — they contain a drive path that the later rules would
    // otherwise only partly rewrite.
    .replace(/file:\/{2,3}[^\s'"]+/gi, REDACTED_PATH)
    // UNC shares and Windows extended-length prefixes (\\?\C:\...).
    .replace(/\\{2}[^\s'"]+/g, REDACTED_PATH)
    // Drive-letter paths with either separator. Stop at whitespace or a quote
    // so the rest of the message survives instead of the line being eaten.
    //
    // The lookbehind matters: without it, `[A-Za-z]:[\\/]` also matches the
    // "s:/" inside "https://github.com/...", turning every URL in an update
    // error into "http本機檔案" and destroying the one detail a maintainer
    // needs. A drive letter is a SINGLE letter, so anything alphanumeric
    // immediately before it means this is not a drive path.
    .replace(/(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s'"]*/g, REDACTED_PATH)
    .slice(0, 300)
}

function createUpdateService({
  autoUpdater,
  currentVersion,
  capability,
  canRestart,
  onState = () => {},
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearTimeoutFn = clearTimeout,
  clearIntervalFn = clearInterval,
}) {
  let timeoutId = null
  let intervalId = null
  let started = false
  let installStarted = false
  let state = {
    mode: capability.mode,
    reason: capability.reason || '',
    currentVersion: String(currentVersion || ''),
    channel: 'stable',
    status: capability.mode === 'automatic' ? 'idle' : capability.mode,
    availableVersion: '',
    releaseName: '',
    releaseNotes: '',
    progress: null,
    error: '',
    deferred: false,
  }

  const publish = (patch = {}) => {
    state = { ...state, ...patch }
    onState({ ...state, progress: state.progress ? { ...state.progress } : null })
  }
  const listeners = {
    'checking-for-update': () => publish({ status: 'checking', error: '' }),
    'update-available': (info = {}) => publish({
      status: 'available', availableVersion: String(info.version || ''),
      releaseName: String(info.releaseName || ''),
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 5000) : '', error: '',
    }),
    'update-not-available': () => publish({ status: 'current', availableVersion: '', progress: null, error: '' }),
    'download-progress': (progress = {}) => publish({
      status: 'downloading', progress: {
        percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
        transferred: Math.max(0, Number(progress.transferred) || 0),
        total: Math.max(0, Number(progress.total) || 0),
        bytesPerSecond: Math.max(0, Number(progress.bytesPerSecond) || 0),
      },
    }),
    'update-downloaded': (info = {}) => {
      publish({ status: 'ready', availableVersion: String(info.version || state.availableVersion || ''), progress: null, error: '' })
      installIfSafe()
    },
    error: (error) => publish({ status: 'error', error: publicError(error), progress: null }),
  }

  async function check() {
    if (capability.mode !== 'automatic') return { ok: false, manual: capability.mode === 'manual', error: capability.reason }
    try { publish({ status: 'checking', error: '' }); await autoUpdater.checkForUpdates(); return { ok: true } }
    catch (error) { listeners.error(error); return { ok: false, error: publicError(error) } }
  }

  function installIfSafe() {
    if (state.status !== 'ready') return { ok: false, error: '更新尚未下載完成' }
    if (installStarted) return { ok: true }
    if (!canRestart()) {
      publish({ deferred: true })
      return { ok: false, deferred: true, error: '播放中或正在主持房間，已延後安裝' }
    }
    installStarted = true
    publish({ deferred: false })
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  }

  return {
    start(settings = {}) {
      if (started) return
      started = true
      state.channel = settings.channel === 'beta' ? 'beta' : 'stable'
      if (capability.mode !== 'automatic') { publish(); return }
      autoUpdater.autoDownload = true
      // Never let a leftover updater cache launch when the user simply closes
      // Lucent. Verified updates still install via installIfSafe().
      autoUpdater.autoInstallOnAppQuit = false
      autoUpdater.channel = state.channel === 'beta' ? 'beta' : 'latest'
      for (const [event, handler] of Object.entries(listeners)) autoUpdater.on(event, handler)
      if (settings.autoCheck !== false) {
        timeoutId = setTimeoutFn(() => check(), 30000)
        intervalId = setIntervalFn(() => check(), 4 * 60 * 60 * 1000)
      }
      publish()
    },
    snapshot() { return { ...state, progress: state.progress ? { ...state.progress } : null } },
    check,
    async download() {
      if (capability.mode !== 'automatic') return { ok: false, error: capability.reason }
      if (state.status !== 'available') return { ok: false, error: '目前沒有可下載的更新' }
      try { publish({ status: 'downloading', error: '' }); await autoUpdater.downloadUpdate(); return { ok: true } }
      catch (error) { listeners.error(error); return { ok: false, error: publicError(error) } }
    },
    install: installIfSafe,
    notifySafetyChanged: installIfSafe,
    stop() {
      if (timeoutId != null) clearTimeoutFn(timeoutId)
      if (intervalId != null) clearIntervalFn(intervalId)
      timeoutId = null; intervalId = null
      for (const [event, handler] of Object.entries(listeners)) autoUpdater.removeListener(event, handler)
      started = false
    },
  }
}

module.exports = { createUpdateService, updateCapability, publicError }
