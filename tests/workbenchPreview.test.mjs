import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const consoleSource = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const capsuleSource = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
const previewSource = consoleSource.slice(
  consoleSource.indexOf('function ConsoleCapsulePreview'),
  consoleSource.indexOf('function ConsoleStatusRail'),
)
const lookTabSource = consoleSource.slice(
  consoleSource.indexOf('function LookTab'),
  consoleSource.indexOf('function BackgroundTab'),
)

test('workbench preview uses Capsule rather than a second simplified LiquidGlass pill', () => {
  assert.match(consoleSource, /import Capsule from '\.\/components\/Capsule\.jsx'/)
  assert.match(consoleSource, /<Capsule[\s\S]*preview/)
  assert.doesNotMatch(previewSource, /<LiquidGlass/)
  assert.match(capsuleSource, /preview = false/)
})

test('preview always renders the fixed Lucent product message rather than room music', () => {
  assert.match(previewSource, /songName=\{t\('ui\.preview\.song'\)\}/)
  assert.match(previewSource, /line=\{t\('ui\.preview\.line'\)\}/)
  assert.match(previewSource, /trans=\{t\('ui\.preview\.trans'\)\}/)
  assert.doesNotMatch(previewSource, /roomState\?\.mirror/)
  assert.doesNotMatch(previewSource, /roomState\?\.song/)
})

test('preview mode leaves desktop-only sizing and pointer movement disabled', () => {
  assert.match(capsuleSource, /if \(preview \|\| !ov\.isElectron\) return/)
  assert.match(capsuleSource, /shouldRunLineEffects\(\{ playing, effectsPaused, preview \}\)/)
  assert.match(capsuleSource, /!preview && !effectsPaused && \(\(glass\.elasticity/)
  assert.match(capsuleSource, /onPointerDown=\{preview \? undefined : onPointerDown\}/)
})

test('preview paints its representative progress through the shared visual frame without a desktop interval', () => {
  assert.match(capsuleSource, /const paintProgress = useCallback/)
  assert.match(capsuleSource, /paintProgress\(\)/)
  assert.match(capsuleSource, /requestAnimationFrame\(paint\)/)
  assert.doesNotMatch(capsuleSource, /setInterval\(\(\) => \{\s*paintProgress/)
})

test('appearance-tab preview reuses Capsule rather than a simplified glass sample', () => {
  assert.match(lookTabSource, /<ConsoleCapsulePreview state=\{state\}/)
  assert.doesNotMatch(lookTabSource, /<LiquidGlass/)
  assert.doesNotMatch(lookTabSource, /<DecorationCanvas/)
})
