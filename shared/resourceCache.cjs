function timeoutPromise(loader, timeoutMs) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('resource request timed out')), timeoutMs)
  })
  return Promise.race([Promise.resolve().then(loader), timeout])
    .finally(() => clearTimeout(timer))
}

function createAsyncResourceCache({
  maxEntries = 128,
  ttlMs = 30 * 60 * 1000,
  failureTtlMs = 30 * 1000,
  timeoutMs = 8000,
  now = () => Date.now(),
  } = {}) {
  const entries = new Map()
  const limit = Math.max(1, Number(maxEntries) || 1)
  let generation = 0

  function remember(key, entry) {
    entries.delete(key)
    entries.set(key, entry)
    while (entries.size > limit) entries.delete(entries.keys().next().value)
  }

  function get(key, loader, { validate = () => true } = {}) {
    const cacheKey = String(key || '').trim()
    if (!cacheKey) return Promise.reject(new Error('resource cache key is required'))
    const current = entries.get(cacheKey)
    if (current?.pending) return current.pending
    if (current && current.expiresAt > now()) {
      // Keep frequently used artwork/metadata near the newest end of the
      // bounded map so a burst of unrelated tracks cannot evict it first.
      entries.delete(cacheKey)
      entries.set(cacheKey, current)
      return current.error ? Promise.reject(current.error) : Promise.resolve(current.value)
    }
    if (current) entries.delete(cacheKey)

    const requestGeneration = generation
    const pending = timeoutPromise(loader, Math.max(1, Number(timeoutMs) || 1))
      .then((value) => {
        if (!validate(value)) throw new Error('invalid resource')
        if (requestGeneration === generation) {
          remember(cacheKey, { value, expiresAt: now() + Math.max(1, Number(ttlMs) || 1) })
        }
        return value
      })
      .catch((error) => {
        const safeError = error instanceof Error ? error : new Error(String(error || 'resource request failed'))
        if (requestGeneration === generation) {
          remember(cacheKey, { error: safeError, expiresAt: now() + Math.max(1, Number(failureTtlMs) || 1) })
        }
        throw safeError
      })
    remember(cacheKey, { pending, expiresAt: Infinity })
    return pending
  }

  return {
    get,
    clear() { generation += 1; entries.clear() },
    size() { return entries.size },
  }
}

module.exports = { createAsyncResourceCache }
