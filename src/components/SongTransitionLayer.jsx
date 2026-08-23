import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ov } from '../overlayBridge.js'
import { createShatterParticles, particleTransitionDuration } from '../songTransition.js'

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1)
    globalThis.crypto.getRandomValues(value)
    return value[0]
  }
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0
}

function loadSnapshot(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })
}

function visualSurface(sourceRef) {
  const root = sourceRef?.current
  if (!root) return null
  return root.querySelector('.glass') || root.querySelector('.plain') || root
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

function drawParticle(context, particle, amount, rebuilding) {
  const eased = rebuilding
    ? 1 - Math.pow(1 - amount, 3)
    : 1 - Math.pow(1 - amount, 2)
  const travel = rebuilding ? 1 - eased : eased
  const opacity = rebuilding
    ? (amount < 0.72 ? 0.78 : Math.max(0, (1 - amount) / 0.28) * 0.78)
    : Math.min(0.78, 0.12 + amount * 2.8)
  const centerX = particle.x + particle.w / 2
  const centerY = particle.y + particle.h / 2
  const radius = particle.radius * (rebuilding ? 0.72 + eased * 0.28 : 1 - eased * 0.28)

  context.save()
  context.globalAlpha = Math.max(0, Math.min(1, opacity * particle.alpha))
  context.translate(centerX + particle.dx * travel, centerY + particle.dy * travel)
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fillStyle = particle.color
  context.fill()
  context.restore()
}

function SongTransitionLayer({
  phase,
  mode,
  revision,
  sourceRef,
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
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    if (mode !== 'shatter' || phase !== 'capture-out') return undefined
    const captureKey = `${revision}:${phase}`
    if (captureRevisionRef.current === captureKey) return undefined
    captureRevisionRef.current = captureKey
    let cancelled = false
    let captureFrame = 0
    let paintFrame = 0

    captureFrame = requestAnimationFrame(() => {
      paintFrame = requestAnimationFrame(async () => {
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
        if (cancelled || !dataUrl) return
        const image = await loadSnapshot(dataUrl)
        if (cancelled) return
        const particles = createShatterParticles({
          width: crop.width,
          height: crop.height,
          seed: randomSeed(),
          count: 64,
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
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(captureFrame)
      cancelAnimationFrame(paintFrame)
    }
  }, [mode, phase, revision, sourceRef, onSnapshotReady, onSnapshotFailed])

  useLayoutEffect(() => {
    cancelAnimationFrame(animationRef.current)
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

    const render = (now) => {
      const amount = Math.min(1, Math.max(0, (now - startedAt) / duration))
      context.setTransform(scale, 0, 0, scale, 0, 0)
      context.clearRect(0, 0, snapshot.width, snapshot.height)
      snapshot.particles.forEach((particle) => drawParticle(context, particle, amount, rebuilding))
      if (amount < 1) {
        animationRef.current = requestAnimationFrame(render)
      } else if (rebuilding) {
        onInFinished?.()
      } else {
        onOutFinished?.()
      }
    }
    if (phase === 'dormant') render(startedAt + duration)
    else animationRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animationRef.current)
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
