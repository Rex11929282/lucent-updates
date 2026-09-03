import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('room tab renders measured sync delay and quality from room status', () => {
  const consoleSource = read('src/ConsoleWindow.jsx')
  const mainSource = read('electron/main.cjs')
  assert.match(consoleSource, /t\('ui\.room\.syncDelay'\)/)
  assert.match(consoleSource, /status\.sync/)
  assert.match(mainSource, /room\.on\('sync'/)
})
