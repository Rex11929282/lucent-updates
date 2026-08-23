import { useEffect, useRef } from 'react'
import { createDecorationRuntime } from '../effects/decorationRuntime.js'
import { meteorDrawStyle } from '../effects/decorativeParticles.js'

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function drawMeteor(ctx, particle, cfg) {
  const speed = Math.hypot(particle.vx, particle.vy) || 1
  const directionX = particle.vx / speed
  const directionY = particle.vy / speed
  const tailLength = particle.length * particle.trailLength
  const tailX = particle.x - directionX * tailLength
  const tailY = particle.y - directionY * tailLength
  const color = cfg.decorationColor || '#ffffff'
  const coreColor = cfg.meteorColorMode === 'fixed'
    ? color
    : (cfg.decorationColor2 || color)
  const strength = clamp(cfg.decorationStrength ?? 0.6)
  const alpha = clamp(cfg.meteorAlpha ?? 0.85) * strength
  const edgeStyle = meteorDrawStyle(cfg)
  const gradient = ctx.createLinearGradient(tailX, tailY, particle.x, particle.y)

  gradient.addColorStop(0, 'transparent')
  gradient.addColorStop(edgeStyle.tailFadeStop, 'transparent')
  gradient.addColorStop(1, color)

  ctx.save()
  ctx.lineCap = edgeStyle.lineCap
  ctx.strokeStyle = gradient
  ctx.lineWidth = particle.size
  ctx.shadowColor = color
  ctx.shadowBlur = particle.size * edgeStyle.tailBlurScale
  ctx.globalAlpha = alpha * clamp(particle.trailAlpha)
  ctx.beginPath()
  ctx.moveTo(tailX, tailY)
  ctx.lineTo(particle.x, particle.y)
  ctx.stroke()

  ctx.strokeStyle = coreColor
  ctx.shadowBlur = 0
  ctx.lineWidth = Math.max(0.75, particle.size * 0.55)
  ctx.globalAlpha = clamp(alpha * particle.coreBrightness)
  ctx.beginPath()
  ctx.moveTo(
    particle.x - directionX * particle.length * 0.24,
    particle.y - directionY * particle.length * 0.24,
  )
  ctx.lineTo(particle.x, particle.y)
  ctx.stroke()

  ctx.fillStyle = coreColor
  ctx.shadowColor = coreColor
  ctx.shadowBlur = Math.max(0, (cfg.meteorGlowRange ?? 8) * (cfg.meteorGlowStrength ?? 0.55))
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(particle.x, particle.y, Math.max(1, particle.size * 0.8), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawSakura(ctx, particle, cfg) {
  const size = particle.size

  ctx.save()
  ctx.translate(particle.x, particle.y)
  ctx.rotate(particle.rotation)
  ctx.fillStyle = cfg.decorationColor2 || cfg.decorationColor || '#ffb7d5'
  ctx.globalAlpha = clamp(cfg.sakuraAlpha ?? 0.8) * clamp(cfg.decorationStrength ?? 0.6)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(size * 0.12, -size * 0.72, size * 0.78, -size * 0.7, size, 0)
  ctx.bezierCurveTo(size * 0.62, size * 0.24, size * 0.18, size * 0.22, 0, 0)
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-size * 0.12, -size * 0.72, -size * 0.78, -size * 0.7, -size, 0)
  ctx.bezierCurveTo(-size * 0.62, size * 0.24, -size * 0.18, size * 0.22, 0, 0)
  ctx.fill()
  ctx.restore()
}

function drawSnow(ctx, particle, cfg) {
  const radius = Math.max(0.75, particle.size * 0.5)
  const color = cfg.decorationColor || '#ffffff'
  const alpha = clamp(cfg.snowAlpha ?? 0.8)
    * clamp(cfg.decorationStrength ?? 0.6)
    * Math.max(0, cfg.snowBrightness ?? 1)

  ctx.save()
  ctx.translate(particle.x, particle.y)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.globalAlpha = clamp(alpha)

  if (particle.shape === 'crystal') {
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(0.6, radius * 0.22)
    ctx.beginPath()
    for (let arm = 0; arm < 6; arm += 1) {
      const angle = arm * Math.PI / 3
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    ctx.stroke()
  } else {
    ctx.shadowColor = color
    ctx.shadowBlur = radius * 2 * clamp(cfg.snowSoftness ?? 0.45)
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawParticle(ctx, particle, cfg) {
  if (particle.kind === 'meteor') drawMeteor(ctx, particle, cfg)
  else if (particle.kind === 'sakura') drawSakura(ctx, particle, cfg)
  else if (particle.kind === 'snow') drawSnow(ctx, particle, cfg)
}

export default function DecorationCanvas({ cfg, playing, eventKey, previewActive = true }) {
  const canvasRef = useRef(null)
  const cfgRef = useRef(cfg)
  const playingRef = useRef(playing)
  const eventKeyRef = useRef(eventKey)
  const previewActiveRef = useRef(previewActive)
  cfgRef.current = cfg
  playingRef.current = playing
  eventKeyRef.current = eventKey
  previewActiveRef.current = previewActive
  const mode = cfg.decorationMode

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return undefined

    return createDecorationRuntime({
      canvas,
      context: ctx,
      readState: () => ({
        cfg: cfgRef.current,
        playing: playingRef.current,
        eventKey: eventKeyRef.current,
        previewActive: previewActiveRef.current,
      }),
      drawParticle,
    })
  }, [mode, previewActive])

  return <canvas ref={canvasRef} className="decoration-canvas" aria-hidden />
}
