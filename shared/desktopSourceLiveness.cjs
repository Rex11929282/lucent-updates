const DESKTOP_SOURCE_GRACE_MS = 2000

function desktopSourceDisposition({ now = Date.now(), lastDetectedAt = 0, graceMs = DESKTOP_SOURCE_GRACE_MS } = {}) {
  const seenAt = Number(lastDetectedAt)
  if (!Number.isFinite(seenAt) || seenAt <= 0) return 'clear'
  return Number(now) - seenAt >= graceMs ? 'clear' : 'retain'
}

module.exports = { DESKTOP_SOURCE_GRACE_MS, desktopSourceDisposition }
