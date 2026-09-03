export const SPECTRUM_REPORT_INTERVAL_MS = 1000 / 30

export const EMPTY_AUDIO_SPECTRUM = Object.freeze({
  active: false,
  sequence: 0,
  bands: Object.freeze([]),
})

function safeSequence(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

export function compactSpectrum(values, requestedBands = 16, sequence = 0) {
  if (!values || !Number.isFinite(values.length) || values.length < 1) {
    return { ...EMPTY_AUDIO_SPECTRUM, sequence: safeSequence(sequence) }
  }

  const count = Math.max(2, Math.min(32, Math.round(Number(requestedBands) || 16)))
  const bands = Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * values.length / count)
    const end = Math.max(start + 1, Math.floor((index + 1) * values.length / count))
    let total = 0
    for (let bin = start; bin < end; bin += 1) {
      total += Math.max(0, Math.min(255, Number(values[bin]) || 0))
    }
    return Math.round((total / Math.max(1, end - start) / 255) * 1000) / 1000
  })

  return { active: true, sequence: safeSequence(sequence), bands }
}

export function spectrumLevels(frame, requestedBars = 16, amplitude = 1) {
  const count = Math.max(2, Math.min(32, Math.round(Number(requestedBars) || 16)))
  if (!frame?.active || !Array.isArray(frame.bands) || !frame.bands.length) return Array(count).fill(0)

  const gain = Math.max(0, Math.min(1, Number(amplitude) || 0))
  if (!gain) return Array(count).fill(0)
  return Array.from({ length: count }, (_, index) => {
    const band = frame.bands[Math.min(frame.bands.length - 1, Math.floor(index * frame.bands.length / count))]
    const energy = Math.max(0, Math.min(1, Number(band) || 0))
    return Math.round((0.14 + energy * gain * 0.86) * 100) / 100
  })
}
