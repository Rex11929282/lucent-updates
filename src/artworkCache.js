const DEFAULT_TIMEOUT_MS = 4500
const DEFAULT_MAX_ENTRIES = 48
const DEFAULT_SUCCESS_TTL_MS = 30 * 60 * 1000
const DEFAULT_FAILURE_TTL_MS = 1500

function safeUrl(value) {
  return String(value || '').trim()
}

function loadImage(url, {
  ImageCtor = globalThis.Image,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  crossOrigin = false,
} = {}) {
  return new Promise((resolve) => {
    if (typeof ImageCtor !== 'function') {
      resolve({ url, ok: false, image: null })
      return
    }

    let image
    let timer = 0
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ url, ok: !!ok, image })
    }

    try {
      image = new ImageCtor()
      if (crossOrigin) image.crossOrigin = 'anonymous'
      image.onload = () => finish(Number(image.naturalWidth) > 0)
      image.onerror = () => finish(false)
      timer = setTimeout(() => finish(false), Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
      image.src = url
      if (image.complete) finish(Number(image.naturalWidth) > 0)
    } catch {
      finish(false)
    }
  })
}

export function createArtworkLoader({
  ImageCtor = globalThis.Image,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  successTtlMs = DEFAULT_SUCCESS_TTL_MS,
  failureTtlMs = DEFAULT_FAILURE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const entries = new Map()
  const limit = Math.max(1, Math.round(Number(maxEntries) || DEFAULT_MAX_ENTRIES))

  const touch = (key, entry) => {
    entries.delete(key)
    entries.set(key, entry)
    while (entries.size > limit) entries.delete(entries.keys().next().value)
  }

  const load = (value, options = {}) => {
    const url = safeUrl(value)
    if (!url) return Promise.resolve({ url, ok: false, image: null })
    const crossOrigin = options.crossOrigin === true
    const cache = options.cache !== false
    const key = `${crossOrigin ? 'cors:' : 'plain:'}${url}`

    if (cache) {
      const existing = entries.get(key)
      if (existing?.pending) return existing.promise
      if (existing && existing.expiresAt > now()) {
        touch(key, existing)
        return existing.promise
      }
      if (existing) entries.delete(key)
    }

    const promise = loadImage(url, {
      ImageCtor: options.ImageCtor || ImageCtor,
      timeoutMs: options.timeoutMs ?? timeoutMs,
      crossOrigin,
    })
    if (!cache) return promise

    const pending = { pending: true, promise, expiresAt: Infinity }
    touch(key, pending)
    promise.then((result) => {
      const current = entries.get(key)
      if (!current || current.promise !== promise) return
      touch(key, {
        pending: false,
        promise,
        expiresAt: now() + (result.ok ? successTtlMs : failureTtlMs),
      })
    })
    return promise
  }

  return {
    load,
    clear() { entries.clear() },
    size() { return entries.size },
  }
}

const defaultArtworkLoader = createArtworkLoader()

export function preloadArtwork(value, options) {
  return defaultArtworkLoader.load(value, options)
}

export function clearArtworkCache() {
  defaultArtworkLoader.clear()
}
