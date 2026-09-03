const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DEFAULT_WORKBENCH,
  normalizeWorkbench,
  moveWorkbenchModule,
} = require('../shared/liquidWorkbench.cjs')

test('workbench restores the four known modules and safe default focus', () => {
  const value = normalizeWorkbench({ activeModule: 'invalid', modules: { play: { x: 9, y: -9 } } })
  assert.deepEqual(Object.keys(value.modules), ['play', 'look', 'room', 'system'])
  assert.equal(value.activeModule, DEFAULT_WORKBENCH.activeModule)
  assert.deepEqual(value.modules.play, { x: 0.42, y: -0.34 })
})

test('workbench permits no focused module without accepting unknown module ids', () => {
  assert.equal(normalizeWorkbench({ activeModule: '' }).activeModule, '')
  assert.equal(normalizeWorkbench({ activeModule: 'unknown' }).activeModule, DEFAULT_WORKBENCH.activeModule)
})

test('new workbench starts neutral so its live pill preview is not covered by an inspector', () => {
  assert.equal(DEFAULT_WORKBENCH.activeModule, '')
})

test('workbench surface accepts only glass or white and keeps the choice', () => {
  assert.equal(normalizeWorkbench({ surface: 'white' }).surface, 'white')
  assert.equal(normalizeWorkbench({ surface: 'invalid' }).surface, 'glass')
  assert.equal(DEFAULT_WORKBENCH.surface, 'glass')
})

test('moving a module persists bounded normalized coordinates without touching other modules', () => {
  const moved = moveWorkbenchModule(DEFAULT_WORKBENCH, 'look', { x: -1, y: 1 })
  assert.deepEqual(moved.modules.look, { x: -0.42, y: 0.34 })
  assert.deepEqual(moved.modules.play, DEFAULT_WORKBENCH.modules.play)
})
