import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const runtimeUrl = new URL('../src/effects/decorationRuntime.js', import.meta.url)
const runtimeExists = existsSync(fileURLToPath(runtimeUrl))
const runtimeModule = runtimeExists ? await import(runtimeUrl) : null

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function readCssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`))
  assert.ok(match, `${selector} rule is required`)
  return match[1]
}

function assertOrdered(source, needles) {
  let cursor = 0
  for (const needle of needles) {
    const index = source.indexOf(needle, cursor)
    assert.ok(index >= cursor, `${needle} must appear after the previous item`)
    cursor = index + needle.length
  }
}

function createHarness(createDecorationRuntime, overrides = {}) {
  let nextFrameId = 0
  let dpr = overrides.dpr ?? 1
  let state = overrides.state ?? {
    cfg: { decorationMode: 'snow', decorationCount: 2 },
    playing: true,
    eventKey: 'line-1',
    previewActive: true,
  }
  const pendingFrames = new Map()
  const cancelledFrames = []
  const draws = []
  const contextCalls = { clears: 0, currentTransform: [1, 0, 0, 1, 0, 0], transforms: [] }
  const savedTransforms = []
  const observerCalls = { created: 0, observed: 0, disconnected: 0 }
  let resizeCallback = null

  const context = {
    save() { savedTransforms.push(contextCalls.currentTransform) },
    restore() { contextCalls.currentTransform = savedTransforms.pop() },
    clearRect() { contextCalls.clears += 1 },
    setTransform(...args) {
      contextCalls.currentTransform = args
      contextCalls.transforms.push(args)
    },
  }
  const canvas = {
    width: 0,
    height: 0,
    getBoundingClientRect() {
      return overrides.rect ?? { width: 100, height: 40 }
    },
  }
  const observer = {
    observe() { observerCalls.observed += 1 },
    disconnect() { observerCalls.disconnected += 1 },
  }

  const stop = createDecorationRuntime({
    canvas,
    context,
    readState: () => state,
    drawParticle: (ctx, particle, cfg) => draws.push({ ctx, particle, cfg }),
    requestFrame(callback) {
      const id = ++nextFrameId
      pendingFrames.set(id, callback)
      return id
    },
    cancelFrame(id) {
      cancelledFrames.push(id)
      pendingFrames.delete(id)
    },
    createObserver(callback) {
      observerCalls.created += 1
      resizeCallback = callback
      return observer
    },
    readDevicePixelRatio: () => dpr,
  })

  return {
    canvas,
    cancelledFrames,
    contextCalls,
    draws,
    observerCalls,
    pendingCount: () => pendingFrames.size,
    resize(contentRect) {
      resizeCallback?.([{ contentRect }])
    },
    runFrame(timestamp) {
      assert.equal(pendingFrames.size, 1, 'runtime must keep exactly one pending RAF')
      const [id, callback] = pendingFrames.entries().next().value
      pendingFrames.delete(id)
      const start = draws.length
      callback(timestamp)
      return draws.slice(start)
    },
    setDpr(value) { dpr = value },
    setState(value) { state = value },
    stop,
  }
}

test('Task 3 runtime helper exists for executable behavior tests', () => {
  assert.equal(runtimeExists, true, 'src/effects/decorationRuntime.js is required')
})

test('React wiring keeps fresh config in refs and groups background opacity once', () => {
  const canvasSource = readSource('../src/components/DecorationCanvas.jsx')
  const capsuleSource = readSource('../src/components/Capsule.jsx')
  const cssSource = readSource('../src/styles.css')

  assert.match(canvasSource, /createDecorationRuntime/)
  assert.match(canvasSource, /const cfgRef = useRef\(cfg\)/)
  assert.match(canvasSource, /cfgRef\.current = cfg/)
  assert.doesNotMatch(canvasSource, /\[cfg,\s*previewActive\]/)
  assert.match(canvasSource, /\[mode,\s*previewActive\]/)
  assert.match(canvasSource, /meteorDrawStyle\(cfg\)/)
  assert.match(canvasSource, /edgeStyle\.tailFadeStop/)
  assert.match(canvasSource, /edgeStyle\.tailBlurScale/)
  assertOrdered(capsuleSource, [
    '<div className="background-stack">',
    '<div className="coverlayer" />',
    '<div className="bglayer" />',
    '</div>',
    '<DecorationCanvas',
  ])
  assert.equal((cssSource.match(/opacity:\s*var\(--bg-alpha/g) || []).length, 1)
  assert.match(readCssRule(cssSource, '.background-stack'), /opacity:\s*var\(--bg-alpha,\s*0\.55\)/)
  assert.match(readCssRule(cssSource, '.visualclip'), /overflow:\s*hidden/)
  assert.match(readCssRule(cssSource, '.decoration-canvas'), /pointer-events:\s*none/)
})

test('Task 4 console exposes only four Chinese modes through mode-aware controls', () => {
  const consoleSource = readSource('../src/ConsoleWindow.jsx')
  const sectionStart = consoleSource.indexOf('<Section title="✨ 裝飾特效"')
  const sectionEnd = consoleSource.indexOf('<Section title="✨ 歌詞與藥丸動畫"', sectionStart)
  const sectionSource = consoleSource.slice(sectionStart, sectionEnd)

  for (const [value, label] of [
    ['none', '無'],
    ['meteor', '流星雨'],
    ['sakura', '櫻花飄落'],
    ['snow', '雪花飄落'],
  ]) {
    assert.match(sectionSource, new RegExp(`<option value="${value}">${label}</option>`))
  }

  assert.match(consoleSource, /const decorationControls = decorationControlsForMode\(cfg\.decorationMode\)/)
  assert.match(sectionSource, /<Section title="✨ 裝飾特效" \{\.\.\.sectionProps\('effects'\)\}>/)
  assert.match(sectionSource, /\{decorationControls\.count && <>/)
  assert.match(sectionSource, /\{decorationControls\.spawnRate && <>/)
  assert.match(sectionSource, /\{decorationControls\.sway && <>/)
  assert.match(sectionSource, /\{decorationControls\.drift && <>/)
})

test('Task 4 reset and preview toggle stay local to decoration UI', () => {
  const consoleSource = readSource('../src/ConsoleWindow.jsx')

  assert.match(consoleSource, /setCfg\(resetDecorationConfig\(\)\)/)
  assert.match(consoleSource, /const \[previewDecoration, setPreviewDecoration\] = useState\(true\)/)
  assert.match(consoleSource, /label="播放裝飾預覽"/)
  assert.doesNotMatch(consoleSource, /onChange=\{\(previewDecoration\).*setCfg/)
})

test('preview stacks the shared renderer above its background and below its content', () => {
  const consoleSource = readSource('../src/ConsoleWindow.jsx')
  const cssSource = readSource('../src/styles.css')
  const previewStart = consoleSource.indexOf('<div className="preview"')
  const previewEnd = consoleSource.indexOf('<Toggle label="播放裝飾預覽"', previewStart)
  const previewSource = consoleSource.slice(previewStart, previewEnd)

  assertOrdered(previewSource, [
    '<div className="preview__effect-layer">',
    '<DecorationCanvas',
    'previewActive={previewDecoration}',
    '</div>',
    '<div className="preview__content">',
    '<LiquidGlass',
  ])
  assert.match(readCssRule(cssSource, '.preview'), /overflow:\s*hidden/)
  assert.match(readCssRule(cssSource, '.preview'), /isolation:\s*isolate/)
  assert.match(readCssRule(cssSource, '.preview__effect-layer'), /z-index:\s*0/)
  assert.match(readCssRule(cssSource, '.preview__effect-layer'), /border-radius:\s*inherit/)
  assert.match(readCssRule(cssSource, '.preview__content'), /z-index:\s*1/)
})

test('meteor spawn rate changes fill speed on the same fake RAF timeline and stays capped', { skip: !runtimeExists }, () => {
  const make = (meteorSpawnRate) => createHarness(runtimeModule.createDecorationRuntime, {
    state: {
      cfg: { decorationMode: 'meteor', decorationCount: 999, meteorSpawnRate },
      playing: true,
      eventKey: 'line-1',
      previewActive: true,
    },
  })
  const low = make(0.2)
  const high = make(3)
  let lowFrame = low.runFrame(0)
  let highFrame = high.runFrame(0)

  for (let time = 50; time <= 1000; time += 50) {
    lowFrame = low.runFrame(time)
    highFrame = high.runFrame(time)
  }

  assert.ok(highFrame.length > lowFrame.length)
  assert.ok(highFrame.length <= 80)
  assert.ok(lowFrame.length <= 80)
  low.stop()
  high.stop()
})

test('changing meteor spawn rate preserves active particle identities and observer', { skip: !runtimeExists }, () => {
  const firstCfg = { decorationMode: 'meteor', decorationCount: 10, meteorSpawnRate: 3 }
  const harness = createHarness(runtimeModule.createDecorationRuntime, {
    state: { cfg: firstCfg, playing: true, eventKey: 'line-1', previewActive: true },
  })
  harness.runFrame(0)
  harness.runFrame(50)
  harness.runFrame(100)
  const before = harness.runFrame(150).map(({ particle }) => particle)
  const nextCfg = { ...firstCfg, meteorSpawnRate: 0.2 }

  harness.setState({ cfg: nextCfg, playing: true, eventKey: 'line-1', previewActive: true })
  const after = harness.runFrame(200).map(({ particle }) => particle)

  assert.deepEqual(after, before)
  assert.equal(harness.observerCalls.created, 1)
  harness.stop()
})

test('active runtime keeps one RAF chain and cleanup cancels and disconnects', { skip: !runtimeExists }, () => {
  const harness = createHarness(runtimeModule.createDecorationRuntime)

  assert.equal(harness.pendingCount(), 1)
  assert.deepEqual(harness.observerCalls, { created: 1, observed: 1, disconnected: 0 })
  harness.runFrame(0)
  assert.equal(harness.pendingCount(), 1)
  harness.runFrame(16)
  assert.equal(harness.pendingCount(), 1)

  harness.stop()

  assert.equal(harness.pendingCount(), 0)
  assert.equal(harness.cancelledFrames.length, 1)
  assert.equal(harness.observerCalls.disconnected, 1)
})

test('none and inactive preview clear without scheduling RAF or observer work', { skip: !runtimeExists }, () => {
  for (const state of [
    { cfg: { decorationMode: 'none', decorationCount: 80 }, playing: true, eventKey: 'a', previewActive: true },
    { cfg: { decorationMode: 'snow', decorationCount: 80 }, playing: true, eventKey: 'a', previewActive: false },
  ]) {
    const harness = createHarness(runtimeModule.createDecorationRuntime, { state })

    assert.equal(harness.pendingCount(), 0)
    assert.equal(harness.observerCalls.created, 0)
    assert.equal(harness.contextCalls.clears, 1)
    harness.stop()
  }
})

test('paused runtime paints at 5fps cadence instead of every display frame', { skip: !runtimeExists }, () => {
  assert.ok(runtimeModule.PAUSED_PAINT_INTERVAL_MS >= 125)
  assert.ok(runtimeModule.PAUSED_PAINT_INTERVAL_MS <= 250)
  const state = {
    cfg: { decorationMode: 'snow', decorationCount: 80 },
    playing: false,
    eventKey: 'line-1',
    previewActive: true,
  }
  const harness = createHarness(runtimeModule.createDecorationRuntime, { state })

  assert.equal(harness.runFrame(0).length, 80)
  const clearsAfterPaint = harness.contextCalls.clears
  const transformsAfterPaint = harness.contextCalls.transforms.length
  assert.equal(harness.runFrame(16).length, 0)
  assert.equal(harness.runFrame(100).length, 0)
  assert.equal(harness.runFrame(199).length, 0)
  assert.equal(harness.contextCalls.clears, clearsAfterPaint)
  assert.equal(harness.contextCalls.transforms.length, transformsAfterPaint)
  assert.equal(harness.runFrame(200).length, 80)
  harness.stop()
})

test('playing runtime limits expensive canvas paints to about 30fps on high refresh displays', { skip: !runtimeExists }, () => {
  assert.ok(runtimeModule.ACTIVE_PAINT_INTERVAL_MS >= 30)
  const harness = createHarness(runtimeModule.createDecorationRuntime, {
    state: {
      cfg: { decorationMode: 'meteor', decorationCount: 18, meteorSpawnRate: 3 },
      playing: true,
      eventKey: 'line-1',
      previewActive: true,
    },
  })

  assert.ok(harness.runFrame(0).length > 0)
  const clearsAfterFirstPaint = harness.contextCalls.clears
  assert.equal(harness.runFrame(10).length, 0)
  assert.equal(harness.runFrame(20).length, 0)
  assert.equal(harness.contextCalls.clears, clearsAfterFirstPaint)
  assert.ok(harness.runFrame(34).length > 0)
  harness.stop()
})

test('runtime caps DPR at 2 and refreshes backing store when only DPR changes', { skip: !runtimeExists }, () => {
  const harness = createHarness(runtimeModule.createDecorationRuntime, { dpr: 3 })

  assert.equal(harness.canvas.width, 200)
  assert.equal(harness.canvas.height, 80)
  assert.deepEqual(harness.contextCalls.currentTransform, [2, 0, 0, 2, 0, 0])

  harness.setDpr(1.5)
  harness.runFrame(0)
  assert.equal(harness.canvas.width, 150)
  assert.equal(harness.canvas.height, 60)
  assert.deepEqual(harness.contextCalls.currentTransform, [1.5, 0, 0, 1.5, 0, 0])

  harness.resize({ width: 120, height: 50 })
  assert.equal(harness.canvas.width, 180)
  assert.equal(harness.canvas.height, 75)
  harness.stop()
})

test('runtime caps pool at 80 and applies new cfg identity without rebuilding observer', { skip: !runtimeExists }, () => {
  const firstCfg = { decorationMode: 'snow', decorationCount: 999, decorationColor: '#fff' }
  const harness = createHarness(runtimeModule.createDecorationRuntime, {
    state: { cfg: firstCfg, playing: true, eventKey: 'line-1', previewActive: true },
  })
  const firstFrame = harness.runFrame(0)

  assert.equal(firstFrame.length, 80)
  assert.equal(new Set(firstFrame.map(({ particle }) => particle)).size, 80)

  const nextCfg = { decorationMode: 'snow', decorationCount: 2, decorationColor: '#f0f' }
  harness.setState({ cfg: nextCfg, playing: true, eventKey: 'line-1', previewActive: true })
  const nextFrame = harness.runFrame(16)

  assert.equal(nextFrame.length, 2)
  assert.equal(nextFrame[0].particle, firstFrame[0].particle)
  assert.equal(nextFrame[1].particle, firstFrame[1].particle)
  assert.equal(nextFrame[0].cfg, nextCfg)
  assert.equal(harness.observerCalls.created, 1)
  harness.stop()
})

test('meteor line burst uses a frame budget and returns to baseline count', { skip: !runtimeExists }, () => {
  const cfg = {
    decorationMode: 'meteor',
    decorationCount: 1,
    meteorBurstOnLine: true,
  }
  const harness = createHarness(runtimeModule.createDecorationRuntime, {
    state: { cfg, playing: true, eventKey: 'line-1', previewActive: true },
  })

  assert.equal(harness.runFrame(0).length, 1)
  harness.setState({ cfg, playing: true, eventKey: 'line-2', previewActive: true })
  assert.equal(harness.runFrame(34).length, 13)
  for (let frame = 2; frame <= 18; frame += 1) harness.runFrame(frame * 34)
  assert.equal(harness.runFrame(19 * 34).length, 1)
  harness.stop()

  const runtimeSource = readSource('../src/effects/decorationRuntime.js')
  assert.doesNotMatch(runtimeSource, /setInterval|setTimeout/)
})
