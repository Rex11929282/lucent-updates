import test from 'node:test'
import assert from 'node:assert/strict'
import { CONSOLE_NAV, getHomeNextAction } from '../src/consoleShellModel.js'

test('console navigation is stable and text-labelled', () => {
  assert.deepEqual(
    CONSOLE_NAV.map((item) => item.id),
    ['home', 'play', 'look', 'room', 'settings', 'help'],
  )
  assert.ok(CONSOLE_NAV.every((item) => item.label.length > 0))
})

test('home asks for precise sync before nonessential actions', () => {
  assert.deepEqual(
    getHomeNextAction({ song: null, precise: false, room: 'idle', update: 'current' }),
    { id: 'sync', label: '連接精準同步', page: 'play' },
  )
})

test('home offers the desktop pill only when all health checks are ready', () => {
  assert.deepEqual(
    getHomeNextAction({ song: { name: '璃音' }, precise: true, room: 'idle', update: 'current' }),
    { id: 'pill', label: '顯示桌面藥丸', page: 'home' },
  )
})
