function createRoomClock({ now = () => performance.now() } = {}) {
  let best = null
  let offsetMs = 0

  function observePong({ sentAt, hostReceivedAt, hostSentAt, receivedAt }) {
    const processingMs = Math.max(0, Number(hostSentAt) - Number(hostReceivedAt))
    const rttMs = Math.max(0, Number(receivedAt) - Number(sentAt) - processingMs)
    const candidate = ((Number(hostReceivedAt) - Number(sentAt)) + (Number(hostSentAt) - Number(receivedAt))) / 2
    if (!best || rttMs < best.rttMs) {
      best = { rttMs, offsetMs: candidate }
      offsetMs = candidate
    }
    return { rttMs, offsetMs }
  }

  return {
    observePong,
    hostNow: () => now() + offsetMs,
    snapshot: () => ({ rttMs: best ? best.rttMs : null, offsetMs }),
    ready: () => !!best,
    reset: () => { best = null; offsetMs = 0 },
  }
}

module.exports = { createRoomClock }
