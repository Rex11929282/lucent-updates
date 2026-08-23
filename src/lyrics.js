// 內建示範歌詞（無時間標記，會依 secondsPerLine 平均分配）
export const DEMO_LYRICS = [
  { time: null, text: '♪ Liquid Glass Lyrics ♪' },
  { time: null, text: '把這個視窗懸浮在桌面上' },
  { time: null, text: '它就是你的液態玻璃音樂字幕' },
  { time: null, text: '貼上歌詞，或載入 .lrc 檔' },
  { time: null, text: '所有玻璃參數都能即時調整' },
  { time: null, text: '預設值與 rdev/liquid-glass-react 相同' },
  { time: null, text: 'displacement / blur / saturation / aberration' },
  { time: null, text: 'elasticity 讓玻璃跟著滑鼠彈動' },
  { time: null, text: 'Ctrl+Alt+L 切換滑鼠穿透' },
  { time: null, text: 'Ctrl+Alt+S 開關設定面板' },
  { time: null, text: '享受你的音樂 ♫' },
]

// 解析 .lrc / 純文字。
// 支援 [mm:ss.xx] 時間標記；沒有標記則視為一般每行歌詞。
export function parseLyrics(raw) {
  const lines = raw.replace(/\r/g, '').split('\n')
  const timeTag = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const out = []

  for (const line of lines) {
    let m
    const texts = line.replace(timeTag, '').trim()
    let matched = false
    timeTag.lastIndex = 0
    while ((m = timeTag.exec(line)) !== null) {
      matched = true
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0
      const t = min * 60 + sec + frac
      out.push({ time: t, text: texts })
    }
    if (!matched) {
      const t = line.trim()
      // 略過 lrc 的中繼標籤 [ti:] [ar:] [by:] 等
      if (t && !/^\[[a-zA-Z]+:.*\]$/.test(t)) {
        out.push({ time: null, text: t })
      }
    }
  }

  const timed = out.filter((o) => o.time !== null)
  if (timed.length > 0) {
    timed.sort((a, b) => a.time - b.time)
    return { lines: timed, timed: true }
  }
  return { lines: out.length ? out : DEMO_LYRICS, timed: false }
}

// 依目前時間找出目前應顯示的行 index
export function lineIndexAt(lines, timed, currentTime, secondsPerLine) {
  if (!lines.length) return -1
  if (timed) {
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) idx = i
      else break
    }
    return idx
  }
  const idx = Math.floor(currentTime / secondsPerLine)
  return Math.min(idx, lines.length - 1)
}

export function totalDuration(lines, timed, secondsPerLine) {
  if (timed && lines.length) {
    return lines[lines.length - 1].time + secondsPerLine
  }
  return lines.length * secondsPerLine
}
