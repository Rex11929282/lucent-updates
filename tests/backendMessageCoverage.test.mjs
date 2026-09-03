import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { localizePlayerError } from '../src/playerErrors.js'
import { localizeRuntimeMessage } from '../src/runtimeMessage.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'src/locales')

// The backend writes its error strings in Traditional Chinese. The UI can be in
// any of eleven languages, so every one of those strings has to be reachable
// from a translation key. An unmapped string collapses to a generic "action
// failed" message and the user never learns the actual reason.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function backendMessages() {
  const found = new Map()
  for (const dir of ['electron', 'shared']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.cjs')) continue
      const rel = `${dir}/${name}`
      const src = strip(fs.readFileSync(path.join(root, dir, name), 'utf8'))
      for (const re of [
        /error:\s*'([^']*[一-鿿][^']*)'/g,
        /reason:\s*'([^']*[一-鿿][^']*)'/g,
        /throw new Error\(\s*'([^']*[一-鿿][^']*)'/g,
      ]) {
        for (const m of src.matchAll(re)) if (!found.has(m[1])) found.set(m[1], rel)
      }
    }
  }
  return found
}

// Reports the requested key instead of a translation, so we can tell a real
// mapping apart from the generic fallback.
const probeT = (key) => `KEY:${key}`

function mappedKey(message) {
  const viaPlayer = localizePlayerError(probeT, message, { fallbackKey: '' })
  if (viaPlayer.startsWith('KEY:player.error.')) return viaPlayer.slice(4)
  const viaRuntime = localizeRuntimeMessage(probeT, message, 'GENERIC_FALLBACK')
  if (viaRuntime.startsWith('KEY:') && viaRuntime !== 'KEY:GENERIC_FALLBACK') return viaRuntime.slice(4)
  return ''
}

test('every backend Chinese message maps to a translation key', () => {
  const uncovered = []
  for (const [message, file] of backendMessages()) {
    if (!mappedKey(message)) uncovered.push(`${file}  ${message}`)
  }
  assert.deepEqual(
    uncovered,
    [],
    `these backend messages would show a generic fallback in every non-Chinese UI:\n  ${uncovered.join('\n  ')}`,
  )
})

function localeTables() {
  const base = JSON.parse(fs.readFileSync(path.join(localesDir, 'console-ui.json'), 'utf8'))
  const tables = { 'en-US': base['en-US'], 'zh-TW': base['zh-TW'] }
  for (const name of fs.readdirSync(path.join(localesDir, 'console-ui'))) {
    if (!name.endsWith('.json')) continue
    tables[name.replace(/\.json$/, '')] = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'console-ui', name), 'utf8'),
    )
  }
  return tables
}

test('every key those messages map to exists in all eleven locales', () => {
  const tables = localeTables()
  assert.equal(Object.keys(tables).length, 11, 'expected eleven console-ui locale tables')

  const wanted = new Set()
  for (const [message] of backendMessages()) {
    const key = mappedKey(message)
    // player.error.* keys live in the base locale files, not console-ui.
    if (key && key.startsWith('ui.')) wanted.add(key)
  }
  assert.ok(wanted.size >= 19, `expected at least 19 ui.* reason keys, got ${wanted.size}`)

  const missing = []
  for (const [locale, table] of Object.entries(tables)) {
    for (const key of wanted) {
      const value = table[key]
      if (typeof value !== 'string' || !value.trim()) missing.push(`${locale} ${key}`)
    }
  }
  assert.deepEqual(missing, [], `missing translations:\n  ${missing.join('\n  ')}`)
})

test('the new reason strings are actually distinct per language', () => {
  const tables = localeTables()
  const sample = 'ui.room.reason.rateLimited'
  const values = Object.entries(tables).map(([locale, table]) => [locale, table[sample]])
  for (const [locale, value] of values) {
    assert.equal(typeof value, 'string', `${locale} is missing ${sample}`)
  }
  // zh-TW and zh-CN legitimately look similar but must not be byte-identical:
  // the whole point of the pair is Traditional vs Simplified.
  assert.notEqual(tables['zh-TW'][sample], tables['zh-CN'][sample], 'zh-TW and zh-CN must differ')
  // English must not have been left as Chinese.
  assert.doesNotMatch(tables['en-US'][sample], /[一-鿿]/, 'en-US must not contain Han characters')
  assert.doesNotMatch(tables['ja-JP'][sample], /^[一-鿿]+$/, 'ja-JP must not be bare Han text')
})
