import { useEffect, useRef } from 'react'
import { ov } from './overlayBridge.js'

export default function AudioService() {
  const audioRef = useRef(null)
  const revisionRef = useRef(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined

    const report = (type, extra = {}) => ov.player.report({
      type,
      revision: revisionRef.current,
      positionMs: Math.round((audio.currentTime || 0) * 1000),
      durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0,
      ...extra,
    })
    const handlers = {
      loadedmetadata: () => report('loadedmetadata'),
      playing: () => report('playing'),
      pause: () => report('pause'),
      timeupdate: () => report('time'),
      ended: () => report('ended'),
      error: () => report('error', {
        code: audio.error?.code || 0,
        message: '歌曲目前無法播放',
      }),
    }
    for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler)

    const offCommand = ov.player.onCommand(async (command = {}) => {
      if (command.type === 'load') {
        revisionRef.current = Number(command.revision) || 0
        audio.pause()
        audio.currentTime = 0
        audio.src = String(command.url || '')
        audio.load()
        if (command.autoplay) {
          try {
            await audio.play()
          } catch {
            report('error', { code: 0, message: '瀏覽器拒絕開始播放' })
          }
        }
        return
      }
      if (command.revision != null && Number(command.revision) !== revisionRef.current) return
      if (command.type === 'play') {
        try { await audio.play() } catch { report('error', { code: 0, message: '無法開始播放' }) }
      } else if (command.type === 'pause') {
        audio.pause()
      } else if (command.type === 'toggle') {
        if (audio.paused) {
          try { await audio.play() } catch { report('error', { code: 0, message: '無法開始播放' }) }
        } else audio.pause()
      } else if (command.type === 'seek') {
        audio.currentTime = Math.max(0, Number(command.positionMs) || 0) / 1000
        report('time')
      } else if (command.type === 'volume') {
        audio.volume = Math.max(0, Math.min(1, Number(command.value) || 0))
      }
    })

    return () => {
      offCommand()
      audio.pause()
      for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler)
    }
  }, [])

  return <audio ref={audioRef} preload="auto" />
}
