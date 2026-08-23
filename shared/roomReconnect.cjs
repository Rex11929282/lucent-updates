function reconnectDelay(attempt, { baseMs = 1000, maxMs = 10000 } = {}) {
  const base = Math.max(1, Number(baseMs) || 1000)
  const max = Math.max(base, Number(maxMs) || 10000)
  const exponent = Math.max(0, Math.floor(Number(attempt) || 0))
  return Math.min(max, base * (2 ** exponent))
}

module.exports = { reconnectDelay }
