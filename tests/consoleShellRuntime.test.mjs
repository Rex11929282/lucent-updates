import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const shellSource = source.slice(
  source.indexOf('function ConsoleShell'),
  source.indexOf('// ================= 應用程式更新 ================='),
)

test('fixed console shell replaces the draggable workbench without replacing feature tabs', () => {
  assert.match(shellSource, /CONSOLE_NAV\.map/)
  assert.match(shellSource, /<HomeDashboard/)
  assert.match(shellSource, /<ConsoleCapsulePreview/)
  assert.match(shellSource, /<PlayTab /)
  assert.match(shellSource, /<LookTab[\s\S]*embedded/)
  assert.match(shellSource, /<RoomTab /)
  assert.match(shellSource, /<SettingsTab /)
  assert.match(shellSource, /<HelpTab /)
  assert.match(shellSource, /shouldOpenOnboarding\(\{ hydrated, onboardingVersion: consoleState\.onboardingVersion \}\)/)
  assert.doesNotMatch(source, /function LiquidWorkbench\(/)
  assert.doesNotMatch(source, /useWorkbenchPointer/)
})

test('fixed shell is opaque, rounded, and has a responsive two-column fallback', () => {
  assert.match(css, /\.console-shell\s*\{[\s\S]*border-radius:\s*28px/)
  assert.match(css, /\.console-shell\s*\{[\s\S]*background:\s*var\(--console-surface/)
  assert.doesNotMatch(css.match(/\.console-shell\s*\{[\s\S]*?\n\}/)?.[0] || '', /backdrop-filter/)
  assert.match(css, /\.console-nav\s*\{[\s\S]*grid-area:\s*nav/)
  assert.match(css, /\.console-main\s*\{[\s\S]*grid-area:\s*main/)
  assert.match(css, /\.console-panel\s*\{[\s\S]*grid-area:\s*panel/)
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.console-shell[\s\S]*grid-template-areas:/)
})
