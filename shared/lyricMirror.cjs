function effectiveLyricAlpha(colorAlpha = 1, rowOpacity = 1, textOpacity = 1) {
  const clamp = (value) => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 1
  }
  return clamp(colorAlpha) * clamp(rowOpacity) * clamp(textOpacity)
}

function selectLyricCandidate(candidates = [], positionSec) {
  const closestRow = (rows) => rows.reduce((selected, row) => {
    if (!selected) return row
    const rowDistance = Number.isFinite(positionSec) && Number.isFinite(row.time)
      ? Math.abs(row.time - positionSec)
      : Infinity
    const selectedDistance = Number.isFinite(positionSec) && Number.isFinite(selected.time)
      ? Math.abs(selected.time - positionSec)
      : Infinity
    if (rowDistance !== selectedDistance) return rowDistance < selectedDistance ? row : selected
    return Number(row.index) > Number(selected.index) ? row : selected
  }, null)
  const normalize = (row, source) => ({
    index: Number.isInteger(row.index) ? row.index : -1,
    main: String(row.main || row.text || '').trim(),
    sub: String(row.sub || '').trim(),
    source,
  })
  const rows = candidates.filter((row) => String(row && (row.main || row.text) || '').trim())
  const timed = Number.isFinite(positionSec)
    ? rows.filter((row) => Number.isFinite(row.time) && row.time <= positionSec + 0.35)
    : []
  const timeCandidate = timed.length
    ? timed.reduce((selected, row) => row.time > selected.time ? row : selected)
    : null
  const hasVisualAlphaSignal = rows.some((row) => row.alphaKnown !== false)
  const bright = hasVisualAlphaSignal ? rows.filter((row) => Number(row.alpha) >= 0.9) : []
  const visual = bright.reduce((selected, row) => {
    if (!selected || Number(row.alpha) > Number(selected.alpha)) return row
    if (Number(row.alpha) === Number(selected.alpha) && row.index > selected.index) return row
    return selected
  }, null)
  const explicit = rows.filter((row) => row.current || row.ariaCurrent)
  if (explicit.length) {
    const current = closestRow(explicit)
    // 網易雲有時會先畫亮新句，稍後才搬移 current class。
    // 只在亮度差明確時採用實際視覺列，避免相近過場誤跳句。
    if (current?.alphaKnown === true && visual?.index !== current.index
      && Number(visual.alpha) >= Number(current.alpha) + 0.12) {
      return normalize(visual, 'alpha')
    }
    if (current && timeCandidate && current.index !== timeCandidate.index
      && Number.isFinite(current.time) && Math.abs(current.time - positionSec) > 1.25) {
      return normalize(timeCandidate, 'time')
    }
    return normalize(current, 'current')
  }
  if (visual) return normalize(visual, 'alpha')

  if (timeCandidate) return normalize(timeCandidate, 'time')
  return null
}

function buildLyricSnapshot(previous, candidate, capturedAt = Date.now()) {
  if (!candidate) return null
  const identity = `${candidate.index}\u0000${candidate.main}\u0000${candidate.sub}`
  if (previous && previous.identity === identity) return previous
  return {
    ...candidate,
    identity,
    seq: (previous && Number(previous.seq) || 0) + 1,
    capturedAt,
  }
}

module.exports = {
  effectiveLyricAlpha,
  selectLyricCandidate,
  buildLyricSnapshot,
}
