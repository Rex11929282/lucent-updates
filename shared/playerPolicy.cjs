function internalPlaybackEnabled({ isPackaged, allowUnofficial = false } = {}) {
  return !isPackaged || allowUnofficial
}

function playerControlDecision({ roomMode, enabled, activeSource } = {}) {
  if (roomMode === 'member') return { ok: false, error: '目前跟隨房主' }
  if (!enabled) return { ok: false, error: '正式版尚未啟用授權音樂服務' }
  if (activeSource === 'desktop-netease') return { ok: false, error: '電腦上的網易雲正在播放' }
  return { ok: true }
}

function shouldPauseInternalForDesktop({ previousSource, desktopPlaying, internalPlaying } = {}) {
  return previousSource === 'internal-player' && desktopPlaying === true && internalPlaying === true
}

module.exports = {
  internalPlaybackEnabled,
  playerControlDecision,
  shouldPauseInternalForDesktop,
}
