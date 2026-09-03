import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createTranslator } from '../src/i18n.js'
import { localizeRuntimeMessage, networkAdapterLabel } from '../src/runtimeMessage.js'

test('runtime backend errors are translated instead of leaking Chinese into another locale', () => {
  const en = createTranslator('en-US')
  assert.equal(localizeRuntimeMessage(en, '開發模式不執行自動更新'), 'Automatic updates are disabled in development mode')
  assert.equal(localizeRuntimeMessage(en, '無法建立局域網房間：EADDRINUSE'), 'Could not create a local network room: EADDRINUSE')
  assert.equal(localizeRuntimeMessage(en, '未知的後端錯誤'), 'Operation failed')
  assert.equal(localizeRuntimeMessage(en, 'WebSocket timeout'), 'WebSocket timeout')
})

test('known network adapter names use the active UI language', () => {
  const en = createTranslator('en-US')
  const zh = createTranslator('zh-TW')
  assert.equal(networkAdapterLabel(en, '乙太網路'), 'Ethernet')
  assert.equal(networkAdapterLabel(zh, 'Ethernet'), '乙太網路')
  assert.equal(networkAdapterLabel(en, 'Wi-Fi'), 'Wi-Fi')
})

test('update and room panels use runtime localization for backend-provided text', () => {
  const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
  const update = source.slice(source.indexOf('function UpdateTab'), source.indexOf('// ================= 房間 ================='))
  const room = source.slice(source.indexOf('// ================= 房間 ================='), source.indexOf('// ================= 網易雲帳號'))
  assert.match(update, /localizeRuntimeMessage\(t, snapshot\.reason/)
  assert.match(update, /localizeRuntimeMessage\(t, result\?\.error/)
  assert.match(room, /localizeRuntimeMessage\(t, status\.error/)
  assert.match(room, /networkAdapterLabel\(t, entry\.adapter\)/)
})
