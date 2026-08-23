function normalizeMeta(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function normalizeLyricText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ')
}

export function findTimelineLineForMirror(lines = [], mirrorText, position) {
  const target = normalizeLyricText(mirrorText)
  if (!target) return null

  let best = null
  let bestDistance = Infinity
  for (const line of lines) {
    if (normalizeLyricText(line?.text) !== target) continue
    const distance = Number.isFinite(position) && Number.isFinite(line?.time)
      ? Math.abs(line.time - position)
      : Infinity
    if (!best || distance < bestDistance) {
      best = line
      bestDistance = distance
    }
  }
  return best
}

export function karaokeRatioForLine(line, position, renderedText = line?.text) {
  if (!line?.words?.length) return null

  const renderedChars = Array.from(renderedText || '').length
  const wordChars = line.words.reduce(
    (total, word) => total + Array.from(word.text || '').length,
    0,
  )
  if (!renderedChars || wordChars !== renderedChars) return null

  let done = 0
  for (const word of line.words) {
    const charCount = Array.from(word.text || '').length
    if (position >= word.t + word.d) {
      done += charCount
    } else if (position > word.t && word.d > 0) {
      done += charCount * ((position - word.t) / word.d)
      break
    } else {
      break
    }
  }
  return Math.max(0, Math.min(1, done / renderedChars))
}

// Flow fill follows real YRC word timing, but does not require the rendered
// mirror text to have the same character count as the YRC payload.
export function flowFillRatioForLine(line, position) {
  if (!line?.words?.length || !Number.isFinite(position)) return null
  const words = line.words.filter((word) => Number.isFinite(word?.t) && Number.isFinite(word?.d) && word.d >= 0)
  if (!words.length) return null

  const start = Math.min(...words.map((word) => word.t))
  const end = Math.max(...words.map((word) => word.t + word.d))
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (end <= start) return position >= end ? 1 : 0
  return Math.max(0, Math.min(1, (position - start) / (end - start)))
}

export function flowFillRatioForTimedLine(lines, line, position) {
  if (!line || !Number.isFinite(line.time) || !Number.isFinite(position)) return null
  const index = lines.indexOf(line)
  const nextTime = index >= 0 ? lines[index + 1]?.time : null
  if (!Number.isFinite(nextTime) || nextTime <= line.time) return null
  return Math.max(0, Math.min(1, (position - line.time) / (nextTime - line.time)))
}

export function applyKaraokeClasses(element, ratio, text) {
  if (!element) return 0
  const current = Math.round(
    Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * Array.from(text || '').length,
  )
  const children = element.children || []
  for (let index = 0; index < children.length; index++) {
    children[index].classList.toggle('sung', index < current)
  }
  return current
}

export function karaokeRatioForTimedLine(lines, line, position) {
  if (!line || !Number.isFinite(line.time) || !Number.isFinite(position)) return null
  const index = lines.indexOf(line)
  const nextTime = index >= 0 ? lines[index + 1]?.time : null
  if (!Number.isFinite(nextTime) || nextTime <= line.time) return null
  const activeDuration = (nextTime - line.time) * 0.92
  if (activeDuration <= 0) return null
  return Math.max(0, Math.min(1, (position - line.time) / activeDuration))
}

export function mirrorKaraokeRatio({ lines = [], mirrorText, position, fallbackRatio = 0 } = {}) {
  const line = findTimelineLineForMirror(lines, mirrorText, position)
  return karaokeRatioForLine(line, position, mirrorText)
    ?? karaokeRatioForTimedLine(lines, line, position)
    ?? fallbackRatio
}

function flowLineAtMirrorIndex(lines, mirrorIndex, position) {
  const index = Number(mirrorIndex)
  const line = Number.isInteger(index) && index >= 0 ? lines[index] : null
  if (!line) return null
  if (!line.words?.length) return line
  if (!Number.isFinite(position)) return line
  const starts = line.words.map((word) => word?.t).filter(Number.isFinite)
  const ends = line.words.map((word) => word?.t + word?.d).filter(Number.isFinite)
  if (!starts.length || !ends.length) return null
  const start = Math.min(...starts)
  const end = Math.max(...ends)
  return position >= start - 0.35 && position <= end + 0.75 ? line : null
}

export function mirrorFlowFillRatio({ lines = [], mirrorText, mirrorIndex, position } = {}) {
  const line = findTimelineLineForMirror(lines, mirrorText, position)
    || flowLineAtMirrorIndex(lines, mirrorIndex, position)
  return flowFillRatioForLine(line, position)
    ?? flowFillRatioForTimedLine(lines, line, position)
}

export function lyricLineIdentity({ songKey = 'none', useMirror = false, mirror, curIdx = -1 } = {}) {
  if (!useMirror) return `${songKey}:timeline:${curIdx}`
  if (mirror?.i != null) return `${songKey}:mirror:i:${mirror.i}`
  return `${songKey}:mirror:text:${mirror?.text || ''}`
}

export function nextMirrorTiming(state, { active = false, identity = '', text = '', now = 0 } = {}) {
  const previous = state || { active: false, identity: '', text: '', at: 0, dur: 3.5, hist: [] }
  if (!active || !text) {
    return { ...previous, active: false, identity: '', text: '', at: 0 }
  }
  if (identity === previous.identity) return { ...previous, active: true, text }

  const hist = [...previous.hist]
  let dur = previous.dur
  if (previous.at) {
    const elapsed = (now - previous.at) / 1000
    if (elapsed > 0.6 && elapsed < 15) {
      hist.push(elapsed)
      if (hist.length > 6) hist.shift()
      dur = hist.reduce((sum, value) => sum + value, 0) / hist.length
    }
  }
  return { active: true, identity, text, at: now, dur, hist }
}

export function mirrorFallbackRatio(state, now) {
  if (!state?.at || state.dur <= 0) return 0
  const elapsed = (now - state.at) / 1000
  return Math.max(0, Math.min(1, elapsed / (state.dur * 0.92)))
}

export function rendererSongKey(song) {
  if (!song) return 'none'
  if (song.id != null && String(song.id)) return `id:${song.id}`
  return `meta:${normalizeMeta(song.name)}|${normalizeMeta(song.artist)}`
}

export function rendererSongRevisionKey(song) {
  if (Number.isFinite(song?.revision)) return `revision:${song.revision}`
  return rendererSongKey(song)
}

export function hasActiveSong(roomState) {
  const song = roomState?.song
  return !!(song && (song.id != null || song.name))
}

export function mirrorMatchesSong(mirror, song) {
  if (!mirror?.text) return false
  if (mirror.songId == null || song?.id == null) return true
  return String(mirror.songId) === String(song.id)
}

export function currentSongLyric({ song, mirror, lines = [], curIdx = 0 } = {}) {
  if (mirrorMatchesSong(mirror, song)) return mirror.text
  if (song?.loading) return '♪'
  const timedLine = curIdx >= 0 ? lines[curIdx]?.text : ''
  if (timedLine) return timedLine
  return song?.name ? '♪' : ''
}
