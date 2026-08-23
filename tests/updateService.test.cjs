const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { createUpdateService, updateCapability } = require('../electron/updateService.cjs')

class FakeUpdater extends EventEmitter {
  constructor() {
    super(); this.checks = 0; this.downloads = 0; this.installs = 0; this.feed = null
  }
  setFeedURL(value) { this.feed = value }
  async checkForUpdates() { this.checks += 1; return { updateInfo: { version: '1.1.0' } } }
  async downloadUpdate() { this.downloads += 1; return ['file.exe'] }
  quitAndInstall() { this.installs += 1 }
}

test('only configured packaged installer builds enable automatic updates', () => {
  assert.equal(updateCapability({ isPackaged: false, isPortable: false, enabled: true }).mode, 'disabled')
  assert.equal(updateCapability({ isPackaged: true, isPortable: true, enabled: true }).mode, 'manual')
  assert.equal(updateCapability({ isPackaged: true, isPortable: false, enabled: false, reason: '安裝包沒有更新設定' }).mode, 'disabled')
  assert.equal(updateCapability({ isPackaged: true, isPortable: false, enabled: true }).mode, 'automatic')
})

test('service configures a safe feed, channel and delayed periodic checks', async () => {
  const updater = new FakeUpdater()
  const timeouts = []
  const intervals = []
  const service = createUpdateService({
    autoUpdater: updater,
    currentVersion: '1.0.0',
    capability: { mode: 'automatic' },
    canRestart: () => true,
    setTimeoutFn: (fn, ms) => { timeouts.push({ fn, ms }); return 1 },
    setIntervalFn: (fn, ms) => { intervals.push({ fn, ms }); return 2 },
    clearTimeoutFn: () => {}, clearIntervalFn: () => {},
  })
  service.start({ autoCheck: true, channel: 'beta' })
  assert.equal(updater.feed, null)
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.autoInstallOnAppQuit, true)
  assert.equal(timeouts[0].ms, 30000)
  assert.equal(intervals[0].ms, 4 * 60 * 60 * 1000)
  await timeouts[0].fn()
  assert.equal(updater.checks, 1)
})

test('updater events expose public progress without package paths', () => {
  const updater = new FakeUpdater()
  const states = []
  const service = createUpdateService({
    autoUpdater: updater, currentVersion: '1.0.0', capability: { mode: 'automatic' },
    canRestart: () => true, onState: (state) => states.push(state),
    setTimeoutFn: () => 1, setIntervalFn: () => 2, clearTimeoutFn: () => {}, clearIntervalFn: () => {},
  })
  service.start({ autoCheck: false, channel: 'stable' })
  updater.emit('update-available', { version: '1.2.0', releaseName: '新版', releaseNotes: '修正內容' })
  updater.emit('download-progress', { percent: 45.5, transferred: 100, total: 220, bytesPerSecond: 30 })
  assert.equal(service.snapshot().progress.percent, 45.5)
  updater.emit('update-downloaded', { version: '1.2.0', downloadedFile: 'C:\\secret\\Lucent.exe' })
  const snapshot = service.snapshot()
  assert.equal(snapshot.status, 'ready')
  assert.equal(snapshot.availableVersion, '1.2.0')
  assert.equal(snapshot.progress, null)
  assert.equal(JSON.stringify(snapshot).includes('C:\\secret'), false)
  assert.ok(states.length >= 3)
})

test('install is deferred while playing or hosting and proceeds only after confirmation path is safe', async () => {
  const updater = new FakeUpdater()
  let safe = false
  const service = createUpdateService({
    autoUpdater: updater, currentVersion: '1.0.0', capability: { mode: 'automatic' },
    canRestart: () => safe,
    setTimeoutFn: () => 1, setIntervalFn: () => 2, clearTimeoutFn: () => {}, clearIntervalFn: () => {},
  })
  service.start({ autoCheck: false, channel: 'stable' })
  updater.emit('update-downloaded', { version: '1.1.0' })
  assert.deepEqual(service.install(), { ok: false, deferred: true, error: '播放中或正在主持房間，已延後安裝' })
  assert.equal(updater.installs, 0)
  safe = true
  assert.deepEqual(service.install(), { ok: true })
  assert.equal(updater.installs, 1)
})

test('a downloaded update installs once when the app first becomes safe', () => {
  const updater = new FakeUpdater()
  let safe = false
  const service = createUpdateService({
    autoUpdater: updater, currentVersion: '1.0.0', capability: { mode: 'automatic' },
    canRestart: () => safe,
    setTimeoutFn: () => 1, setIntervalFn: () => 2, clearTimeoutFn: () => {}, clearIntervalFn: () => {},
  })
  service.start({ autoCheck: false, channel: 'stable' })
  updater.emit('update-downloaded', { version: '1.1.0' })
  assert.equal(service.snapshot().deferred, true)
  assert.equal(updater.installs, 0)
  safe = true
  assert.deepEqual(service.notifySafetyChanged(), { ok: true })
  assert.equal(updater.installs, 1)
  assert.deepEqual(service.notifySafetyChanged(), { ok: true })
  assert.equal(updater.installs, 1)
})
