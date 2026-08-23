// 網易雲音樂 API 封裝（NeteaseCloudMusicApi 4.x）
// 支援掃碼登入：登入後的 cookie 會帶進所有請求（帳號 / VIP / 高音質）。
const api = require('NeteaseCloudMusicApi')
const { mapNeteaseSongDetail } = require('../shared/songSwitch.cjs')

let cookie = ''
function setCookie(c) { cookie = c || '' }
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
    cover: s.al?.picUrl || '',
    durationMs: s.dt || s.duration || 0,
  }))
}

async function getSongDetail(id) {
  const res = await api.song_detail({ ids: String(id), cookie })
  return mapNeteaseSongDetail(res.body?.songs?.[0])
}

// 取歌手頭像
async function getArtistAvatar(artistId) {
  if (!artistId) return ''
  try {
    const r = await api.artist_detail({ id: artistId, cookie })
    const a = r.body?.data?.artist
    return a?.cover || a?.picUrl || a?.img1v1Url || ''
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
  const res = await api.lyric({ id, cookie })
  return {
    lrc: res.body?.lrc?.lyric || '',
    trans: res.body?.tlyric?.lyric || '',
  }
}

async function getSongUrl(id) {
  const res = await api.song_url_v1({ id, level: 'exhigh', cookie })
  return res.body?.data?.[0]?.url || ''
}

async function getPlayableSong(id) {
  const [detail, url] = await Promise.all([getSongDetail(id), getSongUrl(id)])
  return { detail, url }
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
