const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const { loadConfigFile, corruptBackupPath } = require('../shared/configStore.cjs')

const DEFAULT = () => ({ glass: {}, cfg: {}, profiles: [], schemaVersion: 9 })
const migrate = (raw) => {
  // Mirrors the real contract: migrateState throws on input it cannot read.
  if (!raw || typeof raw !== 'object') throw new TypeError('cannot migrate')
  return { ...DEFAULT(), ...raw, migrated: true }
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-config-'))
}

test('a readable settings file is migrated and never backed up', () => {
  const dir = tempDir()
  const file = path.join(dir, 'lgl-config.json')
  fs.writeFileSync(file, JSON.stringify({ profiles: [{ id: 'a', name: 'GOOD' }] }))

  const result = loadConfigFile({ fs, configPath: file, migrate, createDefault: DEFAULT, stamp: 'x' })
  assert.equal(result.outcome, 'loaded')
  assert.equal(result.backupPath, '')
  assert.equal(result.state.profiles[0].name, 'GOOD')
  assert.deepEqual(fs.readdirSync(dir), ['lgl-config.json'], 'no stray backup file')
})

test('first run with no settings file starts from defaults quietly', () => {
  const dir = tempDir()
  const result = loadConfigFile({
    fs, configPath: path.join(dir, 'lgl-config.json'), migrate, createDefault: DEFAULT, stamp: 'x',
  })
  assert.equal(result.outcome, 'default')
  assert.equal(result.backupPath, '')
  assert.deepEqual(fs.readdirSync(dir), [], 'must not create anything')
})

test('an unreadable settings file is preserved, not silently discarded', () => {
  // This is the real failure: a write interrupted by a power loss leaves
  // truncated JSON. The old code returned defaults and the next save
  // overwrote the only copy of the user's profiles.
  const dir = tempDir()
  const file = path.join(dir, 'lgl-config.json')
  const truncated = '{"profiles":[{"id":"a","name":"GOO'
  fs.writeFileSync(file, truncated)

  const result = loadConfigFile({ fs, configPath: file, migrate, createDefault: DEFAULT, stamp: '2026-08-30T12:00:00.000Z' })
  assert.equal(result.outcome, 'recovered')
  assert.ok(result.error, 'must report why it failed')
  assert.ok(result.backupPath, 'must name where the original went')
  assert.equal(fs.existsSync(file), false, 'the unreadable file is moved aside')
  assert.equal(fs.existsSync(result.backupPath), true, 'the original bytes still exist')
  assert.equal(fs.readFileSync(result.backupPath, 'utf-8'), truncated, 'preserved byte for byte')
})

test('a settings file saved with a BOM still loads instead of resetting', () => {
  // Notepad and most PowerShell redirections prepend a BOM. JSON.parse rejects
  // it, so before this a user who hand-edited their own settings lost all of
  // them on the next launch. Found while verifying the recovery path.
  const dir = tempDir()
  const file = path.join(dir, 'lgl-config.json')
  fs.writeFileSync(file, '﻿' + JSON.stringify({ profiles: [{ id: 'a', name: 'GOOD' }] }))

  const result = loadConfigFile({ fs, configPath: file, migrate, createDefault: DEFAULT, stamp: 's' })
  assert.equal(result.outcome, 'loaded', 'a BOM must not look like corruption')
  assert.equal(result.state.profiles[0].name, 'GOOD')
  assert.equal(fs.existsSync(file), true, 'nothing was moved aside')
})

test('valid JSON that is not a usable state is still preserved', () => {
  // JSON.parse succeeds on `null`, so the failure surfaces inside migrate().
  const dir = tempDir()
  const file = path.join(dir, 'lgl-config.json')
  fs.writeFileSync(file, 'null')

  const result = loadConfigFile({ fs, configPath: file, migrate, createDefault: DEFAULT, stamp: 's' })
  assert.equal(result.outcome, 'recovered')
  assert.equal(fs.existsSync(result.backupPath), true)
})

test('a failed backup still lets the app start', () => {
  const fakeFs = {
    readFileSync: () => 'not json',
    renameSync: () => { throw new Error('EPERM') },
  }
  const result = loadConfigFile({
    fs: fakeFs, configPath: '/x/lgl-config.json', migrate, createDefault: DEFAULT, stamp: 's',
  })
  assert.equal(result.outcome, 'recovered')
  assert.equal(result.backupPath, '', 'reports that nothing was preserved')
  assert.deepEqual(result.state, DEFAULT(), 'startup still proceeds')
})

test('backup names are filesystem-safe and do not collide across runs', () => {
  const a = corruptBackupPath('C:/x/lgl-config.json', '2026-08-30T12:00:00.000Z')
  const b = corruptBackupPath('C:/x/lgl-config.json', '2026-08-30T12:00:01.000Z')
  assert.notEqual(a, b, 'a second corruption must not overwrite the first backup')
  for (const name of [a, b]) {
    assert.doesNotMatch(name.slice(2), /[:*?"<>|]/, 'Windows forbids these in filenames')
  }
  assert.match(a, /lgl-config\.json\.corrupt-/)
})

test('main.cjs routes settings loading through the recovering loader', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.match(main, /loadConfigFile\(/, 'must use the shared loader')
  assert.doesNotMatch(
    main,
    /return migrate\(JSON\.parse\(fs\.readFileSync\(CONFIG_PATH[^)]*\)\)\)/,
    'the old silently-discarding read must not come back',
  )
})
