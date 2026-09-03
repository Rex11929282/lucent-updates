export function titleFitScale({ contentWidth, trackWidth, minScale = 0.72 } = {}) {
  const content = Number(contentWidth)
  const track = Number(trackWidth)
  const floor = Math.max(0.1, Math.min(1, Number(minScale) || 0.72))
  if (!Number.isFinite(content) || !Number.isFinite(track) || content <= 0 || track <= 0 || content <= track) return 1
  return Math.max(floor, Math.min(1, track / content))
}
