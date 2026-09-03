// 網易雲音樂 API 封裝（NeteaseCloudMusicApi 4.x）
// 支援掃碼登入：登入後的 cookie 會帶進所有請求（帳號 / VIP / 高音質）。
const api = require('NeteaseCloudMusicApi')
const { mapNeteaseSongDetail } = require('../shared/songSwitch.cjs')
const { createAsyncResourceCache } = require('../shared/resourceCache.cjs')
const { PLAYER_ERROR_CODES } = require('../shared/playerErrors.cjs')

const songDetailCache = createAsyncResourceCache({ maxEntries: 160 })
const artistImageCache = createAsyncResourceCache({ maxEntries: 96 })

function safeArtworkUrl(value) {
  const url = String(value || '').trim()
  return /^(?:https?:\/\/|data:image\/)/i.test(url) ? url : ''
}

function clearMetadataCaches() {
  songDetailCache.clear()
  artistImageCache.clear()
}

let cookie = ''
function setCookie(c) {
  const next = c || ''
  if (next !== cookie) clearMetadataCaches()
  cookie = next
}
function getCookie() { return cookie }

async function searchSongs(keyword, limit = 20) {
  const res = await api.cloudsearch({ keywords: keyword, limit, cookie })
  const songs = res.body?.result?.songs || []
  return songs.map((s) => ({
    id: s.id,
    name: s.name,
    artist: (s.ar || s.artists || []).map((a) => a.name).join(', '),
    artistId: (s.ar || s.artists || [])[0]?.id || null,
    album: s.al?.name || '',
    cover: safeArtworkUrl(s.al?.picUrl),
    durationMs: s.dt || s.duration || 0,
  }))
}

async function getSongDetail(id) {
  return songDetailCache.get(String(id), async () => {
    const res = await api.song_detail({ ids: String(id), cookie })
    const detail = mapNeteaseSongDetail(res.body?.songs?.[0])
    return detail ? { ...detail, cover: safeArtworkUrl(detail.cover) } : null
  }, { validate: (detail) => !!detail?.id })
}

// 取歌手頭像
async function getArtistAvatar(artistId) {
  if (!artistId) return ''
  try {
    return await artistImageCache.get(String(artistId), async () => {
      const r = await api.artist_detail({ id: artistId, cookie })
      const a = r.body?.data?.artist
      return safeArtworkUrl(a?.cover || a?.picUrl || a?.img1v1Url)
    }, { validate: (url) => !!safeArtworkUrl(url) })
  } catch {
    return ''
  }
}

async function getLyric(id) {
  const res = await api.lyric({ id, cookie })
  return res.body?.lrc?.lyric || ''
}

// 取「原文 + 翻譯」歌詞
async function getLyricPair(id) {
  let res
  let usedLegacy = false
  try {
    res = await api.lyric_new({ id, cookie })
  } catch {
    usedLegacy = true
    res = await api.lyric({ id, cookie })
  }
  if (!usedLegacy && !res.body?.yrc?.lyric && !res.body?.lrc?.lyric) {
    res = await api.lyric({ id, cookie })
  }
  const body = res.body || {}
  return {
    yrc: body.yrc?.lyric || '',
    lrc: body.lrc?.lyric || '',
    trans: body.ytlrc?.lyric || body.tlyric?.lyric || '',
  }
}

function safePlayableUrl(value) {
  const url = String(value || '').trim()
  return /^(?:https?:\/\/)/i.test(url) ? url : ''
}

async function getSongUrl(id, { apiClient = api } = {}) {
  // 版權與帳號權限可能只提供較低音質；只試一次 exhigh 會把可播放歌曲誤判成失敗。
  // 仍然完全遵守 API 回傳結果，不繞過版權、VIP 或 DRM 限制。
  for (const level of ['exhigh', 'higher', 'standard']) {
    try {
      const res = await apiClient.song_url_v1({ id, level, cookie })
      const url = safePlayableUrl(res.body?.data?.[0]?.url)
      if (url) return url
    } catch {
      // 某一音質端點失敗時繼續試下一個可合法取得的音質。
    }
  }
  // 部分帳號／歌曲在新版 v1 端點只回傳空資料，但舊端點仍會回傳同一個
  // 合法、短期有效的音源。這不是繞過版權，只是兼容網易雲兩種回應格式。
  try {
    const res = await apiClient.song_url({ id, cookie })
    return safePlayableUrl(res.body?.data?.[0]?.url)
  } catch {
    return ''
  }
}

async function getPlayableSong(id) {
  const [detailResult, urlResult] = await Promise.allSettled([getSongDetail(id), getSongUrl(id)])
  const detail = detailResult.status === 'fulfilled' ? detailResult.value : null
  const url = urlResult.status === 'fulfilled' ? urlResult.value : ''
  return {
    detail,
    url,
    errorCode: !detail
      ? PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE
      : url
        ? ''
        : (cookie ? PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE : PLAYER_ERROR_CODES.LOGIN_REQUIRED),
  }
}

async function getUserPlaylists(uid, limit = 50, offset = 0) {
  const res = await api.user_playlist({ uid, limit, offset, cookie })
  return (res.body?.playlist || []).map((playlist) => ({
    id: playlist.id,
    name: playlist.name || '',
    cover: playlist.coverImgUrl || '',
    trackCount: Number(playlist.trackCount || 0),
    creator: playlist.creator?.nickname || '',
    subscribed: !!playlist.subscribed,
  }))
}

async function getPlaylistTracks(id, limit = 100, offset = 0) {
  const res = await api.playlist_track_all({ id, limit, offset, cookie })
  return (res.body?.songs || []).map(mapNeteaseSongDetail).filter(Boolean)
}

// ---- 掃碼登入 ----
async function loginQr() {
  const k = await api.login_qr_key({ timestamp: 0 })
  const key = k.body?.data?.unikey
  const c = await api.login_qr_create({ key, qrimg: true, timestamp: 0 })
  return { key, qrimg: c.body?.data?.qrimg || '' }
}

async function loginCheck(key) {
  const r = await api.login_qr_check({ key, timestamp: 0 })
  const code = r.body?.code
  if (code === 803 && r.body?.cookie) {
    setCookie(r.body.cookie)
    const profile = await loginStatus()
    return { code, cookie: r.body.cookie, profile }
  }
  return { code, message: r.body?.message || '' }
}

async function loginStatus() {
  if (!cookie) return null
  try {
    const r = await api.login_status({ cookie })
    return r.body?.data?.profile || r.body?.profile || null
  } catch {
    return null
  }
}

async function logout() {
  try { await api.logout({ cookie }) } catch {}
  setCookie('')
}

module.exports = {
  searchSongs, getSongDetail, getLyric, getLyricPair, getSongUrl, getPlayableSong, getArtistAvatar,
  getUserPlaylists, getPlaylistTracks,
  setCookie, getCookie, loginQr, loginCheck, loginStatus, logout,
}
