import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('retired lyric offset has no renderer or settings UI path', () => {
  const app = read('src/App.jsx')
  const consoleWindow = read('src/ConsoleWindow.jsx')
  assert.doesNotMatch(app, /cfg\.offset/)
  assert.doesNotMatch(consoleWindow, /cfg\.offset|字幕提前\s*\/\s*延遲/)
})

test('retired pill RGB border is absent while progress RGB remains', () => {
  const capsule = read('src/components/Capsule.jsx')
  const consoleWindow = read('src/ConsoleWindow.jsx')
  const styles = read('src/styles.css')
  assert.doesNotMatch(capsule, /borderRGB|fx-border/)
  assert.doesNotMatch(consoleWindow, /borderRGB|藥丸邊框跑馬燈/)
  assert.doesNotMatch(styles, /\.fx-border/)
  assert.match(styles, /\.progress\.rgb/)
})
