const CAPABILITIES = ['song.request', 'queue.manage', 'playback.control']
const DEFAULT_MEMBER_CAPABILITIES = Object.freeze({
  'song.request': true,
  'queue.manage': false,
  'playback.control': false,
})

function normalizeCapabilities(value = {}) {
  return Object.fromEntries(CAPABILITIES.map((key) => [key, value[key] === true]))
}

function canExecuteRoomCommand(role, capabilities, commandType) {
  if (role === 'host') return true
  if (role !== 'member') return false
  const allowed = normalizeCapabilities(capabilities)
  if (commandType === 'song.request') return allowed['song.request']
  if (String(commandType).startsWith('queue.')) return allowed['queue.manage']
  if (String(commandType).startsWith('playback.')) return allowed['playback.control']
  return false
}

function createCommandDeduper(maxEntries = 500) {
  const accepted = new Set()
  const order = []
  return {
    accept(commandId) {
      const id = String(commandId || '').trim()
      if (!id || accepted.has(id)) return false
      accepted.add(id); order.push(id)
      while (order.length > Math.max(1, maxEntries)) accepted.delete(order.shift())
      return true
    },
  }
}

function createRequestLimiter({ now = Date.now, windowMs = 10000, maxPerWindow = 3, maxPending = 5 } = {}) {
  const requests = new Map()
  return {
    check(memberId, pendingCount) {
      if (Number(pendingCount) >= maxPending) return { ok: false, error: `你已有 ${maxPending} 首尚未處理的點歌` }
      const id = String(memberId || '')
      const cutoff = now() - windowMs
      const recent = (requests.get(id) || []).filter((stamp) => stamp > cutoff)
      if (recent.length >= maxPerWindow) { requests.set(id, recent); return { ok: false, error: '點歌太頻繁，請稍後再試' } }
      recent.push(now()); requests.set(id, recent)
      return { ok: true }
    },
    clear(memberId) { requests.delete(String(memberId || '')) },
  }
}

module.exports = {
  CAPABILITIES,
  DEFAULT_MEMBER_CAPABILITIES,
  canExecuteRoomCommand,
  createCommandDeduper,
  createRequestLimiter,
  normalizeCapabilities,
}
