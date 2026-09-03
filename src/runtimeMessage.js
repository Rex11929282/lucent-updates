const HAN = /[\u3400-\u9fff]/

const KNOWN_MESSAGES = [
  ['開發模式不執行自動更新', 'ui.update.reason.development'],
  ['Portable 版本僅支援手動下載更新', 'ui.update.reason.portable'],
  ['安裝包沒有更新設定', 'ui.update.reason.missingConfig'],
  ['更新服務尚未就緒', 'ui.update.reason.notReady'],
  ['更新尚未下載完成', 'ui.update.reason.notDownloaded'],
  ['目前沒有可下載的更新', 'ui.update.reason.noUpdate'],
  ['播放中或正在主持房間，已延後安裝', 'ui.update.reason.deferred'],
  ['無法建立局域網房間', 'ui.room.reason.createFailed'],
  ['無法開房', 'ui.room.reason.createFailed'],
  ['主持人位址無效，請只輸入 IP 或 ws://IP:連接埠', 'ui.room.reason.invalidHost'],
  ['房號錯誤', 'ui.room.reason.invalidCode'],
  ['尚未連線到房主', 'ui.room.reason.hostUnavailable'],
  ['目前不在房間中', 'ui.room.reason.notInRoom'],
  ['只有房主可以授權', 'ui.room.reason.hostOnly'],
  ['找不到房間成員', 'ui.room.reason.memberNotFound'],
  // Room permissions, commands and peer state.
  ['房主尚未授予此權限', 'ui.room.reason.permissionDenied'],
  ['不支援的房間命令', 'ui.room.reason.unsupportedCommand'],
  ['此身分不能傳送到該對象', 'ui.room.reason.notAllowedTarget'],
  ['對方尚未連線', 'ui.room.reason.peerOffline'],
  // Longer phrase first: the shorter one is a prefix of it, and an exact match
  // is required, but keeping them ordered makes the relationship obvious.
  ['提案已處理或不存在', 'ui.room.reason.offerGone'],
  ['提案已處理', 'ui.room.reason.offerHandled'],
  ['點歌太頻繁，請稍後再試', 'ui.room.reason.rateLimited'],
  // Local playlists and the play queue.
  ['找不到本機歌單', 'ui.playlist.reason.notFound'],
  ['歌曲已在歌單中', 'ui.playlist.reason.duplicateTrack'],
  ['找不到歌單歌曲', 'ui.playlist.reason.trackNotFound'],
  ['歌曲已在待播佇列', 'ui.playlist.reason.alreadyQueued'],
  ['找不到待播歌曲', 'ui.playlist.reason.queuedTrackNotFound'],
  ['目前只支援網易雲歌曲', 'ui.playlist.reason.neteaseOnly'],
  ['資料服務尚未就緒', 'ui.playlist.reason.storeNotReady'],
  ['本機歌單尚未就緒', 'ui.playlist.reason.localStoreNotReady'],
  ['找不到歌曲', 'ui.playlist.reason.songNotFound'],
  // Privacy and credentials.
  ['主持房間時不能清除本機歌單', 'ui.privacy.reason.hostingBlocksClear'],
  ['本機資料清除失敗', 'ui.privacy.reason.clearFailed'],
  ['系統加密目前不可用', 'ui.account.reason.encryptionUnavailable'],
]

function rawMessage(value) {
  return String(value?.message || value?.error || value || '').trim()
}

export function localizeRuntimeMessage(t, value, fallbackKey = 'ui.common.operationFailed') {
  const raw = rawMessage(value)
  if (!raw) return ''
  for (const [phrase, key] of KNOWN_MESSAGES) {
    if (raw === phrase) return t(key)
    if (raw.startsWith(`${phrase}：`) || raw.startsWith(`${phrase}:`)) {
      const detail = raw.slice(phrase.length + 1).trim()
      return detail ? `${t(key)}: ${detail}` : t(key)
    }
  }
  // Do not leak backend-localized text into another UI language. Keep a
  // generic translated message when the backend sends an unmapped CJK error.
  return HAN.test(raw) ? t(fallbackKey) : raw
}

export function networkAdapterLabel(t, adapter) {
  const raw = String(adapter || '').trim()
  if (!raw) return t('ui.room.networkAdapter')
  if (/乙太網路|以太网|ethernet/i.test(raw)) return t('ui.room.ethernet')
  if (/無線網路|无线网络|wi[ -]?fi|wlan/i.test(raw)) return t('ui.room.wifi')
  return raw
}
