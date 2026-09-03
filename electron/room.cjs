// 區域網路房間：主持人開 WebSocket 伺服器，成員連入。
// 只有主持人能改變狀態（選歌 / 播放進度）；成員被動接收同步。
const WebSocket = require('ws')
const { EventEmitter } = require('events')
const os = require('os')
const { performance } = require('perf_hooks')
const { createHash, randomUUID } = require('crypto')
const { DEFAULT_MEMBER_CAPABILITIES, createCommandDeduper, normalizeCapabilities } = require('../shared/roomPolicy.cjs')
const { reconnectDelay } = require('../shared/roomReconnect.cjs')
const { createRoomClock } = require('../shared/roomClock.cjs')

const PROTOCOL_VERSION = 2
const QUEUE_FIELDS = ['id', 'provider', 'trackId', 'name', 'artist', 'cover', 'durationMs', 'requesterId', 'requesterName', 'status', 'position', 'createdAt', 'updatedAt']

function publicQueue(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => Object.fromEntries(
    QUEUE_FIELDS.filter((key) => entry?.[key] !== undefined).map((key) => [key, entry[key]]),
  ))
}

function isPrivateLanIpv4(address) {
  const p = String(address || '').split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)
}

function isRadminIpv4(address) {
  const p = String(address || '').split('.').map(Number)
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) && p[0] === 26
}

// A machine can easily have several usable IPv4 addresses (real Ethernet/Wi-Fi
// plus VPN adapters such as Radmin or Hamachi). Which one is "correct" depends
// entirely on where the guests are: people on the same physical network need the
// LAN address, people connected through the VPN need the VPN address. Picking one
// automatically is guaranteed to be wrong for the other case, so expose all of
// them and let the host choose; the automatic order is only the default.
function classifyIpv4(address) {
  if (isRadminIpv4(address)) return 'radmin'
  if (isPrivateLanIpv4(address)) return 'lan'
  return 'other'
}

function listLanIps(ifaces = os.networkInterfaces()) {
  const found = []
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        found.push({ address: ni.address, adapter: name, kind: classifyIpv4(ni.address) })
      }
    }
  }
  // Radmin first preserves the existing behaviour for VPN users, then real LAN.
  const rank = { radmin: 0, lan: 1, other: 2 }
  return found.sort((a, b) => rank[a.kind] - rank[b.kind])
}

// `preferred` wins whenever it is still one of the machine's real addresses,
// so a host's explicit choice survives re-reads without being silently reset.
function getLanIp(ifaces = os.networkInterfaces(), preferred = '') {
  const list = listLanIps(ifaces)
  if (preferred && list.some((entry) => entry.address === preferred)) return preferred
  return list[0]?.address || '127.0.0.1'
}

function socketPeerIp(sock) {
  const address = String(sock?._socket?.remoteAddress || '').replace(/^::ffff:/, '')
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) ? address : ''
}

// JSON.parse succeeds on far more than objects: `null`, `123`, `"x"`, `true`
// and `[]` are all valid JSON documents. Only an object can carry a protocol
// message, and reading `.type` off `null` throws.
//
// That mattered: any device on the LAN could send the four bytes `null` to the
// room port and the resulting TypeError wedged the entire main process — no
// room, no window updates, not even DevTools, and nothing written to stderr.
// Every message from a peer is now checked before a single field is read.
function parseProtocolMessage(buf) {
  let parsed
  try { parsed = JSON.parse(buf.toString()) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed
}

function normalizeJoinTarget(value, defaultPort = 8787) {
  const input = String(value || '').trim()
  if (!input) return null
  const source = /^wss?:\/\//i.test(input) ? input : `ws://${input}`
  let url
  try { url = new URL(source) } catch { return null }
  if (url.protocol !== 'ws:' || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
  const port = Number(url.port || defaultPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return { ip: url.hostname, port }
}

class Room extends EventEmitter {
  constructor({ WebSocketImpl = WebSocket, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, setIntervalFn = setInterval, clearIntervalFn = clearInterval, reconnect = {}, now = () => performance.now() } = {}) {
    super()
    this.WebSocket = WebSocketImpl
    this.setTimeoutFn = setTimeoutFn
    this.clearTimeoutFn = clearTimeoutFn
    this.reconnect = reconnect
    this.now = now
    this.setIntervalFn = setIntervalFn
    this.clearIntervalFn = clearIntervalFn
    this.clock = createRoomClock({ now })
    this.clockTimer = null
    this.protocolVersion = PROTOCOL_VERSION
    this.mode = null // 'host' | 'member' | null
    this.wss = null
    this.clients = new Set()
    this.ws = null
    this.state = null
    this.members = []
    this.code = null
    this.hostName = ''
    this.advertiseIp = ''
    this.roomName = ''
    this.selfId = null
    this.selfName = ''
    this.roomId = ''
    this.roomRevision = 0
    this.queue = []
    this.capabilities = { ...DEFAULT_MEMBER_CAPABILITIES }
    this.commandDeduper = createCommandDeduper()
    this.reconnectTimer = null
    this.reconnectAttempt = 0
    this.joinTarget = null
    this.intentionalClose = false
  }

  // ---- 主持人 ----
  async startHost({ roomName, code, hostName, port = 8787, advertiseIp = '' }) {
    this.close()
    this.mode = 'host'
    this.selfId = 'host'
    this.selfName = hostName || '主持人'
    this.code = code || ''
    this.hostName = hostName || '主持人'
    // Which address guests should be told to connect to. Empty means "decide
    // automatically"; a value here is the host's explicit pick.
    this.advertiseIp = String(advertiseIp || '')
    this.roomName = roomName || '我的房間'
    this.roomId = createHash('sha256').update(`${this.roomName}\0${this.code}`).digest('hex').slice(0, 24)
    this.roomRevision = 0
    this.queue = []
    this.commandDeduper = createCommandDeduper()
    try {
      this.wss = new this.WebSocket.Server({ host: '0.0.0.0', port, maxPayload: 64 * 1024 })
    } catch (e) {
      this.emit('status', { mode: null, error: '無法開房：' + (e.message || e) })
      this.mode = null
      return { ok: false }
    }
    this.wss.on('connection', (sock) => {
      sock._info = { id: '', name: '?', ip: socketPeerIp(sock), capabilities: { ...DEFAULT_MEMBER_CAPABILITIES } }
      sock.on('message', (buf) => {
        if (buf.length > 64 * 1024) return sock.close(1009, '訊息過大')
        const msg = parseProtocolMessage(buf)
        if (!msg) return
        if (msg.type === 'hello') {
          if (this.code && msg.code !== this.code) {
            sock.send(JSON.stringify({ type: 'denied', reason: '房號錯誤' }))
            return sock.close()
          }
          sock._info = {
            id: `member-${randomUUID()}`,
            name: msg.name || '訪客',
            capabilities: { ...DEFAULT_MEMBER_CAPABILITIES },
          }
          this.clients.add(sock)
          sock.send(JSON.stringify({
            type: 'welcome', protocolVersion: this.protocolVersion, roomId: this.roomId,
            roomName: this.roomName, hostName: this.hostName, selfId: sock._info.id,
            roomRevision: this.roomRevision, queue: publicQueue(this.queue), capabilities: sock._info.capabilities,
          }))
          if (this.state) sock.send(JSON.stringify({ type: 'state', state: this.state, roomRevision: this.roomRevision }))
          this._recomputeMembers()
        } else if (msg.type === 'clock-ping' && sock._info.id && Number.isFinite(Number(msg.sentAt))) {
          const hostReceivedAt = this.now()
          sock.send(JSON.stringify({ type: 'clock-pong', sentAt: Number(msg.sentAt), hostReceivedAt, hostSentAt: this.now() }))
        } else if (msg.type === 'command' && sock._info.id) {
          const command = msg.command || {}
          if (!this.commandDeduper.accept(command.commandId)) return
          this.emit('command', {
            command: {
              commandId: String(command.commandId).slice(0, 128),
              type: String(command.type || '').slice(0, 64),
              payload: command.payload || {},
            },
            sender: { id: sock._info.id, name: sock._info.name, capabilities: { ...sock._info.capabilities } },
          })
        } else if (msg.type === 'style-offer' && sock._info.id) {
          this.emit('styleOffer', { ...msg.offer, sender: { id: sock._info.id, name: sock._info.name }, target: 'host' })
        } else if (msg.type === 'style-response' && sock._info.id) {
          this.emit('styleResponse', { ...msg.response, sender: { id: sock._info.id, name: sock._info.name } })
        }
      })
      sock.on('close', () => { this.clients.delete(sock); this._recomputeMembers() })
      sock.on('error', () => {})
    })
    try {
      await new Promise((resolve, reject) => {
        const onListening = () => { this.wss.off('error', onError); resolve() }
        const onError = (error) => { this.wss.off('listening', onListening); reject(error) }
        this.wss.once('listening', onListening)
        this.wss.once('error', onError)
      })
    } catch (e) {
      try { this.wss.close() } catch {}
      this.wss = null
      this.mode = null
      const error = '無法建立局域網房間：' + String(e.message || e)
      this.emit('status', { mode: null, error })
      return { ok: false, error }
    }
    this.wss.on('error', (e) => this.emit('status', { error: String(e.message || e) }))
    this._recomputeMembers()
    const actualPort = Number(this.wss.address?.()?.port) || port
    const advertised = getLanIp(undefined, this.advertiseIp)
    this.emit('status', { mode: 'host', roomName: this.roomName, code: this.code, ip: advertised, port: actualPort })
    return { ok: true, ip: advertised, port: actualPort }
  }

  _recomputeMembers() {
    const list = [
      { id: 'host', name: this.hostName, host: true },
      ...[...this.clients].map((c) => ({ id: c._info.id, name: c._info.name, ip: c._info.ip, capabilities: { ...c._info.capabilities } })),
    ]
    this.members = list
    this.emit('members', list)
    this._broadcast({ type: 'members', members: list })
  }

  setState(state) {
    if (this.mode !== 'host') return
    this.state = { ...state, hostAtMs: Number.isFinite(Number(state?.hostAtMs)) ? Number(state.hostAtMs) : this.now() }
    this.roomRevision += 1
    this._broadcast({ type: 'state', state: this.state, roomRevision: this.roomRevision })
    this.emit('state', this.state)
  }

  setQueue(entries) {
    if (this.mode !== 'host') return false
    this.queue = publicQueue(entries)
    this.roomRevision += 1
    this._broadcast({ type: 'room-meta', roomRevision: this.roomRevision, queue: this.queue })
    this.emit('queue', this.queue)
    return true
  }

  setCapabilities(memberId, capabilities) {
    if (this.mode !== 'host') return false
    const client = [...this.clients].find((item) => item._info.id === memberId)
    if (!client) return false
    client._info.capabilities = normalizeCapabilities(capabilities)
    this.roomRevision += 1
    if (client.readyState === this.WebSocket.OPEN) client.send(JSON.stringify({
      type: 'capabilities', capabilities: client._info.capabilities, roomRevision: this.roomRevision,
    }))
    this._recomputeMembers()
    return true
  }

  sendCommand(command) {
    if (this.mode !== 'member' || this.ws?.readyState !== this.WebSocket.OPEN) return false
    const commandId = String(command?.commandId || '').trim()
    const type = String(command?.type || '').trim()
    if (!commandId || !type) return false
    this.ws.send(JSON.stringify({ type: 'command', command: { commandId, type, payload: command.payload || {} } }))
    return true
  }

  sendCommandResult(memberId, result) {
    if (this.mode !== 'host') return false
    const client = [...this.clients].find((item) => item._info.id === memberId)
    if (!client || client.readyState !== this.WebSocket.OPEN) return false
    client.send(JSON.stringify({ type: 'command-result', result }))
    return true
  }

  tick(t) {
    if (this.mode !== 'host') return
    const tick = { ...t, hostAtMs: Number.isFinite(Number(t?.hostAtMs)) ? Number(t.hostAtMs) : this.now() }
    this.emit('tick', tick)
    this._broadcast({ type: 'tick', ...tick })
  }

  _broadcast(obj) {
    const s = JSON.stringify(obj)
    for (const c of this.clients) if (c.readyState === this.WebSocket.OPEN) c.send(s)
  }

  sendStyleOffer(targetId, offer) {
    if (this.mode === 'host') {
      const targets = targetId === 'all'
        ? [...this.clients]
        : [...this.clients].filter((client) => client._info.id === targetId)
      for (const client of targets) if (client.readyState === this.WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'style-offer', offer }))
      }
      return targets.length > 0
    }
    if (this.mode === 'member' && targetId === 'host' && this.ws?.readyState === this.WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'style-offer', offer }))
      return true
    }
    return false
  }

  respondStyleOffer(response) {
    if (this.mode === 'host') {
      const client = [...this.clients].find((item) => item._info.id === response.targetId)
      if (!client || client.readyState !== this.WebSocket.OPEN) return false
      client.send(JSON.stringify({ type: 'style-response', response }))
      return true
    }
    if (this.mode === 'member' && response.targetId === 'host' && this.ws?.readyState === this.WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'style-response', response }))
      return true
    }
    return false
  }

  // ---- 成員 ----
  _cancelReconnect() {
    if (this.reconnectTimer != null) this.clearTimeoutFn(this.reconnectTimer)
    this.reconnectTimer = null
  }

  _startClockSync() {
    if (this.clockTimer != null || this.mode !== 'member') return
    const ping = () => this.sendClockPing()
    ping()
    this.clockTimer = this.setIntervalFn(ping, 3000)
  }

  _stopClockSync() {
    if (this.clockTimer != null) this.clearIntervalFn(this.clockTimer)
    this.clockTimer = null
    this.clock.reset()
  }

  sendClockPing() {
    if (this.mode !== 'member' || this.ws?.readyState !== this.WebSocket.OPEN) return false
    this.ws.send(JSON.stringify({ type: 'clock-ping', sentAt: this.now() }))
    return true
  }

  _synchronizeSnapshot(snapshot) {
    if (!snapshot || !this.clock.ready() || !Number.isFinite(Number(snapshot.hostAtMs))) return snapshot
    const elapsed = snapshot.playing ? Math.max(0, this.clock.hostNow() - Number(snapshot.hostAtMs)) : 0
    return { ...snapshot, positionMs: Math.max(0, Number(snapshot.positionMs) || 0) + elapsed }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer != null || this.intentionalClose || this.mode !== 'member' || !this.joinTarget) return
    const retryInMs = reconnectDelay(this.reconnectAttempt, this.reconnect)
    this.reconnectAttempt += 1
    this.emit('status', { mode: 'member', connected: false, reconnecting: true, attempt: this.reconnectAttempt, retryInMs })
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null
      this._connectMember()
    }, retryInMs)
  }

  _connectMember() {
    const target = this.joinTarget
    if (this.intentionalClose || this.mode !== 'member' || !target) return
    const url = `ws://${target.ip}:${target.port}`
    this.emit('status', { mode: 'member', connecting: true, reconnecting: this.reconnectAttempt > 0, ip: target.ip, port: target.port })
    let ws
    try {
      ws = new this.WebSocket(url)
    } catch (error) {
      this.emit('status', { mode: 'member', connected: false, error: String(error.message || error) })
      this._scheduleReconnect()
      return
    }
    this.ws = ws
    ws.on('open', () => {
      if (this.ws !== ws || this.intentionalClose) return
      ws.send(JSON.stringify({ type: 'hello', name: target.name, code: target.code }))
    })
    ws.on('message', (buf) => {
      if (this.ws !== ws) return
      // The host is not automatically trustworthy either: a member must not be
      // wedged by whatever the other end sends.
      const m = parseProtocolMessage(buf)
      if (!m) return
      if (m.type === 'state') {
        this.state = this._synchronizeSnapshot(m.state); this.roomRevision = Math.max(this.roomRevision, Number(m.roomRevision) || 0); this.emit('state', this.state)
      }
      else if (m.type === 'tick') this.emit('tick', this._synchronizeSnapshot(m))
      else if (m.type === 'clock-pong') {
        const receivedAt = this.now()
        const sync = this.clock.observePong({ ...m, receivedAt })
        this.emit('clockPong', { ...m, receivedAt, ...sync })
        this.emit('sync', { ...this.clock.snapshot(), quality: sync.rttMs <= 80 ? 'stable' : sync.rttMs <= 160 ? 'fair' : 'poor' })
      }
      else if (m.type === 'members') this.emit('members', m.members)
      else if (m.type === 'welcome') {
        this.protocolVersion = Number(m.protocolVersion) || 1
        this.roomId = String(m.roomId || '')
        this.roomRevision = Number(m.roomRevision) || 0
        this.queue = publicQueue(m.queue)
        this.capabilities = normalizeCapabilities(m.capabilities || DEFAULT_MEMBER_CAPABILITIES)
        this.selfId = m.selfId
        this.reconnectAttempt = 0
        this.emit('queue', this.queue)
        this.emit('capabilities', this.capabilities)
        this._startClockSync()
        this.emit('status', {
          mode: 'member', connected: true, reconnecting: false, error: '', roomName: m.roomName, hostName: m.hostName, selfId: m.selfId,
          roomId: this.roomId, roomRevision: this.roomRevision, capabilities: this.capabilities,
        })
      }
      else if (m.type === 'room-meta') {
        if ((Number(m.roomRevision) || 0) < this.roomRevision) return
        this.roomRevision = Number(m.roomRevision) || this.roomRevision
        this.queue = publicQueue(m.queue)
        this.emit('queue', this.queue)
      }
      else if (m.type === 'capabilities') {
        this.roomRevision = Math.max(this.roomRevision, Number(m.roomRevision) || 0)
        this.capabilities = normalizeCapabilities(m.capabilities)
        this.emit('capabilities', this.capabilities)
        this.emit('status', { mode: 'member', capabilities: this.capabilities, roomRevision: this.roomRevision })
      }
      else if (m.type === 'command-result') this.emit('commandResult', m.result)
      else if (m.type === 'style-offer') this.emit('styleOffer', m.offer)
      else if (m.type === 'style-response') this.emit('styleResponse', m.response)
      else if (m.type === 'denied') {
        this.intentionalClose = true
        this._cancelReconnect()
        this.joinTarget = null
        this.mode = null
        this.emit('status', { mode: null, denied: true, reason: m.reason })
      }
    })
    ws.on('close', () => {
      if (this.ws !== ws) return
      this.ws = null
      this._stopClockSync()
      if (this.mode === 'member' && !this.intentionalClose) this._scheduleReconnect()
    })
    ws.on('error', (error) => {
      if (this.ws === ws && !this.intentionalClose) this.emit('status', { mode: 'member', connected: false, error: String(error.message || error) })
    })
  }

  join({ ip, port = 8787, code, name }) {
    this.close()
    const target = normalizeJoinTarget(ip, port)
    if (!target) {
      const error = '主持人位址無效，請只輸入 IP 或 ws://IP:連接埠'
      this.emit('status', { mode: null, connected: false, error })
      return { ok: false, error }
    }
    this.mode = 'member'
    this.selfName = name || '聽眾'
    this.joinTarget = { ...target, code: code || '', name: this.selfName }
    this.intentionalClose = false
    this.reconnectAttempt = 0
    this._connectMember()
    return { ok: true }
  }

  close() {
    this.intentionalClose = true
    this._cancelReconnect()
    this._stopClockSync()
    try {
      if (this.wss) { for (const c of this.clients) try { c.close() } catch {} ; this.wss.close() }
      if (this.ws) this.ws.close()
    } catch {}
    this.wss = null
    this.ws = null
    this.clients.clear()
    this.mode = null
    this.state = null
    this.members = []
    this.selfId = null
    this.selfName = ''
    this.roomId = ''
    this.roomRevision = 0
    this.queue = []
    this.capabilities = { ...DEFAULT_MEMBER_CAPABILITIES }
    this.commandDeduper = createCommandDeduper()
    this.reconnectAttempt = 0
    this.joinTarget = null
  }

  snapshot() {
    return {
      protocolVersion: this.protocolVersion, mode: this.mode, roomId: this.roomId, roomRevision: this.roomRevision,
      roomName: this.roomName, code: this.code, members: this.members, state: this.state,
      queue: publicQueue(this.queue), capabilities: { ...this.capabilities }, selfId: this.selfId,
      ip: getLanIp(undefined, this.advertiseIp),
    }
  }
}

// parseProtocolMessage is exported so its tests can exercise the real guard.
// A test that reimplements it would pass even if this file stopped using it.
module.exports = { Room, getLanIp, listLanIps, normalizeJoinTarget, socketPeerIp, parseProtocolMessage }
