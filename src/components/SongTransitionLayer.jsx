import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ov } from '../overlayBridge.js'
import { createShatterParticles, particleMotion, particleTransitionDuration } from '../songTransition.js'
import { fallbackCoverPalette, mixPaletteColor, paletteFromPixels } from '../coverPalette.js'
import { preloadArtwork } from '../artworkCache.js'

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1)
    globalThis.crypto.getRandomValues(value)
    return value[0]
  }
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0
}

async function loadSnapshot(dataUrl) {
  const result = await preloadArtwork(dataUrl, { cache: false, timeoutMs: 2500 })
  if (!result.ok || !result.image) throw new Error('snapshot image failed')
  return result.image
}

async function extractCoverPalette(url) {
  if (!url) return fallbackCoverPalette()
  const result = await preloadArtwork(url, { crossOrigin: true, timeoutMs: 2500 })
  if (!result.ok || !result.image) throw new Error('cover image failed')
  const image = result.image
  const sample = document.createElement('canvas')
  sample.width = 24
  sample.height = 24
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return fallbackCoverPalette()
  context.drawImage(image, 0, 0, sample.width, sample.height)
  return paletteFromPixels(context.getImageData(0, 0, sample.width, sample.height).data)
}

function visualSurface(sourceRef) {
  const root = sourceRef?.current
  if (!root) return null
  return root.querySelector('.glass') || root.querySelector('.plain') || root
}

function roundedRect(context, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(r, 0)
  context.arcTo(width, 0, width, height, r)
  context.arcTo(width, height, 0, height, r)
  context.arcTo(0, height, 0, 0, r)
  context.arcTo(0, 0, width, 0, r)
  context.closePath()
}

function drawFallbackText(context, source, crop, selector) {
  const element = source.querySelector(selector)
  const text = element?.textContent?.trim()
  if (!element || !text) return
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const size = Math.max(8, Number.parseFloat(style.fontSize) || 14)
  const x = Math.max(2, rect.left - crop.x)
  const y = Math.max(size, rect.bottom - crop.y - Math.max(0, Number.parseFloat(style.paddingBottom) || 0))
  const maxWidth = Math.max(1, crop.width - x - 3)
  context.save()
  context.globalAlpha = Math.max(0.25, Math.min(1, Number.parseFloat(style.opacity) || 1))
  context.fillStyle = style.color || '#ffffff'
  context.font = `${style.fontWeight || 700} ${size}px ${style.fontFamily || 'sans-serif'}`
  context.textAlign = style.textAlign === 'left' ? 'left' : style.textAlign === 'right' ? 'right' : 'center'
  const drawX = context.textAlign === 'left' ? x : context.textAlign === 'right' ? crop.width - 3 : crop.width / 2
  context.fillText(text, drawX, y, maxWidth)
  context.restore()
}

// 某些透明 Electron 視窗在 capturePage／DevTools 擷取時不會回傳影像。
// 用目前 DOM 的計算樣式繪製一張小型外觀快照，只作粒子初始顏色與輪廓，
// 不讀桌面、不做音訊分析，也不會增加全螢幕 Canvas。
function createFallbackSnapshot(source, crop) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width))
  canvas.height = Math.max(1, Math.round(crop.height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('fallback canvas unavailable')
  const root = source.closest('.capsule') || source
  const rootStyle = getComputedStyle(root)
  const radius = Math.max(8, Math.min(canvas.width / 2, canvas.height / 2, Number.parseFloat(rootStyle.borderRadius) || canvas.height / 2))
  const c1 = root.style.getPropertyValue('--grad-c1').trim() || '#6d82b8'
  const c2 = root.style.getPropertyValue('--grad-c2').trim() || '#9a75b6'
  const tint = root.style.getPropertyValue('--tint').trim() || '#8fa8ff'

  roundedRect(context, canvas.width, canvas.height, radius)
  context.save()
  context.clip()
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, c1)
  gradient.addColorStop(0.55, tint)
  gradient.addColorStop(1, c2)
  context.globalAlpha = 0.72
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.globalAlpha = 0.18
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, Math.max(1, Math.round(canvas.height * 0.22)))

  const vinyl = source.querySelector('.vinyl')
  if (vinyl) {
    const rect = vinyl.getBoundingClientRect()
    const x = rect.left - crop.x + rect.width / 2
    const y = rect.top - crop.y + rect.height / 2
    const outer = Math.max(4, Math.min(rect.width, rect.height) / 2)
    const disc = context.createRadialGradient(x - outer * 0.22, y - outer * 0.22, outer * 0.08, x, y, outer)
    disc.addColorStop(0, '#e8edf7')
    disc.addColorStop(0.22, '#252b36')
    disc.addColorStop(0.84, '#090b10')
    disc.addColorStop(1, '#c9a64a')
    context.globalAlpha = 0.94
    context.fillStyle = disc
    context.beginPath()
    context.arc(x, y, outer, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 0.5
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.arc(x, y, outer * 0.16, 0, Math.PI * 2)
    context.fill()
  }

  drawFallbackText(context, source, crop, '.songname__text')
  drawFallbackText(context, source, crop, '.lyrics__cur')
  drawFallbackText(context, source, crop, '.lyrics__trans')
  drawFallbackText(context, source, crop, '.progtime')

  const fill = source.querySelector('.progress__fill')
  if (fill) {
    const rect = fill.getBoundingClientRect()
    const style = getComputedStyle(fill)
    const x = Math.max(0, rect.left - crop.x)
    const y = Math.max(0, rect.top - crop.y)
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    context.globalAlpha = Math.max(0.3, Number.parseFloat(style.opacity) || 1)
    context.fillStyle = style.backgroundColor || '#ffffff'
    context.save()
    context.translate(x, y)
    roundedRect(context, width, height, height / 2)
    context.fill()
    context.restore()
  }
  context.restore()
  return canvas.toDataURL('image/png')
}

function colorParticles(image, particles, logicalWidth, logicalHeight) {
  const sample = document.createElement('canvas')
  sample.width = image.naturalWidth
  sample.height = image.naturalHeight
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return particles
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data
  const sx = sample.width / Math.max(1, logicalWidth)
  const sy = sample.height / Math.max(1, logicalHeight)
  return particles.map((particle) => {
    const x = Math.max(0, Math.min(sample.width - 1, Math.round((particle.x + particle.w / 2) * sx)))
    const y = Math.max(0, Math.min(sample.height - 1, Math.round((particle.y + particle.h / 2) * sy)))
    const offset = (y * sample.width + x) * 4
    return {
      ...particle,
      color: `rgb(${pixels[offset]}, ${pixels[offset + 1]}, ${pixels[offset + 2]})`,
      alpha: pixels[offset + 3] / 255,
    }
  }).filter((particle) => particle.alpha > 0.08)
}

function drawParticle(context, particle, amount, rebuilding, holding, targetColor) {
  const { travel, opacity, radiusScale } = particleMotion(amount, rebuilding, particle.rebuildDelay, holding)
  const centerX = particle.x + particle.w / 2
  const centerY = particle.y + particle.h / 2
  const radius = particle.radius * radiusScale

  context.save()
  context.globalAlpha = Math.max(0, Math.min(1, opacity * particle.alpha))
  context.translate(centerX + particle.dx * travel, centerY + particle.dy * travel)
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  const colorAmount = rebuilding
    ? Math.max(0, Math.min(1, (amount - particle.rebuildDelay) / Math.max(0.001, 1 - particle.rebuildDelay)))
    : 0
  context.fillStyle = rebuilding ? mixPaletteColor(particle.color, targetColor, colorAmount) : particle.color
  context.fill()
  context.restore()
}

function SongTransitionLayer({
  phase,
  mode,
  revision,
  sourceRef,
  incomingCoverUrl,
  loading,
  visualKey,
  speed = 1,
  onSnapshotReady,
  onSnapshotFailed,
  onOutFinished,
  onInFinished,
}) {
  const canvasRef = useRef(null)
  const captureRevisionRef = useRef('')
  const animationRef = useRef(0)
  const completionRef = useRef(0)
  const paletteRef = useRef(fallbackCoverPalette())
  const paletteKeyRef = useRef('')
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    if (mode !== 'shatter' || !['dormant', 'shatter-in'].includes(phase)) return undefined
    const key = `${revision}:${incomingCoverUrl || ''}`
    if (paletteKeyRef.current === key) return undefined
    paletteKeyRef.current = key
    paletteRef.current = fallbackCoverPalette()
    let cancelled = false
    extractCoverPalette(incomingCoverUrl)
      .then((palette) => { if (!cancelled) paletteRef.current = palette })
      .catch(() => { if (!cancelled) paletteRef.current = fallbackCoverPalette() })
    return () => { cancelled = true }
  }, [mode, phase, revision, incomingCoverUrl])

  useEffect(() => {
    if (mode !== 'shatter' || phase !== 'capture-out') return undefined
    const captureKey = `${revision}:${phase}`
    if (captureRevisionRef.current === captureKey) return undefined
    captureRevisionRef.current = captureKey
    let cancelled = false
    const capture = async () => {
      const source = visualSurface(sourceRef)
      if (!source) {
        if (!cancelled) onSnapshotFailed?.()
        return
      }
      const rect = source.getBoundingClientRect()
      const crop = {
        x: Math.max(0, Math.floor(rect.left)),
        y: Math.max(0, Math.floor(rect.top)),
        width: Math.max(1, Math.ceil(rect.width)),
        height: Math.max(1, Math.ceil(rect.height)),
      }
      try {
        const dataUrl = await ov.capturePill(crop)
        if (cancelled) return
        const snapshotDataUrl = dataUrl || createFallbackSnapshot(source, crop)
        const image = await loadSnapshot(snapshotDataUrl)
        if (cancelled) return
        const particles = createShatterParticles({
          width: crop.width,
          height: crop.height,
          seed: randomSeed(),
          count: 112,
        })
        setSnapshot({
          image,
          width: crop.width,
          height: crop.height,
          revision,
          particles: colorParticles(image, particles, crop.width, crop.height),
        })
        onSnapshotReady?.()
      } catch {
        if (!cancelled) onSnapshotFailed?.()
      }
    }
    // effect 已在 React commit 後執行；不再等待 rAF，避免隱藏/透明視窗
    // 被 Chromium 暫停 rAF 時把過場卡在 capture-out。
    capture()

    return () => {
      cancelled = true
    }
  }, [mode, phase, revision, sourceRef, onSnapshotReady, onSnapshotFailed])

  useLayoutEffect(() => {
    cancelAnimationFrame(animationRef.current)
    cancelAnimationFrame(completionRef.current)
    if (!snapshot || snapshot.revision !== revision || !['shatter-out', 'dormant', 'shatter-in'].includes(phase)) {
      return undefined
    }
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      onSnapshotFailed?.()
      return undefined
    }

    const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    canvas.width = Math.round(snapshot.width * scale)
    canvas.height = Math.round(snapshot.height * scale)
    canvas.style.width = `${snapshot.width}px`
    canvas.style.height = `${snapshot.height}px`
    const duration = particleTransitionDuration(phase, speed)
    const startedAt = performance.now()
    const rebuilding = phase === 'shatter-in'
    const holding = phase === 'dormant'
    let completed = false
    let fallbackTimer = 0

    const completeOut = () => {
      if (completed) return
      completed = true
      clearTimeout(fallbackTimer)
      onOutFinished?.()
    }
    const completeIn = () => {
      if (completed) return
      completed = true
      clearTimeout(fallbackTimer)
      onInFinished?.()
    }

    const render = (now) => {
      const amount = Math.min(1, Math.max(0, (now - startedAt) / duration))
      context.setTransform(scale, 0, 0, scale, 0, 0)
      context.clearRect(0, 0, snapshot.width, snapshot.height)
      const palette = paletteRef.current
      snapshot.particles.forEach((particle, index) => drawParticle(
        context,
        particle,
        amount,
        rebuilding,
        holding,
        palette[index % palette.length],
      ))
      if (amount < 1) {
        animationRef.current = requestAnimationFrame(render)
      } else if (rebuilding) {
        completionRef.current = requestAnimationFrame(() => {
          completionRef.current = requestAnimationFrame(completeIn)
        })
      } else {
        completeOut()
      }
    }
    if (phase === 'dormant') render(startedAt + duration)
    else animationRef.current = requestAnimationFrame(render)
    // 隱藏或透明視窗可能暫停 rAF；這個 timeout 只負責避免狀態永久卡住，
    // 正常可見時會先由 rAF 完成並清掉它。
    fallbackTimer = window.setTimeout(() => {
      if (completed) return
      render(startedAt + duration)
      if (rebuilding) completeIn()
    }, duration + 180)
    return () => {
      cancelAnimationFrame(animationRef.current)
      cancelAnimationFrame(completionRef.current)
      clearTimeout(fallbackTimer)
    }
  }, [snapshot, revision, phase, speed, onSnapshotFailed, onOutFinished, onInFinished])

  if (mode !== 'shatter' || !['shatter-out', 'dormant', 'shatter-in'].includes(phase) || !snapshot || snapshot.revision !== revision) {
    return null
  }

  return (
    <div key={revision} className={`song-transition-layer phase-${phase}`} aria-hidden>
      <canvas ref={canvasRef} className="song-transition-canvas" />
    </div>
  )
}

export default memo(SongTransitionLayer)
