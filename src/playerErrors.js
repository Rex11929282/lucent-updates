// This browser-side mapper must stay ESM-only. Vite serves .cjs files as
// CommonJS without named exports in dev, while Electron main can still use
// shared/playerErrors.cjs for its Node-side error construction.
const PLAYER_ERROR_CODES = Object.freeze({
  INVALID_ID: 'PLAYER_INVALID_ID',
  LOGIN_REQUIRED: 'PLAYER_LOGIN_REQUIRED',
  NO_PLAYABLE_SOURCE: 'PLAYER_NO_PLAYABLE_SOURCE',
  MEDIA_LOAD_FAILED: 'PLAYER_MEDIA_LOAD_FAILED',
  PLAYBACK_BLOCKED: 'PLAYER_PLAYBACK_BLOCKED',
  NETEASE_ACTIVE: 'PLAYER_NETEASE_ACTIVE',
  OTHER_PLAYER_ACTIVE: 'PLAYER_OTHER_PLAYER_ACTIVE',
  ROOM_MEMBER: 'PLAYER_ROOM_MEMBER',
  NO_SONG: 'PLAYER_NO_SONG',
  NO_PREVIOUS: 'PLAYER_NO_PREVIOUS',
  NO_NEXT: 'PLAYER_NO_NEXT',
  PROVIDER_UNAVAILABLE: 'PLAYER_PROVIDER_UNAVAILABLE',
})

const KNOWN_CODES = new Set(Object.values(PLAYER_ERROR_CODES))

function playerErrorCode(value) {
  const raw = String(value?.code || value?.message || value || '').trim()
  if (KNOWN_CODES.has(raw)) return raw
  if (!raw) return ''
  if (/請先登入網易雲|登入網易雲|login required/i.test(raw)) return PLAYER_ERROR_CODES.LOGIN_REQUIRED
  if (/無效|歌曲 ID/i.test(raw)) return PLAYER_ERROR_CODES.INVALID_ID
  if (/網易雲正在播放/i.test(raw)) return PLAYER_ERROR_CODES.NETEASE_ACTIVE
  if (/其他播放器正在播放/i.test(raw)) return PLAYER_ERROR_CODES.OTHER_PLAYER_ACTIVE
  if (/跟隨房主/i.test(raw)) return PLAYER_ERROR_CODES.ROOM_MEMBER
  if (/尚未選擇歌曲/i.test(raw)) return PLAYER_ERROR_CODES.NO_SONG
  if (/已經是第一首/i.test(raw)) return PLAYER_ERROR_CODES.NO_PREVIOUS
  if (/已經是最後一首/i.test(raw)) return PLAYER_ERROR_CODES.NO_NEXT
  if (/尚未接入|尚未啟用|Provider|授權音樂服務/i.test(raw)) return PLAYER_ERROR_CODES.PROVIDER_UNAVAILABLE
  if (/無法開始播放|拒絕開始播放|載入失敗|無法播放|沒有可播放音源/i.test(raw)) return PLAYER_ERROR_CODES.MEDIA_LOAD_FAILED
  return ''
}

const ERROR_KEYS = Object.freeze({
  [PLAYER_ERROR_CODES.INVALID_ID]: 'player.error.invalidId',
  [PLAYER_ERROR_CODES.LOGIN_REQUIRED]: 'player.error.loginRequired',
  [PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE]: 'player.error.noPlayableSource',
  [PLAYER_ERROR_CODES.MEDIA_LOAD_FAILED]: 'player.error.mediaLoadFailed',
  [PLAYER_ERROR_CODES.PLAYBACK_BLOCKED]: 'player.error.playbackBlocked',
  [PLAYER_ERROR_CODES.NETEASE_ACTIVE]: 'player.error.neteaseActive',
  [PLAYER_ERROR_CODES.OTHER_PLAYER_ACTIVE]: 'player.error.otherPlayerActive',
  [PLAYER_ERROR_CODES.ROOM_MEMBER]: 'player.error.roomMember',
  [PLAYER_ERROR_CODES.NO_SONG]: 'player.error.noSong',
  [PLAYER_ERROR_CODES.NO_PREVIOUS]: 'player.error.noPrevious',
  [PLAYER_ERROR_CODES.NO_NEXT]: 'player.error.noNext',
  [PLAYER_ERROR_CODES.PROVIDER_UNAVAILABLE]: 'player.error.providerUnavailable',
})

export function localizePlayerError(t, value, { fallbackKey = '' } = {}) {
  const code = playerErrorCode(value)
  const key = ERROR_KEYS[code]
  if (key) return t(key)
  const raw = String(value?.message || value || '').trim()
  if (fallbackKey && raw) return t(fallbackKey)
  return raw || t('error.songUnavailable')
}
