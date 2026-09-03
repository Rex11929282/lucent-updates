import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')

const shell = source.slice(
  source.indexOf('function ConsoleShell'),
  source.indexOf('// ================= 應用程式更新 ================='),
)
const shellCss = css.slice(css.indexOf('.cw--console'), css.length)

test('正式控制台以固定導覽保留首頁與既有功能頁', () => {
  assert.match(source, /import \{ CONSOLE_NAV, getHomeNextAction \}/)
  assert.match(shell, /CONSOLE_NAV\.map/)
  assert.match(shell, /<HomeDashboard/)
  assert.match(shell, /<PlayTab /)
  assert.match(shell, /<LookTab[\s\S]*embedded/)
  assert.match(shell, /<RoomTab /)
  assert.match(shell, /<SettingsTab /)
  assert.match(shell, /<HelpTab /)
  assert.doesNotMatch(source, /function LiquidWorkbench\(/)
  assert.doesNotMatch(source, /useWorkbenchPointer/)
})

test('首頁有共用藥丸預覽、教學入口與安全找回藥丸動作', () => {
  assert.match(source, /function HomeDashboard/)
  assert.match(source, /<ConsoleCapsulePreview state=\{state\} playing=\{playing\}/)
  assert.match(shell, /ov\.console\.showPill\(\)/)
  assert.match(shell, /onboardingOpen/)
  assert.match(source, /import \{ ONBOARDING_VERSION, shouldOpenOnboarding \}/)
  assert.match(shell, /onboardingVersion: ONBOARDING_VERSION/)
  assert.match(source, /step === ONBOARDING_LAST_STEP/)
})

test('控制台可見表面是圓角不透明材質，不使用桌面模糊', () => {
  assert.match(shellCss, /border-radius:28px/)
  assert.match(shellCss, /background:var\(--console-surface\)/)
  assert.doesNotMatch(shellCss, /backdrop-filter/)
  assert.match(shellCss, /grid-template-areas:"nav main panel"/)
  assert.match(shellCss, /@media \(max-width: 860px\)[\s\S]*grid-template-areas:"nav main" "nav panel"/)
})

test('控制台仍是正常桌面視窗，保留原本收起藥丸流程', () => {
  assert.match(main, /width:\s*1080,\s*height:\s*720/)
  assert.match(main, /alwaysOnTop:\s*false/)
  assert.match(main, /setOverlayConsoleCollapsed\(true\)/)
  assert.match(main, /ipcMain\.handle\('console:show-pill'/)
})

test('藥丸預覽舞台使用深色假桌布，白色字幕才看得清楚', () => {
  // 預覽區若沿用控制台的淺色面板，白字幕會糊成一片，等於預覽不到外觀。
  const stage = shellCss.slice(shellCss.indexOf('.console-shell .home-dashboard__preview,'))
  assert.match(stage, /\.console-shell \.home-dashboard__preview,\s*\n\.console-shell \.console-look-preview \{/)
  assert.match(stage, /linear-gradient\(150deg, #26344a/)
  assert.match(stage, /conic-gradient/)
  assert.doesNotMatch(stage.slice(0, stage.indexOf('}')), /backdrop-filter/)
})

test('工具列動作按鈕不會把中文標籤擠到換行', () => {
  const bar = css.slice(css.indexOf('.searchbar {'), css.indexOf('.results {'))
  assert.match(bar, /\.searchbar \.btn \{[^}]*white-space: nowrap/)
  assert.match(bar, /\.searchbar input \{[^}]*min-width: 0/)
})

test('retired draggable workbench renderer and styles no longer ship', () => {
  assert.equal(fs.existsSync(new URL('../src/liquidWorkbenchModel.js', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../src/useWorkbenchPointer.js', import.meta.url)), false)
  assert.doesNotMatch(css, /\.cw--workbench\b/)
  assert.doesNotMatch(css, /\.workbench(?:--|__|\s*\{)/)
})
