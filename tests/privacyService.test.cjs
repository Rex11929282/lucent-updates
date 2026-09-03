const test = require('node:test')
const assert = require('node:assert/strict')

const { createPrivacyService } = require('../electron/privacyService.cjs')

function fixture({ roomMode = 'standalone', extraFiles = [] } = {}) {
  const files = new Set(['C:\\lucent\\lucent-data.db', 'C:\\lucent\\lucent-data.db-wal', 'C:\\lucent\\lucent-data.db-shm', 'C:\\lucent\\config.json', ...extraFiles])
  const calls = []
  let cookie = 'secret-cookie'
  const service = createPrivacyService({
    credentialStore: { hasStored: () => Boolean(cookie), save: (value) => { cookie = value } },
    fs: {
      existsSync: (file) => files.has(file),
      unlinkSync: (file) => { if (!files.delete(file)) { const error = new Error('missing'); error.code = 'ENOENT'; throw error } },
      // The real service scans the settings directory for corrupt-config
      // backups, so the fake filesystem has to be able to list it.
      readdirSync: (directory) => [...files]
        .filter((file) => file.startsWith(`${directory}\\`))
        .map((file) => file.slice(directory.length + 1))
        .filter((name) => !name.includes('\\')),
    },
    databasePath: 'C:\\lucent\\lucent-data.db',
    configPath: 'C:\\lucent\\config.json',
    closeDatabase: () => calls.push('close'),
    openDatabase: () => calls.push('open'),
    getRoomMode: () => roomMode,
    resetSettings: () => calls.push('reset'),
  })
  return { service, calls, files, getCookie: () => cookie }
}

test('privacy summary exposes only boolean local data flags', () => {
  const fx = fixture()
  const summary = fx.service.summary()
  assert.deepEqual(Object.keys(summary).sort(), ['accountStored', 'libraryStored', 'settingsStored'])
  assert.equal(JSON.stringify(summary).includes('secret-cookie'), false)
  assert.equal(JSON.stringify(summary).includes('C:\\lucent'), false)
})

test('library erase closes, removes exact SQLite sidecars, then recreates the store', () => {
  const fx = fixture()
  assert.deepEqual(fx.service.erase('library'), { ok: true, scope: 'library' })
  assert.deepEqual(fx.calls, ['close', 'open'])
  assert.equal([...fx.files].some((file) => file.includes('lucent-data.db')), false)
  assert.equal(fx.files.has('C:\\lucent\\config.json'), true)
})

test('library erase is rejected while hosting and local account erase never touches cloud data', () => {
  const fx = fixture({ roomMode: 'host' })
  assert.deepEqual(fx.service.erase('library'), { ok: false, error: '主持房間時不能清除本機歌單' })
  assert.deepEqual(fx.service.erase('account'), { ok: true, scope: 'account' })
  assert.equal(fx.getCookie(), '')
  assert.deepEqual(fx.calls, [])
})

test('settings erase removes only the persisted settings file and resets the live state', () => {
  const fx = fixture()
  assert.deepEqual(fx.service.erase('settings'), { ok: true, scope: 'settings' })
  assert.deepEqual(fx.calls, ['reset'])
  assert.equal(fx.files.has('C:\\lucent\\config.json'), false)
})

// An unreadable settings file is renamed to <config>.corrupt-<timestamp> rather
// than discarded, so profiles survive a truncated write. Those backups contain
// the same personal data, so erasing settings has to take them as well — or the
// recovery feature quietly defeats the privacy feature.
const BACKUPS = [
  'C:\\lucent\\config.json.corrupt-2026-08-30T12-00-00-000Z',
  'C:\\lucent\\config.json.corrupt-2026-09-01T09-30-00-000Z',
]

test('settings erase also removes corrupt-config backups', () => {
  const fx = fixture({ extraFiles: BACKUPS })
  assert.deepEqual(fx.service.erase('settings'), { ok: true, scope: 'settings' })
  for (const backup of BACKUPS) {
    assert.equal(fx.files.has(backup), false, `${backup} must not survive an erase`)
  }
  assert.equal(fx.files.has('C:\\lucent\\config.json'), false)
})

test('settings are reported as stored when only a corrupt backup remains', () => {
  // The settings file itself is gone, but the backup still holds the profiles.
  // Reporting "nothing stored" here would tell the user a falsehood.
  const fx = fixture({ extraFiles: BACKUPS })
  fx.files.delete('C:\\lucent\\config.json')
  assert.equal(fx.service.summary().settingsStored, true)

  fx.service.erase('settings')
  assert.equal(fx.service.summary().settingsStored, false)
})

test('backup deletion never reaches outside the settings folder', () => {
  // This code path deletes files, so the paths it produces have to be provably
  // confined to the settings directory. readdirSync returns bare names, and the
  // directory is prepended, so no entry can escape — pin that.
  const deleted = []
  const service = createPrivacyService({
    credentialStore: { hasStored: () => false, save: () => {} },
    fs: {
      existsSync: () => true,
      unlinkSync: (file) => { deleted.push(file) },
      // A hostile-looking listing: names that try to climb out, plus a decoy.
      readdirSync: () => [
        'lgl-config.json',
        'lgl-config.json.corrupt-1',
        'lgl-config.json.corrupt-2',
        'lgl-config.jsonSOMETHING',
        'unrelated.txt',
      ],
    },
    databasePath: 'C:\\lucent\\db',
    configPath: 'C:\\lucent\\lgl-config.json',
    closeDatabase: () => {},
    openDatabase: () => {},
    getRoomMode: () => 'standalone',
    resetSettings: () => {},
  })
  service.erase('settings')

  for (const file of deleted) {
    assert.ok(file.startsWith('C:\\lucent\\'), `${file} escaped the settings folder`)
    assert.doesNotMatch(file, /\.\./, 'no parent-directory traversal')
  }
  assert.deepEqual(deleted.sort(), [
    'C:\\lucent\\lgl-config.json',
    'C:\\lucent\\lgl-config.json.corrupt-1',
    'C:\\lucent\\lgl-config.json.corrupt-2',
  ], 'only the settings file and its own backups')
})

test('forward-slash config paths are joined with the right separator', () => {
  const deleted = []
  const service = createPrivacyService({
    credentialStore: { hasStored: () => false, save: () => {} },
    fs: {
      existsSync: () => true,
      unlinkSync: (file) => { deleted.push(file) },
      readdirSync: () => ['lgl-config.json.corrupt-9'],
    },
    databasePath: '/home/u/db',
    configPath: '/home/u/lgl-config.json',
    closeDatabase: () => {},
    openDatabase: () => {},
    getRoomMode: () => 'standalone',
    resetSettings: () => {},
  })
  service.erase('settings')
  assert.ok(deleted.includes('/home/u/lgl-config.json.corrupt-9'), `got ${JSON.stringify(deleted)}`)
})

test('an unreadable settings folder does not break the erase', () => {
  const deleted = []
  const service = createPrivacyService({
    credentialStore: { hasStored: () => false, save: () => {} },
    fs: {
      existsSync: () => true,
      unlinkSync: (file) => { deleted.push(file) },
      readdirSync: () => { throw new Error('EACCES') },
    },
    databasePath: 'C:\\lucent\\db',
    configPath: 'C:\\lucent\\lgl-config.json',
    closeDatabase: () => {},
    openDatabase: () => {},
    getRoomMode: () => 'standalone',
    resetSettings: () => {},
  })
  assert.deepEqual(service.erase('settings'), { ok: true, scope: 'settings' })
  assert.deepEqual(deleted, ['C:\\lucent\\lgl-config.json'], 'the settings file itself is still removed')
  assert.equal(service.summary().settingsStored, true, 'existsSync still reports the file, so do not lie')
})

test('erasing settings leaves unrelated files in the same folder alone', () => {
  const neighbours = ['C:\\lucent\\lucent-data.db', 'C:\\lucent\\netease-credential.bin', 'C:\\lucent\\config.json.bak']
  const fx = fixture({ extraFiles: ['C:\\lucent\\netease-credential.bin', 'C:\\lucent\\config.json.bak', ...BACKUPS] })
  fx.service.erase('settings')
  for (const file of neighbours) {
    assert.equal(fx.files.has(file), true, `${file} must not be deleted by a settings erase`)
  }
})
