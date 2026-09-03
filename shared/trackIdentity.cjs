const { normalizeTrackTitle } = require('./trackMatching.cjs')

const DURATION_BUCKET_MS = 5000

function normalizeTrackField(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function providerId(value) {
  const id = String(value ?? '').trim()
  return id && id !== '0' ? id : null
}

function durationBucket(value) {
  const durationMs = Number(value)
  return Number.isFinite(durationMs) && durationMs > 0
    ? Math.round(durationMs / DURATION_BUCKET_MS)
    : 0
}

function createTrackIdentity(track = {}) {
  return {
    providerId: providerId(track.id ?? track.trackId),
    normalizedTitle: normalizeTrackField(normalizeTrackTitle(track.name || track.title)),
    normalizedArtist: normalizeTrackField(track.artist),
    normalizedAlbum: normalizeTrackField(track.album || track.albumTitle),
    durationBucket: durationBucket(track.durationMs),
  }
}

function sameTrackIdentity(left, right) {
  if (!left || !right) return false
  const a = createTrackIdentity(left)
  const b = createTrackIdentity(right)
  if (a.providerId && b.providerId) return a.providerId === b.providerId
  if (!a.normalizedTitle || a.normalizedTitle !== b.normalizedTitle) return false
  if (a.normalizedArtist && b.normalizedArtist && a.normalizedArtist !== b.normalizedArtist) return false
  if (a.normalizedAlbum && b.normalizedAlbum && a.normalizedAlbum !== b.normalizedAlbum) return false
  if (a.durationBucket && b.durationBucket && Math.abs(a.durationBucket - b.durationBucket) > 1) return false
  return true
}

function trackIdentityKey(track = {}) {
  const identity = createTrackIdentity(track)
  if (identity.providerId) return `id:${identity.providerId}`
  if (!identity.normalizedTitle) return ''
  const base = `meta:${identity.normalizedTitle}|${identity.normalizedArtist}`
  if (!identity.normalizedAlbum && !identity.durationBucket) return base
  return `${base}|${identity.normalizedAlbum}|${identity.durationBucket}`
}

module.exports = {
  DURATION_BUCKET_MS,
  createTrackIdentity,
  sameTrackIdentity,
  trackIdentityKey,
}
