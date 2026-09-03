import { useEffect, useRef } from 'react'
import { ov } from './overlayBridge.js'
import {
  EMPTY_AUDIO_SPECTRUM,
  SPECTRUM_REPORT_INTERVAL_MS,
  compactSpectrum,
} from './audioSpectrum.js'

export default function AudioService() {
  const audioRef = useRef(null)
  const revisionRef = useRef(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    let graph = null
    let spectrumFrame = 0
    let spectrumSequence = 0
    let lastSpectrumAt = 0
    let playAttempt = 0

    const report = (type, extra = {}) => ov.player.report({
      type,
      revision: revisionRef.current,
      positionMs: Math.round((audio.currentTime || 0) * 1000),
      durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0,
      ...extra,
    })
    const playAudio = async (message) => {
      const attempt = ++playAttempt
      const revision = revisionRef.current
      try {
        await audio.play()
      } catch (error) {
        // Pause and replacement loads cancel play() normally. An older
        // promise must not report a failure against the current track.
        if (attempt !== playAttempt || revision !== revisionRef.current || error?.name === 'AbortError') return
        report('error', { code: 0, message })
      }
    }
    const reportSilentSpectrum = () => report('spectrum', {
      ...EMPTY_AUDIO_SPECTRUM,
      sequence: spectrumSequence,
    })
    const stopSpectrum = () => {
      if (spectrumFrame) cancelAnimationFrame(spectrumFrame)
      spectrumFrame = 0
      lastSpectrumAt = 0
      reportSilentSpectrum()
    }
    const ensureGraph = () => {
      if (graph) return graph
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      try {
        const context = new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.78
        const source = context.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(context.destination)
        graph = { context, analyser, bins: new Uint8Array(analyser.frequencyBinCount) }
        return graph
      } catch {
        return null
      }
    }
    const paintSpectrum = (now) => {
      spectrumFrame = 0
      if (audio.paused || audio.ended) {
        reportSilentSpectrum()
        return
      }
      const current = ensureGraph()
      if (!current) {
        reportSilentSpectrum()
        return
      }
      if (now - lastSpectrumAt >= SPECTRUM_REPORT_INTERVAL_MS) {
        current.analyser.getByteFrequencyData(current.bins)
        report('spectrum', compactSpectrum(current.bins, 16, ++spectrumSequence))
        lastSpectrumAt = now
      }
      spectrumFrame = requestAnimationFrame(paintSpectrum)
    }
    const startSpectrum = () => {
      const current = ensureGraph()
      if (!current || spectrumFrame) return
      current.context.resume().catch(() => {})
      spectrumFrame = requestAnimationFrame(paintSpectrum)
    }
    const handlers = {
      loadedmetadata: () => report('loadedmetadata'),
      playing: () => { report('playing'); startSpectrum() },
      pause: () => { stopSpectrum(); report('pause') },
      timeupdate: () => report('time'),
      ended: () => { stopSpectrum(); report('ended') },
      error: () => { stopSpectrum(); report('error', {
        code: audio.error?.code || 0,
        message: '歌曲目前無法播放',
      }) },
    }
    for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler)

    const offCommand = ov.player.onCommand(async (command = {}) => {
      if (command.type === 'load') {
        playAttempt++
        stopSpectrum()
        revisionRef.current = Number(command.revision) || 0
        audio.pause()
        audio.currentTime = 0
        audio.src = String(command.url || '')
        audio.load()
        if (command.autoplay) {
          await playAudio('瀏覽器拒絕開始播放')
        }
        return
      }
      if (command.revision != null && Number(command.revision) !== revisionRef.current) return
      if (command.type === 'play') {
        await playAudio('無法開始播放')
      } else if (command.type === 'pause') {
        playAttempt++
        audio.pause()
      } else if (command.type === 'toggle') {
        if (audio.paused) {
          await playAudio('無法開始播放')
        } else {
          playAttempt++
          audio.pause()
        }
      } else if (command.type === 'seek') {
        audio.currentTime = Math.max(0, Number(command.positionMs) || 0) / 1000
        report('time')
      } else if (command.type === 'volume') {
        audio.volume = Math.max(0, Math.min(1, Number(command.value) || 0))
      }
    })

    // Main may queue the first load command while React is still mounting.
    // Report readiness only after the command listener is actually attached.
    report('ready')

    return () => {
      playAttempt++
      stopSpectrum()
      offCommand()
      audio.pause()
      graph?.context.close().catch(() => {})
      for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler)
    }
  }, [])

  return <audio ref={audioRef} preload="auto" />
}
