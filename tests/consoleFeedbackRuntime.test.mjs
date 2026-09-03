import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('console owns notices, confirmations, and close choices without browser dialogs', () => {
  assert.match(source, /function ConsoleFeedbackProvider/)
  assert.match(source, /function CloseChoiceDialog/)
  assert.match(source, /onCloseRequested/)
  assert.match(source, /ov\.console\.closeWith\(/)
  assert.doesNotMatch(source, /\balert\(/)
  assert.doesNotMatch(source, /window\.confirm/)
  assert.doesNotMatch(source, /window\.prompt/)
})
