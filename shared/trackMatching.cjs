const DEDICATED_MUSIC_SOURCES = new Set([
  'desktop-netease',
  'desktop-spotify',
  'desktop-youtube-music',
  'internal-player',
])

const BROWSER_APP_RE = /(?:chrome|msedge|firefox|brave|opera|vivaldi)/i
const MUSIC_APP_RE = /(?:cloudmusic|netease|spotify|foobar|musicbee|aimp|winamp|vlc|itunes|applemusic)/i
const NON_MUSIC_RE = /(?:podcast|episode|audiobook|advertisement|commercial|廣告|广告|播客|有聲書|有声书)/i

function normalizeBase(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isDistributionLabel(value) {
  const label = normalizeBase(value)
  return /^(?:(?:19|20)\d{2}\s+)?remaster(?:ed)?(?:\s+(?:19|20)\d{2})?$/.test(label)
    || /^(?:official\s+)?(?:audio|video|music\s+video|lyric|lyrics|lyric\s+video|mv)$/.test(label)
}

function isFeaturingLabel(value) {
  return /^(?:feat(?:uring)?|ft)\s+\S/.test(normalizeBase(value))
}

function normalizeTrackTitle(value) {
  let title = String(value || '').normalize('NFKC')
  title = title.replace(/[\(\[\{（【]([^\)\]\}）】]+)[\)\]\}）】]/g, (whole, label) => (
    isDistributionLabel(label) || isFeaturingLabel(label) ? ' ' : ` ${label} `
  ))
  title = title.replace(/\s*[-–—|｜]\s*((?:(?:19|20)\d{2}\s+)?remaster(?:ed)?(?:\s+(?:19|20)\d{2})?|(?:official\s+)?(?:audio|video|music\s+video|lyric|lyrics|lyric\s+video|mv))\s*$/i, ' ')
  title = title.replace(/\s+(?:feat(?:uring)?|ft)\.?\s+.+$/i, ' ')
  return normalizeBase(title)
}

function normalizeArtist(value) {
  return normalizeBase(value)
}

function musicConfidence(identity = {}) {
  const source = String(identity.playbackSource || identity.source || '')
  const appId = String(identity.sourceAppId || '')
  const title = String(identity.name || identity.title || '').trim()
  const artist = String(identity.artist || '').trim()
  const album = String(identity.album || identity.albumTitle || '').trim()
  const durationMs = Number(identity.durationMs || 0)

  let score = 0
  if (DEDICATED_MUSIC_SOURCES.has(source)) score += 0.35
  else if (!BROWSER_APP_RE.test(appId) && MUSIC_APP_RE.test(appId)) score += 0.2
  if (title) score += 0.25
  if (artist) score += 0.2
  if (album) score += 0.15
  if (Number.isFinite(durationMs) && durationMs >= 30000 && durationMs <= 1800000) score += 0.05
  if (NON_MUSIC_RE.test(`${title} ${artist} ${album}`)) score -= 0.45
  if (Number.isFinite(durationMs) && durationMs > 1800000) score -= 0.2
  return Math.max(0, Math.min(1, score))
}

function artistMatches(wanted, candidate) {
  if (!wanted || !candidate) return false
  if (wanted === candidate) return true
  const wantedParts = wanted.split(/\s+(?:and|feat|ft|x)\s+/)
  const candidateParts = candidate.split(/\s+(?:and|feat|ft|x)\s+/)
  return wantedParts.some((part) => candidateParts.includes(part))
}

function scoreTrackMatch(wanted = {}, result = {}) {
  const wantedTitle = normalizeTrackTitle(wanted.name || wanted.title)
  const resultTitle = normalizeTrackTitle(result.name || result.title)
  if (!wantedTitle || !resultTitle || wantedTitle !== resultTitle) return 0

  const wantedArtist = normalizeArtist(wanted.artist)
  const resultArtist = normalizeArtist(result.artist)
  const wantedAlbum = normalizeBase(wanted.album || wanted.albumTitle)
  const resultAlbum = normalizeBase(result.album || result.albumTitle)
  const wantedDuration = Number(wanted.durationMs || 0)
  const resultDuration = Number(result.durationMs || 0)

  let score = 0.5
  if (artistMatches(wantedArtist, resultArtist)) score += 0.25
  else if (wantedArtist && resultArtist) score -= 0.2

  if (wantedAlbum && resultAlbum) {
    if (wantedAlbum === resultAlbum) score += 0.15
    else score -= 0.1
  }

  if (wantedDuration > 0 && resultDuration > 0) {
    const difference = Math.abs(wantedDuration - resultDuration)
    if (difference <= 3000) score += 0.1
    else if (difference <= 10000) score += 0.05
    else if (difference > Math.max(15000, wantedDuration * 0.15)) score -= 0.2
  }

  return Math.max(0, Math.min(1, score))
}

function selectBestTrackMatch(wanted, results, threshold = 0.65) {
  let best = null
  let bestScore = -1
  for (const result of Array.isArray(results) ? results : []) {
    const score = scoreTrackMatch(wanted, result)
    if (score > bestScore) {
      best = result
      bestScore = score
    }
  }
  return bestScore >= threshold ? best : null
}

function shouldResolveLyrics(identity) {
  return musicConfidence(identity) >= 0.65
}

module.exports = {
  musicConfidence,
  normalizeTrackTitle,
  scoreTrackMatch,
  selectBestTrackMatch,
  shouldResolveLyrics,
}
