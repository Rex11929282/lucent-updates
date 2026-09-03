function sessionClockKey(session = {}) {
  return [
    session.sourceAppId || '',
    session.sessionId || '',
    session.title || '',
    session.artist || '',
  ].join('|')
}

function smtcClockDecision(previous = null, session = {}) {
  const positionMs = Math.max(0, Number(session.position) || 0) * 1000
  const key = sessionClockKey(session)
  const playing = session.playing === true || session.playbackStatus === 'Playing'
  const hasPrevious = !!previous && previous.key === key
  const positionChanged = !hasPrevious
    || !Number.isFinite(Number(previous.positionMs))
    || Math.abs(positionMs - Number(previous.positionMs)) > 120
  const playingChanged = !hasPrevious || playing !== previous.playing

  return {
    key,
    positionMs,
    playing,
    positionChanged,
    playingChanged,
    // 只有新位置／新歌曲才可以把自走時鐘拉回實際時間；重複的舊位置
    // 不能每 600ms 再次校時，否則播放器停止更新時字幕會越來越慢。
    shouldAnchor: positionChanged,
    shouldUpdateState: positionChanged || playingChanged,
  }
}

module.exports = { sessionClockKey, smtcClockDecision }
