export function idleCapsulePresentation({ roomMode, song, t } = {}) {
  const label = (key, fallback) => typeof t === 'function' ? t(key) : fallback
  if (song?.loading) return { line: label('ui.idle.loading', '正在讀取歌曲資料'), songName: '璃音 Lucent', state: 'loading' }
  if (roomMode === 'member') return { line: label('ui.idle.roomWait', '已加入房間，等待房主播放'), songName: '璃音 Lucent', state: 'room-wait' }
  return { line: label('ui.idle.idle', '尚未開啟網易雲，也尚未加入房間'), songName: '璃音 Lucent', state: 'idle' }
}
