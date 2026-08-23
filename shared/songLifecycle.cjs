// 網易雲的可見進度與歌曲詳情時長偶爾相差 1~3 秒。保留尾端容差，
// 但仍要求「已停止」或「已出現下一首 ID」，避免中途暫停被當成播完。
const END_TAIL_MS = 3500

function isNaturalSongEnd({ song, positionMs, playing, incomingSongId }, tailMs = END_TAIL_MS) {
  const durationMs = Number(song?.durationMs)
  const currentPositionMs = Number(positionMs)
  if (!song?.id || !Number.isFinite(durationMs) || durationMs <= 0) return false
  if (!Number.isFinite(currentPositionMs) || currentPositionMs < durationMs - tailMs) return false
  const incomingIsDifferent = incomingSongId != null && String(incomingSongId) !== String(song.id)
  return playing === false || incomingIsDifferent
}

function isReadyToRebuild(lifecycle, song, playing) {
  return Number(lifecycle?.token) > 0
    && Number(lifecycle?.endedSongRevision) > 0
    && Number(song?.revision) > 0
    && Number(song.revision) !== Number(lifecycle.endedSongRevision)
    && song.loading === false
    && song.artworkReady !== false
    && playing === true
}

module.exports = { END_TAIL_MS, isNaturalSongEnd, isReadyToRebuild }
