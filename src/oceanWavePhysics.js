const TAU = Math.PI * 2

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

export function createOceanWaveState(level = 0) {
  return { phase: 0, surface: clamp(level, 0, 1), velocity: 0 }
}

export function stepOceanWave(state, { level = 0, seconds = 0, speed = 1, playing = false } = {}) {
  const target = clamp(level, 0, 1)
  const elapsed = Math.max(0, Math.min(0.25, Number(seconds) || 0))
  if (Math.abs(target - state.surface) > 0.18) {
    state.surface = target
    state.velocity = 0
  } else if (playing && elapsed) {
    let remaining = elapsed
    while (remaining > 0) {
      const dt = Math.min(0.016, remaining)
      state.velocity += ((target - state.surface) * 38 - state.velocity * 11) * dt
      state.surface = clamp(state.surface + state.velocity * dt, 0, 1)
      remaining -= dt
    }
  }
  if (playing && elapsed) state.phase = (state.phase + elapsed * clamp(speed, 0.2, 3)) % TAU
  return state
}

function rgba(hex, alpha) {
  const value = String(hex || '#45b9ff').replace('#', '')
  const red = parseInt(value.slice(0, 2), 16) || 69
  const green = parseInt(value.slice(2, 4), 16) || 185
  const blue = parseInt(value.slice(4, 6), 16) || 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function drawLayer(ctx, width, height, phase, amplitude, frequency, offset, color) {
  const crest = Math.max(5, height * 0.075)
  ctx.beginPath()
  ctx.moveTo(0, crest)
  for (let x = 0; x <= width + 2; x += 2) {
    const wave = Math.sin((x / width) * TAU * frequency + phase + offset)
      + Math.sin((x / width) * TAU * (frequency * 0.47) + phase * 1.7 + offset) * 0.34
    ctx.lineTo(x, crest + wave * amplitude)
  }
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

export function paintOceanWave(canvas, state, { amplitude = 0.45, color = '#45b9ff' } = {}) {
  if (!canvas) return
  const width = Math.max(0, canvas.clientWidth || 0)
  const height = Math.max(0, canvas.clientHeight || 0)
  if (!width || !height) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const strength = 2 + clamp(amplitude, 0, 1) * 13
  drawLayer(ctx, width, height, state.phase * 0.72, strength * 0.72, 1.35, 1.8, rgba(color, 0.30))
  drawLayer(ctx, width, height, state.phase * -0.94, strength * 0.94, 1.8, 3.7, rgba(color, 0.44))
  drawLayer(ctx, width, height, state.phase * 1.18, strength, 2.35, 5.4, rgba(color, 0.68))
}
