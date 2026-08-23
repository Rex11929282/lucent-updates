import test from 'node:test'
import assert from 'node:assert/strict'

import { localPointerForPill, pillMouseRect } from '../src/pillMouse.js'

const rect = { left: 100, top: 50, right: 300, bottom: 130, width: 200, height: 80 }

test('mouse response stays neutral until the pointer enters the configured outer distance', () => {
  assert.deepEqual(localPointerForPill({ x: 80, y: 90 }, rect, 14), { x: 0, y: 0, active: false })
  assert.deepEqual(localPointerForPill({ x: 87, y: 90 }, rect, 14), { x: -13, y: 40, active: true })
  assert.deepEqual(localPointerForPill({ x: 250, y: 80 }, rect, 14), { x: 150, y: 30, active: true })
})

test('zero distance reacts only inside the pill and large values remain explicit', () => {
  assert.equal(localPointerForPill({ x: 99, y: 90 }, rect, 0).active, false)
  assert.equal(localPointerForPill({ x: 100, y: 90 }, rect, 0).active, true)
  assert.equal(localPointerForPill({ x: 30, y: 90 }, rect, 80).active, true)
  assert.equal(localPointerForPill({ x: 19, y: 90 }, rect, 80).active, false)
})

test('mouse sensing measures the visible glass instead of the zero-size React wrapper', () => {
  const visibleRect = { left: 40, top: 20, right: 240, bottom: 100, width: 200, height: 80 }
  const glass = { getBoundingClientRect: () => visibleRect }
  const wrapper = {
    getBoundingClientRect: () => ({ left: 140, top: 60, right: 140, bottom: 60, width: 0, height: 0 }),
    querySelector: (selector) => selector === '.glass' ? glass : null,
  }
  assert.equal(pillMouseRect(wrapper), visibleRect)
})
