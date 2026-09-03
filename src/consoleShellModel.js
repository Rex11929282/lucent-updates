export const CONSOLE_NAV = [
  { id: 'home', label: '首頁', icon: '⌂' },
  { id: 'play', label: '播放', icon: '▶' },
  { id: 'look', label: '外觀', icon: '✦' },
  { id: 'room', label: '房間', icon: '◎' },
  { id: 'settings', label: '軟體設定', icon: '⚙' },
  { id: 'help', label: '幫助', icon: '?' },
]

export function getHomeNextAction({ song, precise, room, update }) {
  if (!precise) return { id: 'sync', label: '連接精準同步', page: 'play' }
  if (!song) return { id: 'play', label: '開始播放歌曲', page: 'play' }
  if (room === 'disconnected') return { id: 'room', label: '建立或加入房間', page: 'room' }
  if (update === 'available') return { id: 'update', label: '查看可用更新', page: 'settings' }
  return { id: 'pill', label: '顯示桌面藥丸', page: 'home' }
}
