const test = require('node:test')
const assert = require('node:assert/strict')

let consoleState = {}
try { consoleState = require('../shared/consoleState.cjs') } catch {}

test('legacy workbench focus migrates to a stable console page', () => {
  assert.equal(typeof consoleState.normalizeConsoleState, 'function')
  assert.deepEqual(
    consoleState.normalizeConsoleState({}, { activeModule: 'look' }),
    {
      selectedPage: 'look',
      onboardingVersion: 0,
      theme: 'system',
      startupView: 'console',
      closeBehavior: 'ask',
      motion: 'full',
      launchAtLogin: false,
      appearanceSection: 'quick',
    },
  )
})

test('invalid console preferences fall back without discarding valid choices', () => {
  assert.equal(typeof consoleState.normalizeConsoleState, 'function')
  const value = consoleState.normalizeConsoleState({
    selectedPage: 'room',
    theme: 'pink',
    closeBehavior: 'later',
    motion: 'off',
    launchAtLogin: true,
  })
  assert.equal(value.selectedPage, 'room')
  assert.equal(value.theme, 'system')
  assert.equal(value.closeBehavior, 'ask')
  assert.equal(value.motion, 'off')
  assert.equal(value.launchAtLogin, true)
})

test('invalid motion preference falls back to the complete interaction mode', () => {
  const value = consoleState.normalizeConsoleState({ motion: 'chaotic' })
  assert.equal(value.motion, 'full')
})
