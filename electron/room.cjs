// 區域網路房間：主持人開 WebSocket 伺服器，成員連入。
// 只有主持人能改變狀態（選歌 / 播放進度）；成員被動接收同步。
const WebSocket = require('ws')
const { EventEmitter } = require('events')
const os = require('os')
const { createHash, randomUUID } = require('crypto')
const { DEFAULT_MEMBER_CAPABILITIES, createCommandDeduper, normalizeCapabilities } = require('../shared/roomPolicy.cjs')
const { reconnectDelay } = require('../shared/roomReconnect.cjs')

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

function getLanIp(ifaces = os.networkInterfaces()) {
  const candidates = []
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) candidates.push(ni.address)
    }
  }
  return candidates.find(isPrivateLanIpv4) || candidates[0] || '127.0.0.1'
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
  constructor({ WebSocketImpl = WebSocket, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, reconnect = {} } = {}) {
    super()
    this.WebSocket = WebSocketImpl
    this.setTimeoutFn = setTimeoutFn
    this.clearTimeoutFn = clearTimeoutFn
    this.reconnect = reconnect
    this.protocolVersion = PROTOCOL_VERSION
    this.mode = null // 'host' | 'member' | null
    this.wss = null
    this.clients = new Set()
    this.ws = null
    this.state = null
    this.members = []
    this.code = null
    this.hostName = ''
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
  startHost({ roomName, code, hostName, port = 8787 }) {
    this.close()
    this.mode = 'host'
    this.selfId = 'host'
    this.selfName = hostName || '主持人'
    this.code = code || ''
    this.hostName = hostName || '主持人'
    this.roomName = roomName || '我的房間'
    this.roomId = createHash('sha256').update(`${this.roomName}\0${this.code}`).digest('hex').slice(0, 24)
    this.roomRevision = 0
    this.queue = []
    this.commandDeduper = createCommandDeduper()
    try {
      this.wss = new this.WebSocket.Server({ port, maxPayload: 64 * 1024 })
    } catch (e) {
      this.emit('status', { mode: null, error: '無法開房：' + (e.message || e) })
      this.mode = null
      return { ok: false }
    }
    this.wss.on('connection', (sock) => {
      sock._info = { id: '', name: '?', capabilities: { ...DEFAULT_MEMBER_CAPABILITIES } }
      sock.on('message', (buf) => {
        if (buf.length > 64 * 1024) return sock.close(1009, '訊息過大')
        let msg
        try { msg = JSON.parse(buf.toString()) } catch { return }
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
    this.wss.on('error', (e) => this.emit('status', { error: String(e.message || e) }))
    this._recomputeMembers()
    this.emit('status', { mode: 'host', roomName: this.roomName, code: this.code, ip: getLanIp(), port })
    return { ok: true, ip: getLanIp(), port }
  }

  _recomputeMembers() {
    const list = [
      { id: 'host', name: this.hostName, host: true },
      ...[...this.clients].map((c) => ({ id: c._info.id, name: c._info.name, capabilities: { ...c._info.capabilities } })),
    ]
    this.members = list
    this.emit('members', list)
    this._broadcast({ type: 'members', members: list })
  }

  setState(state) {
    if (this.mode !== 'host') return
    this.state = state
    this.roomRevision += 1
    this._broadcast({ type: 'state', state, roomRevision: this.roomRevision })
    this.emit('state', state)
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
    this.emit('tick', t)
    this._broadcast({ type: 'tick', ...t })
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
      let m
      try { m = JSON.parse(buf.toString()) } catch { return }
      if (m.type === 'state') {
        this.state = m.state; this.roomRevision = Math.max(this.roomRevision, Number(m.roomRevision) || 0); this.emit('state', m.state)
      }
      else if (m.type === 'tick') this.emit('tick', m)
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
      queue: publicQueue(this.queue), capabilities: { ...this.capabilities }, selfId: this.selfId, ip: getLanIp(),
    }
  }
}

module.exports = { Room, getLanIp, normalizeJoinTarget }
