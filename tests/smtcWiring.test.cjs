const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const smtc = fs.readFileSync(path.join(root, 'electron', 'smtc.cjs'), 'utf8')
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8')

test('GSMTC collector emits the complete normalized media metadata inputs', () => {
  assert.match(smtc, /GetSessions\(\)/)
  assert.match(smtc, /sourceAppId\s*=\s*\$s\.SourceAppUserModelId/)
  assert.match(smtc, /albumArtist\s*=\s*\$p\.AlbumArtist/)
  assert.match(smtc, /albumTitle\s*=\s*\$p\.AlbumTitle/)
  assert.match(smtc, /duration\s*=\s*\$tl\.EndTime\.TotalSeconds/)
  assert.match(smtc, /playbackStatus\s*=\s*\$pb\.PlaybackStatus\.ToString\(\)/)
  assert.match(smtc, /OpenReadAsync\(\)/)
  assert.match(smtc, /normalizeMediaSessions\(s\)/)
})

test('main process consumes normalized session names through the active-session resolver', () => {
  assert.match(main, /sourceAppId: s\.sourceAppId/)
  assert.match(main, /activeSessionResolver\.resolve\(sessions, \{ manualSourceAppId: followApp \}\)/)
  assert.match(main, /position: selectedSession\.position \|\| 0/)
  assert.match(main, /selectedSession\.playbackStatus === 'Playing'/)
  assert.doesNotMatch(main, /sessions\.find\(\(x\) => x\.playing\)/)
})

test('non-NetEase SMTC only re-anchors when its position or state actually changes', () => {
  assert.match(main, /require\('\.\.\/shared\/smtcClock\.cjs'\)/)
  assert.match(main, /const clock = smtcClockDecision\(lastSmtcClockState, cur\)/)
  assert.match(main, /if \(clock\.shouldAnchor\) clkSync\(clock\.positionMs, clock\.playing, 'smtc'\)/)
  assert.match(main, /else if \(clock\.playingChanged\) clkSync\(clkPos\(\), clock\.playing, 'smtc-state'\)/)
})

test('the title-only NetEase fallback cannot replace a retained paused SMTC source', () => {
  assert.match(main, /if \(!followApp && nzTitle && !cur\) \{/)
})

test('CDP progress keeps the CDP heartbeat marker and only refreshes it on a new position', () => {
  assert.match(main, /const changed = Math\.abs\(posMs - posLast\.ms\) > 120/)
  assert.match(main, /cdpSecAt = changed \? Date\.now\(\) : cdpSecAt/)
  assert.match(main, /clk\.src = 'cdp'/)
  assert.doesNotMatch(main, /clk\.src = 'slider'/)
})
