const FALLBACK = ['rgb(142, 200, 255)', 'rgb(138, 92, 255)', 'rgb(255, 110, 180)']

function channels(color) {
  const values = String(color).match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number)
  return values?.length === 3 ? values : [142, 200, 255]
}

export function fallbackCoverPalette() {
  return [...FALLBACK]
}

export function mixPaletteColor(from, to, amount) {
  const progress = Math.max(0, Math.min(1, Number(amount) || 0))
  const start = channels(from)
  const end = channels(to)
  const values = start.map((value, index) => Math.round(value + (end[index] - value) * progress))
  return `rgb(${values.join(', ')})`
}

export function paletteFromPixels(data) {
  const candidates = []
  for (let index = 0; index + 3 < data.length; index += 4) {
    const r = Number(data[index]) || 0
    const g = Number(data[index + 1]) || 0
    const b = Number(data[index + 2]) || 0
    const alpha = Number(data[index + 3]) || 0
    const maximum = Math.max(r, g, b)
    const minimum = Math.min(r, g, b)
    if (alpha < 96 || maximum < 28 || minimum > 232 || maximum - minimum < 34) continue
    candidates.push({ r, g, b, score: maximum - minimum + (maximum + minimum) * 0.08 })
  }
  candidates.sort((a, b) => b.score - a.score)
  const distinct = []
  for (const candidate of candidates) {
    if (distinct.some((item) => Math.abs(item.r - candidate.r) + Math.abs(item.g - candidate.g) + Math.abs(item.b - candidate.b) < 64)) continue
    distinct.push(candidate)
    if (distinct.length === 3) break
  }
  const fallback = fallbackCoverPalette()
  return Array.from({ length: 3 }, (_, index) => {
    const color = distinct[index]
    return color ? `rgb(${color.r}, ${color.g}, ${color.b})` : fallback[index]
  })
}
