const { contextBridge, ipcRenderer } = require('electron')

const sub = (channel) => (cb) => {
  const h = (_e, p) => cb(p)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

// Main passes the Windows display-language preference here, because the
// renderer's navigator.language reports the region format instead — on a
// machine set to Traditional Chinese with a zh-CN region format, trusting
// navigator.language shows the whole UI in Simplified Chinese.
const systemLocaleArgument = process.argv.find((arg) => arg.startsWith('--lucent-system-locale='))
const systemLocale = systemLocaleArgument ? systemLocaleArgument.split('=').slice(1).join('=') : ''

let captureSequence = 0
function capturePill(crop) {
  const requestId = `pill-capture-${++captureSequence}`
  return new Promise((resolve) => {
    let settled = false
    const finish = (dataUrl) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ipcRenderer.removeListener('overlay:capturePill:result', onResult)
      resolve(dataUrl || null)
    }
    const onResult = (_event, result) => {
      if (result?.requestId !== requestId) return
      finish(result.dataUrl)
    }
    const timer = setTimeout(() => finish(null), 900)
    ipcRenderer.on('overlay:capturePill:result', onResult)
    ipcRenderer.send('overlay:capturePill:start', { requestId, crop })
  })
}

contextBridge.exposeInMainWorld('overlay', {
  isElectron: true,
  systemLocale,

  // 設定狀態
  stateGet: () => ipcRenderer.invoke('state:get'),
  stateSet: (patch) => ipcRenderer.invoke('state:set', patch),
  onStateChanged: sub('state:changed'),

  // 主視窗（藥丸）
  setSize: (w, h, mx, my) => ipcRenderer.invoke('overlay:setSize', w, h, mx, my),
  getBounds: () => ipcRenderer.invoke('overlay:getBounds'),
  capturePill,
  setPosition: (x, y) => ipcRenderer.invoke('overlay:setPosition', x, y),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('overlay:setIgnoreMouse', ignore),
  popupMenu: () => ipcRenderer.invoke('menu:popup'),
  openConsole: () => ipcRenderer.invoke('console:open'),
  closeConsole: () => ipcRenderer.invoke('console:close'),
  onConsoleVisibility: sub('overlay:console-visibility'),
  console: {
    requestClose: () => ipcRenderer.invoke('console:close'),
    closeWith: (action, remember = false) => ipcRenderer.invoke('console:close-with', { action, remember }),
    showPill: () => ipcRenderer.invoke('console:show-pill'),
    hideToTray: () => ipcRenderer.invoke('console:hide-to-tray'),
    onCloseRequested: sub('console:close-request'),
  },
  quit: () => ipcRenderer.invoke('app:quit'),
  onTogglePlay: sub('cmd:toggle-play'),
  onDesktopFrame: sub('desktop:frame'),
  onNpInfo: sub('np:info'),
  npSetFollow: (app) => ipcRenderer.invoke('np:setFollow', app),
  ncmRelaunchDebug: () => ipcRenderer.invoke('ncm:relaunchDebug'),

  player: {
    load: (trackId, context) => ipcRenderer.invoke('player:load', trackId, context),
    next: () => ipcRenderer.invoke('player:next'),
    previous: () => ipcRenderer.invoke('player:previous'),
    play: () => ipcRenderer.invoke('player:play'),
    pause: () => ipcRenderer.invoke('player:pause'),
    toggle: () => ipcRenderer.invoke('player:toggle'),
    seek: (positionMs) => ipcRenderer.invoke('player:seek', positionMs),
    setVolume: (value) => ipcRenderer.invoke('player:volume', value),
    qaLoad: (url) => ipcRenderer.invoke('player:qaLoad', url),
    qaCommand: (type, extra) => ipcRenderer.invoke('player:qaCommand', type, extra),
    snapshot: () => ipcRenderer.invoke('player:snapshot'),
    onChanged: sub('player:changed'),
    onTick: sub('player:tick'),
    onSpectrum: sub('player:spectrum'),
    onCommand: sub('player:command'),
    report: (event) => ipcRenderer.send('player:event', event),
  },

  updates: {
    snapshot: () => ipcRenderer.invoke('update:snapshot'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    setSettings: (patch) => ipcRenderer.invoke('update:setSettings', patch),
    onChanged: sub('update:changed'),
  },

  privacy: {
    summary: () => ipcRenderer.invoke('privacy:summary'),
    erase: (scope) => ipcRenderer.invoke('privacy:erase', scope),
  },

  // 房間
  room: {
    host: (opts) => ipcRenderer.invoke('room:host', opts),
    join: (opts) => ipcRenderer.invoke('room:join', opts),
    leave: () => ipcRenderer.invoke('room:leave'),
    setState: (s) => ipcRenderer.invoke('room:setState', s),
    tick: (t) => ipcRenderer.invoke('room:tick', t),
    qaState: (s) => ipcRenderer.invoke('room:qaState', s),
    qaTick: (t) => ipcRenderer.invoke('room:qaTick', t),
    snapshot: () => ipcRenderer.invoke('room:snapshot'),
    lanIp: () => ipcRenderer.invoke('room:lanip'),
    lanIps: () => ipcRenderer.invoke('room:lanips'),
    offerStyle: (targetId, name) => ipcRenderer.invoke('room:offerStyle', { targetId, name }),
    respondStyleOffer: (requestId, accepted) => ipcRenderer.invoke('room:respondStyleOffer', { requestId, accepted }),
    pendingOffers: () => ipcRenderer.invoke('room:pendingOffers'),
    command: (type, payload) => ipcRenderer.invoke('room:command', { type, payload }),
    setCapabilities: (memberId, capabilities) => ipcRenderer.invoke('room:setCapabilities', { memberId, capabilities }),
    onState: sub('room:state'),
    onTick: sub('room:tick'),
    onMembers: sub('room:members'),
    onStatus: sub('room:status'),
    onStyleOffer: sub('room:styleOffer'),
    onStyleResponse: sub('room:styleResponse'),
    onStyleOfferHandled: sub('room:styleOfferHandled'),
    onQueue: sub('room:queue'),
    onCapabilities: sub('room:capabilities'),
    onCommandResult: sub('room:commandResult'),
  },

  // 網易雲
  netease: {
    search: (kw) => ipcRenderer.invoke('netease:search', kw),
    lyric: (id) => ipcRenderer.invoke('netease:lyric', id),
    loginQr: () => ipcRenderer.invoke('netease:loginQr'),
    loginCheck: (key) => ipcRenderer.invoke('netease:loginCheck', key),
    loginStatus: () => ipcRenderer.invoke('netease:loginStatus'),
    logout: () => ipcRenderer.invoke('netease:logout'),
    userPlaylists: () => ipcRenderer.invoke('netease:userPlaylists'),
    playlistTracks: (id) => ipcRenderer.invoke('netease:playlistTracks', id),
  },
  localPlaylists: {
    list: () => ipcRenderer.invoke('localPlaylist:list'),
    create: (name) => ipcRenderer.invoke('localPlaylist:create', name),
    rename: (id, name) => ipcRenderer.invoke('localPlaylist:rename', { id, name }),
    delete: (id) => ipcRenderer.invoke('localPlaylist:delete', id),
    items: (playlistId) => ipcRenderer.invoke('localPlaylist:items', playlistId),
    add: (playlistId, item) => ipcRenderer.invoke('localPlaylist:add', { playlistId, item }),
    remove: (id) => ipcRenderer.invoke('localPlaylist:remove', id),
    move: (id, position) => ipcRenderer.invoke('localPlaylist:move', { id, position }),
  },
})
