const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
const consoleWindow = fs.readFileSync(path.join(__dirname, '..', 'src', 'ConsoleWindow.jsx'), 'utf8')

test('main delegates automatic GSMTC choice to one stateful resolver', () => {
  assert.match(main, /createActiveSessionResolver/)
  assert.match(main, /activeSessionResolver\.resolve\(sessions, \{ manualSourceAppId: followApp \}\)/)
  assert.doesNotMatch(main, /sessions\.find\(\(x\) => NETEASE_RE/)
})

test('non-NetEase SMTC uses its real timeline while NetEase keeps the precise CDP clock', () => {
  assert.match(main, /if \(cur\.isNetease\) \{[\s\S]*?cdpSec >= 0/)
  assert.match(main, /smtcClockDecision\(lastSmtcClockState, cur\)/)
  assert.match(main, /clkSync\(clock\.positionMs, clock\.playing, 'smtc'\)/)
  assert.match(main, /activeSmtcSourceAppId && !NETEASE_RE\.test\(activeSmtcSourceAppId\)/)
})

test('console describes automatic current-media detection rather than NetEase-only selection', () => {
  assert.match(consoleWindow, /t\('player\.followAutomatic'\)/)
  assert.doesNotMatch(consoleWindow, /自動（找網易雲）/)
})
