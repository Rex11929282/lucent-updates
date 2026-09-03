function selectProgressInput(inputs = []) {
  let best = null
  for (const input of inputs) {
    const value = Number(input?.value)
    const max = Number(input?.max)
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 30 || value < 0 || value > max + 1) continue
    if (!best || max > best.max) best = { value, max }
  }
  return best ? best.value : null
}

function selectPlaybackProgress(inputs = [], eventPosition, eventAgeMs = Infinity) {
  let slider = null
  for (const input of inputs) {
    const value = Number(input?.value)
    const max = Number(input?.max)
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 30 || value < 0 || value > max + 1) continue
    if (!slider || max > slider.max) slider = { value, max }
  }
  const event = Number(eventPosition)
  const freshEvent = Number.isFinite(event) && event >= 0 && Number(eventAgeMs) <= 2000
  if (freshEvent && (!slider || Math.abs(event - slider.value) > 2)) return event
  return slider ? slider.value : (freshEvent ? event : null)
}

module.exports = { selectProgressInput, selectPlaybackProgress }
